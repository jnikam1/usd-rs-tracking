// Offline demo fixtures for local development: set MOCK_FX=1. Every row is labelled "Demo data".
// The demo comparison payload deliberately includes a wrong-country quote and an expired observation
// so the validation paths are visible in the interface.
import type { MidInfo, Point, Range } from './types';
import { SNAPSHOT_MID } from './providers';

export const demoEnabled = () => process.env.MOCK_FX === '1' && process.env.VERCEL_ENV !== 'production';

export function demoMid(now = Date.now()): MidInfo {
  return {
    rate: SNAPSHOT_MID,
    source: 'Demo data',
    sourceId: 'demo',
    observedAt: new Date(now - 60_000).toISOString(),
    retrievedAt: new Date(now).toISOString(),
    intraday: true,
    freshness: 'fresh',
  };
}

export function demoHistory(range: Range, now = Date.now()): Point[] {
  const n = range === '1d' ? 24 : range === '7d' ? 168 : range === '30d' ? 720 : 365;
  const step = range === '1y' ? 86400_000 : 3600_000;
  let v = range === '1y' ? 88.7 : SNAPSHOT_MID - (range === '1d' ? 0.15 : range === '7d' ? -0.3 : 2.4);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const out: Point[] = [];
  for (let i = n; i >= 1; i--) {
    v += (SNAPSHOT_MID - v) / (i + 8) + rnd() * (range === '1y' ? 0.6 : 0.08);
    out.push({ t: now - i * step, v: Number(v.toFixed(4)) });
  }
  out.push({ t: now - 60_000, v: SNAPSHOT_MID });
  return out;
}

export function demoComparison(amount: number, now = Date.now()) {
  const mid = SNAPSHOT_MID;
  const q = (rate: number, fee: number, ageMin: number, src: string | null = 'US', tgt: string | null = 'IN', delivery?: string) => ({
    rate,
    fee,
    receivedAmount: Math.round((amount - fee) * rate * 100) / 100,
    sendAmount: null,
    dateCollected: new Date(now - ageMin * 60_000).toISOString(),
    sourceCountry: src,
    targetCountry: tgt,
    deliveryEstimation: delivery ? { duration: { min: delivery, max: delivery } } : { duration: null },
  });
  const p = (name: string, alias: string, type: string, quote: object) => ({ name, alias, type, quotes: [quote] });
  return {
    providers: [
      p('Wise', 'wise', 'moneyTransferProvider', q(mid, amount < 1000 ? 3.2 : 6.85, 1, 'US', 'IN', 'PT1S')),
      p('Remitly', 'remitly', 'moneyTransferProvider', q(mid * 0.99925, amount < 1000 ? 3.99 : 0, 20)),
      p('Xoom', 'xoom', 'moneyTransferProvider', q(mid * 0.9972, amount < 1000 ? 2.99 : 0, 300, null, 'IN')),
      p('WorldRemit', 'world-remit', 'moneyTransferProvider', q(mid * 0.99887, 2.99, 270)),
      p('Western Union', 'western-union', 'moneyTransferProvider', q(mid * 0.9938, 0, 75)),
      p('Instarem', 'instarem', 'moneyTransferProvider', q(mid * 0.9927, 0, 25)),
      p('Wells Fargo', 'wells-fargo', 'bank', q(mid * 0.9687, 0, 34 * 60)),
      p('OFX', 'ofx', 'moneyTransferProvider', q(mid * 0.963, 5, 9, null, null)),
      // Rejected on purpose: quoted for sending from India, and an observation older than the limit.
      p('State Bank of India', 'state-bank-of-india', 'bank', q(93.75, 0, 57, 'IN', null)),
      p('Chase (US)', 'chase', 'bank', q(mid * 0.9733, 5, 75 * 60)),
    ],
  };
}
