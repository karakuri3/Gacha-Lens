# Gacha Lens Design Benchmark — Consumer Collectibles Standard

> Status: design reference only. This document does not authorize Production writes, workflow/provider changes, affiliate activation, ad activation, or a broad redesign merge by itself.

## Purpose

Gacha Lens should feel like a consumer collectible-discovery and market-intelligence product, not an admin dashboard or an internal analytics console.

The benchmark combines the strongest patterns from:

- Gashapon Official / Takara Tomy Arts / Kitan Club / Qualia / Studio SO-TA — official release/catalog truth, product imagery, release timing, lineup/variant count, store discovery.
- SNKRDUNK / StockX — marketplace-first hierarchy, prominent search, trending discovery, market price, price history, listing depth, trust.
- PriceCharting / TCGplayer / Discogs — sold-history evidence, market price methodology, sample size, volatility, low/median/high, provenance and history.
- Kakaku.com / Yahoo! Shopping / Rakuten / Amazon / Mercari — multi-provider commerce, filtering, price comparison and purchase-intent patterns.
- MyFigureCollection / hobbyDB / Pop Price Guide / BrickLink — deep collectible metadata, collection/wishlist, taxonomy, variant relationships, community evidence and collector identity.
- AmiAmi / Surugaya / Mandarake — dense Japanese hobby-commerce catalogs, new/used/preorder states, product identity and high-volume browsing.
- #C-pla and other capsule-toy specialty experiences — store/local discovery and the playful physical-world identity of capsule toys.

## Current Gacha Lens design diagnosis

Current Visual QA shows several structural issues:

1. Desktop uses a persistent left sidebar, creating an admin/SaaS-dashboard impression rather than a consumer marketplace/catalog.
2. Homepage is composed of bordered analytical panels and mini-tables; product imagery is secondary even though gacha is a highly visual product category.
3. Catalog cards are record-like rows with 92–112px images and evidence tables. They are efficient for internal scanning but weak for consumer discovery.
4. The interface uses many borders, rectangles, tiny labels and very heavy font weights. Information hierarchy is created mostly by boxes rather than spacing, scale and imagery.
5. Sparse market data produces large empty analytical panels (for example, price-history data shortage) that visually advertise incompleteness.
6. Purchase/marketplace buttons are presented as a generic equal-weight grid rather than a useful comparison of provider, price, freshness and affiliate/trust state.
7. Mobile preserves too much desktop information density, resulting in long stacks of bordered modules and an oversized footer relative to the useful product content.

## Design constitution

### 1. Consumer site, not dashboard

- Default desktop navigation is a compact top header with global search and primary destinations.
- Do not expose a permanent admin-like left rail in the normal consumer experience.
- Use secondary horizontal navigation or contextual tabs only where they reduce search effort.

### 2. Search first

The persistent global search is one of the primary product actions.

Search should support:
- product / series name;
- character / IP;
- maker / brand;
- category;
- eventually aliases and model/JAN identifiers when trustworthy.

Search results must expose active filter chips and an explicit result count.

### 3. Product image is the first scanning signal

For discovery surfaces, the image should occupy the majority of the card area.

Desktop catalog target:
- 4-column grid on wide screens where content quality permits;
- 3-column at medium desktop/tablet widths;
- 2-column on standard mobile where labels remain readable.

Do not fall back to tiny thumbnail + KPI-table rows as the primary discovery experience.

### 4. Progressive disclosure

Cards should answer only the questions needed to decide whether to click.

Default discovery card hierarchy:
1. image;
2. product / series name;
3. maker or IP;
4. MSRP;
5. release timing/state;
6. one trustworthy market signal, only if evidence exists.

Deep metadata, source provenance, full market evidence, stock, history and related variants belong on the detail page.

### 5. No fake completeness

Sparse evidence must not be converted into empty dashboards.

If market evidence is insufficient:
- show a compact honest status such as `相場データ収集中`;
- explain what is known (MSRP, release date, lineup, official source);
- do not reserve a large chart/panel area with no usable data;
- reveal the full market module only when enough observations exist to make it useful.

### 6. Detail-page decision hierarchy

Target detail structure:

1. Breadcrumb / back-to-results context.
2. Product hero:
   - large gallery;
   - name / series / maker;
   - release date;
   - MSRP;
   - lineup count / variant identity;
   - release / rerelease state.
3. Market summary, only when evidenced:
   - current reference range or price;
   - sample count;
   - last observation time;
   - confidence / evidence label.
4. Price history chart above the fold or immediately below hero only when the chart has sufficient data.
5. `買える場所を比較` provider table/cards:
   - provider logo/name;
   - actual observed price when available;
   - freshness;
   - shipping/condition qualifier where known;
   - clear external CTA;
   - affiliate disclosure without changing ranking.
6. Lineup / sibling variants as a visual grid.
7. Restock/stock/re-release evidence.
8. Related products.
9. Methodology/provenance and reporting controls.

### 7. Market evidence must communicate trust

Borrow from PriceCharting, TCGplayer, Discogs, StockX and SNKRDUNK:

- show the number of observations/listings behind a price;
- show the latest observation timestamp;
- distinguish active listing evidence from completed-sale evidence;
- never label listing prices as a sold-market price;
- show low/median/high only when the sample supports it;
- hide empty chart series and empty metric cards;
- expose methodology close to the market number, not only in a footer;
- allow users to understand why a confidence label is low/high.

### 8. Distinguish discovery from transaction

Homepage/discovery cards can be light and visual.
Transactional/provider surfaces must be denser and explicit about price, source and freshness.
Do not mix those two card styles randomly on the same surface.

### 9. Capsule-toy-specific discovery

Borrow from Gashapon/Takara Tomy rather than generic ecommerce:

- 今月 / 来月 / 発売中;
- release week/month;
- maker;
- IP / character;
- price per spin;
- number of varieties;
- rerelease state;
- online availability / nearby-store availability only when trustworthy.

### 10. Collection behavior is a future moat

Borrow from MyFigureCollection, hobbyDB, Discogs and BrickLink:

- `持っている` and `ほしい` are separate states;
- owned/wanted counts can later become useful demand/social signals;
- collection and wishlist must not influence price truth or rankings without explicit methodology;
- avoid forcing sign-in before a user understands the value of saving an item.

### 11. Visual language

- White / warm-neutral canvas rather than dashboard-gray as the dominant surface.
- Product images provide much of the color.
- One strong brand accent for key action/identity; market up/down colors are semantic and separate.
- Fewer card borders. Prefer whitespace, hierarchy and subtle separators.
- Avoid pill badges unless the state is genuinely categorical/actionable.
- Avoid excessive 900/950 font weights; reserve strong weight for names, price and key values.
- Japanese body copy must remain comfortably readable at normal mobile sizes.
- Radius/shadow should be restrained and consistent rather than applied to every module.

### 12. Mobile is not a compressed desktop dashboard

Mobile priorities:
1. search;
2. image;
3. product identity;
4. price/release truth;
5. one next action.

Use:
- 2-column visual discovery grids where possible;
- horizontal chips/tabs for fast filters;
- bottom-sheet filters if the number of facets grows;
- compact provider comparison rows;
- optional sticky bottom action on product detail after a useful affiliate/provider offer exists.

Do not stack every desktop panel in sequence.

### 13. Monetization should look native, not intrusive

Affiliate:
- provider comparison is a product feature first and monetization surface second;
- sort by user value / factual rules, not commission;
- label affiliate relationship clearly;
- never render a generic search URL as though it were verified affiliate coverage.

Ads:
- no ad between title and core product facts;
- no ad inside the price-history evidence block;
- use predictable content boundaries after useful sections;
- mobile sticky/interstitial formats require separate UX review.

## Reference-site lessons

### Gashapon Official
Reuse:
- release-date / product-type / online/store filters;
- image-first catalog;
- clear price and product type;
- structured detail facts.

Improve on:
- active-filter visibility;
- breadcrumbs/back-to-results;
- modern pagination;
- market comparison absent from official catalog.

### Takara Tomy Arts
Reuse:
- keyword + release month/week;
- explicit MSRP;
- high-volume chronological product browsing;
- rerelease wording.

### Kitan Club / Qualia / Studio SO-TA
Reuse:
- clean large product imagery;
- explicit release month, variety count and price;
- Qualia's store-map concept when reliable store data exists.

### SNKRDUNK
Reuse:
- persistent search;
- trending/new-arrival discovery;
- price and listing depth near product identity;
- market chart/time ranges;
- trust/authentication communication.

Avoid:
- hiding critical market data too far below the fold;
- inconsistent card density across sections;
- promotional content overwhelming product utility.

### StockX
Reuse:
- clear separation of market summary, chart and current marketplace state;
- time-range controls;
- spread/market comparison concepts only when Gacha Lens has data strong enough to support them.

### PriceCharting
Reuse:
- condition/evidence segments;
- historic chart;
- sold-listing history;
- sample volume;
- report/misclassification correction;
- cross-market links.

Avoid:
- empty condition cards;
- irrelevant ad carousels;
- hiding methodology/freshness.

### TCGplayer
Reuse:
- `Market Price` must be defined by completed sales, not active asks;
- most-recent-sale and volatility are separate concepts;
- filtering changes the price meaning, so the UI must keep context visible.

### Discogs
Reuse:
- recent-sales low / median / high;
- collection + wantlist;
- sales history as a trust tool;
- seller/market context and transparent estimated-value caveats.

### Kakaku.com
Reuse:
- explicit multi-provider comparison;
- price sorting/filtering;
- clear disclosure that commissions may be received.

Avoid:
- extreme information density and ad-like clutter.

### MyFigureCollection
Reuse:
- rich item metadata;
- maker/character/origin relationships;
- owned/wished states;
- real user photos;
- counterfeit/trust warnings;
- collection-driven discovery.

Avoid:
- burying structured metadata inside giant item names;
- uncontrolled tag sprawl.

### hobbyDB / Pop Price Guide
Reuse:
- many price sources feeding one collector database;
- source-quality/provenance concept;
- collection/wishlist and estimated collection value;
- community correction process.

### BrickLink
Reuse:
- clear parent item vs variant/color identity;
- wanted-list counts;
- price-guide separation;
- exact variant relationships.

Avoid:
- legacy dense UI and excessive option lists without progressive disclosure.

### Yahoo / Rakuten / Amazon / Mercari
Reuse:
- familiar price-first commerce scanning;
- seller/provider identity;
- delivery/state cues;
- sort/filter conventions.

Avoid:
- promotion/point/coupon noise dominating the Gacha Lens evidence model;
- sponsored placement influencing market truth.

### AmiAmi / Surugaya / Mandarake
Reuse:
- explicit preorder/new/used states;
- dense catalog handling;
- collector-oriented identifiers and product history.

Avoid:
- old-fashioned table density as the main consumer surface.

## First redesign release

Do not redesign the entire repository in one PR.

### R1 — navigation + homepage + common discovery card

Goal: make the first 30 seconds feel like a real consumer service.

Scope:
- replace normal consumer desktop sidebar with top-navigation architecture;
- retain global search as primary action;
- redesign homepage above-the-fold around search + `今月 / 来月 / 発売中` discovery;
- replace dashboard-like ranking tiles with image-led product cards;
- establish one canonical discovery-card component for homepage/catalog/category/schedule where appropriate;
- collapse large empty analytical modules into compact honest empty states;
- mobile-first 2-column discovery where data/labels permit.

No market-data semantics, ranking formulas, provider execution, affiliate activation, ads, DB schema/write behavior or workflow changes.

### R2 — catalog/search/filter

- image-led responsive grid;
- active filter chips;
- stronger mobile filter UX;
- clear result count and sort;
- release/maker/category facets;
- truthful market-evidence badge only when supported.

### R3 — product detail

- larger gallery and identity block;
- market summary with freshness/sample/confidence;
- price history only when meaningful;
- provider comparison redesigned around real observed data;
- lineup grid and related items;
- compact evidence/provenance.

### R4 — collector layer

Only after core data/product quality is credible:
- owned / wanted;
- alerts;
- personal collection;
- community photos/reports where moderation/provenance is defined.

## Acceptance bar

A redesign PR is not complete because it 'looks nicer'. It must pass all of the following:

- 1440px, 390px and 360px Visual QA with real Japanese product names/images;
- no image clipping/cropping regression;
- common actions are discoverable without reading helper copy;
- first screen communicates what Gacha Lens does;
- catalog can be scanned by image/name/price/release without opening every item;
- empty market data does not dominate the page;
- detail page separates official facts from market evidence;
- affiliate/ad state does not influence rankings or appear more verified than it is;
- accessibility basics: keyboard focus, contrast, touch sizes and readable body text;
- exact-head runtime/CI/review gates remain green.
