# Gacha Lens Status

Updated: 2026-09-01 JST

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live GitHub state before acting; Production/Supabase/GSC values are dated unless explicitly re-read.

## Repository

- repo: `karakuri3/Gacha-Lens`
- verified `main` at this checkpoint: `be4da14b1e01a241b15e71ef1c7863032cb2493f`
- latest merged PR: #141 `Agent OS: add generic non-Production PR test/lint CI`
- PR #141 normal Vercel Production deployment: success
- generic PR validation now runs full `npm test`, `npm run lint`, and `git diff --check` for PRs targeting `main`
- Agent OS v1 / Auto-Merge / Standing Production Release policies remain authoritative

## Current P0

Issue #119 — **Data Scale Program**.

Goal: build comprehensive lawful market/signal coverage over time, not stop at an arbitrary three-listing threshold.

Priority order:

1. repeated observations / price-history depth
2. multiple distinct listings per variant
3. scalable source/provider architecture
4. stock/restock/non-price signal coverage
5. explainable demand/expectation signals and authorized X/social access
6. DATA -> TRAFFIC -> CLICK -> REVENUE measurement

Three active listings remain a presentation threshold only.

## Dated Production scale evidence — Issue #119, 2026-09-01 JST

Supabase Production project: `vxbrnvfhmzcxehuuzzum`

| Metric | Snapshot |
| --- | ---: |
| series | 10,241 |
| variants | 23,808 |
| market listings | 96 |
| market listing observations | 96 |
| active safe single listings | 95 |
| Yahoo / Rakuten | 51 / 45 |
| listings with 2+ observations | 0 |
| completed/sold evidence | 0 |
| fresh variants with 1 / 2 / 3+ listings | 85 / 1 / 0 |

These are dated Issue #119 evidence, not a perpetual live assertion.

## Open implementation queue at this checkpoint

Re-fetch before acting.

- #122 — Agent Queue bounded orchestrator; separate safety/Agent-OS work
- #131 — dry-run re-observation engine
- #132 — dry-run multi-listing depth collector
- #133 — evidence-backed upcoming forecast truthfulness
- #134 — read-only Data Scale Scoreboard
- #136 — stacked exact Rakuten/Yahoo provider re-observation dry-run
- #142 — F0 rerelease canonical-year repair; current Production-affecting approval boundary

Closed replacement PRs from connector Draft→Ready workaround:

- #138 replaced by #142, unmerged
- #140 replaced by merged #141, unmerged

## F0 official automatic incident

Run `33484450472` on 2026-09-01 failed safely.

- audit: `OFFICIAL_READ_ONLY_PLAN_READY`
- formal lineups: 4
- proposed new series / variants: 4 / 19
- proposed restock event: 1
- Production transaction: `not_started`
- database writes: 0
- deletes: 0
- blocker: `official_bounded_rerelease_canonical_release_mismatch`

Root cause: month-precision rerelease original year (`2020年10月`) was retained at candidate level but lost when restock-event generation reinterpreted the same resolved fetch record as persisted catalog state. The downstream guard correctly blocked the run.

Issue #137 / PR #142 contain the repair.

PR #142 exact head at this checkpoint:

`9e901e012e3a5dc776250ccc72923830aed6b1de`

Validation:

- full `npm test`: PASS
- lint: PASS
- `git diff --check`: PASS
- Vercel Preview: PASS
- Production actions by PR: 0
- workflow/schedule changes: 0
- safety guard weakening: 0

Do **not** merge PR #142 or manually rerun/dispatch F0 merely because these checks pass. Merging changes code used by the scheduled Production-capable F0 lane. Independent collection-semantics review and the required explicit approval remain outstanding at this checkpoint.

Connected attempts to register GitHub Copilot as reviewer did not persist a requested reviewer; the Vercel Agent review page required interactive login. Do not claim independent review has passed.

## Automatic lanes

### F0 official

- latest investigated schedule: failed safely as above
- fix pending PR #142 review/approval
- zero writes occurred in the failed run

### P3 V2 market

- scheduled breadth-seeding lane remains active
- run `33488346438` succeeded on 2026-09-01
- strict matcher/provenance unchanged

### Kitan

- historical manual canary succeeded
- automatic gate remains false by default unless newer evidence proves otherwise
- workflow run `33484658907` succeeded on 2026-09-01
- do not enable writes or rerun manual canary without approval

### Qualia

- historical one-series canary succeeded
- series-only / insert-only boundary remains
- automatic rollout remains unapproved

## Existing product/safety contracts

- Series-first discovery; Variant-first market evidence
- image truthfulness is mandatory
- complete sets remain series-level evidence, separate from variant prices
- strict single-item matcher stays strict
- Yahoo/Rakuten/approved feeds are current allowed marketplace programmatic sources
- no Mercari or Amazon scraping
- Mercari remains strategic `partnership_required`
- X/social requires authorized access
- active >= 3 / completed >= 3 / completed >= 5 remain evidence-presentation thresholds, not Data Scale completion targets

## GSC

The previous documented GSC snapshot is dated 2026-08-27. Re-read before current indexation/performance claims. Preserve separate root/series/variant sitemaps and do not mass-prune from sitemap-summary intuition alone.

## Current boundary

Before doing more major implementation:

1. keep canonical docs synchronized via Issue #143
2. leave PR #142 at independent-review + explicit Production-impact approval boundary
3. continue safe non-Production verification/integration work on Data Scale PRs under #119
4. prefer completing existing PRs over duplicating them
5. after the next major Production/recovery/release milestone, update the canonical four files before moving on

Business bottleneck: **Data Scale first**, then traffic, clicks/conversion, and revenue.
