# Gacha Lens Canonical Handoff

Updated: 2026-09-13 JST — post-Fair-Use recovery verified

This file is the active-state handoff. Historical detail remains in Git history and `docs/history/`.

## Resume rule

If a new thread receives only **「Gacha Lens続けて」**:

1. Read `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/PRODUCTION_RELEASE_POLICY.md`, and `docs/AUTO_MERGE_POLICY.md`.
2. Re-fetch current `main`, active Issues/PRs, current Supabase usage, and current Cloudflare Production source before mutating anything.
3. Do not restart the company-infrastructure migration; it is complete.
4. Keep scheduled write lanes disabled unless separately and explicitly authorized.

## Production

- repo: `karakuri3/Gacha-Lens`
- Production main before this docs-only closeout: `83b0b36e5d0172f3ea6964206edad6480a13b4bb`
- URL: `https://gachalens.com`
- runtime/DNS: Cloudflare
- Vercel: registrar + non-live rollback only
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- old `ihcudkfspzuixsqsvoku` is inactive

## Supabase Egress incident — recovery verified

The restricted cycle `2026-08-12 -> 2026-09-12` ended after historical Egress overage. The new provider cycle is visibly `2026-09-12 -> 2026-10-12`.

Fresh recovery evidence on 2026-09-13 JST:
- prior `All services are restricted` state is gone;
- remaining `Your grace period is over` banner is a Fair Use warning, not an active restriction;
- organization Egress reads `0 / 5 GB (<1%)`, Cached Egress `0 / 5 GB`, overage `0 GB`;
- provider Usage still read `0.00 GB` at both the midday checkpoint and 21:26 JST, giving an org-wide upper bound comfortably below the conservative `<=0.12 GB/day` operating target; Gacha project burn is necessarily no greater than the organization total;
- Production `/`, `/series`, and `/series/group/tarts-y901096` all render normal live product data again;
- the former high-cost amplifier fingerprint moved only from about `681,290` calls during the incident to `681,324` at recovery verification (`+34` over roughly five days), so no recurrence is visible.

Recovery Gate is **PASS**. #219/#238 can be closed as completed incident/freeze work once this synchronized canonical state is recorded. This does not authorize scheduled-write re-enable or unrelated Production mutations.

## Scheduled-write safety remains locked

Owner-approved gates remain:
- `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`
- `OFFICIAL_BOUNDED_AUTO_ENABLED=false`

#280 is complete/closed. Natural post-disable proof includes later reset-day runs as well:
- Official run #18 / `34680299101`: natural schedule, exact main, disabled gate, live audit/plan/transaction skipped, DB writes 0;
- P3 run #95 / `34689497050`: natural schedule, exact main, disabled gate, provider work skipped, DB writes 0.

Clearing #238 does **not** re-enable either lane. Re-enable is a separate lane-specific authorization.

## #281 / #282 disposition

The public-read outage was caused by active Supabase Fair Use restriction and has now cleared with provider recovery. Normal data is again visible on representative core routes.

Draft #282 (`4d95413a9dcdd9a35555f5f40e47568f53a5245d`) was a bounded emergency 503/no-store containment candidate. It is no longer needed for the resolved incident and should be closed **without merge**. Do not ship it opportunistically merely because its engineering checks were green.

## Reliability / security follow-ups

- #284: docs-only Cloudflare Preview build waste; settings change remains separately approval-bound.
- #285/#286: parent-series shared-cache candidate; prove healthy cold->warm behavior before release and claim savings only from measurement.
- #287: current framework baseline remains behind security releases. Preferred isolated target is Next/`eslint-config-next` `16.3.3` and React/ReactDOM `19.2.8`, with normal lock regeneration, fresh audit, full tests/lint/vinext and exact Cloudflare Preview. Never use `npm audit fix --force` or hand-edit the lockfile.

## Current post-freeze release order

1. Independently review/revalidate and land #265 / close #262.
2. Reconfirm Cloudflare Production source and revalidate/land #258.
3. Complete #287 isolated framework-security update before normal user-value/monetization releases if the patched versions remain applicable.
4. Rebase/revalidate/release #253 as the clearest current user-visible defect.
5. Rebase/revalidate/release #261 while keeping Official auto disabled.
6. Reassess #286 only from healthy-service evidence; release only if measured origin savings justify it.
7. Run a fresh business scorecard. If affiliate monetization still dominates, proceed with #264/#267, then #273 only when needed as the DB prerequisite for #269, then #269 under its separate provider/Production boundaries.
8. Keep #257/#260 R5 HOLD unless fresh evidence reprioritizes Data Scale.
9. Re-enable each scheduled lane only under separate lane-specific authorization.

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
