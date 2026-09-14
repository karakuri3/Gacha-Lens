# Gacha Lens Ordered TODO

Updated: 2026-09-13 JST

Infrastructure migration and the Supabase Fair Use recovery are complete. Current priority is clean incident closeout, governance/CI normalization, dependency security, then user value.

## P0 recovery gate — #219/#238

- [x] next billing cycle visibly active: `2026-09-12 -> 2026-10-12`
- [x] active Fair Use restriction / HTTP 402 cleared
- [x] fresh usage baseline: org Egress `0 / 5 GB`, overage `0 GB`
- [x] separated provider usage samples remained `0.00 GB`; org-wide upper bound is comfortably <=0.12 GB/day and therefore bounds Gacha below the target
- [x] minimal public smoke: `/`, `/series`, `/series/group/tarts-y901096` healthy
- [x] former amplifier non-recurrence: about `681,290 -> 681,324` (`+34` over roughly five days)
- [x] #281/#282 reassessed: outage resolved; containment no longer needed
- [x] canonical recovery evidence synchronized in #250
- [ ] close #281 as resolved
- [ ] close #282 unmerged
- [ ] close #219/#238 as completed incident/freeze work
- [ ] keep P3/Official variables false after closure until separate lane approvals

## P0 scheduled-write safety — #280 COMPLETE

- [x] `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`
- [x] `OFFICIAL_BOUNDED_AUTO_ENABLED=false`
- [x] legacy ingestion remains disabled
- [x] repeated P3 natural no-op/write0 evidence
- [x] repeated Official natural no-op/write0 evidence
- [x] reset-day Official #18 `34680299101` no-op/write0
- [x] reset-day P3 #95 `34689497050` no-op/write0
- [x] #280 closed
- [ ] re-enable only under new lane-specific approval

## P1 security — #287

- [x] static triage completed; installed baseline behind security releases
- [x] smallest preferred targets identified: Next/`eslint-config-next` 16.3.3, React/ReactDOM 19.2.8
- [ ] regenerate lockfile normally in isolated branch
- [ ] run fresh `npm audit` and classify remaining dependency paths
- [ ] full Node tests + lint + vinext/Cloudflare build
- [ ] exact Cloudflare Preview smoke
- [ ] never use `npm audit fix --force`
- [ ] never hand-edit `package-lock.json`

## Governance / CI prerequisites

### #265 / #262
- [x] exact `c8d671abc9be785f3c6c34a3ff6ceef858e07d3a` implemented/validated
- [ ] genuine independent review
- [ ] refresh exact evidence on current main
- [ ] land and close #262 only when policy is authoritative on main

### #258
- [x] exact `76dac8708abaffd2ffcada7d7aa64bdc49b06e90` prior runtime/cache/CQ PASS
- [ ] re-confirm deployed Cloudflare Production source identity
- [ ] repin/revalidate if Production moved
- [ ] satisfy workflow-file approval boundary
- [ ] land after #265

## User value

### #253 Japanese category routing
- [ ] after #265/#258 and #287, rebase to current main
- [ ] exact CI/Preview/browser/runtime proof
- [ ] release under applicable Production authority

### #261 rerelease canonical fix
- [ ] rebase/revalidate after #253
- [ ] release code under applicable authority while keeping `OFFICIAL_BOUNDED_AUTO_ENABLED=false`
- [ ] request separate lane-specific re-enable only if natural F0 should resume

## Reliability / cost

### #284 docs-only Cloudflare builds
- [x] Build Watch supports `docs/*` exclusion
- [ ] apply only under separate settings approval
- [ ] prove docs-only skip and runtime-change Preview still works

### #285 / #286 parent-series edge cache
- [x] bounded matcher implementation + CQ + exact Preview PASS
- [ ] run one bounded healthy parent-series cold->warm exact-Preview proof
- [ ] measure origin behavior before claiming savings
- [ ] release only if measured value justifies it

## Monetization / DB lane

### #264 -> #267 -> #273 -> #269
- [ ] after user-value/security prerequisites, run fresh business scorecard
- [ ] if affiliate monetization dominates, refresh/rebase #264 cohort and #267 provider-read binding
- [ ] independently review #273 and reconcile Production history only with exact evidence; no blind `db push`
- [ ] independently review/revalidate #269
- [ ] obtain fresh exact provider-read approval; never reuse old tokens
- [ ] provider calls and persistence remain separately unauthorized until their exact gates

## HOLD

- [ ] #257/#260 R5 Data Scale remains HOLD unless fresh evidence says depth outranks user value/monetization

## Canonical docs — #250

- [x] recovery state synchronized
- [x] scheduled lanes remain disabled after recovery
- [x] #281/#282 disposition recorded
- [x] post-freeze release order recorded
- [ ] require exact-head Code Quality green
- [ ] merge docs-only PR through GitHub; never direct-push main

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
