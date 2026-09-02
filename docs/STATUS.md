# Gacha Lens Status

Updated: 2026-09-02 JST — post-R2 atomic prerequisite (#180/#182) checkpoint

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live state before acting.

## Repository / release

- repo: `karakuri3/Gacha-Lens`
- canonical main before this sync: `d80450626fd30768bb8f0af68340f0d2aea00bbb`
- #172 R1 exact-provider read-only canary: **completed**, Production DB writes 0
- #175 post-R1 canonical sync: merged
- #173 Yahoo exact JSONP padding repair: **completed**
- #176 repair PR: independently reviewed/verified, merged and Production READY
- #177 / PR #178 post-Yahoo canonical sync: **completed**
- #180 R2 atomic persistence prerequisite: **completed**
- #182 prerequisite PR: merged as `d80450626fd30768bb8f0af68340f0d2aea00bbb`
- #182 Git-triggered Vercel Production deployment: `dpl_8oacYiC3Nia5RJbicgNxnr3TL3eW` — **READY** with canonical aliases
- #183 post-#182 canonical sync: **current phase gate**
- #179 R2 Production execution canary: open, **execution still blocked pending exact human approval**
- #142 / #137 F0 repair: still separate explicit human/Production-impact boundary

The human granted a task-specific exception for **#180/#182 only**: independent Reviewer/Verifier were replaced by exact-head CI, exact-head Vercel Preview, disposable-Supabase all-migration application proof, and strengthened self-review. That exception is not global and does not apply to #183 or #179 execution.

## Current P0/P1 order

Issue #119 — Data Scale.

1. finish #183 canonical sync and verify its normal Production release READY
2. re-read current main and Production cohort immediately before R2 execution planning
3. confirm Production still has no R2 migration/function applied
4. present one exact #179 approval request covering:
   - application of reviewed migration `20260902150500_r2_atomic_reobservation_canary.sql` to Production
   - max 12 credentialed provider HTTP attempts for the frozen four
   - only if all four reads are valid exact `seen`, one atomic RPC write with expected +4 observations / +4 re-observed listings / +0 market listings / +0 completed sold
5. obtain fresh explicit human approval
6. only then execute R2 and verify exact before/after state
7. force another canonical sync after the Production persistence milestone
8. R3/R4 remain separate later approvals

## R1 #172 result

R1 had zero Production persistence.

### Rakuten

3 frozen exact reads, one HTTP request each, all HTTP 200:

- 3 × `not_found / exact_item_not_returned`
- retries 0
- false `sold` 0

### Yahoo

Initial exact-read adapter calls reached HTTP 200 but failed closed because live Yahoo JSONP begins with exact padding `/* */` before the callback.

Final one-off strict Yahoo reads used the exact observed padding only:

- lead-netstore item → unchanged 698 / active
- suruga-ya item → not_found
- selen-shope item → unchanged 1500 / active

All HTTP 200, one attempt each, retries 0, rate limits 0.

Yahoo continuation approval used **9/9 attempts exactly**: 3 initial + 3 diagnostics + 3 final. That approval is exhausted and grants no further live Yahoo request.

## #173 / #176 Yahoo repair — completed

The permanent Yahoo exact-read parser preserves a narrow fail-closed contract:

- fixed callback only; caller-selected callback override removed
- direct form must begin with the fixed callback from raw byte 0
- padded form must begin with exact `/* */` from raw byte 0 and immediately continue with the fixed callback
- leading space/newline/BOM, `/**/`, `/*x*/`, arbitrary/multiple comments, comment gaps, wrong callbacks, bare JSON and malformed wrappers fail closed
- exact reviewed endpoint, redirect refusal, persisted identity, positive price, explicit availability, active/sold_out-only and no-false-sold rules remain unchanged

Independent Reviewer + Verifier passed the final repaired exact head before merge.

## #180 / #182 atomic R2 prerequisite — completed in repository only

PR #182 adds the narrow R2-specific persistence prerequisite:

- exactly four frozen listing IDs and the shared logical key `reobs-v1:r2-20260902-01`
- deterministic observation IDs verified on both Node and PostgreSQL sides
- one PostgreSQL RPC transaction for the four observation inserts plus four allowlisted listing snapshot updates
- deterministic row locking and a short observation-table concurrency lock
- exact identity/snapshot/one-prior-observation/import-issue checks
- positive integer price and only `active` / `sold_out`
- no completed `sold` or `sold_at` writes
- `SECURITY INVOKER`, empty search path, EXECUTE restricted to `service_role`
- dry-run performs DB reads only and zero provider/RPC writes
- canary-write requires exact head+cohort approval token
- max 3 attempts/listing and max 12 total provider HTTP attempts
- any failed/unsafe provider result stops before RPC
- exactly one atomic RPC write call, no automatic write retry
- SELECT-only ambiguous-commit resolver returns `committed` / `not_committed` / `inconsistent` and never retries automatically

Exact-head #182 validation:

- head `7f9486d68c8923a57d70555dcd14b81516cdad06`
- PR Code Quality run `33600534520`: PASS — full Node tests, lint, diff whitespace
- Vercel Preview `dpl_6G9LxzpEZtgeQZ7JKV8BYBR9jeLK`: READY
- disposable Supabase Foundation run `33600534418`: local Supabase start PASS; `db reset --local --no-seed` PASS; all **9** migrations including the new R2 migration applied successfully
- the Foundation job is red only because its pre-existing migration-order assertion hardcodes the old 8-version list and rejects the ninth applied version
- no workflow change was included in #182

Human-approved #180/#182-only review substitution allowed merge after strengthened self-review found no blocking implementation issue.

## Production data checkpoint after #182 merge

Fresh SELECT-only snapshot on 2026-09-02 JST:

- market listings: **113**
- observations: **113**
- listings with 2+ observations: **0**
- completed `status=sold`: **0**
- `status=sold_out`: **0**

Frozen #179 cohort remains unchanged and eligible for final pre-execution revalidation:

- `rakuten-auc-toysanta-10386044` — 598 / active / 1 observation
- `rakuten-realize-store-2-10575349` — 898 / active / 1 observation
- `yahoo-lead-netstore-302507s186ook3` — 698 / active / 1 observation
- `yahoo-selen-shope-5500000224314` — 1500 / active / 1 observation

All four are still single/review-safe marketplace rows with matched variant identity, `sold_at=null`, complete provider/native/public identity, and unresolved import issues 0.

### Critical Production schema state

- migration `20260902150500` in Production migration ledger: **absent**
- `public.apply_market_reobservation_r2_canary_v1(jsonb)` in Production: **absent**

Therefore #182 merge/release did **not** apply the R2 database function. Production migration application and R2 execution remain separate approval-bound #179 actions.

## R2 #179 remains unapproved

Expected successful R2 delta, only after a new exact human approval and four valid exact provider reads:

- market listings: +0
- observation rows: +4
- listings with 2+ observations: +4
- completed `sold`: +0
- deletes: 0
- protected identity/provenance changes: 0
- listing snapshot updates: exactly 4, limited to price/status/last_observed_at/updated_at

If any provider result is `not_found`, throttled, provider error, identity mismatch, malformed, invalid price/availability, or otherwise outside contract, Production DB writes must remain 0.

## Known CI harness debt

Foundation baseline workflow currently hardcodes the original eight migration versions. With #182's ninth migration present in the repository, disposable-DB run `33600534418` correctly applied all nine migrations and then failed only at that stale fixed-list assertion.

- this is not evidence that the R2 migration failed to apply in disposable Supabase
- do not silently broaden #183 to change workflows
- repairing the workflow is a separate workflow-change task/approval boundary

## Source posture

- Rakuten: active
- Yahoo: active; exact-read JSONP compatibility repaired by #176
- Aucfan: paid access diligence only
- Mercari C2C: partnership required; no scraping
- X: paid access required
- GSC connected reporting path: last seen subscription-unavailable, not zero traffic

Use `docs/DATA_SOURCE_CAPABILITY_MATRIX.md` for the full canonical matrix.

## Hard boundaries

- no R2 Production migration/function application without exact explicit approval
- no R2 live provider calls without exact explicit approval
- no R2 Production data write without exact explicit approval
- no further Yahoo calls under exhausted #172 approval
- do not merge #142 or dispatch F0 without separate approval
- do not change Production-capable workflows/schedules or dispatch them without applicable approval
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not weaken matcher, mix sold/current evidence, or scrape Mercari/Amazon

## Exact next step

#183 is the current docs-only phase gate. After it is exact-head green, independently reviewed/verified under normal policy, merged, and its normal Vercel Production deployment is READY:

1. re-fetch `main` and #179
2. perform a fresh SELECT-only R2 Production preflight
3. verify the four frozen rows, deterministic IDs, migration/function absence and expected deltas
4. present the exact combined #179 Production approval request
5. **stop until the human explicitly approves that exact migration + provider-attempt + atomic-write scope**
