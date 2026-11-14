import type { NextRequest } from 'next/server';
import { evaluateRules, rulesFromEnv } from '@/lib/compute';
import { inr, signedPct, usd } from '@/lib/format';
import { errMsg } from '@/lib/http';
import { publish, recentKeys } from '@/lib/notify';
import { getQuotes } from '@/lib/quotes';
import { getRates } from '@/lib/rates';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Called hourly by the GitHub Action (mode=watch) and daily by Vercel Cron (mode=digest).
// Add ?dry=1 to see what would be sent without sending anything.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    const key = req.nextUrl.searchParams.get('key');
    if (auth !== `Bearer ${secret}` && key !== secret) return new Response('Unauthorized', { status: 401 });
  }

  const mode = req.nextUrl.searchParams.get('mode') === 'digest' ? 'digest' : 'watch';
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const topic = process.env.NTFY_TOPIC?.trim();
  const amount = Number(process.env.ALERT_AMOUNT) > 0 ? Number(process.env.ALERT_AMOUNT) : 1000;
  const appUrl = process.env.APP_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  try {
    const rates = await getRates();
    if (!rates.mid) throw new Error(`No live rate. ${rates.errors.join(' | ')}`);
    const mid = rates.mid.rate;
    const quotes = await getQuotes(amount).catch(() => null);
    const bestLive = quotes?.rows.find((r) => r.source === 'live') ?? quotes?.rows[0];
    const bestLine = bestLive
      ? `Best for ${usd(amount)}: ${bestLive.name}, ${inr(bestLive.received)} (${inr(bestLive.perUsd, 2)} per $1 after fees).`
      : '';

    const rules = rulesFromEnv(process.env);
    const hits = evaluateRules(rules, mid, rates.change24h?.pct ?? null, (n) => inr(n, 2));

    const outgoing = hits.map((h) => ({
      key: h.key,
      title: h.title,
      message: [h.message, bestLine].filter(Boolean).join('\n'),
      emoji: h.up ? 'chart_with_upwards_trend' : 'chart_with_downwards_trend',
      priority: 4,
    }));

    if (mode === 'digest') {
      const day = new Date().toISOString().slice(0, 10);
      const ch = rates.change24h ? `${signedPct(rates.change24h.pct)} in 24 hrs` : '';
      const yr = rates.year ? `It sits at the ${rates.year.percentile}th percentile of the past year (${inr(rates.year.low, 2)} to ${inr(rates.year.high, 2)}).` : '';
      outgoing.push({
        key: `digest-${day}`,
        title: `USD/INR ${inr(mid, 2)} ${ch}`.trim(),
        message: [bestLine, yr].filter(Boolean).join('\n'),
        emoji: 'sunrise',
        priority: 2,
      });
    }

    const sent: string[] = [];
    const skipped: string[] = [];
    const failed: string[] = [];
    if (topic && !dry && outgoing.length) {
      const already = await recentKeys(topic);
      for (const m of outgoing) {
        if (already.has(m.key)) {
          skipped.push(m.key);
          continue;
        }
        const r = await publish(topic, { ...m, click: appUrl });
        (r.ok ? sent : failed).push(r.ok ? m.key : `${m.key}: ${r.error}`);
      }
    }

    return Response.json(
      {
        mode,
        dry,
        topicConfigured: Boolean(topic),
        mid,
        change24h: rates.change24h,
        rules,
        wouldSend: outgoing.map((o) => ({ key: o.key, title: o.title, message: o.message })),
        sent,
        skipped,
        failed,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (e) {
    return Response.json({ mode, error: errMsg(e) }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
