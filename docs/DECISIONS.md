# Gacha Lens Durable Decisions

Updated: 2026-09-08 19:06 JST — Fair Use restriction + public-read P0 active; scheduled writes explicitly disabled; #282 validated but unreleased

The complete historical decision record remains preserved in Git history and the pre-final-cutover history files. Decisions D-001 through D-152 remain authoritative unless explicitly superseded below. This file focuses the active canonical state and the new decisions required to resume safely.

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

## Active durable decisions carried forward

### D-142 — 2026-09-08 Fair Use restriction is historical-cycle enforcement, not automatic evidence of mitigation regression

Provider evidence shows:
- Free organization state: **All services are restricted**;
- reason: **Egress Exceeded**;
- cycle: 2026-08-12 -> 2026-09-12;
- organization uncached Egress: **25.242 / 5 GB**;
- Gacha project Egress: **23.003 GB**;
- Beach project Egress: **0.444 GB**.

Before enforcement, post-mitigation burn was about **0.0104 GB/day**, far below the internal operating target, and the known sitemap fingerprint remained nearly flat.

Therefore the best-supported interpretation is delayed enforcement of historical current-cycle usage, not proof #249/#251 failed.

Consequences:
- do not launch a speculative new Production runtime rewrite solely because 402/restriction appeared;
- do not buy Pro merely to erase historical cycle usage;
- do not use project/org transfer as active-restriction quota evasion;
- wait for clean post-reset evidence before changing the technical conclusion.

### D-143 — #238 is a Production freeze while restriction remains active

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
- Secrets/Variables changes without explicit applicable approval;
- paid plan/billing changes without explicit approval;
- provider/load-generating experiments;
- unrelated Production releases intended to bypass restriction.

### D-144 — shared Supabase organization is an unacceptable long-term Gacha + Beach failure domain

After restriction clears and a fresh complete backup is green, transfer the existing Beach Supabase project to a dedicated Free organization. This is future failure-domain isolation, not a replacement database and not active-restriction quota evasion.

### D-145 — #273 is the canonical repository repair for the fresh migration-chain `forecast_snapshots` gap

Draft #273 exact head: `42c8f9934a92cda0be5fd58f2dccc7d4db17299c`.

Accepted repository evidence:
- Code Quality SUCCESS;
- vinext SUCCESS;
- Foundation SUCCESS;
- downstream combined empty-DB proof via #279 SUCCESS.

Durable constraints:
- already-applied historical migration files must not be edited;
- repository proof does not authorize Production DDL or migration-history mutation;
- future Production reconciliation begins with fresh live catalog/history parity evidence;
- blind Production `db push` is not approved;
- independent review remains required.

### D-146 — #269 is the canonical durable one-time affiliate provider-read authorization boundary

Draft #269 exact head: `574a9a4c10c3fd6cd275229c95c9b3adef8de84f`.

Durable contract:
- exact one-time `(head_sha, batch_digest)` claim;
- no plaintext approval persistence;
- replay/reopen/reset blocked;
- 1..10 targets, exactly two logical phases per target, max three attempts per phase;
- serial attempt reservation;
- discovery before affiliate enrichment;
- whole-batch fail-close after terminal, ambiguous, or exhausted third retryable attempt;
- private service-role-only ledger using `SECURITY INVOKER` + empty `search_path`;
- terminal reasons bound to durable attempt evidence, including `retry_exhausted`;
- no successful approval can become reusable.

Accepted repository proof:
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

Strengthened self-review may find/fix defects but must never be represented as independent approval.

For #265/#273/#269/#282:
- Reviewer/Verifier packets may be prepared without moving proven heads;
- GitHub Copilot code review has historically been treated as a billable AI-credit boundary;
- do not request a billable reviewer without explicit owner approval;
- do not weaken/remove the independent review requirement merely to unblock merge.

### D-148 — preserve proven exact heads instead of continuing low-value edits

After exact-head CI/Preview/disposable proof is green, avoid nonessential changes to the proven implementation branch because every edit invalidates exact-head evidence. Canonical documentation changes belong in docs-only Draft #250.

### D-149 — post-reset P0 closure order is mandatory

After the **2026-09-12 billing reset** and any short provider clear delay:
1. confirm restriction actually clears and no 402 remains;
2. read fresh-cycle **Gacha-filtered** Egress;
3. prove low Free-plan-compatible burn with safety margin;
4. perform minimal public/runtime smoke without load-heavy diagnostics;
5. confirm no recurrence of the former amplification;
6. synchronize #219/#238/#250 canonical state.

This clears only the P0/freeze gate. Production release authority still has additional governance/review gates.

### D-150 — #262 must be resolved explicitly before standing Cloudflare auto-release authority can be used

Current main still carries Vercel-specific standing release semantics while Cloudflare is Production and routine Vercel builds are intentionally disabled.

Hard consequences:
- Cloudflare CI/Preview success is not implicit permission to bypass stale standing policy;
- do not re-enable Vercel builds merely to satisfy obsolete wording;
- #262 remains a mandatory governance gate after the Supabase freeze clears.

### D-151 — authorized Draft #265 is the canonical implementation of #262 Cloudflare policy alignment

Draft #265:
- exact head `c8d671abc9be785f3c6c34a3ff6ceef858e07d3a`;
- seven active policy/test files aligned;
- PR Code Quality `34045587975`: SUCCESS;
- strengthened self-review + Reviewer/Verifier packet present;
- independent result **PENDING**;
- still Draft and not authoritative on main.

The recorded authorization is narrow: it authorizes policy-alignment work, not bypass of #219/#238, self-merge, manual Cloudflare deploy/promotion, Production DB/data/schema, Secrets/Variables, workflow dispatch, paid/destructive actions, or auth-boundary changes.

### D-152 — post-freeze release train is ordered, not opportunistic

After D-149 clearance, default sequence remains governance (#265/#262) -> CI proof authority (#258) -> migration reproducibility (#273) -> user-value routing (#253) -> official-ingestion reliability (#261) -> fresh business scorecard / `#264 -> #267 -> #269` if monetization coverage still dominates -> R5 Data Scale HOLD unless reprioritized by fresh evidence.

New incident decisions below modify what must happen **before** that sequence begins.

## New decisions — 2026-09-08 incident delta

### D-153 — quota recovery must not automatically wake scheduled Production write lanes

The active 402 restriction was unintentionally acting as a stop barrier for two already-enabled scheduled Production lanes. This is not acceptable because `restriction cleared` does **not** imply `Production freeze cleared`.

With explicit owner approval, at **2026-09-08 16:52 JST**:
- `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`;
- `OFFICIAL_BOUNDED_AUTO_ENABLED=false`.

Repository-wide audit also confirms:
- legacy `.github/workflows/gacha-ingestion.yml` remains manually Disabled;
- the other market automatic lane has its top-level gate false;
- Kitan automatic remains false-by-default/no-op.

Durable consequence:
- both newly-disabled variables remain false even if 402 disappears;
- they may be re-enabled only after #238 is formally closed **and** the corresponding lane receives a new explicit authorization;
- the #280 disable approval is consumed and cannot be reused as re-enable authority.

### D-154 — absence of a GitHub scheduled run is not successful no-op evidence

P3's first post-disable natural schedule opportunity was **2026-09-08 18:17 JST**. As of **19:06 JST**, no new schedule-event run was present in the latest repository Actions collection.

This must be recorded as **`natural run not yet observed`**, not as no-op PASS. GitHub schedules may be delayed/dropped. No manual dispatch should be used merely to manufacture evidence while the freeze is active.

Official lane's first post-disable natural opportunity is **2026-09-09 11:27 JST**.

#280 remains open until actual natural no-op/write0 evidence is captured and canonical state is synchronized.

### D-155 — the Supabase restriction has become a real public-read P0, and outer HTTP 200 is part of the incident

Production core data pages can render the branded failure state `商品情報を取得できません` during the restriction. Fresh external read-only scanning still observed `https://gachalens.com` root as HTTP **200** while extracting only a tiny degraded shell.

Therefore:
- this is not merely ingestion freshness degradation;
- crawlers/intermediaries can misclassify an outage document as healthy content;
- preventing healthy-200 classification is a legitimate containment objective;
- containment must never fabricate product/market/stock/restock data or add aggressive Supabase retries.

Issue #281 is the canonical P0 incident record.

### D-156 — Draft #282 is the canonical validated containment, but it is not an automatic post-reset release

Draft #282 exact head: `68465cfa344fda65c6968e6bdb1af11d6abbd983`.

Accepted engineering evidence:
- PR Code Quality `34212560491`: SUCCESS;
- Cloudflare vinext POC `34212560379`: SUCCESS;
- exact-head Cloudflare Commit Preview deployment SUCCESS;
- normal external scanner could not obtain the exact Preview root during the outage (`pagesScanned=0`);
- rejected intermediate head `9d9558fd...` had exposed a UA split, proving the final stream-drain step addressed a real timing gap;
- unresolved review threads 0 at latest check;
- independent Reviewer/Verifier packet posted;
- independent result **PENDING**.

Durable design constraints:
- `DataSourceError` is tracked in request-scoped `AsyncLocalStorage`;
- only explicitly allowlisted public data GET HTML routes drain one clone of the already-produced vinext response inside the tracked context;
- only tracked outer-200 `text/html` responses are remapped to temporary 503/no-store semantics;
- legal/editorial/admin/client/API surfaces stay outside the stream-drain allowlist;
- no extra Supabase/provider request or retry is introduced;
- buffering cost is limited to the public data HTML allowlist and should be treated as incident containment, not a final streaming optimization.

Release consequence:
- #282 remains Draft under #238;
- it is **containment, not data recovery**;
- after the 2026-09-12 reset, first recheck #281: if normal data and healthy HTTP semantics return, do **not** ship #282 merely because it is green; preserve/close it after canonical incident sync;
- if outage/outer-200 misclassification persists, #282 stays P0 but still requires genuine independent review plus explicit applicable Production release/emergency authority.

### D-157 — incident reassessment precedes the existing post-freeze release train

Before D-152's governance-first release sequence starts after reset:
1. reassess #281/public data service and HTTP semantics;
2. decide whether #282 is still necessary;
3. complete D-149 P0 closure evidence;
4. keep #280 variables false throughout closure;
5. only after #238 formally closes may D-152 begin.

Re-enabling scheduled automatic lanes is **not** part of D-152 and remains separate lane-specific authorization work.

## Current durable state

- infrastructure migration: **COMPLETE**
- Production runtime: Cloudflare
- current Production main: `83b0b36e5d0172f3ea6964206edad6480a13b4bb`
- #249/#251: **MERGED / PRODUCTION PASS**
- Supabase Fair Use restriction: **ACTIVE as of 2026-09-08**
- #219: **OPEN**
- #238: **OPEN / PRODUCTION FREEZE ACTIVE**
- #280: **OPEN / P3 + Official enable variables FALSE / natural evidence pending**
- #281: **OPEN / PUBLIC-READ P0 ACTIVE**
- #282: **DRAFT / ENGINEERING PASS / INDEPENDENT REVIEW PENDING / PRODUCTION RELEASE FROZEN**
- #262: **OPEN / authorized replacement implemented in Draft #265 / independent review pending**
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
- #280 disable authority is consumed; do not re-enable by implication
- no Production DB/schema/data/history mutation by implication
- no provider call/write by implication
- no paid/destructive action without applicable approval
- do not scrape Mercari or Amazon
