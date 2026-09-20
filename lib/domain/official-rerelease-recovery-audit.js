import {
  buildOfficialRereleaseEvent,
  isOfficialRereleaseRecord,
  officialRereleaseEventChanged,
  resolveCanonicalOfficialRelease,
  sanitizeOfficialRereleaseEvent,
} from "./official-rerelease.js";
import { officialCanonicalDigest } from "./official-apply-contract.js";

export const OFFICIAL_RERELEASE_RECOVERY_AUDIT_SCHEMA_VERSION = 2;

const COUNT_KEYS = Object.freeze([
  "series",
  "variants",
  "provisional_variants",
  "restock_events",
  "import_issues",
]);

export function buildOfficialRereleaseRecoveryAudit({
  residual,
  catalog,
  databaseBefore,
  databaseAfter,
  observedAt,
  workflow = {},
  scan = {},
} = {}) {
  const knownUndetailed = sortRecords(asArray(residual?.knownUndetailedRecords));
  const safeRecords = sortRecords(asArray(residual?.safeRecords));
  const rereleaseRecords = sortRecords(dedupeRecords(asArray(residual?.rereleaseRecords)));
  const unresolvedRecords = sortRecords(asArray(residual?.unresolvedRecords));
  const seriesRows = asArray(catalog?.series);
  const eventRows = asArray(catalog?.restock_events);
  const seriesById = new Map(seriesRows.map((row) => [text(row?.id), row]).filter(([id]) => id));
  const seriesByUrl = groupBy(seriesRows, (row) => canonicalUrl(row?.official_url));
  const eventsById = new Map(eventRows.map((row) => [text(row?.id), row]).filter(([id]) => id));

  const candidates = [];
  let inserts = 0;
  let updates = 0;
  let unchanged = 0;
  let blocked = 0;

  for (const record of rereleaseRecords) {
    const seriesId = text(record?.id || record?.series_id);
    const recordUrl = canonicalUrl(record?.official_url);
    const byId = seriesById.get(seriesId);
    const urlMatches = asArray(seriesByUrl.get(recordUrl));
    const blockers = [];

    if (!isOfficialRereleaseRecord(record)) blockers.push("rerelease_semantics_missing");
    if (!byId) blockers.push("series_missing");
    if (byId && recordUrl && canonicalUrl(byId.official_url) !== recordUrl) {
      blockers.push("series_identity_url_drift");
    }
    if (urlMatches.some((row) => text(row?.id) !== seriesId)) {
      blockers.push("series_identity_collision");
    }

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
        series_id: seriesId || null,
        source_url: recordUrl || null,
        state: "blocked",
        operation: null,
        blockers: [...new Set(blockers)].sort(),
        canonical_release: canonical?.canonical ?? null,
        event: null,
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

    candidates.push({
      series_id: seriesId,
      source_url: recordUrl,
      state: "eligible",
      operation,
      blockers: [],
      canonical_release: canonical.canonical,
      event: sanitizeOfficialRereleaseEvent(event, operation),
    });
  }

  candidates.sort(compareCandidates);
  const before = normalizeCounts(databaseBefore);
  const after = normalizeCounts(databaseAfter);
  const delta = Object.fromEntries(COUNT_KEYS.map((key) => [key, after[key] - before[key]]));
  const completeCounts = COUNT_KEYS.every((key) => before[key] >= 0 && after[key] >= 0);
  const databaseStable = completeCounts && COUNT_KEYS.every((key) => delta[key] === 0);
  const residualCounts = {
    known_undetailed: knownUndetailed.length,
    safe_records: safeRecords.length,
    rerelease_records: rereleaseRecords.length,
    unresolved_records: unresolvedRecords.length,
  };
  const normalizedScan = {
    detail_fetch_limit: nonNegativeInt(scan?.detail_fetch_limit),
    detail_fetched: nonNegativeInt(scan?.detail_fetched),
    known_priority_urls: nonNegativeInt(scan?.known_priority_urls),
    held_shared_detailed_urls: nonNegativeInt(scan?.held_shared_detailed_urls),
    held_unsupported_provider_urls: nonNegativeInt(scan?.held_unsupported_provider_urls),
    priority_scan_complete: scan?.priority_scan_complete === true,
    fetch_issues: nonNegativeInt(scan?.fetch_issues),
  };
  const scanComplete = normalizedScan.priority_scan_complete
    && normalizedScan.detail_fetch_limit === normalizedScan.known_priority_urls
    && normalizedScan.detail_fetched === normalizedScan.known_priority_urls;
  const residualArithmeticValid = residualCounts.known_undetailed
    === residualCounts.safe_records + residualCounts.rerelease_records + residualCounts.unresolved_records;
  const nonGashaponRerelease = rereleaseRecords.filter((record) => !isGashaponUrl(record?.official_url)).length;

  const blockers = [
    ...(!completeCounts ? ["production_database_counts_incomplete"] : []),
    ...(!databaseStable ? ["production_database_delta_detected"] : []),
    ...(!scanComplete ? ["residual_scan_incomplete"] : []),
    ...(safeRecords.length ? ["phase_a3_safe_residual_remaining"] : []),
    ...(!residualArithmeticValid ? ["residual_partition_mismatch"] : []),
    ...(rereleaseRecords.some((record) => !isOfficialRereleaseRecord(record)) ? ["rerelease_partition_invalid"] : []),
    ...(nonGashaponRerelease ? ["rerelease_provider_not_reviewed"] : []),
  ];

  const planMaterial = {
    schema_version: OFFICIAL_RERELEASE_RECOVERY_AUDIT_SCHEMA_VERSION,
    residual: residualCounts,
    candidates,
  };
  const planDigest = officialCanonicalDigest(planMaterial);
  const changeCount = inserts + updates;
  const finalVerdict = blockers.length
    ? "OFFICIAL_RERELEASE_RECOVERY_AUDIT_BLOCKED"
    : changeCount > 0
      ? "OFFICIAL_RERELEASE_RECOVERY_AUDIT_READY"
      : "OFFICIAL_RERELEASE_RECOVERY_AUDIT_NO_CHANGES";

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
      source_scope: "post-phase-a3-residual",
      write_scope: "restock_events_only",
      writes_allowed: false,
      cleanup_enabled: false,
      deletes_allowed: false,
    },
    scan: normalizedScan,
    residual: {
      ...residualCounts,
      providers: {
        rerelease_records: providerCounts(rereleaseRecords),
        unresolved_records: providerCounts(unresolvedRecords),
      },
    },
    plan: {
      plan_digest: planDigest,
      candidate_count: candidates.length,
      eligible: inserts + updates + unchanged,
      blocked,
      change_count: changeCount,
      restock_event_inserts: inserts,
      restock_event_updates: updates,
      restock_event_unchanged: unchanged,
      planned_database_writes: changeCount,
      candidates,
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
    blockers: [...new Set(blockers)].sort(),
    final_verdict: finalVerdict,
  };
}

export function validateOfficialRereleaseRecoveryAudit(report) {
  if (report?.schema_version !== OFFICIAL_RERELEASE_RECOVERY_AUDIT_SCHEMA_VERSION
    || report?.report_type !== "official_rerelease_recovery_audit") {
    throw new Error("Official rerelease recovery audit schema is invalid.");
  }
  if (report?.execution?.mode !== "read-only"
    || report?.execution?.source_scope !== "post-phase-a3-residual"
    || report?.execution?.write_scope !== "restock_events_only"
    || report?.execution?.writes_allowed !== false
    || report?.execution?.cleanup_enabled !== false
    || report?.execution?.deletes_allowed !== false) {
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
  ].includes(report?.final_verdict)) {
    throw new Error("Official rerelease recovery audit verdict is invalid.");
  }
  if (!Array.isArray(report?.plan?.candidates)) {
    throw new Error("Official rerelease recovery candidates are invalid.");
  }

  const candidates = report.plan.candidates;
  let inserts = 0;
  let updates = 0;
  let unchanged = 0;
  let blocked = 0;
  for (const candidate of candidates) {
    if (!["eligible", "blocked"].includes(candidate?.state)) {
      throw new Error("Official rerelease recovery candidate state is invalid.");
    }
    if (candidate.state === "eligible") {
      if (!["insert", "update", "none"].includes(candidate.operation)) {
        throw new Error("Official rerelease recovery operation is invalid.");
      }
      if (!candidate.event
        || candidate.event.operation !== candidate.operation
        || text(candidate.event.series_id) !== text(candidate.series_id)
        || candidate.event.source_type !== "official_site"
        || candidate.event.event_type !== "restock"
        || candidate.event.classification_reason !== "official_rerelease_evidence"
        || candidate.event.review_required !== false) {
        throw new Error("Official rerelease recovery event contract is invalid.");
      }
      if (candidate.operation === "insert") inserts += 1;
      else if (candidate.operation === "update") updates += 1;
      else unchanged += 1;
    } else {
      blocked += 1;
      if (candidate.operation !== null || candidate.event !== null || !asArray(candidate.blockers).length) {
        throw new Error("Blocked rerelease recovery candidate contract is invalid.");
      }
    }
  }

  const eligible = inserts + updates + unchanged;
  const changeCount = inserts + updates;
  if (Number(report.plan.candidate_count) !== candidates.length
    || Number(report.plan.eligible) !== eligible
    || Number(report.plan.blocked) !== blocked
    || Number(report.plan.change_count) !== changeCount
    || Number(report.plan.restock_event_inserts) !== inserts
    || Number(report.plan.restock_event_updates) !== updates
    || Number(report.plan.restock_event_unchanged) !== unchanged
    || Number(report.plan.planned_database_writes) !== changeCount) {
    throw new Error("Official rerelease recovery plan summary is inconsistent.");
  }

  const residualCounts = {
    known_undetailed: nonNegativeInt(report?.residual?.known_undetailed),
    safe_records: nonNegativeInt(report?.residual?.safe_records),
    rerelease_records: nonNegativeInt(report?.residual?.rerelease_records),
    unresolved_records: nonNegativeInt(report?.residual?.unresolved_records),
  };
  if (residualCounts.known_undetailed
      !== residualCounts.safe_records + residualCounts.rerelease_records + residualCounts.unresolved_records
    || residualCounts.rerelease_records !== candidates.length) {
    throw new Error("Official rerelease recovery residual partition is inconsistent.");
  }

  const expectedDigest = officialCanonicalDigest({
    schema_version: OFFICIAL_RERELEASE_RECOVERY_AUDIT_SCHEMA_VERSION,
    residual: residualCounts,
    candidates,
  });
  if (!/^sha256:[0-9a-f]{64}$/.test(text(report?.plan?.plan_digest))
    || expectedDigest !== report.plan.plan_digest) {
    throw new Error("Official rerelease recovery audit digest is invalid.");
  }

  const scanComplete = report?.scan?.priority_scan_complete === true
    && Number(report?.scan?.detail_fetch_limit) === Number(report?.scan?.known_priority_urls)
    && Number(report?.scan?.detail_fetched) === Number(report?.scan?.known_priority_urls);
  const databaseCountsComplete = COUNT_KEYS.every((key) =>
    Number.isInteger(report?.database?.before?.[key]) && report.database.before[key] >= 0
    && Number.isInteger(report?.database?.after?.[key]) && report.database.after[key] >= 0);
  const databaseStable = databaseCountsComplete
    && COUNT_KEYS.every((key) => Number(report?.database?.delta?.[key]) === 0);
  const structuralReady = asArray(report?.blockers).length === 0
    && residualCounts.safe_records === 0
    && scanComplete
    && databaseStable;

  if (report.final_verdict === "OFFICIAL_RERELEASE_RECOVERY_AUDIT_READY"
    && (!structuralReady || changeCount <= 0)) {
    throw new Error("Official rerelease recovery READY verdict is inconsistent.");
  }
  if (report.final_verdict === "OFFICIAL_RERELEASE_RECOVERY_AUDIT_NO_CHANGES"
    && (!structuralReady || changeCount !== 0)) {
    throw new Error("Official rerelease recovery NO_CHANGES verdict is inconsistent.");
  }
  if (report.final_verdict === "OFFICIAL_RERELEASE_RECOVERY_AUDIT_BLOCKED"
    && structuralReady) {
    throw new Error("Official rerelease recovery BLOCKED verdict is inconsistent.");
  }
  return report;
}

export function formatOfficialRereleaseRecoveryAuditMarkdown(report) {
  return [
    "# Official rerelease residual recovery audit",
    "",
    "- Verdict: " + report.final_verdict,
    "- Head SHA: " + (report.workflow.head_sha || "none"),
    "- Plan digest: " + report.plan.plan_digest,
    "- Known undetailed residual: " + report.residual.known_undetailed,
    "- Phase A3 safe residual remaining: " + report.residual.safe_records,
    "- Rerelease residual: " + report.residual.rerelease_records,
    "- Parser/access unresolved residual: " + report.residual.unresolved_records,
    "- Eligible rerelease candidates: " + report.plan.eligible,
    "- Blocked rerelease candidates: " + report.plan.blocked,
    "- Event insert / update / unchanged: "
      + report.plan.restock_event_inserts + " / "
      + report.plan.restock_event_updates + " / "
      + report.plan.restock_event_unchanged,
    "- Priority scan complete: " + report.scan.priority_scan_complete,
    "- Held shared-detailed URLs: " + report.scan.held_shared_detailed_urls,
    "- Held unsupported-provider URLs: " + report.scan.held_unsupported_provider_urls,
    "- Database delta: " + JSON.stringify(report.database.delta),
    "- Production writes: 0",
    "- Deletes: 0",
    "- Blockers: " + (report.blockers.join(", ") || "none"),
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
    const id = text(record?.id || record?.series_id);
    const url = canonicalUrl(record?.official_url);
    const key = id || url;
    if (!key) continue;
    map.set(key, record);
  }
  return [...map.values()];
}

function sortRecords(records) {
  return [...asArray(records)].sort((left, right) =>
    text(left?.id || left?.series_id).localeCompare(text(right?.id || right?.series_id), "en")
    || canonicalUrl(left?.official_url).localeCompare(canonicalUrl(right?.official_url), "en"));
}

function compareCandidates(left, right) {
  return text(left?.series_id).localeCompare(text(right?.series_id), "en")
    || text(left?.source_url).localeCompare(text(right?.source_url), "en");
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

function isGashaponUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "gashapon.jp" || host === "www.gashapon.jp";
  } catch {
    return false;
  }
}

function providerCounts(records) {
  const counts = { gashapon: 0, takaratomy: 0, other: 0 };
  for (const record of asArray(records)) {
    const url = canonicalUrl(record?.official_url);
    if (url.includes("gashapon.jp/")) counts.gashapon += 1;
    else if (url.includes("takaratomy-arts.co.jp/")) counts.takaratomy += 1;
    else counts.other += 1;
  }
  return counts;
}

function groupBy(values, keyOf) {
  const grouped = new Map();
  for (const value of asArray(values)) {
    const key = keyOf(value);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(value);
  }
  return grouped;
}

function validIso(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function validSha(value) {
  return /^[0-9a-f]{40}$/i.test(text(value));
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
