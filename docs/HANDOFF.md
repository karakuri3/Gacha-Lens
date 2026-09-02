# Gacha Lens Canonical Handoff

Updated: 2026-09-02 JST — post-R2 atomic prerequisite (#180/#182) checkpoint

This is the canonical operational handoff for resuming Gacha Lens. Prefer newer verified GitHub/Vercel/Supabase/provider evidence over dated values here. Historical detail remains in Git history and linked Issues/PRs.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch `main`, open PRs/Issues, recent Actions, Vercel, and any live Production/provider evidence needed before acting.
3. Resume durable Issue/branch/PR work; do not duplicate it.
4. Do not repeat completed Production canaries/diagnostics merely to refresh context.
5. Production DB mutation/migration/schema work, approval-bound live provider execution, workflow/schedule changes or dispatch, Secrets/Variables changes, paid actions, contractual commitments, destructive work, direct main pushes, and ineligible merges/releases require the appropriate explicit approval.
6. After every major Production/recovery/security/release milestone, synchronize `HANDOFF / STATUS / DECISIONS / TODO` before starting the next major implementation/execution phase.

Repository: `karakuri3/Gacha-Lens`

Preferred local path: `C:\dev\Gacha-Lens`

Production: `https://gachalens.com`

Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)

Old inactive Supabase: `ihcudkfspzuixsqsvoku` (`gacha-site-start`) — never confuse with Production.

Vercel project: `karakuri3s-projects/gachalens`

Vercel project ID: `prj_8Yelkn1wM7JGoA2WCMCGGhRt3o8x`

## Verified repository / Production checkpoint

Canonical `main` immediately before this docs-only sync:

`d80450626fd30768bb8f0af68340f0d2aea00bbb`

Latest milestones:

- Issue #177 / PR #178 — post-Yahoo repair canonical sync: completed
- Issue #180 — R2 atomic re-observation persistence prerequisite: completed
- PR #182 — merged into `main`
- final #182 head: `7f9486d68c8923a57d70555dcd14b81516cdad06`
- merge/main SHA: `d80450626fd30768bb8f0af68340f0d2aea00bbb`
- exact-head PR Code Quality run `33600534520`: PASS
- exact-head Vercel Preview `dpl_6G9LxzpEZtgeQZ7JKV8BYBR9jeLK`: READY
- Git-triggered Production deployment `dpl_8oacYiC3Nia5RJbicgNxnr3TL3eW`: **READY**
- canonical aliases include `gachalens.com` and `www.gachalens.com`
- Issue #183 is the current post-#182 canonical-sync gate

No R2 Production migration, R2 live provider execution, or R2 Production data write has been authorized or executed.

PR #142 / Issue #137 remains a separate F0 Production-impact approval boundary.

## Product purpose / current business priority

Customer promise:

**「欲しいガチャを、見つけて、比べて、逃さない」**

Current umbrella program: Issue #119 — **Data Scale Program**.

The goal is compounding lawful coverage, not a 3-listing demo:

- broad catalog coverage
- multiple independent listings per variant where available
- repeated observations for price/inventory history
- authorized completed/sold evidence only
- stock/restock evidence
- explainable demand and purchase-intent signals
- measurable **DATA -> TRAFFIC -> CLICK -> REVENUE** movement

Repeated observation history remains the immediate DATA bottleneck.

## Completed Data Scale foundations

- #146 throughput audit
- #147 market history architecture
- #148 market signal architecture
- #149 forecast truthfulness
- #150 re-observation engine v1
- #153 exact Rakuten/Yahoo provider-read v1
- #156 Depth Collector v1
- #159 truthful read-only Data Scale Scoreboard
- #162 lawful source capability matrix
- #169 equal-time/null-time re-observation safety
- #170 Production history/depth rollout plan
- #172 first Production-connected exact-provider **R1 read-only canary** — completed, DB writes 0
- #175 canonical sync after R1
- #173/#176 permanent Yahoo JSONP compatibility repair — completed and Production READY
- #177/#178 post-Yahoo repair canonical sync — completed
- #180/#182 R2 atomic persistence prerequisite — completed in repository and Vercel application release only

## R1 #172 — completed Production-connected read-only canary

R1 was explicitly approved and executed on six frozen known listings. It granted read-only provider execution only, never Production persistence.

Rakuten final evidence:

- `rakuten-auc-toysanta-10382232` → `not_found`
- `rakuten-realize-store-2-10578559` → `not_found`
- `rakuten-surugaya-a-too-357043092` → `not_found`

Yahoo final evidence after the strict one-off live padding handling:

- `yahoo-lead-netstore-302507s186ook3` → `unchanged`, 698 / active
- `yahoo-suruga-ya-561833216001` → `not_found`
- `yahoo-selen-shope-5500000224314` → `unchanged`, 1500 / active

R1 safety/accounting:

- Production DB writes: 0
- false completed `sold`: 0
- Yahoo continuation approval: **9/9 attempts consumed exactly**
- no further Yahoo request is authorized by that exhausted approval
- temporary execution scaffolding was removed/reset after evidence capture

## #173 / #176 — permanent Yahoo JSONP repair completed

Final durable parser contract:

- callback is fixed internally; caller callback override is removed
- direct form must start with the fixed callback at raw byte 0
- padded form must start with exact literal `/* */` at raw byte 0 and the fixed callback must immediately follow
- leading space/newline/BOM fails closed
- `/**/`, `/*x*/`, arbitrary/multiple comments, comment gaps, arbitrary bytes, wrong callbacks, bare JSON and malformed wrappers fail closed
- reviewed official endpoint/redirect, exact persisted identity, positive integer price, explicit availability, active/sold_out-only, and no-false-sold contracts remain unchanged
- raw provider bodies/credentials are not logged

Independent final Reviewer + Verifier passed the repaired exact head before merge.

## #180 / #182 — atomic R2 prerequisite completed

The first R2 persistence canary required stronger atomicity than the generic P1/P2/P3 bounded writers. PR #182 added a deliberately narrow one-transaction path.

### PostgreSQL contract

`public.apply_market_reobservation_r2_canary_v1(jsonb)` in the repository migration:

- exactly 4 unique listing IDs + 4 unique deterministic observation IDs
- hard-pinned to the exact #179 four-listing cohort
- hard-pinned to logical key `reobs-v1:r2-20260902-01`
- deterministic listing lock order plus `FOR UPDATE`
- short `SHARE ROW EXCLUSIVE` lock on observation history to protect the exactly-one-prior-observation gate
- rejects null/invalid/stale/equal observation timestamps
- verifies exact variant/series/source/provider/native/public identity and expected price/status/last-observed snapshot
- requires single/review-safe marketplace state, `sold_at=null`, unresolved import issues 0, exactly one prior observation
- recomputes deterministic observation ID with pgcrypto
- requires positive integer price and status only `active` / `sold_out`
- appends one observation per target
- updates only listing `price`, `status`, `last_observed_at`, `updated_at`
- never writes completed `sold` or `sold_at`
- any mismatch raises and rolls back the whole RPC transaction
- `SECURITY INVOKER`, `search_path=''`, EXECUTE revoked from PUBLIC/anon/authenticated and granted only to `service_role`

### Node execution contract

- exact current-main SHA + frozen cohort snapshot + key are bound in a SHA-256 cohort digest
- unsafe current listing state fails before any live provider request
- dry-run is DB-read-only: provider calls 0, RPC calls 0, writes 0
- canary-write requires exact `APPROVE_MARKET_REOBSERVATION_R2_CANARY_V1:<head>:<digest>` approval
- exact provider reads only; no keyword rediscovery/provider substitution
- serial provider pacing
- max 3 attempts/listing and max 12 HTTP attempts total
- any not_found/throttle/provider_error/identity mismatch/invalid payload stops before RPC
- exactly one fixed RPC call is allowed only after all four plans are safe
- no automatic RPC write retry
- postwrite rereads require +4 observations / +4 re-observed / +0 listings / +0 completed sold and protected identity unchanged

### Ambiguous commit handling

`scripts/market-reobservation-r2-resolve.mjs` is SELECT-only and never calls a provider or RPC. It resolves deterministic evidence to:

- `committed`
- `not_committed`
- `inconsistent`

It always returns `automatic_retry=false` / `write_retry_authorized=false`. Even `not_committed` requires a new explicit approval before another write attempt.

## #182 validation and review disposition

Exact PR head: `7f9486d68c8923a57d70555dcd14b81516cdad06`.

Validation:

- PR Code Quality `33600534520`: PASS — full Node tests, lint, diff whitespace
- Vercel Preview `dpl_6G9LxzpEZtgeQZ7JKV8BYBR9jeLK`: READY
- disposable Supabase Foundation run `33600534418` successfully started local Supabase and completed `db reset --local --no-seed`
- all **9** repository migrations, including `20260902150500_r2_atomic_reobservation_canary.sql`, applied successfully in that disposable environment
- SQL/Node deterministic observation-ID parity for frozen four: 4/4
- strengthened exact-head self-review: no blocking implementation finding

The Foundation run is red only because its pre-existing `Verify migration order` harness hardcodes the old 8-version list and rejects the newly applied ninth migration. This is known harness debt, not a disposable migration-application failure. #182 intentionally did not widen scope into a workflow change.

Human exception: for **#180/#182 only**, independent Reviewer/Verifier were replaced by exact-head CI, exact-head Vercel Preview, disposable-Supabase migration application proof, and strengthened self-review. This exception ended with #182 and is not global.

## Current Production data evidence after #182 merge

Fresh SELECT-only snapshot on 2026-09-02 JST:

- market listings: **113**
- market listing observations: **113**
- listings with 2+ observations: **0**
- completed `status=sold`: **0**
- `status=sold_out`: **0**

The frozen #179 cohort remains exactly four safe rows:

### Rakuten 1

- listing: `rakuten-auc-toysanta-10386044`
- variant: `gashapon-4582769995712000-グスタフ・カール00型`
- series: `gashapon-4582769995712000`
- provider/native: `rakuten_ichiba` / `auc-toysanta:10386044`
- URL: `https://item.rakuten.co.jp/auc-toysanta/g-5l8n0018l8-002`
- current snapshot: 598 / active
- last observed: `2026-08-31T05:41:52.543Z`
- observation count: 1

### Rakuten 2

- listing: `rakuten-realize-store-2-10575349`
- variant: `tarts-y903137-プー-王冠b`
- series: `tarts-y903137`
- provider/native: `rakuten_ichiba` / `realize-store-2:10575349`
- URL: `https://item.rakuten.co.jp/realize-store-2/qq152607s248phk4`
- current snapshot: 898 / active
- last observed: `2026-08-31T05:41:52.543Z`
- observation count: 1

### Yahoo 1

- listing: `yahoo-lead-netstore-302507s186ook3`
- variant: `tarts-y096563-面会窓`
- series: `tarts-y096563`
- provider/native: `yahoo_shopping` / `lead-netstore_302507s186ook3`
- URL: `https://store.shopping.yahoo.co.jp/lead-netstore/302507s186ook3.html`
- current snapshot: 698 / active
- last observed: `2026-08-16T08:50:42.683Z`
- observation count: 1

### Yahoo 2

- listing: `yahoo-selen-shope-5500000224314`
- variant: `gashapon-4570118105790000-コライドン`
- series: `gashapon-4570118105790000`
- provider/native: `yahoo_shopping` / `selen-shope_5500000224314`
- URL: `https://store.shopping.yahoo.co.jp/selen-shope/5500000224314.html`
- current snapshot: 1500 / active
- last observed: `2026-08-31T05:41:52.543Z`
- observation count: 1

All four remain `listing_type=single`, `market_review_type=single`, `review_required=false`, `sold_at=null`, `matched_variant_id=variant_id`, complete provider/native/public identity, and unresolved import issues 0.

Frozen logical key:

`reobs-v1:r2-20260902-01`

Deterministic IDs:

- `rakuten-auc-toysanta-10386044` -> `market-reobservation-05cd92e65bb9dbc29b6cb4c2b05f9724`
- `rakuten-realize-store-2-10575349` -> `market-reobservation-277ddad06f32358e9fc13ed597608a93`
- `yahoo-lead-netstore-302507s186ook3` -> `market-reobservation-ee52021350491f4496916654e2f74703`
- `yahoo-selen-shope-5500000224314` -> `market-reobservation-371537fad7dfb98834b92754610e6f08`

## Critical Production schema distinction

Repository/Vercel release state and Supabase Production schema state are different.

At this checkpoint:

- repository migration `20260902150500_r2_atomic_reobservation_canary.sql`: **merged in main**
- Production migration ledger version `20260902150500`: **absent**
- Production `public.apply_market_reobservation_r2_canary_v1(jsonb)`: **absent**

Therefore #182 did **not** apply its database function to Production. Do not infer schema application from merge or Vercel READY status.

## Current phase gate — Issue #183

Issue #183: **Sync canonical state after R2 atomic prerequisite**.

Scope is exactly:

- `docs/HANDOFF.md`
- `docs/STATUS.md`
- `docs/DECISIONS.md`
- `docs/TODO.md`

It must record #177/#178 completion, #180/#182 completion, exact main/Preview/Production evidence, fresh SELECT-only Production state, migration/function absence, #180/#182-only review substitution, known Foundation harness debt, and the next #179 approval boundary.

The #180/#182 review exception does **not** carry into #183. #183 follows normal independent Reviewer + Verifier requirements.

## R2 #179 final approval boundary

Authoritative plan: `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`.

After #183 is merged and its normal Production deployment is READY, re-read current main and Production immediately before execution. Then present one exact approval request covering all of:

1. apply reviewed migration `20260902150500_r2_atomic_reobservation_canary.sql` to Supabase Production;
2. allow fresh exact provider reads for the frozen four, with max 3 attempts/listing and absolute max 12 HTTP attempts;
3. only if all four produce valid exact `seen` evidence, allow exactly one atomic RPC write whose successful deltas are:
   - market listings: +0
   - observations: +4
   - listings with 2+ observations: +4
   - completed `sold`: +0
   - deletes: 0
   - protected identity/provenance changes: 0
   - exactly four listing snapshot updates limited to price/status/last_observed_at/updated_at

If any provider result is not_found, throttled, provider error, identity mismatch, malformed, invalid price/availability, or otherwise fails contract, **Production DB writes must remain 0**.

Do not apply the migration, make those live provider calls, or execute the RPC until the user explicitly approves that exact #179 scope.

R2 approval does not authorize R3/R4, workflow/schedule changes, dispatches, Secrets/Variables changes, paid actions, destructive cleanup, F0/#142, or any other Production mutation.

## Re-observation durable contract

- exact persisted provider identity; no keyword rediscovery
- append-only successful observations
- deterministic retry-safe observation IDs
- ordinary states only `active` / `sold_out`
- `not_found` / provider failure never fabricate `sold`
- positive integer price and explicit availability required
- stale timestamp fails closed
- equal timestamp + conflicting price/status fails closed
- equal timestamp unchanged same-key retry remains deterministic
- null/blank observation time invalid
- credentials only reach reviewed official host/path; redirects fail closed
- failed checks do not advance `last_observed_at`
- Yahoo JSONP wrapper acceptance stays fixed to direct raw-byte-0 callback or exact raw-byte-0 `/* */` + callback

## Depth durable contract

- explicit variant + parent series
- strict P3 single-item/set/ambiguity safety
- durable listing/native provider/canonical URL dedupe
- many legitimate offers allowed; no `3 listings = done`
- SHA-256 selection binding / post-selection drift rejection
- insert-only projected writes
- Production persistence separately approval-gated

## Lawful source posture

Canonical matrix: `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`.

- Rakuten Ichiba: active
- Yahoo Shopping: active; permanent exact-read JSONP compatibility repaired by #176
- Bandai / Takara Tomy Arts: active official catalog sources
- Kitan auto: off
- Qualia broad auto: unapproved
- Aucfan: `paid_access_required`, strongest identified licensed completed-sale/history candidate pending diligence
- Mercari C2C: `partnership_required`; no scraping
- Mercari Shops API: seller-scoped, not broad C2C intelligence
- X: `paid_access_required`
- eBay: lower-priority planned with Japan/historical limitations
- Surugaya/Mandarake/AmiAmi broad automation: permission/partnership first
- connected GSC reporting path: unavailable at last check due subscription/payment state; unavailable is not zero traffic

Recheck provider terms/pricing/quotas immediately before acting.

## F0 official incident remains separate

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
- do not misuse Mercari Shops seller scope as broad C2C access
- no paid/licensed source activation without explicit approval
- no further #172 Yahoo live calls; its continuation budget is exhausted
- no R2 Production migration/provider/write action without new exact #179 approval
- known Foundation migration-order harness debt does not authorize an unapproved workflow change

## Exact next action

Finish Issue #183 canonical sync first.

After its docs-only PR is exact-head green, independently reviewed/verified under normal policy, merged, and its normal Git-triggered Vercel Production release is READY:

1. re-fetch current main/open PRs/Issues
2. perform a fresh SELECT-only Production R2 preflight
3. verify the same four targets, deterministic IDs, observation counts, unresolved issues, migration/function state, and exact global baseline
4. prepare the exact combined migration + max-12 provider + atomic-write approval request
5. **stop for explicit human #179 approval before any migration, provider request, or Production DB write**

Business priority remains **DATA first**, then TRAFFIC, CLICK/conversion, and REVENUE.
