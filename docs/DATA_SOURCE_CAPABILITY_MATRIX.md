# Gacha Lens Data Source Capability Matrix

Updated: 2026-09-01 JST
Parent: #119
Task: #123

## Purpose

This document is the source-selection contract for the Data Scale Program.

Gacha Lens should collect as much **lawful, technically obtainable, provenance-preserving** data as practical. A missing source is not permission to scrape it. When access is unavailable, paid, contractual, or unclear, record that state explicitly and build the product/partnership case needed to unlock it later.

Capability states used here:

- `active`: reviewed access/integration already exists in Gacha Lens or a current public official API is available for the existing integration.
- `planned`: a lawful public API/feed exists and is a plausible future integration, but Gacha Lens has not integrated it.
- `partnership_required`: the desired automated data is not available through a verified public developer path; pursue an authorized partnership/license/data feed.
- `paid_access_required`: a verified official access path exists but requires credits, a paid plan, or commercial contract before activation.
- `manual_only`: useful for human research, but no reviewed automated data path has been established.
- `unavailable`: the specific desired capability is not available through the reviewed public developer path.

This is an engineering/access classification, not legal advice. Provider terms and product documentation must be rechecked immediately before activation because APIs and commercial terms change.

## Executive conclusion

The highest-value next source action is **not another unauthorised marketplace scraper**.

The recommended sequence is:

1. deepen and re-observe the already-authorized Rakuten/Yahoo data paths;
2. conduct commercial diligence with **Aucfan / オークファン** for licensed completed-sale / historical market data;
3. continue safe official-manufacturer catalog expansion;
4. add other public APIs only where they materially increase unique DATA value;
5. activate X only through a separately approved paid-access task with a strict cost budget;
6. build a Mercari partnership case and request authorized data access rather than scraping it.

Aucfan is strategically important because Gacha Lens currently has no completed/sold evidence while Aucfan publicly states that it holds roughly 10 years and 70+ billion historical transaction/auction records and provides market data through API/MCP arrangements to businesses and sole proprietors.

## Capability matrix

| Source | State | Live listings | Re-observation / stock | Historical / completed | Catalog / release | Social / demand | Affiliate | Exact identity / dedupe | Access and constraints | DATA value / effort |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Rakuten Ichiba API | `active` | Yes | Yes; exact `itemCode` lookup and `availability` | No verified completed-sale feed; no C2C/auction items in Item Search | Limited EC metadata, genre/attributes | Reviews can be auxiliary evidence but not social demand by themselves | Yes, official Rakuten affiliate URL support | `itemCode` (`shop:item`), shop code, canonical item URL | Official 2026-07-01 API; app ID + access key; 429/short-time throttling; preserve current pacing | **Very high / low-medium** because credentials, matcher and provenance already exist |
| Yahoo Shopping API | `active` | Yes | Yes; exact `itemcode`, price and availability | No verified broad completed-sale feed | Product/JAN/category/brand/store metadata; preorder fields | Reviews can be auxiliary evidence only | Yes via ValueCommerce contract/provenance | `storeId_storeItemCode`, seller/store ID, canonical item URL, JAN where present | Client ID; published guidance warns about short-time repeated access and documents 1 query/sec for item lookup/current Shopping API guidance | **Very high / low-medium**; current second core marketplace source |
| Bandai Gashapon official | `active` | N/A marketplace | Official schedule/re-release observations where source evidence exists | No resale history | Strong official series/variant/release/MSRP/image facts | Official announcement events only, not popularity by themselves | N/A | JAN/detail URL and repository canonical identity | Current bounded official ingestion; preserve fail-closed F0 contract | **Very high catalog value / existing** |
| Takara Tomy Arts official gacha | `active` | N/A marketplace | Official release/product observations | No resale history | Strong official catalog/release facts | Official announcements only | N/A | official product ID/detail URL and canonical identity | Existing official fetch path; preserve source truthfulness | **High catalog value / existing** |
| Kitan Club official | `active` | N/A marketplace | Official product/release observations | No resale history | Series + variant catalog capability exists in repository; source-count conflicts fail closed | Official announcements only | N/A | Kitan product URL/source product ID | Manual canary historically succeeded; automatic gate remains off unless separately approved | **High catalog expansion / low-medium** after safety gate |
| Qualia official | `active` (limited scope) | N/A marketplace | Official product/release observations | No resale history | Series metadata is approved; variant catalog requires formal lineup linkage and current phase remains conservative | Official announcements only | N/A | Qualia product/lineup URL and source product ID | Historical one-series canary; automatic rollout unapproved; do not broaden variant writes casually | **Medium-high catalog / medium** |
| Aucfan / オークファン API or MCP | `paid_access_required` | Potentially through licensed market dataset; exact commercial fields must be confirmed | Potential historical market observation support; exact API schema/cadence must be contracted | **Yes — primary attraction:** Aucfan states ~10 years / 70+ billion actual transaction/auction market records and API-based data provision | Not an authoritative manufacturer catalog | Transaction frequency/price distribution can support supply-demand components, not social sentiment | Not the primary value proposition | Exact fields/API schema must be confirmed during diligence before matcher design | Commercial consultation/contract path; public consumer plan prices do not establish API licensing price. Any contract/payment is a separate approval boundary | **Extremely high / medium-high** because it could solve completed-sale/history gap legally |
| Yahoo Auctions public market API | `unavailable` for broad public auction search | No current public Auctions Web API verified | No current broad public re-observation API verified | No public completed-auction API verified | N/A | N/A | N/A | N/A | Yahoo officially ended the Auctions Web API. Seller/order APIs are not a substitute for public market-wide search | **High desired value / unavailable directly**; prefer licensed aggregator/partnership |
| Mercari marketplace data | `partnership_required` | Desired | Desired | **Desired: completed/sold/history/velocity** | Not authoritative manufacturer catalog | Supply velocity and purchase-intent proxy would be valuable | Future partnership terms unknown | Desired listing ID, seller/storefront identity and canonical URL must come from authorized contract | No general public listing/history developer API was identified in the 2026-09-01 official-source review. Project policy forbids scraping. Mercari demonstrates formal third-party/cross-border integrations, so pursue authorized access | **Extremely high / high partnership effort** |
| X API | `paid_access_required` | N/A | Near-real-time/recent social observations; historical search available with paid access | Historical Posts can be searched back to 2006 through the official full-archive endpoint | Not catalog truth | **High:** mention/reaction volume, velocity, release/restock response, intent language with provenance | N/A | Post ID, author/user ID, timestamps, query/version provenance | Current X API is pay-per-use. Posts Read is currently $0.005/resource; recent search covers 7 days; full archive is pay-per-use/Enterprise. Purchase of credits, credentials and activation are separate approvals | **High signal value / medium-high cost-control effort** |
| eBay Browse API | `planned` | Yes, for supported eBay marketplaces | Live listing re-read possible via official API/OAuth | Marketplace Insights historical/sold API is restricted and not open to new users in current docs | Marketplace metadata only | Listing/supply signals possible | eBay Partner Network could be evaluated separately | eBay item IDs and marketplace IDs | Lawful public developer API exists, but Japan-local relevance is lower than Rakuten/Yahoo; historical sold data is the important missing capability and is restricted | **Medium / medium**; defer until domestic gaps are addressed |
| Surugaya / 駿河屋 | `partnership_required` for automation | Public storefront is useful to humans | Useful used-stock/price signal if an authorized feed exists | Potentially valuable used-price evidence, but no verified public developer API was identified in this audit | Hobby-product metadata can supplement catalog | Supply signal only | Commercial terms must be checked | Need contractual SKU/store identity | Do not scrape merely because pages are public. Seek feed/API/affiliate/partnership terms first | **High niche value / high access uncertainty** |
| Mandarake / まんだらけ | `partnership_required` for automation | Public collector storefront is useful to humans | Potential collector-stock signal with authorization | Potential collector resale-price evidence; no verified public developer API identified in this audit | Niche collector metadata | Supply signal only | Unknown until diligence | Need contractual item/store identity | Treat public pages as manual research until automated access is explicitly reviewed/authorized | **Medium-high niche value / high access uncertainty** |
| AmiAmi / あみあみ | `partnership_required` for automation | Public hobby/preorder storefront | Potential preorder/stock signal with authorization | Historical completed-sale value is limited compared with resale sources | Useful hobby release/preorder metadata | Reservation demand proxy only with truthful semantics | Affiliate/feed terms require diligence | Need contractual SKU/product identity | No reviewed public developer API is established in Gacha Lens; do not introduce scraping in #123 | **Medium / medium-high access uncertainty** |
| Gacha Lens outbound clicks | `active` first-party | N/A | Time-series click observations already exist | Not transaction evidence | N/A | **Yes:** purchase-intent / provider+variant click demand signal | Directly tied to monetization funnel | Internal variant/provider/click identity | First-party data; preserve privacy and do not equate clicks with purchases | **High / low**; should feed later explainable demand model |
| Google Search Console | `active` first-party/connected source when available | N/A | Search-performance time series | N/A | N/A | **Yes:** search interest/impressions/clicks, page/query discovery | Indirect | page/query/date dimensions | Current live values must be re-read through an authorized connection; absence of a current read is `unavailable`, not zero | **High traffic signal / low** once connected |

## Authoritative references verified 2026-09-01

### Rakuten

- Item Search API 2026-07-01: https://webservice.rakuten.co.jp/documentation/ichiba-item-search
- Attribute Search API 2026-07-01: https://webservice.rakuten.co.jp/documentation/ichiba-attribute-search

Important reviewed facts:

- `itemCode` supports exact item lookup.
- item responses include price, item URL and `availability`.
- affiliate URL is returned when an affiliate ID is supplied.
- the API explicitly excludes co-listed auction/flea/C2C items.
- HTTP 429 / short-time access throttling is documented; request budgets must remain provider-safe.

### Yahoo Shopping

- Product Search v3: https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html
- Exact item lookup: https://developer.yahoo.co.jp/webapi/shopping/shopping/v1/itemlookup.html
- Affiliate: https://developer.yahoo.co.jp/webapi/shopping/affiliate.html
- Shopping API overview/rate guidance: https://developer.yahoo.co.jp/webapi/shopping/

Important reviewed facts:

- search supports keyword, JAN, category, brand and seller/store dimensions.
- item lookup uses exact `storeId_storeItemCode` identity.
- search exposes preorder and stock filtering.
- ValueCommerce affiliate integration is officially supported.
- current docs warn about repeated access and document 1 query/sec guidance for Shopping/item lookup usage.

### Yahoo Auctions

- Auctions Web API retirement notice: https://developer.yahoo.co.jp/changelog/2017-11-20-auction158.html
- Auctions changelog: https://developer.yahoo.co.jp/changelog/auctions.html

Do not treat Yahoo Shopping seller/order APIs as a public market-wide replacement for the retired Auctions API.

### Aucfan

- API/MCP data-use announcement: https://help.aucfan.com/hc/ja/articles/51930651859993
- ChatGPT/MCP commercial introduction: https://help.aucfan.com/hc/ja/articles/54235003362841
- Company MCP release: https://aucfan.co.jp/press/release/2026/7217/
- Consumer service pricing reference only: https://help.aucfan.com/hc/ja/articles/20380216009497
- Support/contact: https://help.aucfan.com/hc/ja/requests/new

Important reviewed facts:

- Aucfan publicly describes roughly ten years and 70+ billion actual transaction/auction records.
- Aucfan states that businesses and sole proprietors use its market-data API.
- MCP/API access is offered through an inquiry/meeting/contract flow; public consumer subscription prices must not be assumed to be API licensing terms.
- Therefore no API purchase/contract should occur without a separate explicit paid-operation approval.

### X

- Pricing: https://docs.x.com/x-api/getting-started/pricing
- Search overview: https://docs.x.com/x-api/posts/search/introduction
- Full-archive search: https://docs.x.com/x-api/posts/search/quickstart/full-archive-search
- Usage/billing: https://docs.x.com/x-api/fundamentals/post-cap

Important reviewed facts:

- X API currently uses prepaid pay-per-use credits.
- current public pricing lists Posts Read at `$0.005` per resource.
- recent search covers the last seven days.
- full-archive search can reach back to March 2006 and requires paid/self-serve or Enterprise access under current docs.
- any X activation is therefore `paid_access_required` and must have an explicit monthly/request budget and a separate approval.

### Mercari

- Third-party access permissions: https://help.jp.mercari.com/guide/articles/596/
- Mercari official help/service pages: https://help.jp.mercari.com/

The official review found examples of formal third-party access/integration but did not identify a general public marketplace listing/history developer API suitable for Gacha Lens. This is an absence-of-verified-path statement, not a claim that Mercari can never provide such access. Recheck before partnership outreach.

### eBay

- Buy API filter documentation: https://developer.ebay.com/api-docs/buy/static/ref-buy-browse-filters.html

Current eBay documentation states that Marketplace Insights API is restricted and not open to new users. Live Browse API work may still be viable, but it does not solve Gacha Lens's domestic completed-sale gap by itself.

### Existing official Gacha Lens source registry

Repository-reviewed official sources include:

- Bandai Gashapon: https://gashapon.jp/
- Takara Tomy Arts gacha: https://www.takaratomy-arts.co.jp/items/gacha/
- Kitan Club: https://kitan.jp/products/
- Qualia: https://www.qualia-45.jp/product.html

Kitan and Qualia capability/rollout boundaries are implemented in `lib/fetchers/official-sources/registry.js` and the associated provider-capability/safety tests. This matrix does not expand their Production authorization.

## Ranked expansion sequence

### Priority 0 — exploit sources already authorized

**Rakuten + Yahoo breadth/depth/re-observation**

Why first:

- already integrated and legally/technically reviewed;
- current Production depth/history is extremely low;
- #131/#132/#136 already create the dry-run architecture for repeated observations, multi-offer depth and exact provider reads;
- no new paid provider is required to start compounding the dataset after the separate Production rollout gate is eventually approved.

Success metric is daily growth in observations and independent listings, not PR count.

### Priority 1 — Aucfan commercial/API diligence

Aucfan is the strongest currently identified route to the largest missing evidence family: **completed/sold historical market data**.

Before any purchase:

1. ask for API/MCP commercial documentation and pricing;
2. ask which source marketplaces are included and whether Gacha Lens may store/display derived and record-level data;
3. ask available historical range and whether exact transaction timestamps, final prices, item titles, URLs/source IDs, condition and source marketplace are exposed;
4. ask rate limits, bulk/backfill options, retention/cache/display restrictions and attribution requirements;
5. ask whether API output can be used in a public price-intelligence service and in model-derived aggregates;
6. request a tiny non-Production evaluation dataset or sandbox if available;
7. do not sign/pay or add credentials until the explicit paid-operation/Secrets approvals are granted.

Aucfan should be evaluated before trying to reconstruct sold history through unsupported Yahoo Auctions or Mercari collection.

### Priority 2 — official catalog expansion

Continue Kitan/Qualia and evaluate additional manufacturers/distributors one at a time with the existing provider-capability pattern.

The purpose is catalog truth and release coverage, not market-price depth. A new provider is worthwhile when it adds material missing series/variant inventory and its lineup identity can fail closed.

### Priority 3 — X cost-controlled signal pilot

Only after #127/#133 truthfulness contracts are stable and an explicit paid-access approval exists:

- begin with narrow recent-search queries around exact series names / official launch events;
- cap Post reads and monetary spend;
- store source, Post ID, timestamp, query version, confidence and component provenance;
- never let social volume alone create a public expectation score;
- separately evaluate whether full archive provides enough incremental value to justify cost.

### Priority 4 — Mercari partnership dossier

Do not scrape.

Build a partnership case using measurable Gacha Lens assets:

- catalog coverage and exact matching quality;
- market listing/observation depth;
- organic traffic and indexed discovery;
- outbound purchase-intent clicks;
- proven collector-focused use cases;
- fraud/mismatch/review fail-closed metrics;
- exact desired fields and incremental customer value.

Desired authorized data, subject to Mercari agreement:

- live listing identity and price;
- completed/sold evidence and final price;
- listing lifecycle/velocity;
- supply depth;
- seller/storefront identity only to the extent permitted;
- historical windows and refresh semantics.

### Priority 5 — secondary hobby/resale partners and eBay

- Evaluate Surugaya/Mandarake/AmiAmi only through a public API/feed/affiliate/partnership path that is explicitly reviewed.
- eBay Browse can add global live supply after domestic data architecture is stable, but current restricted historical Insights access means it is not the first solution to sold-price history.

## Source-adapter contract for future integrations

Every new automated source should be an adapter behind one reusable contract, not another bespoke safety project.

Minimum adapter output:

```text
provider
source_listing_id / source_record_id
canonical_public_url
provider_storefront_id (when proven)
title / product identity evidence
price / currency (when applicable)
status / availability
observed_at
source_timestamp (when supplied)
source_type
confidence
raw provenance allowlist
request diagnostic category
```

Required adapter behavior:

- deterministic exact identity where provider supports it;
- bounded timeout/retry/rate-limit policy;
- no credential/raw-response serialization;
- fail closed on missing/contradictory identity;
- separate listing identity from observation identity;
- separate storefront identity from merchant equivalence;
- never translate `not_found`/`sold_out` into a completed sale without explicit completed-transaction evidence;
- preserve provider/source provenance;
- dry-run fixtures before any Production persistence;
- provider-specific cost/request budgets measured in the Scoreboard.

## Approval boundaries after this research

This document authorizes **no external activation or Production write**.

Separate explicit approval is still required before:

- paying Aucfan or signing a commercial API/MCP contract;
- purchasing X API credits or changing its paid-access budget;
- adding/changing provider credentials, Secrets or Variables;
- contacting/committing to a paid marketplace data partnership if it creates contractual or financial obligations;
- Production database backfill/persistence from any new source;
- `workflow_dispatch` or new/materially changed Production schedule/collector lane;
- broad automated access to a public website that lacks a reviewed official API/feed/permission path.

## Decision summary

- **Do not chase more raw sources before using current Rakuten/Yahoo better.** Re-observation and depth are the fastest DATA multiplier.
- **Aucfan is the best identified licensed path for the completed-sale/history gap.** Commercial diligence should precede any attempt to obtain equivalent data through unsupported marketplace access.
- **Mercari stays strategic, not excluded.** The path is partnership/licensing, not scraping.
- **X stays in the architecture.** Current access is paid, so truthfully keep it `paid_access_required` until a budget is approved.
- **Three listings is never a Data Scale completion target.**
