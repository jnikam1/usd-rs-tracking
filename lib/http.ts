import 'server-only';
import type { JsonFetcher } from './fx-core';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 HarPaisa/2';

export interface FetchOptions {
  /** Seconds to keep the response in Next's data cache. 0 disables caching. */
  revalidate?: number;
  timeoutMs?: number;
  /** Parent signal, e.g. the overall request budget. */
  signal?: AbortSignal;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
}

function combine(timeoutMs: number, parent?: AbortSignal): AbortSignal {
  const t = AbortSignal.timeout(timeoutMs);
  return parent ? AbortSignal.any([t, parent]) : t;
}

/**
 * Fetch JSON and report when the data was actually produced: cached responses keep their original
 * Date header, so retrievedAt stays honest even when Next serves from its data cache.
 */
export const fetchJson: JsonFetcher = async (url, opts: FetchOptions = {}) => {
  const revalidate = opts.revalidate ?? 120;
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    body: opts.body,
    headers: {
      'user-agent': UA,
      accept: 'application/json, text/plain, */*',
      ...(opts.body ? { 'content-type': 'application/json' } : {}),
      ...opts.headers,
    },
    signal: combine(opts.timeoutMs ?? 6000, opts.signal),
    ...(revalidate > 0 ? { cache: 'force-cache' as const, next: { revalidate } } : { cache: 'no-store' as const }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non JSON reply from ${new URL(url).host}`);
  }
  const date = Date.parse(res.headers.get('date') ?? '');
  return { data, retrievedAt: new Date(Number.isFinite(date) ? date : Date.now()).toISOString() };
};

export { errMsg } from './util';
