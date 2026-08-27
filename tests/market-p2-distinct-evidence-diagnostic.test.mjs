import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildMarketCandidateKey } from "../lib/domain/market-candidate-key.js";
import {
  buildPriorityTwoDistinctEvidenceDiagnostic,
  renderPriorityTwoDistinctEvidenceDiagnosticMarkdown,
} from "../lib/domain/market-p2-distinct-evidence-diagnostic.js";
import {
  buildPriorityTwoDistinctEvidenceQueriesForVariant,
  planPriorityTwoDistinctEvidenceQueries,
  PRIORITY_TWO_DISTINCT_EVIDENCE_QUERY_PROFILE,
} from "../lib/fetchers/market-p2-distinct-evidence-query-planner.js";
import { buildPriorityTwoDistinctEvidenceReadOnlyDiagnostic, isNonAuthoritativeManualMarketAudit, sanitizeManualMarketAuditDiagnostic } from "../lib/domain/manual-market-audit-diagnostic.js";

const root = process.cwd();

function catalog() {
  const series = { id: "series-a", name: "銀魂 ねむらせ隊" };
  const variants = [
    { id: "p2", series_id: series.id, name: "沖田総悟", slug: "okita", released: true },
    { id: "p1", series_id: series.id, name: "priority one", slug: "p1", released: true },
    { id: "p3", series_id: "series-b", name: "priority three", slug: "p3", released: true },
    { id: "provisional", series_id: "series-c", name: "provisional", slug: "provisional", variant_type: "provisional", released: true },
  ];
  const seriesRows = [series, { id: "series-b", name: "Series B" }, { id: "series-c", name: "Series C" }];
  return { variants, series: seriesRows, variantById: new Map(variants.map((entry) => [entry.id, entry])), seriesById: new Map(seriesRows.map((entry) => [entry.id, entry])) };
}

function row(id, overrides = {}) {
  return {
    variantId: id,
    seriesId: id === "p2" || id === "p1" ? "series-a" : id === "p3" ? "series-b" : "series-c",
    seriesName: id === "p2" || id === "p1" ? "銀魂 ねむらせ隊" : "Other",
    variantName: id === "p2" ? "沖田総悟" : id,
    priority: 2,
    released: true,
    activeCount: 1,
    eligibleListingCount: 1,
    coverageState: "near_listing_guide",
    priorityReason: "two_active_listings_from_listing_guide",
    variantType: "",
    ...overrides,
  };
}

function queryPlan() {
  return [{
    query: "銀魂 ねむらせ隊 沖田総悟 ガチャ",
    fallback_queries: ["銀魂 ねむらせ隊 沖田総悟", "銀魂 ねむらせ隊 沖田総悟"],
    query_profile: PRIORITY_TWO_DISTINCT_EVIDENCE_QUERY_PROFILE,
    query_strategy_version: 2,
    priority: 2,
    variant_id: "p2",
    series_id: "series-a",
  }];
}

function candidate({ listingId = "same-1", url = "https://store.shopping.yahoo.co.jp/shop/same-1.html", accepted = true, status = "active" } = {}) {
  const source = { provider: "yahoo_shopping", listing_id: listingId, public_url: url };
  return {
    candidate_key: buildMarketCandidateKey(source),
    source,
    listing: { price: 500, status },
    target: { variant_id: "p2" },
    assessment: { accepted, review_required: !accepted, reason: accepted ? "variant_and_parent_evidence_confirmed" : "not_single_item", confidence: accepted ? 0.9 : 0.2 },
  };
}

function audit(candidates = []) {
  return {
    mode: "dry-run",
    source_scope: "planner-apis",
    manual_diagnostic: buildPriorityTwoDistinctEvidenceReadOnlyDiagnostic(),
    result: { candidate_count: candidates.length, accepted_count: candidates.filter((entry) => entry.assessment.accepted).length, review_count: candidates.filter((entry) => entry.assessment.review_required).length, report_complete: true, truncated_count: 0 },
    database_writes: { listings: 0, observations: 0, ingestion_runs: 0 },
    selection: { selected_variants: [{ variant_id: "p2", series_id: "series-a", series_name: "銀魂 ねむらせ隊", variant_name: "沖田総悟", priority: 2, query: queryPlan()[0].query }] },
    request_diagnostics: { queries: [
      { provider: "yahoo_shopping", query: queryPlan()[0].query, results_returned: 1 },
      { provider: "rakuten_ichiba", query: queryPlan()[0].fallback_queries[0], results_returned: 0 },
    ] },
    candidates,
  };
}

function counts() {
  return { market_listings: 62, market_listing_observations: 62, import_issues: 0, ingestion_runs: 0, series: 1, variants: 4, complete_set: 1 };
}

test("Priority 2 selection includes only released public variants with exactly one active eligible listing", () => {
  const plan = planPriorityTwoDistinctEvidenceQueries(catalog(), [
    row("p2"), row("p1", { priority: 1 }), row("p3", { priority: 3 }), row("provisional", { variantType: "provisional" }), row("p2-extra", { variantId: "p2-extra", seriesId: "series-a", variantName: "duplicate series" }),
  ], { limit: 5, rotationKey: "test" });
  assert.deepEqual(plan.selected.map((entry) => entry.variantId), ["p2"]);
  assert.equal(plan.queries[0].query_profile, PRIORITY_TWO_DISTINCT_EVIDENCE_QUERY_PROFILE);
});

test("Priority 2 planner preserves the no-gacha exact fallback inside the three-attempt budget", () => {
  const [query] = buildPriorityTwoDistinctEvidenceQueriesForVariant(catalog().variantById.get("p2"), catalog().seriesById.get("series-a"));
  assert.equal(query.query, "銀魂 ねむらせ隊 沖田総悟 ガチャ");
  assert.equal(query.fallback_queries.includes("銀魂 ねむらせ隊 沖田総悟"), true);
  assert.equal(1 + query.fallback_queries.length <= 3, true);
  assert.equal(query.fallback_queries.some((entry) => entry === "沖田総悟"), false);
});

test("accepted candidates matching listing ID, normalized source listing ID, or canonical URL are not distinct", () => {
  const durableId = candidate({ listingId: "durable-id", url: "https://store.shopping.yahoo.co.jp/shop/durable.html" });
  const same = candidate();
  const urlOnly = candidate({ listingId: "new-id", url: "https://store.shopping.yahoo.co.jp/shop/existing.html?tracking=ignored" });
  const result = buildPriorityTwoDistinctEvidenceDiagnostic({
    audit: audit([durableId, same, urlOnly]),
    queryPlan: queryPlan(),
    existingListings: [
      { id: "durable-id", variant_id: "p2", source: "yahoo", source_url: "https://store.shopping.yahoo.co.jp/shop/durable.html", raw: { itemCode: "other-item" } },
      { id: "other-durable-id", variant_id: "p2", source: "yahoo", source_url: "https://store.shopping.yahoo.co.jp/shop/old.html", raw: { itemCode: "same-1" } },
      { id: "legacy", variant_id: "p2", source: "yahoo", source_url: "https://store.shopping.yahoo.co.jp/shop/existing.html", raw: { itemCode: "legacy" } },
    ],
    before: counts(), after: counts(),
  });
  assert.equal(result.variants[0].accepted_existing_count, 3);
  assert.equal(result.variants[0].accepted_distinct_count, 0);
  assert.equal(result.summary.distinct_safe_variant_count, 0);
  assert.equal(result.variants[0].accepted_existing.some((entry) => entry.existing_match_fields.includes("listing_id")), true);
  assert.equal(result.variants[0].accepted_existing.some((entry) => entry.existing_match_fields.includes("source_listing_id")), true);
  assert.equal(result.variants[0].accepted_existing.some((entry) => entry.existing_match_fields.includes("source_url")), true);
  assert.equal(result.database_writes, 0);
});

test("a genuinely new accepted active source listing is distinct while unsafe and review candidates remain excluded", () => {
  const fresh = candidate({ listingId: "new-2", url: "https://store.shopping.yahoo.co.jp/other/new-2.html" });
  const review = candidate({ listingId: "review", accepted: false });
  const result = buildPriorityTwoDistinctEvidenceDiagnostic({
    audit: audit([fresh, review]), queryPlan: queryPlan(),
    existingListings: [{ id: "old", variant_id: "p2", source: "yahoo", source_url: "https://store.shopping.yahoo.co.jp/shop/old.html", raw: { itemCode: "old" } }],
    before: counts(), after: counts(),
  });
  assert.equal(result.variants[0].accepted_existing_count, 0);
  assert.equal(result.variants[0].accepted_distinct_count, 1);
  assert.deepEqual(result.variants[0].distinct_candidate_keys, [fresh.candidate_key]);
  assert.equal(result.variants[0].accepted_distinct[0].independent_merchant_evidence, "unknown");
  assert.equal(result.summary.distinct_safe_variant_count, 1);
  assert.match(renderPriorityTwoDistinctEvidenceDiagnosticMarkdown(result), /Accepted distinct: 1/);
});

test("Priority 2 diagnostic artifacts are read-only and refuse count deltas", () => {
  const value = buildPriorityTwoDistinctEvidenceDiagnostic({ audit: audit([candidate({ listingId: "new-2" })]), queryPlan: queryPlan(), existingListings: [], before: counts(), after: counts() });
  assert.equal(value.write_eligible, false);
  assert.equal(value.canary_eligible, false);
  assert.equal(value.zero_delta_verified, true);
  assert.throws(() => buildPriorityTwoDistinctEvidenceDiagnostic({ audit: audit([candidate({ listingId: "new-2" })]), queryPlan: queryPlan(), existingListings: [], before: counts(), after: { ...counts(), market_listings: 63 } }), /diagnostic contract|zero delta/i);
});

test("Priority 2 diagnostic metadata is explicitly non-authoritative for canary and writes", () => {
  const diagnostic = buildPriorityTwoDistinctEvidenceReadOnlyDiagnostic();
  assert.deepEqual(sanitizeManualMarketAuditDiagnostic(diagnostic), diagnostic);
  assert.equal(isNonAuthoritativeManualMarketAudit({ manual_diagnostic: diagnostic }), true);
});

test("dedicated diagnostic leaves the general planner and P3 V2 production path untouched", () => {
  const general = fs.readFileSync(path.join(root, "lib", "fetchers", "market-query-planner.js"), "utf8");
  const p3Auto = fs.readFileSync(path.join(root, ".github", "workflows", "gacha-market-p3-bounded-seed-v2-auto.yml"), "utf8");
  assert.doesNotMatch(general, /priority_2_distinct_exact_diagnostic/);
  assert.doesNotMatch(p3Auto, /priority.?2|distinct.?evidence/i);
});
