# Supabase Cron ingestion

Supabase Cron becomes the primary high-frequency runner. GitHub Actions remains the fallback runner for daily recovery and log comparison.

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
| market | `/api/ingest/market` | `npm run ingest:market` | every 15 minutes |
| x | `/api/ingest/x` | `npm run ingest:x` | every 10 minutes |
| stock | `/api/ingest/stock` | `npm run ingest:stock` | every 15 minutes |

`/api/ingest/all` is available for manual recovery, but Cron should prefer the individual task endpoints.

`official`, `x`, safe `market`, and safe `stock/restock` feeds now run `fetch -> generated raw snapshot -> normalize -> upsert`. `market` and `stock` intentionally accept only approved JSON/API/export feeds through `MARKET_RAW_FEED_URLS` and `STOCK_RAW_FEED_URLS`; uncontrolled scraping is not part of the primary path.

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
OFFICIAL_STRICT_DETAIL_REVIEW=false
X_BEARER_TOKEN=your-x-api-bearer-token
X_SEARCH_QUERIES="ガシャポン OR gashapon OR ガチャガチャ"
X_MONITOR_ACCOUNTS=
X_SEARCH_MAX_RESULTS=25
MARKET_RAW_FEED_URLS=
STOCK_RAW_FEED_URLS=
```

`INGEST_CRON_TOKEN` protects `/api/ingest/:task`. Keep it server-side only.

`OFFICIAL_SOURCE_URLS` can point to JSON feeds or official product/schedule HTML pages. Start with the schedule page; linked product detail pages are followed automatically up to `OFFICIAL_DETAIL_FETCH_LIMIT` with `OFFICIAL_DETAIL_FETCH_DELAY_MS` between requests. `X_BEARER_TOKEN` is required only when using X API queries or account monitoring. `X_RAW_FEED_URLS` can be used instead for an approved internal JSON feed.

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
- `gacha-ingest-market-15min`: `*/15 * * * *`
- `gacha-ingest-x-10min`: `*/10 * * * *`
- `gacha-ingest-stock-15min`: `5,20,35,50 * * * *`

The staggered stock schedule avoids all jobs starting at exactly the same minute.

## Fallback

Keep `.github/workflows/gacha-ingestion.yml` enabled. If Cron or the app endpoint fails, run the GitHub Action manually. It still executes `npm run db:upsert-all` in the safe official -> market -> x -> stock order.

## Market collection stance

Do not make uncontrolled marketplace scraping the primary path. Market data should enter through one of these safer inputs first:

- approved marketplace API
- owner-created export converted to `marketListingsRaw`
- explicit JSON feed reviewed before ingestion

Unknown or mixed listings must continue to fall into `import_issues` rather than being forced into a variant.

## Daily review

1. Check Supabase Cron run history.
2. Check Edge Function logs for non-200 responses.
3. Open `/review` and handle high / medium issues.
4. If `unknown_variant` grows repeatedly for the same source text, improve the classifier or official master before raising frequency further.
