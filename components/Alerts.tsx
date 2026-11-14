'use client';

import { useEffect, useRef, useState } from 'react';
import { evaluateRules, type AlertKind, type AlertRule } from '@/lib/compute';
import { freshnessAt } from '@/lib/config';
import { inr } from '@/lib/format';
import type { RatesPayload } from '@/lib/types';

const RULES_KEY = 'harpaisa.alerts';
const FIRED_KEY = 'harpaisa.alerts.fired';
const COOLDOWN_MS = 6 * 3600_000;
const KIND_LABEL: Record<AlertKind, string> = {
  above: 'Rate goes above (₹ per $)',
  below: 'Rate falls below (₹ per $)',
  move: 'Moves more than (% in 24 hrs)',
};

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked */
  }
}
async function notify(title: string, body: string) {
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) return void (await reg.showNotification(title, { body, icon: '/icon.svg', tag: title }));
  } catch {
    /* fall through */
  }
  try {
    new Notification(title, { body, icon: '/icon.svg' });
  } catch {
    /* unsupported */
  }
}

interface ServerStatus {
  configured: boolean;
  deliveryConfigured: boolean;
  authConfigured: boolean;
  schedule: { watch: string; digest: string };
}

export default function Alerts({ rates, now }: { rates: RatesPayload | null; now: number }) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [kind, setKind] = useState<AlertKind>('above');
  const [value, setValue] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default');
  const [last, setLast] = useState<string | null>(null);
  const [server, setServer] = useState<ServerStatus | null | 'error'>(null);
  const ready = useRef(false);

  useEffect(() => {
    setRules(load<AlertRule[]>(RULES_KEY, []));
    setPerm(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    ready.current = true;
    fetch('/api/alerts/status')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setServer(d.serverAlerts as ServerStatus))
      .catch(() => setServer('error'));
  }, []);
  useEffect(() => {
    if (ready.current) save(RULES_KEY, rules);
  }, [rules]);

  const mid = rates?.mid ?? null;
  const midFresh = mid ? freshnessAt(mid.freshUntil, mid.staleUntil, now) === 'fresh' : false;
  const change = rates?.change24h.status === 'ok' ? rates.change24h.pct : null;

  // Check rules whenever a new rate arrives, only on fresh data.
  useEffect(() => {
    if (!mid || !midFresh || !rules.length || perm !== 'granted') return;
    const fired = load<Record<string, number>>(FIRED_KEY, {});
    const t = Date.now();
    for (const h of evaluateRules(rules, mid.rate, change, (n) => inr(n, 2))) {
      if (t - (fired[h.key] ?? 0) < COOLDOWN_MS) continue;
      fired[h.key] = t;
      notify(h.title, h.message);
      setLast(`${h.title} (${new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })})`);
    }
    save(FIRED_KEY, fired);
  }, [mid, midFresh, change, rules, perm]);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const v = Number(value.trim());
    if (!value.trim() || !Number.isFinite(v)) return setFormError('Enter a number.');
    if (kind === 'move' && (v <= 0 || v > 10)) return setFormError('Use a percentage between 0.1 and 10.');
    if (kind !== 'move' && (v < 50 || v > 200)) return setFormError('Use a rate between ₹50 and ₹200 per dollar.');
    setFormError(null);
    setRules((r) => [...r.filter((x) => !(x.kind === kind && x.value === v)), { id: `${kind}-${v}-${Date.now()}`, kind, value: v }]);
    setValue('');
  }

  const state = (r: AlertRule) => {
    if (!mid) return '';
    if (r.kind === 'above') return mid.rate >= r.value ? 'Reached' : `${inr(r.value - mid.rate, 2)} to go`;
    if (r.kind === 'below') return mid.rate <= r.value ? 'Reached' : `${inr(mid.rate - r.value, 2)} to go`;
    return change !== null ? `24 hrs: ${change.toFixed(2)}%` : '24 hr change unavailable';
  };

  return (
    <section className="section" id="alerts" aria-labelledby="alerts-title">
      <div className="section-head">
        <h2 id="alerts-title">Rate alerts</h2>
      </div>
      <p className="section-lead">Two separate systems. Rules you add here stay in this browser and are not sent to the server.</p>
      <div className="alerts-grid">
        <div className="card">
          <h3>Browser only: checked while this page is open.</h3>
          <p className="small muted" style={{ marginTop: 4 }}>
            Rules are saved in this browser. Nothing is checked after you close the tab, so use server alerts for that.
          </p>
          <form className="alert-form" onSubmit={add} noValidate>
            <label className="sr-only" htmlFor="alert-kind">
              Alert type
            </label>
            <select id="alert-kind" value={kind} onChange={(e) => setKind(e.target.value as AlertKind)}>
              {(Object.keys(KIND_LABEL) as AlertKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="alert-value">
              {kind === 'move' ? 'Percent' : 'Rupees per dollar'}
            </label>
            <input
              id="alert-value"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === 'move' ? '0.5' : mid ? (Math.ceil(mid.rate * 2) / 2).toFixed(2) : '95.00'}
              aria-invalid={Boolean(formError)}
              aria-describedby={formError ? 'alert-error' : undefined}
            />
            <button className="btn" type="submit">
              Add browser alert
            </button>
          </form>
          {formError && (
            <p className="field-error" id="alert-error" role="alert">
              {formError}
            </p>
          )}
          {rules.length > 0 && (
            <ul className="rules">
              {rules.map((r) => (
                <li key={r.id}>
                  <span>
                    {r.kind === 'move' ? `Moves ${r.value}% in 24 hrs` : `${r.kind === 'above' ? 'Above' : 'Below'} ${inr(r.value, 2)}`}{' '}
                    <span className="small muted">{state(r)}</span>
                  </span>
                  <button className="btn ghost small" type="button" onClick={() => setRules((x) => x.filter((y) => y.id !== r.id))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 12 }}>
            {perm === 'unsupported' ? (
              <p className="small muted">This browser cannot show notifications. On iPhone, add the page to your home screen first.</p>
            ) : perm === 'granted' ? (
              <p className="small muted">Notifications are on. Each rule notifies at most once every 6 hours.</p>
            ) : perm === 'denied' ? (
              <p className="small muted">Notifications are blocked for this site in your browser settings.</p>
            ) : (
              <button
                className="btn secondary"
                type="button"
                disabled={!rules.length}
                onClick={async () => setPerm(await Notification.requestPermission())}
              >
                Allow notifications
              </button>
            )}
            {!midFresh && rules.length > 0 && <p className="small muted" style={{ marginTop: 6 }}>Paused: the current rate is not fresh.</p>}
            {change === null && rules.some((r) => r.kind === 'move') && (
              <p className="small muted" style={{ marginTop: 6 }}>Movement rules are paused until a 24 hour baseline is available.</p>
            )}
            {last && <p className="small" style={{ marginTop: 6 }}>Last alert: {last}</p>}
          </div>
        </div>

        <div className="card">
          <h3>Server configured: checked on the published schedule.</h3>
          <p className="small muted" style={{ marginTop: 4 }}>
            Set up by the site owner. Works when no browser is open and sends push notifications through ntfy.
          </p>
          {server === null ? (
            <p className="status-line muted">Checking status…</p>
          ) : server === 'error' ? (
            <p className="status-line">Status unavailable right now.</p>
          ) : (
            <>
              <p className="status-line">
                <span className={`badge ${server.configured ? 'b-fresh' : 'b-comparison'}`}>{server.configured ? 'Configured' : 'Not configured'}</span>
                {!server.configured && (
                  <span className="small muted">
                    {!server.deliveryConfigured ? 'No delivery topic is set.' : 'The check secret is not set, so checks are refused.'}
                  </span>
                )}
              </p>
              <dl className="kv" style={{ marginTop: 12 }}>
                <dt>Threshold and movement check</dt>
                <dd>{server.schedule.watch}</dd>
                <dt>Daily summary</dt>
                <dd>{server.schedule.digest}</dd>
              </dl>
            </>
          )}
          <p className="small muted" style={{ marginTop: 12 }}>
            Thresholds and the delivery topic are private server settings and are not shown here. Movement alerts are skipped when the
            rate is stale or a 24 hour baseline is missing. Delivery is best effort: a rare duplicate is possible.
          </p>
        </div>
      </div>
    </section>
  );
}
