# Gacha Lens Canonical Handoff

Updated: 2026-09-08 19:47 JST

This file is the active-state handoff. Historical detail remains in Git history and `docs/history/`.

## Resume rule

If a new thread receives only **「Gacha Lens続けて」**:

1. Read `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/PRODUCTION_RELEASE_POLICY.md`, and `docs/AUTO_MERGE_POLICY.md`.
2. Re-fetch current `main`, Issues #219/#238/#280/#281/#284/#285/#262, and Draft PRs #250/#282/#265/#273/#269.
3. Do not restart the company-infrastructure migration; it is complete.
4. Do not merge Production runtime changes, mutate Production DB/history, re-enable scheduled writes, change Secrets/Variables, call providers, dispatch workflows, or buy paid services by implication.

## Production

- repo: `karakuri3/Gacha-Lens`
- Production main: `83b0b36e5d0172f3ea6964206edad6480a13b4bb`
- URL: `https://gachalens.com`
- runtime: Cloudflare Worker `gacha-lens`
- authoritative DNS: Cloudflare
- Vercel: registrar + non-live rollback only
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- never confuse old inactive project `ihcudkfspzuixsqsvoku`

## Egress mitigation / active restriction

Released mitigations remain technically supported:
- #249 shared Cloudflare edge reuse — Production PASS
- #251 scoped cold public reads — Production PASS
- pre-enforcement post-fix burn ~`0.0104 GB/day` org-wide
- former amplifier fingerprint `681,256 -> 681,290` over ~36.3h (+34)

Supabase current cycle: **2026-08-12 -> 2026-09-12**.
Provider evidence on 2026-09-08:
- Free organization: **All services are restricted**
- reason: **Egress Exceeded**
- org Egress: **25.242 / 5 GB (505%)**
- Gacha: **23.003 GB**
- Beach: **0.444 GB**
- requests may return HTTP 402

Best-supported interpretation: historical current-cycle enforcement, not evidence that #249/#251 reverted.

## #238 Production freeze

Allowed: isolated branches, tests, disposable DB, Preview, docs/review/planning, low-impact read-only evidence.

Frozen: Production runtime merge, Production DB/schema/data/history, DNS/Auth/write/admin, Secrets/Variables without explicit approval, provider/load experiments, paid plan/billing, unrelated Production releases.

Keep #238 OPEN until after the 2026-09-12 reset proves no402, low fresh Gacha-filtered burn, minimal runtime smoke, no amplifier recurrence, and canonical sync.

## #280 scheduled-write guard

Explicit owner-approved safety mutation completed 2026-09-08 16:52 JST:
- `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`
- `OFFICIAL_BOUNDED_AUTO_ENABLED=false`

Also:
- legacy `gacha-ingestion.yml` remains manually Disabled
- other market automatic gate false
- Kitan automatic false-by-default/no-op

P3 cron first post-disable opportunity was 18:17 JST; as of 19:19 JST no new schedule-event run was observed. This is **not** no-op PASS. Next P3 opportunity: 21:17 JST. Official first post-disable opportunity: 2026-09-09 11:27 JST.

Do not manually dispatch to manufacture evidence. Both enable variables remain false through #238 closure and require separate lane-specific approval to re-enable.

## #281 public-read P0

Production core public data pages currently render `商品情報を取得できません` during restriction. External root scan saw HTTP 200 with a tiny degraded shell, so crawlers/intermediaries can misclassify the outage as healthy.

Affected route audit also confirmed Production `/series/group/series-1` reaches the same branded outage.

## #282 canonical containment candidate

Draft #282 current exact head:
**`4d95413a9dcdd9a35555f5f40e47568f53a5245d`**

The previous candidate `68465cfa...` is **superseded**. Strengthened audit found `/series/group/:slug` missing from its degraded-route allowlist even though parent-series pages perform server-side `getParentSeriesBySlug()` reads and are canonical/sitemap-linked.

Current tracked public-data HTML scope includes:
- `/`
- `/series`
- `/series/:slug`
- `/series/group/:slug`
- ranking/schedule/restocks/stock
- category/brand/franchise index+landing

Unrelated legal/editorial/admin/client/API surfaces remain outside stream draining.

Behavior: request-scoped `AsyncLocalStorage` tracks `DataSourceError`; one clone of an allowlisted GET HTML stream is drained inside the same context so late streamed failures are observed. Only tracked outer-200 `text/html` is remapped to 503 + no-store + Retry-After 3600 + `X-Gacha-Degraded: data-source-error-503-v1`.

Current evidence:
- exact PR-head Code Quality `34216342875`, job `102028876310`: **SUCCESS**
- full Node suite including parent-series regression: PASS
- lint/whitespace: PASS
- Cloudflare vinext merge-tree compatibility/build `34216342824`, job `102028964843`: **SUCCESS**
- exact Cloudflare build `60c3707c-a7dd-4ec3-9213-ce15a46df382`: **SUCCESS**
- exact Commit Preview: `https://c79cbb42-gacha-lens.senpingxingzuo.workers.dev`
- external exact Preview root scan during outage: failed / `pagesScanned=0`
- Production `/series/group/series-1`: branded outage confirmed
- superseding Reviewer/Verifier packet posted for `4d95413a...`
- independent review: **PENDING**

Production Worker read-only settings:
- compatibility date `2026-09-08`
- `nodejs_compat` enabled
- `AsyncLocalStorage` subset used by #282 is supported by current Workers docs

Performance risk:
- Production CPU baseline roughly 27–28ms
- clone drain may add CPU/memory/TTFB even though it does not duplicate Supabase/provider requests
- if #282 remains necessary after reset, bounded Preview performance comparison is required before Production release

#282 is containment, not data recovery. If reset restores normal data + healthy HTTP semantics, do not ship it merely because it is green. If outage/outer-200 persists, it still needs independent review, performance preflight, and explicit applicable Production release/emergency authority.

## Reliability / cost follow-ups

### #284 — docs-only Cloudflare Preview builds
Current Git integration includes `*` and excludes nothing, so docs-only #250 changes create Preview builds. #284 proposes `docs/*` exclusion after freeze/separate settings approval. No setting changed yet.

### #285 — parent-series shared-cache gap
Canonical `/series/group/:slug` pages are sitemap-linked server-data pages but current `seriesDetail` edge-cache matcher covers only `/series/:slug`. #285 tracks a bounded follow-up; do not mix it into #282 or claim savings until measured.

## Other validated Drafts

- #265 governance: `c8d671abc9be785f3c6c34a3ff6ceef858e07d3a`, validation PASS, independent review pending
- #273 Foundation repair: `42c8f9934a92cda0be5fd58f2dccc7d4db17299c`, CQ/vinext/Foundation PASS, independent review pending, Production history reconciliation not authorized
- #269 affiliate provider-read ledger: `574a9a4c10c3fd6cd275229c95c9b3adef8de84f`, CQ/vinext/disposable DB PASS, independent review pending, provider execution not authorized

Do not request billable Copilot review without explicit owner approval; self-review is not independent review.

## Mandatory post-reset order

0. Reassess #281/#282 before shipping containment.
1. Close #219/#238 only from fresh reset evidence; keep #280 variables false.
2. Independently review/revalidate and land #265 / close #262.
3. Revalidate/land #258 under its workflow-file boundary.
4. Independently review #273; fresh Production catalog/history parity; approved reconciliation; no blind `db push`.
5. Rebase/revalidate/release #253.
6. Rebase/revalidate/release #261 under applicable approval, then observe natural F0 run.
7. Recompute business scorecard; if monetization coverage still dominates, proceed `#264 -> #267 -> #269` with fresh bindings/tokens.
8. Keep #257/#260 R5 Data Scale HOLD unless fresh evidence reprioritizes it.
9. Re-enable automatic lanes only via separate post-#238 lane approval.
10. Synchronize canonical docs after each major release/recovery/security milestone.

## Hard boundaries

- no direct main push
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no automatic RPC retry
- no Production DB/history mutation by implication
- no provider action by implication
- no workflow dispatch/change by implication
- no Secrets/Variables mutation by implication
- #280 disable authority is consumed and non-reusable
- no paid/destructive action without approval
- do not scrape Mercari or Amazon
