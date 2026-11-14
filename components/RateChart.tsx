'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inr, signedPct } from '@/lib/format';
import type { Point, Range } from '@/lib/types';

const LABELS: Record<Range, string> = { '1d': '24H', '7d': '7D', '30d': '30D', '1y': '1Y' };
const H = 240;
const PAD = { top: 16, right: 52, bottom: 26, left: 8 };

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => span / s <= count + 0.5) ?? raw;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

function fmtTime(t: number, range: Range, long = false): string {
  const d = new Date(t);
  if (range === '1d') return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: long ? '2-digit' : undefined });
  if (range === '1y') return d.toLocaleDateString('en-US', long ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short' });
  if (long) return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RateChart({
  current,
  year,
}: {
  current: number | null;
  year: { high: number; highAt: number; low: number; lowAt: number; percentile: number; source: string } | null;
}) {
  const [range, setRange] = useState<Range>('7d');
  const [cache, setCache] = useState<Partial<Record<Range, { points: Point[]; source: string | null; error?: string }>>>({});
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(640);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async (r: Range) => {
    try {
      const res = await fetch(`/api/history?range=${r}`);
      const d = await res.json();
      setCache((c) => ({ ...c, [r]: { points: d.points ?? [], source: d.source ?? null, error: d.error } }));
    } catch (e) {
      setCache((c) => ({ ...c, [r]: { points: [], source: null, error: e instanceof Error ? e.message : String(e) } }));
    }
  }, []);

  useEffect(() => {
    if (!cache[range]) load(range);
  }, [range, cache, load]);

  // Refresh the short ranges every 5 minutes.
  useEffect(() => {
    const t = setInterval(() => {
      if (range !== '1y') load(range);
    }, 5 * 60_000);
    return () => clearInterval(t);
  }, [range, load]);

  const data = cache[range];
  const points = useMemo(() => {
    const pts = data?.points ?? [];
    if (!pts.length || current === null) return pts;
    // Append the live mid so the line ends where the ticker says.
    const last = pts[pts.length - 1];
    return Date.now() - last.t > 60_000 ? [...pts, { t: Date.now(), v: current }] : pts;
  }, [data, current]);

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
    const yTicks = niceTicks(y0, y1, 4);
    const nX = width < 480 ? 3 : 5;
    const xTicks = Array.from({ length: nX }, (_, i) => t0 + ((t1 - t0) * (i + 0.5)) / nX);
    return { x, y, line, area, yTicks, xTicks, lo, hi, iw, ih };
  }, [points, width]);

  const first = points[0];
  const last = points[points.length - 1];
  const change = first && last ? { abs: last.v - first.v, pct: ((last.v - first.v) / first.v) * 100 } : null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!geo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    let bestI = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(geo.x(p.t) - px);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    });
    setHover(bestI);
  }

  function onKey(e: React.KeyboardEvent<SVGSVGElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setHover((h) => {
      const cur = h ?? points.length - 1;
      return Math.min(points.length - 1, Math.max(0, cur + (e.key === 'ArrowLeft' ? -1 : 1)));
    });
  }

  const hp = hover !== null ? points[hover] : null;

  return (
    <>
      <div className="section-head">
        <h2 id="chart-title">USD/INR mid market</h2>
        <div className="ranges" role="group" aria-label="Time range">
          {(Object.keys(LABELS) as Range[]).map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => { setRange(r); setHover(null); }}>
              {LABELS[r]}
            </button>
          ))}
        </div>
      </div>
      <p className="section-sub">
        Rupees per dollar. Higher means each dollar buys more. {data?.source ? `Source: ${data.source}.` : ''}
      </p>

      <div className="chart-box" ref={boxRef}>
        {geo ? (
          <svg
            viewBox={`0 0 ${width} ${H}`}
            height={H}
            role="img"
            aria-label={`USD to INR over ${LABELS[range]}: from ${first.v.toFixed(2)} to ${last.v.toFixed(2)}, low ${geo.lo.toFixed(2)}, high ${geo.hi.toFixed(2)}. Use arrow keys to inspect points.`}
            tabIndex={0}
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
          >
            <defs>
              <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {geo.yTicks.map((v) => (
              <g key={v}>
                <line className="gridline" x1={PAD.left} x2={width - PAD.right} y1={geo.y(v)} y2={geo.y(v)} />
                <text className="axis-label" x={width - PAD.right + 6} y={geo.y(v) + 4}>
                  {v.toFixed(v % 1 === 0 ? 0 : 2)}
                </text>
              </g>
            ))}
            {geo.xTicks.map((t) => (
              <text key={t} className="axis-label" x={geo.x(t)} y={H - 6} textAnchor="middle">
                {fmtTime(t, range)}
              </text>
            ))}
            <path d={geo.area} fill="url(#fill)" />
            <path d={geo.line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {last && (
              <circle cx={geo.x(last.t)} cy={geo.y(last.v)} r={4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
            )}
            {hp && (
              <g pointerEvents="none">
                <line x1={geo.x(hp.t)} x2={geo.x(hp.t)} y1={PAD.top} y2={PAD.top + geo.ih} stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="3 3" />
                <circle cx={geo.x(hp.t)} cy={geo.y(hp.v)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
              </g>
            )}
          </svg>
        ) : (
          <div className="chart-empty">{data?.error ? `History unavailable: ${data.error}` : 'Loading history…'}</div>
        )}
        {geo && hp && (
          <div
            className="tooltip"
            style={{ left: `${Math.min(Math.max((geo.x(hp.t) / width) * 100, 14), 86)}%` }}
            role="status"
          >
            <b>{inr(hp.v, 4)}</b>
            <br />
            {fmtTime(hp.t, range, true)}
          </div>
        )}
      </div>

      <dl className="stats">
        {change && (
          <div className="stat">
            <dt>Change over {LABELS[range]}</dt>
            <dd className={change.pct >= 0 ? 'up' : 'down'}>
              {change.pct >= 0 ? '▲' : '▼'} {signedPct(change.pct)}
              <small>{change.pct >= 0 ? 'More' : 'Fewer'} rupees per dollar, {inr(Math.abs(change.abs) * 1000, 0)} on $1,000</small>
            </dd>
          </div>
        )}
        {geo && (
          <div className="stat">
            <dt>{LABELS[range]} low to high</dt>
            <dd>
              {geo.lo.toFixed(2)} to {geo.hi.toFixed(2)}
              <small>A {(((geo.hi - geo.lo) / geo.lo) * 100).toFixed(2)}% swing</small>
            </dd>
          </div>
        )}
        {year && current !== null && (
          <div className="stat">
            <dt>Today vs the past year</dt>
            <dd>
              {year.percentile}th percentile
              <small>
                Year range {year.low.toFixed(2)} to {year.high.toFixed(2)}
              </small>
            </dd>
          </div>
        )}
      </dl>

      {points.length > 1 && (
        <details className="data-table">
          <summary>Show the numbers</summary>
          <table>
            <thead>
              <tr>
                <th>Range</th>
                <th>Open</th>
                <th>Low</th>
                <th>High</th>
                <th>Latest</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{LABELS[range]}</td>
                <td>{first.v.toFixed(4)}</td>
                <td>{geo?.lo.toFixed(4)}</td>
                <td>{geo?.hi.toFixed(4)}</td>
                <td>{last.v.toFixed(4)}</td>
              </tr>
            </tbody>
          </table>
        </details>
      )}
    </>
  );
}
