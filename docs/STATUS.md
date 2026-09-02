# Gacha Lens Status

Updated: 2026-09-02 JST — post-Yahoo JSONP repair (#173/#176) checkpoint

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live state before acting.

## Repository / release

- repo: `karakuri3/Gacha-Lens`
- canonical main before this sync: `a8bf9b7d7da7826544cb72a89f77b082fd86f248`
- #172 R1 exact-provider read-only canary: **completed**, Production DB writes 0
- #175 post-R1 canonical sync: merged
- #173 Yahoo exact JSONP padding repair: **completed**
- #176 repair PR: independently reviewed/verified, squash-merged as `a8bf9b7d7da7826544cb72a89f77b082fd86f248`
- #176 Production deployment: `dpl_4U73Cev864RvycfGGPteqQxMS246` — **READY**, canonical aliases healthy
- #177 post-#176 canonical sync: **current phase gate**
- #142 / #137 F0 repair: still explicit human/Production-impact bound

The one-workstream independent-review substitutions previously granted for #156 and #167/#168 were task-specific only. #176 did not rely on them: independent Reviewer + Verifier passed on the final exact head after two earlier major findings were repaired.

## Current P0 order

Issue #119 — Data Scale.

1. finish #177 canonical sync and verify its normal Production release READY
2. re-read current Production/provider state
3. prepare an exact R2 persistence cohort read-only
4. freeze exact target rows, deterministic observation IDs/keys, expected deltas, transaction and rollback evidence
5. present the bounded R2 write plan to the user
6. obtain explicit Production DB write approval
7. only then execute R2
8. R3/R4 remain separate later approvals

## R1 #172 result

R1 had zero Production persistence.

### Rakuten

3 frozen exact reads, one HTTP request each, all HTTP 200:

- 3 × `not_found / exact_item_not_returned`
- retries 0
- false `sold` 0

### Yahoo

Initial exact-read adapter calls reached HTTP 200 but failed closed because live Yahoo JSONP begins with exact padding `/* */` before the callback.

Final one-off strict Yahoo reads used the exact observed padding only:

- lead-netstore item → unchanged 698 / active
- suruga-ya item → not_found
- selen-shope item → unchanged 1500 / active

All HTTP 200, one attempt each, retries 0, rate limits 0.

Yahoo continuation approval used **9/9 attempts exactly**: 3 initial + 3 diagnostics + 3 final. That approval is exhausted and grants no further live Yahoo request.

## #173 / #176 repair — completed

The permanent Yahoo exact-read parser now preserves a narrow fail-closed contract:

- fixed callback only; caller-selected callback override removed
- direct form must begin with the fixed callback from raw byte 0
- padded form must begin with exact `/* */` from raw byte 0 and immediately continue with the fixed callback
- leading space/newline/BOM, `/**/`, `/*x*/`, arbitrary/multiple comments, comment gaps, wrong callbacks, bare JSON and malformed wrappers fail closed
- exact reviewed endpoint, redirect refusal, persisted identity, positive price, explicit availability, active/sold_out-only and no-false-sold rules remain unchanged

Independent review on final head `d995e03f346398d02e212ac529316b81c0c2054b`:

- Reviewer: PASS
- Verifier: PASS
- custom acceptance matrix: expected accepted/rejected shapes PASS
- focused tests: PASS
- full Node suite: 1992/1992 PASS
- lint / diff check: PASS
- exact-head PR Code Quality: PASS
- exact-head Vercel Preview: READY

The merge itself performed no provider call and no Production DB mutation.

## Production data checkpoint

Latest SELECT-only snapshot on 2026-09-02 JST after #176:

- market listings: **113**
- observations: **113**
- listings with 2+ observations: **0**
- completed `sold`: **0**
- `sold_out`: **0**
- Rakuten listings: **50**
- Yahoo listings: **63**

The growth from the R1 post-run 110/110 checkpoint to 113/113 is existing Production breadth activity, not R2 persistence. Re-observation history remains at zero and is still the primary measurable Data Scale bottleneck.

## R2 remains unapproved

Planned R2 from `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`:

- exactly 4 known listings, 2 Rakuten + 2 Yahoo
- bounded Production re-observation persistence
- deterministic observation IDs
- exact before/after counts and post-write reread
- listing count should remain unchanged
- no false `sold`

Safe read-only cohort preparation may proceed after #177 is merged/Production READY. The actual Production DB mutation requires a fresh explicit user approval and grants no R3/R4 or schedule authority.

## Durable provider/history safety

- exact persisted identity; no keyword rediscovery
- append-only successful observations
- positive integer price / explicit availability
- only active/sold_out ordinary states
- no `not_found`→`sold` inference
- stale timestamp rejected
- equal-time conflicts rejected
- equal-time unchanged retry deterministic
- null/blank observedAt rejected
- credentials restricted to reviewed official host/path; redirects rejected
- failed reads do not advance `last_observed_at`
- Yahoo JSONP parser accepts only the exact fixed raw-byte-0 wrapper forms documented above

## Source posture

- Rakuten: active
- Yahoo: active; exact-read JSONP compatibility repaired by #176
- Aucfan: paid access diligence only
- Mercari C2C: partnership required; no scraping
- X: paid access required
- GSC connected reporting path: last seen subscription-unavailable, not zero traffic

Use `docs/DATA_SOURCE_CAPABILITY_MATRIX.md` for the full canonical matrix.

## Hard boundaries

- no R2 Production writes without explicit approval
- no further Yahoo calls under exhausted #172 approval
- do not merge #142 or dispatch F0 without separate approval
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not weaken matcher, mix sold/current evidence, or scrape Mercari/Amazon

## Exact next step

#177 is the current docs-only phase gate. After it is exact-head green, merged, and Production READY, perform a fresh read-only R2 preflight/cohort selection. Stop before any Production DB write and present the exact bounded mutation plan for explicit user approval.
