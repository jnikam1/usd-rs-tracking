'use client';

import { useEffect, useRef, useState } from 'react';
import { AMOUNT_HELP, parseAmount } from '@/lib/amount';
import { usd } from '@/lib/format';

const PRESETS = [100, 500, 1000, 2500, 5000, 10000];

export default function Calculator({
  amount,
  onAmount,
  newCustomer,
  onNewCustomer,
}: {
  amount: number;
  onAmount: (n: number) => void;
  newCustomer: boolean;
  onNewCustomer: (v: boolean) => void;
}) {
  const [draft, setDraft] = useState(String(amount));
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the field in sync when the amount changes elsewhere (presets, restoring a saved comparison).
  useEffect(() => {
    setDraft((d) => {
      const p = parseAmount(d);
      return p.ok && p.value === amount ? d : String(amount);
    });
  }, [amount]);

  function onChange(v: string) {
    setDraft(v);
    if (timer.current) clearTimeout(timer.current);
    const p = parseAmount(v);
    if (!p.ok) {
      setError(p.error);
      setNote(null);
      return;
    }
    setError(null);
    setNote(p.rounded ? `Rounded to ${usd(p.value)}.` : null);
    timer.current = setTimeout(() => onAmount(p.value), 450);
  }

  return (
    <section className="card calc" aria-labelledby="calc-title">
      <div className="card-title">
        <h2 id="calc-title" style={{ fontSize: '1.125rem' }}>
          Send USD to India
        </h2>
      </div>
      <label className="field-label" htmlFor="amount">
        You send, fees included
      </label>
      <div className={`amount-box${error ? ' invalid' : ''}`}>
        <span className="cur" aria-hidden="true">
          $
        </span>
        <input
          id="amount"
          inputMode="decimal"
          autoComplete="off"
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            const p = parseAmount(draft);
            if (!p.ok) return;
            if (timer.current) clearTimeout(timer.current);
            setDraft(String(p.value));
            if (p.value !== amount) onAmount(p.value);
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'amount-error' : 'amount-help'}
        />
        <span className="code">USD</span>
      </div>
      {error ? (
        <p className="field-error" id="amount-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="field-help" id="amount-help">
          {note ? `${note} ` : ''}
          {AMOUNT_HELP}
        </p>
      )}
      <div className="presets" role="group" aria-label="Quick amounts">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className="chip"
            aria-pressed={amount === p}
            onClick={() => {
              setError(null);
              setNote(null);
              setDraft(String(p));
              onAmount(p);
            }}
          >
            {usd(p)}
          </button>
        ))}
      </div>
      <ul className="context-list" aria-label="What is compared">
        <li>Recipient gets INR in an Indian bank account.</li>
        <li>You pay from a US bank account. Card funding costs more and is shown separately.</li>
        <li>The amount is your total budget: fees come out of it, not on top.</li>
      </ul>
      <label className="toggle">
        <input type="checkbox" checked={newCustomer} onChange={(e) => onNewCustomer(e.target.checked)} />
        <span>
          I&rsquo;m a new customer: show welcome offer models
          <span className="field-help" style={{ display: 'block', marginTop: 2 }}>
            Shown separately from regular pricing, with caps and expiry.
          </span>
        </span>
      </label>
    </section>
  );
}
