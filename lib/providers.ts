// Provider directory and the 13 Nov 2026 research snapshot.
//
// Snapshot rates are bank funded quotes on a $1,000 send collected on 13 Nov 2026 (SendMoneyCompare,
// 21 providers) plus ICICI's own rate page. They feed the "snapshot model": each provider's spread versus
// the snapshot mid is carried onto today's mid. That is an assumption, not an observation, and it is
// always labelled as a model in the interface. Fees are only stated where we observed or a provider
// published them; everywhere else the fee is unknown.

import type { FeeStatus } from './types';

export const SNAPSHOT_DATE = '2026-11-13';
export const SNAPSHOT_MID = 94.2193; // Wise mid market in the same snapshot
export const SNAPSHOT_SOURCE = {
  id: 'snapshot-2026-11-13',
  label: 'Research snapshot, 13 Nov 2026',
  detail: 'SendMoneyCompare bank funded quotes on $1,000 (21 providers) and ICICI Money2India rate page, 13 Nov 2026',
  url: 'https://sendmoneycompare.com/guides/send-money-to-india-from-usa-guide',
};

export type ProviderKind = 'app' | 'bank';

export interface FeeSchedule {
  /** Fees seen in the research for specific amount ranges (inclusive). */
  observed?: { min: number; max: number; fee: number }[];
  /** A fee rule the provider publishes for all amounts. Takes priority when present. */
  published?: (usd: number) => number;
  publishedNote?: string;
}

export interface ProviderInfo {
  key: string;
  name: string;
  url: string;
  match: string[];
  kind: ProviderKind;
  /** Rate on a $1,000 bank funded send in the snapshot. NaN when we have no snapshot for the provider. */
  snapshotRate: number;
  fees: FeeSchedule;
  /** The provider's general speed claim. Not tied to any specific quote. */
  speedClaim?: string;
  payout: string;
  note: string;
  cautions?: string[];
  /** Known only from live comparison data: never modelled. */
  liveOnly?: boolean;
}

const at1000 = (fee: number) => ({ observed: [{ min: 1000, max: 1000, fee }] });

export const PROVIDERS: ProviderInfo[] = [
  {
    key: 'paysend', name: 'Paysend', url: 'https://paysend.com', match: ['paysend'], kind: 'app',
    snapshotRate: 94.0874, fees: at1000(0), payout: 'Bank deposit',
    note: 'Top payer on $1,000 in the 13 Nov snapshot.',
  },
  {
    key: 'instarem', name: 'Instarem', url: 'https://www.instarem.com', match: ['instarem'], kind: 'app',
    snapshotRate: 94.0685, fees: { observed: [{ min: 200, max: 1000, fee: 0 }] }, speedClaim: '1 to 2 days', payout: 'Bank deposit',
    note: 'Spread swings widely: 0.16% below mid on 13 Nov, median 0.74% over 91 days (SendMoneyCompare).',
  },
  {
    key: 'lemfi', name: 'LemFi', url: 'https://lemfi.com', match: ['lemfi'], kind: 'app',
    snapshotRate: 94.2475, fees: at1000(1.99), payout: 'Bank deposit',
    note: 'Newer in the US corridor; small sample.',
  },
  {
    key: 'revolut', name: 'Revolut', url: 'https://www.revolut.com/en-US/', match: ['revolut'], kind: 'app',
    snapshotRate: 94.1156, fees: { observed: [{ min: 400, max: 400, fee: 0.75 }, { min: 1000, max: 1000, fee: 1.5 }] }, payout: 'Bank deposit',
    note: 'Requires a Revolut US account.',
  },
  {
    key: 'xoom', name: 'Xoom (PayPal)', url: 'https://www.xoom.com', match: ['xoom', 'paypalxoom'], kind: 'app',
    snapshotRate: 93.9555, fees: at1000(0), speedClaim: 'Minutes for many banks', payout: 'Bank deposit, UPI, cash',
    note: 'Fees changed 20 Apr 2026: debit card funding averages 0.94%, credit card 4.56%.',
  },
  {
    key: 'remitly', name: 'Remitly', url: 'https://www.remitly.com', match: ['remitly'], kind: 'app',
    snapshotRate: 93.9366,
    fees: { published: (usd) => (usd < 1000 ? 3.99 : 0), publishedNote: '$3.99 under $1,000, $0 from $1,000 (bank funded)' },
    speedClaim: 'Express: minutes', payout: 'Bank deposit, UPI, cash',
    note: 'Sending limits depend on verification tier.',
  },
  {
    key: 'xe', name: 'Xe', url: 'https://www.xe.com/send-money/', match: ['xe', 'xemoneytransfer'], kind: 'app',
    snapshotRate: 93.9272, fees: at1000(0), speedClaim: '1 to 2 days', payout: 'Bank deposit',
    note: 'Monito found Xe cheapest on most 2024 US to India searches, excluding promos.',
  },
  {
    key: 'taptap', name: 'Taptap Send', url: 'https://www.taptapsend.com', match: ['taptapsend', 'taptap'], kind: 'app',
    snapshotRate: 94.0403, fees: at1000(1.99), payout: 'Bank deposit',
    note: '',
  },
  {
    key: 'westernunion', name: 'Western Union', url: 'https://www.westernunion.com', match: ['westernunion', 'wu'], kind: 'app',
    snapshotRate: 93.7482, fees: at1000(0), speedClaim: 'Minutes for cash pickup', payout: 'Bank deposit, cash',
    note: 'Strongest for cash pickup.',
  },
  {
    key: 'worldremit', name: 'WorldRemit', url: 'https://www.worldremit.com', match: ['worldremit'], kind: 'app',
    snapshotRate: 93.6069, fees: at1000(0), speedClaim: 'Minutes to 1 day', payout: 'Bank deposit, UPI, cash',
    note: '',
  },
  {
    key: 'wise', name: 'Wise', url: 'https://wise.com/us/send-money/send-money-to-india', match: ['wise', 'transferwise'], kind: 'app',
    snapshotRate: SNAPSHOT_MID,
    fees: { observed: [{ min: 400, max: 400, fee: 1.58 }, { min: 1000, max: 1000, fee: 6.85 }, { min: 5000, max: 5000, fee: 27.99 }] },
    speedClaim: 'Often seconds', payout: 'Bank deposit',
    note: 'Converts at mid market and charges a visible fee that depends on how you pay.',
  },
  {
    key: 'moneygram', name: 'MoneyGram', url: 'https://www.moneygram.com', match: ['moneygram'], kind: 'app',
    snapshotRate: 93.5598, fees: at1000(0.99), speedClaim: 'Minutes', payout: 'Bank deposit, cash',
    note: '',
  },
  {
    key: 'ria', name: 'Ria', url: 'https://www.riamoneytransfer.com', match: ['ria', 'riamoneytransfer'], kind: 'app',
    snapshotRate: 93.541, fees: at1000(7.99), payout: 'Bank deposit, cash',
    note: '',
  },
  {
    key: 'aspora', name: 'Aspora', url: 'https://www.aspora.com', match: ['aspora', 'vance'], kind: 'app',
    snapshotRate: SNAPSHOT_MID,
    fees: { published: () => 2.99, publishedNote: '$2.99 per transfer after the first 3 free transfers' },
    speedClaim: 'Minutes to 24 hours', payout: 'Bank deposit',
    note: 'Claims to use the Google rate; the rate is the provider’s claim, not an observation.',
    cautions: ['App Store and Trustpilot reviews report transfers stuck pending for days. Start with a small amount.'],
  },
  {
    key: 'icici', name: 'ICICI Money2India', url: 'https://www.money2india.com/us', match: ['icici', 'icicibank', 'money2india'], kind: 'bank',
    snapshotRate: 93.83,
    fees: { published: (usd) => (usd < 1000 ? 4 : 0), publishedNote: '$4 under $1,000, $0 from $1,000' },
    speedClaim: 'Express within 4 hours', payout: 'Any Indian bank, NRE',
    note: 'Better slab rates from $10,000 that this model does not capture.',
  },
  {
    key: 'hdfc', name: 'HDFC Bank', url: 'https://www.hdfcbank.com', match: ['hdfc', 'hdfcbank'], kind: 'bank',
    snapshotRate: 92.5612, fees: at1000(0), payout: 'Bank deposit',
    note: '',
  },
  {
    key: 'chase', name: 'Chase', url: 'https://www.chase.com', match: ['chase', 'chaseus', 'jpmorganchase'], kind: 'bank',
    snapshotRate: 91.2893, fees: at1000(5), speedClaim: '1 to 5 days', payout: 'Bank deposit',
    note: 'A US bank wire.',
  },
  {
    key: 'sbi', name: 'State Bank of India', url: 'https://www.onlinesbi.sbi', match: ['statebankofindia', 'sbi'], kind: 'bank',
    snapshotRate: NaN, fees: {}, payout: 'Bank deposit', liveOnly: true, note: '',
  },
  {
    key: 'wellsfargo', name: 'Wells Fargo', url: 'https://www.wellsfargo.com', match: ['wellsfargo'], kind: 'bank',
    snapshotRate: NaN, fees: {}, payout: 'Bank deposit', liveOnly: true, note: 'A US bank wire.',
  },
  {
    key: 'ofx', name: 'OFX', url: 'https://www.ofx.com/en-us/', match: ['ofx'], kind: 'app',
    snapshotRate: NaN, fees: {}, payout: 'Bank deposit', liveOnly: true, note: 'Aimed at larger transfers.',
  },
];

/** Fee for a modelled transfer, or null when neither observed nor published for this amount. */
export function snapshotFee(p: ProviderInfo, usd: number): { fee: number | null; status: FeeStatus; note: string } {
  if (p.fees.published) return { fee: p.fees.published(usd), status: 'published', note: p.fees.publishedNote ?? 'Published fee' };
  const o = p.fees.observed?.find((r) => usd >= r.min && usd <= r.max);
  if (o) {
    const where = o.min === o.max ? `$${o.min.toLocaleString('en-US')}` : `$${o.min.toLocaleString('en-US')} to $${o.max.toLocaleString('en-US')}`;
    return { fee: o.fee, status: 'observed', note: `Observed on ${where} in the 13 Nov snapshot` };
  }
  return { fee: null, status: 'unknown', note: 'No observed or published fee for this amount' };
}

export function normaliseName(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function findProvider(name: string, alias?: string): ProviderInfo | undefined {
  const n = normaliseName(name);
  const a = normaliseName(alias);
  return PROVIDERS.find((p) =>
    p.match.some((m) => {
      if (m.length <= 3) return n === m || a === m;
      return n === m || a === m || n.startsWith(m) || a.startsWith(m);
    }),
  );
}

// ---------- welcome offers ----------

export type OfferModel =
  | { type: 'rate-premium'; premium: number; basis: string }
  | { type: 'fee-waiver'; basis: string };

export interface Offer {
  id: string;
  provider: string;
  providerKey: string;
  url: string;
  headline: string;
  terms: string;
  /** When the research saw the offer. */
  observedOn: string;
  /** Last day the offer is valid (inclusive, Pacific time), or null when no end date was published. */
  endsOn: string | null;
  capUsd: number | null;
  model?: OfferModel;
  limitations: string[];
}

export const OFFERS: Offer[] = [
  {
    id: 'remitly-welcome',
    provider: 'Remitly',
    providerKey: 'remitly',
    url: 'https://www.remitly.com',
    headline: 'Welcome rate above mid market on the first transfer',
    terms: 'New customers, first transfer, no fee, up to $6,000.',
    observedOn: SNAPSHOT_DATE,
    endsOn: '2026-12-31',
    capUsd: 6000,
    model: {
      type: 'rate-premium',
      premium: 94.67 / SNAPSHOT_MID - 1,
      basis:
        'On 13 Nov 2026 the welcome rate was about ₹94.67 while Wise’s mid was ₹94.22 (+0.48%). We carry that premium onto today’s mid. Remitly sets the actual welcome rate, and it can differ.',
    },
    limitations: [
      'First transfer for new customers only.',
      'Sources reported different caps on different dates ($2,999, $6,000 and $10,000).',
      'Amounts above the cap convert at the regular rate.',
    ],
  },
  {
    id: 'wise-first-free',
    provider: 'Wise',
    providerKey: 'wise',
    url: 'https://wise.com/us/send-money/send-money-to-india',
    headline: 'No fee on the first transfer up to $500',
    terms: 'New customers, first transfer.',
    observedOn: SNAPSHOT_DATE,
    endsOn: null,
    capUsd: 500,
    model: { type: 'fee-waiver', basis: 'Removes the fee from Wise’s current bank transfer quote for amounts up to $500.' },
    limitations: ['First transfer only.', 'No published end date; check before relying on it.'],
  },
  {
    id: 'aspora-three-free',
    provider: 'Aspora',
    providerKey: 'aspora',
    url: 'https://www.aspora.com',
    headline: 'First 3 transfers free',
    terms: 'Then $2.99 per transfer at a claimed Google rate.',
    observedOn: SNAPSHOT_DATE,
    endsOn: null,
    capUsd: null,
    limitations: ['Rate is the provider’s claim; we have no observed quote.', 'Reviews report transfers stuck pending. Start small.'],
  },
  {
    id: 'wu-first-free',
    provider: 'Western Union',
    providerKey: 'westernunion',
    url: 'https://www.westernunion.com',
    headline: '$0 fee on the first transfer',
    terms: 'The exchange rate margin still applies.',
    observedOn: SNAPSHOT_DATE,
    endsOn: null,
    capUsd: null,
    limitations: ['Bank funded transfers often have no fee anyway, so the saving may be zero.'],
  },
];
