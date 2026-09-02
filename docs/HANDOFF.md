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

## Verified repository checkpoint

Canonical `main` immediately before this docs-only sync:

`a8bf9b7d7da7826544cb72a89f77b082fd86f248`

Recent merged milestones:

- #172 — R1 exact-provider read-only canary, DB writes 0
- #175 — post-R1 canonical sync
- #176 — strict Yahoo exact JSONP padding compatibility

#176 Production deployment `dpl_4U73Cev864RvycfGGPteqQxMS246` is READY for exact merge SHA `a8bf9b7d7da7826544cb72a89f77b082fd86f248` with canonical aliases.

The one-time independent-review substitution approved for #167/#168 applied only to their replacement workstream #169/#170. It was not reused for #173: PR #176 passed independent Verifier and Reviewer gates on exact head `d995e03f346398d02e212ac529316b81c0c2054b`.

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

Latest SELECT-only snapshot at `2026-09-02T05:01:10.519Z`:

- market listings: **113**
- active safe single listings: **112**
- market listing observations: **113**
- listings with 2+ observations: **0**
- providers: **Rakuten 50 / Yahoo 63**
- fresh <30d depth: **102 variants ×1 / 1 variant ×2 / 0 variants ×3+**
- outbound clicks: **3 / 14 / 41** at 24h / 7d / 30d

The increase from the earlier 107/107 and post-R1 110/110 checkpoints happened independently through existing Production activity (P3 lane). R1 and #176 performed no Production DB writes.

Repeated history therefore remains the central Data Scale bottleneck.

## Yahoo exact JSONP repair — completed

Issue #173 / PR #176 permanently repaired the live Yahoo `itemLookup` wrapper mismatch.

Current parser behavior:

- accepts the direct exact callback from raw byte 0
- accepts only exact live padding `/* */` from raw byte 0 immediately before the exact configured callback
- reject `/**/`, `/*x*/`, arbitrary comments/bytes/whitespace prefixes, multiple comments, wrong callbacks, JSON without callback, and malformed wrappers
- the parser callback is fixed and cannot be overridden by a caller
- reviewed endpoint, redirect refusal, exact native identity, positive price, explicit availability, active/sold_out-only, and no-false-sold contracts remain unchanged
- provider raw bodies and credentials remain excluded from diagnostics

Implementation and validation made zero live provider requests and zero Production DB reads/writes. The exhausted #172 Yahoo request envelope remains exhausted; merging #176 did not renew it.

## R2 and later rollout boundary

Authoritative plan: `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`.

- R1: completed read-only provider canary; DB writes 0
- R2: future tiny Production re-observation persistence canary; **not authorized**
- R3: future depth read-only canary; separate approval
- R4: future depth persistence canary; separate approval

R2 may now be prepared read-only from current persisted evidence, but it must not execute until the exact cohort, transaction/rollback path, provider-read envelope, expected deltas, and current safety evidence are presented and explicitly approved. Any new live provider call also needs its own current authorization; #172 grants none.

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
- Yahoo Shopping: active; exact-read parser supports only direct fixed callback or exact observed `/* */` padding
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

Issue #177 canonical sync is the current gate.

After its docs-only PR is exact-head green, merged, and normal Vercel Production is READY:

1. re-fetch current main/open PRs/Issues
2. create/resume one bounded read-only R2 readiness task under #119
3. SELECT-freeze exactly four safe persisted listings, two Rakuten and two Yahoo, with current observation counts and immutable identities
4. prove the deterministic-key, transaction, lease, exact-delta, verification, rollback, and provider-request envelope before asking for execution authority
5. make no live provider call and no Production mutation during preparation
6. present the exact approval packet; R2 execution remains blocked until the user explicitly approves its Production DB writes and live provider reads
7. keep R3/R4 as later separate approvals

Business priority remains **DATA first**, then TRAFFIC, CLICK/conversion, and REVENUE.
