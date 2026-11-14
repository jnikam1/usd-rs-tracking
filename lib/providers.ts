// Research snapshot of US to India providers.
//
// Rates below are bank (ACH) funded quotes on a $1,000 send collected on 13 Nov 2026
// (SendMoneyCompare, 21 providers, plus ICICI's own rate page). They are used ONLY to
// estimate providers that the live comparison feed does not cover: we keep each
// provider's spread versus the snapshot mid market rate and apply it to today's live mid.
// Anything built from this file is labelled "Estimate" in the UI.

export const SNAPSHOT_DATE = '2026-11-13';
export const SNAPSHOT_MID = 94.2193; // Wise mid market quote in the same snapshot

export type ProviderKind = 'app' | 'bank';

export interface ProviderInfo {
  key: string;
  name: string;
  url: string;
  /** Normalised names/aliases (lowercase, letters and digits only) used to match live feed entries. */
  match: string[];
  kind: ProviderKind;
  /** Exchange rate offered on a $1,000 send in the 13 Nov 2026 snapshot. */
  snapshotRate: number;
  /** Fee in USD for a bank (ACH) funded transfer of `usd` dollars. */
  fee: (usd: number) => number;
  speed: string;
  payout: string;
  note: string;
}

// Wise fee points observed for ACH funded USD to INR: $1.58 on $400, $6.85 on $1,000, $27.99 on $5,000.
// Piecewise linear between them. Only used if Wise itself is missing from the live feed.
function wiseFeeEstimate(usd: number): number {
  if (usd <= 400) return 0.5 + usd * 0.0027;
  if (usd <= 1000) return 1.58 + ((usd - 400) / 600) * (6.85 - 1.58);
  if (usd <= 5000) return 6.85 + ((usd - 1000) / 4000) * (27.99 - 6.85);
  return usd * 0.0056;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    key: 'paysend', name: 'Paysend', url: 'https://paysend.com', match: ['paysend'], kind: 'app',
    snapshotRate: 94.0874, fee: () => 0, speed: 'Varies', payout: 'Bank',
    note: 'Top payer on $1,000 in the 13 Nov snapshot.',
  },
  {
    key: 'instarem', name: 'Instarem', url: 'https://www.instarem.com', match: ['instarem'], kind: 'app',
    snapshotRate: 94.0685, fee: () => 0, speed: '1 to 2 days', payout: 'Bank',
    note: 'Most frequent leader on USD to INR (64 of 91 days per SendMoneyCompare).',
  },
  {
    key: 'lemfi', name: 'LemFi', url: 'https://lemfi.com', match: ['lemfi'], kind: 'app',
    snapshotRate: 94.2475, fee: () => 1.99, speed: 'Varies', payout: 'Bank',
    note: 'Newer in the US corridor. Rate quoted slightly above mid, $1.99 fee. Small sample.',
  },
  {
    key: 'revolut', name: 'Revolut', url: 'https://www.revolut.com/en-US/', match: ['revolut'], kind: 'app',
    snapshotRate: 94.1156, fee: () => 1.5, speed: 'Varies', payout: 'Bank',
    note: 'Worth it only if you already bank with Revolut US.',
  },
  {
    key: 'xoom', name: 'Xoom (PayPal)', url: 'https://www.xoom.com', match: ['xoom', 'paypalxoom'], kind: 'app',
    snapshotRate: 93.9555, fee: () => 0, speed: 'Minutes for many banks', payout: 'Bank, UPI, cash',
    note: 'Fees rose 20 Apr 2026. Debit card funding averages 0.94%, credit card 4.56%.',
  },
  {
    key: 'remitly', name: 'Remitly', url: 'https://www.remitly.com', match: ['remitly'], kind: 'app',
    snapshotRate: 93.9366, fee: (usd) => (usd < 1000 ? 3.99 : 0), speed: 'Express: minutes', payout: 'Bank, UPI, cash',
    note: '$3.99 fee under $1,000, $0 at $1,000 and up. Tiered sending limits.',
  },
  {
    key: 'xe', name: 'Xe', url: 'https://www.xe.com/send-money/', match: ['xe', 'xemoneytransfer'], kind: 'app',
    snapshotRate: 93.9272, fee: () => 0, speed: '1 to 2 days', payout: 'Bank',
    note: 'Monito found Xe cheapest on 92% of 2024 US to India searches, excluding promos.',
  },
  {
    key: 'taptap', name: 'Taptap Send', url: 'https://www.taptapsend.com', match: ['taptapsend', 'taptap'], kind: 'app',
    snapshotRate: 94.0403, fee: () => 1.99, speed: 'Varies', payout: 'Bank',
    note: 'Low margin, $1.99 fee.',
  },
  {
    key: 'westernunion', name: 'Western Union', url: 'https://www.westernunion.com', match: ['westernunion', 'wu'], kind: 'app',
    snapshotRate: 93.7482, fee: () => 0, speed: 'Minutes for cash pickup', payout: 'Bank, cash',
    note: 'Best only when the recipient needs cash pickup.',
  },
  {
    key: 'worldremit', name: 'WorldRemit', url: 'https://www.worldremit.com', match: ['worldremit'], kind: 'app',
    snapshotRate: 93.6069, fee: () => 0, speed: 'Minutes to 1 day', payout: 'Bank, UPI, cash',
    note: 'Middle of the pack.',
  },
  {
    key: 'wise', name: 'Wise', url: 'https://wise.com/us/send-money/send-money-to-india', match: ['wise', 'transferwise'], kind: 'app',
    snapshotRate: SNAPSHOT_MID, fee: wiseFeeEstimate, speed: 'Often seconds', payout: 'Bank, UPI on eligible transfers',
    note: 'Converts at mid market and charges a visible fee. Predictable, high limits.',
  },
  {
    key: 'moneygram', name: 'MoneyGram', url: 'https://www.moneygram.com', match: ['moneygram'], kind: 'app',
    snapshotRate: 93.5598, fee: () => 0.99, speed: 'Minutes', payout: 'Bank, cash',
    note: '',
  },
  {
    key: 'ria', name: 'Ria', url: 'https://www.riamoneytransfer.com', match: ['ria', 'riamoneytransfer'], kind: 'app',
    snapshotRate: 93.541, fee: () => 7.99, speed: 'Varies', payout: 'Bank, cash',
    note: '$7.99 fee makes it one of the weaker specialists on $1,000.',
  },
  {
    key: 'aspora', name: 'Aspora', url: 'https://www.aspora.com', match: ['aspora', 'vance'], kind: 'app',
    snapshotRate: SNAPSHOT_MID, fee: () => 2.99, speed: 'Minutes to 24 hrs', payout: 'Bank',
    note: 'Claims the Google rate. First 3 transfers free, then $2.99. Some reviews report transfers stuck pending.',
  },
  {
    key: 'icici', name: 'ICICI Money2India', url: 'https://www.money2india.com/us', match: ['icici', 'icicibank', 'money2india'], kind: 'bank',
    snapshotRate: 93.83, fee: (usd) => (usd < 1000 ? 4 : 0), speed: 'Express within 4 hrs', payout: 'Any Indian bank, NRE',
    note: '$4 under $1,000, $0 above. Better slab rates at $10k and up.',
  },
  {
    key: 'hdfc', name: 'HDFC Bank', url: 'https://www.hdfcbank.com', match: ['hdfc', 'hdfcbank'], kind: 'bank',
    snapshotRate: 92.5612, fee: () => 0, speed: 'Varies', payout: 'Bank',
    note: 'About 1.8% below mid.',
  },
  {
    key: 'chase', name: 'Chase (wire)', url: 'https://www.chase.com', match: ['chase', 'jpmorganchase'], kind: 'bank',
    snapshotRate: 91.2893, fee: () => 5, speed: '1 to 5 days', payout: 'Bank',
    note: 'A typical US bank wire. Costs about 3% versus the apps.',
  },
];

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

export interface Promo {
  provider: string;
  url: string;
  headline: string;
  detail: string;
  /** Rate premium over mid market for promo estimates (fraction), if the promo is a rate. */
  ratePremium?: number;
  capUsd?: number;
  ends?: string;
  caution?: string;
}

export const PROMOS: Promo[] = [
  {
    provider: 'Remitly',
    url: 'https://www.remitly.com',
    headline: 'New customer rate above mid market',
    detail: 'About ₹94.67 per $1 with no fee on your first transfer, up to $6,000, when mid was ₹94.22.',
    ratePremium: 94.67 / SNAPSHOT_MID - 1,
    capUsd: 6000,
    ends: '2026-12-31',
  },
  {
    provider: 'Aspora',
    url: 'https://www.aspora.com',
    headline: 'First 3 transfers free',
    detail: 'Then $2.99 per transfer at a claimed Google rate.',
    caution: 'Newer in the US. Reviews mention transfers stuck pending, so start small.',
  },
  {
    provider: 'Wise',
    url: 'https://wise.com/us/send-money/send-money-to-india',
    headline: 'No fee on your first transfer up to $500',
    detail: 'Mid market rate, so the first $500 lands at the full rate.',
  },
  {
    provider: 'Western Union',
    url: 'https://www.westernunion.com',
    headline: '$0 fee on your first transfer',
    detail: 'The rate margin still applies (about 0.5% below mid in the snapshot).',
  },
];
