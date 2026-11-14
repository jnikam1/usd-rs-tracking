'use client';

import { ageLabel } from '@/lib/compute';
import { freshnessAt } from '@/lib/config';
import { inr, signedPct } from '@/lib/format';
import type { FundingOption, RatesPayload } from '@/lib/types';
import { FreshBadge, localTime } from './ui';
import { usd } from '@/lib/format';

export default function MarketCard({
  rates,
  ratesError,
  now,
  mounted,
  funding,
  amount,
}: {
  rates: RatesPayload | null;
  ratesError: string | null;
  now: number;
  mounted: boolean;
  funding: FundingOption[] | null;
  amount: number | null;
}) {
  const mid = rates?.mid ?? null;
  const fresh = mid ? freshnessAt(mid.freshUntil, mid.staleUntil, now) : 'unavailable';
  const ch = rates?.change24h;
  return (
    <section className="card" aria-labelledby="market-title">
      <div className="card-title">
        <h2 id="market-title" style={{ fontSize: '1.125rem' }}>
          Mid market rate
        </h2>
        {mid && <FreshBadge freshness={fresh} age={ageLabel(mid.observedAt, now)} />}
      </div>
      {mid ? (
        <>
          <p className="mid-big serif-num">{inr(mid.rate, 4)}</p>
          <p className="small muted">
            {mid.source}
            {mid.intraday ? '' : ' (daily reference, not intraday)'}
            {mounted ? `, observed ${localTime(mid.observedAt)}` : ''}
          </p>
          <p style={{ marginTop: 12 }}>
            {ch?.status === 'ok' ? (
              <>
                <span className={`change ${ch.pct >= 0 ? 'up' : 'down'}`}>
                  {ch.pct >= 0 ? '▲' : '▼'} {signedPct(ch.pct)}
                </span>{' '}
                <span className="small muted">
                  over {Math.round(ch.periodMs / 3600_000)} hrs ({ch.pct >= 0 ? 'more' : 'fewer'} rupees per dollar)
                </span>
              </>
            ) : (
              <span className="small muted">24 hr change unavailable. {ch?.reason}</span>
            )}
          </p>
          {fresh !== 'fresh' && (
            <p className="banner warn small" style={{ marginTop: 12, marginBottom: 0 }}>
              This rate is {fresh === 'stale' ? 'stale' : 'out of date'}. Payouts below use it as the reference.
            </p>
          )}
        </>
      ) : (
        <p className="muted">{ratesError ? `Rate unavailable: ${ratesError}` : 'Loading the rate…'}</p>
      )}

      {funding && amount !== null && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: '0.9375rem' }}>How you pay changes what arrives</h3>
          <p className="small muted" style={{ margin: '2px 0 8px' }}>
            Wise&rsquo;s own quote for {usd(amount)}, by funding method.
          </p>
          <dl className="kv">
            {funding.map((f) => (
              <div key={f.method} style={{ display: 'contents' }}>
                <dt>
                  {f.label} <span className="small">({usd(f.fee, 2)} fee)</span>
                </dt>
                <dd>{inr(f.received)}</dd>
              </div>
            ))}
          </dl>
          <p className="small muted" style={{ marginTop: 6 }}>
            Wise&rsquo;s public quote has no ACH direct debit price. Other providers&rsquo; card fees differ.
          </p>
        </div>
      )}
    </section>
  );
}
