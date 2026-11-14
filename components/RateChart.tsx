'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { freshnessAt } from '@/lib/config';
import { inr, signedPct } from '@/lib/format';
import type { HistoryPayload, MidInfo, Point, Range, YearStats } from '@/lib/types';
import { localTime } from './ui';

const LABELS: Record<Range, string> = { '1d': '24H', '7d': '7D', '30d': '30D', '1y': '1Y' };
const LONG: Record<Range, string> = { '1d': '24 hours', '7d': '7 days', '30d': '30 days', '1y': '1 year' };
const H = 260;
const PAD = { top: 16, right: 56, bottom: 28, left: 8 };

interface Obs extends Point {
  live?: boolean;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => span / s <= count + 0.5) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

function tick(t: number, range: Range): string {
  const d = new Date(t);
  if (range === '1d') return d.toLocaleTimeString('en-US', { hour: 'numeric' });
  if (range === '1y') return d.toLocaleDateString('en-US', { month: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RateChart({ mid, year, now, mounted }: { mid: MidInfo | null; year: YearStats | null; now: number; mounted: boolean }) {
  const [range, setRange] = useState<Range>('7d');
  const [cache, setCache] = useState<Partial<Record<Range, HistoryPayload & { loading?: boolean }>>>({});
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(720);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async (r: Range) => {
    setCache((c) => ({ ...c, [r]: { ...(c[r] ?? emptyPayload(r)), loading: true } }));
    try {
      const res = await fetch(`/api/history?range=${r}`);
      const d = (await res.json()) as HistoryPayload;
      setCache((c) => ({ ...c, [r]: { ...emptyPayload(r), ...d, loading: false } }));
    } catch (e) {
      setCache((c) => ({ ...c, [r]: { ...emptyPayload(r), error: e instanceof Error ? e.message : String(e), loading: false } }));
    }
  }, []);

  useEffect(() => {
    if (!cache[range]) load(range);
  }, [range, cache, load]);

  useEffect(() => {
    if (range === '1y') return;
    const t = setInterval(() => load(range), 5 * 60_000);
    return () => clearInterval(t);
  }, [range, load]);

  const data = cache[range];
  const points: Obs[] = useMemo(() => {
    const pts: Obs[] = data?.points ?? [];
    if (!pts.length || !mid) return pts;
    // Only extend the line with a fresh intraday observation that is newer than the history.
    const observed = Date.parse(mid.observedAt);
    const fresh = mid.intraday && freshnessAt(mid.freshUntil, mid.staleUntil, now) === 'fresh';
    return fresh && observed > pts[pts.length - 1].t + 60_000 ? [...pts, { t: observed, v: mid.rate, live: true }] : pts;
  }, [data, mid, now]);

  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const vs = points.map((p) => p.v);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const pad = (hi - lo) * 0.12 || 0.1;
    const y0 = lo - pad;
    const y1 = hi + pad;
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const iw = width - PAD.left - PAD.right;
    const ih = H - PAD.top - PAD.bottom;
    const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * iw;
    const y = (v: number) => PAD.top + (1 - (v - y0) / (y1 - y0)) * ih;
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    const area = `${line}L${x(t1).toFixed(1)},${PAD.top + ih}L${x(t0).toFixed(1)},${PAD.top + ih}Z`;
    const n = width < 480 ? 3 : 5;
    const xTicks = Array.from({ length: n }, (_, i) => t0 + ((t1 - t0) * (i + 0.5)) / n);
    const loP = points.find((p) => p.v === lo)!;
    const hiP = points.find((p) => p.v === hi)!;
    return { x, y, line, area, yTicks: niceTicks(y0, y1, 4), xTicks, lo: loP, hi: hiP, ih };
  }, [points, width]);

  const first = points[0];
  const last = points[points.length - 1];
  const change = first && last ? { abs: last.v - first.v, pct: ((last.v - first.v) / first.v) * 100 } : null;
  const hp = hover !== null ? points[hover] : null;

  function nearest(clientX: number, rect: DOMRect) {
    if (!geo) return;
    const px = ((clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(geo.x(p.t) - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
  }
  const step = (delta: number) => setHover((h) => Math.min(points.length - 1, Math.max(0, (h ?? points.length - 1) + delta)));

  function onKey(e: React.KeyboardEvent) {
    const map: Record<string, () => void> = {
      ArrowLeft: () => step(-1),
      ArrowRight: () => step(1),
      Home: () => setHover(0),
      End: () => setHover(points.length - 1),
      Escape: () => setHover(null),
    };
    if (map[e.key]) {
      e.preventDefault();
      map[e.key]();
    }
  }

  const sourceLine = data?.source
    ? `Source: ${data.source}${points.some((p) => p.live) && mid ? `, with the latest live mid from ${mid.source}` : ''}.`
    : '';

  return (
    <section className="card" aria-labelledby="chart-title">
      <div className="section-head">
        <div>
          <h2 id="chart-title">USD/INR mid market</h2>
          <p className="small muted">Rupees per dollar. Higher means each dollar buys more.</p>
        </div>
        <div className="ranges" role="group" aria-label="Time range">
          {(Object.keys(LABELS) as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              aria-label={`Show ${LONG[r]}`}
              onClick={() => {
                setRange(r);
                setHover(null);
              }}
            >
              {LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-box" ref={boxRef}>
        {geo ? (
          <svg
            viewBox={`0 0 ${width} ${H}`}
            height={H}
            role="img"
            tabIndex={0}
            aria-label={`USD to INR over ${LONG[range]}: from ${first.v.toFixed(2)} to ${last.v.toFixed(2)}. Low ${geo.lo.v.toFixed(2)}, high ${geo.hi.v.toFixed(2)}. Use the left and right arrow keys to inspect observations.`}
            onPointerMove={(e) => nearest(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerDown={(e) => nearest(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKey}
          >
            <defs>
              <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--chart)" stopOpacity="0.14" />
                <stop offset="100%" stopColor="var(--chart)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {geo.yTicks.map((v) => (
              <g key={v}>
                <line className="gridline" x1={PAD.left} x2={width - PAD.right} y1={geo.y(v)} y2={geo.y(v)} />
                <text className="axis-label" x={width - PAD.right + 8} y={geo.y(v) + 4}>
                  {v.toFixed(v % 1 === 0 ? 0 : 2)}
                </text>
              </g>
            ))}
            {mounted &&
              geo.xTicks.map((t) => (
                <text key={t} className="axis-label" x={geo.x(t)} y={H - 8} textAnchor="middle">
                  {tick(t, range)}
                </text>
              ))}
            <path d={geo.area} fill="url(#fill)" />
            <path d={geo.line} fill="none" stroke="var(--chart)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={geo.x(last.t)} cy={geo.y(last.v)} r={4.5} fill="var(--chart)" stroke="var(--surface)" strokeWidth={2} />
            {hp && (
              <g pointerEvents="none">
                <line x1={geo.x(hp.t)} x2={geo.x(hp.t)} y1={PAD.top} y2={PAD.top + geo.ih} stroke="var(--ink-2)" strokeDasharray="3 3" />
                <circle cx={geo.x(hp.t)} cy={geo.y(hp.v)} r={5} fill="var(--chart)" stroke="var(--surface)" strokeWidth={2} />
              </g>
            )}
          </svg>
        ) : (
          <div className="chart-empty" role="status">
            {data?.loading || !data ? (
              <p>Loading {LONG[range]} of history…</p>
            ) : (
              <>
                <p>
                  History for the last {LONG[range]} is unavailable. {data.error ?? 'No source returned enough usable observations.'}
                </p>
                {data.attempts?.length ? <p className="small">Tried: {data.attempts.join('; ')}</p> : null}
                <button className="btn secondary small" type="button" onClick={() => load(range)}>
                  Try again
                </button>
              </>
            )}
          </div>
        )}
        {geo && hp && (
          <div className="tooltip" style={{ left: `${Math.min(Math.max((geo.x(hp.t) / width) * 100, 16), 84)}%` }}>
            <b>{inr(hp.v, 4)}</b>
            <br />
            {mounted ? localTime(hp.t, range === '1y') : ''}
            <br />
            <span style={{ opacity: 0.8 }}>{hp.live ? 'Live mid' : data?.source}</span>
          </div>
        )}
      </div>

      {geo && (
        <>
          <div className="chart-meta">
            <span>
              {mounted ? `Observations ${localTime(first.t, range === '1y')} to ${localTime(last.t, range === '1y')}` : `${points.length} observations`}
            </span>
            <span>{sourceLine}</span>
          </div>
          <div className="inspect" role="group" aria-label="Inspect observations">
            <button className="btn secondary small" type="button" onClick={() => step(-1)} aria-label="Previous observation">
              Previous
            </button>
            <button className="btn secondary small" type="button" onClick={() => step(1)} aria-label="Next observation">
              Next
            </button>
            <span aria-live="polite" className="small">
              {hp ? `${inr(hp.v, 4)}${mounted ? ` at ${localTime(hp.t, true)}` : ''}${hp.live ? ' (live mid)' : ''}` : 'Hover, tap, or use the buttons to inspect a point.'}
            </span>
          </div>
          <dl className="stats">
            {change && (
              <div>
                <dt>Change over the shown period</dt>
                <dd className={change.pct >= 0 ? 'change up' : 'change down'}>
                  {change.pct >= 0 ? '▲' : '▼'} {signedPct(change.pct)}
                  <small>
                    {change.pct >= 0 ? 'More' : 'Fewer'} rupees per dollar: {inr(Math.abs(change.abs) * 1000)} on $1,000
                  </small>
                </dd>
              </div>
            )}
            <div>
              <dt>Low to high</dt>
              <dd>
                {geo.lo.v.toFixed(2)} to {geo.hi.v.toFixed(2)}
                <small>{mounted ? `Low ${localTime(geo.lo.t, range === '1y')}, high ${localTime(geo.hi.t, range === '1y')}` : ''}</small>
              </dd>
            </div>
            {year && (
              <div>
                <dt>Today versus the past year</dt>
                <dd>
                  {year.percentile}th percentile
                  <small>
                    Range {year.low.toFixed(2)} to {year.high.toFixed(2)}
                    {year.source ? ` (${year.source})` : ''}
                  </small>
                </dd>
              </div>
            )}
          </dl>
          <details className="disclosure">
            <summary>Show the observations as a table</summary>
            <div className="table-scroll">
              <table className="data">
                <caption className="sr-only">Latest observations for {LONG[range]}</caption>
                <thead>
                  <tr>
                    <th scope="col">Observed</th>
                    <th scope="col">Rate</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {points
                    .slice(-24)
                    .reverse()
                    .map((p) => (
                      <tr key={p.t}>
                        <td>{mounted ? localTime(p.t, true) : new Date(p.t).toISOString()}</td>
                        <td>{p.v.toFixed(4)}</td>
                        <td>{p.live ? `Live mid (${mid?.source})` : data?.source}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">Showing the latest 24 of {points.length} observations.</p>
          </details>
        </>
      )}
    </section>
  );
}

function emptyPayload(r: Range): HistoryPayload {
  return { range: r, points: [], source: null, sourceId: null, firstAt: null, lastAt: null, retrievedAt: null, attempts: [] };
}
