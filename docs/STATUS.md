# Gacha Lens Status

Updated: 2026-09-03 JST — #214 R4 fail-closed Production attempt / Issue #215 canonical sync

The complete pre-#215 status file is preserved verbatim at `docs/history/2026-09-03-pre-215-STATUS.md`.

## Current repository / release

- canonical main at #214 attempt: `7b7b04f68d693dc2f50248adf3a4ecafd99bc472`
- Vercel Production `dpl_CANqH8RetfJRhCDeJd6CeHj1bGpc`: **READY**
- Production domain: `gachalens.com`
- Supabase Production: `vxbrnvfhmzcxehuuzzum`

## Current Production data

Independent SELECT after #214 failed write:
- market listings: **127**
- observations: **149**
- re-observed: **22**
- repeated-history rate: **17.3228%**
- completed sold: **0**
- target 伏黒恵 fresh depth: **1**
- candidate `yahoo-suruga-ya-601199451001`: absent
- deterministic observation `market-depth-r4-924833906c89effa6b6e67c9b76409dc`: absent

Last full Scoreboard before #214:
- fresh <30d variants: 117 / 23,808 = 0.4914%
- depth: **116 x1 / 1 x2 / 0 x3+**
- current P0: **`depth_insufficient`**
- outbound clicks: 10/7d, 41/30d, 14 distinct variants/30d
- review-safe stock/restock/X: 0/0/0

## #214 R4 schema state

Migration applied once:
- repository migration `20260903033000_market_depth_r4_atomic_v1.sql`
- Production ledger `20260903091535 / market_depth_r4_atomic_v1`

Function installed:
- `public.apply_market_depth_r4_atomic_v1(jsonb)`
- SECURITY INVOKER
- empty search_path
- service_role EXECUTE only

## #214 write attempt

Exact frozen identity:
- main `7b7b04f68d693dc2f50248adf3a4ecafd99bc472`
- key `depth-r4-v1:20260903-01`
- digest `adae640b856f8de560195430a86f6ee618953b5646dd3833226b7815ce4bb81b`
- candidate `yahoo-suruga-ya-601199451001`
- candidate key `1091dce22a0bf29f`
- fingerprint `56e8f3798cbf366f3b2936ad2034600c27ed36bb5f33ff7c9a6f522a86748198`

Prewrite gate: PASS.
Migration: SUCCESS.
Migration-only market-data delta: 0.
Resolution manifest: saved before write.
Authorized write calls: **exactly 1**.
Result: **FAIL-CLOSED** before inserts with PostgreSQL `2201B invalid regular expression: invalid repetition count(s)`.

Root cause: SQL validator `^[A-Za-z0-9:._-]{1,300}$` uses a repetition bound PostgreSQL cannot evaluate.

No retry occurred. #214 authority is consumed/non-reusable. Post-failure SELECT proves zero market-data writes and non-ambiguous failure.

## Current R4 operational rule

The installed R4 function is **known runtime-defective and must not be invoked** until a reviewed repair is merged and a fresh Production repair approval is granted.

Required next engineering step after #215 sync:
1. repository-only repair of the SQL source_listing_id validation;
2. add a real disposable-DB function invocation test;
3. exact-head CI/Preview/disposable Supabase proof + review gates;
4. merge repository repair;
5. separate fresh approval for Production repair migration;
6. rebind current main/target/digest and obtain a new one-write R4 approval.

No Production repair/retry is authorized now.

## History lane

Generic bounded history remains installed and previously succeeded.
Latest history success: #211 run `33726009433` -> **127/149/22/sold0**. #211 authority consumed.

## R3 source evidence

#206 run `33665350076` remains the immutable source evidence for the frozen candidate. Artifact `9860342840`, digest `sha256:a0fe9011e7b0102f8464835385746b0437fdebff74791e6db9d294d015df5e8a`. Production writes0. #206 authority consumed.

## Hard holds

- no invocation of current R4 function
- no Production repair migration without fresh approval
- no candidate write retry under #214
- no provider calls under consumed authority
- no workflow/schedule change or dispatch by implication
- no Secrets/Variables changes
- no F0/#142 implication
- no paid/destructive action
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no automatic RPC retry

## Full prior status snapshot

`docs/history/2026-09-03-pre-215-STATUS.md`