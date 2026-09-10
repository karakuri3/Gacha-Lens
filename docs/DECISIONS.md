# Gacha Lens Durable Decisions

Updated: 2026-09-11 JST

Historical decisions remain in Git history. This file records the active durable decisions needed to resume safely.

## Infrastructure / safety decisions

- Cloudflare is Production runtime + authoritative DNS.
- Vercel is registrar/non-live rollback only; routine Git builds remain disabled.
- Production main is `83b0b36e5d0172f3ea6964206edad6480a13b4bb`.
- Supabase Production is `vxbrnvfhmzcxehuuzzum`; old `ihcudkfspzuixsqsvoku` is inactive.
- direct main push prohibited.
- `.github/workflows/gacha-ingestion.yml` remains disabled.
- never touch `supabase/.temp/cli-latest`.
- automatic RPC retry prohibited.
- consumed approvals/tokens are non-reusable.
- Mercari/Amazon scraping prohibited.

## D-142 — restriction is historical-cycle enforcement unless fresh evidence disproves it

Cycle 2026-08-12 -> 2026-09-12 is restricted for Egress Exceeded. #249/#251 post-fix evidence showed ~0.0104 GB/day and nearly-flat former amplifier fingerprint. Do not infer mitigation regression from historical-cycle restriction alone.

## D-143 — #238 Production freeze remains authoritative

Allowed: isolated branch/test/Preview/docs/review/read-only evidence. Frozen: Production runtime merge, DB/schema/data/history, DNS/Auth/write/admin, Secrets/Variables without explicit approval, provider/load experiments, paid plan/billing, and unrelated Production releases.

## D-153 — quota recovery must not wake scheduled write lanes automatically

Owner-approved gates remain `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false` and `OFFICIAL_BOUNDED_AUTO_ENABLED=false`. They remain false even after HTTP 402 clears. Re-enable requires #238 closure plus new lane-specific authorization.

## D-154 — both guarded lanes now have repeated natural no-op/write0 proof

Manual dispatch is not evidence for the natural-schedule requirement.

P3 has repeated natural post-disable no-op/write0 proof. Official also now has two consecutive natural post-disable schedule runs:
- #15 / `34324135554` on exact main `83b0b36e...`;
- #16 / `34449938117` on exact main `83b0b36e...`.

Both Official runs saw `OFFICIAL_BOUNDED_AUTO_ENABLED=false`; live audit, planning and transaction were skipped; terminal verdict was `OFFICIAL_BOUNDED_AUTO_DISABLED`; database writes/deletes were 0. GitHub delivered the runs later than the nominal cron time, so only the natural `schedule` event is authoritative, not an exact wall-clock slot.

#280 can close after canonical synchronization. Closure does not authorize lane re-enable.

## D-155 — public-read outage includes unhealthy HTTP semantics

Production core public data can render `商品情報を取得できません` while outer HTTP is seen as healthy 200. This is a P0 availability/HTTP-semantics incident.

## D-156 — #282 is the current bounded containment candidate

Exact head `4d95413a9dcdd9a35555f5f40e47568f53a5245d`; public server-data route inventory is 14/14 covered. Engineering/Preview evidence is green, independent review remains pending. No extra Supabase/provider request or retry is introduced.

## D-158 — #282 performance overhead is a release gate if still needed

The response-clone drain can add CPU/memory/TTFB. If recovery leaves #281 unresolved, require bounded Preview performance comparison plus genuine independent review before Production authority.

## D-159 — do not ship incident containment if recovery removes the incident

After the actual provider reset, reassess #281 first. Healthy data + healthy HTTP semantics means preserve/close #282 rather than release it opportunistically.

## D-160 — #286 remains measured follow-up, not assumed savings

Draft #286 exact `710c21751f41bfedb9eb20cc5f0573b8fa842df6` expands only the existing series-detail cache matcher to parent-series detail. It is not runtime-cache PASS until healthy cold->warm exact-Preview proof and origin-behavior measurement are obtained.

## D-161 — docs-only Cloudflare build waste is separate cost hygiene

#284 tracks Build Watch exclusion for `docs/*`. Settings mutation remains separately approval-bound; required canonical updates should be consolidated into one commit where practical.

## D-162 — post-reset uses recovery-observation mode, not instant unfreeze

A new billing-cycle label or one healthy request is insufficient. Before #238 closes, collect an initial fresh-cycle Gacha Egress baseline, minimal public/runtime/amplifier evidence, and a second provider-usage snapshot after refresh to calculate a fresh burn slope. The target remains comfortably <=0.12 GB/day. Only then resume Production releases.

## D-163 — user-visible repairs precede unrelated migration-history work

#273 is required for the later #269 database/authorization lane, but it is not a prerequisite for #253 or #261. Therefore #273 no longer blocks the current user-visible category/rerelease fixes. After governance/CI authority is repaired, prioritize #253 then #261; move #273 into the monetization/DB lane immediately before it is needed by #269.

This reduces Production migration-history risk and shortens time-to-user-value without weakening #273's independent-review or exact reconciliation gate.

## D-164 — merging #261 never implies Official lane re-enable

#261 may later be released under its own Production approval, but `OFFICIAL_BOUNDED_AUTO_ENABLED` remains false until a separate explicit lane-specific authorization. Only after such re-enable authority may the next natural F0 execution be observed. Do not conflate code release with scheduled-write authorization.

## D-165 — dependency-security warnings require classification before ordinary release train

Natural Official runs #15/#16 report `npm ci` with 12 vulnerabilities: 1 critical, 8 high, 2 moderate, 1 low. Issue #287 tracks exact advisory/dependency-path/runtime-reachability triage. The warning alone does not prove Production exploitability, but a confirmed runtime-reachable critical/high issue moves ahead of ordinary feature/monetization releases. Never apply `npm audit fix --force` blindly.

## D-147 — self-review is not independent review

Where genuine independent review is required (#282/#265/#273/#269 and any future gate that says so), same-assistant self-review cannot satisfy it. Paid review must not be invoked without explicit approval.

## Revised post-reset ordered decision

0. Recovery-observation mode: actual next-cycle/no402, fresh Egress baseline, minimal smoke/amplifier check, second refreshed usage sample and slope.
1. Reassess #281/#282.
2. Close #219/#238 only when all recovery gates pass; keep scheduled variables false.
3. Independently review/revalidate and land #265 / close #262.
4. Reconfirm Production source and revalidate/land #258.
5. Triage #287; insert a runtime security fix here if required.
6. Rebase/revalidate/release #253.
7. Rebase/revalidate/release #261; scheduled Official remains false until separate approval.
8. Reassess #286 from healthy-service evidence.
9. Fresh business scorecard. If monetization still dominates, proceed #264/#267, then independently review/reconcile #273 when needed before #269, then #269 under its separate boundaries.
10. Keep #257/#260 HOLD unless fresh evidence reprioritizes them.
11. Re-enable any scheduled lane only under a separate post-#238 lane authorization.

This order is not blanket merge/Production/provider/workflow/Secret/billing approval.
