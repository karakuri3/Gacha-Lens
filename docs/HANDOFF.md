# Gacha Lens Canonical Handoff

Updated: 2026-09-02 JST — post-R2 atomic prerequisite / #183 canonical-sync target

This is the canonical operational handoff for resuming Gacha Lens. Prefer newer verified GitHub/Vercel/Supabase/provider evidence over dated values here. Historical detail remains in Git history and linked Issues/PRs.

## Self-referential canonical-sync rule

This file is authored by Issue #183 / PR #184.

- If this file is being read from branch `docs/canonical-sync-post-r2-prereq-183` or open PR #184, finish #184's exact-head validation/review/merge gate first.
- If this file is being read from `main`, then #183/#184 is complete by definition because this content reached `main`; do **not** create another docs-only sync merely to mark #184 complete. Proceed to the fresh SELECT-only #179 pre-execution gate described below.

This rule prevents a canonical-sync PR from becoming stale the instant it merges.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch `main`, open PRs/Issues, recent Actions, Vercel, and any live Production/provider evidence needed before acting.
3. Resume durable Issue/branch/PR work; do not duplicate it.
4. Do not repeat completed Production canaries/diagnostics merely to refresh context.
5. Production DB mutation/migration/schema work, approval-bound live provider execution, workflow/schedule changes or dispatch, Secrets/Variables changes, paid actions, contractual commitments, destructive work, direct main pushes, and ineligible merges/releases require the appropriate explicit approval.
6. After every major Production/recovery/security/release milestone, synchronize `HANDOFF / STATUS / DECISIONS / TODO` before starting the next major implementation/execution phase.

## Repository / services

- Repository: `karakuri3/Gacha-Lens`
- Preferred local path: `C:\dev\Gacha-Lens`
- Production: `https://gachalens.com`
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- Old inactive Supabase: `ihcudkfspzuixsqsvoku` (`gacha-site-start`) — never confuse with Production
- Vercel project: `karakuri3s-projects/gachalens`
- Vercel project ID: `prj_8Yelkn1wM7JGoA2WCMCGGhRt3o8x`

## Verified checkpoint before #183/#184 sync

Canonical `main` immediately before this docs-only sync:

`d80450626fd30768bb8f0af68340f0d2aea00bbb`

Latest completed milestones before this sync:

- #172 — R1 exact-provider read-only canary: completed; Production DB writes 0
- #173/#176 — permanent Yahoo JSONP compatibility repair: completed and Production READY
- #177/#178 — post-Yahoo canonical sync: completed
- #180/#182 — R2 atomic persistence prerequisite: completed in repository; PR #182 merged
- #182 final head: `7f9486d68c8923a57d70555dcd14b81516cdad06`
- #182 merge/main SHA: `d80450626fd30768bb8f0af68340f0d2aea00bbb`
- #182 exact-head PR Code Quality `33600534520`: PASS
- #182 exact-head Vercel Preview `dpl_6G9LxzpEZtgeQZ7JKV8BYBR9jeLK`: READY
- #182 Git-triggered Production deployment `dpl_8oacYiC3Nia5RJbicgNxnr3TL3eW`: READY with canonical aliases including `gachalens.com` and `www.gachalens.com`

PR #142 / Issue #137 remains a separate F0 Production-impact approval boundary.

## Product purpose / priority

Customer promise:

**「欲しいガチャを、見つけて、比べて、逃さない」**

Current umbrella program: Issue #119 — **Data Scale Program**.

Near-term order remains:

**DATA -> TRAFFIC -> CLICK -> REVENUE**

Repeated observation history is the immediate DATA bottleneck.

## R1 durable result

R1 granted read-only provider execution only, never Production persistence.

Rakuten frozen 3:

- `rakuten-auc-toysanta-10382232` → `not_found`
- `rakuten-realize-store-2-10578559` → `not_found`
- `rakuten-surugaya-a-too-357043092` → `not_found`

Yahoo final frozen 3 after strict one-off live padding handling:

- `yahoo-lead-netstore-302507s186ook3` → `unchanged`, 698 / active
- `yahoo-suruga-ya-561833216001` → `not_found`
- `yahoo-selen-shope-5500000224314` → `unchanged`, 1500 / active

Safety/accounting:

- Production DB writes: 0
- false completed `sold`: 0
- Yahoo continuation approval: 9/9 attempts consumed exactly
- no further Yahoo request is authorized by that exhausted approval

## Yahoo JSONP durable contract

PR #176 permanently repaired the live Yahoo exact-read compatibility problem.

Only these wrapper starts are accepted:

1. fixed internal callback at raw byte 0; or
2. exact literal `/* */` at raw byte 0 immediately followed by that same fixed callback.

Durable rules:

- callback override is not accepted
- leading whitespace/newline/BOM fails closed
- `/**/`, `/*x*/`, arbitrary/multiple comments, comment gaps, arbitrary bytes, wrong callbacks, bare JSON and malformed wrappers fail closed
- endpoint/redirect/identity/positive-price/explicit-availability/active-or-sold_out/no-false-sold rules remain unchanged
- raw provider bodies/credentials are not logged

Independent Reviewer + Verifier passed the final repaired exact head before #176 merge.

## #180/#182 atomic R2 prerequisite

PR #182 added the deliberately narrow R2-specific one-transaction persistence path.

### PostgreSQL contract

Repository migration: `supabase/migrations/20260902150500_r2_atomic_reobservation_canary.sql`

`public.apply_market_reobservation_r2_canary_v1(jsonb)` is designed to:

- accept exactly 4 unique frozen listing IDs and 4 unique deterministic observation IDs
- require shared logical key `reobs-v1:r2-20260902-01`
- lock listings deterministically and protect the exactly-one-prior-observation precondition
- verify exact variant/series/source/provider/native/public identity and expected current snapshot
- require single/review-safe marketplace state, `sold_at=null`, unresolved import issues 0, exactly one prior observation
- recompute deterministic observation IDs with pgcrypto
- require positive integer price and only `active` / `sold_out`
- append exactly one observation per target
- update only `price`, `status`, `last_observed_at`, `updated_at`
- never write completed `sold` or `sold_at`
- roll back the whole transaction on any mismatch
- use `SECURITY INVOKER`, empty `search_path`, and service-role-only EXECUTE

### Node execution contract

- bind exact current-main SHA + frozen cohort snapshot + logical key in a SHA-256 digest
- dry-run performs DB reads only, provider calls 0, RPC calls 0, writes 0
- canary-write requires exact `APPROVE_MARKET_REOBSERVATION_R2_CANARY_V1:<head>:<digest>` approval
- exact provider reads only; no keyword rediscovery/provider substitution
- same-provider pacing is enforced
- max 3 attempts/listing; absolute max 12 HTTP attempts total
- any not_found/throttle/provider_error/identity mismatch/invalid payload stops before RPC
- exactly one fixed RPC call only after all four plans are safe
- no automatic RPC write retry
- postwrite reread requires exact +4 observations / +4 re-observed / +0 listings / +0 completed sold

### Ambiguous commit handling

`scripts/market-reobservation-r2-resolve.mjs` is SELECT-only. It returns `committed`, `not_committed`, or `inconsistent`, always with automatic retry disabled. Even `not_committed` requires a new explicit approval before another write attempt.

## #182 validation / task-specific review exception

Exact head: `7f9486d68c8923a57d70555dcd14b81516cdad06`.

- PR Code Quality `33600534520`: PASS
- Vercel Preview `dpl_6G9LxzpEZtgeQZ7JKV8BYBR9jeLK`: READY
- disposable Supabase Foundation run `33600534418`: local Supabase start PASS; `db reset --local --no-seed` PASS; all 9 repository migrations including the R2 migration applied successfully
- SQL/Node deterministic observation-ID parity: 4/4
- strengthened exact-head self-review: no blocking implementation finding

The Foundation run is red only because its pre-existing migration-order assertion hardcodes the former 8-version list and rejects the newly applied ninth migration. That is known harness debt, not a migration-application failure.

For **#180/#182 only**, the human explicitly allowed independent Reviewer/Verifier to be replaced by exact-head CI, exact-head Vercel Preview, disposable-Supabase migration application proof, and strengthened self-review. That exception ended with #182 and grants no Production migration/provider/write authority.

## Fresh Production evidence after #182 merge

SELECT-only checkpoint on 2026-09-02 JST:

- market listings: **113**
- market listing observations: **113**
- listings with 2+ observations: **0**
- completed `status=sold`: **0**
- `status=sold_out`: **0**

Frozen #179 cohort remains 4/4 present, active, single/review-safe, one observation each, matched variant identity, `sold_at=null`, complete provider/native/public identity, unresolved import issues 0.

| Listing | Current | Last observed | Deterministic R2 observation ID |
| --- | --- | --- | --- |
| `rakuten-auc-toysanta-10386044` | 598 / active | `2026-08-31T05:41:52.543Z` | `market-reobservation-05cd92e65bb9dbc29b6cb4c2b05f9724` |
| `rakuten-realize-store-2-10575349` | 898 / active | `2026-08-31T05:41:52.543Z` | `market-reobservation-277ddad06f32358e9fc13ed597608a93` |
| `yahoo-lead-netstore-302507s186ook3` | 698 / active | `2026-08-16T08:50:42.683Z` | `market-reobservation-ee52021350491f4496916654e2f74703` |
| `yahoo-selen-shope-5500000224314` | 1500 / active | `2026-08-31T05:41:52.543Z` | `market-reobservation-371537fad7dfb98834b92754610e6f08` |

Shared logical key: `reobs-v1:r2-20260902-01`.

## Critical Production schema distinction

Repository/Vercel release state and Supabase Production schema state are different.

At the post-#182 checkpoint:

- repository R2 migration: merged in `main`
- Production migration ledger version `20260902150500`: **absent**
- Production `public.apply_market_reobservation_r2_canary_v1(jsonb)`: **absent**

Therefore #182 did **not** apply its database function to Production. Never infer Production schema application from Git merge or Vercel READY status.

## #183 / PR #184 canonical-sync gate

PR #184 is docs-only and must keep the changed path set exactly:

- `docs/HANDOFF.md`
- `docs/STATUS.md`
- `docs/DECISIONS.md`
- `docs/TODO.md`

The #180/#182 exception does not carry into #184. Before #184 merge, normal task policy requires exact-head CI/Preview and independent Reviewer + Verifier.

When this file is on `main`, treat #183/#184 as completed and go directly to the fresh #179 pre-execution reread. Do not create a recursive docs sync just to record #184's own merge.

## #179 final Production approval boundary

After #183/#184 is complete on `main`, re-read current main and Production immediately before execution. Then present one exact approval request covering all three actions:

1. apply reviewed migration `20260902150500_r2_atomic_reobservation_canary.sql` to Supabase Production;
2. allow fresh exact provider reads for the frozen four, max 3 attempts/listing and absolute max 12 HTTP attempts;
3. only if all four produce valid exact `seen` evidence, allow exactly one atomic RPC write with successful deltas:
   - market listings: +0
   - observations: +4
   - listings with 2+ observations: +4
   - completed `sold`: +0
   - deletes: 0
   - protected identity/provenance changes: 0
   - exactly four listing updates limited to price/status/last_observed_at/updated_at

If any provider result is not_found, throttled, provider error, identity mismatch, malformed, invalid price/availability, or otherwise outside contract, Production data writes must remain 0.

Do **not** apply the migration, make those live provider calls, or execute the RPC until the user explicitly approves that exact #179 scope.

R2 approval does not authorize R3/R4, workflow/schedule changes, dispatches, Secrets/Variables changes, paid actions, destructive cleanup, F0/#142, or any other Production mutation.

## Known workflow debt

`.github/workflows/foundation-baseline.yml` still hardcodes the former eight migration versions. Run `33600534418` proves all nine current migrations applied before that stale assertion failed.

- do not misclassify this as an R2 migration failure
- do not silently repair the workflow inside #184 or #179
- workflow changes remain a separate approval-bound task

## F0 remains separate

PR #142 / Issue #137 repairs the month-precision rerelease canonical-year problem. The scheduled failure was fail-closed with transaction `not_started`, DB writes 0.

Do not merge #142 or manually dispatch F0 without its separate required review/approval.

## Hard rules

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually modify F0 auto or P3 V2 auto
- Kitan auto remains off; Qualia auto remains unapproved
- never weaken the strict matcher merely for coverage
- completed `sold` evidence stays separate from active/sold_out listing evidence
- do not scrape Mercari or Amazon
- no paid/licensed source activation without explicit approval
- no further #172 Yahoo live calls; its continuation budget is exhausted
- no R2 Production migration/provider/write action without new exact #179 approval
- known Foundation migration-order harness debt does not authorize an unapproved workflow change

## Exact next action

First determine where this file is being read:

- **On PR #184 branch:** finish #184 exact-head gates and merge only if normal Auto-Merge / Standing Production Release policy passes.
- **On `main`:** perform the fresh SELECT-only #179 Production preflight, verify the frozen four + deterministic IDs + migration/function state + global baseline, then present the exact combined migration + max-12 provider + atomic-write approval request and stop for explicit human approval.

Business priority remains **DATA first**, then TRAFFIC, CLICK/conversion, and REVENUE.
