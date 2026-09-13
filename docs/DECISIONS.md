# Gacha Lens Durable Decisions

Updated: 2026-09-13 JST

Historical decisions remain in Git history. This file records the active durable decisions needed to resume safely.

## Infrastructure / safety decisions

- Cloudflare is Production runtime + authoritative DNS.
- Vercel is registrar/non-live rollback only; routine Git builds remain disabled.
- Supabase Production is `vxbrnvfhmzcxehuuzzum`; old `ihcudkfspzuixsqsvoku` is inactive.
- direct main push prohibited.
- `.github/workflows/gacha-ingestion.yml` remains disabled.
- never touch `supabase/.temp/cli-latest`.
- automatic RPC retry prohibited.
- consumed approvals/tokens are non-reusable.
- Mercari/Amazon scraping prohibited.

## D-142 — 2026-09 Fair Use restriction was historical-cycle enforcement

The restricted `2026-08-12 -> 2026-09-12` cycle ended after historical Egress overage. Released #249/#251 remain supported by both pre-enforcement low burn and post-reset recovery evidence. Do not reinterpret that incident as mitigation regression without fresh evidence.

## D-143 — #238 freeze clears only from measured recovery evidence

The freeze was correct while active. It may close only after actual provider restriction removal, fresh-cycle usage safety, minimal public smoke, former-amplifier non-recurrence, and canonical synchronization. The 2026-09-13 evidence satisfies those gates.

## D-153 — quota recovery never wakes scheduled write lanes automatically

`P3_BOUNDED_SEED_V2_AUTO_ENABLED=false` and `OFFICIAL_BOUNDED_AUTO_ENABLED=false` remain false after recovery. Re-enable requires new lane-specific authorization.

## D-154 — guarded scheduled lanes have natural no-op/write0 proof

Manual dispatch is not accepted as substitute evidence. Reset-day natural runs reconfirmed safety: Official #18 `34680299101` and P3 #95 `34689497050` both ran on exact main with disabled gates and Production writes 0.

## D-155 — public-read restriction incident is resolved

During restriction, core public data could render `商品情報を取得できません` with unhealthy outer-200 semantics. After provider restriction cleared, `/`, `/series`, and representative parent-series detail again render normal live data. Treat #281 as resolved by provider recovery.

## D-156 — do not ship #282 after the incident has disappeared

Draft #282 exact `4d95413a9dcdd9a35555f5f40e47568f53a5245d` remains useful incident research, but its response-clone drain adds CPU/memory/TTFB. Because normal service returned, close it unmerged. Revisit only if a future outage reproduces the same bad HTTP semantics.

## D-160 — #286 remains measured follow-up, not assumed savings

Draft #286 expands only the bounded series-detail cache matcher to parent-series detail. Release only if healthy cold->warm exact-Preview proof and origin measurement show material value.

## D-161 — docs-only Cloudflare build waste is separate cost hygiene

#284 tracks Build Watch exclusion for `docs/*`. Settings mutation remains separately approval-bound; canonical docs updates should be consolidated to minimize pointless Preview builds.

## D-162 — org-wide usage can serve as a stricter recovery upper bound

When project-filtered billing data is unavailable but the organization total itself is safely below the operating target, the Gacha project subset is mathematically no greater than that total. At recovery, org Usage remained `0.00 GB` across separated samples and therefore proves Gacha burn compatible with the `<=0.12 GB/day` target with wide margin.

## D-163 — user-visible repairs precede unrelated migration-history work

#273 is required for the later #269 DB/authorization lane, not for #253 or #261. Keep #273 immediately before the monetization/DB lane rather than blocking current user-value fixes.

## D-164 — merging #261 never implies Official lane re-enable

Code release and scheduled-write authorization are separate decisions. Official remains disabled until a new explicit lane approval.

## D-165 — dependency-security baseline is a pre-feature release priority

Current framework versions remain behind patched security releases. Preferred isolated target remains Next/`eslint-config-next` `16.3.3` and React/ReactDOM `19.2.8`. Regenerate the lock normally, run fresh audit and complete test/lint/vinext/Cloudflare Preview verification. Never use `npm audit fix --force` or hand-edit the lockfile.

## D-147 — self-review is not independent review

Where genuine independent review is required (#265/#273/#269 and any future gate that says so), same-assistant self-review cannot satisfy it. Paid review must not be invoked without explicit approval.

## Post-freeze ordered decision

1. Independently review/revalidate and land #265 / close #262.
2. Reconfirm Production source and revalidate/land #258.
3. Complete #287 security update if patched targets remain applicable.
4. Rebase/revalidate/release #253.
5. Rebase/revalidate/release #261; scheduled Official remains false.
6. Reassess #286 from healthy-service evidence.
7. Fresh business scorecard. If monetization still dominates, proceed #264/#267, then #273 when needed before #269, then #269 under its separate boundaries.
8. Keep #257/#260 HOLD unless fresh evidence reprioritizes them.
9. Re-enable any scheduled lane only under separate authorization.

This order is not blanket merge/Production/provider/workflow/Secret/billing approval.
