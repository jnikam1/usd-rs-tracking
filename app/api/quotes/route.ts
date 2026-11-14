import type { NextRequest } from 'next/server';
import { errMsg } from '@/lib/http';
import { getQuotes } from '@/lib/quotes';

export async function GET(req: NextRequest) {
  const raw = Number(req.nextUrl.searchParams.get('amount') ?? 1000);
  // Round to whole dollars and clamp so the cache stays small and nobody can hammer upstream with odd values.
  const amount = Math.min(100000, Math.max(10, Math.round(Number.isFinite(raw) ? raw : 1000)));
  try {
    const data = await getQuotes(amount);
    return Response.json(data, {
      headers: { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=900' },
    });
  } catch (e) {
    return Response.json({ amount, error: errMsg(e) }, { status: 503 });
  }
}
