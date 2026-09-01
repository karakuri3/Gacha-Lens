# Gacha Lens Market History Architecture

Verified: 2026-09-01 JST

Parent program: Issue #119
Architecture contract: Issue #125
Related implementation drafts: PR #131 and PR #136

## Executive decision

Gacha Lens can start real repeated marketplace history **without a schema migration**.

Production already has the correct first-order split:

- `market_listings` = durable listing identity + latest validated snapshot,
- `market_listing_observations` = append-only time-series evidence.

The missing capability is execution, not basic storage shape.

The first Production-connected history rollout should therefore reuse the current tables, indexes and exact marketplace identities, add repeated observations through a dedicated re-observation lane, and keep all failure/lifecycle semantics fail-closed.

A future scheduler-state or lease table is only justified if measured scale/concurrency proves that the existing `last_observed_at` index plus deterministic observation IDs is no longer enough. Do not introduce that migration preemptively.

## 1. Current Production truth

Read-only Production inspection on 2026-09-01 JST returned:

- market listings: **107**,
- market listing observations: **107**,
- listings with 2+ observations: **0**,
- safe active single listings: **106**,
- `sold_out`: **1**,
- `sold`: **0**.

The project therefore has discovery snapshots, not a real longitudinal market-history dataset yet.

Current observation storage is tiny:

- total relation size: about **168 kB**,
- heap: about **56 kB**,
- indexes: about **80 kB**,
- average current logical row size from `pg_column_size`: about **471 bytes**,
- average `raw` payload: about **206 bytes**.

The tiny table has substantial page/index overhead. For conservative planning, use roughly **2 kB per persisted observation including index/storage overhead** until real scale measurements replace this envelope.

## 2. Existing schema is already history-shaped

Production `market_listing_observations` currently has:

- `id text primary key`,
- `listing_id text not null` → `market_listings(id)` with cascade delete,
- optional `variant_id`,
- optional `series_id`,
- `price integer`,
- `status text not null`,
- `source text not null`,
- `observed_at timestamptz not null`,
- `raw jsonb not null`,
- `created_at timestamptz not null`.

Current indexes:

- primary key on `id`,
- `(listing_id, observed_at DESC)`,
- `(variant_id, observed_at DESC)`,
- `(series_id, observed_at DESC)`.

`market_listings` already has `last_observed_at` plus an index on it.

RLS is enabled on `market_listing_observations`.

There is no custom trigger on the observation table and no uniqueness constraint on `(listing_id, observed_at)`. Retry safety must therefore come from the deterministic observation ID contract rather than from a timestamp uniqueness assumption.

### First-lane migration decision

**No migration is required for the first re-observation implementation.**

The current schema already supports:

- many observations per listing,
- chronological listing/variant/series reads,
- immutable historical points,
- current-snapshot updates through `market_listings`,
- deterministic idempotency through observation primary keys.

## 3. Two-table truth contract

### `market_listings` = identity + current snapshot

Stable identity fields must remain immutable during ordinary re-observation:

- `id`,
- `variant_id`,
- `matched_variant_id`,
- `series_id`,
- provider/source identity,
- listing type / review type,
- matching/classification provenance,
- canonical public listing identity.

Allowlisted mutable snapshot fields may include only provider-proven current state:

- `price`,
- supported current availability/status,
- `last_observed_at`,
- `updated_at`,
- narrowly sanitized current raw snapshot fields,
- `sold_at` only if a future source provides explicit authorized completed-sale evidence.

`listed_at`/first-seen semantics must not be rewritten on every observation.

### `market_listing_observations` = append-only evidence

Each successful provider recheck can append one observation for the same listing identity.

An observation records what was actually observed at that moment:

- listing identity,
- variant/series linkage,
- price,
- provider-supported availability/status,
- source,
- observation timestamp,
- bounded sanitized provenance.

Historical observations must not be updated merely because the current listing snapshot changes later.

Repeated observations are **not**:

- new independent listings,
- completed transactions,
- merchant identities,
- proof that an item sold.

## 4. Observation identity and idempotency

Observation identity must be deterministic from stable listing identity plus a logical observation window/run key.

The current PR #131 proposal follows this principle by deriving the observation ID from:

- listing identity,
- provider,
- logical observation key.

Required invariants:

1. retry of the same logical observation window produces the same observation ID;
2. retry cannot create a second historical row;
3. a later legitimate window produces a different observation ID;
4. price/status must **not** be part of identity;
5. unchanged price/status is still useful time evidence and can create a later observation;
6. identity mismatch produces zero planned history mutation.

### Logical bucket guidance

The bucket must match the cadence tier rather than use arbitrary wall-clock timestamps.

Examples:

- 6-hour hot bucket,
- daily active bucket,
- 72-hour unavailable bucket.

The exact implementation may instead use an explicit deterministic workflow/run key, provided same-run retry remains idempotent and a future legitimate check gets a new ID.

## 5. Lifecycle semantics

History must separate provider observations from inferred lifecycle claims.

### Ordinary successful states

For the current Rakuten/Yahoo exact-read architecture:

- provider says purchasable/in stock → `active`,
- provider explicitly says unavailable/out of stock → `sold_out` or the existing provider-supported unavailable semantic.

### Failure outcomes are not listing lifecycle states

These outcomes must not fabricate a listing status transition:

- `not_found`,
- `throttled`,
- `provider_error`,
- `identity_mismatch`,
- malformed response,
- timeout.

A missing or failed provider read does **not** mean sold.

### Completed-sale boundary

`status=sold` is reserved for explicit completed/sold transaction evidence from an authorized source contract.

`sold_out` means unavailable at the observed seller/provider. It is not completed-sale evidence.

No current Rakuten/Yahoo re-observation path should invent `sold`.

### Reappearance

A listing can truthfully move:

`active → sold_out → active`

when explicit provider observations support each state.

History remains append-only so the unavailable interval and reappearance are preserved rather than overwritten.

## 6. Cadence architecture

One permanent global interval is not appropriate.

The current code-only PR #131 cadence proposal is:

| Tier | Proposed interval | Purpose |
| --- | ---: | --- |
| hot | 6h | recent/high-value/volatile/event-window listings |
| active | 24h | ordinary available listings |
| unavailable | 72h | explicit unavailable/sold-out listings |

These values are a starting proposal, not a Production approval or immutable product specification.

### Priority inputs for later tuning

Cadence can eventually consider:

- current provider state,
- `last_observed_at`,
- release/restock/announcement proximity,
- observed price volatility,
- user outbound-click demand,
- variant traffic/search demand,
- listing age,
- provider request cost/quota,
- recent provider throttle/error rate.

Do not let a displayed popularity/forecast score feed back into itself as the sole scheduling signal.

### Freshness vs retention

These are separate concepts:

- **freshness** answers when a listing should be checked again;
- **retention** answers how long historical evidence should be preserved.

A listing becoming stale must never cause old observations to be deleted automatically.

## 7. First scheduler architecture — no new queue table

At the current scale, the simplest safe scheduler is database-read + deterministic planning.

1. Read eligible known listings ordered by due priority and `last_observed_at`.
2. Apply pure due/cadence logic.
3. Partition selected listings by provider.
4. Use exact persisted provider item identity; no keyword rediscovery.
5. Execute provider reads serially or with provider-safe bounded concurrency.
6. Normalize the provider response.
7. Revalidate exact identity against the persisted listing.
8. Build deterministic observation + allowlisted snapshot update plans.
9. In a future approved writer, persist in bounded transactions.
10. Verify observation insert/idempotent conflict and listing snapshot update separately.
11. Emit sanitized aggregate outcomes.

This can use the existing `last_observed_at` index and observation primary key.

## 8. Scaling the scheduler to tens of thousands of listings

### Stage A — hundreds to low thousands

Use:

- indexed due reads,
- bounded limit,
- provider partitioning,
- serial/provider-safe pacing,
- deterministic observation IDs.

No scheduler-state migration is justified.

### Stage B — thousands to tens of thousands

Add code-level scaling first:

- keyset pagination rather than large OFFSET scans,
- deterministic provider partitions,
- per-provider request budgets,
- bounded worker concurrency,
- run-level maximum wall-clock budget,
- continuation cursor in sanitized workflow/run metadata,
- explicit success/throttle/error counters.

The data model can still remain unchanged if one coordinator owns a partition at a time.

### Stage C — only if concurrency evidence requires persistent leasing

A future dedicated scheduler-state table may become useful if Gacha Lens reaches concurrent workers where duplicate claims, backoff or lease recovery cannot be handled cleanly by deterministic IDs alone.

Possible future fields:

- `listing_id`,
- `next_due_at`,
- `last_attempt_at`,
- `failure_count`,
- `lease_owner`,
- `lease_expires_at`.

This is **not approved or required now**. It would be a separate schema migration with explicit evidence and human approval.

## 9. Failure, retry and backoff rules

### Within one provider request

Use bounded retry only for explicitly retryable conditions.

The exact provider reader in PR #136 already proposes bounded timeout/retry diagnostics and provider pacing.

### Within one run

A listing should be attempted at most once per logical selection unless the provider adapter performs its own bounded retry.

A provider failure must produce:

- no false observation,
- no false current-snapshot update,
- sanitized error classification,
- continued processing of unrelated safe listings where policy allows.

### Across runs

`last_observed_at` means **last successful observation**, not last failed attempt.

At early scale, a failed listing may remain due for the next bounded run. This is acceptable while run frequency and population are small.

If repeated failures later cause waste, add evidence-based scheduling/backoff state rather than overloading market truth fields with operational failure metadata.

Do not advance `last_observed_at` merely to suppress retries after a failed provider request.

## 10. Persistence transaction contract

A future Production writer must be separately approved and should enforce these steps for each bounded batch:

1. fresh-read the existing listing identities;
2. verify every selected listing still matches the approved/provider-read plan;
3. reject identity/provenance drift;
4. insert deterministic observation rows append-only;
5. update only allowlisted listing snapshot fields;
6. verify observation IDs and snapshot values post-write;
7. verify protected identity fields did not change;
8. report exact inserted/no-op/updated counts;
9. rollback the bounded batch on unverifiable partial state.

### Partial-success policy

Provider failures before persistence should be isolated from successful listings.

Within a persistence batch, never report global success when an unknown partial write exists. Either:

- use one transaction for the bounded batch, or
- make each listing operation independently idempotent and verify every committed unit explicitly.

## 11. History aggregation semantics

The current public helper `lib/domain/market-observation-history.js` already contains an important anti-bias rule:

- dedupe to the latest observation per `listing_id + UTC day`,
- then aggregate daily prices.

This prevents a more frequently checked listing from receiving multiple votes in the same daily market price simply because it was polled more often.

The existing helper currently limits output to 30 days. Supporting 90/365-day views is primarily an application/query/aggregation extension, not a schema requirement.

### Daily market snapshot

For a variant/day:

1. select latest valid observation per listing for that UTC/JST-normalized product day according to the chosen public contract;
2. filter review-ineligible evidence;
3. count distinct listing identities;
4. calculate median, mean, low and high across those listing snapshots;
5. track available/unavailable counts separately.

Do not calculate a daily market median from every raw poll because hot listings would be overweighted.

### 7/30/90/365-day changes

Recommended contract:

- calculate a daily market median or another explicitly named daily estimator first,
- choose the latest valid daily estimator at/near each window anchor,
- compare like-for-like estimators,
- return insufficient-history rather than fabricating a change when an anchor has no evidence.

### Min/max/median

Always name the population:

- asking-price observations,
- completed/sold evidence,
- active listing snapshots.

Do not mix active asking prices with completed-sale prices in the same unlabeled statistic.

### Supply trend

For each time bucket, derive:

- distinct observed active listing count,
- distinct provider/storefront count where proven,
- new listing identities,
- unavailable identities,
- reappearances.

Repeated polls of the same listing do not increase supply count.

## 12. Event-window analytics

Once history exists, joins against release/restock/announcement evidence can derive:

- price before/after official release,
- price before/after restock/re-release,
- supply before/after restock,
- volatility around announcements,
- recovery time after stock-out,
- relationship between outbound-click demand and market movement.

Event causality must not be claimed solely because two events are temporally adjacent. Product UI should describe observed correlation unless stronger evidence exists.

## 13. Retention and downsampling

### Current policy

Retain raw observations.

At 107 observations there is no storage reason to delete or compress truthful evidence.

Unchanged observations are useful because they prove:

- continued availability,
- price stability,
- observation coverage,
- absence of a state change during that interval.

### Conservative storage envelope

Using approximately 2 kB/observation as a deliberately conservative planning envelope:

| Observation count | Rough relation+index envelope |
| ---: | ---: |
| 100k | ~200 MB |
| 1M | ~2 GB |
| 10M | ~20 GB |

These are planning estimates, not billed-storage forecasts. Re-measure real PostgreSQL relation/index/TOAST sizes as the dataset grows.

### Current-scale annual example

106 active listings at one successful observation/day would produce about **38,690 observations/year** before hot/unavailable adjustments.

At the 2 kB planning envelope that is only about **77 MB/year** of history.

### Larger-scale examples

- 10,000 listings × daily = 3.65M observations/year ≈ 7.3 GB/year at the envelope.
- 100,000 listings × daily = 36.5M observations/year ≈ 73 GB/year at the envelope.

Provider quota/cost and query architecture will likely become important before raw row count alone becomes a reason to discard history.

### Future downsampling gate

Do not downsample until measured storage/query cost requires it.

If eventually needed, preserve at minimum:

- every change point,
- every lifecycle transition,
- first and last observation of a retained interval,
- event-window observations,
- completed-sale evidence,
- enough unchanged checkpoints to prove availability duration,
- provenance needed to audit derived metrics.

Downsampling must be versioned, documented and separately approved. Never silently rewrite historical truth.

## 14. Read/query architecture at scale

### Listing detail

Use `(listing_id, observed_at DESC)` for exact listing history.

### Variant charts

Use `(variant_id, observed_at DESC)` and dedupe by listing/day before aggregate output.

### Series analytics

Use `(series_id, observed_at DESC)` for series-level windows, with variant/listing identity retained through aggregation.

### Long windows

If 90/365-day public queries become expensive at millions of rows, prefer derived read models/materialized aggregates built from immutable raw observations rather than deleting source observations.

A materialized/summary layer is a future performance optimization and separate schema decision, not required for the first history lane.

## 15. Security and provenance

Observation history must not become a place to dump raw provider responses or credentials.

Never persist or emit:

- application IDs,
- access keys,
- affiliate IDs unless already part of an approved public provenance field,
- authorization headers,
- cookies/tokens,
- full raw provider payloads containing unnecessary fields.

Persist only the bounded evidence needed to reproduce the normalized market observation and provider identity contract.

## 16. Metrics for the re-observation system

Each dry-run and eventual approved Production run should report sanitized counts:

- selected/due listings,
- provider request count,
- successful exact reads,
- `unchanged`,
- `price_changed`,
- `status_changed`,
- `not_found`,
- `throttled`,
- `provider_error`,
- `identity_mismatch`,
- planned/actual observation inserts,
- idempotent no-ops,
- listing snapshot updates,
- post-write verification failures,
- provider latency/pacing summary where safe.

Daily Data Scale reporting should separately expose:

- observations/day,
- repeated observations/day,
- re-observation rate,
- listings with 2+/3+/7+/30+ observations,
- median observation age,
- active listing freshness buckets,
- price-change rate,
- status-change/reappearance counts.

## 17. Relationship to current Draft PRs

### PR #131 — core re-observation domain

The current code-only draft already implements much of this architecture:

- deterministic retry-safe observation IDs,
- exact persisted/fetched identity comparison,
- explicit outcome classes,
- append-only observation planning,
- allowlisted current-snapshot planning,
- `active`/`sold_out` ordinary states only,
- zero/invalid price rejection,
- due cadence logic,
- sanitized dry-run metrics,
- Production actions 0.

It remains subject to its independent Verifier/Reviewer gate before merge readiness.

### PR #136 — exact provider reader

The stacked code-only draft adds:

- exact Rakuten persisted `itemCode` rereads,
- exact Yahoo persisted `itemcode` rereads,
- no keyword rediscovery,
- bounded provider pacing/retry diagnostics,
- sanitized dry-run runner,
- Production DB writes 0.

It depends on PR #131 and remains separately review-gated.

### Architectural implication

Issue #125 does not need another competing history implementation. Its durable design should guide verification, rollout design and later scale tuning of #131/#136.

## 18. Safe fixture/test acceptance contract

Before any Production-connected writer is considered, code/fixtures must prove:

1. one listing receives at least three observations across distinct logical windows;
2. same-window retry yields the same observation ID;
3. unchanged price/status still produces valid later evidence;
4. price change leaves earlier observations unchanged;
5. current listing snapshot changes only allowlisted fields;
6. explicit sold-out then active reappearance preserves both states;
7. provider not-found does not fabricate sold;
8. provider error/throttle creates zero false market mutation;
9. fetched identity mismatch fails closed;
10. zero/negative/invalid price fails closed;
11. historical observation rows are never updated/deleted by ordinary re-observation;
12. raw provider secrets/payloads are not serialized;
13. provider request metrics are bounded and sanitized;
14. public daily aggregation does not overweight multiple polls of one listing/day;
15. completed-sale calculations exclude `sold_out`.

## 19. Production rollout sequence — approval gated

This document does not authorize these actions. When the code review gates pass, the safest later sequence is:

### Phase R0 — code-only complete

- #131 independent Verifier/Reviewer PASS,
- #136 independent Verifier/Reviewer PASS after dependency reconciliation,
- full regression/lint/Preview green.

### Phase R1 — Production-read/provider-read dry-run

Separate approval if credentials/provider calls cross an existing human boundary.

- read a very small due-listing sample,
- exact provider rereads only,
- DB writes 0,
- inspect success/not-found/throttle/error/identity-mismatch rates,
- verify no secret/raw response leakage.

### Phase R2 — bounded write canary

Separate explicit human approval required.

- tiny exact list of listing identities,
- append observation + allowlisted snapshot update only,
- exact before/after counts,
- post-write verification,
- rollback evidence.

### Phase R3 — bounded automatic rollout

Requires separate approval for Production-capable schedule/workflow behavior.

- conservative batch cap,
- provider pacing,
- health/error stop conditions,
- observation growth scoreboard,
- no broad migration.

### Phase R4 — measured scale-up

Only increase cadence/concurrency/budget from observed provider and database evidence.

## 20. Stop conditions

Pause a future rollout and require investigation if any of these occur:

- provider identity mismatch,
- observation/listing variant or series drift,
- unexpected protected-field mutation,
- false `sold` generation,
- raw credential/secret serialization,
- unbounded retry loop,
- unexplained duplicate observation IDs across distinct windows,
- partial write with unverifiable state,
- provider throttling/error rate beyond the approved threshold,
- query/storage regression large enough to threaten Production reliability.

## 21. Approval boundaries

This architecture work performed no Production mutation.

Explicit human approval remains required for:

- Production observation/listing writes,
- enabling a new Production re-observation writer,
- changing Production-capable workflow/schedule/gates,
- workflow dispatch of a Production-capable lane,
- schema migrations/backfills/cleanup,
- Secrets/Variables changes,
- paid provider/API activation,
- destructive or irreversible history retention changes.

## Final disposition

The history architecture is ready at the design level:

> **Keep listing identity stable, append observations, update only the current snapshot, fail closed on provider ambiguity, and postpone new scheduler/storage schema until measured scale requires it.**

The highest-leverage next step is not another schema redesign. It is to finish the independent review gates on PR #131 and PR #136, then gather provider-read-only dry-run evidence for a separately approval-gated Production rollout.
