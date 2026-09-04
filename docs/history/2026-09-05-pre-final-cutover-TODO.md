# Gacha Lens Ordered TODO

Updated: 2026-09-03 JST — P0-A Supabase egress mitigation released / Issue #233 canonical sync

The complete ordered TODO checkpoint immediately before this sync is preserved byte-for-byte at `docs/history/2026-09-03-pre-233-TODO.md`.

## P0 — Issue #219 shared Supabase Egress risk — CURRENT

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

## Separate work / debt

- PR #232 technology-intelligence docs lane is separate Draft work and lower priority than #219; require current-main drift/rebase proof before merge.
- #137/#142 F0 remains a separate approval boundary.
- Supabase advisor findings remain separate behavior-impact work; do not change RLS/policies/grants/extensions/indexes by implication.
- unused branch cleanup remains subject to applicable cleanup policy; do not delete unrelated branches by implication.

## HOLD — explicit prohibitions now

- [ ] DO NOT invoke another R4 write under consumed #228 approval
- [ ] DO NOT retry #214 or #228
- [ ] DO NOT reuse Production repair authority or prior review substitutions
- [ ] DO NOT make new provider calls under consumed authority
- [ ] DO NOT run another history/depth batch automatically
- [ ] DO NOT dispatch/change workflows without applicable approval
- [ ] DO NOT change Secrets/Variables by implication
- [ ] DO NOT merge/dispatch F0/#142 without its boundary
- [ ] DO NOT remediate advisor findings by implication
- [ ] DO NOT invoke paid reviewer/actions or paid plan changes without approval
- [ ] DO NOT use destructive actions without approval
- [ ] DO NOT weaken strict matcher/identity guards
- [ ] DO NOT scrape Mercari or Amazon
- [ ] DO NOT touch `supabase/.temp/cli-latest`
- [ ] keep `.github/workflows/gacha-ingestion.yml` disabled
- [ ] no automatic RPC retry
- [ ] no direct main push

## Canonical history

`docs/history/2026-09-03-pre-233-TODO.md`

Once this exact sync reaches `main`, Issue #233 is complete by definition; do not create a recursive sync solely for its own docs-only merge.