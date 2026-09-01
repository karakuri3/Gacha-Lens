# Gacha Lens Ordered TODO

Updated: 2026-09-02 JST — post-PR #156 checkpoint

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

## P0-D — Post-#156 canonical sync — current gate

Issue #157.

- [x] Confirm #156 merged and Production READY.
- [x] Confirm #129 completed and old #132 superseded/closed.
- [x] Refresh `docs/HANDOFF.md`.
- [x] Refresh `docs/STATUS.md`.
- [x] Refresh `docs/DECISIONS.md` with Depth Collector and PR-specific review-exception decisions.
- [x] Refresh this ordered TODO.

Completion rule: when the Issue #157 docs-only PR containing this checkpoint is exact-head green, merged to `main`, and its normal Vercel Production deployment is READY, the canonical-sync gate is complete. Until then, do not begin the next major implementation.

## P0-E — Settle the Data Scale Scoreboard (Issue #126 / old PR #134) — next implementation

- [ ] Re-fetch current main, Issue #126, and old Draft PR #134 after P0-D completes.
- [ ] Inspect the exact stale-branch diff against current main; do not blindly merge old history.
- [ ] Prefer a clean current-main replacement when that yields the smallest reviewable truthful diff.
- [ ] Preserve truthful availability states: `available`, `unavailable`, `not_instrumented`.
- [ ] Track catalog breadth, market depth buckets, observation history depth, re-observation rate, provider split, affiliate provenance, stock/restock/social state, clicks, collection health, and reproducible deltas.
- [ ] Count only actual completed `sold` evidence as completed sale; `sold_out` is not a transaction.
- [ ] Keep Mercari `partnership_required` and X paid-access/uninstrumented state truthful.
- [ ] Keep Production reads read-only and outputs sanitized.
- [ ] Run exact-head full tests / lint / diff check / Vercel Preview and required review gate.
- [ ] Merge only if all Auto-Merge + Standing Release gates pass.
- [ ] Close old Draft #134 as superseded if a clean replacement is used.
- [ ] Use the Scoreboard as the operating DATA -> TRAFFIC -> CLICK -> REVENUE measurement after integration.

## P0-F — Revalidate lawful source capability matrix (Issue #123 / old PR #145)

- [ ] Re-fetch #145 after #134 settles unless newer evidence changes priority.
- [ ] Revalidate/rebase or clean-replace the docs-only work from current main.
- [ ] Keep Yahoo/Rakuten as current approved programmatic marketplace sources.
- [ ] Keep Mercari partnership-only; no scraping.
- [ ] Keep X authorized/paid-access only; no scraping substitution.
- [ ] Treat any new paid API/licensed source as a separate approval/diligence task.
- [ ] Do not let source expansion outrank using already-approved Rakuten/Yahoo paths for depth/history without evidence.

## P1 — Production history/depth rollout only after code-only lanes are reviewed

The existence of #150, #153, and #156 does **not** authorize Production-connected execution or persistence.

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
- [ ] Do NOT persist #150/#153/#156 projected observation/listing changes to Production without approval.
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
