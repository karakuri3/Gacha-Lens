# Supabase Cron ingestion

Supabase Cron becomes the primary free-operation runner. GitHub Actions remains the fallback runner for daily recovery and log comparison.

## Runtime shape

```text
Supabase Cron
  -> Supabase Edge Function: ingest
  -> Next admin endpoint: /api/ingest/:task
  -> existing Node upsert scripts
  -> Supabase tables + import_issues
```

The public UI still reads variant-first data through the repository layer. Unknown or ambiguous records continue to go to `import_issues` and `/review`.

## Tasks

| Task | Endpoint | Script | Recommended frequency |
| --- | --- | --- | --- |
| official | `/api/ingest/official` | `npm run ingest:official` | hourly |
| market | `/api/ingest/market` | `npm run ingest:market` | every 30-60 minutes |
| stock | `/api/ingest/stock` | `npm run ingest:stock` | every 30-60 minutes |
| x | `/api/ingest/x` | `npm run ingest:x` | disabled by default; manual/low-frequency only with `X_BEARER_TOKEN` |

`/api/ingest/all` is available for manual recovery, but Cron should prefer the individual task endpoints.

`official`, safe `market`, and safe `stock/restock` now run `fetch -> generated raw snapshot -> normalize -> upsert`. `official` uses the official schedule/detail pages. `market` and `stock` intentionally accept approved CSV/JSON/API/export feeds; uncontrolled marketplace or shop scraping is not part of the primary path. X remains available as an optional task, but it is not part of the default free Cron setup.

## App environment

Set these on the deployed Next app:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GACHA_DATA_SOURCE=supabase
INGEST_CRON_TOKEN=your-long-random-ingest-token
REVIEW_ADMIN_TOKEN=your-long-random-review-token
OFFICIAL_SOURCE_URLS=https://gashapon.jp/schedule/
OFFICIAL_DETAIL_FETCH_LIMIT=20
OFFICIAL_DETAIL_FETCH_DELAY_MS=150
OFFICIAL_SOURCE_FETCH_DELAY_MS=200
OFFICIAL_SCHEDULE_PAST_MONTHS=6
OFFICIAL_SCHEDULE_FUTURE_MONTHS=6
# Keep blank during normal Cron operation. Use 2019-01 only for a manual bootstrap.
OFFICIAL_HISTORY_START_MONTH=
OFFICIAL_STRICT_DETAIL_REVIEW=false
MARKET_RAW_FEED_URLS=
MARKET_RAW_FEED_SOURCES_JSON=
STOCK_RAW_FEED_URLS=
STOCK_RAW_FEED_SOURCES_JSON=
STOCK_X_SEARCH_ENABLED=false
STOCK_X_SEARCH_QUERIES=
STOCK_X_MONITOR_ACCOUNTS=
STOCK_X_SEARCH_MAX_RESULTS=10
X_BEARER_TOKEN=
X_FETCH_ENABLED=false
X_USE_DEFAULT_QUERIES=false
X_SEARCH_QUERIES=
X_MONITOR_ACCOUNTS=
X_RAW_FEED_URLS=
X_RAW_FEED_SOURCES_JSON=
X_SEARCH_MAX_RESULTS=25
```

`INGEST_CRON_TOKEN` protects `/api/ingest/:task`. Keep it server-side only.

`OFFICIAL_SOURCE_URLS` can point to JSON feeds or official product/schedule HTML pages. Start with the schedule page; linked product detail pages are followed automatically up to `OFFICIAL_DETAIL_FETCH_LIMIT` with `OFFICIAL_DETAIL_FETCH_DELAY_MS` between requests. Normal Cron reads the rolling past/future month window. Keep `OFFICIAL_HISTORY_START_MONTH` blank except during a deliberate historical bootstrap. `MARKET_RAW_FEED_SOURCES_JSON` and `STOCK_RAW_FEED_SOURCES_JSON` are the free-operation primary inputs. `X_BEARER_TOKEN` is optional, and X API calls stay disabled while `X_FETCH_ENABLED=false`.

## Supabase Edge Function environment

Set these for `supabase/functions/ingest`:

```bash
APP_INGEST_BASE_URL=https://your-app.example
INGEST_CRON_TOKEN=same-token-as-the-app
CRON_SHARED_SECRET=another-long-random-secret
```

`CRON_SHARED_SECRET` protects the Edge Function itself. Cron jobs send it as `x-cron-secret`.

## Deploy function

```bash
supabase functions deploy ingest
supabase secrets set APP_INGEST_BASE_URL=https://your-app.example
supabase secrets set INGEST_CRON_TOKEN=your-long-random-ingest-token
supabase secrets set CRON_SHARED_SECRET=another-long-random-secret
```

## Create Cron jobs

Use `supabase/cron-ingestion.sql` as the template.

Current deployed project ref:

```text
ihcudkfspzuixsqsvoku
```

The SQL template already uses that project ref. Replace only:

```text
<PASTE_CRON_SHARED_SECRET_HERE>
```

with the same `CRON_SHARED_SECRET` value set on the Edge Function.

Recommended jobs:

- `gacha-ingest-official-hourly`: `7 * * * *`
- `gacha-ingest-market-hourly`: `17 * * * *`
- `gacha-ingest-stock-hourly`: `37 * * * *`

The template also unschedules the old `gacha-ingest-x-10min`, `gacha-ingest-market-15min`, and `gacha-ingest-stock-15min` jobs if they exist.

## Fallback

Keep `.github/workflows/gacha-ingestion.yml` enabled. If Cron or the app endpoint fails, run the GitHub Action manually. With `X_FETCH_ENABLED=false`, `npm run db:upsert-all` executes the safe official -> market -> stock order. X remains available through an explicit `--task=x` run after credentials are configured.

## Market collection stance

Do not make uncontrolled marketplace scraping the primary path. Market data should enter through one of these safer inputs first:

- approved marketplace API
- owner-created CSV export
- owner-created export converted to `marketListingsRaw`
- explicit JSON feed reviewed before ingestion

Unknown or mixed listings must continue to fall into `import_issues` rather than being forced into a variant.

Rows whose id or source URL explicitly contains `sample` or `test` are excluded unless `ALLOW_NON_PRODUCTION_DATA=true`. Keep both `ALLOW_NON_PRODUCTION_DATA` and `INCLUDE_SAMPLE_DATA` false in production. Market, X, and stock classifiers load the Supabase official master before matching; they do not use the small local seed catalog as the production dictionary.

## Daily review

1. Check Supabase Cron run history.
2. Check Edge Function logs for non-200 responses.
3. Open `/review` and handle high / medium issues.
4. If `unknown_variant` grows repeatedly for the same source text, improve the classifier or official master before raising frequency further.
5. Check `/review` ingestion history. A recent successful run with unchanged row counts means the collector worked but the source had no new records; a failed or missing run means the pipeline itself needs attention.
