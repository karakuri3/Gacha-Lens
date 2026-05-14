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
```

Required only for local/server upsert scripts:

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
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

## Review flow

- Human page: `/review`
- JSON: `/api/import-issues`
- CSV: `/api/import-issues?format=csv`

Unknown records should stay in `import_issues` until a human assigns the correct `variant_id`, fixes the raw source, or marks the issue resolved.
