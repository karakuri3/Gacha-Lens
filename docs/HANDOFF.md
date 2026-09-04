# Gacha Lens Canonical Handoff

Updated: 2026-09-04 JST — company-roadmap Stage-5 Supabase hardening isolated validation active

The complete checkpoint immediately before this isolated lane is preserved at `docs/history/2026-09-03-pre-233-HANDOFF.md`. Earlier canonical history remains linked from that snapshot.

## Stage-5 resume protocol — highest priority for this isolated thread

If a fresh thread is specifically assigned **「Supabase hardening isolated検証」**, read these first:

1. `docs/SUPABASE_HARDENING_ISOLATED_2026-09-04.md`
2. this file
3. `docs/STATUS.md`
4. `docs/DECISIONS.md`
5. `docs/TODO.md`
6. `docs/INFRA_AUDIT_FINDINGS_2026-09-03.md`
7. `AGENTS.md` / `docs/AGENT_OS.md`

Then re-fetch exact current heads and Actions for:
- Gacha Draft PR #241 — server-only grant/GraphQL boundary rehearsal;
- Gacha Draft PR #242 — `pg_net` relocation rehearsal;
- Beach Draft PR #216 — separate-repository `rebuild_profile_stats_v1` ambiguity rehearsal.

Do not merge any of them under the validation task.

Absolute Stage-5 prohibitions:
- no Production Supabase DDL/DML;
- no main merge;
- no Production deploy;
- no DNS / `gachalens.com` changes;
- no Vercel cancellation;
- no Gacha Cloudflare Production config changes;
- no secret display;
- no paid Supabase branch without explicit approval.

Supabase Development Branching was inspected at `$0.01344/hour`; none was created. The selected isolation mechanism is GitHub-hosted ephemeral CI + disposable local Supabase with no Production credentials.

Current provisional conclusions:
- 13 Gacha server-only tables: explicit API-role revoke is **Production適用推奨候補**, final exact-head green pending.
- intentional-public `series_*` tables: blanket revoke **不要**.
- server-only RLS/no-policy: adding policies merely to silence advisor **不要**.
- global public default ACL rewrite: **保留**.
- service-role boundary change: **不要**.
- simple `pg_net ALTER EXTENSION ... SET SCHEMA`: **不要** because `extrelocatable=false`.
- `pg_net` drop/recreate under `extensions`: **保留** until #242 proves forward/rollback/reverse/reapply.
- six FK indexes and unused-index removals: **保留** pending specific workload/scale evidence.
- Egress #219 remains separate; advisor hardening does not prove billed-byte recovery.

## General resume protocol

If a fresh thread receives only **「Gacha Lens続けて」** rather than the Stage-5 assignment:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch current `main`, open/recent Issues and PRs, exact-head Actions, Vercel Production, and the minimum live Supabase evidence needed for the current gate.
3. **Do not resume Data Scale writes merely because the old technical diagnosis was `depth_insufficient`.** Issue #219 reliability/cost P0 currently outranks further market-depth expansion until post-release egress is measured.
4. Do not repeat completed R1/R2/R3/R4/history canaries merely to refresh context.
5. Production data writes, migrations/schema/backfills, approval-bound provider execution, workflow dispatch/change, Secrets/Variables, paid/destructive actions, direct main pushes, and ineligible merges/releases require the applicable explicit approval.
6. After each major Production/recovery/security/release milestone, synchronize `HANDOFF / STATUS / DECISIONS / TODO` before the next major phase.

## Repository / services

- Repository: `karakuri3/Gacha-Lens`
- Stage-5 main bind: `da506232472c22c909f95e5a855b1cfed8889e73`
- Production domain: `https://gachalens.com`
- Vercel Production: `dpl_7KLUH7bP8JNESPndzQYhzE4jQn9G` — **READY**
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- Old inactive Supabase: `ihcudkfspzuixsqsvoku` — never confuse with Production
- Preferred local path: `C:\dev\Gacha-Lens`

## Current P0 — shared Supabase uncached Egress risk

Issue #219 is **OPEN** and remains a separate operational gate.

Authenticated billing evidence captured on 2026-09-03 showed:
- uncached Egress **24.614 / 5 GB (~492%)** for the shared Free Plan organization;
- overage **19.61 GB**;
- cached Egress only about **0.053 / 5 GB**;
- grace period end **2026-09-19** with possible HTTP 402 request restriction if Fair Use restriction is applied.

Live-log/repository evidence strongly implicated repeated Gacha Lens server-side public reads, including large variant pagination and public SEO/sitemap traversal. The evidence is strong for mechanism/root-cause direction but does **not** establish an exact Gacha Lens-only billed-GB amount.

## P0-A sitemap mitigation — RELEASED

PR #231 completed the first free mitigation.

Exact release evidence recorded by the prior canonical checkpoint:
- final PR head `fc091f32ae216779e782eef84fc2701fbc769492`;
- exact-head PR Code Quality `33754793103`: **SUCCESS**;
- exact-head Preview `dpl_GVNunr8mDJ54FE5a6nr3mD5Hi4Qj`: **READY**;
- all sitemap routes Static with `1d` revalidation;
- strengthened Lead self-review findings0;
- normal Production `dpl_7KLUH7bP8JNESPndzQYhzE4jQn9G`: READY;
- live Production sitemap smoke passed.

P0-A is not proof that #219 is solved. The true gate remains read-only post-release Egress observation.

## Product strategy after the reliability gate

Use:

**Reliability / Cost -> User Value -> Traffic -> Click -> Revenue**

Data Scale is infrastructure, not the business goal. Do not mechanically chase listing/depth counts while user acquisition, click-through, conversion, monetization, or reliability is the larger bottleneck.

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

The old technical diagnosis `depth_insufficient` remains useful evidence, but it does not authorize a write and does not outrank current reliability/cost evidence.

## R4 state remains closed/consumed

The repaired Production R4 writer and one-candidate proof remain successfully completed as documented in prior history.

No further R4 write, retry, provider refresh, or workflow mutation is authorized by the consumed #228 approval. A future Production market write requires a new current-state bind and fresh applicable approval.

## Separate work / concurrency

- Cloudflare Workers runtime migration is a different workstream and must not be modified from this Stage-5 hardening lane.
- PR #232 is a separate Draft technology-intelligence docs lane.
- #137/#142 F0 remains a separate Production-impact boundary.
- Beach hardening code stays in the Beach repository; only cross-repo result/status may be referenced here.

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

## Canonical history

Immediate pre-Stage-5 checkpoint:
- `docs/history/2026-09-03-pre-233-HANDOFF.md`

Stage-5 detailed evidence/resume file:
- `docs/SUPABASE_HARDENING_ISOLATED_2026-09-04.md`
