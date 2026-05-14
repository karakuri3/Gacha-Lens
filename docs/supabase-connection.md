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

Current UI reads from `lib/series.js`. The production swap should replace the initial records source with `createSupabaseGachaDataSource` from `lib/data/supabase-gacha-repository.js`, then pass those records into `createGachaRepository`.

Keep ingestion adapters in `lib/data/ingestion-adapters.js` as the boundary for raw official, market, X, restock, and stock inputs.

## Review flow

- Human page: `/review`
- JSON: `/api/import-issues`
- CSV: `/api/import-issues?format=csv`

Unknown records should stay in `import_issues` until a human assigns the correct `variant_id`, fixes the raw source, or marks the issue resolved.
