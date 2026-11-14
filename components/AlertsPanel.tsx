'use client';

import { useEffect, useRef, useState } from 'react';
import { evaluateRules, type AlertKind, type AlertRule } from '@/lib/compute';
import { inr } from '@/lib/format';

const RULES_KEY = 'harpaisa.alerts';
const FIRED_KEY = 'harpaisa.alerts.fired';
const COOLDOWN_MS = 6 * 3600_000;

const KIND_LABEL: Record<AlertKind, string> = {
  above: 'Rate goes above',
  below: 'Rate falls below',
  move: 'Rate moves more than (% in 24 hrs)',
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
    if (reg) {
      await reg.showNotification(title, { body, icon: '/icon.svg', badge: '/icon.svg', tag: title });
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    new Notification(title, { body, icon: '/icon.svg' });
  } catch {
    /* unsupported */
  }
}

export default function AlertsPanel({ mid, change24h }: { mid: number | null; change24h: number | null }) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [kind, setKind] = useState<AlertKind>('above');
  const [value, setValue] = useState('');
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default');
  const [lastFired, setLastFired] = useState<string | null>(null);
  const ready = useRef(false);

  useEffect(() => {
    setRules(load<AlertRule[]>(RULES_KEY, []));
    setPerm(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    ready.current = true;
  }, []);

  useEffect(() => {
    if (ready.current) save(RULES_KEY, rules);
  }, [rules]);

  // Default the input to something sensible around the current rate.
  useEffect(() => {
    if (value || mid === null) return;
    setValue(kind === 'move' ? '0.5' : (kind === 'above' ? Math.ceil(mid * 4 + 1) / 4 : Math.floor(mid * 4 - 1) / 4).toFixed(2));
  }, [mid, kind, value]);

  // Check rules each time a new rate arrives.
  useEffect(() => {
    if (mid === null || !rules.length || perm !== 'granted') return;
    const fired = load<Record<string, number>>(FIRED_KEY, {});
    const now = Date.now();
    for (const hit of evaluateRules(rules, mid, change24h, (n) => inr(n, 2))) {
      if (now - (fired[hit.key] ?? 0) < COOLDOWN_MS) continue;
      fired[hit.key] = now;
      notify(hit.title, hit.message);
      setLastFired(`${hit.title} (${new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })})`);
    }
    save(FIRED_KEY, fired);
  }, [mid, change24h, rules, perm]);

  async function enable() {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === 'granted') notify('Har Paisa alerts are on', 'You will get a notification here when a rule is hit while this page is open.');
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) return;
    if (kind !== 'move' && (v < 50 || v > 200)) return;
    setRules((r) => [...r.filter((x) => !(x.kind === kind && x.value === v)), { id: `${kind}-${v}-${Date.now()}`, kind, value: v }]);
    setValue('');
  }

  const status = (r: AlertRule) => {
    if (mid === null) return '';
    if (r.kind === 'above') return mid >= r.value ? 'Hit now' : `${inr(r.value - mid, 2)} to go`;
    if (r.kind === 'below') return mid <= r.value ? 'Hit now' : `${inr(mid - r.value, 2)} to go`;
    return change24h !== null ? `24 hrs: ${change24h.toFixed(2)}%` : '';
  };

  return (
    <>
      <div className="section-head">
        <h2 id="alerts-title">Rate alerts</h2>
      </div>
      <p className="section-sub">
        Pick a level and get notified when USD/INR reaches it. Browser alerts work while this page is open (add it to your home
        screen to keep it handy). Phone push runs on the server every hour, even when the page is closed.
      </p>

      <form className="alert-form" onSubmit={add}>
        <label className="visually-hidden" htmlFor="alert-kind">Alert type</label>
        <select id="alert-kind" value={kind} onChange={(e) => { setKind(e.target.value as AlertKind); setValue(''); }}>
          {(Object.keys(KIND_LABEL) as AlertKind[]).map((k) => (
            <option key={k} value={k}>{KIND_LABEL[k]}</option>
          ))}
        </select>
        <label className="visually-hidden" htmlFor="alert-value">{kind === 'move' ? 'Percent' : 'Rupees per dollar'}</label>
        <input
          id="alert-value"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={kind === 'move' ? '0.5' : '95.00'}
        />
        <button className="btn" type="submit">Add alert</button>
      </form>

      {rules.length > 0 && (
        <ul className="rules">
          {rules.map((r) => {
            const s = status(r);
            return (
              <li key={r.id}>
                <span>
                  {r.kind === 'move' ? `Moves ${r.value}% in 24 hrs` : `${r.kind === 'above' ? 'Above' : 'Below'} ${inr(r.value, 2)}`}
                  {s && <span className={`state${s === 'Hit now' ? ' on' : ''}`}> {s}</span>}
                </span>
                <button className="btn ghost" type="button" onClick={() => setRules((x) => x.filter((y) => y.id !== r.id))}>
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {perm === 'unsupported' ? (
        <p className="alert-status">This browser does not support notifications. On iPhone, add the page to your home screen first.</p>
      ) : perm === 'granted' ? (
        <p className="alert-status">Browser notifications are on. Each rule notifies at most once every 6 hours.</p>
      ) : perm === 'denied' ? (
        <p className="alert-status">Notifications are blocked for this site. Allow them in your browser settings to get alerts.</p>
      ) : (
        <button className="btn ghost" type="button" onClick={enable} disabled={!rules.length}>
          Turn on browser notifications
        </button>
      )}
      {lastFired && <p className="alert-status">Last alert: {lastFired}</p>}
      <p className="alert-status">
        For push to your phone when the page is closed, install the free{' '}
        <a href="https://ntfy.sh" target="_blank" rel="noopener noreferrer">ntfy</a> app and subscribe to the topic set in this
        app&rsquo;s settings. The server checks hourly and sends a morning summary with the best app of the day.
      </p>
    </>
  );
}
