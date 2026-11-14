import type { NextRequest } from 'next/server';
import { getHistory } from '@/lib/fx';
import { RANGES, type Range } from '@/lib/types';

export async function GET(req: NextRequest) {
  const r = req.nextUrl.searchParams.get('range') ?? '7d';
  if (!(RANGES as string[]).includes(r)) return Response.json({ error: `range must be one of ${RANGES.join(', ')}` }, { status: 400 });
  const data = await getHistory(r as Range, AbortSignal.timeout(15_000));
  return Response.json(data, {
    status: data.points.length ? 200 : 503,
    headers: data.points.length
      ? { 'cache-control': `public, s-maxage=${r === '1y' ? 3600 : 300}, stale-while-revalidate=600` }
      : { 'cache-control': 'no-store' },
  });
}
