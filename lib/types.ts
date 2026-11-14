// Shared data model. Every number carries where it came from (origin) separately from how old it is (freshness).

export type Range = '1d' | '7d' | '30d' | '1y';
export const RANGES: Range[] = ['1d', '7d', '30d', '1y'];

export interface Point {
  t: number;
  v: number;
}

/** How current a number is, judged by source specific rules (see lib/config.ts). */
export type Freshness = 'fresh' | 'stale' | 'unavailable';

/**
 * Where a payout number comes from.
 * - provider-quote: the provider's own documented quote integration priced this exact transfer.
 * - comparison-estimate: a comparison service applied a provider's collected markup to the current mid rate.
 * - snapshot-model: our model built from the 13 Nov 2026 research snapshot and published fee schedules.
 * - demo: offline fixtures (MOCK_FX=1). Never used in production.
 */
export type QuoteOrigin = 'provider-quote' | 'comparison-estimate' | 'snapshot-model' | 'demo';

/**
 * How the sender pays. bank_account means "from a US bank account" when the source does not say
 * whether that is a push bank transfer or an ACH debit.
 */
export type FundingMethod = 'bank_transfer' | 'ach_debit' | 'bank_account' | 'debit_card' | 'credit_card' | 'unknown';
export type PayoutMethod = 'bank_deposit' | 'unknown';

/** quoted: priced for this transfer. published: from a published fee schedule. observed: seen in the research snapshot. */
export type FeeStatus = 'quoted' | 'published' | 'observed' | 'unknown';

export type AccessMode = 'documented-public' | 'authenticated' | 'unauthenticated-legacy' | 'research' | 'demo';

export interface QuoteContext {
  /** USD the sender pays in total. Every source we use takes fees out of this amount (fee inclusive). */
  sendAmount: number;
  feeIncluded: true;
  corridor: 'USD-INR';
  /** Countries as reported by the source. null means the source did not say. */
  sourceCountry: string | null;
  targetCountry: string | null;
  fundingMethod: FundingMethod;
  payoutMethod: PayoutMethod;
  sourceId: string;
  sourceLabel: string;
  sourceUrl?: string;
  access: AccessMode;
  /** When the provider's price or markup was observed. */
  collectedAt: string | null;
  /** When this server received the data. */
  retrievedAt: string;
  /** When the quote stops being valid, if the source says. */
  expiresAt: string | null;
  /** Date of the research snapshot behind a model. */
  modelDate: string | null;
  /** Until when the row counts as fresh, then as stale. Lets the browser downgrade rows as they age. */
  freshUntil: string | null;
  staleUntil: string | null;
}

export interface Delivery {
  label: string;
  /** What the claim is tied to, e.g. "Wise quote, bank transfer funding". */
  basis: string;
}

export interface QuoteRow {
  id: string;
  key: string;
  name: string;
  url?: string;
  logo?: string;
  kind: 'app' | 'bank';
  origin: QuoteOrigin;
  freshness: Freshness;
  /** Fee in USD, or null when unknown. Never defaulted to 0. */
  fee: number | null;
  feeStatus: FeeStatus;
  /** Exchange rate the provider applies, if known. */
  rate: number | null;
  /** INR the recipient gets. Kept exactly as returned when a validated source supplies it. */
  received: number;
  /** Total USD the sender pays (equals context.sendAmount because fees are inclusive). */
  totalUsd: number;
  /** received / totalUsd: rupees per dollar after every cost. */
  effectiveRate: number;
  /** Percent versus the mid market rate used for this payload (negative = fewer rupees than mid). */
  vsMidPct: number;
  /** Rupees short of a perfect mid market conversion with no fee. */
  shortfall: number;
  delivery: Delivery | null;
  context: QuoteContext;
  cautions: string[];
  note?: string;
  /** Provider's general speed claim, not tied to this number. Shown only in the detail drawer. */
  speedClaim?: string;
}

export interface RejectedQuote {
  name: string;
  sourceId: string;
  reason: string;
}

export interface SourceStatus {
  id: string;
  label: string;
  status: 'ok' | 'partial' | 'error' | 'disabled';
  access: AccessMode | null;
  detail: string;
  retrievedAt: string | null;
}

export interface FundingOption {
  method: FundingMethod;
  label: string;
  fee: number;
  received: number;
  effectiveRate: number;
  delivery: string | null;
  expiresAt: string | null;
}

export interface Summary {
  /** Highest payout among comparable current rows (provider quotes and comparison estimates). */
  bestId: string | null;
  bestBasis: string;
  baselineId: string | null;
  baselineLabel: string | null;
  saving: { inr: number; pct: number } | null;
  savingNote: string;
  /** A research model that pays more than the best current row. Never promoted to best. */
  modelAboveBestId: string | null;
}

export interface MidInfo {
  rate: number;
  source: string;
  sourceId: string;
  observedAt: string;
  retrievedAt: string;
  intraday: boolean;
  freshness: Freshness;
  /** Freshness windows so the browser can downgrade the rate as it ages. */
  freshUntil: string;
  staleUntil: string;
}

export interface QuotesPayload {
  amount: number;
  mid: MidInfo;
  rows: QuoteRow[];
  rejected: RejectedQuote[];
  sources: SourceStatus[];
  funding: FundingOption[] | null;
  summary: Summary;
  generatedAt: string;
  demo: boolean;
}

export type ChangeResult =
  | {
      status: 'ok';
      from: number;
      fromAt: number;
      to: number;
      toAt: number;
      abs: number;
      pct: number;
      /** Actual time between the two observations. */
      periodMs: number;
      requestedMs: number;
    }
  | { status: 'unavailable'; reason: string; requestedMs: number };

export interface YearStats {
  high: number;
  highAt: number;
  low: number;
  lowAt: number;
  percentile: number;
  firstAt: number;
  lastAt: number;
  source: string;
}

export interface RatesPayload {
  mid: MidInfo | null;
  change24h: ChangeResult;
  year: YearStats | null;
  generatedAt: string;
  errors: string[];
}

export interface HistoryPayload {
  range: Range;
  points: Point[];
  source: string | null;
  sourceId: string | null;
  firstAt: number | null;
  lastAt: number | null;
  retrievedAt: string | null;
  attempts: string[];
  error?: string;
}
