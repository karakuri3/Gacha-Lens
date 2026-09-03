# Gacha Lens Canonical Handoff

Updated: 2026-09-04 JST — live P0-B cache/read-amplification checkpoint

> **Read `docs/HANDOFF_LATEST.md` first.** It is the authoritative in-progress checkpoint for current P0 Issues #219/#239 and Draft PR #240. If this conversation disappears, a fresh thread can resume from that file without user re-explanation.

The complete checkpoint immediately before the 2026-09-03 canonical sync is preserved at `docs/history/2026-09-03-pre-233-HANDOFF.md`.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read `docs/HANDOFF_LATEST.md` first, then this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch live `main`, Issues #219/#239, Draft PR #240, exact-head Actions, Vercel deployment state, and only the minimum Supabase evidence needed for the current gate.
3. Do not repeat rejected `revalidate`, full-route `force-static`, custom-fetch cache, alias/explicit-import, or `unstable_cache` experiments documented in `HANDOFF_LATEST.md`.
4. Continue from architecture selection: portable Runtime Cache adapter vs safe public response/CDN boundary vs reduced/precomputed public-detail read model.
5. No Production data writes, migrations/schema/backfills, provider execution, workflow dispatch/change, Secrets/Variables, paid/destructive action, direct-main push, or ineligible merge/release without applicable explicit approval.
6. After each major Production/recovery/security/release milestone, sync this canonical set before the next major phase.

## Current state

- repository: `karakuri3/Gacha-Lens`
- verified `main`: `da506232472c22c909f95e5a855b1cfed8889e73`
- active branch: `fix/p0-public-data-cache-30m`
- Draft PR #240: open/unmerged; Production freeze active
- parent incident #219: open P0
- implementation issue #239: open P0
- last exact **code** head tested: `a02e69285ebcc9c06e1be67f2e066d8460e57e68`
- CI `33784381137`: SUCCESS
- Vercel Preview `dpl_BagCivrtVobFkZum27Stg2PridsS`: READY
- Production domain: `https://gachalens.com`
- Supabase Production: `vxbrnvfhmzcxehuuzzum`
- preferred local path: `C:\dev\Gacha-Lens`

## P0 result so far

P0-A sitemap mitigation from PR #231 is released and verified. P0-B has additionally proven that repeating the same public Japanese product-detail page repeats a broad Supabase target/sibling/market/signal/related read set.

The latest instrumented `unstable_cache` exact head proved the cache facade is definitely executing but its origin callbacks recur on the identical second request, and Supabase repeats the read set. Therefore the current `unstable_cache` mechanism is rejected; the previous alias-not-used hypothesis is closed.

See `docs/HANDOFF_LATEST.md` for exact timestamps, hashes, rejected experiments, next architecture criteria, and validation gates.

## Remaining blocker count before normal product development

There are **six blocking gates**:

1. select one production-grade architecture using official semantics/cost/portability evidence;
2. implement the smallest safe candidate and remove temporary diagnostics;
3. exact-head CI/Preview + Japanese two-request + Vercel/Supabase backend proof;
4. final complete diff/security/runtime/main-drift review;
5. applicable Production approval + merge/release + Production smoke;
6. short post-release Supabase egress/read observation confirming #219 is credibly controlled.

Most are assistant-executable. Interrupt the owner only for a real approval/human-only boundary.

## Hard no-regression boundaries

- NEVER touch `supabase/.temp/cli-latest`.
- Keep `.github/workflows/gacha-ingestion.yml` disabled.
- No automatic RPC retry.
- Do not manually repair Supabase migration ledger timestamps.
- Do not weaken strict market matching/identity guards for coverage.
- Keep completed sold evidence separate from active/sold_out asking-price evidence.
- Do not scrape Mercari or Amazon.
- No direct push to `main`.
- No paid/destructive action without explicit applicable approval.
- Keep PR #240 Draft until exact-head backend evidence passes.

## Separate work held behind P0

- Cloudflare Workers/vinext POC PR #235 is Draft/non-Production; use it as a portability constraint only.
- branch-protection hardening Issue #236 remains open.
- Data Scale/history/provider writes remain held; #228 authority is consumed/non-reusable.
- Supabase advisor remediation remains separate behavior-impact work.

## Immediate cross-thread phrase

**「Gacha Lens続けて。docs/HANDOFF_LATEST.mdを正本としてP0 #219/#239、Draft PR #240から再開して」**

A new thread should require no additional project explanation beyond re-fetching live state.