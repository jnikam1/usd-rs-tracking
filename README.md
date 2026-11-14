# Har Paisa: USD to INR tracker

Live USD/INR rate, which app gives the most rupees for your dollars **after every fee and markup**, and alerts when the rate moves.

Live: https://usd-rs-tracking.vercel.app

## What it shows

- **Mid market USD/INR**, refreshed every minute, with 24H / 7D / 30D / 1Y history and where today sits in the past year's range.
- **Provider leaderboard** for any amount ($10 to $100,000): rupees received, all in ₹ per $1, fee, spread versus mid, delivery speed.
  - `Live` rows come from Wise's public comparison API (bank funded quotes collected from each provider).
  - `Estimate` rows cover apps the live feed misses (Paysend, LemFi, Taptap Send, Aspora, ICICI Money2India, HDFC, Chase). They carry each provider's spread from a 13 Nov 2026 snapshot (SendMoneyCompare plus ICICI's rate page) onto today's live mid and apply the provider's published fee schedule.
- **First transfer promos** (Remitly's above mid welcome rate, Aspora, Wise, Western Union) with today's estimated payout.
- **Before you send**: funding method costs, the 1% US remittance tax (cash funded only), India gift tax rules, US gift and FBAR reporting. Every claim links to its source.

### How "₹ per $1 including all fees" is computed

```
received   = (amount − fee) × provider_rate        # or the provider's quoted receivedAmount
per_dollar = received / amount
vs_mid     = per_dollar / mid − 1
```

So a $1,000 Wise transfer with a $6.85 fee at a 94.2193 mid lands ₹93,574, which is ₹93.57 per dollar, 0.69% under mid.

## Alerts

**In the browser**: add rules (above X, below Y, moves more than Z% in 24 hrs) and turn on notifications. Rules live in your browser; they fire while the page is open, at most once per 6 hours each.

**Phone push, even when the page is closed** (via [ntfy](https://ntfy.sh), free, no account):

1. Install the ntfy app (iOS or Android) and subscribe to your topic name.
2. Set `NTFY_TOPIC` (and optionally the thresholds below) in the Vercel project's environment variables, then redeploy.
3. `.github/workflows/rate-alerts.yml` pings `/api/cron/check?mode=watch` hourly. Vercel Cron sends a morning digest daily at 16:05 UTC (8:05 AM Pacific) with the rate and the best app.

Alerts are deduplicated using ntfy's own 12 hour message cache, so there is no database. Test without sending: `/api/cron/check?dry=1&mode=digest`.

| Variable | Default | Meaning |
|---|---|---|
| `NTFY_TOPIC` | none | ntfy topic to post to. Pick something hard to guess. |
| `ALERT_ABOVE` | none | Alert when mid ≥ this (₹ per $) |
| `ALERT_BELOW` | none | Alert when mid ≤ this |
| `ALERT_MOVE_PCT` | `0.5` | Alert when the 24 hr move is at least this many percent |
| `ALERT_AMOUNT` | `1000` | Send amount used for the "best app" line |
| `CRON_SECRET` | none | If set, the check endpoint requires `Authorization: Bearer <secret>`; add the same value as a GitHub Actions secret |
| `APP_URL` | request host | Link opened when you tap a notification |

If the app lives somewhere other than `usd-rs-tracking.vercel.app`, set a GitHub Actions variable `APP_URL`.

## Data sources

| Data | Primary | Fallbacks |
|---|---|---|
| Live mid rate | Wise rates (`wise.com/rates/live`) | Yahoo Finance `INR=X`, ExchangeRate-API, ECB via Frankfurter, currency-api |
| History | Wise rate history | Yahoo Finance, ECB via Frankfurter (30D and 1Y) |
| Provider quotes | Wise comparison API (`/v4/comparisons`) | Snapshot based estimates |

`/api/health` shows which sources are answering. Caveat: Wise runs the comparison feed and ranks itself in it, and it does not include every app, which is why the estimates exist. Always confirm the final number in the provider's app.

## API

- `GET /api/rates`: mid rate, 24 hr change, 1 year range and percentile
- `GET /api/quotes?amount=1000`: ranked providers
- `GET /api/history?range=1d|7d|30d|1y`
- `GET /api/cron/check?mode=watch|digest[&dry=1]`
- `GET /api/health`

## Develop

```bash
npm install
MOCK_FX=1 npm run dev   # offline fixtures
npm run dev             # real data
npm test                # unit tests for the money math and alert rules
```

Next.js 16, React 19, no database. Not financial or tax advice.
