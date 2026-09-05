# Gacha Lens Durable Decisions

Updated: 2026-09-06 JST — P0-B edge mitigation released; final Free-plan sustainability decision pending refreshed Usage

The complete pre-final-cutover decisions checkpoint is preserved at `docs/history/2026-09-05-pre-final-cutover-DECISIONS.md` and in Git history. Decisions D-001 through D-130 remain authoritative unless explicitly superseded below.

## Existing durable state retained

- Cloudflare is the Production web runtime and authoritative DNS for Gacha Lens.
- Vercel remains registrar and a non-live rollback artifact only; automatic Git builds are disabled.
- `www` canonicalization is a Cloudflare edge redirect.
- scoped Stage 5 Production hardening is independently durable and not coupled to application rollback.
- company infrastructure migration is complete.
- Workers Logs remain disabled; metrics/API Gateway evidence must not be mislabeled as Worker log-stream review.
- Issue #219 remains a separate Reliability/Cost gate until measured Egress evidence closes it.

## Authoritative additions

### D-131 — P0-B uses bounded Cloudflare Workers Cache rather than a new persistence layer

PR #249 is the accepted P0-B implementation for the remaining public Supabase read amplification identified under Issue #219.

The Production policy is intentionally narrow:
- no-query `/categories`, `/brands`, `/franchises` roots: 24h shared edge cache;
- no-query `/series` and first-page facet landings: 30m shared edge cache;
- series detail: 30m shared edge cache;
- public sitemap documents: 24h shared edge cache;
- query/search/pagination, auth/cookie requests, and Next internal requests remain outside the discovery shared cache;
- known branded error HTML is never promoted to shared cache.

This uses the existing Cloudflare Workers Caching/Vinext `workers-cache` boundary. It does not introduce KV, a manual Cache API layer, a DB mutation, or a new global cache store.

### D-132 — Public Supabase deployment coordinates may have code defaults; service-role credentials may not

Cloudflare Preview exposed a portability defect: `SUPABASE_SERVICE_ROLE_KEY` was present but the public Supabase URL was absent, causing `DATA_SOURCE_CONFIG_ERROR`.

The accepted resolution is environment-first resolution with current public Production defaults for public deployment coordinates only. Supabase URL and publishable key are public client configuration and may be defaulted for portability. Service-role credentials remain environment-only and must never be embedded or displayed.

`GACHA_DATA_SOURCE` is not required when Supabase configuration resolves successfully.

### D-133 — PR #249 Production release is technically PASS

PR #249 was explicitly approved for Production and merged through GitHub PR at main commit:

`397584fabe633b511cc060ae85335dc4e85fa81d`

Cloudflare Production build:

`f1d61310-7e7e-44f5-8c3e-4eb791aca5ac`

passed deployment.

The release gate evidence includes:
- repository Code Quality PASS;
- vinext compatibility/build PASS;
- exact Preview runtime smoke PASS;
- isolated strict byte-identical `MISS -> HIT -> HIT` cache proof PASS;
- Japanese detail/related/display/structured-data runtime diagnostic PASS;
- Preview correlated backend suppression PASS;
- Production `/brands` and representative Japanese series detail smoke PASS;
- Production fresh repeated-request check showing one correlated cold Supabase API Gateway bundle and no repeated second/third backend bundle for warm repeats.

Therefore the P0-B implementation itself is not pending. Only the post-release Egress trajectory decision remains.

### D-134 — Immediate post-release Usage is a baseline, not a sustainability verdict

At the release checkpoint Supabase Usage is:
- Free plan;
- cycle 2026-08-12–2026-09-12;
- uncached Egress 25.108 GB / 5 GB;
- Cached Egress 0.085 GB / 5 GB;
- grace date shown as 2026-09-06.

Supabase states Usage may take up to one hour to refresh. An unchanged cumulative counter only minutes after release cannot prove the next-cycle monthly burn rate.

Accordingly:
- `Free Plan sustainable` remains **PENDING** until refreshed post-release evidence;
- `Paid plan required` remains **NOT ESTABLISHED**;
- #219 remains open;
- #238 remains ACTIVE;
- #239 remains open/superseded by merged #249 until #219 closes;
- normal feature work remains frozen by #238 even though infrastructure migration itself is complete.

### D-135 — Governance closure order for this P0 is fixed

When refreshed post-release evidence is sufficient:

If Free-plan sustainability passes with a reasonable margin:
1. record evidence and close #219;
2. release/close #238 and formally reopen normal development;
3. close/supersede #239;
4. synchronize canonical HANDOFF / STATUS / DECISIONS / TODO.

If the rate remains materially unsafe:
1. keep #219/#238 open;
2. attribute the largest residual uncached amplifier;
3. use the smallest bounded mitigation and repeat exact-head Preview/Production evidence;
4. do not upgrade merely to conceal avoidable amplification.

A paid-plan decision remains a paid action and requires explicit approval.

## Current durable state

- infrastructure migration: **COMPLETE**
- Production web runtime: Cloudflare Worker `gacha-lens`
- P0-B implementation: **MERGED / PRODUCTION PASS**
- Issue #219: **OPEN — refreshed post-release Egress evidence pending**
- Issue #238: **ACTIVE change freeze**
- Issue #239: **OPEN / superseded implementation lane**
- normal feature development: **TEMPORARILY FROZEN by #238**
- paid Supabase plan requirement: **NOT ESTABLISHED**
- exact #228 authority: consumed/non-reusable

## Hard durable constraints

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no automatic RPC retry
- do not manually alter Supabase migration ledger identity/timestamps
- do not weaken strict market matching or identity guards for coverage
- completed sold evidence remains separate from asking-price evidence
- do not scrape Mercari or Amazon
- direct main pushes remain prohibited
- no workflow dispatch/change by implication
- no Secrets/Variables change by implication
- no Production DB/schema/data mutation by implication
- no paid/destructive action without applicable approval
