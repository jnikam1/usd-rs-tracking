import 'server-only';
import { changeOver, yearStats } from './compute';
import { getHistory, getLiveMid } from './fx';
import { errMsg } from './http';
import type { RatesPayload } from './types';

export async function getRates(): Promise<RatesPayload> {
  const errors: string[] = [];
  const [midR, dayR, yearR] = await Promise.allSettled([getLiveMid(), getHistory('7d'), getHistory('1y')]);

  const mid = midR.status === 'fulfilled' ? midR.value : null;
  if (midR.status === 'rejected') errors.push(errMsg(midR.reason));
  if (dayR.status === 'rejected') errors.push(`history 7d: ${errMsg(dayR.reason)}`);
  if (yearR.status === 'rejected') errors.push(`history 1y: ${errMsg(yearR.reason)}`);

  const change24h =
    mid && dayR.status === 'fulfilled' ? changeOver(dayR.value.points, mid.rate, 24 * 3600_000) : null;
  const ys = mid && yearR.status === 'fulfilled' ? yearStats(yearR.value.points, mid.rate) : null;

  return {
    mid: mid ? { rate: mid.rate, time: mid.time, source: mid.source, intraday: mid.intraday } : null,
    change24h,
    year: ys && yearR.status === 'fulfilled' ? { ...ys, source: yearR.value.source } : null,
    generatedAt: new Date().toISOString(),
    errors,
  };
}
