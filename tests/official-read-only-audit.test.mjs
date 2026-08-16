import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildOfficialReadOnlyAudit,
  findOfficialAuditLeaks,
  formatOfficialReadOnlyAuditMarkdown,
  validateOfficialReadOnlyAudit,
} from "../lib/domain/official-read-only-audit.js";
import {
  buildOfficialLiveSourceUrls,
  fetchOfficialLiveSnapshot,
  selectOfficialAuditDetails,
} from "../lib/fetchers/official-live-audit.js";
import {
  parseOfficialDetailDocument,
  parseOfficialSourceDocument,
} from "../lib/fetchers/official-fetcher.js";

const fixture = (name) => fs.readFileSync(`tests/fixtures/official/${name}`, "utf8");
const gashaponDetailUrl = "https://gashapon.jp/products/detail.php?jan_code=4570000000001000";
const takaratomyDetailUrl = "https://www.takaratomy-arts.co.jp/items/item.html?n=Y900001";
const workflow = fs.readFileSync(".github/workflows/gacha-official-read-only-audit.yml", "utf8");
const legacyWorkflow = fs.readFileSync(".github/workflows/gacha-ingestion.yml", "utf8");
const routine = fs.readFileSync("scripts/run-official-ingestion.mjs", "utf8");
const auditRunner = fs.readFileSync("scripts/official-live-audit.mjs", "utf8");

test("Gashapon schedule fixture preserves URL, title, month, week, price, and image", () => {
  const parsed = parseOfficialSourceDocument(
    fixture("gashapon-schedule-card.html"),
    "https://gashapon.jp/schedule/?ym=202608",
  );
  assert.equal(parsed.records.length, 1);
  assert.deepEqual(pick(parsed.records[0], ["name", "release_month", "release_week", "release_date", "price", "official_url", "image_url"]), {
    name: "監査ガシャポン コレクション",
    release_month: "8月",
    release_week: "第2週",
    release_date: "2026-08-01",
    price: 400,
    official_url: gashaponDetailUrl,
    image_url: "https://example.invalid/gashapon-series.jpg",
  });
});

test("Gashapon detail fixture yields an exact formal lineup and variant images", () => {
  const parsed = parseOfficialDetailDocument(fixture("gashapon-detail.html"), gashaponDetailUrl);
  assert.equal(parsed.issues.length, 0);
  assert.equal(parsed.record.review_required, false);
  assert.equal(parsed.record.variants.length, 2);
  assert.deepEqual(parsed.record.variants.map((variant) => [variant.name, variant.image_url]), [
    ["レッド", "https://gashapon.jp/images/red.jpg"],
    ["ブルー", "https://gashapon.jp/images/blue.jpg"],
  ]);
});

test("Gashapon variant-count drift discards a partial formal lineup", () => {
  const body = fixture("gashapon-detail.html").replace("全2種", "全3種");
  const parsed = parseOfficialDetailDocument(body, gashaponDetailUrl);
  assert.equal(parsed.record.review_required, true);
  assert.equal(parsed.record.variants.length, 0);
  assert.match(parsed.issues[0].note, /variant count mismatch/);
});

test("missing Gashapon expected count cannot produce a formal lineup", () => {
  const body = fixture("gashapon-detail.html").replace("全2種", "未掲載");
  const parsed = parseOfficialDetailDocument(body, gashaponDetailUrl);
  assert.equal(parsed.record.review_required, true);
  assert.equal(parsed.record.variants.length, 0);
});

test("Takara Tomy Arts search fixture preserves product contract", () => {
  const parsed = parseOfficialSourceDocument(
    fixture("takaratomy-search-card.html"),
    "https://www.takaratomy-arts.co.jp/items/gacha/search.html?order=release&p=1&sort=0",
  );
  assert.equal(parsed.records.length, 1);
  assert.deepEqual(pick(parsed.records[0], ["name", "release_month", "release_week", "release_date", "price", "official_url", "image_url"]), {
    name: "監査ミニチュア コレクション",
    release_month: "8月",
    release_week: "第3週",
    release_date: "2026-08-17",
    price: 300,
    official_url: takaratomyDetailUrl,
    image_url: "https://www.takaratomy-arts.co.jp/items/img/Y900001.jpg",
  });
});

test("Takara Tomy Arts detail fixture yields exact names and count", () => {
  const parsed = parseOfficialDetailDocument(fixture("takaratomy-detail.html"), takaratomyDetailUrl);
  assert.equal(parsed.issues.length, 0);
  assert.equal(parsed.record.review_required, false);
  assert.deepEqual(parsed.record.variants.map((variant) => variant.name), ["シルバー", "ゴールド"]);
  assert.equal(parsed.record.price, 300);
  assert.equal(parsed.record.release_week, "第3週");
});

test("Takara Tomy Arts variant-count drift discards partial variants", () => {
  const body = fixture("takaratomy-detail.html").replaceAll("全2種", "全3種");
  const parsed = parseOfficialDetailDocument(body, takaratomyDetailUrl);
  assert.equal(parsed.record.review_required, true);
  assert.equal(parsed.record.variants.length, 0);
  assert.match(parsed.issues[0].note, /variant count mismatch/);
});

test("missing Takara Tomy Arts expected count cannot produce a formal lineup", () => {
  const body = fixture("takaratomy-detail.html").replaceAll("全2種", "種類数未掲載");
  const parsed = parseOfficialDetailDocument(body, takaratomyDetailUrl);
  assert.equal(parsed.record.review_required, true);
  assert.equal(parsed.record.variants.length, 0);
});

test("live source month follows JST at the UTC month boundary", () => {
  assert.match(buildOfficialLiveSourceUrls(new Date("2026-07-31T15:05:00.000Z")).gashapon_schedule, /ym=202608/);
});

test("malformed and zero-result source fails closed", () => {
  const parsed = parseOfficialSourceDocument(fixture("malformed-zero.html"), "https://gashapon.jp/schedule/?ym=202608");
  assert.equal(parsed.records.length, 0);
  assert.equal(parsed.detailUrls.length, 0);
});

test("detail selection keeps upcoming, recent, market-interest, then older priority", () => {
  const now = new Date("2026-08-16T00:00:00.000Z");
  const selected = selectOfficialAuditDetails([
    discovery("old", "2025-01-01"),
    discovery("interest", "2025-02-01"),
    discovery("recent", "2026-08-01"),
    discovery("upcoming", "2026-09-01"),
  ], {
    now,
    gashaponLimit: 2,
    takaratomyLimit: 2,
    marketInterestOfficialUrls: [urlFor("interest")],
  });
  assert.deepEqual(selected.map((entry) => entry.record.id), ["upcoming", "recent"]);
  const lowerPriority = selectOfficialAuditDetails([
    discovery("old", "2025-01-01"),
    discovery("interest", "2025-02-01"),
  ], {
    now,
    gashaponLimit: 2,
    takaratomyLimit: 2,
    marketInterestOfficialUrls: [urlFor("interest")],
  });
  assert.deepEqual(lowerPriority.map((entry) => entry.record.id), ["interest", "old"]);
});

test("live snapshot is bounded to two detail requests per provider", async () => {
  const pages = new Map([
    ["https://gashapon.jp/schedule/?ym=202608", fixture("gashapon-schedule-card.html")],
    ["https://gashapon.jp/products/", '<a href="detail.php?jan_code=4570000000001000">x</a>'],
    ["https://www.takaratomy-arts.co.jp/items/gacha/search.html?order=release&p=1&sort=0", fixture("takaratomy-search-card.html")],
    [gashaponDetailUrl, fixture("gashapon-detail.html")],
    [takaratomyDetailUrl, fixture("takaratomy-detail.html")],
  ]);
  const calls = [];
  const snapshot = await fetchOfficialLiveSnapshot({
    now: new Date("2026-08-16T00:00:00.000Z"),
    sourceUrls: {
      gashapon_schedule: "https://gashapon.jp/schedule/?ym=202608",
      gashapon_products: "https://gashapon.jp/products/",
      takaratomy_search: "https://www.takaratomy-arts.co.jp/items/gacha/search.html?order=release&p=1&sort=0",
    },
    fetchImpl: async (url) => {
      calls.push(url);
      const body = pages.get(url);
      return response(body ?? "", body == null ? 404 : 200);
    },
  });
  assert.equal(calls.length, 5);
  assert.equal(snapshot.formal_records.length, 2);
  assert.ok(snapshot.sources.every((source) => source.detail_attempts <= 2));
  assert.equal(snapshot.sources.find((source) => source.source === "gashapon_schedule").detail_attempts, 1);
  assert.equal(snapshot.sources.find((source) => source.source === "gashapon_products").detail_attempts, 0);
});

test("bounded plan uses exact identity and marks provisional replacement without deletes", () => {
  const report = readyReport();
  assert.equal(report.final_verdict, "OFFICIAL_READ_ONLY_PLAN_READY");
  assert.equal(report.totals.provisional_replacement_candidates, 1);
  assert.equal(report.plan.would_delete.variants, 0);
  assert.equal(report.plan.cleanup_operations, 0);
  assert.equal(report.database.writes, 0);
});

test("same official URL under another series identity fails closed", () => {
  const input = readyInput();
  input.catalog.series = [{ ...input.catalog.series[0], id: "different-series" }];
  const report = buildOfficialReadOnlyAudit(input);
  assert.equal(report.plan.state, "blocked");
  assert.ok(report.plan.blockers.some((reason) => reason.startsWith("series_identity_collision")));
});

test("same series identity with changed official URL fails closed", () => {
  const input = readyInput();
  input.catalog.series[0].official_url = "https://gashapon.jp/products/detail.php?jan_code=4570000000009999";
  const report = buildOfficialReadOnlyAudit(input);
  assert.ok(report.plan.blockers.some((reason) => reason.startsWith("series_identity_url_drift")));
});

test("unrelated catalog series is never added to the bounded update plan", () => {
  const input = readyInput();
  input.catalog.series.push({
    id: "unrelated-series",
    name: "無関係の商品",
    official_url: "https://gashapon.jp/products/detail.php?jan_code=4570000000007777",
    source_type: "official_site",
  });
  const report = buildOfficialReadOnlyAudit(input);
  assert.equal(report.plan.candidate_count, 1);
  assert.equal(report.plan.candidates.some((candidate) => candidate.series_id === "unrelated-series"), false);
});

test("large series delta exceeds its independent cap", () => {
  const input = readyInput();
  input.snapshot.formal_records = [formalRecord("one"), formalRecord("two")];
  input.catalog = { series: [], variants: [] };
  input.limits = { max_series_upserts: 1, max_variant_upserts: 40, max_issues: 8 };
  const report = buildOfficialReadOnlyAudit(input);
  assert.ok(report.plan.blockers.includes("series_change_cap_exceeded"));
  assert.equal(report.plan.limits.max_variant_upserts, 40);
});

test("variant and issue caps fail independently", () => {
  const input = readyInput();
  input.catalog = { series: [], variants: [] };
  input.limits = { max_series_upserts: 4, max_variant_upserts: 1, max_issues: 0 };
  input.snapshot.issue_codes = ["official_parser_review_required"];
  const report = buildOfficialReadOnlyAudit(input);
  assert.ok(report.plan.blockers.includes("variant_change_cap_exceeded"));
  assert.ok(report.plan.blockers.includes("issue_candidate_cap_exceeded"));
});

test("source zero results and parser drift block readiness", () => {
  const input = readyInput();
  input.snapshot.sources[0] = { ...input.snapshot.sources[0], parser_success: false, records: 0, discovered_urls: 0 };
  const report = buildOfficialReadOnlyAudit(input);
  assert.ok(report.plan.blockers.includes("source_parser_failed:gashapon_schedule"));
  assert.ok(report.plan.blockers.includes("source_zero_results:gashapon_schedule"));
  assert.deepEqual(report.plan.would_delete, { series: 0, variants: 0, import_issues: 0 });
  assert.equal(report.plan.cleanup_operations, 0);
});

test("Production table delta blocks a supposedly read-only audit", () => {
  const input = readyInput();
  input.databaseAfter = { ...input.databaseAfter, variants: input.databaseAfter.variants + 1 };
  const report = buildOfficialReadOnlyAudit(input);
  assert.equal(report.report_complete, false);
  assert.ok(report.plan.blockers.includes("production_database_delta_detected"));
});

test("missing Production snapshot fields fail closed instead of becoming trusted zeroes", () => {
  const input = readyInput();
  delete input.databaseAfter.provisional_variants;
  const report = buildOfficialReadOnlyAudit(input);
  assert.equal(report.report_complete, false);
  assert.ok(report.plan.blockers.includes("production_database_snapshot_incomplete"));
});

test("sanitized report validates and Markdown records zero writes", () => {
  const report = validateOfficialReadOnlyAudit(readyReport());
  const markdown = formatOfficialReadOnlyAuditMarkdown(report);
  assert.match(markdown, /Production writes: 0/);
  assert.doesNotMatch(JSON.stringify(report), /"raw"|seller|authorization|cookie|service_role_key/i);
});

test("artifact scanner rejects forbidden fields and explicit credentials", () => {
  assert.deepEqual(findOfficialAuditLeaks([{ name: "ok.json", text: JSON.stringify(readyReport()) }], ["private-value-123"]), []);
  assert.deepEqual(findOfficialAuditLeaks([{ name: "bad.json", text: JSON.stringify({ raw_response: "x" }) }]), ["bad.json:forbidden_fields"]);
  assert.deepEqual(findOfficialAuditLeaks([{ name: "bad.md", text: "private-value-123" }], ["private-value-123"]), ["bad.md:explicit_secret_value"]);
});

test("routine official ingestion no longer invokes provisional cleanup", () => {
  assert.doesNotMatch(routine, /cleanup-provisional|cleanup-provisional-variants/);
  assert.match(legacyWorkflow, /Clean replaced provisional variants|db:cleanup-provisional|cleanup_provisional/);
  assert.match(fs.readFileSync("package.json", "utf8"), /"db:cleanup-provisional"/);
});

test("official audit runner imports no mutation or cleanup helper", () => {
  assert.doesNotMatch(auditRunner, /upsertRows|deleteRows|cleanup-provisional|recordIngestion|run-ingestion/);
  assert.doesNotMatch(auditRunner, /truncate|migration|schema|\bDELETE\b|\bPOST\b|\bPATCH\b/i);
  assert.match(auditRunner, /fetchRows|fetchExactRowCountReliable/);
});

test("official audit workflow is dispatch-only and write-disabled", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bschedule:|\bpush:|\bpull_request:|\bworkflow_run:|\brepository_dispatch:/);
  assert.match(workflow, /INGESTION_WRITE_DISABLED: "true"/);
  assert.match(workflow, /official-read-only-audit-\$\{\{ github\.run_id \}\}/);
  assert.doesNotMatch(workflow, /db:upsert|db:cleanup|workflow enable|workflow disable|gh variable|migration/);
});

test("official audit workflow scopes runner paths and service-role credentials to only required steps", () => {
  const jobEnv = workflow.match(/timeout-minutes: 20\r?\n    env:\r?\n([\s\S]*?)\r?\n    steps:/)?.[1] ?? "";
  const auditStep = workflow.match(/- name: Run bounded official live audit\r?\n([\s\S]*?)\r?\n      - name: Scan sanitized official audit artifact/)?.[1] ?? "";
  const scanStep = workflow.match(/- name: Scan sanitized official audit artifact\r?\n([\s\S]*?)\r?\n      - name: Upload sanitized official audit artifact/)?.[1] ?? "";
  const uploadStep = workflow.match(/- name: Upload sanitized official audit artifact\r?\n([\s\S]*?)\r?\n      - name: Enforce official audit readiness/)?.[1] ?? "";
  const verifyStep = workflow.match(/- name: Enforce official audit readiness\r?\n([\s\S]*)$/)?.[1] ?? "";

  assert.doesNotMatch(jobEnv, /runner\.temp|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(auditStep, /NEXT_PUBLIC_SUPABASE_URL: \$\{\{ secrets\.NEXT_PUBLIC_SUPABASE_URL \}\}/);
  assert.match(auditStep, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
  assert.match(scanStep, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
  assert.doesNotMatch(scanStep, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.doesNotMatch(uploadStep, /SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_URL/);
  assert.doesNotMatch(verifyStep, /SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_URL/);
  for (const step of [auditStep, scanStep, uploadStep, verifyStep]) {
    assert.match(step, /\$\{\{ runner\.temp \}\}\/gacha-official-read-only-audit/);
  }
});

test("official audit workflow scans before artifact upload and then enforces readiness", () => {
  const scan = workflow.indexOf("Scan sanitized official audit artifact");
  const upload = workflow.indexOf("Upload sanitized official audit artifact");
  const enforce = workflow.indexOf("Enforce official audit readiness");
  assert.ok(scan > 0 && scan < upload && upload < enforce);
});

function readyReport() {
  return buildOfficialReadOnlyAudit(readyInput());
}

function readyInput() {
  const record = formalRecord("audit");
  const counts = { series: 10214, variants: 23677, import_issues: 544, review_required: 7535, provisional_variants: 7535 };
  return {
    snapshot: {
      fetched_at: "2026-08-16T00:00:00.000Z",
      sources: [
        source("gashapon_schedule", "gashapon", 1, 1),
        source("gashapon_products", "gashapon", 0, 1),
        source("takaratomy_search", "takaratomy_arts", 1, 1),
      ],
      discovery_records: [record],
      formal_records: [record],
      issue_codes: [],
    },
    catalog: {
      series: [{
        id: record.id,
        name: record.name,
        brand: record.brand,
        category: record.category,
        release_month: record.release_month,
        release_week: record.release_week,
        release_date: record.release_date,
        price: record.price,
        image_url: record.image_url,
        official_url: record.official_url,
        source_type: "official_site",
      }],
      variants: [{ id: `${record.id}-provisional`, series_id: record.id, name: record.name, variant_type: "provisional", review_required: true }],
    },
    databaseBefore: counts,
    databaseAfter: { ...counts },
    workflow: { run_id: "123", head_sha: "a".repeat(40), event_name: "workflow_dispatch" },
  };
}

function source(name, provider, records, discoveredUrls) {
  return {
    source: name,
    provider,
    url: provider === "gashapon" ? "https://gashapon.jp/schedule/" : "https://www.takaratomy-arts.co.jp/items/gacha/search.html",
    http_success: true,
    http_status: 200,
    parser_success: true,
    records,
    discovered_urls: discoveredUrls,
    detail_attempts: name === "gashapon_schedule" ? 1 : 0,
    detail_successes: name === "gashapon_schedule" ? 1 : 0,
    detail_failures: 0,
    formal_lineups: name === "gashapon_schedule" ? 1 : 0,
    zero_lineups: 0,
    issue_codes: [],
    freshness: { state: "current", latest_release_date: "2026-08-01", age_days: 15 },
  };
}

function formalRecord(suffix) {
  const id = `gashapon-4570000000001${suffix === "audit" ? "000" : suffix}`;
  return {
    id,
    slug: id,
    name: `監査ガシャポン ${suffix}`,
    brand: "バンダイ",
    category: "ガシャポン",
    release_month: "8月",
    release_week: "第2週",
    release_date: "2026-08-01",
    price: 400,
    image_url: "https://example.invalid/main.jpg",
    official_url: `https://gashapon.jp/products/detail.php?jan_code=${id.replace("gashapon-", "")}`,
    source_type: "official_site",
    review_required: false,
    variants: ["レッド", "ブルー"].map((name, index) => ({
      id: `${id}-${index + 1}`,
      name,
      image_url: `https://example.invalid/${index + 1}.jpg`,
      variant_type: "normal",
      review_required: false,
    })),
  };
}

function discovery(id, releaseDate) {
  return { provider: "gashapon", source_key: "gashapon_schedule", url: urlFor(id), record: { id, release_date: releaseDate } };
}

function urlFor(id) {
  const digits = String(id).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return `https://gashapon.jp/products/detail.php?jan_code=${String(digits).padStart(16, "0")}`;
}

function response(body, status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "text/html; charset=UTF-8" },
    text: async () => body,
  };
}

function pick(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
