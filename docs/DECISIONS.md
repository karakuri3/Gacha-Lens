# Gacha Lens Durable Decisions

Updated: 2026-09-03 JST — successful Production R4 one-candidate write / Issue #229 canonical sync

The complete durable-decisions checkpoint immediately before #229 is preserved byte-for-byte at `docs/history/2026-09-03-pre-229-DECISIONS.md`. Decisions D-001 through D-112 remain authoritative unless explicitly superseded below.

## Authoritative additions

### D-113 — A repaired R4 Production writer is not considered proven until a real bounded candidate succeeds

After the repository repair and Production repair migrations were independently verified, R4 still required one real, explicitly approved candidate persistence proof. Issue #228 completed that proof successfully against exact main `8cc10b23236406b7bb3b9cec3db5e72574205196`.

The approved identity was:
- observation key `depth-r4-v1:20260903-02`
- digest `219f0f0f9d7019f38c2d6a6689921835247980c5f6d91c4a4ff175b8bce19a72`
- candidate `yahoo-suruga-ya-601199451001`
- observation `market-depth-r4-54b6e36807377900ebcb5046cbdae9d8`
- target `gashapon-4535123846069000-伏黒恵`
- evidence price/status `980 / active`.

The function was invoked exactly once under `service_role`, returned `inserted_count=1`, and reported target depth 1 -> 2.

### D-114 — Every R4 Production write approval is exact, single-use and non-transferable

The #228 human approval was bound to one exact main, one digest and one frozen candidate. It did not authorize a second invocation, another candidate, provider refresh, workflow action, or future batch.

The approval is now consumed/non-reusable. A future R4 write requires a new current-state rebind, new collision/drift checks, new manifest/digest and a fresh explicit approval.

Automatic RPC retry remains prohibited. If a future invocation has ambiguous transport/commit state, resolve only with SELECT until state is known.

### D-115 — A successful R4 response must still be independently resolved against Production

The synchronous function result alone was not treated as sufficient. Independent postwrite SELECT proved:
- listings 132 -> 133;
- observations 154 -> 155;
- sold/completed stayed 0;
- candidate row exactly 1;
- deterministic observation row exactly 1;
- target fresh depth exactly 2 with the expected two listing IDs;
- candidate and observation identities, price/status, classification, confidence and R3/R4 provenance markers exactly matched the approved manifest.

The immediate precheck timestamp was also used to prove the only newly created market rows were the approved listing and observation, so no unrelated concurrent market write was observed during the execution window.

### D-116 — Immutable R3 source evidence may be reused only while all freshness and drift contracts still pass

The successful #228 write reused R3 run `33665350076` and artifact `9860342840` without a new provider request. The artifact ZIP SHA256 was rechecked against `a0fe9011e7b0102f8464835385746b0437fdebff74791e6db9d294d015df5e8a`, and its `2026-09-02T18:08:53.303Z` source time passed the Production function's seven-day freshness guard immediately before execution.

Reuse was acceptable only because the current target catalog/depth/collision state was freshly rebound. Historical provider evidence never grants permission to ignore current Production drift.

### D-117 — After the successful R4 proof, Data Scale remains depth-constrained

The postwrite SELECT-only Data Scale checkpoint is:
- 10,241 series;
- 23,808 variants;
- 133 listings;
- 155 observations;
- 122 fresh <30d covered variants;
- depth 120 x1 / 2 x2 / 0 x3+;
- max depth 2;
- 22 re-observed listings / 133 = 16.5414%;
- stock/restock 0 / 0;
- outbound clicks 7d 10;
- completed-sale evidence 0.

Therefore the current P0 diagnosis remains `depth_insufficient`. The next default engineering investigation should test bounded depth scaling on already-covered variants rather than assume more breadth-only collection is the highest-leverage move. This is a diagnostic priority, not authorization for provider calls, Production writes, or workflow changes.

### D-118 — Existing scheduled collection growth must be separated from manual/approved R4 effects

Between the repair-time 127/149 checkpoint and the pre-R4 132/154 checkpoint, existing scheduled `Gacha Market P3 Bounded Seed V2 Automatic` run `33748940988` completed successfully and logged 10 database writes = 5 listings + 5 observations. It did not affect the R4 target.

Production state changes from existing authorized automation must not be misattributed to repair migrations or a later one-candidate R4 write. Always bind before/after evidence to timestamps and exact target identities.

## Current durable state

- runtime main used for the successful R4 write: `8cc10b23236406b7bb3b9cec3db5e72574205196`
- Production R4 repair: **APPLIED AND VERIFIED**
- R4 one-candidate Production proof: **SUCCESS**
- Issue #228: **CLOSED completed**
- Production market state immediately after proof: **133 listings / 155 observations / sold0**
- fresh depth distribution: **120 x1 / 2 x2 / 0 x3+**
- target 伏黒恵 depth: **2**
- exact #228 write approval: **consumed/non-reusable**
- current P0: **depth_insufficient**
- next true gate: read-only reassessment/design for bounded depth scaling versus product/traffic/revenue priorities

## Approval state

Consumed/non-reusable includes all previously recorded R1/R2/#201/#206/#208/#211/#214 authorities, one-time review substitutions, the Production R4 repair migration approval, and the exact #228 one-candidate R4 write approval.

Not authorized now:
- another R4 write/retry
- provider refresh under consumed authority
- another history write by implication
- workflow dispatch/change
- Secrets/Variables changes
- F0/#142
- unrelated advisor remediation
- paid/destructive actions

## Hard durable constraints

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no automatic RPC retry
- do not manually alter Supabase migration ledger identity/timestamps
- do not weaken strict market matching or identity guards for coverage
- completed sold evidence remains separate from asking-price evidence
- do not scrape Mercari or Amazon
- direct main pushes remain prohibited

## Canonical history

Immediate pre-#229 decisions snapshot:

`docs/history/2026-09-03-pre-229-DECISIONS.md`

Do not create a recursive canonical sync merely to record #229's own docs-only merge.