export type Range = '1d' | '7d' | '30d' | '1y';
export const RANGES: Range[] = ['1d', '7d', '30d', '1y'];

export interface Point { t: number; v: number }

export interface MidQuote {
  rate: number;
  time: string;
  source: string;
  intraday: boolean;
}

export interface RatesPayload {
  mid: MidQuote | null;
  change24h: { from: number; pct: number; abs: number } | null;
  year: { high: number; highAt: number; low: number; lowAt: number; percentile: number; source: string } | null;
  generatedAt: string;
  errors: string[];
}

export type QuoteSource = 'live' | 'estimate';

export interface QuoteRow {
  key: string;
  name: string;
  url?: string;
  logo?: string;
  kind: 'app' | 'bank';
  source: QuoteSource;
  fee: number;
  rate: number;
  received: number;
  perUsd: number;
  /** Percent difference of the all-in rate versus mid market. Negative means you get less than mid. */
  vsMidPct: number;
  /** Rupees the recipient gets versus a perfect mid market conversion with no fee (positive = less). */
  shortfall: number;
  delivery?: string;
  collectedAt?: string;
  note?: string;
}

export interface QuotesPayload {
  amount: number;
  mid: number;
  midSource: string;
  rows: QuoteRow[];
  liveCount: number;
  liveSource: string | null;
  liveError: string | null;
  promoEstimate: { provider: string; received: number; perUsd: number; capUsd: number; ends?: string } | null;
  /** Wise's live price for the same transfer by funding method. */
  funding: FundingOption[] | null;
  generatedAt: string;
}

export interface FundingOption {
  method: string;
  fee: number;
  received: number;
  perUsd: number;
  delivery?: string;
}
