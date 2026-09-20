import { fetchOfficialRaw } from "../lib/fetchers/official-fetcher.js";
import {
  buildOfficialPhaseA3Plan,
  canonicalOfficialUrl,
  classifyOfficialPhaseA3Residuals,
  isAllowedOfficialPhaseA3Url,
} from "../lib/domain/official-phase-a3.js";
import { fetchRowCount, fetchRows } from "./supabase-rest.mjs";

export async function scanOfficialPhaseA3Residuals({ operationPrefix = "phase_a3", allowEmptyPlan = false } = {}) {
  const [allVariantRows, knownOfficialRecords] = await Promise.all([
    fetchRows("variants", {
      select: "id,slug,series_id,variant_type,series:series!inner(id,official_url)",
      params: { order: "id.asc" },
      operationName: operationPrefix + ".all_variant_identities",
    }),
    fetchRows("series", {
      select: "id,name,official_url,release_date",
      params: { official_url: "not.is.null", order: "id.asc" },
      operationName: operationPrefix + ".series",
    }),
  ]);

  const realVariantRows = allVariantRows.filter((row) => row.variant_type !== "provisional");
  const knownDetailedSeriesIds = [...new Set(
    realVariantRows.map((row) => String(row.series_id || row.series?.id || "").trim()).filter(Boolean),
  )];
  const detailedSeriesIdSet = new Set(knownDetailedSeriesIds);
  const knownDetailedOfficialUrls = [...new Set(
    realVariantRows.map((row) => canonicalOfficialUrl(row.series?.official_url)).filter(Boolean),
  )];
  const detailedUrlSet = new Set(knownDetailedOfficialUrls);
  const knownUndetailedRecords = knownOfficialRecords.filter(
    (row) => !detailedSeriesIdSet.has(String(row.id || "").trim()),
  );
  const heldSharedDetailedUrls = knownUndetailedRecords.filter(
    (row) => detailedUrlSet.has(canonicalOfficialUrl(row.official_url)),
  ).length;
  const heldUnsupportedProviderUrls = knownUndetailedRecords.filter(
    (row) => !isAllowedOfficialPhaseA3Url(row.official_url),
  ).length;
  const priorityDetailUrls = knownUndetailedRecords
    .map((row) => canonicalOfficialUrl(row.official_url))
    .filter((url) => url && !detailedUrlSet.has(url) && isAllowedOfficialPhaseA3Url(url));

  if (priorityDetailUrls.length > 7500) throw phaseA3Error("phase_a3_residual_limit_exceeded");
  const detailFetchLimit = priorityDetailUrls.length;

  const fetched = await fetchOfficialRaw({
    urls: [
      "https://gashapon.jp/schedule/",
      "https://gashapon.jp/products/",
      "https://www.takaratomy-arts.co.jp/items/gacha/search.html?order=release&p=1&sort=0",
    ],
    previousRecords: [],
    detailCursor: 0,
    sourceCursors: {},
    knownDetailedOfficialUrls,
    knownOfficialRecords,
    priorityDetailUrls,
    detailFetchLimit,
    detailFetchDelayMs: 200,
    sourceFetchDelayMs: 200,
    takaratomyPagesPerRun: 8,
    schedulePastMonths: 6,
    scheduleFutureMonths: 6,
  });

  const classification = classifyOfficialPhaseA3Residuals({
    knownOfficialRecords,
    knownDetailedSeriesIds,
    fetchedRecords: fetched.records,
  });
  const plan = buildOfficialPhaseA3Plan(classification, { allowEmpty: allowEmptyPlan });
  const existingVariantIds = new Set(allVariantRows.map((row) => String(row.id || "").trim()).filter(Boolean));
  const existingVariantSlugs = new Set(allVariantRows.map((row) => String(row.slug || "").trim()).filter(Boolean));
  if (plan.variant_rows.some((row) => existingVariantIds.has(row.id))) {
    throw phaseA3Error("phase_a3_preflight_existing_variant_id_collision");
  }
  if (plan.variant_rows.some((row) => existingVariantSlugs.has(row.slug))) {
    throw phaseA3Error("phase_a3_preflight_existing_variant_slug_collision");
  }

  const priorityScanComplete = Number(fetched.priorityDetails) === priorityDetailUrls.length
    && Number(fetched.detailFetched) === priorityDetailUrls.length;

  if (!priorityScanComplete) throw phaseA3Error("phase_a3_incomplete_priority_scan");

  return {
    fetched,
    classification,
    plan,
    detailFetchLimit,
    knownPriorityUrls: priorityDetailUrls.length,
    heldSharedDetailedUrls,
    heldUnsupportedProviderUrls,
    priorityScanComplete,
  };
}

export async function captureOfficialPhaseA3Counts() {
  return {
    series: await fetchRowCount("series"),
    variants: await fetchRowCount("variants"),
    provisional_variants: await fetchRowCount("variants", { variant_type: "eq.provisional" }),
    restock_events: await fetchRowCount("restock_events"),
    import_issues: await fetchRowCount("import_issues"),
  };
}

export function officialPhaseA3DatabaseDelta(before = {}, after = {}) {
  return Object.fromEntries([
    "series",
    "variants",
    "provisional_variants",
    "restock_events",
    "import_issues",
  ].map((key) => [key, Number(after[key] || 0) - Number(before[key] || 0)]));
}

function phaseA3Error(reasonCode) {
  const error = new Error(reasonCode);
  error.reason_code = reasonCode;
  return error;
}
