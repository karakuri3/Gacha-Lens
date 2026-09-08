# Gacha Lens Ordered TODO

Updated: 2026-09-09 01:31 JST

Infrastructure migration and released Egress mitigations are complete. Current work is incident stabilization + post-reset release preparation.

## P0 — #280 scheduled-write safety

- [x] `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`
- [x] `OFFICIAL_BOUNDED_AUTO_ENABLED=false`
- [x] legacy ingestion remains disabled
- [x] other automatic lanes audited false/no-op
- [x] observe a real P3 natural no-op/write0 run — run `34220342461` / #75, `event=schedule`, provider skipped, DB writes 0
- [ ] observe Official first post-disable natural no-op/write0 run after 2026-09-09 11:27 JST
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
- [x] complete exact-head inventory of all 26 `app/**/page.js` files
- [x] classify public server-data SSR into 14 route shapes
- [x] verify current Worker allowlist/matchers cover 14/14 route shapes
- [x] exact PR-head Code Quality `34217094679` SUCCESS
- [x] vinext `34217094908` SUCCESS
- [x] full Node suite including parent-series and route-scope regression PASS
- [x] exact Cloudflare commit Preview deployment for `4d95413a...` SUCCESS
- [x] unresolved review threads 0
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

### #285 / Draft #286 parent-series edge-cache coverage
- [x] confirm canonical `/series/group/:slug` links/sitemaps/server-data route
- [x] confirm current Production 30m `seriesDetail` matcher covers only `/series/:slug`
- [x] prepare bounded branch-only matcher for exactly `/series/:slug` + `/series/group/:slug`
- [x] retain existing 30-minute TTL and auth/cookie/Next-internal/query/error-document exclusions
- [x] exact #286 Code Quality `34217874920` PASS
- [x] exact #286 Cloudflare commit Preview `cc6891c4...workers.dev` deployment PASS
- [ ] after restriction clears, validate one bounded healthy parent-series cold->warm exact-Preview proof
- [ ] measure before/after origin behavior before claiming savings
- [ ] obtain applicable review/release authority if still justified
- [ ] no Production merge during #238

## Governance — #265/#262

- [x] Draft #265 exact `c8d671abc9be785f3c6c34a3ff6ceef858e07d3a` implemented/validated
- [ ] independent review
- [ ] wait for #238 clearance
- [ ] refresh exact evidence if stale
- [ ] land safely and close #262 only when Cloudflare policy is authoritative on main

## CI proof authority — #258

Current exact candidate: `76dac8708abaffd2ffcada7d7aa64bdc49b06e90`.
- [x] prior exact-head runtime smoke PASS
- [x] prior exact-head cache proof PASS
- [x] prior exact-head Code Quality PASS
- [ ] after freeze, re-confirm deployed Production source identity
- [ ] repin/revalidate if Production moved
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
- [x] record complete #282 26-page / 14-route / 14-of-14 audit
- [x] record P3 natural schedule no-op/write0 PASS
- [x] record #284 docs-build cost follow-up
- [x] record #285/#286 parent-series edge-cache implementation + pending runtime proof
- [x] record #258 current exact release-train candidate
- [x] record independent review + performance gates
- [ ] record Official natural no-op/write0 result after first post-disable 11:27 JST opportunity
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
