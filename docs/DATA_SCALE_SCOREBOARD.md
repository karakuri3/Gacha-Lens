# Gacha Lens Data Scale Scoreboard

Issue: #126
Parent program: #119

## Purpose

The Scoreboard is the standard way to answer one question:

> Is Gacha Lens becoming a larger, deeper, more useful data product today?

PR count, test count and agent activity are engineering diagnostics. They are not the primary product-progress KPI.

The Scoreboard reports five independent panels:

1. DATA
2. TRAFFIC
3. CLICK
4. REVENUE
5. COLLECTION HEALTH

Do not collapse these panels into a single vanity score.

## Truthfulness contract

Every measured metric has an availability state.

- `available`: the value was actually measured.
- `unavailable`: the source/report was not available to this run.
- `not_instrumented`: Gacha Lens does not yet have the reviewed instrumentation or activation needed to claim the metric.

`0`, `unavailable` and `not_instrumented` are different facts and must never be converted into each other.

Source capability state is a separate concept. Capability entries use the durable Data Scale vocabulary:

- `active`
- `planned`
- `partnership_required`
- `paid_access_required`
- `manual_only`
- `unavailable`

Do not confuse a capability state such as `paid_access_required` with a measured signal state such as `not_instrumented`.

Examples:

- `stock_reports = 0` after reading the table means an available measured zero.
- disconnected Search Console means Traffic is `unavailable`, not zero impressions.
- X without reviewed/authorized collection means the social signal metric is `not_instrumented`, not zero interest, while its source capability remains `paid_access_required`.
- affiliate-provider revenue without a connected provider report is `unavailable`, not zero revenue.
- zero rows in database `ingestion_runs` does not prove zero GitHub Actions collection runs; those run sources are reported separately.

## DATA panel

### Catalog

- total series
- total variants
- active supported source count
- total source capability inventory count
- source capability inventory with explicit per-source state

`supported_source_count` counts only `active` capability entries. Partnership-only, paid-access-required and merely planned sources are not counted as active support.

### Market breadth

- total market listings
- active safe single listings
- distinct variants with market evidence
- fresh variant coverage at <24h / <7d / <30d
- provider split
- new listings at 24h / 7d / 30d
- completed-sale evidence count
- verified affiliate provenance count and provider split

### Market depth

Fresh <30d listings are bucketed independently from public minimum-display thresholds:

- 0
- 1
- 2
- 3–4
- 5–9
- 10+

`3 listings` is never treated as collection completion. It is only a historical minimum display gate in market-evidence semantics.

The Scoreboard also reports p50 / p90 / max fresh distinct listings per covered variant.

### History

- total observations
- new observations at 24h / 7d / 30d
- observations per known listing p50 / p90 / max
- listings with 0 observations
- listings with 1 observation
- listings with 2–4 observations
- listings with 5+ observations
- re-observed listings total and recent windows
- re-observation rate
- re-observation outcome counts when #128 instrumentation is present

Known listings with zero observations must remain visible. Omitting them would make history health look better than reality.

### Signals

- review-safe stock reports
- review-safe restock/re-release events
- X/social only after reviewed authorized activation
- expectation-score provenance coverage only after instrumentation exists

`review_required=true` stock/restock/social rows are excluded by the domain Scoreboard contract, not merely by one CLI caller.

## TRAFFIC panel

Traffic values are supplied only when trustworthy analytics access exists.

Examples:

- Search Console impressions and clicks
- indexed/known page coverage
- organic sessions
- engagement

Disconnected analytics must remain `unavailable`.

## CLICK panel

Current first-party outbound-click instrumentation supports:

- 24h / 7d / 30d outbound clicks
- distinct variants clicked
- provider split
- provider+variant affiliate-eligible click share

Affiliate-eligible click share is not a conversion or revenue metric. Current click rows do not contain listing identity, so the Scoreboard deliberately does not claim listing-level attribution.

## REVENUE panel

Revenue is populated only from verified provider reporting.

Possible future metrics:

- affiliate orders
- affiliate revenue
- conversion rate
- EPC
- AdSense revenue after activation

Until those reports are connected, the panel remains `unavailable` or `not_instrumented` as appropriate.

## COLLECTION HEALTH panel

Collection execution is intentionally separated by evidence source:

- `database_market_runs_24h` and success/failure counts come only from the Production `ingestion_runs` table.
- `workflow_market_runs_24h` and success/failure counts require separately supplied reviewed workflow evidence; without it they are `not_instrumented`.
- the Scoreboard does not sum these into a fake global run count when one lane is missing.

Other collection-health metrics:

- unresolved import issues by sanitized reason class
- provider request metrics when instrumented
- Re-observer outcomes when instrumented
- Depth Collector metrics when instrumented
- observed daily listing/observation growth
- theoretical throughput only when explicitly supplied by reviewed instrumentation

The automatic bottleneck label advances in this order when evidence supports it:

1. `history_not_enabled`
2. `depth_insufficient`
3. `source_gap`
4. `signal_gap`
5. `monitor`

The label is diagnostic, not a business KPI by itself.

## Production read-only CLI

Run from a configured repository checkout:

```bash
node scripts/data-scale-scoreboard-report.mjs
```

Human + JSON:

```bash
node scripts/data-scale-scoreboard-report.mjs --both
```

Save a JSON snapshot:

```bash
node scripts/data-scale-scoreboard-report.mjs --json --out artifacts/data-scale-scoreboard.json
```

Compare with prior snapshots:

```bash
node scripts/data-scale-scoreboard-report.mjs \
  --json \
  --previous-day artifacts/data-scale-scoreboard-yesterday.json \
  --previous-week artifacts/data-scale-scoreboard-last-week.json
```

The CLI deliberately reads Production tables sequentially through the existing reliable Supabase read helper. It does not call upsert/delete/migration/workflow APIs.

Local snapshot-file output is optional and is not a Production database action.

## Read minimization

The CLI selects only fields required for metrics.

It reads `market_listings.raw` only because the current verified affiliate-provenance contract and provider identity are stored there. The Scoreboard never emits that raw object.

It does not read `import_issues.note` or arbitrary issue text into the output. Reason reporting uses the sanitized issue type available to the read-only report.

The current Production schema was re-checked read-only before the clean #126 settlement; the selected `review_required`, timestamp and identity columns used by this CLI exist on the relevant tables.

The base CLI does not call GitHub APIs. Therefore GitHub Actions run counts must remain `not_instrumented` until reviewed workflow evidence is supplied instead of being inferred from an unrelated database table.

## Source capability states in v1

Current conservative built-in inventory:

- official catalog/release facts: `active`
- Rakuten market listings: `active`
- Yahoo Shopping market listings: `active`
- X social signals: `active` only after reviewed authorized fetching is enabled; otherwise `paid_access_required`
- Mercari market history/completed-sale data: `partnership_required`

Mercari is intentionally retained in the strategic source model even before authorized access exists. The Scoreboard must never turn partnership-required or paid-access-required into active support merely because a provider is strategically valuable.

The broader source matrix may add more capability entries later; that does not itself authorize scraping, paid access, credentials, or Production integration.

## Current P0 interpretation

At the dated 2026-09-01 baseline, the dominant evidence was:

- catalog: ~23.8k variants
- market listings: only ~100, later measured at 107
- nearly all covered variants had one fresh listing
- known listings had only one observation each at the 107/107 checkpoint
- stock/restock were measured zero
- X was not activated
- first-party outbound clicks were present

A read-only validation during the clean #126 settlement still measured 10,241 series, 23,808 variants, 107 listings, 107 observations, zero completed sales, zero listings with 2+ observations, and review-safe stock/restock/X counts of zero. Database `ingestion_runs` showed zero market rows in that 24h window, while that must not be interpreted as evidence about GitHub Actions runs.

#150, #153 and #156 established code-only history/depth foundations. They did not authorize Production persistence. Engineering work should therefore be judged by actual breadth, depth, history and conversion movement once separately approved rollouts occur, not by the number of PRs created.

## Safety boundaries

Scoreboard v1 must not:

- mutate Production data
- dispatch workflows
- change schedules or gates
- change Secrets / Variables
- activate paid APIs
- expose credentials
- expose raw provider payloads
- infer unavailable metrics as zero
- call active listing prices completed sales
- treat `sold_out` as completed-sale evidence
- treat three listings as collection completion
- count partnership-required or paid-access-required sources as active support
- surface review-required stock/restock/social rows as trusted signal coverage
- claim database ingestion records represent GitHub Actions execution

Any future write, schedule, paid-service or Production activation remains a separate approval boundary.
