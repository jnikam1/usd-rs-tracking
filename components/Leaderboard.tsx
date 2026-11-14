'use client';

import { useState } from 'react';
import { inr, signedPct, timeAgo, usd } from '@/lib/format';
import { SNAPSHOT_DATE } from '@/lib/providers';
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
  const [showEstimates, setShowEstimates] = useState(true);
  const [showBanks, setShowBanks] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 10;

  const allRows = (quotes?.rows ?? []).filter(
    (r) => (showEstimates || r.source === 'live') && (showBanks || r.kind !== 'bank'),
  );
  const rows = expanded ? allRows : allRows.slice(0, LIMIT);
  const mid = quotes?.mid;
  const bestKey = rows.find((r) => r.source === 'live')?.key ?? rows[0]?.key;
  const newestLive = (quotes?.rows ?? [])
    .filter((r) => r.source === 'live' && r.collectedAt)
    .map((r) => Date.parse(r.collectedAt!))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  const midIndex = mid ? rows.findIndex((r) => r.received < mid * (quotes?.amount ?? amount)) : -1;

  return (
    <>
      <div className="section-head">
        <h2 id="board-title">Who pays the most for {usd(quotes?.amount ?? amount)}</h2>
      </div>
      <p className="section-sub">
        Ranked by rupees received after the fee and the exchange rate markup, funded from a US bank account.
        {quotes && quotes.liveCount > 0 && (
          <> Live quotes come from Wise&rsquo;s comparison feed{newestLive ? `, newest ${timeAgo(newestLive, now)}` : ''}.</>
        )}{' '}
        Estimates apply each provider&rsquo;s spread from the {new Date(SNAPSHOT_DATE).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' })} snapshot to today&rsquo;s rate.
      </p>

      {quotes && quotes.liveCount === 0 && (
        <p className="warn">
          The live comparison feed did not answer{quotes.liveError ? ` (${quotes.liveError})` : ''}, so every row below is an
          estimate. Confirm in the provider&rsquo;s app before sending.
        </p>
      )}
      {error && <p className="warn">Could not refresh quotes: {error}</p>}

      <div className="board-controls">
        <label>
          <input type="checkbox" checked={showEstimates} onChange={(e) => setShowEstimates(e.target.checked)} /> Show
          estimates
        </label>
        <label>
          <input type="checkbox" checked={showBanks} onChange={(e) => setShowBanks(e.target.checked)} /> Show banks
        </label>
      </div>

      <ol className="board" aria-busy={loading} style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
        {rows.map((r, i) => (
          <FragmentRow
            key={r.key}
            row={r}
            rank={i + 1}
            best={r.key === bestKey}
            midBefore={i === midIndex && mid !== undefined ? mid : null}
            amount={quotes?.amount ?? amount}
          />
        ))}
        {rows.length === 0 && !loading && <li className="row">No quotes to show.</li>}
      </ol>
      {allRows.length > LIMIT && (
        <button className="btn ghost show-all" type="button" onClick={() => setExpanded((x) => !x)} aria-expanded={expanded}>
          {expanded ? `Show top ${LIMIT}` : `Show all ${allRows.length}`}
        </button>
      )}
      <p className="board-foot">
        Debit or credit card funding costs more (Xoom averages 0.94% on debit and 4.56% on credit). First transfer promos are
        listed separately.
      </p>
    </>
  );
}

function FragmentRow({
  row,
  rank,
  best,
  midBefore,
  amount,
}: {
  row: QuoteRow;
  rank: number;
  best: boolean;
  midBefore: number | null;
  amount: number;
}) {
  return (
    <>
      {midBefore !== null && (
        <li className="row mid-ref" aria-label="Mid market reference">
          <span className="rank" />
          <span className="logo" aria-hidden="true">=</span>
          <span className="name">Mid market, no fee</span>
          <span className="got">{inr(midBefore * amount)}</span>
          <span className="meta">The benchmark rate banks trade at. Rows below it pay less.</span>
        </li>
      )}
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
          <span className={`badge ${row.source}`}>{row.source === 'live' ? 'Live' : 'Estimate'}</span>
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
    </>
  );
}
