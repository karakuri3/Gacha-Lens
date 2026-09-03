# Gacha Lens Durable Decisions

Updated: 2026-09-03 JST — P0-A Supabase egress mitigation released / Issue #233 canonical sync

The complete durable-decisions checkpoint immediately before this sync is preserved byte-for-byte at `docs/history/2026-09-03-pre-233-DECISIONS.md`. Decisions D-001 through D-118 remain authoritative unless explicitly superseded below.

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

## Current durable state

- current main: `8048a19ad478672a9d887d77073597ee95dc27d3`
- Production: `dpl_7KLUH7bP8JNESPndzQYhzE4jQn9G` — READY
- Issue #219: **OPEN P0**
- P0-A sitemap mitigation: **RELEASED / VERIFIED**
- P0-A billed-Egress outcome: **NOT YET PROVEN**
- next true gate: **read-only post-release Egress observation**
- if still high: **P0-B remaining public-loader attribution/mitigation**
- if normalized: **business-scoreboard reassessment before choosing the next product/Data Scale experiment**
- Production R4 repair: **APPLIED AND VERIFIED**
- R4 one-candidate proof: **SUCCESS**
- exact #228 write authority: **consumed/non-reusable**
- last canonical market snapshot: **133 listings / 155 observations / 120x1 / 2x2 / 0x3+ / clicks7d10 / sold0**

## Approval state

Not authorized now:
- another R4 write/retry
- provider refresh under consumed authority
- another history write by implication
- workflow dispatch/change
- Secrets/Variables changes
- F0/#142
- unrelated advisor remediation
- paid/destructive actions
- Supabase paid-plan upgrade without exact current price/terms and explicit owner approval

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

Immediate pre-#233 decisions snapshot:

`docs/history/2026-09-03-pre-233-DECISIONS.md`

Once this exact sync reaches `main`, Issue #233 is complete by definition and does not trigger another recursive canonical sync solely to record its own merge.