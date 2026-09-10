# Gacha Lens Ordered TODO

Updated: 2026-09-11 JST

Infrastructure migration and released Egress mitigations are complete. Current work is incident recovery preparation, security triage and controlled post-reset release planning.

## P0 — #280 scheduled-write safety

- [x] `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`
- [x] `OFFICIAL_BOUNDED_AUTO_ENABLED=false`
- [x] legacy ingestion remains disabled
- [x] other automatic lanes audited false/no-op
- [x] repeated P3 natural no-op/write0 evidence
- [x] Official natural no-op/write0 — run #15 `34324135554`, exact main, disabled gate, audit/plan/transaction skipped, DB writes 0
- [x] second Official persistence proof — run #16 `34449938117`, same disabled/no-op/write0 result
- [x] canonical state synchronized in #250
- [ ] close #280 as completed control-gap work; closure must not re-enable variables
- [ ] keep both vars false through #238 closure
- [ ] re-enable only under new lane-specific approval

Do not manual-dispatch merely to manufacture evidence.

## P0 recovery gate — #219/#238

After the provider actually enters the post-2026-09-12 cycle:
- [ ] confirm next billing cycle is visibly active
- [ ] confirm Fair Use restriction cleared / no HTTP 402
- [ ] record fresh Gacha-filtered Egress baseline
- [ ] run minimal public/runtime smoke
- [ ] confirm no former amplifier recurrence
- [ ] take a second provider-usage sample after dashboard refresh and calculate fresh burn slope
- [ ] require comfortable Free compatibility; conservative target <=0.12 GB/day
- [ ] reassess #281/#282
- [ ] synchronize canonical evidence
- [ ] close #219/#238 only when all gates are green
- [ ] keep P3/Official variables false during and after freeze closure until separate lane approvals

Do not infer recovery from calendar date or one healthy request alone.

## P0 — #281 / Draft #282

- [x] confirm public degraded body + outer-200 misclassification during restriction
- [x] #282 exact `4d95413a9dcdd9a35555f5f40e47568f53a5245d` covers 14/14 audited public server-data route shapes
- [x] repository/vinext/exact Preview evidence green
- [ ] after reset, recheck root/series/parent-series and representative public data routes
- [ ] if healthy service/HTTP semantics return: preserve/close #282 without shipping
- [ ] if incident persists: genuine independent review + bounded Preview CPU/TTFB comparison + explicit Production authority

## P1 security — #287

Current `npm ci` warning: 12 vulnerabilities = 1 critical / 8 high / 2 moderate / 1 low.
- [ ] identify exact advisories and dependency paths from current lockfile
- [ ] classify runtime-reachable vs build/dev-only
- [ ] identify smallest non-breaking patched versions
- [ ] test any patch in isolated non-Production scope
- [ ] never use `npm audit fix --force` blindly
- [ ] if runtime-reachable critical/high is confirmed, place repair ahead of #253/#261 ordinary release work

## Governance / CI prerequisites

### #265 / #262
- [x] exact `c8d671abc9be785f3c6c34a3ff6ceef858e07d3a` implemented/validated
- [ ] genuine independent review
- [ ] wait for #238 clearance
- [ ] refresh exact evidence and land; close #262 only when policy is on main

### #258
- [x] exact `76dac8708abaffd2ffcada7d7aa64bdc49b06e90` prior runtime/cache/CQ PASS
- [ ] after freeze, re-confirm deployed Production source identity
- [ ] repin/revalidate if Production moved
- [ ] satisfy applicable workflow-file approval boundary
- [ ] land after #265

## User value

### #253 Japanese category routing
- [ ] after #265/#258 and security triage, rebase to current main
- [ ] exact CI/Preview/browser/runtime proof
- [ ] release under applicable Production authority

### #261 rerelease canonical fix
- [ ] rebase/revalidate after #253
- [ ] obtain applicable Production release approval
- [ ] release code while keeping `OFFICIAL_BOUNDED_AUTO_ENABLED=false`
- [ ] request separate lane-specific re-enable only if/when natural F0 execution should resume
- [ ] after authorized re-enable, observe next natural bounded F0; do not force dispatch

## Reliability / cost

### #284 docs-only Cloudflare builds
- [x] Build Watch supports `docs/*` exclusion
- [ ] after freeze/separate settings approval, set only `docs/*` exclude
- [ ] prove docs-only skip and runtime-change Preview still works

### #285 / #286 parent-series edge cache
- [x] bounded exact matcher implementation + CQ + exact Preview PASS
- [ ] only after healthy service returns, run one bounded parent-series cold->warm exact-Preview proof
- [ ] measure origin behavior before claiming savings
- [ ] release only if measured value justifies it

## Monetization / DB lane

### #264 -> #267 -> #273 -> #269
- [ ] after user-value/recovery prerequisites, run a fresh business scorecard
- [ ] if affiliate monetization still dominates, refresh/rebase #264 cohort and #267 provider-read binding
- [ ] then independently review #273 exact `42c8f9934a92cda0be5fd58f2dccc7d4db17299c`
- [ ] fresh Production catalog/history parity for #273
- [ ] approve exact reconciliation; no blind `db push`
- [ ] independently review/revalidate #269 exact `574a9a4c10c3fd6cd275229c95c9b3adef8de84f`
- [ ] configuration readiness preflight
- [ ] obtain a new exact human provider-read approval; never reuse old tokens
- [ ] provider calls and persistence remain separately unauthorized until their exact gates

#273 is deliberately moved out of the pre-#253 release path because it is not required by #253/#261; it returns immediately before the #269 DB-dependent lane that actually needs it.

## HOLD

- [ ] #257/#260 R5 Data Scale remains HOLD unless fresh evidence says depth now outranks user value/monetization

## Canonical docs — #250

- [x] record P3 repeated no-op/write0
- [x] record Official runs #15/#16 repeated natural no-op/write0
- [x] add recovery-observation phase
- [x] move #273 behind current user-visible fixes and into monetization/DB lane
- [x] record #287 dependency-security triage
- [x] clarify #261 merge does not imply Official lane re-enable
- [ ] keep Draft during #238
- [ ] refresh from fresh post-reset evidence before any main merge

## Hard HOLD — Production/actions

- [ ] no direct main push
- [ ] no Production runtime merge during #238
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
