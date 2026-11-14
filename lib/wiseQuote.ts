// Wise's unauthenticated quote. Documented by Wise for displaying example rates before a user has an
// account; it has no ID and cannot create a transfer. We use it as Wise's own price for this exact amount,
// broken down by how the sender pays. https://docs.wise.com/api-reference/quote

import { classify, freshnessRules } from './config';
import { rowFromQuote } from './compute';
import { findProvider } from './providers';
import type { FundingMethod, FundingOption, QuoteRow } from './types';
import { isFiniteNumber, parseTime, round, saneRate } from './util';

type Env = Record<string, string | undefined>;
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});

export const WISE_QUOTE_SOURCE_ID = 'wise-quote';
export const WISE_QUOTE_DOCS = 'https://docs.wise.com/api-reference/quote';

const METHODS: { method: FundingMethod; label: string; payIns: string[] }[] = [
  { method: 'bank_transfer', label: 'Bank transfer', payIns: ['BANK_TRANSFER'] },
  { method: 'ach_debit', label: 'ACH direct debit', payIns: ['DIRECT_DEBIT', 'ACH'] },
  { method: 'debit_card', label: 'Debit card', payIns: ['DEBIT', 'VISA_DEBIT_OR_PREPAID', 'MC_DEBIT_OR_PREPAID'] },
  { method: 'credit_card', label: 'Credit card', payIns: ['CREDIT', 'VISA_CREDIT', 'MC_CREDIT'] },
];

function deliveryText(iso: unknown, created: number): string | null {
  const t = parseTime(iso);
  if (t === null) return null;
  if (t - created <= 120_000) return 'In seconds';
  return `By ${new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })}`;
}

export interface WiseQuoteResult {
  row: QuoteRow | null;
  funding: FundingOption[];
  problem: string | null;
}

export function parseWiseQuote(
  data: unknown,
  o: { amount: number; mid: number; now: number; retrievedAt: string; env?: Env },
): WiseQuoteResult {
  const d = obj(data);
  const fail = (problem: string): WiseQuoteResult => ({ row: null, funding: [], problem });
  if (!saneRate(d.rate)) return fail('rate missing or out of range');
  if (!isFiniteNumber(d.sourceAmount) || Math.abs(d.sourceAmount - o.amount) > 0.01) return fail('quote is for a different amount');
  const created = parseTime(d.createdTime);
  if (created === null) return fail('no creation time');
  const expires = parseTime(d.expirationTime);
  const rule = freshnessRules(o.env).providerQuote;
  const age = o.now - created;
  if (classify(age, rule) === 'unavailable') return fail(created > o.now ? 'creation time is in the future' : 'quote is too old');
  const rate = d.rate as number;

  const options = (Array.isArray(d.paymentOptions) ? d.paymentOptions : []).map(obj).filter((p) => p.disabled !== true);
  const funding: FundingOption[] = [];
  for (const m of METHODS) {
    const p = m.payIns.map((code) => options.find((x) => x.payIn === code)).find(Boolean);
    if (!p) continue;
    if (p.payOut !== undefined && p.payOut !== 'BANK_TRANSFER') continue;
    const fee = obj(p.fee).total;
    const received = p.targetAmount;
    if (!isFiniteNumber(fee) || fee < 0 || fee >= o.amount) continue;
    if (!isFiniteNumber(received) || received <= 0) continue;
    if (Math.abs(received - (o.amount - fee) * rate) / received > 0.01) continue;
    funding.push({
      method: m.method,
      label: m.label,
      fee: round(fee, 2),
      received,
      effectiveRate: round(received / o.amount, 4),
      delivery: deliveryText(p.estimatedDelivery, created),
      expiresAt: expires === null ? null : new Date(expires).toISOString(),
    });
  }
  const bank = funding.find((f) => f.method === 'bank_transfer');
  if (!bank) return { row: null, funding, problem: 'no bank transfer price in the quote' };

  const info = findProvider('Wise', 'wise');
  const freshUntil = expires ?? created + rule.freshMs;
  const row = rowFromQuote({
    key: 'wise',
    name: 'Wise',
    amount: o.amount,
    mid: o.mid,
    fee: bank.fee,
    feeStatus: 'quoted',
    rate,
    received: bank.received,
    kind: 'app',
    origin: 'provider-quote',
    freshness: o.now <= freshUntil ? 'fresh' : 'stale',
    url: info?.url,
    logo: 'https://wise.com/public-resources/assets/logos/wise-personal/logo.svg',
    delivery: bank.delivery ? { label: bank.delivery, basis: 'Wise quote for this bank transfer' } : null,
    note: info?.note,
    speedClaim: info?.speedClaim,
    now: o.now,
    cautions: [
      'Wise documents unauthenticated quotes as illustrative pricing. The final price is set when you create the transfer.',
      'Priced for a push bank transfer. Wise’s public quote does not include ACH direct debit, which can cost less.',
    ],
    context: {
      sourceCountry: null,
      targetCountry: null,
      fundingMethod: 'bank_transfer',
      payoutMethod: 'bank_deposit',
      sourceId: WISE_QUOTE_SOURCE_ID,
      sourceLabel: 'Wise quote',
      sourceUrl: WISE_QUOTE_DOCS,
      access: 'documented-public',
      collectedAt: new Date(created).toISOString(),
      retrievedAt: o.retrievedAt,
      expiresAt: expires === null ? null : new Date(expires).toISOString(),
      modelDate: null,
      freshUntil: new Date(freshUntil).toISOString(),
      staleUntil: new Date(created + rule.maxMs).toISOString(),
    },
  });
  return { row, funding, problem: null };
}
