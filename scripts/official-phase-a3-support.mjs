import { fetchOfficialRaw } from "../lib/fetchers/official-fetcher.js";
import {
  buildOfficialPhaseA3Plan,
  canonicalOfficialUrl,
  classifyOfficialPhaseA3Residuals,
} from "../lib/domain/official-phase-a3.js";
import { fetchRowCount, fetchRows } from "./supabase-rest.mjs";

export async function scanOfficialPhaseA3Residuals({ operationPrefix = "phase_a3", allowEmptyPlan = false } = {}) {
  const [knownDetailedRows, knownOfficialRecords] = await Promise.all([
    fetchRows("variants", {
      select: "id,series_id,series:series!inner(id,official_url)",
      params: { variant_type: "neq.provisional", order: "id.asc" },
      operationName: operationPrefix + ".known_detailed",
    }),
    fetchRows("series", {
      select: "id,name,official_url,release_date",
      params: { official_url: "not.is.null", order: "id.asc" },
      operationName: operationPrefix + ".series",
    }),
  ]);

  const knownDetailedOfficialUrls = [...new Set(
    knownDetailedRows.map((row) => canonicalOfficialUrl(row.series?.official_url)).filter(Boolean),
  )];
  const detailedSet = new Set(knownDetailedOfficialUrls);
  const priorityDetailUrls = knownOfficialRecords
    .map((row) => canonicalOfficialUrl(row.official_url))
    .filter((url) => url && !detailedSet.has(url));

  if (priorityDetailUrls.length > 7500) throw phaseA3Error("phase_a3_residual_limit_exceeded");
  const detailFetchLimit = Math.min(8000, Math.max(1000, priorityDetailUrls.length + 500));

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
    knownDetailedOfficialUrls,
    fetchedRecords: fetched.records,
  });
  const plan = buildOfficialPhaseA3Plan(classification, { allowEmpty: allowEmptyPlan });
  const priorityScanComplete = Number(fetched.detailFetched) >= priorityDetailUrls.length
    && classification.knownUndetailedRecords.length === priorityDetailUrls.length;

  if (!priorityScanComplete) throw phaseA3Error("phase_a3_incomplete_priority_scan");

  return {
    fetched,
    classification,
    plan,
    detailFetchLimit,
    knownPriorityUrls: priorityDetailUrls.length,
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
