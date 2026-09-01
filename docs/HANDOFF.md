# Gacha Lens Canonical Handoff

Updated: 2026-09-02 JST — post-PR #170 checkpoint

This is the canonical operational handoff for resuming Gacha Lens in a fresh ChatGPT/Codex task. Prefer newer live GitHub/Vercel/Supabase/provider evidence over dated values here. Historical detail remains in Git history and linked Issues/PRs; this file is optimized for safe continuation from the current state.

## 1. Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AGENT_QUEUE.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch `main`, open PRs, relevant Issues, recent Actions, Vercel deployment state, and any live provider/Production evidence needed before acting.
3. Prefer existing durable Issue/branch/PR work over creating duplicates.
4. Do not repeat completed Production canaries/diagnostics merely to refresh context.
5. Do not perform Production DB writes, migrations/backfills/cleanup, live Production-connected provider execution, `workflow_dispatch`, Secrets/Variables changes, paid actions, contractual commitments, destructive actions, direct pushes to `main`, or ineligible merges/releases without required approval.
6. Safe reversible PRs may use `docs/AUTO_MERGE_POLICY.md`; their normal Git-triggered Vercel release may use `docs/PRODUCTION_RELEASE_POLICY.md` only when every gate passes.
7. After a major Production/recovery/security/release milestone, synchronize the canonical four files before starting the next major implementation phase.

Repository: `karakuri3/Gacha-Lens`

Preferred local path: `C:\dev\Gacha-Lens`

Production: `https://gachalens.com`

Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)

Old inactive Supabase: `ihcudkfspzuixsqsvoku` (`gacha-site-start`) — never confuse it with Production.

Vercel project: `karakuri3s-projects/gachalens`

Vercel project ID: `prj_8Yelkn1wM7JGoA2WCMCGGhRt3o8x`

## 2. Verified repository / release checkpoint

Current merged `main` before this canonical-sync PR:

`def36cbc1dfe57da8c35faa0577490bc4ab5866c`

Latest merged milestones:

- PR #169 — `P0 Data Scale: harden equal-time re-observation safety`
  - merged main: `d8921839491ce1e544c9bb3db92525831418f67b`
  - Issue #166: closed completed
  - Production deployment `dpl_3vMxWwP89osNcjZdLKTbUBscQWHR`: READY
- PR #170 — `P0 Data Scale: finalize Production history/depth rollout plan`
  - merged main: `def36cbc1dfe57da8c35faa0577490bc4ab5866c`
  - Issue #165: closed completed
  - Production deployment `dpl_DiuYPDViLe25wLjgeEXkpdeozgcg`: READY
  - canonical rollout plan: `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`

Draft PR #167 was closed superseded by non-Draft #169 because the connected GitHub Draft→Ready mutation fails with a `fullDatabaseId` GraphQL error. Draft #168 was likewise closed superseded by current-main non-Draft #170 after #169 merged.

For the #167/#168 workstream only, the user explicitly approved a one-time replacement of independent Verifier/Reviewer with exact-head CI, Vercel Preview, strengthened Lead/self-review, and regression tests. This exception is not global and does not authorize any Production execution.

No Production DB writes, live provider executions, workflow dispatches/schedule changes, Secrets/Variables changes, paid activations, schema changes, destructive actions, or F0 changes were performed by #169/#170.

## 3. Product purpose and current P0

Gacha Lens is a gachapon market-intelligence product whose customer promise is:

**「欲しいガチャを、見つけて、比べて、逃さない」**

Current umbrella program: Issue #119 — **Data Scale Program**.

Three active listings remain only a truthful presentation threshold, not a completion target. The actual objective is compounding lawful data coverage:

- broad official/catalog coverage
- multiple independent market listings per variant where available
- repeated observations for price/inventory history
- completed/sold evidence only from authorized sources
- stock/restock evidence
- explainable demand/popularity evidence
- authorized social/X evidence
- click/search/purchase-intent evidence
- measurable **DATA -> TRAFFIC -> CLICK -> REVENUE** movement

## 4. Completed Data Scale foundations

- #146 — throughput audit: merged
- #147 — market history architecture: merged
- #148 — market signal architecture: merged
- #149 — forecast truthfulness: merged
- #150 — re-observation engine v1: merged
- #153 — exact Rakuten/Yahoo re-observation provider read v1: merged
- #156 — Depth Collector v1: merged
- #159 — truthful read-only Data Scale Scoreboard: merged
- #162 — lawful source capability matrix: merged
- #169 — equal-time/null-time re-observation safety hardening: merged
- #170 — Production history/depth rollout plan: merged

### Re-observation contract after #169

Ordinary re-observation remains exact-identity and append-only:

- no keyword rediscovery
- deterministic retry-safe observation IDs
- ordinary states only `active` / `sold_out`
- no fabricated completed `sold`
- positive integer price and explicit provider availability required
- older observations fail closed
- equal timestamp + conflicting price/status fails closed as `conflicting_equal_observation_time`
- equal timestamp + unchanged same-key retry remains deterministic
- null/undefined/blank/whitespace `observedAt` is invalid
- provider credentials only reach reviewed official host/path; redirects fail closed
- failed attempts do not advance `last_observed_at`

Merged code does **not** authorize Production-connected execution or persistence.

### Depth contract after #156

- explicit target variant + parent series
- strict P3 matcher/set/ambiguity safety unchanged
- durable listing ID, native provider identity, and canonical URL dedupe
- genuine independent offers are retained even at similar prices/titles
- existing listing identities excluded
- selection is SHA-256 bound against post-selection drift
- projected writes insert-only
- no `3 listings = done`
- default/hard budgets are safety ceilings, not completion targets

## 5. Dated Production evidence

Fresh read-only baseline recorded by Issue #165 at **2026-09-02 01:49 JST**:

- series: 10,241
- variants: 23,808
- market listings: 107
- observations: 107
- re-observed listings: 0
- depth among covered variants: 96 ×1 / 1 ×2 / 0 ×3+
- completed `sold`: 0
- Scoreboard bottleneck: `history_not_enabled`

Earlier #159 validation also recorded active safe singles 106, 104 variants with safe active evidence, verified affiliate provenance 3, review-safe stock/restock/X 0/0/0, and outbound clicks 0/21/38 at 24h/7d/30d then.

These are dated measurements. Re-read immediately before any live or write-capable canary.

## 6. Current lawful source posture

Canonical matrix: `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`.

Verified 2026-09-02 posture:

- Rakuten Ichiba API: `active`
- Yahoo Shopping API / ValueCommerce: `active`
- Bandai / Takara Tomy Arts: active official catalog/release sources inside existing contracts
- Kitan Club: capability exists; automatic writes remain off
- Qualia: conservative/limited official capability; broad automatic rollout unapproved
- Aucfan: `paid_access_required`; strongest identified licensed candidate for completed-sale/history, pending commercial/data-rights diligence
- Yahoo Auctions broad public market API: unavailable through reviewed current public path
- Mercari C2C: `partnership_required`; do not scrape
- Mercari Shops Public API: seller/shop scoped, not broad C2C market intelligence
- X API: `paid_access_required`; current prices/quotas/search scope must be rechecked before any activation
- eBay Browse: lower-priority `planned`; Japan/historical limitations require recheck
- Surugaya / Mandarake / AmiAmi broad automation: permission/partnership diligence first
- Gacha Lens outbound clicks: active first-party provider+variant purchase-intent evidence, not transactions
- connected GSC Wizard reporting path: unavailable at verification due subscription/payment state; unavailable is not zero traffic

Provider prices, quotas, supported markets, licensing and product tiers are dated facts. Recheck authoritative sources immediately before purchase, implementation, credential change, or external commitment.

## 7. Production history/depth rollout plan

Authoritative plan: `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`.

Lane ownership stays separate:

- P3 V2 = breadth / first safe listing
- re-observation = repeated history for known exact listings
- Depth Collector = multiple distinct safe offers for explicit variants

Planned stages are approval-gated one by one:

### R1 — exact-provider read-only re-observation canary

Proposed scope only; **not yet approved/executed**:

- 6 known listings total
- 3 Rakuten + 3 Yahoo
- serial
- max 6 normal requests
- max 3 attempts for reviewed retryable conditions
- worst-case HTTP attempt envelope 18
- Rakuten spacing >=1200ms / Yahoo >=1000ms
- no keyword fallback
- DB writes 0

### R2 — tiny Production re-observation persistence canary

Future separate explicit approval required:

- 4 known listings total
- 2 Rakuten + 2 Yahoo
- expected +4 observations and +4 listings reaching 2+ observations if all begin at one observation
- total listing count unchanged
- no false `sold`
- bounded transaction + exact before/after + post-write reread
- compensating destructive repair after commit requires separate approval unless atomic rollback is still possible

### R3 — two-variant depth read-only canary

Future separate live-provider-read approval required:

- 2 explicit target variants
- one Rakuten-first + one Yahoo-first
- max 5 accepted offers each / 10 total
- 1 root per provider, max 3 query attempts per root
- max 6 planner requests / max 18 HTTP attempts
- affiliate enrichment disabled for the proof canary
- DB writes 0

### R4 — tiny depth persistence canary

Future separate Production DB approval required:

- persist only R3's frozen strict-safe subset
- up to 5 listings per target / 10 total
- listing insert + initial observation insert only
- no existing-row updates/deletes
- exact post-write verification

No schedule/budget scaling occurs automatically after R1-R4. Scale only from measured provider health and Scoreboard DATA gain.

## 8. Current approval boundary / exact next action

The #169/#170 milestone is complete. This canonical sync is the mandatory phase gate before any live rollout work.

After this canonical-sync PR is exact-head green, merged, and its normal Vercel Production deployment is READY:

1. Re-fetch current `main`, Issue #119, open PRs, Production Scoreboard counts and relevant provider-health evidence.
2. Confirm the baseline has not materially drifted.
3. Freeze the exact six listing identities proposed for R1: 3 Rakuten + 3 Yahoo, due/review-safe/exact-identity complete.
4. Present that exact R1 cohort and its max-18-HTTP-attempt envelope to the user for **explicit live provider-read approval**.
5. Do **not** execute R1 until that approval is given.
6. Do not combine R1 approval with R2/R3/R4; each later stage requires its own approval.
7. Keep PR #142 / Issue #137 at its independent F0 Production-impact approval boundary.

Thus the next work is **R1 cohort preparation/read-only preflight**, not Production execution.

## 9. F0 official automatic incident

Scheduled `Gacha Official Bounded Automatic Production` run `33484450472` failed safely on 2026-09-01:

- read-only audit: `OFFICIAL_READ_ONLY_PLAN_READY`
- proposed new series / variants: 4 / 19
- proposed restock event inserts: 1
- Production transaction: `not_started`
- DB writes: 0
- deletes: 0
- blocker: `official_bounded_rerelease_canonical_release_mismatch`

Issue #137 / PR #142 contain the repair. Do not merge #142 or manually rerun/dispatch F0 without required approvals.

## 10. Hard repository/source rules

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually modify F0 official auto or P3 V2 auto
- do not enable Kitan or Qualia auto without approval
- do not rerun completed Kitan/Qualia/complete-set/P2/P1 canaries without a new task-specific approval
- do not weaken the strict single-item matcher
- keep complete sets at series scope
- never mix completed/sold evidence with active asking-price evidence
- do not scrape Mercari or Amazon
- do not treat Mercari Shops seller credentials as C2C market-wide access
- do not automate other public storefronts without a reviewed API/feed/permission path
- do not purchase/activate Aucfan, X, GSC paid connector access, or another paid/licensed source without explicit approval

## 11. Merge/release policy

`docs/AUTO_MERGE_POLICY.md` is the authoritative narrow exception allowing eligible safe, reversible PRs to merge without repeated human acknowledgement.

If merge causes only the repository's normal Vercel Production deployment, `docs/PRODUCTION_RELEASE_POLICY.md` must also pass in full.

Always stop for explicit approval when work includes Production DB mutation/migration, live Production-connected provider execution where approval is required, workflow dispatch, Secrets/Variables changes, new/material Production-capable workflow/schedule/cron/automatic ingestion, paid actions, contractual obligations, destructive operations, direct main push, major unresolved product/security decisions, or an ineligible release.

Business priority remains **DATA first**, then TRAFFIC, CLICK/conversion, and REVENUE.
