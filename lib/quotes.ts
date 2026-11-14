import 'server-only';
import { COMPARISON_SOURCE_ID, parseComparison } from './comparison';
import { estimateAll, sortRows, summarize } from './compute';
import { comparisonAccess, wiseApi } from './config';
import { getLiveMid } from './fx';
import { fetchJson } from './http';
import { demoComparison, demoEnabled } from './mock';
import { SNAPSHOT_SOURCE } from './providers';
import type { FundingOption, QuoteRow, QuotesPayload, RejectedQuote, SourceStatus } from './types';
import { errMsg } from './util';
import { WISE_QUOTE_SOURCE_ID, parseWiseQuote } from './wiseQuote';

export interface QuoteOptions {
  /** Fetch Wise's own quote (needed for the funding method breakdown). Cron jobs skip it. */
  wiseQuote?: boolean;
  signal?: AbortSignal;
  now?: number;
}

export async function getQuotes(amount: number, opts: QuoteOptions = {}): Promise<QuotesPayload> {
  const now = opts.now ?? Date.now();
  const env = process.env;
  const demo = demoEnabled();
  const { mid, attempts } = await getLiveMid(opts.signal);
  if (!mid) throw new Error(`No usable mid market rate. ${attempts.join(' | ')}`);

  const sources: SourceStatus[] = [
    {
      id: `mid:${mid.sourceId}`,
      label: `Mid market rate: ${mid.source}`,
      status: 'ok',
      access: demo ? 'demo' : 'documented-public',
      detail: mid.freshness === 'fresh' ? 'Fresh' : 'Stale: no fresh intraday source answered',
      retrievedAt: mid.retrievedAt,
    },
  ];
  const rejected: RejectedQuote[] = [];
  const { base, version } = wiseApi(env);
  const access = comparisonAccess(env);

  // Comparison estimates and Wise's own quote run in parallel within the caller's budget.
  const comparisonP = (async () => {
    if (demo) return { data: demoComparison(amount, now), retrievedAt: new Date(now).toISOString() };
    if (!access.enabled) return null;
    const url = `${base}/${version}/comparisons?sourceCurrency=USD&targetCurrency=INR&sendAmount=${amount}&sourceCountry=US&targetCountry=IN`;
    return fetchJson(url, {
      revalidate: 300,
      timeoutMs: 7000,
      signal: opts.signal,
      headers: access.token ? { authorization: `Bearer ${access.token}` } : undefined,
    });
  })();
  const wiseQuoteP = (async () => {
    if (demo || opts.wiseQuote === false) return null;
    return fetchJson(`${base}/${version}/quotes`, {
      method: 'POST',
      body: JSON.stringify({ sourceCurrency: 'USD', targetCurrency: 'INR', sourceAmount: amount }),
      revalidate: 300,
      timeoutMs: 7000,
      signal: opts.signal,
    });
  })();
  const [compR, wiseR] = await Promise.allSettled([comparisonP, wiseQuoteP]);

  // Wise's own quote.
  let wiseRow: QuoteRow | null = null;
  let funding: FundingOption[] | null = null;
  if (demo || opts.wiseQuote === false) {
    sources.push({ id: WISE_QUOTE_SOURCE_ID, label: 'Wise quote', status: 'disabled', access: null, detail: demo ? 'Not used in demo mode' : 'Skipped for this request', retrievedAt: null });
  } else if (wiseR.status === 'fulfilled' && wiseR.value) {
    const parsed = parseWiseQuote(wiseR.value.data, { amount, mid: mid.rate, now, retrievedAt: wiseR.value.retrievedAt, env });
    wiseRow = parsed.row;
    funding = parsed.funding.length >= 2 ? parsed.funding : null;
    if (parsed.problem) rejected.push({ name: 'Wise', sourceId: WISE_QUOTE_SOURCE_ID, reason: parsed.problem });
    sources.push({
      id: WISE_QUOTE_SOURCE_ID,
      label: 'Wise quote',
      status: parsed.row ? 'ok' : 'error',
      access: 'documented-public',
      detail: parsed.row ? 'Documented unauthenticated quote, for illustrative pricing' : `Unusable: ${parsed.problem}`,
      retrievedAt: wiseR.value.retrievedAt,
    });
  } else {
    sources.push({
      id: WISE_QUOTE_SOURCE_ID,
      label: 'Wise quote',
      status: 'error',
      access: 'documented-public',
      detail: wiseR.status === 'rejected' ? errMsg(wiseR.reason) : 'No response',
      retrievedAt: null,
    });
  }

  // Comparison estimates.
  let comparisonRows: QuoteRow[] = [];
  if (compR.status === 'fulfilled' && compR.value) {
    const parsed = parseComparison(compR.value.data, {
      amount,
      mid: mid.rate,
      now,
      retrievedAt: compR.value.retrievedAt,
      access: demo ? 'demo' : (access.access ?? 'unauthenticated-legacy'),
      env,
      demo,
    });
    comparisonRows = parsed.rows;
    rejected.push(...parsed.rejected);
    sources.push({
      id: COMPARISON_SOURCE_ID,
      label: 'Wise comparison data',
      status: parsed.rows.length === 0 ? 'error' : parsed.rejected.length ? 'partial' : 'ok',
      access: demo ? 'demo' : access.access,
      detail: `${parsed.rows.length} usable, ${parsed.rejected.length} rejected. ${demo ? 'Demo payload.' : access.reason}`,
      retrievedAt: compR.value.retrievedAt,
    });
  } else {
    sources.push({
      id: COMPARISON_SOURCE_ID,
      label: 'Wise comparison data',
      status: access.enabled || demo ? 'error' : 'disabled',
      access: access.access,
      detail: compR.status === 'rejected' ? errMsg(compR.reason) : access.reason,
      retrievedAt: null,
    });
  }

  // Wise's own quote replaces Wise's row from the comparison feed; keep the feed's number as context.
  if (wiseRow) {
    const fromFeed = comparisonRows.find((r) => r.key === 'wise');
    if (fromFeed) {
      wiseRow.cautions.push(
        `Wise’s comparison feed reports ₹${Math.round(fromFeed.received).toLocaleString('en-IN')} with a $${fromFeed.fee?.toFixed(2)} fee for US senders; it does not state the pay-in method.`,
      );
      comparisonRows = comparisonRows.filter((r) => r.key !== 'wise');
    }
  }

  const covered = new Set([...comparisonRows.map((r) => r.key), ...(wiseRow ? ['wise'] : [])]);
  const models = estimateAll(amount, mid.rate, covered, now, env);
  sources.push({
    id: SNAPSHOT_SOURCE.id,
    label: SNAPSHOT_SOURCE.label,
    status: models.length ? 'ok' : 'disabled',
    access: 'research',
    detail: models.length ? `${models.length} providers modelled. ${SNAPSHOT_SOURCE.detail}` : 'Snapshot is older than the configured limit',
    retrievedAt: null,
  });

  const rows = sortRows([...(wiseRow ? [wiseRow] : []), ...comparisonRows, ...models]);
  return {
    amount,
    mid,
    rows,
    rejected,
    sources,
    funding,
    summary: summarize(rows, now),
    generatedAt: new Date(now).toISOString(),
    demo,
  };
}
