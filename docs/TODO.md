# Gacha Lens Ordered TODO

Updated: 2026-09-02 JST — post-PR #162 checkpoint

Work top-to-bottom unless newer verified evidence changes priority. Current umbrella program: Issue #119 Data Scale. Three active listings is a presentation threshold only.

## P0-A — Keep F0 recovery at the real approval boundary

- [x] Prove scheduled F0 run `33484450472` failed closed.
- [x] Verify Production transaction `not_started`, DB writes 0, deletes 0.
- [x] Trace blocker to month-precision rerelease canonical-year loss.
- [x] Create Issue #137 and repair PR #142.
- [x] Verify #142 full tests / lint / diff check / Vercel Preview pass.
- [ ] Obtain any still-required independent collection-semantics review for #142.
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
- [ ] Do **not** execute live Production-connected provider reads or persist re-observations without the separate required approval.

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
- [x] Re-read Production at the checkpoint: 10,241 series / 23,808 variants / 107 listings / 107 observations.
- [x] Confirm all 107 listings still had exactly one observation and completed `sold` remained 0.
- [x] Confirm clicks 0 / 21 / 38 at 24h / 7d / 30d at that validation time.
- [ ] Use the Scoreboard after every approved rollout; never treat its merge as Production collection authorization.

## P0-E — Lawful source capability matrix — complete

Issue #123 / clean replacement PR #162; old Draft #145 superseded/closed.

- [x] Revalidate old #145 against current official/provider documentation.
- [x] Clean-replace from current main instead of merging stale history.
- [x] Preserve durable source states: `active`, `planned`, `partnership_required`, `paid_access_required`, `manual_only`, `unavailable`.
- [x] Keep Rakuten/Yahoo as current active marketplace-programmatic sources.
- [x] Record Aucfan as `paid_access_required` and commercial/data-rights diligence only.
- [x] Keep Mercari C2C `partnership_required`; no scraping.
- [x] Distinguish Mercari Shops seller-scoped Public API from broad C2C market intelligence; broad market capability is unavailable through that seller scope.
- [x] Keep X `paid_access_required`; current price/quota/search facts are dated and must be rechecked before activation.
- [x] Record eBay Browse as lower-priority planned with current Japan/historical limitations.
- [x] Keep Surugaya/Mandarake/AmiAmi automation partnership/permission-gated.
- [x] Record current GSC Wizard reporting path as unavailable due subscription/payment state, not zero traffic.
- [x] Add reusable source-adapter identity/provenance/fail-closed contract.
- [x] Keep all paid/API/credential/scraping/contract/Production activation outside the PR.
- [x] Pass exact-head CI, Preview, one-file full-diff/source-claim review.
- [x] Merge #162 as `94ea0d8aac95e76e657326bc6c6df515f8603f22`.
- [x] Confirm Production `dpl_Bp4p6evfsMsqideLzDg39uPmdzqA` READY.
- [x] Confirm Issue #123 closed and old #145 closed superseded.

## P0-F — Post-#162 canonical sync — current gate

Issue #163.

- [x] Confirm #162 merged and Production READY.
- [x] Confirm #123 completed and old #145 superseded/closed.
- [x] Refresh `docs/HANDOFF.md`.
- [x] Refresh `docs/STATUS.md`.
- [x] Refresh `docs/DECISIONS.md` with durable source-scope/access decisions.
- [x] Refresh this ordered TODO.

Completion rule: when the Issue #163 docs-only PR is exact-head green, merged to `main`, and its normal Vercel Production deployment is READY, the canonical-sync gate is complete. Until then, do not start the next major phase.

## P0-G — Production history/depth rollout plan — next safe phase

No dedicated rollout-planning Issue existed at the #162 checkpoint. After P0-F completes:

- [ ] Re-fetch `main`, Issue #119, open PRs, Production counts, and current provider-health evidence.
- [ ] Confirm no newer dedicated rollout Issue already exists.
- [ ] Create one bounded child Issue under #119 for **read-only Production history/depth rollout planning**.
- [ ] Reconcile #150 re-observation, #153 exact provider reads, #156 Depth Collector, #159 Scoreboard, and #162 source priorities.
- [ ] Define lane responsibilities: P3 breadth seeding vs depth collection vs re-observation.
- [ ] Re-read current Production listing/observation depth and provider split before sizing any canary.
- [ ] Quantify current provider request health/rate-limit evidence read-only where available.
- [ ] Define proposed first canary targets, candidate counts, request budgets, pacing, timeouts, retry limits and stop conditions — proposal only.
- [ ] Define deterministic idempotency, transaction boundaries and post-write verification required before any write-capable run.
- [ ] Define exact rollback/failure behavior for identity mismatch, stale evidence, throttling, partial writes and verification failure.
- [ ] Define Scoreboard before/after success metrics: new observations, listings with 2+ observations, depth buckets, provider errors, no false `sold`.
- [ ] Produce an explicit approval checklist separating:
  - live Production-connected provider read canary
  - Production DB observation/listing persistence canary
  - workflow/schedule activation or changes
  - `workflow_dispatch`
  - Secrets/Variables changes
  - paid/licensed access
- [ ] Stop at the approval boundary. The planning task itself must perform **zero** Production DB writes, live approval-bound provider execution, workflow dispatch, schedule changes, Secrets/Variables changes, or paid actions.

## P1 — Approved Production history/depth rollout — approval-bound future phase

Do not start automatically merely because P0-G planning is complete.

- [ ] Obtain the required explicit approval for the exact bounded Production action being proposed.
- [ ] Verify live counts/provider state have not materially drifted since planning.
- [ ] Execute only the approved canary scope.
- [ ] Verify transaction/idempotency/post-write invariants.
- [ ] Stop immediately on defined fail-closed conditions.
- [ ] Re-run Scoreboard read-only and compare actual DATA gain.
- [ ] Require a separate decision before scaling cadence/schedule/budget.

## P2 — Licensed completed-sale / source expansion

- [ ] Maintain the canonical matrix in `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`.
- [ ] Recheck provider documentation immediately before acting; prices/quotas/tiers/support change.
- [ ] Perform Aucfan commercial diligence before any payment or credentials: exact fields, included markets, retention, display/derived-data rights, rates, sandbox/evaluation access and price.
- [ ] Build Mercari partnership dossier from catalog quality, matching safety, traffic, outbound purchase intent and exact desired data fields.
- [ ] Never scrape Mercari or Amazon.
- [ ] Evaluate each other lawful API/feed/partner source as an isolated task.

## P3 — Non-price signals

- [ ] Model stock/inventory observations as timestamped provenance-bearing evidence.
- [ ] Keep official restock/re-release events separate from inferred market unavailability.
- [ ] Add preorder/reservation demand only at exact verified scope.
- [ ] Add X/social only with authorized reviewed paid access and a bounded budget.
- [ ] Combine supply, demand, click/search, and event-window evidence transparently.
- [ ] Never fabricate expectation/popularity from one weak proxy.

## P4 — Traffic / affiliate / GSC

- [ ] Restore/re-read authorized GSC reporting before current performance claims; current GSC Wizard path was subscription-unavailable at #162 verification.
- [ ] Preserve root/series/variant sitemap separation.
- [ ] Measure query/page impressions and clicks before SEO pruning decisions.
- [ ] Measure outbound affiliate clicks only at supported attribution scope.
- [ ] Keep affiliate provenance strict.
- [ ] Recheck Amazon Associates and AdSense readiness only as traffic/content quality rises.

## Hold — do not do without explicit approval/new evidence

- [ ] Do NOT merge #142 or manually dispatch F0 while its approval/review boundary remains.
- [ ] Do NOT run #153 against Production credentials/data without the separate approved action.
- [ ] Do NOT persist #150/#153/#156 projected observation/listing changes to Production without approval.
- [ ] Do NOT interpret #159 or #162 as Production collection authorization.
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
