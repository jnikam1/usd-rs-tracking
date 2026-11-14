'use client';

import { ORIGIN_LABEL, ageLabel, currentFreshness, type OfferEstimate } from '@/lib/compute';
import { inr, signedPct, usd } from '@/lib/format';
import type { QuotesPayload } from '@/lib/types';
import { FreshBadge, OriginBadge } from './ui';

export default function SummaryCards({
  quotes,
  amount,
  now,
  onOpen,
  welcome,
}: {
  quotes: QuotesPayload | null;
  amount: number;
  now: number;
  onOpen: (id: string) => void;
  welcome: { provider: string; estimate: OfferEstimate; endsOn: string | null } | null;
}) {
  if (!quotes) {
    return (
      <div className="summary" aria-busy="true" aria-label={`Getting figures for ${usd(amount)}`}>
        {['Best available comparison', 'Effective rate after costs', 'Saving versus a US bank'].map((l) => (
          <div key={l} className="stat-card">
            <p className="stat-label">{l}</p>
            <div className="skeleton" style={{ height: 36, margin: '8px 0', width: '70%' }} />
            <div className="skeleton" style={{ height: 14, width: '90%' }} />
          </div>
        ))}
      </div>
    );
  }
  const rows = quotes.rows;
  const best = rows.find((r) => r.id === quotes.summary.bestId) ?? null;
  const baseline = rows.find((r) => r.id === quotes.summary.baselineId) ?? null;
  const modelAbove = rows.find((r) => r.id === quotes.summary.modelAboveBestId) ?? null;
  const saving = best && baseline && best.id !== baseline.id ? best.received - baseline.received : null;

  return (
    <>
      <div className="summary">
        <div className="stat-card primary">
          <p className="stat-label">Best available comparison for {usd(quotes.amount)}</p>
          {best ? (
            <>
              <p className="stat-value serif-num">{inr(best.received)}</p>
              <p className="stat-sub">
                <strong>{best.name}</strong> pays this to the recipient.
              </p>
              <div className="stat-badges">
                <OriginBadge origin={best.origin} />
                <FreshBadge freshness={currentFreshness(best, now)} age={ageLabel(best.context.collectedAt, now)} />
              </div>
              <p className="stat-sub muted small" style={{ marginTop: 8 }}>
                {quotes.summary.bestBasis}{' '}
                <button className="btn ghost small" type="button" onClick={() => onOpen(best.id)} style={{ minHeight: 0, padding: 0 }}>
                  See the breakdown
                </button>
              </p>
              {modelAbove && (
                <p className="stat-sub small" style={{ marginTop: 8 }}>
                  Unconfirmed: the 13 Nov model suggests {modelAbove.name} could pay about {inr(modelAbove.received)}. It is not a
                  current quote, so it is not ranked as best.
                </p>
              )}
            </>
          ) : (
            <p className="stat-sub" style={{ marginTop: 8 }}>
              {quotes.summary.bestBasis} Research models are listed below but are not treated as offers.
            </p>
          )}
        </div>

        <div className="stat-card">
          <p className="stat-label">Effective rate after costs</p>
          {best ? (
            <>
              <p className="stat-value serif-num">{inr(best.effectiveRate, 2)}</p>
              <p className="stat-sub">rupees per dollar with {best.name}, after the fee and markup</p>
              <p className="stat-sub muted small">
                Mid market {inr(quotes.mid.rate, 4)} ({quotes.mid.source}); {signedPct(best.vsMidPct)} versus mid.
              </p>
            </>
          ) : (
            <p className="stat-sub" style={{ marginTop: 8 }}>
              Mid market is {inr(quotes.mid.rate, 4)} ({quotes.mid.source}). No current quote to compare against it.
            </p>
          )}
        </div>

        <div className="stat-card">
          <p className="stat-label">Saving versus a US bank</p>
          {saving !== null && baseline ? (
            <>
              <p className={`stat-value serif-num${saving > 0 ? ' save' : ''}`}>
                {saving >= 0 ? '+' : '−'}
                {inr(Math.abs(saving))}
              </p>
              <p className="stat-sub">
                versus {baseline.name}, {ORIGIN_LABEL[baseline.origin].toLowerCase()} ({ageLabel(baseline.context.collectedAt, now)})
              </p>
              <p className="stat-sub muted small">{quotes.summary.savingNote}</p>
            </>
          ) : (
            <p className="stat-sub" style={{ marginTop: 8 }}>
              {quotes.summary.savingNote}
            </p>
          )}
        </div>
      </div>

      {welcome && (
        <div className="offer-strip" role="note">
          <strong>Welcome offer model, if you are eligible: </strong>
          {welcome.estimate.status === 'ok' ? (
            <>
              {welcome.provider} could pay about <strong>{inr(welcome.estimate.received)}</strong> on {usd(quotes.amount)}
              {welcome.estimate.extraVsRegular !== null ? ` (${inr(Math.abs(welcome.estimate.extraVsRegular))} ${welcome.estimate.extraVsRegular >= 0 ? 'more' : 'less'} than its regular figure)` : ''}.{' '}
              Applies to the first transfer
              {welcome.estimate.restUsd > 0 ? `; ${usd(welcome.estimate.restUsd)} above the cap at the regular rate` : ''}
              {welcome.endsOn
                ? `, until ${new Date(`${welcome.endsOn}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`
                : ''}
              . Model, not a quote. See Offers.
            </>
          ) : welcome.estimate.status === 'expired' ? (
            <>The {welcome.provider} welcome offer expired on {welcome.estimate.endsOn}.</>
          ) : (
            <>{welcome.estimate.reason}</>
          )}
        </div>
      )}
    </>
  );
}
