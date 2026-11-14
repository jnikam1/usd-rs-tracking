'use client';

import { ageLabel } from '@/lib/compute';
import { freshnessAt } from '@/lib/config';
import { inr } from '@/lib/format';
import type { MidInfo } from '@/lib/types';
import { FreshBadge } from './ui';

const NAV = [
  ['compare', 'Compare'],
  ['trends', 'Trends'],
  ['offers', 'Offers'],
  ['alerts', 'Alerts'],
  ['guide', 'Guide'],
] as const;

export default function Header({ mid, now }: { mid: MidInfo | null; now: number }) {
  return (
    <header className="site-header">
      <div className="wrap">
        <div className="header-row">
          <a className="brand" href="#compare">
            <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
              <rect width="64" height="64" rx="14" fill="#5b47c7" />
              <path d="M20 18h26M20 28h26M20 18c14 0 14 20 0 20l20 10" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <strong>Har Paisa</strong>
            <span>USD to INR, every paisa counted</span>
          </a>
          {mid && (
            <span className="mid-pill" aria-label={`Mid market ${mid.rate.toFixed(4)} rupees per dollar`}>
              <span className="muted">Mid</span>
              <b>{inr(mid.rate, 2)}</b>
              <FreshBadge freshness={freshnessAt(mid.freshUntil, mid.staleUntil, now)} age={ageLabel(mid.observedAt, now)} />
            </span>
          )}
        </div>
        <div className="nav-row">
          <nav className="nav" aria-label="Sections">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
