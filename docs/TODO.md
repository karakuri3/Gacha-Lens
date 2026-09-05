# Gacha Lens Ordered TODO

Updated: 2026-09-06 JST — P0-B released; final post-release Egress evidence is the only blocking gate

The company infrastructure migration is complete. The full pre-final-cutover ordered queue is preserved at `docs/history/2026-09-05-pre-final-cutover-TODO.md` and in Git history.

## DONE — company infrastructure migration

- [x] move Gacha Lens Production runtime to Cloudflare
- [x] complete authoritative DNS/domain cutover
- [x] stop routine Vercel Git build cost
- [x] complete scoped Supabase Stage 5 hardening
- [x] preserve rollback paths and final cutover evidence

Do not restart the infrastructure migration.

## P0 — Issue #219 Supabase Egress

### P0-A — DONE

- [x] release sitemap/read-amplification mitigation via PR #231
- [x] retain 24h sitemap-class caching

### P0-B — DONE / Production PASS

- [x] identify remaining discovery/full-loader amplification
- [x] implement bounded Cloudflare Workers Cache policy in PR #249
- [x] cache expensive `/categories`, `/brands`, `/franchises` roots for 24h
- [x] cache `/series` and first-page facet landings for 30m
- [x] preserve query/search/pagination/auth/cookie/Next-internal exclusions
- [x] reject branded error HTML from shared cache
- [x] repair portable public Supabase runtime configuration without exposing service-role secret
- [x] pass repository Code Quality and vinext compatibility
- [x] pass exact Cloudflare Preview runtime smoke
- [x] pass strict `MISS -> HIT -> HIT` cache proof
- [x] prove warm identical Preview requests do not repeat the correlated Supabase backend bundle
- [x] obtain explicit Production merge approval
- [x] merge PR #249 through PR mechanism at main commit `397584fabe633b511cc060ae85335dc4e85fa81d`
- [x] deploy Cloudflare Production build `f1d61310-7e7e-44f5-8c3e-4eb791aca5ac`
- [x] Production smoke `/brands` and representative Japanese series detail
- [x] Production repeated-request check: one cold Supabase bundle, no repeated warm bundles

### FINAL P0 gate — PENDING Usage refresh

Release baseline:
- uncached Egress: 25.108 GB / 5 GB
- Cached Egress: 0.085 GB / 5 GB
- cycle: 2026-08-12–2026-09-12
- grace date shown: 2026-09-06

Supabase says Usage can take up to 1 hour to refresh.

- [ ] obtain a refreshed post-release Egress value after the release baseline
- [ ] calculate delta/rate using elapsed time; do not treat an unchanged stale counter as proof
- [ ] compare API Gateway/read shape with the release proof
- [ ] decide `Free Plan sustainable: PASS/FAIL` with a reasonable safety margin
- [ ] if PASS, close #219
- [ ] if PASS, release/close #238 and formally reopen normal development
- [ ] if PASS, close/supersede #239
- [ ] synchronize HANDOFF / STATUS / DECISIONS / TODO after governance closure

If the refreshed rate is still materially unsafe:
- [ ] keep #219 and #238 open
- [ ] attribute remaining uncached request/read mix
- [ ] identify the single largest residual amplifier
- [ ] implement only the smallest bounded mitigation
- [ ] repeat exact-head CI/Preview/Production/post-release proof

Do not buy a paid plan merely to hide avoidable amplification. A paid-plan change requires current evidence and explicit approval.

## Development gate

- Infrastructure readiness: **OPEN / READY**
- Normal feature work: **FROZEN by #238 until #219 resolves**

After #238 is released, resume company prioritization:

**Reliability / Cost -> User Value -> Traffic -> Click -> Revenue**

Then reassess Search Console, traffic, outbound shop clicks, affiliate conversion/revenue, data freshness, and request efficiency before choosing the next bounded product/business experiment.

## Separate non-blocking debt

- [ ] decide whether Workers Logs should be enabled and with what retention/cost policy
- [ ] keep `pg_net` relocation HOLD until fresh evidence
- [ ] keep Candidate B global PUBLIC function-default revoke HOLD
- [ ] revisit FK/unused-index work only if current workload justifies it
- [ ] retire Vercel rollback artifact only after a separate explicit stabilization decision

## HOLD — hard prohibitions

- [ ] DO NOT reuse consumed #228 authority
- [ ] DO NOT make provider calls/writes under old authority
- [ ] DO NOT dispatch/change workflows without applicable approval
- [ ] DO NOT change Secrets/Variables by implication
- [ ] DO NOT make Production DB/schema/data mutations by implication
- [ ] DO NOT invoke paid actions/plan changes without approval
- [ ] DO NOT use destructive actions without approval
- [ ] DO NOT touch unrelated #232/#142 by implication
- [ ] DO NOT scrape Mercari or Amazon
- [ ] DO NOT touch `supabase/.temp/cli-latest`
- [ ] keep `.github/workflows/gacha-ingestion.yml` disabled
- [ ] no automatic RPC retry
- [ ] no direct main push
