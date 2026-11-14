import 'server-only';
import { errMsg, getJson } from './http';
import { mockEnabled, mockHistory, mockMid } from './mock';
import type { MidQuote, Point, Range } from './types';

// USD/INR mid market rate and history, with fallbacks.
// Order matters: intraday sources first, daily reference rates last.

const sane = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 40 && v < 250;

type Source<T> = { name: string; run: () => Promise<T> };

async function firstOk<T>(sources: Source<T>[]): Promise<{ value: T; source: string; errors: string[] }> {
  const errors: string[] = [];
  for (const s of sources) {
    try {
      return { value: await s.run(), source: s.name, errors };
    } catch (e) {
      errors.push(`${s.name}: ${errMsg(e)}`);
    }
  }
  throw new Error(`All sources failed. ${errors.join(' | ')}`);
}

// ---------- live mid ----------

interface WiseRate { source?: string; target?: string; value?: number; time?: number }

async function wiseLive(): Promise<MidQuote> {
  const d = await getJson<WiseRate | WiseRate[]>('https://wise.com/rates/live?source=USD&target=INR', { revalidate: 60 });
  const o = Array.isArray(d) ? d[d.length - 1] : d;
  if (!sane(o?.value)) throw new Error('unexpected payload');
  return { rate: o.value, time: new Date(o.time ?? Date.now()).toISOString(), source: 'Wise (mid market)', intraday: true };
}

interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number; regularMarketTime?: number };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
}

async function yahoo(range: string, interval: string, revalidate: number): Promise<YahooChart> {
  return getJson<YahooChart>(
    `https://query1.finance.yahoo.com/v8/finance/chart/INR=X?range=${range}&interval=${interval}`,
    { revalidate },
  );
}

async function yahooLive(): Promise<MidQuote> {
  const d = await yahoo('1d', '5m', 60);
  const meta = d.chart?.result?.[0]?.meta;
  if (!sane(meta?.regularMarketPrice)) throw new Error('unexpected payload');
  return {
    rate: meta.regularMarketPrice,
    time: new Date((meta.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString(),
    source: 'Yahoo Finance (INR=X)',
    intraday: true,
  };
}

async function openErLive(): Promise<MidQuote> {
  const d = await getJson<{ result?: string; time_last_update_unix?: number; rates?: Record<string, number> }>(
    'https://open.er-api.com/v6/latest/USD',
    { revalidate: 1800 },
  );
  if (d.result !== 'success' || !sane(d.rates?.INR)) throw new Error('unexpected payload');
  return {
    rate: d.rates.INR,
    time: new Date((d.time_last_update_unix ?? 0) * 1000).toISOString(),
    source: 'ExchangeRate-API (daily)',
    intraday: false,
  };
}

async function frankfurterLive(): Promise<MidQuote> {
  const d = await getJson<{ date?: string; rates?: Record<string, number> }>(
    'https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR',
    { revalidate: 1800 },
  );
  if (!sane(d.rates?.INR)) throw new Error('unexpected payload');
  return { rate: d.rates.INR, time: new Date(`${d.date}T16:00:00+01:00`).toISOString(), source: 'ECB via Frankfurter (daily)', intraday: false };
}

async function jsdelivrLive(): Promise<MidQuote> {
  const d = await getJson<{ date?: string; usd?: Record<string, number> }>(
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    { revalidate: 1800 },
  );
  if (!sane(d.usd?.inr)) throw new Error('unexpected payload');
  return { rate: d.usd.inr, time: new Date(`${d.date}T00:00:00Z`).toISOString(), source: 'currency-api (daily)', intraday: false };
}

export const MID_SOURCES: Source<MidQuote>[] = [
  { name: 'wise-live', run: wiseLive },
  { name: 'yahoo', run: yahooLive },
  { name: 'open-er-api', run: openErLive },
  { name: 'frankfurter', run: frankfurterLive },
  { name: 'jsdelivr', run: jsdelivrLive },
];

export async function getLiveMid(): Promise<MidQuote & { fallbacks: string[] }> {
  if (mockEnabled()) return { ...mockMid(), fallbacks: [] };
  const r = await firstOk(MID_SOURCES);
  return { ...r.value, fallbacks: r.errors };
}

// ---------- history ----------

function clean(points: Point[]): Point[] {
  const seen = new Set<number>();
  return points
    .filter((p) => sane(p.v) && Number.isFinite(p.t) && !seen.has(p.t) && (seen.add(p.t), true))
    .sort((a, b) => a.t - b.t);
}

function downsample(points: Point[], max: number): Point[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: Point[] = [];
  for (let i = 0; i < max - 1; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

const WISE_HISTORY: Record<Range, string> = {
  '1d': 'length=1&unit=day&resolution=hourly',
  '7d': 'length=7&unit=day&resolution=hourly',
  '30d': 'length=30&unit=day&resolution=hourly',
  '1y': 'length=1&unit=year&resolution=daily',
};

async function wiseHistory(range: Range): Promise<Point[]> {
  const d = await getJson<WiseRate[]>(
    `https://wise.com/rates/history+live?source=USD&target=INR&${WISE_HISTORY[range]}`,
    { revalidate: range === '1y' ? 3600 : 300 },
  );
  if (!Array.isArray(d) || d.length < 2) throw new Error('unexpected payload');
  return d.map((x) => ({ t: Number(x.time), v: Number(x.value) }));
}

const YAHOO_HISTORY: Record<Range, [string, string]> = {
  '1d': ['1d', '5m'],
  '7d': ['1mo', '1h'],
  '30d': ['1mo', '1h'],
  '1y': ['1y', '1d'],
};

async function yahooHistory(range: Range): Promise<Point[]> {
  const [r, i] = YAHOO_HISTORY[range];
  const d = await yahoo(r, i, range === '1y' ? 3600 : 300);
  const res = d.chart?.result?.[0];
  const ts = res?.timestamp ?? [];
  const close = res?.indicators?.quote?.[0]?.close ?? [];
  const pts: Point[] = [];
  ts.forEach((t, idx) => {
    const v = close[idx];
    if (typeof v === 'number') pts.push({ t: t * 1000, v });
  });
  if (pts.length < 2) throw new Error('unexpected payload');
  return pts;
}

async function frankfurterHistory(range: Range): Promise<Point[]> {
  const days = range === '1y' ? 366 : 31;
  const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const d = await getJson<{ rates?: Record<string, { INR?: number }> }>(
    `https://api.frankfurter.dev/v1/${from}..?base=USD&symbols=INR`,
    { revalidate: 3600 },
  );
  const pts = Object.entries(d.rates ?? {}).map(([date, r]) => ({ t: Date.parse(`${date}T15:00:00Z`), v: Number(r.INR) }));
  if (pts.length < 2) throw new Error('unexpected payload');
  return pts;
}

const RANGE_MS: Record<Range, number> = { '1d': 86400_000, '7d': 7 * 86400_000, '30d': 30 * 86400_000, '1y': 366 * 86400_000 };

export async function getHistory(range: Range): Promise<{ points: Point[]; source: string; fallbacks: string[] }> {
  if (mockEnabled()) return { points: downsample(mockHistory(range), 400), source: 'Mock data', fallbacks: [] };
  const sources: Source<Point[]>[] = [
    { name: 'Wise', run: () => wiseHistory(range) },
    { name: 'Yahoo Finance', run: () => yahooHistory(range) },
  ];
  if (range === '30d' || range === '1y') sources.push({ name: 'ECB via Frankfurter', run: () => frankfurterHistory(range) });
  const r = await firstOk(sources);
  const cutoff = Date.now() - RANGE_MS[range] - 3600_000;
  const pts = clean(r.value).filter((p) => p.t >= cutoff);
  if (pts.length < 2) throw new Error(`Not enough history from ${r.source}`);
  return { points: downsample(pts, 400), source: r.source, fallbacks: r.errors };
}
