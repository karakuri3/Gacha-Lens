import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildOfficialSourceExpansionReport, findOfficialSourceExpansionLeaks, formatOfficialSourceExpansionMarkdown } from "../lib/domain/official-source-expansion-diagnostic.js";
import { fetchOfficialSourceExpansionDiagnostic, linkQualiaProductToLineup, listOfficialSourceExpansionProviders, parseProviderDetail, parseProviderList, parseQualiaArchiveNavigation, parseQualiaLineupDocument } from "../lib/fetchers/official-sources/registry.js";

const fixture = (name) => fs.readFileSync(`tests/fixtures/official/${name}`, "utf8");
const workflow = fs.readFileSync(".github/workflows/gacha-official-source-expansion-diagnostic.yml", "utf8");
const manualOfficialWorkflow = fs.readFileSync(".github/workflows/gacha-official-read-only-audit.yml", "utf8");
const automaticOfficialWorkflow = fs.readFileSync(".github/workflows/gacha-official-bounded-auto.yml", "utf8");

test("registry contains only diagnostic Kitan Club and Qualia providers", () => {
  assert.deepEqual(listOfficialSourceExpansionProviders().map((provider) => provider.source), ["kitan_club", "qualia"]);
});

test("Kitan Club parser uses the live detail prose plus pickup image/name structure", () => {
  const parsed = parseProviderDetail("kitan_club", fixture("kitan-detail.html"), "https://kitan.jp/products/hato_nuigurumi/");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.record.variant_count, 4);
  assert.equal(parsed.record.price, 400);
  assert.equal(parsed.record.release_month, "2026-08");
  assert.equal(parsed.record.release_date, null);
  assert.deepEqual(parsed.record.variants.map((variant) => variant.name), ["シロ", "グレー", "クロ", "チャ"]);
  assert.equal(parsed.record.image_scope_candidate, "variant");
  assert.match(parsed.record.diagnostic_identity.series_id, /kitan_club:hato_nuigurumi/);
});

test("Qualia parser reads the live product/view metadata but fails closed without named variants", () => {
  const parsed = parseProviderDetail("qualia", fixture("qualia-detail.html"), "https://www.qualia-45.jp/product/view/2031");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.issue_code, "official_detail_zero_lineup");
  assert.equal(parsed.metadata.series_name, "殻からの脱出。 マスコットフィギュア");
  assert.equal(parsed.metadata.price, 400);
  assert.equal(parsed.metadata.release_month, "2026-08");
});

test("Qualia formal distinations Lineup parses bounded names without guessed product links", () => {
  const lineup = parseQualiaLineupDocument(fixture("qualia-distinations-lineup.html"), "https://www.qualia-45.jp/distinations/real-kyoryu-headc/");
  assert.equal(lineup.ok, true);
  assert.equal(lineup.record.price, 500);
  assert.equal(lineup.record.release_month, "2025-07");
  assert.equal(lineup.record.release_date, null);
  assert.deepEqual(lineup.record.variant_names, ["トリケラトプス", "ティラノサウルス", "ステゴサウルス", "ブラキオサウルス"]);

  const linked = linkQualiaProductToLineup({ series_name: "リアル恐竜ヘッドコレクション", release_month: "2025-07", price: 500 }, lineup);
  assert.equal(linked.linked, true);
  assert.equal(linked.variants.length, 4);
  assert.equal(linkQualiaProductToLineup({ series_name: "別商品", release_month: "2025-07", price: 500 }, lineup).linked, false);
  assert.equal(linkQualiaProductToLineup({ series_name: "リアル恐竜ヘッドコレクション", release_month: "2025-08", price: 500 }, lineup).reason, "lineup_release_month_mismatch");
});

test("provider list parsing is canonical, bounded later, and rejects foreign URLs", () => {
  assert.equal(parseProviderList("kitan_club", fixture("kitan-list.html"), "https://kitan.jp/products/").length, 2);
  assert.equal(parseProviderList("qualia", '<a href="https://example.invalid/product/nope">No</a>', "https://www.qualia-45.jp/product.html").length, 0);
});

test("missing fields and malformed details fail closed", () => {
  assert.deepEqual(parseProviderDetail("kitan_club", "<h1>Missing lineup</h1>", "https://kitan.jp/products/missing"), { ok: false, issue_code: "official_detail_parse_failed" });
  assert.deepEqual(parseProviderDetail("kitan_club", fixture("kitan-detail.html").replaceAll("全4種", "全3種"), "https://kitan.jp/products/hato_nuigurumi/"), { ok: false, issue_code: "official_detail_variant_count_mismatch", metadata: { series_name: "鳩のぬいぐるみ", release_month: "2026-08", price: 400 } });
});

test("diagnostic fetch is sequential, observes request budgets, emits metrics, and never reaches a write path", async () => {
  const pages = new Map([
    ["https://kitan.jp/products/", fixture("kitan-list.html")],
    ["https://kitan.jp/products/hato_nuigurumi/", fixture("kitan-detail.html")],
    ["https://kitan.jp/products/archive_2010/", fixture("kitan-detail.html")],
    ["https://www.qualia-45.jp/product.html", fixture("qualia-list.html")],
    ["https://www.qualia-45.jp/product/view/2031", fixture("qualia-detail.html")],
    ["https://www.qualia-45.jp/product/view/1019", fixture("qualia-detail.html")],
  ]);
  const calls = [];
  const snapshot = await fetchOfficialSourceExpansionDiagnostic({ currentDetailLimit: 2, requestDelayMs: 0, fetchImpl: async (url) => {
    calls.push(url); return response(pages.get(url) || "", pages.has(url) ? 200 : 404);
  } });
  assert.equal(calls.length, 6);
  assert.ok(snapshot.providers.every((provider) => provider.detail_attempted <= 2));
  assert.equal(snapshot.providers.find((provider) => provider.source === "qualia").metadata_records.length, 2);
  assert.equal(snapshot.providers.find((provider) => provider.source === "qualia").metadata_records[0].series_name, "殻からの脱出。 マスコットフィギュア");
  const report = buildOfficialSourceExpansionReport({ snapshot, workflow: { run_id: "1", head_sha: "a".repeat(40) } });
  assert.equal(report.database_writes, 0);
  assert.equal(report.production_integration_enabled, false);
  assert.ok(report.providers.every((provider) => provider.metrics.request_count >= 3));
});

test("two bounded historical samples advance deterministic provider cursors without a full backfill", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("hato_nuigurumi") || url.includes("archive_2010")) return response(fixture("kitan-detail.html"), 200);
    if (url.includes("/product/view/")) return response(fixture("qualia-detail.html"), 200);
    if (url.includes("/product/search/ym:")) return response(fixture("qualia-list.html"), 200);
    if (url.includes("product_age") || url.includes("kitan.jp/products/")) return response(fixture("kitan-list.html"), 200);
    return response(fixture("qualia-archive-navigation.html"), 200);
  };
  const snapshot = await fetchOfficialSourceExpansionDiagnostic({ mode: "BACKFILL_SAMPLE", backfillSampleDetailLimit: 1, requestDelayMs: 0, fetchImpl });
  assert.equal(snapshot.cursor.full_backfill_executed, false);
  assert.ok(snapshot.providers.every((provider) => provider.detail_attempted === 1));
  assert.deepEqual(snapshot.cursor.providers, { kitan_club: "2011", qualia: "2020-06" });
  const next = await fetchOfficialSourceExpansionDiagnostic({ mode: "BACKFILL_SAMPLE", providerCursors: snapshot.cursor.providers, backfillSampleDetailLimit: 1, requestDelayMs: 0, fetchImpl });
  assert.deepEqual(next.cursor.providers, { kitan_club: "2012", qualia: "2021-01" });
  assert.notEqual(next.providers[0].archive_cursor, snapshot.providers[0].archive_cursor);
  assert.notEqual(next.providers[1].archive_cursor, snapshot.providers[1].archive_cursor);
});

test("Qualia archive navigation uses only actual sparse official months", () => {
  const entries = parseQualiaArchiveNavigation(fixture("qualia-archive-navigation.html"), "https://www.qualia-45.jp/product.html");
  assert.deepEqual(entries.map((entry) => entry.value), ["2019-01", "2020-06", "2021-01"]);
  assert.equal(entries.some((entry) => entry.value === "2019-02"), false);
  assert.ok(entries.every((entry) => entry.url.startsWith("https://www.qualia-45.jp/product/search/ym:")));
});

test("an absent persisted Qualia archive cursor fails closed instead of repeating the first archive", async () => {
  const snapshot = await fetchOfficialSourceExpansionDiagnostic({
    mode: "BACKFILL_SAMPLE",
    providerCursors: { qualia: "2019-02" },
    requestDelayMs: 0,
    fetchImpl: async (url) => response(url.includes("qualia-45") ? fixture("qualia-archive-navigation.html") : fixture("kitan-list.html"), 200),
  });
  const qualia = snapshot.providers.find((provider) => provider.source === "qualia");
  assert.deepEqual(qualia.issue_codes, ["official_archive_cursor_not_found"]);
  assert.equal(qualia.detail_attempted, 0);
});

test("duplicate identities are reported and sanitized reports cannot contain secrets or raw payloads", () => {
  const record = parseProviderDetail("kitan_club", fixture("kitan-detail.html"), "https://kitan.jp/products/hato_nuigurumi/").record;
  const report = buildOfficialSourceExpansionReport({ snapshot: { providers: [{ source: "kitan_club", manufacturer: "キタンクラブ", parser_success: true, records: [record, record], request_count: 3, products_discovered: 2 }] } });
  assert.equal(report.providers[0].metrics.duplicate_product_identities, 1);
  const markdown = formatOfficialSourceExpansionMarkdown(report);
  assert.match(markdown, /Database writes: 0/);
  assert.match(markdown, /Database accessed: false/);
  assert.equal(report.database.zero_delta_verified, null);
  assert.equal(report.database.structural_write_isolation, true);
  assert.deepEqual(findOfficialSourceExpansionLeaks([{ name: "ok.json", text: JSON.stringify(report) }], ["private-value"]), []);
  assert.deepEqual(findOfficialSourceExpansionLeaks([{ name: "bad.json", text: '{"raw_response":"x"}' }]), ["bad.json:forbidden_fields"]);
});

test("workflow is dispatch-only, validates bounded diagnostic modes, uploads run-scoped artifacts, and has no write credentials", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bschedule:|\bpush:|\bpull_request:|\bworkflow_run:|\brepository_dispatch:/);
  assert.match(workflow, /options: \[CURRENT, BACKFILL_SAMPLE\]/);
  assert.match(workflow, /cursor:/);
  assert.match(workflow, /INGESTION_WRITE_DISABLED: "true"/);
  assert.match(workflow, /official-source-expansion-diagnostic-\$\{\{ github\.run_id \}\}/);
  assert.doesNotMatch(workflow, /SUPABASE|db:upsert|bounded-auto|official:bounded-write|workflow enable|workflow disable/i);
});

test("existing manual and automatic official workflows remain isolated", () => {
  assert.match(manualOfficialWorkflow, /name: Gacha Official Read-Only Audit/);
  assert.match(automaticOfficialWorkflow, /name: Gacha Official Bounded Automatic Production/);
});

function response(body, status) { return { ok: status >= 200 && status < 300, status, text: async () => body }; }
