# Gacha Lens Data Source Capability Matrix

Updated: 2026-09-02 JST
Parent: #119
Task: #123

## Purpose

This document is the current source-selection contract for the Data Scale Program.

Gacha Lens should compound as much **lawful, technically obtainable, provenance-preserving** data as practical. A public web page is not permission to automate collection. When access is unavailable, paid, contractual, seller-scoped, or unclear, record that state explicitly and preserve the approval boundary instead of silently replacing it with scraping.

This matrix is an engineering/access record, not legal advice. Provider documentation, pricing, quotas, permitted uses, and commercial terms must be rechecked immediately before any activation because they can change.

## Capability-state vocabulary

Use only these durable states:

- `active`: reviewed programmatic access is already available to Gacha Lens for the stated capability.
- `planned`: a lawful public API/feed exists and is a plausible future integration, but Gacha Lens has not integrated/activated it for the stated capability.
- `partnership_required`: the desired broad automated data is not available through a verified public developer path; an authorized partnership/license/feed is required.
- `paid_access_required`: an official access path exists but credits, a paid plan, or a commercial contract is required before activation.
- `manual_only`: useful for human research, but no reviewed automated data path has been established.
- `unavailable`: the desired capability is not available through the reviewed current path.

Do not confuse source capability with Scoreboard measurement state. A source can be `paid_access_required` while its current signal metric is `not_instrumented`.

## Executive conclusion

The highest-value next source action is **not another marketplace scraper**.

Recommended sequence:

1. deepen and re-observe the already-reviewed Rakuten/Yahoo paths after a separately approved Production rollout;
2. perform commercial diligence with **Aucfan / オークファン** for licensed completed-sale/history data;
3. continue safe official-manufacturer catalog expansion where lineup identity can fail closed;
4. consider a tightly budgeted X pilot only after separate paid-access approval;
5. build a Mercari C2C partnership/licensing case instead of scraping;
6. evaluate secondary hobby stores and eBay only after higher-value domestic gaps are addressed.

At the 2026-09-02 Scoreboard checkpoint Gacha Lens still had 107 market listings and 107 observations, with no listing observed twice and no completed `sold` evidence. Therefore repeated observation and completed-sale evidence remain higher-value gaps than merely increasing the provider count.

## Capability matrix

| Source / capability | State | Live / re-observation | Historical / completed | Stock / preorder / release | Social / demand | Affiliate | Exact identity / dedupe | Access constraints / current interpretation | DATA value / effort |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Rakuten Ichiba Item Search API | `active` | Yes; keyword breadth and exact `itemCode` re-read | No verified completed-sale/C2C history feed | `availability`; current price; EC metadata | Reviews are auxiliary evidence only | Official affiliate URL when affiliate ID is supplied | `itemCode` (`shop:item`), `shopCode`, canonical item URL | Current API version 2026-07-01 requires app ID + access key; repeated identical short-time requests can be blocked; 429 is documented; API excludes auction/flea/C2C co-listings | **Very high / low-medium** |
| Yahoo Shopping API + ValueCommerce | `active` | Yes; product search plus exact `itemcode` lookup | No verified broad completed-sale market feed | `preorder`, `in_stock`, price, JAN/category/brand/store data | Reviews are auxiliary evidence only | ValueCommerce parameters supported | `storeId_storeItemCode`, store/seller ID, JAN where present, canonical URL | Client ID required; exact item lookup documents repeated-access protection and 1 query/sec guidance | **Very high / low-medium** |
| Bandai Gashapon official | `active` | N/A marketplace | No resale history | Strong official series/variant/release/MSRP/re-release evidence | Official announcement evidence only | N/A | Official product/JAN/detail identity preserved by repository ingestion | Existing bounded F0 official lane; keep canonical consistency and fail-closed gates; current repair PR #142 remains approval-bound | **Very high catalog / existing** |
| Takara Tomy Arts official gacha | `active` | N/A marketplace | No resale history | Strong official catalog/release facts | Official announcement evidence only | N/A | Official product/detail identity | Existing official source path; preserve current source-truthfulness boundaries | **High catalog / existing** |
| Kitan Club official | `active` (manual/bounded rollout only) | N/A marketplace | No resale history | Product/release/catalog capability | Official announcement evidence only | N/A | Kitan product URL / source product ID | Repository source expansion supports Kitan; prior manual canary succeeded; automatic writes remain off without separate approval | **High catalog / low-medium** |
| Qualia official | `active` (limited scope) | N/A marketplace | No resale history | Series metadata; variant lineup only when formal lineup linkage passes | Official announcement evidence only | N/A | Qualia product/lineup URL / source product ID | Repository keeps conservative series/lineup linkage; automatic rollout and broad variant writes remain unapproved | **Medium-high catalog / medium** |
| Aucfan API / MCP | `paid_access_required` | Commercial dataset/API scope must be confirmed | **Strong candidate:** official materials describe past 10 years and 700+億 historical auction/transaction records | Not authoritative manufacturer stock/catalog truth | Transaction frequency/price distribution could support explainable market demand/supply components | Not primary value | Exact fields/source IDs/marketplace identity must be confirmed during diligence | Official 2026 materials confirm API/MCP business use, but public consumer subscription prices are not API licensing terms; storage/display/derived-data rights and pricing require contract diligence and explicit approval | **Extremely high / medium-high** |
| Yahoo Auctions broad public market API | `unavailable` | No current broad public Auctions Web API | No current broad public completed-auction API verified | N/A | N/A | N/A | N/A | Yahoo officially retired the Auctions Web API in 2018. Seller/order APIs must not be treated as a public market-wide historical substitute | **High desired / unavailable directly** |
| Mercari C2C marketplace data | `partnership_required` | Desired broad live marketplace feed not verified through a public developer path | **Desired:** completed/sold history, final price, lifecycle/velocity | Desired supply/availability signals | Purchase/supply velocity could be valuable | Partnership terms unknown | Desired listing ID, permitted seller/store identity, canonical URL | Project policy forbids scraping. Formal third-party integrations exist, but no verified general public C2C market-wide search/history API suitable for Gacha Lens was found in this review | **Extremely high / high partnership effort** |
| Mercari Shops Public API | `manual_only` for Gacha Lens market intelligence | API exists, but queries are explicitly scoped to the authenticated shop, e.g. “your Shop's Products” | Own-shop orders include completed/order data, but this is **not** broad C2C completed-market history | Product, preorder, shop/order administration capabilities exist | Not a public marketplace-demand feed | Not evaluated for Gacha Lens | Product/shop/order IDs inside the authenticated seller scope | Personal API Access Token identifies the shop; docs expose `products` for your shop and `shop` that you own. Do not confuse this seller/store API with Mercari C2C market-wide access | **Low for broad market DATA / high semantic risk if misused** |
| X API | `paid_access_required` | Recent search and other read endpoints after credits/credentials approval | Full-archive search is available to pay-per-use and Enterprise and can reach back to 2006 | N/A catalog; event-window observations only | **High potential:** exact-series mentions, velocity, launch/restock response with provenance | N/A | Post ID, user ID where permitted, timestamp, query/version provenance | Current official pricing is pay-per-use with prepaid credits. `Posts: Read` is currently $0.005/resource and pay-per-use is capped at 2M Post reads/month; rates are explicitly subject to change. Recent Search covers 7 days; Full Archive is pay-per-use/Enterprise. Credits, credentials, spend limits, and activation require separate approval | **High signal / medium-high cost-control effort** |
| eBay Browse API | `planned` (non-Japan priority) | Public Browse API can search/retrieve items in supported Buy API marketplaces | Marketplace Insights historical access is restricted and not open to new users | Live listing/item metadata where supported | Supply signal possible | Partner Network evaluation is separate | eBay item ID / marketplace ID | Current Buy API supported-marketplace list includes AT/AU/BE/CA/CH/DE/ES/FR/GB/HK/IE/IT/NL/PL/SG/US and does **not** list Japan. Marketplace Insights is restricted. Therefore it is not a near-term solution to Japan-local completed-sale history | **Medium / medium** |
| Surugaya / 駿河屋 broad automation | `partnership_required` | Public storefront is useful to humans; no reviewed broad API/feed established here | Potential used-price evidence if licensed | Potential stock signal if licensed | Supply signal only | Commercial/affiliate path requires diligence | Contractual SKU/store identity required | Do not automate simply because pages are public; seek a feed/API/affiliate/partnership permission path first | **High niche / high access uncertainty** |
| Mandarake / まんだらけ broad automation | `partnership_required` | Public collector storefront is useful to humans; no reviewed broad API/feed established here | Potential collector resale evidence if licensed | Potential stock signal if licensed | Supply signal only | Unknown until diligence | Contractual item/store identity required | Public pages remain manual research until automated access is explicitly authorized | **Medium-high niche / high access uncertainty** |
| AmiAmi / あみあみ broad automation | `partnership_required` | Public hobby/preorder storefront; no reviewed broad API/feed established here | Completed-sale value lower than resale sources | Potential preorder/release/stock signal if authorized | Reservation demand proxy only with truthful semantics | Affiliate/feed terms require diligence | Contractual SKU/product identity required | No scraping implementation is authorized by #123 | **Medium / medium-high access uncertainty** |
| Gacha Lens outbound clicks | `active` first-party | N/A | Not transaction evidence | N/A | **Yes:** provider+variant purchase-intent signal | Direct monetization-funnel evidence | Internal variant/provider/click identity | First-party evidence; current instrumentation is provider+variant scoped, not listing-level conversion or revenue attribution | **High / low** |
| Google Search Console reporting | `unavailable` in the current connected reporting path at verification | N/A | N/A | N/A | Search impressions/clicks/query demand when authorized access is restored | Indirect | page/query/date dimensions | The current GSC Wizard connection returned a subscription/payment-required error on 2026-09-02, so current values must not be claimed. This is an operational connection state, not a claim that Search Console itself is unavailable | **High traffic signal / low once access restored** |

## Current authoritative references — verified 2026-09-02

### Rakuten

- Item Search API 2026-07-01: https://webservice.rakuten.co.jp/documentation/ichiba-item-search
- Attribute Search API 2026-07-01: https://webservice.rakuten.co.jp/documentation/ichiba-attribute-search

Verified facts used by this matrix:

- official endpoint is under `openapi.rakuten.co.jp`;
- app ID and access key are required;
- `itemCode` can be used for exact item lookup;
- output includes item code, price, URL, affiliate URL when configured, and availability;
- auction/flea/C2C co-listed items are excluded;
- identical rapid access can be blocked and 429 is documented.

### Yahoo Shopping

- Product Search v3: https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html
- Exact item lookup: https://developer.yahoo.co.jp/webapi/shopping/shopping/v1/itemlookup.html
- Shopping API overview: https://developer.yahoo.co.jp/webapi/shopping/

Verified facts used by this matrix:

- Product Search supports keyword, JAN, category, brand, seller/store, preorder and in-stock filters;
- ValueCommerce affiliate parameters are supported;
- exact lookup uses `itemcode = storeId_storeItemCode` and requires Client ID;
- exact lookup documents short-time repeated access protection and `1 query/second` guidance.

### Yahoo Auctions

- Auctions Web API retirement notice: https://developer.yahoo.co.jp/changelog/2017-11-20-auction158.html

The official notice records that the public Auctions Web API was retired, with the final end date changed to 2018-02-22. Do not infer a current market-wide auction history API from seller/order APIs.

### Aucfan / オークファン

- Current API/MCP help article: https://help.aucfan.com/hc/ja/articles/51930651859993
- Current Claude/MCP help article: https://help.aucfan.com/hc/ja/articles/57034099765145
- MCP release: https://aucfan.co.jp/press/release/2026/7217/
- Claude/MCP release: https://aucfan.co.jp/press/release/2026/7564/

Verified facts used by this matrix:

- current official help states past 10 years and approximately 700億件以上 of auction winning-price data;
- Aucfan states that its API is used by reuse businesses through sole proprietors;
- current company releases describe roughly 700億件 of product transaction/sales data available through MCP;
- API/MCP access can therefore be a strong licensed-history candidate, but exact fields, included marketplaces, storage/display rights, rate limits, pricing, and public-product use rights require commercial diligence.

### X

- Pay-per-use pricing: https://docs.x.com/x-api/getting-started/pricing
- Search overview: https://docs.x.com/x-api/posts/search/introduction

Verified facts used by this matrix:

- X API is currently pay-per-use with credits purchased in advance;
- current docs list `Posts: Read` at `$0.005` per resource and a 2 million Post-read cap per monthly pay-per-use billing cycle;
- prices are explicitly subject to change and the Developer Console is the current-rate authority;
- recent search covers the last seven days;
- full-archive search is available to pay-per-use and Enterprise and reaches back to 2006.

Any future X pilot must set an explicit spending limit and request/read budget before activation.

### Mercari Shops

- Public API reference: https://api.mercari-shops.com/docs/index.html

Verified facts used by this matrix:

- production endpoint is `https://api.mercari-shops.com/v1/graphql`;
- authentication uses a Personal API Access Token issued from the shop administration page;
- the token identifies which shop sent the request;
- `products` returns a list of **your Shop's Products**;
- `shop` returns a Shop that **you own**;
- product, preorder, order and webhook capabilities exist inside that seller/shop scope.

Therefore Mercari Shops Public API must not be presented as authorization to collect the broad Mercari C2C marketplace or its completed-market history.

### Mercari C2C partnership posture

- Official third-party service access help: https://help.jp.mercari.com/guide/articles/596/

Formal third-party integration mechanisms demonstrate that authorized integration paths can exist. This review did not verify a general public C2C listing/history developer API suitable for market-wide Gacha Lens collection. Recheck before partnership outreach; absence of a current verified public path is not a claim that Mercari can never license data.

### eBay

- Buy API support by marketplace: https://developer.ebay.com/api-docs/buy/ref-marketplace-supported.html
- Buy APIs overview: https://developer.ebay.com/api-docs/buy/buy-overview.html

Verified facts used by this matrix:

- Browse API supports item search/retrieval for the Buy API marketplaces listed by eBay;
- the current Buy API support list does not include Japan;
- Marketplace Insights is explicitly restricted and not open to new users;
- many Buy APIs may require selective production approval.

### Existing official Gacha Lens sources

Repository-reviewed official sources include:

- Bandai Gashapon: https://gashapon.jp/
- Takara Tomy Arts gacha: https://www.takaratomy-arts.co.jp/items/gacha/
- Kitan Club: https://kitan.jp/products/
- Qualia: https://www.qualia-45.jp/product.html

`lib/fetchers/official-sources/registry.js` currently includes the Kitan/Qualia source-expansion registry and conservative parser/linkage boundaries. This matrix does not broaden their Production authorization.

## Ranked expansion sequence

### Priority 0 — use current Rakuten/Yahoo capability better

The first DATA multiplier remains **depth + re-observation on existing authorized marketplace paths**, not provider-count growth.

Why:

- integrations, identity contracts and strict matching already exist;
- #150, #153 and #156 established dry-run code foundations for repeated observations, exact provider re-reads and multi-offer depth;
- the 2026-09-02 Scoreboard checkpoint still showed 107 observations for 107 listings, so history had not begun compounding;
- using these code foundations against Production remains a separate explicit approval boundary.

Success is measured by independent safe listings and repeated observations, not by PR count.

### Priority 1 — Aucfan commercial/API diligence

Aucfan is the strongest currently identified licensed route to the largest missing evidence family: **completed/sold historical market data**.

Before any purchase or credential work, obtain written answers to:

1. API/MCP commercial pricing and minimum commitment;
2. included source marketplaces and historical range;
3. exact fields: final price, transaction timestamp, title, condition, source marketplace, source record ID/URL;
4. bulk/backfill support, rate limits, pagination, freshness and retry semantics;
5. whether record-level data may be stored and displayed in a public price-intelligence product;
6. whether derived aggregates/models may be stored and shown publicly;
7. retention/cache limits, attribution requirements and deletion/compliance duties;
8. whether a small non-Production evaluation dataset or sandbox is available.

Do not sign, pay, or add credentials without the separate explicit approvals.

### Priority 2 — official catalog expansion

Continue Kitan/Qualia only inside their current conservative gates and evaluate additional manufacturers/distributors one at a time.

A new official source is valuable when it adds material missing catalog/release coverage and its series/lineup identity can fail closed. Official catalog expansion is not a substitute for marketplace depth or history.

### Priority 3 — X cost-controlled signal pilot

Only after a separate paid-access approval and signal-truthfulness gate:

- start with narrow recent-search queries around exact series names and official launch/restock windows;
- cap monthly dollars, Post reads, request frequency and query breadth;
- record Post ID, source timestamp, query/version provenance and evidence family;
- use 24-hour resource deduplication/cost behavior only as a billing optimization, not as an evidence-deduplication shortcut;
- never let social volume alone create a public expectation score;
- evaluate full archive only if its incremental DATA value justifies cost.

### Priority 4 — Mercari C2C partnership dossier

Do not scrape and do not misuse Mercari Shops seller credentials as market-wide access.

Build a partnership/licensing case using measurable Gacha Lens assets:

- catalog coverage and exact-match quality;
- marketplace depth and repeated-observation quality;
- organic traffic and indexed discovery once current GSC access is restored/measured;
- first-party outbound purchase-intent clicks;
- collector-focused use cases;
- mismatch/review/fail-closed safety metrics;
- exact desired fields and how they improve user value.

Desired authorized fields, subject to Mercari agreement:

- live listing ID, canonical URL and price;
- completed/sold status and final price;
- lifecycle timestamps / velocity;
- category/product/condition evidence;
- permitted seller/storefront identity;
- historical range and refresh semantics.

### Priority 5 — secondary hobby/resale partners and eBay

- Evaluate Surugaya/Mandarake/AmiAmi only through a reviewed API/feed/affiliate/partnership permission path.
- eBay Browse can add non-Japan/global supply where useful, but current Buy API marketplace support and restricted historical Insights make it a poor first answer to the Japan-local completed-sale gap.

## Reusable source-adapter contract

Every future automated source should conform to one evidence contract rather than creating bespoke truthfulness rules.

Minimum normalized output where applicable:

```text
provider
source_record_type
source_listing_id / source_record_id
provider_storefront_id (only when proven)
canonical_public_url
scope (series / variant / listing / transaction / signal)
title / product identity evidence
price / currency
status / availability
observed_at
source_timestamp
source_type
confidence / review_required
raw provenance allowlist
request diagnostic category
```

Required behavior:

- deterministic exact identity where the provider supports it;
- bounded timeout/retry/rate-limit/cost policy;
- no credential or unrestricted raw-response serialization;
- fail closed on missing/contradictory identity;
- separate listing identity from observation identity;
- separate storefront identity from merchant equivalence;
- never translate `not_found` or `sold_out` into completed `sold` without explicit completed-transaction evidence;
- preserve provider/source provenance;
- dry-run fixtures and review before Production persistence;
- expose provider request/cost metrics to the Scoreboard when instrumented;
- treat seller-admin APIs as seller-admin scope unless broad marketplace access is explicitly documented and authorized.

## Approval boundaries after this research

This document authorizes **no external activation and no Production mutation**.

Separate explicit approval remains required before:

- paying Aucfan or signing any API/MCP/data contract;
- purchasing X API credits, enabling auto-recharge, or changing a spend budget;
- restoring/adding a paid GSC reporting connector if a paid operation is required;
- adding/changing provider credentials, Secrets or Variables;
- entering a marketplace data partnership that creates contractual or financial obligations;
- Production database backfill/persistence from any new source;
- running #150/#153/#156 against Production data/credentials or persisting their projected changes;
- `workflow_dispatch` or new/materially changed Production collector schedule;
- broad automated access to a public website lacking a reviewed official API/feed/permission path.

## Decision summary

- **Use Rakuten/Yahoo better before chasing provider count.** Their depth/re-observation lanes remain the fastest near-term DATA multiplier after separate Production approval.
- **Aucfan remains the best identified licensed candidate for completed-sale/history.** Commercial diligence comes before payment or implementation.
- **Mercari is not excluded.** C2C market data remains a strategic partnership/licensing target; Mercari Shops Public API is seller/shop scoped and is not a market-wide substitute.
- **X remains in the architecture.** Current access is paid, so keep it `paid_access_required` until a bounded budget is explicitly approved.
- **eBay is lower priority for the current Japan-local problem.** Current Buy API supported marketplaces do not include Japan and Marketplace Insights historical access is restricted.
- **GSC current reporting is unavailable, not zero.** Re-establish authorized access before traffic claims.
- **Three listings is never a Data Scale completion target.**
