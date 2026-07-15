# Market data automation

## Production path

The automatic market path uses provider-supported APIs and approved feeds only:

1. Yahoo Shopping Item Search API
2. Rakuten Ichiba Item Search API
3. Approved JSON/CSV feeds configured with `MARKET_RAW_FEED_SOURCES_JSON`

Mercari page scraping and Amazon page scraping are intentionally excluded. Neither site provides a generally available search API suitable for this service without separate approval or program requirements.

## Automatic query planning

`lib/fetchers/market-query-planner.js` builds search queries from the Supabase official master. No product-name spreadsheet is required.

- recently released and upcoming products receive most query slots
- one variant-specific query is mixed into recent product searches
- old products are rotated through the remaining slots
- provisional variants are never used as exact single-item targets

The default hourly run uses 24 planned queries. Yahoo consumes up to 24 and Rakuten up to 8. Adjust these only after checking provider limits and function duration.

## One-time credentials

Yahoo Shopping:

- `YAHOO_SHOPPING_APP_ID`
- `YAHOO_SHOPPING_FETCH_ENABLED=true`

Rakuten Ichiba:

- `RAKUTEN_APPLICATION_ID`
- `RAKUTEN_ACCESS_KEY`
- `RAKUTEN_MARKET_FETCH_ENABLED=true`
- optional `RAKUTEN_AFFILIATE_ID`

These are credentials, not recurring product data entry. The primary Cron path stores them as Supabase Edge Function secrets. The Edge Function forwards available provider credentials only to the authenticated Vercel ingestion request over TLS; they are injected into the child fetch process and are never returned in logs or API responses. GitHub Actions keeps the same names as fallback secrets.

## Stored data

Every run normalizes provider results into `market_listings`. A listing is classified as single, rare/secret, full set, partial set, or unknown against the official master.

Each fetched listing also writes one daily record to `market_listing_observations`. Repeated runs on the same day update that daily observation instead of creating unlimited rows. This preserves long-term asking-price history without exhausting the free database tier. Unknown or ambiguous records remain reviewable through `import_issues` and `/review`.

## Price meaning

Yahoo Shopping and Rakuten provide active shop asking prices. They do not prove a completed resale transaction. The UI must therefore keep `active_listing_median` separate from sold-price evidence and retain a low confidence label when sold records are absent.

## Recommended schedule

- market ingestion: every 60 minutes while building coverage
- reduce to every 30 minutes only after observing stable API and serverless duration for one week
- GitHub Actions: daily fallback

## Verification

```powershell
npm run fetch:market
npm run db:upsert-market
npm run data:audit
npm run db:check-schema
```

Check `/review` for provider errors, unknown listings, low variant-link rates, and the latest market ingestion duration.
