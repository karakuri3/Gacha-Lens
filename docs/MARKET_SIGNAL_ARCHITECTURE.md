# Gacha Lens Market Signal Architecture

Verified: 2026-09-01 JST

Parent program: Issue #119
Architecture contract: Issue #127
Related implementation drafts: PR #133, PR #131, PR #132, PR #134, PR #136

## Executive decision

Gacha Lens should treat non-price signals as a first-class evidence program, not as a single guessed popularity number.

The first signal architecture can be built **without a Production schema migration**. The existing tables already cover the core evidence families:

- `stock_reports`
- `restock_events`
- `x_reactions`
- `outbound_clicks`
- `market_listings`
- `market_listing_observations`
- official catalog/release metadata in the existing series/variant model

The immediate missing capabilities are:

1. truthful aggregation of the evidence already available,
2. activation of permitted stock/restock/social sources,
3. real repeated market observations from the History program,
4. a public scoring gate that refuses to manufacture certainty from metadata-only heuristics.

Public outputs must separate **popularity, purchase intent, scarcity/supply pressure, market momentum and release/social heat**. Missing evidence remains missing. A composite is allowed only when a versioned minimum-evidence contract passes.

## 1. Live Production baseline

Read-only Production inspection on 2026-09-01 JST returned:

| Evidence table | Rows | Current meaning |
| --- | ---: | --- |
| `market_listing_observations` | 107 | real marketplace observation evidence, currently one observation per listing |
| `outbound_clicks` | 68 | real first-party purchase-intent behavior |
| `stock_reports` | 0 | schema exists; collection not active |
| `restock_events` | 0 | schema exists; collection not active |
| `x_reactions` | 0 | schema exists; authorized collection not active |

The current non-price evidence program therefore has one genuinely populated family today: **outbound marketplace/official clicks**.

### Outbound click evidence by provider

| Provider destination | Clicks | Distinct variants |
| --- | ---: | ---: |
| Mercari | 26 | 19 |
| Official | 14 | 12 |
| Rakuten | 12 | 8 |
| Amazon | 9 | 7 |
| Yahoo | 7 | 6 |
| **Total** | **68** | not additive across providers |

These clicks are first-party Gacha Lens behavior. They do not grant access to, or make claims about, the destination marketplace's private transaction data.

## 2. Current truthfulness debt

Current `main` still contains the legacy `lib/domain/forecast-score.js` behavior where metadata-derived axes can create non-zero numeric values even without real market/social/stock evidence.

Examples in the current legacy helper include descriptive defaults around:

- completion: `46 + siblingCount * 5`,
- ace/chase: often `58` absent a stronger keyword signal,
- compatibility fallback: `45`,
- limitedness fallback: `38`.

Those heuristics may remain useful as descriptive/classification features, but they are **not observed demand evidence** and must not independently unlock an evidence-backed public expectation score.

PR #133 is the current code-only truthfulness repair. It keeps descriptive axes internally while making the public forecast fail closed unless at least two independent evidence families qualify.

## 3. Three-layer signal model

### Layer A — raw evidence/events

Keep source facts separate and inspectable.

Representative event families:

- official release announcement,
- official re-release announcement,
- official restock announcement,
- stock in-stock / low / sold-out observation,
- preorder/reservation open/closed evidence,
- marketplace listing observation,
- completed-sale evidence only from an explicitly authorized source,
- authorized X/social post or aggregate window,
- first-party outbound click,
- first-party/site search event if collected lawfully,
- Search Console/analytics demand window where available and contractually appropriate.

Every evidence record or aggregate window should identify:

- subject scope: series and/or exact variant,
- source/provider,
- source type and provenance,
- event/observation timestamp,
- source reference when retention permits it,
- confidence/review state,
- collection/parser version where useful,
- whether the evidence is raw, normalized or derived.

### Layer B — explainable component signals

Derive separate components. Never collapse unrelated evidence into one hidden score before the component layer exists.

Recommended v1 components:

1. `purchase_intent`
2. `social_heat`
3. `supply_pressure`
4. `market_momentum`
5. `release_heat`
6. `collector_chase_evidence`

Each component returns at minimum:

```json
{
  "status": "available",
  "score": 61,
  "as_of": "2026-09-01T00:00:00Z",
  "window": "7d",
  "evidence_count": 18,
  "source_family_count": 2,
  "freshness": "current",
  "confidence": 0.74,
  "reasons": ["..."],
  "provenance": ["..."]
}
```

If evidence is missing, return `status=unavailable` and `score=null`. Do not substitute a neutral-looking number such as 45 or 50.

### Layer C — composite/product outputs

Potential customer-facing outputs include:

- expectation,
- popularity,
- scarcity,
- market heat,
- purchase-intent level.

A composite must include:

- `model_version`,
- component values,
- component availability,
- evidence counts,
- source-family diversity,
- freshness,
- confidence/coverage,
- formula or named weighting policy,
- human-readable reasons.

**Score and confidence are different values.** A score of 85 from thin evidence is not equivalent to a score of 85 supported by multiple current evidence families.

## 4. Purchase intent

### Current v1 source: outbound clicks

`outbound_clicks` already stores:

- `variant_id`,
- `provider`,
- `page_path`,
- `clicked_at`.

Current indexes already support time-window reads:

- `(provider, clicked_at DESC)`,
- `(variant_id, clicked_at DESC)`.

This makes outbound clicks the safest immediately usable non-price demand component.

Recommended outputs per variant/window:

- click count,
- unique provider count,
- click velocity vs previous comparable window,
- share of site-wide eligible clicks only when the denominator is defined consistently,
- freshness of the latest click.

### Anti-abuse / interpretation boundary

A click is purchase intent evidence, not a completed purchase.

Do not interpret:

- Mercari click as Mercari sale,
- Amazon click as Amazon order,
- official click as confirmed reservation.

Repeated rapid clicks from one unknown user/session should not be assumed independent demand unless first-party analytics has a reviewed dedupe identity contract.

### Search demand

Search Console/analytics demand is a separate possible source family.

The currently connected GSC Wizard integration could not be read on 2026-09-01 because its trial/subscription is inactive. No paid reactivation was performed.

Therefore Signal v1 must not depend on GSC data. Search demand can join later as an independent component/source when lawful access is available.

## 5. Social heat

### Authorized X path only

Current official X API documentation was rechecked on 2026-09-01:

- pricing: `https://docs.x.com/x-api/getting-started/pricing`
- Post caps: `https://docs.x.com/x-api/fundamentals/post-cap`
- search introduction: `https://docs.x.com/x-api/posts/search/introduction`
- recent search: `https://docs.x.com/x-api/posts/search-recent-posts`

Current docs describe a pay-per-usage API model and an official Recent Search path for the recent seven-day window. Current usage/cap terms must be rechecked again immediately before any Production activation because API pricing and licensing can change.

No X scraping is part of this architecture.

### Narrow collection strategy

If paid access is later explicitly approved:

1. query only known series/variant identities,
2. concentrate requests around launch/restock/re-release windows,
3. enforce bounded per-run and monthly budgets,
4. retain only fields permitted by the current X Developer Agreement/API policy,
5. prefer permitted IDs/metrics/derived windows when that reduces redistribution/privacy risk,
6. document query/model version and time window,
7. never expose raw internal fine-grained social data publicly without a separate product/privacy review.

### Social component candidates

- recognized source-type post count,
- unique authors/sources where permitted,
- engagement-weighted activity,
- reaction velocity vs previous window,
- explicit purchase/complete-set/chase intent only when classification confidence passes,
- official/shop/user source mix.

Volume alone is not sentiment, purchase intent or scarcity.

## 6. Supply pressure / scarcity

Supply pressure combines evidence that directly describes availability rather than guessed popularity.

Potential inputs:

- current distinct active listing count,
- distinct provider/storefront count where identity is proven,
- listing-depth change over time,
- explicit `stock_reports` states,
- official/shop restock events,
- time since latest restock,
- active → sold_out → active transitions from repeated observations,
- price dispersion as supporting market context.

Never infer scarcity from:

- one provider timeout,
- one `not_found`,
- a missing API response,
- absence of X posts,
- metadata words alone.

`stock_reports` and `restock_events` currently have zero Production rows, so current public scarcity must remain limited to real market-depth/history evidence until permitted stock/restock collection exists.

## 7. Market momentum

Market momentum must be derived from real marketplace observations, not metadata.

Inputs can include:

- 7/30/90/365-day price direction,
- daily market median/low/high,
- price dispersion,
- distinct active listing count movement,
- reappearance/unavailable rates,
- completed-sale price/velocity only when an authorized source exists.

The History architecture in Issue #125 / PR #147 defines the underlying time-series truth.

Current Production has 107 observations for 107 listings and no listing with 2+ observations, so **real same-listing momentum is not yet available**. PR #131 + PR #136 represent the current code-only re-observation path needed to create it.

## 8. Release heat

Release heat is event context plus measured reaction, not a synonym for popularity.

Potential inputs:

- official announcement timestamp,
- official release/re-release timing,
- preorder availability,
- social acceleration around the event,
- outbound-click acceleration,
- market-listing/supply movement around the event.

Useful event windows include:

- `T-7d`,
- `T-24h`,
- `T+24h`,
- `T+7d`.

Release proximity by itself is context. It must not create a high popularity score without measured evidence.

## 9. Collector / chase evidence

This component is intentionally conservative.

Qualifying evidence may include:

- explicit official secret/rare/limited/chase attributes,
- exact variant-specific preorder premium,
- sustained purchase-intent evidence,
- authorized social chase/complete-set intent,
- future completed-sale premium evidence from an authorized source.

Product-name keyword heuristics may assist classification but cannot become independent numeric market truth.

## 10. Minimum evidence gate

### Public expectation v1

A public upcoming expectation should be `ready` only when at least **two independent qualifying evidence families** are present.

The code-only PR #133 currently proposes:

- `catalog_identity`,
- `preorder_market`,
- `authorized_social`.

Availability/restock is surfaced as supporting evidence in that PR but is not silently given forecast weight before this wider signal model is implemented.

This two-family threshold is a truthfulness gate, not a permanent product constant. It can be tuned only with versioned model validation later.

### Missing-data contract

Recommended output states:

- `ready`
- `partial`
- `insufficient_evidence`
- `unavailable`
- `stale`

For customer-facing expectation, `insufficient_evidence` should display an honest state such as `算出待ち` / `データ不足` rather than a fabricated numeric score.

## 11. Time-window semantics

Signals are time series.

Suggested initial windows where source volume supports them:

- 1h / 6h / 24h: launch/restock/social bursts,
- 7d / 30d: stable demand/supply trends,
- 90d / 365d: market history after enough observations exist,
- event windows around official announcements/restocks/releases.

For every component distinguish:

- absolute level,
- change/velocity,
- evidence coverage,
- freshness.

A large fandom with flat activity and a small item with sudden acceleration are different signals.

## 12. Provenance and anti-circularity

Every component must be reproducible from independent input evidence.

Never feed any of these back as the sole or dominant source for their own future version:

- public forecast score,
- ranking position,
- displayed popularity label,
- prior composite score.

A public ranking may consume an independently computed signal snapshot, but the rank itself must not become evidence that increases the next score.

Model versions must preserve interpretation:

- `signal-v1`,
- later `signal-v2`, etc.

If weights or qualifying evidence families change, bump the model version rather than silently rewriting historical meaning.

## 13. Mercari boundary

Mercari remains relevant to the product vision, but access capability must be described precisely.

Current official Mercari Shops API documentation exists:

- `https://api.mercari-shops.com/docs/index.html`
- `https://support.mercari-shops.com/hc/ja/categories/15261095776281-API%E9%80%A3%E6%90%BA%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6`

That is a shop-operation/integration API. It is **not evidence that Gacha Lens is authorized to harvest broad Mercari C2C listings, sold history or marketplace velocity**.

Therefore:

- current Mercari outbound clicks are valid first-party purchase-intent evidence,
- broad Mercari C2C live/sold data remains `partnership_required` / licensed-source work,
- no unauthorized scraping substitute is allowed,
- future licensed Mercari evidence should plug into the same supply/momentum/completed-sale components without redesigning the architecture.

## 14. Completed-sale evidence boundary

Completed-sale evidence is a separate capability family.

It may eventually improve:

- market momentum,
- price realization,
- sell-through/velocity,
- collector chase evidence.

But:

- active asking price is not a sale,
- `sold_out` is not a completed sale,
- disappeared listing is not a completed sale,
- outbound click is not a completed sale.

Only an explicitly authorized source contract that provides completed/sold transaction evidence may populate that family.

## 15. Storage architecture

### Phase 1 — no migration

Use the current tables and pure aggregation code/fixtures.

A normalized report can be generated in memory/server code:

```json
{
  "subject_id": "variant-...",
  "as_of": "2026-09-01T00:00:00Z",
  "model_version": "signal-v1",
  "components": {
    "purchase_intent": {
      "status": "available",
      "score": 42,
      "evidence_count": 12
    },
    "social_heat": {
      "status": "unavailable",
      "score": null,
      "evidence_count": 0
    },
    "supply_pressure": {
      "status": "partial",
      "score": null,
      "evidence_count": 1
    }
  },
  "composite": {
    "status": "insufficient_evidence",
    "score": null,
    "coverage": 0.33
  }
}
```

### Existing index observation

`outbound_clicks` is already time-window shaped with provider/time and variant/time indexes.

`stock_reports`, `restock_events` and `x_reactions` currently have primary keys plus variant/matched-variant indexes, but not dedicated variant+time composite indexes for their event timestamps.

At zero rows this is not a reason to migrate.

### Future index gate

If Production collection later creates meaningful event volume and measured queries show a need, consider separately approved indexes such as:

- `(variant_id, reported_at DESC)` for stock/restock,
- `(variant_id, posted_at DESC)` for X/social.

That is a future performance migration, not part of Signal v1 activation.

### Future `signal_snapshots`

Persist derived component/composite snapshots only if there is a proven product/analytics need for historical model outputs.

A future snapshot table would need:

- subject identity,
- `as_of`,
- model version,
- component payload,
- source/evidence counts,
- coverage/confidence,
- provenance digest.

This would be a separate schema migration with explicit human approval.

## 16. Current implementation map

The architecture already has code-only work in flight:

### PR #133 — forecast truthfulness

Purpose:

- stop metadata-only heuristics from presenting themselves as evidence-backed public expectation,
- return `total=null` / `insufficient_evidence` when the evidence-family gate fails,
- preserve descriptive metadata axes internally,
- reject manual legacy signal shortcuts,
- make public metrics/tags fail closed.

This is the first high-priority Builder after this architecture is fixed.

### PR #131 — re-observation planner

Provides deterministic same-listing observation planning and cadence semantics needed for market momentum.

### PR #136 — exact provider re-read

Provides read-only exact Rakuten/Yahoo item identity rechecks for #131.

### PR #132 — depth collector

Provides multi-offer same-variant collection needed for stronger supply-depth signals.

### PR #134 — Data Scale Scoreboard

Provides measurable data/traffic/click/revenue reporting and should be used to verify that signal/data work changes real product evidence rather than PR count.

## 17. Builder sequence

1. **Complete independent review of PR #133 Forecast Truthfulness.**
2. **Implement Signal Aggregator v1 as pure code/fixtures** using existing table-shaped evidence and first-party outbound clicks.
3. **Complete re-observation/depth review gates** so supply/momentum components gain real history/depth.
4. **Design stock/restock official-source activation** using permitted existing sources; Production-connected writes remain separately approval-gated.
5. **Design a narrow X prototype** only after explicit paid/API approval and a fresh licensing/retention review.
6. **Add event-window correlation** across release/restock/social/click/market history.
7. **Validate component weights against future observed outcomes** instead of choosing permanent weights by intuition.
8. **Consider derived snapshot/index migrations only from measured need.**
9. Continue licensed/partnership work for completed-sale/Mercari C2C evidence.

## 18. Signal Aggregator v1 acceptance criteria

A future code-only Builder should prove with fixtures/tests:

- missing component evidence returns `score=null`, not 45/50/default,
- 68-click-shaped first-party behavior can create purchase-intent evidence without claiming purchases,
- stock/restock absence remains unavailable/partial rather than false scarcity,
- one marketplace `not_found` cannot create scarcity or sold evidence,
- repeated observations can change market momentum without creating new listing identities,
- social evidence is ignored unless recognized, timestamped, review-safe and source-valid,
- composite remains insufficient until the documented diversity gate passes,
- component and composite include `model_version`, evidence counts, freshness and reasons,
- public composite cannot feed its own next input,
- completed-sale evidence remains a distinct authorized family,
- no matcher/provenance weakening,
- no paid/X/Production activation in code-only tests.

## 19. Approval boundaries

This architecture authorizes **no Production mutation**.

Separate explicit human approval remains required for:

- Production stock/restock/X inserts or updates,
- enabling a new Production-capable collection workflow/schedule,
- GitHub Actions `workflow_dispatch` on Production-capable lanes,
- X paid API activation or spend,
- X credentials/Secrets/Variables,
- any new schema/index/snapshot migration,
- any licensed/partnership data contract with cost or legal commitment,
- destructive cleanup/backfill,
- completed-sale source activation,
- broad Mercari C2C data acquisition.

No recommendation weakens:

- strict variant/listing matching,
- source/provenance review,
- fail-closed behavior,
- `sold_out != sold`,
- asking-price vs completed-sale separation,
- raw/internal signal privacy/licensing boundaries.

## 20. Evidence inventory

This architecture used read-only evidence only:

- Production Supabase aggregate/schema/index queries on 2026-09-01 JST,
- current main repository code,
- Issue #127 existing architecture audit,
- PR #133/#131/#132/#134/#136 code and contracts,
- official X API documentation checked on 2026-09-01,
- official Mercari Shops API documentation checked on 2026-09-01,
- connected GSC Wizard capability check, which reported no active subscription.

No Production DB write, migration, workflow dispatch, Secret/Variable change, paid API activation, unauthorized scrape or public score release occurred during the audit.

## Final disposition

The Signal program can proceed now without inventing new tables or guessing scores.

The next trustworthy path is:

> **repair public forecast truthfulness → aggregate existing first-party/market evidence → activate permitted stock/restock sources → add approved social data → validate weights from real outcomes.**

Gacha Lens should become valuable because it combines independent evidence families into explainable market intelligence, not because it can always display a number.