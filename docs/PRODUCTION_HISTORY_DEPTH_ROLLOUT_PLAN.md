# Gacha Lens Production History / Depth Rollout Plan

Verified planning baseline: 2026-09-02 JST  
Parent program: Issue #119  
Planning issue: #165  
Companion pre-persistence safety repair: #166 / PR #167

## Executive decision

Gacha Lens is ready to move from code-only Data Scale foundations toward a bounded Production history/depth rollout, but **not yet to execute Production writes automatically**.

Current measured bottleneck: `history_not_enabled`.

Safe order:

1. keep P3 V2 responsible for breadth;
2. run a tiny exact-provider re-observation read-only canary only after explicit approval;
3. merge the equal-timestamp/null-time safety repair before any Production persistence;
4. run a separately approved tiny re-observation persistence canary;
5. run a separately approved two-variant depth read-only canary;
6. persist only a strict insert-only depth subset under a separate approval;
7. re-run the read-only Scoreboard after each Production-impacting canary;
8. scale only from measured evidence.

This document is a **plan only**. It authorizes no live credentialed provider execution, Production DB mutation, `workflow_dispatch`, schedule/workflow change, Secret/Variable change, paid API activation, or contractual action.

---

## 1. Dated Production baseline

Issue #165 recorded this read-only Production Scoreboard at **2026-09-02 01:49 JST** on main `c7fe091003aae50c359efebcaca1f1cffb88eedd`:

- series: **10,241**
- variants: **23,808**
- market listings: **107**
- observations: **107**
- re-observed listings: **0**
- depth among covered variants:
  - x1: **96**
  - x2: **1**
  - x3+: **0**
- completed `sold`: **0**
- Scoreboard bottleneck: **`history_not_enabled`**

Interpretation: catalog breadth is large; market depth and longitudinal evidence remain very thin.

These are dated measurements, not policy constants. Immediately before any live or write-capable canary, re-run the read-only Scoreboard and re-size/reselect if material drift changes the expected deltas.

---

## 2. Current provider and workflow evidence

Current lawful active marketplace sources for this rollout:

- Rakuten Ichiba
- Yahoo Shopping

Aucfan, X, Mercari C2C and other future sources remain outside this rollout under `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`.

### Latest P3 V2 execution evidence

Latest visible P3 V2 automatic run at planning time:

- Run #41: `33517826786`
- scheduled: 2026-09-01 23:10 JST
- conclusion: failure

Exact job inspection shows failure at `Verify exact current main revision`. Execution-gate resolution, collector execution, artifact scan and artifact upload were skipped.

Therefore Run #41 is an **exact-main race-guard failure**, not provider throttling, timeout, API rejection, or matcher-quality evidence.

The preceding Run #40 (`33488346438`) completed successfully and remains the latest previously measured collector-executing P3 run.

### Health-separation rule

Do not treat a red workflow as provider failure without evidence. Keep separate counters for:

- exact-main/orchestration guard failures
- provider/network failures
- throttling
- identity/matcher rejection
- no-result
- accepted candidates
- persistence outcome

---

## 3. Lane ownership

### 3.1 P3 V2 breadth lane

Purpose: find a safe first listing for more variants.

P3 must continue to:

- use the strict single-item matcher;
- reject set/multiple/ambiguous evidence;
- preserve provider identity and provenance;
- avoid `3 listings = done` semantics;
- avoid becoming a repeated-history poller;
- avoid becoming the many-offer depth collector.

Do not raise its cap merely to solve history/depth. Prior throughput evidence already showed the theoretical cap was not the primary limiter.

### 3.2 Re-observation lane

Purpose: compound time-series evidence for **known exact listing identities**.

Merged #150/#153 contract:

- exact persisted identity only;
- no keyword rediscovery;
- append-only observations;
- only allowlisted current-snapshot fields may change;
- ordinary states limited to `active` / `sold_out`;
- no false completed `sold`;
- positive integer price required;
- explicit availability required;
- stale observations fail closed;
- credentials only to reviewed official host + exact path;
- redirects refused;
- same logical key is retry-idempotent.

### 3.3 Depth lane

Purpose: accumulate **many genuinely distinct safe offers** for explicit target variants.

Merged #156 contract:

- explicit target variant + parent series;
- same strict P3 safety predicate;
- durable listing ID dedupe;
- provider+source-listing identity dedupe;
- canonical URL dedupe;
- existing listings excluded;
- same price/title may still be distinct if identity is distinct;
- SHA-256 selection binding prevents post-selection drift;
- projected writes are insert-only;
- budget 50 / max 200 are safety ceilings, not completion targets.

Breadth, depth and history remain separate lanes so tuning one cannot silently weaken another.

---

## 4. Mandatory pre-persistence repair

Production re-observation persistence is blocked by Issue #166 until its repair is independently reviewed and merged.

Confirmed gaps in the pre-repair main contract:

1. older timestamps fail closed, but an equal timestamp could carry conflicting price/status;
2. null/blank observation time could be coerced through JavaScript Date semantics.

Required semantics:

- `observedAt < last_observed_at` -> `provider_error / stale_observation_time`, zero writes;
- equal timestamp + conflicting price or status -> fail closed, zero writes;
- equal timestamp + unchanged price/status + same logical key -> deterministic retry-safe behavior;
- null/undefined/blank observation time -> invalid input, never epoch coercion.

PR #167 contains the bounded code/test repair. This plan does **not** represent its independent Reviewer/Verifier gate as complete.

**No Production re-observation persistence canary may run until #166 is completed by an independently reviewed merged repair, unless the human explicitly changes that task-specific review gate.**

---

## 5. Rollout stages

Each stage is separately approval-gated. Approval of one does not authorize the next.

### R0 — planning and repository verification

Current stage.

Allowed:

- read-only Production counts
- read-only GitHub/Vercel evidence
- docs/code/test review
- Preview deployment
- static secret scan

Not authorized:

- live credentialed provider requests
- Production DB writes
- workflow dispatch/schedule changes
- Secrets/Variables changes
- paid access activation

Exit criteria:

- this plan exact-head green;
- main drift reviewed;
- #166 gate explicitly resolved before persistence;
- exact canary cohorts/budgets can be frozen before execution.

### R1 — exact-provider re-observation read-only canary

Requires explicit approval for **live Production-connected provider reads**.

#### Cohort

**6 known listings total**:

- 3 Rakuten
- 3 Yahoo Shopping

Selection:

- exact persisted identity complete;
- review-safe;
- current lifecycle `active` or `sold_out`;
- due under merged cadence logic;
- no unresolved ambiguity/import issue;
- prefer current single-observation listings so later history gain is measurable;
- do not select solely from a displayed popularity/forecast score.

#### Request budget

Existing exact-reader contract:

- normal first attempts: **6 max**;
- retries: max 3 attempts only for reviewed retryable conditions;
- absolute worst-case HTTP attempt envelope: **18**;
- Rakuten same-provider minimum spacing: **1200 ms**;
- Yahoo same-provider minimum spacing: **1000 ms**;
- serial execution;
- no keyword fallback.

#### Persistence

- observation INSERTs: 0
- listing UPDATEs: 0
- deletes: 0

#### Success

- requests remain on reviewed official endpoint host+path;
- no credential/raw response leakage;
- exact identity remains stable;
- invalid availability/price fails closed;
- no false `sold`;
- provider error/throttle metrics are separated from identity/matcher outcomes.

#### Stop

Stop on credential-destination failure, redirect, malformed identity, payload leakage, unexpected lifecycle, material provider-contract drift, or retry/rate-limit behavior outside the reviewed contract.

A failed R1 must not advance `last_observed_at`.

### R2 — tiny re-observation Production persistence canary

Requires all of:

1. explicit Production DB write approval for the exact cohort;
2. #166 gate resolved;
3. fresh Scoreboard/main drift check;
4. successful R1 or equivalent newer reviewed provider evidence;
5. deterministic observation keys frozen before write.

#### Cohort

**4 known listings total**:

- 2 Rakuten
- 2 Yahoo Shopping

Four is intentionally small: baseline has zero re-observed listings, so four successful rows prove history compounding while keeping verification and rollback evidence human-auditable.

#### Expected first-write deltas

For four listings that each begin with exactly one observation:

- market listing count: unchanged
- deterministic observation insert attempts: 4
- net new observation rows: **+4**
- same-bucket exact retry: **+0** duplicates
- listings with 2+ observations: expected **+4**
- completed `sold`: **+0**
- protected identity fields changed: 0
- deletes: 0

Allowlisted listing snapshot changes only:

- price
- status (`active` / `sold_out` only)
- `last_observed_at`
- `updated_at`

No ordinary re-observation may rewrite identity/provenance or create `sold_at`.

#### Transaction contract

Before write:

1. fresh-read all four identities and current snapshots;
2. bind exact provider results + deterministic observation IDs;
3. reject identity/provenance/timestamp drift;
4. capture exact before counts.

Preferred first-canary persistence: **one bounded transaction for the four-listing batch**.

If an implementation instead commits per-listing units, every unit must be independently idempotent and explicitly reread. Unknown partial state is not success.

After write:

1. reread each expected observation ID;
2. reread all four listing snapshots;
3. verify protected identity fields unchanged;
4. reconcile exact before/after deltas;
5. confirm no unexpected `sold`;
6. perform same-key idempotency retry only if that retry is inside the approved canary scope;
7. run the Scoreboard read-only.

#### Rollback

If transaction is known uncommitted: leave Production unchanged.

If committed state fails verification: stop immediately, preserve exact inserted IDs and before-state evidence, and prepare a narrow rollback plan. Destructive deletion/reversal after commit requires separate explicit destructive Production-data approval unless the original transaction can still be rolled back atomically before commit.

Never delete truthful observations merely to force expected counts.

### R3 — two-variant depth read-only canary

Requires explicit approval for live Production-connected marketplace search/provider reads.

#### Cohort

**2 explicit target variants**:

- one target assigned to Rakuten first-pass retrieval;
- one target assigned to Yahoo first-pass retrieval.

Selection:

- stable official variant identity;
- no unresolved catalog ambiguity;
- current depth <=1 preferred;
- existing provider evidence where practical;
- not selected merely because the match is easy.

#### Accepted-row budget

- max accepted safe listings per target: **5**
- max accepted total: **10**

This is intentionally below Depth Collector default 50 / hard max 200.

#### Retrieval request budget

Use the already-reviewed market request-budget/query-planner contract for the first read-only depth canary:

- one root query per target variant;
- provider root limit: **1 Rakuten root + 1 Yahoo root**;
- max query attempts per root: **3**;
- affiliate enrichment: disabled for this proof-of-depth read-only canary;
- max planner API requests: **6 total** (3 Rakuten + 3 Yahoo);
- existing max retry attempts per request: **3**;
- absolute worst-case HTTP attempt envelope: **18**;
- do not add a second provider for the same target inside this first canary;
- do not widen root limits inside the approved run.

This budget is a canary ceiling, not a product target. If fewer than five strict-safe offers are found, retain the smaller truthful result.

#### Persistence

0 writes.

#### Success

- strict P3 safety predicate unchanged;
- exact target variant/series;
- no duplicate native provider identity;
- no duplicate listing ID;
- no duplicate canonical URL;
- existing listings excluded;
- selection fingerprint stable;
- projected writes insert-only;
- no `3 listings = done` rule.

Stop on provider-budget overrun, matcher ambiguity, target drift, identity conflict, unexpected paid/quota requirement, or any need to weaken the strict predicate.

### R4 — tiny depth Production persistence canary

Requires a separate explicit Production write approval after R3.

Maximum scope:

- persist only R3’s frozen verified subset;
- up to 5 new listings per target;
- up to 10 total.

If R3 found fewer valid offers, persist fewer. Never fill the budget with weaker candidates.

Expected per accepted listing:

- market listing INSERT: 1
- initial observation INSERT: 1
- listing UPDATE: 0
- observation UPDATE: 0
- delete: 0

Expected batch deltas:

- listing delta = exact accepted distinct count
- observation delta = same count
- each new listing has exactly one initial observation
- duplicate provider/source identity: 0
- duplicate canonical URL: 0
- protected existing listing changes: 0
- completed `sold` delta: 0

If any row fails post-write verification, stop. Do not silently substitute a different candidate unless replacement was part of the frozen approved plan.

### R5 — measured scale-up proposal only

After R2/R4:

- compare Scoreboard before/after;
- calculate real provider error/throttle rates;
- calculate strict-safe depth yield;
- calculate re-observation/history gain;
- estimate request/storage costs;
- propose next cohort/cadence.

Do not automatically enable schedules or raise budgets. Workflow/schedule activation is a new Production-capable change and requires separate review/approval.

---

## 6. Cadence proposal

Initial history architecture proposal:

| Tier | Interval | Meaning |
| --- | ---: | --- |
| hot | 6h | explicit high-value/event window only |
| active | 24h | ordinary available listing |
| unavailable | 72h | explicit provider unavailable/sold-out listing |

These intervals are not authorized by this plan.

First automatic scheduling, if later approved, should prefer a small bounded 24-hour active cohort. Do not globally enable 6-hour hot polling on day one.

`last_observed_at` remains the last **successful observation**, not the last failed attempt.

---

## 7. Idempotency and truth contract

### Re-observation

Observation identity is deterministic from:

- listing identity
- provider
- logical observation key/bucket

Required:

- same logical retry -> same ID;
- retry -> no duplicate historical row;
- later legitimate bucket -> different ID;
- price/status are not identity;
- equal timestamp + conflicting state fails closed;
- unchanged later observations remain valid evidence.

### Depth

Every new listing retains:

- provider
- native source listing/item identity
- canonical public URL
- deterministic Gacha Lens listing ID

The accepted candidate set remains bound by #156’s selection fingerprint contract.

---

## 8. Circuit breakers / stop conditions

Stop the current stage on any of:

### Truth / identity

- persisted identity no longer resolves exactly;
- provider returns another item/URL identity;
- target variant/series drift;
- matcher ambiguity or set signal;
- unexpected lifecycle status;
- any inference of completed `sold` from ordinary EC unavailability;
- stale observation rollback attempt;
- equal-time conflicting price/status.

### Provider / security

- credential destination outside reviewed allowlist;
- redirect attempt;
- secret/raw payload leakage;
- material provider API contract drift;
- sustained 429/retry behavior outside bounded assumptions;
- unexpected paid/quota requirement.

### Persistence

- actual row delta differs from frozen expectation;
- unknown partial commit;
- deterministic retry creates an extra row;
- protected identity field changes;
- unexpected UPDATE/DELETE in depth persistence;
- post-write reread cannot prove exact state.

### Operations

- exact-main guard fails;
- unrelated main drift changes owned code before execution;
- Production/schema state differs materially from preflight;
- post-canary Scoreboard cannot be obtained.

Stop means stop. Do not auto-repair Production, widen the cohort, raise retries or weaken matching inside the same approval.

---

## 9. Scoreboard success/failure metrics

Capture the same Scoreboard definition before and after each write-capable canary.

### R2 success

Expected from the frozen four-single-observation cohort:

- observations: +4
- listings with 2+ observations: +4
- re-observation rate: >0 for the first time
- total listings: unchanged
- completed `sold`: unchanged from the lane
- protected identity changes: 0

### R4 success

- total listings delta = exact persisted accepted count
- total observations delta = same count
- target variants move to higher depth buckets truthfully
- duplicate identities: 0
- false `sold`: 0
- strict matcher/review-safe quality unchanged

### Failure

Failure is explicit if:

- row deltas cannot be reconciled;
- post-write state is unknown;
- a circuit breaker fires;
- identity safety fails;
- unexpected `sold` appears from these lanes;
- a claimed successful persistence run produces no intended DATA movement.

A workflow exit code alone is not success.

---

## 10. Rollback evidence package

Before every write-capable canary preserve a sanitized package containing:

- exact main SHA
- exact script/workflow SHA
- approved cohort IDs
- provider split
- deterministic run/observation keys
- expected listing/observation IDs
- before counts
- protected identity values/hashes
- expected row deltas
- transaction mode
- stop conditions
- exact approval scope

After execution add:

- actual inserted IDs
- updated listing IDs + allowlisted changed fields
- before/after counts
- post-write reread result
- idempotency retry result if explicitly approved
- Scoreboard snapshot
- sanitized provider outcomes

Never include credentials or raw provider response bodies.

---

## 11. Approval checklist

Each item is independent. Prior approval does not imply later approval.

### Repository-only

- [ ] exact-head CI green
- [ ] Vercel Preview green where applicable
- [ ] main drift checked
- [ ] secret scan/diff review clean
- [ ] required independent review satisfied or explicitly changed by the human

### R1 live provider read-only

- [ ] exact six-listing cohort frozen
- [ ] 3 Rakuten / 3 Yahoo split frozen
- [ ] max 18 HTTP attempts frozen
- [ ] official endpoint/access rules rechecked
- [ ] explicit live Production-connected provider-read approval
- [ ] DB persistence path disabled

### R2 Production re-observation persistence

- [ ] #166 gate resolved
- [ ] exact four-listing cohort frozen
- [ ] deterministic IDs/key frozen
- [ ] expected row deltas frozen
- [ ] transaction/post-write reread defined
- [ ] rollback evidence package ready
- [ ] explicit Production DB write approval

### R3 live depth read-only

- [ ] exact two variants frozen
- [ ] one Rakuten target / one Yahoo target
- [ ] root limit 1 per provider
- [ ] max 3 query attempts per root
- [ ] affiliate enrichment disabled
- [ ] max 6 planner requests / max 18 HTTP attempts
- [ ] explicit live provider/search approval

### R4 depth persistence

- [ ] strict-safe candidate identities frozen
- [ ] exact accepted count <=10
- [ ] insert-only contract verified
- [ ] expected listing/observation deltas frozen
- [ ] explicit Production DB write approval

### Workflow/schedule activation

- [ ] separate Production-capable workflow review
- [ ] explicit cadence/budget approval
- [ ] exact-main/race guard semantics reviewed
- [ ] runtime/circuit-breaker ceiling present

### `workflow_dispatch`

- [ ] separate explicit approval for the exact run

### Secrets / Variables

- [ ] separate explicit approval for any add/change/remove
- [ ] destination/scope/minimum privilege reviewed

### Paid/licensed source

- [ ] separate explicit spend/contract/credential approval
- [ ] price/quota/storage/display/derived-data rights rechecked immediately before activation

Without the relevant approval, stop before that stage.

---

## 12. What this rollout does not solve

This plan does not create missing evidence families. It does not provide:

- completed-sale market history;
- broad Mercari C2C data;
- X social evidence;
- unavailable GSC demand data;
- merchant identity when provider evidence does not prove it.

Repeated Rakuten/Yahoo observations are asking-price/current-availability history, not completed transaction history.

---

## 13. Current safe next sequence

1. exact-head validate this plan PR;
2. keep PR #167 Draft until its independent review requirement is genuinely satisfied or explicitly changed by the human;
3. do not run R1 merely because this document exists;
4. once planning + repair gates are complete, present the exact R1 six-listing canary for explicit approval;
5. after R1 evidence, present the exact R2 four-listing persistence canary for separate approval;
6. after measured history success, move to the exact R3 two-variant depth canary;
7. after the first major Production rollout milestone, force canonical `HANDOFF.md` / `STATUS.md` / `DECISIONS.md` / `TODO.md` sync before the next major implementation.

Optimize for **measured safe DATA compounding**, not PR count, agent count or theoretical request capacity.
