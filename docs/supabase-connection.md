# Supabase connection plan

The site remains variant-first. `series` is the parent product master, and every UI ranking/detail/schedule record should resolve to a row in `variants`.

## Tables

- `series`: official parent series master.
- `variants`: individual item master. Required for every ranking/detail target.
- `market_listings`: classified marketplace rows. `variant_id` is used for singles; set rows can keep `variant_id` null and use `series_id`.
- `x_reactions`: X signal rows with intent tags.
- `restock_events`: restock or replenishment events.
- `stock_reports`: stock state reports such as in stock, low, sold out, or restocked.
- `import_issues`: unresolved unknown/review_required records for human review.
- `source_weights`: source reliability weights.
- `forecast_snapshots`: optional persisted forecast breakdowns.

## Repository swap point

Current UI reads from `lib/series.js`. Set `GACHA_DATA_SOURCE=supabase` to make it try `createSupabaseGachaDataSource` from `lib/data/supabase-gacha-repository.js` first. If Supabase is not configured, cannot be reached, or does not yet contain `series` and `variants`, the site falls back to the file-based official input.

Keep ingestion adapters in `lib/data/ingestion-adapters.js` as the boundary for raw official, market, X, restock, and stock inputs.

## Environment

Required for UI reads:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-or-publishable-key
GACHA_DATA_SOURCE=supabase
GACHA_REPOSITORY_CACHE_TTL_MS=60000
```

`GACHA_REPOSITORY_CACHE_TTL_MS` controls how long the server keeps the Supabase-backed catalog in memory. The default is `60000` milliseconds, so Cron/upsert changes should appear on public UI routes within about one minute without requiring a redeploy.

Required only for local/server upsert scripts:

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Required for the admin review queue:

```bash
REVIEW_ADMIN_TOKEN=your-long-random-review-token
```

Never expose the service role key to the browser.

## First official-data upsert

1. Apply `supabase/schema.sql` in Supabase SQL editor.
2. Put the env vars above in `.env.local`.
3. Run:

```bash
npm run db:upsert-official
```

This upserts only `series` and `variants` from `lib/data/official-input.js`. Market, X, restock, and stock rows remain file-backed until their own ingestion phase.

## First market-data upsert

After `series` and `variants` exist, run:

```bash
npm run db:upsert-market
```

This classifies `lib/data/market-input.js` into `market_listings`, preserving `single`, `partial_set`, `full_set`, `rare_or_secret`, and `unknown`. Any `review_required` rows are also upserted into `import_issues` so `/review` can stay the human correction queue.

## First X-reaction upsert

After `series` and `variants` exist, run:

```bash
npm run db:upsert-x
```

This normalizes `lib/data/x-input.js` into `x_reactions`, keeps `source_type`, `intent_tags`, `confidence`, and `matched_variant_id`, and writes unresolved rows to `import_issues`. Forecast scoring already reads `x_reactions` from the repository, so DB-loaded X rows feed the upcoming score automatically.

## First restock / stock upsert

After `series` and `variants` exist, run:

```bash
npm run db:upsert-stock
```

This normalizes `lib/data/stock-input.js` into `restock_events` and `stock_reports`, keeps `source_type`, `confidence`, `matched_variant_id`, `series_id`, and `review_required`, and writes unresolved rows to `import_issues`. `lib/series.js` already builds each variant's `availability_summary` from repository-loaded restock and stock rows, so DB-loaded stock signals feed the UI summary without changing the public screens.

## Review flow

- Human page: `/review`
- JSON: `/api/import-issues`
- CSV: `/api/import-issues?format=csv`

Unknown records should stay in `import_issues` until a human assigns the correct `variant_id`, fixes the raw source, or marks the issue resolved.

`/review` and `/api/import-issues` are admin surfaces. They are noindexed, kept out of the public navigation, and require `REVIEW_ADMIN_TOKEN`. For API access, send either the review session cookie from `/review` or:

```bash
curl -H "x-review-admin-token: $REVIEW_ADMIN_TOKEN" https://your-site.example/api/import-issues
```

## Semi-automated operation

Run the full ingestion chain with one command:

```bash
npm run db:upsert-all
```

The command runs official master data first, then market listings, X reactions, and stock/restock signals. This order keeps `series` and `variants` as the source of truth before looser external signals are attached.

For local cron, schedule:

```bash
cd /path/to/gacha-site-start && npm run db:upsert-all
```

For GitHub Actions, use `.github/workflows/gacha-ingestion.yml` and set repository secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `YAHOO_SHOPPING_APP_ID`
- `YAHOO_SHOPPING_FETCH_ENABLED` (`true` after the app ID is added)
- `RAKUTEN_APPLICATION_ID`
- `RAKUTEN_ACCESS_KEY`
- optional `RAKUTEN_AFFILIATE_ID`

The workflow is manually runnable and also runs daily. Keep `import_issues` review as a daily human step before trusting new unknown data in ranking decisions.

## Remote schema check

After applying `supabase/schema.sql` in the Supabase SQL editor, verify that the remote schema exposes the latest columns:

```bash
npm run db:check-schema
```

The check confirms `matched_variant_id`, `market_listings.last_observed_at`, `market_listing_observations.observed_at`, and ingestion-run fields are readable. Once this passes, the upsert scripts should no longer print schema-cache fallback warnings for those columns.
