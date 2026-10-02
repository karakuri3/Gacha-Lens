import crypto from "node:crypto";

const KITAN_ROOT = "https://kitan.jp/products/";
const QUALIA_ROOT = "https://www.qualia-45.jp/product.html";
const QUALIA_LINEUP_ROOT = "https://www.qualia-45.jp/distinations/";
const QUALIA_CATEGORY_FALLBACK = Object.freeze(Array.from({ length: 8 }, (_, index) => 12 + index));

export const OFFICIAL_SOURCE_UNIVERSE_AUDIT_LIMITS = Object.freeze({
  global_hard_cap: 150,
  request_timeout_ms: 15_000,
  retry_limit: 1,
  request_delay_ms: 750,
  category_page_hard_cap: 64,
});

export function parseKitanYearNavigation(body, baseUrl = KITAN_ROOT) {
  const byYear = new Map();
  for (const match of String(body || "").matchAll(/href=["']([^"']*\/product_age\/(20\d{2})\/[^"']*)["']/gi)) {
    const url = canonicalKitanArchiveUrl(match[1], baseUrl, match[2]);
    if (url && !byYear.has(match[2])) byYear.set(match[2], { year: match[2], url });
  }
  return [...byYear.values()].sort((a, b) => a.year.localeCompare(b.year));
}

export function parseKitanProductLinks(body, baseUrl = KITAN_ROOT) {
  const found = [];
  for (const match of String(body || "").matchAll(/href=["']([^"']*\/products\/[^"'#?]+\/?)["']/gi)) {
    const url = canonicalKitanProductUrl(match[1], baseUrl);
    if (url) found.push({ source_product_id: new URL(url).pathname.split("/").filter(Boolean).at(-1), official_url: url });
  }
  return uniqueBy(found, (item) => item.official_url).sort((a, b) => a.official_url.localeCompare(b.official_url));
}

export function parseQualiaMonthNavigation(body, baseUrl = QUALIA_ROOT) {
  const byMonth = new Map();
  for (const match of String(body || "").matchAll(/href=["']([^"']*\/product\/search\/ym:(20\d{2}-(?:0[1-9]|1[0-2]))[^"']*)["']/gi)) {
    const url = canonicalQualiaMonthUrl(match[1], baseUrl, match[2]);
    if (url && !byMonth.has(match[2])) byMonth.set(match[2], { month: match[2], url });
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function countQualiaDuplicateMonthLinks(body, baseUrl = QUALIA_ROOT) {
  const valid = [];
  for (const match of String(body || "").matchAll(/href=["']([^"']*\/product\/search\/ym:(20\d{2}-(?:0[1-9]|1[0-2]))[^"']*)["']/gi)) {
    if (canonicalQualiaMonthUrl(match[1], baseUrl, match[2])) valid.push(match[2]);
  }
  return Math.max(0, valid.length - new Set(valid).size);
}

export function parseQualiaCategoryNavigation(body, baseUrl = QUALIA_ROOT) {
  const byId = new Map();
  for (const match of String(body || "").matchAll(/href=["']([^"']*\/product\/index\/(\d+)[^"']*)["']/gi)) {
    const url = canonicalQualiaCategoryUrl(match[1], baseUrl, match[2]);
    if (url && !byId.has(match[2])) byId.set(match[2], { category_id: Number(match[2]), url });
  }
  return [...byId.values()].sort((a, b) => a.category_id - b.category_id);
}

export function parseQualiaCategoryPagination(body, baseUrl, categoryId) {
  const urls = new Set([canonicalQualiaCategoryUrl(baseUrl, baseUrl, String(categoryId))].filter(Boolean));
  const html = String(body || "");
  const patterns = [
    /href=["']([^"']*\/product\/index\/(\d+)\/page\/(\d+)\/?[^"']*)["']/gi,
    /href=["']([^"']*\/product\/index\/(\d+)\/page:(\d+)\/?[^"']*)["']/gi,
    /href=["']([^"']*\/product\/index\/(\d+)[^"']*[?&]page=(\d+)[^"']*)["']/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      if (Number(match[2]) !== Number(categoryId)) continue;
      const url = canonicalQualiaCategoryPageUrl(match[1], baseUrl, categoryId, Number(match[3]));
      if (url) urls.add(url);
    }
  }
  return [...urls].sort((a, b) => categoryPageNumber(a) - categoryPageNumber(b));
}

export function parseQualiaProductLinks(body, baseUrl = QUALIA_ROOT) {
  const found = [];
  for (const match of String(body || "").matchAll(/href=["']([^"']*\/product\/view\/(\d+)\/?[^"'#]*)["']/gi)) {
    const url = canonicalQualiaProductUrl(match[1], baseUrl, match[2]);
    if (url) found.push({ source_product_id: match[2], official_url: url });
  }
  return uniqueBy(found, (item) => item.source_product_id).sort((a, b) => Number(a.source_product_id) - Number(b.source_product_id));
}

export function parseDetailReleaseEvidence(body) {
  const text = cleanText(body);
  const date = text.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  const month = text.match(/(20\d{2})年\s*(\d{1,2})月/);
  return {
    detail_release_date: date ? `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}` : null,
    detail_release_month: month ? `${month[1]}-${month[2].padStart(2, "0")}` : null,
  };
}

export function classifyKitanRecord({ archiveYear, detailReleaseMonth, detailReleaseDate = null, targetMonth, rejected = false }) {
  const normalizedTarget = normalizeTargetMonth(targetMonth);
  const year = archiveYear === null || archiveYear === undefined ? null : String(archiveYear);
  if (rejected) return { classification: "rejected", classification_source: "detail_fetch_or_parse", archive_year: year, detail_release_month: null, detail_release_date: null };
  if (year && year > normalizedTarget.slice(0, 4)) return { classification: "target_period", classification_source: "archive_year", archive_year: year, detail_release_month: detailReleaseMonth || null, detail_release_date: detailReleaseDate || null };
  if (detailReleaseMonth) return { classification: detailReleaseMonth >= normalizedTarget ? "target_period" : "before_target", classification_source: "detail_release_month", archive_year: year, detail_release_month: detailReleaseMonth, detail_release_date: detailReleaseDate || null };
  return { classification: "undated", classification_source: "none", archive_year: year, detail_release_month: null, detail_release_date: null };
}

export function classifyQualiaRecord({ archiveMonths = [], detailReleaseMonth = null, detailReleaseDate = null, targetMonth, rejected = false }) {
  const normalizedTarget = normalizeTargetMonth(targetMonth);
  const months = [...new Set(archiveMonths.filter(Boolean))].sort();
  if (rejected) return { classification: "rejected", classification_source: "detail_fetch_or_parse", archive_month: months.at(-1) || null, detail_release_month: null, detail_release_date: null };
  const targetArchive = months.find((month) => month >= normalizedTarget);
  if (targetArchive) return { classification: "target_period", classification_source: "archive_month", archive_month: targetArchive, detail_release_month: detailReleaseMonth, detail_release_date: detailReleaseDate };
  if (detailReleaseMonth) return { classification: detailReleaseMonth >= normalizedTarget ? "target_period" : "before_target", classification_source: "detail_release_month", archive_month: months.at(-1) || null, detail_release_month: detailReleaseMonth, detail_release_date: detailReleaseDate };
  if (months.length) return { classification: months.at(-1) >= normalizedTarget ? "target_period" : "before_target", classification_source: "archive_month", archive_month: months.at(-1), detail_release_month: null, detail_release_date: null };
  return { classification: "undated", classification_source: "none", archive_month: null, detail_release_month: null, detail_release_date: null };
}

export async function fetchOfficialSourceUniverseAudit(options = {}) {
  const targetMonth = normalizeTargetMonth(options.targetMonth || "2026-10");
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || (() => new Date());
  const limits = normalizeLimits(options);
  const retrievalPlane = String(options.retrievalPlane || "node_fetch");
  const budget = createBudget(limits.global_hard_cap);
  const snapshotStartedAt = now().toISOString();

  planRequests(budget, "kitan_list", 1);
  planRequests(budget, "qualia_root", 1);
  const kitanRoot = await requestText(KITAN_ROOT, { fetchImpl, limits, budget, kind: "kitan_list" });
  const qualiaRoot = await requestText(QUALIA_ROOT, { fetchImpl, limits, budget, kind: "qualia_root" });

  const kitan = await auditKitan({ root: kitanRoot, targetMonth, fetchImpl, limits, budget, retrievalPlane, now });
  const qualia = await auditQualia({ root: qualiaRoot, targetMonth, fetchImpl, limits, budget, retrievalPlane, now });

  const snapshotCompletedAt = now().toISOString();
  return {
    schema_version: 1,
    contract: "official-source-universe-audit",
    target_period: `${targetMonth}+`,
    snapshot_started_at: snapshotStartedAt,
    snapshot_completed_at: snapshotCompletedAt,
    retrieval_plane: retrievalPlane,
    providers: [kitan, qualia],
    request_budget: {
      global_hard_cap: limits.global_hard_cap,
      actual_attempts: budget.actual,
      expected_requests: { ...budget.planned_by_kind, total: budget.planned },
      retry_ceiling_if_every_planned_request_retries: Math.min(limits.global_hard_cap, budget.planned * (limits.retry_limit + 1)),
      actual_requests: { ...budget.actual_by_kind, total: budget.actual },
      planned_requests: budget.planned,
      remaining: Math.max(0, limits.global_hard_cap - budget.actual),
      cap_exceeded: budget.capExceeded,
    },
    database_writes: 0,
    provider_mutations: 0,
    f0_activations: 0,
    production_integration_enabled: false,
    completeness_known: kitan.completeness_known && qualia.completeness_known,
    blocking_reasons: [...new Set([...kitan.blocking_reasons, ...qualia.blocking_reasons])].sort(),
  };
}

async function auditKitan({ root, targetMonth, fetchImpl, limits, budget, retrievalPlane, now }) {
  const started = now().toISOString();
  const blockers = [];
  const surfaces = [];
  if (!root.ok) blockers.push(root.issue_code || "kitan_root_fetch_failed");
  const years = root.ok ? parseKitanYearNavigation(root.body) : [];
  const currentRootProducts = root.ok ? parseKitanProductLinks(root.body) : [];
  if (root.ok) surfaces.push(surfaceSnapshot("current_root", KITAN_ROOT, root.body, currentRootProducts.length, retrievalPlane));
  if (!years.length) blockers.push("kitan_year_navigation_not_discovered");

  const targetYear = targetMonth.slice(0, 4);
  const selectedYears = years.filter((entry) => entry.year >= targetYear);
  if (!selectedYears.some((entry) => entry.year === targetYear)) blockers.push("kitan_target_year_archive_not_exposed");
  const archiveProducts = new Map();
  let archivesVisited = 0;
  planRequests(budget, "kitan_archive", selectedYears.length);
  for (const archive of selectedYears) {
    const page = await requestText(archive.url, { fetchImpl, limits, budget, kind: "kitan_archive" });
    if (!page.ok) { blockers.push("kitan_archive_fetch_failed"); continue; }
    archivesVisited += 1;
    const products = parseKitanProductLinks(page.body, archive.url);
    surfaces.push(surfaceSnapshot(`archive:${archive.year}`, archive.url, page.body, products.length, retrievalPlane));
    for (const product of products) {
      const current = archiveProducts.get(product.official_url) || { ...product, archive_years: [] };
      current.archive_years = [...new Set([...current.archive_years, archive.year])].sort();
      archiveProducts.set(product.official_url, current);
    }
  }

  const archiveUrls = new Set(archiveProducts.keys());
  const rootUrls = new Set(currentRootProducts.map((item) => item.official_url));
  const rootOnlyProducts = currentRootProducts.filter((product) => !archiveUrls.has(product.official_url));
  const targetYearProducts = [...archiveProducts.values()].filter((record) => record.archive_years.includes(targetYear));
  const futureYearProducts = [...archiveProducts.values()].filter((record) => record.archive_years.some((year) => year > targetYear) && !record.archive_years.includes(targetYear));
  const detailCandidates = uniqueBy([...targetYearProducts, ...rootOnlyProducts], (record) => record.official_url);
  const plannedDetails = detailCandidates.length;
  planRequests(budget, "kitan_detail", plannedDetails);
  const canClassify = budget.actual + plannedDetails <= limits.global_hard_cap;
  if (!canClassify) blockers.push("request_cap_would_be_exceeded:kitan_detail_classification");

  const records = [];
  if (canClassify) {
    for (const product of detailCandidates) {
      const inTargetArchive = product.archive_years?.includes(targetYear) === true;
      const detail = await requestText(product.official_url, { fetchImpl, limits, budget, kind: "kitan_detail" });
      if (!detail.ok) {
        records.push({ ...product, ...classifyKitanRecord({ archiveYear: inTargetArchive ? targetYear : null, targetMonth, rejected: true }) });
        blockers.push("kitan_detail_fetch_or_parse_failed");
        continue;
      }
      const evidence = parseDetailReleaseEvidence(detail.body);
      records.push({ ...product, ...classifyKitanRecord({ archiveYear: inTargetArchive ? targetYear : null, targetMonth, detailReleaseMonth: evidence.detail_release_month, detailReleaseDate: evidence.detail_release_date }) });
    }
  } else {
    for (const product of detailCandidates) records.push({ ...product, archive_year: product.archive_years?.includes(targetYear) ? targetYear : null, classification: "undated", classification_source: "budget_not_executed", detail_release_month: null, detail_release_date: null });
  }
  for (const product of futureYearProducts) {
    const archiveYear = product.archive_years.find((year) => year > targetYear);
    records.push({ ...product, ...classifyKitanRecord({ archiveYear, targetMonth, detailReleaseMonth: null }) });
  }

  const rootOnly = rootOnlyProducts.map((product) => product.official_url);
  if (archivesVisited !== selectedYears.length) blockers.push("kitan_unvisited_discovered_archive");
  const undated = records.filter((record) => record.classification === "undated");
  const rejected = records.filter((record) => record.classification === "rejected");
  if (undated.length) blockers.push("kitan_target_year_undated_records");
  if (rejected.length) blockers.push("kitan_rejected_records");

  const uniqueCount = new Set([...archiveUrls, ...rootUrls]).size;
  return buildProviderManifest({
    provider: "kitan_club",
    started,
    completed: now().toISOString(),
    sourceUrl: KITAN_ROOT,
    retrievalPlane,
    sourceSurfaces: surfaces,
    recordsDiscovered: [...surfaces].reduce((sum, item) => sum + item.records_discovered, 0),
    canonicalUniqueRecords: uniqueCount,
    duplicateRecords: Math.max(0, [...surfaces].reduce((sum, item) => sum + item.records_discovered, 0) - new Set([...rootUrls, ...archiveUrls]).size),
    pagesDiscovered: selectedYears.length,
    pagesVisited: archivesVisited,
    terminationReason: blockers.length ? "fail_closed" : "official_navigation_exhausted",
    exhaustionProven: blockers.filter((reason) => reason.includes("navigation") || reason.includes("unvisited") || reason.includes("archive_fetch")).length === 0,
    records,
    blockers,
    providerSpecific: {
      dynamic_archive_years: years.map((entry) => entry.year),
      newest_discovered_year: years.at(-1)?.year || null,
      navigation_archive_end: years.at(-1)?.year || null,
      target_archive_years: selectedYears.map((entry) => entry.year),
      target_year_archive_count: targetYearProducts.length,
      current_root_count: currentRootProducts.length,
      root_archive_intersection_count: [...rootUrls].filter((url) => archiveUrls.has(url)).length,
      root_only_count: rootOnly.length,
      archive_only_count: [...archiveUrls].filter((url) => !rootUrls.has(url)).length,
      all_target_year_records_classified: canClassify && records.filter((record) => record.archive_years?.includes(targetYear)).length === targetYearProducts.length,
    },
  });
}

async function auditQualia({ root, targetMonth, fetchImpl, limits, budget, retrievalPlane, now }) {
  const started = now().toISOString();
  const blockers = [];
  const surfaces = [];
  if (!root.ok) blockers.push(root.issue_code || "qualia_root_fetch_failed");
  const months = root.ok ? parseQualiaMonthNavigation(root.body) : [];
  const rootProducts = root.ok ? parseQualiaProductLinks(root.body) : [];
  if (root.ok) surfaces.push(surfaceSnapshot("current_root", QUALIA_ROOT, root.body, rootProducts.length, retrievalPlane));
  if (!months.length) blockers.push("qualia_month_navigation_not_discovered");

  const targetArchives = months.filter((entry) => entry.month >= targetMonth);
  if (!targetArchives.length) blockers.push("qualia_target_month_archive_not_exposed");
  const productMap = new Map();
  for (const product of rootProducts) productMap.set(product.source_product_id, { ...product, membership: { root: true, month_archives: [], categories: [], lineup: false } });
  let monthArchivesVisited = 0;
  planRequests(budget, "qualia_month_archive", months.length);
  for (const archive of months) {
    const page = await requestText(archive.url, { fetchImpl, limits, budget, kind: "qualia_month_archive" });
    if (!page.ok) { blockers.push("qualia_month_archive_fetch_failed"); continue; }
    monthArchivesVisited += 1;
    const products = parseQualiaProductLinks(page.body, archive.url);
    surfaces.push(surfaceSnapshot(`month:${archive.month}`, archive.url, page.body, products.length, retrievalPlane));
    for (const product of products) mergeQualiaMembership(productMap, product, { month: archive.month });
  }

  let categories = root.ok ? parseQualiaCategoryNavigation(root.body) : [];
  let categoryDiscoveryMode = "root_navigation";
  if (!categories.length && root.ok) {
    categories = QUALIA_CATEGORY_FALLBACK.map((id) => ({ category_id: id, url: `https://www.qualia-45.jp/product/index/${id}?target=product` }));
    categoryDiscoveryMode = "reviewed_contract_fallback";
  }

  let categoryPagesVisited = 0;
  let categoryPagesDiscovered = categories.length;
  planRequests(budget, "qualia_category", categories.length);
  let categoryExhausted = true;
  for (const category of categories) {
    const queue = [category.url];
    const seen = new Set();
    while (queue.length) {
      const url = queue.shift();
      if (seen.has(url)) continue;
      if (categoryPagesVisited >= limits.c