# Gacha Lens Ordered TODO

Updated: 2026-09-14 JST

Infrastructure migration, Fair Use recovery, release-governance repair, Foundation migration repair, framework security, Japanese category routing and rerelease canonicalization are complete. Current priority is to finish the already-proven parent-series cache candidate without bypassing independent review, then reconcile the product-specific design candidate to current `main`, then choose the next revenue experiment from a fresh scorecard.

## Completed recovery / governance / security train

- [x] #219/#238 recovery gate passed and incident/freeze closed
- [x] #281 resolved after provider recovery
- [x] #282 closed without merge
- [x] #280 scheduled-write safety complete
- [x] keep `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`
- [x] keep `OFFICIAL_BOUNDED_AUTO_ENABLED=false`
- [x] legacy ingestion remains disabled
- [x] #265 merged and #262 closed; Cloudflare is authoritative Production/Preview release path
- [x] #258 merged; runtime/cache proof source binding normalized
- [x] #273 merged; fresh-database `forecast_snapshots` baseline restored
- [x] #291/#287 merged; framework security baseline and deterministic vinext toolchain repaired
- [x] #253 merged; Japanese stored category routing repaired
- [x] #261 merged; rerelease canonical year/month repair released while Official auto remains disabled
- [x] #307 merged; stale CI runs cancelled to reduce redundant Actions usage
- [ ] re-enable either scheduled write lane only under a new lane-specific approval

## P1 current release candidate — #285 / #286 parent-series edge cache

- [x] bounded matcher implementation exists
- [x] current branch rebased/reconciled to current `main` with behind 0 at checkpoint
- [x] PR Code Quality `34816583524` PASS
- [x] Cloudflare cache proof `34816583550` PASS
- [x] Cloudflare runtime smoke `34816583572` PASS
- [x] dedicated parent-series exact-Preview proof PASS through validation-only #308
- [x] parent-series cold `MISS` -> `HIT` -> `HIT`
- [x] byte-identical 64,736-byte HTML within proof run
- [x] `series-detail-1800-v1`, no `Set-Cookie`
- [x] public runtime/auth/security checks PASS
- [x] #308 closed without merge
- [ ] obtain a genuine independent Verifier result on the frozen current candidate
- [ ] obtain a genuine independent Reviewer result on the frozen current candidate
- [ ] after independent PASS, re-fetch `main` and confirm no intervening overlap/drift
- [ ] apply Auto-Merge and Production Release gates in full
- [ ] squash merge only if every gate remains green
- [ ] observe the normal Git-triggered Cloudflare release and run bounded Production smoke
- [ ] close #285 only after released behavior is verified
- [ ] do not claim measured Production egress savings without actual measurement

## P1 product experience — #303 Collector Editorial design

- [x] product-specific design direction and `DESIGN.md` exist
- [x] initial object-first home/design implementation exists
- [x] design-contract/visual-QA scaffolding exists
- [ ] reconcile #303 non-destructively onto then-current `main`
- [ ] inspect all overlap with landed framework/category/rerelease/CI changes
- [ ] rerun exact-head Code Quality and applicable Cloudflare build/runtime validation
- [ ] validate real Japanese data at 360 px
- [ ] validate real Japanese data at 390 px
- [ ] validate desktop
- [ ] review home, catalog/search, series detail and ranking
- [ ] review no-evidence state
- [ ] review missing-image state
- [ ] review long Japanese names
- [ ] review loading and error states
- [ ] establish/approve screenshot visual-regression evidence
- [ ] confirm market/data semantics are unchanged
- [ ] independent review as required by the final release risk
- [ ] release only after complete visual/product gate passes

## P1 business / monetization decision

Before reviving old data-dependent monetization Drafts:
- [ ] run a fresh current-state business scorecard
- [ ] measure current first-party outbound demand and monetization coverage
- [ ] compare monetization opportunity against further market-depth/data-scale work
- [ ] make the next experiment decision from current evidence rather than the 2026-09-06 snapshot

If monetization still wins:
- [ ] refresh/recompute #264 cohort on then-current data
- [ ] reconcile #264 onto current `main`
- [ ] reconcile/revalidate #267 provider-read binding
- [ ] reconcile/revalidate #269 durable authorization ledger
- [ ] independently review the ledger before release
- [ ] reconcile any Production migration-history state only through a separate exact-evidence plan; never blind `db push`
- [ ] check configuration readiness without exposing secret values
- [ ] obtain a fresh exact provider-read approval before any provider call
- [ ] keep provider execution and affiliate-provenance persistence separately gated

## Reliability / cost hygiene — #284

- [x] exact two Cloudflare proof-workflow paths have the previously approved bounded Build Watch exclusion
- [ ] establish current before/after evidence for the remaining docs-only-build problem
- [ ] do not broaden exclusions speculatively
- [ ] prove any future docs-only skip without breaking runtime-relevant Preview builds
- [ ] close #284 only when its actual current acceptance criteria are met

## HOLD — #257 / #260 R5 Data Scale

- [ ] keep HOLD unless a fresh business scorecard shows cross-provider depth work outranks current product quality / monetization
- [ ] if reprioritized, recompute all data-dependent inputs and rebase/revalidate from then-current `main`

## Backlog hygiene

- [ ] review stale Draft #232 in a separate bounded cleanup task; do not delete history or silently discard still-useful decisions
- [ ] consolidate future canonical-doc updates so `HANDOFF`, `STATUS`, `DECISIONS` and `TODO` do not drift from live GitHub state again

## Hard boundaries

- [ ] no direct main push
- [ ] no Production DB/schema/data/history by implication
- [ ] no DNS/Auth/write/admin change by implication
- [ ] no workflow dispatch/change by implication
- [ ] no Secrets/Variables change by implication
- [ ] no scheduled-lane re-enable by implication
- [ ] no provider/load experiment by implication
- [ ] no paid/destructive action without approval
- [ ] no automatic RPC retry
- [ ] keep ingestion disabled
- [ ] never touch `supabase/.temp/cli-latest`
- [ ] no Mercari/Amazon scraping
