import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadOfficialCatalog } from "./load-official-catalog.mjs";
import { loadMarketCoverageData } from "./market-coverage-data.mjs";
import { deleteRowsByIds, fetchRowCount, fetchRows, upsertRows } from "./supabase-rest.mjs";
import { assertMarketFetchComplete, fetchMarketListingsRaw, MARKET_SOURCE_SCOPES } from "../lib/fetchers/market-fetcher.js";
import { planPriorityOneDistinctEvidenceQueries } from "../lib/fetchers/market-p1-distinct-evidence-query-planner.js";
import { applyMarketCandidateSafety, summarizeFetchedMarketCandidates } from "../lib/domain/market-match-safety.js";
import { buildSanitizedMarketRequestDiagnostics } from "../lib/domain/market-request-diagnostics.js";
import { buildSanitizedMarketCandidateAudit, renderMarketCandidateAuditMarkdown } from "../lib/domain/market-candidate-audit.js";
import { buildPriorityOneBoundedEvidenceReadOnlyDiagnostic } from "../lib/domain/manual-market-audit-diagnostic.js";
import { buildPriorityOneDistinctEvidenceDiagnostic, PRIORITY_ONE_BOUNDED_EVIDENCE_KIND, renderPriorityOneDistinctEvidenceDiagnosticMarkdown } from "../lib/domain/market-p1-distinct-evidence-diagnostic.js";
import { loadMarketManualCanarySelectionProfile, manualCanarySelectionOptions } from "../lib/domain/market-manual-canary-selection.js";
import { buildMarketplaceStorefrontEvidenceByCandidateKey } from "../lib/domain/market-storefront-identity.js";
import {
  assertMarketP1BoundedPrewrite,
  buildMarketP1BoundedArtifact,
  buildMarketP1BoundedRows,
  persistMarketP1Bounded,
  renderMarketP1BoundedArtifactMarkdown,
  selectMarketP1BoundedCandidates,
  validateMarketP1BoundedInvocation,
} from "../lib/domain/market-p1-bounded-persistence.js";

const TABLES = ["market_listings", "market_listing_observations", "import_issues", "ingestion_runs", "series", "variants"];

export async function executeMarketP1Bounded({ options = parseOptions(process.argv.slice(2)), output_dir = null } = {}) {
  const output = path.resolve(output_dir || options["output-dir"] || "market-p1-bounded-persistence");
  fs.mkdirSync(output, { recursive: true });
  const workflow = workflowIdentity(options);
  let invocation = null;
  let audit = null;
  let diagnostic = null;
  let selection = { selected: [], eligible_candidate_count: 0, selected_candidate_keys: [], selected_variant_ids: [], one_variant_per_series: true };
  let before = null;
  let after = null;
  let outcome = null;
  try {
    invocation = validateMarketP1BoundedInvocation({
      event_name: workflow.event_name,
      ref: workflow.ref,
      mode: options.mode,
      limit: options.limit,
      expected_main_sha: options["expected-main-sha"],
      head_sha: workflow.head_sha,
      origin_main_sha: options["origin-main-sha"],
      candidate_key: options["candidate-key"],
      approval: process.env.P1_BOUNDED_APPROVAL,
    });
    const catalog = await loadOfficialCatalog();
    const data = await loadMarketCoverageData({ catalog });
    const profile = loadMarketManualCanarySelectionProfile(path.resolve("config/market-manual-canary-selection.json"));
    const plan = planPriorityOneDistinctEvidenceQueries(catalog, data.coverageRows, {
      ...manualCanarySelectionOptions(profile),
      limit: invocation.limit,
      rotationKey: `priority-1-bounded:${workflow.run_id}`,
    });
    assertPlan(plan, invocation.limit);
    before = await snapshotCounts();
    const existingListings = await fetchExistingListings(plan.selected.map((entry) => entry.variantId));
    const fetched = assertMarketFetchComplete(await fetchMarketListingsRaw({ catalog, queries: plan.queries, sourceScope: MARKET_SOURCE_SCOPES.PLANNER_APIS }));
    const safety = applyMarketCandidateSafety({ records: fetched.records, queryPlan: plan.queries, catalog });
    const requestDiagnostics = buildSanitizedMarketRequestDiagnostics(fetched.feedResults ?? [], fetched.duplicateQueriesSkipped ?? 0);
    const summary = summarizeFetchedMarketCandidates({ records: safety.records, rawCount: fetched.count, queryPlan: plan.queries, feedResults: fetched.feedResults, catalog, safetyResult: safety });
    audit = buildSanitizedMarketCandidateAudit({
      records: safety.records,
      queryPlan: plan.queries,
      catalog,
      runContext: { mode: "dry-run", source_scope: MARKET_SOURCE_SCOPES.PLANNER_APIS, run_id: workflow.run_id, run_attempt: workflow.run_attempt, head_sha: workflow.head_sha, event_name: workflow.event_name, candidate_limit: 200 },
      summary: { ...summary, request_diagnostics: requestDiagnostics, no_result_variants: Math.max(0, plan.selected.length - summary.variants_with_results), listing_upserts: 0, observations_created: 0, ingestion_runs_written: 0, manual_diagnostic: buildPriorityOneBoundedEvidenceReadOnlyDiagnostic() },
    });
    if (audit.result.report_complete !== true || Number(audit.result.truncated_count) !== 0) throw new Error("P1 bounded candidate audit is incomplete.");
    const unchangedCounts = await snapshotCounts();
    if (canonical(before) !== canonical(unchangedCounts)) throw new Error("P1 bounded retrieval changed Production data.");
    diagnostic = buildPriorityOneDistinctEvidenceDiagnostic({
      audit,
      queryPlan: plan.queries,
      existingListings,
      candidateStorefronts: buildMarketplaceStorefrontEvidenceByCandidateKey(safety.records),
      before,
      after: unchangedCounts,
      kind: PRIORITY_ONE_BOUNDED_EVIDENCE_KIND,
    });
    selection = selectMarketP1BoundedCandidates({ audit, diagnostic, existingListings, limit: invocation.limit });
    if (invocation.mode === "canary-write") {
      if (!selection.selected.length || selection.selected[0].candidate.candidate_key !== invocation.candidate_key) throw new Error("P1 bounded approved candidate is not the deterministic first eligible target.");
      selection = { ...selection, selected: selection.selected.slice(0, 1), selected_candidate_keys: [invocation.candidate_key], selected_variant_ids: [selection.selected[0].candidate.target.variant_id] };
    }
    writeReadOnlyArtifacts(output, audit, diagnostic);
    writeTerminal(output, buildMarketP1BoundedArtifact({ workflow, mode: invocation.mode, status: invocation.mode === "dry-run" ? "dry-run" : "ready", write_authorized: invocation.write_authorized, selection, before, after: unchangedCounts }));
    if (invocation.mode === "dry-run") {
      after = unchangedCounts;
      console.log(JSON.stringify({ ok: true, status: "dry-run", database_writes: 0, selected_candidates: selection.selected.length }));
      return;
    }
    const rows = buildMarketP1BoundedRows({ selected: selection.selected, workflow });
    const conflicts = await loadPrewriteConflicts(rows);
    const freshExisting = await fetchExistingListings(selection.selected_variant_ids);
    assertMarketP1BoundedPrewrite({ rows, selected: selection.selected, existingActiveListings: freshExisting, ...conflicts });
    const store = createStore();
    outcome = await persistMarketP1Bounded({ rows, selected: selection.selected, existingActiveListings: freshExisting, store, beforeCounts: await store.fetchCounts() });
    after = await snapshotCounts();
    writeTerminal(output, buildMarketP1BoundedArtifact({ workflow, mode: invocation.mode, status: "succeeded", write_authorized: true, selection, before, after, outcome }));
    console.log(JSON.stringify({ ok: true, status: "succeeded", database_writes: outcome.database_writes, selected_candidates: 1 }));
  } catch (error) {
    try { after = before ? await snapshotCounts() : null; } catch { after = null; }
    const rollback = error?.p1_bounded_rollback ?? error?.bounded_result?.rollback;
    const status = rollback?.attempted ? rollback.verified ? "rolled-back" : "rollback-failed" : "blocked";
    writeTerminal(output, buildMarketP1BoundedArtifact({ workflow, mode: invocation?.mode ?? options.mode, status, write_authorized: false, selection, before, after, outcome, rollback, reason_code: "priority_1_bounded_persistence_failed" }));
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await executeMarketP1Bounded();

function assertPlan(plan, limit) {
  const selected = plan.selected ?? [];
  const queries = plan.queries ?? [];
  if (!selected.length || selected.length > limit || queries.length !== selected.length
    || selected.some((entry) => Number(entry.priority) !== 1 || entry.released !== true || Number(entry.activeCount) !== 2 || Number(entry.eligibleListingCount) !== 2)
    || new Set(selected.map((entry) => entry.variantId)).size !== selected.length
    || new Set(selected.map((entry) => entry.seriesId)).size !== selected.length
    || queries.some((entry) => entry.query_profile !== "priority_1_distinct_exact_diagnostic" || entry.fallback_queries?.length > 2)) {
    throw new Error("P1 bounded selection contract is invalid.");
  }
}

async function snapshotCounts() {
  const values = await Promise.all([...TABLES.map((table) => fetchRowCount(table)), fetchRowCount("market_listings", { listing_type: "eq.complete_set" })]);
  return Object.fromEntries([...TABLES, "complete_set"].map((key, index) => [key, values[index]]));
}

async function fetchExistingListings(variantIds) {
  const ids = unique(variantIds);
  if (!ids.length) return [];
  return fetchRows("market_listings", { select: "id,variant_id,matched_variant_id,listing_type,market_review_type,price,status,source,source_url,listed_at,last_observed_at,created_at,updated_at,review_required,raw", params: { or: `(variant_id.in.(${inValues(ids)}),matched_variant_id.in.(${inValues(ids)}))`, order: "id.asc" }, pageSize: 100, operationName: "priority_1_bounded.existing_listings" });
}

async function loadPrewriteConflicts(rows) {
  const listingIds = rows.listingRows.map((row) => row.id);
  const observationIds = rows.observationRows.map((row) => row.id);
  const sourceUrls = rows.listingRows.map((row) => row.source_url);
  const sourceListingIds = rows.listingRows.map((row) => row.raw.source_listing_id);
  const [listingIdConflicts, observationIdConflicts, sourceUrlConflicts, sourceIdentityConflicts] = await Promise.all([
    fetchIn("market_listings", "id", listingIds, "id,variant_id,source_url"),
    fetchIn("market_listing_observations", "id", observationIds, "id,listing_id"),
    fetchIn("market_listings", "source_url", sourceUrls, "id,variant_id,source_url"),
    fetchIn("market_listings", "raw->>source_listing_id", sourceListingIds, "id,variant_id,source,raw"),
  ]);
  return { listingIdConflicts, observationIdConflicts, sourceUrlConflicts, sourceIdentityConflicts };
}

function createStore() {
  return {
    fetchRowsByIds: (table, ids) => fetchIn(table, "id", ids, "*"),
    fetchCounts: async () => {
      const tables = ["market_listings", "market_listing_observations", "import_issues", "ingestion_runs", "series", "variants", "stock_reports", "restock_events"];
      const values = await Promise.all([...tables.map((table) => fetchRowCount(table)), fetchRowCount("market_listings", { review_required: "eq.true" }), fetchRowCount("market_listings", { listing_type: "eq.complete_set" })]);
      return Object.fromEntries([...tables, "review_required", "complete_set"].map((key, index) => [key, values[index]]));
    },
    fetchActiveEligibleListingsByVariantIds: fetchExistingListings,
    fetchP1PrewriteConflicts: loadPrewriteConflicts,
    upsertRows: (table, rows, writeOptions) => upsertRows(table, rows, { ...writeOptions, label: "market-p1-bounded-persistence", allowSchemaFallback: false }),
    deleteRowsByIds: (table, ids, deleteOptions) => deleteRowsByIds(table, ids, deleteOptions),
    fetchObservationsByListingIds: (ids) => fetchIn("market_listing_observations", "listing_id", ids, "*"),
  };
}

function fetchIn(table, column, values, select) {
  const entries = unique(values);
  if (!entries.length) return [];
  return fetchRows(table, { select, pageSize: 100, params: { [column]: `in.(${inValues(entries)})`, order: "id.asc" }, operationName: `priority_1_bounded.${table}.${column}` });
}

function writeReadOnlyArtifacts(output, audit, diagnostic) {
  fs.writeFileSync(path.join(output, "market-candidate-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
  fs.writeFileSync(path.join(output, "market-candidate-audit.md"), renderMarketCandidateAuditMarkdown(audit));
  fs.writeFileSync(path.join(output, "market-p1-storefront-diagnostic.json"), `${JSON.stringify(diagnostic, null, 2)}\n`);
  fs.writeFileSync(path.join(output, "market-p1-storefront-diagnostic.md"), renderPriorityOneDistinctEvidenceDiagnosticMarkdown(diagnostic));
}

function writeTerminal(output, artifact) {
  fs.writeFileSync(path.join(output, "market-p1-bounded-result.json"), `${JSON.stringify(artifact, null, 2)}\n`);
  fs.writeFileSync(path.join(output, "market-p1-bounded-result.md"), renderMarketP1BoundedArtifactMarkdown(artifact));
}

function workflowIdentity(options) { return { run_id: process.env.GITHUB_RUN_ID || "0", run_attempt: process.env.GITHUB_RUN_ATTEMPT || "1", head_sha: String(process.env.GITHUB_SHA || options["expected-main-sha"] || "").toLowerCase(), event_name: process.env.GITHUB_EVENT_NAME || "", ref: process.env.GITHUB_REF || "" }; }
function unique(values) { return [...new Set((values ?? []).map((value) => String(value ?? "").trim()).filter(Boolean))]; }
function inValues(values) { return values.map((value) => `"${String(value).replaceAll('"', '\\"')}"`).join(","); }
function canonical(value) { return JSON.stringify(value, Object.keys(value ?? {}).sort()); }
function parseOptions(args) { return Object.fromEntries(args.filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => { const [key, ...rest] = arg.slice(2).split("="); return [key, rest.join("=")]; })); }
