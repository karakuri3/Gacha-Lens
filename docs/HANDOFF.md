# Gacha Lens Canonical Handoff

Updated: 2026-09-01 JST

This is the canonical operational handoff for resuming Gacha Lens work in a fresh ChatGPT/Codex task. Do not treat older chat summaries or `docs/CURRENT_STATE.md` as newer than this file without re-verifying live state.

## 1. Resume instruction and evidence boundary

When resuming:

1. Read this file, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AGENT_QUEUE.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Fetch and verify GitHub `origin/main`, open PRs, and worktrees before starting a task.
3. Treat the Git/GitHub development baseline below as verified on 2026-09-01 JST.
4. Treat Production, Vercel, Supabase, and GSC values as dated snapshots until separately re-read through an allowed live-verification path.
5. Do not repeat completed diagnostics or canaries.
6. Continue from the first applicable unchecked item in `docs/TODO.md`, unless newer evidence changes priority.

Repository: `karakuri3/Gacha-Lens`

Preferred local path: `C:\dev\Gacha-Lens`

Production domain: `https://gachalens.com`

Current verified GitHub `main`:

`3e633b1fe591aadd5e02e409104aa0214457c527`

Latest merged PR at refresh:

- PR #120 — `Image foundation: harden fallback and add offline audit`

GitHub state observed during the refresh:

- open PRs: 0
- open Issues: #80, #119, #121
- Agent OS v1: merged in PR #105
- gated autonomous merge policy: merged in PR #107
- standing normal Vercel Production release gate: present on `origin/main`

No live Vercel, Supabase, or GSC read was performed for this documentation-only refresh. Do not infer that the latest Git SHA is deployed or that the dated counts below are still current.

## 2. Product purpose

Gacha Lens is a gachapon market-intelligence site whose customer promise is:

**「欲しいガチャを、見つけて、比べて、逃さない」**

Primary users are collectors / 推し活 users and people who want to know release timing, market prices, high-value variants, availability, and resale/buying opportunities.

Monetization is primarily:

- Amazon Associates
- Rakuten affiliate
- Yahoo Shopping / ValueCommerce
- Google AdSense after traffic/content readiness improves

Do not optimize for infrastructure elegance at the expense of traffic, market-data density, or monetization. The project is past the basic-platform stage.

## 3. Technology and core model

Stack:

- Next.js App Router
- React
- Supabase
- Vercel
- GitHub Actions
- Node.js scripts for ingestion and diagnostics

Core tables/concepts:

- `series`
- `variants`
- `market_listings`
- `market_listing_observations`
- `restock_events`
- `stock_reports`
- `x_reactions`
- `import_issues`
- `outbound_clicks`

Public product behavior is **Series-first for discovery, Variant-first for price evidence**.

Discovery flow:

`browse/search -> series -> lineup -> variant detail`

Variant-first remains appropriate for market evidence, price history, expensive/rising/rare views. Image truthfulness must be preserved; never present an image as variant-specific unless evidence proves it.

## 4. Dated Production and GSC snapshots

The values in this section were last verified during the 2026-08-27 handoff around PR #91. They are historical reference points, not current live assertions. Subsequent approved canaries and scheduled lanes mean several counts are expected to have changed.

Supabase Production project:

`vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)

Last verified historical counts:

| Metric | 2026-08-27 snapshot |
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

There is no `variants.provisional` column. “Provisional” means `variant_type='provisional'`.

The old inactive Supabase project is `ihcudkfspzuixsqsvoku` (`gacha-site-start`). Do not confuse it with Production.

Stable Vercel project identity from the prior handoff:

- team/project context: `karakuri3s-projects/gachalens`
- project ID: `prj_8Yelkn1wM7JGoA2WCMCGGhRt3o8x`

These identifiers are retained for future verification; they do not prove the current deployment state.

Last verified GSC snapshot:

| Sitemap | Submitted | Pending | Warnings | Errors |
| --- | ---: | --- | ---: | ---: |
| `/series-sitemap.xml` | 2,703 | false | 0 | 0 |
| `/variant-sitemap.xml` | 16,173 | false | 0 | 0 |
| `/sitemap.xml` | 19,177 | false | 1 | 0 |

The latest known downloads in that snapshot were 2026-08-26. Re-read GSC before making current indexation claims. Never treat sitemap-summary `indexed=0` as proof that the whole site is unindexed; use URL inspection and performance evidence before pruning.

The last documented deployment evidence was the READY Production deployment after PR #91. Deployment of current `main` and the current aliases require separate live verification.

## 5. Development completed after the old PR #91 baseline

The previous handoff stopped at F3-C1. Git/GitHub evidence now shows these merged development outcomes:

### Complete-set evidence: F3-C1.1 through F3-C3

- PR #93 repaired complete-set diagnostic query context without weakening fail-closed matching.
- PR #94 added read-only readiness and an exact-main, one-series bounded canary path.
- GitHub run `33040022146` completed the read-only diagnostic successfully with `database_writes=0` and four accepted complete-set candidates.
- GitHub run `33041537662` completed readiness successfully with `database_writes=0`.
- GitHub run `33042192598` completed the approved bounded canary; its guarded persistence step for exactly one approved series candidate succeeded.
- PR #95 added truthful series-level complete-set reference presentation.

Complete-set evidence remains series-scoped:

- `listing_type=complete_set`
- `market_review_type=full_set`
- `variant_id=null`
- `matched_variant_id=null`

This lane must remain separate from single-variant prices. The historical 0 complete-set count is no longer a safe current claim, and no automatic or broad complete-set persistence is approved.

### Distinct market evidence: F3-D1 through F3-D3

- PR #96 added the Priority 2 distinct-listing read-only diagnostic.
- PRs #97 and #98 added provider-scoped storefront evidence and safe legacy Rakuten identity recovery; cross-provider merchant equivalence remains unknown.
- PR #99 added a workflow-dispatch-only Priority 2 bounded persistence path.
- GitHub run `33099434093` completed a Priority 2 dry-run with two selected candidates and zero writes.
- GitHub run `33100892547` completed the approved Priority 2 canary with one selected candidate and two database writes: one listing plus one observation.
- PR #100 added the analogous Priority 1 bounded path for moving safe evidence from two to three active listings.
- PR #101 repaired the manual P1 planner's default cooldown after a safe failed dry-run.
- GitHub run `33195641268` completed the repaired P1 dry-run with one selected candidate and zero writes.
- GitHub run `33196152911` completed the approved P1 canary with one selected candidate and two database writes: one listing plus one observation.

These are bounded manual paths, not blanket authorization for additional dispatches or writes. The strict single-item matcher and evidence thresholds remain unchanged.

### User-facing offers and affiliate provenance: F3-E1

- PR #102 added a fail-closed observed-listing comparison for exact variants. It shows safe active direct single-item offers before generic marketplace searches.
- PR #103 preserves already-verified Rakuten/Yahoo affiliate provenance for future P3 V2 inserts. It does not backfill existing rows.
- PR #106 resolves verified affiliate provenance after normalized persisted rows pass through the display layer. Strict host, provider, contract, documentation, and target checks remain authoritative.

Do not infer affiliate provenance, merchant equivalence, completed-sale status, or ranking evidence. Existing historical-row backfills and Yahoo Secret/Variable activation remain separate approval-gated work.

## 6. Automatic lanes observed in GitHub

### F0 official

The bounded automatic official path exists and recent scheduled GitHub runs completed successfully. Do not redesign its semantics or gates during unrelated work. A fresh Production content/count assertion still requires a separate allowed live read.

### P3 V2 market

The scheduled bounded P3 V2 path remains the primary automatic market-data lane. GitHub run `33310192748` completed successfully on 2026-08-30. Keep its planner and strict matcher unchanged unless evidence proves a defect.

### Kitan

Kitan manual canary already succeeded historically. Kitan automatic plumbing is false by default. In scheduled GitHub run `33301787139`, the gate resolution succeeded but all setup, audit, planning, and write steps were skipped; this is not evidence that Kitan auto is enabled or that a Production write occurred.

Do not rerun the manual canary or enable Kitan automatic writes without explicit approval.

### Qualia

The one-series Qualia Production canary already succeeded historically. Qualia remains series-only, insert-only, and conservative; variant writes are prohibited in this phase. Do not rerun the canary or enable automatic rollout without explicit approval.

The historical canary target remains `official:qualia:series:a192bb6aadb74c8703ac13e9` (`https://www.qualia-45.jp/product/view/2024`). Preserve it as an audit reference, not as proof of current live content.

## 7. Market and SEO safety contracts

Approved market sources:

1. Yahoo Shopping API
2. Rakuten Ichiba API
3. approved JSON/CSV feeds

Do not scrape Mercari or Amazon.

Evidence thresholds remain:

- active >= 3 -> `LISTING_GUIDE`
- completed >= 3 -> `REFERENCE`
- completed >= 5 -> `SOLD`

Never mix completed/sold evidence into active asking-price evidence. Do not weaken the strict single-item matcher to increase coverage. Recall V5 increased raw recall but did not improve safe accepted unique coverage; do not promote it into P3 V2 as-is.

SEO observer separation remains:

- `/sitemap.xml`
- `/series-sitemap.xml`
- `/variant-sitemap.xml`

Preserve self-canonical indexable pagination and existing noindex behavior for search/filter combinations. Do not mass-noindex or remove pages without current GSC evidence.

## 8. Agent OS v1 development baseline

Agent OS v1 is now merged and active:

- `AGENTS.md`: mandatory entry point and hard stops
- `docs/AGENT_OS.md`: lifecycle, task contract, roles, worktrees, Done Gate, and queue conventions
- `docs/AGENT_QUEUE.md`: authoritative one-shot selection, duplicate prevention, two-Builder cap, continuation, terminal outcomes, and durable resume
- `docs/AUTO_MERGE_POLICY.md`: authoritative exception for eligible safe, reversible, non-Production PRs
- `docs/PRODUCTION_RELEASE_POLICY.md`: authoritative exception for the normal Vercel Production release triggered by an eligible merge
- `.github/ISSUE_TEMPLATE/agent-task.yml`: task contract
- `.github/pull_request_template.md`: implementation and gate evidence

One task uses one dedicated `codex/` branch and worktree from verified `origin/main`. Ordinary safe failures enter the diagnose/repair/revalidate loop. A PR may be marked ready and merged autonomously only when the complete Auto-Merge Gate passes. Its normal Git-triggered Vercel release may proceed only when the Standing Production Release Gate also passes; otherwise stop at the smallest real approval boundary.

Measured Agent OS experiments #108, #112, #114, and #118 proved the documentation-only run, bounded code run, independent roles, and two disjoint Builders. Queue / Orchestrator v1 is defined by Issue #121 and the merge containing this handoff. The next manual experiment is a fresh session started only with the one-shot instruction in `docs/AGENT_QUEUE.md`.

## 9. Approval and safety boundaries

Always require explicit approval for:

- Production DB writes, migrations, backfills, cleanup, schema operations, or seeds
- GitHub Actions `workflow_dispatch`
- Production deployments, promotions, or gate changes excluded by `docs/PRODUCTION_RELEASE_POLICY.md`
- Repository or service Secrets / Variables changes
- paid operations
- destructive or irreversible actions
- direct pushes to `main`
- any PR merge excluded by `docs/AUTO_MERGE_POLICY.md`
- auth/security-boundary changes or major product decisions

Eligible safe, reversible, non-Production PRs are the narrow merge exception defined by `docs/AUTO_MERGE_POLICY.md`. Only their normal Git-triggered Vercel Production release may use the separate narrow exception in `docs/PRODUCTION_RELEASE_POLICY.md`.

Hard repository rules:

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually modify F0 official auto or P3 V2 auto
- do not enable Kitan or Qualia auto without explicit approval
- do not rerun completed Kitan, Qualia, complete-set, P2, or P1 canaries without a new task-specific approval

## 10. Current resume point

The old “dispatch F3-C1 diagnostic” boundary is complete and must not be repeated.

Before the next Production-connected decision, separately verify:

1. whether current `main` is deployed and READY
2. current Supabase counts and the persisted outcomes of the complete-set, P2, and P1 canaries
3. current observed-listing and affiliate-link behavior after PRs #102, #103, and #106
4. current GSC series/variant/root sitemap and performance state

Do not use this documentation task as authorization for those live reads or any write. Until fresh evidence exists, continue safe non-Production work from `docs/TODO.md`, prioritizing market-evidence density, organic/indexed traffic, affiliate conversion volume, and later AdSense readiness.
