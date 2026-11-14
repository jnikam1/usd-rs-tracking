import 'server-only';
import { changeOver, yearStats } from './compute';
import { getHistory, getLiveMid } from './fx';
import type { Point, RatesPayload } from './types';
import { errMsg } from './util';

const DAY = 86400_000;

export async function getRates(signal?: AbortSignal, now = Date.now()): Promise<RatesPayload> {
  const errors: string[] = [];
  const [midR, weekR, yearR] = await Promise.allSettled([getLiveMid(signal), getHistory('7d', signal), getHistory('1y', signal)]);

  const mid = midR.status === 'fulfilled' ? midR.value.mid : null;
  if (midR.status === 'rejected') errors.push(`mid: ${errMsg(midR.reason)}`);
  else if (!mid) errors.push(`mid: ${midR.value.attempts.join(' | ')}`);
  const week = weekR.status === 'fulfilled' ? weekR.value : null;
  if (!week?.points.length) errors.push(`history 7d: ${week?.attempts.join(' | ') || errMsg((weekR as PromiseRejectedResult).reason)}`);
  const year = yearR.status === 'fulfilled' ? yearR.value : null;
  if (!year?.points.length) errors.push(`history 1y: ${year?.attempts.join(' | ') || errMsg((yearR as PromiseRejectedResult).reason)}`);

  // The 24 hour change needs a current observation: the live mid if it is intraday and fresh,
  // otherwise the latest history point. changeOver rejects either if it is too old.
  let current: Point | null = null;
  if (mid?.intraday && mid.freshness === 'fresh') current = { t: Date.parse(mid.observedAt), v: mid.rate };
  else if (week?.points.length) current = week.points[week.points.length - 1];

  const change24h = current
    ? changeOver(week?.points ?? [], current, DAY, now)
    : ({ status: 'unavailable', reason: 'No current rate.', requestedMs: DAY } as const);

  return {
    mid,
    change24h,
    year: mid && year?.points.length ? yearStats(year.points, mid.rate, year.source ?? '') : null,
    generatedAt: new Date(now).toISOString(),
    errors,
  };
}
