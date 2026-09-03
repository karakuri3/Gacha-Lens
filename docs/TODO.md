# Gacha Lens Ordered TODO

Updated: 2026-09-03 JST — #214 R4 fail-closed Production attempt / Issue #215 canonical sync

The complete pre-#215 ordered TODO is preserved verbatim at `docs/history/2026-09-03-pre-215-TODO.md`.

Current umbrella: Issue #119 Data Scale.

## P0 — Finish #215 canonical sync

- [x] #214 immediate prewrite drift gate PASS
- [x] apply R4 migration once to Production
- [x] verify ledger `20260903091535`, SECURITY INVOKER, empty search_path, service_role-only
- [x] persist durable resolution manifest before write
- [x] execute exactly one authorized R4 write invocation
- [x] capture synchronous PostgreSQL `2201B` regex failure
- [x] perform no retry
- [x] independently prove 127 listings / 149 observations / sold0, candidate rows absent, depth1
- [x] record fail-closed evidence and consumed authority on #214
- [x] close #214
- [x] create #215 and branch `docs/canonical-sync-post-r4-fail-215`
- [x] preserve old canonical blobs for byte-for-byte archival
- [x] prepare new compact HANDOFF / STATUS / DECISIONS / TODO checkpoints
- [ ] commit exactly 4 current canonical files + 4 byte-for-byte history archives
- [ ] verify docs-only diff and archive byte identity
- [ ] open docs-only PR closing #215
- [ ] exact-head Code Quality SUCCESS
- [ ] exact-head Vercel Preview READY
- [ ] unresolved GitHub/Vercel threads0 and main drift0
- [ ] record docs-only review, explicitly non-independent
- [ ] squash merge under docs-only safe policy
- [ ] verify #215 closed and normal Git-triggered Vercel Production READY

Do not create a recursive sync merely to record #215's own merge.

## P1 — Repository-only R4 SQL runtime repair — NEXT after #215 reaches main

Create a dedicated repair Issue/branch from the then-current main. Production mutation: 0.

Required repair:
- [ ] replace SQL `source_listing_id` regex bound `{1,300}` with explicit length `1..300`
- [ ] retain allowed characters using a PostgreSQL-safe regex such as `^[A-Za-z0-9:._-]+$`
- [ ] do not weaken provider/native/public URL/depth/catalog/unresolved/collision guards
- [ ] add a new repair migration; do not rewrite Production ledger history in place
- [ ] preserve SECURITY INVOKER / empty search_path / service_role-only
- [ ] preserve insert-only atomic listing + initial observation semantics
- [ ] preserve no UPDATE / DELETE / completed sold / sold_at
- [ ] preserve no automatic write retry

## P2 — Add real disposable-DB runtime verification

The previous gap was that migration application succeeded without invoking the function.

Before repair merge:
- [ ] create disposable Supabase from reviewed repository state using the existing safe test mechanism
- [ ] apply all migrations including repair
- [ ] invoke repaired `apply_market_depth_r4_atomic_v1(jsonb)` with a controlled valid fixture
- [ ] prove valid invocation inserts exactly one listing + one initial observation atomically
- [ ] prove target depth before/after is exact
- [ ] prove invalid source_listing_id character/length cases fail closed
- [ ] prove collision/depth/catalog guards still fail closed
- [ ] verify function security grants after repair
- [ ] keep Production writes/provider calls0 during repository verification

Also run exact-head:
- [ ] focused tests
- [ ] full Node tests
- [ ] lint
- [ ] diff whitespace check
- [ ] Vercel Preview READY
- [ ] disposable migration/runtime proof

## P3 — Review and merge repository repair

Because the repair changes callable schema/write logic:
- [ ] obtain independent Reviewer + Verifier if available
- [ ] if unavailable, stop at the review boundary and request a fresh repair-PR-specific human substitution; never reuse #208 substitution
- [ ] fix every blocking finding and rerun exact-head gates
- [ ] merge only the reviewed exact head
- [ ] verify normal Vercel Production release if applicable

Repository merge still does not repair Supabase Production automatically.

## P4 — Fresh approval for Production R4 repair migration

Only after repository repair is merged and canonical/release state is current:
- [ ] SELECT current Production function/ledger/data state
- [ ] prepare exact reviewed repair migration identity
- [ ] request fresh explicit human approval for **repair migration only** unless user explicitly authorizes more
- [ ] apply repair once
- [ ] verify SECURITY INVOKER / empty search_path / service_role-only
- [ ] run a non-mutating validation or explicitly approved controlled runtime check as designed
- [ ] confirm market-data delta0 from repair migration

No #214 authority survives for this step.

## P5 — Fresh R4 candidate rebind and new write authorization

After repaired Production function is verified:
- [ ] re-fetch exact current main
- [ ] recompute live Scoreboard before acting
- [ ] confirm history/depth still justify R4
- [ ] re-read target variant/series/review state
- [ ] re-read exact fresh depth and existing listing ID set
- [ ] unresolved target issues0
- [ ] candidate listing/provider-native/public URL collisions0
- [ ] deterministic observation collision0
- [ ] confirm source R3 evidence is still permitted/fresh under reviewed contract; if evidence age or contract invalidates it, do not silently refresh provider data
- [ ] rebuild complete R4 manifest and digest against current main/Production
- [ ] request fresh exact one-candidate R4 write approval
- [ ] save resolution manifest before write
- [ ] invoke exactly once if approved
- [ ] no automatic retry; ambiguity -> SELECT-only resolver only
- [ ] independently verify listing + observation + depth/global invariants
- [ ] force canonical sync after success or material failure

## P6 — Continue Data Scale or move toward traffic/revenue based on evidence

After successful R4 proof:
- [ ] fresh Scoreboard reassessment
- [ ] decide whether bounded depth scaling, lawful source breadth, non-price signals, or TRAFFIC -> CLICK -> REVENUE is the highest leverage
- [ ] avoid endless infrastructure work when useful product data thresholds are met

## Separate holds / debt

- #142/#137 F0 remains separate approval boundary
- Foundation migration-order assertion still has known stale expected-version debt; do not bundle workflow repair into R4 repair
- GSC Wizard paid/trial state does not justify paid activation without cost approval

## HOLD — explicit prohibitions now

- [ ] DO NOT invoke current installed `apply_market_depth_r4_atomic_v1(jsonb)`
- [ ] DO NOT retry #214
- [ ] DO NOT apply a Production repair migration without fresh approval
- [ ] DO NOT persist the R3 candidate under old digest/approval
- [ ] DO NOT reuse #214 authority
- [ ] DO NOT reuse #208 review substitution
- [ ] DO NOT make new provider calls under #206/#211 or any consumed authority
- [ ] DO NOT run another history batch automatically
- [ ] DO NOT change or dispatch Production-capable workflows/schedules without applicable approval
- [ ] DO NOT change Secrets/Variables by implication
- [ ] DO NOT merge/dispatch F0/#142 without its boundary
- [ ] DO NOT use paid/destructive actions without approval
- [ ] DO NOT weaken strict matcher/identity guards
- [ ] DO NOT scrape Mercari or Amazon
- [ ] DO NOT touch `supabase/.temp/cli-latest`
- [ ] keep `.github/workflows/gacha-ingestion.yml` disabled
- [ ] no automatic RPC retry

## Full prior TODO snapshot

`docs/history/2026-09-03-pre-215-TODO.md`