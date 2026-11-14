import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeOver, estimateRow, evaluateRules, promoEstimate, rowFromQuote, rulesFromEnv, sortRows, yearStats } from '../lib/compute';
import { deliveryLabel, inr, isoDurationSeconds } from '../lib/format';
import { PROVIDERS, SNAPSHOT_MID, findProvider } from '../lib/providers';

test('all-in rupees per dollar includes the fee', () => {
  const r = rowFromQuote({ key: 'x', name: 'X', amount: 1000, mid: 94.2193, fee: 6.85, rate: 94.2193, kind: 'app', source: 'live' });
  // (1000 - 6.85) * 94.2193 = 93,573.88  (matches the research snapshot's Wise ₹93,574)
  assert.equal(Math.round(r.received), 93574);
  assert.equal(r.perUsd, 93.5739);
  assert.ok(r.vsMidPct < -0.68 && r.vsMidPct > -0.69);
  assert.equal(r.shortfall, 645);
});

test('estimates reproduce the 13 Nov snapshot when mid is unchanged', () => {
  const paysend = PROVIDERS.find((p) => p.key === 'paysend')!;
  assert.equal(Math.round(estimateRow(paysend, 1000, SNAPSHOT_MID).received), 94087);
  const remitly = PROVIDERS.find((p) => p.key === 'remitly')!;
  // Under $1,000 Remitly charges $3.99
  const small = estimateRow(remitly, 500, SNAPSHOT_MID);
  assert.equal(small.fee, 3.99);
  assert.equal(Math.round(small.received), Math.round((500 - 3.99) * 93.9366));
  const chase = PROVIDERS.find((p) => p.key === 'chase')!;
  assert.equal(Math.round(estimateRow(chase, 1000, SNAPSHOT_MID).received), 90833);
});

test('estimates move with the live mid', () => {
  const instarem = PROVIDERS.find((p) => p.key === 'instarem')!;
  const a = estimateRow(instarem, 1000, 94.2193).received;
  const b = estimateRow(instarem, 1000, 95.2193).received;
  assert.ok(b > a);
  assert.ok(Math.abs(b / a - 95.2193 / 94.2193) < 1e-6);
});

test('sorting puts the most rupees first', () => {
  const rows = PROVIDERS.map((p) => estimateRow(p, 1000, SNAPSHOT_MID));
  const s = sortRows(rows);
  assert.equal(s[0].key, 'paysend');
  for (let i = 1; i < s.length; i++) assert.ok(s[i - 1].received >= s[i].received);
});

test('provider matching handles live feed names', () => {
  assert.equal(findProvider('Western Union', 'western-union')?.key, 'westernunion');
  assert.equal(findProvider('Xe', 'xe')?.key, 'xe');
  assert.equal(findProvider('PayPal Xoom', 'xoom')?.key, 'xoom');
  assert.equal(findProvider('Nexus Bank', 'nexus'), undefined);
  assert.equal(findProvider('Wise', 'wise')?.key, 'wise');
});

test('promo estimate caps at $6,000', () => {
  const p = promoEstimate(10000, SNAPSHOT_MID);
  if (!p) return; // promo expired
  const promoPart = 6000 * 94.67;
  assert.ok(Math.abs(p.received - (promoPart + 4000 * 93.9366)) < 5);
});

test('alert rules fire on state and move', () => {
  const rules = rulesFromEnv({ ALERT_ABOVE: '95', ALERT_BELOW: '93.5', ALERT_MOVE_PCT: '0.5' });
  assert.equal(rules.length, 3);
  assert.deepEqual(evaluateRules(rules, 94.2, 0.1).map((h) => h.key), []);
  assert.deepEqual(evaluateRules(rules, 95.1, 0.1).map((h) => h.key), ['above-95']);
  assert.deepEqual(evaluateRules(rules, 93.4, -0.7).map((h) => h.key), ['below-93.5', 'move-down']);
  assert.deepEqual(rulesFromEnv({}).map((r) => r.kind), ['move']);
});

test('history helpers', () => {
  const now = Date.now();
  const pts = [
    { t: now - 30 * 3600_000, v: 93 },
    { t: now - 23 * 3600_000, v: 94 },
    { t: now - 1 * 3600_000, v: 94.5 },
  ];
  const c = changeOver(pts, 94.47, 24 * 3600_000, now)!;
  assert.equal(c.from, 94);
  assert.ok(Math.abs(c.pct - 0.5) < 0.001);
  const y = yearStats(pts, 94.2)!;
  assert.equal(y.low, 93);
  assert.equal(y.high, 94.5);
  assert.equal(y.percentile, 67); // 2 of 3 points are at or below 94.2
});

test('formatting', () => {
  assert.equal(inr(470350), '₹4,70,350');
  assert.equal(isoDurationSeconds('PT20H8M16.305111S'), 20 * 3600 + 8 * 60 + 16.305111);
  assert.equal(isoDurationSeconds('P1DT2H'), 26 * 3600);
  assert.equal(deliveryLabel('PT30S', 'PT30S'), 'Under 2 min');
  assert.equal(deliveryLabel('PT24H', 'PT24H'), 'About 24 hrs');
});
