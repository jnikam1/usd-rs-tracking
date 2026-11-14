'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inr, num, signedPct, timeAgo, usd } from '@/lib/format';
import type { QuotesPayload, RatesPayload } from '@/lib/types';
import AlertsPanel from './AlertsPanel';
import Leaderboard from './Leaderboard';
import Promos from './Promos';
import RateChart from './RateChart';

const PRESETS = [100, 500, 1000, 2500, 5000, 10000];
const AMOUNT_KEY = 'harpaisa.amount';

export default function Dashboard({
  initialRates,
  initialQuotes,
}: {
  initialRates: RatesPayload | null;
  initialQuotes: QuotesPayload | null;
}) {
  const [rates, setRates] = useState<RatesPayload | null>(initialRates);
  const [quotes, setQuotes] = useState<QuotesPayload | null>(initialQuotes);
  const [amount, setAmount] = useState<number>(initialQuotes?.amount ?? 1000);
  const [draft, setDraft] = useState<string>(String(initialQuotes?.amount ?? 1000));
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const reqId = useRef(0);
  const amountRef = useRef(amount);
  amountRef.current = amount;

  // Restore the last amount the user picked.
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(AMOUNT_KEY));
      if (saved >= 10 && saved <= 100000 && saved !== amount) {
        setAmount(saved);
        setDraft(String(saved));
      }
    } catch {
      /* storage blocked */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRates = useCallback(async () => {
    try {
      const r = await fetch('/api/rates');
      const d = (await r.json()) as RatesPayload;
      if (d.mid) setRates(d);
    } catch {
      /* keep last good value */
    }
  }, []);

  const loadQuotes = useCallback(async (amt: number) => {
    const id = ++reqId.current;
    setLoadingQuotes(true);
    try {
      const r = await fetch(`/api/quotes?amount=${amt}`);
      const d = await r.json();
      if (id !== reqId.current) return;
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setQuotes(d as QuotesPayload);
      setQuoteError(null);
    } catch (e) {
      if (id === reqId.current) setQuoteError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === reqId.current) setLoadingQuotes(false);
    }
  }, []);

  // Fetch quotes when the amount settles.
  useEffect(() => {
    if (quotes?.amount === amount) return;
    const t = setTimeout(() => loadQuotes(amount), 350);
    try {
      localStorage.setItem(AMOUNT_KEY, String(amount));
    } catch {
      /* ignore */
    }
    return () => clearTimeout(t);
  }, [amount, quotes?.amount, loadQuotes]);

  // Keep things fresh while the page is open.
  useEffect(() => {
    if (!initialRates?.mid) loadRates();
    // The server rendered page skips the funding method prices; fetch the full quote set once.
    if (initialQuotes && !initialQuotes.funding) loadQuotes(initialQuotes.amount);
    const r = setInterval(loadRates, 60_000);
    const q = setInterval(() => loadQuotes(amountRef.current), 5 * 60_000);
    const n = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(r);
      clearInterval(q);
      clearInterval(n);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function commitDraft(v: string) {
    setDraft(v);
    const n = Math.round(Number(v.replace(/[^0-9.]/g, '')));
    if (n >= 10 && n <= 100000) setAmount(n);
  }

  const mid = rates?.mid?.rate ?? quotes?.mid ?? null;
  const rows = quotes?.rows ?? [];
  const liveRows = rows.filter((r) => r.source === 'live');
  const pool = liveRows.length ? liveRows : rows;
  const best = pool[0];
  const bestEstimate = rows.find((r) => r.source === 'estimate');
  const estimateBeatsLive = best?.source === 'live' && bestEstimate && bestEstimate.received > best.received;
  const wise = pool.find((r) => r.key === 'wise');
  const bank = pool.find((r) => r.key === 'chase') ?? pool.filter((r) => r.kind === 'bank').at(-1);
  const worst = pool.at(-1);
  const stale = quotes && quotes.amount !== amount;

  const heroFigure = best ? inr(best.received) : '₹–';

  const compareLine = useMemo(() => {
    if (!best) return null;
    const parts: string[] = [];
    if (wise && wise.key !== best.key) parts.push(`Wise pays ${inr(wise.received)}`);
    if (bank && bank.key !== best.key) parts.push(`a ${bank.name.replace(' (wire)', '')} wire about ${inr(bank.received)}`);
    if (!parts.length) return null;
    const gap = worst ? best.received - worst.received : 0;
    return `${parts.join(', ')}. Choosing the app is worth ${inr(gap)} on this transfer.`;
  }, [best, wise, bank, worst]);

  return (
    <>
      <header className="masthead">
        <div className="wordmark">
          <strong>Har Paisa</strong>
          <span>USD to INR, every paisa counted</span>
        </div>
        {rates?.mid ? (
          <div className="ticker" aria-live="polite">
            <span>
              <span className="live-dot" aria-hidden="true" />
              Mid market <b>{inr(rates.mid.rate, 4)}</b>
            </span>
            {rates.change24h && (
              <span className={rates.change24h.pct >= 0 ? 'up' : 'down'}>
                {rates.change24h.pct >= 0 ? '▲' : '▼'} {signedPct(rates.change24h.pct)} in 24 hrs
              </span>
            )}
            <span>
              {rates.mid.source}, {timeAgo(rates.mid.time, now)}
            </span>
          </div>
        ) : (
          <div className="ticker">Live rate unavailable right now</div>
        )}
      </header>

      <section className="hero" aria-labelledby="hero-label">
        <p className="hero-line" id="hero-label">
          Send{' '}
          <label className="amount-field">
            <span aria-hidden="true">$</span>
            <span className="visually-hidden">Amount in US dollars</span>
            <input
              inputMode="numeric"
              value={draft}
              onChange={(e) => commitDraft(e.target.value)}
              onBlur={() => setDraft(String(amount))}
              aria-describedby="amount-help"
              style={{ width: `${Math.max(3, draft.length) + 0.4}ch` }}
            />
          </label>{' '}
          to India right now and the best {best?.source === 'estimate' ? 'estimated ' : ''}quote pays
        </p>
        <p className={`hero-figure${loadingQuotes || stale ? ' loading' : ''}`} aria-live="polite">
          {heroFigure}
        </p>
        {best && mid ? (
          <>
            <p className="hero-sub">
              with <strong>{best.name}</strong>. That is <strong>{inr(best.perUsd, 2)}</strong> for each dollar after every
              fee, against a mid market rate of {inr(mid, 2)}.
            </p>
            {compareLine && <p className="hero-note">{compareLine}</p>}
            {estimateBeatsLive && bestEstimate && (
              <p className="hero-note">
                Not in the live feed: {bestEstimate.name} may pay about {inr(bestEstimate.received)} based on its spread
                in the 13 Nov snapshot. Check its app before you send.
              </p>
            )}
          </>
        ) : (
          <p className="hero-sub">{quoteError ? `Quotes are unavailable: ${quoteError}` : 'Loading quotes…'}</p>
        )}
        <div className="chips" role="group" aria-label="Quick amounts" id="amount-help">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className="chip"
              aria-pressed={amount === p}
              onClick={() => {
                setAmount(p);
                setDraft(String(p));
              }}
            >
              {usd(p)}
            </button>
          ))}
        </div>
      </section>

      <div className="grid">
        <section className="area-board" aria-labelledby="board-title">
          <Leaderboard
            quotes={quotes}
            amount={amount}
            loading={loadingQuotes || Boolean(stale)}
            error={quoteError}
            now={now}
          />
        </section>

        <section className="area-chart" aria-labelledby="chart-title">
          <RateChart current={rates?.mid?.rate ?? null} year={rates?.year ?? null} />
        </section>

        <section className="area-promos" aria-labelledby="promos-title">
          <Promos amount={amount} estimate={quotes?.promoEstimate ?? null} />
        </section>

        <section className="area-alerts" aria-labelledby="alerts-title">
          <AlertsPanel mid={rates?.mid?.rate ?? null} change24h={rates?.change24h?.pct ?? null} />
        </section>
      </div>

      {mid && (
        <p className="visually-hidden">
          Mid market {num(mid, 4)} rupees per dollar.
        </p>
      )}
    </>
  );
}
