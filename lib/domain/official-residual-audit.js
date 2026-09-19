import { partitionLegacyOfficialRecords } from "./official-upsert-safety.js";

export const OFFICIAL_RESIDUAL_AUDIT_SCHEMA_VERSION = 1;

const COUNT_KEYS = Object.freeze(["series", "variants", "provisional_variants", "restock_events", "import_issues"]);

export function buildOfficialResidualAudit({
  knownOfficialRecords,
  knownDetailedOfficialUrls,
  fetchedRecords,
  detailFetched,
  detailFetchLimit,
  collectorRemainingDetails,
  issues,
  databaseBefore,
  databaseAfter,
  observedAt,
  workflow = {},
} = {}) {
  const detailed = new Set(asArray(knownDetailedOfficialUrls).map(canonicalUrl).filter(Boolean));
  const known = dedupeByUrl(asArray(knownOfficialRecords));
  const knownUndetailed = known.filter((record) => !detailed.has(canonicalUrl(record.official_url)));

  const parsedResidual = dedupeByUrl(asArray(fetchedRecords)
    .filter((record) => asArray(record?.variants).length > 0)
    .filter((record) => {
      const url = canonicalUrl(record?.official_url);
      return url && !detailed.has(url);
    }));

  const { safeRecords, blockedRecords } = partitionLegacyOfficialRecords(parsedResidual);
  const parsedUrls = new Set(parsedResidual.map((record) => canonicalUrl(record.official_url)).filter(Boolean));
  const knownUnresolved = knownUndetailed.filter((record) => !parsedUrls.has(canonicalUrl(record.official_url)));

  const before = normalizeCounts(databaseBefore);
  const after = normalizeCounts(databaseAfter);
  const delta = Object.fromEntries(COUNT_KEYS.map((key) => [key, after[key] - before[key]]));
  const databaseStable = COUNT_KEYS.every((key) => delta[key] === 0);
  const fetched = nonNegativeInt(detailFetched);
  const limit = positiveInt(detailFetchLimit);
  const scanComplete = limit > 0 && fetched < limit;
  const remaining = nonNegativeInt(collectorRemainingDetails);
  const safe = dedupeByUrl(safeRecords);
  const rerelease = dedupeByUrl(blockedRecords);

  let finalVerdict = "OFFICIAL_RESIDUAL_AUDIT_PHASE_A_CLEAR";
  if (!databaseStable) finalVerdict = "OFFICIAL_RESIDUAL_AUDIT_BLOCKED_DATABASE_DELTA";
  else if (!scanComplete) finalVerdict = "OFFICIAL_RESIDUAL_AUDIT_INCOMPLETE_SCAN";
  else if (remaining > 0) finalVerdict = "OFFICIAL_RESIDUAL_AUDIT_UNRESOLVED_DETAILS";
  else if (safe.length > 0) finalVerdict = "OFFICIAL_RESIDUAL_AUDIT_NON_RERELEASE_REMAINS";

  return {
    schema_version: OFFICIAL_RESIDUAL_AUDIT_SCHEMA_VERSION,
    report_type: "official_residual_audit",
    fetched_at: validIso(observedAt) || new Date().toISOString(),
    workflow: {
      run_id: text(workflow.run_id) || null,
      head_sha: validSha(workflow.head_sha) ? text(workflow.head_sha).toLowerCase() : null,
      event_name: text(workflow.event_name) || "local",
    },
    execution: {
      mode: "read-only",
      writes_allowed: false,
      deletes_allowed: false,
      cleanup_enabled: false,
    },
    scan: {
      detail_fetch_limit: limit,
      detail_fetched: fetched,
      scan_complete: scanComplete,
      collector_remaining_details: remaining,
      issues: asArray(issues).length,
    },
    totals: {
      known_official_records: known.length,
      known_detailed_before: detailed.size,
      known_undetailed_before: knownUndetailed.length,
      parsed_residual_with_variants: parsedResidual.length,
      non_rerelease_parseable: safe.length,
      rerelease_parseable: rerelease.length,
      known_unresolved_after_scan: knownUnresolved.length,
    },
    providers: {
      known_undetailed: providerCounts(knownUndetailed),
      non_rerelease_parseable: providerCounts(safe),
      rerelease_parseable: providerCounts(rerelease),
      known_unresolved_after_scan: providerCounts(knownUnresolved),
    },
    recency: {
      known_undetailed_recent_120d: knownUndetailed.filter((record) => withinDays(record.release_date, 120)).length,
      known_unresolved_recent_120d: knownUnresolved.filter((record) => withinDays(record.release_date, 120)).length,
    },
    database: {
      before,
      after,
      delta,
      writes: 0,
      inserts: 0,
      updates: 0,
      deletes: 0,
    },
    final_verdict: finalVerdict,
  };
}

export function validateOfficialResidualAudit(report) {
  if (report?.schema_version !== OFFICIAL_RESIDUAL_AUDIT_SCHEMA_VERSION || report?.report_type !== "official_residual_audit") {
    throw new Error("Official residual audit schema is invalid.");
  }
  if (report?.execution?.mode !== "read-only" || report?.execution?.writes_allowed !== false
    || report?.execution?.deletes_allowed !== false || report?.execution?.cleanup_enabled !== false) {
    throw new Error("Official residual audit is not read-only.");
  }
  if (report?.database?.writes !== 0 || report?.database?.inserts !== 0
    || report?.database?.updates !== 0 || report?.database?.deletes !== 0) {
    throw new Error("Official residual audit contains database writes.");
  }
  if (![
    "OFFICIAL_RESIDUAL_AUDIT_PHASE_A_CLEAR",
    "OFFICIAL_RESIDUAL_AUDIT_BLOCKED_DATABASE_DELTA",
    "OFFICIAL_RESIDUAL_AUDIT_INCOMPLETE_SCAN",
    "OFFICIAL_RESIDUAL_AUDIT_UNRESOLVED_DETAILS",
    "OFFICIAL_RESIDUAL_AUDIT_NON_RERELEASE_REMAINS",
  ].includes(report.final_verdict)) {
    throw new Error("Official residual audit verdict is invalid.");
  }
  return report;
}

export function formatOfficialResidualAuditMarkdown(report) {
  return [
    "# Official residual audit",
    "",
    `- Verdict: ${report.final_verdict}`,
    `- Head SHA: ${report.workflow.head_sha ?? "none"}`,
    `- Known undetailed before: ${report.totals.known_undetailed_before}`,
    `- Detail fetched: ${report.scan.detail_fetched}`,
    `- Scan complete: ${report.scan.scan_complete}`,
    `- Non-rerelease parseable: ${report.totals.non_rerelease_parseable}`,
    `- Rerelease parseable: ${report.totals.rerelease_parseable}`,
    `- Collector unresolved: ${report.scan.collector_remaining_details}`,
    `- Known unresolved: ${report.totals.known_unresolved_after_scan}`,
    `- Recent unresolved (120d): ${report.recency.known_unresolved_recent_120d}`,
    `- Fetch issues: ${report.scan.issues}`,
    "- Database writes: 0",
    "- Deletes: 0",
    "",
  ].join("\n");
}

function dedupeByUrl(records) {
  const map = new Map();
  for (const record of records) {
    const url = canonicalUrl(record?.official_url);
    if (!url) continue;
    map.set(url, record);
  }
  return [...map.values()];
}

function providerCounts(records) {
  const counts = { gashapon: 0, takaratomy: 0, other: 0 };
  for (const record of records) {
    const url = canonicalUrl(record?.official_url);
    if (url.includes("gashapon.jp/")) counts.gashapon += 1;
    else if (url.includes("takaratomy-arts.co.jp/")) counts.takaratomy += 1;
    else counts.other += 1;
  }
  return counts;
}

function withinDays(value, days) {
  const timestamp = Date.parse(text(value));
  if (!Number.isFinite(timestamp)) return false;
  return timestamp >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function normalizeCounts(value) {
  const input = value && typeof value === "object" ? value : {};
  return Object.fromEntries(COUNT_KEYS.map((key) => [key, nonNegativeInt(input[key])]));
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function validIso(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function validSha(value) {
  return /^[0-9a-f]{40}$/i.test(text(value));
}

function positiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function nonNegativeInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}
