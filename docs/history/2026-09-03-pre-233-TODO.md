# Gacha Lens Ordered TODO

Updated: 2026-09-03 JST — successful Production R4 one-candidate write / Issue #229 canonical sync

The complete ordered TODO checkpoint immediately before #229 is preserved byte-for-byte at `docs/history/2026-09-03-pre-229-TODO.md`.

Current umbrella: Issue #119 Data Scale.

## P0 — Canonical sync #229 — CURRENT

- [x] verify exact approved runtime main `8cc10b23236406b7bb3b9cec3db5e72574205196`
- [x] verify repaired Production R4 callable state immediately before write
- [x] verify target variant/series/review state exact
- [x] verify target fresh depth1 with exact existing ID set
- [x] verify unresolved issues0 and all candidate/observation collisions0
- [x] verify immutable R3 artifact digest and Production seven-day freshness guard
- [x] freeze new observation key `depth-r4-v1:20260903-02`
- [x] freeze digest `219f0f0f9d7019f38c2d6a6689921835247980c5f6d91c4a4ff175b8bce19a72`
- [x] obtain exact fresh human approval for one candidate only
- [x] record durable pre-RPC execution manifest on #228
- [x] invoke R4 function exactly once under service_role
- [x] no automatic retry
- [x] synchronous result inserted_count1 / target depth1->2
- [x] independently verify listings 132->133 / observations 154->155 / sold0
- [x] independently verify candidate1 / deterministic observation1 / exact provenance markers
- [x] verify only the expected listing + observation were created after the immediate precheck timestamp
- [x] close Issue #228 completed
- [x] mark exact #228 approval consumed/non-reusable
- [x] recompute postwrite Data Scale: 122 covered / 120x1 / 2x2 / 0x3+ / reobs22 / clicks7d10
- [x] confirm P0 remains `depth_insufficient`
- [x] create Issue #229
- [x] preserve pre-#229 canonical files byte-for-byte under `docs/history/`
- [x] update current four canonical checkpoints
- [ ] verify #229 diff contains only 4 current canonical + 4 history files
- [ ] verify history blob identities match pre-#229 blobs
- [ ] open docs-only PR closing #229
- [ ] exact-head Code Quality SUCCESS
- [ ] exact-head Vercel Preview READY
- [ ] unresolved GitHub/Vercel threads0 and main drift0
- [ ] record docs-only self-review as explicitly non-independent
- [ ] squash merge under docs-only safe policy
- [ ] verify #229 closed and normal Vercel Production READY

Do not create a recursive canonical sync merely to record #229's own docs-only merge.

## P1 — Read-only Data Scale reassessment — NEXT

The real R4 one-candidate proof is complete and successful. No further market write is authorized.

Next safe work:
- [ ] re-fetch live Scoreboard at the start of the next execution/design phase
- [ ] inspect recent P3 V2 automatic runs and distinguish breadth growth from depth growth
- [ ] quantify how many currently covered variants can safely receive a second distinct listing under existing strict identity/matching rules
- [ ] compare bounded depth scaling against source breadth, signal coverage, TRAFFIC -> CLICK -> REVENUE and current business priorities
- [ ] choose the smallest high-leverage next experiment rather than defaulting to more infrastructure

Current evidence favors investigating bounded depth scaling because 120/122 fresh covered variants remain depth1.

## P2 — Bounded depth-scaling design — HOLD UNTIL P1 CHOICE

If P1 confirms depth scaling remains highest leverage:
- [ ] design a bounded candidate-selection contract for already-covered depth1 variants
- [ ] preserve strict variant/parent identity and collision guards
- [ ] define provider/request/write ceilings and fail-closed behavior
- [ ] define exact observability and before/after Scoreboard evidence
- [ ] prove in code/disposable environment before any Production execution
- [ ] use independent review or a separately authorized substitution if required by governance
- [ ] obtain separate explicit approval for any provider execution, workflow mutation or Production write

Do not infer batch write authority from #228. #228 authorized exactly one consumed candidate.

## P3 — Product / traffic / revenue path

At every reassessment, avoid treating data scale as the business goal itself.
- [ ] monitor whether added depth materially improves market pages/usefulness
- [ ] preserve outbound-click measurement
- [ ] prioritize conversion/revenue instrumentation once data quality is sufficient
- [ ] do not delay traffic/revenue work merely to chase arbitrary listing counts

## Separate security/performance debt

Post-repair Supabase advisor findings remain separate behavior-impact work:
- RLS enabled / no policy INFO notices
- existing anon/authenticated GraphQL/schema visibility from SELECT grants
- `pg_net` extension in public schema warning
- unindexed foreign keys
- unused indexes

Do not remediate these by implication during Data Scale work.

## Separate holds / debt

- #142/#137 F0 remains a separate approval boundary
- Foundation migration-order debt is resolved by #220/#221
- unused branch `tmp-should-not-create` remains unrelated; do not delete automatically without applicable cleanup policy/approval

## HOLD — explicit prohibitions now

- [ ] DO NOT invoke another R4 write under the consumed #228 approval
- [ ] DO NOT retry #214 or #228
- [ ] DO NOT reuse Production repair authority
- [ ] DO NOT reuse #208, #180/#182, or #218 review substitutions
- [ ] DO NOT make new provider calls under consumed authority
- [ ] DO NOT run another history batch automatically
- [ ] DO NOT dispatch/change workflows without applicable approval
- [ ] DO NOT change Secrets/Variables by implication
- [ ] DO NOT merge/dispatch F0/#142 without its boundary
- [ ] DO NOT remediate advisor findings by implication
- [ ] DO NOT invoke paid reviewer/actions without approval
- [ ] DO NOT use destructive actions without approval
- [ ] DO NOT weaken strict matcher/identity guards
- [ ] DO NOT scrape Mercari or Amazon
- [ ] DO NOT touch `supabase/.temp/cli-latest`
- [ ] keep `.github/workflows/gacha-ingestion.yml` disabled
- [ ] no automatic RPC retry
- [ ] no direct main push

## Canonical history

`docs/history/2026-09-03-pre-229-TODO.md`

Do not create a recursive canonical sync merely to record #229's own docs-only merge.