# Gacha Lens Canonical Handoff

Updated: 2026-09-11 JST

This file is the active-state handoff. Historical detail remains in Git history and `docs/history/`.

## Resume rule

If a new thread receives only **「Gacha Lens続けて」**:

1. Read `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/PRODUCTION_RELEASE_POLICY.md`, and `docs/AUTO_MERGE_POLICY.md`.
2. Re-fetch current `main`, Issues #219/#238/#280/#281/#284/#285/#287/#262, and Draft PRs #250/#282/#286/#265/#258/#273/#269.
3. Do not restart the company-infrastructure migration; it is complete.
4. Do not merge Production runtime changes, mutate Production DB/history, re-enable scheduled writes, change Secrets/Variables, call providers, dispatch workflows, or buy paid services by implication.

## Production

- repo: `karakuri3/Gacha-Lens`
- Production main: `83b0b36e5d0172f3ea6964206edad6480a13b4bb`
- URL: `https://gachalens.com`
- runtime/DNS: Cloudflare
- Vercel: registrar + non-live rollback only
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- old `ihcudkfspzuixsqsvoku` is inactive

## Egress incident / #238 freeze

Supabase cycle **2026-08-12 -> 2026-09-12** is restricted for Egress Exceeded. Last authoritative provider evidence recorded org Egress **25.242 / 5 GB**, Gacha **23.003 GB**, Beach **0.444 GB**. Released #249/#251 remain technically supported; pre-enforcement post-fix burn was ~`0.0104 GB/day` org-wide and the former amplifier was nearly flat.

#238 remains **OPEN / Production freeze ACTIVE**. The calendar date alone never clears it.

After the provider moves to the next cycle, enter a recovery-observation phase before normal releases:
1. prove the new cycle is active and Fair Use restriction / HTTP 402 is gone;
2. record a fresh Gacha-filtered Egress baseline;
3. run only minimal public/runtime smoke and confirm no former amplifier recurrence;
4. take another provider-usage sample after the dashboard has had enough time to refresh and derive a fresh-cycle burn slope; target remains comfortably <= `0.12 GB/day`;
5. only when the evidence is green synchronize canonical state and close #219/#238.

Do not interpret the first healthy request or the date rollover itself as sufficient recovery evidence.

## #280 scheduled-write guard — natural proof COMPLETE

Owner-approved temporary gates remain:
- `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`
- `OFFICIAL_BOUNDED_AUTO_ENABLED=false`

Other write-capable automatic lanes remain disabled/false-by-default as already audited.

P3 has repeated natural no-op/write0 evidence. Official now also has repeated post-disable natural evidence:
- run #15 / `34324135554`, natural `event=schedule`, exact main `83b0b36e...`, SUCCESS;
- run #16 / `34449938117`, natural `event=schedule`, exact main `83b0b36e...`, SUCCESS;
- both saw `OFFICIAL_BOUNDED_AUTO_ENABLED=false`;
- live audit, bounded-plan decision and Production transaction were skipped;
- terminal verdict `OFFICIAL_BOUNDED_AUTO_DISABLED`;
- `database_writes: 0`, `deletes: 0`, `secret_findings: 0`.

GitHub delivered these runs later than the nominal cron time; do not over-attribute the exact delivery slot. No manual dispatch was used.

The #280 technical closure criteria are satisfied once this synchronized canonical state is recorded. Closing #280 must **not** re-enable either lane. Both enable variables remain false through #238 closure and until a separate lane-specific authorization.

## #281 / Draft #282 public-read outage containment

Production public data pages can render `商品情報を取得できません` while outer HTTP has been observed as healthy 200. Draft #282 exact head `4d95413a9dcdd9a35555f5f40e47568f53a5245d` provides bounded request-scoped 503/no-store containment for all 14 audited public server-data route shapes.

Engineering/Preview evidence is green; independent review remains pending. The response-clone drain can add CPU/memory/TTFB. **After reset, reassess #281 before shipping #282.** If normal data and healthy HTTP semantics return, preserve/close #282 without Production release. If the incident persists, require genuine independent review, bounded Preview performance comparison, and explicit applicable Production authority.

## Reliability / cost follow-ups

- #284: docs-only Cloudflare Preview build waste; settings change remains separately approval-bound.
- #285/#286: parent-series shared-cache candidate exact `710c21751f41bfedb9eb20cc5f0573b8fa842df6`; repository/Preview PASS, healthy cold->warm proof pending after recovery.
- #287: current `npm ci` reports 12 vulnerabilities (1 critical / 8 high / 2 moderate / 1 low). This is a triage signal, not proof of deployed exploitability. Classify exact advisories and runtime reachability before the post-freeze release train; never run `npm audit fix --force` blindly.

## Validated Drafts

- #265 governance `c8d671abc9be785f3c6c34a3ff6ceef858e07d3a`: independent review pending.
- #258 CI source-pin `76dac8708abaffd2ffcada7d7aa64bdc49b06e90`: prior runtime/cache/CQ PASS; reconfirm Production source before merge.
- #253 Japanese category routing `798e44b3052f94be147bab4b2d36a9421c11a475`: user-visible fix, rebase/revalidate after prerequisites.
- #261 rerelease canonical fix `5c3643438e19244a449fb627b4967e00ac7a0eeb`: rebase/revalidate after prerequisites; merging must not imply scheduled-lane re-enable.
- #273 Foundation repair `42c8f9934a92cda0be5fd58f2dccc7d4db17299c`: repository PASS, Production history reconciliation separately gated.
- #269 affiliate authorization ledger `574a9a4c10c3fd6cd275229c95c9b3adef8de84f`: repository/disposable DB PASS; depends on #273 before Production use; provider execution not authorized.
- #257/#260 R5: HOLD unless fresh scorecard reprioritizes.

## Revised post-reset order

0. Enter recovery-observation mode: actual next-cycle/no402 + baseline + minimal smoke/amplifier check + refreshed second Egress sample/slope.
1. Reassess #281/#282; do not ship incident containment if recovery removed the incident.
2. Close #219/#238 only when all recovery gates are green. Keep P3/Official enable variables false.
3. Independently review/revalidate and land #265 / close #262.
4. Reconfirm Production source and revalidate/land #258 under its workflow-file boundary.
5. Triage #287. If a runtime-reachable critical/high advisory is confirmed, patch it before ordinary feature/monetization releases; otherwise keep it on the appropriate backlog.
6. Rebase/revalidate/release #253 first as the clearest current user-visible defect.
7. Rebase/revalidate/release #261. The Official scheduled lane stays disabled until separate explicit re-enable authority; only after that authority should a natural F0 run be observed.
8. Reassess #286 after healthy service; release only if bounded cold->warm proof shows useful origin savings.
9. Run a fresh business scorecard. If affiliate monetization still dominates, proceed with fresh #264/#267 bindings, then independently review/reconcile #273 only when needed as the DB prerequisite for #269, then #269 under separate Production/provider approvals.
10. Keep #257/#260 HOLD unless fresh evidence says Data Scale now outranks user value/monetization.
11. Re-enable each scheduled lane only under separate post-#238 lane-specific authorization.

This order deliberately moves #273 behind user-visible fixes because it is not a prerequisite for #253/#261 and carries a higher-risk Production migration-history boundary.

## Hard boundaries

- no direct main push
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no automatic RPC retry
- no Production DB/history mutation by implication
- no provider action by implication
- no workflow dispatch/change by implication
- no Secrets/Variables mutation by implication
- no scheduled-lane re-enable by implication
- no paid/destructive action without approval
- do not scrape Mercari or Amazon
