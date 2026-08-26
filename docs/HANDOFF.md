# Gacha Lens Canonical Handoff

Updated: 2026-08-27 JST

This is the canonical operational handoff for resuming Gacha Lens work in a fresh ChatGPT/Codex thread. Do not treat older chat summaries or `docs/CURRENT_STATE.md` as newer than this file without re-verifying live state.

## 1. Resume instruction

When resuming:

1. Read this file, `docs/STATUS.md`, `docs/DECISIONS.md`, and `docs/TODO.md`.
2. Verify GitHub `main`, open PRs, Vercel Production, Supabase Production counts, and GSC sitemaps before making current-state claims.
3. Do not repeat already-completed diagnostics or canaries.
4. Respect all approval boundaries below.
5. Continue from the first unchecked item in `docs/TODO.md`, unless live evidence clearly changes priority.

Repository: `karakuri3/Gacha-Lens`

Preferred local path: `C:\dev\Gacha-Lens`

Production domain: `https://gachalens.com`

Current verified `main` after PR #91 merge:

`b6f702152a5e65c54738390455e4663cdf9c593c`

PR #91 merge title:

`F3-C1: add series complete-set market evidence diagnostic`

## 2. Product purpose

Gacha Lens is a gachapon market-intelligence site whose customer promise is:

**「欲しいガチャを、見つけて、比べて、逃さない」**

Primary users are collectors / 推し活 users and people who want to know release timing, market prices, high-value variants, availability, and resale/buying opportunities.

Monetization is primarily:

- Amazon Associates
- Rakuten affiliate
- Yahoo Shopping / ValueCommerce
- Google AdSense after traffic/content readiness improves

Do not optimize for infrastructure elegance at the expense of traffic, market-data density, or monetization. The project is now past the “build the basic platform” stage.

## 3. Technology and core model

Stack:

- Next.js App Router
- React
- Supabase
- Vercel
- GitHub Actions
- Node.js scripts for ingestion/diagnostics

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

Public product model is **Series-first for discovery, Variant-first for price evidence**.

Discovery flow:

`browse/search -> series -> lineup -> variant detail`

Variant-first remains appropriate for:

- market evidence
- price history
- expensive/rising/rare views

Image truthfulness must be preserved. Do not present an image as variant-specific unless evidence proves it.

## 4. Production snapshot at handoff

Supabase Production project:

`vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)

Verified counts after PR #91 merge:

- series: **10,221**
- variants: **23,708**
- market_listings: **58**
- market_listing_observations: **58**
- restock_events: **0**
- import_issues: **133**
- review_required variants: **7,535**
- provisional variants: **7,535**
- `listing_type='single'`: **58**
- `listing_type='complete_set'`: **0**
- Qualia series in Production: **1**

There is no `variants.provisional` column. “Provisional” means `variant_type='provisional'`.

The old inactive Supabase project is:

`ihcudkfspzuixsqsvoku` (`gacha-site-start`)

Do not confuse it with Production.

## 5. Vercel state

Vercel project:

- team/project context: `karakuri3s-projects/gachalens`
- project ID: `prj_8Yelkn1wM7JGoA2WCMCGGhRt3o8x`

PR #91 merge deployment for `b6f7021...` reached **READY** and is aliased to:

- `gachalens.com`
- `www.gachalens.com`

PR #90 Production was also verified with no recent deployment-specific 5xx/error/fatal issue.

## 6. SEO / GSC state

GSC property:

`sc-domain:gachalens.com`

F3-B1 Series-first Indexation Observability is complete and merged in PR #90.

Current submitted sitemaps:

### `/series-sitemap.xml`

- submitted: **2,703** URLs
- pending: false
- warnings: 0
- errors: 0
- latest known Google download at handoff: 2026-08-26T15:20:40Z

### `/variant-sitemap.xml`

- submitted: **16,173** URLs
- pending: false
- warnings: 0
- errors: 0
- latest known Google download at handoff: 2026-08-26T15:21:03Z

### `/sitemap.xml`

- submitted: **19,177** URLs
- pending: false
- warnings: 1
- errors: 0
- last known download: 2026-08-26T04:46:25Z

Important interpretation rule:

Do **not** treat sitemap-summary `indexed=0` as proof that the whole site is unindexed. Earlier URL-level inspection already showed indexed pages / impressions. Use URL inspection/performance data before pruning.

F3-B1 implementation guarantees:

- existing root sitemap semantics retained
- `/series-sitemap.xml` added at site root
- `/variant-sitemap.xml` added at site root
- robots publishes all three
- series observer includes parents with public non-provisional variants plus safe recent/upcoming series-only rows
- image is not required for safe series-only publication
- 50,000 URL cap is fail-closed, with bounded pagination and overflow detection
- `/series?page=2` and other indexable pagination are self-canonical
- `q` and category-query noindex behavior is retained

A real Qualia series-only page was verified in the Production series sitemap after the pagination repair.

## 7. Official ingestion / manufacturer state

### F0 official bounded auto

Existing automatic official Production workflow is working and should not be redesigned casually.

Known successful scheduled Production execution inserted official data with bounded deltas and no deletes.

Do not change its semantics/gates while working on unrelated phases.

### Kitan

Kitan manual Production canary already succeeded:

- inserted 1 series
- inserted 7 variants
- no unintended writes

Kitan auto plumbing exists, but **Kitan auto ON is not approved**.

Do not rerun the manual canary.

### Qualia

F2-E1 PR #89 is merged.

Read-only readiness audit succeeded.

One-series Production canary succeeded for:

`むぎゅっ鳥® マスコットボールチェーン`

Stable ID:

`official:qualia:series:a192bb6aadb74c8703ac13e9`

Official URL:

`https://www.qualia-45.jp/product/view/2024`

Canary result:

- series +1
- variants +0
- all other protected deltas 0

Qualia series-only rules are intentionally conservative:

- variants are prohibited in this phase
- image may be null if series-scope evidence is not proven
- insert-only contract
- existing-row factual differences become manual-update blockers, not automatic updates

**Qualia auto rollout is not approved.**

## 8. Market data state

Approved market-source policy:

1. Yahoo Shopping API
2. Rakuten Ichiba API
3. approved JSON/CSV feeds

Do not scrape Mercari or Amazon.

Evidence semantics must remain:

- active >= 3 -> `LISTING_GUIDE`
- completed >= 3 -> `REFERENCE`
- completed >= 5 -> `SOLD`

Never mix sold/completed evidence into active asking-price evidence.

### P3 V2 Automatic Production

P3 V2 is the existing Production market-data lane and is working.

It already prioritizes recently released items without market evidence and rotates one variant per series. Do not replace the planner casually.

At handoff, Production contains 58 single listings / observations.

A review of three recent Production P3 runs found the real bottleneck:

- 75 selected variants
- 49 variants (~65%) produced no marketplace candidate
- 61 candidates were returned across the runs
- 31 were rejected primarily as `not_single_item` (often genuine full/complete sets)
- existing strict single matcher successfully accepted genuine single-item evidence

Therefore **do not weaken the single matcher** to increase coverage.

### Recall V5 diagnostic decision

A Production read-only Recall V5 diagnostic already ran successfully.

It increased “variants with any search result” from roughly 4 to 8 in the sample, but safe accepted unique variants stayed at 3. V5-only candidates were noisy and produced no additional safe accepted variants, with truncation pressure.

Decision: **do not promote Recall V5 into Production P3 just because it finds more results.**

## 9. F3-C1 Series Complete-Set Market Evidence

PR #91 is merged into `main`.

Purpose:

Take genuine marketplace full-set listings that the single-item matcher correctly rejects as `not_single_item`, and evaluate them in a **separate series-level lane** without contaminating variant prices.

Important: **F3-C1 currently provides classifier + read-only diagnostic only. There is no Production complete-set persistence yet.**

Production `complete_set` listing count at handoff: **0**.

Classifier safety contract includes:

- independent from existing single matcher
- parent series must exist
- at least 2 formal non-provisional variants
- allowed providers only (Rakuten / Yahoo planner APIs)
- positive finite price
- preorder rejected
- strong complete-set signal required
- explicit set count must equal formal lineup count
- generic `セット`, `まとめ`, partial subsets are not complete-set evidence
- duplicate exact parent-series names in catalog fail closed (`parent_series_catalog_identity_ambiguous`)
- complete-set words are removed only for parent identity analysis so they are not misread as edition tails
- real edition markers such as `Vol.2` still fail closed
- `全種のうち1種`, `全種から1種`, `全種類のうち1種類`, random-one, `単品`, `バラ売り` fail closed
- accepted complete-set contract is series-level:
  - `listing_type=complete_set`
  - `market_review_type=full_set`
  - `variant_id=null`
  - `matched_variant_id=null`

Workflow added:

`Gacha Market Series Complete-Set Read-Only Diagnostic`

It is:

- `workflow_dispatch` only
- bounded (Priority 3 / max 25 / one variant per series)
- planner API read-only
- Production DB write 0
- zero-delta count verification
- sanitized artifact output

### Critical next boundary

**The F3-C1 read-only diagnostic has NOT been dispatched yet.**

The next operational step requires explicit workflow-dispatch approval.

Do not interpret PR #91 merge as approval to dispatch it.

If the user explicitly approves, dispatch only the read-only diagnostic, then inspect:

- workflow conclusion
- sanitized JSON/Markdown artifact
- selected count
- raw candidate count
- existing `not_single_item` count
- complete-set evaluated count
- accepted complete-set count
- unique accepted series
- reject-reason counts
- DB before/after counts proving zero writes

Only after that evidence should a later phase consider bounded persistence or UI display.

## 10. Monetization state and priority

Affiliate plumbing already exists; lack of monetization is primarily a traffic/data-density problem, not a missing CTA problem.

Known affiliate integrations include Amazon, Rakuten, and Yahoo/ValueCommerce.

Amazon Associates tag:

`gachalens-22`

AdSense publisher known in project state:

`pub-4545829296798690`

AdSense was previously “not ready”; exact current reason should be rechecked before acting.

Priority is:

1. indexation observability (already installed; gather data)
2. increase useful market evidence density
3. use GSC evidence for selective SEO pruning rather than mass noindex
4. increase organic traffic and affiliate clicks/sales
5. revisit AdSense when content/traffic are stronger

Do not spend long phases polishing infrastructure that does not move these metrics.

## 11. Approval and safety boundaries

Always preserve these boundaries:

- Production DB write: explicit user approval
- workflow dispatch: explicit user approval
- migration: explicit user approval
- cleanup/delete: explicit user approval
- Production merge: explicit user approval
- Repository Variable/Secret changes: explicit user approval
- Production gate changes: explicit user approval

Hard repository rules:

- never touch `supabase/.temp/cli-latest`
- `.github/workflows/gacha-ingestion.yml` remains `disabled_manually`
- do not casually modify existing F0 official auto
- do not casually modify existing P3 V2 auto
- do not enable Kitan auto without explicit approval
- do not enable Qualia auto without explicit approval
- do not rerun already-completed manual Kitan/Qualia canaries

Read-only investigation is allowed.

## 12. Codex / ChatGPT working style

Development operating model:

- ChatGPT = product/requirements/prioritization/review
- Codex = repository inspection, implementation, tests, lint/build, self-repair, Git branch/commit/push/Draft PR
- prefer one outcome/phase per Codex instruction, not tiny edits
- when Codex finishes, review the actual latest PR/diff independently
- do not restart a partially completed Codex task from scratch; inspect existing worktree/branch first

Model-cost discipline is important:

- normal work: Terra / Medium / Standard
- light narrow repair: Luna / Low-Medium or Medium / Standard
- Sol / High only for genuinely hard/ambiguous/safety-critical design
- do not burn Codex quota on work that can be verified/read directly with connected tools

Do not tell the user to wait when another non-overlapping revenue-relevant task can be advanced.

## 13. Completed milestones that should not be reopened without evidence

- Production safety/gating architecture
- F0 official automatic bounded path
- Kitan manual canary
- Qualia read-only audit + one-series Production canary
- Series-first discovery UX (PR #87)
- F3-B1 independent series/variant sitemap observability (PR #90)
- F3-C1 complete-set read-only classifier/diagnostic plumbing (PR #91)
- strict single-item market matcher semantics

These can be improved later if live evidence shows a defect, but they are not the current bottleneck.

## 14. Immediate resume point

The immediate next task is **not another Codex implementation**.

It is the approval boundary for running the newly merged F3-C1 read-only diagnostic.

Expected conversation:

1. Confirm `main`, Production deploy, and workflow still match this handoff.
2. Explain that dispatch is read-only but still requires explicit approval.
3. If user approves, run/guide dispatch of `Gacha Market Series Complete-Set Read-Only Diagnostic` only.
4. Inspect artifact and zero-write proof.
5. Decide from evidence whether F3-C2 should be bounded persistence, classifier repair, or abandonment.
6. Continue monitoring GSC series/variant sitemap performance in parallel; do not stop other revenue-relevant work while GSC data accumulates.

See `docs/TODO.md` for ordered tasks and `docs/DECISIONS.md` for durable decisions.