# Gacha Lens Ordered TODO

Updated: 2026-09-01 JST — post-PR #153 checkpoint

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
- [ ] After an approved merge, observe the normal Vercel release and later verify the next normal scheduled run when tooling/policy permits.

## P0-B — Re-observation foundation — complete code-only milestone

### #150 / #128

- [x] Merge safe dry-run re-observation engine.
- [x] Support append-only repeated observations with retry-safe identity.
- [x] Preserve only ordinary `active` / `sold_out` lifecycle states; never fabricate completed `sold`.
- [x] Require positive integer price and explicit availability.
- [x] Prevent stale observations from rolling current snapshot backward.
- [x] Keep Production persistence unapproved.

### #153 / #135

- [x] Re-fetch old #136 and clean-replace it from current main.
- [x] Port only exact provider adapter / dry-run runner / docs / tests.
- [x] Preserve exact persisted Rakuten/Yahoo item identity reads; no keyword rediscovery.
- [x] Preserve bounded retries/timeouts and serial provider pacing.
- [x] Reject arbitrary HTTPS custom endpoints before credentials/identifiers can reach fetch.
- [x] Restrict credential-bearing requests to reviewed official HTTPS host + exact path destinations.
- [x] Reject HTTP, embedded URL credentials, pre-supplied query strings/fragments, and redirects.
- [x] Validate durable listing ID before provider request.
- [x] Keep strict availability/price normalization and sanitized diagnostics.
- [x] Pass exact-head full tests / lint / diff check / Vercel Preview / independent review.
- [x] Merge #153 as `af5356148cb75975f13383d095e01a805e7120db`.
- [x] Confirm normal Vercel Production deployment `dpl_9srsV4znx24SK7mmC9AX2Vkds7Pw` reached `READY`.
- [x] Confirm Issue #135 closed and old Draft #136 closed superseded.
- [ ] Do **not** execute live Production-connected provider reads or persist re-observations without the separate required approval.

## P0-C — Post-#153 canonical sync

Issue #154.

- [x] Confirm #153 merged and Production READY.
- [x] Confirm #135 completed and old #136 superseded/closed.
- [x] Refresh `docs/HANDOFF.md`.
- [x] Refresh `docs/STATUS.md`.
- [x] Refresh `docs/DECISIONS.md` with implemented provider credential/destination and execution-approval boundaries.
- [x] Refresh this ordered TODO.

Completion rule: when the Issue #154 docs-only PR containing this checkpoint is exact-head green, merged to `main`, and its normal Vercel Production deployment is READY, the canonical-sync gate is complete. Until then, do not begin the next major implementation.

## P0-D — Settle the multi-listing Depth Collector (Issue #129 / old PR #132) — next implementation

- [ ] Re-fetch current `main`, Issue #129, and old Draft PR #132 after P0-C completes.
- [ ] Inspect the exact old-branch diff against current main; do not blindly merge stale history.
- [ ] Prefer a clean current-main replacement when that gives a smaller, reviewable diff.
- [ ] Confirm many legitimate distinct offers for one target variant remain retained under the operational budget.
- [ ] Confirm dedupe uses durable listing identity / provider item ID / canonical URL, not price/title.
- [ ] Preserve strict single-item matcher, exact target variant/series scope, and affiliate provenance rules.
- [ ] Preserve same-provider distinct storefront and cross-provider legitimate offers when identity is genuinely distinct.
- [ ] Keep operational limits as safety/request budgets, never collection-completion targets.
- [ ] Keep the lane code-only/dry-run-first; do not modify existing P1/P2/P3 Production lanes merely to integrate it.
- [ ] Run exact-head full tests / lint / diff check / Vercel Preview.
- [ ] Complete independent collection-semantics review with no blocking/major finding.
- [ ] Merge only if Auto-Merge + Standing Release gates pass.
- [ ] Close old Draft #132 as superseded if a clean replacement is used.
- [ ] Keep Production persistence/automatic activation as a separate approval-gated rollout.

## P0-E — Settle the Data Scale Scoreboard (Issue #126 / old PR #134)

- [ ] Re-fetch #134 on current main after #132 settles unless newer evidence changes priority.
- [ ] Clean-replace/rebase only after exact diff review.
- [ ] Preserve truthful availability states: `available`, `unavailable`, `not_instrumented`.
- [ ] Track breadth, depth buckets, history depth, re-observation rate, providers, affiliate provenance, stock/restock/social state, clicks, collection health, and reproducible deltas.
- [ ] Count only actual completed `sold` evidence as completed sale; `sold_out` is not a transaction.
- [ ] Keep Mercari `partnership_required` and X uninstrumented/paid-access state truthful.
- [ ] Keep Production reads read-only and outputs sanitized.
- [ ] Run exact-head full tests / lint / diff check / Vercel Preview and independent review.
- [ ] Merge only if all safe gates pass.
- [ ] Use the Scoreboard as the operating DATA -> TRAFFIC -> CLICK -> REVENUE measurement after integration.

## P0-F — Revalidate lawful source capability matrix (Issue #123 / old PR #145)

- [ ] Re-fetch #145 after higher-priority data-generation/measurement lanes settle.
- [ ] Revalidate/rebase or clean-replace the docs-only work from current main.
- [ ] Keep Yahoo/Rakuten as current approved programmatic marketplace sources.
- [ ] Keep Mercari partnership-only; no scraping.
- [ ] Keep X authorized/paid-access only; no scraping substitution.
- [ ] Treat any new paid API/licensed source as a separate approval/diligence task.
- [ ] Do not let source expansion outrank using the already-approved Rakuten/Yahoo paths for depth/history without evidence.

## P1 — Production history/depth rollout only after code-only lanes are reviewed

The existence of #150 and #153 does **not** authorize Production-connected execution or persistence.

- [ ] Define a separately approval-gated Production rollout for repeated observations/depth collection.
- [ ] Re-read live Production counts and provider health before rollout sizing.
- [ ] Decide cadence/request budget from measured provider limits and data value, not an arbitrary global target.
- [ ] Preserve append-only observation identity and allowlisted current-snapshot updates.
- [ ] Add/verify DB idempotency and transaction/post-write verification before any write-capable automation.
- [ ] Require explicit approval for Production DB writes, new/material workflow/schedule changes, Secrets/Variables, `workflow_dispatch`, or paid access.
- [ ] Verify the first bounded rollout before any scaling.

## P2 — Source capability expansion

- [ ] Maintain source states: `active`, `planned`, `partnership_required`, `paid_access_required`, `manual_only`, `unavailable`.
- [ ] Evaluate additional lawful APIs/feeds one isolated source at a time.
- [ ] Build future Mercari/licensed-provider partnership evidence from traffic, matching quality, catalog coverage, purchase intent, and outbound clicks.
- [ ] Do not scrape Mercari or Amazon.

## P3 — Non-price signals

- [ ] Model stock/inventory observations as timestamped provenance-bearing evidence.
- [ ] Keep official restock/re-release events separate from inferred market unavailability.
- [ ] Add preorder/reservation demand only at exact verified scope.
- [ ] Add X/social only with authorized reviewed access.
- [ ] Combine supply, demand, click/search, and event-window evidence transparently.
- [ ] Never fabricate expectation/popularity from one weak proxy.

## P4 — Traffic / affiliate / GSC

- [ ] Re-read current GSC before current indexation/performance claims.
- [ ] Preserve root/series/variant sitemap separation.
- [ ] Measure query/page impressions and clicks before SEO pruning decisions.
- [ ] Measure outbound affiliate clicks by provider and variant/listing scope where instrumentation permits.
- [ ] Keep affiliate provenance strict.
- [ ] Recheck Amazon Associates and AdSense readiness only as traffic/content quality rises.

## Hold — do not do without explicit approval/new evidence

- [ ] Do NOT merge #142 or manually dispatch F0 while its approval/review boundary remains.
- [ ] Do NOT run #153's provider dry-run against Production credentials/data without a separate approved rollout.
- [ ] Do NOT persist #150/#153 projected observation/listing changes to Production without approval.
- [ ] Do NOT enable Kitan automatic writes.
- [ ] Do NOT enable Qualia automatic rollout.
- [ ] Do NOT rerun completed Kitan/Qualia/complete-set/P2/P1 Production canaries without new task-specific approval.
- [ ] Do NOT replace P3 V2 with Recall V5 merely for higher raw recall.
- [ ] Do NOT weaken the strict single-item matcher.
- [ ] Do NOT mix completed/sold evidence with active asking-price evidence.
- [ ] Do NOT mass-prune pages without current GSC evidence.
- [ ] Do NOT scrape Mercari or Amazon.
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
