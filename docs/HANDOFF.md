# Gacha Lens Canonical Handoff

Updated: 2026-09-02 JST — post-Yahoo JSONP repair (#173/#176) checkpoint

This is the canonical operational handoff for resuming Gacha Lens. Prefer newer verified GitHub/Vercel/Supabase/provider evidence over dated values here. Historical detail remains in Git history and linked Issues/PRs.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch `main`, open PRs/Issues, recent Actions, Vercel, and any live Production/provider evidence needed before acting.
3. Resume durable Issue/branch/PR work; do not duplicate it.
4. Do not repeat completed Production canaries/diagnostics merely to refresh context.
5. Production DB mutation, approval-bound live provider execution, workflow/schedule changes or dispatch, Secrets/Variables changes, paid actions, contractual commitments, destructive work, direct main pushes, and ineligible merges/releases require the appropriate explicit approval.
6. After every major Production/recovery/security/release milestone, synchronize `HANDOFF / STATUS / DECISIONS / TODO` before starting the next major implementation phase.

Repository: `karakuri3/Gacha-Lens`

Preferred local path: `C:\dev\Gacha-Lens`

Production: `https://gachalens.com`

Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)

Old inactive Supabase: `ihcudkfspzuixsqsvoku` (`gacha-site-start`) — never confuse with Production.

Vercel project: `karakuri3s-projects/gachalens`

Vercel project ID: `prj_8Yelkn1wM7JGoA2WCMCGGhRt3o8x`

## Verified repository / Production checkpoint

Canonical `main` immediately before this docs-only sync:

`a8bf9b7d7da7826544cb72a89f77b082fd86f248`

Latest milestone:

- Issue #173 — Yahoo exact JSONP padding compatibility: completed
- PR #176 — independently reviewed/verified and squash-merged
- final reviewed PR head: `d995e03f346398d02e212ac529316b81c0c2054b`
- merge/main SHA: `a8bf9b7d7da7826544cb72a89f77b082fd86f248`
- Git-triggered Production deployment: `dpl_4U73Cev864RvycfGGPteqQxMS246`
- deployment state: **READY**
- aliases include `gachalens.com` and `www.gachalens.com`
- Issue #177 is the current post-release canonical-sync gate

No R2 Production persistence has been authorized or executed.

PR #142 / Issue #137 remains a separate F0 Production-impact approval boundary.

## Product purpose / P0

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

## R1 #172 — completed Production-connected read-only canary

R1 was explicitly approved and executed on six frozen known listings. It granted **read-only provider execution only**, never Production persistence.

### Rakuten 3

Each used one HTTP attempt, HTTP 200:

- `rakuten-auc-toysanta-10382232` → `not_found`
- `rakuten-realize-store-2-10578559` → `not_found`
- `rakuten-surugaya-a-too-357043092` → `not_found`

`not_found` means exact current item evidence was not returned. It does **not** mean completed `sold` and caused no lifecycle mutation.

### Yahoo 3

The first Yahoo reads exposed the live JSONP compatibility issue: exact Yahoo `itemLookup` responses began with literal `/* */` before the callback. Sanitized diagnostics established the shape without raw-body/credential logging.

A one-time strict branch-only parser completed the frozen reads:

- `yahoo-lead-netstore-302507s186ook3` → `unchanged`, 698 / active
- `yahoo-suruga-ya-561833216001` → `not_found`
- `yahoo-selen-shope-5500000224314` → `unchanged`, 1500 / active

All three final calls were HTTP 200, one attempt each, retries 0, rate limits 0.

### R1 request accounting / safety

- Rakuten actual attempts: 3
- separately approved Yahoo continuation envelope: **9/9 consumed exactly**
  - initial Yahoo exact reads: 3
  - response-shape diagnostics: 3
  - final Yahoo reads: 3
- no further Yahoo request is authorized by that exhausted approval
- temporary execution scaffolding was removed/reset after evidence capture
- Production DB writes from R1: 0
- frozen six rows remained price/status/`last_observed_at` unchanged with exactly one observation each

Issue #172 is closed completed.

## #173 / #176 — permanent Yahoo JSONP repair completed

The permanent repair initially received two major independent-review findings. They were repaired before merge:

1. direct JSONP parsing could still tolerate leading bytes because of trimming;
2. exported parser accepted a caller-selected callback argument, weakening the fixed-callback boundary.

Final merged contract:

- callback is fixed internally; caller callback override is removed
- direct form must start with the fixed callback at raw byte 0
- padded form must start with exact literal `/* */` at raw byte 0 and the fixed callback must immediately follow
- only trailing whitespace normalization is allowed outside the wrapper
- leading space/newline/BOM fails closed
- `/**/`, `/*x*/`, arbitrary/multiple comments, comment gaps, arbitrary bytes, wrong callbacks, bare JSON and malformed wrappers fail closed
- reviewed official endpoint/redirect, exact persisted identity, positive integer price, explicit availability, active/sold_out-only, and no-false-sold contracts remain unchanged
- raw provider bodies/credentials are not logged

Independent final gates on exact head `d995e03f346398d02e212ac529316b81c0c2054b`:

- independent Reviewer: PASS, no remaining finding
- independent Verifier: PASS
- custom acceptance matrix: 2 accepted / 12 rejected, callback override rejected
- focused validation: PASS
- full Node suite: 1992/1992 PASS
- lint: PASS
- diff check: PASS
- added-line secret findings: 0
- exact-head PR Code Quality: PASS
- exact-head Vercel Preview: READY

The PR was then squash-merged as `a8bf9b7d7da7826544cb72a89f77b082fd86f248`; normal Production deployment `dpl_4U73Cev864RvycfGGPteqQxMS246` is READY. No manual deployment/promotion was invoked.

## Current Production data evidence

Latest SELECT-only snapshot on 2026-09-02 JST after #176:

- market listings: **113**
- market listing observations: **113**
- listings with 2+ observations: **0**
- completed `status=sold`: **0**
- `status=sold_out`: **0**
- Rakuten listings: **50**
- Yahoo listings: **63**

The earlier post-R1 snapshot was 110/110. The increase to 113/113 is existing Production breadth activity, not R2 persistence.

Repeated observation history therefore remains the central Data Scale bottleneck.

## Current phase gate — Issue #177

Issue #177: **Sync canonical state after Yahoo JSONP repair**.

This docs-only sync must be merged and its normal Production deployment verified READY before the next major implementation/execution phase.

Scope is exactly:

- `docs/HANDOFF.md`
- `docs/STATUS.md`
- `docs/DECISIONS.md`
- `docs/TODO.md`

It records #173/#176 completion, current release evidence, current Production counts, and the next R2 approval boundary. It grants no provider request and no Production write authority.

## R2 and later rollout boundary

Authoritative plan: `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`.

- R1: completed read-only provider canary; DB writes 0
- R2: tiny Production re-observation persistence canary; **not authorized**
- R3: depth read-only canary; separate approval
- R4: depth persistence canary; separate approval

After #177 is merged/Production READY, safe read-only R2 preparation may proceed:

1. re-read Production listing/observation state
2. freeze exactly four known listings, planned 2 Rakuten + 2 Yahoo
3. verify exact identity/current observation counts
4. freeze deterministic observation keys/IDs and expected deltas
5. define bounded transaction, post-write reread, stop conditions and rollback evidence
6. present the exact bounded write plan to the user

**Do not perform the R2 Production DB mutation until the user explicitly approves that exact cohort/write delta.** R2 approval would not authorize R3/R4, schedules, workflow changes or paid actions.

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
- no R2 Production DB mutation without new exact user approval

## Exact next action

Finish Issue #177 canonical sync first.

After its docs-only PR is exact-head green, independently reviewed/verified as required by its task contract, merged, and normal Vercel Production is READY:

1. re-fetch current main/open PRs/Issues
2. perform a fresh SELECT-only Production R2 preflight
3. prepare/freeze the exact four-row R2 cohort and deterministic expected write delta
4. verify current provider/read prerequisites without spending unapproved live-call budget
5. present the exact Production mutation plan and stop conditions to the user
6. **stop for explicit R2 Production DB approval before any write**

Business priority remains **DATA first**, then TRAFFIC, CLICK/conversion, and REVENUE.
