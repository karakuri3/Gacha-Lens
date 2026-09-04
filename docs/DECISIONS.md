# Gacha Lens Durable Decisions

Updated: 2026-09-04 JST — Supabase hardening isolated validation decisions added

The complete durable-decisions checkpoint immediately before this lane is preserved byte-for-byte at `docs/history/2026-09-03-pre-233-DECISIONS.md`. Decisions D-001 through D-123 remain authoritative unless explicitly superseded below.

## Authoritative additions

### D-119 — Reliability and cost risk outrank Data Scale when shared infrastructure faces credible restriction

The prior technical Data Scale diagnosis `depth_insufficient` remains valid for the last measured market snapshot, but it is not the business goal and does not permanently own P0 priority.

On 2026-09-03, authenticated Supabase billing evidence showed shared Free Plan uncached Egress at 24.614 / 5 GB with Fair Use grace ending 2026-09-19 and possible HTTP 402 restriction. That availability/cost risk became the true P0 and correctly preempted further R4/depth execution.

Future prioritization must similarly allow reliability, cost, user value, traffic, click or revenue evidence to supersede a lower-level infrastructure metric.

### D-120 — P0-A sitemap caching is proven released, but #219 is not proven solved until observed Egress improves

PR #231 changed the public sitemap execution model from request-driven dynamic/short-cache amplification to daily static/ISR plus outer-cache boundaries while preserving sitemap population and fail-closed contracts.

Exact evidence:
- final head `fc091f32ae216779e782eef84fc2701fbc769492`;
- Code Quality #116 / `33754793103` SUCCESS;
- Preview `dpl_GVNunr8mDJ54FE5a6nr3mD5Hi4Qj` READY;
- all three sitemap routes Static with `1d` revalidation in Vercel Build;
- five-file strengthened Lead self-review, explicitly non-independent, findings0;
- merge/main `8048a19ad478672a9d887d77073597ee95dc27d3`;
- Production `dpl_7KLUH7bP8JNESPndzQYhzE4jQn9G` READY;
- live Production sitemap smoke passed.

This proves code/release correctness, not exact billed-byte savings. Issue #219 remains open until read-only post-release evidence shows the Egress trajectory is compatible with the chosen plan or an explicit alternative plan decision is made.

### D-121 — If P0-A is insufficient, remaining public read amplification becomes P0-B before more market writes

If post-release Egress remains materially high, the next engineering lane is remaining public runtime read attribution/mitigation, especially broad signal-table/full-loader reads, unnecessary large fields, repeated hydration, and cacheable request paths.

P0-B must remain measured and fail-safe: preserve SEO/public semantics, market/stock/restock/trend behavior, and ingestion/write isolation. Do not buy a paid plan or weaken functionality by implication merely to hide avoidable read amplification.

### D-122 — Product prioritization uses a business/reliability scoreboard, not Data Scale counts alone

After the reliability gate, the ordered decision model is:

**Reliability / Cost -> User Value -> Traffic -> Click -> Revenue**

Data Scale is a supporting capability. A future depth/breadth/history experiment must explain which user/business outcome it is expected to improve and how that improvement will be measured. Listing/depth counts alone are insufficient justification for continued infrastructure work.

Relevant evidence includes search impressions/clicks/CTR/indexation, page traffic, outbound shop clicks and CTR, affiliate conversion/revenue where available, data freshness/coverage quality, and Supabase/Vercel cost/request efficiency.

### D-123 — The completed #228 R4 authority remains consumed across the P0 reprioritization

Moving focus to #219 does not reopen or broaden any previous Production authority. The successful R4 repair and one-candidate proof remain historical verified state, and the exact #228 approval remains consumed/non-reusable.

No further R4 write/retry, provider refresh, workflow mutation or Production market write is authorized by this reprioritization. A future write requires a new current-state bind and fresh applicable approval.

### D-124 — Stage-5 Supabase hardening validation is isolated-only and cannot borrow Production authority from another lane

The company-roadmap Stage-5 lane may use read-only Production inspection plus disposable local Supabase CI, but it may not mutate Production, merge to main, deploy Production, change DNS/Cloudflare/Vercel Production configuration, display secrets, or create paid Supabase branches without explicit approval.

This lane is explicitly separate from the Cloudflare Workers runtime migration and from Egress #219 execution authority.

### D-125 — Paid Supabase Development Branching is not required for current hardening rehearsal

Current branch pricing was inspected at `$0.01344/hour`. No paid branch was created. GitHub-hosted ephemeral runners with disposable local Supabase are the selected isolated environment because they satisfy rehearsal/regression/rollback needs without Production credentials or remote paid resources.

### D-126 — Server-only Gacha tables should be normalized explicitly, not by globally rewriting public-schema default ACLs

Production read-only inspection found 13 RLS-enabled/zero-policy server-only tables with broad `anon` / `authenticated` grants and matching GraphQL/API discovery warnings. Current application data access is server-side through the `server-only` service-role boundary.

Four separate `series_*` tables have intentional public read policies. Therefore:
- explicit revoke on the 13 server-only objects is a valid isolated candidate;
- blanket revocation from intentional-public objects is rejected;
- global default-ACL rewriting is held because it could break legitimate future public objects;
- zero-policy RLS on server-only tables is not itself a defect once direct browser grants are absent.

### D-127 — `forecast_snapshots` Production drift may be synthesized only as a disposable test fixture

`forecast_snapshots` exists in Production but is intentionally absent from the canonical fresh migration chain. Its Production schema was re-verified read-only and matches the legacy source description.

Stage-5 CI may recreate that exact object only inside a disposable local database to test the real Production grant set. This does not authorize adding the table to the canonical migration chain or changing Production.

### D-128 — `pg_net` must be treated as a drop/recreate candidate, not a simple relocation

Production reports `pg_net` 0.20.4 with extension namespace `public` and `extrelocatable=false`. A simple `ALTER EXTENSION ... SET SCHEMA` is therefore rejected.

Supabase documentation/troubleshooting supports testing drop/recreate under `extensions` when dependencies permit. Draft PR #242 is the dedicated isolated rehearsal. Production relocation remains **保留** until forward, rollback, reverse, and reapply paths are proven and a fresh Production dependency/queue/cron preflight is clean.

## Current durable state

- Stage-5 canonical evidence: `docs/SUPABASE_HARDENING_ISOLATED_2026-09-04.md`
- Gacha Draft PR #241: server-only grant hardening isolated rehearsal, unmerged
- Gacha Draft PR #242: pg_net isolated relocation rehearsal, unmerged
- paid Supabase branch created: **NO**
- Production Supabase mutations under Stage 5: **0**
- current main at Stage-5 bind: `da506232472c22c909f95e5a855b1cfed8889e73`
- Production: `dpl_7KLUH7bP8JNESPndzQYhzE4jQn9G` — READY
- Issue #219: **OPEN P0 / separate lane**
- P0-A sitemap mitigation: **RELEASED / VERIFIED**
- P0-A billed-Egress outcome: **NOT YET PROVEN**
- Production R4 repair: **APPLIED AND VERIFIED**
- exact #228 write authority: **consumed/non-reusable**

## Approval state

Not authorized now:
- any Stage-5 Production DDL/DML or Auth setting change
- merge of #241/#242
- another R4 write/retry
- provider refresh under consumed authority
- another history write by implication
- workflow dispatch/change
- Secrets/Variables changes
- F0/#142
- paid/destructive actions
- Supabase paid-plan/paid-branch action without exact current price/terms and explicit owner approval

## Hard durable constraints

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no automatic RPC retry
- do not manually alter Supabase migration ledger identity/timestamps
- do not weaken strict market matching or identity guards for coverage
- completed sold evidence remains separate from asking-price evidence
- do not scrape Mercari or Amazon
- direct main pushes remain prohibited

## Canonical history

Immediate pre-Stage-5 decisions snapshot:

`docs/history/2026-09-03-pre-233-DECISIONS.md`

Stage-5 detailed evidence and resume instructions live in `docs/SUPABASE_HARDENING_ISOLATED_2026-09-04.md`.