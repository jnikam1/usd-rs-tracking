import { alertConfig, comparisonAccess } from '@/lib/config';
import { getHistory, getLiveMid } from '@/lib/fx';
import { getQuotes } from '@/lib/quotes';
import { RANGES } from '@/lib/types';
import { errMsg } from '@/lib/util';

export const dynamic = 'force-dynamic';

// Which upstream sources answer, and what was rejected. Never includes tokens, topics or thresholds.
export async function GET() {
  const t0 = Date.now();
  const signal = AbortSignal.timeout(20_000);
  const [mid, history, quotes] = await Promise.all([
    getLiveMid(signal).catch((e) => ({ mid: null, attempts: [errMsg(e)] })),
    Promise.all(
      RANGES.map((r) =>
        getHistory(r, signal).then((h) => ({ range: r, ok: h.points.length > 0, source: h.source, points: h.points.length, attempts: h.attempts })),
      ),
    ),
    getQuotes(1000, { signal }).catch((e) => ({ error: errMsg(e) })),
  ]);
  const access = comparisonAccess(process.env);
  const alerts = alertConfig(process.env);
  return Response.json(
    {
      ms: Date.now() - t0,
      mid,
      history,
      comparisonAccess: { enabled: access.enabled, mode: access.access, detail: access.reason },
      quotes:
        'error' in quotes
          ? quotes
          : {
              sources: quotes.sources,
              rejected: quotes.rejected,
              rows: quotes.rows.map((r) => ({ name: r.name, origin: r.origin, freshness: r.freshness, received: r.received, fee: r.fee })),
              summary: quotes.summary,
            },
      serverAlerts: { deliveryConfigured: Boolean(alerts.topic), authConfigured: Boolean(alerts.secret) },
    },
    { headers: { 'cache-control': 'public, s-maxage=60' } },
  );
}
