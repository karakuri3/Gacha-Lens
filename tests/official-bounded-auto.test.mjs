import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { officialCanonicalDigest } from "../lib/domain/official-apply-contract.js";
import {
  authorizeOfficialAutomaticWrite,
  buildOfficialAutoGateResult,
  executeOfficialAutomaticTransaction,
  expectedOfficialAutoApproval,
  findOfficialAutoLeaks,
  formatOfficialAutoResultMarkdown,
  resolveOfficialAutoGate,
} from "../lib/domain/official-bounded-auto.js";
import { createOfficialMemoryTransactionAdapter } from "../lib/domain/official-bounded-write.js";
import { buildOfficialReadOnlyAudit } from "../lib/domain/official-read-only-audit.js";
import {
  buildKnownOfficialCatalogIdentity,
  selectOfficialAuditDetails,
} from "../lib/fetchers/official-live-audit.js";

const HEAD_SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const autoWorkflow = fs.readFileSync(".github/workflows/gacha-official-bounded-auto.yml", "utf8");
const manualAuditWorkflow = fs.readFileSync(".github/workflows/gacha-official-read-only-audit.yml", "utf8");
const manualWriteWorkflow = fs.readFileSync(".github/workflows/gacha-official-bounded-write.yml", "utf8");
const marketAutoWorkflow = fs.readFileSync(".github/workflows/gacha-market-p3-bounded-seed-v2-auto.yml", "utf8");
const legacyWorkflow = fs.readFileSync(".github/workflows/gacha-ingestion.yml", "utf8");

test("automatic official workflow is schedule-only at the reviewed UTC/JST window", () => {
  assert.match(autoWorkflow, /name: Gacha Official Bounded Automatic Production/);
  assert.match(autoWorkflow, /cron: "27 2 \* \* \*"/);
  assert.match(autoWorkflow, /02:27 UTC \/ 11:27 JST/);
  assert.doesNotMatch(autoWorkflow, /workflow_dispatch:|\bpush:|\bpull_request:|\bworkflow_run:|\brepository_dispatch:/);
});

test("automatic gate is absent and false by default before checkout credentials", () => {
  assert.match(autoWorkflow, /OFFICIAL_BOUNDED_AUTO_ENABLED: \$\{\{ vars\.OFFICIAL_BOUNDED_AUTO_ENABLED \|\| '' \}\}/);
  assert.doesNotMatch(autoWorkflow, /OFFICIAL_BOUNDED_AUTO_ENABLED \|\| 'true'/);
  const auditStep = step("Run read-only official live audit", "Decide bounded official automatic plan");
  const executeStep = step("Execute one bounded official transaction", "Scan sanitized official automatic artifact");
  assert.match(auditStep, /steps\.gate\.outputs\.execute == 'true'/);
  assert.match(executeStep, /steps\.prepare\.outputs\.execute == 'true'/);
});

test("missing and false gates produce zero-write disabled results", () => {
  for (const enabled of [undefined, "", "false", "TRUE"]) {
    const gate = resolveGate({ enabled });
    const result = buildOfficialAutoGateResult({ workflow: workflowIdentity(), gate });
    assert.equal(gate.state, "disabled");
    assert.equal(result.final_verdict, "OFFICIAL_BOUNDED_AUTO_DISABLED");
    assert.equal(result.database_writes, 0);
    assert.equal(result.actual_writes.deletes, 0);
  }
});

test("enabled gate requires the exact reviewed policy approval", () => {
  assert.equal(resolveGate({ enabled: "true", approval: "" }).state, "blocked");
  const gate = resolveGate({ enabled: "true", approval: expectedOfficialAutoApproval() });
  assert.equal(gate.state, "enabled");
  assert.equal(gate.approval_valid, true);
  assert.equal(resolveGate({
    enabled: "true",
    approval: "APPROVE_OFFICIAL_BOUNDED_AUTO_V2",
  }).state, "blocked");
});

test("unrelated main revisions retain reviewed policy approval while exact origin main remains mandatory", () => {
  const approval = expectedOfficialAutoApproval();
  assert.equal(resolveGate({ enabled: "true", approval }).state, "enabled");
  assert.equal(resolveGate({
    enabled: "true",
    approval,
    headSha: OTHER_SHA,
    originMainSha: OTHER_SHA,
  }).state, "enabled");
});

test("main SHA mismatch fails closed before any official fetch or write", () => {
  const gate = resolveGate({
    enabled: "true",
    approval: expectedOfficialAutoApproval(),
    originMainSha: OTHER_SHA,
  });
  assert.equal(gate.state, "blocked");
  assert.equal(gate.reason_code, "official_auto_main_sha_mismatch");
  assert.equal(buildOfficialAutoGateResult({ workflow: workflowIdentity(), gate }).database_writes, 0);
});

test("automatic progressive selection skips known upcoming products and advances on later runs", () => {
  const discoveries = [
    autoDiscovery("known-1", 1),
    autoDiscovery("known-2", 2),
    autoDiscovery("unseen-1", 3),
    autoDiscovery("unseen-2", 4),
  ];
  const first = selectOfficialAuditDetails(discoveries, {
    selectionMode: "progressive",
    knownOfficialIds: ["known-1", "known-2"],
    gashaponLimit: 2,
    takaratomyLimit: 2,
    now: new Date("2026-08-25T00:00:00.000Z"),
  });
  assert.deepEqual(first.map((entry) => entry.record.id), ["unseen-1", "unseen-2"]);

  const laterDiscoveries = [
    ...discoveries,
    autoDiscovery("unseen-3", 5),
    autoDiscovery("unseen-4", 6),
  ];
  const second = selectOfficialAuditDetails(laterDiscoveries, {
    selectionMode: "progressive",
    knownOfficialIds: ["known-1", "known-2", "unseen-1", "unseen-2"],
    gashaponLimit: 2,
    takaratomyLimit: 2,
    now: new Date("2026-08-25T00:00:00.000Z"),
  });
  assert.deepEqual(second.map((entry) => entry.record.id), ["unseen-3", "unseen-4"]);
});

test("progressive selection falls back to established refresh priority when all products are known", () => {
  const discoveries = [
    autoDiscovery("older", 11, "gashapon", "2025-01-01"),
    autoDiscovery("recent", 12, "gashapon", "2026-08-01"),
    autoDiscovery("upcoming", 13, "gashapon", "2026-09-01"),
  ];
  const selected = selectOfficialAuditDetails(discoveries, {
    selectionMode: "progressive",
    knownOfficialUrls: discoveries.map((entry) => entry.url),
    gashaponLimit: 2,
    takaratomyLimit: 2,
    now: new Date("2026-08-25T00:00:00.000Z"),
  });
  assert.deepEqual(selected.map((entry) => entry.record.id), ["upcoming", "recent"]);
});

test("progressive selection preserves the two-detail limit independently per provider", () => {
  const discoveries = [
    autoDiscovery("g-1", 21),
    autoDiscovery("g-2", 22),
    autoDiscovery("g-3", 23),
    autoDiscovery("t-1", 31, "takaratomy_arts"),
    autoDiscovery("t-2", 32, "takaratomy_arts"),
    autoDiscovery("t-3", 33, "takaratomy_arts"),
  ];
  const selected = selectOfficialAuditDetails(discoveries, {
    selectionMode: "progressive",
    gashaponLimit: 2,
    takaratomyLimit: 2,
  });
  assert.equal(selected.filter((entry) => entry.provider === "gashapon").length, 2);
  assert.equal(selected.filter((entry) => entry.provider === "takaratomy_arts").length, 2);
});

test("only the automatic workflow enables progressive catalog selection", () => {
  const auditStep = step("Run read-only official live audit", "Decide bounded official automatic plan");
  assert.match(auditStep, /--selection-mode=progressive/);
  assert.doesNotMatch(manualAuditWorkflow, /--selection-mode=progressive/);
});

test("automatic catalog identity passes deterministic known official URLs and parent IDs", () => {
  assert.deepEqual(buildKnownOfficialCatalogIdentity({
    series: [
      { id: "series-b", official_url: "https://gashapon.jp/products/detail.php?jan_code=2" },
      { id: "series-a", official_url: "https://gashapon.jp/products/detail.php?jan_code=1" },
    ],
    variants: [
      { id: "variant-1", series_id: "series-a", official_url: "https://gashapon.jp/products/detail.php?jan_code=1" },
    ],
  }), {
    urls: [
      "https://gashapon.jp/products/detail.php?jan_code=1",
      "https://gashapon.jp/products/detail.php?jan_code=2",
    ],
    ids: ["series-a", "series-b"],
  });
});

test("required official source failure blocks automatic authorization", () => {
  const fixture = auditFixture();
  fixture.report.sources.find((source) => source.source === "takaratomy_search").http_success = false;
  redigest(fixture.report);
  assert.throws(() => authorize(fixture.report), /official_auto_audit_not_ready|source_incomplete/);
});

test("unexpected provider identity is treated as source contamination", () => {
  const fixture = auditFixture();
  fixture.report.sources.find((source) => source.source === "gashapon_schedule").provider = "unknown_provider";
  redigest(fixture.report);
  assert.throws(() => authorize(fixture.report), /source_incomplete_or_contaminated/);
});

test("candidate overflow remains fail closed at the established 4 series cap", () => {
  const fixture = auditFixture({ recordCount: 5, variantsPerRecord: 1 });
  assert.equal(fixture.report.plan.state, "blocked");
  assert.ok(fixture.report.plan.blockers.includes("series_change_cap_exceeded"));
  assert.throws(() => authorize(fixture.report), /official_auto_audit_not_ready/);
});

test("automatic batch accepts a safe series above the manual 12-variant canary cap but never above 40", () => {
  const withinAutoLimit = auditFixture({ variantsPerRecord: 13 });
  const authorization = authorize(withinAutoLimit.report);
  assert.equal(authorization.proposal.variants.insert, 13);

  const aboveAutoLimit = auditFixture({ variantsPerRecord: 41 });
  assert.ok(aboveAutoLimit.report.plan.blockers.includes("variant_change_cap_exceeded"));
  assert.throws(() => authorize(aboveAutoLimit.report), /official_auto_audit_not_ready/);
});

test("delete and provisional replacement candidates are never automatic writes", () => {
  const deletion = auditFixture().report;
  deletion.plan.would_delete.series = 1;
  redigest(deletion);
  assert.throws(() => authorize(deletion), /cleanup or delete|delete_candidate/);

  const provisional = auditFixture().report;
  provisional.plan.candidates[0].provisional_replacement_candidate = true;
  redigest(provisional);
  assert.throws(() => authorize(provisional), /review_or_cleanup_candidate_rejected/);
});

test("automatic updates cannot clear an existing review-required variant", () => {
  const record = officialRecord(1, 2);
  const catalog = existingCatalog(record);
  catalog.variants[0].review_required = true;
  const report = auditFixture({ records: [record], catalog }).report;
  assert.throws(() => authorize(report), /existing_review_required_change_rejected/);
});

test("bounded inserts commit in one transaction with exact target and count verification", async () => {
  const fixture = auditFixture({ recordCount: 2, variantsPerRecord: 3 });
  const authorization = authorize(fixture.report);
  const result = await executeOfficialAutomaticTransaction({
    adapter: createOfficialMemoryTransactionAdapter(),
    authorization,
    workflow: workflowIdentity(),
  });
  assert.equal(result.final_verdict, "OFFICIAL_BOUNDED_AUTO_COMMITTED");
  assert.deepEqual(result.actual_writes, { series: 2, variants: 6, restock_events: 0, deletes: 0 });
  assert.equal(result.database_writes, 8);
  assert.deepEqual(result.production.delta, {
    series: 2,
    variants: 6,
    restock_events: 0,
    import_issues: 0,
    review_required: 0,
    provisional_variants: 0,
  });
  assert.equal(result.target_ids.series.length, 2);
  assert.equal(result.target_ids.variants.length, 6);
  assert.equal(result.verification.zero_or_expected_delta, true);
});

test("bounded update changes a reviewed row without changing counts", async () => {
  const incoming = officialRecord(1, 2, { name: "Updated official series" });
  const catalog = existingCatalog(incoming, { seriesName: "Previous official series" });
  const fixture = auditFixture({ records: [incoming], catalog });
  const result = await executeOfficialAutomaticTransaction({
    adapter: createOfficialMemoryTransactionAdapter(catalog),
    authorization: authorize(fixture.report),
    workflow: workflowIdentity(),
  });
  assert.equal(result.final_verdict, "OFFICIAL_BOUNDED_AUTO_COMMITTED");
  assert.equal(result.actual_writes.series, 1);
  assert.equal(result.production.delta.series, 0);
  assert.equal(result.production.delta.variants, 0);
});

test("an identical audited catalog is an explicit zero-write no-op", () => {
  const record = officialRecord(1, 2);
  const catalog = existingCatalog(record);
  const authorization = authorize(auditFixture({ records: [record], catalog }).report);
  assert.equal(authorization.decision, "no_changes");
  assert.equal(authorization.proposal.database_writes, 0);
});

test("mid-transaction write failure rolls back the entire automatic batch", async () => {
  const fixture = auditFixture({ recordCount: 2, variantsPerRecord: 2 });
  const adapter = createOfficialMemoryTransactionAdapter({}, { failAfterWrites: 1 });
  const result = await executeOfficialAutomaticTransaction({
    adapter,
    authorization: authorize(fixture.report),
    workflow: workflowIdentity(),
  });
  assert.equal(result.final_verdict, "OFFICIAL_BOUNDED_AUTO_ROLLED_BACK");
  assert.equal(result.database_writes, 0);
  assert.equal(result.transaction.rollback_verified, true);
  assert.deepEqual(adapter.snapshot(), { series: [], variants: [], restock_events: [] });
});

test("unexpected post-commit database delta is reported as a committed verification failure", async () => {
  const fixture = auditFixture();
  const base = createOfficialMemoryTransactionAdapter();
  let snapshots = 0;
  const adapter = {
    ...base,
    async captureCounts() {
      snapshots += 1;
      const counts = await base.captureCounts();
      if (snapshots >= 3) counts.import_issues += 1;
      return counts;
    },
  };
  const result = await executeOfficialAutomaticTransaction({
    adapter,
    authorization: authorize(fixture.report),
    workflow: workflowIdentity(),
  });
  assert.equal(result.final_verdict, "OFFICIAL_BOUNDED_AUTO_COMMITTED_POST_VERIFY_FAILED");
  assert.equal(result.transaction.state, "committed_post_verify_failed");
  assert.equal(result.verification.zero_or_expected_delta, false);
});

test("automatic artifact is sanitized and reports real gate, source, target, and delta evidence", async () => {
  const fixture = auditFixture();
  const result = await executeOfficialAutomaticTransaction({
    adapter: createOfficialMemoryTransactionAdapter(),
    authorization: authorize(fixture.report),
    workflow: workflowIdentity(),
  });
  const markdown = formatOfficialAutoResultMarkdown(result);
  assert.match(markdown, /Gate state: enabled/);
  assert.match(markdown, /gashapon_schedule/);
  assert.match(markdown, /Actual database writes: 3/);
  assert.match(markdown, /Zero or expected delta verified: true/);
  assert.deepEqual(findOfficialAutoLeaks([
    { name: "result.json", text: JSON.stringify(result) },
    { name: "result.md", text: markdown },
  ], ["super-secret-value"]), []);
  assert.deepEqual(findOfficialAutoLeaks([
    { name: "result.json", text: JSON.stringify({ password: "super-secret-value" }) },
  ], ["super-secret-value"]), ["result.json:explicit_secret_value", "result.json:forbidden_fields"]);
});

test("Production credentials are scoped only to their required automatic steps", () => {
  const jobEnv = autoWorkflow.match(/timeout-minutes: 30\r?\n([\s\S]*?)\r?\n    steps:/)?.[1] ?? "";
  const auditStep = step("Run read-only official live audit", "Decide bounded official automatic plan");
  const executeStep = step("Execute one bounded official transaction", "Scan sanitized official automatic artifact");
  assert.doesNotMatch(jobEnv, /SUPABASE|DB_URL/);
  assert.match(auditStep, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(auditStep, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(auditStep, /SUPABASE_DB_URL/);
  assert.match(executeStep, /SUPABASE_DB_URL/);
  assert.doesNotMatch(executeStep, /SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_URL/);
  assert.doesNotMatch(step("Scan sanitized official automatic artifact", "Upload sanitized official automatic artifact"), /SUPABASE|SECRET|DB_URL/);
});

test("manual official workflows and market P3 V2 automatic behavior remain isolated", () => {
  assert.match(manualAuditWorkflow, /name: Gacha Official Read-Only Audit/);
  assert.match(manualAuditWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(manualAuditWorkflow, /OFFICIAL_BOUNDED_AUTO_/);
  assert.match(manualWriteWorkflow, /name: Gacha Official Bounded Write/);
  assert.match(manualWriteWorkflow, /APPROVE_OFFICIAL_BOUNDED:/);
  assert.doesNotMatch(manualWriteWorkflow, /OFFICIAL_BOUNDED_AUTO_/);
  assert.match(marketAutoWorkflow, /cron:\s*"17 \*\/3 \* \* \*"/);
  assert.doesNotMatch(marketAutoWorkflow, /OFFICIAL_BOUNDED_AUTO_/);
});

test("automatic workflow cannot enable or dispatch the legacy ingestion workflow", () => {
  assert.match(legacyWorkflow, /name: Gacha ingestion/);
  assert.doesNotMatch(autoWorkflow, /gacha-ingestion\.yml|gh workflow|workflow_dispatch/i);
  assert.doesNotMatch(autoWorkflow, /DELETE\b|TRUNCATE\b|cleanup|migration|db:upsert/i);
});

function resolveGate(overrides = {}) {
  return resolveOfficialAutoGate({
    enabled: "false",
    approval: "",
    eventName: "schedule",
    ref: "refs/heads/main",
    headSha: HEAD_SHA,
    originMainSha: HEAD_SHA,
    ...overrides,
  });
}

function autoDiscovery(id, sequence, provider = "gashapon", releaseDate = "2026-09-01") {
  const url = provider === "gashapon"
    ? `https://gashapon.jp/products/detail.php?jan_code=${String(sequence).padStart(16, "0")}`
    : `https://www.takaratomy-arts.co.jp/items/item.html?n=${sequence}`;
  return {
    provider,
    source_key: provider === "gashapon" ? "gashapon_schedule" : "takaratomy_search",
    url,
    record: { id, release_date: releaseDate },
  };
}

function authorize(report) {
  return authorizeOfficialAutomaticWrite({ report, headSha: HEAD_SHA, originMainSha: HEAD_SHA });
}

function auditFixture({ recordCount = 1, variantsPerRecord = 2, records = null, catalog = null } = {}) {
  const formalRecords = records || Array.from({ length: recordCount }, (_, index) => officialRecord(index + 1, variantsPerRecord));
  const currentCatalog = catalog || { series: [], variants: [], restock_events: [] };
  const counts = countSnapshot(currentCatalog);
  const report = buildOfficialReadOnlyAudit({
    snapshot: {
      fetched_at: "2026-08-25T02:27:00.000Z",
      sources: [
        source("gashapon_schedule", "gashapon", 1),
        source("gashapon_products", "gashapon", 0),
        source("takaratomy_search", "takaratomy_arts", 1),
      ],
      discovery_records: formalRecords,
      formal_records: formalRecords,
      issue_codes: [],
    },
    catalog: currentCatalog,
    databaseBefore: counts,
    databaseAfter: { ...counts },
    workflow: { run_id: "123456789", head_sha: HEAD_SHA, event_name: "schedule" },
  });
  return { records: formalRecords, catalog: currentCatalog, report };
}

function officialRecord(index, variantCount, overrides = {}) {
  const suffix = String(index).padStart(4, "0");
  const id = `gashapon-457000000000${suffix}`;
  return {
    id,
    slug: id,
    name: overrides.name || `公式シリーズ${index}`,
    franchise: `公式作品${index}`,
    brand: index % 2 ? "バンダイ" : "タカラトミーアーツ",
    category: "ガシャポン",
    release_date: "2026-08-25",
    release_month: "8月",
    release_week: "第4週",
    price: 400,
    image_url: `https://example.invalid/series-${index}.jpg`,
    official_url: `https://gashapon.jp/products/detail.php?jan_code=457000000000${suffix}`,
    source_type: "official_site",
    review_required: false,
    released: true,
    variants: Array.from({ length: variantCount }, (_, variantIndex) => ({
      id: `${id}-${variantIndex + 1}`,
      slug: `${id}-${variantIndex + 1}`,
      name: `単品${variantIndex + 1}`,
      image_url: `https://example.invalid/${index}-${variantIndex + 1}.jpg`,
      variant_type: "normal",
      review_required: false,
    })),
  };
}

function existingCatalog(record, { seriesName = record.name } = {}) {
  return {
    series: [{
      id: record.id,
      slug: record.slug,
      name: seriesName,
      franchise: record.franchise,
      brand: record.brand,
      category: record.category,
      release_month: record.release_month,
      release_week: record.release_week,
      release_date: record.release_date,
      price: record.price,
      image_url: record.image_url,
      official_url: record.official_url,
      is_released: true,
      source_type: "official_site",
    }],
    variants: record.variants.map((variant) => ({
      id: variant.id,
      slug: variant.slug,
      series_id: record.id,
      name: variant.name,
      variant_type: "normal",
      image: variant.image_url,
      released: true,
      price: record.price,
      brand: record.brand,
      release_month: record.release_month,
      release_week: record.release_week,
      release_date: record.release_date,
      official_url: record.official_url,
      source_type: "official_site",
      review_required: false,
    })),
    restock_events: [],
  };
}

function source(name, provider, records) {
  return {
    source: name,
    provider,
    url: provider === "gashapon"
      ? "https://gashapon.jp/schedule/"
      : "https://www.takaratomy-arts.co.jp/items/gacha/search.html",
    http_success: true,
    http_status: 200,
    parser_success: true,
    records,
    discovered_urls: 1,
    detail_attempts: records,
    detail_successes: records,
    detail_failures: 0,
    formal_lineups: records,
    zero_lineups: 0,
    issue_codes: [],
    freshness: { state: "current", latest_release_date: "2026-08-25", age_days: 0 },
  };
}

function countSnapshot(catalog) {
  return {
    series: catalog.series.length,
    variants: catalog.variants.length,
    restock_events: catalog.restock_events.length,
    import_issues: 0,
    review_required: catalog.variants.filter((row) => row.review_required === true).length,
    provisional_variants: catalog.variants.filter((row) => row.variant_type === "provisional").length,
  };
}

function workflowIdentity() {
  return { run_id: "123456789", head_sha: HEAD_SHA, event_name: "schedule" };
}

function redigest(report) {
  const clone = structuredClone(report);
  delete clone.canonical_digest;
  report.canonical_digest = officialCanonicalDigest(clone);
}

function step(name, nextName) {
  return autoWorkflow.match(new RegExp(`- name: ${name}\\r?\\n([\\s\\S]*?)\\r?\\n      - name: ${nextName}`))?.[1] ?? "";
}
