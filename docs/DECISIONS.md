# Gacha Lens Durable Decisions

Updated: 2026-09-02 JST — post-#188 Yahoo-only R2 v2 prerequisite / Issue #189 canonical sync

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
PRs #150/#153/#156/#169/#176/#182/#188 and rollout planning do not authorize Production DB mutation, Production migration application, live provider execution outside a task-specific approval, schedule activation, workflow dispatch, Secrets/Variables changes, or paid entitlement activation.

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
R1 completed on 2026-09-02 with Production DB writes 0. Rakuten frozen 3 all returned `not_found`; Yahoo final frozen 3 returned two `unchanged` and one `not_found`; false completed `sold` remained 0. The separate Yahoo continuation approval was consumed 9/9 attempts exactly and is exhausted.

### D-027 — Yahoo exact JSONP compatibility is fixed to two raw-byte-0 forms
Issue #173 / PR #176 permanently repaired Yahoo exact `itemLookup` compatibility. Only the fixed internal callback at raw byte 0, or exact literal `/* */` at raw byte 0 immediately followed by that callback, is accepted. Leading whitespace/BOM, alternate comments, wrong callbacks, bare JSON and malformed wrappers fail closed. Independent Reviewer + Verifier passed the final repaired exact head.

### D-028 — R2 is prepared in repository and execution remains exact-approval-bound
Issue #180 / PR #182 completed the original R2-specific single-transaction prerequisite.

Durable original execution design:
- exactly four frozen known listings, two Rakuten + two Yahoo
- shared logical key `reobs-v1:r2-20260902-01`
- deterministic observation IDs
- exact current-main/cohort binding
- fresh exact provider reads immediately before persistence
- max 3 attempts/listing and 12 HTTP attempts total
- all four must produce valid exact `seen`; otherwise Production market-data writes = 0
- one PostgreSQL RPC transaction only after all four plans are safe
- exactly four observation inserts plus four listing updates limited to price/status/last_observed_at/updated_at
- no automatic RPC write retry
- ambiguous commit state is resolved by SELECT-only deterministic evidence and never authorizes automatic retry

Every new R2 execution still needs a fresh exact human approval. Approval never implies R3/R4, schedules, workflow changes, Secrets/Variables changes or paid actions.

### D-029 — Breadth growth must not be mistaken for history growth
The post-#188 Production snapshot remains 113 listings / 113 observations / 0 re-observed listings. History success requires actual listings with 2+ observations.

### D-034 — Repository migration presence is not Production schema state
A migration file being merged and Vercel READY do not mean that migration is applied to Supabase Production. This was true after #182 before v1 application and is true again after #188: repository migration `20260902180000_r2_yahoo_only_reobservation_canary_v2.sql` is merged while Production `apply_market_reobservation_r2_canary_v2(jsonb)` remains absent.

### D-035 — The first #179 R2 Production attempt failed closed and its approval is consumed
On 2026-09-02, the human approved one exact R2 migration/provider/RPC scope. The reviewed v1 migration was applied, but Actions run `33605362604` stopped on the first frozen Rakuten listing `rakuten-auc-toysanta-10386044` with final outcome `not_found`.

The retained failure artifact/log does not expose the provider reader diagnostics, so the exact HTTP attempt count for that first listing is not observable. The reviewed reader contract bounds it to **1–3 attempts**. The remaining three original targets received 0 provider calls.

Durable outcome:
- first target: `not_found`, attempt count unknown but bounded 1–3
- remaining provider calls: 0
- atomic RPC calls: 0
- market listings delta: 0
- observations delta: 0
- re-observed listings delta: 0
- completed sold delta: 0
- no retry of the canary run

The old provider/write approval and approval token are consumed. Do not reuse them or call the remaining original targets under that authorization.

### D-036 — A changed R2 cohort requires a new reviewed function contract and new approval
The installed `apply_market_reobservation_r2_canary_v1(jsonb)` hardcodes the original four listing IDs and observation key. If the next R2 attempt changes any cohort identity/key or materially changes provider mix, do not silently reuse the old function/approval.

Required order:
1. investigate/reselect read-only;
2. preserve strict identity/history safety without inferring lifecycle from `not_found`;
3. create a new reviewed migration/function contract when the frozen cohort changes;
4. pass repository/CI/Preview/review gates;
5. obtain a fresh exact provider + Production mutation approval.

Provider symmetry is not a reason to keep a weak target; evidence should determine the next tiny cohort while safety predicates remain unchanged.

### D-037 — Yahoo-only R2 v2 is the reviewed next first-history proof
Issue #187 / PR #188 completed a separate v2 contract rather than mutating/reusing v1.

Frozen v2 contract:
- four Yahoo Shopping listings only
- key `reobs-v1:r2-20260902-02`
- exact reviewed deterministic observation IDs frozen in tests
- distinct V2 approval namespace and cohort digest kind/version
- distinct `apply_market_reobservation_r2_canary_v2(jsonb)` migration/function
- serial Yahoo exact reads with >=1000ms same-provider pacing
- max 3 attempts/listing / max 12 total
- all four valid exact `seen` required before persistence
- exactly one atomic RPC only after all four safe plans
- one-prior-observation, deterministic-ID, identity/snapshot/import-issue, positive-price, active/sold_out and protected-field guards
- expected +0 listings / +4 observations / +4 re-observed / +0 completed sold
- no automatic RPC retry; resolver SELECT-only and never authorizes retry

The Yahoo-only choice is evidence-driven: multiple Rakuten exact probes repeatedly returned `not_found`, while Yahoo had durable exact `unchanged` evidence. Provider symmetry is not a success criterion.

PR #188 merged as `f3da6c82952dd44bf343d2c1717cd62920ace116`, but the v2 Production function remained absent at the merge checkpoint. A fresh SELECT-only preflight and fresh exact human approval are mandatory before Production migration/provider/RPC execution.

## SEO

### D-030 — Preserve observer separation
Keep separate root/series/variant sitemaps.

### D-031 — No mass SEO pruning without evidence
Use current GSC/performance evidence before mass noindex/delete decisions.

### D-032 — Pagination is self-canonical
Indexable page 2+ URLs canonicalize to themselves; preserve noindex behavior that prevents search/filter index explosion.

## Automation / safety

### D-040 — Explicit approval boundaries
Explicit approval remains required for standing-policy exclusions, including Production DB writes/migrations/backfills/cleanup/schema/seed/reset, approval-bound live provider execution, `workflow_dispatch`, Secrets/Variables changes, paid actions, contractual commitments, destructive/irreversible work, direct main pushes, new/material Production-capable automation, ineligible merges/releases/gate changes, and major unresolved product/security decisions.

### D-041 — Hard repository constraints
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually modify F0 auto or P3 V2 auto
- do not enable Kitan/Qualia auto without approval
- do not rerun completed/failed canaries without new task-specific approval

### D-042 — Foundation migration-order assertion is known stale harness debt
Disposable-Supabase run `33600534418` successfully applied all nine repository migrations and then failed only because `.github/workflows/foundation-baseline.yml` still hardcoded the former eight-version list. Final #188 run `33613902714` later successfully applied all ten repository migrations, including `20260902180000_r2_yahoo_only_reobservation_canary_v2.sql`, and then failed at the same expected-eight assertion. This is not a migration-application failure and does not authorize a workflow change inside unrelated scopes.

### D-043 — Supabase migration ledger identity may differ from the repository filename timestamp
For the approved v1 R2 Production application, repository file `20260902150500_r2_atomic_reobservation_canary.sql` was applied through connected Supabase migration tooling, which recorded ledger version `20260902073919` with name `r2_atomic_reobservation_canary`.

When connected tooling generates the applied ledger timestamp, link Production schema state using the reviewed SQL body, migration name, function/object verification and execution evidence. Do not falsely classify the migration as absent solely because the repository filename timestamp is not the ledger version.

### D-044 — A repository/Preview release cannot consume a future Production schema approval
PR #188 proves the v2 migration can apply on disposable Supabase and deploys the repository code to Vercel, but that release does not itself apply `apply_market_reobservation_r2_canary_v2(jsonb)` to Supabase Production. Production schema state must be verified directly immediately before approval/execution. Repository release, Preview READY, Production Vercel READY, and migration-apply proof are prerequisites/evidence, not standing Production mutation authority.

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
PR #159 preserves `available/unavailable/not_instrumented`, `sold` vs `sold_out`, review-safe evidence, provider+variant click scope, and DB-run vs workflow-run separation.

### D-058 — #167/#168 review substitution was one-workstream-only
The user allowed replacement PRs #169/#170 to use exact-head CI, Preview, strengthened self-review, and regressions in place of independent review. This exception was not global.

### D-059 — Draft→Ready connector failure uses clean replacement
When the connector's Draft→Ready mutation fails on `fullDatabaseId`, use a clean non-Draft replacement from correct current main and rerun required validation; never bypass Draft safety dishonestly.

### D-060 — Temporary approved execution scaffolding must be removed immediately
One-time canary workflows/scripts may be used only within exact approved scope, minimal credentials, and must be removed/reset immediately after evidence capture.

### D-061 — Independent review findings must repair the contract, not be waived silently
PR #176 demonstrated that prior PASS on an older head is insufficient after a semantic repair; review/CI/Preview must bind to the final exact head.

### D-062 — #180/#182 review substitution was task-specific only
For #180/#182 only, the human explicitly allowed exact-head CI, exact-head Vercel Preview, disposable-Supabase migration application proof, and strengthened self-review in place of independent Reviewer/Verifier. That exception ended with #182 and granted no Production migration/provider/write authority.

### D-063 — #183/#184 docs-only review substitution was task-specific only
On 2026-09-02, the human explicitly authorized **#184 only** to replace independent Reviewer + Verifier with exact-head PR Code Quality, exact-head Vercel Preview, and strengthened full-diff self-review. That exception ended with #184 and does not apply to #179 or future PRs.

### D-064 — #179 one-shot workflow authorization was exact, consumed and cleaned up
For #179 only, the human authorized a disposable branch-only GitHub Actions workflow using existing repository Secrets to execute the already-approved R2 runner once. The workflow ran once as Actions `33605362604`, failed closed on the first provider result, and was then deleted from the branch in commit `cac883d9f74af9cad051a6fd853631f8a91ebc89`.

The disposable branch's final tree has zero file differences from main and no second workflow run occurred. This authorization does not permit recreating, dispatching or rerunning an execution workflow later.

### D-065 — #188 review substitution was task-specific only
For PR #188 only, the human explicitly authorized replacing independent Reviewer + Verifier with exact-head PR Code Quality, exact-head Vercel Preview, disposable Supabase migration-apply proof, and strengthened Lead/self-review. The final reviewed head was `53d7de690a7b5aacba65f69d30b6c70249182b3d`; PR #188 then squash-merged as `f3da6c82952dd44bf343d2c1717cd62920ace116` and normal Vercel Production became READY.

This exception ended with #188. It grants no authority for #189 review, future PR review, Production v2 migration application, live Yahoo requests, or v2 RPC/write.

## Business priority

### D-070 — Revenue-relevant work outranks infrastructure for its own sake
Prioritize useful data density, organic traffic, affiliate clicks/sales, then AdSense readiness.

### D-071 — Data Scale remains P0
Build lawful breadth, depth and repeated history with exact provenance and fail-closed evidence semantics. Evaluate work through **DATA -> TRAFFIC -> CLICK -> REVENUE**.
