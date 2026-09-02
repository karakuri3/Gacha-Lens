# Gacha Lens Canonical Handoff

Updated: 2026-09-02 JST — post-R2 atomic prerequisite / #183 canonical-sync target

This is the canonical operational handoff for resuming Gacha Lens. Prefer newer verified GitHub/Vercel/Supabase/provider evidence over dated values here.

## Self-referential canonical-sync rule

This file is authored by Issue #183 / PR #184.

- If read from branch `docs/canonical-sync-post-r2-prereq-183` or open PR #184, finish #184's exact-head gates and merge/release flow first.
- If read from `main`, #183/#184 is complete by definition because this content reached `main`; do not create another docs-only sync merely to mark #184 complete. Proceed to the fresh SELECT-only #179 pre-execution gate.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch `main`, open PRs/Issues, recent Actions, Vercel, and live Production/provider evidence needed before acting.
3. Resume durable Issue/branch/PR work; do not duplicate it.
4. Do not repeat completed Production canaries merely to refresh context.
5. Production DB mutation/migration/schema work, approval-bound live provider execution, workflow/schedule changes or dispatch, Secrets/Variables changes, paid actions, contractual commitments, destructive work, direct main pushes, and ineligible merges/releases require explicit approval.
6. After every major Production/recovery/security/release milestone, synchronize `HANDOFF / STATUS / DECISIONS / TODO` before the next major implementation/execution phase.

## Repository / services

- Repository: `karakuri3/Gacha-Lens`
- Production: `https://gachalens.com`
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- Old inactive Supabase: `ihcudkfspzuixsqsvoku` (`gacha-site-start`) — never confuse with Production
- Vercel project ID: `prj_8Yelkn1wM7JGoA2WCMCGGhRt3o8x`
- Preferred local path: `C:\dev\Gacha-Lens`

## Verified checkpoint before #183/#184 sync

Pre-sync `main`:

`d80450626fd30768bb8f0af68340f0d2aea00bbb`

Completed milestones:

- #172 R1 exact-provider read-only canary: completed; Production DB writes 0
- #173/#176 Yahoo JSONP repair: completed and Production READY
- #177/#178 post-Yahoo canonical sync: completed
- #180/#182 R2 atomic persistence prerequisite: completed in repository
- #182 final head `7f9486d68c8923a57d70555dcd14b81516cdad06`
- #182 merge/main `d80450626fd30768bb8f0af68340f0d2aea00bbb`
- #182 PR Code Quality `33600534520`: PASS
- #182 Preview `dpl_6G9LxzpEZtgeQZ7JKV8BYBR9jeLK`: READY
- #182 Production deployment `dpl_8oacYiC3Nia5RJbicgNxnr3TL3eW`: READY with canonical aliases

PR #142 / Issue #137 remains a separate F0 Production-impact approval boundary.

## Product purpose / priority

Customer promise: **「欲しいガチャを、見つけて、比べて、逃さない」**

Current umbrella: Issue #119 Data Scale.

Near-term order: **DATA -> TRAFFIC -> CLICK -> REVENUE**.

Repeated observation history remains the immediate DATA bottleneck.

## R1 durable result

Rakuten frozen 3 all returned `not_found`. Yahoo final frozen 3 returned two `unchanged` and one `not_found`. Production DB writes remained 0, false completed `sold` remained 0, and the Yahoo continuation approval was consumed exactly 9/9 and is exhausted.

## Yahoo JSONP durable contract

PR #176 permanently repaired live Yahoo exact-read compatibility. Only a fixed internal callback at raw byte 0, or exact `/* */` at raw byte 0 immediately followed by that callback, is accepted. Alternate comments, leading whitespace/BOM, wrong callbacks, bare JSON and malformed wrappers fail closed. Independent Reviewer + Verifier passed the final repaired head.

## #180/#182 atomic R2 prerequisite

Repository migration: `supabase/migrations/20260902150500_r2_atomic_reobservation_canary.sql`.

The repository now contains a deliberately narrow R2 path:

- exactly 4 frozen known listings, 2 Rakuten + 2 Yahoo
- shared key `reobs-v1:r2-20260902-01`
- deterministic observation IDs
- exact current-main/cohort approval binding
- read-only dry-run with provider/RPC/write count 0
- exact provider reads only
- max 3 attempts/listing, max 12 HTTP attempts total
- any unsafe provider result stops before RPC
- one PostgreSQL RPC transaction only if all four exact reads are safe
- exactly 4 observation inserts + 4 listing updates limited to price/status/last_observed_at/updated_at
- no completed `sold` / `sold_at`
- no automatic RPC write retry
- ambiguous commit resolver is SELECT-only and never auto-retries

Exact #182 validation:

- PR Code Quality `33600534520`: PASS
- Preview `dpl_6G9LxzpEZtgeQZ7JKV8BYBR9jeLK`: READY
- disposable Supabase run `33600534418`: all 9 migrations applied successfully before a stale fixed 8-version workflow assertion failed
- SQL/Node deterministic observation-ID parity: 4/4

For #180/#182 only, the human allowed exact-head CI + Preview + disposable-Supabase migration proof + strengthened self-review to replace independent Reviewer/Verifier. That exception ended with #182.

## Fresh Production evidence after #182 merge

SELECT-only snapshot on 2026-09-02 JST:

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

## Critical Production schema distinction

Repository/Vercel release state and Supabase Production schema state are different.

At the post-#182 checkpoint:

- repository R2 migration: merged in `main`
- Production migration ledger version `20260902150500`: **absent**
- Production `public.apply_market_reobservation_r2_canary_v1(jsonb)`: **absent**

Therefore #182 did not apply its database function to Production.

## #183 / PR #184 review substitution

PR #184 is docs-only and must keep the changed paths exactly to:

- `docs/HANDOFF.md`
- `docs/STATUS.md`
- `docs/DECISIONS.md`
- `docs/TODO.md`

On 2026-09-02, the human explicitly authorized **#184 only** to replace independent Reviewer + Verifier with:

- exact-head PR Code Quality
- exact-head Vercel Preview
- strengthened full-diff/canonical-consistency self-review

If those exact-head gates pass and the remaining Auto-Merge / Standing Production Release conditions pass, #184 may be merged and its normal Git-triggered Vercel Production deployment may proceed.

This #184 exception is task-specific. It does **not** authorize #179 Production migration application, live provider calls, Production DB writes, R3/R4, workflow/schedule changes, Secrets/Variables, F0/#142, paid actions, or future PR review substitutions.

When this file is on `main`, treat #183/#184 as complete and go directly to the fresh #179 pre-execution reread. Do not create a recursive docs sync just to record #184's own merge.

## #179 final Production approval boundary

After #184 reaches `main`, re-read current main and Production immediately before execution. Then present one exact approval request covering all three actions:

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

Do not apply the migration, make those live provider calls, or execute the RPC until the user explicitly approves that exact #179 scope.

## Known workflow debt

`.github/workflows/foundation-baseline.yml` still hardcodes the former eight migration versions. Run `33600534418` proves all nine current migrations applied before that stale assertion failed. Workflow repair remains a separate approval-bound task.

## Hard rules

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually modify F0 auto or P3 V2 auto
- Kitan auto remains off; Qualia auto remains unapproved
- never weaken the strict matcher merely for coverage
- completed `sold` evidence stays separate from active/sold_out listing evidence
- do not scrape Mercari or Amazon
- no paid/licensed source activation without explicit approval
- no further #172 Yahoo live calls
- no R2 Production migration/provider/write action without new exact #179 approval
- known Foundation migration-order harness debt does not authorize an unapproved workflow change

## Exact next action

- **On PR #184 branch:** re-run exact-head CI/Preview after recording the #184-specific substitution, perform strengthened full-diff self-review on that same head, then merge only if Auto-Merge / Standing Production Release gates pass and verify the normal Production deployment READY.
- **On `main`:** perform the fresh SELECT-only #179 Production preflight, verify frozen rows + deterministic IDs + migration/function state + global baseline, then present the exact combined migration + max-12 provider + atomic-write approval request and stop for explicit human approval.
