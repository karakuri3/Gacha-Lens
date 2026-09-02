# Gacha Lens Status

Updated: 2026-09-02 JST — post-Yahoo JSONP repair (#173/#176) checkpoint

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live state before acting.

## Repository / release

- repo: `karakuri3/Gacha-Lens`
- canonical main before this sync: `a8bf9b7d7da7826544cb72a89f77b082fd86f248`
- #169 equal-time/null-time re-observation safety: merged
- #170 Production history/depth rollout plan: merged
- #171 post-#170 canonical sync: merged; Production `dpl_4CQkGPnkfd3EnmAsvNbv5M5kXpNh` READY
- #172 R1 exact-provider read-only canary: **completed**
- #175 post-R1 canonical sync: merged; Production READY
- #173 / #176 Yahoo exact JSONP padding repair: **completed / merged**
- #176 Production `dpl_4U73Cev864RvycfGGPteqQxMS246`: READY for exact merge SHA `a8bf9b7d7da7826544cb72a89f77b082fd86f248`
- #142 / #137 F0 repair: still explicit human/Production-impact bound

#176 passed independent Verifier and Reviewer gates; the old #167/#168 substitution was not reused.

## Current P0 order

Issue #119 — Data Scale.

1. finish Issue #177 post-#173 canonical sync
2. prepare an exact R2 readiness/approval packet read-only
3. freeze four persisted listings, two Rakuten + two Yahoo, without live provider calls
4. prove deterministic keys, transaction/lease, expected deltas, verification and rollback
5. request explicit live-provider and Production DB write approval for the exact R2 envelope
6. only then execute bounded R2
7. R3/R4 remain separate later approvals

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

Latest SELECT-only snapshot at `2026-09-02T05:01:10.519Z`:

- market listings: **113**
- active safe single listings: **112**
- observations: **113**
- listings with 2+ observations: **0**
- providers: **Rakuten 50 / Yahoo 63**
- fresh <30d depth: **102×1 / 1×2 / 0×3+**

At R1 close, the six frozen rows remained unchanged in price/status/`last_observed_at`, each with one observation. The later increases from 107/107 to 110/110 and now 113/113 came through independent existing Production activity, not R1 or #176 persistence.

History compounding remains the primary measurable bottleneck.

## #173 / #176 completed repair

Main now accepts the direct fixed callback or exact observed `/* */` immediately before that fixed callback, both from raw byte 0.

- direct and exact padded forms pass
- arbitrary leading whitespace/bytes/BOM, alternate/double comments, callback gaps, wrong callback, bare JSON, and malformed JSON fail closed
- caller callback override is not supported
- endpoint, redirect, identity, positive-price, explicit-availability and no-false-sold boundaries are unchanged
- independent Reviewer/Verifier, full 1992-test regression, lint, exact-head CI and Preview passed
- implementation provider requests and Production DB reads/writes were 0

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
- Yahoo: active; permanent exact-read parser repair is merged, but no new live request is authorized
- Aucfan: paid access diligence only
- Mercari C2C: partnership required; no scraping
- X: paid access required
- GSC connected reporting path: last seen subscription-unavailable, not zero traffic

Use `docs/DATA_SOURCE_CAPABILITY_MATRIX.md` for the full canonical matrix.

## Hard boundaries

- no R2 Production writes without explicit approval
- no further Yahoo calls under exhausted #172 approval
- do not reuse #172's exhausted Yahoo request envelope
- do not merge #142 or dispatch F0 without separate approval
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not weaken matcher, mix sold/current evidence, or scrape Mercari/Amazon

## Exact next step

Issue #177 docs-only canonical sync is the phase gate. After it is green, merged, and Production READY, prepare the exact R2 cohort and approval packet read-only. Do not call providers or mutate Production until the user approves the exact bounded envelopes.
