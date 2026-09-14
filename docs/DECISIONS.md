# Gacha Lens Durable Decisions

Updated: 2026-09-14 JST

Historical decisions remain in Git history. This file records the active durable decisions needed to resume safely.

## Infrastructure / safety decisions

- Cloudflare is Production runtime + authoritative DNS.
- Vercel is registrar/non-live rollback only; routine Git builds remain disabled/non-authoritative.
- Supabase Production is `vxbrnvfhmzcxehuuzzum`; old `ihcudkfspzuixsqsvoku` is inactive.
- direct main push prohibited.
- `.github/workflows/gacha-ingestion.yml` remains disabled.
- never touch `supabase/.temp/cli-latest`.
- automatic RPC retry prohibited.
- consumed approvals/tokens are non-reusable.
- Mercari/Amazon scraping prohibited.
- unavailable analytics/revenue evidence must never be converted to measured zero.

## D-142 — 2026-09 Fair Use restriction was historical-cycle enforcement

The restricted `2026-08-12 -> 2026-09-12` cycle ended after historical Egress overage. Released #249/#251 remain supported by both pre-enforcement low burn and post-reset recovery evidence. Do not reinterpret that incident as mitigation regression without fresh evidence.

## D-143 — #238 freeze clears only from measured recovery evidence

The freeze was correct while active. It may close only after actual provider restriction removal, fresh-cycle usage safety, minimal public smoke, former-amplifier non-recurrence, and canonical synchronization. The 2026-09-13 evidence satisfied those gates.

## D-153 — quota recovery never wakes scheduled write lanes automatically

`P3_BOUNDED_SEED_V2_AUTO_ENABLED=false` and `OFFICIAL_BOUNDED_AUTO_ENABLED=false` remain false after recovery. Re-enable requires new lane-specific authorization.

## D-154 — guarded scheduled lanes have natural no-op/write0 proof

Manual dispatch is not accepted as substitute evidence. Reset-day natural runs reconfirmed safety: Official #18 `34680299101` and P3 #95 `34689497050` both ran on exact main with disabled gates and Production writes 0.

## D-155 — public-read restriction incident is resolved

During restriction, core public data could render `商品情報を取得できません` with unhealthy outer-200 semantics. After provider restriction cleared, representative core routes again rendered normal live data. Treat #281 as resolved by provider recovery.

## D-156 — do not ship #282 after the incident has disappeared

Draft #282 remains useful incident research, but its response-clone drain adds CPU/memory/TTFB. Because normal service returned, it closed unmerged. Revisit only if a future outage reproduces the same bad HTTP semantics.

## D-160 — #286 remains measured follow-up, not assumed savings

Draft #286 expands only the bounded series-detail cache matcher to parent-series detail. Its exact Preview/cache/runtime proof is green, but release remains gated by genuine independent Reviewer + Verifier. Do not claim measured Production egress savings without actual measurement.

## D-161 — docs-only Cloudflare build waste is separate cost hygiene

#284 tracks the remaining cost-hygiene problem. Exact proof-workflow exclusions already exist, but broader docs-only settings mutation remains separately approval-bound and must not be called solved without direct evidence.

## D-162 — org-wide usage can serve as a stricter recovery upper bound

When project-filtered billing data is unavailable but the organization total itself is safely below the operating target, the Gacha project subset is mathematically no greater than that total. This logic is valid only when the org-wide measurement is fresh and actually available.

## D-163 — user-visible repairs precede unrelated migration-history work

Foundation/migration prerequisites should block only the lanes that need them. Do not let dormant provider-ledger work delay unrelated user-value releases.

## D-164 — merging product/runtime code never implies Official lane re-enable

Code release and scheduled-write authorization are separate decisions. Official remains disabled until a new explicit lane approval.

## D-165 — dependency-security baseline is a pre-feature release priority

The security/framework repair train was completed through #291/#287. Do not restart it from older stale instructions unless fresh dependency evidence creates a new issue.

## D-147 — self-review is not independent review

Where genuine independent review is required, same-assistant Builder/self-review cannot satisfy it. Paid review must not be invoked without explicit approval. This applies to current #286 and substantial product release #303.

## D-166 — #303 is technically proven but remains independently gated

Collector Editorial #303 has been reconciled non-destructively to the current-main checkpoint and has green exact-head Code Quality, vinext, runtime smoke, cache proof and visual QA. Real Japanese-data validation through #317/#318 also passed, including 21/21 bounded HTTP 200 reads on the final integrated pass and multi-viewport visual inspection.

This technical evidence does **not** substitute for the genuine independent release review required for a substantial product/UI change. #303 must remain Draft until that gate passes and main/head drift is rechecked.

## D-167 — fresh #319 scorecard supersedes dated affiliate priority

The 2026-09-14 SELECT-only Production scorecard is the current business decision source. Key evidence:
- 10,241 series / 23,808 variants
- 176 market listings
- 163 variants fresh <30d / 0.6846% catalog coverage
- 161 of 163 fresh covered variants have one listing
- 198 observations / 22 re-observed listings / 12.5% re-observation rate
- 0 new listings and 0 new observations in the last 7d
- outbound clicks 34 / 30d but 0 / 7d
- verified affiliate provenance 10 listings, all Rakuten
- affiliate-eligible exact `(variant_id, provider)` clicks 0 / 34
- review-safe stock/restock 0 / 0

Therefore the 2026-09-06 affiliate-demand cohort is historical prioritization evidence, not a current execution target. #263/#266/#268 and Drafts #264/#267/#269 remain useful implementation assets but are HOLD behind #319 until fresh post-product demand reactivates the lane.

## D-168 — low data coverage does not automatically reactivate broad Data Scale

Market coverage is clearly shallow, but recent user demand and collection freshness are also weak. Broad #119/#257/#260 Data Scale remains HOLD.

After the current product baseline is released, observe fresh behavior. If monetization demand appears, target affiliate coverage on current demand. If demand remains sparse, prefer a demand-weighted market-quality/re-observation experiment on actually used pages/variants before broad provider expansion. Do not optimize for provider count, row count, or infrastructure activity as a proxy for user value.

## D-169 — external analytics/revenue availability is a truthfulness state

At the #319 checkpoint:
- Search Console is unavailable through the connected GSC Wizard because the subscription/trial does not permit the read;
- PostHog/product analytics is unavailable in the current tool session;
- verified provider revenue/orders are unavailable;
- X/social is not instrumented for this decision.

None of those states may be reported as zero. Their absence also does not authorize purchasing a plan, enabling a provider, changing credentials, or creating new tracking by implication.

## Current ordered decision

1. Keep #286 frozen Draft and obtain genuine independent Reviewer + Verifier.
2. Keep #303 frozen Draft and obtain genuine independent release review/verification.
3. When an independent gate passes, re-fetch `main`, check overlap/drift, rerun affected exact-head gates if needed, then apply complete Auto-Merge + Production Release policy.
4. Release only through ordinary Git-triggered Cloudflare and run bounded public smoke.
5. After the current product baseline is live, collect fresh first-party usage and continue #319.
6. If fresh monetization demand wins, recompute/reconcile #264 -> #267 -> #269 under their separate independent-review, DB, provider and persistence gates.
7. If demand remains weak, prefer demand-weighted market-quality/re-observation before broad Data Scale.
8. Keep #119/#257/#260 HOLD unless fresh evidence changes the ranking.
9. Finish #284 only from measured build behavior.
10. Re-enable any scheduled lane only under separate authorization.

This order is not blanket merge/Production/provider/workflow/Secret/billing approval.
