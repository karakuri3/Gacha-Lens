import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildSanitizedMarketCandidateAudit,
  renderMarketCandidateAuditMarkdown,
} from "../lib/domain/market-candidate-audit.js";
import { applyMarketCandidateSafety, summarizeFetchedMarketCandidates } from "../lib/domain/market-match-safety.js";
import {
  MARKET_SOURCE_SCOPES,
  describeMarketSourceConfiguration,
  fetchMarketListingsRaw,
  normalizeMarketSourceScope,
} from "../lib/fetchers/market-fetcher.js";
import { planMarketSearchQueries } from "../lib/fetchers/market-query-planner.js";
import { loadMarketCoverageData } from "./market-coverage-data.mjs";

const options = parseOptions(process.argv.slice(2));
if (options.mode === "write") {
  await runWriteMode(options);
} else {
  await runDryMode(options);
}

async function runDryMode(options) {
  const startedAt = Date.now();
  const data = await loadMarketCoverageData();
  const plan = planMarketSearchQueries(data.catalog, data.coverageRows, options);
  const sourcePlan = describeMarketSourceConfiguration({ sourceScope: options.sourceScope, queryCount: plan.queries.length });
  let sourceResult = emptySourceResult(plan.selected.length, sourcePlan);
  let auditRecords = [];

  if (options.executeSources) {
    if (plan.selected.length > 5) throw new Error("External dry-run is limited to 5 variants.");
    const fetched = await fetchMarketListingsRaw({ catalog: data.catalog, queries: plan.queries, sourceScope: options.sourceScope });
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
  const mode = values.mode === "write" ? "write" : "dry-run";
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
  };
}

function spawnScript(script, env, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: process.cwd(), env, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}
