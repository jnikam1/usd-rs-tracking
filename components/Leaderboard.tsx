'use client';

import { useState } from 'react';
import { inr, signedPct, timeAgo, usd } from '@/lib/format';
import type { QuoteRow, QuotesPayload } from '@/lib/types';

function Logo({ row }: { row: QuoteRow }) {
  const [broken, setBroken] = useState(false);
  const initials = row.name.replace(/\(.*\)/, '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2);
  return (
    <span className="logo" aria-hidden="true">
      {row.logo && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={row.logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        initials
      )}
    </span>
  );
}

function Row({ row, rank, best }: { row: QuoteRow; rank: number; best: boolean }) {
  return (
    <li className={`row${best ? ' best' : ''}`}>
      <span className="rank">{rank}</span>
      <Logo row={row} />
      <span className="name">
        {row.url ? (
          <a href={row.url} target="_blank" rel="noopener noreferrer">
            {row.name}
          </a>
        ) : (
          row.name
        )}
        {row.source === 'estimate' && <span className="badge">Estimate</span>}
        {row.kind === 'bank' && <span className="badge">Bank</span>}
      </span>
      <span className="got">{inr(row.received)}</span>
      <span className="meta">
        <span>
          Per $1 <b>{inr(row.perUsd, 2)}</b>
        </span>
        <span>
          Fee <b>{usd(row.fee)}</b>
        </span>
        <span>
          Vs mid <b>{signedPct(row.vsMidPct)}</b>
        </span>
        {row.delivery && (
          <span>
            Speed <b>{row.delivery}</b>
          </span>
        )}
      </span>
    </li>
  );
}

function MidRow({ value }: { value: number }) {
  return (
    <li className="row mid-ref" aria-label="Mid market reference">
      <span className="rank" />
      <span className="logo" aria-hidden="true">=</span>
      <span className="name">Mid market, no fee</span>
      <span className="got">{inr(value)}</span>
      <span className="meta">The benchmark banks trade at. Rows below it pay less.</span>
    </li>
  );
}

function RowWithMid({ row, rank, best, mid }: { row: QuoteRow; rank: number; best: boolean; mid: number | null }) {
  return (
    <>
      {mid !== null && <MidRow value={mid} />}
      <Row row={row} rank={rank} best={best} />
    </>
  );
}

export default function Leaderboard({
  quotes,
  amount,
  loading,
  error,
  now,
}: {
  quotes: QuotesPayload | null;
  amount: number;
  loading: boolean;
  error: string | null;
  now: number;
}) {
  const [showBanks, setShowBanks] = useState(true);
  const [showAllEst, setShowAllEst] = useState(false);
  const shownAmount = quotes?.amount ?? amount;

  const visible = (quotes?.rows ?? []).filter((r) => showBanks || r.kind !== 'bank');
  const hasLive = (quotes?.liveCount ?? 0) > 0;
  const main = visible.filter((r) => r.source === (hasLive ? 'live' : 'estimate'));
  const extra = hasLive ? visible.filter((r) => r.source === 'estimate') : [];
  const extraShown = showAllEst ? extra : extra.slice(0, 5);
  const mid = quotes?.mid;
  const midIndex = mid ? main.findIndex((r) => r.received < mid * shownAmount) : -1;

  const newestLive = (quotes?.rows ?? [])
    .filter((r) => r.source === 'live' && r.collectedAt)
    .map((r) => Date.parse(r.collectedAt!))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  return (
    <div aria-busy={loading} style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
      <div className="section-head">
        <h2 id="board-title">Who pays the most for {usd(shownAmount)}</h2>
      </div>
      <p className="section-sub">
        Ranked by rupees received after the fee and the exchange rate markup, paying from a US bank account.
        {hasLive && (
          <>
            {' '}
            Live quotes from Wise&rsquo;s comparison feed{newestLive ? `, newest ${timeAgo(newestLive, now)}` : ''}.
          </>
        )}
      </p>

      {quotes && !hasLive && (
        <p className="warn">
          The live comparison feed did not answer{quotes.liveError ? ` (${quotes.liveError})` : ''}, so these are estimates
          from the 13 Nov snapshot applied to today&rsquo;s rate. Confirm in the provider&rsquo;s app before sending.
        </p>
      )}
      {error && <p className="warn">Could not refresh quotes: {error}</p>}

      <div className="board-controls">
        <label>
          <input type="checkbox" checked={showBanks} onChange={(e) => setShowBanks(e.target.checked)} /> Include banks
        </label>
      </div>

      {main.length > 0 ? (
        <ol className="board">
          {main.map((r, i) => (
            <RowWithMid
              key={r.key}
              row={r}
              rank={i + 1}
              best={i === 0}
              mid={i === midIndex && mid ? mid * shownAmount : null}
            />
          ))}
        </ol>
      ) : (
        !loading && <p className="section-sub">No quotes to show.</p>
      )}

      {quotes?.funding && (
        <div className="funding">
          <h3>How you pay changes what arrives</h3>
          <p className="section-sub">Wise&rsquo;s live price for this same {usd(shownAmount)}, by funding method.</p>
          <ul>
            {quotes.funding.map((f) => (
              <li key={f.method}>
                <span>{f.method}</span>
                <span>
                  <b>{inr(f.received)}</b>
                  <small>{usd(f.fee)} fee</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {extra.length > 0 && (
        <div className="extra">
          <h3>Not in the live feed</h3>
          <p className="section-sub">
            Estimates: each app&rsquo;s spread on 13 Nov 2026 (SendMoneyCompare, ICICI) applied to today&rsquo;s rate with its
            published fees. Spreads move day to day, so check the app before you send.
          </p>
          <ol className="board">
            {extraShown.map((r, i) => (
              <Row key={r.key} row={r} rank={i + 1} best={false} />
            ))}
          </ol>
          {extra.length > 5 && (
            <button
              className="btn ghost show-all"
              type="button"
              onClick={() => setShowAllEst((x) => !x)}
              aria-expanded={showAllEst}
            >
              {showAllEst ? 'Show fewer' : `Show all ${extra.length}`}
            </button>
          )}
        </div>
      )}

      <p className="board-foot">First transfer promos are listed separately.</p>
    </div>
  );
}
