'use client';

import { useMemo, useState } from 'react';
import { ORIGIN_LABEL, ageLabel, currentFreshness, sortRows, type SortKey } from '@/lib/compute';
import { inr, usd } from '@/lib/format';
import type { QuoteOrigin, QuoteRow, QuotesPayload } from '@/lib/types';
import { FreshBadge, Logo, OriginBadge } from './ui';

const CURRENT: QuoteOrigin[] = ['provider-quote', 'comparison-estimate', 'demo'];

function feeText(r: QuoteRow) {
  if (r.fee === null) return 'Unknown';
  return usd(r.fee, 2);
}

function Row({ r, rank, best, now, onOpen }: { r: QuoteRow; rank: number | null; best: boolean; now: number; onOpen: (id: string) => void }) {
  const fresh = currentFreshness(r, now);
  return (
    <li className={`prow${best ? ' best' : ''}${r.origin === 'snapshot-model' ? ' model' : ''}`}>
      <div className="who">
        <span className="rank" aria-label={rank ? `Rank ${rank}` : undefined}>
          {rank ?? ''}
        </span>
        <Logo name={r.name} logo={r.logo} />
        <div style={{ minWidth: 0 }}>
          <div className="name">
            {r.name}
            {best && <span className="sr-only"> (best available)</span>}
          </div>
          <div className="tags">
            <OriginBadge origin={r.origin} />
            <FreshBadge freshness={fresh} age={ageLabel(r.context.collectedAt, now)} />
            {r.kind === 'bank' && <span className="badge b-bank no-dot">Bank</span>}
          </div>
          <div className="small muted desk-only" style={{ marginTop: 4 }}>
            {r.delivery ? `Delivery: ${r.delivery.label}` : 'Delivery: not stated'}
          </div>
        </div>
      </div>
      <div className="gets">
        <div className="amt serif-num">
          {r.fee === null ? 'up to ' : ''}
          {inr(r.received)}
        </div>
        <div className="lbl">Recipient gets</div>
      </div>
      <div className="facts">
        <span>
          <span className="lbl-m">Effective rate</span>
          <b>{inr(r.effectiveRate, 2)}</b>
        </span>
        <span>
          <span className="lbl-m">Fee</span>
          <b>{feeText(r)}</b>
        </span>
        <span>
          <span className="lbl-m">Quoted rate</span>
          <b>{r.rate === null ? 'Unknown' : r.rate.toFixed(2)}</b>
        </span>
        <span>
          <span className="lbl-m">You pay</span>
          <b>{usd(r.totalUsd)}</b>
        </span>
        <span className="delivery">
          <span className="lbl-m">Delivery</span>
          <b>{r.delivery?.label ?? 'Not stated'}</b>
        </span>
      </div>
      <div className="actions">
        <button className="btn secondary small" type="button" onClick={() => onOpen(r.id)} aria-label={`Details for ${r.name}`}>
          Details
        </button>
      </div>
    </li>
  );
}

export default function Results({
  quotes,
  now,
  onOpen,
}: {
  quotes: QuotesPayload;
  now: number;
  onOpen: (id: string) => void;
}) {
  const [sort, setSort] = useState<SortKey>('received');
  const [banks, setBanks] = useState(true);
  const [hidden, setHidden] = useState<Set<QuoteOrigin>>(new Set());
  const [allModels, setAllModels] = useState(false);

  const present = useMemo(() => [...new Set(quotes.rows.map((r) => r.origin))], [quotes.rows]);
  const visible = quotes.rows.filter((r) => (banks || r.kind !== 'bank') && !hidden.has(r.origin));
  const outOfDate = visible.filter((r) => currentFreshness(r, now) === 'unavailable');
  const usable = visible.filter((r) => currentFreshness(r, now) !== 'unavailable');
  const current = sortRows(usable.filter((r) => CURRENT.includes(r.origin)), sort);
  const models = sortRows(usable.filter((r) => r.origin === 'snapshot-model'), sort);
  const shownModels = allModels ? models : models.slice(0, 5);
  const bestId = quotes.summary.bestId;

  function toggleOrigin(o: QuoteOrigin) {
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(o)) n.delete(o);
      else n.add(o);
      return n;
    });
  }

  return (
    <section className="results" aria-labelledby="results-title">
      <div className="section-head" style={{ marginBottom: 6 }}>
        <h2 id="results-title">Providers for {usd(quotes.amount)}</h2>
      </div>
      <p className="section-lead small" style={{ marginBottom: 12 }}>
        Every row assumes a total of {usd(quotes.amount)} paid from a US bank account, with fees taken out of that amount, and a
        bank deposit in India. Comparison estimates apply each provider&rsquo;s collected markup to the current mid rate.
      </p>

      <div className="toolbar" role="group" aria-label="Sort and filter">
        <label className="sr-only" htmlFor="sort">
          Sort providers
        </label>
        <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="received">Sort: recipient gets most</option>
          <option value="fee">Sort: lowest fee</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={banks} onChange={(e) => setBanks(e.target.checked)} /> Include banks
        </label>
        {present.length > 1 &&
          present.map((o) => (
            <button key={o} type="button" className="filter-chip" aria-pressed={!hidden.has(o)} onClick={() => toggleOrigin(o)}>
              {ORIGIN_LABEL[o]}
            </button>
          ))}
      </div>

      {current.length > 0 && (
        <>
          <div className="group-title">
            <h3>Quotes and comparison estimates</h3>
            <span className="small muted">Ranked {sort === 'fee' ? 'by fee' : 'by recipient amount'}</span>
          </div>
          <div className="list-head" aria-hidden="true">
            <span>Provider</span>
            <span>Recipient gets</span>
            <span>Effective rate</span>
            <span>Fee</span>
            <span>Quoted rate</span>
            <span>You pay</span>
            <span />
          </div>
          <ol className="rows">
            {current.map((r, i) => (
              <Row key={r.id} r={r} rank={i + 1} best={r.id === bestId} now={now} onOpen={onOpen} />
            ))}
          </ol>
        </>
      )}
      {current.length === 0 && !hidden.has('comparison-estimate') && (
        <p className="banner warn" style={{ marginTop: 16 }}>
          No current quotes or comparison estimates for this amount. The research models below are not offers; confirm in each app.
        </p>
      )}

      {models.length > 0 && (
        <>
          <div className="group-title">
            <h3>Research models, 13 Nov 2026 snapshot</h3>
            <span className="small muted">Not quotes. Never ranked as best.</span>
          </div>
          <p className="row-note" style={{ marginTop: 0, marginBottom: 8 }}>
            Each provider&rsquo;s spread from the snapshot carried onto today&rsquo;s mid rate. Fees appear only where they were observed or
            published for this amount; otherwise the payout is an upper bound.
          </p>
          <ol className="rows">
            {shownModels.map((r) => (
              <Row key={r.id} r={r} rank={null} best={false} now={now} onOpen={onOpen} />
            ))}
          </ol>
          {models.length > 5 && (
            <button className="btn ghost" type="button" onClick={() => setAllModels((x) => !x)} aria-expanded={allModels} style={{ marginTop: 8 }}>
              {allModels ? 'Show fewer models' : `Show all ${models.length} models`}
            </button>
          )}
        </>
      )}

      {outOfDate.length > 0 && (
        <p className="row-note">
          {outOfDate.length} {outOfDate.length === 1 ? 'row is' : 'rows are'} hidden because the data has passed its freshness limit.
          Refresh to check again.
        </p>
      )}

      <details className="disclosure">
        <summary>
          Data sources and excluded quotes ({quotes.sources.length} sources, {quotes.rejected.length} excluded)
        </summary>
        <ul>
          {quotes.sources.map((s) => (
            <li key={s.id}>
              <strong>{s.label}</strong>: {s.status === 'ok' ? 'working' : s.status === 'partial' ? 'working, some quotes excluded' : s.status === 'disabled' ? 'not used' : 'failed'}.{' '}
              <span className="muted">{s.detail}</span>
            </li>
          ))}
          {quotes.rejected.map((r, i) => (
            <li key={`${r.name}-${i}`}>
              Excluded <strong>{r.name}</strong>: {r.reason}.
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
