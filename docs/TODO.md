# Gacha Lens Ordered TODO

Updated: 2026-09-03 JST — Production R4 repair complete / Issue #226 canonical sync

The complete ordered TODO checkpoint immediately before #226 is preserved byte-for-byte at `docs/history/2026-09-03-pre-226-TODO.md`.

Current umbrella: Issue #119 Data Scale.

## P0 — Canonical sync #226 — CURRENT

- [x] verify current main at repair application `b41382d3f8470edc68133a27d50892c016ea095f`
- [x] verify reviewed three-migration repair set from merged main
- [x] verify pre-repair Production 127 / 149 / 22 / sold0, candidate0, observation0, broken guard1, unqualified trigger1
- [x] obtain fresh human approval limited to Production R4 repair migrations
- [x] apply `market_observation_trigger_schema_qualification`
- [x] verify trigger unqualified relation0, qualified public relation present, SECURITY INVOKER, empty search_path
- [x] apply `market_observation_service_role_contract`
- [x] verify service_role observation CRUD true
- [x] apply `market_depth_r4_postgres_regex_repair`
- [x] verify migration runtime proof succeeds and leaves zero residue
- [x] verify ledger records `20260903111455`, `20260903111513`, `20260903111600`
- [x] verify post-repair market state still 127 / 149 / 22 / sold0
- [x] verify target candidate and deterministic observation remain absent
- [x] verify broken guard0, explicit length guard present, safe allowlist present
- [x] verify R4 SECURITY INVOKER / empty search_path / service_role EXECUTE only
- [x] run Supabase security/performance advisors without changing unrelated findings
- [x] create Issue #226
- [x] preserve pre-#226 canonical files byte-for-byte under `docs/history/`
- [x] update current four canonical checkpoints
- [ ] verify #226 diff contains only 4 current canonical + 4 history files
- [ ] verify history blob identities match pre-#226 blobs
- [ ] open docs-only PR closing #226
- [ ] exact-head Code Quality SUCCESS
- [ ] exact-head Vercel Preview READY
- [ ] unresolved GitHub/Vercel threads0 and main drift0
- [ ] record docs-only self-review as explicitly non-independent
- [ ] squash merge under docs-only safe policy
- [ ] verify #226 closed and normal Vercel Production READY

Do not create a recursive canonical sync merely to record #226's own docs-only merge.

## P1 — Fresh R4 candidate rebind — NEXT / READ-ONLY

Production R4 function is repaired. No candidate write is authorized.

Next safe work:
- [ ] re-fetch exact current main after #226 docs sync
- [ ] recompute live Data Scale Scoreboard
- [ ] confirm history/depth still justify R4
- [ ] re-read target variant/series/review state
- [ ] re-read exact fresh depth and existing listing ID set
- [ ] unresolved target issues0
- [ ] candidate listing/provider-native/public URL collisions0
- [ ] deterministic observation collision0
- [ ] assess whether historical R3 evidence remains valid; do not silently refresh provider data
- [ ] rebuild complete R4 manifest and digest against current main/Production
- [ ] save durable resolution evidence before any write request

## P2 — Separate exact one-candidate Production write approval — HOLD

Only after P1 evidence is complete:
- [ ] present exact candidate, manifest/digest, before-state and expected delta
- [ ] request fresh explicit one-candidate R4 write approval
- [ ] invoke exactly once only if approved
- [ ] no automatic retry; ambiguous commit -> SELECT-only resolver
- [ ] independently verify listing + observation + depth/global invariants
- [ ] force canonical sync after success or material failure

Production repair approval is consumed and cannot be reused for this write.

## P3 — Data Scale reassessment after successful R4 proof

After a successful candidate proof:
- [ ] fresh Scoreboard reassessment
- [ ] decide whether bounded depth scaling, lawful source breadth, non-price signals, or TRAFFIC -> CLICK -> REVENUE is highest leverage
- [ ] avoid endless infrastructure work once useful product-data thresholds are met

## Separate security/performance debt

Post-repair Supabase advisors reported project-wide existing debt. Do not change it under R4 authority.
- RLS enabled / no policy INFO notices
- anon/authenticated GraphQL schema visibility warnings from existing SELECT grants
- `pg_net` extension in public schema warning
- unindexed foreign-key INFO notices
- unused-index INFO notices

Any remediation must be a separate scoped task with behavior-impact review.

## Separate holds / debt

- #142/#137 F0 remains a separate approval boundary
- Foundation migration-order debt is resolved by #220/#221
- unused branch `tmp-should-not-create` remains unrelated; do not delete automatically without applicable cleanup policy/approval

## HOLD — explicit prohibitions now

- [ ] DO NOT persist the R4 candidate without fresh exact approval
- [ ] DO NOT retry #214
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

`docs/history/2026-09-03-pre-226-TODO.md`

Do not create a recursive canonical sync merely to record #226's own docs-only merge.