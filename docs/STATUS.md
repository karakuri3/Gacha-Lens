# Gacha Lens Status

Updated: 2026-09-03 JST — P0-A Supabase egress mitigation released / Issue #233 canonical sync

The complete status checkpoint immediately before this sync is preserved byte-for-byte at `docs/history/2026-09-03-pre-233-STATUS.md`.

## Current repository / release

- current main: `8048a19ad478672a9d887d77073597ee95dc27d3`
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
- Supabase advisor findings remain separate behavior-impact work.

## Hard holds

- no workflow dispatch/change by implication
- no Secrets/Variables changes by implication
- no paid/destructive action without approval
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no direct main push

## Canonical history

`docs/history/2026-09-03-pre-233-STATUS.md`

Once this exact sync reaches `main`, Issue #233 is complete by definition; do not create a recursive sync solely for its own merge.