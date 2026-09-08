# Gacha Lens Canonical Handoff

Updated: 2026-09-08 19:06 JST — Supabase Fair Use restriction active; public-read P0 active; scheduled Production writes explicitly disabled; repository-only emergency containment validated

The company infrastructure Final Release/Cutover remains complete. Historical checkpoints remain in `docs/history/` and Git history.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/FINAL_CUTOVER_2026-09-05.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch current `main`; Issues #219/#238/#280/#281/#262; Draft PRs #250/#282/#265/#273/#269; latest comments/reviews; and only the minimum live evidence needed for the next gate.
3. **Do not resume the company infrastructure migration. It is complete.** Cloudflare is the Production runtime and authoritative DNS.
4. **Do not perform a Production workaround for the current Supabase restriction by implication.** Released Egress mitigations remain technically supported; the current restriction is best explained by historical current-cycle overage.
5. `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false` and `OFFICIAL_BOUNDED_AUTO_ENABLED=false` are deliberate pre-reset safety controls. Do not re-enable either because HTTP 402 disappears. Re-enable only after #238 is formally cleared and the specific lane receives separate authorization.
6. Production currently has a public-read outage (#281): core data pages can render the branded data-source failure while returning outer HTTP 200. Draft #282 is validated repository/Preview containment, **not data recovery** and not authorized for Production release.
7. Non-Production branch/Preview/test/docs/review work is allowed. Production runtime merges and Production DB/schema/data/history changes remain frozen under #219/#238.
8. Even after freeze clears, do **not** rely on standing auto-release authority until Draft #265 resolves #262 and is independently reviewed/revalidated on then-current main.
9. Do not merge/apply #273 or #269, call affiliate providers, alter Secrets/Variables, dispatch/change workflows, or perform paid/destructive actions without the separate applicable approval/gate.
10. After every major Production/recovery/security/release milestone, synchronize `HANDOFF / STATUS / DECISIONS / TODO` before starting the next major phase.

## Production infrastructure

- Repository: `karakuri3/Gacha-Lens`
- current Production `main`: `83b0b36e5d0172f3ea6964206edad6480a13b4bb`
- Production URL: `https://gachalens.com`
- Production runtime: Cloudflare Worker `gacha-lens`
- authoritative DNS: Cloudflare
- registrar: Vercel; hosting is non-live rollback artifact only
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- old inactive Supabase project `ihcudkfspzuixsqsvoku`: never confuse with Production

## Released Egress mitigation remains valid

PR #249 — shared edge reuse:
- main `397584fabe633b511cc060ae85335dc4e85fa81d`
- Cloudflare Production build SUCCESS
- strict `MISS -> HIT -> HIT` cache proof PASS

PR #251 — scoped unique-path cold reads:
- main `83b0b36e5d0172f3ea6964206edad6480a13b4bb`
- Cloudflare Production build SUCCESS
- representative signal JSON reduction: detail **-65.5%**, related **-48.1%**, rendered semantics preserved

Post-mitigation observation before enforcement showed roughly `25.108 -> 25.114 GB` over ~13.78h, about **0.0104 GB/day org-wide**, far below the internal `<=0.12 GB/day` operating target. The known sitemap/runtime amplifier fingerprint also stayed nearly flat (`681,256 -> 681,290` over ~36.3h, +34, under 1 call/hour average).

## Supabase Fair Use incident — current truth

Provider-side evidence recorded 2026-09-08 in #219:
- billing cycle: **2026-08-12 -> 2026-09-12**
- plan: Free
- organization state: **All services are restricted**
- reason: **Egress Exceeded**
- organization uncached Egress: **25.242 / 5 GB (505%)**
- organization Cached Egress: **0.087 / 5 GB**
- `gacha-lens-tokyo`: **23.003 GB Egress**
- `beach-match-manager`: **0.444 GB Egress**
- requests may return HTTP **402** while restricted

Interpretation:
- Gacha Lens accounts for about 91% of current-cycle organization Egress;
- pre-enforcement post-mitigation burn evidence remains low;
- the restriction is best supported as delayed enforcement of historical current-cycle usage, not proof that #249/#251 reverted;
- do not buy Pro or use project/org transfer as active-restriction quota evasion without a separately approved decision.

## P0 scheduled-write guard — #280

The 402 restriction must never be the only barrier preventing scheduled Production writes from waking after quota reset.

Owner-approved temporary repository-variable changes were completed at **2026-09-08 16:52 JST**:
- `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`
- `OFFICIAL_BOUNDED_AUTO_ENABLED=false`

Repository-wide scheduled write-capable lane audit:
- legacy `.github/workflows/gacha-ingestion.yml`: manually Disabled and must remain disabled;
- `Gacha Market Bounded Automatic Production`: existing top-level enable gate false;
- `Gacha Market P3 Bounded Seed V2 Automatic`: explicitly disabled by #280;
- `Gacha Official Bounded Automatic Production`: explicitly disabled by #280;
- `Gacha Official Kitan Bounded Automatic Production`: false-by-default/no-op unless separately enabled later.

Natural-run evidence:
- P3 schedule is `17 */3 * * *`; first post-disable opportunity was **2026-09-08 18:17 JST**;
- as of **19:06 JST**, no new schedule-event run had appeared in the repository Actions collection; this is **not** recorded as a successful no-op because scheduled runs can be delayed/dropped;
- Official schedule is daily **11:27 JST**; first post-disable natural opportunity is **2026-09-09 11:27 JST**.

#280 remains OPEN until natural no-op/write0 evidence is obtained and canonical state is final. No manual dispatch is needed. Both enable variables stay false until #238 closes and the corresponding lane is separately authorized to resume.

## P0 public-read outage — #281

Production observation on 2026-09-08:
- core public data pages such as `/` and `/series` render the branded message `商品情報を取得できません` during the Supabase restriction;
- an external read-only scan of `https://gachalens.com` still observed root HTTP **200** while extracting only a tiny degraded shell (~39 chars);
- therefore the current outage can be misclassified by crawlers/intermediaries as a healthy 200 page.

This is a real availability/HTTP-semantics incident, not merely ingestion freshness degradation.

## Repository-only containment — Draft #282

Draft PR #282: `fix: return temporary 503 for public data outage`
- exact head: `68465cfa344fda65c6968e6bdb1af11d6abbd983`
- changed files: 5
- PR Code Quality `34212560491`: SUCCESS
- Cloudflare vinext POC `34212560379`: SUCCESS
- exact Cloudflare Commit Preview `e700d503-gacha-lens.senpingxingzuo.workers.dev`: deployment SUCCESS
- exact Preview normal external scanner could not obtain the root during the active outage (`pagesScanned=0`)
- unresolved review threads: 0 at latest check
- independent Reviewer/Verifier result: **PENDING**
- Reviewer/Verifier packet posted on #282 without moving the head

Design:
- `DataSourceError` marks only the active request through `AsyncLocalStorage`;
- for explicitly allowlisted public data-dependent GET HTML routes, the Worker drains one clone of the same vinext response stream **inside that request context** so late streamed Server Component failures are observed before response classification;
- only tracked outer-200 `text/html` responses are remapped to temporary **503 Service Unavailable** with `no-store`, `Retry-After: 3600`, and `X-Gacha-Degraded: data-source-error-503-v1`;
- unrelated legal/editorial/admin/client/API HTML surfaces are outside the stream-drain allowlist;
- no Supabase/provider retry or additional origin data request is introduced.

Important disposition:
- #282 is **containment, not data recovery**;
- it stays Draft under #238;
- if the 2026-09-12 reset restores normal data service and the outer-200 outage disappears, **do not ship #282 merely because it is green**; reassess and likely close/preserve it as incident evidence;
- if the outage or healthy-200 misclassification persists, #282 still needs genuine independent review plus an explicit applicable Production release/emergency exception before merge/deploy.

## Freeze state

Issue #219: **OPEN — active restriction / post-reset evidence gate**.

Issue #238: **OPEN — Production freeze active**.

Allowed:
- isolated non-main feature/research/design work
- local/disposable DB testing
- Cloudflare/Vercel Preview work that does not mutate Production
- docs/review/planning/static analysis
- low-impact read-only evidence collection

Frozen:
- Production runtime merges to `main`
- Production DB/schema/data/migration-history changes
- DNS/Auth/admin/write-surface changes
- Secrets/Variables changes, except the already-consumed explicit #280 disable approval
- paid plan/billing changes without explicit owner approval
- provider-call/load-generating experiments
- unrelated Production releases intended to bypass restriction

## Release-governance blocker — #262 / Draft #265

Cloudflare is Production, but current main still carries standing Vercel-specific release wording. Routine Vercel Git builds remain intentionally disabled for cost control.

Authorized Draft #265 is the canonical implementation of the replacement policy:
- exact head `c8d671abc9be785f3c6c34a3ff6ceef858e07d3a`
- seven active policy/test files aligned to Cloudflare
- PR Code Quality `34045587975`: SUCCESS
- mergeable true at last proof
- strengthened self-review + Reviewer/Verifier packet present
- independent Reviewer/Verifier result: **PENDING**

After #219/#238 clear, re-fetch main/head, refresh exact-head evidence if needed, obtain genuine independent review (or a fresh #265-specific substitution only if explicitly granted), then land #265 through the applicable safe path. #265 cannot authorize its own merge.

## Repository-only Foundation repair — #273

Draft #273 exact head: `42c8f9934a92cda0be5fd58f2dccc7d4db17299c`
- Code Quality `34193107686`: SUCCESS
- vinext `34193107664`: SUCCESS
- Foundation `34193107736`: SUCCESS
- downstream combined empty-DB proof via #279: SUCCESS
- independent review: **PENDING**
- Production migration/history reconciliation: **NOT AUTHORIZED / POST-FREEZE ONLY**

Do not edit already-applied historical migrations and do not use blind Production `db push`. Future reconciliation begins with fresh live catalog/history parity evidence and separate approval.

## Repository-only affiliate authorization ledger — #269

Draft #269 exact head: `574a9a4c10c3fd6cd275229c95c9b3adef8de84f`
- exact-head Code Quality `34195356451`: SUCCESS
- exact-head vinext `34195356549`: SUCCESS
- disposable DB proof #279 / Foundation `34195410881`: SUCCESS including cleanup
- 22 migrations from empty DB
- Foundation **14/14 PASS, skipped 0**
- data-source/ledger DB **11/11 PASS, skipped 0**
- terminal reason/evidence binding DB-proven
- independent review: **PENDING**
- provider execution: **NOT AUTHORIZED**

GitHub Copilot code review has historically been treated as a billable AI-credit boundary in this repository. Do not request it without explicit owner approval. Self-review must not be represented as independent review.

## Mandatory reset/release sequence

After the **2026-09-12 billing-cycle reset** and any provider-side clear delay:

0. **Reassess the incident before shipping containment.** Check #281/public data first. If data service and healthy HTTP semantics are restored, do not merge #282 opportunistically; preserve/close it only after canonical sync. If outage/outer-200 misclassification persists, keep P0 priority and require independent review + explicit release authority for #282.
1. **P0 closure:** prove restriction cleared/no 402, fresh Gacha-filtered Egress low, minimal runtime smoke green, no amplifier recurrence; update #219/#238/#250. Do not re-enable #280 variables during this step.
2. **Governance:** independently review/revalidate and land #265; close #262 only after the Cloudflare standing policy is on main.
3. **CI proof authority:** revalidate and land #258 so runtime/cache smoke is pinned to the then-current deployed Production source, under its workflow-file approval boundary.
4. **Migration reproducibility:** independently review #273, re-read Production catalog/migration history, approve the exact reconciliation strategy, then land/reconcile without blind `db push`.
5. **User value:** rebase/revalidate/release #253 Japanese stored-category routing fix.
6. **Reliability:** rebase/revalidate/release #261 with applicable Production approval; observe the next natural bounded F0 run rather than forcing it.
7. **Fresh business scorecard:** recompute traffic/click/affiliate/data-freshness evidence. If monetization coverage still dominates, proceed `#264 -> #267 -> #269`, rebinding every layer to then-current main/data and never reusing old approval tokens.
8. **Data Scale R5 remains HOLD** (`#257/#260`) unless fresh evidence makes depth expansion higher priority.
9. **Scheduled write re-enable is separate.** Even after #238 closes, restore P3/Official automatic enable variables only under a new lane-specific authorization and then verify bounded natural execution.
10. Synchronize canonical docs after each major release/recovery/security milestone before advancing to the next major phase.

This ordering is a planning contract, not blanket approval for any merge, Production mutation, workflow change, provider call, Secret/Variable action, or paid operation.

## Cross-project failure-domain follow-up

After restriction clears and a fresh complete backup is green, the existing Beach Supabase project is intended to move to a dedicated Free organization so Beach and Gacha Lens no longer share the same quota/failure domain. This is a future Project Transfer, not a replacement database and not an active-restriction workaround.

## Hard boundaries

- no direct main push
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no automatic RPC retry
- no paid/destructive action without applicable approval
- no Production DB/schema/data/history mutation by implication
- no provider refresh/write by implication
- no workflow dispatch/change by implication
- no Secrets/Variables change by implication; #280 disable authority is consumed and non-reusable
- consumed prior Production/provider authority remains non-reusable
- do not scrape Mercari or Amazon
