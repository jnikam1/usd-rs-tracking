import { getRates } from '@/lib/rates';

export async function GET() {
  const data = await getRates();
  return Response.json(data, {
    status: data.mid ? 200 : 503,
    headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' },
  });
}
