// Pure money math, freshness handling and alert logic. No network and no server-only imports,
// so all of it is unit tested and safe to run in the browser.
import { classify, freshnessAt, freshnessRules } from './config';
import { OFFERS, PROVIDERS, SNAPSHOT_DATE, SNAPSHOT_MID, SNAPSHOT_SOURCE, snapshotFee, type Offer, type ProviderInfo } from './providers';
import type {
  ChangeResult,
  Delivery,
  FeeStatus,
  Freshness,
  FundingMethod,
  Point,
  QuoteContext,
  QuoteOrigin,
  QuoteRow,
  Summary,
} from './types';
import { round, saneRate } from './util';

export { round };

const HOUR = 3600_000;
type Env = Record<string, string | undefined>;

// ---------- rows ----------

export interface RowArgs {
  key: string;
  name: string;
  amount: number;
  mid: number;
  fee: number | null;
  feeStatus?: FeeStatus;
  rate: number | null;
  /** Authoritative recipient amount from a validated source. When given it is used as is. */
  received?: number;
  kind: 'app' | 'bank';
  origin: QuoteOrigin;
  freshness?: Freshness;
  id?: string;
  url?: string;
  logo?: string;
  delivery?: Delivery | null;
  note?: string;
  speedClaim?: string;
  cautions?: string[];
  context?: Partial<QuoteContext>;
  now?: number;
}

export function rowFromQuote(a: RowArgs): QuoteRow {
  const cautions = [...(a.cautions ?? [])];
  let received: number;
  if (a.received !== undefined) {
    received = a.received;
  } else {
    if (a.rate === null) throw new Error('rowFromQuote needs either received or rate');
    received = Math.max(0, (a.amount - (a.fee ?? 0)) * a.rate);
    if (a.fee === null) cautions.push('Fee unknown for this amount, so the payout is shown before any fee and is an upper bound.');
  }
  const effectiveRate = received / a.amount;
  const context: QuoteContext = {
    sendAmount: a.amount,
    feeIncluded: true,
    corridor: 'USD-INR',
    sourceCountry: null,
    targetCountry: null,
    fundingMethod: 'unknown',
    payoutMethod: 'unknown',
    sourceId: 'manual',
    sourceLabel: 'Manual',
    access: 'research',
    collectedAt: null,
    retrievedAt: new Date(a.now ?? Date.now()).toISOString(),
    expiresAt: null,
    modelDate: null,
    freshUntil: null,
    staleUntil: null,
    ...a.context,
  };
  return {
    id: a.id ?? `${a.origin}:${a.key}`,
    key: a.key,
    name: a.name,
    url: a.url,
    logo: a.logo,
    kind: a.kind,
    origin: a.origin,
    freshness: a.freshness ?? 'fresh',
    fee: a.fee === null ? null : round(a.fee, 2),
    feeStatus: a.feeStatus ?? (a.fee === null ? 'unknown' : 'quoted'),
    rate: a.rate === null ? null : round(a.rate, 4),
    received: round(received, 2),
    totalUsd: a.amount,
    effectiveRate: round(effectiveRate, 4),
    vsMidPct: round((effectiveRate / a.mid - 1) * 100, 3),
    shortfall: round(a.mid * a.amount - received, 0),
    delivery: a.delivery ?? null,
    context,
    cautions,
    note: a.note,
    speedClaim: a.speedClaim,
  };
}

const SNAPSHOT_AT = Date.parse(`${SNAPSHOT_DATE}T20:00:00Z`);

/**
 * Snapshot model for one provider: its 13 Nov spread versus the snapshot mid, carried onto today's mid,
 * minus a fee only where one was observed or published for this amount.
 */
export function estimateRow(p: ProviderInfo, amount: number, mid: number, now = Date.now(), env: Env = {}, demo = false): QuoteRow {
  const rule = freshnessRules(env).snapshot;
  const rate = mid * (p.snapshotRate / SNAPSHOT_MID);
  const fee = snapshotFee(p, amount);
  const cautions = [
    `Model, not a quote: the provider’s spread on a $1,000 transfer on 13 Nov 2026, applied to today’s mid rate.`,
    ...(amount !== 1000 ? ['The spread was observed at $1,000; providers can price other amounts differently.'] : []),
    ...(p.cautions ?? []),
  ];
  return rowFromQuote({
    key: p.key,
    name: p.name,
    amount,
    mid,
    fee: fee.fee,
    feeStatus: fee.status,
    rate,
    kind: p.kind,
    origin: demo ? 'demo' : 'snapshot-model',
    freshness: demo ? 'fresh' : classify(now - SNAPSHOT_AT, rule),
    url: p.url,
    note: [p.note, fee.note].filter(Boolean).join(' '),
    speedClaim: p.speedClaim,
    cautions,
    now,
    context: {
      sourceCountry: 'US',
      targetCountry: 'IN',
      fundingMethod: 'bank_account',
      payoutMethod: 'bank_deposit',
      sourceId: demo ? 'demo' : SNAPSHOT_SOURCE.id,
      sourceLabel: demo ? 'Demo data' : SNAPSHOT_SOURCE.label,
      sourceUrl: demo ? undefined : SNAPSHOT_SOURCE.url,
      access: demo ? 'demo' : 'research',
      collectedAt: new Date(SNAPSHOT_AT).toISOString(),
      modelDate: SNAPSHOT_DATE,
      freshUntil: demo ? null : new Date(SNAPSHOT_AT + rule.freshMs).toISOString(),
      staleUntil: demo ? null : new Date(SNAPSHOT_AT + rule.maxMs).toISOString(),
    },
  });
}

export function estimateAll(amount: number, mid: number, exclude: Set<string> = new Set(), now = Date.now(), env: Env = {}): QuoteRow[] {
  return PROVIDERS.filter((p) => !p.liveOnly && !exclude.has(p.key))
    .map((p) => estimateRow(p, amount, mid, now, env))
    .filter((r) => r.freshness !== 'unavailable');
}

export type SortKey = 'received' | 'fee';

export function sortRows(rows: QuoteRow[], by: SortKey = 'received'): QuoteRow[] {
  const feeOrder = (f: number | null) => (f === null ? Infinity : f);
  return [...rows].sort((a, b) =>
    by === 'fee'
      ? feeOrder(a.fee) - feeOrder(b.fee) || b.received - a.received
      : b.received - a.received || feeOrder(a.fee) - feeOrder(b.fee),
  );
}

// ---------- comparability and summary ----------

export function fundingClass(m: FundingMethod): 'bank' | 'card' | 'unknown' {
  if (m === 'bank_transfer' || m === 'ach_debit' || m === 'bank_account') return 'bank';
  if (m === 'debit_card' || m === 'credit_card') return 'card';
  return 'unknown';
}

/** Freshness as of `now`, using the row's own windows so figures age in the browser. */
export function currentFreshness(r: QuoteRow, now = Date.now()): Freshness {
  if (r.context.freshUntil === null && r.context.staleUntil === null) return r.freshness;
  return freshnessAt(r.context.freshUntil, r.context.staleUntil, now);
}

/** Rows we are willing to rank against each other: observed or estimated today, bank funded, known fee. */
export function isComparable(r: QuoteRow, now = Date.now()): boolean {
  return (
    (r.origin === 'provider-quote' || r.origin === 'comparison-estimate' || r.origin === 'demo') &&
    currentFreshness(r, now) !== 'unavailable' &&
    fundingClass(r.context.fundingMethod) === 'bank' &&
    r.fee !== null
  );
}

export const ORIGIN_LABEL: Record<QuoteOrigin, string> = {
  'provider-quote': 'Provider quote',
  'comparison-estimate': 'Comparison estimate',
  'snapshot-model': 'Nov 13 model',
  demo: 'Demo data',
};

export function ageLabel(iso: string | null, now = Date.now()): string {
  if (!iso) return 'age unknown';
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return 'age unknown';
  if (ms < 90_000) return 'just now';
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min old`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hr old`;
  return `${Math.round(h / 24)} days old`;
}

export function summarize(rows: QuoteRow[], now = Date.now()): Summary {
  const comparable = rows.filter((r) => isComparable(r, now));
  const fresh = comparable.filter((r) => currentFreshness(r, now) === 'fresh');
  const pool = fresh.length ? fresh : comparable;
  const best = sortRows(pool)[0] ?? null;

  // Baseline: a US bank wire from the same comparable pool. Use the best paying one so the saving is conservative.
  const banks = sortRows(comparable.filter((r) => r.kind === 'bank' && (r.context.sourceCountry ?? 'US') === 'US'));
  const baseline = banks[0] ?? null;

  let saving: Summary['saving'] = null;
  let savingNote = 'No comparable US bank quote is available, so no saving is shown.';
  if (best && baseline && best.id !== baseline.id) {
    const inr = best.received - baseline.received;
    saving = { inr: round(inr, 0), pct: round((inr / baseline.received) * 100, 2) };
    savingNote = `${best.name} versus ${baseline.name}: same amount, both bank funded, ${ORIGIN_LABEL[best.origin].toLowerCase()} versus ${ORIGIN_LABEL[baseline.origin].toLowerCase()}.`;
  }

  const modelAbove = best
    ? sortRows(rows.filter((r) => r.origin === 'snapshot-model' && r.fee !== null && currentFreshness(r, now) !== 'unavailable'))[0]
    : undefined;

  return {
    bestId: best?.id ?? null,
    bestBasis: best
      ? `Highest payout among ${pool.length} ${fresh.length ? 'current' : 'stale'} bank funded ${pool.length === 1 ? 'row' : 'rows'} (provider quotes and comparison estimates).`
      : 'No current quotes or comparison estimates are available.',
    baselineId: baseline?.id ?? null,
    baselineLabel: baseline
      ? `${baseline.name}, ${ORIGIN_LABEL[baseline.origin].toLowerCase()}, ${ageLabel(baseline.context.collectedAt, now)}`
      : null,
    saving,
    savingNote,
    modelAboveBestId: modelAbove && best && modelAbove.received > best.received ? modelAbove.id : null,
  };
}

// ---------- history stats ----------

/**
 * Change over `windowMs` ending at the current observation. The baseline must sit within a tolerance
 * of the requested lookback (default: 10% of the window, at least 1 hour). Otherwise the result is
 * unavailable rather than a shorter period described as the requested one.
 */
export function changeOver(
  points: Point[],
  current: number | Point,
  windowMs: number,
  now = Date.now(),
  toleranceMs = Math.max(HOUR, windowMs * 0.1),
): ChangeResult {
  const cur: Point = typeof current === 'number' ? { t: now, v: current } : current;
  if (!saneRate(cur.v) || !Number.isFinite(cur.t)) return { status: 'unavailable', reason: 'No current rate.', requestedMs: windowMs };
  if (now - cur.t > Math.max(2 * HOUR, toleranceMs))
    return { status: 'unavailable', reason: 'The latest rate is too old to measure a change.', requestedMs: windowMs };
  const target = cur.t - windowMs;
  let base: Point | null = null;
  for (const p of points) {
    if (!saneRate(p.v) || !Number.isFinite(p.t)) continue;
    const d = Math.abs(p.t - target);
    if (d <= toleranceMs && (!base || d < Math.abs(base.t - target))) base = p;
  }
  if (!base) {
    const hrs = Math.round(windowMs / HOUR);
    return {
      status: 'unavailable',
      reason: `No observation from about ${hrs} hours ago (within ${Math.round(toleranceMs / 60_000)} min), so the ${hrs} hour change is unknown.`,
      requestedMs: windowMs,
    };
  }
  const abs = cur.v - base.v;
  return {
    status: 'ok',
    from: base.v,
    fromAt: base.t,
    to: cur.v,
    toAt: cur.t,
    abs: round(abs, 4),
    pct: round((abs / base.v) * 100, 3),
    periodMs: cur.t - base.t,
    requestedMs: windowMs,
  };
}

export function yearStats(points: Point[], current: number, source = '') {
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
    highAt: current > hi.v ? points[points.length - 1].t : hi.t,
    low: round(Math.min(lo.v, current), 4),
    lowAt: current < lo.v ? points[points.length - 1].t : lo.t,
    percentile: Math.round((below / points.length) * 100),
    firstAt: points[0].t,
    lastAt: points[points.length - 1].t,
    source,
  };
}

// ---------- offers ----------

export type OfferStatus = 'active' | 'no-end-date' | 'expired';

export function offerStatus(o: Offer, now = Date.now()): OfferStatus {
  if (!o.endsOn) return 'no-end-date';
  // Inclusive of the last day in Pacific time.
  return now > Date.parse(`${o.endsOn}T23:59:59-08:00`) ? 'expired' : 'active';
}

export type OfferEstimate =
  | { status: 'expired'; endsOn: string }
  | { status: 'not-applicable' | 'not-modelled'; reason: string }
  | {
      status: 'ok';
      received: number;
      effectiveRate: number;
      promoUsd: number;
      restUsd: number;
      basis: string;
      restBasis: string | null;
      extraVsRegular: number | null;
    };

/**
 * Model a welcome offer for `amount`. `regular` is the provider's current regular row (quote or estimate),
 * used for any amount above the cap and for fee waivers.
 */
export function offerEstimate(o: Offer, amount: number, mid: number, regular: QuoteRow | null, now = Date.now()): OfferEstimate {
  if (offerStatus(o, now) === 'expired') return { status: 'expired', endsOn: o.endsOn as string };
  if (!o.model) return { status: 'not-modelled', reason: 'No rate or fee terms we can model. Check the app.' };
  if (o.model.type === 'rate-premium') {
    const promoUsd = o.capUsd ? Math.min(amount, o.capUsd) : amount;
    const restUsd = amount - promoUsd;
    const promoReceived = promoUsd * mid * (1 + o.model.premium);
    let restReceived = 0;
    let restBasis: string | null = null;
    if (restUsd > 0) {
      if (!regular) return { status: 'not-modelled', reason: `No regular ${o.provider} figure to price the amount above the cap.` };
      restReceived = restUsd * regular.effectiveRate;
      restBasis = `Amount above the cap at ${o.provider}’s regular effective rate (${ORIGIN_LABEL[regular.origin].toLowerCase()}).`;
    }
    const received = promoReceived + restReceived;
    return {
      status: 'ok',
      received: round(received, 2),
      effectiveRate: round(received / amount, 4),
      promoUsd,
      restUsd,
      basis: o.model.basis,
      restBasis,
      extraVsRegular: regular ? round(received - regular.received, 0) : null,
    };
  }
  // fee waiver
  if (o.capUsd && amount > o.capUsd) return { status: 'not-applicable', reason: `Applies only up to $${o.capUsd.toLocaleString('en-US')}.` };
  if (!regular || regular.fee === null || regular.rate === null)
    return { status: 'not-modelled', reason: `No current ${o.provider} fee to waive.` };
  const received = regular.received + regular.fee * regular.rate;
  return {
    status: 'ok',
    received: round(received, 2),
    effectiveRate: round(received / amount, 4),
    promoUsd: amount,
    restUsd: 0,
    basis: o.model.basis,
    restBasis: null,
    extraVsRegular: round(received - regular.received, 0),
  };
}

/** Backwards compatible helper: Remitly's welcome model with the snapshot model as the regular rate. */
export function promoEstimate(amount: number, mid: number, now = Date.now()) {
  const o = OFFERS.find((x) => x.id === 'remitly-welcome');
  const p = PROVIDERS.find((x) => x.key === 'remitly');
  if (!o || !p) return null;
  const e = offerEstimate(o, amount, mid, estimateRow(p, amount, mid, now), now);
  if (e.status !== 'ok') return null;
  return { provider: o.provider, received: e.received, perUsd: e.effectiveRate, capUsd: o.capUsd ?? amount, ends: o.endsOn ?? undefined };
}

// ---------- alerts ----------

export type AlertKind = 'above' | 'below' | 'move';
export interface AlertRule {
  id: string;
  kind: AlertKind;
  value: number;
}

export interface AlertHit {
  rule: AlertRule;
  key: string;
  title: string;
  message: string;
  up?: boolean;
}

/**
 * State based alerts: a rule fires while its condition holds; callers dedupe with a cooldown.
 * Pass change24hPct = null when the 24 hour baseline is missing: movement rules are then skipped.
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

export function rulesFromEnv(env: Env): AlertRule[] {
  const rules: AlertRule[] = [];
  const above = Number(env.ALERT_ABOVE);
  const below = Number(env.ALERT_BELOW);
  const move = env.ALERT_MOVE_PCT === undefined || env.ALERT_MOVE_PCT === '' ? 0.5 : Number(env.ALERT_MOVE_PCT);
  if (Number.isFinite(above) && above > 0) rules.push({ id: 'env-above', kind: 'above', value: above });
  if (Number.isFinite(below) && below > 0) rules.push({ id: 'env-below', kind: 'below', value: below });
  if (Number.isFinite(move) && move > 0) rules.push({ id: 'env-move', kind: 'move', value: move });
  return rules;
}
