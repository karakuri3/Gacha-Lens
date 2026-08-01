import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildAutomaticMarketRolloutPlan, loadAutomaticIngestionRolloutPolicy } from "../lib/domain/automatic-ingestion-rollout.js";
import { buildMarketCandidateKey } from "../lib/domain/market-candidate-key.js";
import {
  MARKET_BOUNDED_REASON_CODES,
  bindMarketBoundedPlanIdentity,
  buildMarketBoundedResult,
  buildMarketBoundedRows,
  calculateMarketAuditDigest,
  calculateMarketBoundedPlanDigest,
  canonicalJson,
  expectedMarketBoundedApproval,
  persistMarketBounded,
  planMarketBoundedOperations,
  renderMarketBoundedResultMarkdown,
  selectExactMarketBoundedCandidates,
  validateMarketBoundedArmingGate,
  validateMarketBoundedPlanIdentity,
} from "../lib/domain/market-bounded-write.js";

const { policy, digest } = loadAutomaticIngestionRolloutPolicy("config/automatic-ingestion-rollout-policy.json");
const headSha = "a".repeat(40);
const workflow = { run_id: "30709799096", run_attempt: "1", head_sha: headSha, event_name: "schedule", ref: "refs/heads/main" };
const productionWorkflow = fs.readFileSync(".github/workflows/gacha-ingestion.yml", "utf8");
const simulationWorkflow = fs.readFileSync(".github/workflows/gacha-ingestion-rollout-simulation.yml", "utf8");
const phase6cFixture = JSON.parse(fs.readFileSync("tests/fixtures/phase6c-simulation-30709799096.json", "utf8"));

test("Phase 6-C source fixture preserves reviewed counts", () => assert.deepEqual({ selected: phase6cFixture.selected_variant_count, candidates: phase6cFixture.candidate_count, eligible: phase6cFixture.auto_eligible_count, excluded: phase6cFixture.excluded_count }, { selected: 5, candidates: 11, eligible: 2, excluded: 9 }));
test("Phase 6-C source fixture preserves two predicted operations", () => assert.deepEqual(phase6cFixture.eligible_candidates.map((entry) => [entry.candidate_key, entry.predicted_listing_operation, entry.predicted_observation_operation]), [["c1282dd4558639ec", "update", "insert"], ["c61bf253eb5fae1c", "insert", "insert"]]));
test("Phase 6-C fixture is evidence, not a Production allowlist", () => { assert.equal(phase6cFixture.human_approved, false); assert.equal(phase6cFixture.bounded_persistence_authorized, false); assert.equal(phase6cFixture.database_writes, 0); });

test("approval format binds policy digest and head SHA", () => assert.equal(expectedMarketBoundedApproval(digest, headSha), `APPROVE_MARKET_BOUNDED:${digest}:${headSha}`));
test("complete arming gate passes", () => assert.equal(gate().ok, true));
for (const [name, overrides, reason] of [
  ["disabled", { bounded_persistence_enabled: "false" }, "bounded_persistence_not_enabled"],
  ["missing approval", { bounded_approval: "" }, "bounded_approval_missing"],
  ["wrong approval", { bounded_approval: "APPROVE_MARKET_BOUNDED:bad" }, "bounded_approval_mismatch"],
  ["wrong head", { head_sha: "b".repeat(40) }, "bounded_approval_mismatch"],
  ["write kill switch", { automatic_write_enabled: "false" }, "bounded_persistence_not_enabled"],
  ["manual event", { event_name: "workflow_dispatch" }, "bounded_persistence_not_enabled"],
  ["wrong ref", { ref: "refs/heads/dev" }, "bounded_persistence_not_enabled"],
  ["wrong task", { task: "official" }, "bounded_persistence_not_enabled"],
  ["wrong schedule", { schedule: "7 * * * *" }, "bounded_persistence_not_enabled"],
  ["wrong stage", { stage: "market-shadow" }, "bounded_persistence_not_enabled"],
  ["main mismatch", { main_sha_verified: false }, "bounded_persistence_not_enabled"],
  ["simulation", { simulation: true }, "bounded_persistence_not_enabled"],
]) test(`arming gate fails closed for ${name}`, () => assert.equal(gate(overrides).reason_code, reason));

test("audit digest is byte exact and deterministic", () => assert.equal(calculateMarketAuditDigest(Buffer.from("abc")), calculateMarketAuditDigest("abc")));
test("audit whitespace changes digest", () => assert.notEqual(calculateMarketAuditDigest("{}"), calculateMarketAuditDigest("{}\n")));
test("canonical JSON sorts object keys", () => assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 })));
test("canonical JSON preserves array order", () => assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1])));
test("plan digest is deterministic", () => { const { plan } = fixture(); assert.equal(calculateMarketBoundedPlanDigest(plan), plan.plan_digest); });
test("plan mutation changes digest", () => { const { plan } = fixture(); const changed = structuredClone(plan); changed.selected_candidate_keys = []; assert.notEqual(calculateMarketBoundedPlanDigest(changed), plan.plan_digest); });
test("identity accepts matching audit and plan", () => assert.match(validateIdentity().plan_digest, /^[0-9a-f]{64}$/));
for (const [name, mutate, reason] of [
  ["audit bytes", ({ auditBytes }) => Buffer.concat([auditBytes, Buffer.from("\n")]), "bounded_audit_digest_mismatch"],
  ["plan digest", ({ plan }) => ({ ...plan, plan_digest: "f".repeat(64) }), "bounded_plan_digest_mismatch"],
  ["run ID", ({ plan }) => rebind({ ...plan, source_run_id: "999" }), "bounded_preflight_changed"],
  ["run attempt", ({ audit }) => ({ ...audit, workflow: { ...audit.workflow, run_attempt: "2" } }), "bounded_preflight_changed"],
  ["head SHA", ({ plan }) => rebind({ ...plan, head_sha: "b".repeat(40) }), "bounded_preflight_changed"],
  ["stage", ({ plan }) => rebind({ ...plan, stage: "market-shadow" }), "bounded_preflight_changed"],
  ["policy", ({ plan }) => rebind({ ...plan, policy_digest: "b".repeat(64) }), "bounded_preflight_changed"],
  ["future timestamp", ({ plan }) => rebind({ ...plan, generated_at: "2026-08-03T00:00:00.000Z", expires_at: "2026-08-03T00:15:00.000Z" }), "bounded_plan_expired"],
  ["expired", ({ plan }) => rebind({ ...plan, generated_at: "2026-08-01T00:00:00.000Z", expires_at: "2026-08-01T00:15:00.000Z" }), "bounded_plan_expired"],
]) test(`identity rejects ${name}`, () => assert.throws(() => validateIdentity(name, mutate), (error) => error.reason_code === reason));

test("exact eligible set is selected", () => assert.equal(selectExactMarketBoundedCandidates(fixture().audit, fixture().plan).length, 2));
test("zero eligible candidates is a valid no-op", () => { const value = fixture(0); assert.deepEqual(selectExactMarketBoundedCandidates(value.audit, value.plan), []); });
for (const [name, mutate] of [
  ["candidate addition", ({ audit }) => { audit.candidates.push(candidate(3)); normalizeAudit(audit); }],
  ["candidate removal", ({ audit }) => { audit.candidates.pop(); normalizeAudit(audit); }],
  ["duplicate key", ({ audit }) => { audit.candidates[1].candidate_key = audit.candidates[0].candidate_key; }],
  ["recomputed key mismatch", ({ audit }) => { audit.candidates[0].source.listing_id = "changed-identity"; }],
]) test(`candidate set rejects ${name}`, () => { const value = fixture(); mutate(value); assert.throws(() => selectExactMarketBoundedCandidates(value.audit, value.plan)); });
test("candidate selector uses deterministic sorted order", () => { const value = fixture(); value.audit.candidates.reverse(); assert.deepEqual(selectExactMarketBoundedCandidates(value.audit, value.plan).map((entry) => entry.candidate_key), value.plan.selected_candidate_keys); });

for (const [name, mutate] of [
  ["confidence below 0.86", (c) => { c.assessment.confidence = 0.859; }],
  ["review required", (c) => { c.assessment.review_required = true; }],
  ["set listing", (c) => { c.listing.listing_type = "partial_set"; }],
  ["inactive", (c) => { c.listing.status = "sold"; }],
  ["unknown provider", (c) => { c.source.provider = "unknown"; }],
  ["variant evidence missing", (c) => { c.checks.variant_evidence_present = false; }],
  ["parent evidence missing", (c) => { c.checks.parent_series_evidence_present = false; }],
  ["edition conflict", (c) => { c.checks.parent_series_edition_conflict = true; }],
  ["price zero", (c) => { c.listing.price = 0; }],
]) test(`unsafe candidate ${name} cannot remain in exact set`, () => {
  const value = fixture(); mutate(value.audit.candidates[0]); value.audit.candidates[0].candidate_key = buildMarketCandidateKey(value.audit.candidates[0]); normalizeAudit(value.audit); assert.throws(() => selectExactMarketBoundedCandidates(value.audit, value.plan));
});

test("row builder creates at most two listing and observation rows", () => { const rows = rowsFixture(); assert.equal(rows.listingRows.length, 2); assert.equal(rows.observationRows.length, 2); });
test("rows bind variant and series identities", () => { const rows = rowsFixture(); assert.equal(rows.listingRows[0].variant_id, rows.candidates[0].target.variant_id); assert.equal(rows.observationRows[0].series_id, rows.candidates[0].target.series_id); });
test("listing rows force safe classification", () => { const row = rowsFixture().listingRows[0]; assert.equal(row.listing_type, "single"); assert.equal(row.market_review_type, "single"); assert.equal(row.review_required, false); });
test("bounded observation uses dedicated deterministic ID", () => { const a = rowsFixture(); const b = rowsFixture(); assert.equal(a.observationRows[0].id, b.observationRows[0].id); assert.match(a.observationRows[0].id, /^market-bounded-observation-/); });
test("bounded rows do not reuse canary markers", () => assert.doesNotMatch(JSON.stringify(rowsFixture()), /canary_audit_run_id|canary_candidate_key/));
test("bounded rows do not contain approval text", () => assert.doesNotMatch(JSON.stringify(rowsFixture()), /APPROVE_MARKET_BOUNDED/));
test("bounded rows contain no credential fields", () => assert.doesNotMatch(JSON.stringify(rowsFixture()), /authorization|cookie|api_key|token/i));

test("new rows plan inserts", () => { const rows = rowsFixture(); const ops = planMarketBoundedOperations({ listingRows: rows.listingRows, observationRows: rows.observationRows }); assert.equal(ops.listings.every((x) => x.operation === "insert"), true); });
test("identical rows plan unchanged", () => { const rows = rowsFixture(); const ops = planMarketBoundedOperations({ listingRows: rows.listingRows, observationRows: rows.observationRows, existingListings: rows.listingRows, existingObservations: rows.observationRows }); assert.equal(ops.observations.every((x) => x.operation === "unchanged"), true); });
test("same observation ID with changed content fails closed", () => { const rows = rowsFixture(); const existing = structuredClone(rows.observationRows); existing[0].price += 1; assert.throws(() => planMarketBoundedOperations({ listingRows: rows.listingRows, observationRows: rows.observationRows, existingObservations: existing })); });
for (const [name, mutate] of [
  ["provider", (row) => { row.raw.provider = row.raw.provider === "yahoo_shopping" ? "rakuten_ichiba" : "yahoo_shopping"; }],
  ["source listing", (row) => { row.raw.source_listing_id = "other"; }],
  ["URL", (row) => { row.raw.public_url = "https://item.rakuten.co.jp/shop/other"; row.source_url = row.raw.public_url; }],
  ["variant", (row) => { row.variant_id = "other"; }],
  ["series", (row) => { row.series_id = "other"; }],
]) test(`existing listing ${name} conflict fails closed`, () => { const rows = rowsFixture(); const existing = structuredClone(rows.listingRows); mutate(existing[0]); assert.throws(() => planMarketBoundedOperations({ listingRows: rows.listingRows, observationRows: rows.observationRows, existingListings: existing })); });

test("persistence writes listings before observations with batch size two", async () => { const store = fakeStore(); const rows = rowsFixture(); const result = await persistMarketBounded({ listingRows: rows.listingRows, observationRows: rows.observationRows, store }); assert.equal(result.ok, true); assert.deepEqual(store.calls.slice(0, 2).map((x) => x.table), ["market_listings", "market_listing_observations"]); assert.equal(store.calls.every((x) => x.options.batchSize <= 2 && x.options.allowSchemaFallback === false), true); });
test("durable run row is built from the final operation plan", async () => { const store = fakeStore(); const rows = rowsFixture(); const id = "bounded-run-final-operations"; await persistMarketBounded({ listingRows: rows.listingRows, observationRows: rows.observationRows, durableRunId: id, buildDurableRunRow: (operations) => ({ id, task: "market", summary: { listing_inserts: operations.listings.filter((entry) => entry.operation === "insert").length, observation_inserts: operations.observations.filter((entry) => entry.operation === "insert").length } }), store }); assert.deepEqual(store.getRow("ingestion_runs", id).summary, { listing_inserts: 2, observation_inserts: 2 }); });
test("second identical persistence performs zero writes", async () => { const store = fakeStore(); const rows = rowsFixture(); await persistMarketBounded({ listingRows: rows.listingRows, observationRows: rows.observationRows, store }); store.calls.length = 0; const result = await persistMarketBounded({ listingRows: rows.listingRows, observationRows: rows.observationRows, store }); assert.equal(result.database_writes, 0); assert.equal(store.calls.length, 0); });
test("listing failure never starts observation write", async () => { const store = fakeStore({ failTable: "market_listings" }); const rows = rowsFixture(); await assert.rejects(() => persistMarketBounded({ listingRows: rows.listingRows, observationRows: rows.observationRows, store })); assert.equal(store.calls.some((x) => x.table === "market_listing_observations"), false); });
test("observation failure triggers verified rollback", async () => { const store = fakeStore({ failTableOnce: "market_listing_observations" }); const rows = rowsFixture(); const error = await rejected(() => persistMarketBounded({ listingRows: rows.listingRows, observationRows: rows.observationRows, store })); assert.equal(error.bounded_result.rollback.attempted, true); assert.equal(error.bounded_result.rollback.verified, true); });
test("unexpected count delta triggers rollback", async () => { const store = fakeStore({ unexpectedDelta: true }); const rows = rowsFixture(); const error = await rejected(() => persistMarketBounded({ listingRows: rows.listingRows, observationRows: rows.observationRows, store })); assert.equal(error.bounded_result.rollback.attempted, true); });
test("external observation prevents unsafe new listing deletion", async () => { const store = fakeStore({ failTableOnce: "market_listing_observations", externalReference: true }); const rows = rowsFixture(); const error = await rejected(() => persistMarketBounded({ listingRows: rows.listingRows, observationRows: rows.observationRows, store })); assert.equal(error.reason_code, "bounded_rollback_failed"); });

test("result status allowlist accepts succeeded", () => assert.equal(buildResult("succeeded").result.status, "succeeded"));
for (const status of ["blocked", "no-op", "succeeded", "failed", "rolled-back", "rollback-failed"]) test(`result supports ${status}`, () => assert.equal(buildResult(status).result.status, status));
test("result omits approval and raw payload", () => assert.doesNotMatch(JSON.stringify(buildResult("failed")), /APPROVE_MARKET_BOUNDED|raw response/i));
test("error URL and token values are redacted", () => { const result = buildMarketBoundedResult({ status: "failed", reason_code: "bounded_verification_failed", error_message: "token=abc https://private.example/x" }); assert.doesNotMatch(result.result.error_message, /abc|private\.example/); });
test("Markdown and JSON agree on status and writes", () => { const result = buildResult("succeeded"); const md = renderMarketBoundedResultMarkdown(result); assert.match(md, /Status: succeeded/); assert.match(md, new RegExp(`Production writes: ${result.database_writes}`)); });

test("Production workflow defaults bounded persistence disabled", () => assert.match(productionWorkflow, /AUTOMATIC_INGESTION_BOUNDED_PERSISTENCE_ENABLED:[^\n]*false/));
test("Production workflow defaults bounded approval empty", () => assert.match(productionWorkflow, /AUTOMATIC_INGESTION_BOUNDED_APPROVAL:[^\n]*''/));
test("Production bounded persistence requires schedule event", () => assert.match(productionWorkflow, /Run bounded market persistence[\s\S]*github\.event_name == 'schedule'/));
test("Production bounded persistence requires exact market schedule", () => assert.match(productionWorkflow, /github\.event\.schedule == '17,47 \* \* \* \*'/));
test("Production bounded persistence requires all final outputs", () => assert.match(productionWorkflow, /persistence_authorized == 'true'[\s\S]*bounded_persistence_enabled == 'true'[\s\S]*bounded_approval_valid == 'true'/));
test("blocked bounded result is generated before source fetch", () => assert.ok(productionWorkflow.indexOf("Generate blocked bounded result before source fetch") < productionWorkflow.indexOf("Run controlled market backfill")));
test("Production rollout keeps normal ingestion separate", () => assert.match(productionWorkflow, /Run ingestion[\s\S]*mode == 'write'/));
test("Production bounded branch does not invoke cleanup", () => { const bounded = productionWorkflow.match(/- name: Run bounded market persistence[\s\S]*?- name: Scan rollout report/)?.[0] ?? ""; assert.doesNotMatch(bounded, /cleanup|canary-write|db:upsert-all/); });
test("Simulation fixes bounded gate off", () => assert.match(simulationWorkflow, /AUTOMATIC_INGESTION_BOUNDED_PERSISTENCE_ENABLED:\s*"false"/));
test("Simulation fixes bounded approval empty", () => assert.match(simulationWorkflow, /AUTOMATIC_INGESTION_BOUNDED_APPROVAL:\s*""/));
test("Simulation generates persistence preview", () => assert.match(simulationWorkflow, /Generate bounded persistence preview without writes/));
test("Simulation never invokes persistence command", () => assert.doesNotMatch(simulationWorkflow, /market:bounded-persist|Run bounded market persistence/));
test("bounded reason codes are unique", () => assert.equal(new Set(MARKET_BOUNDED_REASON_CODES).size, MARKET_BOUNDED_REASON_CODES.length));

function gate(overrides = {}) {
  return validateMarketBoundedArmingGate({ simulation: false, event_name: "schedule", ref: "refs/heads/main", main_sha_verified: true, task: "market", schedule: "17,47 * * * *", stage: "market-bounded", automatic_write_enabled: "true", bounded_persistence_enabled: "true", bounded_approval: expectedMarketBoundedApproval(digest, headSha), policy_digest: digest, head_sha: headSha, ...overrides });
}

function candidate(index) {
  const value = {
    source: { provider: index % 2 ? "rakuten_ichiba" : "yahoo_shopping", listing_id: `listing-${index}`, public_url: index % 2 ? `https://item.rakuten.co.jp/shop/item-${index}/` : `https://store.shopping.yahoo.co.jp/shop/item-${index}.html` },
    listing: { title: `Series ${index} Variant ${index}`, price: 400 + index, status: "active", listing_type: "single", listed_at: "2026-08-02T00:00:00.000Z" },
    target: { variant_id: `variant-${index}`, variant_slug: `variant-${index}`, variant_name: `Variant ${index}`, series_id: `series-${index}`, series_slug: `series-${index}`, series_name: `Series ${index}`, search_query: `Series ${index} Variant ${index}` },
    assessment: { accepted: true, review_required: false, reason: "variant_and_parent_evidence_confirmed", confidence: 0.86, matched_variant_ids: [`variant-${index}`] },
    checks: { variant_evidence_present: true, parent_series_evidence_present: true, set_signal_detected: false, multiple_variant_candidates: false, explicit_variant_conflict: false, explicit_label_other_variant_match: false, explicit_label_unresolved: false, parent_series_edition_conflict: false },
  };
  value.candidate_key = buildMarketCandidateKey(value);
  return value;
}

function fixture(count = 2) {
  const candidates = Array.from({ length: count }, (_, index) => candidate(index + 1));
  const audit = { schema_version: 1, mode: "dry-run", source_scope: "planner-apis", workflow: { ...workflow }, selection: { selected_variant_count: Math.max(1, count), query_count: Math.max(1, count), selected_variants: Array.from({ length: Math.max(1, count) }, (_, index) => ({ variant_id: `variant-${index + 1}`, variant_slug: `variant-${index + 1}`, variant_name: `Variant ${index + 1}`, series_id: `series-${index + 1}`, series_slug: `series-${index + 1}`, series_name: `Series ${index + 1}`, query: `Series ${index + 1} Variant ${index + 1}` })) }, result: { candidate_count: count, accepted_count: count, review_count: 0, report_complete: true, truncated_count: 0 }, database_writes: { listings: 0, observations: 0, ingestion_runs: 0 }, candidates };
  const auditBytes = Buffer.from(`${JSON.stringify(audit, null, 2)}\n`);
  const basePlan = buildAutomaticMarketRolloutPlan({ policy, policy_digest: digest, stage: "market-bounded", audit, source_run_id: workflow.run_id, head_sha: headSha, generated_at: "2026-08-02T00:00:00.000Z", throttle: { state: "clear" } });
  const plan = bindMarketBoundedPlanIdentity(basePlan, { audit_digest: calculateMarketAuditDigest(auditBytes), generated_at: "2026-08-02T00:00:00.000Z" });
  return { audit, auditBytes, plan };
}

function normalizeAudit(audit) { audit.result.candidate_count = audit.candidates.length; audit.result.accepted_count = audit.candidates.filter((x) => x.assessment.accepted).length; audit.result.review_count = audit.candidates.filter((x) => x.assessment.review_required).length; }
function rebind(plan) { const value = structuredClone(plan); value.plan_digest = calculateMarketBoundedPlanDigest(value); return value; }
function validateIdentity(name, mutate) { let value = fixture(); if (mutate) { const changed = mutate(value); if (Buffer.isBuffer(changed)) value.auditBytes = changed; else if (changed?.schema_version && changed?.workflow) value.audit = changed; else if (changed?.plan_digest) value.plan = changed; } return validateMarketBoundedPlanIdentity({ audit_bytes: value.auditBytes, audit: value.audit, plan: value.plan, workflow, policy_digest: digest, simulation: false, now: "2026-08-02T00:05:00.000Z" }); }
function rowsFixture() { const value = fixture(); return buildMarketBoundedRows({ audit: value.audit, plan: value.plan, workflow, observed_at: value.plan.generated_at }); }

function fakeStore(options = {}) {
  const tables = { market_listings: new Map(), market_listing_observations: new Map(), ingestion_runs: new Map() };
  let failedOnce = false;
  const store = {
    calls: [],
    getRow(table, id) { return structuredClone(tables[table]?.get(id)); },
    async fetchRowsByIds(table, ids) { return ids.filter((id) => tables[table]?.has(id)).map((id) => structuredClone(tables[table].get(id))); },
    async fetchCounts() { return { market_listings: tables.market_listings.size, market_listing_observations: tables.market_listing_observations.size, import_issues: options.unexpectedDelta && store.calls.length ? 1 : 0, ingestion_runs: tables.ingestion_runs.size, review_required: 0, series: 10, variants: 20, stock_reports: 0, restock_events: 0 }; },
    async upsertRows(table, rows, writeOptions) { store.calls.push({ table, rows: structuredClone(rows), options: writeOptions }); if (options.failTable === table || (options.failTableOnce === table && !failedOnce)) { failedOnce = true; throw new Error("injected failure"); } for (const row of rows) tables[table].set(row.id, structuredClone(row)); },
    async deleteRowsByIds(table, ids) { for (const id of ids) tables[table].delete(id); return ids.length; },
    async fetchObservationsByListingIds(ids) { return options.externalReference ? [{ id: "external", listing_id: ids[0] }] : [...tables.market_listing_observations.values()].filter((row) => ids.includes(row.listing_id)); },
  };
  return store;
}

async function rejected(fn) { try { await fn(); assert.fail("Expected rejection"); } catch (error) { return error; } }
function buildResult(status) { const rows = rowsFixture(); return buildMarketBoundedResult({ workflow, plan: fixture().plan, rows, operations: planMarketBoundedOperations({ listingRows: rows.listingRows, observationRows: rows.observationRows }), status, verification: { rows_verified: status === "succeeded", deltas_verified: status === "succeeded" }, database_writes: status === "succeeded" ? 4 : 0 }); }
