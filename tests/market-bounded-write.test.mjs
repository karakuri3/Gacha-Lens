import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildAutomaticMarketRolloutPlan, loadAutomaticIngestionRolloutPolicy } from "../lib/domain/automatic-ingestion-rollout.js";
import { buildMarketCandidateKey } from "../lib/domain/market-candidate-key.js";
import {
  MARKET_BOUNDED_REASON_CODES,
  bindMarketBoundedPlanIdentity,
  buildMarketBoundedDurableRunId,
  buildMarketBoundedResult,
  buildMarketBoundedRows,
  calculateMarketAuditDigest,
  calculateMarketBoundedPlanDigest,
  canonicalizeBoundedMarketplaceUrl,
  canonicalJson,
  expectedMarketBoundedApproval,
  persistMarketBounded,
  planMarketBoundedOperations,
  renderMarketBoundedResultMarkdown,
  resolveBoundedMarketplaceIdentity,
  sanitizeBoundedIdentityDiagnostic,
  sanitizeBoundedVerificationDiagnostic,
  selectExactMarketBoundedCandidates,
  validateMarketBoundedArmingGate,
  validateMarketBoundedPlanIdentity,
} from "../lib/domain/market-bounded-write.js";
import { buildManualMarketBoundedDurableRunId } from "../lib/domain/manual-market-bounded-execution.js";

const { policy, digest } = loadAutomaticIngestionRolloutPolicy("config/automatic-ingestion-rollout-policy.json");
const headSha = "a".repeat(40);
const workflow = { run_id: "30709799096", run_attempt: "1", head_sha: headSha, event_name: "schedule", ref: "refs/heads/main" };
const productionWorkflow = fs.readFileSync(".github/workflows/gacha-ingestion.yml", "utf8");
const simulationWorkflow = fs.readFileSync(".github/workflows/gacha-ingestion-rollout-simulation.yml", "utf8");
const phase6cFixture = JSON.parse(fs.readFileSync("tests/fixtures/phase6c-simulation-30709799096.json", "utf8"));
const phase6d1Fixture = JSON.parse(fs.readFileSync("tests/fixtures/phase6d1-url-identity-30711938430.json", "utf8"));
const rolloutRunner = fs.readFileSync("scripts/automatic-ingestion-rollout.mjs", "utf8");
const scheduledRunner = fs.readFileSync("scripts/market-bounded-persistence.mjs", "utf8");
const UUID_V8 = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("shared bounded durable ID is a deterministic RFC UUIDv8", () => {
  const input = { execution_path: "scheduled", workflow_run_id: "30709799096", workflow_run_attempt: "1", plan_digest: "d".repeat(64) };
  const first = buildMarketBoundedDurableRunId(input);
  assert.match(first, UUID_V8);
  assert.equal(first, buildMarketBoundedDurableRunId(input));
});

test("shared bounded durable ID changes with identity inputs and namespace", () => {
  const input = { execution_path: "scheduled", workflow_run_id: "30709799096", workflow_run_attempt: "1", plan_digest: "d".repeat(64) };
  const baseline = buildMarketBoundedDurableRunId(input);
  assert.notEqual(buildMarketBoundedDurableRunId({ ...input, workflow_run_id: "30709799097" }), baseline);
  assert.notEqual(buildMarketBoundedDurableRunId({ ...input, workflow_run_attempt: "2" }), baseline);
  assert.notEqual(buildMarketBoundedDurableRunId({ ...input, plan_digest: "e".repeat(64) }), baseline);
  assert.notEqual(buildMarketBoundedDurableRunId({ ...input, execution_path: "manual" }), baseline);
});

for (const [name, input] of [
  ["unknown namespace", { execution_path: "unknown", workflow_run_id: "30709799096", workflow_run_attempt: "1", plan_digest: "d".repeat(64) }],
  ["missing run ID", { execution_path: "scheduled", workflow_run_attempt: "1", plan_digest: "d".repeat(64) }],
  ["invalid digest", { execution_path: "scheduled", workflow_run_id: "30709799096", workflow_run_attempt: "1", plan_digest: "invalid" }],
]) test(`shared bounded durable ID fails closed for ${name}`, () => assert.throws(() => buildMarketBoundedDurableRunId(input), /identity is invalid/));

test("scheduled persistence shares one UUID across snapshot, persistence, and durable row", () => {
  assert.doesNotMatch(scheduledRunner, /stableId\("market-bounded-run"/);
  assert.match(scheduledRunner, /const durableRunId = buildMarketBoundedDurableRunId\([\s\S]*durableRunId,[\s\S]*durableRunRow\(\{ id: durableRunId,/);
  assert.match(scheduledRunner, /trigger_source:\s*"schedule"/);
});

test("Phase 6-C source fixture preserves reviewed counts", () => assert.deepEqual({ selected: phase6cFixture.selected_variant_count, candidates: phase6cFixture.candidate_count, eligible: phase6cFixture.auto_eligible_count, excluded: phase6cFixture.excluded_count }, { selected: 5, candidates: 11, eligible: 2, excluded: 9 }));
test("Phase 6-C source fixture preserves two predicted operations", () => assert.deepEqual(phase6cFixture.eligible_candidates.map((entry) => [entry.candidate_key, entry.predicted_listing_operation, entry.predicted_observation_operation]), [["c1282dd4558639ec", "update", "insert"], ["c61bf253eb5fae1c", "insert", "insert"]]));
test("Phase 6-C fixture is evidence, not a Production allowlist", () => { assert.equal(phase6cFixture.human_approved, false); assert.equal(phase6cFixture.bounded_persistence_authorized, false); assert.equal(phase6cFixture.database_writes, 0); });
test("Phase 6-D.1 fixture preserves the sanitized failed preview evidence", () => { assert.equal(phase6d1Fixture.source_run_id, "30711938430"); assert.equal(phase6d1Fixture.failed_candidate.candidate_key, "c1282dd4558639ec"); assert.equal(phase6d1Fixture.database_writes, 0); assert.equal(phase6d1Fixture.production_write_authorized, false); });
test("Phase 6-D.1 fixture preserves the expected two-candidate operation plan", () => assert.deepEqual(phase6d1Fixture.expected_operations_after_fix, { listing_updates: 1, listing_inserts: 1, observation_inserts: 2, database_writes: 0 }));
test("Phase 6-D.1 fixture contains no tracking query or credential", () => assert.doesNotMatch(JSON.stringify(phase6d1Fixture), /\?|password|token|credential|affiliate/i));

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
test("reordered selected keys fail closed", () => {
  const value = fixture();
  value.plan = rebind({ ...value.plan, selected_candidate_keys: [...value.plan.selected_candidate_keys].reverse() });
  assert.throws(() => selectExactMarketBoundedCandidates(value.audit, value.plan), (error) => error.reason_code === "bounded_candidate_set_mismatch");
});
test("substituting another independently safe candidate fails closed", () => {
  const value = fixture(3);
  value.plan = rebind({
    ...value.plan,
    selected_candidate_keys: [value.plan.selected_candidate_keys[0], value.audit.candidates[2].candidate_key],
  });
  assert.throws(() => selectExactMarketBoundedCandidates(value.audit, value.plan), (error) => error.reason_code === "bounded_candidate_set_mismatch");
});
test("a selected candidate becoming review-required fails before rows are built", () => {
  const value = fixture(3);
  value.audit.candidates[0].assessment.accepted = false;
  value.audit.candidates[0].assessment.review_required = true;
  value.audit.candidates[0].assessment.reason = "review_required";
  value.audit.candidates[0].candidate_key = buildMarketCandidateKey(value.audit.candidates[0]);
  normalizeAudit(value.audit);
  assert.throws(() => buildMarketBoundedRows({ audit: value.audit, plan: value.plan, workflow }), (error) => error.reason_code === "bounded_candidate_set_mismatch");
});
test("an unselected safe candidate mutation changes the bound audit digest", () => {
  const value = fixture(3);
  const approvedBytes = value.auditBytes;
  value.audit.candidates[2].listing.price += 1;
  value.audit.candidates[2].candidate_key = buildMarketCandidateKey(value.audit.candidates[2]);
  value.auditBytes = Buffer.from(`${JSON.stringify(value.audit, null, 2)}\n`);
  assert.notEqual(calculateMarketAuditDigest(value.auditBytes), calculateMarketAuditDigest(approvedBytes));
  assert.throws(() => validateMarketBoundedPlanIdentity({
    audit_bytes: value.auditBytes,
    audit: value.audit,
    plan: value.plan,
    workflow,
    policy_digest: digest,
    simulation: false,
    now: "2026-08-02T00:05:00.000Z",
  }), (error) => error.reason_code === "bounded_audit_digest_mismatch");
});
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
test("bounded rows contain no credential fields", () => assert.doesNotMatch(JSON.stringify(rowsFixture()), /authorization|cookie|api.?key|application.?id|access.?key|affiliate.?id|headers?|token/i));
test("bounded rows preserve allowlisted Rakuten affiliate provenance separately from identity", () => {
  const value = fixture(1);
  const candidate = value.audit.candidates[0];
  const originalKey = candidate.candidate_key;
  candidate.source.affiliate_destination = {
    url: "https://hb.afl.rakuten.co.jp/hgc/provider-issued",
    source: "rakuten_api",
    contract: "item_search_20260701_item_code_join",
    documentation: "https://webservice.rakuten.co.jp/documentation/ichiba-item-search",
  };
  const rows = buildMarketBoundedRows({ audit: value.audit, plan: value.plan, workflow, observed_at: value.plan.generated_at });
  assert.equal(candidate.candidate_key, originalKey);
  assert.equal(rows.listingRows[0].source_url, candidate.source.public_url);
  assert.equal(rows.listingRows[0].raw.public_url, candidate.source.public_url);
  assert.equal(rows.listingRows[0].raw.affiliate_url, candidate.source.affiliate_destination.url);
  assert.equal(rows.listingRows[0].raw.affiliate_url_source, "rakuten_api");
  assert.equal(rows.listingRows[0].raw.affiliate_url_contract, "item_search_20260701_item_code_join");
});
test("bounded rows reject fabricated Rakuten affiliate provenance before persistence", () => {
  const value = fixture(1);
  value.audit.candidates[0].source.affiliate_destination = {
    url: "https://hb.afl.rakuten.co.jp/hgc/fabricated",
    source: "manual",
    contract: "item_search_20260701_item_code_join",
    documentation: "https://webservice.rakuten.co.jp/documentation/ichiba-item-search",
  };
  assert.throws(
    () => buildMarketBoundedRows({ audit: value.audit, plan: value.plan, workflow, observed_at: value.plan.generated_at }),
    (error) => error.reason_code === "bounded_candidate_identity_mismatch"
  );
});

test("new rows plan inserts", () => { const rows = rowsFixture(); const ops = planMarketBoundedOperations({ listingRows: rows.listingRows, observationRows: rows.observationRows }); assert.equal(ops.listings.every((x) => x.operation === "insert"), true); });
test("identical rows plan unchanged", () => { const rows = rowsFixture(); const ops = planMarketBoundedOperations({ listingRows: rows.listingRows, observationRows: rows.observationRows, existingListings: rows.listingRows, existingObservations: rows.observationRows }); assert.equal(ops.observations.every((x) => x.operation === "unchanged"), true); });
test("same observation ID with changed content fails closed", () => { const rows = rowsFixture(); const existing = structuredClone(rows.observationRows); existing[0].price += 1; assert.throws(() => planMarketBoundedOperations({ listingRows: rows.listingRows, observationRows: rows.observationRows, existingObservations: existing })); });
test("bounded URL identity removes query hash and non-root trailing slashes", () => assert.equal(canonicalizeBoundedMarketplaceUrl("https://ITEM.RAKUTEN.CO.JP/shop/item///?tracking=redacted#section"), "https://item.rakuten.co.jp/shop/item"));
test("bounded URL identity preserves a root slash", () => assert.equal(canonicalizeBoundedMarketplaceUrl("https://item.rakuten.co.jp/?tracking=redacted"), "https://item.rakuten.co.jp/"));
test("bounded URL identity preserves protocol semantics", () => assert.notEqual(canonicalizeBoundedMarketplaceUrl("http://item.rakuten.co.jp/shop/item"), canonicalizeBoundedMarketplaceUrl("https://item.rakuten.co.jp/shop/item")));
test("bounded URL identity preserves hostname semantics", () => assert.notEqual(canonicalizeBoundedMarketplaceUrl("https://item.rakuten.co.jp/shop/item"), canonicalizeBoundedMarketplaceUrl("https://example.jp/shop/item")));
test("bounded URL identity preserves path semantics", () => assert.notEqual(canonicalizeBoundedMarketplaceUrl("https://item.rakuten.co.jp/shop/item-a"), canonicalizeBoundedMarketplaceUrl("https://item.rakuten.co.jp/shop/item-b")));
test("bounded URL identity does not collapse internal duplicate slashes", () => assert.equal(canonicalizeBoundedMarketplaceUrl("https://item.rakuten.co.jp/shop//item/"), "https://item.rakuten.co.jp/shop//item"));
test("bounded URL identity does not decode percent encoding", () => assert.match(canonicalizeBoundedMarketplaceUrl("https://item.rakuten.co.jp/shop/%E3%82%AC%E3%83%81%E3%83%A3/"), /%E3%82%AC%E3%83%81%E3%83%A3/));
test("bounded URL identity preserves path case", () => assert.notEqual(canonicalizeBoundedMarketplaceUrl("https://item.rakuten.co.jp/Shop/Item"), canonicalizeBoundedMarketplaceUrl("https://item.rakuten.co.jp/shop/item")));
test("bounded URL identity rejects embedded credentials", () => assert.equal(canonicalizeBoundedMarketplaceUrl("https://user:secret@item.rakuten.co.jp/shop/item"), null));
test("bounded resolver accepts query hash and trailing slash drift across raw history", () => { const row = structuredClone(rowsFixture().listingRows[0]); const canonical = row.source_url.replace(/\/+$/, ""); row.source_url = `${canonical}/?tracking=redacted#fragment`; row.raw = { ...row.raw, public_url: canonical, raw: { ...row.raw, source_url: `${canonical}///?other=redacted` } }; const identity = resolveBoundedMarketplaceIdentity(row); assert.equal(identity.complete, true); assert.equal(identity.publicUrl, canonical); });
test("bounded resolver rejects provider conflict in nested raw", () => { const row = structuredClone(rowsFixture().listingRows[0]); const conflictingProvider = row.raw.provider === "yahoo_shopping" ? "rakuten_ichiba" : "yahoo_shopping"; row.raw.raw = { ...row.raw, provider: conflictingProvider }; assert.equal(resolveBoundedMarketplaceIdentity(row).complete, false); });
test("bounded resolver rejects source listing conflict in nested raw", () => { const row = structuredClone(rowsFixture().listingRows[0]); row.raw.raw = { ...row.raw, source_listing_id: "other-listing" }; assert.equal(resolveBoundedMarketplaceIdentity(row).complete, false); });
test("bounded resolver rejects cyclic raw", () => { const row = structuredClone(rowsFixture().listingRows[0]); row.raw.raw = row.raw; assert.equal(resolveBoundedMarketplaceIdentity(row).conflicts.raw_chain, true); });
test("bounded resolver rejects depth 128 raw", () => { const row = structuredClone(rowsFixture().listingRows[0]); let cursor = row.raw; for (let index = 0; index < 128; index += 1) { cursor.raw = { ...row.raw }; cursor = cursor.raw; } assert.equal(resolveBoundedMarketplaceIdentity(row).conflicts.raw_chain, true); });
test("bounded resolver rejects non-object raw tail", () => { const row = structuredClone(rowsFixture().listingRows[0]); row.raw.raw = "invalid"; assert.equal(resolveBoundedMarketplaceIdentity(row).conflicts.raw_chain, true); });
test("bounded resolver rejects a credential-bearing URL anywhere in raw history", () => { const row = structuredClone(rowsFixture().listingRows[0]); row.raw.raw = { ...row.raw, public_url: "https://user:secret@item.rakuten.co.jp/shop/item" }; const identity = resolveBoundedMarketplaceIdentity(row); assert.equal(identity.complete, false); assert.equal(identity.conflicts.public_url, true); });
test("bounded operation accepts equivalent tracked existing URL and plans only the content update", () => { const rows = rowsFixture(); const existing = structuredClone(rows.listingRows); existing[0].source_url = `${existing[0].source_url}?tracking=redacted`; existing[0].raw.public_url = `${existing[0].raw.public_url}/?other=redacted`; const operations = planMarketBoundedOperations({ listingRows: rows.listingRows, observationRows: rows.observationRows, existingListings: existing }); assert.equal(operations.listings[0].operation, "update"); });
test("bounded identity failure exposes only an allowlisted diagnostic", () => { const rows = rowsFixture(); const existing = structuredClone(rows.listingRows); existing[0].source_url = "https://item.rakuten.co.jp/shop/other"; existing[0].raw.public_url = existing[0].source_url; let error; try { planMarketBoundedOperations({ listingRows: rows.listingRows, observationRows: rows.observationRows, existingListings: existing }); } catch (value) { error = value; } assert.ok(error); assert.deepEqual(Object.keys(error.identity_diagnostic), ["candidate_key", "conflict_field", "provider", "listing_id"]); assert.doesNotMatch(JSON.stringify(error.identity_diagnostic), /https:|tracking|raw|token/i); });
test("bounded identity diagnostic sanitizes unknown fields", () => assert.deepEqual(sanitizeBoundedIdentityDiagnostic({ candidate_key: "c1282dd4558639ec", conflict_field: "public_url", provider: "rakuten_ichiba", listing_id: "safe-id", public_url: "https://private.example", token: "secret" }), { candidate_key: "c1282dd4558639ec", conflict_field: "public_url", provider: "rakuten_ichiba", listing_id: "safe-id" }));
for (const [name, mutate] of [
  ["provider", (row) => { row.raw.provider = row.raw.provider === "yahoo_shopping" ? "rakuten_ichiba" : "yahoo_shopping"; }],
  ["source listing", (row) => { row.raw.source_listing_id = "other"; }],
  ["URL", (row) => { row.raw.public_url = "https://item.rakuten.co.jp/shop/other"; row.source_url = row.raw.public_url; }],
  ["variant", (row) => { row.variant_id = "other"; }],
  ["series", (row) => { row.series_id = "other"; }],
]) test(`existing listing ${name} conflict fails closed`, () => { const rows = rowsFixture(); const existing = structuredClone(rows.listingRows); mutate(existing[0]); assert.throws(() => planMarketBoundedOperations({ listingRows: rows.listingRows, observationRows: rows.observationRows, existingListings: existing })); });

test("persistence writes listings before observations with batch size two", async () => { const store = fakeStore(); const rows = rowsFixture(); const result = await persistMarketBounded({ listingRows: rows.listingRows, observationRows: rows.observationRows, store }); assert.equal(result.ok, true); assert.deepEqual(store.calls.slice(0, 2).map((x) => x.table), ["market_listings", "market_listing_observations"]); assert.equal(store.calls.every((x) => x.options.batchSize <= 2 && x.options.allowSchemaFallback === false), true); });
test("durable run row is built from the final operation plan", async () => { const store = fakeStore(); const rows = rowsFixture(); const id = buildMarketBoundedDurableRunId({ execution_path: "scheduled", workflow_run_id: "30709799096", workflow_run_attempt: "1", plan_digest: "f".repeat(64) }); await persistMarketBounded({ listingRows: rows.listingRows, observationRows: rows.observationRows, durableRunId: id, buildDurableRunRow: (operations) => ({ id, task: "market", summary: { listing_inserts: operations.listings.filter((entry) => entry.operation === "insert").length, observation_inserts: operations.observations.filter((entry) => entry.operation === "insert").length } }), store }); assert.equal(store.getRow("ingestion_runs", id).id, id); assert.deepEqual(store.getRow("ingestion_runs", id).summary, { listing_inserts: 2, observation_inserts: 2 }); });
test("equivalent PostgREST timestamp representations pass E.9-sized verification", async () => {
  const rows = rowsFixture();
  const existingListing = { ...structuredClone(rows.listingRows[0]), status: "sold" };
  const durable = durableRunFixture();
  const store = fakeStore({
    initialRows: { market_listings: [existingListing] },
    postgrestTimestampSerialization: true,
  });
  const result = await persistMarketBounded({
    listingRows: rows.listingRows,
    observationRows: rows.observationRows,
    durableRunId: durable.id,
    buildDurableRunRow: () => durable,
    store,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.operations.listings.map((entry) => entry.operation), ["update", "insert"]);
  assert.deepEqual(result.operations.observations.map((entry) => entry.operation), ["insert", "insert"]);
  assert.equal(result.operations.durable_run, "insert");
  assert.equal(result.database_writes, 5);
  assert.equal(result.verification.rows_verified, true);
  assert.match(durable.id, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(store.reads.filter((entry) => entry.table === "ingestion_runs").length >= 2);
  assert.equal(store.calls.filter((entry) => entry.table === "ingestion_runs").length, 1);
});
test("genuinely different observation timestamps fail closed and roll back", async () => {
  const error = await verificationFailure((table, row, state) => {
    if (table === "market_listing_observations" && state.hasWrites) row.observed_at = "2026-08-02T00:00:01.000Z";
    return row;
  });
  assert.deepEqual(error.bounded_result.verification_diagnostic, { table: "market_listing_observations", field: "observed_at", mismatch_reason: "field_mismatch" });
  assert.equal(error.bounded_result.rollback.verified, true);
});
test("invalid observation timestamp representations fail closed", async () => {
  const error = await verificationFailure((table, row, state) => {
    if (table === "market_listing_observations" && state.hasWrites) row.observed_at = "not-a-timestamp";
    return row;
  });
  assert.equal(error.bounded_result.verification_diagnostic.field, "observed_at");
  assert.equal(error.bounded_result.rollback.verified, true);
});
test("genuinely different durable timestamps fail closed", async () => {
  const rows = rowsFixture();
  const durable = durableRunFixture();
  const store = fakeStore({
    readTransform(table, row, state) {
      if (table === "ingestion_runs" && state.hasWrites) row.finished_at = "2026-08-02T00:00:01.000Z";
      return row;
    },
  });
  const error = await rejected(() => persistMarketBounded({
    listingRows: rows.listingRows,
    observationRows: rows.observationRows,
    durableRunId: durable.id,
    buildDurableRunRow: () => durable,
    store,
  }));
  assert.deepEqual(error.bounded_result.verification_diagnostic, { table: "ingestion_runs", field: "finished_at", mismatch_reason: "field_mismatch" });
  assert.equal(error.bounded_result.rollback.verified, true);
});
test("timestamp-like strings inside durable summary remain strict", async () => {
  const rows = rowsFixture();
  const durable = durableRunFixture();
  const store = fakeStore({
    readTransform(table, row, state) {
      if (table === "ingestion_runs" && state.hasWrites) row.summary.timestamp_like_text = "2026-08-02T00:00:00+00:00";
      return row;
    },
  });
  const error = await rejected(() => persistMarketBounded({
    listingRows: rows.listingRows,
    observationRows: rows.observationRows,
    durableRunId: durable.id,
    buildDurableRunRow: () => durable,
    store,
  }));
  assert.deepEqual(error.bounded_result.verification_diagnostic, { table: "ingestion_runs", field: "summary", mismatch_reason: "field_mismatch" });
  assert.equal(error.bounded_result.rollback.verified, true);
});
test("timestamp-like strings inside raw JSON remain strict", async () => {
  const error = await verificationFailure((table, row, state) => {
    if (table === "market_listing_observations" && state.hasWrites) row.raw = { ...row.raw, observed_at: "2026-08-02T00:00:00+00:00" };
    return row;
  });
  assert.deepEqual(error.bounded_result.verification_diagnostic, { table: "market_listing_observations", field: "raw", mismatch_reason: "field_mismatch" });
});
test("non-timestamp field mismatches remain strict", async () => {
  const error = await verificationFailure((table, row, state) => {
    if (table === "market_listing_observations" && state.hasWrites) row.status = "sold";
    return row;
  });
  assert.deepEqual(error.bounded_result.verification_diagnostic, { table: "market_listing_observations", field: "status", mismatch_reason: "field_mismatch" });
});
test("missing post-write rows fail closed with an allowlisted diagnostic", async () => {
  const rows = rowsFixture();
  const store = fakeStore({ omitAfterWriteTable: "market_listing_observations" });
  const error = await rejected(() => persistMarketBounded({ listingRows: rows.listingRows, observationRows: rows.observationRows, store }));
  assert.deepEqual(error.bounded_result.verification_diagnostic, { table: "market_listing_observations", field: "id", mismatch_reason: "missing_row" });
  assert.equal(error.bounded_result.rollback.verified, true);
});
test("count delta mismatch reports only the affected count key", async () => {
  const rows = rowsFixture();
  const error = await rejected(() => persistMarketBounded({ listingRows: rows.listingRows, observationRows: rows.observationRows, store: fakeStore({ unexpectedDelta: true }) }));
  assert.deepEqual(error.bounded_result.verification_diagnostic, { table: "counts", field: "import_issues", mismatch_reason: "count_delta_mismatch" });
  assert.equal(error.bounded_result.rollback.attempted, true);
});
test("verification diagnostic keeps only allowlisted fields and values", () => {
  assert.deepEqual(sanitizeBoundedVerificationDiagnostic({ table: "ingestion_runs", field: "started_at", mismatch_reason: "field_mismatch", actual: "https://private.invalid", expected: "secret", raw: {}, approval: "nonce" }), { table: "ingestion_runs", field: "started_at", mismatch_reason: "field_mismatch" });
  assert.equal(sanitizeBoundedVerificationDiagnostic({ table: "private_table", field: "token", mismatch_reason: "field_mismatch" }), null);
});
test("sanitized result and Markdown never expose verification values or secrets", () => {
  const secret = "APPROVE_MARKET_BOUNDED_MANUAL:secret-nonce";
  const result = buildMarketBoundedResult({
    status: "rolled-back",
    reason_code: "bounded_verification_failed",
    error_category: "rollback",
    verification_diagnostic: { table: "ingestion_runs", field: "finished_at", mismatch_reason: "field_mismatch", actual: secret, url: "https://private.invalid" },
  });
  const output = `${JSON.stringify(result)}\n${renderMarketBoundedResultMarkdown(result)}`;
  assert.deepEqual(result.verification_diagnostic, { table: "ingestion_runs", field: "finished_at", mismatch_reason: "field_mismatch" });
  assert.doesNotMatch(output, /private\.invalid|secret-nonce|actual|expected|raw row/i);
});
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
test("preview runner writes all four artifacts on its guarded path", () => { for (const name of ["market-bounded-persistence-preview.json", "market-bounded-persistence-preview.md", "market-bounded-result.json", "market-bounded-result.md"]) assert.match(rolloutRunner, new RegExp(name.replaceAll(".", "\\."))); });
test("preview failure records generated report and zero writes before exiting", () => assert.match(rolloutRunner, /preview_report_generated[\s\S]*preview_generated[\s\S]*database_writes[\s\S]*process\.exitCode = 1/));
test("preview failure emits a sanitized one-line message", () => assert.match(rolloutRunner, /console\.error\(`Bounded persistence preview failed closed: \$\{result\.result\.reason_code\} \(\$\{result\.result\.error_category\}\)\.``?\)/));
test("Production workflow uploads rollout artifacts even when preview fails", () => assert.match(productionWorkflow, /Upload sanitized rollout report[\s\S]*if: \$\{\{ always\(\)/));
test("Production workflow enforcement still rejects a failed preview", () => assert.match(productionWorkflow, /persistence_preview\.outputs\.preview_generated != 'true'/));
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

function durableRunFixture() {
  const id = buildManualMarketBoundedDurableRunId({ workflow_run_id: "31322475822", workflow_run_attempt: "1", plan_digest: "f".repeat(64) });
  return {
    id,
    task: "market",
    status: "succeeded",
    trigger_source: "manual_bounded",
    started_at: "2026-08-02T00:00:00.000Z",
    finished_at: "2026-08-02T00:00:00.000Z",
    duration_ms: 0,
    summary: { timestamp_like_text: "2026-08-02T00:00:00.000Z", listing_inserts: 1, listing_updates: 1, observation_inserts: 2 },
    error_message: null,
  };
}

async function verificationFailure(readTransform) {
  const rows = rowsFixture();
  const store = fakeStore({ readTransform });
  return rejected(() => persistMarketBounded({ listingRows: rows.listingRows, observationRows: rows.observationRows, store }));
}

function fakeStore(options = {}) {
  const tables = { market_listings: new Map(), market_listing_observations: new Map(), ingestion_runs: new Map() };
  for (const [table, rows] of Object.entries(options.initialRows ?? {})) {
    for (const row of rows) tables[table].set(row.id, structuredClone(row));
  }
  let failedOnce = false;
  const store = {
    calls: [],
    reads: [],
    getRow(table, id) { return structuredClone(tables[table]?.get(id)); },
    async fetchRowsByIds(table, ids) {
      store.reads.push({ table, ids: [...ids] });
      if (options.omitAfterWriteTable === table && store.calls.some((entry) => entry.table === table)) return [];
      return ids.filter((id) => tables[table]?.has(id)).map((id) => serializeReadRow(table, tables[table].get(id), options, store));
    },
    async fetchCounts() { return { market_listings: tables.market_listings.size, market_listing_observations: tables.market_listing_observations.size, import_issues: options.unexpectedDelta && store.calls.length ? 1 : 0, ingestion_runs: tables.ingestion_runs.size, review_required: 0, series: 10, variants: 20, stock_reports: 0, restock_events: 0 }; },
    async upsertRows(table, rows, writeOptions) { store.calls.push({ table, rows: structuredClone(rows), options: writeOptions }); if (options.failTable === table || (options.failTableOnce === table && !failedOnce)) { failedOnce = true; throw new Error("injected failure"); } for (const row of rows) tables[table].set(row.id, structuredClone(row)); },
    async deleteRowsByIds(table, ids) { for (const id of ids) tables[table].delete(id); return ids.length; },
    async fetchObservationsByListingIds(ids) { return options.externalReference ? [{ id: "external", listing_id: ids[0] }] : [...tables.market_listing_observations.values()].filter((row) => ids.includes(row.listing_id)); },
  };
  return store;
}

function serializeReadRow(table, stored, options, store) {
  const row = structuredClone(stored);
  if (options.postgrestTimestampSerialization) {
    const fields = table === "market_listing_observations"
      ? ["observed_at"]
      : table === "ingestion_runs" ? ["started_at", "finished_at"] : [];
    for (const field of fields) {
      if (typeof row[field] === "string" && row[field].endsWith(".000Z")) row[field] = row[field].replace(/\.000Z$/, "+00:00");
    }
  }
  return options.readTransform?.(table, row, { hasWrites: store.calls.some((entry) => entry.table === table) }) ?? row;
}

async function rejected(fn) { try { await fn(); assert.fail("Expected rejection"); } catch (error) { return error; } }
function buildResult(status) { const rows = rowsFixture(); return buildMarketBoundedResult({ workflow, plan: fixture().plan, rows, operations: planMarketBoundedOperations({ listingRows: rows.listingRows, observationRows: rows.observationRows }), status, verification: { rows_verified: status === "succeeded", deltas_verified: status === "succeeded" }, database_writes: status === "succeeded" ? 4 : 0 }); }
