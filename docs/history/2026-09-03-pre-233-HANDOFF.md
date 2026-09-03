# Gacha Lens Canonical Handoff

Updated: 2026-09-03 JST — successful Production R4 one-candidate write / Issue #229 canonical sync

This is the current operational handoff. The complete checkpoint immediately before #229 is preserved byte-for-byte at `docs/history/2026-09-03-pre-229-HANDOFF.md`; that snapshot links to pre-#226 and earlier history.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch current `main`, recent Issues/PRs/Actions, Vercel, and only the live Production evidence needed for the next decision.
3. Do not repeat completed or failed R1/R2/R3/R4/history canaries merely to refresh context.
4. Production data writes, migrations/schema/backfills, approval-bound provider execution, workflow dispatch/change, Secrets/Variables, paid/destructive actions, direct main pushes, and ineligible merges/releases require applicable explicit approval.
5. After each major Production/recovery/security/release milestone, synchronize `HANDOFF / STATUS / DECISIONS / TODO` before the next major phase.

## Repository / services

- Repository: `karakuri3/Gacha-Lens`
- Exact runtime main approved and used for the successful R4 write: `8cc10b23236406b7bb3b9cec3db5e72574205196`
- Vercel Production for that main: `dpl_6iZU7XNhmqM4ruxuVz9j77q3ZDnd` — READY
- Production: `https://gachalens.com`
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- Old inactive Supabase: `ihcudkfspzuixsqsvoku` — never confuse with Production
- Preferred local path: `C:\dev\Gacha-Lens`

## Production R4 repair — COMPLETE

The three reviewed repair migrations are already applied and verified in Production:
- `20260903111455 market_observation_trigger_schema_qualification`
- `20260903111513 market_observation_service_role_contract`
- `20260903111600 market_depth_r4_postgres_regex_repair`

Authoritative callable state remains:
- broken `{1,300}` guard occurrences: 0
- explicit source-ID length 1..300 + PostgreSQL-safe allowlist present
- trigger relation schema-qualified
- SECURITY INVOKER
- empty `search_path`
- PUBLIC/anon/authenticated EXECUTE false
- service_role EXECUTE true
- service_role observation-table CRUD true

The repair authorization is consumed/non-reusable.

## Production R4 candidate proof — SUCCESS

Issue #228 performed a fresh read-only rebind after repair and then received a new exact one-candidate human approval.

Approved identity:
- main `8cc10b23236406b7bb3b9cec3db5e72574205196`
- observation key `depth-r4-v1:20260903-02`
- batch digest `219f0f0f9d7019f38c2d6a6689921835247980c5f6d91c4a4ff175b8bce19a72`
- target variant `gashapon-4535123846069000-伏黒恵`
- candidate `yahoo-suruga-ya-601199451001`
- candidate key `1091dce22a0bf29f`
- selection fingerprint `56e8f3798cbf366f3b2936ad2034600c27ed36bb5f33ff7c9a6f522a86748198`
- provider/native `yahoo_shopping:suruga-ya_601199451001`
- evidence price/status `980 / active`
- deterministic observation `market-depth-r4-54b6e36807377900ebcb5046cbdae9d8`

Immutable source evidence reused without a new provider request:
- R3 run `33665350076`
- artifact `9860342840`
- artifact SHA256 `a0fe9011e7b0102f8464835385746b0437fdebff74791e6db9d294d015df5e8a`
- source main `b38f62ef81b8ec3a9cdf02395d4bdd678dadee31`
- generated_at `2026-09-02T18:08:53.303Z`
- downloaded ZIP digest independently matched and the Production 7-day freshness guard passed immediately before execution.

Immediate prewrite gate passed:
- exact main unchanged
- target variant/series exact, `variant_type=normal`, `review_required=false`
- fresh safe target depth exactly 1 with existing ID [`yahoo-suruga-ya-601192353001`]
- unresolved target issues0
- listing/public URL/provider-native/observation collisions0
- repaired function security/validator state intact

The approved R4 function was invoked **exactly once** under `service_role`; no retry occurred.

Synchronous result:
- `inserted_count=1`
- target depth `1 -> 2`
- listing `yahoo-suruga-ya-601199451001`
- observation `market-depth-r4-54b6e36807377900ebcb5046cbdae9d8`

Independent postwrite SELECT proved:
- listings `132 -> 133`
- observations `154 -> 155`
- completed/sold remains 0
- candidate row exactly 1
- observation row exactly 1
- target fresh IDs exactly [`yahoo-suruga-ya-601192353001`, `yahoo-suruga-ya-601199451001`]
- candidate identity, 980/active state, classification, confidence and full R3/R4 provenance markers exactly match the approved manifest
- after the immediate precheck timestamp, the only new market rows were this listing and this observation; no unrelated concurrent market write was observed.

Issue #228 is CLOSED completed. The exact R4 candidate-write approval is consumed/non-reusable.

## Current Data Scale checkpoint

Fresh SELECT-only snapshot after the successful write:
- series: **10,241**
- variants: **23,808**
- listings: **133**
- observations: **155**
- fresh <30d covered variants: **122**
- depth: **120 x1 / 2 x2 / 0 x3+**
- max fresh depth: **2**
- re-observed listings: **22 / 133 = 16.5414%**
- review-safe stock/restock: **0 / 0**
- outbound clicks 7d: **10**
- completed-sale evidence: **0**

The P0 Data Scale diagnosis remains **`depth_insufficient`** because 120/122 covered variants still have only one fresh listing.

The increase from the repair-time 127/149 checkpoint to the pre-R4 132/154 checkpoint was independently explained by existing scheduled `Gacha Market P3 Bounded Seed V2 Automatic` run `33748940988`, which logged 10 database writes = 5 listings + 5 observations and did not touch the R4 target.

## Current true gate — reassess bounded depth scaling

The one-candidate R4 proof is complete. The next safe phase is read-only/product-level reassessment, not another automatic write.

Recommended sequence:
1. re-fetch live Scoreboard and recent automatic collection behavior before acting;
2. determine whether the current P3 automatic collector is primarily increasing breadth while depth remains the dominant bottleneck;
3. design the smallest bounded depth-scaling step that can improve existing covered variants without weakening matching/identity guards;
4. keep provider calls, Production writes, workflow/schedule changes and any new execution approval as separate explicit boundaries;
5. avoid endless infrastructure work if product/traffic/revenue work becomes higher leverage.

No further R4 write, provider refresh, or workflow mutation is authorized by the completed #228 approval.

## Separate security/performance debt

Post-repair Supabase advisor findings remain separate work: RLS/no-policy notices, existing client/GraphQL visibility, public-schema extension warning, unindexed foreign keys and unused indexes. Do not change them by implication under Data Scale execution authority.

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
- #137/#142 remains a separate F0 Production-impact boundary.

## Canonical history

Immediate pre-#229 checkpoint:
- `docs/history/2026-09-03-pre-229-HANDOFF.md`

Do not create a recursive canonical sync merely to record #229's own docs-only merge.