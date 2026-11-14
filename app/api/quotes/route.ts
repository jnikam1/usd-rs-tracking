import type { NextRequest } from 'next/server';
import { parseAmount } from '@/lib/amount';
import { getQuotes } from '@/lib/quotes';
import { errMsg } from '@/lib/util';

export async function GET(req: NextRequest) {
  const parsed = parseAmount(req.nextUrl.searchParams.get('amount') ?? '1000');
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  try {
    const data = await getQuotes(parsed.value, { signal: AbortSignal.timeout(15_000) });
    return Response.json(data, { headers: { 'cache-control': 'public, s-maxage=120, stale-while-revalidate=180' } });
  } catch (e) {
    return Response.json({ amount: parsed.value, error: errMsg(e) }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
