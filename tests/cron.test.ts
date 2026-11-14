import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authorize, runAlertCheck, type NotifyTransport, type OutgoingMessage } from '../lib/alertsRunner';
import { rowFromQuote, summarize } from '../lib/compute';
import type { MidInfo, QuotesPayload, RatesPayload } from '../lib/types';

const NOW = Date.parse('2026-11-14T03:00:00Z');
const DAY = 86400_000;

function mid(over: Partial<MidInfo> = {}): MidInfo {
  return {
    rate: 95.2,
    source: 'Test',
    sourceId: 'test',
    observedAt: new Date(NOW - 60_000).toISOString(),
    retrievedAt: new Date(NOW).toISOString(),
    intraday: true,
    freshness: 'fresh',
    freshUntil: new Date(NOW + 30 * 60_000).toISOString(),
    staleUntil: new Date(NOW + 72 * 3600_000).toISOString(),
    ...over,
  };
}
function rates(over: Partial<RatesPayload> = {}): RatesPayload {
  return {
    mid: mid(),
    change24h: { status: 'ok', from: 94.5, fromAt: NOW - DAY, to: 95.2, toAt: NOW, abs: 0.7, pct: 0.74, periodMs: DAY, requestedMs: DAY },
    year: null,
    generatedAt: new Date(NOW).toISOString(),
    errors: [],
    ...over,
  };
}
function quotes(): QuotesPayload {
  const row = rowFromQuote({
    key: 'remitly', name: 'Remitly', amount: 1000, mid: 95.2, fee: 0, rate: 95.0, kind: 'app', origin: 'comparison-estimate', now: NOW,
    context: { fundingMethod: 'bank_transfer', collectedAt: new Date(NOW - 30 * 60_000).toISOString(), freshUntil: new Date(NOW + DAY).toISOString(), staleUntil: new Date(NOW + 2 * DAY).toISOString() },
  });
  return { amount: 1000, mid: mid(), rows: [row], rejected: [], sources: [], funding: null, summary: summarize([row], NOW), generatedAt: '', demo: false };
}

class MockTransport implements NotifyTransport {
  sent: OutgoingMessage[] = [];
  history = new Set<string>();
  failWith: number | null = null;
  historyError = false;
  async recentKeys() {
    if (this.historyError) throw new Error('ntfy down');
    return new Set(this.history);
  }
  async publish(_topic: string, msg: OutgoingMessage) {
    if (this.failWith) return { ok: false, status: this.failWith, error: `ntfy HTTP ${this.failWith}` };
    this.sent.push(msg);
    this.history.add(msg.key);
    return { ok: true, status: 200 };
  }
}

const ENV = { NTFY_TOPIC: 'test-topic', CRON_SECRET: 's3cret', ALERT_ABOVE: '95', ALERT_MOVE_PCT: '0.5', NODE_ENV: 'production' };
const deps = (t: MockTransport, over: Partial<Parameters<typeof runAlertCheck>[1]> = {}) => ({
  env: ENV,
  now: () => NOW,
  getRates: async () => rates(),
  getQuotes: async () => quotes(),
  transport: t,
  ...over,
});

test('cron auth: production fails closed without a secret and rejects wrong or missing headers', () => {
  assert.deepEqual(authorize(null, { NODE_ENV: 'production' }).ok, false);
  assert.equal((authorize('Bearer x', { NODE_ENV: 'production' }) as { status: number }).status, 503);
  assert.equal((authorize(null, ENV) as { status: number }).status, 401);
  assert.equal((authorize('Bearer wrong', ENV) as { status: number }).status, 401);
  assert.equal((authorize('s3cret', ENV) as { status: number }).status, 401, 'secret must use the Bearer scheme');
  assert.equal(authorize('Bearer s3cret', ENV).ok, true);
  // Local development without a secret is allowed.
  assert.equal(authorize(null, { NODE_ENV: 'development' }).ok, true);
});

test('dry runs evaluate but never touch the transport', async () => {
  const t = new MockTransport();
  let read = false;
  t.recentKeys = async () => {
    read = true;
    return new Set();
  };
  const r = await runAlertCheck({ mode: 'watch', dry: true }, deps(t));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.wouldSend.map((m) => m.key).sort(), ['above-95', 'move-up']);
  assert.equal(t.sent.length, 0);
  assert.equal(read, false);
});

test('messages label estimated payouts with origin and age', async () => {
  const t = new MockTransport();
  const r = await runAlertCheck({ mode: 'watch', dry: false }, deps(t));
  assert.equal(r.status, 200);
  assert.match(t.sent[0].message, /comparison estimate, 30 min old/);
  assert.match(t.sent[0].message, /Confirm in the app/);
});

test('duplicate invocations do not resend keys already delivered', async () => {
  const t = new MockTransport();
  const first = await runAlertCheck({ mode: 'watch', dry: false }, deps(t));
  const second = await runAlertCheck({ mode: 'watch', dry: false }, deps(t));
  assert.equal(first.body.sent.length, 2);
  assert.equal(second.body.sent.length, 0);
  assert.deepEqual(second.body.skipped.sort(), ['above-95', 'move-up']);
  assert.equal(t.sent.length, 2);
});

test('failed delivery is reported with a non 2xx status', async () => {
  const t = new MockTransport();
  t.failWith = 429;
  const r = await runAlertCheck({ mode: 'watch', dry: false }, deps(t));
  assert.equal(r.status, 502);
  assert.equal(r.body.failed[0].status, 429);
  assert.equal(r.body.sent.length, 0);
});

test('missing topic fails closed for real runs but dry runs still work', async () => {
  const t = new MockTransport();
  const env = { ...ENV, NTFY_TOPIC: '' };
  assert.equal((await runAlertCheck({ mode: 'watch', dry: false }, deps(t, { env }))).status, 503);
  assert.equal((await runAlertCheck({ mode: 'watch', dry: true }, deps(t, { env }))).status, 200);
});

test('movement alerts are skipped when the 24 hour baseline is missing or the rate is stale', async () => {
  const t = new MockTransport();
  const noBaseline = await runAlertCheck(
    { mode: 'watch', dry: true },
    deps(t, { getRates: async () => rates({ change24h: { status: 'unavailable', reason: 'No observation from about 24 hours ago', requestedMs: DAY } }) }),
  );
  assert.deepEqual(noBaseline.body.wouldSend.map((m) => m.key), ['above-95']);
  assert.match(noBaseline.body.skippedReasons.join(' '), /24 hour movement alert skipped/);

  const stale = await runAlertCheck({ mode: 'watch', dry: true }, deps(t, { getRates: async () => rates({ mid: mid({ freshness: 'stale' }) }) }));
  assert.equal(stale.body.wouldSend.length, 0);
  assert.match(stale.body.skippedReasons.join(' '), /stale/);
});

test('digest sends one dated message and reports unavailable change honestly', async () => {
  const t = new MockTransport();
  const r = await runAlertCheck(
    { mode: 'digest', dry: false },
    deps(t, { getRates: async () => rates({ change24h: { status: 'unavailable', reason: 'x', requestedMs: DAY } }) }),
  );
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.sent, ['digest-2026-11-14']);
  assert.match(t.sent[0].title, /24 hr change unavailable/);
});

test('an unreachable ntfy history does not block sending, and it is reported', async () => {
  const t = new MockTransport();
  t.historyError = true;
  const r = await runAlertCheck({ mode: 'watch', dry: false }, deps(t));
  assert.equal(r.body.sent.length, 2);
  assert.match(r.body.skippedReasons.join(' '), /without dedupe/);
});

test('upstream work respects the budget', async () => {
  const t = new MockTransport();
  const started = Date.now();
  const slow = (signal: AbortSignal) =>
    new Promise<RatesPayload>((_, reject) => signal.addEventListener('abort', () => reject(new Error('timed out'))));
  // AbortSignal.timeout timers do not keep Node's event loop alive on their own.
  const keepAlive = setInterval(() => {}, 50);
  const r = await runAlertCheck({ mode: 'watch', dry: true }, { ...deps(t), now: Date.now, getRates: slow, budgetMs: 7000 });
  clearInterval(keepAlive);
  assert.equal(r.status, 503);
  assert.ok(Date.now() - started < 3000, 'gave up at the data deadline');
});
