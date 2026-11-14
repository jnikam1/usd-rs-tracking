import 'server-only';
import { estimateAll, promoEstimate, rowFromQuote, sortRows } from './compute';
import { deliveryLabel } from './format';
import { getLiveMid } from './fx';
import { errMsg, getJson } from './http';
import { mockEnabled, mockLiveRows } from './mock';
import { findProvider } from './providers';
import type { FundingOption, QuoteRow, QuotesPayload } from './types';

// Live provider quotes come from Wise's public comparison API, which collects bank funded
// quotes from many providers (Wise included, so treat its own ranking with some care).
// Docs: https://docs.wise.com/api-reference/comparison

interface WiseCompQuote {
  rate?: number;
  fee?: number;
  receivedAmount?: number;
  dateCollected?: string;
  sourceCountry?: string | null;
  targetCountry?: string | null;
  markup?: number;
  isConsideredMidMarketRate?: boolean;
  deliveryEstimation?: { duration?: { min?: string | null; max?: string | null } | null } | null;
}

interface WiseCompProvider {
  id?: number;
  alias?: string;
  name?: string;
  type?: string;
  logo?: string | null;
  logos?: { normal?: { svgUrl?: string | null; pngUrl?: string | null } };
  quotes?: WiseCompQuote[];
}

interface WiseComparison { providers?: WiseCompProvider[] }

const COMPARISON_URLS = (amount: number) => [
  `https://api.wise.com/v4/comparisons/?sourceCurrency=USD&targetCurrency=INR&sendAmount=${amount}`,
  `https://api.transferwise.com/v4/comparisons/?sourceCurrency=USD&targetCurrency=INR&sendAmount=${amount}`,
  `https://api.wise.com/v3/comparisons/?sourceCurrency=USD&targetCurrency=INR&sendAmount=${amount}`,
];

function pickQuote(quotes: WiseCompQuote[] = []): WiseCompQuote | undefined {
  const usable = quotes.filter((q) => typeof q.receivedAmount === 'number' && typeof q.rate === 'number');
  return (
    usable.find((q) => q.sourceCountry === 'US' && q.targetCountry === 'IN') ??
    usable.find((q) => (q.sourceCountry ?? 'US') === 'US' && (q.targetCountry ?? 'IN') === 'IN') ??
    usable[0]
  );
}

export async function fetchLiveQuotes(amount: number, fallbackMid: number) {
  if (mockEnabled()) return { rows: mockLiveRows(amount), mid: fallbackMid, source: 'mock' };
  let data: WiseComparison | null = null;
  let source = '';
  const errors: string[] = [];
  for (const url of COMPARISON_URLS(amount)) {
    try {
      data = await getJson<WiseComparison>(url, { revalidate: 300, timeoutMs: 8000 });
      if (!Array.isArray(data.providers) || data.providers.length === 0) throw new Error('no providers');
      source = new URL(url).host + new URL(url).pathname;
      break;
    } catch (e) {
      errors.push(errMsg(e));
      data = null;
    }
  }
  if (!data?.providers) throw new Error(errors.join(' | '));

  // Use Wise's own mid market quote from the same snapshot when it is there, so spreads are consistent.
  const wiseProvider = data.providers.find((p) => (p.alias ?? '').toLowerCase() === 'wise');
  const wiseQuote = pickQuote(wiseProvider?.quotes);
  const mid = wiseQuote?.isConsideredMidMarketRate !== false && wiseQuote?.rate ? wiseQuote.rate : fallbackMid;

  const rows: QuoteRow[] = [];
  for (const p of data.providers) {
    const q = pickQuote(p.quotes);
    if (!q || !p.name) continue;
    const info = findProvider(p.name, p.alias);
    const received = q.receivedAmount as number;
    // Drop obviously broken data points (more than 10% away from mid).
    if (received / amount < mid * 0.9 || received / amount > mid * 1.05) continue;
    rows.push(
      rowFromQuote({
        key: info?.key ?? `live-${p.alias ?? p.id}`,
        name: info?.name ?? p.name,
        amount,
        mid,
        fee: q.fee ?? 0,
        rate: q.rate as number,
        received,
        kind: info?.kind ?? (p.type === 'bank' ? 'bank' : 'app'),
        source: 'live',
        url: info?.url,
        logo: p.logos?.normal?.svgUrl ?? p.logos?.normal?.pngUrl ?? p.logo ?? undefined,
        delivery: deliveryLabel(q.deliveryEstimation?.duration?.min, q.deliveryEstimation?.duration?.max) ?? info?.speed,
        collectedAt: q.dateCollected,
        note: info?.note,
      }),
    );
  }
  // Keep the best row per provider key.
  const best = new Map<string, QuoteRow>();
  for (const r of rows) if (!best.has(r.key) || best.get(r.key)!.received < r.received) best.set(r.key, r);
  return { rows: [...best.values()], mid, source };
}

interface WiseQuoteOption {
  payIn?: string;
  disabled?: boolean;
  fee?: { total?: number };
  targetAmount?: number;
  formattedEstimatedDelivery?: string;
}

const FUNDING: [string, string[]][] = [
  ['Bank transfer', ['BANK_TRANSFER']],
  ['Debit card', ['DEBIT', 'VISA_DEBIT_OR_PREPAID', 'CARD']],
  ['Credit card', ['CREDIT', 'VISA_CREDIT']],
];

/** Wise's public (unauthenticated) quote, which prices the same transfer for every funding method. */
export async function fetchWiseFunding(amount: number): Promise<FundingOption[] | null> {
  if (mockEnabled()) return null;
  try {
    const res = await fetch('https://api.wise.com/v3/quotes/', {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(7000),
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sourceCurrency: 'USD', targetCurrency: 'INR', sourceAmount: amount }),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { paymentOptions?: WiseQuoteOption[] };
    const opts = (d.paymentOptions ?? []).filter((o) => !o.disabled && typeof o.targetAmount === 'number');
    const out: FundingOption[] = [];
    for (const [method, codes] of FUNDING) {
      const o = codes.map((c) => opts.find((x) => x.payIn === c)).find(Boolean);
      if (!o) continue;
      out.push({
        method,
        fee: Math.round((o.fee?.total ?? 0) * 100) / 100,
        received: o.targetAmount as number,
        perUsd: Math.round(((o.targetAmount as number) / amount) * 10000) / 10000,
        delivery: o.formattedEstimatedDelivery,
      });
    }
    return out.length >= 2 ? out : null;
  } catch {
    return null;
  }
}

/** `withFunding` adds an uncached POST to Wise, so the statically regenerated page skips it and the browser fetches it. */
export async function getQuotes(amount: number, { withFunding = true } = {}): Promise<QuotesPayload> {
  const fundingP = withFunding ? fetchWiseFunding(amount) : Promise.resolve(null);
  const live = await getLiveMid().catch(() => null);
  let mid = live?.rate ?? NaN;
  let midSource = live?.source ?? '';
  let liveRows: QuoteRow[] = [];
  let liveSource: string | null = null;
  let liveError: string | null = null;

  try {
    const r = await fetchLiveQuotes(amount, mid);
    liveRows = r.rows;
    liveSource = r.source;
    if (!Number.isFinite(mid)) {
      mid = r.mid;
      midSource = 'Wise comparison';
    }
  } catch (e) {
    liveError = errMsg(e);
  }

  if (!Number.isFinite(mid)) {
    throw new Error(`No mid market rate available. ${liveError ?? ''}`);
  }

  // Recompute live rows' spread against the same mid we show everywhere else.
  liveRows = liveRows.map((r) => ({
    ...r,
    vsMidPct: Math.round((r.perUsd / mid - 1) * 100 * 1000) / 1000,
    shortfall: Math.round(mid * amount - r.received),
  }));

  const covered = new Set(liveRows.map((r) => r.key));
  const rows = sortRows([...liveRows, ...estimateAll(amount, mid, covered)]);

  return {
    amount,
    mid,
    midSource,
    rows,
    liveCount: liveRows.length,
    liveSource,
    liveError,
    promoEstimate: promoEstimate(amount, mid),
    funding: await fundingP,
    generatedAt: new Date().toISOString(),
  };
}
