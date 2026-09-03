# Gacha Lens Ordered TODO

Updated: 2026-09-03 JST — #221 Foundation CI repair complete / #218 R4 repository repair technically green / Issue #222 canonical sync

The complete ordered TODO checkpoint immediately before #222 is preserved byte-for-byte at `docs/history/2026-09-03-pre-222-TODO.md`.

Current umbrella: Issue #119 Data Scale.

## P0 — Canonical sync #222 — CURRENT

- [x] verify #221 merged to main `26a0db02fc842484d5a5cd55703deffdf3f8ba55`
- [x] verify Issue #220 closed completed
- [x] verify #221 normal Vercel Production `dpl_GhJQEfAMv6nQvWz6WztDQiS1ARDL` READY
- [x] merge current main into #218 non-destructively; no force/rebase
- [x] verify #218 PR diff remains exactly five R4 repair/test files
- [x] exact-head #218 PR Code Quality SUCCESS
- [x] exact-head #218 Vercel Preview READY
- [x] exact-head #218 Foundation baseline SUCCESS end-to-end
- [x] verify all 15 migrations apply fresh, including real service-role R4 runtime proof
- [x] verify Foundation prefix/catalog/FK/static/data-source/lint/build/cleanup all SUCCESS
- [x] latest Production SELECT-only remains 127 listings / 149 observations / 22 re-observed / sold0
- [x] verify R4 candidate + deterministic observation remain absent
- [x] verify installed Production R4 function still contains exactly one broken guard and remains quarantined
- [x] create Issue #222
- [x] preserve pre-#222 HANDOFF / STATUS / DECISIONS / TODO byte-for-byte under `docs/history/`
- [x] prepare current compact canonical checkpoints
- [ ] verify #222 docs/history diff and byte identity
- [ ] open docs-only PR closing #222
- [ ] exact-head Code Quality SUCCESS
- [ ] exact-head Vercel Preview READY
- [ ] unresolved GitHub/Vercel threads0 and main drift0
- [ ] record docs-only self-review as explicitly non-independent
- [ ] squash merge if docs-only policy remains eligible
- [ ] verify #222 closed and normal Git-triggered Vercel Production READY

Do not create a recursive canonical sync merely to record #222's own merge.

## P1 — PR #218 independent Reviewer + Verifier — NEXT

PR #218 exact verified head at this checkpoint: `80d1f5c59e73ee4ab59024ce7e3232713a4d2523`.

Technical implementation/verification is complete; do not churn the code without a concrete finding.

Required next steps:
- [ ] re-fetch current main and #218 exact head after #222 reaches main
- [ ] if main moved only by docs, reconcile #218 non-destructively if needed and rerun affected exact-head gates
- [ ] obtain independent Reviewer + Verifier if available
- [ ] do not treat Lead self-review as independent approval
- [ ] if independent review is unavailable, obtain a fresh **#218-specific human substitution**
- [ ] never reuse #208 or the one-time #180/#182 substitution
- [ ] fix every blocking finding
- [ ] rerun exact-head Code Quality / Foundation / Preview after any code change or required reconciliation
- [ ] merge only the reviewed exact head when repository merge/release policy passes
- [ ] verify normal Vercel Production release after merge

Potential independent option: Vercel Agent Code Review. Do **not** invoke it automatically because Agent usage may be billed; paid operation requires explicit approval.

## P2 — #218 repository repair contract — TECHNICALLY COMPLETE

Already satisfied on exact head `80d1f5c...`:
- [x] keep historical `20260903033000_market_depth_r4_atomic_v1.sql` immutable
- [x] replace installed broken SQL source-ID guard through a new repair migration
- [x] preserve explicit length 1..300
- [x] preserve allowed chars via PostgreSQL-safe `^[A-Za-z0-9:._-]+$`
- [x] preserve provider/native/public URL/depth/catalog/unresolved/collision guards
- [x] preserve insert-only listing + initial observation semantics
- [x] preserve no UPDATE/DELETE/completed-sold/sold_at mutation in R4 writer
- [x] preserve SECURITY INVOKER / empty search_path / service_role-only EXECUTE
- [x] qualify the historical observation-trigger relation without trigger recreation
- [x] align fresh service_role observation-table privileges without widening anon/authenticated/PUBLIC
- [x] run a real service-role function success path in disposable DB
- [x] assert exact inserted listing/observation IDs and depth before/after
- [x] roll proof fixtures back and prove zero residue
- [x] prove 301-char source ID fails as ordinary candidate validation
- [x] prove disallowed character fails as ordinary candidate validation
- [x] full Node tests / lint / whitespace / build
- [x] Vercel Preview READY
- [x] complete Foundation fresh DB/catalog/smoke proof

No Production action is implied by these checkmarks.

## P3 — Fresh approval for Production R4 repair migration — HOLD UNTIL #218 MERGED

Only after an eligible reviewed #218 merge and current canonical/release state:
- [ ] SELECT current Production function/ledger/data state
- [ ] confirm repository repair migration identity from merged main
- [ ] request fresh explicit human approval for **Production repair migration only** unless the user explicitly authorizes more
- [ ] apply repair once if approved
- [ ] verify migration ledger identity
- [ ] verify SECURITY INVOKER / empty search_path / service_role-only EXECUTE
- [ ] verify trigger function qualification and service_role table contract
- [ ] verify repaired validator runtime behavior using only the approved non-mutating/controlled mechanism
- [ ] confirm market-data delta0 from repair migration
- [ ] force canonical sync after Production repair milestone

No #214 authority survives for this step.

## P4 — Fresh R4 candidate rebind + separate one-write authorization — HOLD

Only after repaired Production function is verified:
- [ ] re-fetch exact current main
- [ ] recompute live Scoreboard
- [ ] confirm history/depth still justify R4
- [ ] re-read target variant/series/review state
- [ ] re-read exact fresh depth and existing listing ID set
- [ ] unresolved target issues0
- [ ] candidate listing/provider-native/public URL collisions0
- [ ] deterministic observation collision0
- [ ] confirm historical R3 evidence remains valid under the reviewed contract; do not silently refresh provider data
- [ ] rebuild complete R4 manifest and digest against current main/Production
- [ ] request fresh exact one-candidate R4 write approval
- [ ] save durable resolution manifest before write
- [ ] invoke exactly once if approved
- [ ] no automatic retry; ambiguity -> SELECT-only resolver only
- [ ] independently verify listing + observation + depth/global invariants
- [ ] force canonical sync after success or material failure

Production repair approval does not imply this write approval.

## P5 — Data Scale reassessment after successful R4 proof

After a successful Production R4 proof:
- [ ] fresh Scoreboard reassessment
- [ ] decide whether bounded depth scaling, lawful source breadth, non-price signals, or TRAFFIC -> CLICK -> REVENUE is highest leverage
- [ ] avoid endless infrastructure work once useful product-data thresholds are met

## Separate holds / debt

- #142/#137 F0 remains a separate approval boundary
- Foundation migration-order debt from the prior checkpoint is **resolved by #220/#221**
- GSC Wizard paid/trial state does not justify paid activation without cost approval
- unused branch `tmp-should-not-create` exists from connector routing; no effect; do not delete automatically without applicable cleanup policy/approval

## HOLD — explicit prohibitions now

- [ ] DO NOT invoke current installed Production `apply_market_depth_r4_atomic_v1(jsonb)`
- [ ] DO NOT retry #214
- [ ] DO NOT apply a Production repair migration without fresh approval
- [ ] DO NOT persist the R3/R4 candidate under old digest/approval
- [ ] DO NOT reuse #214 authority
- [ ] DO NOT reuse #208 review substitution
- [ ] DO NOT reuse one-time #180/#182 review substitution for #218
- [ ] DO NOT make new provider calls under consumed #206/#211 authority
- [ ] DO NOT run another history batch automatically
- [ ] DO NOT dispatch workflows without applicable approval
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

## Full prior TODO snapshot

`docs/history/2026-09-03-pre-222-TODO.md`

Do not create a recursive canonical sync merely to record #222's own docs-only merge.