# Gacha Lens Canonical Handoff

Updated: 2026-09-14 JST — release train synchronized after recovery

This file is the active-state handoff. Historical detail remains in Git history and `docs/history/`.

## Resume rule

If a new thread receives only **「Gacha Lens続けて」**:

1. Read `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/PRODUCTION_RELEASE_POLICY.md`, and `docs/AUTO_MERGE_POLICY.md`.
2. Re-fetch current `main`, active Issues/PRs, current Supabase usage, and current Cloudflare Production source before mutating anything.
3. Resume existing active Drafts before creating duplicate implementation work.
4. Do not restart the company-infrastructure migration, Fair Use incident response, Cloudflare-governance cutover, security upgrade, Japanese category repair, or rerelease canonical repair; those lanes have already landed.
5. Keep scheduled write lanes disabled unless separately and explicitly authorized.

## Production / current main

- repo: `karakuri3/Gacha-Lens`
- current `main`: `1adc56a7729fddac794de7e3566e316cfe918530`
- latest merged feature/fix at this checkpoint: #261 rerelease canonical year/month repair
- URL: `https://gachalens.com`
- runtime/DNS: Cloudflare
- Vercel: registrar + non-live rollback only; routine Git builds are non-authoritative
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- old `ihcudkfspzuixsqsvoku` is inactive

## Completed release-train work

Do not re-open these as prerequisites merely because older canonical docs or PR bodies still list them as future work:

- #219/#238: recovery/freeze closed after measured provider recovery
- #281: public-read outage resolved by provider recovery
- #282: emergency containment closed without merge
- #280: scheduled-write safety complete; lanes remain disabled
- #265/#262: Cloudflare standing release governance merged/closed
- #258: Cloudflare runtime/cache proof pinning merged
- #273: fresh-database `forecast_snapshots` migration baseline repair merged
- #291/#287: framework security + deterministic vinext validation merged with genuine independent Reviewer/Verifier evidence
- #253: Japanese stored category routing merged
- #261: rerelease canonical year/month repair merged; Official auto still disabled
- #307: GitHub Actions stale-run cancellation merged for bounded CI cost control

## Active release candidate — #285 / #286

PR #286 is the highest-priority existing verification/release item.

Purpose: include canonical `/series/group/:slug` pages in the existing bounded 30-minute `seriesDetail` Cloudflare edge-cache class while preserving all current public-cache exclusions.

Current candidate:
- PR: #286
- branch: `fix/parent-series-edge-cache-285`
- base: `1adc56a7729fddac794de7e3566e316cfe918530`
- head: `0afcfbf98833260debea41e6227dcf6e8190473a`
- Draft: yes
- mergeable: yes at the 2026-09-14 checkpoint

Current-head automatic checks:
- PR Code Quality `34816583524`: SUCCESS
- Cloudflare cache proof `34816583550`: SUCCESS
- Cloudflare runtime smoke `34816583572`: SUCCESS

Dedicated exact parent-series validation-only #308 is complete and closed unmerged. Final proof showed cold `MISS` -> `HIT` -> `HIT`, byte-identical 64,736-byte HTML, `series-detail-1800-v1`, no `Set-Cookie`, healthy public route smoke, expected unauthenticated boundaries and Production-equivalent-or-broader audited security-header presence.

**Stop Condition:** genuine independent Reviewer and Verifier are still pending. Do not substitute Builder/self-review. Do not mark ready or merge until that gate is genuinely satisfied and the current head/base are rechecked.

After independent PASS:
1. fetch current `main` and inspect intervening overlap;
2. rerun/reconfirm required exact-head checks if the head/base moved;
3. apply Auto-Merge and Standing Production Release gates in full;
4. normally squash merge;
5. allow only the existing Git-triggered Cloudflare application release;
6. observe the resulting release and run bounded public smoke;
7. close #285 when the released behavior is verified.

## Active product/design candidate — #303

PR #303 is a Draft product-specific redesign using the **Collector Editorial** direction. It is intended to remove generic dashboard/SaaS visual patterns and make Gacha Lens object-first and collector-oriented.

At the 2026-09-14 checkpoint it is not current-main-clean: it is ahead of its old merge base but behind current `main`. Do not merge it directly.

Required next work after the current release candidate is settled:
- non-destructively reconcile current `main` into #303;
- inspect overlap with the recently landed security/category/rerelease/CI changes;
- rerun applicable exact-head CI and Cloudflare Preview validation;
- perform visual QA at 360 px, 390 px and desktop using real Japanese data;
- cover home, catalog/search, series detail, ranking, missing-image, no-evidence, long-name, loading and error states;
- preserve market/data semantics;
- record screenshot/visual-regression approval before release consideration.

## Monetization / provider-read Draft stack

Open Drafts #264 -> #267 -> #269 remain research/implementation assets, not current release candidates.

Their older Production-demand snapshot must not be reused as if current. Before revival:
- run a fresh business scorecard;
- recompute exact-provider demand from current data;
- reconcile surviving layers onto then-current `main`;
- independently review the durable ledger where required;
- treat any Production migration/history reconciliation, provider call, approval token, affiliate provenance persistence or external write as a separate gate.

The existence of the Draft stack authorizes none of those operations.

## Reliability / cost backlog

- #284 remains open. Two exact Cloudflare proof-workflow paths already have a bounded Build Watch exclusion from earlier approved work, but the broader docs-only-build objective must not be called complete without direct evidence.
- #257/#260 R5 Data Scale remain HOLD until a fresh scorecard shows depth work outranks product quality or monetization.
- stale Drafts such as #232 should not be deleted or rewritten merely for cleanliness; reconcile/close them only through a deliberate bounded cleanup task.

## Scheduled-write safety remains locked

Owner-approved gates remain:
- `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`
- `OFFICIAL_BOUNDED_AUTO_ENABLED=false`

No recovery, code merge or UI release implicitly re-enables them. Re-enable is a separate lane-specific authorization.

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
