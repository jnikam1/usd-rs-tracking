// Mid market rate and history: source parsers, validation and fallback logic.
// Pure apart from the injected fetcher, so the fallback behaviour is unit tested.
import { classify, freshnessRules, type FreshnessRule } from './config';
import type { Freshness, MidInfo, Point, Range } from './types';
import { errMsg, parseTime, saneRate } from './util';

export type JsonFetcher = (
  url: string,
  opts?: {
    revalidate?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    headers?: Record<string, string>;
    method?: 'GET' | 'POST';
    body?: string;
  },
) => Promise<{ data: unknown; retrievedAt: string }>;

const HOUR = 3600_000;
const DAY = 24 * HOUR;

// ---------- mid market rate ----------

interface MidCandidate {
  rate: number;
  observedAt: number;
}

export interface MidSourceDef {
  id: string;
  label: string;
  intraday: boolean;
  url: string;
  revalidate: number;
  parse: (data: unknown) => MidCandidate;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});

export const MID_SOURCES: MidSourceDef[] = [
  {
    id: 'wise-live',
    label: 'Wise mid market',
    intraday: true,
    url: 'https://wise.com/rates/live?source=USD&target=INR',
    revalidate: 60,
    parse: (d) => {
      const o = obj(Array.isArray(d) ? d[d.length - 1] : d);
      return { rate: o.value as number, observedAt: parseTime(o.time) ?? NaN };
    },
  },
  {
    id: 'yahoo',
    label: 'Yahoo Finance INR=X',
    intraday: true,
    url: 'https://query1.finance.yahoo.com/v8/finance/chart/INR=X?range=1d&interval=5m',
    revalidate: 60,
    parse: (d) => {
      const meta = obj(obj((obj(obj(d).chart).result as unknown[] | undefined)?.[0]).meta);
      const t = meta.regularMarketTime;
      return { rate: meta.regularMarketPrice as number, observedAt: typeof t === 'number' ? t * 1000 : NaN };
    },
  },
  {
    id: 'open-er-api',
    label: 'ExchangeRate-API daily reference',
    intraday: false,
    url: 'https://open.er-api.com/v6/latest/USD',
    revalidate: 1800,
    parse: (d) => {
      const o = obj(d);
      if (o.result !== 'success') throw new Error('result is not success');
      const t = o.time_last_update_unix;
      return { rate: obj(o.rates).INR as number, observedAt: typeof t === 'number' ? t * 1000 : NaN };
    },
  },
  {
    id: 'frankfurter',
    label: 'ECB reference via Frankfurter',
    intraday: false,
    url: 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR',
    revalidate: 1800,
    parse: (d) => {
      const o = obj(d);
      // ECB reference rates are set around 16:00 CET.
      return { rate: obj(o.rates).INR as number, observedAt: parseTime(`${o.date}T15:00:00Z`) ?? NaN };
    },
  },
  {
    id: 'jsdelivr',
    label: 'currency-api daily reference',
    intraday: false,
    url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    revalidate: 1800,
    parse: (d) => {
      const o = obj(d);
      return { rate: obj(o.usd).inr as number, observedAt: parseTime(`${o.date}T00:00:00Z`) ?? NaN };
    },
  },
];

export interface MidResolution {
  mid: MidInfo | null;
  attempts: string[];
}

/** Validate one candidate. Returns a reason string when it must not be used. */
export function validateMid(c: MidCandidate, now: number, rule: FreshnessRule): { freshness: Freshness } | string {
  if (!saneRate(c.rate)) return 'rate missing or out of range';
  if (!Number.isFinite(c.observedAt)) return 'no observation time';
  const f = classify(now - c.observedAt, rule);
  if (f === 'unavailable') return now < c.observedAt ? 'observation time is in the future' : 'observation too old';
  return { freshness: f };
}

/**
 * Fetch every candidate in parallel (bounded latency), then pick by priority:
 * the first fresh source wins, otherwise the first stale one. Each candidate is parsed and validated
 * before it can count as a success.
 */
export async function resolveMid(
  fetchJson: JsonFetcher,
  opts: { now?: () => number; env?: Record<string, string | undefined>; signal?: AbortSignal; sources?: MidSourceDef[] } = {},
): Promise<MidResolution> {
  const now = opts.now ?? Date.now;
  const rule = freshnessRules(opts.env).mid;
  const sources = opts.sources ?? MID_SOURCES;
  const settled = await Promise.allSettled(
    sources.map((s) => fetchJson(s.url, { revalidate: s.revalidate, timeoutMs: 5000, signal: opts.signal })),
  );
  const attempts: string[] = [];
  let stale: MidInfo | null = null;
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const r = settled[i];
    if (r.status === 'rejected') {
      attempts.push(`${s.id}: ${errMsg(r.reason)}`);
      continue;
    }
    let cand: MidCandidate;
    try {
      cand = s.parse(r.value.data);
    } catch (e) {
      attempts.push(`${s.id}: ${errMsg(e)}`);
      continue;
    }
    const v = validateMid(cand, now(), rule);
    if (typeof v === 'string') {
      attempts.push(`${s.id}: ${v}`);
      continue;
    }
    const info: MidInfo = {
      rate: cand.rate,
      source: s.label,
      sourceId: s.id,
      observedAt: new Date(cand.observedAt).toISOString(),
      retrievedAt: r.value.retrievedAt,
      intraday: s.intraday,
      freshness: v.freshness,
    };
    if (v.freshness === 'fresh') return { mid: info, attempts };
    attempts.push(`${s.id}: usable but stale`);
    stale ??= info;
  }
  return { mid: stale, attempts };
}

// ---------- history ----------

export interface Coverage {
  windowMs: number;
  minPoints: number;
  /** Max gap between the start of the window and the first observation. */
  maxStartGapMs: number;
  /** Max gap between the last observation and now. */
  maxEndGapMs: number;
}

export const COVERAGE: Record<Range, Coverage> = {
  '1d': { windowMs: DAY, minPoints: 12, maxStartGapMs: 4 * HOUR, maxEndGapMs: 3 * HOUR },
  '7d': { windowMs: 7 * DAY, minPoints: 48, maxStartGapMs: DAY, maxEndGapMs: 12 * HOUR },
  '30d': { windowMs: 30 * DAY, minPoints: 15, maxStartGapMs: 5 * DAY, maxEndGapMs: 3 * DAY },
  '1y': { windowMs: 366 * DAY, minPoints: 150, maxStartGapMs: 45 * DAY, maxEndGapMs: 5 * DAY },
};

export function validateHistory(
  raw: Point[],
  range: Range,
  now: number,
): { ok: true; points: Point[] } | { ok: false; reason: string } {
  const cov = COVERAGE[range];
  const start = now - cov.windowMs;
  const seen = new Set<number>();
  const pts = raw
    .filter((p) => saneRate(p.v) && Number.isFinite(p.t) && p.t >= start - HOUR && p.t <= now + 5 * 60_000)
    .filter((p) => (seen.has(p.t) ? false : (seen.add(p.t), true)))
    .sort((a, b) => a.t - b.t);
  if (pts.length === 0) return { ok: false, reason: `no usable points inside the ${range} window` };
  if (pts.length < cov.minPoints) return { ok: false, reason: `only ${pts.length} usable points, need ${cov.minPoints}` };
  if (pts[0].t - start > cov.maxStartGapMs) return { ok: false, reason: 'does not reach back to the start of the window' };
  if (now - pts[pts.length - 1].t > cov.maxEndGapMs) return { ok: false, reason: 'latest point is too old' };
  return { ok: true, points: pts };
}

export function downsample(points: Point[], max: number): Point[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: Point[] = [];
  for (let i = 0; i < max - 1; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

export interface HistorySourceDef {
  id: string;
  label: string;
  ranges: Range[];
  url: (range: Range, now: number) => string;
  revalidate: (range: Range) => number;
  parse: (data: unknown) => Point[];
}

const WISE_Q: Record<Range, string> = {
  '1d': 'length=1&unit=day&resolution=hourly',
  '7d': 'length=7&unit=day&resolution=hourly',
  '30d': 'length=30&unit=day&resolution=hourly',
  '1y': 'length=1&unit=year&resolution=daily',
};
const YAHOO_Q: Record<Range, string> = {
  '1d': 'range=1d&interval=5m',
  '7d': 'range=1mo&interval=1h',
  '30d': 'range=1mo&interval=1h',
  '1y': 'range=1y&interval=1d',
};

export const HISTORY_SOURCES: HistorySourceDef[] = [
  {
    id: 'wise-history',
    label: 'Wise rate history',
    ranges: ['1d', '7d', '30d', '1y'],
    url: (r) => `https://wise.com/rates/history+live?source=USD&target=INR&${WISE_Q[r]}`,
    revalidate: (r) => (r === '1y' ? 3600 : 300),
    parse: (d) => {
      if (!Array.isArray(d)) throw new Error('expected an array');
      return d.map((x) => ({ t: Number(obj(x).time), v: Number(obj(x).value) }));
    },
  },
  {
    id: 'yahoo-history',
    label: 'Yahoo Finance INR=X',
    ranges: ['1d', '7d', '30d', '1y'],
    url: (r) => `https://query1.finance.yahoo.com/v8/finance/chart/INR=X?${YAHOO_Q[r]}`,
    revalidate: (r) => (r === '1y' ? 3600 : 300),
    parse: (d) => {
      const res = obj((obj(obj(d).chart).result as unknown[] | undefined)?.[0]);
      const ts = (res.timestamp as number[] | undefined) ?? [];
      const close = (obj((obj(res.indicators).quote as unknown[] | undefined)?.[0]).close as (number | null)[] | undefined) ?? [];
      const out: Point[] = [];
      ts.forEach((t, i) => {
        const v = close[i];
        if (typeof v === 'number') out.push({ t: t * 1000, v });
      });
      return out;
    },
  },
  {
    id: 'frankfurter-history',
    label: 'ECB reference via Frankfurter',
    ranges: ['30d', '1y'],
    url: (r, now) =>
      `https://api.frankfurter.dev/v1/${new Date(now - (r === '1y' ? 367 : 32) * DAY).toISOString().slice(0, 10)}..?base=USD&symbols=INR`,
    revalidate: () => 3600,
    parse: (d) =>
      Object.entries(obj(obj(d).rates)).map(([date, r]) => ({ t: Date.parse(`${date}T15:00:00Z`), v: Number(obj(r).INR) })),
  },
];

export interface HistoryResolution {
  points: Point[];
  source: HistorySourceDef | null;
  retrievedAt: string | null;
  attempts: string[];
}

/**
 * Try each source in priority order. A source only succeeds after its points pass the window and
 * coverage checks, so a well formed but useless response falls through to the next source.
 */
export async function resolveHistory(
  range: Range,
  fetchJson: JsonFetcher,
  opts: { now?: () => number; signal?: AbortSignal; sources?: HistorySourceDef[]; maxPoints?: number } = {},
): Promise<HistoryResolution> {
  const now = opts.now ?? Date.now;
  const attempts: string[] = [];
  for (const s of (opts.sources ?? HISTORY_SOURCES).filter((x) => x.ranges.includes(range))) {
    if (opts.signal?.aborted) {
      attempts.push(`${s.id}: skipped, out of time`);
      break;
    }
    try {
      const r = await fetchJson(s.url(range, now()), { revalidate: s.revalidate(range), timeoutMs: 5000, signal: opts.signal });
      const v = validateHistory(s.parse(r.data), range, now());
      if (!v.ok) {
        attempts.push(`${s.id}: ${v.reason}`);
        continue;
      }
      return { points: downsample(v.points, opts.maxPoints ?? 400), source: s, retrievedAt: r.retrievedAt, attempts };
    } catch (e) {
      attempts.push(`${s.id}: ${errMsg(e)}`);
    }
  }
  return { points: [], source: null, retrievedAt: null, attempts };
}
