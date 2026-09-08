# Gacha Lens Durable Decisions

Updated: 2026-09-09 01:31 JST

Historical decisions remain in Git history. This file records the active durable decisions needed to resume safely.

## Infrastructure / safety decisions

- Cloudflare is Production runtime + authoritative DNS.
- Vercel is registrar/non-live rollback only; routine Git builds remain disabled.
- Production main is `83b0b36e5d0172f3ea6964206edad6480a13b4bb`.
- Supabase Production is `vxbrnvfhmzcxehuuzzum`; never confuse old inactive `ihcudkfspzuixsqsvoku`.
- direct main push prohibited.
- `.github/workflows/gacha-ingestion.yml` remains disabled.
- never touch `supabase/.temp/cli-latest`.
- automatic RPC retry prohibited.
- consumed approvals/tokens are non-reusable.
- strict market identity/safety semantics remain strict.
- Mercari/Amazon scraping prohibited.

## D-142 — current Supabase restriction is historical-cycle enforcement unless fresh evidence disproves it

Cycle 2026-08-12 -> 2026-09-12 is restricted for Egress Exceeded (org 25.242/5 GB; Gacha 23.003 GB). #249/#251 post-fix evidence showed ~0.0104 GB/day and nearly-flat former amplifier fingerprint. Do not infer mitigation regression from historical-cycle restriction alone.

## D-143 — #238 Production freeze is authoritative

Allowed: isolated branch/test/Preview/docs/review/read-only evidence.
Frozen: Production runtime merge, DB/schema/data/history, DNS/Auth/write/admin, Secrets/Variables without explicit approval, provider/load experiments, paid plan/billing, unrelated Production releases.

## D-153 — quota recovery must not wake scheduled write lanes automatically

Explicit owner-approved disable completed 2026-09-08 16:52 JST:
- `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`
- `OFFICIAL_BOUNDED_AUTO_ENABLED=false`

These remain false even if HTTP 402 clears. Re-enable requires #238 closure plus new lane-specific authorization. Disable authority is consumed/non-reusable.

## D-154 — schedule safety requires actual natural-run evidence; P3 is now proven no-op/write0

Absence of a scheduled run is never sufficient no-op proof, and manual dispatch must not be used merely to manufacture evidence.

P3 now has actual post-disable natural proof:
- schedule run `34220342461` / #75 on exact main `83b0b36e...`;
- `event=schedule`;
- gate environment showed `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`;
- provider execution/artifact processing steps skipped;
- summary records `Provider fetch: skipped` and `Database writes: 0`.

Therefore P3 scheduled-write safety is **PASS**. Official remains pending until its first post-disable natural opportunity at 2026-09-09 11:27 JST and must be judged from a real natural run only.

## D-155 — public-read outage includes unhealthy HTTP semantics

Production core public data can render `商品情報を取得できません` while outer HTTP is seen as healthy 200. This is a P0 availability/HTTP-semantics incident, not only stale ingestion. Production `/series/group/series-1` is also a currently affected public data route.

## D-156 — canonical #282 candidate is `4d95413a...`; `68465cfa...` is superseded

Current exact candidate:
`4d95413a9dcdd9a35555f5f40e47568f53a5245d`

The prior candidate `68465cfa...` is invalid as a release/review target because strengthened route audit found `/series/group/:slug` absent from its degraded classification. Parent-series detail is dynamic server-data HTML (`getParentSeriesBySlug()`), canonical/sitemap-linked, and currently affected in Production.

Current design constraints:
- request-scoped `AsyncLocalStorage` only;
- explicit public-data GET HTML scope includes `/series/group/:slug` and does not generically match arbitrary deeper paths;
- drain one clone inside tracked context to observe late streamed `DataSourceError`;
- remap only tracked outer-200 `text/html` to temporary 503/no-store/Retry-After semantics;
- legal/editorial/admin/client/API surfaces stay outside drain scope;
- no additional Supabase/provider request or retry.

Complete exact-head route inventory established:
- all 26 `app/**/page.js` files audited;
- public server-data SSR resolves to 14 route shapes;
- current exact-path set plus bounded dynamic matchers cover 14/14;
- client-only, local editorial/legal, diagnostic `notFound()`, redirect and authenticated review surfaces are intentionally excluded.

Current accepted engineering evidence:
- exact PR-head Code Quality `34217094679`: SUCCESS
- exact vinext `34217094908`: SUCCESS
- exact Cloudflare commit Preview deployment for `4d95413a...`: SUCCESS
- full Node suite including parent-series/route-scope regressions: PASS
- unresolved review threads: 0
- submitted independent reviews: 0

Independent review remains PENDING.

## D-158 — #282 performance overhead is a release gate if containment remains necessary

Read-only Production CPU baseline is roughly 27–28ms. `response.clone().text()` does not duplicate origin reads but can add CPU/memory/TTFB. If reset does not remove the need for #282, perform bounded Preview performance comparison before Production release. Do not treat functional green CI as proof of negligible runtime cost.

## D-159 — do not ship incident containment after reset unless the incident still exists

After 2026-09-12 reset, reassess #281 first. If normal data + healthy HTTP semantics return, preserve/close #282 after canonical sync rather than releasing it opportunistically. If the outage/healthy-200 misclassification persists, #282 remains P0 but still requires independent review, performance preflight, and explicit applicable Production authority.

## D-160 — parent-series edge-cache gap is separate from #282

Issue #285 tracks that canonical `/series/group/:slug` server-data pages are outside the current Production 30-minute `seriesDetail` shared-cache matcher. This is Reliability/Cost follow-up, not part of degraded HTTP containment. Do not claim savings before measuring, and do not broaden cache matching to arbitrary `/series/**`.

Draft #286 exact `710c21751f41bfedb9eb20cc5f0573b8fa842df6` is the current bounded implementation candidate. It matches exactly `/series/:slug` and `/series/group/:slug`, retains the existing 30-minute policy and current safety exclusions, and has Code Quality + exact Preview deployment PASS. It is **not runtime-cache PASS** until healthy cold->warm exact-Preview proof and origin-behavior measurement are obtained after restriction clears.

## D-161 — docs-only Cloudflare build waste is separate cost hygiene

Issue #284 tracks Git integration building docs-only changes. Cloudflare Build Watch supports excluding `docs/*`; no Cloudflare setting mutation is authorized during freeze by implication. Canonical docs may still be updated when required; consolidate them into a single commit when practical to minimize needless Preview builds.

## D-147 — self-review is not independent review

#282/#265/#273/#269 require genuine independent review where specified. GitHub Copilot review has historically been treated as billable AI credits; do not request it without explicit owner approval.

## Other validated Draft decisions

- #265 exact `c8d671abc9be785f3c6c34a3ff6ceef858e07d3a`: canonical Cloudflare policy replacement, validated, independent review pending, not authoritative until landed.
- #258 exact `76dac8708abaffd2ffcada7d7aa64bdc49b06e90`: canonical CI deployed-source pin repair, prior runtime/cache/CQ PASS; re-confirm actual Production source before merge and repin/revalidate if Production moved.
- #273 exact `42c8f9934a92cda0be5fd58f2dccc7d4db17299c`: canonical fresh migration-chain repair, validated; no editing applied historical migrations, no blind `db push`, Production reconciliation separately approved only.
- #269 exact `574a9a4c10c3fd6cd275229c95c9b3adef8de84f`: canonical durable one-time provider-read authorization ledger, validated; no provider execution/persistence authority.
- #286 exact `710c21751f41bfedb9eb20cc5f0573b8fa842df6`: bounded parent-series shared-cache candidate, repository/Preview PASS, healthy runtime cache proof pending.

## Post-reset ordered release decision

0. Reassess #281/#282.
1. Close #219/#238 only from fresh reset evidence; keep #280 vars false.
2. Independently review/revalidate and land #265 / close #262.
3. Reconfirm Production source, revalidate/land #258 under workflow-file boundary.
4. Independently review #273; fresh Production catalog/history parity; approve exact reconciliation; no blind `db push`.
5. Rebase/revalidate/release #253.
6. Rebase/revalidate/release #261; observe natural F0.
7. Fresh business scorecard; if monetization still bottleneck, `#264 -> #267 -> #269` with fresh bindings and no reused tokens.
8. R5 #257/#260 stays HOLD unless fresh evidence reprioritizes it.
9. Scheduled lanes re-enable only under separate lane authorization.
10. If #286 remains justified after service recovery, obtain bounded exact-Preview cold->warm proof before release consideration.

This order is not blanket merge/Production/provider/workflow/Secret/billing approval.
