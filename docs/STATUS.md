# Gacha Lens Status

Updated: 2026-09-02 JST — post-R1 (#172) checkpoint

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live state before acting.

## Repository / release

- repo: `karakuri3/Gacha-Lens`
- canonical main before this sync: `26fb12ac868d10cb68ae9c3b1ce85675a2c3ab8f`
- #169 equal-time/null-time re-observation safety: merged
- #170 Production history/depth rollout plan: merged
- #171 post-#170 canonical sync: merged; Production `dpl_4CQkGPnkfd3EnmAsvNbv5M5kXpNh` READY
- #172 R1 exact-provider read-only canary: **completed**
- #173 Yahoo exact JSONP padding repair: **open, next mandatory blocker before R2**
- #142 / #137 F0 repair: still explicit human/Production-impact bound

The user exception that replaced independent review for #167/#168 applied only to replacement PRs #169/#170. It does not apply to #173.

## Current P0 order

Issue #119 — Data Scale.

1. finish this post-R1 canonical sync
2. repair #173 code/tests only from the new current main
3. obtain independent Verifier + Reviewer for #173 unless a new narrow substitution is explicitly granted
4. merge #173 only if all code/review/release gates pass
5. re-read Production/provider state
6. prepare exact R2 persistence cohort
7. request explicit Production DB write approval for R2
8. only then execute bounded R2
9. R3/R4 remain separate later approvals

## R1 #172 result

R1 had zero Production persistence.

### Rakuten

3 frozen exact reads, one HTTP request each, all HTTP 200:

- 3 × `not_found / exact_item_not_returned`
- retries 0
- false `sold` 0

### Yahoo

Initial exact-read adapter calls reached HTTP 200 but failed closed because live Yahoo JSONP begins with exact padding `/* */` before the configured callback.

Live sanitized diagnostics established:

- callback starts at byte index 5
- exact five-byte block-comment prefix
- prefix is `/* */`
- no raw body/credential logging

Final one-off strict Yahoo reads used exact observed padding only:

- lead-netstore item → unchanged 698 / active
- suruga-ya item → not_found
- selen-shope item → unchanged 1500 / active

All HTTP 200, one attempt each, retries 0, rate limits 0.

Yahoo continuation approval used **9/9 attempts exactly**: 3 initial + 3 diagnostics + 3 final. No more Yahoo request is authorized by that approval.

Temporary ops branch was force-reset to canonical main and compare-confirmed identical.

## Production data checkpoint

Latest SELECT-only post-R1 snapshot:

- market listings: **110**
- observations: **110**
- listings with 2+ observations: **0**

The six R1 frozen rows remain unchanged in price/status/`last_observed_at`, each with one observation. The increase from 107/107 to 110/110 was independent existing Production activity, not R1 persistence.

History compounding remains the primary measurable bottleneck.

## #173 blocker

Main Yahoo parser currently requires `gachaLensItemLookupV1(` at byte 0, while current live Yahoo exact itemLookup returned exact `/* */gachaLensItemLookupV1(...)`.

Permanent repair must:

- keep direct exact callback valid
- accept only exact `/* */` before exact callback
- reject `/**/`, `/*x*/`, arbitrary comments/garbage, wrong callback, malformed wrapper/body
- preserve exact endpoint, redirects-fail, identity, positive-price, explicit-availability, active/sold_out-only, no-false-sold contracts
- change only provider parser/tests
- perform zero provider requests/DB writes during implementation

#173 is collection semantics and requires independent Verifier + Reviewer unless the user grants a new task-specific exception.

## R2 remains unapproved

Planned R2 from `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`:

- 4 known listings, 2 Rakuten + 2 Yahoo
- bounded Production persistence
- deterministic observation IDs
- exact before/after counts and post-write reread
- no listing-count change expected
- no false `sold`

This is a future separate explicit Production DB approval. R1 completion does not authorize it.

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

## Source posture

- Rakuten: active
- Yahoo: active provider, but permanent exact-read parser blocked by #173 until repaired
- Aucfan: paid access diligence only
- Mercari C2C: partnership required; no scraping
- X: paid access required
- GSC connected reporting path: last seen subscription-unavailable, not zero traffic

Use `docs/DATA_SOURCE_CAPABILITY_MATRIX.md` for the full canonical matrix.

## Hard boundaries

- no R2 Production writes without explicit approval
- no further Yahoo calls under exhausted #172 approval
- do not merge #173 without required review/new explicit exception
- do not merge #142 or dispatch F0 without separate approval
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not weaken matcher, mix sold/current evidence, or scrape Mercari/Amazon

## Exact next step

This docs-only canonical sync is the phase gate. After it is green, merged, and Production READY, reset/recreate #173 repair from the new main and implement/test the exact `/* */` compatibility only. Stop at #173's independent-review boundary before merge if no new reviewer/substitution is available.
