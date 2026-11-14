import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HISTORY_SOURCES, MID_SOURCES, resolveHistory, resolveMid, validateHistory, type JsonFetcher } from '../lib/fx-core';
import { changeOver, evaluateRules } from '../lib/compute';

const NOW = Date.parse('2026-11-14T03:00:00Z');
const HOUR = 3600_000;

function hourly(hours: number, endAgoMs = 0, v = 94.2): { time: number; value: number }[] {
  return Array.from({ length: hours + 1 }, (_, i) => ({ time: NOW - endAgoMs - (hours - i) * HOUR, value: v + i * 0.001 }));
}

function fakeFetcher(map: Record<string, unknown | Error>): JsonFetcher & { calls: string[] } {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    const key = Object.keys(map).find((k) => url.includes(k));
    const v = key ? map[key] : new Error('no route');
    if (v instanceof Error) throw v;
    return { data: v, retrievedAt: new Date(NOW).toISOString() };
  }) as JsonFetcher & { calls: string[] };
  f.calls = calls;
  return f;
}

test('regression: Wise history with two valid rates at t=0 and t=1 falls through to Yahoo', async () => {
  const yahoo = {
    chart: { result: [{ timestamp: hourly(30).map((p) => p.time / 1000), indicators: { quote: [{ close: hourly(30).map((p) => p.value) }] } }] },
  };
  const f = fakeFetcher({
    'wise.com/rates/history': [
      { time: 0, value: 94.1 },
      { time: 1, value: 94.2 },
    ],
    'finance.yahoo.com': yahoo,
  });
  const r = await resolveHistory('1d', f, { now: () => NOW });
  assert.equal(r.source?.id, 'yahoo-history');
  assert.ok(r.points.length >= 24);
  assert.match(r.attempts[0], /wise-history: no usable points/);
  assert.equal(f.calls.length, 2);
});

test('history falls back when a source is too sparse, too short or too old', async () => {
  // Sparse: only 5 points in 24 hours.
  assert.equal(validateHistory(hourly(4).map((p) => ({ t: p.time, v: p.value })), '1d', NOW).ok, false);
  // Short: dense but covers only the last 6 hours.
  const short = validateHistory(hourly(6 * 12).map((p, i) => ({ t: NOW - i * 5 * 60_000, v: p.value })), '1d', NOW);
  assert.equal(short.ok, false);
  // Old: ends 10 hours ago.
  const old = validateHistory(hourly(24, 10 * HOUR).map((p) => ({ t: p.time, v: p.value })), '1d', NOW);
  assert.equal(old.ok, false);
  // Out of range values are dropped, not charted.
  const bad = validateHistory(hourly(24).map((p, i) => ({ t: p.time, v: i === 3 ? 9000 : p.value })), '1d', NOW);
  assert.equal(bad.ok && bad.points.length, 24);

  const f = fakeFetcher({ 'wise.com/rates/history': hourly(4), 'finance.yahoo.com': new Error('HTTP 429'), 'frankfurter.dev': new Error('down') });
  const r = await resolveHistory('30d', f, { now: () => NOW });
  assert.equal(r.points.length, 0);
  assert.equal(r.source, null);
  assert.equal(r.attempts.length, 3);
});

test('mid rate: invalid or stale candidates do not count as success', async () => {
  const f = fakeFetcher({
    'wise.com/rates/live': { value: 'n/a', time: NOW },
    'finance.yahoo.com': { chart: { result: [{ meta: { regularMarketPrice: 94.31, regularMarketTime: (NOW - 5 * 60_000) / 1000 } }] } },
    'open.er-api.com': { result: 'success', rates: { INR: 94.28 }, time_last_update_unix: (NOW - 3 * HOUR) / 1000 },
    'frankfurter.dev': { date: '2026-11-13', rates: { INR: 94.25 } },
    jsdelivr: { date: '2026-11-13', usd: { inr: 94.21 } },
  });
  const r = await resolveMid(f, { now: () => NOW });
  assert.equal(r.mid?.sourceId, 'yahoo');
  assert.equal(r.mid?.freshness, 'fresh');
  assert.match(r.attempts[0], /wise-live: rate missing/);

  // Only daily sources answer: the result is usable but marked stale and not intraday.
  const daily = fakeFetcher({
    'open.er-api.com': { result: 'success', rates: { INR: 94.28 }, time_last_update_unix: (NOW - 3 * HOUR) / 1000 },
  });
  const d = await resolveMid(daily, { now: () => NOW });
  assert.equal(d.mid?.freshness, 'stale');
  assert.equal(d.mid?.intraday, false);

  // A source with a future or ancient timestamp is rejected.
  const weird = fakeFetcher({ 'wise.com/rates/live': { value: 94.2, time: NOW + 3 * HOUR }, jsdelivr: { date: '2020-01-01', usd: { inr: 75 } } });
  const w = await resolveMid(weird, { now: () => NOW });
  assert.equal(w.mid, null);
  assert.ok(w.attempts.some((a) => /future/.test(a)));
  assert.ok(w.attempts.some((a) => /too old/.test(a)));
});

test('regression: one hour of data never produces a 24 hour change or a movement alert', () => {
  // The old code reported +1.064% "in 24 hours" from this and fired a 0.5% alert.
  const pts = Array.from({ length: 13 }, (_, i) => ({ t: NOW - (12 - i) * 5 * 60_000, v: 93.2 + i * 0.0826 }));
  const c = changeOver(pts, { t: NOW, v: 94.19 }, 24 * HOUR, NOW);
  const pct = c.status === 'ok' ? c.pct : null;
  assert.equal(c.status, 'unavailable');
  const hits = evaluateRules([{ id: 'm', kind: 'move', value: 0.5 }], 94.19, pct);
  assert.deepEqual(hits, []);
});

test('sparse lookback: a baseline must sit near the 24 hour boundary', () => {
  const at = (hAgo: number, v: number) => ({ t: NOW - hAgo * HOUR, v });
  // Nearest point is 20 hours ago: outside the default 2.4 hour tolerance.
  assert.equal(changeOver([at(20, 94), at(1, 94.3)], 94.3, 24 * HOUR, NOW).status, 'unavailable');
  // 25 hours ago is close enough; the result reports the real period.
  const c = changeOver([at(25, 94), at(1, 94.3)], 94.47, 24 * HOUR, NOW);
  assert.equal(c.status, 'ok');
  if (c.status === 'ok') {
    assert.equal(c.periodMs, 25 * HOUR);
    assert.equal(c.requestedMs, 24 * HOUR);
  }
  // A current observation that is itself hours old is not "now".
  assert.equal(changeOver([at(30, 94)], { t: NOW - 6 * HOUR, v: 94.4 }, 24 * HOUR, NOW).status, 'unavailable');
});

test('history and mid source lists stay in priority order', () => {
  assert.deepEqual(MID_SOURCES.map((s) => s.id), ['wise-live', 'yahoo', 'open-er-api', 'frankfurter', 'jsdelivr']);
  assert.deepEqual(HISTORY_SOURCES.map((s) => s.id), ['wise-history', 'yahoo-history', 'frankfurter-history']);
});
