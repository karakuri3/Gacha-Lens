# Gacha Lens Ordered TODO

Updated: 2026-09-01 JST

Work top-to-bottom unless newer verified evidence changes priority. The current product program is Issue #119 Data Scale. Three active listings is a presentation threshold, not a collection target.

## P0-A — Close the 2026-09-01 F0 recovery boundary safely

- [x] Identify the failed F0 scheduled run `33484450472` and prove fail-closed behavior.
- [x] Verify Production transaction `not_started`, database writes 0, deletes 0.
- [x] Identify blocker `official_bounded_rerelease_canonical_release_mismatch`.
- [x] Trace root cause to new month-precision rerelease canonical-year loss during restock-event generation.
- [x] Create repair Issue #137 and code/test repair branch.
- [x] Run exact-head full tests, lint, diff check, and Vercel Preview successfully.
- [ ] Obtain an independent Reviewer for the collection-semantics repair. Connected Copilot reviewer registration did not persist; Vercel Agent review required interactive login at the 2026-09-01 checkpoint.
- [ ] Obtain the required explicit approval before merging current repair PR #142 because merge changes code used by the scheduled Production-capable F0 lane.
- [ ] After an approved merge, observe the normal Git-triggered Vercel release.
- [ ] Do **not** manually rerun/dispatch F0 merely to prove the fix unless a separate explicit `workflow_dispatch` approval exists.
- [ ] On the next normal scheduled F0 run, verify outcome read-only when tooling permits; keep fail-closed gates intact.

## P0-B — Finish canonical recovery sync

- [x] Merge generic non-Production PR CI via PR #141.
- [x] Verify PR #141 exact-head tests/lint/diff/Preview and successful normal Vercel release.
- [x] Refresh `docs/HANDOFF.md` on Issue #143 branch.
- [x] Refresh `docs/STATUS.md` on Issue #143 branch.
- [x] Refresh this TODO order on Issue #143 branch.
- [x] Refresh durable decisions on Issue #143 branch.
- [ ] Run PR Code Quality + Vercel Preview for canonical-sync PR.
- [ ] Merge the docs-only canonical-sync PR when every safe Auto-Merge/Standing Release gate passes.

## P0-C — Data Scale: validate and integrate existing work before creating duplicates

Umbrella: Issue #119.

### Re-observation / history

- [ ] Re-fetch PR #131 and validate it under generic PR CI.
- [ ] Confirm the repaired positive-price invariant remains present; 0 / `"0"` must fail closed.
- [ ] Obtain independent Verifier/Reviewer evidence because observation semantics affect collection truth.
- [ ] Keep Production persistence/automatic activation separate from code-only merge approval when it changes future write behavior.

### Exact provider re-read

- [ ] Re-fetch stacked PR #136 after #131 state is settled.
- [ ] Validate exact Rakuten/Yahoo identity reads, pacing, timeout/retry sanitization, and no keyword rediscovery.
- [ ] Preserve read-only/dry-run boundary until a separate Production persistence task is approved.

### Multi-listing depth

- [ ] Re-fetch PR #132 and validate it under generic PR CI.
- [ ] Confirm many legitimate distinct offers per variant remain retained under operational budget.
- [ ] Confirm dedupe is by real listing identity/canonical URL, not price/title.
- [ ] Preserve strict single-item matcher and provenance rules.

### Data Scale Scoreboard

- [ ] Re-fetch PR #134 and validate full exact-head tests/lint/Preview under generic CI.
- [ ] Preserve truthful availability states (`available`, `unavailable`, `not_instrumented`).
- [ ] Keep three listings as display threshold only.
- [ ] Keep Mercari `partnership_required`; do not hide missing X instrumentation.
- [ ] Use the scoreboard as the operating measurement for DATA -> TRAFFIC -> CLICK -> REVENUE after integration.

### Forecast truthfulness

- [ ] Re-fetch PR #133 and validate it under generic PR CI.
- [ ] Preserve rule that metadata alone cannot produce a public expectation score.
- [ ] Require multiple independent evidence families and component-level provenance.
- [ ] Keep unavailable/insufficient evidence as `null` / `算出待ち`, not fabricated numbers.

## P1 — Build the scalable Data Scale architecture after existing PRs settle

- [ ] Keep breadth seeding, depth collection, and re-observation as separate responsibilities.
- [ ] Persist repeated observations so one listing can accumulate history over time.
- [ ] Separate listing identity from observation identity.
- [ ] Separate provider storefront identity from merchant identity unless equivalence is proven.
- [ ] Size rate limits/request budgets from provider evidence, not a global 25-row product target.
- [ ] Prefer batch/upsert/queue architecture where justified by measured throughput.
- [ ] Build reproducible daily/week deltas: new listings/day, observations/day, re-observation rate, freshness, provider split, depth distribution, rejection reasons, rate-limit/error metrics.

## P2 — Source capability expansion

- [ ] Maintain a source capability matrix: `active`, `planned`, `partnership_required`, `paid_access_required`, `manual_only`, `unavailable`.
- [ ] Keep Yahoo Shopping and Rakuten as approved current programmatic marketplace sources.
- [ ] Evaluate additional lawful APIs/feeds one isolated source at a time.
- [ ] Keep Mercari as a strategic future authorized/licensed partner; do not scrape it.
- [ ] Do not scrape Amazon.
- [ ] Treat X/social as an authorized API/licensing track; if commercial access is required, record `paid_access_required` instead of substituting scraping.
- [ ] Build future partnership evidence around Gacha Lens traffic, matching quality, purchase intent, catalog coverage, and outbound clicks.

## P3 — Non-price signal model

- [ ] Model stock/inventory observations as timestamped provenance-bearing evidence.
- [ ] Preserve official restock/re-release events separately from inferred market unavailability.
- [ ] Add preorder/reservation/set-demand evidence only with exact scope and provenance.
- [ ] Add authorized X/social reaction/velocity evidence only when access is available and reviewed.
- [ ] Combine supply-side, demand-side, click/search, and event-window evidence into explainable components.
- [ ] Never fabricate expectation/popularity from one weak proxy.

## P4 — Traffic / affiliate / GSC

- [ ] Re-read current GSC before making current indexation/performance claims.
- [ ] Track root/series/variant sitemaps separately.
- [ ] Measure pages and queries with impressions/clicks.
- [ ] Preserve pages already receiving impressions; do not mass-noindex from intuition.
- [ ] Measure outbound affiliate clicks by provider.
- [ ] Confirm newly persisted Rakuten/Yahoo rows retain affiliate provenance only when strictly validated.
- [ ] Keep historical affiliate backfills and Yahoo Secrets/Variables as separate explicit-approval Production tasks.
- [ ] Increase pages that combine official product truth with useful market evidence.
- [ ] Focus on commercial-intent queries such as product name + 相場 / 高い / レア / 発売 / 再販.
- [ ] Recheck Amazon Associates progress as traffic rises.
- [ ] Recheck AdSense readiness only after content/indexation/traffic quality improves.

## P5 — Agent OS / queue work only when it helps business throughput

- [x] Agent OS v1 established.
- [x] Gated Auto-Merge and Standing Production Release policy established.
- [x] Generic non-Production PR Code Quality workflow merged in PR #141.
- [x] Queue / Orchestrator v1 merged in PR #122.
- [ ] Record the result of the first fresh-session one-shot Queue run after Issue #143 reaches a terminal disposition.
- [ ] Use independent Verifier/Reviewer for higher-risk collection semantics.
- [ ] Do not optimize agent activity metrics as a substitute for DATA/TRAFFIC/CLICK/REVENUE movement.

## Hold / do not do without explicit approval or new evidence

- [ ] Do NOT manually dispatch F0 official ingestion while PR #142 is pending.
- [ ] Do NOT enable Kitan automatic writes.
- [ ] Do NOT enable Qualia automatic rollout.
- [ ] Do NOT rerun Kitan or Qualia manual canaries.
- [ ] Do NOT rerun completed complete-set, P2, or P1 canaries without a new task-specific approval.
- [ ] Do NOT replace P3 V2 with Recall V5 merely for higher raw recall.
- [ ] Do NOT weaken the strict single-item matcher.
- [ ] Do NOT mass-prune pages without current GSC evidence.
- [ ] Do NOT scrape Mercari or Amazon.
- [ ] Do NOT touch `supabase/.temp/cli-latest`.
- [ ] Do NOT re-enable `.github/workflows/gacha-ingestion.yml`.

## Forced handoff hygiene

Do not rely on detecting chat limits.

After any major Production/recovery/security/release milestone, before the next major implementation phase:

- [ ] update `docs/STATUS.md` with timestamped evidence and current Git/GitHub state
- [ ] update `docs/HANDOFF.md` with completed work, active PRs, approval boundary, and exact next step
- [ ] update `docs/DECISIONS.md` for any new durable rule
- [ ] update this TODO order
- [ ] use a docs-only PR instead of mixing canonical state with unrelated implementation
- [ ] do not proceed merely because the user says “続けて” until the canonical sync gate is complete
