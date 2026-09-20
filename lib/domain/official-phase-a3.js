import { partitionLegacyOfficialRecords } from "./official-upsert-safety.js";
import { officialCanonicalDigest } from "./official-apply-contract.js";

export const OFFICIAL_PHASE_A3_SCHEMA_VERSION = 1;
export const OFFICIAL_PHASE_A3_MAX_TARGET_SERIES = 2500;
export const OFFICIAL_PHASE_A3_MAX_VARIANTS = 20000;

export const OFFICIAL_PHASE_A3_VARIANT_COLUMNS = Object.freeze([
  "id", "slug", "series_id", "name", "variant_type", "rarity", "role", "image", "released",
  "price", "brand", "release_month", "release_week", "release_date", "official_url", "axes",
  "signals", "tags", "source_type", "review_required", "raw",
]);

const ALLOWED_PROVIDER_HOSTS = new Set([
  "gashapon.jp",
  "www.gashapon.jp",
  "takaratomy-arts.co.jp",
  "www.takaratomy-arts.co.jp",
]);

export function classifyOfficialPhaseA3Residuals({
  knownOfficialRecords,
  knownDetailedSeriesIds,
  fetchedRecords,
} = {}) {
  const detailedSeriesIds = new Set(asArray(knownDetailedSeriesIds).map(text).filter(Boolean));
  const knownByUrl = new Map();

  for (const record of asArray(knownOfficialRecords)) {
    const seriesId = text(record?.id || record?.series_id);
    const url = canonicalOfficialUrl(record?.official_url);
    if (!seriesId || !url || detailedSeriesIds.has(seriesId)) continue;
    if (knownByUrl.has(url)) throw phaseA3Error("phase_a3_duplicate_known_official_url");
    knownByUrl.set(url, record);
  }

  const parsedByUrl = new Map();
  for (const record of asArray(fetchedRecords)) {
    const url = canonicalOfficialUrl(record?.official_url);
    if (!url || !knownByUrl.has(url) || !asArray(record?.variants).length) continue;
    const expected = knownByUrl.get(url);
    const expectedId = text(expected?.id || expected?.series_id);
    const fetchedId = text(record?.id || record?.series_id);
    if (!expectedId || !fetchedId || expectedId !== fetchedId) {
      throw phaseA3Error("phase_a3_official_identity_mismatch");
    }
    parsedByUrl.set(url, record);
  }

  const parsedResidual = [...parsedByUrl.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([, record]) => record);
  const { safeRecords, blockedRecords } = partitionLegacyOfficialRecords(parsedResidual);
  const parsedUrls = new Set(parsedByUrl.keys());
  const unresolvedRecords = [...knownByUrl.entries()]
    .filter(([url]) => !parsedUrls.has(url))
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([, record]) => record);

  return {
    knownUndetailedRecords: [...knownByUrl.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([, record]) => record),
    safeRecords: sortRecordsByUrl(safeRecords),
    rereleaseRecords: sortRecordsByUrl(blockedRecords),
    unresolvedRecords,
  };
}

export function buildOfficialPhaseA3Plan(classification = {}, { allowEmpty = false } = {}) {
  const safeRecords = asArray(classification.safeRecords);
  if (!safeRecords.length && !allowEmpty) throw phaseA3Error("phase_a3_no_safe_records");
  if (safeRecords.length > OFFICIAL_PHASE_A3_MAX_TARGET_SERIES) {
    throw phaseA3Error("phase_a3_target_series_limit_exceeded");
  }

  const repartitioned = partitionLegacyOfficialRecords(safeRecords);
  if (repartitioned.blockedRecords.length) throw phaseA3Error("phase_a3_rerelease_leak");

  const targets = [];
  const variantRows = [];
  const seriesIds = new Set();
  const variantIds = new Set();
  const variantSlugs = new Set();

  for (const record of safeRecords) {
    const officialUrl = canonicalOfficialUrl(record?.official_url);
    if (!isAllowedOfficialPhaseA3Url(officialUrl)) {
      throw phaseA3Error("phase_a3_provider_not_allowed");
    }
    const seriesId = text(record?.id || record?.series_id);
    if (!seriesId || seriesIds.has(seriesId)) throw phaseA3Error("phase_a3_series_identity_invalid");
    seriesIds.add(seriesId);

    const variants = asArray(record?.variants);
    if (!variants.length) throw phaseA3Error("phase_a3_variant_payload_missing");
    targets.push({ series_id: seriesId, official_url: officialUrl });

    for (const variant of variants) {
      const row = buildOfficialPhaseA3VariantRow(variant, record);
      if (!row.id || !row.slug || !row.series_id || !row.name || row.series_id !== seriesId) {
        throw phaseA3Error("phase_a3_variant_identity_invalid");
      }
      if (row.variant_type === "provisional") throw phaseA3Error("phase_a3_provisional_variant_rejected");
      if (variantIds.has(row.id)) throw phaseA3Error("phase_a3_duplicate_variant_id");
      if (variantSlugs.has(row.slug)) throw phaseA3Error("phase_a3_duplicate_variant_slug");
      variantIds.add(row.id);
      variantSlugs.add(row.slug);
      variantRows.push(row);
    }
  }

  if (variantRows.length > OFFICIAL_PHASE_A3_MAX_VARIANTS) {
    throw phaseA3Error("phase_a3_variant_limit_exceeded");
  }

  targets.sort((left, right) => left.series_id.localeCompare(right.series_id, "en"));
  variantRows.sort((left, right) => left.id.localeCompare(right.id, "en"));

  const planDigest = officialCanonicalDigest({
    schema_version: OFFICIAL_PHASE_A3_SCHEMA_VERSION,
    targets,
    variants: variantRows,
  });

  return {
    schema_version: OFFICIAL_PHASE_A3_SCHEMA_VERSION,
    plan_digest: planDigest,
    target_series: targets.length,
    target_variants: variantRows.length,
    targets,
    variant_rows: variantRows,
  };
}

export function buildOfficialPhaseA3VariantRow(raw = {}, series = {}) {
  const seriesId = text(series?.series_id || series?.id || series?.slug);
  const seriesSlug = text(series?.slug || series?.series_slug || series?.id);
  const name = text(raw?.name || raw?.title || raw?.variant_name);
  const image = text(
    raw?.image || raw?.image_url || raw?.imageUrl || raw?.product_image || raw?.thumbnail
      || series?.image || series?.image_url || series?.imageUrl || series?.product_image || series?.thumbnail
  );
  const seriesReleaseDate = nullableText(series?.release_date || series?.releaseDate);
  const releaseDate = nullableText(raw?.release_date || raw?.releaseDate || seriesReleaseDate);
  const seriesPrice = numeric(series?.price || series?.price_yen || series?.priceYen);
  const price = numeric(raw?.price || raw?.price_yen || raw?.priceYen) ?? seriesPrice;
  const seriesBrand = text(series?.brand || series?.maker || series?.manufacturer);

  return {
    id: text(raw?.id || raw?.variant_id || (seriesId + "-" + slugify(name || "variant"))),
    slug: text(raw?.slug || (seriesSlug + "-" + slugify(name || "variant"))),
    series_id: seriesId,
    name,
    variant_type: text(raw?.variant_type || raw?.type) || "normal",
    rarity: text(raw?.rarity) || "通常",
    role: text(raw?.role) || "単品",
    image,
    released: resolveReleased(raw?.release_date || seriesReleaseDate, raw?.released ?? resolveReleased(seriesReleaseDate, series?.is_released ?? series?.released)),
    price,
    brand: text(raw?.brand || seriesBrand),
    release_month: normalizeMonth(raw?.release_month || raw?.month || raw?.releaseMonth || series?.release_month || series?.month || series?.releaseMonth),
    release_week: normalizeWeek(raw?.release_week || raw?.week || raw?.releaseWeek || series?.release_week || series?.week || series?.releaseWeek),
    release_date: releaseDate,
    official_url: text(raw?.official_url || raw?.url || series?.official_url || series?.url || series?.product_url),
    axes: raw?.axes || raw?.forecast_axes || raw?.forecastAxes || {},
    signals: raw?.signals || {},
    tags: Array.isArray(raw?.tags) ? raw.tags.map(text).filter(Boolean) : [],
    source_type: "official_site",
    review_required: !name,
    raw: raw && typeof raw === "object" ? raw : {},
  };
}

export function assertOfficialPhaseA3Expectation(snapshot, expected = {}) {
  const digest = text(expected.plan_digest);
  if (digest && snapshot?.plan?.plan_digest !== digest) throw phaseA3Error("phase_a3_plan_digest_mismatch");

  for (const [field, expectedValue] of [
    ["known_undetailed", expected.known_undetailed],
    ["safe_records", expected.safe_records],
    ["safe_variants", expected.safe_variants],
    ["rerelease_records", expected.rerelease_records],
    ["unresolved_records", expected.unresolved_records],
  ]) {
    if (expectedValue == null || expectedValue === "") continue;
    const parsed = Number(expectedValue);
    if (!Number.isInteger(parsed) || parsed < 0) throw phaseA3Error("phase_a3_expectation_invalid");
    if (Number(snapshot?.counts?.[field]) !== parsed) throw phaseA3Error("phase_a3_expectation_mismatch");
  }
  return snapshot;
}

export function buildOfficialPhaseA3Snapshot({
  classification,
  plan,
  scan,
  databaseBefore,
  databaseAfter,
  workflow = {},
} = {}) {
  const before = normalizeCounts(databaseBefore);
  const after = normalizeCounts(databaseAfter);
  const delta = Object.fromEntries(Object.keys(before).map((key) => [key, after[key] - before[key]]));
  const databaseStable = Object.values(delta).every((value) => value === 0);
  const counts = {
    known_undetailed: asArray(classification?.knownUndetailedRecords).length,
    safe_records: asArray(classification?.safeRecords).length,
    safe_variants: Number(plan?.target_variants || 0),
    rerelease_records: asArray(classification?.rereleaseRecords).length,
    unresolved_records: asArray(classification?.unresolvedRecords).length,
  };

  return {
    schema_version: OFFICIAL_PHASE_A3_SCHEMA_VERSION,
    report_type: "official_phase_a3_preflight",
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
      detail_fetch_limit: nonNegativeInt(scan?.detail_fetch_limit),
      detail_fetched: nonNegativeInt(scan?.detail_fetched),
      known_priority_urls: nonNegativeInt(scan?.known_priority_urls),
      held_shared_detailed_urls: nonNegativeInt(scan?.held_shared_detailed_urls),
      held_unsupported_provider_urls: nonNegativeInt(scan?.held_unsupported_provider_urls),
      priority_scan_complete: Boolean(scan?.priority_scan_complete),
      fetch_issues: nonNegativeInt(scan?.fetch_issues),
    },
    counts,
    providers: {
      safe_records: providerCounts(classification?.safeRecords),
      rerelease_records: providerCounts(classification?.rereleaseRecords),
      unresolved_records: providerCounts(classification?.unresolvedRecords),
    },
    plan: {
      plan_digest: text(plan?.plan_digest),
      target_series: nonNegativeInt(plan?.target_series),
      target_variants: nonNegativeInt(plan?.target_variants),
      writes: nonNegativeInt(plan?.target_variants),
      series_writes: 0,
      restock_event_writes: 0,
      import_issue_writes: 0,
      deletes: 0,
    },
    database: { before, after, delta },
    final_verdict: databaseStable && scan?.priority_scan_complete
      ? "OFFICIAL_PHASE_A3_PREFLIGHT_READY"
      : "OFFICIAL_PHASE_A3_PREFLIGHT_BLOCKED",
  };
}

export function validateOfficialPhaseA3Snapshot(report) {
  if (report?.schema_version !== OFFICIAL_PHASE_A3_SCHEMA_VERSION
    || report?.report_type !== "official_phase_a3_preflight") {
    throw phaseA3Error("phase_a3_preflight_schema_invalid");
  }
  if (report?.execution?.mode !== "read-only" || report?.execution?.writes_allowed !== false
    || report?.execution?.deletes_allowed !== false || report?.execution?.cleanup_enabled !== false) {
    throw phaseA3Error("phase_a3_preflight_not_read_only");
  }
  if (report?.final_verdict !== "OFFICIAL_PHASE_A3_PREFLIGHT_READY") {
    throw phaseA3Error("phase_a3_preflight_not_ready");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(text(report?.plan?.plan_digest))) {
    throw phaseA3Error("phase_a3_plan_digest_invalid");
  }
  if (report?.plan?.series_writes !== 0 || report?.plan?.restock_event_writes !== 0
    || report?.plan?.import_issue_writes !== 0 || report?.plan?.deletes !== 0) {
    throw phaseA3Error("phase_a3_preflight_write_scope_invalid");
  }
  return report;
}

export function formatOfficialPhaseA3SnapshotMarkdown(report) {
  return [
    "# Official Phase A3 preflight",
    "",
    "- Verdict: " + report.final_verdict,
    "- Head SHA: " + (report.workflow.head_sha || "none"),
    "- Plan digest: " + report.plan.plan_digest,
    "- Known undetailed: " + report.counts.known_undetailed,
    "- Safe non-rerelease records: " + report.counts.safe_records,
    "- Planned variant inserts: " + report.counts.safe_variants,
    "- Rerelease records held for Phase B: " + report.counts.rerelease_records,
    "- Unresolved records: " + report.counts.unresolved_records,
    "- Priority URLs fetched: " + report.scan.known_priority_urls,
    "- Held shared-detailed URLs: " + report.scan.held_shared_detailed_urls,
    "- Held unsupported-provider URLs: " + report.scan.held_unsupported_provider_urls,
    "- Priority scan complete: " + report.scan.priority_scan_complete,
    "- Database delta: " + JSON.stringify(report.database.delta),
    "- Series writes: 0",
    "- Restock-event writes: 0",
    "- Import-issue writes: 0",
    "- Deletes: 0",
    "",
  ].join("\n");
}

export function canonicalOfficialUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export function isAllowedOfficialPhaseA3Url(value) {
  const canonical = canonicalOfficialUrl(value);
  if (!canonical) return false;
  const url = new URL(canonical);
  return url.protocol === "https:" && ALLOWED_PROVIDER_HOSTS.has(url.hostname.toLowerCase());
}

function resolveReleased(releaseDate, fallback) {
  const parsed = Date.parse(String(releaseDate || ""));
  if (Number.isFinite(parsed)) return parsed <= Date.now();
  return Boolean(fallback);
}

function normalizeMonth(value) {
  const raw = text(value);
  if (!raw) return "";
  const matched = raw.match(/(\d{1,2})/);
  return matched ? String(Number(matched[1])) + "月" : raw;
}

function normalizeWeek(value) {
  const raw = text(value);
  if (!raw) return "";
  if (raw.includes("未定")) return "未定";
  const matched = raw.match(/([1-5１２３４５])/);
  if (!matched) return raw;
  const map = { "１": "1", "２": "2", "３": "3", "４": "4", "５": "5" };
  return "第" + (map[matched[1]] || matched[1]) + "週";
}

function nullableText(value) {
  return text(value) || null;
}

function numeric(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff-]+/gi, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "item";
}

function sortRecordsByUrl(records) {
  return [...asArray(records)].sort((left, right) =>
    canonicalOfficialUrl(left?.official_url).localeCompare(canonicalOfficialUrl(right?.official_url), "en"));
}

function providerCounts(records) {
  const counts = { gashapon: 0, takaratomy: 0, other: 0 };
  for (const record of asArray(records)) {
    const url = canonicalOfficialUrl(record?.official_url);
    if (url.includes("gashapon.jp/")) counts.gashapon += 1;
    else if (url.includes("takaratomy-arts.co.jp/")) counts.takaratomy += 1;
    else counts.other += 1;
  }
  return counts;
}

function normalizeCounts(value) {
  const input = value && typeof value === "object" ? value : {};
  return Object.fromEntries([
    "series",
    "variants",
    "provisional_variants",
    "restock_events",
    "import_issues",
  ].map((key) => [key, nonNegativeInt(input[key])]));
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

function phaseA3Error(reasonCode) {
  const error = new Error(reasonCode);
  error.reason_code = reasonCode;
  return error;
}
