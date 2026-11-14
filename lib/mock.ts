// Offline fixtures for local development: set MOCK_FX=1. Never used in production.
import { estimateAll } from './compute';
import { SNAPSHOT_MID } from './providers';
import type { MidQuote, Point, Range } from './types';

export const mockEnabled = () => process.env.MOCK_FX === '1';

export function mockMid(): MidQuote {
  return { rate: SNAPSHOT_MID, time: new Date(Date.now() - 90_000).toISOString(), source: 'Mock data', intraday: true };
}

export function mockHistory(range: Range): Point[] {
  const n = range === '1d' ? 24 : range === '7d' ? 168 : range === '30d' ? 720 : 365;
  const step = range === '1y' ? 86400_000 : 3600_000;
  const now = Date.now();
  let v = range === '1y' ? 88.7 : SNAPSHOT_MID - (range === '1d' ? 0.15 : range === '7d' ? -0.3 : 2.4);
  const out: Point[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  for (let i = n; i >= 0; i--) {
    const drift = (SNAPSHOT_MID - v) / (i + 8);
    v += drift + rnd() * (range === '1y' ? 0.6 : 0.08);
    out.push({ t: now - i * step, v: Number(v.toFixed(4)) });
  }
  return out;
}

export function mockLiveRows(amount: number) {
  const live = new Set(['wise', 'remitly', 'xoom', 'westernunion', 'moneygram', 'instarem', 'xe', 'worldremit', 'ria', 'revolut']);
  return estimateAll(amount, SNAPSHOT_MID)
    .filter((r) => live.has(r.key))
    .map((r) => ({ ...r, source: 'live' as const, collectedAt: new Date(Date.now() - 2 * 3600_000).toISOString() }));
}
