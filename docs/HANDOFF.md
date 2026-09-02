# Gacha Lens Canonical Handoff

Updated: 2026-09-02 JST — post-R1 (#172) checkpoint

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

## Verified repository checkpoint

Canonical `main` immediately before this docs-only sync:

`26fb12ac868d10cb68ae9c3b1ce85675a2c3ab8f`

Recent merged milestones:

- #169 — equal-time/null-time re-observation safety
- #170 — Production history/depth rollout plan
- #171 — canonical sync after #169/#170

#171 Production deployment `dpl_4CQkGPnkfd3EnmAsvNbv5M5kXpNh` is READY with canonical aliases.

The one-time independent-review substitution approved for #167/#168 applied only to their replacement workstream #169/#170. It is not global and does **not** apply to Issue #173.

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

## R1 #172 — completed Production-connected read-only canary

R1 was explicitly approved and executed on six frozen known listings. It granted **read-only provider execution only**, never Production persistence.

### Rakuten 3

Each used one HTTP attempt, HTTP 200:

- `rakuten-auc-toysanta-10382232` → `not_found`
- `rakuten-realize-store-2-10578559` → `not_found`
- `rakuten-surugaya-a-too-357043092` → `not_found`

`not_found` means exact current item evidence was not returned. It does **not** mean completed `sold` and caused no lifecycle mutation.

### Yahoo 3

The first Yahoo read attempt exposed a real parser compatibility issue: live `itemLookup` responses are JSONP but begin with exact padding **`/* */`** before the exact configured callback. Current `main` requires the callback at byte 0 and therefore fails closed as `invalid_jsonp_payload`.

Sanitized diagnostics established:

- HTTP 200 / JavaScript response
- configured callback begins at index 5
- exactly one five-byte block-comment prefix
- prefix SHA-256 `69ae0cb0ec9cfb72deb6c3f0b6b17877401b217d4438a5721d2aed2eced0fb27`
- prefix is exact literal `/* */`
- callback follows immediately

A one-time branch-only strict parser that accepted **only** this observed exact `/* */` padding then completed the frozen Yahoo reads:

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
- temporary ops branch `ops/r1-reobservation-read-only-canary-172` was force-reset to canonical main and compare-confirmed identical
- no temporary workflow/runner remains on that branch
- Production DB writes from R1: 0
- Yahoo workflows had no DB credentials/access
- frozen six rows remained price/status/`last_observed_at` unchanged with exactly one observation each

Issue #172 is closed completed.

## Current Production data evidence

Latest SELECT-only post-R1 snapshot on 2026-09-02 JST:

- market listings: **110**
- market listing observations: **110**
- listings with 2+ observations: **0**

The increase from the earlier 107/107 baseline happened independently through existing Production activity (P3 lane); R1 workflows had no DB credentials and did not mutate the frozen six rows.

Repeated history therefore remains the central Data Scale bottleneck.

## Mandatory next blocker — Issue #173

Issue #173: **Accept Yahoo exact JSONP padding without weakening callback validation**.

This is the exact next P0 code task after the current canonical-sync gate is merged and its normal Production deployment is READY.

Permanent parser behavior must:

- keep the existing direct exact-callback form valid
- additionally accept only exact live padding `/* */` immediately before the exact configured callback
- reject `/**/`, `/*x*/`, arbitrary comments/bytes/whitespace prefixes, multiple comments, wrong callbacks, JSON without callback, and malformed wrappers
- preserve reviewed official endpoint, redirect refusal, exact native identity, positive-price, explicit-availability, active/sold_out-only, and no-false-sold contracts
- never log provider raw bodies or credentials

#173 is provider parsing / collection semantics. It requires an **independent Verifier + Reviewer** before merge unless the user grants a new explicit task-specific substitution. The old #167/#168 exception does not apply.

A branch named `fix/p0-yahoo-jsonp-padding-173` was created from pre-sync main, but no permanent code changes have been committed there yet. After this canonical sync merges, reset/recreate the repair branch from the new main before implementation.

## R2 and later rollout boundary

Authoritative plan: `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`.

- R1: completed read-only provider canary; DB writes 0
- R2: future tiny Production re-observation persistence canary; **not authorized**
- R3: future depth read-only canary; separate approval
- R4: future depth persistence canary; separate approval

Do not request/execute R2 until #173 is safely repaired/merged and current Production/provider evidence is re-read.

R2's planned shape remains 4 known listings (2 Rakuten + 2 Yahoo), bounded transaction, deterministic observation identity, exact before/after deltas, post-write reread, no false `sold`, and explicit Production DB approval.

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
- Yahoo Shopping: active, but permanent exact-read parser currently blocked by #173 live JSONP padding compatibility
- Bandai / Takara Tomy Arts: active official catalog sources
- Kitan auto: off
- Qualia broad auto: unapproved
- Aucfan: `paid_access_required`, strongest identified licensed completed-sale/history candidate pending diligence
- Mercari C2C: `partnership_required`; no scraping
- Mercari Shops API: seller-scoped, not broad C2C intelligence
- X: `paid_access_required`
- eBay: lower-priority planned with Japan/historical limitations
- Surugaya/Mandarake/AmiAmi broad automation: permission/partnership first
- connected GSC Wizard reporting path: unavailable at last check due subscription/payment state; unavailable is not zero traffic

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

## Exact next action

This canonical sync is the current gate.

After its docs-only PR is exact-head green, merged, and normal Vercel Production is READY:

1. re-fetch current main/open PRs/Issues
2. reset/recreate `fix/p0-yahoo-jsonp-padding-173` from current main
3. implement exact `/* */` compatibility in parser + tests only
4. run focused/full tests, lint, diff check, exact-head CI and Vercel Preview
5. perform strengthened full-diff review
6. **do not merge #173 without independent Verifier+Reviewer or a new explicit narrow user substitution**
7. do not execute additional Yahoo provider calls under #172 approval
8. do not begin R2 until #173 is safely resolved and a new explicit R2 Production DB approval is obtained

Business priority remains **DATA first**, then TRAFFIC, CLICK/conversion, and REVENUE.
