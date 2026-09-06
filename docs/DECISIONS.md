# Gacha Lens Durable Decisions

Updated: 2026-09-06 JST — technical Egress mitigation complete; billing-cycle operational gate remains

The complete pre-final-cutover decisions checkpoint is preserved at `docs/history/2026-09-05-pre-final-cutover-DECISIONS.md` and in Git history. Decisions D-001 through D-130 remain authoritative unless explicitly superseded below.

## Existing durable state retained

- Cloudflare is the Production web runtime and authoritative DNS for Gacha Lens.
- Vercel remains registrar and a non-live rollback artifact only; automatic Git builds are disabled.
- `www` canonicalization is a Cloudflare edge redirect.
- scoped Stage 5 Production hardening is independently durable and not coupled to application rollback.
- company infrastructure migration is complete.
- Workers Logs remain disabled; metrics/API Gateway evidence must not be mislabeled as Worker log-stream review.
- exact #228 authority is consumed/non-reusable.

## Authoritative additions

### D-131 — P0-B uses bounded Cloudflare Workers Cache rather than a new persistence layer

PR #249 is the accepted shared-reuse implementation for the remaining public Supabase read amplification under Issue #219.

Production policy:
- no-query `/categories`, `/brands`, `/franchises` roots: 24h shared edge cache;
- no-query `/series` and first-page facet landings: 30m shared edge cache;
- series detail: 30m shared edge cache;
- public sitemap documents: 24h shared edge cache;
- query/search/pagination, auth/cookie requests, and Next internals remain outside the bounded shared-document policy;
- known branded error HTML is never promoted to shared cache.

This uses the existing Cloudflare/Vinext `workers-cache` boundary. It does not introduce KV, a new persistence layer, a Production DB mutation, or a new global cache store.

### D-132 — Public Supabase deployment coordinates may have code defaults; service-role credentials may not

Supabase URL and publishable key are public client configuration and may resolve environment-first with current public defaults for Preview portability. Service-role credentials remain environment-only and must never be embedded or displayed.

### D-133 — PR #249 Production release is technically PASS

PR #249 was explicitly approved and merged as:

`397584fabe633b511cc060ae85335dc4e85fa81d`

Cloudflare Production build:

`f1d61310-7e7e-44f5-8c3e-4eb791aca5ac`

Evidence includes repository/compatibility PASS, exact Preview runtime smoke, strict byte-identical `MISS -> HIT -> HIT`, Japanese detail runtime PASS, and Production warm-request backend suppression consistent with the shared cache boundary.

### D-134 — Cumulative Usage must be interpreted as a rate, not as an immediately reversible counter

The current billing-cycle cumulative Egress contains historical pre-fix traffic. A successful mitigation does not reduce that accumulated number retroactively.

Therefore:
- current cumulative overage alone is not evidence that the new runtime remains expensive;
- the post-release delta over elapsed time is the relevant technical sustainability signal;
- historical Fair Use/402 exposure can remain until the billing cycle resets even after the technical amplifier is fixed.

### D-135 — Free-plan sustainability uses a conservative operating-margin target

For this P0, a conservative organization-wide target of approximately `<=0.12 GB/day` (`<=0.005 GB/hour`) is used as the operational margin for uncached Egress.

This is not a Supabase contractual limit. It is an internal safety target chosen to remain materially below a 5 GB/month allowance and leave room for shared-org traffic and growth.

### D-136 — PR #251 is the accepted unique-path cold-read mitigation

Post-#249 evidence showed that distinct product paths could still pay one cold detail bundle per path. The accepted follow-up is PR #251.

PR #251:
- scopes public detail/related market/X/restock/stock reads to relevant `variant_id` / `matched_variant_id` identities;
- retains required series-level COMPLETE_SET/PARTIAL_SET/POPULAR_SET market listings and their persisted safety metadata;
- omits unused persisted `raw` payload only from safe variant-specific public reads;
- leaves the broader repository implementation available for other consumers;
- does not change Production DB/schema/data, Secrets/Variables, DNS/Auth, billing or workflow configuration.

Bounded Preview A/B preserved rendered semantics while reducing representative signal JSON by **65.5% on detail** and **48.1% on related**.

The temporary diagnostic route used to establish that proof was removed before Production candidacy.

### D-137 — PR #251 Production release is technically PASS

PR #251 was explicitly approved and squash-merged as:

`83b0b36e5d0172f3ea6964206edad6480a13b4bb`

Cloudflare Production build:

`6a86ca27-a105-410b-8862-308e4a2aca8e`

Production version:

`00e608fa-153c-40ef-b8b9-d5700c270066`

Post-release Japanese detail remains functional and no HTTP 402 is currently observed. A controlled same-URL Production detail reload repeated three times yielded one observed detail-shaped backend bundle rather than three separately repeated warm bundles, consistent with shared edge reuse.

Implementation Issue #239 is therefore complete/superseded by #249 + #251 and is closed.

### D-138 — Observed post-release burn rate passes the technical sustainability gate with large margin

Observed organization Usage:
- post-#249 baseline: 25.108 GB uncached Egress around 02:31 JST;
- refreshed value: 25.114 GB around 16:18 JST;
- elapsed: approximately 13.78 hours;
- delta: +0.006 GB.

Approximate observed rate:
- **0.00044 GB/hour**;
- **0.0104 GB/day**.

This is far below the internal `<=0.12 GB/day` target even though the interval includes Preview/A-B verification, Production smoke and other shared-org traffic.

Accordingly, the original technical read-amplification problem is classified as **CONTROLLED / PASS-like with large margin**. A paid Supabase plan is not established as necessary by the current technical burn rate.

### D-139 — Technical PASS and historical billing-cycle risk are separate gates

The organization is still at approximately `25.114 / 5 GB` in the current cycle and Supabase reports `Grace period is over`. Because historical usage cannot be removed, a Fair Use restriction remains a residual operational risk until the cycle resets even though current burn is low.

Therefore:
- Issue #219 remains open only for billing-cycle/Fair Use stabilization;
- do not upgrade to a paid plan merely to erase historical usage without separate explicit owner approval;
- prefer final operational closure after the 2026-09-12 billing-cycle reset confirms no 402 and continued low burn.

### D-140 — The P0 freeze is partially relaxed instead of wasting engineering time

Issue #238 no longer blocks all engineering work.

Allowed now:
- feature/design/research work on isolated non-main branches;
- Cloudflare Preview deployments;
- tests, docs, review and planning;
- non-Production work that does not obscure P0 monitoring.

Still frozen until #219 final PASS:
- Production runtime merges to `main`;
- Production DB/schema/data changes;
- DNS/Auth/write/admin-surface changes;
- Secrets/Variables changes;
- unrelated Production load/migration experiments;
- billing/paid plan changes without explicit owner approval.

This balances operational isolation with the cost of holding all product engineering until the historical billing counter resets.

### D-141 — Final P0 closure order

On final operational PASS:
1. record the billing-cycle/post-reset evidence and close #219;
2. close #238 and fully reopen routine Production development;
3. ensure #239 remains closed as completed;
4. finalize and merge canonical docs PR #250 under its applicable main/Production approval boundary;
5. explicitly state that the Egress P0 thread is complete and normal Gacha Lens Production development may resume.

If 402 appears before reset, keep #219/#238 open and determine whether the reset clears it. A paid-plan decision remains a paid action requiring explicit approval.

## Current durable state

- infrastructure migration: **COMPLETE**
- Production web runtime: Cloudflare Worker `gacha-lens`
- #249 shared cache mitigation: **MERGED / PRODUCTION PASS**
- #251 cold-read mitigation: **MERGED / PRODUCTION PASS**
- observed technical burn: **PASS-like / large margin**
- Issue #219: **OPEN — billing-cycle/Fair Use stabilization only**
- Issue #238: **OPEN / PARTIALLY RELAXED**
- Issue #239: **CLOSED / COMPLETED**
- non-Production feature development: **ALLOWED**
- Production runtime merges: **FROZEN until #219 final PASS**
- paid Supabase plan requirement: **NOT ESTABLISHED**

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
