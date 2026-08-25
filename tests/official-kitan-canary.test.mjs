import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createOfficialMemoryTransactionAdapter, findOfficialBoundedLeaks } from "../lib/domain/official-bounded-write.js";
import { authorizeOfficialKitanCanary, buildKitanStableIdentity, buildOfficialKitanReadinessAudit, executeOfficialKitanCanaryTransaction, validateOfficialKitanReadinessAudit } from "../lib/domain/official-kitan-canary.js";
import { parseProviderDetail } from "../lib/fetchers/official-sources/registry.js";

const HEAD = "a".repeat(40);
const fixture = (name) => fs.readFileSync(`tests/fixtures/official/${name}`, "utf8");
const workflows = {
  audit: fs.readFileSync(".github/workflows/gacha-official-kitan-read-only-audit.yml", "utf8"),
  canary: fs.readFileSync(".github/workflows/gacha-official-kitan-bounded-canary.yml", "utf8"),
  automatic: fs.readFileSync(".github/workflows/gacha-official-bounded-auto.yml", "utf8"),
};
const auditScript = fs.readFileSync("scripts/official-kitan-readiness-audit.mjs", "utf8");

test("Kitan safe product builds one deterministic, bounded manual canary candidate", () => {
  const first = readiness(kitanRecord("kitan-capwatch-qbb-detail.html", "capwatch_qbb"));
  const second = readiness(kitanRecord("kitan-capwatch-qbb-detail.html", "capwatch_qbb"));
  assert.equal(first.final_verdict, "OFFICIAL_KITAN_READINESS_READY");
  assert.equal(first.plan.eligible_candidate_count, 1);
  assert.equal(first.plan.selected_candidate_count, 1);
  assert.equal(first.plan.candidate_count, 1);
  assert.equal(first.plan.selected_candidate.variant_count, 6);
  assert.equal(first.plan.selected_candidate.apply_contract.restock_event, null);
  assert.equal(first.plan.selected_candidate.series_id, second.plan.selected_candidate.series_id);
  assert.deepEqual(first.plan.selected_candidate.variants.map((variant) => variant.id), second.plan.selected_candidate.variants.map((variant) => variant.id));
  assert.equal(first.database.writes, 0);
  assert.equal(first.database.delta.series, 0);
});

test("multiple safe Kitan records select exactly one newest deterministic canary contract", () => {
  const base = kitanRecord("kitan-capwatch-qbb-detail.html", "capwatch_qbb");
  const records = ["2026-06-01", "2026-07-01", "2026-08-01", "2026-08-10", "2026-08-20"].map((release_date, index) => ({
    ...base,
    source_product_id: `safe-${index}`,
    official_url: `https://kitan.jp/products/safe-${index}/`,
    series_name: `Kitan safe ${index}`,
    release_date,
    release_month: release_date.slice(0, 7),
  }));
  const report = readinessRecords(records, {}, { audit_date: "2026-08-20" });
  assert.equal(report.manual_canary_ready, true);
  assert.equal(report.plan.eligible_candidate_count, 5);
  assert.equal(report.plan.selected_candidate_count, 1);
  assert.equal(report.plan.selected_candidate.source_product_id, "safe-4");
  assert.equal(report.plan.selected_candidate.variant_count, 6);
  assert.equal(report.plan.selected_candidate.apply_contract.variants.length, 6);
  assert.equal(report.plan.eligible_candidates.every((candidate) => !Object.hasOwn(candidate, "apply_contract")), true);
  assert.equal(authorize(report).candidate.series_id, report.plan.selected_candidate.series_id);

  const twoSafe = readinessRecords(records.slice(0, 2), {}, { audit_date: "2026-08-20" });
  assert.equal(twoSafe.manual_canary_ready, true);
  assert.equal(twoSafe.plan.eligible_candidate_count, 2);
  assert.equal(twoSafe.plan.selected_candidate_count, 1);
  assert.equal(twoSafe.plan.selected_candidate.source_product_id, "safe-1");
});

test("conflicted Kitan records are excluded while remaining safe records can select one canary", () => {
  const base = kitanRecord("kitan-capwatch-qbb-detail.html", "capwatch_qbb");
  const safe = Array.from({ length: 4 }, (_, index) => ({ ...base, source_product_id: `safe-${index}`, official_url: `https://kitan.jp/products/safe-${index}/`, series_name: `Kitan safe ${index}`, release_date: `2026-07-0${index + 1}`, release_month: "2026-07" }));
  const conflict = { ...kitanRecord("kitan-moomin-conflicting-count-detail.html", "moomin_vase"), source_product_id: "conflict", official_url: "https://kitan.jp/products/conflict/" };
  const report = readinessRecords([conflict, ...safe]);
  assert.equal(report.manual_canary_ready, true);
  assert.equal(report.plan.eligible_candidate_count, 4);
  assert.equal(report.plan.selected_candidate_count, 1);
  assert.equal(report.source.source_count_conflict_excluded_count, 1);
});

test("frozen Kitan release status uses exact date and conservative current-month semantics", () => {
  const base = kitanRecord("kitan-capwatch-qbb-detail.html", "capwatch_qbb");
  for (const [label, record, expected] of [
    ["past exact date", { ...base, release_date: "2026-08-19", release_month: "2026-08" }, true],
    ["today exact date", { ...base, release_date: "2026-08-20", release_month: "2026-08" }, true],
    ["future exact date", { ...base, release_date: "2026-08-21", release_month: "2026-08" }, false],
    ["past month", { ...base, release_date: null, release_month: "2026-07" }, true],
    ["future month", { ...base, release_date: null, release_month: "2026-09" }, false],
    ["current month", { ...base, release_date: null, release_month: "2026-08" }, false],
  ]) {
    const report = readiness(record, {}, { audit_date: "2026-08-20" });
    assert.equal(report.plan.selected_candidate.release_status.released, expected, label);
    assert.equal(report.plan.selected_candidate.apply_contract.series.values.is_released, expected, label);
    assert.equal(report.plan.selected_candidate.apply_contract.variants.every((variant) => variant.values.released === expected), true, label);
  }
});

test("What’s Michael uses the decoded deterministic source identity", () => {
  const record = kitanRecord("kitan-whats-michael-detail.html", "whats_michael");
  const audit = readiness(record);
  assert.equal(audit.plan.selected_candidate.series_name, "What’s Michael？ フィギュアマスコット");
  assert.equal(audit.plan.selected_candidate.series_id, buildKitanStableIdentity("whats_michael"));
  assert.equal(audit.plan.selected_candidate.variant_count, 2);
});

test("Kitan source count conflict is retained as evidence and excluded from canary candidates", () => {
  const audit = readiness(kitanRecord("kitan-moomin-conflicting-count-detail.html", "moomin_vase"));
  assert.equal(audit.final_verdict, "OFFICIAL_KITAN_READINESS_BLOCKED");
  assert.equal(audit.plan.candidate_count, 0);
  assert.equal(audit.source.source_count_conflict_excluded_count, 1);
  assert.match(audit.plan.rejected_candidates[0].reasons.join(","), /kitan_source_count_conflict/);
});

for (const [label, mutate, expected] of [
  ["missing price", (record) => ({ ...record, price: null }), "kitan_series_metadata_invalid"],
  ["missing release", (record) => ({ ...record, release_date: null, release_month: null }), "kitan_series_metadata_invalid"],
  ["duplicate variants", (record) => ({ ...record, variants: [record.variants[0], record.variants[0]] }), "kitan_variant_catalog_invalid"],
  ["too many variants", (record) => ({ ...record, variants: Array.from({ length: 13 }, (_, index) => ({ ...record.variants[0], name: `variant-${index}` })) }), "kitan_variant_catalog_invalid"],
]) test(`unsafe Kitan ${label} fails closed`, () => {
  const audit = readiness(mutate(kitanRecord("kitan-capwatch-qbb-detail.html", "capwatch_qbb")));
  assert.equal(audit.plan.candidate_count, 0);
  assert.match(audit.plan.rejected_candidates[0].reasons.join(","), new RegExp(expected));
});

test("identity collisions and precondition drift fail closed before durable mutation", async () => {
  const record = kitanRecord("kitan-capwatch-qbb-detail.html", "capwatch_qbb");
  const collision = readiness(record, { series: [{ id: buildKitanStableIdentity("other"), official_url: record.official_url }], variants: [] });
  assert.equal(collision.plan.candidate_count, 0);
  assert.match(collision.plan.rejected_candidates[0].reasons.join(","), /kitan_series_identity_collision/);
  const audit = readiness(record);
  const auth = authorize(audit);
  const adapter = createOfficialMemoryTransactionAdapter({ series: [{ ...auth.candidate.apply_contract.series.values, official_url: "https://kitan.jp/products/drift/" }], variants: [], restock_events: [] });
  const result = await executeOfficialKitanCanaryTransaction({ adapter, authorization: auth, workflow: { run_id: "900", head_sha: HEAD } });
  assert.equal(result.final_verdict, "OFFICIAL_BOUNDED_WRITE_ROLLED_BACK");
  assert.equal(result.database_writes, 0);
  assert.equal(result.reason_code, "official_bounded_insert_identity_exists");
});

test("a Kitan URL slug change with exact factual identity blocks a duplicate insert", () => {
  const incoming = kitanRecord("kitan-capwatch-qbb-detail.html", "new-capwatch-slug");
  const oldSeriesId = buildKitanStableIdentity("old-capwatch-slug");
  const oldVariants = incoming.variants.map((variant) => ({ id: buildKitanStableIdentity("old-capwatch-slug", variant.name), series_id: oldSeriesId, name: variant.name }));
  const report = buildOfficialKitanReadinessAudit({
    provider: { source: "kitan_club", parser_success: true, issue_codes: [], records: [incoming] },
    catalog: { series: [{ id: oldSeriesId, name: incoming.series_name, brand: "キタンクラブ", source_type: "official_site", official_url: "https://kitan.jp/products/old-capwatch-slug/", release_date: incoming.release_date, release_month: incoming.release_month, price: incoming.price }], variants: oldVariants },
    databaseBefore: counts(), databaseAfter: counts(), workflow: { run_id: "900", head_sha: HEAD, audit_date: "2026-08-20" },
  });
  assert.equal(report.manual_canary_ready, false);
  assert.match(report.plan.rejected_candidates[0].reasons.join(","), /kitan_identity_drift_possible/);
});

test("similar Kitan products with distinct factual evidence do not trigger an identity-drift match", () => {
  const incoming = kitanRecord("kitan-capwatch-qbb-detail.html", "new-capwatch-slug");
  const report = readiness(incoming, {
    series: [{ id: buildKitanStableIdentity("different"), name: "CAPWATCH QBBベビーチーズ 別商品", brand: "キタンクラブ", source_type: "official_site", official_url: "https://kitan.jp/products/different/", release_month: "2026-09", price: 400 }],
    variants: [],
  }, { audit_date: "2026-08-20" });
  assert.equal(report.manual_canary_ready, true);
});

test("Kitan canary approval is exact and rejects stale SHA, digest, run ID, and approval", () => {
  const audit = readiness(kitanRecord("kitan-capwatch-qbb-detail.html", "capwatch_qbb"));
  assert.equal(authorize(audit).ok, true);
  for (const change of [
    { headSha: "b".repeat(40) },
    { auditDigest: `sha256:${"b".repeat(64)}` },
    { auditRunId: "999" },
    { approval: `APPROVE_OFFICIAL_KITAN_CANARY:${HEAD}:sha256:${"b".repeat(64)}` },
  ]) assert.throws(() => authorize(audit, change));
});

test("source failure and read-only database drift block readiness before any canary authorization", () => {
  const record = kitanRecord("kitan-capwatch-qbb-detail.html", "capwatch_qbb");
  const failedSource = buildOfficialKitanReadinessAudit({ provider: { source: "kitan_club", parser_success: false, issue_codes: ["official_fetch_timeout"], records: [] }, catalog: { series: [], variants: [] }, databaseBefore: counts(), databaseAfter: counts(), workflow: { run_id: "900", head_sha: HEAD } });
  assert.equal(failedSource.manual_canary_ready, false);
  const drift = buildOfficialKitanReadinessAudit({ provider: { source: "kitan_club", parser_success: true, issue_codes: [], records: [record] }, catalog: { series: [], variants: [] }, databaseBefore: counts(), databaseAfter: { ...counts(), variants: 21 }, workflow: { run_id: "900", head_sha: HEAD } });
  assert.equal(drift.manual_canary_ready, false);
  assert.throws(() => validateOfficialKitanReadinessAudit(drift));
});

test("an incomplete targeted catalog read blocks readiness without widening the Production read", () => {
  const record = kitanRecord("kitan-capwatch-qbb-detail.html", "capwatch_qbb");
  const audit = buildOfficialKitanReadinessAudit({ provider: { source: "kitan_club", parser_success: true, issue_codes: [], records: [record] }, catalog: { series: [], variants: [], complete: false }, databaseBefore: counts(), databaseAfter: counts(), workflow: { run_id: "900", head_sha: HEAD } });
  assert.equal(audit.manual_canary_ready, false);
  assert.match(audit.blockers.join(","), /production_catalog_targeted_read_incomplete/);
});

test("Kitan workflows are dispatch-only, bounded, and leave the reviewed automatic workflow unchanged", () => {
  for (const workflow of [workflows.audit, workflows.canary]) {
    assert.match(workflow, /workflow_dispatch:/);
    assert.doesNotMatch(workflow, /\bschedule:|\bpush:|\bpull_request:|\bworkflow_run:|\brepository_dispatch:/);
  }
  assert.match(workflows.audit, /INGESTION_WRITE_DISABLED: "true"/);
  assert.match(workflows.canary, /APPROVE_OFFICIAL_KITAN_CANARY/);
  assert.match(workflows.canary, /official-kitan-readiness-audit-\$\{\{ inputs\.audit_run_id \}\}/);
  assert.match(workflows.canary, /SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/);
  assert.match(auditScript, /fetchOfficialProviderSourceExpansionDiagnostic\("kitan_club"/);
  assert.match(auditScript, /fetchRowsLimited/);
  assert.doesNotMatch(auditScript, /fetchRows\("series"|fetchRows\("variants"/);
  assert.doesNotMatch(workflows.automatic, /kitan/i);
});

test("Kitan canary artifact summaries carry no approval or credential field", () => {
  const audit = readiness(kitanRecord("kitan-capwatch-qbb-detail.html", "capwatch_qbb"));
  const auth = authorize(audit);
  const summary = { final_verdict: "OFFICIAL_KITAN_CANARY_READY", canary: { audit_run_id: auth.audit_run_id, audit_digest: auth.audit_digest, selected_series_id: auth.candidate.series_id }, database_writes: 0 };
  assert.deepEqual(findOfficialBoundedLeaks([{ name: "result.json", text: JSON.stringify(summary) }], ["private-value"]), []);
});

function readiness(record, catalog = { series: [], variants: [] }, workflow = {}) {
  return readinessRecords([record], catalog, workflow);
}
function readinessRecords(records, catalog = { series: [], variants: [] }, workflow = {}) { return validateOfficialKitanReadinessAudit(buildOfficialKitanReadinessAudit({ provider: { source: "kitan_club", parser_success: true, issue_codes: [], records }, catalog, databaseBefore: counts(), databaseAfter: counts(), workflow: { run_id: "900", head_sha: HEAD, event_name: "workflow_dispatch", audit_date: "2026-08-20", ...workflow } })); }
function authorize(report, values = {}) { return authorizeOfficialKitanCanary({ report, auditRunId: values.auditRunId || "900", auditDigest: values.auditDigest || report.canonical_digest, approval: values.approval || `APPROVE_OFFICIAL_KITAN_CANARY:${HEAD}:${report.canonical_digest}`, headSha: values.headSha || HEAD, originMainSha: values.originMainSha || HEAD }); }
function kitanRecord(file, productId) { const parsed = parseProviderDetail("kitan_club", fixture(file), `https://kitan.jp/products/${productId}/`); assert.equal(parsed.ok, true); return parsed.record; }
function counts() { return { series: 10, variants: 20, restock_events: 0, import_issues: 0, review_required: 0, provisional_variants: 0 }; }
