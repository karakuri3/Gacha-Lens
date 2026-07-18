# Fetchers

The free-operation collection phase uses official pages first, then approved market and stock/restock CSV or JSON exports. X support remains in place, but it is optional and disabled from the primary cron path unless paid API access is available.

## Official fetcher

File: `lib/fetchers/official-fetcher.js`

Input:

- `OFFICIAL_SOURCE_URLS`: comma or newline separated official URLs.
- `OFFICIAL_DETAIL_FETCH_LIMIT`: maximum detail pages followed from schedule cards per run.
- `OFFICIAL_DETAIL_FETCH_DELAY_MS`: small delay between detail page requests.
- `OFFICIAL_TARTS_PAGES_PER_RUN`: Takara Tomy Arts history pages visited per run. Defaults to `4`.
- `OFFICIAL_TARTS_MAX_PAGE`: temporary safety cap used until the live product count is parsed.
- `OFFICIAL_STRICT_DETAIL_REVIEW`: set `true` only when schedule-only cards should create a review issue.

Recommended first value:

```bash
OFFICIAL_SOURCE_URLS=https://gashapon.jp/schedule/,https://gashapon.jp/products/,https://www.takaratomy-arts.co.jp/items/gacha/search.html?order=release&p=1&sort=0
OFFICIAL_DETAIL_FETCH_LIMIT=60
OFFICIAL_DETAIL_FETCH_DELAY_MS=250
OFFICIAL_TARTS_PAGES_PER_RUN=4
OFFICIAL_TARTS_MAX_PAGE=80
OFFICIAL_STRICT_DETAIL_REVIEW=false
```

Output:

- `data/generated/official-raw.json`

Flow:

```text
fetch official URL
  -> parse JSON feed, official schedule cards, detail pages, or HTML metadata / JSON-LD
  -> generated official raw
  -> scripts/upsert-official-data.mjs
  -> series / variants / import_issues
```

The Gashapon schedule/products pages and the Takara Tomy Arts gacha catalog are parsed as official discovery sources. Takara Tomy Arts page 1 is refreshed every run, while a persisted cursor walks four history pages at a time. The current catalog is about 64 pages, so an hourly job completes a discovery pass in roughly 16 runs without sending a burst of thousands of requests.

Detail pages linked from both manufacturers are followed up to `OFFICIAL_DETAIL_FETCH_LIMIT`. Previously discovered official URLs are read from Supabase into a lightweight detail queue on every run, so serverless temporary storage is not required and older provisional variants continue to be replaced after their catalog page leaves the current page batch. When no local page cursor exists, Takara Tomy Arts history pages rotate deterministically by hour. Gashapon variant images and Takara Tomy Arts lineup text become the canonical variant master. A small `OFFICIAL_DETAIL_FETCH_DELAY_MS` keeps high-frequency runs polite. Discovery-only products stay `review_required` in raw data, but they do not flood `import_issues` unless strict review mode is enabled.

## X fetcher

File: `lib/fetchers/x-fetcher.js`

Status: optional / paid-API dependent. Keep this structure for later, but do not treat `X_BEARER_TOKEN` as required for free operation.

Inputs:

- `X_BEARER_TOKEN`
- `X_FETCH_ENABLED`: default `false`; set `true` only when you intentionally want to call X API.
- `X_USE_DEFAULT_QUERIES`: default `false`; set `true` only when default broad queries are acceptable.
- `X_SEARCH_QUERIES`
- `X_MONITOR_ACCOUNTS`
- `X_RAW_FEED_URLS`
- `X_RAW_FEED_SOURCES_JSON`
- `X_SEARCH_MAX_RESULTS`

Recommended first value:

```bash
X_BEARER_TOKEN=
X_FETCH_ENABLED=false
X_USE_DEFAULT_QUERIES=false
X_SEARCH_QUERIES=
X_MONITOR_ACCOUNTS=
X_SEARCH_MAX_RESULTS=25
```

Leave these empty for the free-operation path. If `X_BEARER_TOKEN` is available later, set `X_FETCH_ENABLED=true`, add narrow `X_SEARCH_QUERIES` or monitored accounts, and run the X task manually or at low frequency.

Output:

- `data/generated/x-reactions-raw.json`

Flow:

```text
fetch X search/account/raw feed
  -> generated X raw
  -> scripts/upsert-x-reactions.mjs
  -> x_reactions / import_issues
  -> forecast score
```

Posts that cannot be matched to a variant stay `review_required`.

`X_RAW_FEED_SOURCES_JSON` can connect reviewed exports or approved API endpoints without changing code:

```json
[
  {
    "name": "reviewed-x-export",
    "url": "https://example.com/gacha/x.json",
    "recordPath": "data.posts",
    "headerEnv": {
      "x-api-key": "X_REVIEWED_FEED_API_KEY"
    }
  }
]
```

## Market safety

File: `lib/fetchers/market-fetcher.js`

Input:

- `MARKET_RAW_FEED_URLS`: comma or newline separated approved JSON feeds.
- `MARKET_RAW_FEED_SOURCES_JSON`: source config for approved CSV/JSON exports, feeds, or APIs.
- `YAHOO_SHOPPING_APP_ID`: Yahoo Developer Network Client ID.
- `YAHOO_SHOPPING_FETCH_ENABLED`: enables the Yahoo Shopping official API source.
- `RAKUTEN_APPLICATION_ID`: Rakuten Web Service application ID.
- `RAKUTEN_ACCESS_KEY`: Rakuten Web Service access key required by the current Ichiba Item Search API.
- `RAKUTEN_AFFILIATE_ID`: optional Rakuten affiliate ID.
- `MARKET_QUERY_LIMIT_PER_RUN`: total automatic queries generated from the official master. Defaults to `24`.
- `MARKET_QUERY_HOT_DAYS`: prioritization window before today. Defaults to `120`.
- `MARKET_QUERY_LOOKBACK_DAYS`: secondary history window. Defaults to `540`.
- `RAKUTEN_MARKET_QUERY_LIMIT`: Rakuten queries per run. Defaults to `8`.
- `RAKUTEN_MARKET_HITS`: results per keyword, capped at 30. Defaults to `20`.
- `RAKUTEN_REQUEST_DELAY_MS`: polite delay between Rakuten keyword requests. Defaults to `1200`.
- `RAKUTEN_REQUEST_ORIGIN`: origin/referer sent for Rakuten allowed website checks. Defaults to `https://gachalens.vercel.app`.

Output:

- `data/generated/market-raw.json`

Market automatic scraping is not enabled as a primary path. Search terms are generated automatically from the official Supabase master and sent to the Yahoo Shopping and Rakuten official APIs. Approved CSV/JSON feeds remain supported. Mixed listings continue to support `unknown` and human review.

Rakuten Ichiba can be used as an approved API source. `fetch:market` converts Rakuten Item Search results into `marketListingsRaw` records with `source: "rakuten"`, then the normal classifier links them to official variants when possible. If `RAKUTEN_APPLICATION_ID` is present but `RAKUTEN_ACCESS_KEY` is missing, the fetcher writes a review issue instead of failing the whole ingestion run.

Yahoo Shopping can be used through the official Item Search API. Results are stored with `source: "yahoo_shopping"`. Both providers expose active asking prices, not proof of completed resale transactions, so confidence remains limited until an approved sold-listing feed is connected.

Recommended source config shape:

```json
[
  {
    "name": "market-export-main",
    "url": "https://example.com/gacha/market.json",
    "format": "json",
    "recordPath": "records",
    "headerEnv": {
      "authorization": "MARKET_FEED_AUTH_HEADER"
    }
  }
]
```

CSV exports are also supported:

```json
[
  {
    "name": "market-csv-export",
    "url": "https://example.com/gacha/market.csv",
    "format": "csv"
  }
]
```

Local files inside the project workspace are supported for manual exports:

```json
[
  {
    "name": "local-market-csv",
    "filePath": "data/imports/market.csv",
    "format": "csv"
  }
]
```

Each record should contain at least `title`, `price`, `status`, `source_url`, and either `listed_at` or `sold_at`. `variant_id` is optional; if missing, the existing classifier tries to match the official variant master and falls back to review.

## Stock / restock fetcher

File: `lib/fetchers/stock-fetcher.js`

Input:

- `STOCK_RAW_FEED_URLS`: comma or newline separated approved JSON feeds.
- `STOCK_RAW_FEED_SOURCES_JSON`: source config for approved CSV/JSON exports, official/shop feeds, or reviewed APIs.
- `STOCK_X_SEARCH_ENABLED`: default `false`. Set `true` only when X API access is available and you intentionally want optional stock monitoring.
- `STOCK_X_SEARCH_QUERIES`: optional stock/restock search queries.
- `STOCK_X_MONITOR_ACCOUNTS`: optional official/shop accounts to monitor for stock/restock words.
- `STOCK_X_SEARCH_MAX_RESULTS`: defaults to `10`, capped at `100`.

Output:

- `data/generated/stock-raw.json`

Flow:

```text
fetch approved stock/restock CSV/JSON feed/export
  -> generated restockEventsRaw / stockReportsRaw
  -> scripts/upsert-stock-data.mjs
  -> restock_events / stock_reports / import_issues
  -> availability_summary
```

The stock fetcher does not scrape shop pages. It accepts reviewed CSV/JSON exports and approved feeds as the primary path. X API search/account results are optional and disabled by default. Ambiguous reports stay `review_required` and are visible in `/review`.

Recommended first value:

```bash
STOCK_X_SEARCH_ENABLED=false
STOCK_X_SEARCH_QUERIES=
STOCK_X_MONITOR_ACCOUNTS=
STOCK_X_SEARCH_MAX_RESULTS=10
```

Recommended source config shape:

```json
[
  {
    "name": "shop-stock-export",
    "url": "https://example.com/gacha/stock.json",
    "format": "json",
    "recordPath": "data",
    "bearerTokenEnv": "STOCK_FEED_BEARER_TOKEN"
  }
]
```

CSV exports are also supported:

```json
[
  {
    "name": "stock-csv-export",
    "filePath": "data/imports/stock.csv",
    "format": "csv"
  }
]
```

The feed can return `restockEventsRaw`, `stockReportsRaw`, `records`, or `data`. Mixed `records` are bucketed into restock or stock reports by type/text. CSV rows should contain `text`, `status`, `source_type`, `source_url`, `reported_at`, and optionally `variant_id`, `series_id`, `shop_name`, and `region`.

## Data supply audit

Run this before raising Cron frequency or after adding new feeds:

```bash
npm run data:audit
```

This checks configured sources and generated raw files without making network requests. To test live feed/API responses, run:

```bash
npm run data:audit -- --fetch
```

To measure what is actually stored in Supabase, including classification and variant-link coverage, run:

```bash
npm run data:audit-remote
```
