# Gacha Lens Ordered TODO

Updated: 2026-09-01 JST — post-PR #150 checkpoint

Work top-to-bottom unless newer verified evidence changes priority. Current umbrella program: Issue #119 Data Scale. Three active listings is a presentation threshold only.

## P0-A — Keep F0 recovery at the real approval boundary

- [x] Prove scheduled F0 run `33484450472` failed closed.
- [x] Verify Production transaction `not_started`, DB writes 0, deletes 0.
- [x] Trace blocker to month-precision rerelease canonical-year loss.
- [x] Create Issue #137 and repair PR #142.
- [x] Verify #142 full tests / lint / diff check / Vercel Preview pass.
- [ ] Obtain independent collection-semantics review for #142.
- [ ] Obtain explicit approval before merging #142 because it changes code used by the scheduled Production-capable F0 lane.
- [ ] Do not manually rerun/dispatch F0 without separate `workflow_dispatch` approval.
- [ ] After an approved merge, observe the normal Vercel release and later verify the next normal scheduled run read-only when tooling permits.

## P0-B — Complete the post-#150 canonical sync

Issue #151.

- [x] Confirm PR #150 merged as `53cbfabb8916e6647dde3d18423d855899df80d0`.
- [x] Confirm #150 Production deployment `dpl_3Wo9ToRQVUDWwftN58NzUbbi4q7F` reached `READY`.
- [x] Confirm Issue #128 closed and old PR #131 superseded/closed.
- [x] Refresh `docs/HANDOFF.md`.
- [x] Refresh `docs/STATUS.md`.
- [x] Refresh `docs/DECISIONS.md` with re-observation + provider-endpoint security decisions.
- [x] Refresh this ordered TODO.
- [ ] Open the docs-only canonical-sync PR.
- [ ] Run exact-head PR Code Quality + Vercel Preview.
- [ ] Merge when Auto-Merge + Standing Production Release gates pass.
- [ ] Do not begin the next major implementation until this sync is merged.

## P0-C — Clean-replace exact provider re-observation read (#135 / old PR #136)

This is the next implementation after P0-B.

- [ ] Re-fetch current `main` and old PR #136.
- [ ] Create a clean current-main branch rather than merging the old stack on superseded #131.
- [ ] Port only the five #135 files: provider adapter, dry-run runner, docs, and focused tests.
- [ ] Preserve exact persisted Rakuten/Yahoo item identity reads; no keyword rediscovery.
- [ ] Preserve bounded retries/timeouts, serial provider pacing, strict availability/price normalization, and sanitized diagnostics.
- [ ] **Repair credential routing:** arbitrary HTTPS custom endpoints must be rejected; credentials/identifiers may be sent only to reviewed official provider host+path allowlists.
- [ ] Add regression tests proving an arbitrary HTTPS endpoint cannot receive Rakuten `accessKey` or Yahoo `appid`.
- [ ] Keep the runner dry-run/read-only; no observation/listing persistence.
- [ ] Do not execute live Production-connected provider reads or consume a new paid API entitlement without the separate required approval.
- [ ] Run full exact-head tests / lint / diff check / Vercel Preview.
- [ ] Complete independent Verifier/Reviewer with no blocking/major finding.
- [ ] Merge only if Auto-Merge + Standing Release gates pass.
- [ ] Close old PR #136 as superseded after the replacement is safely merged.

## P0-D — Settle the multi-listing depth collector (old PR #132)

- [ ] Re-fetch #132 after #135/#136 replacement settles.
- [ ] Prefer clean replacement/rebase from current main over preserving stale branch history.
- [ ] Confirm many legitimate distinct offers for one variant remain retained under the operational budget.
- [ ] Confirm dedupe uses durable listing identity / provider item ID / canonical URL, not price/title.
- [ ] Preserve strict single-item matcher, exact target variant/series scope, and affiliate provenance rules.
- [ ] Keep operational limits as safety/request budgets, never collection-completion targets.
- [ ] Run exact-head CI + Preview + independent collection-semantics review.
- [ ] Keep Production persistence/automatic activation as a separate approval-gated rollout.

## P0-E — Settle the Data Scale Scoreboard (old PR #134)

- [ ] Re-fetch #134 on current main.
- [ ] Clean-replace/rebase as needed.
- [ ] Preserve truthful availability states: `available`, `unavailable`, `not_instrumented`.
- [ ] Track breadth, depth buckets, history depth, re-observation rate, providers, affiliate provenance, stock/restock/social state, clicks, collection health, and reproducible deltas.
- [ ] Count only actual completed `sold` evidence as completed sale; `sold_out` is not a transaction.
- [ ] Keep Mercari `partnership_required` and X uninstrumented/paid-access state truthful.
- [ ] Run exact-head CI + Preview and merge if all safe gates pass.
- [ ] Use the Scoreboard as the operating DATA -> TRAFFIC -> CLICK -> REVENUE measurement after integration.

## P0-F — Revalidate lawful source capability matrix (old PR #145)

- [ ] Re-fetch and rebase/clean-replace docs-only PR #145 after higher-priority data-generation lanes settle.
- [ ] Keep Yahoo/Rakuten as current approved programmatic marketplace sources.
- [ ] Keep Mercari partnership-only; no scraping.
- [ ] Keep X authorized/paid-access only; no scraping substitution.
- [ ] Treat any new paid API/licensed source as a separate approval/diligence task.

## P1 — Production history rollout only after code-only lanes are reviewed

The existence of #150 and future #135 provider-read code does **not** authorize Production execution/persistence.

- [ ] Define a separately approval-gated Production rollout for repeated observations.
- [ ] Re-read live Production counts and provider health before rollout sizing.
- [ ] Decide cadence/request budget from measured provider limits and data value, not an arbitrary global target.
- [ ] Preserve append-only observation identity and allowlisted current-snapshot updates.
- [ ] Add DB idempotency/transaction verification before any write-capable automation.
- [ ] Require explicit approval for Production DB writes, new/material workflow/schedule changes, Secrets/Variables, or paid access.
- [ ] Verify first bounded rollout before any scaling.

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
