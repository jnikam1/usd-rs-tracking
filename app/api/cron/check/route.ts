import type { NextRequest } from 'next/server';
import { authorize, runAlertCheck } from '@/lib/alertsRunner';
import { ntfyTransport } from '@/lib/notify';
import { getQuotes } from '@/lib/quotes';
import { getRates } from '@/lib/rates';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Called hourly by the GitHub Action (mode=watch) and daily by Vercel Cron (mode=digest).
// Requires Authorization: Bearer <CRON_SECRET>; production fails closed without it.
// ?dry=1 evaluates everything but sends nothing.
export async function GET(req: NextRequest) {
  const auth = authorize(req.headers.get('authorization'), process.env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: { 'cache-control': 'no-store' } });

  const mode = req.nextUrl.searchParams.get('mode') === 'digest' ? 'digest' : 'watch';
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const { status, body } = await runAlertCheck(
    { mode, dry },
    {
      env: process.env,
      getRates: (signal) => getRates(signal),
      // The funding method breakdown is not needed for alerts, so skip Wise's own quote request.
      getQuotes: (amount, signal) => getQuotes(amount, { wiseQuote: false, signal }),
      transport: ntfyTransport,
      budgetMs: 24_000,
      appUrl: process.env.APP_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`,
    },
  );
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
