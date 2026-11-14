// Parse and validate Wise comparison data. Pure: the caller passes the payload, the clock and context.
//
// Wise documents that comparison prices are estimates: it collects each provider's quotes about once an
// hour and applies the collected markup to the current mid rate. Estimates cover bank transfer pay-in and
// pay-out only. https://docs.wise.com/api-reference/comparison

import { classify, freshnessRules } from './config';
import { rowFromQuote } from './compute';
import { deliveryLabel } from './format';
import { findProvider } from './providers';
import type { AccessMode, QuoteRow, RejectedQuote } from './types';
import { isFiniteNumber, parseTime, saneRate } from './util';

type Env = Record<string, string | undefined>;
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});

export const COMPARISON_SOURCE_ID = 'wise-comparison';
export const COMPARISON_DOCS = 'https://docs.wise.com/api-reference/comparison';

export interface ComparisonOptions {
  amount: number;
  mid: number;
  now: number;
  retrievedAt: string;
  access: AccessMode;
  env?: Env;
  demo?: boolean;
}

const ROUTE_FROM = 'US';
const ROUTE_TO = 'IN';

function routeProblem(q: Obj): string | null {
  const s = q.sourceCountry ?? null;
  const t = q.targetCountry ?? null;
  if (s !== null && s !== ROUTE_FROM) return `quote is for sending from ${String(s)}, not the US`;
  if (t !== null && t !== ROUTE_TO) return `quote is for sending to ${String(t)}, not India`;
  return null;
}

/** Prefer a quote that states US to India, then one that states one side, then one that states neither. */
function pickCompatible(quotes: Obj[]): { quote: Obj | null; reason: string | null } {
  const compatible = quotes.filter((q) => routeProblem(q) === null);
  if (!compatible.length) return { quote: null, reason: quotes.length ? routeProblem(quotes[0]) : 'no quotes' };
  const score = (q: Obj) => (q.sourceCountry === ROUTE_FROM ? 2 : 0) + (q.targetCountry === ROUTE_TO ? 1 : 0);
  return { quote: [...compatible].sort((a, b) => score(b) - score(a))[0], reason: null };
}

/** Returns a reason when the quote cannot be used, otherwise null. */
export function validateComparisonQuote(q: Obj, amount: number, mid: number, now: number, env: Env = {}): string | null {
  const rate = q.rate;
  const received = q.receivedAmount;
  const fee = q.fee;
  if (!saneRate(rate)) return 'exchange rate missing or not a number';
  if (rate < mid * 0.85 || rate > mid * 1.05) return `exchange rate ${rate.toFixed(2)} is implausible against mid ${mid.toFixed(2)}`;
  if (!isFiniteNumber(received) || received <= 0) return 'recipient amount missing or not a number';
  if (fee !== null && fee !== undefined) {
    if (!isFiniteNumber(fee) || fee < 0 || fee >= amount * 0.25) return 'fee is not a sensible number';
    const expected = (amount - fee) * rate;
    if (Math.abs(received - expected) / received > 0.005) return 'recipient amount does not match the rate and fee';
  }
  const eff = received / amount;
  if (eff < mid * 0.8 || eff > mid * 1.05) return 'recipient amount is implausible for this send amount';
  if (q.sendAmount !== null && q.sendAmount !== undefined && (!isFiniteNumber(q.sendAmount) || Math.abs(q.sendAmount - amount) > 0.01))
    return 'quote is for a different send amount';
  const collected = parseTime(q.dateCollected);
  if (collected === null) return 'no collection time, so freshness cannot be judged';
  const rule = freshnessRules(env).comparison;
  if (classify(now - collected, rule) === 'unavailable') {
    if (collected > now) return 'collection time is in the future';
    return `collected ${Math.round((now - collected) / 3600_000)} hr ago, older than the ${Math.round(rule.maxMs / 3600_000)} hr limit`;
  }
  return null;
}

export function parseComparison(data: unknown, o: ComparisonOptions): { rows: QuoteRow[]; rejected: RejectedQuote[] } {
  const rejected: RejectedQuote[] = [];
  const providers = obj(data).providers;
  if (!Array.isArray(providers)) return { rows: [], rejected: [{ name: 'Wise comparison', sourceId: COMPARISON_SOURCE_ID, reason: 'response has no providers list' }] };

  const rule = freshnessRules(o.env).comparison;
  const best = new Map<string, QuoteRow>();
  for (const raw of providers) {
    const p = obj(raw);
    const name = typeof p.name === 'string' ? p.name : null;
    if (!name) {
      rejected.push({ name: 'Unnamed provider', sourceId: COMPARISON_SOURCE_ID, reason: 'provider has no name' });
      continue;
    }
    const quotes = Array.isArray(p.quotes) ? p.quotes.map(obj) : [];
    const { quote, reason } = pickCompatible(quotes);
    if (!quote) {
      rejected.push({ name, sourceId: COMPARISON_SOURCE_ID, reason: reason ?? 'no usable quote' });
      continue;
    }
    const problem = validateComparisonQuote(quote, o.amount, o.mid, o.now, o.env);
    if (problem) {
      rejected.push({ name, sourceId: COMPARISON_SOURCE_ID, reason: problem });
      continue;
    }

    const alias = typeof p.alias === 'string' ? p.alias : undefined;
    const info = findProvider(name, alias);
    const isWise = (alias ?? '').toLowerCase() === 'wise';
    const collected = parseTime(quote.dateCollected) as number;
    const fee = quote.fee === null || quote.fee === undefined ? null : (quote.fee as number);
    const duration = obj(obj(quote.deliveryEstimation).duration);
    const delivery = deliveryLabel(duration.min as string | null, duration.max as string | null);
    const logos = obj(obj(p.logos).normal);
    const cautions = [
      isWise
        ? 'Wise’s own price as reported in its comparison feed. The pay-in method is not stated.'
        : `Estimate: Wise applies the markup it collected from ${name} to the current mid rate. Confirm in ${name}’s app before sending.`,
    ];
    if (quote.sourceCountry == null || quote.targetCountry == null) cautions.push('The source does not state both countries for this quote.');
    if (fee === null) cautions.push('The source did not report a fee.');

    const row = rowFromQuote({
      key: info?.key ?? `wise-${alias ?? name}`,
      name: info?.name ?? name,
      amount: o.amount,
      mid: o.mid,
      fee,
      feeStatus: fee === null ? 'unknown' : 'quoted',
      rate: quote.rate as number,
      received: quote.receivedAmount as number,
      kind: info?.kind ?? (p.type === 'bank' ? 'bank' : 'app'),
      origin: o.demo ? 'demo' : 'comparison-estimate',
      freshness: classify(o.now - collected, rule),
      url: info?.url,
      logo: (logos.svgUrl as string | undefined) ?? (logos.pngUrl as string | undefined),
      delivery: delivery ? { label: delivery, basis: 'Reported with this comparison estimate (bank transfer pay-in)' } : null,
      note: info?.note,
      speedClaim: info?.speedClaim,
      cautions,
      now: o.now,
      context: {
        sourceCountry: (quote.sourceCountry as string | null) ?? null,
        targetCountry: (quote.targetCountry as string | null) ?? null,
        fundingMethod: isWise ? 'bank_account' : 'bank_transfer',
        payoutMethod: 'bank_deposit',
        sourceId: o.demo ? 'demo' : COMPARISON_SOURCE_ID,
        sourceLabel: o.demo ? 'Demo data' : 'Wise comparison data',
        sourceUrl: o.demo ? undefined : COMPARISON_DOCS,
        access: o.access,
        collectedAt: new Date(collected).toISOString(),
        retrievedAt: o.retrievedAt,
        expiresAt: null,
        modelDate: null,
        freshUntil: new Date(collected + rule.freshMs).toISOString(),
        staleUntil: new Date(collected + rule.maxMs).toISOString(),
      },
    });
    const prev = best.get(row.key);
    if (!prev || prev.received < row.received) best.set(row.key, row);
  }
  return { rows: [...best.values()], rejected };
}
