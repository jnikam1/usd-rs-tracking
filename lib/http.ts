import 'server-only';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

export interface GetOptions {
  /** Seconds to keep the response in Next's data cache. 0 disables caching. */
  revalidate?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export async function getJson<T = unknown>(url: string, opts: GetOptions = {}): Promise<T> {
  const revalidate = opts.revalidate ?? 120;
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/json, text/plain, */*', ...opts.headers },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 7000),
    ...(revalidate > 0 ? { next: { revalidate } } : { cache: 'no-store' as const }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Non JSON reply from ${new URL(url).host}: ${text.slice(0, 80)}`);
  }
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.name === 'TimeoutError' ? 'timed out' : e.message;
  return String(e);
}
