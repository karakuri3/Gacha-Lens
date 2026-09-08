# Gacha Lens Durable Decisions

Updated: 2026-09-08 19:47 JST

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

## D-154 — missing GitHub scheduled run is not no-op proof

P3 18:17 JST post-disable opportunity had no observable run as of 19:19 JST. Record `natural run not yet observed`, not PASS. Do not manually dispatch to manufacture evidence. Next P3 opportunity 21:17 JST; Official first post-disable opportunity 2026-09-09 11:27 JST.

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

Current accepted engineering evidence:
- exact PR-head Code Quality `34216342875`: SUCCESS
- parent-series route regression: PASS
- merge-tree vinext build `34216342824`: SUCCESS
- exact Cloudflare build `60c3707c-a7dd-4ec3-9213-ce15a46df382`: SUCCESS
- exact Preview root external scan: failed/pagesScanned0 during outage
- Production parent-series route: branded outage confirmed
- superseding Reviewer/Verifier packet posted for `4d95413a...`

Independent review remains PENDING.

## D-158 — #282 performance overhead is a release gate if containment remains necessary

Read-only Production CPU baseline is roughly 27–28ms. `response.clone().text()` does not duplicate origin reads but can add CPU/memory/TTFB. If reset does not remove the need for #282, perform bounded Preview performance comparison before Production release. Do not treat functional green CI as proof of negligible runtime cost.

## D-159 — do not ship incident containment after reset unless the incident still exists

After 2026-09-12 reset, reassess #281 first. If normal data + healthy HTTP semantics return, preserve/close #282 after canonical sync rather than releasing it opportunistically. If the outage/healthy-200 misclassification persists, #282 remains P0 but still requires independent review, performance preflight, and explicit applicable Production authority.

## D-160 — parent-series edge-cache gap is separate from #282

Issue #285 tracks that canonical `/series/group/:slug` server-data pages are outside the current 30-minute `seriesDetail` shared-cache matcher. This is Reliability/Cost follow-up, not part of degraded HTTP containment. Do not claim savings before measuring, and do not broaden cache matching to arbitrary `/series/**`.

## D-161 — docs-only Cloudflare build waste is separate cost hygiene

Issue #284 tracks Git integration building docs-only changes. Cloudflare Build Watch supports excluding `docs/*`; no Cloudflare setting mutation is authorized during freeze by implication.

## D-147 — self-review is not independent review

#282/#265/#273/#269 require genuine independent review where specified. GitHub Copilot review has historically been treated as billable AI credits; do not request it without explicit owner approval.

## Other validated Draft decisions

- #265 exact `c8d671abc9be785f3c6c34a3ff6ceef858e07d3a`: canonical Cloudflare policy replacement, validated, independent review pending, not authoritative until landed.
- #273 exact `42c8f9934a92cda0be5fd58f2dccc7d4db17299c`: canonical fresh migration-chain repair, validated; no editing applied historical migrations, no blind `db push`, Production reconciliation separately approved only.
- #269 exact `574a9a4c10c3fd6cd275229c95c9b3adef8de84f`: canonical durable one-time provider-read authorization ledger, validated; no provider execution/persistence authority.

## Post-reset ordered release decision

0. Reassess #281/#282.
1. Close #219/#238 only from fresh reset evidence; keep #280 vars false.
2. Independently review/revalidate and land #265 / close #262.
3. Revalidate/land #258 under workflow-file boundary.
4. Independently review #273; fresh Production catalog/history parity; approve exact reconciliation; no blind `db push`.
5. Rebase/revalidate/release #253.
6. Rebase/revalidate/release #261; observe natural F0.
7. Fresh business scorecard; if monetization still bottleneck, `#264 -> #267 -> #269` with fresh bindings and no reused tokens.
8. R5 #257/#260 stays HOLD unless fresh evidence reprioritizes it.
9. Scheduled lanes re-enable only under separate lane authorization.

This order is not blanket merge/Production/provider/workflow/Secret/billing approval.
