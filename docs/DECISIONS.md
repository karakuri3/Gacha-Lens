# Gacha Lens Durable Decisions

Updated: 2026-08-30 JST

This file records decisions that should survive thread changes. Reopen them only when new evidence justifies it.

## Product and UX

### D-001 — Series-first discovery

Public discovery is series-first:

`search/browse -> series -> lineup -> variant detail`

Variant-first remains appropriate for price evidence, price history, expensive/rising/rare views.

Do not revert the whole site to variant-first discovery without strong user/traffic evidence.

### D-002 — Image truthfulness

Do not show an image as variant-specific unless evidence proves variant scope.

Series-level images may be composite/representative/unknown. Missing image is preferable to false certainty.

## Market evidence

### D-010 — Approved marketplace sources

Primary approved programmatic sources:

1. Yahoo Shopping API
2. Rakuten Ichiba API
3. approved JSON/CSV feed

Do not introduce Mercari scraping or Amazon scraping.

### D-011 — Evidence semantics

Keep evidence types separated:

- active >= 3 -> `LISTING_GUIDE`
- completed >= 3 -> `REFERENCE`
- completed >= 5 -> `SOLD`

Never mix completed/sold evidence with active asking-price evidence.

### D-012 — Single-item matcher stays strict

Do not loosen the existing single-item matcher just to increase market coverage.

Production evidence showed that many rejected marketplace results are genuine complete/full sets, not missed single items.

### D-013 — Recall V5 is not a Production upgrade

Recall V5 increased raw search recall in diagnostic sampling but did not increase safe accepted unique variants and produced substantial noise/truncation pressure.

Do not promote it into P3 V2 merely because it returns more candidates.

### D-014 — Complete sets are series-level evidence

Genuine complete/full sets must not contaminate variant prices.

When accepted:

- `listing_type=complete_set`
- `market_review_type=full_set`
- `series_id=target parent`
- `variant_id=null`
- `matched_variant_id=null`

F3-C1 began as diagnostic-only. The later approved F3-C2 bounded canary persisted exactly one series-level candidate, and F3-C3 added a truthful series-level reference presentation. This does not authorize automatic or broad complete-set persistence; every further Production dispatch/write remains separately approval-gated.

### D-015 — Complete-set classifier is fail closed

Reject when any of the following applies:

- target parent missing
- fewer than 2 formal non-provisional variants
- unsupported marketplace source
- non-positive/invalid price
- preorder
- parent identity missing/conflicting
- duplicate exact parent-series identity in catalog
- explicit complete count differs from formal lineup count
- generic/partial set without proof of completeness
- random one-of-all / one-of-N language
- single-item or バラ売り language

Complete-set wording may be removed only for identity-tail analysis; genuine edition evidence such as `Vol.2` must remain visible and block the match.

## Official ingestion

### D-020 — Production official writes remain bounded/gated

Do not bypass read-only readiness / bounded write / verification patterns.

### D-021 — Kitan auto remains off

Manual Kitan Production canary already succeeded. Do not rerun it and do not enable Kitan auto without explicit approval.

### D-022 — Qualia remains series-only until separately expanded

Qualia F2-E1 permits safe series metadata insertion only.

- variant writes prohibited
- image may be null
- insert-only
- factual differences on existing rows become manual-update blockers

One-series Production canary already succeeded. Qualia auto remains unapproved.

## SEO

### D-030 — Preserve observer separation

Keep:

- `/sitemap.xml`
- `/series-sitemap.xml`
- `/variant-sitemap.xml`

The root sitemap remains as baseline while series/variant observer sitemaps enable separate GSC measurement.

### D-031 — No mass SEO pruning without evidence

Do not mass-noindex or delete thousands of pages based on intuition or sitemap summary alone.

Use GSC URL/performance evidence first. F3-B2 is evidence-based pruning, not blanket pruning.

### D-032 — Pagination is self-canonical

Indexable page 2+ URLs must canonicalize to themselves, not page 1.

Keep existing noindex behavior for search-query (`q`) and category-query combinations intended to avoid filter-index explosion.

## Automation and safety

### D-040 — Explicit approval boundaries

Require explicit approval for:

- Production DB writes
- workflow dispatches
- migrations
- cleanup/deletes
- Production deployments, promotions, and gate changes
- Repository Variables/Secrets
- merges excluded by `docs/AUTO_MERGE_POLICY.md`

Read-only investigation is allowed.

Safe, reversible, non-Production PRs are the narrow exception: they may be marked ready and merged autonomously only when every Auto-Merge Gate item passes. Direct pushes to `main` remain prohibited.

### D-041 — Hard repository constraints

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` `disabled_manually`
- do not casually modify F0 official auto
- do not casually modify P3 V2 auto

## Development workflow

### D-050 — One outcome/phase per Codex instruction

ChatGPT owns product direction, requirements, prioritization, approval boundaries, and independent review.

Codex owns repository inspection, implementation, tests, lint/build, self-repair, branch/commit/push/Draft PR.

Avoid tiny back-and-forth prompts when one bounded phase can be completed end-to-end.

### D-051 — Preserve partially completed Codex work

If Codex is interrupted by quota/session limits, inspect existing worktree/branch and continue. Do not restart from scratch.

### D-052 — Conserve Codex quota

Default choices:

- normal development: Terra / Medium / Standard
- narrow/light repair: Luna / Low-Medium or Medium / Standard
- Sol / High only for genuinely difficult, ambiguous, or safety-critical design

Do not spend Codex quota on live-state reads that connected tools can perform directly.

### D-053 — Agent OS v1 governs autonomous non-Production development

Gacha Lens uses `AGENTS.md` and `docs/AGENT_OS.md` as the operating contract for bounded Agent work.

- one task uses one dedicated branch/worktree
- safe implementation failures enter an autonomous diagnose/repair/revalidate loop
- a Lead integrates work and applies the Agent Done Gate
- Scout, Builder, Verifier, and Reviewer responsibilities remain explicit
- GitHub Issues hold task contracts and Draft PRs hold validation/review evidence
- repository-specific approval boundaries override general autonomy

Agent OS does not authorize Production writes/deploys/migrations, workflow dispatches, Secrets / Variables changes, destructive cleanup, paid operations, direct `main` pushes, or ineligible merges. Eligible safe, reversible, non-Production PRs may use the explicit gated exception in `docs/AUTO_MERGE_POLICY.md`.

## Business priority

### D-060 — Revenue-relevant work outranks more infrastructure

The major platform foundation is built.

Prioritize:

1. useful market-data density
2. indexation/organic traffic
3. affiliate click/sale volume
4. AdSense readiness later

Do not keep expanding ingestion manufacturers, safety framework, or architecture indefinitely when the current bottleneck is traffic/data density.
