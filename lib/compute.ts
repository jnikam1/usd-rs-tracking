// Pure functions. No network, no server-only imports, so they are unit tested and safe in the browser.
import { PROMOS, PROVIDERS, SNAPSHOT_MID, type ProviderInfo } from './providers';
import type { Point, QuoteRow } from './types';

export function round(n: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export function rowFromQuote(args: {
  key: string;
  name: string;
  amount: number;
  mid: number;
  fee: number;
  rate: number;
  received?: number;
  kind: 'app' | 'bank';
  source: 'live' | 'estimate';
  url?: string;
  logo?: string;
  delivery?: string;
  collectedAt?: string;
  note?: string;
}): QuoteRow {
  const received = args.received ?? Math.max(0, (args.amount - args.fee) * args.rate);
  const perUsd = received / args.amount;
  return {
    key: args.key,
    name: args.name,
    url: args.url,
    logo: args.logo,
    kind: args.kind,
    source: args.source,
    fee: round(args.fee, 2),
    rate: round(args.rate, 4),
    received: round(received, 2),
    perUsd: round(perUsd, 4),
    vsMidPct: round((perUsd / args.mid - 1) * 100, 3),
    shortfall: round(args.mid * args.amount - received, 0),
    delivery: args.delivery,
    collectedAt: args.collectedAt,
    note: args.note,
  };
}

/** Estimate a provider's quote today by carrying its snapshot spread over to the live mid rate. */
export function estimateRow(p: ProviderInfo, amount: number, mid: number): QuoteRow {
  const rate = mid * (p.snapshotRate / SNAPSHOT_MID);
  return rowFromQuote({
    key: p.key,
    name: p.name,
    amount,
    mid,
    fee: p.fee(amount),
    rate,
    kind: p.kind,
    source: 'estimate',
    url: p.url,
    delivery: p.speed,
    note: p.note,
  });
}

export function estimateAll(amount: number, mid: number, exclude: Set<string> = new Set()): QuoteRow[] {
  return PROVIDERS.filter((p) => !p.liveOnly && !exclude.has(p.key)).map((p) => estimateRow(p, amount, mid));
}

export function sortRows(rows: QuoteRow[]): QuoteRow[] {
  return [...rows].sort((a, b) => b.received - a.received || a.fee - b.fee);
}

export function promoEstimate(amount: number, mid: number) {
  const promo = PROMOS.find((p) => p.ratePremium !== undefined);
  if (!promo || promo.ratePremium === undefined) return null;
  if (promo.ends && Date.now() > Date.parse(`${promo.ends}T23:59:59-08:00`)) return null;
  const cap = promo.capUsd ?? amount;
  const promoPart = Math.min(amount, cap);
  const rest = amount - promoPart;
  const promoRate = mid * (1 + promo.ratePremium);
  // Beyond the cap, assume the provider's regular snapshot spread.
  const regular = PROVIDERS.find((p) => p.name.toLowerCase().startsWith(promo.provider.toLowerCase()));
  const restRate = regular ? mid * (regular.snapshotRate / SNAPSHOT_MID) : mid;
  const received = promoPart * promoRate + rest * restRate;
  return { provider: promo.provider, received: round(received, 2), perUsd: round(received / amount, 4), capUsd: cap, ends: promo.ends };
}

// ---------- history stats ----------

export function changeOver(points: Point[], current: number, windowMs: number, now = Date.now()) {
  if (!points.length) return null;
  const target = now - windowMs;
  // The first point at or after the start of the window.
  const start = points.find((p) => p.t >= target) ?? points[0];
  const abs = current - start.v;
  return { from: start.v, abs: round(abs, 4), pct: round((abs / start.v) * 100, 3) };
}

export function yearStats(points: Point[], current: number) {
  if (points.length < 2) return null;
  let hi = points[0];
  let lo = points[0];
  for (const p of points) {
    if (p.v > hi.v) hi = p;
    if (p.v < lo.v) lo = p;
  }
  const below = points.filter((p) => p.v <= current).length;
  return {
    high: round(Math.max(hi.v, current), 4),
    highAt: current > hi.v ? Date.now() : hi.t,
    low: round(Math.min(lo.v, current), 4),
    lowAt: current < lo.v ? Date.now() : lo.t,
    percentile: Math.round((below / points.length) * 100),
  };
}

// ---------- alerts ----------

export type AlertKind = 'above' | 'below' | 'move';
export interface AlertRule { id: string; kind: AlertKind; value: number }

export interface AlertHit { rule: AlertRule; key: string; title: string; message: string; up?: boolean }

/**
 * State based alerts: a rule fires while its condition holds. Callers dedupe with a cooldown,
 * which keeps alerts robust to missed or irregular checks.
 */
export function evaluateRules(
  rules: AlertRule[],
  mid: number,
  change24hPct: number | null,
  fmt: (n: number) => string = (n) => `₹${n.toFixed(2)}`,
): AlertHit[] {
  const hits: AlertHit[] = [];
  for (const r of rules) {
    if (!Number.isFinite(r.value) || r.value <= 0) continue;
    if (r.kind === 'above' && mid >= r.value) {
      hits.push({
        rule: r,
        key: `above-${r.value}`,
        up: true,
        title: `USD/INR is at ${fmt(mid)}, above your ${fmt(r.value)} target`,
        message: `Your target is hit. Each dollar now buys at least ${fmt(r.value)} at mid market.`,
      });
    }
    if (r.kind === 'below' && mid <= r.value) {
      hits.push({
        rule: r,
        key: `below-${r.value}`,
        up: false,
        title: `USD/INR fell to ${fmt(mid)}, below ${fmt(r.value)}`,
        message: `The rupee has strengthened past your floor, so each dollar buys fewer rupees.`,
      });
    }
    if (r.kind === 'move' && change24hPct !== null && Math.abs(change24hPct) >= r.value) {
      const up = change24hPct > 0;
      hits.push({
        rule: r,
        key: `move-${up ? 'up' : 'down'}`,
        up,
        title: `USD/INR ${up ? 'rose' : 'fell'} ${Math.abs(change24hPct).toFixed(2)}% in 24 hrs to ${fmt(mid)}`,
        message: up ? 'Dollars buy more rupees than yesterday.' : 'Dollars buy fewer rupees than yesterday.',
      });
    }
  }
  return hits;
}

export function rulesFromEnv(env: Record<string, string | undefined>): AlertRule[] {
  const rules: AlertRule[] = [];
  const above = Number(env.ALERT_ABOVE);
  const below = Number(env.ALERT_BELOW);
  const move = env.ALERT_MOVE_PCT === undefined || env.ALERT_MOVE_PCT === '' ? 0.5 : Number(env.ALERT_MOVE_PCT);
  if (Number.isFinite(above) && above > 0) rules.push({ id: 'env-above', kind: 'above', value: above });
  if (Number.isFinite(below) && below > 0) rules.push({ id: 'env-below', kind: 'below', value: below });
  if (Number.isFinite(move) && move > 0) rules.push({ id: 'env-move', kind: 'move', value: move });
  return rules;
}
