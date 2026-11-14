'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { offerEstimate, offerStatus, regularRowFor } from '@/lib/compute';
import { usd } from '@/lib/format';
import { OFFERS } from '@/lib/providers';
import { QuoteLoader, httpQuoteFetcher } from '@/lib/quoteLoader';
import type { QuotesPayload, RatesPayload } from '@/lib/types';
import Alerts from './Alerts';
import Calculator from './Calculator';
import Header from './Header';
import MarketCard from './MarketCard';
import Offers from './Offers';
import ProviderDrawer from './ProviderDrawer';
import RateChart from './RateChart';
import Results from './Results';
import Saved from './Saved';
import SummaryCards from './SummaryCards';
import { localTime, useMounted } from './ui';

const AMOUNT_KEY = 'harpaisa.amount';
const NEW_KEY = 'harpaisa.newCustomer';
const REFRESH_MS = 2 * 60_000;
const OLD_MS = 10 * 60_000;

type QState =
  | { status: 'idle' }
  | { status: 'loading'; amount: number }
  | { status: 'error'; amount: number; error: string; at: number };

export default function Dashboard({
  initialRates,
  initialQuotes,
  serverNow,
  children,
}: {
  initialRates: RatesPayload | null;
  initialQuotes: QuotesPayload | null;
  serverNow: number;
  children?: React.ReactNode;
}) {
  const mounted = useMounted();
  // Start from the server's clock so the first render matches, then follow the real clock.
  const [now, setNow] = useState(serverNow);
  const [rates, setRates] = useState<RatesPayload | null>(initialRates);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<QuotesPayload | null>(initialQuotes);
  const [amount, setAmount] = useState<number>(initialQuotes?.amount ?? 1000);
  const [q, setQ] = useState<QState>({ status: 'idle' });
  const [newCustomer, setNewCustomer] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const loader = useRef<QuoteLoader<QuotesPayload> | null>(null);
  const amountRef = useRef(amount);
  amountRef.current = amount;

  const request = useCallback(async (amt: number) => {
    loader.current ??= new QuoteLoader(httpQuoteFetcher());
    setQ({ status: 'loading', amount: amt });
    const r = await loader.current.load(amt);
    if (r.status === 'superseded') return;
    if (r.status === 'ok') {
      setQuotes(r.data);
      setQ({ status: 'idle' });
    } else {
      setQ({ status: 'error', amount: amt, error: r.error, at: Date.now() });
    }
  }, []);

  const loadRates = useCallback(async () => {
    try {
      const res = await fetch('/api/rates');
      const d = (await res.json()) as RatesPayload;
      if (d.mid) {
        setRates(d);
        setRatesError(null);
      } else setRatesError(d.errors?.[0] ?? `HTTP ${res.status}`);
    } catch (e) {
      setRatesError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Restore preferences, start clocks and refresh loops.
  useEffect(() => {
    setNow(Date.now());
    try {
      const saved = Number(localStorage.getItem(AMOUNT_KEY));
      if (saved >= 10 && saved <= 100000) setAmount(Math.round(saved));
      setNewCustomer(localStorage.getItem(NEW_KEY) === '1');
    } catch {
      /* storage blocked */
    }
    if (!initialRates?.mid) loadRates();
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const r = setInterval(loadRates, 60_000);
    const qt = setInterval(() => request(amountRef.current), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(Date.now());
        loadRates();
        request(amountRef.current);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(tick);
      clearInterval(r);
      clearInterval(qt);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New amount: fetch it. Figures for a different amount are never shown as this amount.
  useEffect(() => {
    try {
      localStorage.setItem(AMOUNT_KEY, String(amount));
    } catch {
      /* ignore */
    }
    if (quotes?.amount !== amount) request(amount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  useEffect(() => {
    try {
      localStorage.setItem(NEW_KEY, newCustomer ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [newCustomer]);

  const current = quotes && quotes.amount === amount ? quotes : null;
  const openRow = current?.rows.find((r) => r.id === openId) ?? null;
  const ageMs = current ? now - Date.parse(current.generatedAt) : 0;

  const remitly = OFFERS.find((o) => o.id === 'remitly-welcome');
  const welcome =
    newCustomer && current && remitly
      ? {
          provider: remitly.provider,
          endsOn: remitly.endsOn,
          estimate:
            offerStatus(remitly, now) === 'expired'
              ? ({ status: 'expired', endsOn: remitly.endsOn as string } as const)
              : offerEstimate(remitly, current.amount, current.mid.rate, regularRowFor(current.rows, 'remitly', now), now),
        }
      : null;

  return (
    <>
      <Header mid={rates?.mid ?? current?.mid ?? null} now={now} />
      <main className="wrap">
        <section id="compare" aria-labelledby="page-title">
          <h1 className="page-title" id="page-title">
            Send dollars to India for the most rupees
          </h1>
          <p>
            Compare provider quotes and comparison estimates after every fee, see where each number comes from and how old it is, and
            get told when your rate target is reached.
          </p>
          <div className="compare">
            <div className="c-calc">
              <Calculator amount={amount} onAmount={setAmount} newCustomer={newCustomer} onNewCustomer={setNewCustomer} />
            </div>
            <div className="c-extra">
              <MarketCard rates={rates} ratesError={ratesError} now={now} mounted={mounted} funding={current?.funding ?? null} amount={current ? current.amount : null} />
              <Saved quotes={current} onRestore={setAmount} mounted={mounted} />
            </div>
            <div className="c-main">
              {!current && q.status === 'loading' && <div className="banner info">Getting quotes for {usd(amount)}…</div>}
              {!current && q.status === 'error' && (
                <div className="banner error" role="alert">
                  <span>
                    Could not get quotes for {usd(q.amount)}: {q.error}
                  </span>
                  <button className="btn secondary small" type="button" onClick={() => request(amount)}>
                    Retry
                  </button>
                </div>
              )}
              {current && q.status === 'error' && (
                <div className="banner warn" role="alert">
                  <span>
                    Refresh failed{mounted ? ` at ${localTime(q.at)}` : ''}: {q.error}. Showing figures from{' '}
                    {Math.max(1, Math.round(ageMs / 60_000))} min ago; rows lose their fresh status as they age.
                  </span>
                  <button className="btn secondary small" type="button" onClick={() => request(amount)}>
                    Retry
                  </button>
                </div>
              )}
              {current && q.status !== 'error' && ageMs > OLD_MS && (
                <div className="banner warn">
                  <span>These figures are {Math.round(ageMs / 60_000)} min old.</span>
                  <button className="btn secondary small" type="button" onClick={() => request(amount)} disabled={q.status === 'loading'}>
                    {q.status === 'loading' ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>
              )}
              {current && (
                <p className="small muted" style={{ marginBottom: 12 }}>
                  {current.demo ? 'Demo data. ' : ''}Figures for {usd(current.amount)}
                  {mounted ? `, generated ${localTime(current.generatedAt)}` : ''}.{' '}
                  <button className="btn ghost small" type="button" onClick={() => request(amount)} disabled={q.status === 'loading'} style={{ minHeight: 0, padding: 0 }}>
                    {q.status === 'loading' ? 'Refreshing…' : 'Refresh now'}
                  </button>
                </p>
              )}
              <SummaryCards quotes={current} amount={amount} now={now} onOpen={setOpenId} welcome={welcome} />
              {current ? (
                <Results key={current.amount} quotes={current} now={now} onOpen={setOpenId} />
              ) : (
                <div className="results" aria-busy={q.status === 'loading'}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="prow" style={{ marginBottom: 8 }}>
                      <div className="skeleton" style={{ height: 20, width: '50%' }} />
                      <div className="skeleton" style={{ height: 24, width: 110 }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="section" id="trends" aria-label="Trends">
          <RateChart mid={rates?.mid ?? null} year={rates?.year ?? null} now={now} mounted={mounted} />
        </section>

        <Offers quotes={current} amount={amount} now={now} newCustomer={newCustomer} onNewCustomer={setNewCustomer} />
        <Alerts rates={rates} now={now} />
        {children}
      </main>
      <ProviderDrawer row={openRow} quotes={current} now={now} mounted={mounted} onClose={() => setOpenId(null)} />
    </>
  );
}
