# Gacha Lens Ordered TODO

Updated: 2026-08-30 JST

Work top-to-bottom unless newer evidence changes priority. Git/GitHub development state is current as of this date; Production, deployment, Supabase, and GSC facts remain dated until separately re-verified.

## P0 — Re-establish live operational truth before Production decisions

Use a separately allowed read-only/live-verification task. This documentation refresh is not authorization for Production access or a workflow dispatch.

- [ ] Verify current `main` deployment and aliases after `a79e8f72151cdb1eff94d6971e1544f751d7ed2f`.
- [ ] Re-read current Supabase counts instead of reusing the 2026-08-27 snapshot.
- [ ] Confirm the persisted complete-set, P2, and P1 canary rows remain consistent with their sanitized GitHub run evidence.
- [ ] Verify current observed-listing and affiliate rendering after PRs #102, #103, and #106.
- [ ] Re-read current GSC series/variant/root sitemap and performance state.
- [ ] Record the timestamp and evidence source for every refreshed live claim.

Do not rerun any completed diagnostic or canary merely to refresh documentation.

## P1 — Grow useful market evidence safely

- [ ] Keep the existing P3 V2 automatic path unchanged while GitHub and live evidence remain healthy.
- [ ] Monitor listing/observation growth and unique covered variants/series using an allowed evidence path.
- [ ] Diagnose “candidate 0” separately from strict-matcher rejection.
- [ ] Use the bounded P2/P1 contracts only through a new explicitly approved dispatch/write task.
- [ ] Keep complete-set evidence series-level and separate from variant prices.
- [ ] Do not promote Recall V5 as-is or weaken the strict single-item matcher.

Completed foundations that must not be reopened without evidence:

- [x] complete-set read-only diagnostic, readiness, bounded one-series canary, and truthful reference UI
- [x] Priority 2 distinct/storefront diagnostics and bounded one-candidate canary
- [x] Priority 1 bounded one-candidate canary and cooldown repair
- [x] observed exact-variant marketplace comparison

## P2 — Convert verified evidence into monetization

- [ ] Measure outbound affiliate clicks by provider after live state is safely re-verified.
- [ ] Confirm new P3 rows retain only strictly validated Rakuten/Yahoo affiliate provenance.
- [ ] Treat any historical-row affiliate backfill as a separate Production-write task requiring explicit approval.
- [ ] Treat Yahoo affiliate Secret/Variable activation as a separate explicit-approval task.
- [ ] Preserve direct safe item links and generic marketplace searches when affiliate provenance is absent or invalid.

## P3 — GSC observer monitoring

- [ ] Track `/series-sitemap.xml` and `/variant-sitemap.xml` separately after fresh GSC verification.
- [ ] Measure URLs with impressions/clicks and page/query distribution.
- [ ] Compare series versus variant discovery and indexation.
- [ ] Investigate the root sitemap warning separately.
- [ ] Avoid conclusions from sitemap-summary `indexed=0` alone.

## P4 — Evidence-based SEO pruning

Do not start with mass noindex.

- [ ] Identify pages with no impressions, weak content, stale value, or duplicate intent using current GSC evidence.
- [ ] Protect pages already receiving impressions.
- [ ] Decide selective sitemap exclusion/noindex/consolidation from evidence.
- [ ] Preserve Series-first canonical and pagination rules.

## P5 — Traffic and monetization

- [ ] Increase coverage of pages combining official product truth with useful market evidence.
- [ ] Focus on commercial-intent queries: product name + 相場 / 高い / レア / 発売 / 再販.
- [ ] Improve internal discovery when it supports traffic or conversion, not cosmetic churn.
- [ ] Recheck Amazon Associates qualifying-sale progress when traffic rises.
- [ ] Recheck the current AdSense “not ready” reason and reapply after content/indexation/traffic quality improves.

## Agent OS experiment sequence

This sequence validates development operations and does not reorder the business priorities above.

- [x] Establish Agent OS v1 and the gated autonomous merge policy.
- [x] Run the first documentation-only, one-Agent experiment under Issue #108; its PR/result is authoritative for final metrics and disposition.
- [ ] If experiment #1 succeeds, run one bounded non-Production code task with no external-system dependency.
- [ ] Then trial isolated Scout / Builder / Verifier / Reviewer roles with one worktree per editing task.
- [ ] Propose queue/CI/docs-maintenance automation only in separate PRs.
- [ ] Keep experiments disconnected from Production writes, deploys, migrations, workflow dispatches, secrets, paid operations, and destructive cleanup.

## Hold / do not do without explicit decision

- [ ] Do NOT enable Kitan automatic writes.
- [ ] Do NOT enable Qualia automatic rollout.
- [ ] Do NOT rerun Kitan or Qualia manual canaries.
- [ ] Do NOT rerun the completed complete-set, P2, or P1 canaries without a new approval.
- [ ] Do NOT replace P3 V2 with Recall V5.
- [ ] Do NOT mass-prune thousands of pages without current GSC evidence.
- [ ] Do NOT introduce Mercari or Amazon scraping.
- [ ] Do NOT touch `supabase/.temp/cli-latest`.
- [ ] Do NOT re-enable `.github/workflows/gacha-ingestion.yml`.

## Handoff hygiene

Before the next long-thread transition:

- [ ] update `docs/STATUS.md` with evidence timestamps and current Git/GitHub state
- [ ] update `docs/HANDOFF.md` with completed phases and the next real boundary
- [ ] update `docs/DECISIONS.md` only for durable policy/product decisions
- [ ] update this TODO order
- [ ] use a docs-only PR instead of mixing handoff edits with unrelated product changes
