# Gacha Lens Durable Decisions

Updated: 2026-09-02 JST — post-PR #159 checkpoint

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

Current approved primary sources:

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
- positive integer price is required; missing/zero/negative/invalid price fails closed
- provider availability must be explicit; unknown/missing availability fails closed
- fetched provider identity mismatch fails closed
- an `observedAt` older than persisted `last_observed_at` fails closed so current snapshot state cannot roll backward
- Production observation/listing persistence remains a separate approval-gated rollout

### D-017 — Provider credentials may only be sent to reviewed official endpoints

This security boundary is implemented for exact Rakuten/Yahoo re-observation in PR #153 and applies to future equivalent adapters.

TLS alone is not authorization to receive provider credentials or identifiers.

Required behavior:

- Rakuten `accessKey` / application identity may only be sent to the reviewed official Rakuten HTTPS API host + exact path or an equivalently strict explicit allowlist
- Yahoo `appid` may only be sent to the reviewed official Yahoo HTTPS API host + exact path or an equivalently strict explicit allowlist
- arbitrary custom HTTPS hosts fail closed before request execution
- HTTP, embedded URL credentials, pre-supplied query strings, and fragments fail closed
- redirects must not silently expand credential scope; current exact-read requests use `redirect: error`
- testability comes from injected fetch implementations/fixtures, not destination-validation weakening
- persisted durable listing identity must validate before any provider request

Do not weaken this boundary merely for development convenience.

### D-018 — Merged dry-run/provider-read code does not authorize Production-connected execution

PRs #150 and #153 establish reusable code contracts only.

They do **not** authorize:

- live Production-connected provider re-observation execution
- Production observation INSERTs or listing UPDATEs
- new/material workflow or schedule activation
- `workflow_dispatch`
- Secrets/Variables changes
- paid API entitlement activation

Those remain separate approval-gated rollout decisions even when the code is on `main` and normal Vercel Production is READY.

### D-019 — Depth Collector is multi-offer, identity-driven, and dry-run first

PR #156 / Issue #129 defines the durable Depth Collector contract.

Required behavior:

- collection target is an explicit variant + parent series
- reuse the existing strict P3 single-item/matcher/set/ambiguity predicate unchanged unless a separate reviewed change explicitly revises it
- allow many genuinely distinct legitimate offers for one variant under an operational budget; never encode `3 listings = done`
- price/title similarity is not listing identity
- dedupe by durable listing ID, provider + native source listing identity, and canonical public URL
- duplicate candidate keys are ambiguous and fail closed rather than selecting an arbitrary winner
- preserve same-provider distinct storefront/listing offers and cross-provider offers when marketplace identity is genuinely distinct
- preserve verified affiliate provenance only through the reviewed sanitizer
- bind selected candidates to target, keys, listing/source identity, canonical URL and row-relevant evidence with a collision-resistant digest; PR #156 uses SHA-256
- target, URL, price, title, marketplace identity, or bound evidence drift after selection must fail closed
- re-run strict market safety before row generation
- dry-run reporting must use the same selection-integrity gate
- projected writes are insert-only for this lane; insert counts must match accepted selection and update/delete/count drift fails closed
- default budget 50 / hard max 200 are operational safety bounds, not product completion targets
- Production persistence, workflow integration, schedules, and automatic activation remain separately approval-gated

### D-020 — Production official writes remain bounded/gated

Keep read-only readiness, bounded write, verification, canonical consistency, and fail-closed safety patterns. Do not bypass them to make a scheduled run succeed.

### D-021 — Kitan auto remains off

The manual canary already succeeded. Do not rerun it or enable automatic writes without explicit approval.

### D-022 — Qualia remains series-only until separately expanded

Current boundary is conservative series metadata insertion only. Variant writes and automatic rollout remain unapproved.

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
- GitHub Actions `workflow_dispatch`
- Secrets / Variables changes
- paid actions
- destructive/irreversible actions
- direct `main` pushes
- new/materially changed Production-capable workflow/schedule/cron/automatic ingestion
- ineligible Production releases/promotions/gate changes
- ineligible merges
- major unresolved product/security decisions

Eligible safe/reversible PRs may use `docs/AUTO_MERGE_POLICY.md`. Their normal Git-triggered Vercel Production release separately requires `docs/PRODUCTION_RELEASE_POLICY.md`.

### D-041 — Hard repository constraints

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually modify F0 official auto
- do not casually modify P3 V2 auto
- do not enable Kitan/Qualia auto without approval
- do not rerun completed Production canaries without a new task-specific approval

## Development workflow

### D-050 — One bounded outcome/phase per Codex instruction

ChatGPT owns direction, requirements, prioritization, approval boundaries, and review. Codex owns repository inspection, implementation, tests, lint/build, repair, branch/commit/PR work when Codex is available.

Avoid unnecessary tiny prompts when one bounded phase can be completed end-to-end.

### D-051 — Preserve partially completed work

If Codex/session quota interrupts work, inspect the existing branch/worktree/PR and continue. Do not restart from scratch.

### D-052 — Conserve Codex quota

Use connected tools for live state reads when available. Reserve higher reasoning/coding capacity for genuinely difficult implementation or safety-critical design.

### D-053 — Agent OS v1 governs bounded autonomous development

`AGENTS.md` and `docs/AGENT_OS.md` remain authoritative. Dedicated task branches/worktrees, explicit roles, durable Issue/PR evidence, Done Gate, and repository safety boundaries remain required.

### D-054 — Queue / Orchestrator v1 is bounded and resumable

`docs/AGENT_QUEUE.md` governs one-shot queue selection. Resume durable claims before duplicates, allow at most two disjoint Builders, and persist state in GitHub/repository records rather than chat memory.

Queue position never grants Production authority.

### D-055 — Canonical sync is a phase gate

Do not rely on detecting conversation limits.

After a major Production/recovery/security/release milestone:

1. update `docs/HANDOFF.md`
2. update `docs/STATUS.md`
3. update `docs/DECISIONS.md` when durable rules changed
4. update `docs/TODO.md`
5. validate/merge the docs-only canonical sync before starting the next major implementation phase

This gate applies even when the user says 「続けて」.

### D-056 — PR #156 review substitution was one-task-only

Issue #129 required an independent Reviewer. GitHub Copilot Code Review was unavailable on the user's current GitHub plan. On 2026-09-02 JST, the user explicitly approved proceeding for PR #156 only with:

- exact-head independent CI verification
- strengthened Lead full-diff self-review
- targeted regression tests covering the collection-semantics findings discovered during review

This was a task-contract exception for PR #156 only. It does **not** amend `AGENT_OS`, `AUTO_MERGE_POLICY`, `PRODUCTION_RELEASE_POLICY`, or future task review requirements. Future tasks must satisfy their own current review gate or obtain a separate explicit exception when a true stop boundary exists.

### D-057 — Scoreboard truthfulness and evidence-source separation are durable contracts

PR #159 / Issue #126 defines the read-only Data Scale Scoreboard contract.

Required behavior:

- product progress is evaluated through `DATA -> TRAFFIC -> CLICK -> REVENUE`, not PR count or agent activity
- measured-state vocabulary stays distinct: `available`, `unavailable`, `not_instrumented`
- source capability uses a separate vocabulary: `active`, `planned`, `partnership_required`, `paid_access_required`, `manual_only`, `unavailable`
- `supported_source_count` counts only active capabilities; total capability inventory is reported separately
- X without reviewed authorized collection is capability `paid_access_required` and measured social state `not_instrumented`; do not convert either to zero interest
- Mercari remains `partnership_required`; Scoreboard visibility does not authorize scraping
- only actual completed `status=sold` evidence counts as completed sale; `sold_out` remains ordinary availability/lifecycle evidence
- review-required stock/restock/social rows are excluded from trusted coverage inside the domain contract
- current outbound click evidence is provider+variant scoped and must not be represented as listing-level conversion or revenue attribution
- Production database `ingestion_runs` and GitHub Actions workflow execution are separate evidence sources; zero database run rows do not prove zero workflow runs
- missing workflow evidence must fail closed as `not_instrumented` instead of manufacturing a global run count
- raw provider payloads, credentials, and untrusted issue notes are not emitted by the Scoreboard
- #159 is read-only measurement infrastructure; it does not authorize Production history/depth persistence, provider execution, paid access, workflow activation, or Secrets changes

## Business priority

### D-060 — Revenue-relevant work outranks infrastructure for its own sake

Prioritize useful data density, organic traffic, affiliate clicks/sales, then AdSense readiness. Do not optimize PR/agent counts as a business metric.

### D-061 — Data Scale is the current P0 program

Issue #119 is the current program. Build comprehensive lawful coverage across independent listings, repeated observations, providers, inventory/restock, and explainable signals.

Keep breadth seeding, depth collection, and re-observation as separate responsibilities. Preserve exact matching, provider provenance, listing-vs-observation identity, and fail-closed evidence semantics.

Evaluate work by expected movement through:

**DATA -> TRAFFIC -> CLICK -> REVENUE**
