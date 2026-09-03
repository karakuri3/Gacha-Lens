# Gacha Lens Durable Decisions

Updated: 2026-09-03 JST — Production R4 repair complete / Issue #226 canonical sync

The complete durable-decisions checkpoint immediately before #226 is preserved byte-for-byte at `docs/history/2026-09-03-pre-226-DECISIONS.md`. Decisions D-001 through D-107 remain authoritative unless explicitly superseded below.

## Authoritative additions

### D-108 — The reviewed Production R4 repair set has been applied successfully

Under a fresh explicit human approval limited to the Production R4 repair purpose, the three reviewed repository repairs were applied in order to Supabase Production `vxbrnvfhmzcxehuuzzum` through the migration mechanism.

Production migration ledger identities are:
1. `20260903111455 market_observation_trigger_schema_qualification`
2. `20260903111513 market_observation_service_role_contract`
3. `20260903111600 market_depth_r4_postgres_regex_repair`

Their repository source files remain the reviewed `20260903183500`, `20260903183530`, and `20260903183600` migrations merged by #218. Do not rewrite already-applied repository or Production ledger history merely to align timestamps.

### D-109 — Production R4 repair must prove market-data delta0 and zero runtime-proof residue

The repair is considered successful only because independent post-application SELECT verification proved:
- listings 127 -> 127;
- observations 149 -> 149;
- re-observed listings 22 -> 22;
- completed/sold 0 -> 0;
- target candidate0 and deterministic target observation0;
- runtime-proof series/variant/listing/observation residue0.

The reviewed runtime proof intentionally exercised the repaired writer under `service_role` and rolled its fixture writes back. This controlled proof is not candidate persistence.

### D-110 — The repaired Production callable contract is now the authoritative R4 function state

After repair:
- broken `{1,300}` source-ID regex guard occurrences = 0;
- explicit source-ID length 1..300 guard is present;
- PostgreSQL-safe ASCII allowlist `^[A-Za-z0-9:._-]+$` is present;
- trigger unqualified `market_listing_observations` relation occurrences = 0;
- qualified `public.market_listing_observations` relation is present;
- R4 is SECURITY INVOKER with empty search_path;
- PUBLIC/anon/authenticated do not have R4 EXECUTE;
- service_role has R4 EXECUTE and required observation-table CRUD.

Future R4 work must preserve these contracts.

### D-111 — Production repair authority is consumed and does not authorize candidate persistence

The approval that applied the three repair migrations is consumed/non-reusable.

A candidate write now requires a new boundary after read-only current-state rebind, collision checks, Scoreboard review, evidence-validity review, manifest/digest reconstruction, and durable resolution evidence. The eventual write approval must identify the exact single candidate. No automatic retry is allowed.

### D-112 — Supabase advisor findings outside the R4 repair are separate security/performance debt

Post-DDL Supabase advisors reported project-wide items including RLS-enabled/no-policy notices, GraphQL schema visibility from existing anon/authenticated SELECT grants, unindexed foreign keys, unused indexes, and a public-schema extension warning.

The repair migration did not broaden client table grants; pre-repair checks already showed existing client SELECT access on `market_listing_observations`. These advisor findings must not be silently remediated under the R4 repair authority. Any access-model or index change requires a separate scoped review because it can alter application behavior.

## Current durable state

- runtime main at repair: `b41382d3f8470edc68133a27d50892c016ea095f`
- #218 merged; #217 closed
- Production R4 repair: **APPLIED AND VERIFIED**
- Production market state: **127 / 149 / 22 / sold0**
- target candidate/observation: **absent**
- Production R4 callable contract: **repaired and verified**
- repair approval: **consumed/non-reusable**
- next true gate: fresh read-only R4 rebind, then separate one-candidate write approval

## Approval state

Consumed/non-reusable includes all previously recorded R1/R2/#201/#206/#208/#211/#214 authorities, the one-time review substitutions, and the Production R4 repair migration approval.

Not authorized now:
- R4 candidate write/retry
- provider refresh under consumed authority
- another history write by implication
- workflow dispatch/change
- Secrets/Variables changes
- F0/#142
- unrelated advisor remediation
- paid/destructive actions

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

Immediate pre-#226 decisions snapshot:

`docs/history/2026-09-03-pre-226-DECISIONS.md`

Do not create a recursive canonical sync merely to record #226's own docs-only merge.