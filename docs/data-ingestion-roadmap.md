# Data ingestion roadmap

## Current evidence

The latest reviewed natural market run (`31611446987`) completed with five selected variants and ten successful discovery requests, but produced no candidates and no database writes. Its artifact recorded transport success only: it did not retain provider result counts or title-rejection counts. The selected searches were one exact query per variant and appended `ガチャ 単品`, which is not how many marketplace titles are written. Phase 8-A therefore improves recall with at most three deterministic searches per selected variant while keeping the existing strict single-item and parent-series checks.

The automatic Production scope remains market-only, released, priority 1, and limit 5. No write budget, daily budget, schedule, or rollout-policy setting changes in Phase 8-A.

## Phase order

### Phase 8-A: market retrieval effectiveness

- Use one stable approval query per variant with a bounded internal search sequence: official series plus variant, normalized official terms, and a variant-focused fallback when the variant name is informative.
- Enforce one reviewed request-capacity contract before network access: at most 30 Rakuten roots and 50 Yahoo roots, three discovery attempts and one affiliate enrichment per root, 320 diagnostic entries, and 960 retry-inclusive HTTP attempts. No diagnostic entry is truncated.
- Preserve candidate keys, provider listing identity, ordinary public URLs, and affiliate-independent selection.
- Record sanitized provider result counts, zero-result searches, pre-match rejection reasons, review counts, and accepted candidate keys.
- Verify the next natural run. Success requires either an accepted candidate or nonzero provider results with explicit safe rejection reasons.

### Phase 8-B: safe market coverage scaling

Start only after natural Phase 8-A evidence proves retrieval effectiveness. Increase coverage in small policy-reviewed steps while retaining the existing per-run and daily write controls. Do not increase query, candidate, or write budgets merely because transport succeeds.

### Phase 8-C: official new-product and release activation

The official collector already supports the Gashapon schedule/products pages, Bandai detail pages, and paged Takara Tomy Arts search/detail pages. It merges previous records, rotates detail refreshes, records parser/fetch issues, and upserts official series and variants. The current runner also invokes provisional cleanup, so automatic activation needs a dedicated bounded workflow, read-only preflight, parser fixtures for each live source, explicit write/delta limits, and separation of routine ingestion from destructive cleanup.

Current status: code-capable but automatic Production activation is unauthorized. There is no recent natural Production artifact proving all current source layouts. A read-only source/parser verification must precede activation; no source is declared healthy or stale without that evidence.

Safest activation path:

1. Run source/parser fixtures and a read-only live collection audit.
2. Isolate official upserts from provisional cleanup.
3. Add bounded delta and import-issue checks.
4. Activate a low-frequency official-only schedule under a separate approval.

Expected data: official series, public/formal variants, release dates, prices, official URLs, images, lineup details, and parser/fetch issues.

### Phase 8-D: stock and restock activation

The stock collector accepts approved JSON/CSV feeds through `STOCK_RAW_FEED_SOURCES_JSON` or `STOCK_RAW_FEED_URLS`, normalizes restock events and stock reports, deduplicates source identities, and sends ambiguous links to review. X search remains optional and disabled by default.

Current status: normalization and persistence are code-capable, but there is no autonomous approved stock source in the primary path and no recent Production artifact proving feed freshness. This is the principal blocker, not the database schema.

Safest activation path:

1. Approve one stable shop, distributor, or operator export/feed contract.
2. Add fixture and freshness checks for that feed.
3. Run a read-only collection audit with variant-link and review-rate reporting.
4. Activate stock/restock with strict source allowlists, bounded writes, and import-issue monitoring.

Expected data: `restock_events`, `stock_reports`, source type, report time, shop/region, normalized status, matched variant/series when unambiguous, and review issues otherwise.

### Phase 8-E: coverage and quality monitoring

Track provider result rate, accepted/review rate, no-result variants, stale official records, stock-feed freshness, per-source error rate, duplicate identity rate, and public market coverage. Expansion remains evidence-led and does not use affiliate commission in ranking, forecasting, query priority, or source selection.

## Activation boundaries

Official and stock schedules remain inactive in this phase. Enabling a workflow, changing Repository Variables or Secrets, changing Vercel environment values, dispatching a workflow, or writing Production data requires separate explicit approval.
