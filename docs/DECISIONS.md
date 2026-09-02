# Gacha Lens Durable Decisions

Updated: 2026-09-02 JST — successful Yahoo-only R2 v2 / Issue #193 canonical sync

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

### D-028 — R2 atomic persistence is deliberately narrow and approval-bound
Issue #180 / PR #182 created the original R2-specific single-transaction prerequisite; Issue #187 / PR #188 later created a distinct Yahoo-only v2 contract rather than broadening v1.

Durable requirements remain:
- exact frozen cohort/key and deterministic observation IDs
- exact approved-code/cohort binding
- fresh exact provider evidence immediately before persistence
- strict request budgets/pacing
- all required targets must be valid exact `seen` before persistence
- one PostgreSQL transaction only after all safe plans exist
- observation append + allowlisted listing snapshot update only
- no completed `sold` fabrication and no `sold_at`
- no automatic RPC write retry
- ambiguous commit state resolved by SELECT-only deterministic evidence and never by blind retry

Any new execution still needs a new task-specific approval. R2 success does not authorize R3/R4, schedules, workflow changes, Secrets/Variables changes or paid actions.

### D-029 — Breadth and history growth are separate metrics; R2 now proves first truthful history
Installing an RPC or adding listings is not history growth. The successful Yahoo-only R2 v2 execution changed Production from 113 listings / 113 observations / 0 re-observed to **113 listings / 117 observations / 4 re-observed** with completed sold still 0. Future scorecards must report breadth and repeated-history depth separately.

### D-034 — Repository migration presence is not Production schema state
A migration file being merged and Vercel READY do not mean that migration is applied to Supabase Production. After #188 the v2 function was absent; under the later exact #179 approval, repository migration `20260902180000_r2_yahoo_only_reobservation_canary_v2.sql` was applied to Production as ledger version `20260902095120`, name `r2_yahoo_only_reobservation_canary_v2`. Schema state must always be verified directly.

### D-035 — The first #179 R2 Production attempt failed closed and its approval is consumed
On 2026-09-02, the human approved one exact original R2 migration/provider/RPC scope. The reviewed v1 migration was applied, but Actions run `33605362604` stopped on the first frozen Rakuten listing `rakuten-auc-toysanta-10386044` with final outcome `not_found`.

The retained failure artifact/log does not expose provider reader diagnostics, so the exact HTTP attempt count for that first listing is not observable. The reviewed reader contract bounds it to **1–3 attempts**. The remaining three original targets received 0 provider calls.

Durable outcome:
- first target: `not_found`, attempt count unknown but bounded 1–3
- remaining provider calls: 0
- atomic RPC calls: 0
- market listings delta: 0
- observations delta: 0
- re-observed listings delta: 0
- completed sold delta: 0
- no retry

The old provider/write approval and approval token are consumed. Do not reuse them.

### D-036 — A changed R2 cohort requires a new reviewed function contract and new approval
The installed `apply_market_reobservation_r2_canary_v1(jsonb)` hardcodes the original four listing IDs and observation key. The Yahoo-only v2 path correctly used a separate reviewed migration/function and approval identity.

Required pattern for any future changed write cohort:
1. investigate/reselect read-only;
2. preserve strict identity/history safety without inferring lifecycle from `not_found`;
3. create a new reviewed bounded function/contract if frozen write identity changes materially;
4. pass repository/CI/Preview/review gates;
5. obtain fresh exact provider + Production mutation authority.

Provider symmetry is not a reason to keep a weak target.

### D-037 — Yahoo-only R2 v2 is the successful first-history proof
Issue #187 / PR #188 created a separate v2 contract rather than mutating/reusing v1.

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

The Yahoo-only choice was evidence-driven: repeated Rakuten exact probes returned `not_found`, while Yahoo had durable exact `unchanged` evidence. Provider symmetry is not a success criterion.

The Production migration was applied as ledger `20260902095120`. The later separately authorized one-shot run `33621881117` then completed successfully: 4 Yahoo attempts total, one per listing, all `unchanged`, one verified atomic RPC, and exact +0/+4/+4/+0 deltas. Production is now 113 listings / 117 observations / 4 re-observed / 0 completed sold.

### D-038 — V2 schema application and credentialed execution are separate approval facts
Under the exact #179 v2 approval, the reviewed Production migration was applied as ledger `20260902095120`; `apply_market_reobservation_r2_canary_v2(jsonb)` is present as SECURITY INVOKER with empty `search_path` and service_role-only EXECUTE. Schema application did not itself authorize a new credentialed workflow mechanism.

The human later separately authorized the exact disposable branch-only push-trigger workflow from approved code SHA `dc25eb16b7e057397fe3bf9527f5467ac54b281a`, using existing Secrets, no `workflow_dispatch`, no main merge, one automatic run and immediate same-branch workflow removal. That authorization was correctly separated from schema approval and is now consumed.

### D-039 — Successful R2 v2 execution is terminal evidence, not reusable authorization
The successful run is durable evidence:

- Actions `33621881117`, run count exactly 1
- artifact id `9843223874`
- provider attempts 4 total / 1 each / retries 0
- all outcomes `unchanged`
- one verified atomic RPC result, applied_count 4
- before 113/113/0/0 -> after 113/117/4/0 for listings/observations/re-observed/completed-sold
- deterministic v2 rows present 4/4
- each target exactly two observations, active, original price, `sold_at=null`
- shared observed_at `2026-09-02T10:55:01.023Z`
- workflow removed in commit `41add3c5629cb33ae48d0e00aca6b67270a6ea94`
- final disposable branch tree has zero file differences from approved code SHA
- deletion caused no second run and branch was never merged to main

Do not rerun R2 merely to reconfirm. R2 execution and workflow approvals are consumed. The next step is read-only Data Scale reassessment before any separately authorized R3/R4 action.

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
For the approved v1 R2 Production application, repository file `20260902150500_r2_atomic_reobservation_canary.sql` was applied through connected Supabase migration tooling, which recorded ledger version `20260902073919` with name `r2_atomic_reobservation_canary`. The approved v2 repository file `20260902180000_r2_yahoo_only_reobservation_canary_v2.sql` was later recorded as ledger version `20260902095120`, name `r2_yahoo_only_reobservation_canary_v2`.

When connected tooling generates the applied ledger timestamp, link Production schema state using the reviewed SQL body, migration name, function/object verification and execution evidence. Do not falsely classify the migration as absent solely because the repository filename timestamp is not the ledger version.

### D-044 — A repository/Preview release cannot consume a future Production schema approval
PR #188 proved the v2 migration could apply on disposable Supabase and deployed repository code to Vercel, but that release did not itself apply `apply_market_reobservation_r2_canary_v2(jsonb)` to Production. The function became present only after the later exact #179 Production approval/application recorded as ledger `20260902095120`. Repository release, Preview READY, Production Vercel READY, disposable proof, actual Production schema state and later provider/RPC execution remain distinct evidence.

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

### D-064 — Original #179 v1 one-shot workflow authorization was exact, consumed and cleaned up
For the original v1 attempt, the human authorized a disposable branch-only GitHub Actions workflow using existing repository Secrets to execute the approved v1 runner once. The workflow ran once as Actions `33605362604`, failed closed on the first provider result, and was then deleted from the branch in commit `cac883d9f74af9cad051a6fd853631f8a91ebc89`.

The disposable branch's final tree has zero file differences from its approved base and no second workflow run occurred. This authorization does not permit recreating, dispatching or rerunning an execution workflow later.

### D-065 — #188 review substitution was task-specific only
For PR #188 only, the human explicitly authorized replacing independent Reviewer + Verifier with exact-head PR Code Quality, exact-head Vercel Preview, disposable Supabase migration-apply proof, and strengthened Lead/self-review. The final reviewed head was `53d7de690a7b5aacba65f69d30b6c70249182b3d`; PR #188 then squash-merged as `f3da6c82952dd44bf343d2c1717cd62920ace116` and normal Vercel Production became READY.

This exception ended with #188. It grants no later authority.

### D-066 — Yahoo-only R2 v2 one-shot workflow authorization was exact, consumed and cleaned up
For #179 Yahoo-only v2 only, the human authorized a disposable branch from approved code SHA `dc25eb16b7e057397fe3bf9527f5467ac54b281a`, one branch-only push-trigger workflow, existing GitHub Secrets only, no `workflow_dispatch`, exactly one run, no main merge, and immediate workflow-file removal.

The workflow was added in commit `bb741654797286c801cc5c0415070e14fa96aa21`, ran once as Actions `33621881117` with SUCCESS, and was removed in commit `41add3c5629cb33ae48d0e00aca6b67270a6ea94`. Final branch file diff from the approved base is zero; run count is exactly one. This authorization is consumed and cannot be reused for R2/R3/R4 or any other execution.

## Business priority

### D-070 — Revenue-relevant work outranks infrastructure for its own sake
Prioritize useful data density, organic traffic, affiliate clicks/sales, then AdSense readiness.

### D-071 — Data Scale remains P0
Build lawful breadth, depth and repeated history with exact provenance and fail-closed evidence semantics. Evaluate work through **DATA -> TRAFFIC -> CLICK -> REVENUE**.

R2 has proven the first truthful repeated-history path. The next Data Scale work should be chosen by fresh scorecard evidence and expected DATA gain per engineering/risk cost, not by mechanically advancing stages.
