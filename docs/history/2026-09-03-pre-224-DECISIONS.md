# Gacha Lens Durable Decisions

Updated: 2026-09-03 JST — #221 Foundation CI repair complete / #218 R4 repository repair technically green / Issue #222 canonical sync

The complete durable-decisions checkpoint immediately before #222 is preserved byte-for-byte at `docs/history/2026-09-03-pre-222-DECISIONS.md`. Decisions D-001 through D-094 remain authoritative unless explicitly superseded below. That snapshot retains the full #214 fail-closed decisions and links to pre-#215 history.

## Authoritative additions

### D-095 — Foundation migration governance is an exact reviewed prefix, not a frozen total count

The original eight July Foundation migrations remain an immutable ordered baseline, but legitimate later migrations must not make Foundation CI fail merely because the total migration count increased.

The authoritative CI invariant is now:
1. at least the eight reviewed Foundation migrations exist;
2. the first eight ordered migration versions match the reviewed list exactly;
3. later reviewed migrations may follow;
4. the fixed Supabase CLI, disposable local stack, `db reset --local --no-seed`, guaranteed cleanup, and no-linked/no-push constraints remain unchanged.

PR #221 implemented and proved this contract; Issue #220 is complete.

### D-096 — Fresh migration chains must reproduce the server-side privilege contract required by SECURITY INVOKER runtime proofs

PR #218 exposed that `market_listing_observations` is created after the original Foundation service-role grants. Production already grants `service_role` the required table privileges, while a fresh migration chain did not.

A repository repair may therefore normalize the **server-only** fresh-chain contract to Production by granting `service_role` CRUD on `public.market_listing_observations`, provided:
- anon/authenticated/PUBLIC privileges are not widened;
- RLS remains enabled;
- the grant is covered by focused tests and disposable runtime proof.

This is contract alignment, not permission to weaken client access controls.

### D-097 — Trigger functions reachable from empty-search-path writers must be relation-qualified

R4 deliberately runs with empty `search_path`. Its insert fires the historical `sync_market_observation_links()` trigger function, whose body used an unqualified `market_listing_observations` relation.

The approved repository repair pattern is to rewrite exactly that one installed-function reference to `public.market_listing_observations`, require an exact occurrence count, preserve trigger semantics, avoid dropping/recreating the trigger, and make the trigger function itself search-path-independent.

Do not broadly rewrite historical migration files that are already applied.

### D-098 — The R4 SQL validator repair preserves the JavaScript contract exactly

The unsupported PostgreSQL repetition bound `{1,300}` is replaced in repository repair logic by two guards:
1. explicit length `1..300`;
2. PostgreSQL-safe allowed-character regex `^[A-Za-z0-9:._-]+$`.

This is a semantic repair, not a relaxation. Provider identity, URL, depth, catalog, collision, insert-only, sold/completed, and no-retry guards remain intact.

### D-099 — Callable Production-write logic requires runtime execution proof, not migration creation alone

The permanent validation standard from D-091 is now concretely satisfied for #218: a disposable fresh database must execute the repaired R4 function under `service_role`, assert exact successful result/listing/observation/depth behavior, deliberately roll the fixture back, prove zero residue, and exercise invalid length/character failures.

PR #218 exact head `80d1f5c59e73ee4ab59024ce7e3232713a4d2523` passed that proof through Foundation baseline run #112, along with final catalog, FK smoke, static tests, data-source tests, lint and build.

### D-100 — Green repository proof never implies Supabase Production repair authority

At the #222 checkpoint:
- #218 repository logic is technically green;
- current Production still contains exactly one broken R4 source-ID regex guard;
- candidate listing/observation remain absent;
- Production remains 127 listings / 149 observations / 22 re-observed / sold0.

Therefore repository verification does not authorize or imply:
- Production repair migration;
- current R4 function invocation;
- candidate persistence;
- provider refresh;
- retry of #214.

After an eligible #218 merge, Production repair remains a fresh explicit approval boundary. Candidate persistence remains a second separate fresh approval boundary after current-state rebind.

### D-101 — Independent review remains a real gate for high-risk callable schema/write-path changes

#218 remains Draft despite all technical checks being green because the change affects callable schema/write-path migration logic.

Lead self-review is useful evidence but is not independent Reviewer/Verifier approval. If an independent Reviewer + Verifier is unavailable, obtain a **fresh #218-specific human substitution** before merge. Do not reuse #208 or the one-time #180/#182 substitution.

Vercel Agent Code Review is a possible independent reviewer but can incur billed Agent usage. Triggering a paid reviewer/action requires explicit approval and must not be done silently.

### D-102 — Shared task branches should absorb main non-destructively when no overlap exists

When an already-pushed task branch falls behind main and the changes do not overlap, prefer a normal two-parent merge from the verified current main rather than rebasing/force-pushing shared history.

#218 used this pattern to incorporate #221 at merge commit `80d1f5c59e73ee4ab59024ce7e3232713a4d2523`; the PR diff remained the same five R4 repair/test files.

## Current durable state

- canonical main: `26a0db02fc842484d5a5cd55703deffdf3f8ba55`
- #221 merged; Foundation CI now supports later reviewed migrations while protecting the original exact prefix
- Vercel Production for current main: READY
- Production market state: **127 / 149 / 22 / sold0**
- Production R4 v1: installed but still runtime-defective/quarantined
- PR #218 exact head `80d1f5c...`: Code Quality SUCCESS, Foundation SUCCESS, Preview READY
- #218: Draft at independent review boundary
- #214 authority: consumed/non-reusable

## Approval state

Consumed/non-reusable includes all previously recorded R1/R2/#201/#206/#208/#211 approvals, **#214 R4 migration/write authority**, and the unrelated one-time #180/#182 review substitution.

Not authorized now:
- current Production R4 function invocation
- Production R4 repair migration
- R4 candidate write/retry
- provider calls under consumed authority
- another history write by implication
- workflow dispatch
- Secrets/Variables changes
- F0/#142
- paid reviewer/action without approval
- destructive actions

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

## Canonical history

Immediate pre-#222 decisions snapshot:

`docs/history/2026-09-03-pre-222-DECISIONS.md`

Do not create a recursive canonical sync merely to record #222's own docs-only merge.