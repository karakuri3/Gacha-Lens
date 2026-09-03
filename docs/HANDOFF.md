# Gacha Lens Canonical Handoff

Updated: 2026-09-04 JST — live P0-B cache investigation checkpoint

> **Read `docs/HANDOFF_LATEST.md` first.** It is the authoritative in-progress checkpoint for the current P0 #219/#239 and Draft PR #240 while this incident is unresolved. If this conversation/thread disappears, a fresh thread can resume from that file without user re-explanation.

The complete checkpoint immediately before the 2026-09-03 canonical sync is preserved byte-for-byte at `docs/history/2026-09-03-pre-233-HANDOFF.md`. Earlier canonical history remains linked from that snapshot.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read `docs/HANDOFF_LATEST.md` first, then this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch current `main`, open/recent Issues and PRs, exact-head Actions, Vercel Production, and the minimum live Supabase evidence needed for the current gate.
3. **Do not resume Data Scale writes merely because the old technical diagnosis was `depth_insufficient`.** Issue #219 reliability/cost P0 currently outranks further market-depth expansion until post-release egress is measured and the current P0-B public-detail read amplification is resolved or safely bounded.
4. Do not repeat completed R1/R2/R3/R4/history canaries merely to refresh context.
5. Production data writes, migrations/schema/backfills, approval-bound provider execution, workflow dispatch/change, Secrets/Variables, paid/destructive actions, direct main pushes, and ineligible merges/releases require the applicable explicit approval.
6. After each major Production/recovery/security/release milestone, synchronize `HANDOFF / STATUS / DECISIONS / TODO` before the next major phase.

## Repository / services

- Repository: `karakuri3/Gacha-Lens`
- Current main: `da506232472c22c909f95e5a855b1cfed8889e73`
- Current P0 branch: `fix/p0-public-data-cache-30m`
- Draft PR: #240
- Parent incident: #219
- P0 implementation issue: #239
- Production domain: `https://gachalens.com`
- Last known Vercel Production from released P0-A: `dpl_7KLUH7bP8JNESPndzQYhzE4jQn9G` — **READY**; always re-fetch live state before a release decision
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- Old inactive Supabase: `ihcudkfspzuixsqsvoku` — never confuse with Production
- Preferred local path: `C:\dev\Gacha-Lens`

## Current P0 — shared Supabase uncached Egress risk

Issue #219 is **OPEN** and remains the highest-priority operational gate.

Authenticated billing evidence captured on 2026-09-03 showed:
- uncached Egress **24.614 / 5 GB (~492%)** for the shared Free Plan organization;
- overage **19.61 GB**;
- cached Egress only about **0.053 / 5 GB**;
- grace period end **2026-09-19** with possible HTTP 402 request restriction if Fair Use restriction is applied.

Live-log/repository evidence strongly implicated repeated Gacha Lens server-side public reads, including large variant pagination, public SEO/sitemap traversal, and now product-detail hydration. The evidence is strong for mechanism/root-cause direction but does **not** establish an exact Gacha Lens-only billed-GB amount.

## P0-A sitemap mitigation — RELEASED

PR #231 `P0: bound sitemap-driven Supabase egress amplification` completed the first free mitigation.

Exact release evidence:
- final PR head `fc091f32ae216779e782eef84fc2701fbc769492`;
- exact-head PR Code Quality run #116 / `33754793103`: **SUCCESS**;
- exact-head Preview `dpl_GVNunr8mDJ54FE5a6nr3mD5Hi4Qj`: **READY**;
- Vercel Build proved `/sitemap.xml`, `/series-sitemap.xml`, `/variant-sitemap.xml` are Static with `1d` revalidation;
- complete five-file diff received strengthened Lead self-review, explicitly non-independent, with blocking/major/minor findings0;
- pre-merge GitHub/Vercel unresolved threads0 and main drift0;
- squash merge `8048a19ad478672a9d887d77073597ee95dc27d3`;
- normal Git-triggered Production `dpl_7KLUH7bP8JNESPndzQYhzE4jQn9G`: READY;
- live Production root/series/variant sitemap smoke passed.

Behavior now intentionally bounds sitemap source work using daily static/ISR plus outer cache boundaries rather than the previous request-driven dynamic/5-minute amplification path. Existing sitemap URL/publication and >50,000 fail-closed contracts remain preserved.

## P0-A is not the same as #219 success

Do **not** close #219 or claim the billing problem is solved merely because the code/build/release is correct.

The next true gate is **read-only post-release measurement plus P0-B mitigation of remaining repeated public detail reads**:
1. observe Supabase uncached Egress trajectory without resetting useful counters;
2. correlate Vercel/public request behavior where possible;
3. confirm whether the sitemap mitigation materially reduces the expensive read pattern;
4. continue #219/#239 P0-B on the product-detail path using the exact evidence and rejected experiments in `docs/HANDOFF_LATEST.md`;
5. only after reliability/cost risk is controlled should a lower-priority product/Data Scale experiment become the next execution target.

No paid Supabase plan change is implied. A plan upgrade requires current cost/terms evidence and explicit owner approval.

## Product strategy after the reliability gate

Data Scale is infrastructure, not the business goal. Once #219 is no longer a credible availability/cost risk, choose the next experiment by comparing:

**Reliability / Cost -> User Value -> Traffic -> Click -> Revenue**

Use Data Scale only when evidence shows it is the highest-leverage way to improve those outcomes. In particular, do not mechanically chase listing/depth counts while user acquisition, click-through, conversion, or monetization is the larger bottleneck.

The product must become progressively better at answering a user-visible job such as: what a desired gacha costs now, where it can be obtained, and whether/when it is being restocked or rereleased. The exact primary value proposition should be validated with behavior/search data rather than assumed from infrastructure completeness.

## Last verified Data Scale checkpoint

The latest canonical market checkpoint before the Egress P0 intervention remains:
- series **10,241**;
- variants **23,808**;
- listings **133**;
- observations **155**;
- fresh <30d covered variants **122**;
- depth **120 x1 / 2 x2 / 0 x3+**;
- max depth **2**;
- re-observed **22 / 133 = 16.5414%**;
- stock/restock **0 / 0**;
- outbound clicks 7d **10**;
- completed-sale evidence **0**.

The old technical Data Scale diagnosis `depth_insufficient` remains useful evidence, but it no longer grants P0 priority over the live Egress/reliability risk and never authorizes a write by itself.

## R4 state remains closed/consumed

The repaired Production R4 writer and one-candidate proof remain successfully completed as documented in `docs/history/2026-09-03-pre-233-HANDOFF.md`.

No further R4 write, retry, provider refresh, or workflow mutation is authorized by the consumed #228 approval. A future Production market write requires a new current-state bind and fresh applicable approval.

## Separate work / concurrency

- PR #232 (`docs: add external technology intelligence gate`) is a separate Draft documentation/operating-procedure lane and must not distract from #219 P0. Because it was opened from the pre-#231 base, its merge gates must use current-main drift/rebase evidence before any future merge decision.
- Cloudflare Workers/vinext POC PR #235 is separate migration work; it remains non-Production and must not preempt the current reliability P0.
- #137/#142 F0 remains a separate Production-impact boundary.
- Supabase advisor debt remains separate scoped work; do not remediate RLS/policies/grants/extensions/indexes by implication under #219 or Data Scale authority.

## Hard no-regression boundaries

- NEVER touch `supabase/.temp/cli-latest`.
- Keep `.github/workflows/gacha-ingestion.yml` disabled.
- No automatic RPC retry.
- Do not manually repair Supabase migration ledger timestamps.
- Do not weaken strict market matching/identity guards for coverage.
- Keep completed sold evidence separate from active/sold_out asking-price evidence.
- Do not scrape Mercari or Amazon.
- Do not infer merchant equivalence from display names.
- No direct push to `main`.
- No paid/destructive action without explicit applicable approval.
- Keep PR #240 Draft until its exact-head Preview backend-load gate passes.

## Canonical history

Immediate pre-#233 checkpoint:
- `docs/history/2026-09-03-pre-233-HANDOFF.md`

Live in-progress checkpoint:
- `docs/HANDOFF_LATEST.md`

Do not create recursive docs-only sync work merely to record a docs-sync merge. Update the four canonical files at the next real P0 milestone before moving into a different major phase.