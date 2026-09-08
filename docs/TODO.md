# Gacha Lens Ordered TODO

Updated: 2026-09-08 19:06 JST — active Supabase restriction; public-read P0; scheduled Production writes disabled; #282 repository/Preview validation complete

The company infrastructure migration is complete. Do not restart it.

## DONE — company infrastructure migration

- [x] move Gacha Lens Production runtime to Cloudflare
- [x] complete authoritative DNS/domain cutover
- [x] stop routine Vercel Git build cost
- [x] complete scoped Supabase Stage 5 hardening
- [x] preserve rollback paths and final cutover evidence

## DONE — technical Egress mitigation

### #249 shared edge reuse
- [x] release bounded shared Cloudflare cache policies
- [x] prove strict Preview `MISS -> HIT -> HIT`
- [x] release to Cloudflare Production
- [x] verify warm same-URL requests do not repeat the former backend bundle

### #251 unique-path cold-read scope
- [x] scope public detail/related signal reads to relevant variant identities
- [x] preserve required set-listing safety semantics
- [x] preserve rendered semantics
- [x] measure representative signal JSON reduction: detail -65.5%, related -48.1%
- [x] remove temporary diagnostics before Production
- [x] release to Cloudflare Production

### Post-release technical observation
- [x] observe ~0.0104 GB/day org-wide burn before enforcement
- [x] confirm known sitemap fingerprint remained nearly flat (`681,256 -> 681,290` over ~36.3h)
- [x] classify original amplification as technically controlled
- [x] keep paid-plan requirement unestablished

## INCIDENT — 2026-09-08 Fair Use restriction

Provider evidence:
- [x] record `All services are restricted`
- [x] record reason `Egress Exceeded`
- [x] record organization Egress `25.242 / 5 GB`
- [x] obtain project attribution: Gacha `23.003 GB`, Beach `0.444 GB`
- [x] determine restriction is best explained by historical current-cycle overage, not renewed post-fix burn
- [x] update #219
- [x] update #238 to Production-freeze state
- [x] avoid speculative Production workaround / paid upgrade / transfer-as-evasion

## ACTIVE P0-A — pre-reset scheduled-write guard (#280)

The quota restriction must not be the only barrier that prevents Production write lanes from waking after reset.

Completed with explicit owner approval at **2026-09-08 16:52 JST**:
- [x] set `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`
- [x] set `OFFICIAL_BOUNDED_AUTO_ENABLED=false`
- [x] verify both values false in authenticated GitHub UI
- [x] keep approval-token variables unchanged
- [x] keep Secrets/workflows/main/Production DB unchanged
- [x] repository-wide audit all known scheduled write-capable lanes
- [x] confirm legacy `.github/workflows/gacha-ingestion.yml` remains manually Disabled
- [x] confirm other market automatic lane top-level gate false
- [x] confirm Kitan automatic remains false-by-default/no-op

Natural evidence:
- [ ] observe P3's first post-disable natural no-op/write0 run (`17 */3 * * *`; first opportunity 2026-09-08 18:17 JST)
  - as of 19:06 JST no new schedule-event run is visible; this is **not yet observed**, not PASS
- [ ] observe Official's first post-disable natural no-op/write0 run (daily 11:27 JST; first opportunity 2026-09-09 11:27 JST)
- [ ] synchronize final #280 evidence into #238/#250
- [ ] close #280 only after both natural evidence gates are satisfied

Do not manually dispatch merely to manufacture evidence. Keep both enable variables false through #238 clearance. Future re-enable is a separate lane-specific authorization; the disable approval is consumed and non-reusable.

## ACTIVE P0-B — public-read outage (#281)

- [x] confirm core public data routes render `商品情報を取得できません` during active restriction
- [x] confirm Production root can still be seen externally as HTTP 200 with only a tiny degraded shell (~39 chars)
- [x] classify this as a real availability/HTTP-semantics incident, not only ingestion freshness
- [x] create repository-only containment Draft #282
- [x] keep Production untouched under #238

After reset / before any normal release:
- [ ] recheck `https://gachalens.com/` and representative public data routes
- [ ] determine whether normal product data is restored
- [ ] determine whether healthy HTTP semantics are restored
- [ ] if restored, do **not** ship #282 merely because it is green; preserve/close it after canonical incident sync
- [ ] if outage/outer-200 misclassification persists, keep #281 P0 and evaluate #282 under independent review + explicit applicable emergency/release authority

## DONE — #282 repository/Preview technical validation

Draft #282 exact head: `68465cfa344fda65c6968e6bdb1af11d6abbd983`.

- [x] request-scoped `AsyncLocalStorage` failure tracking
- [x] late streamed Server Component failure capture by draining one clone inside the same request context
- [x] explicit public-data HTML allowlist
- [x] exclude legal/editorial/admin/client/API surfaces from stream draining
- [x] remap only tracked GET outer-200 `text/html`
- [x] 503 + no-store + Retry-After + `X-Gacha-Degraded` contract
- [x] preserve branded-marker cache exclusion as defense-in-depth
- [x] no new Supabase/provider request or retry
- [x] PR Code Quality `34212560491` SUCCESS
- [x] full Node suite PASS
- [x] route-scope regression PASS
- [x] late-stream/concurrency tests PASS
- [x] lint/whitespace PASS
- [x] Cloudflare vinext POC `34212560379` SUCCESS
- [x] exact-head Cloudflare Commit Preview deployment SUCCESS
- [x] normal external scanner could not obtain exact Preview root during outage (`pagesScanned=0`)
- [x] close validation-only #283 without merge
- [x] post independent Reviewer/Verifier packet on exact head
- [ ] obtain independent Reviewer/Verifier result
- [ ] keep Draft while #238 is active
- [ ] after reset, decide whether containment is still needed before considering release

**#282 is containment, not data recovery. No Production merge/deploy is currently authorized.**

## ACTIVE P0-C — mandatory 2026-09-12 reset gate (#219/#238)

Do not attempt to clear this before fresh provider evidence exists.

After reset and any short provider-side clear delay:
- [ ] confirm organization/project restriction is cleared
- [ ] confirm no HTTP 402 remains
- [ ] read fresh-cycle **Gacha-filtered** uncached Egress
- [ ] measure burn over a meaningful fresh interval
- [ ] verify Free-plan-compatible burn with safety margin
- [ ] perform minimal public/runtime smoke without load-heavy diagnostics
- [ ] confirm no recurrence of the former sitemap/runtime amplifier
- [ ] update #219 with fresh evidence
- [ ] update #238 and close freeze only if all gates are green
- [ ] synchronize #250 canonical docs from the fresh post-reset state
- [ ] keep #280 P3/Official enable variables false during closure

If restriction does not clear after reset:
- [ ] preserve freeze
- [ ] obtain provider-side status/billing evidence before making changes
- [ ] do not buy Pro without separate current-price/terms review + explicit approval
- [ ] do not use organization/project transfer as quota evasion

## ACTIVE GOVERNANCE — #262 / authorized Draft #265

The replacement Cloudflare standing policy is already implemented. Do not recreate it.

Current evidence:
- [x] Cloudflare confirmed as Production runtime
- [x] routine Vercel Git builds intentionally disabled for cost control
- [x] main still has stale Vercel-specific standing release wording
- [x] user explicitly authorized the #262 policy alignment; authorization is recorded in Draft #265
- [x] Draft #265 exact head `c8d671abc9be785f3c6c34a3ff6ceef858e07d3a`
- [x] seven active policy/test files aligned to Cloudflare
- [x] PR Code Quality `34045587975` SUCCESS
- [x] strengthened self-review complete
- [x] independent Reviewer/Verifier packet posted
- [ ] independent Reviewer/Verifier result
- [ ] wait for #219/#238 Production freeze clearance
- [ ] re-fetch main/head and refresh exact-head evidence if stale
- [ ] merge #265 only through the applicable safe path; #265 cannot authorize its own merge
- [ ] close #262 only after the reviewed Cloudflare standing policy is on main

Do **not** re-enable routine Vercel builds merely to satisfy old wording.

## DONE — #273 repository technical validation

Draft #273 exact head: `42c8f9934a92cda0be5fd58f2dccc7d4db17299c`.

- [x] add `forecast_snapshots` fresh-replay baseline before hardening migration
- [x] avoid editing already-applied historical migrations
- [x] static schema/security/order tests
- [x] DB-backed Production-contract parity proof on disposable Supabase
- [x] Code Quality SUCCESS
- [x] vinext SUCCESS
- [x] Foundation SUCCESS
- [x] prove downstream compatibility with current #269 in #279
- [x] create independent Reviewer packet without moving head

Remaining #273 gates:
- [ ] obtain independent review
- [ ] wait for #219/#238 freeze clearance
- [ ] ensure #265/#262 governance gate is resolved before relying on standing release authority
- [ ] re-read fresh Production catalog + migration history before any release
- [ ] design/approve exact Production migration-history reconciliation
- [ ] explicitly reject blind `db push` if remote/local history still differs
- [ ] apply/reconcile only under a separate Production change approval

## DONE — #269 repository technical validation

Draft #269 exact head: `574a9a4c10c3fd6cd275229c95c9b3adef8de84f`.

- [x] durable one-time authorization claim
- [x] replay/reopen/reset prevention
- [x] 1..10 target / 2-phase / 3-attempt budget enforcement
- [x] serial provider-attempt reservation
- [x] discovery-before-affiliate-enrichment
- [x] whole-batch stop after terminal/ambiguous/exhausted retry
- [x] service-role-only private ledger
- [x] no plaintext approval persistence
- [x] terminal reason/evidence binding including `retry_exhausted`
- [x] stable explicit name for PostgreSQL-truncated constraint
- [x] exact-head Code Quality run `34195356451` SUCCESS
- [x] vinext `34195356549` SUCCESS
- [x] #279 disposable Foundation `34195410881` SUCCESS including cleanup
- [x] 22 migrations from empty DB
- [x] Foundation 14/14 PASS, skip0
- [x] data-source/ledger DB 11/11 PASS, skip0
- [x] final catalog 0 findings
- [x] Next build PASS
- [x] create independent Reviewer packet without moving exact head
- [x] close validation-only #278/#279 without merge

Remaining #269 gates:
- [ ] obtain independent review
- [ ] obtain #273 independent review + approved release/reconciliation
- [ ] wait for #219/#238 freeze clearance
- [ ] ensure #265/#262 release governance is authoritative on main before relying on standing release authority
- [ ] fresh #264 cohort recompute after the relevant main/data state is final
- [ ] fresh #267 provider-read plan bound to then-current main
- [ ] configuration readiness check without exposing secrets
- [ ] obtain exact new human provider-read approval
- [ ] only then consider implementing/running a live provider executor under a separately bounded task

**No provider call or affiliate persistence is currently authorized.**

## Independent review boundary

- [x] strengthened Lead self-review completed
- [x] Reviewer/Verifier packet posted on #282
- [x] Reviewer/Verifier packet posted on #265
- [x] Reviewer packet posted on #273/#269
- [ ] independent Reviewer/Verifier result #282
- [ ] independent Reviewer/Verifier result #265
- [ ] independent Reviewer result #273
- [ ] independent Reviewer result #269

Do not mark these complete using another Lead/self-review pass.

GitHub Copilot code review has previously been treated as a billable AI-credit boundary in this repository. Request it only after explicit owner approval. If a non-billable genuinely independent reviewer becomes available, it may be used without weakening the review scope.

## Canonical docs — #250

- [x] update `HANDOFF.md` to current 2026-09-08 restriction + #280/#281/#282/#265/#273/#269 state
- [x] update `STATUS.md`
- [x] update `DECISIONS.md`
- [x] update `TODO.md`
- [x] record approved scheduled-lane disable state
- [x] record public-read P0 and #282 disposition
- [x] unify reset/release sequence with incident reassessment before normal release train
- [ ] keep #250 Draft while Production freeze is active
- [ ] after post-reset P0 PASS, refresh once more with final evidence before any main merge

## Mandatory reset/release train

Do not release opportunistically after the restriction clears.

### 0. Incident reassessment — #281/#282
- [ ] check whether product data is restored
- [ ] check HTTP status semantics on root + representative data routes
- [ ] if healthy, do not release #282 unnecessarily
- [ ] if still degraded/outer-200, keep #281 P0 and require #282 independent review + explicit release authority

### 1. P0 closure — #219/#238
- [ ] complete the 2026-09-12 evidence gate
- [ ] synchronize #250 from fresh post-reset evidence
- [ ] keep #280 P3/Official enable variables false

### 2. Release governance — #265
- [ ] independent Reviewer/Verifier
- [ ] refresh exact-head evidence if needed
- [ ] land #265 safely
- [ ] close #262 only after policy is authoritative on main

### 3. CI proof authority — #258
- [ ] re-confirm current deployed Production source
- [ ] repin if Production moved
- [ ] fresh exact-head Code Quality/runtime/cache proof
- [ ] obtain applicable workflow-file approval/review boundary
- [ ] land #258

### 4. Migration reproducibility — #273
- [ ] independent review
- [ ] fresh Production catalog/history parity check
- [ ] approve exact migration-history reconciliation
- [ ] land/reconcile without blind `db push`
- [ ] confirm current-main Foundation baseline green
- [ ] then close #270/#271 if closure gates are satisfied

### 5. User-value routing — #253
- [ ] rebase/revalidate onto then-current main
- [ ] exact Cloudflare Preview/browser/runtime proof for Japanese category pages
- [ ] release through then-authoritative policy

### 6. Official-ingestion reliability — #261
- [ ] rebase/revalidate onto then-current main
- [ ] obtain applicable Production approval
- [ ] release
- [ ] observe the next **natural** bounded F0 run; do not force workflow dispatch
- [ ] canonical sync after natural-run result

### 7. Fresh business scorecard
- [ ] recompute traffic, clicks, affiliate coverage, data freshness and request efficiency
- [ ] if monetization coverage still dominates, proceed `#264 -> #267 -> #269`
- [ ] rebind every layer to then-current main/data
- [ ] never reuse old provider approval tokens

### 8. Data Scale R5 HOLD
- [ ] keep #257/#260 on HOLD unless fresh evidence shows depth expansion again outranks monetization coverage

### 9. Scheduled automatic lane resume is separate
- [ ] do not re-enable P3 or Official merely because #238 closes
- [ ] obtain lane-specific authorization
- [ ] re-enable only the specifically approved lane
- [ ] verify bounded natural execution after re-enable

This queue is a planning/order contract only. It grants no merge, Production mutation, workflow change, provider call, Secret/Variable action, or paid operation.

## Cross-project failure-domain follow-up

After restriction clears:
- [ ] obtain a fresh complete Beach backup
- [ ] verify backup is green
- [ ] transfer the **existing** Beach Supabase project to a dedicated Free organization under the Beach workstream
- [ ] verify Beach post-transfer health

Do not create a replacement Beach database and do not transfer during active restriction as quota evasion.

## Allowed while freeze is active

- [x] isolated non-main feature/design/research work
- [x] disposable/local tests
- [x] non-Production Preview validation
- [x] docs, review and planning

## HOLD — Production actions

- [ ] DO NOT merge Production runtime changes to `main`
- [ ] DO NOT apply Production DB/schema/data/migration-history changes
- [ ] DO NOT change DNS/Auth/write/admin surfaces by implication
- [ ] DO NOT change Secrets/Variables by implication
- [ ] DO NOT re-enable #280 lanes by implication
- [ ] DO NOT run provider/load-generating experiments
- [ ] DO NOT perform paid plan/billing changes without explicit approval
- [ ] DO NOT reuse consumed prior authority
- [ ] DO NOT dispatch/change workflows without applicable approval
- [ ] DO NOT scrape Mercari or Amazon
- [ ] DO NOT touch `supabase/.temp/cli-latest`
- [ ] keep `.github/workflows/gacha-ingestion.yml` disabled
- [ ] no automatic RPC retry
- [ ] no direct main push
