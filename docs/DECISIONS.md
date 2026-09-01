# Gacha Lens Durable Decisions

Updated: 2026-09-02 JST — post-PR #170 checkpoint

This file records decisions that must survive thread changes. Reopen them only when new evidence justifies it.

## Product / UX

### D-001 — Series-first discovery

Public discovery remains `search/browse -> series -> lineup -> variant detail`. Variant-first remains appropriate for price evidence/history and expensive/rising/rare views.

### D-002 — Image truthfulness

Do not show an image as variant-specific unless evidence proves variant scope. Missing/series-level imagery is preferable to false certainty.

## Market evidence

### D-010 — Approved marketplace programmatic sources

Current approved primary market-programmatic sources remain Yahoo Shopping API, Rakuten Ichiba API, and explicitly approved JSON/CSV feeds. Do not scrape Mercari or Amazon.

### D-011 — Evidence semantics stay separated

Presentation thresholds remain active >=3 -> `LISTING_GUIDE`, completed >=3 -> `REFERENCE`, completed >=5 -> `SOLD`. These are presentation/evidence thresholds, not Data Scale completion targets. Never mix completed/sold evidence with active asking-price evidence.

### D-012 — Single-item matcher stays strict

Do not weaken the matcher merely to increase coverage. Genuine complete/full sets and ambiguous candidates must not leak into variant prices.

### D-013 — Recall V5 is not a Production upgrade

Higher raw recall without higher safe accepted unique coverage does not justify promoting Recall V5 into P3 V2.

### D-014 — Complete sets are series-level evidence

Accepted complete/full sets remain series-scoped with `variant_id=null` / `matched_variant_id=null`. Broad automatic complete-set persistence remains unapproved.

### D-015 — Complete-set classification fails closed

Reject incomplete/ambiguous identity, unsupported source, invalid price, preorder, parent conflict, duplicate identity, count mismatch, generic partial set, random one-of-N wording, or single-item/バラ売り evidence.

### D-016 — Re-observation is append-only, identity-stable, and fail closed

PR #150 / Issue #128 defines the base contract:

- listing identity and matching provenance are immutable in ordinary re-observation
- every successful later check may create a new observation even when price/status are unchanged
- observation identity is deterministic and retry-safe for the same listing/provider/logical bucket
- only ordinary current states `active` / `sold_out` are allowed
- disappearance/provider failure never fabricates completed `sold`
- positive integer price is required
- provider availability must be explicit
- fetched identity mismatch fails closed
- stale observations must not roll the current snapshot backward
- Production persistence remains separately approval-gated

PR #169 / Issue #166 adds durable timestamp safety:

- `observedAt < last_observed_at` remains fail-closed stale evidence
- equal timestamp + conflicting price/status fails closed with `conflicting_equal_observation_time`
- equal timestamp + unchanged price/status + same logical key remains deterministic/retry-safe
- null/undefined/blank/whitespace observation time is invalid and must not be coerced through JavaScript `Date`

### D-017 — Provider credentials may only be sent to reviewed official endpoints

Implemented for exact Rakuten/Yahoo re-observation in PR #153 and applicable to future equivalent adapters. Credential-bearing requests must stay on reviewed official HTTPS host + exact path/equivalent allowlist; arbitrary hosts, HTTP, embedded URL credentials, pre-supplied query strings/fragments, and redirects fail closed. Persisted durable identity validates before provider request.

### D-018 — Merged dry-run/provider-read code does not authorize Production-connected execution

PRs #150, #153, #156 and #169 establish code contracts only. They do not authorize live Production-connected provider reads, Production observation/listing persistence, workflow/schedule activation, `workflow_dispatch`, Secrets/Variables changes, or paid entitlement activation.

### D-019 — Depth Collector is multi-offer, identity-driven, and dry-run first

PR #156 / Issue #129 defines the durable Depth Collector contract:

- explicit variant + parent-series target
- strict P3 single-item/matcher/set/ambiguity safety reused
- many distinct legitimate offers may be retained; never encode `3 listings = done`
- price/title similarity is not listing identity
- dedupe by durable listing ID, provider/native source identity, and canonical URL
- ambiguous duplicate candidate keys fail closed
- preserve legitimate same-provider and cross-provider distinct offers
- verified affiliate provenance only through the reviewed sanitizer
- SHA-256-bound selection integrity
- post-selection target/URL/price/title/identity/evidence drift fails closed
- strict market safety re-runs before row generation
- projected writes remain insert-only/count-bound
- default budget 50 / hard max 200 are safety ceilings, not completion targets
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
- state applies to the stated capability/scope, not the provider brand globally
- seller/admin APIs do not imply broad marketplace intelligence access
- public pages do not imply permission for automated collection
- paid/commercial access is not authorized merely because documentation/pricing is public
- prices, quotas, supported markets, tiers and licensing terms are dated and must be rechecked immediately before activation/implementation/purchase/commitment
- source research never overrides Production, paid, credential, workflow or contractual approval gates

Current posture from 2026-09-02 verification:

- Rakuten Ichiba API: `active`
- Yahoo Shopping API / ValueCommerce: `active`
- Aucfan: `paid_access_required`; strongest identified licensed completed-sale/history candidate pending diligence
- Yahoo Auctions broad public market-history API: unavailable through reviewed current public path
- Mercari C2C broad market data: `partnership_required`; no scraping
- Mercari Shops seller API does not provide broad C2C market intelligence
- X API: `paid_access_required`; authorized paid path only
- eBay Browse: lower-priority `planned`; Japan/historical constraints require recheck
- broad Surugaya/Mandarake/AmiAmi automation requires explicit API/feed/permission/partnership
- connected GSC Wizard reporting path was unavailable at verification due subscription/payment state; unavailable reporting is not zero traffic

### D-024 — Use existing Rakuten/Yahoo depth/history capability before provider-count expansion

At the #159/#165 Production checkpoints, 107 listings still had 107 observations and zero re-observed listings. Therefore the near-term DATA multiplier is safe repeated observation/depth on already-reviewed Rakuten/Yahoo paths before prioritizing another general live-listing provider. This is a priority decision, not Production authorization.

### D-025 — Production history/depth rollout uses separately approved stages

PR #170 / Issue #165 and `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md` define the rollout contract.

Durable stage separation:

- R1: proposed exact-provider read-only re-observation canary — 6 known listings, 3 Rakuten + 3 Yahoo, serial, max 18 HTTP attempts, zero DB writes
- R2: proposed Production re-observation persistence canary — 4 known listings, 2+2 provider split, expected +4 observations if baseline remains one observation each, bounded transaction + exact reread
- R3: proposed depth read-only canary — 2 explicit target variants, one Rakuten-first + one Yahoo-first, max 5 accepted each / 10 total, max 6 planner requests / 18 HTTP attempts, zero writes
- R4: proposed depth persistence — only frozen strict-safe R3 subset, <=10 insert-only listing+initial-observation pairs

Approval for one stage never authorizes another. No schedule/budget scaling is automatic. After each Production-impacting canary, re-run the truthful Scoreboard and scale only from measured provider health and DATA gain.

## SEO

### D-030 — Preserve observer separation

Keep separate `/sitemap.xml`, `/series-sitemap.xml`, and `/variant-sitemap.xml` observers.

### D-031 — No mass SEO pruning without evidence

Do not mass-noindex/delete pages from intuition or sitemap summaries. Use current GSC URL/performance evidence first.

### D-032 — Pagination is self-canonical

Indexable page 2+ URLs canonicalize to themselves. Preserve intended noindex behavior for search/filter combinations that prevent index explosion.

## Automation / safety

### D-040 — Explicit approval boundaries

Explicit approval remains required for actions excluded by standing policies, including:

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

### D-050 — One bounded outcome/phase per Codex instruction when Codex is available

ChatGPT owns direction, requirements, prioritization, approval boundaries, and review. Codex may own repository inspection/implementation/testing/PR work when available. Codex unavailability must not block safe connected-tool work that can be completed directly.

### D-051 — Preserve partially completed work

If Codex/session quota interrupts work, inspect existing durable branch/worktree/PR/Issue evidence and continue. Do not restart from scratch when recoverable state exists. If local-only work is unreachable, reconstruct only from canonical durable contracts and clearly label the recovery as reconstruction rather than byte-for-byte recovery.

### D-052 — Conserve Codex quota

Use connected tools for live state reads and safe repository operations when available. Reserve coding-agent capacity for difficult implementation/safety-critical work.

### D-053 — Agent OS v1 governs bounded autonomous development

`AGENTS.md` and `docs/AGENT_OS.md` remain authoritative. Dedicated task branches/worktrees, explicit roles, durable Issue/PR evidence, Done Gate, and repository safety boundaries remain required.

### D-054 — Queue / Orchestrator v1 is bounded and resumable

`docs/AGENT_QUEUE.md` governs one-shot queue selection. Resume durable claims before duplicates, allow at most two disjoint Builders, and persist state in GitHub/repository records rather than chat memory. Queue position never grants Production authority.

### D-055 — Canonical sync is a phase gate

After a major Production/recovery/security/release milestone, update `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md` when durable rules changed, and `docs/TODO.md`; validate/merge the docs-only canonical sync before starting the next major implementation phase. Do not rely on chat-limit detection.

### D-056 — PR #156 review substitution was one-task-only

The user explicitly approved PR #156 only to proceed with exact-head independent CI + strengthened Lead self-review + targeted regression tests when Copilot Code Review was unavailable. This is not a global policy change.

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

### D-058 — #167/#168 review substitution is a one-workstream exception only

On 2026-09-02 the user explicitly allowed #167 and #168 only to replace independent Verifier/Reviewer with exact-head CI, Vercel Preview, strengthened self-review and regression tests. Because the connected Draft→Ready mutation was broken, non-Draft replacement PRs #169/#170 inherited this exact task-specific exception. It does not apply to unrelated future PRs and does not relax Production/provider/workflow/credential/paid approval boundaries.

### D-059 — Draft→Ready connector failure uses clean non-Draft replacement, not unsafe bypass

The connected GitHub Draft→Ready mutation currently fails on `fullDatabaseId`. When that bug blocks an otherwise eligible PR, close the Draft as superseded and create a clean non-Draft replacement from the correct current main/head contract. Re-run exact-head validation as appropriate; do not claim the Draft itself became Ready or merge a Draft through an unsafe bypass.

## Business priority

### D-060 — Revenue-relevant work outranks infrastructure for its own sake

Prioritize useful data density, organic traffic, affiliate clicks/sales, then AdSense readiness. Do not optimize PR/agent counts as a business metric.

### D-061 — Data Scale is the current P0 program

Issue #119 remains the current program. Build comprehensive lawful coverage across independent listings, repeated observations, providers, inventory/restock, completed-sale evidence where authorized, and explainable signals. Keep breadth seeding, depth collection, and re-observation as separate responsibilities. Preserve exact matching, provider provenance, listing-vs-observation identity, and fail-closed evidence semantics.

Evaluate work by expected movement through **DATA -> TRAFFIC -> CLICK -> REVENUE**.
