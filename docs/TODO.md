# Gacha Lens Ordered TODO

Updated: 2026-08-27 JST

Work top-to-bottom unless new live evidence changes priority.

## P0 — Immediate next approval boundary

- [ ] Verify `main` is still at/after `b6f702152a5e65c54738390455e4663cdf9c593c` and no newer PR changed F3-C1.
- [ ] Verify the Production deployment is READY.
- [ ] Obtain explicit user approval to dispatch **Gacha Market Series Complete-Set Read-Only Diagnostic**.
- [ ] Dispatch the read-only diagnostic only. Do not perform any persistence/write action.
- [ ] Inspect workflow conclusion, sanitized artifact, selected targets, raw candidates, existing `not_single_item`, complete-set evaluated/accepted counts, unique accepted series, reject reasons, and DB zero-delta proof.
- [ ] Independently re-read Production counts after the diagnostic to confirm database writes remain 0.

## P1 — Decide F3-C2 from diagnostic evidence

Only after the read-only artifact exists:

### If classifier precision/coverage is useful

- [ ] Design a bounded complete-set persistence contract.
- [ ] Keep persistence series-level only (`variant_id=null`, `matched_variant_id=null`).
- [ ] Add a separate approval-gated canary/readiness path before Production writes.
- [ ] After safe persistence is proven, add truthful series-page UI such as “コンプリートセット参考価格”.
- [ ] Keep single-item price UI/evidence completely separate.

### If diagnostic shows false positives / ambiguity

- [ ] Repair classifier with focused tests and rerun read-only diagnostic after separate dispatch approval.

### If diagnostic yields little/no useful coverage

- [ ] Do not force the feature into Production.
- [ ] Reassess another evidence-density path instead of weakening safety.

## P2 — Continue market evidence growth

- [ ] Keep P3 V2 Automatic Production running unchanged while healthy.
- [ ] Periodically monitor market listing/observation growth and unique covered variants/series.
- [ ] Diagnose “candidate 0” separately from matcher rejection; they are different bottlenecks.
- [ ] Do not promote Recall V5 as-is.
- [ ] Do not weaken the strict single-item matcher.

## P3 — GSC observer monitoring

The observer sitemaps are already submitted.

- [ ] Track `/series-sitemap.xml` and `/variant-sitemap.xml` separately as data accumulates.
- [ ] Measure URLs with impressions/clicks and page/query distribution.
- [ ] Compare series vs variant discovery/indexation.
- [ ] Investigate the root sitemap warning separately; do not assume it explains all indexation behavior.
- [ ] Avoid conclusions from sitemap `indexed=0` summary alone.

## P4 — F3-B2 Evidence-based SEO pruning

Do not start with mass noindex.

After enough GSC evidence exists:

- [ ] Identify pages with no impressions, weak content, old/stale value, or duplicate intent.
- [ ] Identify pages already receiving impressions and protect them from accidental pruning.
- [ ] Decide selective sitemap exclusion/noindex/consolidation based on evidence.
- [ ] Preserve Series-first canonical/pagination rules.

## P5 — Traffic and monetization

- [ ] Increase coverage of pages that combine official product truth + useful market evidence.
- [ ] Track outbound affiliate clicks by provider.
- [ ] Focus on queries with commercial intent: product name + 相場 / 高い / レア / 発売 / 再販.
- [ ] Improve internal discovery only when it supports traffic/conversion, not cosmetic churn.
- [ ] Recheck Amazon Associates qualifying-sale progress when traffic rises.
- [ ] Recheck AdSense “not ready” reason and reapply after content/indexation/traffic quality improves.

## Hold / do not do without explicit decision

- [ ] Do NOT enable Kitan auto.
- [ ] Do NOT enable Qualia auto.
- [ ] Do NOT rerun Kitan manual canary.
- [ ] Do NOT rerun Qualia one-series canary.
- [ ] Do NOT replace P3 V2 with Recall V5.
- [ ] Do NOT mass-prune 7k+ series-only pages without GSC evidence.
- [ ] Do NOT introduce Mercari/Amazon scraping.
- [ ] Do NOT touch `supabase/.temp/cli-latest`.
- [ ] Do NOT re-enable `.github/workflows/gacha-ingestion.yml`.

## Thread / handoff hygiene

Before the next long-thread transition:

- [ ] update `docs/STATUS.md` with live SHA/deploy/counts/GSC state
- [ ] update `docs/HANDOFF.md` with newly completed phases and the next approval boundary
- [ ] update `docs/DECISIONS.md` for any durable policy change
- [ ] update this TODO order
- [ ] use a docs-only PR rather than silently editing Production code during handoff