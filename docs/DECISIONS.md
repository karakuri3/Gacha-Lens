# Gacha Lens Durable Decisions

Updated: 2026-09-02 JST — post-PR #162 checkpoint

This file records decisions that must survive thread changes. Reopen them only when new evidence justifies it.

## Product / UX

### D-001 — Series-first discovery

Public discovery remains:

`search/browse -> series -> lineup -> variant detail`

Variant-first remains appropriate for price evidence/history and expensive/rising/rare views.

### D-002 — Image truthfulness

Do not show an image as variant-specific unless evidence proves variant scope. Missing/series-level imagery is preferable to false certainty.

## Market evidence

### D-010 — Approved marketplace programmatic sources

Current approved primary market-programmatic sources remain:

1. Yahoo Shopping API
2. Rakuten Ichiba API
3. explicitly approved JSON/CSV feeds

Do not scrape Mercari or Amazon.

### D-011 — Evidence semantics stay separated

Presentation thresholds:

- active >= 3 -> `LISTING_GUIDE`
- completed >= 3 -> `REFERENCE`
- completed >= 5 -> `SOLD`

These are display/evidence thresholds, not Data Scale completion targets.

Never mix completed/sold evidence with active asking-price evidence.

### D-012 — Single-item matcher stays strict

Do not weaken the matcher merely to increase coverage. Genuine complete/full sets and ambiguous candidates must not leak into variant prices.

### D-013 — Recall V5 is not a Production upgrade

Higher raw recall without higher safe accepted unique coverage does not justify promoting Recall V5 into P3 V2.

### D-014 — Complete sets are series-level evidence

Accepted complete/full sets use series scope and must not contaminate variant prices:

- `listing_type=complete_set`
- `market_review_type=full_set`
- `series_id=parent`
- `variant_id=null`
- `matched_variant_id=null`

Broad automatic complete-set persistence remains unapproved.

### D-015 — Complete-set classification fails closed

Reject incomplete/ambiguous identity, unsupported source, invalid price, preorder, parent conflict, duplicate identity, count mismatch, generic partial set, random one-of-N wording, or single-item/バラ売り evidence.

### D-016 — Re-observation is append-only, identity-stable, and fail closed

PR #150 / Issue #128 defines the durable re-observation contract:

- listing identity and matching provenance are immutable in ordinary re-observation
- every successful later check may create a new observation even when price/status are unchanged
- observation identity is deterministic and retry-safe for the same listing/provider/logical bucket
- only ordinary current states `active` / `sold_out` are allowed in this lane
- disappearance/provider failure must never fabricate completed `sold`
- positive integer price is required
- provider availability must be explicit
- fetched provider identity mismatch fails closed
- stale observations must not roll the current snapshot backward
- Production persistence remains separately approval-gated

### D-017 — Provider credentials may only be sent to reviewed official endpoints

Implemented for exact Rakuten/Yahoo re-observation in PR #153 and applicable to future equivalent adapters.

Required behavior:

- credential-bearing requests only to reviewed official HTTPS host + exact path / equivalently strict allowlist
- arbitrary custom HTTPS hosts fail closed
- HTTP, embedded URL credentials, pre-supplied query strings, and fragments fail closed
- redirects must not expand credential scope; current exact-read requests use `redirect: error`
- persisted durable listing identity validates before provider request
- testability uses injected fetch/fixtures, not destination-validation weakening

### D-018 — Merged dry-run/provider-read code does not authorize Production-connected execution

PRs #150 and #153 establish reusable code contracts only. They do **not** authorize live Production-connected provider reads, Production observation INSERTs/listing UPDATEs, new/material workflow/schedule activation, `workflow_dispatch`, Secrets/Variables changes, or paid entitlement activation.

### D-019 — Depth Collector is multi-offer, identity-driven, and dry-run first

PR #156 / Issue #129 defines the durable Depth Collector contract:

- explicit variant + parent-series target
- reuse strict P3 single-item/matcher/set/ambiguity safety
- many distinct legitimate offers may be retained; never encode `3 listings = done`
- price/title similarity is not listing identity
- dedupe by durable listing ID, provider/native source identity, and canonical URL
- ambiguous duplicate candidate keys fail closed
- preserve legitimate same-provider and cross-provider distinct offers
- verified affiliate provenance only through the reviewed sanitizer
- SHA-256-bound selection integrity
- post-selection target/URL/price/title/identity/evidence drift fails closed
- re-run strict market safety before row generation
- projected writes remain insert-only/count-bound
- default budget 50 / hard max 200 are safety bounds, not completion targets
- Production persistence/workflow/schedule activation remains separately approval-gated

### D-020 — Production official writes remain bounded/gated

Keep read-only readiness, bounded write, verification, canonical consistency, and fail-closed safety patterns. Do not bypass them to make a scheduled run succeed.

### D-021 — Kitan auto remains off

The manual canary already succeeded. Do not rerun it or enable automatic writes without explicit approval.

### D-022 — Qualia remains conservative/limited until separately expanded

Current boundary remains conservative official metadata/lineup handling. Broad variant writes and automatic rollout remain unapproved.

### D-023 — Lawful source capability states are explicit and scope-specific

PR #162 / Issue #123 and `docs/DATA_SOURCE_CAPABILITY_MATRIX.md` define the durable source-access contract.

Rules:

- capability state vocabulary remains `active`, `planned`, `partnership_required`, `paid_access_required`, `manual_only`, `unavailable`
- state applies to the **stated capability/scope**, not the provider brand globally
- a seller/admin API does not imply broad marketplace intelligence access
- public pages do not imply permission for automated collection
- absence of a verified public API does not imply a provider can never license data; use partnership/licensing posture when appropriate
- paid/commercial access does not become authorized merely because pricing or documentation is public
- provider prices, quotas, supported markets, product tiers and licensing terms are dated facts and must be rechecked immediately before activation/implementation/purchase/commitment
- source research never overrides Production, paid, credential, workflow or contractual approval gates

Current durable posture from the 2026-09-02 verification:

- Rakuten Ichiba API: `active` for the reviewed market capability
- Yahoo Shopping API / ValueCommerce: `active` for the reviewed market capability
- Aucfan API/MCP: `paid_access_required`; strongest identified licensed candidate for completed-sale/history, pending commercial/data-rights diligence
- Yahoo Auctions broad public market-history API: `unavailable` through the reviewed current public path
- Mercari C2C broad market data: `partnership_required`; no scraping
- Mercari Shops seller API exists, but broad C2C market-intelligence capability is `unavailable` through that seller-scoped path
- X API: `paid_access_required`; authorized paid path only
- eBay Browse: lower-priority `planned`; current Japan/historical constraints must be rechecked before implementation
- broad Surugaya/Mandarake/AmiAmi automation requires an explicit API/feed/permission/partnership path before implementation
- current connected GSC Wizard reporting path was `unavailable` at verification due subscription/payment state; unavailable reporting is not zero traffic and is not a claim that Search Console itself is unavailable

### D-024 — Use existing Rakuten/Yahoo depth/history capability before provider-count expansion

At the #159 Production checkpoint, 107 listings had 107 observations and zero listings with 2+ observations. Therefore the near-term DATA multiplier is to safely activate repeated observation/depth on already-reviewed Rakuten/Yahoo paths before prioritizing another general live-listing provider.

This is a priority decision, **not Production authorization**. Any live provider-read canary, DB persistence, workflow/schedule activation, Secrets/Variables change, or `workflow_dispatch` still requires its own approval where applicable.

Aucfan diligence remains strategically important because completed-sale/history is a different evidence family that Rakuten/Yahoo do not currently provide.

## SEO

### D-030 — Preserve observer separation

Keep separate root/series/variant sitemap observers:

- `/sitemap.xml`
- `/series-sitemap.xml`
- `/variant-sitemap.xml`

### D-031 — No mass SEO pruning without evidence

Do not mass-noindex/delete pages from intuition or sitemap summaries. Use current GSC URL/performance evidence first.

### D-032 — Pagination is self-canonical

Indexable page 2+ URLs canonicalize to themselves. Preserve intended noindex behavior for search/filter combinations that prevent index explosion.

## Automation / safety

### D-040 — Explicit approval boundaries

Explicit approval remains required for actions excluded by the standing policies, including:

- Production DB writes/migrations/backfills/cleanup/schema/seed/reset
- live Production-connected provider execution when approval-bound
- GitHub Actions `workflow_dispatch`
- Secrets / Variables changes
- paid actions / API credits / subscriptions
- contractual commitments or marketplace data agreements
- destructive/irreversible actions
- direct `main` pushes
- new/materially changed Production-capable workflow/schedule/cron/automatic ingestion
- ineligible Production releases/promotions/gate changes
- ineligible merges
- major unresolved product/security decisions

Eligible safe/reversible PRs may use `docs/AUTO_MERGE_POLICY.md`; normal Git-triggered Vercel release separately requires `docs/PRODUCTION_RELEASE_POLICY.md`.

### D-041 — Hard repository constraints

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually modify F0 official auto or P3 V2 auto
- do not enable Kitan/Qualia auto without approval
- do not rerun completed Production canaries without a new task-specific approval

## Development workflow

### D-050 — One bounded outcome/phase per Codex instruction

ChatGPT owns direction, requirements, prioritization, approval boundaries, and review. Codex owns repository inspection, implementation, tests, lint/build, repair, branch/commit/PR work when Codex is available.

### D-051 — Preserve partially completed work

If Codex/session quota interrupts work, inspect the existing branch/worktree/PR and continue. Do not restart from scratch.

### D-052 — Conserve Codex quota

Use connected tools for live state reads when available. Reserve higher reasoning/coding capacity for difficult implementation or safety-critical design.

### D-053 — Agent OS v1 governs bounded autonomous development

`AGENTS.md` and `docs/AGENT_OS.md` remain authoritative. Dedicated task branches/worktrees, explicit roles, durable Issue/PR evidence, Done Gate, and repository safety boundaries remain required.

### D-054 — Queue / Orchestrator v1 is bounded and resumable

`docs/AGENT_QUEUE.md` governs one-shot queue selection. Resume durable claims before duplicates, allow at most two disjoint Builders, and persist state in GitHub/repository records rather than chat memory. Queue position never grants Production authority.

### D-055 — Canonical sync is a phase gate

After a major Production/recovery/security/release milestone:

1. update `docs/HANDOFF.md`
2. update `docs/STATUS.md`
3. update `docs/DECISIONS.md` when durable rules changed
4. update `docs/TODO.md`
5. validate/merge the docs-only canonical sync before starting the next major implementation phase

Do not rely on chat-limit detection. This gate applies even when the user says 「続けて」.

### D-056 — PR #156 review substitution was one-task-only

The user explicitly approved PR #156 only to proceed with exact-head independent CI + strengthened Lead self-review + targeted regression tests when Copilot Code Review was unavailable. This does not amend standing review/merge/release policies for future tasks.

### D-057 — Scoreboard truthfulness and evidence-source separation are durable contracts

PR #159 / Issue #126 defines the read-only Data Scale Scoreboard contract:

- evaluate progress through `DATA -> TRAFFIC -> CLICK -> REVENUE`
- preserve `available`, `unavailable`, `not_instrumented`
- keep source capability vocabulary separate
- only actual `status=sold` is completed-sale evidence
- review-required stock/restock/social rows are excluded
- outbound click evidence remains provider+variant scoped unless stronger instrumentation exists
- Production DB ingestion-run and GitHub workflow-run evidence remain separate
- missing evidence fails closed rather than becoming zero
- Scoreboard does not authorize Production collection/persistence

## Business priority

### D-060 — Revenue-relevant work outranks infrastructure for its own sake

Prioritize useful data density, organic traffic, affiliate clicks/sales, then AdSense readiness. Do not optimize PR/agent counts as a business metric.

### D-061 — Data Scale is the current P0 program

Issue #119 remains the current program. Build comprehensive lawful coverage across independent listings, repeated observations, providers, inventory/restock, completed-sale evidence where authorized, and explainable signals.

Keep breadth seeding, depth collection, and re-observation as separate responsibilities. Preserve exact matching, provider provenance, listing-vs-observation identity, and fail-closed evidence semantics.

Evaluate work by expected movement through:

**DATA -> TRAFFIC -> CLICK -> REVENUE**
