# Mercari MCP SOLD Intake PoC

Date: 2026-10-02

## Goal

Prove whether the official Mercari app/MCP search surface can provide completed-sale evidence that can be transformed into Gacha Lens market records without scraping Mercari pages or inventing transaction timestamps.

## Live read-only proof

Using the connected official Mercari app/MCP search tool with `exclude_sold=false`:

- `たまごっち めじるしアクセサリー ガチャ`: 116 results, 10 `sold`
- `サンリオ めじるしアクセサリー ガチャ`: 114 results, 10 `sold`
- `mofusand めじるしアクセサリー ガチャ`: 120 results, 51 `sold`

A Gacha Lens Production catalog variant was then tested read-only:

- series: `mofusand めじるしアクセサリー ベーカリーにゃん`
- variant: `クロワッサン`
- Gacha Lens variant id: `gashapon-4570118206282000-クロワッサン`
- Mercari search results: 115
- `sold` results: 60
- strict single-item matches retained: 4
- retained prices: JPY 300 / 300 / 320 / 333
- median: JPY 310
- arithmetic mean: JPY 313.25

Before this PoC the variant had no matching rows in `market_listings` and no series price history row.

## Search contract observed

The connected search tool currently exposes:

- natural-language keyword search
- max result limit of 120
- `exclude_sold=false`, which includes sold products
- product id
- title
- price
- status
- category
- condition
- seller id
- image URL
- relative created/updated ages

No pagination parameter is exposed by the connected search tool. This means the workable collection model is prospective repeated observation, not guaranteed exhaustive historical backfill.

The tool does not expose an exact completed-sale timestamp. Relative `updated_age` must not be converted into an invented `sold_at`. Gacha Lens should retain `sold_at = null` and use the exact collector observation time as `last_observed_at` until an authoritative sale timestamp is available.

## Code contract

`lib/fetchers/mercari-mcp-search-normalizer.js` converts one Mercari MCP search response into the existing Gacha Lens market record shape.

It intentionally:

- accepts only `status=sold`
- accepts only normal Mercari C2C IDs beginning with `m`
- requires exact search-query provenance
- deduplicates by Mercari product ID within the response
- preserves product ID and query provenance in `raw`
- does not synthesize `sold_at`
- marks commercial storage/republication authorization as unverified
- reports `production_write_ready=false`

## Production gate

This PoC proves technical read access and data-shape compatibility only.

Automatic Production persistence remains blocked until Mercari explicitly permits the connected app/MCP output to be stored, aggregated, and republished in a third-party commercial web service. The current public documentation confirms ChatGPT product search, but does not by itself establish those downstream rights.

No Production DB writes were performed by this PoC.
