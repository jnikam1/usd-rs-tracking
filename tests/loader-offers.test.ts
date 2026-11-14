import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAmount } from '../lib/amount';
import { estimateRow, offerEstimate, offerStatus } from '../lib/compute';
import { OFFERS, PROVIDERS, SNAPSHOT_MID } from '../lib/providers';
import { QuoteLoader } from '../lib/quoteLoader';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('rapid amount changes: only the latest request is applied and earlier ones are aborted', async () => {
  const pending = new Map<number, ReturnType<typeof deferred<{ amount: number }>>>();
  const signals = new Map<number, AbortSignal>();
  const loader = new QuoteLoader<{ amount: number }>((amount, signal) => {
    const d = deferred<{ amount: number }>();
    pending.set(amount, d);
    signals.set(amount, signal);
    return d.promise;
  });
  const a = loader.load(1000);
  const b = loader.load(2500);
  const c = loader.load(5000);
  assert.equal(signals.get(1000)?.aborted, true);
  assert.equal(signals.get(2500)?.aborted, true);
  assert.equal(signals.get(5000)?.aborted, false);
  // Late responses arrive out of order.
  pending.get(5000)!.resolve({ amount: 5000 });
  pending.get(1000)!.resolve({ amount: 1000 });
  pending.get(2500)!.reject(new Error('aborted'));
  assert.deepEqual(await c, { status: 'ok', amount: 5000, data: { amount: 5000 } });
  assert.equal((await a).status, 'superseded');
  assert.equal((await b).status, 'superseded');
});

test('failed requests report an error and a retry can succeed', async () => {
  let fail = true;
  const loader = new QuoteLoader<{ amount: number }>(async (amount) => {
    if (fail) throw new Error('HTTP 503');
    return { amount };
  });
  const first = await loader.load(5000);
  assert.deepEqual(first, { status: 'error', amount: 5000, error: 'HTTP 503' });
  fail = false;
  assert.equal((await loader.load(5000)).status, 'ok');
});

test('a response for a different amount is never shown as this amount', async () => {
  const loader = new QuoteLoader<{ amount: number }>(async () => ({ amount: 1000 }));
  const r = await loader.load(5000);
  assert.equal(r.status, 'error');
});

test('amount input is validated with explicit messages', () => {
  assert.deepEqual(parseAmount('1,500'), { ok: true, value: 1500, rounded: false });
  assert.deepEqual(parseAmount('$1234.56'), { ok: true, value: 1235, rounded: true });
  assert.equal(parseAmount('12abc').ok, false);
  assert.equal(parseAmount('1e5').ok, false);
  assert.equal(parseAmount('-50').ok, false);
  assert.match((parseAmount('5') as { error: string }).error, /smallest/);
  assert.match((parseAmount('250000') as { error: string }).error, /largest/);
  assert.match((parseAmount('') as { error: string }).error, /Enter/);
});

const remitly = OFFERS.find((o) => o.id === 'remitly-welcome')!;
const wiseOffer = OFFERS.find((o) => o.id === 'wise-first-free')!;
const NOV = Date.parse('2026-11-14T12:00:00Z');

test('promo expiry uses a fixed clock and stays visible as expired', () => {
  assert.equal(offerStatus(remitly, NOV), 'active');
  assert.equal(offerStatus(remitly, Date.parse('2026-12-31T23:00:00-08:00')), 'active', 'last day is inclusive');
  assert.equal(offerStatus(remitly, Date.parse('2027-01-01T08:30:00Z')), 'expired');
  const e = offerEstimate(remitly, 1000, SNAPSHOT_MID, null, Date.parse('2027-01-02T00:00:00Z'));
  assert.deepEqual(e, { status: 'expired', endsOn: '2026-12-31' });
  assert.equal(offerStatus(wiseOffer, NOV), 'no-end-date');
});

test('promo cap: amounts above the cap use the regular rate, and need one', () => {
  const regular = estimateRow(PROVIDERS.find((p) => p.key === 'remitly')!, 10000, SNAPSHOT_MID, NOV);
  const e = offerEstimate(remitly, 10000, SNAPSHOT_MID, regular, NOV);
  assert.equal(e.status, 'ok');
  if (e.status === 'ok') {
    assert.equal(e.promoUsd, 6000);
    assert.equal(e.restUsd, 4000);
    assert.ok(Math.abs(e.received - (6000 * 94.67 + 4000 * regular.effectiveRate)) < 1);
    assert.ok(e.extraVsRegular! > 0);
  }
  const noRegular = offerEstimate(remitly, 10000, SNAPSHOT_MID, null, NOV);
  assert.equal(noRegular.status, 'not-modelled');
  // Under the cap, no regular figure is needed.
  assert.equal(offerEstimate(remitly, 2000, SNAPSHOT_MID, null, NOV).status, 'ok');
});

test('fee waiver applies only up to its cap and only with a known fee', () => {
  const wise = estimateRow(PROVIDERS.find((p) => p.key === 'wise')!, 400, SNAPSHOT_MID, NOV);
  const e = offerEstimate(wiseOffer, 400, SNAPSHOT_MID, wise, NOV);
  assert.equal(e.status, 'ok');
  if (e.status === 'ok') assert.ok(Math.abs(e.received - 400 * SNAPSHOT_MID) < 0.5);
  assert.equal(offerEstimate(wiseOffer, 1000, SNAPSHOT_MID, wise, NOV).status, 'not-applicable');
  const unknownFee = estimateRow(PROVIDERS.find((p) => p.key === 'wise')!, 300, SNAPSHOT_MID, NOV);
  assert.equal(unknownFee.fee, null);
  assert.equal(offerEstimate(wiseOffer, 300, SNAPSHOT_MID, unknownFee, NOV).status, 'not-modelled');
});
