// Amount input validation, shared by the browser and the API.
import { AMOUNT_MAX, AMOUNT_MIN } from './config';

export const AMOUNT_HELP = `Whole dollars from $${AMOUNT_MIN} to $${AMOUNT_MAX.toLocaleString('en-US')}. Cents are rounded to the nearest dollar.`;

export type AmountResult = { ok: true; value: number; rounded: boolean } | { ok: false; error: string };

export function parseAmount(input: string): AmountResult {
  const s = input.trim().replace(/^\$/, '').trim();
  if (!s) return { ok: false, error: 'Enter an amount in US dollars.' };
  // Digits with optional thousands separators and up to two decimals. Nothing else is silently stripped.
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(s)) return { ok: false, error: 'Use digits only, like 1500 or 1,500.50.' };
  const n = Number(s.replace(/,/g, ''));
  const value = Math.round(n);
  if (value < AMOUNT_MIN) return { ok: false, error: `The smallest amount is $${AMOUNT_MIN}.` };
  if (value > AMOUNT_MAX) return { ok: false, error: `The largest amount is $${AMOUNT_MAX.toLocaleString('en-US')}.` };
  return { ok: true, value, rounded: value !== n };
}
