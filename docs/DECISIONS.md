# Gacha Lens Durable Decisions

Updated: 2026-09-01 JST — post-PR #150 checkpoint

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

Provider adapters that carry credentials/identifiers must not accept arbitrary HTTPS destinations merely because TLS is present.

For the #135/#136 exact re-observation provider lane and future equivalent adapters:

- Rakuten `accessKey`/application identity must only be sent to the reviewed official Rakuten API host+path or an equivalently strict explicit allowlist
- Yahoo `appid` must only be sent to the reviewed official Yahoo API host+path or an equivalently strict explicit allowlist
- arbitrary custom HTTPS hosts fail closed before request execution
- testability should come from injected `fetchImpl`/fixtures, not by weakening destination validation
- redirects or endpoint configurability must not expand credential scope silently

This is a security boundary, not merely a convenience preference.

## Official ingestion

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

ChatGPT owns direction, requirements, prioritization, approval boundaries, and review. Codex owns repository inspection, implementation, tests, lint/build, repair, branch/commit/PR work.

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

## Business priority

### D-060 — Revenue-relevant work outranks infrastructure for its own sake

Prioritize useful data density, organic traffic, affiliate clicks/sales, then AdSense readiness. Do not optimize PR/agent counts as a business metric.

### D-061 — Data Scale is the current P0 program

Issue #119 is the current program. Build comprehensive lawful coverage across independent listings, repeated observations, providers, inventory/restock, and explainable signals.

Keep breadth seeding, depth collection, and re-observation as separate responsibilities. Preserve exact matching, provider provenance, listing-vs-observation identity, and fail-closed evidence semantics.

Evaluate work by expected movement through:

**DATA -> TRAFFIC -> CLICK -> REVENUE**
