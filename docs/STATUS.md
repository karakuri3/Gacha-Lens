# Gacha Lens Status

Updated: 2026-09-04 JST — Supabase hardening isolated validation lane active on Draft PRs only

The complete status checkpoint immediately before this isolated hardening lane remains preserved at `docs/history/2026-09-03-pre-233-STATUS.md`. The Egress P0 state below is not superseded by this separate hardening work.

## Company roadmap Stage 5 — Supabase hardening isolated validation

Canonical evidence and resume instructions: `docs/SUPABASE_HARDENING_ISOLATED_2026-09-04.md`.

Current isolated workstreams:
- Draft PR #241 — 13 server-only table grants / GraphQL visibility boundary. Production actions0. Run #1 proved fresh disposable Supabase and stopped on the intentionally deferred `forecast_snapshots` object; the branch now synthesizes that read-only-verified Production shape only inside the disposable DB and is re-running exact-head validation.
- Draft PR #242 — separate `pg_net` relocation rehearsal. Production read-only evidence is `pg_net` 0.20.4 / extension namespace `public` / `extrelocatable=false`, queue0 / recent responses0 / cron jobs0 / application-owned `net.*` database function references0. The Draft validates Supabase's drop/recreate-under-`extensions` path plus rollback/reverse/reapply on disposable Supabase only.
- Beach Draft PR #216 is a separate repository lane for `rebuild_profile_stats_v1` / `user_id is ambiguous`; do not mix its code or rollout with Gacha.

Hard boundary for this lane:
- no Production Supabase DDL/DML;
- no main merge;
- no Production deploy;
- no DNS / `gachalens.com` / Vercel cancellation / Gacha Cloudflare Production changes;
- no secret display;
- no paid Supabase branch. Development Branching was priced at `$0.01344/hour`, so no branch was created.

Current preliminary classifications:
- Gacha 13-table server-only API grant normalization: **Production適用推奨候補**, pending exact-head isolated green.
- blanket revoke from intentional-public `series_*` tables: **不要**.
- adding RLS policies merely to silence server-only `RLS enabled/no policy`: **不要**.
- global `public` default-ACL rewrite: **保留**.
- service-role boundary change: **不要**.
- simple `ALTER EXTENSION pg_net SET SCHEMA`: **不要** because Production is non-relocatable.
- pg_net drop/recreate relocation: **保留** until #242 proves forward + rollback.
- all six FK indexes / advisor unused-index drops: **保留**; current tables are tiny/empty and workload evidence differs by object.
- Egress: separate P0 observation lane; hardening is not evidence of billed-byte recovery.

## Current repository / release

- current main at isolated-lane bind: `da506232472c22c909f95e5a855b1cfed8889e73`
- prior P0-A canonical release main recorded below: `8048a19ad478672a9d887d77073597ee95dc27d3`
- Production domain: `gachalens.com`
- Vercel Production: `dpl_7KLUH7bP8JNESPndzQYhzE4jQn9G` — **READY**
- Supabase Production: `vxbrnvfhmzcxehuuzzum`
- PR #231: **CLOSED merged**
- Issue #219: **OPEN P0**

## Current P0 — uncached Egress / availability risk

Shared Supabase Free Plan billing evidence captured 2026-09-03:
- Egress **24.614 / 5 GB (~492%)**;
- overage **19.61 GB**;
- cached Egress about **0.053 / 5 GB**;
- Fair Use grace end **2026-09-19**;
- possible HTTP 402 request restriction if the organization remains over the applicable limit.

Evidence points strongly to Gacha Lens server-side/public read amplification, including large variant pagination and repeated broad public reads. Exact project-only billed GB remains unproven and must not be invented.

## P0-A sitemap mitigation — LIVE

PR #231 bounded the identified sitemap amplification path.

Verified gates:
- exact PR head `fc091f32ae216779e782eef84fc2701fbc769492`;
- PR Code Quality #116 / `33754793103`: **SUCCESS**;
- exact-head Preview `dpl_GVNunr8mDJ54FE5a6nr3mD5Hi4Qj`: **READY**;
- build route table: root, series-observer, variant-observer sitemaps all **Static / 1d**;
- complete five-file strengthened Lead self-review, explicitly non-independent, findings0;
- unresolved GitHub/Vercel threads0 and main drift0 before merge;
- squash merge `8048a19ad478672a9d887d77073597ee95dc27d3`;
- normal Production `dpl_7KLUH7bP8JNESPndzQYhzE4jQn9G`: READY;
- live Production sitemap smoke passed for all three sitemap endpoints.

No Production DB/schema/data mutation, provider call, workflow/schedule change or dispatch, Secrets/Variables change, paid/destructive action, or direct-main push was part of P0-A.

## Current true gate

**Read-only post-release Egress observation.**

Do not treat Static/1d build proof as proof of billed-byte recovery. Keep #219 open until observed traffic/Egress evidence shows the shared organization is no longer at credible Fair Use/402 risk.

If Egress remains materially high, P0-B is next:
- attribute remaining public request paths;
- quantify expensive signal-table/full-loader reads;
- remove unnecessary fields/full hydration;
- add safe caching/server-side filtering/bounds where semantics allow;
- preserve SEO/public semantics and ingestion/write isolation.

If the trajectory normalizes, leave reliability emergency mode and choose the next product experiment by business leverage rather than Data Scale counts alone.

## Product / business priority model after #219

Next-phase prioritization must compare:

**Reliability / Cost -> User Value -> Traffic -> Click -> Revenue**

Data Scale is a means to improve product usefulness, traffic/conversion, or monetization — not an end state.

Key next measurements after the reliability gate include:
- search impressions/clicks/CTR/indexation;
- product/series page traffic;
- outbound shop clicks and click-through rate;
- affiliate conversion/revenue where available;
- ingestion/data freshness and coverage quality;
- Supabase/Vercel cost and request efficiency.

## Last verified Data Scale state

Pre-Egress-P0 canonical checkpoint remains:
- series **10,241**;
- variants **23,808**;
- listings **133**;
- observations **155**;
- fresh <30d covered variants **122**;
- depth **120 x1 / 2 x2 / 0 x3+**;
- max depth **2**;
- re-observed **22 / 133 = 16.5414%**;
- stock/restock **0 / 0**;
- clicks 7d **10**;
- completed sales **0**.

The technical diagnosis `depth_insufficient` still describes this snapshot, but it is not currently the highest-priority operational issue and does not authorize additional writes.

## R4 state

Production R4 repair and the one-candidate proof remain **SUCCESS / VERIFIED**. Exact #228 write authority is consumed/non-reusable.

Hard hold remains:
- no further R4 write/retry without a new current-state bind and fresh applicable approval;
- no provider refresh under consumed authority;
- no automatic RPC retry.

## Separate work

- PR #232 is a separate Draft technology-intelligence docs lane; it must not preempt #219 P0 and requires current-main drift/rebase evidence before any merge.
- #137/#142 F0 remains separate.
- Supabase advisor findings are now being handled only inside the isolated Stage-5 lane described above; this does not authorize Production remediation.

## Hard holds

- no workflow dispatch/change by implication
- no Secrets/Variables changes by implication
- no paid/destructive action without approval
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no direct main push

## Canonical history

`docs/history/2026-09-03-pre-233-STATUS.md`

The isolated hardening evidence file is `docs/SUPABASE_HARDENING_ISOLATED_2026-09-04.md`; use it as the Stage-5 resume source until this lane is closed or superseded.