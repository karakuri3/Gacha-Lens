# Gacha Lens Ordered TODO

Updated: 2026-09-03 JST — #211 history buffer restored / Issue #212 canonical sync

Work top-to-bottom unless newer verified evidence changes priority. Current umbrella: Issue #119 Data Scale.

## Canonical-sync interpretation

This version is authored by Issue #212.

- If read from branch `docs/canonical-sync-post-history-buffer-212` or its open PR, finish that docs-only exact-head validation/release flow first.
- Once this content reaches `main`, #212 is complete by definition; do not create another sync only to record its own merge.
- The first substantive action after #212 is **read-only Data Scale reassessment**. Do not jump straight to R4 or another history batch.

## P0 — Finish #212 canonical sync

- [x] #211 Production execution verified SUCCESS
- [x] #211 workflow cleanup verified; final branch file diff0 / run count1
- [x] #211 Issue closed completed
- [x] #212 Issue created
- [x] canonical branch created from exact pre-sync main `d7955b285fccd93b327ffb8d80594d400660c68c`
- [x] update `HANDOFF.md`
- [x] update `STATUS.md`
- [x] update `DECISIONS.md`
- [x] update `TODO.md`
- [ ] open docs-only PR closing #212
- [ ] verify changed files are exactly the canonical four
- [ ] Code Quality SUCCESS on exact head
- [ ] exact-head Vercel Preview READY
- [ ] GitHub/Vercel unresolved review threads 0
- [ ] verify main has not drifted
- [ ] docs-only review record
- [ ] squash merge
- [ ] verify normal Git-triggered Production READY
- [ ] confirm #212 closed

Do not create another canonical sync merely to record the #212 docs merge itself.

## P1 — Fresh read-only Data Scale Scoreboard after #212

Current post-#211 evidence before docs merge:

- market listings **127**
- observations **149**
- re-observed **22**
- repeated-history rate **17.3228%**
- completed sold **0**

After #212 reaches main:

1. re-fetch exact current main;
2. re-fetch live listings / observations / re-observed / sold;
3. re-fetch fresh <30d variant coverage;
4. re-fetch fresh depth distribution x1/x2/x3+ and depth percentiles;
5. re-fetch relevant safe source mix and signal metrics used by `docs/DATA_SCALE_SCOREBOARD.md`;
6. re-run/re-read the Scoreboard and record the current automatic bottleneck;
7. do not reuse the pre-#211 `history_not_enabled` label because history is currently buffered;
8. do not assume `depth_insufficient` without current evidence even though prior evidence strongly suggests it.

Provider calls: 0. Production writes: 0.

## P2 — If current bottleneck is depth: rebind R4 safely

Only if the fresh Scoreboard selects depth:

- re-fetch #206 R3 evidence and frozen candidate
- candidate listing: `yahoo-suruga-ya-601199451001`
- variant: `gashapon-4535123846069000-伏黒恵`
- series: `gashapon-4535123846069000`
- evidence price: 980
- candidate key: `1091dce22a0bf29f`
- selection fingerprint: `56e8f3798cbf366f3b2936ad2034600c27ed36bb5f33ff7c9a6f522a86748198`

Fresh SELECT-only preflight must verify:

- current main SHA
- target variant/series identity
- review-safe state
- current fresh depth snapshot and exact existing listing IDs
- unresolved catalog/import issue 0
- R4 target listing/native/public identity not already present
- deterministic initial observation identity not already present
- R4 Production function current presence/absence
- no unexpected competing depth insert since R3

Then:

- rebuild the complete R4 frozen manifest against current main/current DB state
- compute repository-equivalent digest
- dry-run only if safe and useful
- request a **fresh R4-specific human approval** before Production migration/RPC
- if credentialed GitHub Actions is needed, include exact disposable one-shot workflow authority in the approval request

No provider rediscovery is needed for R4 write mode; it consumes frozen R3 evidence only.

## P3 — If R4 is freshly approved and still safe

Potential authorized sequence only after a new exact approval:

1. verify main/manifest/depth/collision drift gate before consuming authority;
2. apply reviewed R4 migration to Production **only if function is still absent**;
3. verify SECURITY INVOKER / empty search_path / service_role-only and market-data delta0 after migration;
4. preserve resolver manifest before RPC;
5. execute exactly one `apply_market_depth_r4_atomic_v1(jsonb)` RPC;
6. no automatic RPC retry;
7. use SELECT-only resolver on ambiguity;
8. independently verify exact new listing + initial observation and global invariants;
9. clean disposable workflow/branch evidence;
10. force immediate canonical sync before the next major phase.

R4 approval must not be inferred from #208 merge or any prior substitution.

## P4 — If Scoreboard selects another DATA bottleneck

Follow current evidence instead of sunk-cost logic.

Possible lanes:

- additional lawful breadth/source work
- another bounded history batch only if current history threshold genuinely reopens
- signal/release freshness work if Scoreboard selects it
- provider/source capability work only within lawful reviewed constraints

Every live-provider or Production-write action needs fresh applicable authority.

## P5 — Transition toward TRAFFIC -> CLICK -> REVENUE when DATA thresholds justify it

Once Data Scale is useful enough:

- re-establish free/current Search Console performance access; do not pay for GSC Wizard without explicit cost approval
- inspect indexed series/variant coverage and search impressions/clicks
- prioritize pages/queries already receiving impressions
- verify affiliate outbound click instrumentation and destination integrity
- improve monetization only where user value/data evidence is strong
- avoid broad SEO pruning or mass noindex without current GSC evidence
- measure actual revenue conversion before expanding paid tooling

## P6 — F0 official ingestion remains separate

PR #142 / Issue #137 remains a distinct Production-impact boundary.

Do not merge, dispatch or implicitly authorize it through Data Scale work. It requires its own current review/approval flow.

## P7 — Foundation harness debt

`.github/workflows/foundation-baseline.yml` still expects the original eight migration versions even though disposable proofs have successfully applied up to 12.

Do not bundle this workflow repair into unrelated Data Scale PRs. Because the workflow is Production-capable infrastructure, treat repair as a separate reviewed/approval-bound task.

## Completed major milestones — do not rerun

- R1 #172 read-only canary
- R2 v1 `33605362604` fail-closed
- R2 v2 `33621881117` first successful history proof
- #196/#198 reusable bounded re-observation prerequisite
- #201 invalid-digest attempt `33658579004` fail-closed before provider
- #201 successful generic history run `33660684355`
- #206 R3 read-only depth run `33665350076`
- #207/#208 R4 repository prerequisite
- #211 successful history-buffer run `33726009433`

All associated provider/RPC/workflow/review-substitution authorities are consumed and non-reusable.

## Hard no-regression checklist

- NEVER touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no direct push to `main`
- no automatic RPC retry
- no migration ledger timestamp repair
- no old approval/token/workflow reuse
- no matcher weakening for coverage
- no Mercari/Amazon scraping
- no completed-sold inference from active/sold_out asking-price data
- no R4 execution because implementation already exists; current Scoreboard and fresh approval decide
- no F0/#142 implication from Data Scale approvals
- no Secrets/Variables or paid/destructive action without explicit authority
