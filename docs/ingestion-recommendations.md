# Ingestion recommendations

These are the recommended first production values for the free-operation ingestion phase. The goal is to keep the site useful without paid X API dependency or unsafe scraping, while preserving variant-first review safety.

## Official source recommendation

Use these first:

```bash
OFFICIAL_SOURCE_URLS=https://gashapon.jp/schedule/
OFFICIAL_DETAIL_FETCH_LIMIT=20
OFFICIAL_DETAIL_FETCH_DELAY_MS=150
OFFICIAL_STRICT_DETAIL_REVIEW=false
```

Decision:

- Primary: `https://gashapon.jp/schedule/`
- Secondary later: detail URLs discovered from the schedule page

Why:

- The schedule page is the most natural official master source because it exposes release timing by week.
- The current fetcher can parse schedule cards and then follow linked product detail pages to generate variant names and images.
- Detail following is capped by `OFFICIAL_DETAIL_FETCH_LIMIT`, so hourly cron jobs stay predictable.
- Detail requests are lightly delayed with `OFFICIAL_DETAIL_FETCH_DELAY_MS` to avoid bursty polling.

## Market source recommendation

Use approved CSV/JSON exports, reviewed feeds, or an approved marketplace API. Do not make uncontrolled marketplace scraping the primary path.

```bash
MARKET_RAW_FEED_URLS=
MARKET_RAW_FEED_SOURCES_JSON=
```

Decision:

- Primary now: `MARKET_RAW_FEED_SOURCES_JSON` with CSV/JSON export or approved feed/API.
- Keep ambiguous listings in `unknown` / `import_issues` until reviewed.

## Stock / restock recommendation

Use approved CSV/JSON exports or shop/official feeds first. Do not depend on X API for free operation.

```bash
STOCK_RAW_FEED_URLS=
STOCK_RAW_FEED_SOURCES_JSON=
STOCK_X_SEARCH_ENABLED=false
STOCK_X_SEARCH_QUERIES=
STOCK_X_MONITOR_ACCOUNTS=
STOCK_X_SEARCH_MAX_RESULTS=10
```

Decision:

- Primary now: `STOCK_RAW_FEED_SOURCES_JSON` with CSV/JSON export or approved feed.
- Secondary later: set `STOCK_X_SEARCH_ENABLED=true` only when X API is available and worth the cost.

Why:

- CSV/JSON exports cost nothing and are reviewable.
- The stock fetcher still sends ambiguous sightings to `import_issues`, so frequency does not force bad variant matches into public UI.
- Shop page scraping stays out of the primary path until an approved feed/API exists.

## X source recommendation

Do not use X as the primary free-operation method. Keep the fetcher, `x_reactions`, env names, and review flow for later, but leave API settings empty until paid access is worth it.

```bash
X_BEARER_TOKEN=
X_FETCH_ENABLED=false
X_USE_DEFAULT_QUERIES=false
X_SEARCH_QUERIES=
X_MONITOR_ACCOUNTS=
X_RAW_FEED_URLS=
X_RAW_FEED_SOURCES_JSON=
X_SEARCH_MAX_RESULTS=25
```

Decision:

- Primary now: disabled / optional.
- Later: low-frequency `X_SEARCH_QUERIES` or `X_MONITOR_ACCOUNTS` only when `X_BEARER_TOKEN` is available and `X_FETCH_ENABLED=true`.
- Reviewed X JSON feeds can still be connected through `X_RAW_FEED_SOURCES_JSON` without changing the UI.

## Cron recommendation

Use three Supabase Cron jobs for free operation:

```text
official: 7 * * * *
market:   17 * * * *      # hourly; use */30 * * * * only when the feed is reliable
stock:    37 * * * *      # hourly; use */30 * * * * only when the feed is reliable
x:        disabled        # manual/low-frequency only if X_BEARER_TOKEN exists
```

Decision:

- Keep official hourly. Official pages do not need minute-level pressure.
- Keep market and stock/restock at 30 minutes to 1 hour. Start hourly to avoid hammering free exports.
- Do not register the X cron job by default.
- Market and stock/restock remain approved CSV/JSON/feed/API only.

## Final environment names

Set these on the Next app:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GACHA_DATA_SOURCE=supabase
INGEST_CRON_TOKEN=
REVIEW_ADMIN_TOKEN=
OFFICIAL_SOURCE_URLS=https://gashapon.jp/schedule/
OFFICIAL_DETAIL_FETCH_LIMIT=20
OFFICIAL_DETAIL_FETCH_DELAY_MS=150
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

Set these on the Supabase Edge Function:

```bash
APP_INGEST_BASE_URL=
INGEST_CRON_TOKEN=
CRON_SHARED_SECRET=
```

Set these on GitHub Actions:

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

## Values the operator must still decide

- Actual deployed app URL for `APP_INGEST_BASE_URL`.
- Random secret values for `INGEST_CRON_TOKEN`, `REVIEW_ADMIN_TOKEN`, and `CRON_SHARED_SECRET`.
- Which safe market source to use first: approved API, manual CSV export, or reviewed JSON feed.
- Which stock/restock source to use first: shop/official CSV export, reviewed JSON feed, or approved API.
- Whether X API access becomes worth enabling later. If not, keep `X_BEARER_TOKEN` empty and `X_FETCH_ENABLED=false`.
