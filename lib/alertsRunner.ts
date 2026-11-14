// Server alert check. Pure apart from injected dependencies, so authentication, dry runs, dedupe and
// failed deliveries are tested with a mocked transport.
//
// Delivery guarantee: best effort. Before sending, the runner reads the last 12 hours of the ntfy topic and
// skips keys already sent. That read-then-send is not atomic, so two invocations at the same moment can both
// send. The GitHub workflow serialises its own runs (concurrency group) and the daily digest uses separate
// keys, which keeps duplicates rare, but exactly-once delivery is not claimed.

import { alertConfig } from './config';
import { ORIGIN_LABEL, ageLabel, evaluateRules, rulesFromEnv } from './compute';
import { inr, signedPct, usd } from './format';
import type { QuotesPayload, RatesPayload } from './types';
import { errMsg, safeEqual } from './util';

type Env = Record<string, string | undefined>;

export interface OutgoingMessage {
  key: string;
  title: string;
  message: string;
  emoji: string;
  priority: number;
  click?: string;
}

export interface NotifyTransport {
  recentKeys(topic: string, signal?: AbortSignal): Promise<Set<string>>;
  publish(topic: string, msg: OutgoingMessage, signal?: AbortSignal): Promise<{ ok: boolean; status?: number; error?: string }>;
}

export interface AlertDeps {
  env: Env;
  now?: () => number;
  getRates: (signal: AbortSignal) => Promise<RatesPayload>;
  getQuotes: (amount: number, signal: AbortSignal) => Promise<QuotesPayload>;
  transport: NotifyTransport;
  /** Total time for upstream data and delivery. Keep below the route's maxDuration. */
  budgetMs?: number;
  appUrl?: string;
}

export function authorize(authorization: string | null, env: Env): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const cfg = alertConfig(env);
  if (cfg.requireAuth && !cfg.secret) return { ok: false, status: 503, error: 'CRON_SECRET is not configured, so the alert check refuses to run.' };
  if (cfg.secret) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token || !safeEqual(token, cfg.secret)) return { ok: false, status: 401, error: 'Missing or wrong Authorization header.' };
  }
  return { ok: true };
}

export interface AlertCheckResult {
  mode: 'watch' | 'digest';
  dry: boolean;
  configured: boolean;
  mid: number | null;
  midFreshness: string | null;
  change24h: RatesPayload['change24h'] | null;
  rules: number;
  skippedReasons: string[];
  wouldSend: { key: string; title: string; message: string }[];
  sent: string[];
  skipped: string[];
  failed: { key: string; status?: number; error?: string }[];
  dedupe: string;
  durationMs: number;
  error?: string;
}

export async function runAlertCheck(
  input: { mode: 'watch' | 'digest'; dry: boolean },
  deps: AlertDeps,
): Promise<{ status: number; body: AlertCheckResult }> {
  const now = deps.now ?? Date.now;
  const start = now();
  const budget = deps.budgetMs ?? 24_000;
  const cfg = alertConfig(deps.env);
  const body: AlertCheckResult = {
    mode: input.mode,
    dry: input.dry,
    configured: Boolean(cfg.topic),
    mid: null,
    midFreshness: null,
    change24h: null,
    rules: 0,
    skippedReasons: [],
    wouldSend: [],
    sent: [],
    skipped: [],
    failed: [],
    dedupe: 'Best effort: keys sent in the last 12 hours are skipped. Concurrent runs can still duplicate.',
    durationMs: 0,
  };
  const done = (status: number) => ({ status, body: { ...body, durationMs: now() - start } });

  if (!input.dry && !cfg.topic) {
    body.error = 'NTFY_TOPIC is not configured, so there is nowhere to send alerts.';
    return done(503);
  }

  // Data phase gets most of the budget; delivery gets what is left (at least 4 seconds).
  const dataSignal = AbortSignal.timeout(Math.max(1000, budget - 6000));
  const [ratesR, quotesR] = await Promise.allSettled([deps.getRates(dataSignal), deps.getQuotes(cfg.amount, dataSignal)]);
  const rates = ratesR.status === 'fulfilled' ? ratesR.value : null;
  const quotes = quotesR.status === 'fulfilled' ? quotesR.value : null;
  if (!rates?.mid) {
    body.error = `No usable rate: ${ratesR.status === 'rejected' ? errMsg(ratesR.reason) : rates?.errors.join(' | ') || 'unknown'}`;
    return done(503);
  }
  const mid = rates.mid;
  body.mid = mid.rate;
  body.midFreshness = mid.freshness;
  body.change24h = rates.change24h;

  const rules = rulesFromEnv(deps.env);
  body.rules = rules.length;
  const fmt = (n: number) => inr(n, 2);

  // Best figure, always labelled with where it came from and how old it is.
  const t = now();
  const best = quotes?.rows.find((r) => r.id === quotes.summary.bestId) ?? null;
  const bestLine = best
    ? `Best for ${usd(cfg.amount)}: ${best.name}, about ${inr(best.received)} (${ORIGIN_LABEL[best.origin].toLowerCase()}, ${ageLabel(best.context.collectedAt, t)}). Confirm in the app before sending.`
    : quotesR.status === 'rejected'
      ? 'Provider figures unavailable right now.'
      : '';

  const out: OutgoingMessage[] = [];
  if (input.mode === 'watch') {
    if (mid.freshness !== 'fresh') {
      body.skippedReasons.push('The mid rate is stale, so threshold and movement alerts were skipped.');
    } else {
      const change = rates.change24h.status === 'ok' ? rates.change24h.pct : null;
      if (change === null && rules.some((r) => r.kind === 'move'))
        body.skippedReasons.push(`24 hour movement alert skipped: ${rates.change24h.status === 'unavailable' ? rates.change24h.reason : ''}`);
      for (const h of evaluateRules(rules, mid.rate, change, fmt)) {
        out.push({
          key: h.key,
          title: h.title,
          message: [h.message, bestLine].filter(Boolean).join('\n'),
          emoji: h.up ? 'chart_with_upwards_trend' : 'chart_with_downwards_trend',
          priority: 4,
          click: deps.appUrl,
        });
      }
    }
  } else {
    const day = new Date(t).toISOString().slice(0, 10);
    const ch = rates.change24h.status === 'ok' ? `${signedPct(rates.change24h.pct)} in 24 hrs` : '24 hr change unavailable';
    const yr = rates.year
      ? `It sits at the ${rates.year.percentile}th percentile of the past year (${fmt(rates.year.low)} to ${fmt(rates.year.high)}).`
      : '';
    out.push({
      key: `digest-${day}`,
      title: `USD/INR ${fmt(mid.rate)}, ${ch}${mid.freshness === 'fresh' ? '' : ' (stale rate)'}`,
      message: [bestLine, yr].filter(Boolean).join('\n'),
      emoji: 'sunrise',
      priority: 2,
      click: deps.appUrl,
    });
  }
  body.wouldSend = out.map(({ key, title, message }) => ({ key, title, message }));
  if (input.dry || out.length === 0) return done(200);

  const deliverySignal = AbortSignal.timeout(Math.max(4000, budget - (now() - start)));
  let already = new Set<string>();
  try {
    already = await deps.transport.recentKeys(cfg.topic as string, deliverySignal);
  } catch (e) {
    body.skippedReasons.push(`Could not read recent notifications (${errMsg(e)}); sending without dedupe.`);
  }
  for (const m of out) {
    if (already.has(m.key)) {
      body.skipped.push(m.key);
      continue;
    }
    const r = await deps.transport.publish(cfg.topic as string, m, deliverySignal);
    if (r.ok) body.sent.push(m.key);
    else body.failed.push({ key: m.key, status: r.status, error: r.error });
  }
  return done(body.failed.length ? 502 : 200);
}
