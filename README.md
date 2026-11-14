# Har Paisa: USD to INR comparison

Helps someone sending USD to India see which available comparison gives the most INR after costs, how reliable that number is, and whether their rate target has been reached.

## What every number tells you

Each provider row carries two separate labels.

**Origin**: where the number comes from.

| Origin | Meaning |
|---|---|
| Provider quote | The provider's own documented quote integration priced this exact amount. Today that is Wise's unauthenticated quote, which Wise documents as illustrative pricing. |
| Comparison estimate | Wise's comparison data. Wise collects provider quotes about once an hour and applies each collected markup to the current mid rate, for bank transfer pay-in and pay-out. Informational. |
| Nov 13 model | Our model: a provider's spread on a $1,000 transfer in the 13 Nov 2026 research snapshot, carried onto today's mid rate. Never ranked as the best offer. |
| Demo data | Offline fixtures (`MOCK_FX=1`, local only). |

**Freshness**: fresh, stale or out of date, from source-specific rules. Rows downgrade themselves in the browser as they age, so a failed refresh cannot leave an old figure looking current.

Every row also records the amount, corridor, countries as reported, funding and payout method, source, access mode, collection, retrieval and expiry times, and the model date. The detail drawer shows all of it.

Amounts are **fee inclusive**: the amount you enter is your total USD budget and fees come out of it. Recipient amounts returned by a validated source are kept as is, never recomputed. Fees that no source quoted, published or observed are shown as **unknown**, never $0; the payout is then an upper bound and the row is not ranked.

## Data sources and access

| Data | Source | Access |
|---|---|---|
| Mid market rate | Wise live rate; fallbacks Yahoo Finance, ExchangeRate-API, ECB via Frankfurter, currency-api (daily sources are labelled and stay stale) | Public |
| History | Wise rate history; fallbacks Yahoo Finance, ECB via Frankfurter | Public |
| Wise's own price and funding method breakdown | `POST /2026Q4/quotes` (unauthenticated quote) | Documented by Wise for displaying example rates |
| Other providers | `GET /2026Q4/comparisons` | **Wise documents this API as requiring authentication.** Set `WISE_API_TOKEN` for the supported integration. The endpoint currently also answers without a token; that is opt-in only (`WISE_COMPARISON_PUBLIC=1`), undocumented and may stop working. With neither set, only Wise's quote and the research models are shown. |

Tokens stay on the server. Validation rejects quotes for the wrong route (for example State Bank of India's India-sourced quote), malformed or inconsistent numbers, and missing or out-of-limit timestamps. `/api/health` lists every source and every excluded quote with the reason.

### Freshness rules (environment variables, defaults shown)

| Source | Fresh up to | Accepted as stale up to |
|---|---|---|
| Mid rate | `MID_FRESH_MINUTES=30` | `MID_MAX_AGE_HOURS=72` |
| Comparison estimates | `COMPARISON_FRESH_HOURS=6` | `COMPARISON_MAX_AGE_HOURS=72` (older are rejected) |
| Wise quote | until its expiry (30 min) | `PROVIDER_QUOTE_MAX_AGE_HOURS=6` |
| Research models | never fresh | `SNAPSHOT_MAX_AGE_DAYS=45` (then hidden) |

History is only charted when a source covers the requested window; otherwise the next source is tried. The 24 hour change needs a baseline within 10% of the lookback (at least an hour); without one it is reported as unavailable and movement alerts are skipped.

## Alerts

There are two separate systems, and the interface says so.

**Browser only: checked while this page is open.** Rules live in your browser (localStorage). Nothing runs after the tab closes.

**Server configured: checked on the published schedule.** Hourly threshold and movement checks (GitHub Actions) and a daily summary at 16:05 UTC (Vercel Cron), delivered through [ntfy](https://ntfy.sh). The page shows only whether this is configured, never the topic, secret or thresholds.

Setup:

1. Vercel environment: `CRON_SECRET` (required in production; the check refuses to run without it), `NTFY_TOPIC`, and optionally `ALERT_ABOVE`, `ALERT_BELOW`, `ALERT_MOVE_PCT` (default 0.5), `ALERT_AMOUNT` (default 1000), `APP_URL`.
2. GitHub: repository variable `APP_URL` and secret `CRON_SECRET` with the same value. The hourly job is skipped until `APP_URL` is set. Any non-2xx answer fails the run: 401 wrong secret, 429 rate limited, 502 a notification failed, 503 missing configuration or no usable rate.
3. Subscribe to the topic in the ntfy app.

Calls must send `Authorization: Bearer <CRON_SECRET>`. `?dry=1` evaluates without sending anything. Alerts are skipped when the rate is stale or the 24 hour baseline is missing, and provider figures in messages say whether they are estimates and how old they are.

**Delivery is best effort, not exactly once.** Before sending, the check reads the last 12 hours of the ntfy topic and skips keys already sent. That read-then-send is not atomic, so two checks at the same moment could both send. The workflow serialises its own runs and the daily summary uses separate keys, which keeps duplicates rare.

## API

- `GET /api/quotes?amount=1000` ranked rows, summary, sources and excluded quotes (amount: whole dollars 10 to 100,000; malformed input returns 400)
- `GET /api/rates` mid rate, 24 hour change or the reason it is unavailable, 1 year range
- `GET /api/history?range=1d|7d|30d|1y`
- `GET /api/alerts/status` booleans and schedule only
- `GET /api/cron/check?mode=watch|digest[&dry=1]` requires `Authorization: Bearer <CRON_SECRET>`
- `GET /api/health`

## Develop

```bash
npm install
MOCK_FX=1 npm run dev   # offline demo data, includes rejected quotes on purpose
npm run dev             # real data
npm test                # money math, validation, fallbacks, loader, offers, cron
npm run typecheck
npm run build
```

Next.js 16, React 19, TypeScript, no UI framework, no database. Fonts are bundled (Newsreader, Schibsted Grotesk).

## Limitations

- Comparison data covers about ten providers and is an estimate; apps outside it (Paysend, LemFi, Aspora, ICICI and others) only appear as research models.
- Wise's public quote has no ACH direct debit price; Wise's comparison feed reports a lower US price without stating the pay-in method. Both are shown, labelled.
- Welcome offers and their caps come from the 13 Nov 2026 research; the Remitly premium is a model assumption.
- Not financial or tax advice.
