# Exact Provider Re-observation Read Contract

Issue: #135
Parent: #119
Depends on: #128 / PR #150

## Purpose

Gacha Lens builds market history by rechecking the exact marketplace listing already stored in `market_listings`.

This lane is not a discovery/search lane. It does not use product-name keyword rediscovery when an exact persisted provider identity exists.

The first supported providers are:

- Rakuten Ichiba
- Yahoo Shopping

The output of this phase is a dry-run plan only. Production database mutation and automatic execution are outside this contract.

## Identity rule

The persisted listing identity remains authoritative:

- provider
- provider listing/item code
- canonical public item URL
- durable Gacha Lens listing ID

The provider response is normalized and passed into the merged `planMarketReobservation()` contract from PR #150.

Provider/item-code/URL identity changes fail closed. There is no keyword fallback after an identity failure.

## Credential destination rule

TLS alone is not sufficient authorization to receive provider credentials.

Credential-bearing requests are restricted to the reviewed official API destination for each provider:

### Rakuten

`https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701`

### Yahoo Shopping

`https://shopping.yahooapis.jp/ShoppingWebService/V1/json/itemLookup`

The endpoint validator requires the reviewed HTTPS host and exact path. It rejects:

- arbitrary HTTPS hosts
- official host with a different path
- HTTP
- embedded username/password
- pre-supplied query parameters
- fragments

Provider requests also use `redirect: error` so a redirect cannot silently expand credential scope to another destination.

Tests use injected `fetchImpl` fixtures. Testability is not a reason to weaken the destination allowlist.

## Rakuten

Official API:

- Rakuten Ichiba Item Search API `2026-07-01`
- endpoint: `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701`

The exact read uses:

- `applicationId` query parameter
- `accessKey` request header
- persisted `itemCode` query parameter
- `hits=1`
- output fields limited to `itemCode,itemPrice,itemUrl,availability`

The request does **not** contain a keyword and does not use affiliate enrichment.

The access key is never placed in the URL by this lane.

Minimum same-provider request spacing for the dry-run runner is 1200 ms.

## Yahoo Shopping

Official API:

- 商品コード検索(商品詳細) / `itemLookup`
- JSONP endpoint: `https://shopping.yahooapis.jp/ShoppingWebService/V1/json/itemLookup`

The exact read uses:

- `appid`
- persisted `itemcode` (`storeId_storeItemCode` identity)
- `responsegroup=large`
- fixed callback `gachaLensItemLookupV1`

The request contains no keyword.

The JSONP parser accepts only the exact configured callback wrapper and valid JSON. Arbitrary callback names or malformed wrapper/body fail closed.

`Availability` must be one of:

- `instock`
- `outofstock`

Unknown/missing availability is not guessed.

Yahoo documentation examples may return historical `http://store.shopping.yahoo.co.jp/...` item URLs. The adapter may upgrade only the scheme from HTTP to HTTPS on the bounded official Yahoo item hosts before canonical identity comparison. It does not rewrite host/path/item identity.

Minimum same-provider request spacing for the dry-run runner is 1000 ms.

## Price rule

A seen provider response must contain a positive integer price.

The following fail closed:

- missing price
- empty price
- zero / `"0"`
- negative price
- non-integer price

No provider anomaly can become synthetic zero-yen market evidence.

## Lifecycle rule

Exact provider reads may normalize only ordinary current listing states:

- `active`
- `sold_out`

`not_found` does **not** mean a completed sale and must not fabricate `sold`.

Transient network/server/rate-limit failures also produce no lifecycle mutation.

Completed/sold transaction evidence remains a separate evidence source/problem.

## Retry and pacing

Provider requests are bounded.

- maximum attempts: 3
- timeouts are bounded
- 429/5xx/network/timeout may retry
- permanent client failures do not loop indefinitely
- redirects are not followed
- runner checks listings serially
- per-provider minimum spacing is enforced independently

The operational runner limit defaults to 25 and is bounded to 100. This is a request-safety budget, not a data-completeness target.

## Dry-run runner

Script:

```bash
node scripts/market-reobservation-provider-dry-run.mjs
```

Optional bounded limit:

```bash
node scripts/market-reobservation-provider-dry-run.mjs --limit 25
```

Optional explicit logical observation key:

```bash
node scripts/market-reobservation-provider-dry-run.mjs --observation-key reobs-v1:20260901T10
```

Without an explicit key, the runner derives a deterministic UTC-hour key. The listing ID is also part of the PR #150 observation ID, so same logical-window retries are idempotent per listing.

The runner:

1. reads `market_listings` through the existing reliable read helper;
2. keeps review-safe Rakuten/Yahoo listings in `active` / `sold_out` lifecycle states;
3. applies PR #150 due/cadence selection;
4. performs serial exact provider reads;
5. feeds normalized results through PR #150 identity/lifecycle planning;
6. prints only a sanitized dry-run aggregate.

## Sanitized output

The artifact may contain:

- checked count
- provider counts
- outcome counts
- projected observation inserts / listing updates
- attempt/retry/rate-limit/timeout counts
- sanitized failure categories

It must not contain:

- Rakuten access key
- Rakuten application ID
- affiliate ID
- Yahoo application ID
- Authorization headers
- cookies/tokens
- credential-bearing request URLs
- raw API response bodies
- arbitrary provider error body text

`production_actions` remains `0` in this phase.

## Approval boundary

This code-only dry-run does not authorize:

- live Production-connected provider execution
- Production observation INSERTs
- Production listing UPDATEs
- workflow/schedule activation
- workflow dispatch
- Secret/Variable changes
- paid API activation or entitlement changes

Those remain separate approval-gated rollout steps after this code is independently reviewed and merged.
