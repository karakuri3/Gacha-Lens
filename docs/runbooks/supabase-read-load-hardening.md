# Supabase read load hardening

## Confirmed recovery evidence

On 2026-08-16, a manual Supabase project restart restored a failing database to a
healthy read state. A direct `select 1` succeeded and REST responses returned to
HTTP 200/206. The database was approximately 82 MB with 17 connections (one
active), and `cron.job` was empty.

This proves that restart restored service. It does not prove one exact
infrastructure root cause. Application-side read amplification is independently
confirmed and is treated as a recurrence risk.

## Full-loader call paths

`fetchAllRows()` is reached through `fetchTable()` and `fetchOptionalTable()` in
`lib/data/supabase-gacha-repository.js`.

- Public product detail: `app/series/[slug]/page.js` -> `getRelatedSeries()` ->
  `getRepository()` -> `createPreferredRepository()` ->
  `createSupabaseGachaDataSource(...).loadRecords()`. The public catalog portion
  is limited to 600 variants by default, but market, X, restock, and stock signal
  tables use the full loader.
- Public category index and catalog navigation: `app/categories/page.js` and
  `app/series/page.js` -> `getCategoryCatalog()` ->
  `fetchSupabaseCategoryCatalog()` -> `fetchTable(series, "category")` -> full
  loader. Only the category column is selected.
- Admin-only review and operations APIs: `/review`, `/api/import-issues`,
  `/api/ops-health`, and `/api/ingest/[task]` -> `getDataModel()` ->
  `createAdminDataModel()` -> `createSupabaseGachaDataSource(...).loadRecords()`.
  The catalog is limited to 200 variants, while signal and import-issue tables
  use the full loader. These paths remain behind their existing admin/API
  controls.
- Production build: the current dynamic product/category routes are not
  prerendered. The static build does generate the sitemap, which has a separate
  path:
  `app/sitemap.js` -> `getPublicSitemapIdentifiers()` ->
  `fetchPublicSitemapRows()`. It was already sequential and does not use
  `fetchAllRows()`.
- Public runtime: product detail and category routes can exercise the public
  full-loader paths described above.
- Ingestion scripts: no direct caller of `createSupabaseGachaDataSource()` was
  found under `scripts/`; ingestion uses its dedicated REST and bounded
  persistence paths.
- Launch/readiness scripts: no direct full-repository caller was found. They may
  request public pages, which can exercise the public runtime paths above.
- Tests: repository source-contract tests inspect these paths; the load test now
  exercises the pagination implementation directly with deterministic fake
  pages.

The general no-limit catalog branch in `createSupabaseGachaDataSource()` still
supports an intentional full series/variants load. Current in-repository public
and admin callers pass positive catalog limits, so observed variants pagination
must not be attributed to that branch without request-level evidence. The public
sitemap remains a separate sequential variants scan.

## Pagination contract

Intentional full-table reads use exact count on the first page only, order every
page by `id ASC`, and request remaining 1,000-row pages sequentially. Maximum
page concurrency is one and does not grow with table size. A failed or short
middle page fails the complete read and does not return partial rows as success.

## Sitemap assessment

The public sitemap cache revalidates every 300 seconds. Its variants/parent
series join supplies variant URLs, parent series URLs, and franchise, brand, and
category facets, so removing the join would change the publication contract.
The query now pushes the existing public variant requirements (non-provisional,
linked series, non-empty slug and name) into PostgREST before rows are returned.
The URL generation and current publication population are unchanged.

Historical `pg_stat_statements` data makes this join a high cumulative-cost
optimization target. That is an optimization signal, not proof that sitemap
generation caused the outage.

## Performance Advisor follow-up

No index or migration is included in this phase. Suggested priority is based on
existing query paths:

| Foreign key | Expected benefit | Existing path |
| --- | --- | --- |
| `market_listings.series_id` | High | Public detail/ranking signal hydration repeatedly filters listings by selected series. |
| `restock_events.series_id` | High | Public availability and ranking signal hydration filters recent restock rows by series. |
| `stock_reports.series_id` | High | Public availability and ranking signal hydration filters recent stock rows by series. |
| `x_reactions.series_id` | Medium | Public signal hydration filters by selected series; X is optional in the current operating model. |
| `community_reports.series_id` | Low | No current predicate by `series_id` was found; admin reads are recent-row bounded and review mutations use report ID. |
| `forecast_snapshots.variant_id` | Low | No active repository query path was found in the current application code. |

Index creation requires separate schema/migration approval and Production query
plan evidence.

## Historical pg_net evidence

Large historical `net.http_post(...)` and `net._http_response` cleanup counts are
retained as historical evidence only. With `cron.job` currently empty, they do
not establish an active Supabase cron loop.
