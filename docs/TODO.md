# Gacha Lens Ordered TODO

Updated: 2026-09-04 JST — Stage-5 Supabase hardening isolated validation added as a separate lane

The complete ordered TODO checkpoint immediately before this lane is preserved byte-for-byte at `docs/history/2026-09-03-pre-233-TODO.md`.

## Stage 5 — Supabase hardening isolated validation — ACTIVE / NO PRODUCTION AUTHORITY

Canonical evidence: `docs/SUPABASE_HARDENING_ISOLATED_2026-09-04.md`.

Gacha grant/GraphQL boundary — Draft PR #241:
- [x] re-fetch Production security/performance advisors read-only
- [x] prove 13 target tables are RLS-enabled / zero-policy and have broad API-role grants in Production
- [x] prove 4 separate `series_*` tables have intentional public read policies and exclude them from blanket revoke
- [x] verify current application uses the server-only service-role boundary and repository search shows no GraphQL client path
- [x] prove paid Supabase Branching is unnecessary for this rehearsal; no paid branch created
- [x] create disposable exact-head CI with no Production credentials / no GitHub Secrets
- [x] identify `forecast_snapshots` as deferred from the fresh chain and read-only verify its exact Production shape
- [x] update isolated CI to synthesize only that deferred table in the disposable DB
- [ ] require exact-head #241 grant rehearsal PASS for reproduce -> revoke -> service-role regression -> rollback -> reapply
- [ ] require exact-head PR Code Quality PASS after final evidence/docs changes
- [ ] record final run IDs/SHA and lock Production classification

`pg_net` — Draft PR #242:
- [x] verify Production version/schema/non-relocatable state read-only
- [x] verify queue0 / recent-response0 / cron-job0 and application-owned DB `net.*` dependencies0 at inspection time
- [x] confirm Supabase documentation supports drop/recreate-under-`extensions` troubleshooting path
- [x] create a separate disposable-only relocation/rollback/reverse/reapply Draft PR
- [ ] require exact-head #242 isolated PASS; if extension semantics/dependencies block it, keep Production change on HOLD rather than weakening the gate
- [ ] record final run IDs/SHA and final `Production適用推奨 / 保留 / 不要` decision

Performance:
- [x] re-fetch the six unindexed-FK advisor notices and unused-index notices
- [x] capture current target row counts/relation size and a representative `market_listings.series_id` read-only plan
- [x] confirm workload analysis ranks the FK candidates differently
- [ ] keep all index DDL on HOLD unless a specific index gets a workload/scale/plan justification plus rollback
- [ ] do not drop unused indexes from advisor output alone

Cross-repo dependency:
- [ ] fetch Beach Draft PR #216 exact-head isolated result and keep its rollout independent from Gacha

Hard completion gate for Stage 5:
- [ ] classify every hardening candidate as **Production適用推奨 / 保留 / 不要**
- [ ] attach evidence, rollback, preflight, and application order
- [ ] update canonical `HANDOFF / STATUS / DECISIONS / TODO` on the isolated Draft branch
- [ ] do not merge or apply Production changes under this validation task

## P0 — Issue #219 shared Supabase Egress risk — CURRENT / SEPARATE

P0-A is released; the incident is **not yet closed** because billed-byte recovery has not been observed.

Completed P0-A:
- [x] identify high-confidence sitemap/public-read amplification mechanism
- [x] create and review PR #231
- [x] exact-head Code Quality #116 / `33754793103` SUCCESS
- [x] exact-head Preview `dpl_GVNunr8mDJ54FE5a6nr3mD5Hi4Qj` READY
- [x] prove root/series/variant sitemaps Static with `1d` revalidation
- [x] preserve sitemap population/XML/>50k fail-closed semantics
- [x] full five-file strengthened Lead self-review; explicitly non-independent; findings0
- [x] pre-merge threads0 and main drift0
- [x] squash merge #231 as `8048a19ad478672a9d887d77073597ee95dc27d3`
- [x] normal Vercel Production `dpl_7KLUH7bP8JNESPndzQYhzE4jQn9G` READY
- [x] live Production smoke root/series/variant sitemap endpoints
- [x] record durable P0-A checkpoint on Issue #219

Next true gate — read-only observation:
- [ ] observe current Supabase uncached Egress trajectory without resetting counters
- [ ] compare post-release large-read/request shape with pre-release evidence
- [ ] determine whether sitemap amplification materially declined
- [ ] keep #219 open until Fair Use/402 risk is credibly controlled

If Egress remains materially high — P0-B:
- [ ] attribute remaining public request paths using Vercel/Supabase evidence
- [ ] quantify product/detail/category signal-table/full-loader reads
- [ ] identify unnecessary `raw`/wide-column hydration where applicable
- [ ] bound/filter/cache remaining public reads without semantic regression
- [ ] use exact-head CI + Preview + Production smoke + post-release measurement for each mitigation

Do not solve avoidable amplification merely by buying a paid plan. Any plan upgrade requires exact current cost/terms evidence and explicit owner approval.

## P1 — Business/reliability Scoreboard reassessment — NEXT AFTER #219 IS CONTROLLED

Do not automatically return to depth scaling. Re-rank work using:

**Reliability / Cost -> User Value -> Traffic -> Click -> Revenue**

Measure/re-fetch as available:
- [ ] Search Console impressions / clicks / CTR / indexation
- [ ] product/series page traffic and top landing/search pages
- [ ] outbound shop clicks and click-through rate
- [ ] affiliate conversion / revenue instrumentation and actual revenue where available
- [ ] data freshness / coverage quality
- [ ] Supabase/Vercel request efficiency and cost trajectory
- [ ] identify the single highest-leverage bottleneck and choose one bounded experiment

The goal is not to maximize variants/listings/depth in isolation. The next experiment must state which user/business metric it is expected to improve and how success/failure will be measured.

## P2 — Data Scale depth work — HOLD UNTIL P1 CHOICE

Last canonical Data Scale evidence remains:
- variants 23,808
- listings 133
- observations 155
- fresh covered variants 122
- depth 120 x1 / 2 x2 / 0 x3+
- re-observed 22/133
- clicks7d 10
- completed sales0

`depth_insufficient` is still a technical diagnosis, not authorization and not guaranteed to be the next business priority.

If P1 later proves depth scaling is highest leverage:
- [ ] design the smallest bounded cohort for already-covered depth1 variants
- [ ] preserve strict variant/parent/provider/native/public-URL identity and collision guards
- [ ] define provider/request/write ceilings and fail-closed behavior
- [ ] define before/after user/business as well as Data Scale evidence
- [ ] prove repository/disposable behavior before Production execution
- [ ] obtain independent review or an explicitly authorized substitution when required
- [ ] obtain separate explicit approval for provider execution, workflow mutation, migration/schema action or Production write

No #228 authority may be reused.

## P3 — Product value / traffic / revenue path

Once reliability is stable, actively test the reason a user should open Gacha Lens. Candidate user-visible jobs include understanding current price, where an item can be obtained, and whether/when it is restocked or rereleased.

- [ ] use behavior/search evidence to identify the strongest primary user job
- [ ] improve the smallest page/feature/SEO path that supports that job
- [ ] preserve outbound-click measurement
- [ ] connect traffic and click evidence to monetization rather than assuming more infrastructure creates revenue
- [ ] prefer measurable experiments over broad speculative feature expansion

## HOLD — explicit prohibitions now

- [ ] DO NOT apply Stage-5 Supabase changes to Production
- [ ] DO NOT merge #241 or #242 under this validation task
- [ ] DO NOT create a paid Supabase branch without explicit owner approval
- [ ] DO NOT invoke another R4 write under consumed #228 approval
- [ ] DO NOT retry #214 or #228
- [ ] DO NOT reuse Production repair authority or prior review substitutions
- [ ] DO NOT make new provider calls under consumed authority
- [ ] DO NOT run another history/depth batch automatically
- [ ] DO NOT dispatch/change workflows without applicable approval
- [ ] DO NOT change Secrets/Variables by implication
- [ ] DO NOT merge/dispatch F0/#142 without its boundary
- [ ] DO NOT invoke paid reviewer/actions or paid plan changes without approval
- [ ] DO NOT use destructive Production actions without approval
- [ ] DO NOT weaken strict matcher/identity guards
- [ ] DO NOT scrape Mercari or Amazon
- [ ] DO NOT touch `supabase/.temp/cli-latest`
- [ ] keep `.github/workflows/gacha-ingestion.yml` disabled
- [ ] no automatic RPC retry
- [ ] no direct main push

## Canonical history

`docs/history/2026-09-03-pre-233-TODO.md`

Stage-5 detailed resume source: `docs/SUPABASE_HARDENING_ISOLATED_2026-09-04.md`.