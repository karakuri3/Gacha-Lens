# Gacha Lens Durable Decisions

Updated: 2026-09-08 JST — Fair Use restriction active; Production freeze active; repository-only prerequisite validation complete

The complete historical decision record remains preserved in Git history and the pre-final-cutover history files. Decisions D-001 through D-141 remain authoritative unless explicitly superseded below. This file focuses the active canonical state and new decisions needed to resume safely.

## Existing durable state retained

- Cloudflare is the Production runtime and authoritative DNS.
- Vercel remains registrar and a non-live rollback artifact only; routine Git builds are disabled.
- `www` canonicalization is a Cloudflare edge redirect.
- Stage 5 scoped Supabase hardening remains applied and durable.
- Company infrastructure migration is complete and must not be restarted.
- Workers Logs remain disabled; other metrics must not be mislabeled as Worker log-stream review.
- direct main pushes remain prohibited.
- consumed prior Production/provider authority is non-reusable.
- `.github/workflows/gacha-ingestion.yml` remains disabled.
- `supabase/.temp/cli-latest` must never be touched.
- automatic RPC retry remains prohibited.
- strict market matching/identity/safety semantics must not be weakened for coverage.
- completed sold evidence remains separate from asking-price evidence.
- Mercari/Amazon scraping remains prohibited.

## Previously accepted P0 runtime decisions retained

PR #249 is the accepted shared-edge reuse implementation. PR #251 is the accepted unique-path cold-read implementation.

Their released behavior remains authoritative:
- bounded Cloudflare shared cache for selected public discovery/sitemap surfaces;
- query/search/pagination/auth/cookie/Next-internal exclusions remain outside shared-document caching;
- known error HTML is not promoted to shared cache;
- detail/related signal reads are scoped to relevant variant identities while preserving required series-level set safety semantics;
- service-role credentials remain environment-only;
- historical cumulative Egress must be interpreted separately from post-fix burn rate;
- internal operating-margin target remains approximately `<=0.12 GB/day` organization-wide until re-evaluated from fresh-cycle evidence.

## New authoritative decisions

### D-142 — 2026-09-08 Fair Use restriction is historical-cycle enforcement, not automatic evidence of mitigation regression

Provider evidence now shows:
- Free organization state: **All services are restricted**;
- reason: **Egress Exceeded**;
- cycle: 2026-08-12 -> 2026-09-12;
- organization uncached Egress: **25.242 / 5 GB**;
- Gacha project Egress: **23.003 GB**;
- Beach project Egress: **0.444 GB**.

Before enforcement, post-mitigation burn was about **0.0104 GB/day**, far below the internal operating target, and the known sitemap fingerprint remained nearly flat.

Therefore the best-supported interpretation is that the active restriction is delayed enforcement of historical current-cycle usage accumulated before/around the mitigation, not proof that #249/#251 failed.

Consequences:
- do not launch a speculative new Production runtime rewrite solely because 402/restriction appeared;
- do not buy Pro merely to erase historical cycle usage;
- do not use project/org transfer as active-restriction quota evasion;
- wait for clean post-reset evidence before changing the technical conclusion.

### D-143 — #238 is now a Production freeze, not merely a partial-risk note

Non-Production work remains allowed, but Production-changing work is frozen while the organization is restricted.

Allowed:
- isolated branches;
- local/disposable DB tests;
- Preview validation that does not mutate Production;
- docs/review/planning/static analysis;
- low-impact read-only evidence collection.

Frozen:
- Production runtime merges to main;
- Production DB/schema/data/migration-history changes;
- DNS/Auth/write/admin changes;
- Secrets/Variables changes;
- paid plan/billing changes without explicit approval;
- provider/load-generating experiments;
- unrelated Production releases intended to bypass restriction.

### D-144 — shared Supabase organization is an unacceptable long-term failure domain for Gacha + Beach

Project-filtered evidence shows Beach is low-egress but was affected by Gacha's shared organization quota.

After the restriction clears and a fresh complete backup is green, the existing Beach Supabase project should be transferred to a dedicated Free organization. This is a future Project Transfer, not creation of a replacement database and not a quota-evasion action during restriction.

### D-145 — #273 is the canonical repository repair for the fresh migration-chain `forecast_snapshots` gap

Draft PR #273 exact head:
`42c8f9934a92cda0be5fd58f2dccc7d4db17299c`

Accepted repository evidence:
- Code Quality SUCCESS;
- vinext SUCCESS;
- Foundation SUCCESS;
- downstream combined empty-DB proof via #279 SUCCESS.

The repair intentionally places `20260904152325_restore_forecast_snapshots_baseline.sql` immediately before the already-existing `20260904152326_final_revoke_server_only_api_grants.sql` so fresh replay can reach the hardening migration.

Durable constraints:
- already-applied historical migration files must not be edited;
- #273 repository proof does **not** authorize Production DDL or migration-history mutation;
- future Production reconciliation must begin with fresh live catalog/history parity evidence;
- blind Production `db push` is not an approved reconciliation strategy;
- independent review is still required before release/reconciliation.

### D-146 — #269 is the canonical durable one-time affiliate provider-read authorization boundary

Draft #269 exact head:
`574a9a4c10c3fd6cd275229c95c9b3adef8de84f`

Durable contract:
- exact one-time `(head_sha, batch_digest)` claim;
- no plaintext approval persistence;
- replay/reopen/reset blocked;
- 1..10 targets, exactly two logical phases per target, max three attempts per phase;
- serial attempt reservation;
- discovery must succeed before affiliate enrichment;
- whole-batch fail-close after terminal, ambiguous, or exhausted third retryable attempt;
- private service-role-only ledger using `SECURITY INVOKER` + empty `search_path`;
- terminal reasons are bound to durable attempt evidence, including `retry_exhausted`;
- no successful approval can become reusable.

Current accepted repository proof:
- exact-head Code Quality `34195356451`: SUCCESS;
- exact-head vinext `34195356549`: SUCCESS;
- #279 disposable Foundation `34195410881`: SUCCESS including cleanup;
- 22 migrations from empty DB;
- Foundation 14/14 PASS, skip0;
- data-source/ledger DB 11/11 PASS, skip0;
- final catalog 0 findings;
- Next build PASS.

This does not authorize a live provider executor, affiliate persistence, Production migration, or provider call.

### D-147 — self-review cannot satisfy the independent Reviewer gate

Strengthened self-review may find and fix defects, but must never be represented as independent approval.

For #269 and #273:
- independent Reviewer packets are fixed in PR comments without moving the exact heads;
- GitHub Copilot code review has previously been treated in this repository as a billable AI-credit boundary;
- do not request a billable reviewer without explicit owner approval;
- do not weaken/remove the independent review requirement merely to unblock merge.

### D-148 — preserve proven exact heads instead of continuing low-value edits

After exact-head CI + disposable DB proof are green, do not add nonessential code/docs to the proven implementation branch because doing so invalidates the exact-head evidence and forces revalidation.

Canonical documentation updates belong in docs-only Draft #250, while #273/#269 heads should remain stable pending independent review and post-freeze release gates.

### D-149 — post-reset P0 closure order is mandatory

After the **2026-09-12 billing reset** and any short provider-side restriction-clear delay:
1. confirm restriction actually clears and no 402 remains;
2. read fresh-cycle **Gacha-filtered** Egress;
3. prove low Free-plan-compatible burn with safety margin;
4. perform minimal public/runtime smoke without load-heavy diagnostics;
5. confirm no recurrence of the former amplification;
6. synchronize #219/#238/#250 canonical state.

This clears only the P0/freeze gate. Production release authority has an additional policy gate in D-150.

### D-150 — #262 must be resolved explicitly before standing Cloudflare auto-release authority can be used

Issue #262 documents a real standing-policy conflict:
- Cloudflare is now Production and routine Vercel Git builds are intentionally disabled;
- `docs/PRODUCTION_RELEASE_POLICY.md` still requires exact-head Vercel Preview and describes Vercel Production deployment as the standing release path.

The two conditions cannot be silently reconciled by interpretation.

Therefore, after #219/#238 clear and before relying on standing auto-release authority for a normal Cloudflare Production merge:
1. review the current Cloudflare cutover and rollback evidence;
2. obtain the applicable explicit policy-change approval for the replacement release gate;
3. define the exact Cloudflare Preview/version + repository CI + required runtime/cache/security evidence that replaces obsolete Vercel-hosting assumptions;
4. update `PRODUCTION_RELEASE_POLICY.md` and linked Agent/auto-merge docs consistently;
5. add automated/docs checks preventing hosting-authority drift.

Hard consequences:
- Cloudflare CI/Preview success is not implicit permission to bypass the stale standing policy;
- do not re-enable Vercel builds merely to satisfy obsolete wording;
- #262 is a mandatory governance gate even after the Supabase freeze clears;
- #273/#269 Production releases/reconciliation remain separately approved changes after #262.

## Current durable state

- infrastructure migration: **COMPLETE**
- Production runtime: Cloudflare
- current Production main: `83b0b36e5d0172f3ea6964206edad6480a13b4bb`
- #249/#251: **MERGED / PRODUCTION PASS**
- Supabase Fair Use restriction: **ACTIVE as of 2026-09-08**
- #219: **OPEN**
- #238: **OPEN / PRODUCTION FREEZE ACTIVE**
- #262: **OPEN / RELEASE-GOVERNANCE BLOCKER**
- #250: **DRAFT canonical docs sync**
- #273: **DRAFT / repository proof PASS / independent review pending**
- #269: **DRAFT / repository proof PASS / independent review pending**
- provider execution: **NOT AUTHORIZED**
- Production DB/history reconciliation: **NOT AUTHORIZED**
- paid Supabase requirement: **NOT ESTABLISHED**

## Hard durable constraints

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no automatic RPC retry
- no direct main push
- no workflow dispatch/change by implication
- no Secrets/Variables change by implication
- no Production DB/schema/data/history mutation by implication
- no provider call/write by implication
- no paid/destructive action without applicable approval
