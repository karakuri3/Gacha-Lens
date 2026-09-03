# Gacha Lens Durable Decisions

Updated: 2026-09-03 JST — #211 history buffer restored / Issue #212 canonical sync

This file records decisions that must survive thread changes. Git history retains prior exhaustive wording; the entries below are the current normative set. Reopen only when new evidence justifies it.

## Product / business

### D-001 — Series-first discovery
Public discovery remains `search/browse -> series -> lineup -> variant detail`. Variant-first is appropriate for market evidence/history views.

### D-002 — Image truthfulness
Do not present imagery as variant-specific unless evidence proves variant scope.

### D-003 — Business decision order
Operate in the order **DATA -> TRAFFIC -> CLICK -> REVENUE**. Infrastructure is only valuable when it improves truthful user-facing data, traffic, click value or monetization evidence.

## Market evidence / Data Scale

### D-010 — Approved programmatic marketplace sources
Primary approved programmatic market sources remain Yahoo Shopping API, Rakuten Ichiba API and explicitly approved feeds. Do not scrape Mercari or Amazon.

### D-011 — Evidence semantics stay separated
Never mix completed/sold evidence with active asking-price evidence. `sold_out` is inventory/unavailability state, not completed-sale proof.

### D-012 — Single-item matcher stays strict
Do not weaken matching merely to increase coverage. Complete sets, ambiguous candidates, wrong editions and multi-variant listings must not leak into variant prices.

### D-013 — Recall alone does not justify Production upgrade
Higher raw recall without higher safe accepted unique coverage does not justify replacing a strict Production lane.

### D-014 — Complete sets remain series-level evidence
Accepted complete/full sets remain series-scoped. Broad automatic complete-set persistence is unapproved.

### D-016 — Re-observation is append-only, identity-stable and fail-closed
- ordinary current states are `active` / `sold_out`
- later successful checks append observations even when unchanged
- listing identity and matching provenance do not drift during ordinary re-observation
- deterministic observation identity is mandatory
- older timestamps fail closed
- equal timestamp + conflicting state fails closed
- disappearance/provider failure never fabricates completed sold
- Production persistence always remains separately approval-gated

### D-017 — Credentials only reach reviewed official endpoints
Credential-bearing requests stay on reviewed HTTPS endpoints. Arbitrary host/path/query/fragment, embedded credentials, unsafe redirects or identity mismatch fail closed.

### D-018 — Repository release is not Production DB authority
Repository merge, Preview READY, normal Vercel Production READY, disposable migration proof and actual Supabase Production schema/data state are separate facts.

### D-019 — Depth work remains explicit and dry-run first
Depth work uses explicit variant/series targets, strict identity matching, durable dedupe and bounded request envelopes. R3 read-only and R4 persistence remain separate approval stages.

### D-020 — Production writes remain bounded and gated
Keep exact identity, frozen cohorts/manifests, deterministic IDs, bounded writes, verification and fail-closed behavior. Never bypass a guard to make a run succeed.

### D-024 — Use lawful existing-source history/depth before provider-count expansion
On reviewed sources, truthful history/depth is the near-term DATA multiplier before another broad marketplace provider, unless current Scoreboard evidence selects a different bottleneck.

### D-025 — History/depth rollout stages are separately approved
Canonical plan: `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`.

- R1 exact-provider read-only
- R2 tiny Production history persistence
- R3 depth read-only
- R4 depth persistence

Approval for one stage never authorizes another. No schedule/budget scaling is automatic.

### D-026 — R1 #172 is terminal historical evidence
R1 completed with Production writes0. Its provider budget/authority is exhausted and must not be reused.

### D-028 — R2 RPCs are historical proof, not reusable authority
Original R2 v1 and Yahoo-only R2 v2 prove the safety pattern. Their approvals/tokens/workflows are consumed. Do not invoke old RPCs merely because they exist.

### D-029 — Breadth and repeated history are separate scorecard metrics
New listings can increase the denominator without increasing repeated-history count. Threshold status must always use current live denominator.

### D-034 — Repository migration presence is not Production schema state
Verify Supabase Production directly. Repository timestamps and generated Supabase ledger timestamps may differ; link state by reviewed SQL body, migration name, object verification and execution evidence.

### D-035 — Original R2 v1 failure was a correct fail-closed outcome
Run `33605362604` stopped on the first Rakuten `not_found`; remaining provider calls0/RPC0/writes0. Do not rerun it.

### D-037 — Yahoo-only R2 v2 is the first successful history proof
Run `33621881117`: four Yahoo attempts, all unchanged, exactly one verified atomic RPC, Production 113/113/0 -> 113/117/4, sold0.

### D-038 — Schema approval and credentialed execution mechanism are separate facts
Production migration application does not automatically authorize a credentialed GitHub Actions mechanism. One-shot workflow authority must be explicit when required.

### D-045 — Reusable bounded re-observation v1 replaces bespoke history canaries
Generic contract:
- explicit frozen cohort 1..10
- Yahoo/Rakuten exact persisted identities
- exact-main + observation-key + complete frozen snapshot/prior-count digest
- distinct namespace `APPROVE_MARKET_REOBSERVATION_BOUNDED_V1`
- dry-run provider/RPC/write0
- approved write mode max3 attempts/listing / max30 total
- one atomic RPC only after all targets safe
- deterministic IDs recomputed in SQL
- resolver manifest before RPC
- no automatic RPC retry
- append observation + allowlisted listing snapshot update only
- never completed sold/sold_at
- SECURITY INVOKER / empty search_path / service_role-only

### D-046 — Canonical and persisted marketplace identity are separate guards
Node proves canonical provider/native/public identity. RPC inputs also freeze and exact-match persisted DB `source_url`, `raw.provider`, `raw.source_listing_id` and `raw.public_url`.

### D-047 — Exact lane truth is distinct from concurrent global growth
Target rows, deterministic IDs and per-target prior/post counts remain exact. Global counts may legitimately grow due to unrelated approved P3 work and are checked with minimum-delta sanity where appropriate.

### D-048 — Ambiguous write resolution requires pre-RPC evidence
A sanitized resolver manifest must exist before RPC. Ambiguous commit state is resolved with SELECT-only `committed | not_committed | inconsistent`; resolution never grants automatic retry.

### D-049 — Generic bounded v1 schema is installed in Production
Production ledger: `20260902165958 / market_reobservation_bounded_v1`. Function `apply_market_reobservation_bounded_v1(jsonb)` is SECURITY INVOKER, empty search_path and service_role-only. Do not reapply the migration.

### D-073 — Approval digests use the complete merged frozen payload
The first #201 hand-computed digest was invalid because persisted identity fields were omitted. Never compute approval identity from a reduced approximation. Any main change invalidates the digest.

### D-074 — The first #201 invalid-digest attempt is terminal evidence
Run `33658579004` failed before provider calls: provider0/RPC0/writes0. Its authority is consumed.

### D-076 — Independent breadth drift does not invalidate a cohort unless target invariants drift
Global count growth is allowed while exact target identity/snapshot/history invariants remain unchanged.

### D-077 — First reusable generic bounded Production batch succeeded
Run `33660684355`: 8 Yahoo attempts, retry0, 7 unchanged / 1 price_changed, exactly one RPC, Production 115/119/4 -> 115/127/12, sold0. Its authority is consumed.

### D-078 — Scoreboard threshold results are snapshot-specific
Crossing a threshold changes the next decision only for the then-current denominator. Re-fetch current Production before acting.

### D-080 — #206 R3 evidence is complete and its authority is consumed
Run `33665350076`: 5 planner requests / 5 HTTP attempts / retry0 / Production writes0. Buzz produced no new safe listing; 伏黒恵 produced one strict-safe new Yahoo candidate `yahoo-suruga-ya-601199451001` at evidence price 980. R3 did not authorize R4.

### D-081 — #208 R4 prerequisite is repository capability only
PR #208 merged the atomic insert-only R4 contract. It did not apply the R4 migration to Production and did not persist the candidate.

### D-082 — R4 atomic depth persistence is one-RPC, insert-only and preflight-bound
R4 requires:
- frozen explicit 1..10 batch
- exact-main + complete manifest digest
- `APPROVE_MARKET_DEPTH_R4_ATOMIC_V1`
- dry-run SELECT-only/provider0/RPC0/write0
- no provider discovery in write mode
- exact catalog/depth/unresolved/collision checks
- deterministic listing + first observation
- whole-batch validation then one atomic function transaction
- no UPDATE/DELETE/completed sold/sold_at
- SECURITY INVOKER / service_role-only
- resolver manifest saved before RPC
- no automatic RPC retry

### D-083 — #208 review substitution was one-time and is consumed
The user allowed exact-head CI + Preview + disposable migration proof + strengthened self-review to replace unavailable independent Reviewer/Verifier **for PR #208 merge only**. It authorized no Production R4 action.

### D-084 — Denominator growth can reopen a previously passed threshold
Production moved from 115 listings / 12 re-observed (10.43%) to 127 / 12 (9.45%) through independent breadth growth. Prior bottleneck labels are never permanent.

### D-085 — Every R4 Production attempt needs fresh rebinding and approval
Before R4:
1. confirm current main;
2. re-read target catalog/review/unresolved/depth/collision state;
3. re-evaluate Scoreboard;
4. rebuild frozen manifest/digest;
5. request new R4-specific Production approval;
6. separately authorize any credentialed disposable workflow if required;
7. no automatic RPC retry.

### D-086 — #211 restored a material history buffer and is terminal evidence
Run `33726009433` used exact main `d7955b285fccd93b327ffb8d80594d400660c68c`, key `reobs-v1:bounded-20260903-02`, digest `7435ea9e78f1ebf5b27667bd0c252d48fbc6ef952ceb35d34c850c61ba7e68e3`.

Evidence:
- Yahoo attempts 10 total / exactly1 each
- retries0 / throttle0 / timeout0
- 9 unchanged / 1 price_changed
- 伏黒恵 `yahoo-suruga-ya-601192353001`: 1670 -> 1690 JPY, active retained
- resolver manifest preserved before RPC
- exactly one verified bounded RPC
- Production 127/139/12/sold0 -> **127/149/22/sold0**
- repeated-history rate **17.3228%**
- deterministic rows10/10; all targets exactly2 observations
- artifact `9881996601`, digest `sha256:c48abfa07cfcf78b81b661b4a09e5d43399e057f8507733a9f27f12509effdbe`
- workflow removed; cleanup `4ddccbb062ed0aa54742a6f6be4bbea7232b4389`; final file diff0/run count1/never merged

#211 authority is consumed/non-reusable. Never rerun `33726009433` merely to reconfirm.

### D-087 — After #211, do not compound history automatically
At the current 127-listing denominator, 22 re-observed listings provide a 17.32% history buffer. The next action is a fresh Scoreboard reassessment, not another automatic history batch. Depth is likely next based on prior evidence, but only current read-only metrics may select it.

## SEO / traffic

### D-030 — Preserve separate root/series/variant sitemaps
Do not collapse them without current indexing evidence.

### D-031 — No mass SEO pruning without evidence
Use current Search Console/performance evidence before mass noindex/delete decisions.

### D-032 — Pagination is self-canonical
Indexable page2+ URLs canonicalize to themselves; preserve noindex behavior that prevents search/filter index explosion.

## Automation / safety

### D-040 — Explicit approval boundaries
Explicit approval is required for Production DB writes/migrations/backfills/cleanup/schema/seed/reset, approval-bound live provider execution, workflow/schedule changes or dispatch, Secrets/Variables changes, paid actions, destructive work, direct main pushes, material Production-capable automation, ineligible merges/releases/gate changes and major unresolved product/security decisions.

### D-041 — Hard repository constraints
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually modify F0 auto or P3 V2 auto
- do not enable Kitan/Qualia auto without applicable approval
- do not rerun completed/failed canaries without fresh task-specific authority

### D-042 — Foundation migration-order assertion is stale harness debt
Disposable DB successfully applied 9, 10, 11 and 12 migrations in later proofs while the workflow still expects the original eight. This is harness debt, not migration failure. Repair remains a separate Production-capable workflow-change approval boundary.

### D-043 — Never fake independent review
Lead self-review is not independent Reviewer/Verifier evidence. When policy requires independence and no independent agent exists, obtain a fresh task-specific substitution from the user; old substitutions are not reusable.

### D-044 — Major Production milestones force canonical sync
After Production/recovery/security/release milestones, update `HANDOFF / STATUS / DECISIONS / TODO` before the next major implementation/execution phase, even if the user says only “continue”.
