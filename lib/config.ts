// Configuration and freshness rules. Pure: takes an env object so tests can pass their own.
import type { AccessMode, Freshness } from './types';

type Env = Record<string, string | undefined>;

const HOUR = 3600_000;
const MIN = 60_000;
const DAY = 24 * HOUR;

export const AMOUNT_MIN = 10;
export const AMOUNT_MAX = 100_000;

export interface FreshnessRule {
  /** Observations younger than this are fresh. */
  freshMs: number;
  /** Observations older than this are unavailable (rejected or hidden). Between the two they are stale. */
  maxMs: number;
}

function num(env: Env, key: string, fallback: number): number {
  const v = Number(env[key]);
  return env[key] !== undefined && env[key] !== '' && Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Source specific freshness rules. All are configurable through environment variables:
 *
 * | Source                    | Fresh up to                   | Accepted (stale) up to          |
 * |---------------------------|-------------------------------|---------------------------------|
 * | Mid market rate           | MID_FRESH_MINUTES (30)        | MID_MAX_AGE_HOURS (72)          |
 * | Wise comparison estimates | COMPARISON_FRESH_HOURS (6)    | COMPARISON_MAX_AGE_HOURS (72)   |
 * | Wise provider quote       | until its expirationTime      | PROVIDER_QUOTE_MAX_AGE_HOURS (6)|
 * | Research snapshot models  | never fresh                   | SNAPSHOT_MAX_AGE_DAYS (45)      |
 *
 * Wise documents that comparison data is collected about once an hour, so 6 hours is generous for "fresh".
 */
export function freshnessRules(env: Env = {}) {
  return {
    mid: { freshMs: num(env, 'MID_FRESH_MINUTES', 30) * MIN, maxMs: num(env, 'MID_MAX_AGE_HOURS', 72) * HOUR },
    comparison: {
      freshMs: num(env, 'COMPARISON_FRESH_HOURS', 6) * HOUR,
      maxMs: num(env, 'COMPARISON_MAX_AGE_HOURS', 72) * HOUR,
    },
    providerQuote: { freshMs: 30 * MIN, maxMs: num(env, 'PROVIDER_QUOTE_MAX_AGE_HOURS', 6) * HOUR },
    snapshot: { freshMs: 0, maxMs: num(env, 'SNAPSHOT_MAX_AGE_DAYS', 45) * DAY },
  } satisfies Record<string, FreshnessRule>;
}

/** Allowed clock skew for timestamps slightly in the future. */
export const FUTURE_SKEW_MS = 5 * MIN;

export function classify(ageMs: number, rule: FreshnessRule): Freshness {
  if (!Number.isFinite(ageMs) || ageMs < -FUTURE_SKEW_MS) return 'unavailable';
  if (ageMs <= rule.freshMs) return 'fresh';
  if (ageMs <= rule.maxMs) return 'stale';
  return 'unavailable';
}

export function freshnessAt(freshUntil: string | null, staleUntil: string | null, now: number): Freshness {
  const f = freshUntil ? Date.parse(freshUntil) : NaN;
  const s = staleUntil ? Date.parse(staleUntil) : NaN;
  if (Number.isFinite(f) && now <= f) return 'fresh';
  if (Number.isFinite(s) && now <= s) return 'stale';
  return 'unavailable';
}

export interface ComparisonAccess {
  enabled: boolean;
  access: AccessMode | null;
  token: string | null;
  reason: string;
}

/**
 * Wise documents the Comparison API as requiring authentication (UserToken, PersonalToken or
 * ClientCredentialsToken). Use WISE_API_TOKEN for the supported integration. The endpoint also answers
 * without a token today, but that is undocumented, so it is opt-in only (WISE_COMPARISON_PUBLIC=1) and labelled.
 * The token never leaves the server.
 */
export function comparisonAccess(env: Env = {}): ComparisonAccess {
  const token = env.WISE_API_TOKEN?.trim() || null;
  if (token) return { enabled: true, access: 'authenticated', token, reason: 'Wise API token configured' };
  if (env.WISE_COMPARISON_PUBLIC === '1')
    return {
      enabled: true,
      access: 'unauthenticated-legacy',
      token: null,
      reason: 'Unauthenticated access enabled by WISE_COMPARISON_PUBLIC=1. Wise documents this API as requiring a token.',
    };
  return {
    enabled: false,
    access: null,
    token: null,
    reason: 'Not configured. Set WISE_API_TOKEN, or WISE_COMPARISON_PUBLIC=1 to opt in to unauthenticated access.',
  };
}

export function wiseApi(env: Env = {}) {
  const base = (env.WISE_API_BASE || 'https://api.wise.com').replace(/\/$/, '');
  const version = env.WISE_API_VERSION || '2026Q4';
  return { base, version };
}

/** Cron and alert settings. Thresholds stay on the server; only booleans reach the browser. */
export function alertConfig(env: Env = {}) {
  const amount = Number(env.ALERT_AMOUNT);
  return {
    topic: env.NTFY_TOPIC?.trim() || null,
    secret: env.CRON_SECRET?.trim() || null,
    amount: Number.isFinite(amount) && amount >= AMOUNT_MIN && amount <= AMOUNT_MAX ? Math.round(amount) : 1000,
    /** Production (or any `next build` output) must authenticate cron calls. */
    requireAuth: env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production' || Boolean(env.CRON_SECRET?.trim()),
  };
}

/** Published schedule, mirrored in vercel.json and .github/workflows/rate-alerts.yml. */
export const ALERT_SCHEDULE = {
  watch: 'Hourly at minute 17 (GitHub Actions)',
  digest: 'Daily at 16:05 UTC (Vercel Cron)',
};
