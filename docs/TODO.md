# Gacha Lens Ordered TODO

Updated: 2026-09-08 19:47 JST

Infrastructure migration and released Egress mitigations are complete. Current work is incident stabilization + post-reset release preparation.

## P0 — #280 scheduled-write safety

- [x] `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`
- [x] `OFFICIAL_BOUNDED_AUTO_ENABLED=false`
- [x] legacy ingestion remains disabled
- [x] other automatic lanes audited false/no-op
- [ ] observe a real P3 natural no-op/write0 run; 18:17 JST opportunity was not observed as of 19:19 JST
- [ ] next P3 natural opportunity: 21:17 JST
- [ ] observe Official first post-disable natural no-op/write0 run: 2026-09-09 11:27 JST
- [ ] keep both vars false through #238 closure
- [ ] re-enable only under new lane-specific approval

Do not manual-dispatch merely to manufacture evidence.

## P0 — #281 public-read outage

- [x] confirm Production root/core data routes render branded data-source error during restriction
- [x] confirm external root can be classified HTTP 200 while serving degraded content
- [x] confirm Production `/series/group/series-1` is also currently affected
- [ ] after reset, recheck root, series, parent-series and representative public data routes
- [ ] determine whether normal data service is restored
- [ ] determine whether healthy HTTP semantics are restored

## P0 containment — Draft #282

Current exact candidate: `4d95413a9dcdd9a35555f5f40e47568f53a5245d`.
Previous `68465cfa...` is superseded due missing `/series/group/:slug` coverage.

Completed:
- [x] request-scoped `AsyncLocalStorage` failure tracking
- [x] late streamed failure capture via same-context response clone drain
- [x] explicit bounded public-data HTML allowlist
- [x] include `/series/group/:slug`
- [x] exclude legal/editorial/admin/client/API surfaces
- [x] 503 + no-store + Retry-After + `X-Gacha-Degraded` mapping
- [x] no new Supabase/provider request/retry
- [x] exact PR-head Code Quality `34216342875` SUCCESS
- [x] full Node suite including parent-series regression PASS
- [x] lint/whitespace PASS
- [x] merge-tree vinext compatibility/build `34216342824` SUCCESS
- [x] exact Cloudflare build `60c3707c-a7dd-4ec3-9213-ce15a46df382` SUCCESS
- [x] exact Preview `c79cbb42...workers.dev`
- [x] external exact Preview root scan failed/pagesScanned0 during outage
- [x] superseding Reviewer/Verifier packet posted for current head
- [x] Production runtime compatibility for AsyncLocalStorage verified read-only (`2026-09-08`, `nodejs_compat`)
- [x] Production CPU baseline captured (~27–28ms)

Remaining:
- [ ] independent Reviewer/Verifier result
- [ ] keep Draft during #238
- [ ] if still necessary after reset, bounded Preview CPU/TTFB comparison vs comparable non-drain baseline
- [ ] only if incident persists: obtain explicit applicable Production release/emergency authority
- [ ] if incident disappears: do not release unnecessarily; preserve/close after canonical sync

## P0 reset gate — #219/#238

After 2026-09-12 reset + provider clear delay:
- [ ] confirm restriction cleared/no402
- [ ] read fresh Gacha-filtered Egress
- [ ] prove Free-compatible burn with margin
- [ ] minimal public/runtime smoke
- [ ] confirm no amplifier recurrence
- [ ] reassess #281/#282 before release train
- [ ] synchronize #250
- [ ] close #238 only when all gates are green
- [ ] keep #280 vars false during closure

## Reliability / Cost backlog

### #284 docs-only Cloudflare builds
- [x] document that docs-only #250 commit triggered Preview build
- [x] confirm Cloudflare Build Watch supports `docs/*` exclusion
- [ ] after freeze/separate settings approval, set only `docs/*` exclude
- [ ] prove docs-only change skips build
- [ ] prove runtime change still produces Preview

### #285 parent-series edge-cache coverage
- [x] confirm canonical `/series/group/:slug` links/sitemaps/server-data route
- [x] confirm current 30m `seriesDetail` matcher covers only `/series/:slug`
- [ ] quantify/confirm desired freshness semantics
- [ ] prepare bounded branch-only matcher + regression if still justified
- [ ] validate cold->warm Preview safely after restriction clears or with isolated fixture
- [ ] measure before/after origin behavior before claiming savings
- [ ] no Production merge during #238

## Governance — #265/#262

- [x] Draft #265 exact `c8d671abc9be785f3c6c34a3ff6ceef858e07d3a` implemented/validated
- [ ] independent review
- [ ] wait for #238 clearance
- [ ] refresh exact evidence if stale
- [ ] land safely and close #262 only when Cloudflare policy is authoritative on main

## CI proof authority — #258

- [ ] after freeze, re-confirm deployed Production source
- [ ] repin if needed
- [ ] fresh exact-head runtime/cache proof
- [ ] obtain applicable workflow-file approval boundary
- [ ] land #258

## Migration reproducibility — #273

Current exact `42c8f9934a92cda0be5fd58f2dccc7d4db17299c`; CQ/vinext/Foundation PASS.
- [ ] independent review
- [ ] wait for #238 + governance gate
- [ ] fresh Production catalog/history parity
- [ ] approve exact reconciliation
- [ ] no blind `db push`
- [ ] apply/reconcile only under separate Production change approval

## User value — #253

- [ ] rebase/revalidate after prerequisites
- [ ] exact Preview/browser/runtime proof
- [ ] release through authoritative policy

## Reliability — #261

- [ ] rebase/revalidate after prerequisites
- [ ] obtain applicable Production approval
- [ ] release
- [ ] observe next natural bounded F0 run; do not force dispatch

## Monetization lane — #264 -> #267 -> #269

Current #269 exact `574a9a4c10c3fd6cd275229c95c9b3adef8de84f`; repository/disposable DB proof PASS.
- [ ] independent review #269
- [ ] complete #273 prerequisite
- [ ] fresh business scorecard after release prerequisites
- [ ] if affiliate coverage still dominates, recompute #264 cohort on fresh data
- [ ] rebind #267 to then-current main
- [ ] configuration readiness preflight
- [ ] obtain new exact human provider-read approval
- [ ] never reuse old provider approval token
- [ ] provider calls/persistence remain unauthorized until then

## HOLD

- [ ] #257/#260 R5 Data Scale remains HOLD unless fresh evidence says depth now outranks monetization

## Canonical docs — #250

- [x] sync active restriction/#280/#281 state
- [x] supersede #282 `68465cfa...` with current `4d95413a...`
- [x] record parent-series correctness fix
- [x] record #284/#285 cost follow-ups
- [x] record independent review + performance gates
- [ ] keep Draft during freeze
- [ ] refresh again from fresh post-reset evidence before any main merge

## Hard HOLD — Production/actions

- [ ] no direct main push
- [ ] no Production runtime merge during #238
- [ ] no Production DB/schema/data/history by implication
- [ ] no DNS/Auth/write/admin change by implication
- [ ] no workflow dispatch/change by implication
- [ ] no Secrets/Variables change by implication
- [ ] no #280 re-enable by implication
- [ ] no provider/load experiment by implication
- [ ] no paid/destructive action without approval
- [ ] no automatic RPC retry
- [ ] keep ingestion disabled
- [ ] never touch `supabase/.temp/cli-latest`
- [ ] no Mercari/Amazon scraping
