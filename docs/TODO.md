# Gacha Lens Ordered TODO

Updated: 2026-09-03 JST — #218 R4 repository repair merged / Issue #224 canonical sync

The complete ordered TODO checkpoint immediately before #224 is preserved byte-for-byte at `docs/history/2026-09-03-pre-224-TODO.md`.

Current umbrella: Issue #119 Data Scale.

## P0 — Canonical sync #224 — CURRENT

- [x] verify #218 final exact head `10864b7cf62aeb91ff7fa96d9e5277930cb06a38`
- [x] verify final PR Code Quality #109 SUCCESS
- [x] verify final Foundation baseline #113 SUCCESS end-to-end
- [x] verify exact-head Vercel Preview READY
- [x] verify GitHub/Vercel unresolved threads0 and main drift0
- [x] record fresh #218-only human Reviewer/Verifier substitution
- [x] mark #218 ready and squash merge exact head
- [x] verify merged main `51f868b57571e0f25955ca91a1c8faff1e86c335`
- [x] verify Issue #217 closed completed
- [x] verify normal Vercel Production `dpl_6Gdzgr85kAi6CNCwbnoKKfP5b4sn` READY
- [x] post-merge Supabase Production SELECT-only remains 127 / 149 / 22 / sold0
- [x] verify R4 candidate + deterministic observation remain absent
- [x] verify Production broken guard occurrences1
- [x] verify merged repository repair migrations are not applied to Production
- [x] create Issue #224
- [x] preserve current HANDOFF / STATUS / DECISIONS / TODO byte-for-byte under `docs/history/2026-09-03-pre-224-*`
- [x] update current four canonical checkpoints
- [ ] verify #224 diff contains only 4 current canonical + 4 history files
- [ ] verify history blob identities equal pre-#224 canonical blobs
- [ ] open docs-only PR closing #224
- [ ] exact-head Code Quality SUCCESS
- [ ] exact-head Vercel Preview READY
- [ ] unresolved GitHub/Vercel threads0 and main drift0
- [ ] record docs-only self-review as explicitly non-independent
- [ ] squash merge under docs-only safe policy
- [ ] verify #224 closed and normal Git-triggered Vercel Production READY

Do not create a recursive canonical sync merely to record #224's own docs-only merge.

## P1 — Production R4 repair migration approval — NEXT / HOLD FOR HUMAN APPROVAL

Repository repair is merged. Supabase Production is still unrepaired.

Before requesting/executing approval:
- [x] identify exact merged repair set:
  - `20260903183500_market_observation_trigger_schema_qualification.sql`
  - `20260903183530_market_observation_service_role_contract.sql`
  - `20260903183600_market_depth_r4_postgres_regex_repair.sql`
- [x] latest SELECT-only proves current Production remains 127 listings / 149 observations / 22 re-observed / sold0
- [x] candidate listing0 / deterministic observation0
- [x] installed broken guard occurrences1
- [x] repair migrations applied=false
- [ ] after #224 reaches main, re-fetch exact current main and live Production function/ledger/data state
- [ ] request fresh explicit human approval for **Production R4 repair migration set only**

DO NOT apply any repair migration before that fresh approval.

## P2 — Apply and verify Production repair — ONLY IF P1 APPROVED

If and only if the Production repair set is explicitly approved:
- [ ] re-confirm exact current main and reviewed migration identities immediately before mutation
- [ ] apply the three merged repair migrations exactly once through the normal reviewed migration mechanism
- [ ] do not rewrite historical migration files or manually alter ledger timestamps
- [ ] verify Production ledger records the repair identities
- [ ] verify `sync_market_observation_links()` uses `public.market_listing_observations`
- [ ] verify observation-table `service_role` CRUD preserved and anon/authenticated/PUBLIC not widened
- [ ] verify R4 function SECURITY INVOKER / empty search_path / service_role-only EXECUTE
- [ ] verify broken `{1,300}` guard is gone and explicit length + safe allowlist guard is installed
- [ ] use only the reviewed approved validation mechanism; do not persist a candidate
- [ ] verify market listings / observations / sold counts have delta0 from migration repair itself
- [ ] force canonical sync after Production repair milestone

Production repair approval does not authorize candidate persistence.

## P3 — Fresh R4 candidate rebind + separate one-write approval — HOLD

Only after repaired Production function is verified:
- [ ] re-fetch exact current main
- [ ] recompute live Scoreboard
- [ ] confirm history/depth still justify R4
- [ ] re-read target variant/series/review state
- [ ] re-read exact fresh depth and existing listing ID set
- [ ] unresolved target issues0
- [ ] candidate listing/provider-native/public URL collisions0
- [ ] deterministic observation collision0
- [ ] determine whether historical R3 evidence remains valid; do not silently refresh provider data
- [ ] rebuild complete R4 manifest and digest against current main/Production
- [ ] request fresh exact one-candidate R4 write approval
- [ ] save durable resolution manifest before write
- [ ] invoke exactly once if approved
- [ ] no automatic retry; ambiguous commit -> SELECT-only resolver only
- [ ] independently verify listing + observation + depth/global invariants
- [ ] force canonical sync after success or material failure

## P4 — Data Scale reassessment after successful R4 proof

After a successful Production R4 proof:
- [ ] fresh Scoreboard reassessment
- [ ] decide whether bounded depth scaling, lawful source breadth, non-price signals, or TRAFFIC -> CLICK -> REVENUE is highest leverage
- [ ] avoid endless infrastructure work once useful product-data thresholds are met

## Completed repository repair contract

- [x] historical R4 migration kept immutable
- [x] trigger relation qualified without trigger recreation
- [x] fresh service_role observation-table contract aligned without widening client roles
- [x] unsupported PostgreSQL `{1,300}` validator replaced via new migration
- [x] explicit 1..300 length preserved
- [x] allowed chars preserved via `^[A-Za-z0-9:._-]+$`
- [x] provider/native/public URL/depth/catalog/unresolved/collision guards preserved
- [x] insert-only listing + initial observation semantics preserved
- [x] no UPDATE/DELETE/completed-sold/sold_at mutation in R4 writer
- [x] SECURITY INVOKER / empty search_path / service_role-only EXECUTE preserved
- [x] real service-role function success path proved in disposable DB
- [x] exact result/depth assertions + rollback + zero residue proved
- [x] invalid length/character fail closed proved
- [x] exact-head full tests/lint/whitespace/Preview/Foundation all green
- [x] #218-only human review substitution recorded and consumed
- [x] #218 merged; #217 closed; Vercel Production READY

## Separate holds / debt

- #142/#137 F0 remains a separate approval boundary
- Foundation migration-order debt is resolved by #220/#221
- GSC Wizard paid/trial state does not justify paid activation without cost approval
- unused branch `tmp-should-not-create` remains unrelated; do not delete automatically without applicable cleanup policy/approval

## HOLD — explicit prohibitions now

- [ ] DO NOT invoke current installed Production `apply_market_depth_r4_atomic_v1(jsonb)`
- [ ] DO NOT retry #214
- [ ] DO NOT apply the Production repair migration set without fresh approval
- [ ] DO NOT persist the R3/R4 candidate under old digest/approval
- [ ] DO NOT reuse #214 authority
- [ ] DO NOT reuse #208, #180/#182, or #218 review substitutions
- [ ] DO NOT make new provider calls under consumed authority
- [ ] DO NOT run another history batch automatically
- [ ] DO NOT dispatch/change workflows without applicable approval
- [ ] DO NOT change Secrets/Variables by implication
- [ ] DO NOT merge/dispatch F0/#142 without its boundary
- [ ] DO NOT invoke paid reviewer/actions without approval
- [ ] DO NOT use destructive actions without approval
- [ ] DO NOT weaken strict matcher/identity guards
- [ ] DO NOT scrape Mercari or Amazon
- [ ] DO NOT touch `supabase/.temp/cli-latest`
- [ ] keep `.github/workflows/gacha-ingestion.yml` disabled
- [ ] no automatic RPC retry
- [ ] no direct main push

## Canonical history

`docs/history/2026-09-03-pre-224-TODO.md`

Do not create a recursive canonical sync merely to record #224's own docs-only merge.