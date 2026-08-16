import { createHash } from "node:crypto";
import {
  buildOfficialRereleaseEvent,
  officialRereleaseEventChanged,
  resolveCanonicalOfficialRelease,
  sanitizeOfficialRereleaseEvent,
} from "./official-rerelease.js";

export const OFFICIAL_READ_ONLY_PLAN_LIMITS = Object.freeze({
  max_series_upserts: 4,
  max_variant_upserts: 40,
  max_restock_event_upserts: 4,
  max_issues: 8,
});

const REQUIRED_SOURCES = Object.freeze([
  "gashapon_schedule",
  "gashapon_products",
  "takaratomy_search",
]);

export function buildOfficialReadOnlyAudit({
  snapshot,
  catalog,
  databaseBefore,
  databaseAfter,
  workflow = {},
  limits = OFFICIAL_READ_ONLY_PLAN_LIMITS,
} = {}) {
  const normalizedLimits = normalizeLimits(limits);
  const sources = normalizeSources(snapshot?.sources);
  const formalRecords = uniqueRecords(snapshot?.formal_records);
  const existingSeries = new Map(asArray(catalog?.series).map((row) => [text(row.id), row]));
  const existingSeriesByUrl = new Map(asArray(catalog?.series)
    .filter((row) => text(row.official_url))
    .map((row) => [canonicalOfficialUrl(row.official_url), row]));
  const existingVariants = new Map(asArray(catalog?.variants).map((row) => [text(row.id), row]));
  const existingRestockEvents = new Map(asArray(catalog?.restock_events).map((row) => [text(row.id), row]));
  const variantsBySeries = groupBy(asArray(catalog?.variants), (row) => text(row.series_id));
  const blockers = [];
  const candidates = [];
  const seenVariantIds = new Set();
  let newSeriesCount = 0;
  let existingSeriesCount = 0;
  let newVariantCount = 0;
  let existingVariantCount = 0;
  let seriesUpdates = 0;
  let variantUpdates = 0;
  let restockEventInserts = 0;
  let restockEventUpdates = 0;
  let restockEventNone = 0;
  let provisionalReplacementCandidates = 0;

  for (const required of REQUIRED_SOURCES) {
    const source = sources.find((entry) => entry.source === required);
    if (!source) blockers.push(`missing_source:${required}`);
    else {
      if (!source.http_success) blockers.push(`source_http_failed:${required}`);
      if (!source.parser_success) blockers.push(`source_parser_failed:${required}`);
      if (source.records === 0 && source.discovered_urls === 0) blockers.push(`source_zero_results:${required}`);
      if (source.detail_failures > 0 || source.zero_lineups > 0) blockers.push(`source_detail_incomplete:${required}`);
    }
  }
  if (!formalRecords.length) blockers.push("formal_lineups_zero");
  if (!isCompleteCountSnapshot(databaseBefore) || !isCompleteCountSnapshot(databaseAfter)) {
    blockers.push("production_database_snapshot_incomplete");
  }
  if (!snapshotsEqual(databaseBefore, databaseAfter)) blockers.push("production_database_delta_detected");

  for (const record of formalRecords) {
    const validation = validateFormalRecord(record);
    if (!validation.ok) {
      blockers.push(...validation.reasons.map((reason) => `${reason}:${text(record?.id) || "unknown"}`));
      continue;
    }
    const recordUrl = canonicalOfficialUrl(record.official_url);
    const byId = existingSeries.get(record.id);
    const byUrl = existingSeriesByUrl.get(recordUrl);
    if (byId && canonicalOfficialUrl(byId.official_url) !== recordUrl) {
      blockers.push(`series_identity_url_drift:${record.id}`);
      continue;
    }
    if (byUrl && text(byUrl.id) !== record.id) {
      blockers.push(`series_identity_collision:${record.id}`);
      continue;
    }

    const canonicalResolution = resolveCanonicalOfficialRelease(record, byId);
    if (!canonicalResolution.ok) {
      blockers.push(`${canonicalResolution.blocker}:${record.id}`);
      continue;
    }
    const resolvedRecord = canonicalResolution.record;
    const seriesOperation = byId ? (seriesChanged(byId, resolvedRecord) ? "update" : "none") : "insert";
    if (byId) existingSeriesCount += 1;
    else newSeriesCount += 1;
    if (seriesOperation === "update") seriesUpdates += 1;

    const variantPlans = [];
    for (const variant of asArray(resolvedRecord.variants)) {
      if (seenVariantIds.has(variant.id)) {
        blockers.push(`duplicate_variant_id:${variant.id}`);
        continue;
      }
      seenVariantIds.add(variant.id);
      const existing = existingVariants.get(variant.id);
      if (existing && text(existing.series_id) !== record.id) {
        blockers.push(`variant_parent_identity_collision:${variant.id}`);
        continue;
      }
      const operation = existing ? (variantChanged(existing, variant, resolvedRecord) ? "update" : "none") : "insert";
      if (existing) existingVariantCount += 1;
      else newVariantCount += 1;
      if (operation === "update") variantUpdates += 1;
      variantPlans.push({
        id: variant.id,
        name: text(variant.name),
        operation,
      });
    }
    const provisionalRows = (variantsBySeries.get(record.id) ?? [])
      .filter((row) => text(row.variant_type) === "provisional");
    const rereleasePlan = buildOfficialRereleaseEvent({
      record: resolvedRecord,
      series: byId || resolvedRecord,
      observedAt: snapshot?.fetched_at,
    });
    if (rereleasePlan.blocker) blockers.push(`${rereleasePlan.blocker}:${record.id}`);
    let sanitizedRereleaseEvent = null;
    if (rereleasePlan.event) {
      const existingEvent = existingRestockEvents.get(rereleasePlan.event.id);
      const operation = existingEvent
        ? (officialRereleaseEventChanged(existingEvent, rereleasePlan.event) ? "update" : "none")
        : "insert";
      if (operation === "insert") restockEventInserts += 1;
      else if (operation === "update") restockEventUpdates += 1;
      else restockEventNone += 1;
      sanitizedRereleaseEvent = sanitizeOfficialRereleaseEvent(rereleasePlan.event, operation);
    }
    provisionalReplacementCandidates += provisionalRows.length ? 1 : 0;
    candidates.push({
      series_id: record.id,
      series_name: text(resolvedRecord.name),
      official_url: recordUrl,
      operation: seriesOperation,
      canonical_release: {
        year: canonicalResolution.canonical?.year ?? null,
        month: canonicalResolution.canonical?.month ?? null,
        release_date: text(resolvedRecord.release_date) || null,
        release_month: text(resolvedRecord.release_month) || null,
        release_week: text(resolvedRecord.release_week) || null,
        precision: canonicalResolution.canonical?.precision ?? null,
        source: canonicalResolution.source,
      },
      variant_count: variantPlans.length,
      provisional_replacement_candidate: provisionalRows.length > 0,
      variants: variantPlans,
      restock_event: sanitizedRereleaseEvent,
    });
  }

  const issueCodes = [...new Set(asArray(snapshot?.issue_codes).map(text).filter(Boolean))].sort();
  if (issueCodes.length) blockers.push("official_issues_present");
  const seriesChanges = newSeriesCount + seriesUpdates;
  const variantChanges = newVariantCount + variantUpdates;
  const restockEventChanges = restockEventInserts + restockEventUpdates;
  if (seriesChanges > normalizedLimits.max_series_upserts) blockers.push("series_change_cap_exceeded");
  if (variantChanges > normalizedLimits.max_variant_upserts) blockers.push("variant_change_cap_exceeded");
  if (restockEventChanges > normalizedLimits.max_restock_event_upserts) blockers.push("restock_event_change_cap_exceeded");
  if (issueCodes.length > normalizedLimits.max_issues) blockers.push("issue_candidate_cap_exceeded");

  const databaseDelta = buildDatabaseDelta(databaseBefore, databaseAfter);
  const reportComplete = REQUIRED_SOURCES.every((required) => sources.some((source) => source.source === required))
    && isCompleteCountSnapshot(databaseBefore)
    && isCompleteCountSnapshot(databaseAfter)
    && Object.values(databaseDelta).every((value) => value === 0);
  const uniqueBlockers = [...new Set(blockers)].sort();
  const report = {
    schema_version: 2,
    report_type: "official_read_only_live_audit",
    fetched_at: text(snapshot?.fetched_at) || new Date().toISOString(),
    workflow: {
      run_id: text(workflow.run_id) || null,
      head_sha: validSha(workflow.head_sha) ? workflow.head_sha : null,
      event_name: text(workflow.event_name) || "local",
    },
    execution: {
      task: "official",
      mode: "read-only",
      source_scope: "official-live-bounded",
      cleanup_enabled: false,
      deletes_allowed: false,
    },
    sources,
    totals: {
      discovered_records: asArray(snapshot?.discovery_records).length,
      detail_attempts: sources.reduce((sum, source) => sum + source.detail_attempts, 0),
      detail_successes: sources.reduce((sum, source) => sum + source.detail_successes, 0),
      detail_failures: sources.reduce((sum, source) => sum + source.detail_failures, 0),
      formal_lineups: formalRecords.length,
      zero_lineups: sources.reduce((sum, source) => sum + source.zero_lineups, 0),
      issues: issueCodes.length,
      new_series: newSeriesCount,
      existing_series: existingSeriesCount,
      new_variants: newVariantCount,
      existing_variants: existingVariantCount,
      provisional_replacement_candidates: provisionalReplacementCandidates,
      remaining_provisional_variants: asArray(catalog?.variants)
        .filter((row) => text(row.variant_type) === "provisional").length,
      restock_event_inserts: restockEventInserts,
      restock_event_updates: restockEventUpdates,
      restock_event_unchanged: restockEventNone,
    },
    plan: {
      state: uniqueBlockers.length ? "blocked" : "ready",
      limits: normalizedLimits,
      candidate_count: candidates.length,
      candidates,
      issue_codes: issueCodes,
      blockers: uniqueBlockers,
      would_insert: { series: newSeriesCount, variants: newVariantCount, restock_events: restockEventInserts, import_issues: 0 },
      would_update: { series: seriesUpdates, variants: variantUpdates, restock_events: restockEventUpdates, import_issues: 0 },
      would_delete: { series: 0, variants: 0, restock_events: 0, import_issues: 0 },
      cleanup_operations: 0,
    },
    database: {
      before: normalizeCountSnapshot(databaseBefore),
      after: normalizeCountSnapshot(databaseAfter),
      delta: databaseDelta,
      writes: 0,
      inserts: 0,
      updates: 0,
      deletes: 0,
    },
    report_complete: reportComplete,
    final_verdict: reportComplete && uniqueBlockers.length === 0
      ? "OFFICIAL_READ_ONLY_PLAN_READY"
      : "OFFICIAL_READ_ONLY_PLAN_BLOCKED",
  };
  report.canonical_digest = digestReport(report);
  return report;
}

export function validateOfficialReadOnlyAudit(report) {
  if (report?.schema_version !== 2 || report?.report_type !== "official_read_only_live_audit") {
    throw new Error("Official audit schema is invalid.");
  }
  if (report?.execution?.mode !== "read-only" || report?.execution?.cleanup_enabled !== false) {
    throw new Error("Official audit execution contract is not read-only.");
  }
  if (report?.database?.writes !== 0 || report?.database?.inserts !== 0
    || report?.database?.updates !== 0 || report?.database?.deletes !== 0) {
    throw new Error("Official audit contains database writes.");
  }
  if (report?.plan?.would_delete?.series !== 0 || report?.plan?.would_delete?.variants !== 0
    || report?.plan?.would_delete?.restock_events !== 0
    || report?.plan?.cleanup_operations !== 0) {
    throw new Error("Official audit plan contains cleanup or delete operations.");
  }
  const duplicateCandidates = duplicateValues(asArray(report?.plan?.candidates).map((entry) => entry.series_id));
  if (duplicateCandidates.length) throw new Error("Official audit plan contains duplicate series identities.");
  if (duplicateValues(asArray(report?.sources).map((entry) => entry.source)).length) {
    throw new Error("Official audit contains duplicate source identities.");
  }
  if (findForbiddenObjectKeys(report).length) throw new Error("Official audit contains forbidden fields.");
  const normalizedLimits = normalizeLimits(report?.plan?.limits);
  if (JSON.stringify(normalizedLimits) !== JSON.stringify(report?.plan?.limits)) {
    throw new Error("Official audit plan limits exceed the reviewed read-only contract.");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(text(report?.canonical_digest)) || digestReport(report) !== report.canonical_digest) {
    throw new Error("Official audit digest does not match its canonical content.");
  }
  return report;
}

export function formatOfficialReadOnlyAuditMarkdown(report) {
  const rows = [
    "# Official read-only live audit",
    "",
    `- Fetched at: ${report.fetched_at}`,
    `- Verdict: ${report.final_verdict}`,
    `- Report complete: ${report.report_complete}`,
    `- Formal lineups: ${report.totals.formal_lineups}`,
    `- New / existing series: ${report.totals.new_series} / ${report.totals.existing_series}`,
    `- New / existing variants: ${report.totals.new_variants} / ${report.totals.existing_variants}`,
    `- Provisional replacement candidates: ${report.totals.provisional_replacement_candidates}`,
    `- Remaining provisional variants: ${report.totals.remaining_provisional_variants}`,
    `- Restock event insert / update / unchanged: ${report.totals.restock_event_inserts} / ${report.totals.restock_event_updates} / ${report.totals.restock_event_unchanged}`,
    `- Database writes: ${report.database.writes}`,
    `- Cleanup operations: ${report.plan.cleanup_operations}`,
    "",
    "## Sources",
    "",
    "| Source | HTTP | Parser | Records | URLs | Details | Formal | Issues | Freshness |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ...report.sources.map((source) => `| ${source.source} | ${source.http_success} | ${source.parser_success} | ${source.records} | ${source.discovered_urls} | ${source.detail_successes}/${source.detail_attempts} | ${source.formal_lineups} | ${source.issue_codes.length} | ${source.freshness.state} |`),
    "",
    "## Bounded plan",
    "",
    `- State: ${report.plan.state}`,
    `- Candidates: ${report.plan.candidate_count}`,
    `- Series cap: ${report.plan.limits.max_series_upserts}`,
    `- Variant cap: ${report.plan.limits.max_variant_upserts}`,
    `- Restock event cap: ${report.plan.limits.max_restock_event_upserts}`,
    `- Issue cap: ${report.plan.limits.max_issues}`,
    `- Blockers: ${report.plan.blockers.join(", ") || "none"}`,
    "- Deletes: 0",
    "- Production writes: 0",
    "",
  ];
  return `${rows.join("\n")}\n`;
}

export function findOfficialAuditLeaks(files, explicitValues = []) {
  const secretValues = asArray(explicitValues).map(text).filter((value) => value.length >= 8);
  const findings = [];
  for (const file of asArray(files)) {
    const body = String(file?.text ?? "");
    let parsed = null;
    if (String(file?.name ?? "").endsWith(".json")) {
      try { parsed = JSON.parse(body); } catch { findings.push(`${file.name}:invalid_json`); }
    }
    if (parsed && findForbiddenObjectKeys(parsed).length) findings.push(`${file.name}:forbidden_fields`);
    if (secretValues.some((value) => body.includes(value))) findings.push(`${file.name}:explicit_secret_value`);
  }
  return [...new Set(findings)].sort();
}

function validateFormalRecord(record) {
  const reasons = [];
  if (!text(record?.id) || !text(record?.name)) reasons.push("formal_record_identity_missing");
  if (record?.source_type !== "official_site") reasons.push("formal_record_source_invalid");
  if (record?.review_required !== false) reasons.push("formal_record_requires_review");
  if (!isAllowedOfficialUrl(record?.official_url)) reasons.push("formal_record_url_invalid");
  const variants = asArray(record?.variants);
  if (!variants.length) reasons.push("formal_record_lineup_empty");
  if (variants.some((variant) => !text(variant?.id) || !text(variant?.name) || variant?.review_required === true)) {
    reasons.push("formal_variant_invalid");
  }
  if (duplicateValues(variants.map((variant) => text(variant?.id))).length) reasons.push("formal_variant_duplicate");
  return { ok: reasons.length === 0, reasons };
}

function isAllowedOfficialUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (
      (url.hostname === "gashapon.jp" && url.pathname === "/products/detail.php" && url.searchParams.has("jan_code"))
      || (url.hostname === "www.takaratomy-arts.co.jp" && url.pathname === "/items/item.html" && url.searchParams.has("n"))
    );
  } catch {
    return false;
  }
}

function canonicalOfficialUrl(value) {
  if (!isAllowedOfficialUrl(value)) return "";
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function seriesChanged(existing, incoming) {
  const expected = {
    name: incoming.name,
    brand: incoming.brand,
    category: incoming.category,
    release_month: incoming.release_month,
    release_week: incoming.release_week,
    release_date: incoming.release_date,
    price: incoming.price,
    image_url: incoming.image_url,
    official_url: incoming.official_url,
    is_released: incoming.released,
  };
  return Object.entries(expected).some(([key, value]) => comparable(existing?.[key]) !== comparable(value));
}

function variantChanged(existing, incoming, series) {
  const expected = {
    name: incoming.name,
    variant_type: incoming.variant_type || "normal",
    image: incoming.image || incoming.image_url || series.image_url,
    official_url: series.official_url,
    price: incoming.price ?? series.price,
    brand: incoming.brand || series.brand,
    release_month: incoming.release_month || series.release_month,
    release_week: incoming.release_week || series.release_week,
    release_date: incoming.release_date || series.release_date,
    released: incoming.released ?? series.released,
    source_type: "official_site",
    review_required: false,
  };
  return Object.entries(expected).some(([key, value]) => comparable(existing?.[key]) !== comparable(value));
}

function normalizeSources(value) {
  return asArray(value).map((source) => ({
    source: text(source.source),
    provider: text(source.provider),
    url: isPublicHttpsUrl(source.url) ? source.url : null,
    http_success: source.http_success === true,
    http_status: Number.isInteger(source.http_status) ? source.http_status : null,
    parser_success: source.parser_success === true,
    records: nonnegative(source.records),
    discovered_urls: nonnegative(source.discovered_urls),
    detail_attempts: nonnegative(source.detail_attempts),
    detail_successes: nonnegative(source.detail_successes),
    detail_failures: nonnegative(source.detail_failures),
    formal_lineups: nonnegative(source.formal_lineups),
    zero_lineups: nonnegative(source.zero_lineups),
    issue_codes: [...new Set(asArray(source.issue_codes).map(text).filter(Boolean))].sort(),
    freshness: {
      state: ["current", "stale", "unknown"].includes(source.freshness?.state) ? source.freshness.state : "unknown",
      latest_release_date: /^\d{4}-\d{2}-\d{2}$/.test(text(source.freshness?.latest_release_date)) ? source.freshness.latest_release_date : null,
      age_days: Number.isInteger(source.freshness?.age_days) ? source.freshness.age_days : null,
    },
  }));
}

function uniqueRecords(records) {
  const values = asArray(records).filter((record) => text(record?.id));
  return [...new Map(values.map((record) => [record.id, record])).values()]
    .sort((left, right) => text(left.id).localeCompare(text(right.id)));
}

function normalizeLimits(limits) {
  return {
    max_series_upserts: boundedInteger(limits?.max_series_upserts, 1, 4, OFFICIAL_READ_ONLY_PLAN_LIMITS.max_series_upserts),
    max_variant_upserts: boundedInteger(limits?.max_variant_upserts, 1, 40, OFFICIAL_READ_ONLY_PLAN_LIMITS.max_variant_upserts),
    max_restock_event_upserts: boundedInteger(limits?.max_restock_event_upserts, 0, 4, OFFICIAL_READ_ONLY_PLAN_LIMITS.max_restock_event_upserts),
    max_issues: boundedInteger(limits?.max_issues, 0, 8, OFFICIAL_READ_ONLY_PLAN_LIMITS.max_issues),
  };
}

function buildDatabaseDelta(before, after) {
  const left = normalizeCountSnapshot(before);
  const right = normalizeCountSnapshot(after);
  return Object.fromEntries(Object.keys(left).map((key) => [key, right[key] - left[key]]));
}

function snapshotsEqual(before, after) {
  return Object.values(buildDatabaseDelta(before, after)).every((value) => value === 0);
}

function normalizeCountSnapshot(value) {
  const input = value && typeof value === "object" ? value : {};
  return Object.fromEntries(["series", "variants", "restock_events", "import_issues", "review_required", "provisional_variants"]
    .map((key) => [key, nonnegative(input[key])]));
}

function isCompleteCountSnapshot(value) {
  return value && typeof value === "object"
    && ["series", "variants", "restock_events", "import_issues", "review_required", "provisional_variants"]
      .every((key) => Number.isInteger(value[key]) && value[key] >= 0);
}

function digestReport(report) {
  const clone = structuredClone(report);
  delete clone.canonical_digest;
  return `sha256:${createHash("sha256").update(JSON.stringify(clone)).digest("hex")}`;
}

function findForbiddenObjectKeys(value, path = "$") {
  if (Array.isArray(value)) return value.flatMap((entry, index) => findForbiddenObjectKeys(entry, `${path}[${index}]`));
  if (!value || typeof value !== "object") return [];
  const findings = [];
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:raw|raw_response|headers|cookies?|authorization|token|secret|password|api_key|application_id|access_key|service_role_key|seller)$/i.test(key)) {
      findings.push(`${path}.${key}`);
    }
    findings.push(...findForbiddenObjectKeys(child, `${path}.${key}`));
  }
  return findings;
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values.filter(Boolean)) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function groupBy(values, keyOf) {
  const grouped = new Map();
  for (const value of values) {
    const key = keyOf(value);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(value);
  }
  return grouped;
}

function isPublicHttpsUrl(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function validSha(value) {
  return /^[0-9a-f]{40}$/.test(text(value));
}

function comparable(value) {
  return value == null ? "" : String(value).trim();
}

function nonnegative(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function boundedInteger(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}
