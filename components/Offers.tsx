'use client';

import { ORIGIN_LABEL, offerEstimate, offerStatus, regularRowFor } from '@/lib/compute';
import { inr, usd } from '@/lib/format';
import { OFFERS } from '@/lib/providers';
import type { QuotesPayload } from '@/lib/types';

const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export default function Offers({
  quotes,
  amount,
  now,
  newCustomer,
  onNewCustomer,
}: {
  quotes: QuotesPayload | null;
  amount: number;
  now: number;
  newCustomer: boolean;
  onNewCustomer: (v: boolean) => void;
}) {
  return (
    <section className="section" id="offers" aria-labelledby="offers-title">
      <div className="section-head">
        <h2 id="offers-title">Welcome offers</h2>
        <label className="check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', minHeight: 44, cursor: 'pointer' }}>
          <input type="checkbox" checked={newCustomer} onChange={(e) => onNewCustomer(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--violet)' }} />
          I&rsquo;m a new customer
        </label>
      </div>
      <p className="section-lead">
        First transfer deals, kept separate from regular pricing. Terms come from the 13 Nov 2026 research and can change; models are
        estimates, not quotes. Use one offer, then compare regular prices for later transfers.
      </p>
      <ul className="offers">
        {OFFERS.map((o) => {
          const status = offerStatus(o, now);
          const regular = quotes ? regularRowFor(quotes.rows, o.providerKey, now) : null;
          const est = quotes && newCustomer && status !== 'expired' ? offerEstimate(o, quotes.amount, quotes.mid.rate, regular, now) : null;
          return (
            <li key={o.id} className={`offer${status === 'expired' ? ' expired' : ''}`}>
              <div className="offer-head">
                <h3>
                  <a href={o.url} target="_blank" rel="noopener noreferrer">
                    {o.provider}
                  </a>
                </h3>
                {status === 'expired' ? (
                  <span className="badge b-unavailable">Expired {fmtDay(o.endsOn as string)}</span>
                ) : status === 'active' ? (
                  <span className="badge b-fresh">Until {fmtDay(o.endsOn as string)}</span>
                ) : (
                  <span className="badge b-comparison">No end date published</span>
                )}
              </div>
              <p style={{ fontWeight: 600 }}>{o.headline}</p>
              <p className="small">
                {o.terms}
                {o.capUsd ? ` Cap: ${usd(o.capUsd)}.` : ''} Seen {fmtDay(o.observedOn)}.
              </p>
              {o.model && status !== 'expired' && (
                <p className="model">
                  <strong>Model assumption: </strong>
                  {o.model.basis}
                </p>
              )}
              {status === 'expired' ? (
                <p className="small muted">No longer modelled. Check the provider for current offers.</p>
              ) : !newCustomer ? (
                o.model && <p className="small muted">Tick &ldquo;I&rsquo;m a new customer&rdquo; to see what this could pay on your amount.</p>
              ) : !quotes ? (
                <p className="small muted">Getting figures for {usd(amount)}…</p>
              ) : est?.status === 'ok' ? (
                <p className="small">
                  On {usd(quotes.amount)}: about <strong>{inr(est.received)}</strong> ({inr(est.effectiveRate, 2)} per $1, model)
                  {est.extraVsRegular !== null && regular
                    ? `, ${inr(Math.abs(est.extraVsRegular))} ${est.extraVsRegular >= 0 ? 'more' : 'less'} than ${o.provider}’s regular ${ORIGIN_LABEL[regular.origin].toLowerCase()}`
                    : ''}
                  .{est.restBasis ? ` ${est.restBasis}` : ''}
                </p>
              ) : est ? (
                <p className="small muted">{'reason' in est ? est.reason : ''}</p>
              ) : null}
              <ul>
                {o.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
