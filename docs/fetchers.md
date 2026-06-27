# Fetchers

The first collection phase adds automatic raw generation for official and X sources while keeping market collection conservative.

## Official fetcher

File: `lib/fetchers/official-fetcher.js`

Input:

- `OFFICIAL_SOURCE_URLS`: comma or newline separated official URLs.
- `OFFICIAL_DETAIL_FETCH_LIMIT`: maximum detail pages followed from schedule cards per run.
- `OFFICIAL_DETAIL_FETCH_DELAY_MS`: small delay between detail page requests.
- `OFFICIAL_STRICT_DETAIL_REVIEW`: set `true` only when schedule-only cards should create a review issue.

Recommended first value:

```bash
OFFICIAL_SOURCE_URLS=https://gashapon.jp/schedule/
OFFICIAL_DETAIL_FETCH_LIMIT=20
OFFICIAL_DETAIL_FETCH_DELAY_MS=150
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

The Gashapon schedule page is parsed as the discovery source. Detail pages linked from schedule cards are followed up to `OFFICIAL_DETAIL_FETCH_LIMIT` so variants can be generated from the official lineup images. A small `OFFICIAL_DETAIL_FETCH_DELAY_MS` keeps high-frequency runs polite. Schedule-only cards stay `review_required` in raw data, but they do not flood `import_issues` unless strict review mode is enabled.

## X fetcher

File: `lib/fetchers/x-fetcher.js`

Inputs:

- `X_BEARER_TOKEN`
- `X_SEARCH_QUERIES`
- `X_MONITOR_ACCOUNTS`
- `X_RAW_FEED_URLS`
- `X_RAW_FEED_SOURCES_JSON`
- `X_SEARCH_MAX_RESULTS`

Recommended first value:

```bash
X_SEARCH_QUERIES="ガシャポン OR gashapon OR ガチャガチャ"
X_MONITOR_ACCOUNTS=
X_SEARCH_MAX_RESULTS=25
```

Use search first because the forecast needs public intent signals, not only official announcements. If `X_BEARER_TOKEN` is set and no query is configured, the fetcher uses a small default query set for gacha demand, intent, and miniature compatibility.

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
- `MARKET_RAW_FEED_SOURCES_JSON`: JSON source config for multiple approved feeds/APIs.

Output:

- `data/generated/market-raw.json`

Market automatic scraping is not enabled as a primary path. The safe path is to connect an approved source that returns explicit listing data, then feed it into the existing classifier. Mixed listings must continue to support `unknown` and human review.

Recommended source config shape:

```json
[
  {
    "name": "market-export-main",
    "url": "https://example.com/gacha/market.json",
    "recordPath": "records",
    "headerEnv": {
      "authorization": "MARKET_FEED_AUTH_HEADER"
    }
  }
]
```

Each record should contain at least `title`, `price`, `status`, `source_url`, and either `listed_at` or `sold_at`. `variant_id` is optional; if missing, the existing classifier tries to match the official variant master and falls back to review.

## Stock / restock fetcher

File: `lib/fetchers/stock-fetcher.js`

Input:

- `STOCK_RAW_FEED_URLS`: comma or newline separated approved JSON feeds.
- `STOCK_RAW_FEED_SOURCES_JSON`: JSON source config for multiple official/shop/reviewed feeds.

Output:

- `data/generated/stock-raw.json`

Flow:

```text
fetch approved stock/restock feed
  -> generated restockEventsRaw / stockReportsRaw
  -> scripts/upsert-stock-data.mjs
  -> restock_events / stock_reports / import_issues
  -> availability_summary
```

The stock fetcher accepts reviewed JSON/export feeds only. It does not scrape shop pages or social sites directly. Ambiguous reports stay `review_required` and are visible in `/review`.

Recommended source config shape:

```json
[
  {
    "name": "shop-stock-export",
    "url": "https://example.com/gacha/stock.json",
    "recordPath": "data",
    "bearerTokenEnv": "STOCK_FEED_BEARER_TOKEN"
  }
]
```

The feed can return `restockEventsRaw`, `stockReportsRaw`, `records`, or `data`. Mixed `records` are bucketed into restock or stock reports by type/text.

## Data supply audit

Run this before raising Cron frequency or after adding new feeds:

```bash
npm run data:audit
```

This checks configured sources and generated raw files without making network requests. To test live feed/API responses, run:

```bash
npm run data:audit -- --fetch
```
