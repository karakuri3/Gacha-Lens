import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildSanitizedMarketCandidateAudit,
  renderMarketCandidateAuditMarkdown,
} from "../lib/domain/market-candidate-audit.js";
import {
  assertApprovedCanaryCandidatesMatch,
  buildMarketCanaryRows,
  buildSanitizedCanaryFailureResult,
  normalizeCanaryRollback,
  persistMarketCanary,
  renderMarketCanaryResultMarkdown,
  validateApprovedMarketAudit,
  validateCanaryRequest,
} from "../lib/domain/market-canary-write.js";
import { applyMarketCandidateSafety, summarizeFetchedMarketCandidates } from "../lib/domain/market-match-safety.js";
import {
  buildApprovedCanaryQueryPlan,
  sanitizeCanaryQueryReplay,
} from "../lib/domain/market-approved-query-replay.js";
import {
  MARKET_SOURCE_SCOPES,
  assertMarketFetchComplete,
  describeMarketSourceConfiguration,
  fetchMarketListingsRaw,
  normalizeMarketSourceScope,
} from "../lib/fetchers/market-fetcher.js";
import { planMarketSearchQueries } from "../lib/fetchers/market-query-planner.js";
import {
  buildMarketManualCanarySelectionDiagnostics,
  loadMarketManualCanarySelectionProfile,
  manualCanarySelectionOptions,
  shouldApplyMarketManualCanarySelection,
} from "../lib/domain/market-manual-canary-selection.js";
import { loadOfficialCatalog } from "./load-official-catalog.mjs";
import { loadMarketCoverageData } from "./market-coverage-data.mjs";
import { deleteRowsByIds, fetchRowCount, fetchRows, upsertRows } from "./supabase-rest.mjs";

const options = parseOptions(process.argv.slice(2));
if (process.env.MARKET_BACKFILL_WRITE_DISABLED === "true" && options.mode !== "dry-run") {
  throw new Error("Market backfill writes are disabled for this execution context.");
}
if (options.mode === "canary-write") {
  await runCanaryWriteMode(options);
} else if (options.mode === "write") {
  await runWriteMode(options);
} else {
  await runDryMode(options);
}

async function runDryMode(options) {
  const startedAt = Date.now();
  const data = await loadMarketCoverageData();
  const manualProfile = resolveManualSelectionProfile(options);
  const selectionOptions = manualProfile
    ? { ...options, ...manualCanarySelectionOptions(manualProfile) }
    : options;
  const plan = planMarketSearchQueries(data.catalog, data.coverageRows, selectionOptions);
  const selectionProfile = manualProfile
    ? buildMarketManualCanarySelectionDiagnostics(manualProfile, plan.summary)
    : null;
  const sourcePlan = describeMarketSourceConfiguration({ sourceScope: options.sourceScope, queryCount: plan.queries.length });
  let sourceResult = emptySourceResult(plan.selected.length, sourcePlan);
  let auditRecords = [];

  if (options.executeSources) {
    if (plan.selected.length > 5) throw new Error("External dry-run is limited to 5 variants.");
    const fetched = assertMarketFetchComplete(await fetchMarketListingsRaw({
      catalog: data.catalog,
      queries: plan.queries,
      sourceScope: options.sourceScope,
    }));
    const assessed = assessFetchedRecords(fetched, plan, data.catalog);
    sourceResult = assessed.summary;
    auditRecords = assessed.records;
  }

  const summary = {
    ok: true,
    mode: "dry-run",
    source_scope: options.sourceScope,
    write_protected: true,
    ...plan.summary,
    ...(selectionProfile ? { selection_profile: selectionProfile } : {}),
    selected_variant_ids: plan.selected.map((entry) => entry.variantId),
    selected_sample: plan.selected.slice(0, 5).map((entry) => ({
      variant_id: entry.variantId,
      name: entry.variantName,
      priority: entry.priority,
      reason: entry.priorityReason,
      coverage_state: entry.coverageState,
    })),
    queries_generated: plan.queries.length,
    query_sample: plan.queries.slice(0, 5).map((entry) => entry.query),
    planned_source_requests: sourcePlan.plannedSourceRequests,
    ...sourceResult,
    listing_upserts: 0,
    observations_created: 0,
    import_issues_created: 0,
    ingestion_runs_written: 0,
    duration_ms: Date.now() - startedAt,
  };
  if (options.executeSources) {
    const auditOutput = writeAuditReport({ records: auditRecords, plan, catalog: data.catalog, summary });
    Object.assign(summary, auditOutput);
    writeGitHubOutputs(auditOutput, summary);
  }
  console.log(JSON.stringify(summary, null, 2));
}

function resolveManualSelectionProfile(options) {
  const applies = shouldApplyMarketManualCanarySelection({
    task: process.env.BACKFILL_TASK,
    mode: options.mode,
    executeSources: options.executeSources,
    eventName: process.env.GITHUB_EVENT_NAME,
  });
  if (!applies) return null;
  const profilePath = process.env.MARKET_MANUAL_CANARY_SELECTION_PATH
    || path.resolve("config/market-manual-canary-selection.json");
  return loadMarketManualCanarySelectionProfile(profilePath);
}

async function runWriteMode(options) {
  const sourcePlan = describeMarketSourceConfiguration({ sourceScope: options.sourceScope });
  if (!sourcePlan.writeReady) {
    console.error("No planner API source is configured. Production write was not started.");
    process.exitCode = 1;
    return;
  }
  const env = {
    ...process.env,
    MARKET_COVERAGE_LIMIT: String(options.limit),
    MARKET_COVERAGE_PRIORITY: String(options.priority),
    MARKET_COVERAGE_RELEASE: options.release,
    MARKET_COVERAGE_COOLDOWN_HOURS: String(options.cooldownHours),
    MARKET_SOURCE_SCOPE: options.sourceScope,
  };
  const exitCode = await spawnScript("scripts/run-ingestion.mjs", env, ["--task=market"]);
  if (exitCode !== 0) process.exitCode = exitCode;
}

async function runCanaryWriteMode(options) {
  const startedAt = Date.now();
  let stage = "request_validation";
  let request = null;
  let rows = { selected: [], listingRows: [], observationRows: [] };
  let queryReplay = null;
  let currentHead = safeGitHead();
  try {
    request = validateCanaryRequest({
      eventName: process.env.GITHUB_EVENT_NAME,
      task: process.env.BACKFILL_TASK || "market",
      mode: options.mode,
      sourceScope: options.sourceScope,
      limit: options.limit,
      priority: options.priority,
      release: options.release,
      auditRunId: options.auditRunId,
      candidateKeys: options.candidateKeys,
    });
    stage = "approved_audit_load";
    const approvedPath = path.resolve(options.approvedAuditPath || "");
    if (!approvedPath || !fs.existsSync(approvedPath) || path.basename(approvedPath) !== "market-candidate-audit.json") {
      throw new Error("The approved market candidate audit JSON is missing.");
    }
    const approved = JSON.parse(fs.readFileSync(approvedPath, "utf8"));
    stage = "approved_audit_validation";
    validateApprovedMarketAudit(approved, {
      auditRunId: request.auditRunId,
      isAncestor: true,
    });
    stage = "ancestor_validation";
    if (!gitIsAncestor(approved.workflow?.head_sha, currentHead)) throw new Error("Approved audit head is not an ancestor.");

    stage = "approved_query_plan";
    const catalog = await loadOfficialCatalog();
    const plan = buildApprovedCanaryQueryPlan(approved, catalog, request.candidateKeys);
    queryReplay = plan.queryReplay;
    stage = "external_fetch";
    const fetched = assertMarketFetchComplete(await fetchMarketListingsRaw({
      catalog,
      queries: plan.queries,
      sourceScope: options.sourceScope,
    }));
    stage = "candidate_assessment";
    const assessed = assessFetchedRecords(fetched, plan, catalog);
    const currentAudit = buildSanitizedMarketCandidateAudit({
      records: assessed.records,
      queryPlan: plan.queries,
      catalog,
      runContext: {
        mode: "dry-run",
        source_scope: options.sourceScope,
        run_id: process.env.GITHUB_RUN_ID,
        run_attempt: process.env.GITHUB_RUN_ATTEMPT,
        head_sha: currentHead,
        event_name: process.env.GITHUB_EVENT_NAME,
      },
      summary: {
        ...assessed.summary,
        source_scope: options.sourceScope,
        listing_upserts: 0,
        observations_created: 0,
        ingestion_runs_written: 0,
      },
    });
    stage = "exact_audit_match";
    assertApprovedCanaryCandidatesMatch(approved, currentAudit, request.candidateKeys);
    stage = "row_build";
    rows = buildMarketCanaryRows({
      records: assessed.records,
      report: currentAudit,
      candidateKeys: request.candidateKeys,
      auditRunId: request.auditRunId,
    });
    const persistence = await persistMarketCanary({
      listingRows: rows.listingRows,
      observationRows: rows.observationRows,
      store: canaryStore(),
      onStage: (nextStage) => {
        stage = nextStage;
      },
    });
    stage = "complete";
    const result = buildCanaryResult({
      request,
      currentHead,
      rows,
      persistence,
      queryReplay,
      durationMs: Date.now() - startedAt,
    });
    writeCanaryResult(result);
    writeCanaryGitHubOutputs(result);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error.canaryStage) stage = error.canaryStage;
    const persistence = error.canaryResult ?? {};
    const failedResult = buildSanitizedCanaryFailureResult({
      failedStage: stage,
      auditRunId: request?.auditRunId ?? options.auditRunId,
      workflowRunId: process.env.GITHUB_RUN_ID,
      headSha: currentHead,
      candidateKeys: request?.candidateKeys ?? options.candidateKeys,
      listingWrites: persistence.listing_writes,
      observationWrites: persistence.observation_writes,
      rollback: persistence.rollback,
      auditMismatch: error.canaryAuditMismatch,
      queryReplay: error.canaryQueryReplay ?? queryReplay,
    });
    failedResult.duration_ms = Date.now() - startedAt;
    writeCanaryResult(failedResult);
    writeCanaryGitHubOutputs(failedResult);
    throw new Error(`Canary write failed at ${failedResult.failed_stage} (${failedResult.error_code}).`);
  }
}

function assessFetchedRecords(fetched, plan, catalog) {
  const feedResults = fetched.feedResults ?? [];
  const safetyResult = applyMarketCandidateSafety({ records: fetched.records, queryPlan: plan.queries, catalog });
  const candidateSummary = summarizeFetchedMarketCandidates({
    records: safetyResult.records,
    rawCount: fetched.count,
    queryPlan: plan.queries,
    feedResults,
    catalog,
    safetyResult,
  });
  return {
    records: safetyResult.records,
    summary: {
      ...sourceSummary(fetched),
      ...candidateSummary,
      no_result_variants: Math.max(0, plan.selected.length - candidateSummary.variants_with_results),
    },
  };
}

function writeAuditReport({ records, plan, catalog, summary }) {
  const outputDir = process.env.MARKET_AUDIT_OUTPUT_DIR || path.join(os.tmpdir(), "gacha-lens-market-audit");
  const report = buildSanitizedMarketCandidateAudit({
    records,
    queryPlan: plan.queries,
    catalog,
    runContext: {
      mode: "dry-run",
      source_scope: summary.source_scope,
      run_id: process.env.GITHUB_RUN_ID,
      run_attempt: process.env.GITHUB_RUN_ATTEMPT,
      head_sha: process.env.GITHUB_SHA,
      event_name: process.env.GITHUB_EVENT_NAME,
    },
    summary,
  });
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonName = "market-candidate-audit.json";
  const markdownName = "market-candidate-audit.md";
  fs.writeFileSync(path.join(outputDir, jsonName), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, markdownName), renderMarketCandidateAuditMarkdown(report), "utf8");
  return {
    audit_report_generated: true,
    audit_report_complete: report.result.report_complete,
    audit_candidate_count: report.result.candidate_count,
    audit_accepted_count: report.result.accepted_count,
    audit_review_count: report.result.review_count,
    audit_json_path: jsonName,
    audit_markdown_path: markdownName,
  };
}

function writeGitHubOutputs(auditOutput, summary) {
  if (!process.env.GITHUB_OUTPUT) return;
  const values = {
    ...auditOutput,
    database_writes: Number(summary.listing_upserts || 0) + Number(summary.observations_created || 0) + Number(summary.ingestion_runs_written || 0),
  };
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`, "utf8");
}

function emptySourceResult(selectedCount, sourcePlan) {
  return {
    source_scope: sourcePlan.sourceScope,
    approved_feed_sources_configured: sourcePlan.approvedFeedSourcesConfigured,
    planner_api_sources_configured: sourcePlan.plannerApiSourcesConfigured,
    approved_feed_requests_attempted: 0,
    planner_api_requests_attempted: 0,
    rakuten_requests_attempted: 0,
    yahoo_requests_attempted: 0,
    write_ready: sourcePlan.writeReady,
    blocking_reason: sourcePlan.blockingReason,
    requests_attempted: 0,
    requests_succeeded: 0,
    requests_rate_limited: 0,
    requests_failed: 0,
    source_results: {},
    accepted_listings: 0,
    ambiguous_listings: 0,
    duplicate_listings: 0,
    no_result_variants: selectedCount,
  };
}

function sourceSummary(fetched) {
  return {
    source_scope: fetched.sourceScope,
    approved_feed_sources_configured: fetched.approvedFeedSourcesConfigured ?? 0,
    planner_api_sources_configured: fetched.plannerApiSourcesConfigured ?? 0,
    approved_feed_requests_attempted: fetched.approvedFeedRequestsAttempted ?? 0,
    planner_api_requests_attempted: fetched.plannerApiRequestsAttempted ?? 0,
    rakuten_requests_attempted: fetched.rakutenRequestsAttempted ?? 0,
    yahoo_requests_attempted: fetched.yahooRequestsAttempted ?? 0,
    requests_retried: fetched.requests_retried ?? 0,
    retry_attempts_total: fetched.retry_attempts_total ?? 0,
    transient_failures_recovered: fetched.transient_failures_recovered ?? 0,
    requests_timed_out: fetched.requests_timed_out ?? 0,
    requests_rate_limited: fetched.requests_rate_limited ?? 0,
    requests_permanently_failed: fetched.requests_permanently_failed ?? 0,
    duplicate_queries_skipped: fetched.duplicate_queries_skipped ?? 0,
    write_ready: Boolean(fetched.writeReady),
    blocking_reason: fetched.blockingReason ?? null,
  };
}

function parseOptions(args) {
  const values = Object.fromEntries(args.filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => {
    const [key, ...rest] = arg.slice(2).split("=");
    return [key, rest.join("=")];
  }));
  const flags = new Set(args.filter((arg) => arg.startsWith("--") && !arg.includes("=")).map((arg) => arg.slice(2)));
  const mode = ["dry-run", "canary-write", "write"].includes(values.mode) ? values.mode : "dry-run";
  const limit = Math.min(200, Math.max(1, Number(values.limit ?? 25) || 25));
  if (flags.has("execute-sources") && limit > 5) throw new Error("--execute-sources requires --limit=5 or less.");
  return {
    mode,
    limit,
    priority: values.priority ?? "all",
    release: ["released", "upcoming", "all"].includes(values.release) ? values.release : "all",
    cooldownHours: Math.max(0, Number(values.cooldownHours ?? values["cooldown-hours"] ?? 24) || 0),
    executeSources: flags.has("execute-sources"),
    sourceScope: normalizeMarketSourceScope(values["source-scope"], MARKET_SOURCE_SCOPES.PLANNER_APIS),
    auditRunId: values["audit-run-id"] ?? "",
    candidateKeys: values["candidate-keys"] ?? "",
    approvedAuditPath: values["approved-audit-path"] ?? "",
  };
}

function spawnScript(script, env, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: process.cwd(), env, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}

function canaryStore() {
  return {
    fetchConsumedCanaryObservations(auditRunId, candidateKeys) {
      return fetchRows("market_listing_observations", {
        select: "id,listing_id,observed_at,raw",
        pageSize: Math.max(1, candidateKeys.length),
        params: {
          "raw->>canary_audit_run_id": `eq.${auditRunId}`,
          order: "id.asc",
        },
      });
    },
    fetchRowsByIds(table, ids, select) {
      return fetchRows(table, {
        select,
        pageSize: Math.max(1, ids.length),
        params: { id: `in.(${ids.map(escapeInValue).join(",")})` },
      });
    },
    fetchCounts: async () => {
      const [marketListings, observations, importIssues, ingestionRuns, reviewRequired] = await Promise.all([
        fetchRowCount("market_listings"),
        fetchRowCount("market_listing_observations"),
        fetchRowCount("import_issues"),
        fetchRowCount("ingestion_runs"),
        fetchRowCount("market_listings", { review_required: "eq.true" }),
      ]);
      return {
        market_listings: marketListings,
        market_listing_observations: observations,
        import_issues: importIssues,
        ingestion_runs: ingestionRuns,
        review_required: reviewRequired,
      };
    },
    upsertRows: (table, rows) => upsertRows(table, rows, {
      label: "market-canary",
      batchSize: 2,
      allowSchemaFallback: false,
    }),
    deleteRowsByIds: (table, ids) => deleteRowsByIds(table, ids, { batchSize: 2 }),
  };
}

function buildCanaryResult({ request, currentHead, rows, persistence, queryReplay, durationMs }) {
  const listingOperations = new Map((persistence.listings ?? []).map((entry) => [entry.id, entry.operation]));
  const observationOperations = new Map((persistence.observations ?? []).map((entry) => [entry.id, entry.operation]));
  return {
    schema_version: 1,
    source_audit_run_id: request.auditRunId,
    workflow_run_id: String(process.env.GITHUB_RUN_ID || ""),
    head_sha: currentHead,
    mode: "canary-write",
    candidate_count: rows.selected.length,
    candidates: rows.selected.map((candidate, index) => ({
      candidate_key: candidate.candidate_key,
      provider: candidate.source.provider,
      target_variant_id: candidate.target.variant_id,
      target_variant_name: candidate.target.variant_name,
      status: rows.listingRows[index].status,
      listing_operation: listingOperations.get(rows.listingRows[index].id) ?? "not_written",
      observation_operation: observationOperations.get(rows.observationRows[index].id) ?? "not_written",
    })),
    listing_writes: Number(persistence.listing_writes || 0),
    observation_writes: Number(persistence.observation_writes || 0),
    verification: persistence.verification === true,
    rollback: normalizeCanaryRollback(persistence.rollback),
    db_deltas: persistence.db_deltas ?? {},
    health: persistence.health ?? { database: "unknown" },
    query_replay: sanitizeCanaryQueryReplay(queryReplay),
    ok: persistence.ok === true,
    duration_ms: durationMs,
  };
}

function writeCanaryResult(result) {
  const outputDir = process.env.MARKET_CANARY_OUTPUT_DIR || path.join(os.tmpdir(), "gacha-lens-market-canary");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "market-canary-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "market-canary-result.md"), renderMarketCanaryResultMarkdown(result), "utf8");
}

function writeCanaryGitHubOutputs(result) {
  if (!process.env.GITHUB_OUTPUT) return;
  const outputs = {
    canary_result_generated: true,
    canary_audit_run_id: result.source_audit_run_id,
    canary_candidate_count: result.candidate_count,
    canary_listing_writes: result.listing_writes,
    canary_observation_writes: result.observation_writes,
    canary_rollback: result.rollback.attempted ? (result.rollback.verified ? "verified" : "failed") : "not-required",
    canary_verification: result.verification,
  };
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${Object.entries(outputs).map(([key, value]) => `${key}=${value}`).join("\n")}\n`, "utf8");
}

function gitIsAncestor(ancestor, current) {
  if (!/^[0-9a-f]{7,40}$/i.test(String(ancestor ?? "")) || !/^[0-9a-f]{7,40}$/i.test(String(current ?? ""))) return false;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", String(ancestor), String(current)], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function gitOutput(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function safeGitHead() {
  try {
    return process.env.GITHUB_SHA || gitOutput(["rev-parse", "HEAD"]);
  } catch {
    return "";
  }
}

function escapeInValue(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}
