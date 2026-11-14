import 'server-only';
import { resolveHistory, resolveMid } from './fx-core';
import { fetchJson } from './http';
import { demoHistory, demoMid, demoEnabled } from './mock';
import type { HistoryPayload, MidInfo, Range } from './types';

export async function getLiveMid(signal?: AbortSignal): Promise<{ mid: MidInfo | null; attempts: string[] }> {
  if (demoEnabled()) return { mid: demoMid(), attempts: [] };
  return resolveMid(fetchJson, { env: process.env, signal });
}

export async function getHistory(range: Range, signal?: AbortSignal): Promise<HistoryPayload> {
  if (demoEnabled()) {
    const points = demoHistory(range);
    return { range, points, source: 'Demo data', sourceId: 'demo', firstAt: points[0].t, lastAt: points.at(-1)!.t, retrievedAt: new Date().toISOString(), attempts: [] };
  }
  const r = await resolveHistory(range, fetchJson, { signal });
  return {
    range,
    points: r.points,
    source: r.source?.label ?? null,
    sourceId: r.source?.id ?? null,
    firstAt: r.points[0]?.t ?? null,
    lastAt: r.points.at(-1)?.t ?? null,
    retrievedAt: r.retrievedAt,
    attempts: r.attempts,
    ...(r.points.length ? {} : { error: 'No history source returned enough usable data for this period.' }),
  };
}
