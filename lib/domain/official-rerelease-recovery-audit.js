import {
  buildOfficialRereleaseEvent,
  isOfficialRereleaseRecord,
  officialRereleaseEventChanged,
  resolveCanonicalOfficialRelease,
  sanitizeOfficialRereleaseEvent,
} from "./official-rerelease.js";

export const OFFICIAL_RERELEASE_RECOVERY_AUDIT_SCHEMA_VERSION = 1;

const COUNT_KEYS = Object.freeze([
  "series",
  "variants",
  "restock_events",
  "import_issues",
]);

export function buildOfficialRereleaseRecoveryAudit({
  scheduleRecords,
  catalog,
  databaseBefore,
  databaseAfter,
  observedAt,
  workflow = {},
  source = {},
} = {}) {
  const seriesById = new Map(asArray(catalog?.series).map((row) => [text(row.id), row]));
  const seriesByUrl = new Map(asArray(catalog?.series)
    .filter((row) => text(row.official_url))
    .map((row) => [canonicalUrl(row.official_url), row]));
  const eventsById = new Map(asArray(catalog?.restock_events).map((row) => [text(row.id), row]));
  const rereleaseRecords = dedupeRecords(asArray(scheduleRecords).filter(isOfficialRereleaseRecord));
  const candidates = [];
  let inserts = 0;
  let updates = 0;
  let unchanged = 0;
  let blocked = 0;

  for (const record of rereleaseRecords) {
    const recordUrl = canonicalUrl(record.official_url);
    const byId = seriesById.get(text(record.id));
    const byUrl = seriesByUrl.get(recordUrl);
    const blockers = [];

    if (!byId) blockers.push("series_missing");
    if (byId && recordUrl && canonicalUrl(byId.official_url) !== recordUrl) blockers.push("series_identity_url_drift");
    if (byUrl && text(byUrl.id) !== text(record.id)) blockers.push("series_identity_collision");

    let canonical = null;
    let eventPlan = null;
    if (!blockers.length) {
      canonical = resolveCanonicalOfficialRelease(record, byId);
      if (!canonical.ok) blockers.push(canonical.blocker || "rerelease_canonical_release_unresolved");
    }
    if (!blockers.length) {
      eventPlan = buildOfficialRereleaseEvent({
        record: canonical.record,
        series: byId,
        observedAt,
      });
      if (eventPlan.blocker) blockers.push(eventPlan.blocker);
    }

    if (blockers.length || !eventPlan?.event) {
      blocked += 1;
      candidates.push({
        series_id: text(record.id) || null,
        source_url: recordUrl || null,
        state: "blocked",
        operation: null,
        blockers: [...new Set(blockers)].sort(),
        canonical_release: canonical?.canonical ?? null,
        evidence: null,
      });
      continue;
    }

    const event = eventPlan.event;
    const existing = eventsById.get(event.id);
    const operation = existing
      ? (officialRereleaseEventChanged(existing, event) ? "update" : "none")
      : "insert";
    if (operation === "insert") inserts += 1;
    else if (operation === "update") updates += 1;
    else unchanged += 1;

    const sanitized = sanitizeOfficialRereleaseEvent(event, operation);
    candidates.push({
      series_id: text(record.id),
      source_url: recordUrl,
      state: "eligible",
      operation,
      blockers: [],
      canonical_release: canonical.canonical,
      evidence: sanitized?.evidence ?? null,
      event_id: sanitized?.id ?? null,
    });
  }

  const before = normalizeCounts(databaseBefore);
  const after = normalizeCounts(databaseAfter);
  const delta = Object.fromEntries(COUNT_KEYS.map((key) => [key, after[key] - before[key]]));
  const databaseStable = COUNT_KEYS.every((key) => delta[key] === 0);
  const sourceOk = source.ok === true && Number(source.schedule_pages ?? 0) > 0 && Number(source.records ?? 0) > 0;
  const eligible = inserts + updates + unchanged;
  const finalVerdict = !sourceOk || !databaseStable
    ? "OFFICIAL_RERELEASE_RECOVERY_AUDIT_BLOCKED"
    : eligible === 0
      ? "OFFICIAL_RERELEASE_RECOVERY_AUDIT_NO_CHANGES"
      : "OFFICIAL_RERELEASE_RECOVERY_AUDIT_READY";

  return {
    schema_version: OFFICIAL_RERELEASE_RECOVERY_AUDIT_SCHEMA_VERSION,
    report_type: "official_rerelease_recovery_audit",
    fetched_at: validIso(observedAt) || new Date().toISOString(),
    workflow: {
      run_id: text(workflow.run_id) || null,
      head_sha: validSha(workflow.head_sha) ? text(workflow.head_sha).toLowerCase() : null,
      event_name: text(workflow.event_name) || "local",
    },
    execution: {
      task: "official-rerelease-recovery",
      mode: "read-only",
      writes_allowed: false,
      cleanup_enabled: false,
      deletes_allowed: false,
    },
    source: {
      provider: "gashapon",
      scope: "schedule-window",
      ok: sourceOk,
      schedule_pages: number(source.schedule_pages),
      records: number(source.records),
      issues: number(source.issues),
    },
    totals: {
      rerelease_discovered: rereleaseRecords.length,
      eligible,
      blocked,
      restock_event_inserts: inserts,
      restock_event_updates: updates,
      restock_event_unchanged: unchanged,
    },
    candidates: candidates.sort((left, right) =>
      text(left.series_id).localeCompare(text(right.series_id), "en")
      || text(left.source_url).localeCompare(text(right.source_url), "en")),
    database: {
      before,
      after,
      delta,
      writes: 0,
      inserts: 0,
      updates: 0,
      deletes: 0,
    },
    blockers: [
      ...(!sourceOk ? ["source_incomplete"] : []),
      ...(!databaseStable ? ["production_database_delta_detected"] : []),
    ],
    final_verdict: finalVerdict,
  };
}

export function validateOfficialRereleaseRecoveryAudit(report) {
  if (report?.schema_version !== OFFICIAL_RERELEASE_RECOVERY_AUDIT_SCHEMA_VERSION
    || report?.report_type !== "official_rerelease_recovery_audit") {
    throw new Error("Official rerelease recovery audit schema is invalid.");
  }
  if (report?.execution?.mode !== "read-only" || report?.execution?.writes_allowed !== false
    || report?.execution?.cleanup_enabled !== false || report?.execution?.deletes_allowed !== false) {
    throw new Error("Official rerelease recovery audit is not read-only.");
  }
  if (report?.database?.writes !== 0 || report?.database?.inserts !== 0
    || report?.database?.updates !== 0 || report?.database?.deletes !== 0) {
    throw new Error("Official rerelease recovery audit contains database writes.");
  }
  if (![
    "OFFICIAL_RERELEASE_RECOVERY_AUDIT_READY",
    "OFFICIAL_RERELEASE_RECOVERY_AUDIT_NO_CHANGES",
    "OFFICIAL_RERELEASE_RECOVERY_AUDIT_BLOCKED",
  ].includes(report.final_verdict)) {
    throw new Error("Official rerelease recovery audit verdict is invalid.");
  }
  if (!Array.isArray(report.candidates)) throw new Error("Official rerelease recovery candidates are invalid.");
  return report;
}

export function formatOfficialRereleaseRecoveryAuditMarkdown(report) {
  return [
    "# Official rerelease recovery audit",
    "",
    `- Verdict: ${report.final_verdict}`,
    `- Head SHA: ${report.workflow.head_sha ?? "none"}`,
    `- Schedule pages: ${report.source.schedule_pages}`,
    `- Source records: ${report.source.records}`,
    `- Rerelease discovered: ${report.totals.rerelease_discovered}`,
    `- Eligible: ${report.totals.eligible}`,
    `- Blocked: ${report.totals.blocked}`,
    `- Event inserts: ${report.totals.restock_event_inserts}`,
    `- Event updates: ${report.totals.restock_event_updates}`,
    `- Event unchanged: ${report.totals.restock_event_unchanged}`,
    "- Database writes: 0",
    "- Deletes: 0",
    `- Blockers: ${report.blockers.join(", ") || "none"}`,
    "",
  ].join("\n");
}

function normalizeCounts(value) {
  const input = value && typeof value === "object" ? value : {};
  return Object.fromEntries(COUNT_KEYS.map((key) => {
    const parsed = Number(input[key]);
    return [key, Number.isInteger(parsed) && parsed >= 0 ? parsed : -1];
  }));
}

function dedupeRecords(records) {
  const map = new Map();
  for (const record of records) {
    const id = text(record?.id);
    if (!id) continue;
    map.set(id, record);
  }
  return [...map.values()];
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

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}
