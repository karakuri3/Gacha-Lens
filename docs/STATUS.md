# Gacha Lens Status

Updated: 2026-09-02 JST — post-PR #170 checkpoint

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live GitHub/Vercel/Supabase/provider state before acting; counts and provider terms below are dated unless explicitly re-read.

## Repository / release

- repo: `karakuri3/Gacha-Lens`
- current merged checkpoint before this canonical-sync PR: `def36cbc1dfe57da8c35faa0577490bc4ab5866c`
- latest merged safety milestone: #169 `P0 Data Scale: harden equal-time re-observation safety`
- #169 merged main: `d8921839491ce1e544c9bb3db92525831418f67b`
- #169 Production deployment `dpl_3vMxWwP89osNcjZdLKTbUBscQWHR`: READY
- Issue #166: closed completed
- latest merged planning milestone: #170 `P0 Data Scale: finalize Production history/depth rollout plan`
- #170 merged main: `def36cbc1dfe57da8c35faa0577490bc4ab5866c`
- #170 Production deployment `dpl_DiuYPDViLe25wLjgeEXkpdeozgcg`: READY
- Issue #165: closed completed
- Draft #167/#168: closed superseded by non-Draft #169/#170 due the connected Draft→Ready GraphQL `fullDatabaseId` failure
- generic PR Code Quality remains the default non-Production validation lane
- Auto-Merge + Standing Production Release policies remain authoritative

Review exception note: the user explicitly approved the #167/#168 workstream only to substitute exact-head CI + Vercel Preview + strengthened Lead/self-review + regression tests for independent Verifier/Reviewer. This is not a global policy change and does not authorize Production execution.

## Current P0

Issue #119 — **Data Scale Program**.

Current ordering after this canonical sync:

1. prepare exact R1 read-only re-observation cohort/preflight
2. obtain explicit approval before any live Production-connected provider read
3. execute only the approved R1 scope, then measure provider outcomes and zero DB writes
4. separately request approval for R2 Production re-observation persistence
5. after measured history gain, separately prepare/approve R3 depth read-only and R4 depth persistence
6. use the Scoreboard after each approved rollout
7. pursue licensed completed-sale evidence, with Aucfan currently the strongest identified commercial candidate
8. DATA -> TRAFFIC -> CLICK -> REVENUE

Three active listings is a presentation threshold only, never a collection-completion target.

## Completed current-sequence milestones

- #146 — read-only collection throughput audit: merged
- #147 — scalable market history architecture: merged
- #148 — evidence-backed market signal architecture: merged
- #149 — upcoming forecast truthfulness fail-closed repair: merged
- #150 — safe dry-run re-observation engine: merged
- #153 — hardened exact provider re-observation dry-run: merged
- #156 — hardened dry-run Depth Collector: merged
- #159 — truthful read-only Data Scale Scoreboard: merged
- #162 — current lawful source capability matrix: merged
- #169 — equal-time/null-time re-observation safety hardening: merged
- #170 — Production history/depth rollout plan: merged

## Re-observation foundation after #169

- append-only repeated observation planning
- retry-safe deterministic observation IDs
- exact persisted Rakuten/Yahoo item reads without keyword rediscovery
- credential destinations restricted to reviewed official host/path
- redirects refused
- ordinary states only `active` / `sold_out`; no fabricated `sold`
- positive price + explicit availability required
- older stale observations cannot roll current snapshot backward
- equal timestamp + conflicting price/status fails closed
- equal timestamp + unchanged same-key retry remains deterministic
- null/undefined/blank/whitespace observation time is invalid
- failed provider attempts do not advance `last_observed_at`

Merged code remains dormant with respect to Production persistence until separately approved.

## Depth foundation after #156

- explicit target variant + parent series
- strict P3 matcher/set/ambiguity safety reused unchanged
- many genuinely distinct offers can be retained; no `3 listings = done`
- durable marketplace identity dedupe
- SHA-256 selection binding and post-selection drift checks
- insert-only projected-write contract
- default budget 50 / hard max 200 are safety bounds, not product targets

Production depth persistence/automatic activation remains unapproved.

## Production history/depth rollout plan after #170

Canonical plan: `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`.

### R1 proposed read-only canary — next approval point

Not yet approved/executed.

- 6 known listings
- 3 Rakuten + 3 Yahoo
- serial exact-provider reads
- no keyword fallback
- normal request count <=6
- retry limit <=3 only for reviewed retryable conditions
- worst-case HTTP attempt envelope <=18
- Rakuten pacing >=1200ms / Yahoo >=1000ms
- Production DB writes 0

### R2 proposed Production history persistence

Separate explicit Production DB approval required later.

- 4 known listings
- 2 Rakuten + 2 Yahoo
- expected +4 observations and +4 re-observed listings if baseline still has one observation each
- listing count unchanged
- bounded transaction + exact before/after + post-write reread
- no false `sold`

### R3 proposed depth read-only

Separate live-provider approval required later.

- 2 explicit target variants
- one Rakuten-first + one Yahoo-first
- max 5 accepted each / 10 total
- max 6 planner requests / max 18 HTTP attempts
- 0 DB writes

### R4 proposed depth persistence

Separate Production DB approval required later.

- only frozen strict-safe R3 subset
- <=10 total new listing+initial-observation pairs
- insert-only
- no existing-row updates/deletes

No automatic schedule/budget scaling is authorized by #170.

## Dated Production data evidence

Supabase Production: `vxbrnvfhmzcxehuuzzum`.

Issue #165 read-only baseline at 2026-09-02 01:49 JST:

- series: 10,241
- variants: 23,808
- market listings: 107
- observations: 107
- re-observed listings: 0
- depth: 96 variants ×1, 1 variant ×2, 0 variants ×3+
- completed `sold`: 0
- Scoreboard bottleneck: `history_not_enabled`

Treat these as dated until re-read. The measurable bottleneck remained repeated history.

## Source capability checkpoint

Canonical source contract: `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`.

Current verified posture, dated 2026-09-02:

- Rakuten Ichiba API: `active`
- Yahoo Shopping API / ValueCommerce: `active`
- Bandai / Takara Tomy Arts: active official catalog sources
- Kitan Club: capability exists, auto remains off
- Qualia: conservative/limited, broad/auto rollout unapproved
- Aucfan: `paid_access_required`; best current licensed completed-sale/history candidate, commercial rights/pricing still require diligence
- Mercari C2C: `partnership_required`; no scraping
- Mercari Shops Public API: seller/shop scoped, not broad C2C market intelligence
- X API: `paid_access_required`; recheck current pricing/quota/search before activation
- eBay Browse: lower-priority `planned`; recheck Japan/historical limitations
- Surugaya / Mandarake / AmiAmi broad automation: permission/partnership first
- Gacha Lens outbound clicks: active provider+variant intent evidence, not transactions
- connected GSC Wizard reporting path: unavailable at verification due subscription/payment state, not zero traffic

## Current open work

Re-fetch before acting.

- Issue #119 — Data Scale umbrella: open
- PR #142 / Issue #137 — F0 rerelease canonical-year repair: explicit Production-impact review/approval boundary; do not auto-merge or manually dispatch F0
- Issue #165/#166: completed
- #167/#168: superseded/closed
- next history/depth work begins only after this canonical-sync gate completes

## F0 official automatic incident

Run `33484450472` failed safely on 2026-09-01:

- transaction `not_started`
- DB writes 0 / deletes 0
- blocker `official_bounded_rerelease_canonical_release_mismatch`

PR #142 contains the repair; approval remains required before merge and any manual rerun/dispatch.

## Hard boundaries

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually modify F0 official auto or P3 V2 auto
- Kitan auto remains off; Qualia auto remains unapproved
- no Mercari/Amazon scraping
- do not misuse Mercari Shops seller scope as market-wide access
- do not automate public storefronts without reviewed API/feed/permission
- authorized X/social only
- no matcher weakening for coverage
- no completed/active evidence mixing
- complete sets stay series-level
- no Aucfan/X/GSC-paid/other paid activation without explicit approval

## Exact next step

This canonical-sync PR is the current gate.

After it is exact-head green, merged, and Production READY:

1. re-fetch #119, `main`, open PRs, Production Scoreboard counts and current provider-health evidence
2. freeze the exact R1 six-listing cohort: 3 Rakuten + 3 Yahoo, exact-identity complete, review-safe and due
3. verify the max-18-attempt budget and current official endpoint contract
4. present the exact R1 cohort to the user for explicit live provider-read approval
5. do not execute R1 until approved
6. keep R2/R3/R4 separately approval-gated
7. keep #142 approval-bound

Business bottleneck remains **Data Scale first**.
