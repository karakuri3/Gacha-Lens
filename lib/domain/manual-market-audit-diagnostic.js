import { planMarketSearchQueries } from "../fetchers/market-query-planner.js";
import {
  manualCanarySelectionOptions,
  parseMarketManualCanarySelectionProfile,
} from "./market-manual-canary-selection.js";

const DIAGNOSTIC_KIND = "manual_priority_fallback";
const PRIORITY_THREE_SEED_KIND = "priority_3_seed_read_only";

export function planManualMarketAuditDiagnostic({ catalog = {}, coverageRows = [], options = {}, profile } = {}) {
  const parsedProfile = parseMarketManualCanarySelectionProfile(profile);
  const selectionOptions = {
    ...options,
    ...manualCanarySelectionOptions(parsedProfile),
  };
  const priorityOnePlan = planMarketSearchQueries(catalog, coverageRows, selectionOptions);

  if (String(options.priority) !== "1" || priorityOnePlan.selected.length > 0) {
    return { plan: priorityOnePlan, manualDiagnostic: null };
  }

  const fallbackPlan = planMarketSearchQueries(catalog, coverageRows, {
    ...selectionOptions,
    priority: "all",
  });
  if (!fallbackPlan.selected.length) return { plan: priorityOnePlan, manualDiagnostic: null };

  return {
    plan: fallbackPlan,
    manualDiagnostic: {
      kind: DIAGNOSTIC_KIND,
      canary_eligible: false,
      write_eligible: false,
      requested_priority: "1",
      effective_priority: "all",
      fallback_reason: "priority_1_empty",
    },
  };
}

export function isNonAuthoritativeManualMarketAudit(report = {}) {
  const diagnostic = report.manual_diagnostic;
  return diagnostic?.canary_eligible === false
    && diagnostic.write_eligible === false
    && [DIAGNOSTIC_KIND, PRIORITY_THREE_SEED_KIND].includes(diagnostic.kind);
}

export function buildPriorityThreeSeedReadOnlyDiagnostic() {
  return {
    kind: PRIORITY_THREE_SEED_KIND,
    canary_eligible: false,
    write_eligible: false,
    requested_priority: "3",
    effective_priority: "3",
    fallback_reason: "priority_3_seed_read_only",
  };
}

export function sanitizeManualMarketAuditDiagnostic(value) {
  if (value == null) return null;
  if (
    value?.kind === PRIORITY_THREE_SEED_KIND
    && value?.canary_eligible === false
    && value?.write_eligible === false
    && value?.requested_priority === "3"
    && value?.effective_priority === "3"
    && value?.fallback_reason === "priority_3_seed_read_only"
  ) {
    return buildPriorityThreeSeedReadOnlyDiagnostic();
  }
  if (
    value?.kind !== DIAGNOSTIC_KIND
    || value?.canary_eligible !== false
    || value?.write_eligible !== false
    || value?.requested_priority !== "1"
    || value?.effective_priority !== "all"
    || value?.fallback_reason !== "priority_1_empty"
  ) {
    throw new Error("Manual market audit diagnostic is invalid.");
  }
  return {
    kind: DIAGNOSTIC_KIND,
    canary_eligible: false,
    write_eligible: false,
    requested_priority: "1",
    effective_priority: "all",
    fallback_reason: "priority_1_empty",
  };
}
