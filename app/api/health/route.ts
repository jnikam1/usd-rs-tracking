import { MID_SOURCES, getHistory } from '@/lib/fx';
import { errMsg } from '@/lib/http';
import { fetchLiveQuotes } from '@/lib/quotes';
import { RANGES } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Probes every upstream source so you can see which ones work from Vercel's servers.
export async function GET() {
  const t0 = Date.now();
  const mids = await Promise.all(
    MID_SOURCES.map(async (s) => {
      const t = Date.now();
      try {
        const v = await s.run();
        return { source: s.name, ok: true, rate: v.rate, time: v.time, ms: Date.now() - t };
      } catch (e) {
        return { source: s.name, ok: false, error: errMsg(e), ms: Date.now() - t };
      }
    }),
  );
  const history = await Promise.all(
    RANGES.map(async (r) => {
      try {
        const h = await getHistory(r);
        return { range: r, ok: true, source: h.source, points: h.points.length, fallbacks: h.fallbacks };
      } catch (e) {
        return { range: r, ok: false, error: errMsg(e) };
      }
    }),
  );
  let comparison: unknown;
  try {
    const mid = mids.find((m) => m.ok && 'rate' in m)?.rate ?? NaN;
    const q = await fetchLiveQuotes(1000, mid as number);
    comparison = { ok: true, source: q.source, mid: q.mid, providers: q.rows.map((r) => `${r.name} ${r.perUsd}`) };
  } catch (e) {
    comparison = { ok: false, error: errMsg(e) };
  }
  return Response.json({ ms: Date.now() - t0, mids, history, comparison }, { headers: { 'cache-control': 'no-store' } });
}
