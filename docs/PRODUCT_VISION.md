# Product Vision

## Core audience

This site is for people who need to quickly judge which gachapon items are worth finding, buying, reselling, or selling to a buyback shop.

Primary users:

- People looking for profitable resale opportunities.
- People who want to know which gachapon items have high market or buyback value.
- People trying to find currently hot or hard-to-get gachapon items.
- Collectors who want to understand release timing, scarcity, and market movement at a glance.

## Product promise

The site should answer this immediately:

- What is hot right now?
- What is currently circulating and worth checking?
- What is selling or listed above retail?
- What upcoming release is likely to become expensive?
- Where are stock, restock, and availability signals moving?

The public UI should not feel like a data-management tool. It should feel like a market intelligence service for gachapon decisions.

## Main data categories

### Official master data

Use official or manufacturer sources for product identity and release information.

Priority sources:

- `https://gashapon.jp/`
- `https://www.takaratomy-arts.co.jp/items/gacha/`
- `https://gacha-island.jp/`
- Official product announcement feeds and pages.

Data to collect:

- Series name.
- Variant / individual item name.
- Retail price.
- Release month.
- Release week or schedule block.
- Official image.
- Official URL.
- Brand / manufacturer.
- Restock or resale indication when official data exposes it.

Official data is the source of truth for `series` and `variants`.

### Market price data

Use marketplace listings and sold data to understand actual market value.

Priority sources:

- Mercari listing prices.
- Mercari sold prices.
- Amazon listings when the item is sold there.
- Rakuten listings when the item is sold there.
- Approved CSV / JSON exports or APIs for market data.

Data to collect:

- Active listing price.
- Sold price.
- Listing status.
- Listing URL.
- Listing title.
- Observed timestamp.
- Sold timestamp when available.
- Quantity or set hints.
- Whether the listing is single, rare/secret, full set, partial set, popular character set, unopened lot, or unknown.

Market data must never mix singles, rare/secret singles, full sets, partial sets, and lots into one price bucket.

### Upcoming demand and trend data

Use social and pre-release commerce signals to forecast which unreleased variants may become valuable.

Potential sources:

- X posts and official announcements, only when API/feed access is available.
- Instagram posts and comments, only through approved API/feed/export access.
- YouTube announcements, views, likes, comments, and creator/community reactions, only through approved API/feed/export access.
- Pre-release Mercari, Amazon, and Rakuten listings when available.

Signals to classify:

- Strong want-to-buy intent.
- "I want all of them" / completion demand.
- Specific character demand.
- Rare / secret / chase-item mentions.
- Miniature or doll-accessory compatibility.
- Sold-out, restock, scarcity, and store availability movement.
- Early listings above retail before release.
- Comment and engagement strength.

Upcoming pages must not show market price or profit as confirmed facts. They should show expectation, scarcity likelihood, and reasons.

### Stock and restock data

Use safe feeds, CSV exports, official updates, and shop updates for availability.

Data to collect:

- In stock.
- Low stock.
- Sold out.
- Restocked.
- Replenished.
- Shop name.
- Region.
- Source URL.
- Reported timestamp.
- Confidence and review status.

Ambiguous stock reports must go to `unknown` / `review_required`.

## Ranking strategy

The most important public ranking is not a generic score. It should highlight "items worth checking now".

Released item ranking should prioritize:

- Single-item market price.
- Profit estimate above retail.
- Sold count.
- Active listing count.
- Recent listing or sold movement.
- Stock/restock movement.
- Price confidence.
- Circulation score.

Upcoming item ranking should prioritize:

- Forecast score.
- Completion demand.
- Chase character demand.
- Miniature compatibility.
- Limitedness / scarcity.
- Official release timing.
- Social reaction strength when available.
- Pre-release listing signals when available.

## Public UI rules

Public pages should show customer-facing judgment signals:

- Price.
- Single-item market price.
- Profit estimate for released items.
- Complete set market price.
- Stock status.
- Sales movement.
- Heat / trend level.
- Expected value for upcoming items.
- Scarcity likelihood.
- Release month and week.
- Image and product name.

Public pages should not show internal details such as:

- Raw source type.
- Matched keywords.
- Classification reason.
- Confidence reason.
- Import issue internals.
- Fine-grained X intent breakdown.

Those details belong in `/review`.

## Safety rules

- Do not make uncontrolled scraping the primary path.
- Prefer official pages, approved APIs, CSV exports, JSON exports, and reviewed feeds.
- Respect service terms and rate limits.
- Classify uncertain records as `unknown` or `review_required`.
- Keep single variants as the primary unit.
- Do not mix singles, sets, rare/secret items, or lots.
- Do not show market price or profit on unreleased variants as confirmed data.

## Long-term goal

The site should become a constantly updating gachapon market intelligence service:

```text
official master data
  -> variants
  -> market listings / sold listings
  -> stock and restock reports
  -> social and pre-release demand signals
  -> market summary / trend summary / forecast summary
  -> public ranking, schedule, series, and detail pages
```

The first thing users should feel is:

"I can immediately tell which gachapon is hot, profitable, scarce, or likely to become expensive."
