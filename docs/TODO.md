# Gacha Lens Ordered TODO

Updated: 2026-09-05 JST — Final Release/Cutover complete; normal development ready

The complete ordered TODO checkpoint immediately before this closeout is preserved byte-for-byte at `docs/history/2026-09-05-pre-final-cutover-TODO.md`.

## Company infrastructure migration — DONE

- [x] stop avoidable Vercel build cost during migration
- [x] establish Cloudflare parallel environment
- [x] prove Gacha Lens Cloudflare runtime compatibility
- [x] prove portable P0 cache/egress behavior
- [x] complete Supabase Stage 5 isolated validation
- [x] merge server-only runtime boundary before DB grant hardening
- [x] apply scoped Production table-grant hardening
- [x] apply scoped future default-privilege Candidate A
- [x] remove unused `pg_graphql` after fresh zero-dependency preflight
- [x] synchronize Production Supabase migrations back to Git
- [x] merge Cloudflare runtime to main
- [x] deploy main to Cloudflare Production
- [x] move authoritative DNS from Vercel nameservers to Cloudflare
- [x] attach `gachalens.com` Worker Custom Domain
- [x] move `www` canonical redirect to Cloudflare and preserve path/query
- [x] remove old Vercel apex/www/wildcard web routing
- [x] verify homepage/ranking/schedule/series/stock/restocks/robots/sitemap smoke
- [x] verify former Vercel `x-next-cache-tags` 500 URL succeeds on Cloudflare
- [x] verify Cloudflare error metrics and prior-version rollback path
- [x] disable routine Vercel Git builds with `ignoreCommand: "exit 0"`
- [x] synchronize final HANDOFF / STATUS / DECISIONS / TODO / cutover record

Infrastructure migration is not the next work queue after this checkpoint.

## P0 — Issue #219 shared Supabase Egress risk — CONTINUE AS MEASURED RELIABILITY LANE

Final cutover does not prove the billed-byte trajectory is safe.

Next true gate remains read-only observation:
- [ ] observe current Supabase uncached Egress trajectory without resetting useful counters
- [ ] compare post-cutover request/read shape with pre-mitigation evidence where possible
- [ ] determine whether sitemap + Cloudflare/P0 cache/runtime changes materially reduce expensive reads
- [ ] keep #219 open until Fair Use/402 risk is credibly controlled

If Egress remains materially high:
- [ ] attribute remaining public request paths
- [ ] quantify expensive signal-table/full-loader reads
- [ ] identify unnecessary wide/raw hydration
- [ ] bound/filter/cache remaining reads without semantic regression
- [ ] validate each mitigation with exact-head CI, Cloudflare preview/version, Production smoke, and post-release measurement

Do not buy a paid plan merely to hide avoidable amplification. A paid-plan decision requires current pricing/terms and explicit approval.

## P1 — Business/reliability scoreboard reassessment

Normal development is now allowed, but choose work by evidence:

**Reliability / Cost -> User Value -> Traffic -> Click -> Revenue**

Measure/re-fetch as available:
- [ ] Search Console impressions / clicks / CTR / indexation
- [ ] product/series page traffic and top landing/search pages
- [ ] outbound shop clicks and click-through rate
- [ ] affiliate conversion/revenue instrumentation and actual revenue where available
- [ ] data freshness / coverage quality
- [ ] Supabase/Cloudflare request efficiency and cost trajectory
- [ ] identify the single highest-leverage bottleneck and choose one bounded experiment

Do not automatically return to Data Scale depth work merely because the old technical diagnosis was `depth_insufficient`.

## P2 — Data Scale depth work — HOLD UNTIL P1 CHOICE

Last canonical pre-Egress snapshot remains historical evidence, not an authorization.

If P1 later proves depth scaling is highest leverage:
- [ ] design the smallest bounded cohort
- [ ] preserve strict variant/parent/provider/native/public-URL identity and collision guards
- [ ] define request/write ceilings and fail-closed behavior
- [ ] define user/business success metrics, not only row/depth metrics
- [ ] prove repository/disposable behavior before Production execution
- [ ] obtain required review/approval for provider execution, workflow mutation, migration/schema action, or Production write

No #228 authority may be reused.

## Separate non-blocking infrastructure debt

- [ ] decide whether Workers Logs should be enabled and with what retention/cost policy; current cutover evidence is error metrics only
- [ ] keep `pg_net` relocation HOLD until fresh need/risk evidence
- [ ] keep Candidate B global PUBLIC function-default revoke HOLD until blast radius is justified
- [ ] re-evaluate `market_listings(series_id)`/other FK indexes only when current workload justifies them
- [ ] re-evaluate unused-index cleanup separately
- [ ] close/archive historical isolated Draft PRs when their evidence no longer needs an open PR surface
- [ ] consider retiring the non-live Vercel rollback artifact only after an appropriate stabilization period and explicit decision

## HOLD — existing prohibitions

- [ ] DO NOT invoke another R4 write under consumed #228 approval
- [ ] DO NOT retry #214 or #228
- [ ] DO NOT reuse Production repair authority or prior review substitutions
- [ ] DO NOT make new provider calls under consumed authority
- [ ] DO NOT dispatch/change workflows without applicable approval
- [ ] DO NOT change Secrets/Variables by implication
- [ ] DO NOT merge/dispatch F0/#142 without its boundary
- [ ] DO NOT remediate unrelated advisor findings by implication
- [ ] DO NOT invoke paid reviewer/actions or paid-plan changes without approval
- [ ] DO NOT use destructive actions without approval
- [ ] DO NOT weaken strict matcher/identity guards
- [ ] DO NOT scrape Mercari or Amazon
- [ ] DO NOT touch `supabase/.temp/cli-latest`
- [ ] keep `.github/workflows/gacha-ingestion.yml` disabled
- [ ] no automatic RPC retry
- [ ] no direct main push

## Canonical history

`docs/history/2026-09-05-pre-final-cutover-TODO.md`
