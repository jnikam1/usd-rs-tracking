import type { NextRequest } from 'next/server';
import { getHistory } from '@/lib/fx';
import { errMsg } from '@/lib/http';
import { RANGES, type Range } from '@/lib/types';

export async function GET(req: NextRequest) {
  const r = req.nextUrl.searchParams.get('range') ?? '7d';
  const range: Range = (RANGES as string[]).includes(r) ? (r as Range) : '7d';
  try {
    const data = await getHistory(range);
    return Response.json(
      { range, ...data },
      { headers: { 'cache-control': `public, s-maxage=${range === '1y' ? 3600 : 300}, stale-while-revalidate=900` } },
    );
  } catch (e) {
    return Response.json({ range, points: [], source: null, error: errMsg(e) }, { status: 503 });
  }
}
