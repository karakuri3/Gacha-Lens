# Gacha Lens Ordered TODO

Updated: 2026-09-06 JST — technical Egress mitigation complete; residual billing-cycle gate remains

The company infrastructure migration is complete. The pre-final-cutover ordered queue is preserved at `docs/history/2026-09-05-pre-final-cutover-TODO.md` and in Git history.

## DONE — company infrastructure migration

- [x] move Gacha Lens Production runtime to Cloudflare
- [x] complete authoritative DNS/domain cutover
- [x] stop routine Vercel Git build cost
- [x] complete scoped Supabase Stage 5 hardening
- [x] preserve rollback paths and final cutover evidence

Do not restart the infrastructure migration.

## DONE — Issue #219 technical Egress mitigation

### P0-A
- [x] release sitemap/read-amplification mitigation via PR #231
- [x] retain 24h sitemap-class caching

### P0-B / PR #249 — shared edge reuse
- [x] identify remaining discovery/full-loader amplification
- [x] implement bounded Cloudflare Workers Cache policy
- [x] cache expensive `/categories`, `/brands`, `/franchises` roots for 24h
- [x] cache `/series` and first-page facet landings for 30m
- [x] cache series detail for 30m
- [x] preserve query/search/pagination/auth/cookie/Next-internal exclusions
- [x] reject branded error HTML from shared cache
- [x] pass repository/Preview/runtime/cache proof
- [x] obtain explicit Production approval
- [x] merge PR #249 as main `397584fabe633b511cc060ae85335dc4e85fa81d`
- [x] deploy Cloudflare Production build `f1d61310-7e7e-44f5-8c3e-4eb791aca5ac`
- [x] prove Production warm requests do not repeat the same observed backend bundle

### P0-C / PR #251 — unique-path cold cost
- [x] identify residual cold detail series-wide signal hydration
- [x] scope detail/related market/X/restock/stock reads to relevant variant identities
- [x] retain series-level complete/partial/popular set safety semantics
- [x] safely omit persisted `raw` from variant-specific public reads where unused
- [x] preserve displayed detail/related semantics
- [x] measure representative A/B reduction: detail -65.5%, related -48.1% signal JSON
- [x] remove temporary diagnostic route before Production candidacy
- [x] pass clean test/lint + compatibility + Cloudflare Preview
- [x] obtain explicit Production approval
- [x] squash-merge PR #251 as main `83b0b36e5d0172f3ea6964206edad6480a13b4bb`
- [x] deploy Cloudflare Production build `6a86ca27-a105-410b-8862-308e4a2aca8e`
- [x] verify public Japanese detail after release
- [x] close implementation Issue #239 as completed/superseded

## ACTIVE — final operational P0 gate (#219 / #238)

Current evidence:
- post-#249 baseline: 25.108 GB uncached Egress
- refreshed value: 25.114 GB
- elapsed: ~13.78h
- delta: +0.006 GB
- observed rate: ~0.00044 GB/hour / ~0.0104 GB/day org-wide
- conservative target: <=0.12 GB/day
- Cached Egress: 0.085 GB
- current cycle: 2026-08-12–2026-09-12
- Supabase banner: Grace period is over
- HTTP 402: not currently observed

Interpretation:
- [x] technical amplification controlled with large operating margin
- [x] Free-plan technical burn appears sustainable
- [x] paid plan requirement remains unestablished
- [ ] clear historical current-cycle Fair Use/402 risk
- [ ] verify 2026-09-12 billing-cycle reset
- [ ] verify post-reset Egress remains on a low trajectory
- [ ] close #219 on final operational PASS
- [ ] close #238 and fully reopen Production runtime merges
- [ ] finalize/merge canonical docs PR #250 under explicit merge approval

If 402 appears before reset:
- [ ] keep #219/#238 open
- [ ] determine whether the billing-cycle reset clears the restriction
- [ ] do not buy Pro without separate owner approval

If post-reset burn unexpectedly becomes unsafe:
- [ ] attribute only the largest remaining request/read amplifier
- [ ] implement the smallest bounded mitigation with exact-head Preview/Production proof

## Development gate

### Allowed now
- [x] non-Production feature/design/research work on isolated branches
- [x] Cloudflare Preview validation
- [x] tests, docs, reviews and planning

### Still frozen until #219 final PASS
- [ ] Production runtime merges to `main`
- [ ] Production DB/schema/data changes by implication
- [ ] DNS/Auth/write/admin-surface changes by implication
- [ ] Secrets/Variables changes by implication
- [ ] unrelated Production load/migration experiments

After #238 fully closes, resume company prioritization:

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
