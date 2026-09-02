# Gacha Lens Ordered TODO

Updated: 2026-09-02 JST — post-R1 (#172) checkpoint

Work top-to-bottom unless newer verified evidence changes priority. Current umbrella: Issue #119 Data Scale.

## P0-A — Keep F0 at its real approval boundary

- [x] Prove scheduled F0 run `33484450472` failed closed with transaction `not_started`, DB writes/deletes 0.
- [x] Trace blocker and create Issue #137 / PR #142 repair.
- [x] Verify #142 tests/lint/diff/Preview.
- [ ] Obtain remaining required review/explicit approval before merging #142.
- [ ] Do not manually rerun/dispatch F0 without separate approval.

## P0-B — Re-observation / depth / measurement foundations — complete

- [x] #150 re-observation engine.
- [x] #153 exact Rakuten/Yahoo provider reads, strict destination/redirect policy.
- [x] #156 Depth Collector, strict multi-offer identity/dedupe and selection binding.
- [x] #159 truthful read-only Data Scale Scoreboard.
- [x] #162 lawful source capability matrix.
- [x] #169 equal-time/null-time re-observation safety.
- [x] #170 Production history/depth rollout plan.

## P0-C — R1 exact-provider read-only canary — complete

Issue #172.

- [x] Freeze 6 known listings: 3 Rakuten + 3 Yahoo.
- [x] Confirm exact identity, single/review-safe status, one observation each, unresolved issues 0.
- [x] Recheck current official provider contracts.
- [x] Obtain explicit R1 provider-read approval.
- [x] Rakuten 3 exact reads: all HTTP 200, all `not_found`, DB writes 0.
- [x] Detect Yahoo Preview credential gap without making Yahoo request there.
- [x] Obtain separate approval for branch-only Yahoo continuation, max 9 attempts, DB access 0.
- [x] Run initial Yahoo 3 exact reads: HTTP 200, fail closed `invalid_jsonp_payload`.
- [x] Diagnose live response safely without raw-body/credential logging.
- [x] Establish exact live Yahoo JSONP padding `/* */` before exact callback.
- [x] Complete final Yahoo 3 strict one-off reads: 2 unchanged / 1 not_found, all HTTP 200.
- [x] Exhaust Yahoo continuation budget exactly 9/9; make no further call under that approval.
- [x] Reset temporary ops branch to canonical main and confirm identical.
- [x] SELECT-reverify frozen six rows unchanged, one observation each.
- [x] Record latest Production-wide snapshot 110 listings / 110 observations / 0 re-observed; distinguish independent P3 growth from R1.
- [x] Close #172 completed.

R1 grants **no R2 authority**.

## P0-D — Post-R1 canonical sync — current gate

Issue #174. Branch `docs/canonical-sync-post-r1-172`.

- [x] Update `docs/HANDOFF.md`.
- [x] Update `docs/STATUS.md`.
- [x] Update `docs/DECISIONS.md`.
- [x] Update this ordered TODO.
- [ ] Confirm exactly four canonical docs changed and branch is behind main 0.
- [ ] Create docs-only PR.
- [ ] Pass exact-head full tests / lint / diff check and Vercel Preview.
- [ ] Merge only if docs-only Auto-Merge + Production Release gates pass.
- [ ] Verify resulting Production deployment READY.

Do not implement #173 before this gate is completely closed.

## P0-E — Yahoo exact JSONP padding repair #173 — next code blocker

Issue #173. Provider parsing / collection semantics.

After P0-D is Production READY:

- [ ] Re-fetch current main and #173.
- [ ] Reset/recreate `fix/p0-yahoo-jsonp-padding-173` from current main; do not build on stale pre-sync base.
- [ ] Change only `lib/fetchers/market-reobservation-provider-read.js` and `tests/market-reobservation-provider-read.test.mjs` unless new evidence requires otherwise.
- [ ] Preserve direct exact-callback parsing.
- [ ] Accept exact observed `/* */` immediately before exact callback.
- [ ] Reject `/**/`, `/*x*/`, arbitrary/multiple comments, garbage prefixes, wrong callback, bare JSON and malformed wrapper/body.
- [ ] Preserve endpoint allowlist, redirect refusal, exact identity, positive price, explicit availability and no-false-sold rules.
- [ ] Add focused regressions for accepted/rejected padding shapes.
- [ ] Run focused tests, full Node suite, lint, `git diff --check`, exact-head CI and Vercel Preview.
- [ ] Perform strengthened full-diff review.
- [ ] Obtain **independent Verifier + Reviewer** before merge, unless user grants a new explicit task-specific substitution. The #167/#168 exception does not apply.
- [ ] Do not make live Yahoo calls while implementing/validating #173.

## P1 — R2 tiny Production re-observation persistence — future explicit approval

Do not start merely because #173 is fixed.

- [ ] After #173 is safely merged/Production READY, re-read current Production listings/observations and provider health.
- [ ] Freeze exactly 4 known listings: 2 Rakuten + 2 Yahoo.
- [ ] Verify each target's current observation count and expected delta.
- [ ] Freeze deterministic observation keys/IDs and immutable identity values.
- [ ] Define bounded transaction, exact before/after counts, post-write reread and rollback evidence.
- [ ] Present exact R2 cohort/write delta to user and obtain explicit Production DB approval.
- [ ] If approved, execute only that cohort; listing count should remain unchanged; no false `sold`.
- [ ] Stop on any partial/unknown state or verification mismatch.
- [ ] Re-run Scoreboard and measure actual history gain.
- [ ] Force another canonical sync after the Production persistence milestone.

R2 approval does not authorize R3/R4 or schedules.

## P2 — R3/R4 depth rollout — future separately approved

### R3 read-only
- [ ] Freeze 2 explicit variants, one Rakuten-first + one Yahoo-first.
- [ ] Max 5 safe accepted offers each / 10 total.
- [ ] Max 6 planner requests / 18 HTTP attempts.
- [ ] Obtain separate live provider/search approval.
- [ ] DB writes 0.

### R4 persistence
- [ ] Freeze only strict-safe R3 subset.
- [ ] <=10 new listing+initial-observation pairs.
- [ ] Insert-only; no existing-row update/delete.
- [ ] Obtain separate Production DB approval.
- [ ] Verify exact deltas and rerun Scoreboard.

## P3 — Licensed completed-sale / source expansion

- [ ] Maintain `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`.
- [ ] Recheck provider terms immediately before acting.
- [ ] Perform Aucfan commercial/data-rights diligence before payment/credentials.
- [ ] Build Mercari partnership dossier; never scrape Mercari or Amazon.
- [ ] Evaluate other lawful API/feed/partner sources separately.

## P4 — Non-price signals

- [ ] Add timestamped provenance-bearing stock/inventory evidence.
- [ ] Keep official restock/re-release separate from inferred unavailability.
- [ ] Add preorder demand only at exact verified scope.
- [ ] Add X/social only with authorized paid access and bounded budget.
- [ ] Never fabricate popularity from weak proxies.

## P5 — Traffic / affiliate / GSC

- [ ] Restore/re-read authorized GSC reporting before current SEO performance claims.
- [ ] Preserve root/series/variant sitemap separation.
- [ ] Measure search impressions/clicks before pruning.
- [ ] Preserve strict affiliate provenance and provider+variant click attribution.

## Hold — do not do without explicit approval/new evidence

- [ ] Do NOT merge #142 or manually dispatch F0 without its required approval.
- [ ] Do NOT make more Yahoo provider calls under exhausted #172 approval.
- [ ] Do NOT merge #173 without independent review or a new explicit narrow substitution.
- [ ] Do NOT start R2 Production persistence without a fresh exact approval.
- [ ] Do NOT enable Kitan/Qualia automatic writes.
- [ ] Do NOT weaken the strict matcher.
- [ ] Do NOT mix completed/sold with active/sold_out evidence.
- [ ] Do NOT scrape Mercari or Amazon.
- [ ] Do NOT purchase/activate Aucfan, X, GSC paid connector access or other paid/licensed source without approval.
- [ ] Do NOT touch `supabase/.temp/cli-latest`.
- [ ] Do NOT re-enable `.github/workflows/gacha-ingestion.yml`.

## Forced handoff hygiene

After every major Production/recovery/security/release milestone:

- [ ] update STATUS
- [ ] update HANDOFF
- [ ] update DECISIONS when durable rules changed
- [ ] reorder TODO
- [ ] use docs-only PR
- [ ] merge and verify Production READY before next major implementation

Do not rely on chat-limit warnings and do not bypass this gate merely because the user says 「続けて」.
