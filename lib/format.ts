// Formatting helpers shared by server and client code.

const inrFmt = (digits: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function inr(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '₹–';
  return `₹${inrFmt(digits).format(n)}`;
}

export function num(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '–';
  return inrFmt(digits).format(n);
}

export function usd(n: number, digits?: number): string {
  if (!Number.isFinite(n)) return '$–';
  const d = digits ?? (Number.isInteger(n) ? 0 : 2);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);
}

export function signedPct(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '–';
  const s = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${s}${Math.abs(n).toFixed(digits)}%`;
}

export function timeAgo(iso: string | number | undefined, now = Date.now()): string {
  if (iso === undefined) return '';
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} days ago`;
}

/** Parse an ISO 8601 duration such as PT20H8M16.3S or P1DT2H into seconds. */
export function isoDurationSeconds(d: string | null | undefined): number | null {
  if (!d) return null;
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(d);
  if (!m) return null;
  const [, days, hours, mins, secs] = m;
  return (
    (Number(days) || 0) * 86400 + (Number(hours) || 0) * 3600 + (Number(mins) || 0) * 60 + (Number(secs) || 0)
  );
}

export function humanDuration(sec: number | null): string | undefined {
  if (sec === null || !Number.isFinite(sec)) return undefined;
  if (sec < 90) return 'Under 2 min';
  if (sec < 3600) return `About ${Math.round(sec / 60)} min`;
  if (sec < 36 * 3600) {
    const h = Math.round(sec / 3600);
    return `About ${h} hr${h === 1 ? '' : 's'}`;
  }
  const d = Math.round(sec / 86400);
  return `About ${d} day${d === 1 ? '' : 's'}`;
}

export function deliveryLabel(min?: string | null, max?: string | null): string | undefined {
  const a = isoDurationSeconds(min ?? null);
  const b = isoDurationSeconds(max ?? null);
  if (a === null && b === null) return undefined;
  if (a !== null && b !== null && Math.abs(a - b) > 3600) {
    const lo = humanDuration(a);
    const hi = humanDuration(b);
    return lo && hi ? `${lo} to ${hi.replace(/^About /, '').toLowerCase()}` : lo ?? hi;
  }
  return humanDuration(b ?? a);
}
