'use client';

import { useEffect, useState } from 'react';
import { ORIGIN_LABEL, ageLabel } from '@/lib/compute';
import type { Freshness, FundingMethod, QuoteOrigin } from '@/lib/types';

const ORIGIN_CLASS: Record<QuoteOrigin, string> = {
  'provider-quote': 'b-provider',
  'comparison-estimate': 'b-comparison',
  'snapshot-model': 'b-model',
  demo: 'b-demo',
};

export function OriginBadge({ origin }: { origin: QuoteOrigin }) {
  return <span className={`badge ${ORIGIN_CLASS[origin]}`}>{ORIGIN_LABEL[origin]}</span>;
}

const FRESH_LABEL: Record<Freshness, string> = { fresh: 'Fresh', stale: 'Stale', unavailable: 'Out of date' };

export function FreshBadge({ freshness, age }: { freshness: Freshness; age?: string }) {
  return (
    <span className={`badge b-${freshness}`} title={age ? `Observed ${age}` : undefined}>
      <span>
        {FRESH_LABEL[freshness]}
        {age ? <span className="age">, {age.replace(' old', '')}</span> : null}
      </span>
    </span>
  );
}

export function Logo({ name, logo }: { name: string; logo?: string }) {
  const [broken, setBroken] = useState(false);
  const initials = name.replace(/\(.*\)/, '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className="logo" aria-hidden="true">
      {logo && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        initials
      )}
    </span>
  );
}

export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

/** Local date and time. Only call after mount so server and browser markup match. */
export function localTime(t: string | number | null | undefined, withYear = false): string {
  if (t === null || t === undefined) return 'unknown';
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) return 'unknown';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...(withYear ? { year: 'numeric' } : {}) });
}

export function Age({ iso, now, mounted }: { iso: string | null; now: number; mounted: boolean }) {
  return <span title={mounted && iso ? localTime(iso, true) : undefined}>{ageLabel(iso, now)}</span>;
}

export const FUNDING_LABEL: Record<FundingMethod, string> = {
  bank_transfer: 'Bank transfer from a US account',
  ach_debit: 'ACH direct debit',
  bank_account: 'US bank account (transfer type not stated)',
  debit_card: 'Debit card',
  credit_card: 'Credit card',
  unknown: 'Not stated',
};
