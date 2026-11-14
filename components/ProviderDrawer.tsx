'use client';

import { useEffect, useRef } from 'react';
import { ORIGIN_LABEL, ageLabel, currentFreshness } from '@/lib/compute';
import { inr, signedPct, usd } from '@/lib/format';
import type { AccessMode, QuoteRow, QuotesPayload } from '@/lib/types';
import { FUNDING_LABEL, FreshBadge, Logo, OriginBadge, localTime } from './ui';

const ACCESS_LABEL: Record<AccessMode, string> = {
  'documented-public': 'Documented public endpoint',
  authenticated: 'Authenticated API (server-side token)',
  'unauthenticated-legacy': 'Unauthenticated access to an API Wise documents as requiring a token',
  research: 'Research snapshot',
  demo: 'Demo fixture',
};

const ASSUMPTION: Record<QuoteRow['origin'], string> = {
  'provider-quote': 'The provider priced this exact amount. Unauthenticated quotes are illustrative; the final price is set when you create the transfer.',
  'comparison-estimate': 'Wise collects provider quotes about hourly and applies the collected markup to the current mid rate. Informational only; Wise says not to rely on it for critical decisions.',
  'snapshot-model': 'The provider’s spread on a $1,000 transfer on 13 Nov 2026, carried onto today’s mid rate. Fees only where observed or published.',
  demo: 'Demo fixture for local development.',
};

export default function ProviderDrawer({
  row,
  quotes,
  now,
  mounted,
  onClose,
}: {
  row: QuoteRow | null;
  quotes: QuotesPayload | null;
  now: number;
  mounted: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (row && !d.open) d.showModal();
    if (!row && d.open) d.close();
  }, [row]);

  const mid = quotes?.mid.rate ?? null;
  const converted = row && row.fee !== null ? row.totalUsd - row.fee : null;
  const t = (iso: string | null) => (iso ? (mounted ? `${localTime(iso, true)} (${ageLabel(iso, now)})` : ageLabel(iso, now)) : 'Not provided');

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-labelledby="drawer-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {row && (
        <div className="drawer-inner">
          <div className="drawer-head">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
              <Logo name={row.name} logo={row.logo} />
              <div style={{ minWidth: 0 }}>
                <h2 id="drawer-title" style={{ fontSize: '1.25rem' }}>
                  {row.name}
                </h2>
                <div className="tags" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  <OriginBadge origin={row.origin} />
                  <FreshBadge freshness={currentFreshness(row, now)} age={ageLabel(row.context.collectedAt, now)} />
                </div>
              </div>
            </div>
            <button className="btn secondary small" type="button" onClick={onClose} aria-label="Close details">
              Close
            </button>
          </div>

          <div className="drawer-body">
            <section>
              <p className="muted small">Recipient gets</p>
              <p className="big-number serif-num">
                {row.fee === null ? 'up to ' : ''}
                {inr(row.received, 2)}
              </p>
            </section>

            <section aria-labelledby="bd">
              <h3 id="bd">Breakdown</h3>
              <dl className="kv">
                <dt>You pay in total</dt>
                <dd>{usd(row.totalUsd, 2)}</dd>
                <dt>Fee ({row.feeStatus === 'quoted' ? 'quoted' : row.feeStatus === 'published' ? 'published schedule' : row.feeStatus === 'observed' ? 'observed in research' : 'unknown'})</dt>
                <dd>{row.fee === null ? 'Unknown' : `− ${usd(row.fee, 2)}`}</dd>
                <dt>Amount converted</dt>
                <dd>{converted === null ? 'Unknown' : usd(converted, 2)}</dd>
                <dt>Exchange rate applied</dt>
                <dd>{row.rate === null ? 'Unknown' : `₹${row.rate.toFixed(4)}`}</dd>
                <dt>Recipient gets</dt>
                <dd>{inr(row.received, 2)}</dd>
                <dt>Effective rate after costs</dt>
                <dd>{inr(row.effectiveRate, 4)} per $1</dd>
                {mid !== null && (
                  <>
                    <dt>Versus mid market ({inr(mid, 4)})</dt>
                    <dd>
                      {signedPct(row.vsMidPct)}, {inr(Math.abs(row.shortfall))} {row.shortfall >= 0 ? 'less' : 'more'}
                    </dd>
                  </>
                )}
              </dl>
            </section>

            <section aria-labelledby="dl">
              <h3 id="dl">Delivery</h3>
              {row.delivery ? (
                <p>
                  {row.delivery.label}. <span className="muted small">{row.delivery.basis}.</span>
                </p>
              ) : (
                <p className="muted">No delivery estimate is tied to this figure.</p>
              )}
              {row.speedClaim && <p className="small muted" style={{ marginTop: 4 }}>Provider&rsquo;s general claim, not tied to this figure: {row.speedClaim}.</p>}
            </section>

            <section aria-labelledby="pv">
              <h3 id="pv">Provenance</h3>
              <dl className="kv">
                <dt>Classification</dt>
                <dd>{ORIGIN_LABEL[row.origin]}</dd>
                <dt>Source</dt>
                <dd>
                  {row.context.sourceUrl ? (
                    <a href={row.context.sourceUrl} target="_blank" rel="noopener noreferrer">
                      {row.context.sourceLabel}
                    </a>
                  ) : (
                    row.context.sourceLabel
                  )}
                </dd>
                <dt>Access</dt>
                <dd>{ACCESS_LABEL[row.context.access]}</dd>
                <dt>{row.origin === 'snapshot-model' ? 'Snapshot taken' : 'Price observed'}</dt>
                <dd>{t(row.context.collectedAt)}</dd>
                <dt>Retrieved by this site</dt>
                <dd>{t(row.context.retrievedAt)}</dd>
                {row.context.expiresAt && (
                  <>
                    <dt>Quote expires</dt>
                    <dd>{t(row.context.expiresAt)}</dd>
                  </>
                )}
                {row.context.modelDate && (
                  <>
                    <dt>Model date</dt>
                    <dd>{row.context.modelDate}</dd>
                  </>
                )}
                <dt>Route reported</dt>
                <dd>
                  {row.context.sourceCountry ?? 'not stated'} to {row.context.targetCountry ?? 'not stated'}, USD to INR
                </dd>
                <dt>Funding</dt>
                <dd>{FUNDING_LABEL[row.context.fundingMethod]}</dd>
                <dt>Payout</dt>
                <dd>{row.context.payoutMethod === 'bank_deposit' ? 'Bank deposit in India' : 'Not stated'}</dd>
              </dl>
            </section>

            <section aria-labelledby="as">
              <h3 id="as">Assumptions</h3>
              <ul className="cautions" style={{ listStyle: 'none' }}>
                <li style={{ background: 'var(--soft)' }}>The amount you send is the total; fees are taken out of it, not added on top.</li>
                <li style={{ background: 'var(--soft)' }}>{ASSUMPTION[row.origin]}</li>
                {row.note && <li style={{ background: 'var(--soft)' }}>{row.note}</li>}
              </ul>
            </section>

            {row.cautions.length > 0 && (
              <section aria-labelledby="ca">
                <h3 id="ca">Cautions</h3>
                <ul className="cautions">
                  {row.cautions.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="drawer-foot">
            {row.url && (
              <a className="btn" href={row.url} target="_blank" rel="noopener noreferrer">
                Open {row.name}
              </a>
            )}
            <button className="btn secondary" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
