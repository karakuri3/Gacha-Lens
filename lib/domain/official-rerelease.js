import { createHash } from "node:crypto";

export const OFFICIAL_RERELEASE_REASON = "official_rerelease_evidence";

export function parseOfficialRereleaseEvidence(value) {
  const evidenceText = normalizeEvidenceText(value);
  const marker = /(?:この商品は)?\s*再販商品(?:です)?/i.test(evidenceText);
  if (!marker) return null;

  const original = evidenceText.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月(?:頃)?\s*(?:に)?\s*発売(?:した|された)商品と同じ(?:もの)?/i);
  const year = Number(original?.[1]);
  const month = Number(original?.[2]);
  const validOriginal = Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12;

  return {
    is_rerelease: true,
    evidence_source: "gashapon_detail_note",
    evidence_text: excerptAroundRerelease(evidenceText),
    original_release: validOriginal ? {
      year,
      month,
      release_date: null,
      release_month: `${month}月`,
      release_week: "未定",
      precision: "month",
    } : null,
  };
}

export function mergeOfficialRecordEvidence(previous = {}, incoming = {}) {
  const previousVariants = asArray(previous.variants);
  const incomingVariants = asArray(incoming.variants);
  const previousRerelease = normalizeRereleaseEvidence(previous.raw?.rerelease);
  const incomingRerelease = normalizeRereleaseEvidence(incoming.raw?.rerelease);
  const previousIsRerelease = isOfficialRereleaseRecord(previous);
  const incomingIsRerelease = isOfficialRereleaseRecord(incoming);
  const currentSchedule = firstSchedule(
    incomingRerelease?.current_schedule,
    incoming.raw?.is_restock ? incoming.raw?.schedule : null,
    previousRerelease?.current_schedule,
    previous.raw?.is_restock ? previous.raw?.schedule : null,
  );
  const originalRelease = incomingRerelease?.original_release
    || previousRerelease?.original_release
    || (!previousIsRerelease ? releaseFromRecord(previous) : null);
  const rerelease = previousIsRerelease || incomingIsRerelease ? {
    is_rerelease: true,
    signals: uniqueText([
      ...asArray(previousRerelease?.signals),
      ...asArray(incomingRerelease?.signals),
      ...(previous.raw?.is_restock || incoming.raw?.is_restock ? ["schedule_restock_badge"] : []),
      ...(previousRerelease?.evidence_source || incomingRerelease?.evidence_source ? ["detail_rerelease_note"] : []),
    ]),
    current_schedule: currentSchedule,
    original_release: originalRelease,
    evidence_source: incomingRerelease?.evidence_source || previousRerelease?.evidence_source || (currentSchedule ? "gashapon_schedule_badge" : null),
    evidence_text: incomingRerelease?.evidence_text || previousRerelease?.evidence_text || null,
    source_parser: incoming.raw?.parser || previous.raw?.parser || null,
  } : null;
  const merged = {
    ...previous,
    ...incoming,
    variants: incomingVariants.length ? incomingVariants : previousVariants,
    raw: {
      ...(previous.raw || {}),
      ...(incoming.raw || {}),
      ...(rerelease ? { rerelease } : {}),
    },
  };

  if (!rerelease) return merged;
  const canonical = originalRelease || (!previousIsRerelease ? releaseFromRecord(previous) : null);
  return {
    ...merged,
    release_date: canonical?.release_date || "",
    release_month: canonical?.release_month || "",
    release_week: canonical?.release_week || "",
    released: canonical ? true : Boolean(previous.released && !previousIsRerelease),
    raw: {
      ...merged.raw,
      rerelease: { ...rerelease, canonical_release: canonical },
    },
  };
}

export function applyOfficialDetailRereleaseEvidence(record, evidence, currentSchedule) {
  if (!evidence?.is_rerelease) return record;
  return mergeOfficialRecordEvidence({}, {
    ...record,
    raw: {
      ...(record.raw || {}),
      rerelease: {
        ...evidence,
        current_schedule: normalizeSchedule(currentSchedule),
        source_parser: record.raw?.parser || "gashapon_detail_page",
      },
    },
  });
}

export function isOfficialRereleaseRecord(record) {
  return record?.raw?.is_restock === true || record?.raw?.rerelease?.is_rerelease === true;
}

export function resolveCanonicalOfficialRelease(record, existingSeries = null) {
  if (!isOfficialRereleaseRecord(record)) {
    return { ok: true, source: "current_official_release", record, canonical: releaseFromRecord(record) };
  }

  const existingCanonical = releaseFromRecord(existingSeries);
  const evidenceCanonical = normalizeOriginalRelease(record?.raw?.rerelease?.original_release);
  const canonical = hasStoredCanonicalRelease(existingCanonical) ? existingCanonical : evidenceCanonical;
  if (!hasStoredCanonicalRelease(canonical)) {
    return {
      ok: false,
      source: "unresolved",
      blocker: "rerelease_canonical_release_unresolved",
      record: null,
      canonical: null,
    };
  }

  const source = hasStoredCanonicalRelease(existingCanonical) ? "existing_catalog" : "official_original_release_evidence";
  return {
    ok: true,
    source,
    canonical,
    record: {
      ...record,
      release_date: canonical.release_date || "",
      release_month: canonical.release_month || "",
      release_week: canonical.release_week || "",
      released: true,
      raw: {
        ...(record.raw || {}),
        rerelease: {
          ...(record.raw?.rerelease || {}),
          canonical_release: canonical,
          canonical_source: source,
        },
      },
    },
  };
}

export function buildOfficialRereleaseEvent({ record, series, observedAt } = {}) {
  if (!isOfficialRereleaseRecord(record)) return { event: null, blocker: null };
  const canonical = resolveCanonicalOfficialRelease(record, series);
  if (!canonical.ok) return { event: null, blocker: canonical.blocker };

  const schedule = firstSchedule(record?.raw?.rerelease?.current_schedule, record?.raw?.schedule);
  if (!schedule || (!schedule.release_date && !schedule.release_month)) {
    return { event: null, blocker: "rerelease_schedule_unresolved" };
  }
  const seriesId = text(series?.id || record?.id);
  const sourceUrl = text(record?.official_url || series?.official_url);
  if (!seriesId || !isPublicHttpsUrl(sourceUrl)) return { event: null, blocker: "rerelease_identity_unresolved" };

  const eventKey = [seriesId, schedule.year || "", schedule.release_date || "", schedule.release_month || "", schedule.release_week || "", sourceUrl].join("|");
  const id = `official-rerelease-${createHash("sha256").update(eventKey).digest("hex").slice(0, 24)}`;
  const confirmedAt = validIso(observedAt) || new Date().toISOString();
  const original = canonical.canonical;
  const evidence = {
    canonical_release: original,
    canonical_source: canonical.source,
    rerelease_schedule: schedule,
    source_evidence: {
      source: text(record?.raw?.rerelease?.evidence_source) || (record?.raw?.is_restock ? "gashapon_schedule_badge" : "official_rerelease"),
      text: text(record?.raw?.rerelease?.evidence_text) || null,
    },
    source_parser: text(record?.raw?.rerelease?.source_parser || record?.raw?.parser) || null,
    observed_at: confirmedAt,
    schedule_precision: schedule.precision,
    original_precision: original?.precision || releasePrecision(original),
  };
  return {
    blocker: null,
    event: {
      id,
      variant_id: null,
      matched_variant_id: null,
      series_id: seriesId,
      source_type: "official_site",
      source_weight: 1,
      event_type: "restock",
      event_label: "再販",
      classification_reason: OFFICIAL_RERELEASE_REASON,
      classification_keywords: ["再販商品"],
      text: `${text(series?.name || record?.name)} 公式再販`,
      region: "",
      shop_name: "",
      source_url: sourceUrl,
      reported_at: confirmedAt,
      confidence: 1,
      review_required: false,
      raw: evidence,
    },
  };
}

export function officialRereleaseEventChanged(existing, expected) {
  if (!existing) return true;
  const scalarKeys = [
    "variant_id", "matched_variant_id", "series_id", "source_type", "source_weight", "event_type",
    "event_label", "classification_reason", "text", "region", "shop_name", "source_url", "confidence", "review_required",
  ];
  if (scalarKeys.some((key) => comparable(existing[key]) !== comparable(expected[key]))) return true;
  if (JSON.stringify(sortedText(existing.classification_keywords)) !== JSON.stringify(sortedText(expected.classification_keywords))) return true;
  return JSON.stringify(stableEventEvidence(existing.raw)) !== JSON.stringify(stableEventEvidence(expected.raw));
}

export function sanitizeOfficialRereleaseEvent(event, operation) {
  if (!event) return null;
  return {
    id: event.id,
    series_id: event.series_id,
    variant_id: null,
    matched_variant_id: null,
    operation,
    source_type: event.source_type,
    source_weight: event.source_weight,
    event_type: event.event_type,
    event_label: event.event_label,
    classification_reason: event.classification_reason,
    source_url: event.source_url,
    confidence: event.confidence,
    review_required: event.review_required,
    evidence: stableEventEvidence(event.raw),
  };
}

function stableEventEvidence(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    canonical_release: normalizeOriginalRelease(input.canonical_release),
    canonical_source: text(input.canonical_source) || null,
    rerelease_schedule: normalizeSchedule(input.rerelease_schedule),
    source_evidence: {
      source: text(input.source_evidence?.source) || null,
      text: text(input.source_evidence?.text) || null,
    },
    source_parser: text(input.source_parser) || null,
    schedule_precision: text(input.schedule_precision) || null,
    original_precision: text(input.original_precision) || null,
  };
}

function normalizeRereleaseEvidence(value) {
  if (!value?.is_rerelease) return null;
  return {
    is_rerelease: true,
    signals: uniqueText(value.signals),
    current_schedule: normalizeSchedule(value.current_schedule),
    original_release: normalizeOriginalRelease(value.original_release),
    evidence_source: text(value.evidence_source) || null,
    evidence_text: text(value.evidence_text) || null,
    source_parser: text(value.source_parser) || null,
  };
}

function releaseFromRecord(value) {
  if (!value) return null;
  const releaseDate = /^\d{4}-\d{2}-\d{2}$/.test(text(value.release_date)) ? text(value.release_date) : null;
  const releaseMonth = normalizeMonth(value.release_month) || (releaseDate ? `${Number(releaseDate.slice(5, 7))}月` : null);
  const releaseWeek = text(value.release_week) || (releaseDate ? null : "未定");
  if (!releaseDate && !releaseMonth) return null;
  return {
    year: releaseDate ? Number(releaseDate.slice(0, 4)) : numberOrNull(value.year),
    month: releaseDate ? Number(releaseDate.slice(5, 7)) : monthNumber(releaseMonth),
    release_date: releaseDate,
    release_month: releaseMonth,
    release_week: releaseWeek,
    precision: releaseDate ? "day" : "month",
  };
}

function normalizeOriginalRelease(value) {
  if (!value) return null;
  const releaseDate = /^\d{4}-\d{2}-\d{2}$/.test(text(value.release_date)) ? text(value.release_date) : null;
  const year = releaseDate ? Number(releaseDate.slice(0, 4)) : numberOrNull(value.year);
  const month = releaseDate ? Number(releaseDate.slice(5, 7)) : numberOrNull(value.month) || monthNumber(value.release_month);
  if (!year || !month || month < 1 || month > 12) return null;
  return {
    year,
    month,
    release_date: releaseDate,
    release_month: `${month}月`,
    release_week: releaseDate ? (text(value.release_week) || null) : "未定",
    precision: releaseDate ? "day" : "month",
  };
}

function firstSchedule(...values) {
  for (const value of values) {
    const schedule = normalizeSchedule(value);
    if (schedule && (schedule.release_date || schedule.release_month)) return schedule;
  }
  return null;
}

function normalizeSchedule(value) {
  if (!value) return null;
  let releaseDate = /^\d{4}-\d{2}-\d{2}$/.test(text(value.release_date)) ? text(value.release_date) : null;
  const year = releaseDate ? Number(releaseDate.slice(0, 4)) : numberOrNull(value.release_year || value.year);
  const releaseWeek = text(value.release_week) || null;
  if (releaseWeek && releaseDate?.endsWith("-01")) releaseDate = null;
  const releaseMonth = normalizeMonth(value.release_month) || (releaseDate ? `${Number(releaseDate.slice(5, 7))}月` : null);
  if (!releaseDate && !releaseMonth) return null;
  return {
    year,
    release_date: releaseDate,
    release_month: releaseMonth,
    release_week: releaseWeek,
    precision: releaseDate ? "day" : (releaseWeek ? "week" : "month"),
  };
}

function hasStoredCanonicalRelease(value) {
  return Boolean(value?.release_date || value?.release_month || value?.release_week);
}

function releasePrecision(value) {
  return value?.release_date ? "day" : value?.release_month ? "month" : null;
}

function normalizeEvidenceText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function excerptAroundRerelease(value) {
  const index = value.search(/再販商品/i);
  if (index < 0) return value.slice(0, 240);
  return value.slice(Math.max(0, index - 20), index + 220).trim();
}

function normalizeMonth(value) {
  const match = text(value).match(/(\d{1,2})/);
  if (!match) return null;
  const month = Number(match[1]);
  return month >= 1 && month <= 12 ? `${month}月` : null;
}

function monthNumber(value) {
  const match = text(value).match(/(\d{1,2})/);
  return match ? Number(match[1]) : null;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function uniqueText(values) {
  return [...new Set(asArray(values).map(text).filter(Boolean))].sort();
}

function sortedText(values) {
  return asArray(values).map(text).filter(Boolean).sort();
}

function validIso(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function isPublicHttpsUrl(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function comparable(value) {
  if (value == null) return "";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}
