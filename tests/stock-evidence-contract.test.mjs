import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildStockEvidenceContract,
  resolveStockEvidenceTarget,
} from "../lib/domain/stock-evidence-contract.js";
import { fetchStockRaw } from "../lib/fetchers/stock-fetcher.js";

const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/stock-evidence-contract.json", import.meta.url), "utf8"));
const catalog = {
  ...fixture.catalog,
  seriesById: new Map(fixture.catalog.series.map((entry) => [entry.id, entry])),
  variantById: new Map(fixture.catalog.variants.map((entry) => [entry.id, entry])),
};
const contract = (name, context = fixture.context) => buildStockEvidenceContract(fixture.records[name], context);
const resolve = (name, context = fixture.context) => resolveStockEvidenceTarget(contract(name, context), catalog);

test("valid series-level stock stays series-level and is blocked from variant persistence", () => {
  const value = contract("validSeries");
  assert.equal(value.evidence_scope, "series");
  assert.equal(value.local_identity.series_id, "series-alpha");
  assert.equal(value.local_identity.variant_id, null);
  assert.equal(value.provider_identity.product_id, "P-100");
  assert.equal(value.provider_identity.jan, "4580000000001");
  assert.equal(value.provider_identity.store_id, "SHOP-1");
  assert.equal(value.fetched_at, fixture.context.fetched_at);
  const target = resolve("validSeries");
  assert.equal(target.series.id, "series-alpha");
  assert.equal(target.variant, null);
  assert.equal(target.persistence_blocked, true);
  assert.equal(target.reason, "series_level_persistence_unsupported");
});

test("valid variant-level stock resolves exact variant without regression", () => {
  const target = resolve("validVariant");
  assert.equal(target.variant.id, "alpha-green");
  assert.equal(target.series.id, "series-alpha");
  assert.equal(target.persistence_blocked, false);
});

test("both local IDs must agree", () => {
  const target = resolve("bothIds");
  assert.equal(target.variant.id, "alpha-green");
  assert.equal(target.series.id, "series-alpha");
  assert.equal(target.persistence_blocked, false);
});

test("invalid series ID fails closed even when variant ID is valid", () => {
  const target = resolve("invalidSeries");
  assert.equal(target.variant, null);
  assert.equal(target.persistence_blocked, true);
  assert.equal(target.reason, "invalid_series_id");
});

test("invalid variant ID never falls back to a text match", () => {
  const target = resolve("invalidVariant");
  assert.equal(target.variant, null);
  assert.equal(target.persistence_blocked, true);
  assert.equal(target.reason, "invalid_variant_id");
});

test("known series with no variant never selects a variant from text", () => {
  const target = resolve("seriesValidVariantMissing");
  assert.equal(target.series.id, "series-alpha");
  assert.equal(target.variant, null);
  assert.equal(target.reason, "series_level_persistence_unsupported");
});

test("ambiguous legacy text does not choose the first variant", () => {
  const target = resolve("ambiguousText");
  assert.equal(target.variant, null);
  assert.equal(target.persistence_blocked, false);
  assert.equal(target.reason, "ambiguous_variant_text");
  assert.deepEqual(target.candidate_variant_ids.sort(), ["alpha-red", "alpha-red-special"]);
});

test("provider identity only is preserved without invented local identity", () => {
  const value = contract("providerIdentityOnly");
  assert.equal(value.evidence_scope, "provider_product");
  assert.equal(value.provider_identity.product_id, "P-200");
  assert.equal(value.provider_identity.jan, "4580000000002");
  assert.equal(value.provider_identity.store_id, "SHOP-2");
  const target = resolve("providerIdentityOnly");
  assert.equal(target.variant, null);
  assert.equal(target.series, null);
  assert.equal(target.persistence_blocked, true);
  assert.equal(target.reason, "provider_identity_unresolved");
});

test("missing timestamp and provenance are explicit review semantics", () => {
  const value = contract("missingTimestampProvenance", { fetched_at: fixture.context.fetched_at });
  assert.equal(value.review_required, true);
  assert.ok(value.review_reasons.includes("missing_provider_timestamp"));
  assert.ok(value.review_reasons.includes("missing_provenance"));
  assert.equal(value.confidence, 0.25);
});

test("legacy unscoped unique text keeps current variant matching behavior", () => {
  const target = resolve("legacyUniqueText");
  assert.equal(target.variant.id, "alpha-green");
  assert.equal(target.series.id, "series-alpha");
  assert.equal(target.reason, "legacy_text_variant_match");
  assert.equal(target.persistence_blocked, false);
});


test("stock fetcher carries scope, provider identity, timestamps, provenance, and raw evidence", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify({ stockReportsRaw: [fixture.records.validSeries] }),
  });

  try {
    const result = await fetchStockRaw({
      rawFeedUrls: "https://provider.example/feed.json",
      fetchedAt: fixture.context.fetched_at,
      xSearchEnabled: false,
    });
    assert.equal(result.stockReportsRaw.length, 1);
    const row = result.stockReportsRaw[0];
    assert.equal(row.evidence_scope, "series");
    assert.equal(row.provider_product_id, "P-100");
    assert.equal(row.provider_jan, "4580000000001");
    assert.equal(row.provider_store_id, "SHOP-1");
    assert.equal(row.reported_at, "2026-10-02T01:55:00+09:00");
    assert.equal(row.fetched_at, fixture.context.fetched_at);
    assert.equal(row.provenance.source, "stock_raw_feed");
    assert.equal(row.raw.stock_contract.evidence_scope, "series");
    assert.equal(row.raw.stock_contract.raw_evidence.id, "series-stock");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
