import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseComparison, validateComparisonQuote } from '../lib/comparison';
import { estimateRow, isComparable, summarize, sortRows, currentFreshness } from '../lib/compute';
import { PROVIDERS, SNAPSHOT_MID } from '../lib/providers';
import { parseWiseQuote } from '../lib/wiseQuote';

const NOW = Date.parse('2026-11-14T03:00:00Z');
const MID = 94.2765;
const iso = (minsAgo: number) => new Date(NOW - minsAgo * 60_000).toISOString();

function quote(over: Record<string, unknown> = {}) {
  const fee = (over.fee as number | undefined) ?? 0;
  const rate = (over.rate as number | undefined) ?? 94.15;
  return {
    rate,
    fee,
    receivedAmount: Math.round((1000 - fee) * rate * 100) / 100,
    sendAmount: null,
    dateCollected: iso(30),
    sourceCountry: 'US',
    targetCountry: 'IN',
    ...over,
  };
}
const provider = (name: string, q: object | object[]) => ({ name, alias: name.toLowerCase(), type: 'moneyTransferProvider', quotes: Array.isArray(q) ? q : [q] });
const parse = (providers: object[]) =>
  parseComparison({ providers }, { amount: 1000, mid: MID, now: NOW, retrievedAt: iso(0), access: 'authenticated' });

test('regression: a GB to IN Paysend quote from 2020 is not accepted as a US to India quote', () => {
  const r = parse([provider('Paysend', quote({ sourceCountry: 'GB', targetCountry: 'IN', dateCollected: '2020-01-01T00:00:00Z' }))]);
  assert.equal(r.rows.length, 0);
  assert.equal(r.rejected.length, 1);
  assert.match(r.rejected[0].reason, /GB/);
});

test('wrong country quotes are rejected even when they are the only quote, never used as a fallback', () => {
  const r = parse([provider('State Bank of India', quote({ rate: 93.75, sourceCountry: 'IN', targetCountry: null }))]);
  assert.equal(r.rows.length, 0);
  assert.match(r.rejected[0].reason, /from IN/);
  const toUk = parse([provider('Remitly', quote({ targetCountry: 'GB' }))]);
  assert.equal(toUk.rows.length, 0);
});

test('a compatible quote is chosen over an incompatible one for the same provider', () => {
  const r = parse([provider('Remitly', [quote({ sourceCountry: 'GB', rate: 95 }), quote({ rate: 94.15 })])]);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].rate, 94.15);
  assert.equal(r.rows[0].context.sourceCountry, 'US');
});

test('stale observations are downgraded, too old ones rejected, using configurable limits', () => {
  const r = parse([
    provider('Remitly', quote({ dateCollected: iso(30) })),
    provider('Wells Fargo', quote({ rate: 91.32, dateCollected: iso(34 * 60) })),
    provider('Chase', quote({ rate: 91.3, fee: 5, dateCollected: iso(75 * 60) })),
  ]);
  const by = Object.fromEntries(r.rows.map((x) => [x.key, x]));
  assert.equal(by.remitly.freshness, 'fresh');
  assert.equal(by.wellsfargo.freshness, 'stale');
  assert.equal(by.chase, undefined);
  assert.match(r.rejected.find((x) => x.name === 'Chase')!.reason, /older than the 72 hr limit/);
  // A tighter rule rejects Wells Fargo too.
  const strict = parseComparison(
    { providers: [provider('Wells Fargo', quote({ rate: 91.32, dateCollected: iso(34 * 60) }))] },
    { amount: 1000, mid: MID, now: NOW, retrievedAt: iso(0), access: 'authenticated', env: { COMPARISON_MAX_AGE_HOURS: '24' } },
  );
  assert.equal(strict.rows.length, 0);
});

test('rows age in the browser: a fresh row becomes stale and then unavailable', () => {
  const row = parse([provider('Remitly', quote({ dateCollected: iso(30) }))]).rows[0];
  assert.equal(currentFreshness(row, NOW), 'fresh');
  assert.equal(currentFreshness(row, NOW + 7 * 3600_000), 'stale');
  assert.equal(currentFreshness(row, NOW + 80 * 3600_000), 'unavailable');
  assert.equal(isComparable(row, NOW + 80 * 3600_000), false);
});

test('missing or malformed timestamps are rejected', () => {
  for (const dateCollected of [undefined, null, '', 'yesterday', 12]) {
    const problem = validateComparisonQuote({ ...quote(), dateCollected } as Record<string, unknown>, 1000, MID, NOW);
    if (dateCollected === 12) assert.ok(problem, 'epoch 12 ms is far too old');
    else assert.match(problem ?? '', /no collection time/);
  }
  assert.match(validateComparisonQuote(quote({ dateCollected: iso(-60) }), 1000, MID, NOW) ?? '', /future/);
});

test('malformed amounts, rates, fees and totals are rejected', () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ rate: 'abc' }, /exchange rate/],
    [{ rate: NaN }, /exchange rate/],
    [{ rate: 60 }, /implausible/],
    [{ receivedAmount: -5 }, /recipient amount/],
    [{ receivedAmount: Infinity }, /recipient amount/],
    [{ fee: -1 }, /fee/],
    [{ fee: 500 }, /fee/],
    [{ fee: 10, receivedAmount: 94150 }, /does not match/],
    [{ sendAmount: 500 }, /different send amount/],
  ];
  for (const [over, re] of cases) assert.match(validateComparisonQuote(quote(over), 1000, MID, NOW) ?? 'accepted', re, JSON.stringify(over));
});

test('authoritative recipient amounts are preserved, fees are not deducted twice', () => {
  const r = parse([provider('WorldRemit', quote({ rate: 94.1088, fee: 2.99, receivedAmount: 93827.4 }))]);
  assert.equal(r.rows[0].received, 93827.4);
  assert.equal(r.rows[0].fee, 2.99);
  assert.equal(r.rows[0].totalUsd, 1000);
  assert.equal(r.rows[0].context.feeIncluded, true);
});

test('unknown fees stay unknown and are never ranked as $0', () => {
  const r = parse([provider('Remitly', quote({ fee: null }))]);
  assert.equal(r.rows[0].fee, null);
  assert.equal(r.rows[0].feeStatus, 'unknown');
  assert.equal(isComparable(r.rows[0], NOW), false);
  // Snapshot models only state fees we observed or a provider published.
  const xoom = PROVIDERS.find((p) => p.key === 'xoom')!;
  const at100 = estimateRow(xoom, 100, SNAPSHOT_MID, NOW);
  assert.equal(at100.fee, null);
  assert.equal(at100.feeStatus, 'unknown');
  assert.ok(at100.cautions.some((c) => /upper bound/.test(c)));
  assert.equal(estimateRow(xoom, 1000, SNAPSHOT_MID, NOW).feeStatus, 'observed');
  assert.equal(estimateRow(PROVIDERS.find((p) => p.key === 'remitly')!, 100, SNAPSHOT_MID, NOW).feeStatus, 'published');
});

test('delivery claims come only from the quote that carries them', () => {
  const r = parse([
    provider('Wise', quote({ rate: MID, fee: 6.85, receivedAmount: 93630.71, deliveryEstimation: { duration: { min: 'PT1S', max: 'PT1S' } } })),
    provider('Western Union', quote({ rate: 93.694 })),
  ]);
  const wu = r.rows.find((x) => x.key === 'westernunion')!;
  assert.equal(wu.delivery, null, 'no speed borrowed from the provider directory');
  assert.ok(wu.speedClaim, 'the general claim is kept separately for the drawer');
  assert.equal(r.rows.find((x) => x.key === 'wise')!.delivery?.label, 'Under 2 min');
});

test('card funded quotes are not ranked against bank funded rows', () => {
  const wise = parseWiseQuote(
    {
      rate: MID,
      sourceAmount: 1000,
      createdTime: iso(1),
      expirationTime: new Date(NOW + 29 * 60_000).toISOString(),
      paymentOptions: [
        { payIn: 'BANK_TRANSFER', payOut: 'BANK_TRANSFER', fee: { total: 11.26 }, targetAmount: 93214.95, estimatedDelivery: '2026-11-16T15:20:00Z' },
        { payIn: 'DEBIT', payOut: 'BANK_TRANSFER', fee: { total: 17.39 }, targetAmount: 92637.03, estimatedDelivery: iso(1) },
        { payIn: 'CREDIT', payOut: 'BANK_TRANSFER', fee: { total: 66.26 }, targetAmount: 88029.74, estimatedDelivery: iso(1) },
        { payIn: 'BALANCE', disabled: true, fee: { total: 4.76 }, targetAmount: 93827.74 },
      ],
    },
    { amount: 1000, mid: MID, now: NOW, retrievedAt: iso(0) },
  );
  assert.equal(wise.row?.origin, 'provider-quote');
  assert.equal(wise.row?.context.fundingMethod, 'bank_transfer');
  assert.equal(wise.row?.received, 93214.95);
  assert.deepEqual(wise.funding.map((f) => f.method), ['bank_transfer', 'debit_card', 'credit_card']);
  assert.equal(wise.funding.find((f) => f.method === 'debit_card')?.delivery, 'In seconds');
  // A credit card funded row, even with a bigger number, is excluded from the comparable pool.
  const card = { ...wise.row!, id: 'card', received: 99999, context: { ...wise.row!.context, fundingMethod: 'credit_card' as const } };
  const s = summarize([wise.row!, card], NOW);
  assert.equal(s.bestId, wise.row!.id);
});

test('a higher snapshot model is flagged, never promoted to best', () => {
  const live = parse([provider('Remitly', quote({ rate: 93.0 })), provider('Wells Fargo', quote({ rate: 91.32 }))]).rows;
  const model = estimateRow(PROVIDERS.find((p) => p.key === 'paysend')!, 1000, MID, NOW);
  const rows = sortRows([...live, model]);
  assert.equal(rows[0].origin, 'snapshot-model');
  const s = summarize(rows, NOW);
  assert.equal(s.bestId, 'comparison-estimate:remitly');
  assert.equal(s.modelAboveBestId, model.id);
  assert.equal(s.baselineId, 'comparison-estimate:wellsfargo');
  assert.equal(s.saving?.inr, Math.round(93000 - 91320));
});

test('no saving is claimed without a comparable baseline', () => {
  const s = summarize(parse([provider('Remitly', quote())]).rows, NOW);
  assert.equal(s.saving, null);
  assert.match(s.savingNote, /No comparable/);
});
