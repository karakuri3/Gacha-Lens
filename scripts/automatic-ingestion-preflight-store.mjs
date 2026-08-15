import { selectEligibleIngestionCircuitHistory } from "../lib/domain/ingestion-execution-safety.js";
import {
  SUPABASE_READ_RELIABILITY_CONTRACT,
  fetchExactRowCountReliable,
  fetchRowsLimited,
} from "./supabase-rest.mjs";

export const AUTOMATIC_PREFLIGHT_READ_CONTRACT = Object.freeze({
  running_max_rows: 100,
  completed_history_max_rows: 60,
  circuit_breaker_required_eligible_runs: 6,
  rollout_history_max_rows: 1,
  snapshot_request_concurrency: 1,
  timeout_ms: SUPABASE_READ_RELIABILITY_CONTRACT.timeout_ms,
  max_attempts: SUPABASE_READ_RELIABILITY_CONTRACT.max_attempts,
});

// The circuit window and stage-filtered 24-hour throttle read stay separate so both decisions remain bounded and complete.

const SNAPSHOT_REQUESTS = Object.freeze([
  ["market_listings", "market_listings", {}],
  ["market_listing_observations", "market_listing_observations", {}],
  ["import_issues", "import_issues", {}],
  ["ingestion_runs", "ingestion_runs", {}],
  ["series", "series", {}],
  ["variants", "variants", {}],
  ["stock_reports", "stock_reports", {}],
  ["restock_events", "restock_events", {}],
  ["review_required", "market_listings", { review_required: "eq.true" }],
]);

export async function readAutomaticDurableRunStore(input = {}, dependencies = {}) {
  const fetchLimited = dependencies.fetchRowsLimitedImpl ?? fetchRowsLimited;
  const task = String(input.task || "market");
  const stage = String(input.stage || "");
  const now = validDate(input.now) ?? new Date();
  const diagnostics = [];
  const report = {
    available: false,
    diagnostics,
    running_rows: boundedReadMetadata(AUTOMATIC_PREFLIGHT_READ_CONTRACT.running_max_rows),
    completed_history: {
      ...boundedReadMetadata(AUTOMATIC_PREFLIGHT_READ_CONTRACT.completed_history_max_rows),
      eligible_rows: 0,
      required_eligible_runs: AUTOMATIC_PREFLIGHT_READ_CONTRACT.circuit_breaker_required_eligible_runs,
      ordering_complete: false,
    },
    rollout_history: {
      ...boundedReadMetadata(AUTOMATIC_PREFLIGHT_READ_CONTRACT.rollout_history_max_rows),
      window_hours: 24,
    },
  };

  let runningResult;
  try {
    runningResult = await fetchLimited("ingestion_runs", {
      select: "id,task,status,started_at,finished_at,summary",
      maxRows: AUTOMATIC_PREFLIGHT_READ_CONTRACT.running_max_rows,
      operationName: "ingestion_runs.running_rows",
      params: { task: `eq.${task}`, status: "eq.running", order: "started_at.asc,id.asc" },
    });
    diagnostics.push(successDiagnostic(runningResult.diagnostic, "ingestion_runs.running_rows"));
  } catch (error) {
    diagnostics.push(failureDiagnostic(error, "ingestion_runs.running_rows"));
    return unavailableStore(report);
  }
  report.running_rows = {
    ...resultMetadata(runningResult),
    complete_for_decision: runningResult.saturated !== true,
  };
  if (runningResult.saturated) {
    diagnostics.push(completenessDiagnostic("ingestion_runs.running_rows_completeness"));
    return unavailableStore(report);
  }

  let historyResult;
  try {
    historyResult = await fetchLimited("ingestion_runs", {
      select: "id,task,status,started_at,finished_at,summary",
      maxRows: AUTOMATIC_PREFLIGHT_READ_CONTRACT.completed_history_max_rows,
      operationName: "ingestion_runs.completed_history",
      params: { task: `eq.${task}`, status: "in.(succeeded,failed)", order: "finished_at.desc.nullslast,id.desc" },
    });
    diagnostics.push(successDiagnostic(historyResult.diagnostic, "ingestion_runs.completed_history"));
  } catch (error) {
    diagnostics.push(failureDiagnostic(error, "ingestion_runs.completed_history"));
    return unavailableStore(report);
  }
  const eligibleHistory = selectEligibleIngestionCircuitHistory(historyResult.rows, {
    limit: AUTOMATIC_PREFLIGHT_READ_CONTRACT.circuit_breaker_required_eligible_runs,
  });
  const orderingComplete = historyResult.saturated !== true
    || historyResult.rows.every((row) => validDate(row?.finished_at));
  const historyComplete = historyResult.saturated !== true
    || (orderingComplete
      && eligibleHistory.length >= AUTOMATIC_PREFLIGHT_READ_CONTRACT.circuit_breaker_required_eligible_runs);
  report.completed_history = {
    ...resultMetadata(historyResult),
    eligible_rows: eligibleHistory.length,
    required_eligible_runs: AUTOMATIC_PREFLIGHT_READ_CONTRACT.circuit_breaker_required_eligible_runs,
    ordering_complete: orderingComplete,
    complete_for_decision: historyComplete,
  };
  if (!historyComplete) {
    diagnostics.push(completenessDiagnostic("ingestion_runs.completed_history_completeness"));
    return unavailableStore(report);
  }

  let rolloutHistoryResult;
  try {
    rolloutHistoryResult = await fetchLimited("ingestion_runs", {
      select: "id,task,status,started_at,finished_at,summary",
      maxRows: AUTOMATIC_PREFLIGHT_READ_CONTRACT.rollout_history_max_rows,
      operationName: "ingestion_runs.rollout_history_24h",
      params: {
        task: `eq.${task}`,
        status: "in.(succeeded,failed)",
        "summary->>rollout_stage": `eq.${stage}`,
        finished_at: `gte.${new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()}`,
        order: "finished_at.desc,id.desc",
      },
    });
    diagnostics.push(successDiagnostic(rolloutHistoryResult.diagnostic, "ingestion_runs.rollout_history_24h"));
  } catch (error) {
    diagnostics.push(failureDiagnostic(error, "ingestion_runs.rollout_history_24h"));
    return unavailableStore(report);
  }
  report.rollout_history = {
    ...resultMetadata(rolloutHistoryResult),
    window_hours: 24,
    complete_for_decision: true,
  };

  report.available = true;
  return {
    available: true,
    running_rows: runningResult.rows,
    circuit_history_rows: eligibleHistory,
    rollout_history_rows: rolloutHistoryResult.rows,
    report,
  };
}

export async function readAutomaticProductionSnapshot(dependencies = {}) {
  const fetchCount = dependencies.fetchExactRowCountReliableImpl ?? fetchExactRowCountReliable;
  const diagnostics = [];
  const counts = {};

  for (const [key, table, params] of SNAPSHOT_REQUESTS) {
    const operationName = `production_snapshot.${key}`;
    try {
      const result = await fetchCount(table, params, { operationName });
      if (!Number.isInteger(result.count) || result.count < 0) {
        const error = new Error("Invalid exact count.");
        error.diagnostic = { ...result.diagnostic, category: "invalid_response" };
        throw error;
      }
      counts[key] = result.count;
      diagnostics.push(successDiagnostic(result.diagnostic, operationName));
    } catch (error) {
      diagnostics.push(failureDiagnostic(error, operationName));
      return {
        available: false,
        counts: null,
        diagnostics,
        request_concurrency: AUTOMATIC_PREFLIGHT_READ_CONTRACT.snapshot_request_concurrency,
        exact_counts: true,
      };
    }
  }

  return {
    available: true,
    counts,
    diagnostics,
    request_concurrency: AUTOMATIC_PREFLIGHT_READ_CONTRACT.snapshot_request_concurrency,
    exact_counts: true,
  };
}

function unavailableStore(report) {
  return {
    available: false,
    running_rows: null,
    circuit_history_rows: null,
    rollout_history_rows: null,
    report,
  };
}

function boundedReadMetadata(maxRows) {
  return {
    max_rows: maxRows,
    rows_returned: 0,
    saturated: false,
    request_count: 0,
    complete_for_decision: false,
  };
}

function resultMetadata(result) {
  return {
    max_rows: Number(result.max_rows) || 0,
    rows_returned: Number(result.rows_returned) || 0,
    saturated: result.saturated === true,
    request_count: Number(result.request_count) || 0,
  };
}

function failureDiagnostic(error, operationName) {
  const diagnostic = error?.diagnostic;
  if (diagnostic && typeof diagnostic === "object") {
    return {
      operation_name: safeOperationName(operationName),
      category: safeCategory(diagnostic.category),
      status_code: safeStatus(diagnostic.status_code),
      attempt_count: safeInteger(diagnostic.attempt_count, 0, 3),
      duration_ms: safeInteger(diagnostic.duration_ms, 0, 300_000),
    };
  }
  return {
    operation_name: safeOperationName(operationName),
    category: "unknown",
    status_code: null,
    attempt_count: 0,
    duration_ms: 0,
  };
}

function successDiagnostic(diagnostic, operationName) {
  return {
    operation_name: safeOperationName(operationName),
    category: diagnostic?.category == null ? null : safeCategory(diagnostic.category),
    status_code: safeStatus(diagnostic?.status_code),
    attempt_count: safeInteger(diagnostic?.attempt_count, 0, 3),
    duration_ms: safeInteger(diagnostic?.duration_ms, 0, 300_000),
  };
}

function completenessDiagnostic(operationName) {
  return {
    operation_name: safeOperationName(operationName),
    category: "invalid_response",
    status_code: null,
    attempt_count: 1,
    duration_ms: 0,
  };
}

function safeOperationName(value) {
  const candidate = String(value || "supabase_read").toLowerCase();
  return /^[a-z][a-z0-9_.-]{0,79}$/.test(candidate) ? candidate : "supabase_read";
}

function safeCategory(value) {
  return ["timeout", "network", "http_522", "http_5xx", "http_4xx", "invalid_response", "configuration", "unknown"]
    .includes(value) ? value : "unknown";
}

function safeStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function safeInteger(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, number));
}

function validDate(value) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
