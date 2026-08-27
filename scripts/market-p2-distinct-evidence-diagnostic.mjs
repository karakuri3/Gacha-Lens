import fs from "node:fs";
import path from "node:path";
import { loadOfficialCatalog } from "./load-official-catalog.mjs";
import { loadMarketCoverageData } from "./market-coverage-data.mjs";
import { fetchRowCount, fetchRows } from "./supabase-rest.mjs";
import { assertMarketFetchComplete, fetchMarketListingsRaw, MARKET_SOURCE_SCOPES } from "../lib/fetchers/market-fetcher.js";
import { planPriorityTwoDistinctEvidenceQueries } from "../lib/fetchers/market-p2-distinct-evidence-query-planner.js";
import { applyMarketCandidateSafety, summarizeFetchedMarketCandidates } from "../lib/domain/market-match-safety.js";
import { buildSanitizedMarketRequestDiagnostics } from "../lib/domain/market-request-diagnostics.js";
import { buildSanitizedMarketCandidateAudit, renderMarketCandidateAuditMarkdown } from "../lib/domain/market-candidate-audit.js";
import { buildPriorityTwoDistinctEvidenceReadOnlyDiagnostic } from "../lib/domain/manual-market-audit-diagnostic.js";
import { buildPriorityTwoDistinctEvidenceDiagnostic, renderPriorityTwoDistinctEvidenceDiagnosticMarkdown } from "../lib/domain/market-p2-distinct-evidence-diagnostic.js";
import { loadMarketManualCanarySelectionProfile, manualCanarySelectionOptions } from "../lib/domain/market-manual-canary-selection.js";

const options = parseOptions(process.argv.slice(2));
const output = path.resolve(options["output-dir"] || "market-p2-distinct-evidence-diagnostic");
const TABLES = ["market_listings", "market_listing_observations", "import_issues", "ingestion_runs", "series", "variants"];
fs.mkdirSync(output, { recursive: true });
let before = null;

try {
  assertInvocation(options);
  const limit = parseLimit(options.limit);
  const catalog = await loadOfficialCatalog();
  const data = await loadMarketCoverageData({ catalog });
  const profile = loadMarketManualCanarySelectionProfile(path.resolve("config/market-manual-canary-selection.json"));
  const plan = planPriorityTwoDistinctEvidenceQueries(catalog, data.coverageRows, {
    ...manualCanarySelectionOptions(profile),
    limit,
    rotationKey: `priority-2-distinct-evidence:${process.env.GITHUB_RUN_ID}`,
  });
  assertPlan(plan, limit);
  before = await snapshotCounts();
  const existingListings = await fetchExistingListings(plan.selected.map((entry) => entry.variantId));
  const fetched = assertMarketFetchComplete(await fetchMarketListingsRaw({
    catalog,
    queries: plan.queries,
    sourceScope: MARKET_SOURCE_SCOPES.PLANNER_APIS,
  }));
  const safety = applyMarketCandidateSafety({ records: fetched.records, queryPlan: plan.queries, catalog });
  const requestDiagnostics = buildSanitizedMarketRequestDiagnostics(fetched.feedResults ?? [], fetched.duplicateQueriesSkipped ?? 0);
  const candidateSummary = summarizeFetchedMarketCandidates({ records: safety.records, rawCount: fetched.count, queryPlan: plan.queries, feedResults: fetched.feedResults, catalog, safetyResult: safety });
  const audit = buildSanitizedMarketCandidateAudit({
    records: safety.records,
    queryPlan: plan.queries,
    catalog,
    runContext: {
      mode: "dry-run",
      source_scope: MARKET_SOURCE_SCOPES.PLANNER_APIS,
      run_id: process.env.GITHUB_RUN_ID,
      run_attempt: process.env.GITHUB_RUN_ATTEMPT,
      head_sha: process.env.GITHUB_SHA,
      event_name: process.env.GITHUB_EVENT_NAME,
      candidate_limit: 200,
    },
    summary: {
      ...candidateSummary,
      request_diagnostics: requestDiagnostics,
      no_result_variants: Math.max(0, plan.selected.length - candidateSummary.variants_with_results),
      listing_upserts: 0,
      observations_created: 0,
      ingestion_runs_written: 0,
      manual_diagnostic: buildPriorityTwoDistinctEvidenceReadOnlyDiagnostic(),
    },
  });
  if (audit.result.report_complete !== true || Number(audit.result.truncated_count) !== 0) {
    throw new Error("Priority 2 diagnostic candidate evidence is incomplete.");
  }
  const after = await snapshotCounts();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Priority 2 diagnostic database delta is not zero.");
  const diagnostic = buildPriorityTwoDistinctEvidenceDiagnostic({ audit, queryPlan: plan.queries, existingListings, before, after });
  writeAudit(audit); writeDiagnostic(diagnostic);
  console.log(JSON.stringify({ ok: true, database_writes: 0, selected_variants: diagnostic.selection.selected_variant_count, distinct_safe_variant_count: diagnostic.summary.distinct_safe_variant_count }));
} catch (error) {
  let after = null;
  try { after = before ? await snapshotCounts() : null; } catch { /* fail-closed artifact retains known state */ }
  writeBlocked({ before, after, reason: "priority_2_distinct_evidence_diagnostic_failed" });
  throw error;
}

function assertInvocation(value) {
  if (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" || process.env.GITHUB_REF !== "refs/heads/main"
    || !/^[0-9a-f]{40}$/.test(String(process.env.GITHUB_SHA || ""))
    || String(value["expected-main-sha"] || "") !== String(process.env.GITHUB_SHA || "")) {
    throw new Error("Priority 2 diagnostic invocation is not bound to current main.");
  }
}

function assertPlan(plan, limit) {
  const selected = plan.selected ?? []; const queries = plan.queries ?? [];
  if (!selected.length || selected.length > limit || queries.length !== selected.length
    || selected.some((entry) => Number(entry.priority) !== 2 || entry.released !== true || Number(entry.activeCount) !== 1 || Number(entry.eligibleListingCount) !== 1)
    || new Set(selected.map((entry) => entry.variantId)).size !== selected.length
    || new Set(selected.map((entry) => entry.seriesId)).size !== selected.length
    || queries.some((entry) => entry.query_profile !== "priority_2_distinct_exact_diagnostic" || Number(entry.priority) !== 2 || !entry.query || !Array.isArray(entry.fallback_queries) || entry.fallback_queries.length > 2)) {
    throw new Error("Priority 2 diagnostic selection contract is invalid.");
  }
}

async function snapshotCounts() {
  const values = await Promise.all([
    ...TABLES.map((table) => fetchRowCount(table)),
    fetchRowCount("market_listings", { listing_type: "eq.complete_set" }),
  ]);
  return Object.fromEntries([...TABLES, "complete_set"].map((key, index) => [key, values[index]]));
}

async function fetchExistingListings(variantIds) {
  const ids = [...new Set(variantIds.map(String).filter(Boolean))];
  if (!ids.length) return [];
  const encoded = ids.map((id) => `"${id.replaceAll('"', '\\"')}"`).join(",");
  return fetchRows("market_listings", {
    select: "id,variant_id,matched_variant_id,source,source_url,raw",
    params: { or: `(variant_id.in.(${encoded}),matched_variant_id.in.(${encoded}))`, order: "id.asc" },
    pageSize: 100,
    operationName: "priority_2_distinct_evidence.existing_listings",
  });
}

function writeAudit(audit) {
  fs.writeFileSync(path.join(output, "market-candidate-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
  fs.writeFileSync(path.join(output, "market-candidate-audit.md"), renderMarketCandidateAuditMarkdown(audit));
}

function writeDiagnostic(value) {
  fs.writeFileSync(path.join(output, "market-p2-distinct-evidence-diagnostic.json"), `${JSON.stringify(value, null, 2)}\n`);
  fs.writeFileSync(path.join(output, "market-p2-distinct-evidence-diagnostic.md"), renderPriorityTwoDistinctEvidenceDiagnosticMarkdown(value));
}

function writeBlocked({ before, after, reason }) {
  const value = {
    schema_version: 1,
    kind: "priority_2_distinct_evidence_read_only",
    status: "blocked",
    write_eligible: false,
    canary_eligible: false,
    database_writes: 0,
    production_counts_before: before,
    production_counts_after: after,
    zero_delta_verified: Boolean(before && after && JSON.stringify(before) === JSON.stringify(after)),
    failure: { reason },
  };
  fs.writeFileSync(path.join(output, "market-p2-distinct-evidence-diagnostic.json"), `${JSON.stringify(value, null, 2)}\n`);
  fs.writeFileSync(path.join(output, "market-p2-distinct-evidence-diagnostic.md"), `# Priority 2 Distinct Evidence Diagnostic\n\n- Status: blocked\n- Database writes: 0\n- Reason: ${reason}\n`);
}

function parseLimit(value) { const number = Number(value); if (!Number.isInteger(number) || number < 5 || number > 25) throw new Error("Priority 2 diagnostic limit must be between 5 and 25."); return number; }
function parseOptions(args) { return Object.fromEntries(args.filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => { const [key, ...rest] = arg.slice(2).split("="); return [key, rest.join("=")]; })); }
