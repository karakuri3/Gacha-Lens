import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildOfficialProviderCapabilityStatus, buildOfficialProviderIntegrationPreview, getOfficialProviderCapabilityProfile } from "../lib/domain/official-provider-capabilities.js";
import { fetchOfficialSourceExpansionDiagnostic, parseProviderDetail } from "../lib/fetchers/official-sources/registry.js";

const fixture = (name) => fs.readFileSync(`tests/fixtures/official/${name}`, "utf8");

test("Kitan decodes numeric and hexadecimal HTML entities without losing formal lineup identity", () => {
  const parsed = parseProviderDetail("kitan_club", fixture("kitan-whats-michael-detail.html"), "https://kitan.jp/products/whats_michael/");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.record.series_name, "What’s Michael？ フィギュアマスコット");
  assert.deepEqual(parsed.record.variants.map((variant) => variant.name), ["マイケル", "ロ’sマイケル"]);
  assert.equal(parsed.record.capability.series_metadata_status, "safe");
  assert.equal(parsed.record.capability.variant_catalog_status, "safe");
});

test("Kitan preserves conflicting declared count evidence while retaining the exact formal six-name lineup", () => {
  const parsed = parseProviderDetail("kitan_club", fixture("kitan-moomin-conflicting-count-detail.html"), "https://kitan.jp/products/moomin_vase/");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.record.variant_count, 6);
  assert.deepEqual(parsed.record.source_count_evidence, { detail_field_count: 5, formal_lineup_prose_count: 6, concrete_named_variant_count: 6 });
  assert.equal(parsed.record.source_count_conflict, true);
  assert.equal(parsed.record.capability.source_count_conflict, true);
  const preview = buildOfficialProviderIntegrationPreview("kitan_club", { records: [parsed.record] });
  assert.equal(preview.variant_catalog_candidate_count, 0);
  assert.equal(preview.source_count_conflict_excluded_count, 1);
  assert.equal(preview.production_integration_enabled, false);
  assert.equal(preview.database_writes, 0);
});

test("Kitan QBB retains six formal names without treating its promotional pickup as a seventh variant", () => {
  const parsed = parseProviderDetail("kitan_club", fixture("kitan-capwatch-qbb-detail.html"), "https://kitan.jp/products/capwatch_qbb/");
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.record.source_count_evidence, { detail_field_count: 6, formal_lineup_prose_count: 6, concrete_named_variant_count: 6 });
  assert.equal(parsed.record.source_count_conflict, false);
});

test("Qualia without a formal Lineup remains safe series metadata only", async () => {
  const snapshot = await fetchOfficialSourceExpansionDiagnostic({ currentDetailLimit: 1, requestDelayMs: 0, fetchImpl: async (url) => {
    if (url === "https://kitan.jp/products/") return response(fixture("kitan-list.html"), 200);
    if (url.includes("kitan.jp/products/")) return response(fixture("kitan-detail.html"), 200);
    if (url === "https://www.qualia-45.jp/product.html") return response(fixture("qualia-archive-navigation.html"), 200);
    if (url.includes("/product/search/ym:")) return response(fixture("qualia-list.html"), 200);
    if (url.includes("/product/view/")) return response(fixture("qualia-detail.html"), 200);
    if (url.startsWith("https://www.qualia-45.jp/distinations/")) return response("<main></main>", 200);
    return response("", 404);
  } });
  const qualia = snapshot.providers.find((provider) => provider.source === "qualia");
  assert.equal(qualia.records.length, 0);
  assert.equal(qualia.metadata_records.length, 1);
  assert.equal(qualia.metadata_records[0].capability.series_metadata_status, "safe");
  assert.equal(qualia.metadata_records[0].capability.variant_catalog_status, "unavailable");
  assert.equal(qualia.capability_profile.production_integration_enabled, false);
});

test("formal Lineup status upgrades only a safely linked Qualia variant catalog", () => {
  const metadata = { source_product_id: "1", official_url: "https://www.qualia-45.jp/product/view/1", manufacturer: "クオリア", series_name: "正式商品", release_month: "2026-08", price: 500 };
  const profile = getOfficialProviderCapabilityProfile("qualia");
  const status = buildOfficialProviderCapabilityStatus("qualia", { metadata, variants: [{ name: "正式variant" }] });
  assert.equal(profile.capability_support.SERIES_METADATA, "supported");
  assert.equal(profile.capability_support.VARIANT_CATALOG, "conditional_safe_link");
  assert.equal(status.series_metadata_status, "safe");
  assert.equal(status.variant_catalog_status, "safe");
  assert.equal(status.automatic_production_eligible, false);
});

function response(body, status) { return { ok: status >= 200 && status < 300, status, text: async () => body }; }
