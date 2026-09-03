# Gacha Lens Durable Decisions

Updated: 2026-09-03 JST — R4 repository prerequisite merged / Issue #209 canonical sync

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
Never mix completed/sold evidence with active asking-price evidence. `sold_out` is inventory/unavailability state, not completed-sale proof.

### D-012 — Single-item matcher stays strict
Do not weaken the matcher merely to increase coverage. Complete sets, ambiguous candidates, wrong editions and multi-variant listings must not leak into variant prices.

### D-013 — Recall alone does not justify Production upgrade
Higher raw recall without higher safe accepted unique coverage does not justify replacing a strict Production lane.

### D-014 — Complete sets are series-level evidence
Accepted complete/full sets remain series-scoped. Broad automatic complete-set persistence remains unapproved.

### D-015 — Complete-set classification fails closed
Reject incomplete/ambiguous identity, unsupported source, invalid price, preorder, parent conflict, duplicate identity, count mismatch, generic partial set, random one-of-N wording, or single-item evidence.

### D-016 — Re-observation is append-only, identity-stable, and fail closed
- listing identity/matching provenance are immutable in ordinary re-observation
- later successful checks append observations even when price/status are unchanged
- observation identity is deterministic/retry-safe
- ordinary current states are only `active` / `sold_out`
- disappearance/provider failure never fabricates completed `sold`
- positive integer price and explicit availability are required
- fetched identity mismatch fails closed
- older timestamps fail closed
- equal timestamp + conflicting price/status fails closed
- null/undefined/blank observation time is invalid
- Production persistence remains separately approval-gated

### D-017 — Provider credentials only reach reviewed official endpoints
Credential-bearing requests stay on reviewed HTTPS hosts and paths. Arbitrary host/path/query/fragment, HTTP, embedded URL credentials and redirects fail closed. Durable identity validates before provider request.

### D-018 — Repository merge never implies Production DB authority
Repository merge, Preview READY, normal Vercel Production READY, disposable migration proof, and actual Supabase Production schema/data state are separate facts.

### D-019 — Depth Collector remains multi-offer, identity-driven and dry-run first
Depth work uses explicit variant/series targets, strict identity matching, durable dedupe, bounded request envelopes, and dry-run first. R3/R4 remain separately approval-gated.

### D-020 — Production writes remain bounded/gated
Keep exact identity, bounded write, verification, canonical consistency and fail-closed patterns. Do not bypass them to make a run succeed.

### D-021 — Kitan auto remains off unless exact existing policy enables it
Do not manually rerun or broaden Kitan automatic writes without applicable authority.

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

### D-024 — Use lawful existing-source depth/history before provider-count expansion
Repeated history/depth on reviewed sources is the near-term DATA multiplier before another general live-listing provider, unless current Scoreboard evidence changes the bottleneck.

### D-025 — History/depth rollout stages are separately approved
Canonical plan: `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`.

- R1: exact-provider read-only canary
- R2: tiny Production re-observation persistence
- R3: depth read-only
- R4: depth persistence

Approval for one stage never authorizes another. No schedule/budget scaling is automatic.

### D-026 — R1 #172 is complete and grants no later authority
R1 completed with Production writes0. Rakuten frozen three were `not_found`; final Yahoo frozen three were two `unchanged` and one `not_found`. Yahoo continuation budget was exhausted.

### D-027 — Yahoo exact JSONP compatibility accepts only two raw-byte-0 forms
Only the fixed callback at raw byte0, or exact literal `/* */` at raw byte0 immediately followed by that callback, is accepted. Leading whitespace/BOM, alternate comments, wrong callbacks, bare JSON and malformed wrappers fail closed.

### D-028 — R2 atomic persistence is historical proof, not reusable authority
Original v1 and Yahoo-only v2 prove the safety pattern, but their approvals/tokens/workflows are consumed. Installed R2 RPCs must not be invoked merely because they exist.

### D-029 — Breadth and repeated history are separate scorecard metrics
Successful R2 v2 changed Production 113/113/0 -> 113/117/4 for listings/observations/re-observed with sold0. Later breadth can change the denominator independently of history.

### D-030 — Preserve observer separation
Keep separate root/series/variant sitemaps.

### D-031 — No mass SEO pruning without evidence
Use current GSC/performance evidence before mass noindex/delete decisions.

### D-032 — Pagination is self-canonical
Indexable page2+ URLs canonicalize to themselves; preserve noindex behavior that prevents search/filter index explosion.

### D-034 — Repository migration presence is not Production schema state
Verify Supabase Production directly. Repository filename timestamp and Supabase generated ledger timestamp may differ; link schema state using reviewed SQL body, migration name, object verification and execution evidence.

### D-035 — Original #179 v1 Production attempt was a correct fail-closed result
Actions `33605362604` stopped on first Rakuten `not_found`. Exact first-target attempt count is not retained; reviewed reader bounds it to 1-3. Remaining calls0/RPC0/writes0/no retry.

### D-036 — Changed write cohorts require fresh reviewed identity and approval
Never reinterpret an old canary as a generic write license. Freeze exact identity/snapshot/history expectations and obtain fresh applicable authority.

### D-037 — Yahoo-only R2 v2 is the successful first-history proof
Actions `33621881117` used four HTTP attempts total, one per listing, all `unchanged`, then one verified atomic RPC. Production became 113/117/4/sold0.

### D-038 — Schema approval and credentialed execution mechanism are separate facts
Production migration application does not automatically authorize a credentialed GitHub Actions mechanism. One-shot workflow authority must be explicit when required.

### D-039 — Successful R2 v2 execution is terminal evidence
Do not rerun R2 merely to reconfirm. Its provider/RPC/workflow approvals are consumed.

### D-045 — Reusable bounded re-observation v1 replaces bespoke history canaries
Issue #196 / PR #198 merged the generic repository prerequisite.

Contract:
- explicit frozen cohort 1..10
- Yahoo + Rakuten exact persisted identities
- exact-main SHA + observation key + full frozen snapshot/prior-count digest
- distinct namespace `APPROVE_MARKET_REOBSERVATION_BOUNDED_V1`
- dry-run provider/RPC/write0
- max3 attempts/listing / max30 total in approved write mode
- one atomic RPC only after all targets safe
- prior observation count exact and may be >1
- deterministic observation IDs recomputed in SQL
- sanitized pre-RPC resolver manifest mandatory
- no automatic RPC retry; resolver SELECT-only
- append one observation + allowlisted listing snapshot update only
- never completed `sold` / `sold_at`
- SECURITY INVOKER / empty search_path / service_role-only

### D-046 — Canonical and persisted marketplace identities are separate guards
Node proves canonical provider/native/public identity. The bounded RPC also freezes and exact-matches actual DB `source_url`, `raw.provider`, `raw.source_listing_id`, and `raw.public_url`.

### D-047 — Bounded postwrite verification separates exact target truth from concurrent global growth
Target rows, deterministic IDs, prior->post counts and RPC result identity sets remain exact. Global listings/observations/re-observed counters use minimum-delta sanity checks so unrelated legitimate P3 growth is not misclassified. Completed sold remains exact.

### D-048 — Ambiguous write resolution requires evidence captured before RPC
A sanitized resolver manifest must exist before RPC. After ambiguous transport/commit state, resolution is SELECT-only and returns only `committed`, `not_committed`, or `inconsistent`; it never grants automatic retry.

### D-049 — Generic bounded v1 schema is installed in Production
Ledger is `20260902165958 / market_reobservation_bounded_v1`. Function `apply_market_reobservation_bounded_v1(jsonb)` is SECURITY INVOKER, empty search_path and service_role-only. Do not reapply the migration.

### D-073 — Cohort digests must use the complete merged frozen payload
The first #201 digest `9940a558...` was wrong because a hand reproduction omitted persisted identity fields. Never compute approval identity from a reduced approximation.

For future bounded identity:
- use merged digest semantics
- include every frozen field
- bind to current canonical main SHA
- any main change makes the digest stale
- never repair an already-human-approved token in place

### D-074 — First #201 one-shot failure is safe terminal evidence for that authorization
Actions `33658579004` failed at approval validation before provider loop: provider0/RPC0/writes0. Workflow was removed, branch final diff0/run count1. That approval is consumed.

### D-075 — Installed schema may remain after a fail-closed pre-provider attempt
The generic migration completed before the first #201 token mismatch. Future attempts verify installed schema and skip migration reapplication.

### D-076 — Independent breadth drift does not invalidate a frozen cohort unless target invariants drift
Approved P3 breadth growth can increase global counts while exact target invariants remain stable. Frozen-cohort validity is determined by exact target state, not a fixed global denominator.

### D-077 — First reusable generic bounded Production history batch succeeded
Fresh #201 retry authority bound to main `9859ab4d1d92043cc914dd00ea5814eff614e6f3`, key `reobs-v1:bounded-20260903-01`, digest `1142a10b4c8818562b27f9222a388be073934ca83a33932c2dfca65a5d4782bf`.

Actions `33660684355`:
- 8 Yahoo attempts total, exactly1 each
- retries0/rate-limits0/timeouts0
- 7 unchanged / 1 price_changed
- `yahoo-toysanta-g-5l370018il-003-57693`: 568 -> 399, active remained active
- pre-RPC resolver manifest preserved
- exactly one verified bounded RPC, applied_count8
- Production 115/119/4/sold0 -> 115/127/12/sold0
- deterministic rows8/8; all eight targets exactly two observations
- workflow removed; cleanup `c4a058f5cda1ad770bd5340e9650217484a6028e`; final diff0/run count1/never merged

Do not rerun `33660684355`.

### D-078 — Crossing a Scoreboard threshold changes the next decision, but only for the current denominator
At 115 listings, 12/115 ~=10.43% crossed the first 10% history threshold and justified a fresh bottleneck reassessment instead of another automatic history batch.

A threshold result is not permanent truth; current Production denominator must be re-fetched before acting.

### D-079 — Successful #201 retry approval is exact, consumed and non-reusable
The provider/RPC/workflow authorization tied to main `9859ab4d...` and digest `1142a10b...` ended with run `33660684355` and cleanup. It grants no future provider call, RPC, workflow or R3/R4 authority.

### D-080 — #206 R3 read-only evidence is complete and its authority is consumed
R3 was chosen only after a read-only Scoreboard showed 12/115 history coverage >=10% and depth x1 for 104/105 fresh covered variants.

Actions `33665350076` succeeded with 5 planner requests / 5 HTTP attempts / retry0 / Production writes0. Rakuten-first Buzz produced no new safe listing; Yahoo-first 伏黒恵 produced exactly one strict-safe new candidate:

- `yahoo-suruga-ya-601199451001`
- `yahoo_shopping:suruga-ya_601199451001`
- price 980 / active
- candidate key `1091dce22a0bf29f`
- fingerprint `56e8f3798cbf366f3b2936ad2034600c27ed36bb5f33ff7c9a6f522a86748198`

R3 approval/workflow authority is consumed. R3 success did not authorize R4.

### D-081 — #208 R4 prerequisite is repository capability only
PR #208 merged as main `10e097eaf11e70814a2d25bc1227e950f6b69d0f` after exact-head validation. It adds an atomic insert-only R4 contract but does not apply it to Supabase Production.

After merge, Production still had:
- R4 function absent
- R4 candidate absent
- target fresh safe depth exactly the original one listing

Normal Vercel Production READY does not change this.

### D-082 — R4 atomic depth writes are one-RPC, insert-only, preflight-bound
The merged R4 contract requires:
- explicit frozen 1..10 batch
- exact-main + complete manifest digest
- unique approval namespace `APPROVE_MARKET_DEPTH_R4_ATOMIC_V1`
- dry-run SELECT-only
- no provider discovery during write
- exact catalog/depth/unresolved/collision checks
- deterministic listing + first-observation identity
- whole-batch validation then one atomic PostgreSQL function transaction
- no UPDATE/DELETE/completed sold/sold_at
- SECURITY INVOKER / service_role-only
- resolver manifest saved before RPC
- no automatic RPC retry
- SELECT-only ambiguous resolver

This contract is not authority to execute itself.

### D-083 — #208 review substitution is exact, one-time, and consumed
The user allowed exact-head CI + Vercel Preview + disposable Supabase migration-apply proof + strengthened self-review to substitute for unavailable independent Reviewer/Verifier **for PR #208 merge only**.

It did not authorize Production migration, RPC/data write, provider execution, workflow changes, Secrets/Variables, F0, paid, destructive, or future review substitutions.

### D-084 — Denominator growth can reopen a previously passed Data Scale threshold
After independent breadth growth, Production became 127 listings / 139 observations / 12 re-observed / sold0. Repeated-history coverage is therefore about **9.45%**, below the same first 10% threshold that had been passed at 115 listings.

Consequences:
- never treat a prior Scoreboard bottleneck as permanent
- re-fetch the live denominator and all relevant Scoreboard inputs before the next DATA execution
- R4 must not proceed by sunk-cost logic simply because implementation is ready
- if history is again the reviewed P0 bottleneck, choose bounded history before R4
- if depth remains highest leverage after fresh reassessment, fresh-rebind R4 and obtain new exact Production authority

### D-085 — Every R4 Production attempt requires fresh read-only rebinding and fresh approval
Before any R4 Production migration/RPC:
1. confirm current main SHA;
2. re-read target catalog/review/unresolved/depth/collision state;
3. re-evaluate the current Scoreboard/bottleneck;
4. rebuild the frozen manifest/digest against current main/DB state;
5. request new R4-specific human approval;
6. if a disposable credentialed workflow is required, obtain explicit workflow authorization separately;
7. no automatic RPC retry; use SELECT-only resolver for ambiguity.

## Automation / safety

### D-040 — Explicit approval boundaries
Explicit approval remains required for Production DB writes/migrations/backfills/cleanup/schema/seed/reset, approval-bound live provider execution, `workflow_dispatch`, Secrets/Variables changes, paid actions, destructive work, direct main pushes, new/material Production-capable automation, ineligible merges/releases/gate changes, and major unresolved product/security decisions.

### D-041 — Hard repository constraints
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually modify F0 auto or P3 V2 auto
- do not enable Kitan/Qualia auto without approval
- do not rerun completed/failed canaries without new task-specific approval

### D-042 — Foundation migration-order assertion is known stale harness debt
Foundation disposable DB successfully applied:
- 9 migrations for #182
- 10 for #188
- 11 for #197/#198
- **12 for #208, including R4**

It then failed because `.github/workflows/foundation-baseline.yml` still hardcodes the original eight-version list. This is not migration failure. Repair remains a separate Production-capable workflow-change task.

### D-043 — Supabase migration ledger identity may differ from repository filename timestamp
Do not manually fix generated ledger timestamps. Identify Production schema by reviewed SQL, migration name, object verification and durable execution evidence.

### D-044 — Vercel release and Supabase schema state are separate
A normal Vercel Production release caused by repository merge does not apply Supabase migrations.

### D-060 — Temporary approved execution scaffolding is removed immediately
One-time workflows/scripts may be used only inside exact approved scope with minimal credentials and must be removed/reset immediately after evidence capture.

### D-061 — Review/CI evidence binds to the final exact head
A semantic repair invalidates older PASS claims. Re-run applicable validation against the final frozen head.

### D-064 — Original #179 v1 one-shot authorization is consumed
Actions `33605362604` ran once; workflow removed; no second run.

### D-066 — Yahoo-only R2 v2 one-shot authorization is consumed
Actions `33621881117` ran once; workflow removed; final branch diff0.

### D-068 — First #201 authorization is consumed
Migration succeeded; run `33658579004` failed before provider calls due invalid digest; no reuse.

### D-069 — Successful #201 retry authorization is consumed
Run `33660684355` succeeded and workflow was removed; no reuse.

## Development workflow

### D-050 — Codex is optional, not required
ChatGPT owns direction, prioritization, approval boundaries and review. Codex can implement/test when available, but quota exhaustion must not block safe connected-tool work.

### D-051 — Preserve partially completed work
Resume durable Issue/branch/PR/worktree evidence. Reconstruct unreachable local-only work from canonical durable contracts and label reconstruction clearly.

### D-052 — Conserve coding-agent quota
Use connected tools for live reads/safe repository operations; reserve coding-agent capacity for difficult implementation.

### D-053 — Agent OS remains authoritative
`AGENTS.md` and `docs/AGENT_OS.md` govern bounded autonomous development and evidence gates.

### D-054 — Queue work is bounded/resumable
`docs/AGENT_QUEUE.md` governs queue selection. Queue position never grants Production authority.

### D-055 — Canonical sync is a phase gate
After a major Production/recovery/security/release milestone, update the canonical four files and merge/verify their docs-only release before the next major implementation/execution phase.

### D-056 — Task-specific review substitutions never become global policy
Every human-approved replacement of independent Reviewer/Verifier applies only to the named task/PR unless explicitly stated otherwise.

### D-059 — Draft->Ready connector failure may use a clean byte-identical replacement PR
If the connector mutation fails before state change, a non-Draft replacement may reuse exact head/base, rerun gates and preserve audit trail. Never alter reviewed code merely to bypass tooling.

## Business priority

### D-070 — Revenue-relevant work outranks infrastructure for its own sake
Prioritize useful data density, organic traffic, affiliate clicks/sales, then AdSense readiness.

### D-071 — Data Scale remains P0 until the defined useful threshold is met
Build lawful breadth, depth and repeated history with exact provenance and fail-closed evidence semantics. Evaluate work through **DATA -> TRAFFIC -> CLICK -> REVENUE**.

### D-072 — Reassess before more DATA execution after any threshold/breadth change
Do not automatically run more history, R3/R4, or source expansion. Re-read live Scoreboard/breadth/depth/history evidence and choose the single highest-leverage remaining DATA move. If Data Scale is sufficient, shift to TRAFFIC -> CLICK -> REVENUE.
