import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildOfficialSourceExpansionReport, findOfficialSourceExpansionLeaks, formatOfficialSourceExpansionMarkdown } from "../lib/domain/official-source-expansion-diagnostic.js";
import { fetchOfficialSourceExpansionDiagnostic, listOfficialSourceExpansionProviders, parseProviderDetail, parseProviderList } from "../lib/fetchers/official-sources/registry.js";

const fixture = (name) => fs.readFileSync(`tests/fixtures/official/${name}`, "utf8");
const workflow = fs.readFileSync(".github/workflows/gacha-official-source-expansion-diagnostic.yml", "utf8");
const manualOfficialWorkflow = fs.readFileSync(".github/workflows/gacha-official-read-only-audit.yml", "utf8");
const automaticOfficialWorkflow = fs.readFileSync(".github/workflows/gacha-official-bounded-auto.yml", "utf8");

test("registry contains only diagnostic Kitan Club and Qualia providers", () => {
  assert.deepEqual(listOfficialSourceExpansionProviders().map((provider) => provider.source), ["kitan_club", "qualia"]);
});

test("Kitan Club parser retains exact lineup, secret notation, variant images, and stable identities", () => {
  const parsed = parseProviderDetail("kitan_club", fixture("kitan-detail.html"), "https://kitan.jp/products/kitan-current");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.record.variant_count, 2);
  assert.deepEqual(parsed.record.variants.map((variant) => variant.name), ["シークレット", "ノーマル"]);
  assert.equal(parsed.record.image_scope_candidate, "variant");
  assert.match(parsed.record.diagnostic_identity.series_id, /kitan_club:kitan-current/);
});

test("Qualia parser preserves an exact-day release and classifies a shared image as series-only", () => {
  const parsed = parseProviderDetail("qualia", fixture("qualia-detail.html"), "https://qualia-45.jp/product/qualia-current");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.record.release_date, "2026-10-15");
  assert.equal(parsed.record.price, 500);
  assert.equal(parsed.record.image_scope_candidate, "series");
});

test("provider list parsing is canonical, bounded later, and rejects foreign URLs", () => {
  assert.equal(parseProviderList("kitan_club", fixture("kitan-list.html"), "https://kitan.jp/products/").length, 2);
  assert.equal(parseProviderList("qualia", '<a href="https://example.invalid/product/nope">No</a>', "https://qualia-45.jp/").length, 0);
});

test("missing fields and malformed details fail closed", () => {
  assert.deepEqual(parseProviderDetail("kitan_club", "<h1>Missing lineup</h1>", "https://kitan.jp/products/missing"), { ok: false, issue_code: "official_detail_zero_lineup" });
  assert.deepEqual(parseProviderDetail("qualia", fixture("qualia-detail.html").replace("全2種", "全3種"), "https://qualia-45.jp/product/qualia-current"), { ok: false, issue_code: "official_detail_variant_count_mismatch" });
});

test("diagnostic fetch is sequential, observes request budgets, emits metrics, and never reaches a write path", async () => {
  const pages = new Map([
    ["https://kitan.jp/products/", fixture("kitan-list.html")],
    ["https://kitan.jp/products/kitan-current", fixture("kitan-detail.html")],
    ["https://kitan.jp/products/kitan-archive", fixture("kitan-detail.html").replace("kitan-current", "kitan-archive")],
    ["https://qualia-45.jp/", fixture("qualia-list.html")],
    ["https://qualia-45.jp/product/qualia-current", fixture("qualia-detail.html")],
    ["https://qualia-45.jp/product/qualia-rerelease", fixture("qualia-detail.html").replace("qualia-current", "qualia-rerelease")],
  ]);
  const calls = [];
  const snapshot = await fetchOfficialSourceExpansionDiagnostic({ currentDetailLimit: 2, requestDelayMs: 0, fetchImpl: async (url) => {
    calls.push(url); return response(pages.get(url) || "", pages.has(url) ? 200 : 404);
  } });
  assert.equal(calls.length, 6);
  assert.ok(snapshot.providers.every((provider) => provider.detail_attempted <= 2));
  const report = buildOfficialSourceExpansionReport({ snapshot, workflow: { run_id: "1", head_sha: "a".repeat(40) }, database: { zero_delta_verified: true } });
  assert.equal(report.database_writes, 0);
  assert.equal(report.production_integration_enabled, false);
  assert.ok(report.providers.every((provider) => provider.metrics.request_count >= 3));
});

test("backfill sample is bounded, reports a future cursor, and never executes a full backfill", async () => {
  const snapshot = await fetchOfficialSourceExpansionDiagnostic({ mode: "BACKFILL_SAMPLE", backfillSampleDetailLimit: 1, requestDelayMs: 0, fetchImpl: async (url) => {
    if (url === "https://kitan.jp/products/") return response(fixture("kitan-list.html"), 200);
    if (url === "https://qualia-45.jp/") return response(fixture("qualia-list.html"), 200);
    if (url.includes("kitan")) return response(fixture("kitan-detail.html"), 200);
    return response(fixture("qualia-detail.html"), 200);
  } });
  assert.equal(snapshot.cursor.full_backfill_executed, false);
  assert.ok(snapshot.providers.every((provider) => provider.detail_attempted === 1));
});

test("duplicate identities are reported and sanitized reports cannot contain secrets or raw payloads", () => {
  const record = parseProviderDetail("qualia", fixture("qualia-detail.html"), "https://qualia-45.jp/product/qualia-current").record;
  const report = buildOfficialSourceExpansionReport({ snapshot: { providers: [{ source: "qualia", manufacturer: "クオリア", parser_success: true, records: [record, record], request_count: 3, products_discovered: 2 }] }, database: { zero_delta_verified: true } });
  assert.equal(report.providers[0].metrics.duplicate_product_identities, 1);
  const markdown = formatOfficialSourceExpansionMarkdown(report);
  assert.match(markdown, /Database writes: 0/);
  assert.deepEqual(findOfficialSourceExpansionLeaks([{ name: "ok.json", text: JSON.stringify(report) }], ["private-value"]), []);
  assert.deepEqual(findOfficialSourceExpansionLeaks([{ name: "bad.json", text: '{"raw_response":"x"}' }]), ["bad.json:forbidden_fields"]);
});

test("workflow is dispatch-only, validates bounded diagnostic modes, uploads run-scoped artifacts, and has no write credentials", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bschedule:|\bpush:|\bpull_request:|\bworkflow_run:|\brepository_dispatch:/);
  assert.match(workflow, /options: \[CURRENT, BACKFILL_SAMPLE\]/);
  assert.match(workflow, /INGESTION_WRITE_DISABLED: "true"/);
  assert.match(workflow, /official-source-expansion-diagnostic-\$\{\{ github\.run_id \}\}/);
  assert.doesNotMatch(workflow, /SUPABASE|db:upsert|bounded-auto|official:bounded-write|workflow enable|workflow disable/i);
});

test("existing manual and automatic official workflows remain isolated", () => {
  assert.match(manualOfficialWorkflow, /name: Gacha Official Read-Only Audit/);
  assert.match(automaticOfficialWorkflow, /name: Gacha Official Bounded Automatic Production/);
});

function response(body, status) { return { ok: status >= 200 && status < 300, status, text: async () => body }; }
