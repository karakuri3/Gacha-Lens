# Gacha Lens Ordered TODO

Updated: 2026-09-02 JST — post-PR #159 checkpoint

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

- [x] Clean-replace old #136 from current main.
- [x] Preserve exact persisted Rakuten/Yahoo item identity reads; no keyword rediscovery.
- [x] Preserve bounded retries/timeouts and serial provider pacing.
- [x] Restrict credential-bearing requests to reviewed official HTTPS host + exact path.
- [x] Reject arbitrary HTTPS custom endpoints, HTTP, embedded credentials, query/fragment injection, and redirects.
- [x] Validate durable listing ID before provider request.
- [x] Keep strict availability/price normalization and sanitized diagnostics.
- [x] Pass exact-head full tests / lint / diff check / Vercel Preview / review gate.
- [x] Merge #153 and confirm Production READY.
- [x] Close Issue #135 and old Draft #136 superseded.
- [ ] Do **not** execute live Production-connected provider reads or persist re-observations without the separate required approval.

## P0-C — Multi-listing Depth Collector — complete code-only milestone

### #156 / #129

- [x] Re-fetch current main / Issue #129 / old Draft #132.
- [x] Clean-replace old #132 from current main rather than merging stale history.
- [x] Preserve 10+ legitimate distinct offers for one target variant under operational budget.
- [x] Keep strict single-item matcher / set / ambiguity / exact target safety unchanged.
- [x] Deduplicate by durable listing identity, provider/native item identity, and canonical URL rather than price/title.
- [x] Preserve same-provider distinct storefront/listing and cross-provider distinct offers when identity is genuinely distinct.
- [x] Reject duplicate candidate keys fail-closed.
- [x] Bind target / IDs / canonical URL / row-relevant evidence with SHA-256 selection fingerprint.
- [x] Reject target / URL / price / title / identity / selection drift after selection.
- [x] Re-run strict safety before row generation.
- [x] Keep dry-run on the same selection-integrity gate.
- [x] Enforce insert-only projected-write contract; reject update/delete/count drift.
- [x] Keep budget 50 / max 200 as operational safety bounds, never product completion targets.
- [x] Pass exact-head PR Code Quality run `33523845575` and exact-head Vercel Preview.
- [x] User explicitly approved #156-only substitution of independent CI + strengthened Lead review + regression tests because Copilot Code Review was unavailable on the current GitHub plan.
- [x] Merge #156 as `f7fb7b10f2ff8a791e439446958581ee42c3eeb9`.
- [x] Confirm Production deployment `dpl_43UEfvXeNsfwBKmuMm4J64Y9xL9s` reached `READY`.
- [x] Confirm Issue #129 closed and old Draft #132 closed superseded.
- [ ] Keep Production depth persistence/automatic activation separately approval-gated.

## P0-D — Post-#156 canonical sync — complete

Issue #157 / PR #158.

- [x] Refresh `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`.
- [x] Merge docs-only PR #158.
- [x] Confirm main `99948dbb1273aefcf398654f72b8fce193f38fe5` Production READY.
- [x] Confirm Issue #157 closed.

## P0-E — Data Scale Scoreboard — complete code/read-only milestone

Issue #126 / clean replacement PR #159; old Draft #134 superseded/closed.

- [x] Re-fetch current main, Issue #126, and old Draft #134 after P0-D.
- [x] Clean-replace stale #134 from current main instead of merging old history.
- [x] Preserve measured states: `available`, `unavailable`, `not_instrumented`.
- [x] Separate source capability states from measured signal availability.
- [x] Count only active capability entries in `supported_source_count`; keep capability inventory count separate.
- [x] Keep Mercari `partnership_required` and X `paid_access_required` until reviewed authorized activation.
- [x] Track catalog breadth, market depth buckets, observation history, re-observation, provider split, affiliate provenance, stock/restock/social state, clicks, collection health, and deltas.
- [x] Count only actual completed `sold` as completed-sale evidence; keep `sold_out` separate.
- [x] Exclude `review_required=true` stock/restock/social rows inside the domain contract.
- [x] Keep outbound-click attribution provider+variant scoped; do not claim listing-level conversion/revenue.
- [x] Separate Production DB `ingestion_runs` from GitHub Actions workflow-run evidence; missing workflow evidence remains `not_instrumented`.
- [x] Keep Production reads sequential/read-only and output sanitized; do not emit raw provider payloads or credentials.
- [x] Revalidate Production schema/select fields read-only.
- [x] Re-read Production data for truthfulness and record 10,241 series / 23,808 variants / 107 listings / 107 observations at the checkpoint.
- [x] Confirm 107 listings still had exactly one observation each and completed `sold` evidence remained 0.
- [x] Confirm measured clicks 0 / 21 / 38 at 24h / 7d / 30d at validation time.
- [x] Pass exact-head full tests / lint / diff check / Vercel Preview and full-diff review.
- [x] Merge #159 as `3b0fea45a63800fdc052d007484727f9ed07e999`.
- [x] Confirm Production deployment `dpl_BBV9gV6d5a7ftCihMPfc8v8oo4S7` reached `READY`.
- [x] Confirm Issue #126 closed and old Draft #134 closed superseded.
- [ ] Use the Scoreboard as the operating measurement layer; do **not** treat its merge as authorization for Production history/depth persistence.

## P0-F — Post-#159 canonical sync — current gate

Issue #160.

- [x] Confirm #159 merged and Production READY.
- [x] Confirm #126 completed and old #134 superseded/closed.
- [x] Refresh `docs/HANDOFF.md` with #159 checkpoint and next P0.
- [x] Refresh `docs/STATUS.md` with current main, Production state, and read-only metrics.
- [x] Refresh `docs/DECISIONS.md` with durable Scoreboard truthfulness/evidence-source rules.
- [x] Refresh this ordered TODO.

Completion rule: when the Issue #160 docs-only PR containing this checkpoint is exact-head green, merged to `main`, and its normal Vercel Production deployment is READY, the canonical-sync gate is complete. Until then, do not begin the next major implementation.

## P0-G — Revalidate lawful source capability matrix (Issue #123 / old PR #145) — next implementation

- [ ] Re-fetch current main, Issue #123, and old Draft PR #145 after P0-F completes.
- [ ] Inspect the stale docs diff against current main; do not blindly merge old history.
- [ ] Prefer a clean current-main replacement when it yields the smallest truthful diff.
- [ ] Preserve source capability states: `active`, `planned`, `partnership_required`, `paid_access_required`, `manual_only`, `unavailable`.
- [ ] Keep Yahoo/Rakuten as current approved programmatic marketplace sources.
- [ ] Keep Mercari partnership-only; no scraping.
- [ ] Keep X authorized/paid-access only; no scraping substitution.
- [ ] Revalidate Aucfan as commercial/paid-access diligence rather than treating consumer-plan pricing as API licensing.
- [ ] Record eBay/public API limitations and any other source state conservatively.
- [ ] Treat any new paid API/licensed source, contract, credential, or data-rights activation as a separate explicit approval/diligence task.
- [ ] Do not let source expansion outrank using already-approved Rakuten/Yahoo paths for history/depth without evidence.
- [ ] Run exact-head CI / Vercel Preview / docs review gate.
- [ ] Close old Draft #145 as superseded if a clean replacement is used.

## P1 — Production history/depth rollout only after code-only lanes are reviewed

The existence of #150, #153, #156, and #159 does **not** authorize Production-connected history/depth execution or persistence.

- [ ] Define a separately approval-gated Production rollout for repeated observations/depth collection.
- [ ] Re-read live Production counts and provider health before rollout sizing.
- [ ] Decide cadence/request budget from measured provider limits and data value, not an arbitrary global target.
- [ ] Preserve append-only observation identity and allowlisted current-snapshot updates.
- [ ] Add/verify DB idempotency and transaction/post-write verification before any write-capable automation.
- [ ] Require explicit approval for Production DB writes, new/material workflow/schedule changes, Secrets/Variables, `workflow_dispatch`, or paid access.
- [ ] Verify the first bounded rollout before any scaling.
- [ ] Measure actual movement with the Scoreboard after each approved rollout.

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
- [ ] Do NOT persist #150/#153/#156 projected observation/listing changes to Production without approval.
- [ ] Do NOT interpret #159 Scoreboard integration as Production collection authorization.
- [ ] Do NOT enable Kitan automatic writes.
- [ ] Do NOT enable Qualia automatic rollout.
- [ ] Do NOT rerun completed Kitan/Qualia/complete-set/P2/P1 Production canaries without new task-specific approval.
- [ ] Do NOT replace P3 V2 with Recall V5 merely for higher raw recall.
- [ ] Do NOT weaken the strict single-item matcher.
- [ ] Do NOT mix completed/sold evidence with active asking-price evidence.
- [ ] Do NOT mass-prune pages without current GSC evidence.
- [ ] Do NOT scrape Mercari or Amazon.
- [ ] Do NOT purchase/activate X, Aucfan, or other paid/licensed sources without explicit approval.
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
