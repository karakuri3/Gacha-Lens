import { applyMarketCandidateSafety } from "./market-match-safety.js";
import { assessMarketItemRelevance } from "../fetchers/market-item-relevance.js";

const REASON_CATEGORY = new Map([
  ["not_single_item", "listing_type_rejected"],
  ["parent_series_evidence_missing", "title_mismatch"],
  ["variant_name_not_explicit", "title_mismatch"],
  ["target_variant_not_confirmed", "variant_match_failed"],
  ["multiple_variant_candidates", "variant_match_failed"],
  ["explicit_variant_conflict", "variant_match_failed"],
  ["explicit_variant_label_conflict", "variant_match_failed"],
  ["explicit_variant_label_unresolved", "variant_match_failed"],
]);

export function runMarketRetrievalBenchmark({ records = [], queryPlan = [], catalog = {}, apiZeroResultQueries = 0 } = {}) {
  const normalized = [];
  const results = [];
  const seen = new Set();
  const reasonCounts = {
    api_zero_results: count(apiZeroResultQueries),
    normalization_rejected: 0,
    identity_missing: 0,
    title_mismatch: 0,
    variant_match_failed: 0,
    listing_type_rejected: 0,
    review_required: 0,
    duplicate: 0,
    accepted: 0,
  };

  for (const record of records) {
    const fixtureId = text(record.fixture_id || record.id || `fixture-${results.length + 1}`);
    const title = text(record.title || record.name);
    const price = Number(record.price);
    if (!title || !Number.isFinite(price) || price <= 0) {
      reasonCounts.normalization_rejected += 1;
      results.push(result(fixtureId, title, "normalization_rejected", "normalization_rejected"));
      continue;
    }
    const queryContext = record.raw?.query ?? { query: record.raw?.executed_query || "" };
    const relevance = assessMarketItemRelevance(title, {
      ...queryContext,
      query: record.raw?.executed_query || queryContext.query,
    });
    if (!relevance.accepted) {
      const category = relevance.reason === "normalization_rejected" ? "normalization_rejected" : "title_mismatch";
      reasonCounts[category] += 1;
      results.push(result(fixtureId, title, category, relevance.reason));
      continue;
    }
    const identity = text(record.id || record.raw?.itemCode || record.raw?.code || record.source_url);
    if (!identity) {
      reasonCounts.identity_missing += 1;
      results.push(result(fixtureId, title, "identity_missing", "identity_missing"));
      continue;
    }
    if (seen.has(identity)) {
      reasonCounts.duplicate += 1;
      results.push(result(fixtureId, title, "duplicate", "duplicate"));
      continue;
    }
    seen.add(identity);
    normalized.push(record);
  }

  const safety = applyMarketCandidateSafety({ records: normalized, queryPlan, catalog });
  safety.records.forEach((record, index) => {
    const assessment = safety.assessments[index];
    const fixtureId = text(record.fixture_id || record.id);
    if (assessment.accepted) {
      reasonCounts.accepted += 1;
      results.push({
        ...result(fixtureId, record.title, "accepted", assessment.reason),
        variant_id: assessment.variantId,
        listing_type: assessment.listingType,
      });
      return;
    }
    const category = REASON_CATEGORY.get(assessment.reason) || "review_required";
    reasonCounts[category] += 1;
    results.push({
      ...result(fixtureId, record.title, category, assessment.reason),
      variant_id: null,
      listing_type: assessment.listingType,
    });
  });

  return {
    variant_count: new Set(queryPlan.map((query) => query.variant_id).filter(Boolean)).size,
    query_count: queryPlan.reduce((sum, query) => sum + 1 + (query.fallback_queries?.length ?? 0), 0),
    marketplace_fixture_count: records.length,
    queries: queryPlan.map((query) => ({
      variant_id: text(query.variant_id),
      primary: text(query.query),
      fallbacks: (query.fallback_queries ?? []).map(text),
    })),
    rejection_reason_counts: reasonCounts,
    results: results.sort((left, right) => left.fixture_id.localeCompare(right.fixture_id)),
  };
}

function result(fixtureId, title, category, reason) {
  return {
    fixture_id: fixtureId,
    title,
    category,
    reason,
    accepted: category === "accepted",
  };
}

function text(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function count(value) {
  const number = Number(value ?? 0);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}
