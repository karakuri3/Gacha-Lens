# Gacha Lens Production History / Depth Rollout Plan

Verified planning baseline: 2026-09-02 JST
Parent program: Issue #119
Planning issue: #165
Pre-persistence safety repair: Issue #166, merged by PR #169 on 2026-09-02 JST

## Executive decision

Gacha Lens is ready to move from code-only Data Scale foundations toward bounded Production history/depth canaries, but this document authorizes **no live provider execution and no Production database writes** by itself.

Current measured bottleneck: `history_not_enabled`.

Safe order:

1. keep P3 V2 responsible for breadth;
2. perform a tiny exact-provider re-observation read-only canary only after explicit approval;
3. perform a separately approved tiny re-observation persistence canary;
4. perform a separately approved two-variant depth read-only canary;
5. persist only a frozen strict-safe depth subset under separate Production approval;
6. re-run the read-only Scoreboard after each Production-impacting canary;
7. scale only from measured evidence.

The equal-time/null-time repair that previously blocked persistence is now merged in PR #169. The human granted a task-specific exception for the #167/#168 review workstream: exact-head CI, Vercel Preview, strengthened Lead/self-review, and regression tests replaced independent Verifier/Reviewer for that work only. That exception does **not** authorize any Production execution, credential change, workflow dispatch, paid access, or destructive action.

---

## 1. Dated Production baseline

Issue #165 recorded the following read-only Production Scoreboard at **2026-09-02 01:49 JST**:

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

Interpretation: catalog breadth is already large, but longitudinal history and multi-offer market depth are extremely thin.

These numbers are dated evidence, not durable policy constants. Immediately before any live or write-capable canary, re-run the read-only Scoreboard and reselect/re-size if material drift changes the expected deltas.

---

## 2. Provider and workflow evidence

Current lawful active marketplace sources for this rollout:

- Rakuten Ichiba
- Yahoo Shopping

Aucfan, X, Mercari C2C, eBay and other future sources remain outside this rollout under `docs/DATA_SOURCE_CAPABILITY_MATRIX.md` until their applicable access/contract states change.

Latest relevant P3 evidence at planning time:

- P3 V2 Run #41 `33517826786` failed at the exact-main race guard before collector/provider execution.
- Therefore that red run is orchestration evidence, **not** provider-health evidence.
- Previous Run #40 `33488346438` completed and remains the latest previously measured collector-executing P3 run used by the throughput analysis.

Keep separate metrics for:

- exact-main/orchestration failures
- provider/network failures
- throttling
- identity/matcher rejection
- no-result
- accepted candidates
- persistence outcome

Never classify a red workflow as provider failure without provider execution evidence.

---

## 3. Lane ownership

### 3.1 P3 V2 breadth lane

Purpose: find a safe first listing for more variants.

P3 must continue to:

- use the strict single-item matcher;
- reject set, multiple-variant, ambiguous and review-required evidence;
- preserve provider identity and provenance;
- remain primarily a 0→1 breadth path;
- avoid becoming a repeated-history poller;
- avoid becoming the many-offer depth collector;
- never treat `3 listings` as a collection completion target.

Do not raise the P3 cap merely to solve history or depth. Prior throughput evidence showed the theoretical cap was not the primary limiter.

### 3.2 Re-observation lane

Purpose: compound time-series evidence for **known exact listing identities**.

Merged contract from #150/#153 plus #169:

- exact persisted identity only;
- no keyword rediscovery;
- append-only observations;
- ordinary current snapshot changes limited to allowlisted fields;
- ordinary lifecycle states limited to `active` / `sold_out`;
- never infer completed `sold` from EC unavailability;
- positive integer price required;
- explicit availability required;
- older observations fail closed;
- equal timestamp + conflicting price/status fails closed;
- equal timestamp + unchanged same-key retry remains deterministic;
- null/undefined/blank/whitespace observation time is rejected;
- credentials only reach the reviewed official provider host/path;
- redirects are refused;
- failed attempts do not advance `last_observed_at`.

### 3.3 Depth lane

Purpose: accumulate **many genuinely distinct safe offers** for explicit target variants.

Merged #156 contract:

- explicit target variant + parent series;
- same strict P3 safety predicate;
- durable listing-ID dedupe;
- provider/native-source identity dedupe;
- canonical URL dedupe;
- existing listings excluded;
- same price/title may still be distinct if marketplace identity is distinct;
- accepted selection is cryptographically bound against post-selection drift;
- projected writes are insert-only;
- default/hard safety budgets are ceilings, never product completion targets.

Breadth, history and depth stay separate so tuning one lane cannot silently weaken another.

---

## 4. Pre-persistence safety gate status

Issue #166 identified two blockers:

1. equal `observedAt === last_observed_at` could previously accept conflicting price/status;
2. null observation time could previously be coerced through JavaScript `Date` semantics.

PR #169 merged the bounded repair to main `d8921839491ce1e544c9bb3db92525831418f67b` under the human-approved task-specific review exception.

Required semantics now expected before any persistence canary:

- `observedAt < last_observed_at` -> `provider_error / stale_observation_time`, zero writes;
- equal timestamp + conflicting price or status -> `provider_error / conflicting_equal_observation_time`, zero writes;
- equal timestamp + unchanged price/status + same logical key -> deterministic retry-safe behavior;
- null/undefined/blank/whitespace observation time -> invalid required input;
- no completed `sold` inference.

The code repair being merged does not itself authorize a Production persistence run.

---

## 5. Rollout stages

Every stage below is separately approval-gated. Approval of one stage does not imply approval of the next.

### R0 — repository/read-only planning

Current stage.

Allowed without a new Production approval:

- repository inspection;
- read-only Production counts;
- read-only GitHub/Vercel evidence;
- docs/code/test review;
- Preview deployment;
- static secret/diff inspection.

Not authorized:

- live credentialed provider requests;
- Production DB writes;
- `workflow_dispatch`;
- workflow/schedule changes;
- Secrets/Variables changes;
- paid/licensed access activation;
- destructive Production-data operations.

Exit criteria:

- rollout plan exact-head green;
- current main drift reviewed;
- PR #169 safety repair present on main;
- exact canary cohort and budgets frozen before execution.

### R1 — exact-provider re-observation read-only canary

Requires explicit approval for **live Production-connected provider reads**.

#### Cohort

**6 known listings total**:

- 3 Rakuten
- 3 Yahoo Shopping

Selection rules:

- exact persisted provider identity complete;
- review-safe;
- current lifecycle `active` or `sold_out`;
- due under merged cadence logic;
- no unresolved ambiguity/import issue;
- prefer single-observation listings so history gain is measurable;
- do not select based only on popularity/forecast display scores.

#### Request budget

Existing exact-reader contract:

- normal first attempts: **6 maximum**;
- retryable conditions: max 3 attempts per request;
- absolute worst-case HTTP-attempt envelope: **18**;
- Rakuten same-provider minimum spacing: **1200 ms**;
- Yahoo same-provider minimum spacing: **1000 ms**;
- serial execution;
- no keyword fallback.

#### Persistence

- observation INSERTs: 0
- listing UPDATEs: 0
- deletes: 0

#### Success

- requests remain on reviewed official endpoint host/path;
- no credential/raw response leakage;
- exact listing identity remains stable;
- invalid availability/price fails closed;
- no false `sold`;
- provider errors/throttling remain separately measurable.

#### Stop

Stop on redirect, credential-destination failure, malformed identity, payload leakage, unexpected lifecycle, material provider-contract drift, or retry/rate-limit behavior outside the reviewed contract.

A failed R1 must not advance `last_observed_at`.

### R2 — tiny re-observation Production persistence canary

Requires all of:

1. explicit Production DB write approval for the exact frozen cohort;
2. fresh Scoreboard/main drift check;
3. successful R1 or newer equivalent reviewed provider evidence;
4. PR #169 safety semantics present on main;
5. deterministic observation keys frozen before write.

#### Cohort

**4 known listings total**:

- 2 Rakuten
- 2 Yahoo Shopping

Four is intentionally small because Production currently has zero re-observed listings.

#### Expected first-write deltas

For four listings beginning with exactly one observation each:

- market listing count: unchanged;
- deterministic observation insert attempts: 4;
- net new observation rows: **+4**;
- listings with 2+ observations: expected **+4**;
- same-key exact retry duplicate rows: **0**;
- completed `sold`: **+0**;
- deletes: 0;
- protected identity fields changed: 0.

Allowlisted listing snapshot changes only:

- price
- status (`active` / `sold_out` only)
- `last_observed_at`
- `updated_at`

No ordinary re-observation may rewrite provider/source identity/provenance or create `sold_at`.

#### Transaction and verification contract

Before write:

1. fresh-read all four identities and snapshots;
2. bind exact provider results and deterministic observation IDs;
3. reject identity/provenance/timestamp drift;
4. capture exact before counts.

Preferred first-canary persistence: **one bounded transaction for the four-listing batch**.

After write:

1. reread every expected observation ID;
2. reread all four listing snapshots;
3. verify protected identity fields are unchanged;
4. reconcile exact before/after deltas;
5. confirm no unexpected `sold`;
6. run the read-only Scoreboard;
7. perform same-key idempotency retry only if that retry was explicitly included in the approved scope.

#### Rollback

If the transaction is known uncommitted, leave Production unchanged.

If committed state fails verification, stop immediately and preserve exact inserted IDs plus before-state evidence. Any compensating destructive deletion/reversal after commit requires separate destructive Production-data approval unless the original transaction is still atomically rollback-able before commit.

Never delete truthful observations merely to force expected counts.

### R3 — two-variant depth read-only canary

Requires explicit approval for live marketplace/provider reads.

#### Cohort

**2 explicit target variants**:

- one Rakuten-first target;
- one Yahoo-first target.

Selection rules:

- stable official variant identity;
- no unresolved catalog ambiguity;
- current depth <=1 preferred;
- existing provider evidence where practical;
- not selected merely because the match is easy.

#### Accepted-row budget

- max accepted safe listings per target: **5**;
- max accepted total: **10**.

#### Retrieval budget

Use the reviewed market query/request contract:

- one root query per target variant;
- provider root limit: **1 Rakuten + 1 Yahoo**;
- max query attempts per root: **3**;
- affiliate enrichment disabled for this proof-of-depth read-only canary;
- max planner API requests: **6 total**;
- max retry attempts per request: **3**;
- absolute worst-case HTTP-attempt envelope: **18**;
- no second provider for the same target inside this first canary;
- no runtime budget widening.

If fewer than five strict-safe offers exist, retain the smaller truthful result.

#### Persistence

0 writes.

#### Success

- strict P3 safety predicate unchanged;
- exact target variant/series;
- no duplicate native provider identity;
- no duplicate Gacha Lens listing ID;
- no duplicate canonical URL;
- existing listings excluded;
- selection fingerprint stable;
- projected writes insert-only;
- no `3 listings = done` rule.

Stop on provider-budget overrun, matcher ambiguity, target drift, identity conflict, unexpected paid/quota requirement, or any need to weaken the strict predicate.

### R4 — tiny depth Production persistence canary

Requires separate explicit Production DB write approval after R3.

Maximum scope:

- persist only R3's frozen strict-safe subset;
- up to 5 new listings per target;
- up to 10 total.

If R3 finds fewer valid offers, persist fewer. Never fill the budget with weaker candidates.

Expected per accepted listing:

- market listing INSERT: 1;
- initial observation INSERT: 1;
- listing UPDATE: 0;
- observation UPDATE: 0;
- delete: 0.

Expected batch deltas:

- listing delta = exact accepted distinct count;
- observation delta = same count;
- every new listing has exactly one initial observation;
- duplicate provider/source identity: 0;
- duplicate canonical URL: 0;
- protected existing listing changes: 0;
- completed `sold` delta: 0.

Any post-write mismatch stops the run. Do not silently substitute another candidate unless that replacement was part of the frozen approved plan.

### R5 — measured scale-up proposal only

After successful R2/R4:

- compare Scoreboard before/after;
- calculate provider error and throttle rates;
- calculate strict-safe depth yield;
- calculate re-observation/history gain;
- estimate request/storage cost;
- propose the next cohort and cadence.

Do not automatically enable schedules, raise budgets, or add a new Production-capable workflow. Those are separate reviewed/approved changes.

---

## 6. Cadence proposal

Initial architecture proposal:

| Tier | Interval | Meaning |
| --- | ---: | --- |
| hot | 6h | explicit high-value/event window only |
| active | 24h | ordinary available listing |
| unavailable | 72h | explicit provider unavailable/sold-out listing |

These intervals are **not authorized** by this document.

If future automatic scheduling is approved, begin with a small bounded 24-hour active cohort. Do not globally enable six-hour polling on day one.

`last_observed_at` always means the last **successful observation**, not the last failed attempt.

---

## 7. Idempotency and truth contract

### Re-observation

Observation identity is deterministic from:

- listing identity;
- provider;
- logical observation key/bucket.

Required:

- same logical retry -> same observation ID;
- retry -> no duplicate history row;
- later valid bucket -> new observation ID;
- price/status are evidence, not identity;
- equal-time conflicting state fails closed;
- unchanged later observations remain valid historical evidence.

### Depth

Every new listing retains:

- provider;
- native source listing/item identity;
- canonical public URL;
- deterministic Gacha Lens listing ID.

The accepted candidate set remains bound by #156's selection-fingerprint contract.

---

## 8. Circuit breakers / stop conditions

Stop the current stage on any of the following.

### Truth / identity

- persisted identity no longer resolves exactly;
- provider returns another item identity;
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
- material provider API-contract drift;
- sustained 429/retry behavior outside reviewed bounds;
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

Stop means stop. Do not auto-repair Production, widen the cohort, increase retries, or weaken matching inside the same approval.

---

## 9. Scoreboard success/failure metrics

Capture the same Scoreboard definition before and after each write-capable canary.

### R2 success

Expected for the frozen four-single-observation cohort:

- observations: +4;
- listings with 2+ observations: +4;
- re-observation rate: >0 for the first time;
- total listings: unchanged;
- completed `sold`: unchanged from this lane;
- protected identity changes: 0.

### R4 success

- total listings delta = exact persisted accepted count;
- total observations delta = same count;
- target variants move to higher depth buckets truthfully;
- duplicate identities: 0;
- false `sold`: 0;
- strict matcher/review-safe quality unchanged.

### Failure

Failure is explicit if:

- row deltas cannot be reconciled;
- post-write state is unknown;
- a circuit breaker fires;
- identity safety fails;
- unexpected `sold` appears from these lanes;
- a claimed successful persistence run produces no intended DATA movement.

A workflow exit code by itself is never sufficient proof of success.

---

## 10. Rollback evidence package

Before every write-capable canary preserve a sanitized package containing:

- exact main SHA;
- exact script/workflow SHA;
- approved cohort IDs;
- provider split;
- deterministic run/observation keys;
- expected listing/observation IDs;
- before counts;
- protected identity values/hashes;
- expected row deltas;
- transaction mode;
- stop conditions;
- exact approval scope.

After execution add:

- actual inserted IDs;
- updated listing IDs plus allowlisted changed fields;
- before/after counts;
- post-write reread result;
- idempotency retry result if explicitly approved;
- Scoreboard snapshot;
- sanitized provider outcomes.

Never include credentials or raw provider response bodies.

---

## 11. Approval checklist

Every section is independent. Prior approval does not imply later approval.

### Repository-only

- [ ] exact-head CI green
- [ ] Vercel Preview green where applicable
- [ ] main drift checked
- [ ] expected diff/secret review clean
- [ ] task-specific review requirement satisfied

### R1 live provider read-only

- [ ] exact six-listing cohort frozen
- [ ] 3 Rakuten / 3 Yahoo split frozen
- [ ] max 18 HTTP attempts frozen
- [ ] official endpoint/access rules rechecked
- [ ] explicit live provider-read approval
- [ ] DB persistence path disabled

### R2 Production re-observation persistence

- [ ] PR #169 safety repair present on exact main
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

- [ ] separate explicit approval for add/change/remove
- [ ] destination/scope/minimum privilege reviewed

### Paid/licensed source

- [ ] separate spend/contract/credential approval
- [ ] current price/quota/storage/display/derived-data rights rechecked immediately before activation

Without the relevant approval, stop before that stage.

---

## 12. What this rollout does not solve

This plan does not create missing evidence families. It does not provide:

- completed-sale market history;
- broad Mercari C2C data;
- X social evidence;
- unavailable GSC demand evidence;
- merchant identity where provider evidence does not prove it.

Repeated Rakuten/Yahoo observations are asking-price/current-availability history, not completed transaction history.

---

## 13. Current safe next sequence

1. merge this repository-only plan after exact-head CI/Preview and the human-approved review substitution pass;
2. force canonical `HANDOFF.md` / `STATUS.md` / `DECISIONS.md` / `TODO.md` sync because PR #169 plus this rollout-plan milestone form a major safety/planning checkpoint;
3. do **not** run R1 merely because this document exists;
4. present the exact R1 six-listing read-only canary for explicit approval;
5. after R1 evidence, present the exact R2 four-listing Production persistence canary for separate approval;
6. after measured history success, move to the exact R3 two-variant depth read-only canary;
7. after R3 evidence, present the exact R4 frozen insert-only depth batch for separate Production approval;
8. scale only from measured DATA gain and provider-health evidence.

Optimize for **measured safe DATA compounding**, not PR count, agent count, or theoretical request capacity.
