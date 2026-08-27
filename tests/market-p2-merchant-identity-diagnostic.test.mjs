import assert from "node:assert/strict";
import test from "node:test";

import { buildMarketCandidateKey } from "../lib/domain/market-candidate-key.js";
import { buildPriorityTwoMerchantIdentityReadOnlyDiagnostic } from "../lib/domain/manual-market-audit-diagnostic.js";
import {
  buildPriorityTwoDistinctEvidenceDiagnostic,
  PRIORITY_TWO_MERCHANT_IDENTITY_KIND,
} from "../lib/domain/market-p2-distinct-evidence-diagnostic.js";
import {
  buildMarketplaceStorefrontEvidenceByCandidateKey,
  buildSanitizedMarketplaceStorefrontProvenance,
  compareIndependentStorefrontEvidence,
  recoverRakutenLegacyShopCode,
  resolveMarketplaceStorefrontEvidence,
} from "../lib/domain/market-storefront-identity.js";
import { PRIORITY_TWO_DISTINCT_EVIDENCE_QUERY_PROFILE } from "../lib/fetchers/market-p2-distinct-evidence-query-planner.js";

const query = "銀魂 ねむらせ隊 沖田総悟 ガチャ";
const plan = [{ query, fallback_queries: ["銀魂 ねむらせ隊 沖田総悟"], query_profile: PRIORITY_TWO_DISTINCT_EVIDENCE_QUERY_PROFILE, priority: 2, variant_id: "v1", series_id: "s1" }];
const counts = { market_listings: 24, market_listing_observations: 24, import_issues: 0, ingestion_runs: 0, series: 1, variants: 1, complete_set: 0 };

function marketRecord({ provider = "rakuten_ichiba", listingId = "item-1", url = "https://item.rakuten.co.jp/store/item-1/", shopCode = "toysanta", shopName = "トイサンタ", sellerId, sellerName } = {}) {
  const raw = provider === "yahoo_shopping"
    ? { provider, code: listingId, seller: sellerId ? { sellerId, name: sellerName, private_note: "do-not-leak" } : {}, credential: "do-not-leak" }
    : { provider, itemCode: listingId, public_item_url: url, shopCode, shopName, credential: "do-not-leak" };
  return { id: `${provider}:${listingId}`, source: provider, source_url: url, raw };
}

function audit(candidates) {
  return {
    mode: "dry-run",
    source_scope: "planner-apis",
    manual_diagnostic: buildPriorityTwoMerchantIdentityReadOnlyDiagnostic(),
    result: { candidate_count: candidates.length, accepted_count: candidates.length, review_count: 0, report_complete: true, truncated_count: 0 },
    database_writes: { listings: 0, observations: 0, ingestion_runs: 0 },
    selection: { selected_variants: [{ variant_id: "v1", series_id: "s1", series_name: "銀魂 ねむらせ隊", variant_name: "沖田総悟", priority: 2, query }] },
    request_diagnostics: { queries: [{ provider: "rakuten_ichiba", query, results_returned: candidates.length }] },
    candidates,
  };
}

function candidate(record) {
  const provider = record.raw.provider;
  const listingId = provider === "yahoo_shopping" ? record.raw.code : record.raw.itemCode;
  const publicUrl = record.source_url;
  const source = { provider, listing_id: listingId, public_url: publicUrl };
  return {
    candidate_key: buildMarketCandidateKey(source),
    source,
    listing: { price: 568, status: "active" },
    target: { variant_id: "v1" },
    assessment: { accepted: true, review_required: false, reason: "variant_and_parent_evidence_confirmed", confidence: 0.91 },
  };
}

function diagnostic({ records, existingListings = [] }) {
  const candidates = records.map(candidate);
  return buildPriorityTwoDistinctEvidenceDiagnostic({
    audit: audit(candidates),
    queryPlan: plan,
    existingListings,
    candidateStorefronts: buildMarketplaceStorefrontEvidenceByCandidateKey(records),
    before: counts,
    after: counts,
    kind: PRIORITY_TWO_MERCHANT_IDENTITY_KIND,
  });
}

test("trusted same-provider codes identify the same storefront while different codes remain distinct", () => {
  const rakuten = resolveMarketplaceStorefrontEvidence(marketRecord({ shopCode: "toysanta" }));
  assert.deepEqual(rakuten, {
    provider: "rakuten_ichiba",
    storefront_id: "toysanta",
    storefront_name: "トイサンタ",
    storefront_identity_source: "rakuten_item_search_shop_code",
    merchant_identity: null,
    merchant_identity_status: "unknown",
  });
  assert.equal(compareIndependentStorefrontEvidence(rakuten, [{ ...rakuten }]), false);
  assert.equal(compareIndependentStorefrontEvidence(rakuten, [{ ...rakuten, storefront_id: "realize-store" }]), true);
});

test("Rakuten raw shopCode takes priority and valid legacy itemCode recovers only its formal shop code", () => {
  const preferred = resolveMarketplaceStorefrontEvidence({
    source: "rakuten_ichiba",
    raw: { provider: "rakuten_ichiba", shopCode: "toysanta", source_listing_id: "other-store:10381220" },
  });
  assert.equal(preferred.storefront_id, "toysanta");
  assert.equal(preferred.storefront_identity_source, "rakuten_item_search_shop_code");

  const legacy = resolveMarketplaceStorefrontEvidence({
    source: "rakuten_ichiba",
    raw: { provider: "rakuten_ichiba", source_listing_id: "auc-toysanta:10381220" },
  });
  assert.equal(legacy.storefront_id, "auc-toysanta");
  assert.equal(legacy.storefront_identity_source, "rakuten_item_code_shop_code_legacy");
  assert.equal(recoverRakutenLegacyShopCode({ source_listing_id: "auc-toysanta:10381220", itemCode: "auc-toysanta:10381220" }), "auc-toysanta");
});

test("malformed or ambiguous Rakuten itemCode values fail closed", () => {
  for (const source_listing_id of ["auc-toysanta", ":10381220", "auc toysanta:10381220", "auc-toysanta:", "auc-toysanta:10381220:extra", ""]) {
    const identity = resolveMarketplaceStorefrontEvidence({ source: "rakuten_ichiba", raw: { provider: "rakuten_ichiba", source_listing_id } });
    assert.equal(identity.storefront_id, null, source_listing_id || "empty");
  }
  assert.equal(recoverRakutenLegacyShopCode({ source_listing_id: "auc-toysanta:10381220", itemCode: "other-store:10381220" }), null);
});

test("Yahoo accepts only provider-issued IDs and never recovers a storefront from a canonical URL or display name", () => {
  const current = resolveMarketplaceStorefrontEvidence({ source: "yahoo_shopping", raw: { provider: "yahoo_shopping", seller: { sellerId: "toysanta", name: "トイサンタ" } } });
  const legacy = resolveMarketplaceStorefrontEvidence({ source: "yahoo_shopping", raw: { provider: "yahoo_shopping", sellerId: "toysanta" } });
  const ambiguous = resolveMarketplaceStorefrontEvidence({ source: "yahoo_shopping", source_url: "https://store.shopping.yahoo.co.jp/toysanta/item.html", raw: { provider: "yahoo_shopping", seller: { name: "トイサンタ" } } });
  assert.equal(current.storefront_id, "toysanta");
  assert.equal(legacy.storefront_identity_source, "yahoo_shopping_seller_id_legacy");
  assert.equal(ambiguous.storefront_id, null);
});

test("merchant diagnostic preserves distinct listing semantics and reports only safe storefront evidence", () => {
  const incoming = marketRecord({ listingId: "new", url: "https://item.rakuten.co.jp/realize-store/new/", shopCode: "realize-store", shopName: "Realize" });
  const existing = marketRecord({ listingId: "old", shopCode: "toysanta", shopName: "トイサンタ" });
  const result = diagnostic({ records: [incoming], existingListings: [{ ...existing, id: "old", variant_id: "v1" }] });
  const distinct = result.variants[0].accepted_distinct[0];
  assert.equal(distinct.classification, "accepted_distinct");
  assert.equal(distinct.storefront_id, "realize-store");
  assert.equal(distinct.independent_storefront_evidence, true);
  assert.equal(distinct.merchant_identity, null);
  assert.equal(distinct.merchant_identity_status, "unknown");
  assert.equal(result.summary.accepted_distinct_listing_count, 1);
  assert.equal(result.summary.distinct_storefront_count, 1);
  assert.equal(result.summary.independent_storefront_distinct_variant_count, 1);
  assert.equal(result.summary.independent_merchant_count, null);
  assert.equal(result.summary.independent_merchant_distinct_variant_count, null);
  assert.equal(result.database_writes, 0);
});

test("similar Rakuten and Yahoo display names never establish merchant equivalence", () => {
  const yahoo = marketRecord({ provider: "yahoo_shopping", listingId: "y1", url: "https://store.shopping.yahoo.co.jp/toysanta/y1.html", sellerId: "toysanta", sellerName: "トイサンタ" });
  const rakuten = marketRecord({ listingId: "r1", shopCode: "auc-toysanta", shopName: "トイサンタ" });
  const result = diagnostic({ records: [yahoo], existingListings: [{ ...rakuten, id: "r1", variant_id: "v1" }] });
  const distinct = result.variants[0].accepted_distinct[0];
  assert.equal(distinct.independent_storefront_evidence, true);
  assert.equal(distinct.merchant_identity, null);
  assert.equal(distinct.independent_merchant_evidence, "unknown");
  assert.equal(result.summary.merchant_identity_status, "unknown");
});

test("legacy existing Rakuten storefront evidence makes D1C same and different storefront comparisons deterministic", () => {
  const sameCandidate = marketRecord({ listingId: "new", url: "https://item.rakuten.co.jp/auc-toysanta/new/", shopCode: "auc-toysanta" });
  const sameExisting = { id: "old", variant_id: "v1", source: "rakuten_ichiba", source_url: "https://item.rakuten.co.jp/auc-toysanta/old/", raw: { provider: "rakuten_ichiba", source_listing_id: "auc-toysanta:10381220" } };
  assert.equal(diagnostic({ records: [sameCandidate], existingListings: [sameExisting] }).variants[0].accepted_distinct[0].independent_storefront_evidence, false);

  const differentCandidate = marketRecord({ listingId: "new", url: "https://item.rakuten.co.jp/realize-store/new/", shopCode: "realize-store" });
  assert.equal(diagnostic({ records: [differentCandidate], existingListings: [sameExisting] }).variants[0].accepted_distinct[0].independent_storefront_evidence, true);
});

test("a display name without a provider-issued ID is never treated as storefront or merchant identity", () => {
  const result = resolveMarketplaceStorefrontEvidence(marketRecord({ provider: "yahoo_shopping", sellerId: "", sellerName: "トイサンタ" }));
  assert.deepEqual(result, {
    provider: "yahoo_shopping",
    storefront_id: null,
    storefront_name: null,
    storefront_identity_source: null,
    merchant_identity: null,
    merchant_identity_status: "unknown",
  });
});

test("missing trusted storefront metadata stays unknown and sanitized artifacts exclude raw payloads", () => {
  const result = diagnostic({ records: [marketRecord({ shopCode: "", shopName: "" })], existingListings: [] });
  const distinct = result.variants[0].accepted_distinct[0];
  assert.equal(distinct.storefront_id, null);
  assert.equal(distinct.independent_storefront_evidence, "unknown");
  const serialized = JSON.stringify(result);
  for (const forbidden of ["credential", "do-not-leak", '"raw"', "seller"]) assert.equal(serialized.includes(forbidden), false);
});

test("future storefront provenance is a strict sanitized allowlist and does not infer merchant identity", () => {
  const provenance = buildSanitizedMarketplaceStorefrontProvenance(marketRecord({ shopCode: "auc-toysanta", shopName: "トイサンタ" }));
  assert.deepEqual(provenance, {
    storefront_id: "auc-toysanta",
    storefront_name: "トイサンタ",
    storefront_identity_source: "rakuten_item_search_shop_code",
  });
  const serialized = JSON.stringify(provenance);
  assert.doesNotMatch(serialized, /credential|raw|merchant|seller/i);
});
