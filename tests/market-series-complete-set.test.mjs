import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { assessMarketCandidate } from "../lib/domain/market-match-safety.js";
import {
  assessSeriesCompleteSetCandidate,
  buildSeriesCompleteSetPreview,
  evaluateSeriesCompleteSetCandidates,
  hasCatalogParentIdentityAmbiguity,
  withoutCompleteSetSignals,
} from "../lib/domain/market-series-complete-set.js";
import { buildSeriesCompleteSetDiagnostic, renderSeriesCompleteSetDiagnosticMarkdown } from "../lib/domain/market-series-complete-set-diagnostic.js";

const ROOT = process.cwd();
const workflow = fs.readFileSync(path.join(ROOT, ".github/workflows/gacha-market-series-complete-set-diagnostic.yml"), "utf8");

function fixture({ count = 5, title = "Gacha Series Collection 全5種セット", price = 2500, provider = "rakuten_ichiba", seriesName = "Gacha Series Collection", franchise = "", variantType = "normal" } = {}) {
  const series = { id: "series-a", name: seriesName, franchise };
  const variants = Array.from({ length: count }, (_, index) => ({ id: `v${index + 1}`, series_id: series.id, name: `Variant ${index + 1}`, variant_type: variantType }));
  const catalog = { series: [series], variants, seriesById: new Map([[series.id, series]]), variantById: new Map(variants.map((entry) => [entry.id, entry])) };
  const query = { series_id: series.id, variant_id: variants[0]?.id, query: `${series.name} ${variants[0]?.name} ガチャ`, fallback_queries: [] };
  const listing = { title, price, source: provider === "rakuten_ichiba" ? "rakuten" : "yahoo", status: "active", source_url: "https://example.com/item/1", raw: { provider, query: query.query } };
  return { catalog, series, variants, query, listing };
}

test("complete-set classifier accepts exact parent series and matching formal counts", () => {
  for (const value of [
    fixture({ count: 5, title: "Gacha Series Collection 全5種セット" }),
    fixture({ count: 6, title: "Gacha Series Collection 全6種 コンプリート" }),
    fixture({ title: "Gacha Series Collection 全種セット" }),
    fixture({ title: "Gacha Series Collection フルコンプ" }),
  ]) {
    const result = assessSeriesCompleteSetCandidate(value.listing, value.query, value.catalog);
    assert.equal(result.accepted, true);
    assert.equal(result.listingType, "complete_set");
    assert.equal(result.seriesId, value.series.id);
    assert.equal(result.variantId, null);
    assert.equal(result.matchedVariantId, null);
  }
});

test("complete-set signals do not become edition tails while actual editions stay fail closed", () => {
  const accepted = fixture({
    seriesName: "ノンタン めじるしアクセサリー",
    franchise: "ノンタン",
    title: "ノンタン めじるしアクセサリー 全5種セット フルコンプ",
  });
  assert.equal(assessSeriesCompleteSetCandidate(accepted.listing, accepted.query, accepted.catalog).accepted, true);
  assert.equal(withoutCompleteSetSignals(accepted.listing.title), "ノンタン めじるしアクセサリー");

  for (const title of [
    "ノンタン めじるしアクセサリー Vol.2 全5種セット",
    "ノンタン めじるしアクセサリー 全5種セット Vol.2",
  ]) {
    const value = fixture({ seriesName: "ノンタン めじるしアクセサリー", franchise: "ノンタン", title });
    assert.equal(assessSeriesCompleteSetCandidate(value.listing, value.query, value.catalog).reason, "parent_series_identity_conflict");
  }
});

test("complete-set classifier rejects duplicate catalog parent names and standalone one-of-all listings", () => {
  const duplicate = fixture();
  const sameName = { id: "series-b", name: duplicate.series.name, franchise: "Other" };
  duplicate.catalog.series.push(sameName);
  duplicate.catalog.seriesById.set(sameName.id, sameName);
  assert.equal(hasCatalogParentIdentityAmbiguity(duplicate.series, duplicate.catalog.series), true);
  assert.equal(assessSeriesCompleteSetCandidate(duplicate.listing, duplicate.query, duplicate.catalog).reason, "parent_series_catalog_identity_ambiguous");

  for (const title of [
    "Gacha Series Collection 全種のうち1種",
    "Gacha Series Collection 全種よりランダム1種",
    "Gacha Series Collection 全種から1種",
    "Gacha Series Collection 全種 ランダム1個",
    "Gacha Series Collection 全種類のうち1種類",
    "Gacha Series Collection 全5種のうち1種",
    "Gacha Series Collection 全5種よりランダム1種",
    "Gacha Series Collection 全5種 ランダム1個",
    "Gacha Series Collection 単品 全5種より1種",
    "Gacha Series Collection 全5種セット バラ売り",
  ]) {
    const value = fixture({ title });
    assert.equal(assessSeriesCompleteSetCandidate(value.listing, value.query, value.catalog).reason, "complete_set_single_item_conflict");
  }
});

test("complete-set classifier rejects partial, generic, unsafe, and ambiguous candidates", () => {
  const cases = [
    [fixture({ title: "Gacha Series Collection 全4種セット" }), "complete_set_lineup_count_conflict"],
    [fixture({ title: "Gacha Series Collection 3種セット" }), "complete_set_signal_missing"],
    [fixture({ title: "Gacha Series Collection セット" }), "complete_set_signal_missing"],
    [fixture({ title: "Gacha Series Collection まとめ" }), "complete_set_signal_missing"],
    [fixture({ title: "Other Series 全5種セット" }), "parent_series_evidence_missing"],
    [fixture({ title: "Gacha Series Collection Vol.2 全5種セット" }), "parent_series_identity_conflict"],
    [fixture({ title: "Gacha Series Collection 全5種セット 予約" }), "preorder_listing"],
    [fixture({ price: 0 }), "price_invalid"],
    [fixture({ variantType: "provisional" }), "formal_lineup_unavailable"],
    [fixture({ provider: "mercari" }), "planner_marketplace_source_required"],
  ];
  for (const [value, reason] of cases) assert.equal(assessSeriesCompleteSetCandidate(value.listing, value.query, value.catalog).reason, reason);
});

test("single matcher continues to reject complete sets as not_single_item", () => {
  const value = fixture();
  const result = assessMarketCandidate(value.listing, value.query, value.catalog);
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "not_single_item");
});

test("diagnostic evaluates only existing not_single_item records and emits a series-only preview", () => {
  const value = fixture();
  const records = [{ ...value.listing, market_safety: { reason: "not_single_item", accepted: false }, raw: value.listing.raw }];
  const evaluations = evaluateSeriesCompleteSetCandidates({ records, queryPlan: [value.query], catalog: value.catalog });
  const preview = buildSeriesCompleteSetPreview(value.listing, evaluations[0].assessment, value.catalog);
  assert.equal(evaluations.length, 1);
  assert.equal(preview.variant_id, null);
  assert.equal(preview.matched_variant_id, null);
  assert.equal(preview.market_review_type, "full_set");
  const report = buildSeriesCompleteSetDiagnostic({ workflow: { run_id: "123", head_sha: "a".repeat(40) }, selection: { selected: [{ seriesId: value.series.id, variantId: value.variants[0].id, seriesName: value.series.name, variantName: value.variants[0].name }] }, records, evaluations, retrieval: { provider_request_counts: { rakuten_ichiba: 2, yahoo_shopping: 1 }, results_returned: 3 }, productionCountsBefore: { market_listings: 1 }, productionCountsAfter: { market_listings: 1 } });
  assert.equal(report.database_writes, 0);
  assert.equal(report.complete_set_accepted_count, 1);
  assert.equal(report.retrieval.provider_request_counts.rakuten_ichiba, 2);
  assert.equal(report.retrieval.normalized_records, 1);
  assert.deepEqual(report.selection.selected[0], { series_id: value.series.id, variant_id: value.variants[0].id, series_name: value.series.name, variant_name: value.variants[0].name });
  const markdown = renderSeriesCompleteSetDiagnosticMarkdown(report);
  assert.match(markdown, /Rakuten requests: 2/);
  assert.match(markdown, /Complete-set accepted: 1/);
});

test("complete-set diagnostic workflow is dispatch-only, bounded, and has no write path", () => {
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+(schedule|push|pull_request|workflow_run|repository_dispatch):/m);
  assert.match(workflow, /market-series-complete-set-diagnostic\.mjs/);
  assert.match(workflow, /MARKET_BACKFILL_WRITE_DISABLED:\s*"true"/);
  assert.match(workflow, /manual-market-audit-guard\.mjs scan/);
  assert.doesNotMatch(workflow, /canary-write|--mode=write|bounded-persist|db:upsert|cleanup|migration/i);
});
