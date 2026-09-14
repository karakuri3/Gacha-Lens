# Gacha Lens Canonical Handoff

Updated: 2026-09-14 JST — product/reliability gates and fresh business scorecard synchronized

This file is the active-state handoff. Historical detail remains in Git history and `docs/history/`.

## Resume rule

If a new thread receives only **「Gacha Lens続けて」**:

1. Read `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/PRODUCTION_RELEASE_POLICY.md`, and `docs/AUTO_MERGE_POLICY.md`.
2. **Always re-fetch current `main`** before using an exact SHA; canonical docs intentionally do not claim that a historical SHA remains the live branch head after later merges.
3. Re-fetch active Issues/PRs, current Supabase usage and current Cloudflare Production source before mutating anything.
4. Resume existing active Drafts before creating duplicate implementation work.
5. Do not restart completed migration/recovery/governance/security/category/rerelease lanes.
6. Keep scheduled write lanes disabled unless separately and explicitly authorized.
7. Treat #319 as the current business decision gate; do not revive dated affiliate/Data Scale priorities from old snapshots.

## Production / main baseline

- repo: `karakuri3/Gacha-Lens`
- **live `main`: fetch at resume time; do not infer it from this file**
- #320 canonical synchronization merged at `d89c33ac715490f6923a442c3593e4164f8dd396`
- last runtime/application baseline immediately before #320: `3b215a9c777431cbf049ec4966b83f474f146953`; #320 itself is documentation-only
- URL: `https://gachalens.com`
- runtime/DNS: Cloudflare
- Vercel: registrar + non-live rollback only; routine Git builds are non-authoritative
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- old `ihcudkfspzuixsqsvoku` is inactive

## Completed release-train work

Do not re-open these as prerequisites merely because older PR bodies mention them as future work:

- #219/#238: recovery/freeze closed after measured provider recovery
- #281: public-read outage resolved
- #282: emergency containment closed without merge
- #280: scheduled-write safety complete; lanes remain disabled
- #265/#262: Cloudflare standing release governance merged/closed
- #258: Cloudflare runtime/cache proof pinning merged
- #273: fresh-database `forecast_snapshots` migration baseline repair merged
- #291/#287: framework security + deterministic vinext validation merged with genuine independent Reviewer/Verifier evidence
- #253: Japanese stored category routing merged
- #261: rerelease canonical year/month repair merged; Official auto still disabled
- #307: GitHub Actions stale-run cancellation merged for bounded CI cost control
- #309: canonical state synchronization merged
- #320: #319/product/reliability canonical state synchronization merged; docs only

## P1 reliability candidate — #285 / #286

PR #286 is technically green but independently gated.

Purpose: include canonical `/series/group/:slug` pages in the existing bounded 30-minute `seriesDetail` Cloudflare edge-cache class while preserving all current public-cache exclusions.

Frozen candidate checkpoint:
- PR: #286
- branch: `fix/parent-series-edge-cache-285`
- validated base checkpoint: `3b215a9c777431cbf049ec4966b83f474f146953`
- frozen head: `38aae46fa759b1cd470d6220640a905440f720ab`
- Draft: yes
- mergeable: yes at that checkpoint
- effective diff: exactly 4 files

Fresh exact-head checks:
- PR Code Quality `34817627624`: SUCCESS
- Cloudflare runtime smoke `34817627620`: SUCCESS
- Cloudflare cache proof `34817627621`: SUCCESS

Dedicated validation-only #308 proved the exact parent-series route: cold `MISS` -> `HIT` -> `HIT`, byte-identical 64,736-byte HTML, `series-detail-1800-v1`, no `Set-Cookie`, healthy public route smoke, unauthenticated boundaries and audited security headers. #308 closed unmerged.

**Stop Condition:** genuine independent Reviewer and Verifier are still pending. Do not substitute Builder/self-review. Do not mark ready or merge until that gate is genuinely satisfied and current head/base are rechecked.

Since #320 advanced `main` with docs-only canonical synchronization after the frozen validation checkpoint, do not silently call the old ahead/behind count current. Keep the candidate frozen for independent review; before merge, fetch then-current `main`, inspect the docs-only/intervening drift and reconcile/revalidate as required by policy.

After independent PASS:
1. fetch current `main` and inspect intervening overlap;
2. rerun/reconfirm required exact-head checks if head/base moved materially;
3. apply Auto-Merge and Standing Production Release gates in full;
4. squash merge only if every gate remains green;
5. allow only the normal Git-triggered Cloudflare application release;
6. observe release and run bounded public smoke;
7. close #285 when released behavior is verified.

## P1 product candidate — #303 Collector Editorial

PR #303 is the substantial product-specific redesign. It replaces generic dashboard/SaaS presentation with object-first collector context, real imagery, compact evidence and denser series/product comparison while intentionally preserving market/data semantics.

Frozen candidate checkpoint:
- PR: #303
- branch: `design/product-specific-ui-contract`
- validated main checkpoint: `3b215a9c777431cbf049ec4966b83f474f146953`
- frozen head: `37c8523acd44dd319dd06e79d3cc5f8e82edf1c8`
- ahead 38 / behind 0 at that checkpoint
- Draft: yes
- mergeable: yes at that checkpoint

The branch was reconciled non-destructively with the validated main checkpoint; no force/history rewrite was used.

Current frozen-head gates are green:
- PR Code Quality: SUCCESS
- Cloudflare vinext: SUCCESS
- Cloudflare runtime smoke: SUCCESS
- Cloudflare cache proof: SUCCESS
- Design Visual QA: SUCCESS

Visual/data proof:
- #316 integrated a production-faithful deterministic visual harness
- #317/#318 provided real Japanese-data exact-Preview validation
- final #318 run `34823381570`: SUCCESS
- 21 / 21 bounded public reads returned HTTP 200 on attempt 1; 5xx retries 0
- 360x800 / 390x844 / 1440x1000 reviewed
- home, catalog/search, parent-series detail, variant detail and ranking reviewed
- latest strengthened visual artifact includes 33 screenshots with no blocking layout issue or Next development chrome
- validation-only #317/#318 closed without merge

#303 briefly became Ready despite no submitted independent review. Review/thread lists were empty, so it was returned to **Draft**.

**Stop Condition:** genuine independent review/verification required for this substantial release. Same-assistant self-review is not independent evidence. #320 subsequently advanced `main` with docs-only changes; keep #303 frozen rather than invalidating its review candidate, then re-fetch/reconcile current main after independent PASS and rerun affected exact-head gates if required.

## P1 business decision — #319 fresh scorecard

Issue #319 is the current business decision gate. It supersedes using the 2026-09-06 affiliate cohort or 2026-09-01 Data Scale baseline as current truth.

Fresh SELECT-only Production evidence on 2026-09-14:
- 10,241 series / 23,808 variants
- 176 market listings; 175 safe active single listings
- 163 variants fresh <30d; fresh coverage **0.6846%**
- fresh depth: 161 variants ×1 listing, 2 variants ×2, none ×3+
- 198 observations; 22 listings re-observed; 12.5% re-observation rate
- last 7d: 0 new listings / 0 new observations
- review-safe stock/restock: 0 / 0
- outbound clicks: 34 / 30d, **0 / 7d**, 14 distinct variants / 30d
- verified affiliate provenance: 10 listings, all Rakuten
- affiliate-eligible exact `(variant_id, provider)` clicks: **0 / 34 = 0%**

Truthfulness:
- Search Console is `unavailable` because the connected GSC Wizard subscription/trial does not permit the read; do not convert unavailable to zero or buy a plan by implication
- PostHog/product analytics is `unavailable` in the current tool session
- affiliate-provider revenue/orders are `unavailable`
- X/social is `not_instrumented` for this decision and no provider action is authorized

### Current business rule

Do **not** advance affiliate provider spend or broad Data Scale solely from old evidence.

First release/establish the current product-quality baseline through normal governance, then observe fresh post-release first-party usage. If current demand shows useful Rakuten/Yahoo monetization overlap, recompute/reconcile the affiliate stack. If demand remains sparse, prefer a **demand-weighted market-quality/re-observation experiment** on actually used pages/variants before broad provider expansion.

No arbitrary demand threshold is precommitted; decide from the actual post-release distribution/sample size.

## Affiliate/provider Draft stack — HOLD

Issues #263/#266/#268 and Drafts #264 -> #267 -> #269 are explicitly HOLD behind #319.

Their implementation and safety contracts remain useful assets, but their old cohorts/exact-main bindings are not executable current truth. Before revival:
- recompute demand from fresh Production evidence;
- reconcile each surviving layer onto then-current `main`;
- rerun exact-head tests/proofs;
- independently review the durable ledger where required;
- recheck Production migration/history state before any migration application;
- keep provider execution and affiliate-provenance persistence behind separate explicit approvals.

## Broad Data Scale — HOLD

#119/#257/#260 remain HOLD behind #319. Market coverage is low, but recent demand and collection freshness are also weak. Low row counts alone are not permission for broad provider expansion. Prefer work tied to measured user value/revenue opportunity.

## Reliability / cost backlog

- #284 remains open. Two exact Cloudflare proof-workflow paths already have bounded Build Watch exclusion, but broader docs-only-build completion requires direct proof.
- stale Drafts such as #232 should not be deleted or rewritten merely for cleanliness; reconcile/close only through a bounded cleanup task.

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
