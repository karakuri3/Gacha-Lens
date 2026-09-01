# Gacha Lens Ordered TODO

Updated: 2026-09-02 JST — post-PR #170 checkpoint

Work top-to-bottom unless newer verified evidence changes priority. Current umbrella program: Issue #119 Data Scale. Three active listings is a presentation threshold only.

## P0-A — Keep F0 recovery at the real approval boundary

- [x] Prove scheduled F0 run `33484450472` failed closed.
- [x] Verify Production transaction `not_started`, DB writes 0, deletes 0.
- [x] Trace blocker to month-precision rerelease canonical-year loss.
- [x] Create Issue #137 and repair PR #142.
- [x] Verify #142 full tests / lint / diff check / Vercel Preview pass.
- [ ] Obtain any still-required collection-semantics review/approval for #142.
- [ ] Obtain explicit approval before merging #142 because it changes code used by the scheduled Production-capable F0 lane.
- [ ] Do not manually rerun/dispatch F0 without separate `workflow_dispatch` approval.

## P0-B — Re-observation / exact-read foundation — complete code-only milestone

- [x] #150 / #128: merge safe dry-run re-observation engine.
- [x] Preserve append-only repeated observations with retry-safe identity.
- [x] Keep ordinary lifecycle to `active` / `sold_out`; never fabricate completed `sold`.
- [x] Require positive integer price and explicit availability.
- [x] Prevent stale observations from rolling current snapshot backward.
- [x] #153 / #135: merge exact persisted Rakuten/Yahoo provider rereads without keyword rediscovery.
- [x] Restrict credential-bearing requests to reviewed official host + exact path and reject redirects/custom destinations.
- [x] #169 / #166: fail closed on equal-timestamp conflicting price/status and invalid null/blank observation time.
- [x] Preserve equal-time unchanged same-key deterministic retry behavior.
- [ ] Do **not** execute live Production-connected provider reads or persist re-observations without separate required approval.

## P0-C — Multi-listing Depth Collector — complete code-only milestone

- [x] #156 / #129: merge clean current-main Depth Collector.
- [x] Preserve strict single-item matcher / set / ambiguity / target safety.
- [x] Support many genuinely distinct offers; no `3 listings = done` rule.
- [x] Deduplicate by durable listing identity, native provider identity, and canonical URL.
- [x] SHA-256-bind selection evidence and reject post-selection drift.
- [x] Enforce insert-only projected-write contract.
- [x] Keep budget 50 / max 200 as safety bounds, not product targets.
- [ ] Keep Production depth persistence/automatic activation separately approval-gated.

## P0-D — Measurement foundation — complete

- [x] #159 / #126: merge truthful read-only Data Scale Scoreboard.
- [x] Separate `available` / `unavailable` / `not_instrumented`.
- [x] Separate source capability state from measured-state availability.
- [x] Keep `sold` distinct from `sold_out`.
- [x] Exclude review-required stock/restock/social rows.
- [x] Keep outbound clicks provider+variant scoped.
- [x] Separate Production DB ingestion-run evidence from GitHub workflow-run evidence.
- [x] Re-read Production checkpoint: 10,241 series / 23,808 variants / 107 listings / 107 observations.
- [x] Confirm all 107 listings still had exactly one observation and completed `sold` remained 0 at the dated checkpoint.
- [ ] Use the Scoreboard after every approved rollout; never treat its merge as Production collection authorization.

## P0-E — Lawful source capability matrix — complete

- [x] #162 / #123: merge current lawful source capability matrix.
- [x] Keep Rakuten/Yahoo current active marketplace-programmatic sources.
- [x] Record Aucfan as `paid_access_required` and diligence-only before any payment/credential use.
- [x] Keep Mercari C2C `partnership_required`; no scraping.
- [x] Distinguish Mercari Shops seller scope from broad C2C market intelligence.
- [x] Keep X `paid_access_required`; recheck current prices/quotas/search before activation.
- [x] Keep eBay lower-priority planned with current Japan/historical limitations.
- [x] Keep Surugaya/Mandarake/AmiAmi automation permission/partnership-gated.
- [x] Record current GSC Wizard reporting path as unavailable due subscription/payment state, not zero traffic.

## P0-F — Production history/depth rollout planning — complete

Issue #165 / PR #170. Companion safety repair Issue #166 / PR #169.

- [x] Re-fetch `main`, Issue #119, Production counts and provider-health evidence.
- [x] Confirm dated baseline: 10,241 series / 23,808 variants / 107 listings / 107 observations / 0 re-observed.
- [x] Separate P3 breadth vs re-observation history vs depth collection.
- [x] Define R1 exact-provider read-only canary: 6 known listings, 3 Rakuten + 3 Yahoo, serial, <=18 HTTP attempts, 0 DB writes.
- [x] Define R2 Production re-observation persistence canary: 4 known listings, 2+2 provider split, bounded transaction, exact before/after and reread.
- [x] Define R3 depth read-only canary: 2 explicit variants, one Rakuten-first + one Yahoo-first, <=10 accepted total, <=6 planner requests / <=18 HTTP attempts, 0 DB writes.
- [x] Define R4 depth persistence canary: only frozen strict-safe R3 subset, <=10 listing+initial-observation insert pairs.
- [x] Define deterministic idempotency, transaction boundaries, post-write verification, rollback evidence and circuit breakers.
- [x] Define Scoreboard success/failure metrics and separate approval checklist.
- [x] Merge #169 safety repair and #170 plan.
- [x] Confirm Issue #166 and #165 closed completed.
- [x] Confirm #169 Production deployment `dpl_3vMxWwP89osNcjZdLKTbUBscQWHR` READY.
- [x] Confirm #170 Production deployment `dpl_DiuYPDViLe25wLjgeEXkpdeozgcg` READY.
- [x] Perform zero Production DB writes, live provider executions, workflow dispatches/schedule changes, Secrets/Variables changes, paid actions or destructive actions during planning.

## P0-G — Post-#170 canonical sync — current gate

Branch: `docs/canonical-sync-post-170`.

- [x] Refresh `docs/HANDOFF.md`.
- [x] Refresh `docs/STATUS.md`.
- [x] Refresh `docs/DECISIONS.md` with #169/#170 durable contracts and one-workstream review exception.
- [x] Refresh this ordered TODO.
- [ ] Create docs-only canonical-sync PR.
- [ ] Pass exact-head full tests / lint / diff check and Vercel Preview.
- [ ] Merge only if normal docs-only Auto-Merge/Production Release gates pass.
- [ ] Confirm normal Vercel Production deployment READY.

Completion rule: do not start R1 live execution until this canonical gate is merged and Production READY.

## P1 — R1 exact-provider read-only re-observation canary — next approval-bound phase

Do not execute automatically merely because planning is complete.

### Preparation allowed before approval

- [ ] Re-fetch current `main`, #119, open PRs, Production Scoreboard counts and provider-health evidence.
- [ ] Confirm the dated 107/107 baseline has not materially drifted.
- [ ] Select exactly 6 known listings that satisfy the merged exact-identity/review-safe/due contract.
- [ ] Freeze provider split: 3 Rakuten + 3 Yahoo.
- [ ] Verify current official endpoints/access rules have not materially changed.
- [ ] Verify normal requests <=6, retry <=3 only for reviewed retryable conditions, worst-case HTTP attempts <=18.
- [ ] Verify Rakuten spacing >=1200ms and Yahoo >=1000ms.
- [ ] Verify DB persistence path disabled and no keyword fallback.
- [ ] Present exact six-listing cohort and request budget to the user.

### Execution boundary

- [ ] Obtain explicit approval for the exact live Production-connected provider-read R1 run.
- [ ] Execute only the approved six-listing scope.
- [ ] Confirm DB writes 0 and failed checks do not advance `last_observed_at`.
- [ ] Record provider success/throttle/error/identity outcomes separately.
- [ ] Stop on redirect, credential destination drift, identity mismatch, unexpected lifecycle, payload leakage, material API-contract drift or budget overrun.
- [ ] Re-run Scoreboard read-only after the run if useful for evidence; R1 itself should not change DB counts.

R1 approval does **not** authorize R2.

## P2 — R2 tiny Production re-observation persistence — future separate approval

- [ ] After successful R1/newer reviewed evidence, re-read exact current state.
- [ ] Freeze 4 known listings: 2 Rakuten + 2 Yahoo.
- [ ] Verify each approved target's current observation count and expected delta.
- [ ] Freeze deterministic observation keys/IDs and protected identity values.
- [ ] Define bounded transaction and exact before/after count package.
- [ ] Define post-write reread and rollback evidence.
- [ ] Obtain explicit Production DB write approval for the exact cohort.
- [ ] If approved, expect +4 observations / +4 re-observed listings only when baseline assumptions still hold; listing count unchanged; false `sold` 0.
- [ ] Stop on any unknown partial state or verification mismatch.
- [ ] Re-run Scoreboard and measure actual history gain.

R2 approval does **not** authorize R3/R4 or schedule activation.

## P3 — R3/R4 depth rollout — future separately approved phases

### R3 read-only

- [ ] Freeze 2 explicit target variants, one Rakuten-first + one Yahoo-first.
- [ ] Max accepted safe offers: 5 each / 10 total.
- [ ] Max planner requests: 6; worst-case HTTP attempts: 18.
- [ ] Affiliate enrichment disabled for proof canary.
- [ ] Obtain explicit live provider/search approval before execution.
- [ ] Persist 0 rows in R3.

### R4 persistence

- [ ] Freeze only strict-safe R3 subset.
- [ ] <=10 total new listing+initial-observation pairs.
- [ ] Insert-only; no existing-row updates/deletes.
- [ ] Obtain separate explicit Production DB approval.
- [ ] Verify exact deltas and post-write state.
- [ ] Re-run Scoreboard and scale only from measured DATA gain.

## P4 — Licensed completed-sale / source expansion

- [ ] Maintain `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`.
- [ ] Recheck provider docs immediately before acting; prices/quotas/tiers/support change.
- [ ] Perform Aucfan commercial diligence before payment/credentials: exact fields, included markets, retention, display/derived-data rights, rates, sandbox/evaluation access and price.
- [ ] Build Mercari partnership dossier from catalog quality, matching safety, traffic, outbound purchase intent and desired data fields.
- [ ] Never scrape Mercari or Amazon.
- [ ] Evaluate each other lawful API/feed/partner source as an isolated task.

## P5 — Non-price signals

- [ ] Model stock/inventory observations as timestamped provenance-bearing evidence.
- [ ] Keep official restock/re-release events separate from inferred market unavailability.
- [ ] Add preorder/reservation demand only at exact verified scope.
- [ ] Add X/social only with authorized reviewed paid access and a bounded budget.
- [ ] Combine supply, demand, click/search and event-window evidence transparently.
- [ ] Never fabricate expectation/popularity from one weak proxy.

## P6 — Traffic / affiliate / GSC

- [ ] Restore/re-read authorized GSC reporting before current performance claims; connected GSC Wizard path was subscription-unavailable at #162 verification.
- [ ] Preserve root/series/variant sitemap separation.
- [ ] Measure query/page impressions and clicks before SEO pruning decisions.
- [ ] Measure outbound affiliate clicks only at supported attribution scope.
- [ ] Keep affiliate provenance strict.
- [ ] Recheck Amazon Associates and AdSense readiness as traffic/content quality rises.

## Hold — do not do without explicit approval/new evidence

- [ ] Do NOT merge #142 or manually dispatch F0 while its approval/review boundary remains.
- [ ] Do NOT execute R1 before exact live provider-read approval.
- [ ] Do NOT persist #150/#153/#156/#169 projected changes to Production without the exact approved R2/R4 action.
- [ ] Do NOT interpret #159/#162/#170 as Production execution authorization.
- [ ] Do NOT enable Kitan automatic writes.
- [ ] Do NOT enable Qualia automatic rollout.
- [ ] Do NOT rerun completed Kitan/Qualia/complete-set/P2/P1 canaries without new task-specific approval.
- [ ] Do NOT replace P3 V2 with Recall V5 merely for higher raw recall.
- [ ] Do NOT weaken the strict single-item matcher.
- [ ] Do NOT mix completed/sold evidence with active asking-price evidence.
- [ ] Do NOT scrape Mercari or Amazon.
- [ ] Do NOT misuse Mercari Shops seller credentials as C2C market-wide access.
- [ ] Do NOT automate public storefronts without reviewed API/feed/permission.
- [ ] Do NOT purchase/activate Aucfan, X, GSC paid connector access, or another paid/licensed source without explicit approval.
- [ ] Do NOT touch `supabase/.temp/cli-latest`.
- [ ] Do NOT re-enable `.github/workflows/gacha-ingestion.yml`.

## Forced handoff hygiene

After every major Production/recovery/security/release milestone:

- [ ] update `docs/STATUS.md`
- [ ] update `docs/HANDOFF.md`
- [ ] update `docs/DECISIONS.md` when durable rules changed
- [ ] update this TODO order
- [ ] use a docs-only PR
- [ ] merge the canonical sync before starting the next major implementation phase

Do not wait for chat-limit warnings and do not bypass this gate merely because the user says 「続けて」.
