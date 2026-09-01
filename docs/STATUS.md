# Gacha Lens Status

Updated: 2026-09-01 JST

This is the compact live-state companion to `docs/HANDOFF.md`. “Current” below means verified Git/GitHub development state unless a dated Production/GSC snapshot is explicitly named.

## Repository

- repo: `karakuri3/Gacha-Lens`
- current verified `origin/main` before Queue v1 work: `3e633b1fe591aadd5e02e409104aa0214457c527`
- latest merged PR before Queue v1 work: #120 `Image foundation: harden fallback and add offline audit`
- open PRs at refresh: 0
- open Issues at refresh: #80, #119, #121
- Agent OS v1: merged via PR #105
- gated autonomous merge policy: merged via PR #107
- standing normal Vercel Production release gate: present on `origin/main`

## Evidence boundary

This documentation refresh used read-only Git and GitHub evidence. It did not read Vercel, Supabase Production, or GSC live state.

Therefore:

- current `main` deployment/alias state: requires separate live verification
- current Production row counts: requires separate live verification
- current GSC sitemap/performance state: requires separate live verification

The previous Production/GSC values below are dated 2026-08-27 snapshots and must not be presented as current.

## Last verified Production snapshot — 2026-08-27

Supabase Production project: `vxbrnvfhmzcxehuuzzum`

| Metric | Historical count |
| --- | ---: |
| series | 10,221 |
| variants | 23,708 |
| market_listings | 58 |
| market_listing_observations | 58 |
| restock_events | 0 |
| import_issues | 133 |
| review-required variants | 7,535 |
| provisional variants | 7,535 |
| single listings | 58 |
| complete-set listings | 0 |
| Qualia series | 1 |

Approved canaries and scheduled lanes ran after this snapshot, so the table is intentionally not called current.

## Last verified GSC snapshot — 2026-08-27

Property: `sc-domain:gachalens.com`

| Sitemap | Submitted | Pending | Warnings | Errors |
| --- | ---: | --- | ---: | ---: |
| `/series-sitemap.xml` | 2,703 | false | 0 | 0 |
| `/variant-sitemap.xml` | 16,173 | false | 0 | 0 |
| `/sitemap.xml` | 19,177 | false | 1 | 0 |

Do not interpret sitemap-summary `indexed=0` as whole-site unindexed without URL/performance evidence.

## Completed development phases

- F3-A Series-first discovery UX
- F2-E1 Qualia series-only plumbing
- F3-B1 series/variant sitemap observability
- F3-C1 complete-set classifier and read-only diagnostic
- F3-C1.1 query-context repair
- F3-C2 exact-main readiness and one-series bounded canary plumbing
- F3-C3 truthful series-level complete-set reference UI
- F3-D1B Priority 2 distinct-evidence diagnostic
- F3-D1C/D1D provider-scoped storefront evidence and safe legacy recovery
- F3-D2 bounded Priority 2 manual persistence
- F3-D3 bounded Priority 1 manual persistence and cooldown hotfix
- F3-E1A observed marketplace listing comparison
- F3-E1B1 future P3 affiliate-provenance persistence
- F3-E1B2 normalized persisted-provenance display repair
- Agent OS v1 and gated autonomous merge policy
- Agent OS experiments #108, #112, #114, and #118, including independent verification/review and two disjoint Builders
- Queue / Orchestrator v1 operating policy and offline deterministic planner (#121; completed by the merge containing this document)

## Completed GitHub operational evidence

The following are historical GitHub Actions results, not fresh database reads:

- complete-set diagnostic run `33040022146`: success, zero writes, four accepted candidates
- complete-set readiness run `33041537662`: success, zero writes
- complete-set canary run `33042192598`: success, guarded one-candidate persistence step completed
- P2 dry-run `33099434093`: success, two candidates, zero writes
- P2 canary `33100892547`: success, one candidate, one listing plus one observation written
- P1 initial dry-run `33193441127`: failed safely on the inherited cooldown contract; PR #101 repaired it
- P1 repaired dry-run `33195641268`: success, one candidate, zero writes
- P1 canary `33196152911`: success, one candidate, one listing plus one observation written

Do not rerun these canaries without a new explicit task-specific approval.

## Automatic lanes

### F0 official

- bounded automatic path exists
- recent scheduled GitHub runs completed successfully
- current Production content/count effects require separate live verification

### P3 V2 market

- primary scheduled market lane remains active in GitHub
- run `33310192748` completed successfully on 2026-08-30
- strict single-item matcher and planner remain unchanged

### Kitan

- historical manual canary succeeded
- automatic gate remains false by default
- run `33301787139` resolved the false gate and skipped audit/planning/write steps

### Qualia

- historical one-series canary succeeded
- series-only boundary remains
- automatic rollout remains unapproved

## Market presentation and monetization

- exact-variant observed listings may be shown only when active, review-free, direct-single, safe-host, and exact-target checks pass
- complete-set reference remains series-level and separate from variant prices
- future validated P3 Rakuten/Yahoo rows may retain allowlisted affiliate provenance
- normalized persisted provenance is readable by the display layer after PR #106
- historical backfills and Yahoo Secret/Variable activation remain separate approval-gated work

## Current next boundary

Do not repeat the old F3-C1 diagnostic/canary sequence. Before any new Production-connected action, perform a separately allowed live verification of deployment, database counts/canary rows, affiliate rendering, and GSC state. For ordinary development, a fresh session may use the one-shot entry in `docs/AGENT_QUEUE.md`; it still follows `docs/TODO.md` and every existing safety boundary.

## Current business bottlenecks

1. useful market-evidence density
2. organic/indexed traffic growth
3. affiliate conversion volume
4. later AdSense readiness

Avoid broad infrastructure expansion unless it directly supports these outcomes.
