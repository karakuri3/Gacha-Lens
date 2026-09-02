# Gacha Lens Durable Decisions

Updated: 2026-09-02 JST — post-R2 atomic prerequisite (#180/#182) checkpoint

This file records decisions that must survive thread changes. Reopen them only when new evidence justifies it.

## Product / UX

### D-001 — Series-first discovery
Public discovery remains `search/browse -> series -> lineup -> variant detail`. Variant-first remains appropriate for market evidence/history views.

### D-002 — Image truthfulness
Do not show imagery as variant-specific unless evidence proves variant scope.

## Market evidence / Data Scale

### D-010 — Approved marketplace programmatic sources
Current approved primary market-programmatic sources remain Yahoo Shopping API, Rakuten Ichiba API, and explicitly approved JSON/CSV feeds. Do not scrape Mercari or Amazon.

### D-011 — Evidence semantics stay separated
Never mix completed/sold evidence with active asking-price evidence. Presentation thresholds are not Data Scale completion targets.

### D-012 — Single-item matcher stays strict
Do not weaken the matcher merely to increase coverage. Complete sets and ambiguous candidates must not leak into variant prices.

### D-013 — Recall V5 is not a Production upgrade
Higher raw recall without higher safe accepted unique coverage does not justify replacing P3 V2.

### D-014 — Complete sets are series-level evidence
Accepted complete/full sets remain series-scoped. Broad automatic complete-set persistence remains unapproved.

### D-015 — Complete-set classification fails closed
Reject incomplete/ambiguous identity, unsupported source, invalid price, preorder, parent conflict, duplicate identity, count mismatch, generic partial set, random one-of-N wording, or single-item evidence.

### D-016 — Re-observation is append-only, identity-stable, and fail closed
Durable contract from #150/#169:

- listing identity/matching provenance are immutable in ordinary re-observation
- successful later checks may append a new observation even when price/status are unchanged
- observation identity is deterministic/retry-safe
- ordinary current states are only `active` / `sold_out`
- disappearance/provider failure never fabricates completed `sold`
- positive integer price and explicit availability required
- fetched identity mismatch fails closed
- older timestamps fail closed
- equal timestamp + conflicting price/status fails closed
- equal timestamp + unchanged same-key retry remains deterministic
- null/undefined/blank/whitespace observation time is invalid
- Production persistence remains separately approval-gated

### D-017 — Provider credentials only reach reviewed official endpoints
Credential-bearing requests must stay on the reviewed HTTPS host + exact path. Arbitrary host/path/query/fragment, HTTP, embedded URL credentials and redirects fail closed. Persisted durable identity validates before provider request.

### D-018 — Merged read/dry-run/prerequisite code does not authorize Production persistence
PRs #150/#153/#156/#169/#176/#182 and rollout planning do not authorize Production DB mutation, Production migration application, live provider execution outside a task-specific approval, schedule activation, workflow dispatch, Secrets/Variables changes, or paid entitlement activation.

### D-019 — Depth Collector is multi-offer, identity-driven and dry-run first
- explicit variant + parent series target
- strict matcher/set/ambiguity safety reused
- no `3 listings = done`
- price/title similarity is not identity
- dedupe by durable listing/native provider/canonical URL
- SHA-256-bound selection integrity
- post-selection drift fails closed
- projected writes insert-only
- Production activation remains separately approval-gated

### D-020 — Production official writes remain bounded/gated
Keep readiness, bounded write, verification, canonical consistency, and fail-closed patterns. Do not bypass them just to make a run succeed.

### D-021 — Kitan auto remains off
Do not rerun or enable automatic writes without explicit approval.

### D-022 — Qualia remains conservative
Broad variant writes/automatic rollout remain unapproved.

### D-023 — Lawful source states are explicit and scope-specific
Canonical vocabulary: `active`, `planned`, `partnership_required`, `paid_access_required`, `manual_only`, `unavailable`.

- state applies to the exact capability, not a provider globally
- seller/admin APIs do not imply broad market intelligence
- public pages do not imply automation permission
- public pricing/docs do not authorize paid/commercial activation
- recheck pricing, quotas, markets, tiers and licenses before acting

Current posture: Rakuten/Yahoo active; Aucfan paid-access diligence; Mercari C2C partnership-required/no scraping; Mercari Shops seller-scoped; X paid-access-required; eBay lower-priority planned; broad Surugaya/Mandarake/AmiAmi permission-first; connected GSC reporting last seen subscription-unavailable.

### D-024 — Use Rakuten/Yahoo history/depth before provider-count expansion
Repeated history/depth on lawful reviewed sources is the current near-term DATA multiplier before another general live-listing provider.

### D-025 — History/depth rollout stages are separately approved
Canonical plan: `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`.

- R1: exact-provider read-only canary
- R2: tiny Production re-observation persistence
- R3: depth read-only
- R4: depth persistence

Approval for one stage never authorizes another. No schedule/budget scaling is automatic.

### D-026 — R1 #172 is complete and grants no R2 authority
R1 completed on 2026-09-02 with Production DB writes 0.

Live outcomes:
- Rakuten frozen 3: all `not_found`, HTTP 200
- Yahoo final frozen 3: two `unchanged`, one `not_found`, HTTP 200
- false completed `sold`: 0
- frozen six rows remained unchanged with one observation each

`not_found` means the exact provider did not return current item evidence. It must never be promoted to completed-sale evidence or silently mutate lifecycle.

The separate Yahoo continuation approval was consumed **9/9 attempts exactly**. It is exhausted and cannot be reused for new live Yahoo calls.

### D-027 — Yahoo exact JSONP compatibility is fixed to two raw-byte-0 forms
Issue #173 / PR #176 permanently repaired the live Yahoo `itemLookup` compatibility problem without adding generic comment stripping.

The only accepted wrapper starts are:

1. fixed internal callback at raw byte 0; or
2. exact literal `/* */` at raw byte 0 immediately followed by that same fixed callback.

Durable security/truthfulness rules:

- parser callers cannot select/override the callback
- leading whitespace, newline or BOM is rejected rather than trimmed into validity
- `/**/`, `/*x*/`, arbitrary/multiple comments, arbitrary bytes and comment gaps fail closed
- wrong callbacks and bare JSON fail closed
- malformed body/wrapper fails closed
- trailing whitespace normalization is allowed
- endpoint/redirect/identity/positive-price/explicit-availability/active-or-sold_out/no-false-sold rules are unchanged
- do not log raw provider bodies or credentials

Independent Reviewer + Verifier passed the final exact head after two prior major findings were repaired. The Production release is `a8bf9b7d7da7826544cb72a89f77b082fd86f248` / `dpl_4U73Cev864RvycfGGPteqQxMS246` READY.

### D-028 — R2 is prepared in repository but still exact Production-approval-bound
Issue #180 / PR #182 completed the R2-specific single-transaction prerequisite and merged it to main `d80450626fd30768bb8f0af68340f0d2aea00bbb`.

The durable execution design is:

- exactly four frozen known listings, two Rakuten + two Yahoo
- one shared logical key `reobs-v1:r2-20260902-01`
- deterministic observation IDs
- exact current-main/cohort binding
- fresh exact provider reads immediately before persistence
- max 3 attempts/listing and max 12 HTTP attempts total
- all four must produce valid exact `seen` results; otherwise Production DB writes = 0
- one PostgreSQL RPC transaction only after all four plans are safe
- exactly four observation inserts plus four listing updates limited to price/status/last_observed_at/updated_at
- no automatic RPC write retry
- ambiguous commit state is resolved by SELECT-only deterministic evidence; even `not_committed` does not authorize an automatic retry

The actual #179 Production action requires one new exact human approval covering migration application, the max-12 live provider envelope, and the bounded atomic write delta. R2 approval never implies R3/R4, schedules, workflow changes, Secrets/Variables changes or paid actions.

### D-029 — Breadth growth must not be mistaken for history growth
The current SELECT snapshot remains 113 listings / 113 observations / 0 re-observed listings. History success requires actual listings with 2+ observations, not just more first observations.

### D-034 — Repository migration presence is not Production schema state
A migration file being merged and a Vercel application deployment being READY do not mean the migration is applied to Supabase Production.

At the post-#182 checkpoint:

- repository contains `supabase/migrations/20260902150500_r2_atomic_reobservation_canary.sql`
- Production migration ledger does **not** contain `20260902150500`
- Production `public.apply_market_reobservation_r2_canary_v1(jsonb)` is absent

Always re-read Production migration/function state immediately before requesting or executing R2 approval.

## SEO

### D-030 — Preserve observer separation
Keep separate root/series/variant sitemaps.

### D-031 — No mass SEO pruning without evidence
Use current GSC/performance evidence before mass noindex/delete decisions.

### D-032 — Pagination is self-canonical
Indexable page 2+ URLs canonicalize to themselves; preserve noindex behavior that prevents search/filter index explosion.

## Automation / safety

### D-040 — Explicit approval boundaries
Explicit approval remains required for standing-policy exclusions, including:
- Production DB writes/migrations/backfills/cleanup/schema/seed/reset
- approval-bound live Production-connected provider execution
- `workflow_dispatch`
- Secrets/Variables changes
- paid actions/API credits/subscriptions
- contractual commitments/data agreements
- destructive/irreversible work
- direct main push
- new/material Production-capable workflow/schedule/cron/automatic ingestion
- ineligible merges/releases/gate changes
- major unresolved product/security decisions

### D-041 — Hard repository constraints
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually modify F0 auto or P3 V2 auto
- do not enable Kitan/Qualia auto without approval
- do not rerun completed canaries without new task-specific approval

### D-042 — Foundation migration-order assertion is known stale harness debt
After #182 added the ninth repository migration, disposable-Supabase run `33600534418` successfully applied all nine migrations and then failed only because `.github/workflows/foundation-baseline.yml` still hardcodes the former eight-version list.

Do not misclassify that run as a migration-application failure. Also do not silently repair the workflow inside docs-only or unrelated scopes; workflow changes remain separately approval-bound.

## Development workflow

### D-050 — Codex is optional, not required
ChatGPT owns direction, prioritization, approval boundaries and review. Codex can implement/test when available, but quota exhaustion must not block safe connected-tool work.

### D-051 — Preserve partially completed work
Resume durable Issue/branch/PR/worktree evidence. If local-only work is unreachable, reconstruct from canonical durable contracts and label it as reconstruction.

### D-052 — Conserve coding-agent quota
Use connected tools for live reads/safe repository operations; reserve coding-agent capacity for difficult implementation when available.

### D-053 — Agent OS remains authoritative
`AGENTS.md` and `docs/AGENT_OS.md` govern bounded autonomous development and evidence gates.

### D-054 — Queue work is bounded/resumable
`docs/AGENT_QUEUE.md` governs queue selection. Queue position never grants Production authority.

### D-055 — Canonical sync is a phase gate
After a major Production/recovery/security/release milestone, update the canonical four files and merge/verify their docs-only release before the next major implementation phase.

### D-056 — PR #156 review substitution was one-task-only
It is not global policy.

### D-057 — Scoreboard truthfulness is durable
PR #159 preserves `available/unavailable/not_instrumented`, `sold` vs `sold_out`, review-safe evidence, provider+variant click scope, and DB-run vs workflow-run separation. Missing evidence fails closed rather than becoming zero.

### D-058 — #167/#168 review substitution was one-workstream-only
The user allowed replacement PRs #169/#170 to use exact-head CI, Preview, strengthened self-review, and regressions in place of independent review. This exception is not global and did not apply to #173/#176.

### D-059 — Draft→Ready connector failure uses clean replacement
When the connector's Draft→Ready mutation fails on `fullDatabaseId`, use a clean non-Draft replacement from correct current main and rerun required validation; never bypass Draft safety dishonestly.

### D-060 — Temporary approved execution scaffolding must be removed immediately
One-time canary workflows/scripts may be used only within the exact approved scope, must receive only the minimal required credentials, must not gain DB credentials when DB access is disallowed, and must be removed/reset immediately after evidence capture. R1's temporary ops branch was reset to main after each execution and after completion.

### D-061 — Independent review findings must repair the contract, not be waived silently
PR #176 demonstrated why collection-semantic review gates matter: independent review found two major boundary issues after ordinary tests/self-review. Both were repaired and the final exact head was re-reviewed before merge. A prior PASS on an older head is never sufficient after a semantic repair; review/CI/Preview must bind to the final exact head.

### D-062 — #180/#182 review substitution was task-specific only
For #180/#182 only, the human explicitly allowed independent Reviewer/Verifier to be replaced by:

- exact-head CI
- exact-head Vercel Preview
- disposable-Supabase migration application proof
- strengthened self-review

This exception ended with #182. It does not apply to #183, #179 execution, future schema/collection changes, or other workstreams. It granted no Production migration/provider/write authority.

## Business priority

### D-070 — Revenue-relevant work outranks infrastructure for its own sake
Prioritize useful data density, organic traffic, affiliate clicks/sales, then AdSense readiness.

### D-071 — Data Scale remains P0
Build lawful breadth, depth and repeated history with exact provenance and fail-closed evidence semantics. Evaluate work through **DATA -> TRAFFIC -> CLICK -> REVENUE**.
