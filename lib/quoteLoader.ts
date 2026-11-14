// Browser side request controller for quotes. Each new amount cancels the previous request, and any
// response that arrives after a newer request started is ignored, so a late $1,000 answer can never be
// shown as the $5,000 result. Pure apart from the injected fetcher, so it is unit tested.
import type { QuotesPayload } from './types';
import { errMsg } from './util';

export type LoadResult<T> =
  | { status: 'ok'; amount: number; data: T }
  | { status: 'error'; amount: number; error: string }
  | { status: 'superseded'; amount: number };

export class QuoteLoader<T extends { amount: number }> {
  private seq = 0;
  private controller: AbortController | null = null;

  constructor(private readonly fetcher: (amount: number, signal: AbortSignal) => Promise<T>) {}

  async load(amount: number): Promise<LoadResult<T>> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const id = ++this.seq;
    try {
      const data = await this.fetcher(amount, controller.signal);
      if (id !== this.seq) return { status: 'superseded', amount };
      if (data.amount !== amount) return { status: 'error', amount, error: 'The server answered for a different amount.' };
      return { status: 'ok', amount, data };
    } catch (e) {
      if (id !== this.seq || controller.signal.aborted) return { status: 'superseded', amount };
      return { status: 'error', amount, error: errMsg(e) };
    }
  }

  cancel() {
    this.seq++;
    this.controller?.abort();
    this.controller = null;
  }
}

export function httpQuoteFetcher(base = ''): (amount: number, signal: AbortSignal) => Promise<QuotesPayload> {
  return async (amount, signal) => {
    const res = await fetch(`${base}/api/quotes?amount=${amount}`, { signal });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* fall through */
    }
    if (!res.ok) {
      const msg = body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : `HTTP ${res.status}`;
      throw new Error(res.status === 429 ? 'Rate limited by the server. Try again in a minute.' : msg);
    }
    return body as QuotesPayload;
  };
}
