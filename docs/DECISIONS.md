# Gacha Lens Durable Decisions

Updated: 2026-09-03 JST — reusable bounded re-observation repository prerequisite / Issue #199 canonical sync

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

### D-013 — Recall alone does not justify Production upgrade
Higher raw recall without higher safe accepted unique coverage does not justify replacing the current strict Production lane.

### D-014 — Complete sets are series-level evidence
Accepted complete/full sets remain series-scoped. Broad automatic complete-set persistence remains unapproved.

### D-015 — Complete-set classification fails closed
Reject incomplete/ambiguous identity, unsupported source, invalid price, preorder, parent conflict, duplicate identity, count mismatch, generic partial set, random one-of-N wording, or single-item evidence.

### D-016 — Re-observation is append-only, identity-stable, and fail closed
- listing identity/matching provenance are immutable in ordinary re-observation
- successful later checks may append a new observation even when price/status are unchanged
- observation identity is deterministic/retry-safe
- ordinary current states are only `active` / `sold_out`
- disappearance/provider failure never fabricates completed `sold`
- positive integer price and explicit availability required
- fetched identity mismatch fails closed
- older timestamps fail closed
- equal timestamp + conflicting price/status fails closed
- null/undefined/blank observation time is invalid
- Production persistence remains separately approval-gated

### D-017 — Provider credentials only reach reviewed official endpoints
Credential-bearing requests must stay on reviewed HTTPS hosts and paths. Arbitrary host/path/query/fragment, HTTP, embedded URL credentials and redirects fail closed. Persisted durable identity validates before provider request.

### D-018 — Merged repository code never implies Production DB authority
Repository merge, Preview READY, normal Vercel Production READY, and disposable migration proof are all distinct from actual Supabase Production schema/data state. A repository migration file being present does not authorize or prove its Production application.

### D-019 — Depth Collector remains multi-offer, identity-driven and dry-run first
Depth work uses explicit variant/series targets, strict identity matching, durable dedupe, bounded request envelopes, and dry-run first. R3/R4 remain separately approval-gated.

### D-020 — Production writes remain bounded/gated
Keep exact identity, bounded write, verification, canonical consistency, and fail-closed patterns. Do not bypass them merely to make a run succeed.

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

Current posture: Rakuten/Yahoo active; Aucfan paid-access diligence; Mercari C2C partnership-required/no scraping; Mercari Shops seller-scoped; X paid-access-required; eBay lower-priority planned; broad Surugaya/Mandarake/AmiAmi permission-first.

### D-024 — Use Rakuten/Yahoo history/depth before provider-count expansion
Repeated history/depth on lawful reviewed sources is the current near-term DATA multiplier before another general live-listing provider.

### D-025 — History/depth rollout stages are separately approved
Canonical plan: `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`.

- R1: exact-provider read-only canary
- R2: tiny Production re-observation persistence
- R3: depth read-only
- R4: depth persistence

Approval for one stage never authorizes another. No schedule/budget scaling is automatic.

### D-026 — R1 #172 is complete and grants no later authority
R1 completed with Production writes 0. Rakuten frozen three all returned `not_found`; final Yahoo frozen three returned two `unchanged` and one `not_found`. Yahoo continuation budget was consumed exactly and is exhausted.

### D-027 — Yahoo exact JSONP compatibility accepts only two raw-byte-0 forms
Only the fixed internal callback at raw byte 0, or exact literal `/* */` at raw byte 0 immediately followed by that callback, is accepted. Leading whitespace/BOM, alternate comments, wrong callbacks, bare JSON and malformed wrappers fail closed.

### D-028 — R2 atomic persistence remains historical, narrow, and non-reusable as authority
Original v1 and Yahoo-only v2 prove the safety pattern, but their approvals/tokens/workflows are consumed. Their installed RPCs must not be invoked merely because they exist.

### D-029 — Breadth and repeated history are separate scorecard metrics
Successful Yahoo-only R2 v2 changed Production from 113 listings / 113 observations / 0 re-observed to **113 / 117 / 4**, with completed sold still 0. Future scorecards report breadth and repeated-history coverage separately.

### D-034 — Repository migration presence is not Production schema state
Verify Supabase Production directly. Repository filename timestamp and Supabase generated ledger timestamp may differ; link actual schema using reviewed SQL body, migration name, function verification and execution evidence.

### D-035 — Original #179 v1 Production attempt was a correct fail-closed result
Actions `33605362604` stopped on first Rakuten target `not_found`. Exact first-target attempt count is not retained; reviewed reader bounds it to 1-3. Remaining three target calls 0, RPC 0, market-data writes 0, no retry. Old approval/token are consumed.

### D-036 — Changed write cohorts require fresh reviewed identity and approval
Never reinterpret an old hardcoded canary as a generic write license. Reselect read-only, freeze identity/snapshot/history expectations, validate the appropriate reviewed contract, then obtain fresh provider + Production mutation authority.

### D-037 — Yahoo-only R2 v2 is the successful first-history proof
The Yahoo-only choice was evidence-driven, not symmetry-driven. Actions `33621881117` used 4 HTTP attempts total, one per listing, all `unchanged`, then one verified atomic RPC. Production became 113 listings / 117 observations / 4 re-observed / 0 completed sold.

### D-038 — Schema approval and credentialed execution mechanism are separate facts
Production migration application does not automatically authorize a credentialed GitHub Actions mechanism. The successful R2 v2 one-shot mechanism had its own explicit branch/workflow authorization, which is consumed.

### D-039 — Successful R2 v2 execution is terminal evidence, not reusable authorization
Do not rerun R2 merely to reconfirm. Its provider/RPC/workflow approvals are consumed. The durable evidence is preserved in HANDOFF/STATUS and Issue #179.

### D-045 — Reusable bounded re-observation v1 replaces bespoke history canaries for future expansion
Issue #196 / replacement PR #198 merged the repository prerequisite for future bounded history compounding.

Contract:
- explicit frozen cohort 1..10
- Yahoo + Rakuten exact persisted identities
- exact-main SHA + observation key + frozen snapshot/prior-count cohort digest
- distinct namespace `APPROVE_MARKET_REOBSERVATION_BOUNDED_V1`
- dry-run provider/RPC/write 0
- max 3 attempts/listing / max30 total in future approved write mode
- one atomic RPC only after all target plans are safe
- prior observation count >=1 and exact
- deterministic observation IDs recomputed in SQL
- sanitized pre-RPC resolver manifest mandatory
- no automatic RPC retry; resolver SELECT-only
- append one observation + allowlisted listing snapshot update only
- never completed `sold` / `sold_at`
- SECURITY INVOKER, empty search_path, service_role-only

Future history expansion should use this reviewed reusable contract rather than creating another hardcoded eight-row function, unless new evidence shows the generic contract itself is insufficient.

### D-046 — Canonical and persisted marketplace URL identities are separate guards
Node proves canonical provider/native/public identity. The bounded RPC also freezes and exact-matches the actual DB-stored `source_url`, `raw.provider`, and `raw.native_id`. Canonical-equivalent URLs such as a harmless trailing slash must not create Node/SQL contract disagreement, while persisted snapshot drift still fails closed.

### D-047 — Bounded postwrite verification distinguishes exact target truth from concurrent global growth
Target rows, deterministic observation IDs, prior->post counts, provider snapshot and RPC result identity sets remain exact. Global listings/observations/re-observed counters use minimum-delta sanity checks so unrelated legitimate P3 breadth/history writes do not falsely classify a correct bounded run as inconsistent. Completed sold must remain exactly unchanged.

### D-048 — Ambiguous write resolution requires evidence captured before RPC
Future bounded write mode must persist a sanitized resolver manifest before RPC invocation. After ambiguous transport/commit state, resolution is SELECT-only and returns only `committed`, `not_committed`, or `inconsistent`; it never grants automatic write retry.

### D-049 — Generic bounded Production state is currently absent
After #198 repository merge, fresh Production SELECT proved `apply_market_reobservation_bounded_v1(jsonb)` absent and ledger `market_reobservation_bounded_v1` absent. Production remained 113 listings / 117 observations / 4 re-observed / 0 completed sold. Applying the generic migration requires a new explicit human approval.

## SEO

### D-030 — Preserve observer separation
Keep separate root/series/variant sitemaps.

### D-031 — No mass SEO pruning without evidence
Use current GSC/performance evidence before mass noindex/delete decisions.

### D-032 — Pagination is self-canonical
Indexable page 2+ URLs canonicalize to themselves; preserve noindex behavior that prevents search/filter index explosion.

## Automation / safety

### D-040 — Explicit approval boundaries
Explicit approval remains required for standing-policy exclusions, including Production DB writes/migrations/backfills/cleanup/schema/seed/reset, approval-bound live provider execution, `workflow_dispatch`, Secrets/Variables changes, paid actions, destructive/irreversible work, direct main pushes, new/material Production-capable automation, ineligible merges/releases/gate changes, and major unresolved product/security decisions.

### D-041 — Hard repository constraints
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually modify F0 auto or P3 V2 auto
- do not enable Kitan/Qualia auto without approval
- do not rerun completed/failed canaries without new task-specific approval

### D-042 — Foundation migration-order assertion is known stale harness debt
The Foundation disposable DB successfully applied 9 migrations for #182, 10 for #188, and 11 for #197/#198, then failed because `.github/workflows/foundation-baseline.yml` still hardcodes the original eight-version list. This is not migration-application failure and does not authorize workflow modification inside unrelated scopes.

### D-043 — Supabase migration ledger identity may differ from repository filename timestamp
For approved R2 Production migrations, connected tooling generated ledger versions different from repository filenames. Do not manually “fix” the ledger; identify Production schema by reviewed SQL, migration name, object verification and durable execution evidence.

### D-044 — Vercel release cannot consume a future Production schema approval
A normal Vercel Production release caused by repository merge does not apply Supabase migrations. Production schema and Vercel release are separate external states.

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
After a major Production/recovery/security/release milestone, update the canonical four files and merge/verify their docs-only release before the next major implementation/execution phase.

### D-056 — Task-specific review substitutions never become global policy
Every human-approved replacement of independent Reviewer/Verifier applies only to the named task/PR unless explicitly stated otherwise.

### D-059 — Draft->Ready connector failure uses a clean replacement PR
When the connector's Draft->Ready mutation fails before state change, it is acceptable to close the unmerged Draft and create a non-Draft replacement from the exact same branch/head/base, rerun normal PR gates, and preserve the audit trail. Never bypass Draft state dishonestly or alter the reviewed code merely to work around tooling.

### D-060 — Temporary approved execution scaffolding must be removed immediately
One-time canary workflows/scripts may be used only within exact approved scope, minimal credentials, and must be removed/reset immediately after evidence capture.

### D-061 — Review/CI evidence binds to the final exact head
A semantic repair invalidates older PASS claims. Re-run applicable validation against the final frozen head.

### D-062 — #180/#182 review substitution was task-specific only
It ended with #182 and granted no Production authority.

### D-063 — #183/#184 docs-only review substitution was task-specific only
It ended with #184.

### D-064 — Original #179 v1 one-shot workflow authorization was exact, consumed and cleaned up
Actions `33605362604` ran once; workflow was removed; no second run occurred. The authorization cannot be reused.

### D-065 — #188 review substitution was task-specific only
It ended with #188 and grants no later authority.

### D-066 — Yahoo-only R2 v2 one-shot workflow authorization was exact, consumed and cleaned up
Actions `33621881117` ran exactly once; workflow was removed; final disposable branch file diff was zero. The authorization cannot be reused.

### D-067 — #196/#197 independent-review substitution was consumed by byte-identical replacement PR #198
The human explicitly allowed exact-head CI + Vercel Preview + disposable Supabase migration-apply proof + strengthened self-review in place of independent Reviewer/Verifier for #196/#197 only. The Draft->Ready connector failed before mutation; #197 was closed unmerged, and non-Draft #198 reused the exact same head/base with no code commit change, reran normal PR gates, and merged as `9c74d243b5a8f43b49dc7fa649b4c4043bb4a82c`. The substitution is now consumed and grants no Production migration/provider/RPC/workflow authority.

## Business priority

### D-070 — Revenue-relevant work outranks infrastructure for its own sake
Prioritize useful data density, organic traffic, affiliate clicks/sales, then AdSense readiness.

### D-071 — Data Scale remains P0
Build lawful breadth, depth and repeated history with exact provenance and fail-closed evidence semantics. Evaluate work through **DATA -> TRAFFIC -> CLICK -> REVENUE**.

### D-072 — Current next DATA experiment is bounded history coverage, not automatic R3
Current Production history coverage is 4/113 (~3.54%) and the Scoreboard threshold is 10%. After #199 canonical sync, first perform read-only selection/dry-run planning for an 8-10 listing reusable bounded batch. Only after exact evidence and fresh approval may generic Production migration/provider/RPC execution be considered. R3/R4 remain separate later stages.
