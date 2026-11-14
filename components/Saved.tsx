'use client';

import { useEffect, useState } from 'react';
import { ORIGIN_LABEL, currentFreshness } from '@/lib/compute';
import { inr, usd } from '@/lib/format';
import type { Freshness, QuoteOrigin, QuotesPayload } from '@/lib/types';
import { localTime } from './ui';

const KEY = 'harpaisa.saved.v1';

/** A saved comparison keeps the figures, date and status it had when saved. It is never refreshed in place. */
export interface SavedComparison {
  id: string;
  savedAt: string;
  amount: number;
  generatedAt: string;
  mid: { rate: number; source: string; freshness: Freshness };
  best: { name: string; received: number; effectiveRate: number; origin: QuoteOrigin; freshness: Freshness; collectedAt: string | null } | null;
}

function read(): SavedComparison[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedComparison[];
  } catch {
    return [];
  }
}

export default function Saved({ quotes, onRestore, mounted }: { quotes: QuotesPayload | null; onRestore: (amount: number) => void; mounted: boolean }) {
  const [items, setItems] = useState<SavedComparison[]>([]);
  useEffect(() => setItems(read()), []);
  const write = (next: SavedComparison[]) => {
    setItems(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage blocked */
    }
  };

  function saveNow() {
    if (!quotes) return;
    const t = Date.now();
    const best = quotes.rows.find((r) => r.id === quotes.summary.bestId);
    write(
      [
        {
          id: String(t),
          savedAt: new Date(t).toISOString(),
          amount: quotes.amount,
          generatedAt: quotes.generatedAt,
          mid: { rate: quotes.mid.rate, source: quotes.mid.source, freshness: quotes.mid.freshness },
          best: best
            ? {
                name: best.name,
                received: best.received,
                effectiveRate: best.effectiveRate,
                origin: best.origin,
                freshness: currentFreshness(best, t),
                collectedAt: best.context.collectedAt,
              }
            : null,
        },
        ...items,
      ].slice(0, 10),
    );
  }

  return (
    <section className="card" aria-labelledby="saved-title">
      <div className="card-title">
        <h2 id="saved-title" style={{ fontSize: '1.125rem' }}>
          Saved comparisons
        </h2>
        <button className="btn secondary small" type="button" onClick={saveNow} disabled={!quotes}>
          Save this
        </button>
      </div>
      <p className="small muted">Kept in this browser with their original date and status. Restoring loads fresh figures for the same amount.</p>
      {items.length > 0 && (
        <ul className="saved">
          {items.map((s) => (
            <li key={s.id}>
              <span>
                <strong>{usd(s.amount)}</strong>, saved {mounted ? localTime(s.savedAt, true) : s.savedAt.slice(0, 10)}
              </span>
              <span className="muted">
                {s.best
                  ? `${s.best.name}: ${inr(s.best.received)} (${inr(s.best.effectiveRate, 2)} per $1), ${ORIGIN_LABEL[s.best.origin].toLowerCase()}, ${s.best.freshness} when saved`
                  : 'No current quote at the time'}
                . Mid {inr(s.mid.rate, 2)} from {s.mid.source}.
              </span>
              <span className="row-actions">
                <button className="btn secondary small" type="button" onClick={() => onRestore(s.amount)}>
                  Restore amount
                </button>
                <button className="btn ghost small" type="button" onClick={() => write(items.filter((x) => x.id !== s.id))}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
