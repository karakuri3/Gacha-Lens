# Gacha Lens Production History / Depth Rollout Plan

Verified planning baseline: 2026-09-02 JST
Parent program: Issue #119
Planning issue: #165
Companion pre-persistence safety repair: #166 / PR #167

## Executive decision

Gacha Lens is ready to move from code-only Data Scale foundations toward a bounded Production history/depth rollout, but **not yet to execute Production writes automatically**.

The current bottleneck is measured as `history_not_enabled`: Production has a large catalog but almost no compounding market history or per-variant listing depth.

The safe rollout order is:

1. keep the existing P3 V2 lane responsible for breadth only;
2. activate a tiny read-only exact-provider re-observation canary after explicit approval;
3. repair and merge the equal-timestamp/null-time safety blocker before any Production persistence;
4. run a tiny separately approved re-observation persistence canary;
5. run a separately approved depth-discovery/read-only canary for a very small explicit variant cohort;
6. persist depth only in a separately approved insert-only canary;
7. re-run the read-only Scoreboard after every Production-impacting canary;
8. scale only from measured evidence, never from the theoretical budget ceiling.

This document is a **plan only**. It authorizes no live credentialed provider requests, Production writes, workflow dispatches, schedule changes, Secrets/Variables changes, paid API access, or contractual commitments.

## 1. Fresh Production baseline

Issue #165 recorded the read-only Production Scoreboard at 2026-09-02 01:49 JST on main `c7fe091003aae50c359efebcaca1f1cffb88eedd`:

- series: **10,241**
- variants: **23,808**
- market listings: **107**
- observations: **107**
- re-observed listings: **0**
- depth distribution among covered variants at that read:
  - x1: **96 variants**
  - x2: **1 variant**
  - x3+: **0 variants**
- completed `sold` evidence: **0**
- dominant Scoreboard bottleneck: **`history_not_enabled`**

The durable interpretation is not “collection is nearly complete.” It is the opposite: the catalog is broad, while market breadth, depth and longitudinal evidence remain very thin.

These counts are dated evidence, not permanent constants. Immediately before any live or write-capable canary, re-run the read-only Scoreboard and abort/re-plan if material drift changes the cohort or expected deltas.

## 2. Current provider / workflow health evidence

The existing lawful marketplace sources remain Rakuten Ichiba and Yahoo Shopping. Aucfan, X, Mercari C2C and other future sources remain outside this rollout according to `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`.

Latest visible P3 V2 automatic run at planning time:

- Run #41: `33517826786`
- scheduled: 2026-09-01 23:10 JST
- conclusion: failure

Exact job inspection shows the failure occurred at `Verify exact current main revision`. The execution-gate, P3 collector, artifact scan and artifact upload steps were all skipped. Therefore Run #41 is a **main-race guard failure**, not provider throttling, timeout, API rejection, or collection-quality evidence.

The preceding Run #40 (`33488346438`) completed successfully and remains the latest actual collector-executing run previously measured for the P3 funnel.

Do not change provider request budgets merely because a workflow is red. Collection health must separate exact-main/orchestration failures from provider/network failures, throttling, identity/matcher rejection, no-result cases, accepted candidates and persistence results.

## 3. Lane ownership

### 3.1 P3 V2 breadth lane

Purpose: find a safe first marketplace listing for more variants.

P3 remains responsible for **breadth** only. It must keep the strict single-item matcher, reject set/multiple/ambiguous evidence, preserve provider identity/provenance, avoid treating `3 listings` as a collection target, and avoid being repurposed into repeated-history polling or many-offer depth collection.

Do not raise the P3 cap merely to solve history or depth. The throughput audit already showed that the theoretical cap was not the primary limiter.

### 3.2 Re-observation lane

Purpose: compound time-series evidence for **known exact listing identities**.

The merged #150/#153 contracts define this lane:

- exact persisted identity only;
- no keyword rediscovery;
- append-only observation evidence;
- current snapshot updates only for allowlisted fields;
- ordinary states limited to `active` / `sold_out`;
- no false completed `sold`;
- positive integer price required;
- explicit provider availability required;
- stale observations fail closed;
- credential-bearing requests restricted to reviewed official provider destinations;
- redirects refused;
- same logical observation key is retry-idempotent.

### 3.3 Depth lane

Purpose: accumulate **many genuinely distinct safe marketplace offers** for explicit target variants.

The merged #156 contract defines this lane:

- explicit target variant + parent series;
- same strict P3 safety predicate;
- distinct durable listing identity required;
- provider+source-listing identity dedupe;
- canonical URL dedupe;
- existing listings excluded;
- same price/title does not collapse genuinely distinct identities;
- SHA-256 selection binding prevents post-selection drift;
- projected writes are insert-only;
- budget 50 / max 200 are operational safety ceilings, not product completion targets.

Breadth, depth and re-observation must remain separate so that tuning one lane does not silently weaken another lane’s semantics.

## 4. Mandatory pre-persistence repair

Production persistence for re-observation is blocked by Issue #166 until the repair is independently reviewed and merged.

Confirmed current-main gaps before #166:

1. `observedAt < last_observed_at` fails closed, but `observedAt === last_observed_at` could accept a conflicting price/status;
2. null/blank observation time could be coerced through JavaScript Date semantics instead of failing the required-input contract.

Required pre-persistence semantics:

- older timestamp -> `provider_error / stale_observation_time`, zero writes;
- equal timestamp + conflicting price or status -> fail closed, zero writes;
- equal timestamp + unchanged price/status + same logical key -> deterministic retry-safe behavior;
- null/undefined/blank observation time -> invalid input, never epoch coercion.

PR #167 contains the bounded code/test repair, but this plan does not represent its independent Verifier/Reviewer gate as complete.

**No re-observation Production persistence canary may run until #166 is closed by an independently reviewed merged repair.**

## 5. Rollout stages

Each stage is a separate approval boundary. Approval of one stage does not authorize the next.

### R0 — planning / repository verification

Current stage. Allowed: read-only Production counts, read-only GitHub/Vercel state, code/test/docs review, Preview deployment and static secret scan.

Not allowed by this stage: live credentialed Production provider calls, Production DB writes, workflow dispatches, schedule changes, Secret/Variable changes or paid access activation.

Exit criteria:

- this plan exact-head validated;
- #166 repair review path resolved before persistence;
- exact cohort/query/write contracts are reviewable;
- current main unchanged or drift reviewed.

### R1 — live provider read-only re-observation canary

Requires explicit approval for **live Production-connected provider reads**.

Proposed cohort: **6 known listings total**.

Provider split:

- 3 Rakuten
- 3 Yahoo Shopping

Selection rules:

- exact persisted identity complete and review-safe;
- ordinary current state `active` or `sold_out`;
- due under the merged cadence contract;
- no unresolved import/review issue;
- prefer listings that already have one observation so the later persistence canary produces immediately measurable history gain;
- do not choose based solely on displayed popularity/forecast score.

Request budget:

- logical listings checked: 6 maximum;
- normal first attempts: 6 maximum;
- provider adapter bounded retries remain max 3 attempts only for existing retryable classes;
- absolute worst-case HTTP attempt envelope: **18** across the six listings;
- Rakuten same-provider minimum spacing: **1200 ms**;
- Yahoo same-provider minimum spacing: **1000 ms**;
- serial execution;
- no keyword fallback.

R1 persistence: observations inserted 0, listings updated 0, deletes 0.

R1 success criteria:

- all requests stay on reviewed official host+exact path;
- no credentials/raw response bodies emitted in artifacts;
- identity mismatch creates zero planned writes;
- invalid/missing availability creates zero planned writes;
- no provider result fabricates `sold`;
- sanitized outcome counts are internally consistent;
- provider throttle/error evidence is reported separately from matcher/identity failures.

R1 stop conditions include credential-destination validation failure, unexpected redirect, malformed identity, secret/raw-body leakage, unexpected lifecycle status, material provider-contract drift, or retry/rate-limit behavior beyond the bounded adapter contract.

A failed R1 does not mutate market truth and does not advance `last_observed_at`.

### R2 — tiny re-observation Production persistence canary

Requires all of:

1. explicit Production DB write approval for the exact cohort;
2. #166 independently reviewed and merged;
3. fresh current-main / Scoreboard drift check;
4. successful R1 read-only evidence or equivalent newer reviewed provider evidence;
5. exact deterministic observation keys frozen before write.

Proposed cohort: **4 known listings total** — 2 Rakuten and 2 Yahoo Shopping.

Why four: baseline has zero re-observed listings, so four successful rows already prove end-to-end compounding while keeping rollback and verification human-auditable.

Expected successful write shape for four previously single-observation listings:

- `market_listings` row count: unchanged;
- observation insert attempts: 4 deterministic IDs;
- expected net new observation rows: **+4** on first successful logical bucket;
- same-bucket retry: **+0 duplicate rows**;
- re-observed listing count: expected **+4** if all four started at one observation;
- completed `sold`: expected **+0**;
- protected identity fields changed: 0;
- deletes: 0.

Listing snapshot updates may update only price, status (`active` / `sold_out` only), `last_observed_at` and `updated_at`. No ordinary re-observation may change listing identity/provenance fields or create `sold_at`.

#### Transaction contract

Before the transaction:

1. re-read all four listing identities;
2. re-read exact current price/status/last_observed_at;
3. bind exact provider results and deterministic observation IDs;
4. reject target/provenance drift;
5. capture before counts for listings, observations, re-observed listings and completed `sold`.

Preferred first-canary persistence is one bounded transaction covering the four-listing batch. If a later implementation uses independently idempotent per-listing units, every committed unit must be explicitly reread and verified. Unknown partial state is not success.

After persistence:

1. re-read each expected observation ID;
2. re-read all four listing snapshots;
3. verify protected identity fields are unchanged;
4. verify exact before/after counts;
5. verify no unexpected `sold` evidence;
6. retry the same logical bucket once only if the approved canary explicitly includes an idempotency proof, expecting zero additional observation rows;
7. run Scoreboard read-only.

If the transaction is known not committed, leave Production unchanged and record failure. If a committed state fails post-write verification, stop immediately, preserve exact inserted IDs/before-state evidence and prepare a narrowly scoped rollback plan. Any destructive cleanup requires separate explicit destructive Production-data approval unless the original transaction can still be atomically rolled back before commit.

Never silently delete historical observations merely to make counts look correct.

### R3 — read-only depth discovery canary

Requires explicit approval for any live provider/search execution using Production credentials/data.

Proposed cohort: **2 explicit target variants**.

Target selection:

- one variant with existing Rakuten evidence;
- one variant with existing Yahoo evidence where practical;
- stable official variant identity;
- no unresolved catalog ambiguity;
- current depth <=1 preferred so gain is measurable;
- avoid choosing a target merely because it is easy to match.

Depth Collector accepted-row budget for the canary: **5 per target variant**, total accepted-row planning ceiling **10**. This is intentionally below the code default 50 / hard max 200.

Provider retrieval/search request budget must be specified by the eventual retrieval adapter before execution. Until that adapter contract is exact and reviewed, this plan does **not** invent or authorize a live HTTP request count.

R3 writes: 0.

Success requires the strict P3 safety predicate unchanged, exact target variant/series, no duplicate native provider identity/listing ID/canonical URL, existing listings excluded, stable SHA-256 selection fingerprint, insert-only projected writes and no `3 listings = done` semantic.

### R4 — tiny depth Production persistence canary

Requires separate explicit Production write approval after R3.

Proposed maximum accepted rows: **up to 5 new distinct listings per target, 10 total maximum**. If R3 returns fewer valid offers, persist only the verified accepted subset; never fill the budget with weaker matches.

Expected write contract per accepted new listing:

- market listing INSERT: 1;
- initial observation INSERT: 1;
- listing UPDATE: 0;
- observation UPDATE: 0;
- delete: 0.

Before/after verification:

- total listing delta = accepted distinct listing count;
- total observation delta = same accepted count;
- every new listing has exactly one initial observation;
- no duplicate provider/source identity;
- no duplicate canonical URL;
- no protected existing listing changed;
- completed `sold` delta = 0.

If any row fails identity or post-write verification, stop. Do not automatically replace it with another candidate inside the same approved canary unless that replacement was part of the frozen plan.

### R5 — measured scale-up proposal only

After R2/R4 evidence, compare Scoreboard before/after, calculate actual provider error/throttle rates, accepted distinct-offer yield and history compounding gain, estimate daily request/storage costs, and propose the next cohort/cadence.

Do not automatically enable a schedule or raise budgets. A schedule/workflow activation is a new Production-capable change and needs its own review/approval.

## 6. Cadence proposal

Use the merged history architecture as the initial proposal:

| Re-observation tier | Proposed interval | Meaning |
| --- | ---: | --- |
| hot | 6h | explicit high-value/event-window listings |
| active | 24h | ordinary currently available listings |
| unavailable | 72h | explicit provider unavailable/sold-out listings |

These intervals are not authorized by this document.

Do not begin with every 6-hour hot path globally. First automatic scheduling, after successful canaries, should prefer ordinary 24-hour active coverage with a small bounded daily request budget. Hot 6-hour scheduling should be enabled only for an explicit subset with measured value and provider-health evidence.

`last_observed_at` remains the last successful observation, not the last failed attempt.

## 7. Idempotency contract

### Re-observation

Observation identity is deterministic from listing identity, provider and logical observation key/bucket.

Requirements:

- same listing + same provider + same logical key -> same observation ID;
- retry cannot create a duplicate historical row;
- later legitimate bucket -> new observation ID;
- price/status are not part of identity;
- equal timestamp with conflicting market state fails closed before persistence;
- unchanged later observations remain useful historical evidence.

### Depth

Every inserted listing must retain durable provider, native source listing/item ID, canonical public URL and deterministic Gacha Lens listing ID. The accepted selection remains cryptographically bound to reviewed candidate evidence through the #156 selection fingerprint contract.

## 8. Circuit breakers and stop conditions

Stop the current stage and block scale-up on any of the following:

- persisted listing identity no longer resolves exactly;
- provider response points to a different item/URL identity;
- target variant/series drift;
- matcher ambiguity or set signal;
- unexpected lifecycle status;
- any path infers completed `sold` from ordinary EC unavailability;
- equal-time conflicting price/status;
- stale observation attempts to move current snapshot backward;
- credential destination outside reviewed allowlist;
- redirect attempt;
- credential/raw payload leakage;
- provider API contract changed materially;
- sustained 429 behavior beyond bounded retry assumptions;
- unexpected paid/quota requirement;
- actual row delta differs from frozen expectation;
- unknown partial commit;
- deterministic retry creates an extra row;
- protected identity field changed;
- unexpected UPDATE/DELETE in Depth Collector persistence;
- post-write reread cannot prove exact state;
- workflow runs on stale/non-exact main where exact-main guard is required;
- Scoreboard cannot be reread after a write;
- Production/schema state differs materially from preflight.

Stop means stop. Do not auto-repair Production state, increase retries, weaken matching or widen the cohort inside the same approval.

## 9. Scoreboard before/after acceptance metrics

Capture the same Scoreboard definition before and after every write-capable canary.

### R2 history success

- observations expected first-canary delta: +4 if all four succeed from unique new logical buckets;
- listings with 2+ observations expected delta: +4 from the stated cohort;
- re-observation rate: >0 for the first time;
- total listings: unchanged;
- completed `sold`: unchanged at 0 unless unrelated authorized completed evidence appears and is separately explained;
- provider errors/throttles: explicitly reported, no hidden failures.

### R4 depth success

- total listings delta = exact accepted distinct count;
- total observations delta = same count;
- target variants move into higher depth buckets truthfully;
- no duplicate listing identities;
- no false completed `sold`;
- no decrease in strict matcher/review-safe evidence quality.

A canary is a failure if expected deltas cannot be reconciled, post-write state is unknown, a provider/security circuit breaker triggers, identity safety is violated, unexpected `sold` appears from these lanes, or the Scoreboard shows no intended DATA movement after a claimed successful persistence canary.

Do not call a canary successful merely because a workflow job exited zero.

## 10. Rollback evidence package

Every write-capable canary must preserve a sanitized audit package before execution containing:

- exact main SHA;
- exact script/workflow SHA;
- approved cohort IDs;
- provider split;
- deterministic run/observation keys;
- expected observation/listing IDs;
- before counts;
- protected identity values/hashes;
- expected row deltas;
- transaction mode;
- stop conditions;
- approver scope.

After execution add actual inserted IDs, actual updated listing IDs and allowlisted changed fields, before/after counts, post-write reread result, idempotency result if explicitly approved, Scoreboard snapshot and sanitized provider outcomes.

Never include credentials or raw provider response bodies.

## 11. Approval checklist

Each checkbox is independent. A previous approval does not imply later approval.

### Repository-only planning / code

- [ ] exact-head CI green
- [ ] Vercel Preview green where applicable
- [ ] independent review requirements satisfied for collection-semantics changes
- [ ] main drift checked
- [ ] no Secret/credential in diff/artifact

### Live provider read-only canary

- [ ] explicit approval for the exact Production-connected read cohort
- [ ] exact provider count and attempt ceiling frozen
- [ ] official endpoint/credential-destination contract rechecked
- [ ] current provider pricing/quota/access rechecked if materially relevant
- [ ] no DB persistence path enabled

### Production re-observation persistence

- [ ] #166 repair independently reviewed and merged
- [ ] explicit approval for exact listing cohort
- [ ] deterministic observation IDs/run key frozen
- [ ] exact before/after count expectations frozen
- [ ] transaction and post-write reread defined
- [ ] rollback evidence package prepared
- [ ] no schema migration required by current plan

### Depth persistence

- [ ] explicit target variants frozen
- [ ] strict-safe accepted candidate identities frozen
- [ ] exact accepted count <= approved canary ceiling
- [ ] insert-only write contract verified
- [ ] explicit Production write approval granted

### Workflow/schedule activation

- [ ] separate code review for Production-capable workflow/schedule change
- [ ] explicit approval for schedule/cadence/budget
- [ ] exact-main/race guard semantics reviewed
- [ ] circuit breaker and runtime ceiling present

### `workflow_dispatch`

- [ ] separate explicit approval for the exact dispatch/run

### Secrets / Variables

- [ ] separate explicit approval for any add/change/remove
- [ ] destination/scope/minimum privilege reviewed

### Paid/licensed source

- [ ] separate explicit approval for spend/contract/credentials
- [ ] price, quota, storage/display/derived-data rights rechecked immediately before activation

Without the applicable checked approval, stop at dry-run/read-only planning.

## 12. What this rollout does not solve

This plan does not manufacture missing evidence families. It does not provide completed-sale market history, broad Mercari C2C data, X social evidence, search-demand data from an unavailable GSC connector, or merchant identity when the provider contract does not prove it.

Repeated Rakuten/Yahoo asking-price observations must be labelled as asking-price/current-availability history, not completed transaction history.

## 13. Current safe next sequence

1. exact-head validate this planning PR;
2. keep PR #167 Draft until its independent review requirement is genuinely satisfied or a human explicitly changes that task-specific gate;
3. do not run live provider reads merely because this plan exists;
4. once the plan and pre-persistence repair gates are complete, present the exact R1 six-listing read-only canary for explicit approval;
5. after R1 evidence, present the exact R2 four-listing Production persistence canary for separate explicit approval;
6. only after measured history success, move to the two-variant depth read-only canary;
7. force canonical `HANDOFF.md` / `STATUS.md` / `DECISIONS.md` / `TODO.md` synchronization after the first major Production rollout milestone before starting the next major phase.

The project should optimize for **measured safe DATA compounding**, not for number of PRs, number of agents, or theoretical request capacity.