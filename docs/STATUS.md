# Gacha Lens Status

Updated: 2026-09-03 JST — successful Production R4 one-candidate write / Issue #229 canonical sync

The complete status checkpoint immediately before #229 is preserved byte-for-byte at `docs/history/2026-09-03-pre-229-STATUS.md`.

## Current repository / release

- exact runtime main used for the successful R4 write: `8cc10b23236406b7bb3b9cec3db5e72574205196`
- Vercel Production for that main: `dpl_6iZU7XNhmqM4ruxuVz9j77q3ZDnd` — READY
- Production domain: `gachalens.com`
- Supabase Production: `vxbrnvfhmzcxehuuzzum`
- Issue #228: **CLOSED completed**

## Production R4 repair status — VERIFIED

The three reviewed repair migrations remain applied and verified. Installed R4 callable state remains SECURITY INVOKER, empty search_path, service_role-only EXECUTE, repaired PostgreSQL-safe source-ID validation and schema-qualified observation trigger path.

Repair authority is consumed/non-reusable.

## Production R4 candidate proof — SUCCESS

Fresh approval identity:
- main `8cc10b23236406b7bb3b9cec3db5e72574205196`
- digest `219f0f0f9d7019f38c2d6a6689921835247980c5f6d91c4a4ff175b8bce19a72`
- observation key `depth-r4-v1:20260903-02`
- target `gashapon-4535123846069000-伏黒恵`
- candidate `yahoo-suruga-ya-601199451001`
- deterministic observation `market-depth-r4-54b6e36807377900ebcb5046cbdae9d8`
- evidence price/status `980 / active`

The function was invoked exactly once under `service_role`; no retry occurred.

Verified result:
- target depth **1 -> 2**
- listings **132 -> 133**
- observations **154 -> 155**
- sold/completed **0**
- candidate rows **1**
- deterministic observation rows **1**
- exact fresh target IDs now [`yahoo-suruga-ya-601192353001`, `yahoo-suruga-ya-601199451001`]
- listing/observation identity and R3/R4 provenance markers exact
- only the expected listing + observation were created after the immediate precheck timestamp.

The one-candidate write approval is **consumed/non-reusable**.

## Current Data Scale state

Postwrite SELECT-only snapshot:
- series **10,241**
- variants **23,808**
- listings **133**
- observations **155**
- fresh <30d covered variants **122**
- depth **120 x1 / 2 x2 / 0 x3+**
- max depth **2**
- re-observed **22 / 133 = 16.5414%**
- stock/restock **0 / 0**
- clicks 7d **10**
- completed sales **0**

P0 remains **`depth_insufficient`**.

## Current true gate

Next safe work is read-only reassessment of bounded depth scaling versus other business/product priorities. Another provider execution, Production market write, workflow/schedule change or R4 batch is not authorized by #228.

The existing scheduled P3 V2 automatic collector recently added 5 listings + 5 observations without touching the R4 target. Before changing collection behavior, verify whether it is increasing breadth more than depth and design the smallest bounded improvement.

## Separate advisor debt

Supabase advisor findings outside R4 remain separate scoped work. Do not silently change RLS/policies, existing client grants, extension placement or indexes under Data Scale authority.

## Hard holds

- no further R4 write/retry without a new current-state bind and fresh exact approval
- no automatic RPC retry
- no provider refresh under consumed authority
- no workflow dispatch/change by implication
- no Secrets/Variables changes
- no F0/#142 implication
- no advisor remediation by implication
- no paid/destructive action without approval
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no direct main push

## Canonical history

`docs/history/2026-09-03-pre-229-STATUS.md`

Do not create a recursive canonical sync merely to record #229's own docs-only merge.