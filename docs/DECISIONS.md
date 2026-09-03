# Gacha Lens Durable Decisions

Updated: 2026-09-03 JST — #214 R4 fail-closed Production attempt / Issue #215 canonical sync

The complete pre-#215 durable-decisions file is preserved verbatim at `docs/history/2026-09-03-pre-215-DECISIONS.md`.

## Authoritative additions

### D-089 — #214 R4 Production attempt is terminal fail-closed evidence

#214 was explicitly authorized for exactly one application of the reviewed R4 migration plus exactly one frozen-candidate write invocation.

Execution facts:
- approved main `7b7b04f68d693dc2f50248adf3a4ecafd99bc472`
- observation key `depth-r4-v1:20260903-01`
- digest `adae640b856f8de560195430a86f6ee618953b5646dd3833226b7815ce4bb81b`
- migration applied successfully; Production ledger `20260903091535 / market_depth_r4_atomic_v1`
- function verified SECURITY INVOKER / empty search_path / service_role-only
- durable resolution manifest persisted before the write call
- authorized write invocation count: **exactly one**
- write invocation failed synchronously with PostgreSQL `ERROR 2201B invalid regular expression: invalid repetition count(s)`
- no retry
- independent post-failure SELECT: 127 listings / 149 observations / sold0, candidate listing absent, deterministic observation absent, target depth still1

Therefore commit state is not ambiguous and Production market-data writes were zero. #214 authority is consumed and non-reusable.

### D-090 — PostgreSQL validation must not mirror JavaScript regex bounds blindly

The R4 JS contract accepts a source listing ID with `/^[A-Za-z0-9:._-]{1,300}$/`, but PostgreSQL cannot evaluate the SQL regex repetition bound `{1,300}` in this environment.

The repaired SQL contract must express the same semantics using two independent guards:
1. explicit string length between 1 and 300;
2. allowed-character regex such as `^[A-Za-z0-9:._-]+$` without an unsupported high repetition bound.

Do not weaken the allowed character set or the 300-character maximum merely to make the function run.

### D-091 — Migration application is not sufficient runtime proof for callable database logic

Disposable Supabase reset/migration-apply proof and static SQL assertions verified that the R4 function could be created, but did not exercise its candidate-validation path. That allowed a runtime PostgreSQL regex defect to survive review.

For callable stored procedures/functions that will mutate Production, future repository validation must include a disposable-database runtime invocation covering the real validation/write path, including expected success and fail-closed behavior as applicable. Function creation alone is not a sufficient verifier.

### D-092 — The installed R4 v1 function is quarantined until a reviewed repair reaches Production

`public.apply_market_depth_r4_atomic_v1(jsonb)` is currently installed in Production but is known runtime-defective. Presence in Production grants no authority and is not evidence that the lane is usable.

Until a repository repair is reviewed/merged and a fresh Production repair migration is explicitly approved and applied:
- do not invoke the function;
- do not retry #214;
- do not reinterpret the existing ledger as a successful R4 data rollout;
- do not change the function directly in Production outside a reviewed repair migration.

### D-093 — R4 schema repair and R4 candidate persistence are separate approval boundaries

After the repository repair merges:
1. obtain fresh explicit approval for the Production repair migration;
2. verify the repaired function/security/runtime state;
3. re-fetch current main and target Production state;
4. rebuild the complete frozen R4 manifest/digest against that current state;
5. obtain a new exact one-candidate R4 write approval.

A Production repair migration does not authorize candidate persistence. Candidate persistence does not authorize provider rediscovery, scaling, workflows, Secrets/Variables, F0, paid, or destructive work.

### D-094 — Preserve full canonical history outside the compact current checkpoint

To keep canonical files operationally readable without deleting durable evidence, the complete pre-#215 canonical files are archived byte-for-byte under `docs/history/2026-09-03-pre-215-*.md`. Current canonical files may be compact, but archive references are part of the durable handoff and must not be deleted casually.

## Current durable state

- Production market data remains **127 listings / 149 observations / 22 re-observed / sold0** after #214.
- History remains 17.3228% at this checkpoint.
- Last measured P0 before #214 is `depth_insufficient` because 116/117 fresh covered variants were x1 depth.
- R3 #206 candidate remains unpersisted.
- R4 Production migration is installed, but the installed function is quarantined.
- #214 authority is consumed.
- Next allowed major work after #215 sync is repository-only repair and validation.

## Approval state

Consumed/non-reusable includes #172, R2 v1/v2, both #201 attempts, #206 R3, #208 review substitution, #211 history, and **#214 R4 migration/write authority**.

Not authorized now:
- current R4 function invocation
- Production R4 repair migration
- R4 candidate write
- provider calls
- another history write
- Production-capable workflow/schedule change or dispatch
- Secrets/Variables changes
- F0/#142
- paid/destructive actions

## Hard durable constraints

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no automatic RPC retry
- do not manually alter Supabase migration ledger identity/timestamps
- do not weaken strict market matching or identity guards for coverage
- completed sold evidence remains separate from asking-price evidence
- do not scrape Mercari or Amazon
- repository merge and Vercel READY never imply Supabase Production authority
- direct main pushes remain prohibited

## Full prior decisions snapshot

`docs/history/2026-09-03-pre-215-DECISIONS.md`