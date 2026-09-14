# Gacha Lens Durable Decisions

Updated: 2026-09-15 JST

Historical decisions remain in Git history. This file records the active durable decisions needed to resume safely.

## Infrastructure / safety decisions

- Cloudflare is Production runtime + authoritative DNS.
- Vercel is registrar/non-live rollback only; routine Git build status is non-authoritative.
- Supabase Production is `vxbrnvfhmzcxehuuzzum`; old `ihcudkfspzuixsqsvoku` is inactive.
- direct main push prohibited.
- `.github/workflows/gacha-ingestion.yml` remains disabled.
- never touch `supabase/.temp/cli-latest`.
- automatic RPC retry prohibited.
- consumed approvals/tokens are non-reusable.
- Mercari/Amazon scraping prohibited.
- unavailable analytics/revenue evidence must never be converted to measured zero.
- scheduled writes remain disabled unless separately re-authorized:
  - `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`
  - `OFFICIAL_BOUNDED_AUTO_ENABLED=false`

## D-142 — 2026-09 Fair Use restriction was historical-cycle enforcement

The restricted `2026-08-12 -> 2026-09-12` cycle ended after historical Egress overage. Released mitigations remain supported by recovery evidence. Do not reinterpret the incident as current mitigation failure without fresh evidence.

## D-143 — #238 freeze cleared from measured recovery evidence

The freeze was correct while active and closed only after provider restriction removal, fresh-cycle usage safety, representative public smoke and canonical synchronization.

## D-147 — self-review is not independent review

Where governance requires independent review, same-assistant Builder/self-review cannot satisfy it. #286 and #303 ultimately advanced only after independent Reviewer + Verifier PASS was recorded and current-main reconciliation/exact-head gates were rerun.

## D-153 — quota recovery never wakes scheduled write lanes automatically

Recovery, code release and product redesign never imply scheduled-write authorization. Re-enable remains a separate lane-specific decision.

## D-155 — public-read restriction incident is resolved

Representative public routes recovered after provider restriction cleared. Treat #281 as resolved unless fresh evidence reproduces the failure.

## D-156 — do not ship #282 after the incident disappeared

#282 closed unmerged. Revisit only if a future outage reproduces the same degraded-response semantics and the extra response handling is justified again.

## D-160 — #286 is released reliability coverage, not measured savings

#286 expanded only the existing bounded series-detail cache matcher to canonical parent-series detail and released as merge `b9b8165c73e6ee9290ebadf9f6bd7802c545f7f6` after independent Reviewer + Verifier PASS and exact-head Code Quality/runtime/cache proof PASS.

Dedicated Preview evidence proved parent-series cold `MISS` -> warm `HIT` -> `HIT`, byte-identical HTML, marker `series-detail-1800-v1` and no `Set-Cookie`.

#285 is closed. Do **not** claim measured Production egress savings until actual before/after traffic evidence exists.

## D-161 — docs/workflow-only Cloudflare build waste remains separate cost hygiene

#284 remains a distinct provider-settings lane. Current evidence shows docs/workflow-only changes can still trigger Cloudflare Preview builds. A bounded exclusion/rollback plan exists, but Cloudflare Build Watch must not be changed without separate explicit approval and post-change proof.

## D-163 — user-visible repairs precede unrelated migration-history work

Foundation/provider-ledger prerequisites block only the lanes that depend on them. Do not let dormant migration-history work delay user-value releases.

## D-164 — merging product/runtime code never implies Official lane re-enable

Code releases and scheduled-write authorization are separate decisions. Official remains disabled until a new explicit lane approval.

## D-165 — dependency-security baseline is complete unless fresh evidence reopens it

The framework/security repair train was completed through #291/#287. Do not restart it from stale instructions.

## D-166 — #303 Collector Editorial is the released product baseline

#303 is no longer a pending Draft. It released after:
- current-main non-destructive reconciliation;
- independent Reviewer + Verifier PASS;
- natural test/lint `34856915575` PASS;
- compatibility `34856915830` PASS;
- screenshots `34856915548` PASS;
- exact-head runtime `34856915847` PASS;
- isolated cache proof `34856915789` PASS;
- Cloudflare Workers build `5e69aab5-9673-45dc-b535-cf021fffcffd` PASS.

Merge commit: `8a090d116fda6234c53d327760c9ce1c933fdd6e`.

Cloudflare Production was directly verified at 100% traffic on version `c2ede0e8` linked to that commit. Treat Collector Editorial as the current user-facing baseline; do not default back to redesign churn without measured evidence.

## D-167 — fresh #319 scorecard supersedes dated affiliate priority

The 2026-09-14 SELECT-only scorecard remains the pre-release/current-state reference. Its low affiliate overlap and shallow market coverage mean the old 2026-09-06 affiliate cohort is historical prioritization evidence, not a current execution target.

#263/#266/#268 and #264/#267/#269 remain HOLD until fresh post-release demand reactivates the lane.

## D-168 — low data coverage does not automatically reactivate broad Data Scale

#119/#257/#260 remain HOLD. Low market coverage alone is not a user-value signal. Prefer demand-weighted data quality unless fresh usage proves broader collection has higher user/revenue ROI.

## D-169 — analytics/revenue availability is a truthfulness state

At the current checkpoint:
- Cloudflare Web Analytics is **available and active** for `gachalens.com`;
- Search Console remains unavailable through current GSC Wizard access;
- PostHog remains unavailable in the current tool session;
- provider revenue/orders remain unavailable;
- X/social remains not instrumented for #319.

Unavailable sources must not be reported as zero or used to justify purchasing/enabling a provider by implication.

## D-170 — use privacy-minimized Cloudflare Web Analytics before adding a new first-party analytics DB

#322 completed without creating a new Supabase pageview/event table. Live dashboard audit proved:
- Web Analytics site configured for `gachalens.com`;
- automatic RUM injection;
- mode `Enable, excluding visitor data in the EU`;
- Path visibility for `/`, `/series`, `/series/group/...`.

Cloudflare's current documented RUM behavior does not use browser storage such as cookies/localStorage/sessionStorage/IndexedDB for analytics and discards source IP at the nearest data center rather than storing it in core logs/databases.

Do not broaden collection by removing the EU exclusion without a separate privacy decision.

## D-171 — Production outbound-click demand must exclude Preview/noncanonical hosts

#323 released a server-side canonical-host guard: only HTTPS `gachalens.com` can record `outbound_clicks`. Preview/localhost/noncanonical hosts return 204 before body parsing/DB insertion. Historical rows are preserved, not rewritten.

This makes future click evidence cleaner but does not retroactively validate old rows.

## D-172 — post-release business measurement starts at a clean epoch

Use:

**T0 = 2026-09-15 00:00 JST**

for the fresh #319 measurement phase.

Do not treat pre-T0 Web Analytics values or the old 34-click rolling window as clean post-product demand. The old click audit found 23/34 events in same-day same-page 3+ provider bursts, so those rows are not reliable as organic purchase intent.

Align the same post-T0 window across Cloudflare Visits/Page views/Path and Production-only outbound clicks. Compute an intent/conversion-like rate only where the denominator is meaningful.

## Current ordered decision

1. Observe fresh post-T0 behavior on the live #303 baseline.
2. Continue #319 from aligned current windows, not historical rolling residue.
3. If meaningful demand overlaps affiliate-eligible inventory, recompute/reconcile the affiliate stack before execution.
4. If demand exists but market evidence is shallow/stale on used pages, prefer demand-weighted market-quality/re-observation.
5. Keep #119/#257/#260 broad Data Scale HOLD unless fresh evidence proves higher user/revenue ROI.
6. Keep #284 separate and approval-bound; do not bundle analytics/build settings changes.
7. Keep both scheduled write lanes disabled until separately authorized.

This order is not blanket merge/Production/provider/workflow/Secret/billing approval.
