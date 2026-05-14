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
| official | `/api/ingest/official` | `npm run db:upsert-official` | hourly |
| market | `/api/ingest/market` | `npm run db:upsert-market` | every 15 minutes |
| x | `/api/ingest/x` | `npm run db:upsert-x` | every 10 minutes |
| stock | `/api/ingest/stock` | `npm run db:upsert-stock` | every 15 minutes |

`/api/ingest/all` is available for manual recovery, but Cron should prefer the individual task endpoints.

## App environment

Set these on the deployed Next app:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GACHA_DATA_SOURCE=supabase
INGEST_CRON_TOKEN=your-long-random-ingest-token
REVIEW_ADMIN_TOKEN=your-long-random-review-token
```

`INGEST_CRON_TOKEN` protects `/api/ingest/:task`. Keep it server-side only.

## Supabase Edge Function environment

Set these for `supabase/functions/ingest`:

```bash
APP_INGEST_BASE_URL=https://your-app.example
INGEST_CRON_TOKEN=same-token-as-the-app
SUPABASE_CRON_SECRET=another-long-random-secret
```

`SUPABASE_CRON_SECRET` protects the Edge Function itself. Cron jobs send it as `x-cron-secret`.

## Deploy function

```bash
supabase functions deploy ingest
supabase secrets set APP_INGEST_BASE_URL=https://your-app.example
supabase secrets set INGEST_CRON_TOKEN=your-long-random-ingest-token
supabase secrets set SUPABASE_CRON_SECRET=another-long-random-secret
```

## Create Cron jobs

Use `supabase/cron-ingestion.sql` as the template.

Recommended jobs:

- `gacha-ingest-official-hourly`: `7 * * * *`
- `gacha-ingest-market-15min`: `*/15 * * * *`
- `gacha-ingest-x-10min`: `*/10 * * * *`
- `gacha-ingest-stock-15min`: `5,20,35,50 * * * *`

The staggered stock schedule avoids all jobs starting at exactly the same minute.

## Fallback

Keep `.github/workflows/gacha-ingestion.yml` enabled. If Cron or the app endpoint fails, run the GitHub Action manually. It still executes `npm run db:upsert-all` in the safe official -> market -> x -> stock order.

## Daily review

1. Check Supabase Cron run history.
2. Check Edge Function logs for non-200 responses.
3. Open `/review` and handle high / medium issues.
4. If `unknown_variant` grows repeatedly for the same source text, improve the classifier or official master before raising frequency further.
