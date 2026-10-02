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
  const exposedQualiaMonths = qualiaRoot.ok ? parseQualiaMonthNavigation(qualiaRoot.body).length : 0;
  const exposedQualiaCategories = qualiaRoot.ok ? parseQualiaCategoryNavigation(qualiaRoot.body).length : 0;
  const reservedQualiaDiscoveryRequests = exposedQualiaMonths + (qualiaRoot.ok ? (exposedQualiaCategories || QUALIA_CATEGORY_FALLBACK.length) : 0);

  const kitan = await auditKitan({ root: kitanRoot, targetMonth, fetchImpl, limits, budget, retrievalPlane, now, reservedQualiaDiscoveryRequests });
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
      preflight_reserved_qualia_discovery_requests: reservedQualiaDiscoveryRequests,
    },
    database_writes: 0,
    provider_mutations: 0,
    f0_activations: 0,
    production_integration_enabled: false,
    completeness_known: kitan.completeness_known && qualia.completeness_known,
    blocking_reasons: [...new Set([...kitan.blocking_reasons, ...qualia.blocking_reasons])].sort(),
  };
}

async function auditKitan({ root, targetMonth, fetchImpl, limits, budget, retrievalPlane, now, reservedQualiaDiscoveryRequests = 0 }) {
  const started = now().toISOString();
  const blockers = [];
  const surfaces = [];
  if (!root.ok) blockers.push(root.issue_code || "kitan_root_fetch_failed");
  const years = root.ok ? parseKitanYearNavigation(root.body) : [];
  const currentRootProducts = root.ok ? parseKitanProductLinks(root.body) : [];
  if (root.ok) surfaces.push(surfaceSnapshot("current_root", KITAN_ROOT, root.body, currentRootProducts.length, retrievalPlane, now().toISOString()));
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
    surfaces.push(surfaceSnapshot(`archive:${archive.year}`, archive.url, page.body, products.length, retrievalPlane, now().toISOString()));
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
  const canClassify = budget.actual + plannedDetails + reservedQualiaDiscoveryRequests <= limits.global_hard_cap;
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
      reserved_qualia_discovery_requests: reservedQualiaDiscoveryRequests,
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
  if (root.ok) surfaces.push(surfaceSnapshot("current_root", QUALIA_ROOT, root.body, rootProducts.length, retrievalPlane, now().toISOString()));
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
    surfaces.push(surfaceSnapshot(`month:${archive.month}`, archive.url, page.body, products.length, retrievalPlane, now().toISOString()));
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
      if (categoryPagesVisited >= limits.category_page_hard_cap || budget.actual >= limits.global_hard_cap) {
        categoryExhausted = false;
        blockers.push("qualia_category_page_cap_reached");
        queue.length = 0;
        break;
      }
      seen.add(url);
      const page = await requestText(url, { fetchImpl, limits, budget, kind: "qualia_category" });
      if (!page.ok) { categoryExhausted = false; blockers.push("qualia_category_page_fetch_failed"); continue; }
      categoryPagesVisited += 1;
      const products = parseQualiaProductLinks(page.body, url);
      surfaces.push(surfaceSnapshot(`category:${category.category_id}:page:${categoryPageNumber(url)}`, url, page.body, products.length, retrievalPlane, now().toISOString()));
      for (const product of products) mergeQualiaMembership(productMap, product, { category: category.category_id });
      const pages = parseQualiaCategoryPagination(page.body, url, category.category_id);
      const newlyDiscovered = pages.filter((pageUrl) => !seen.has(pageUrl) && !queue.includes(pageUrl));
      categoryPagesDiscovered += newlyDiscovered.length;
      planRequests(budget, "qualia_category", newlyDiscovered.length);
      for (const pageUrl of newlyDiscovered) queue.push(pageUrl);
    }
  }

  const union = [...productMap.values()].sort((a, b) => Number(a.source_product_id) - Number(b.source_product_id));
  const detailCandidates = union.filter((record) => record.membership.month_archives.length === 0);
  const detailCandidateIds = new Set(detailCandidates.map((record) => record.source_product_id));
  const plannedDetails = detailCandidates.length;
  planRequests(budget, "qualia_detail", plannedDetails);
  const canClassifyAll = categoryExhausted && budget.actual + plannedDetails <= limits.global_hard_cap;
  if (!canClassifyAll) blockers.push("request_cap_would_be_exceeded:qualia_union_detail_classification");

  const records = [];
  if (canClassifyAll) {
    for (const product of union) {
      if (!detailCandidateIds.has(product.source_product_id)) {
        records.push({ ...product, ...classifyQualiaRecord({ archiveMonths: product.membership.month_archives, targetMonth }) });
        continue;
      }
      const detail = await requestText(product.official_url, { fetchImpl, limits, budget, kind: "qualia_detail" });
      if (!detail.ok) {
        const classification = classifyQualiaRecord({ archiveMonths: product.membership.month_archives, targetMonth, rejected: true });
        records.push({ ...product, ...classification });
        blockers.push("qualia_detail_fetch_or_parse_failed");
        continue;
      }
      const evidence = parseDetailReleaseEvidence(detail.body);
      records.push({ ...product, ...classifyQualiaRecord({ archiveMonths: product.membership.month_archives, targetMonth, detailReleaseMonth: evidence.detail_release_month, detailReleaseDate: evidence.detail_release_date }) });
    }
  } else {
    for (const product of union) {
      const classification = classifyQualiaRecord({ archiveMonths: product.membership.month_archives, targetMonth });
      records.push({ ...product, ...classification });
    }
  }

  const unresolved = records.filter((record) => record.classification === "undated");
  const rejected = records.filter((record) => record.classification === "rejected");
  if (unresolved.length) blockers.push("qualia_unclassified_root_or_category_records");
  if (rejected.length) blockers.push("qualia_rejected_records");
  if (monthArchivesVisited !== months.length) blockers.push("qualia_unvisited_month_archive");
  if (!categoryExhausted) blockers.push("qualia_unvisited_category_page");

  const monthIds = new Set(union.filter((r) => r.membership.month_archives.length).map((r) => r.source_product_id));
  const rootIds = new Set(rootProducts.map((r) => r.source_product_id));
  const categoryIds = new Set(union.filter((r) => r.membership.categories.length).map((r) => r.source_product_id));
  return buildProviderManifest({
    provider: "qualia",
    started,
    completed: now().toISOString(),
    sourceUrl: QUALIA_ROOT,
    retrievalPlane,
    sourceSurfaces: surfaces,
    recordsDiscovered: surfaces.reduce((sum, item) => sum + item.records_discovered, 0),
    canonicalUniqueRecords: union.length,
    duplicateRecords: Math.max(0, surfaces.reduce((sum, item) => sum + item.records_discovered, 0) - union.length),
    pagesDiscovered: months.length + categoryPagesDiscovered,
    pagesVisited: monthArchivesVisited + categoryPagesVisited,
    terminationReason: blockers.length ? "fail_closed" : "official_navigation_and_categories_exhausted",
    exhaustionProven: monthArchivesVisited === months.length && categoryExhausted && !blockers.some((reason) => /navigation_not_discovered|page_fetch_failed|archive_fetch_failed|unvisited/.test(reason)),
    records,
    blockers,
    providerSpecific: {
      month_archives: months.map((entry) => entry.month),
      newest_exposed_month: months.at(-1)?.month || null,
      target_month_archives: targetArchives.map((entry) => entry.month),
      duplicate_month_links: root.ok ? countQualiaDuplicateMonthLinks(root.body) : 0,
      archive_count: months.length,
      category_discovery_mode: categoryDiscoveryMode,
      category_contract_reason: categoryDiscoveryMode === "reviewed_contract_fallback" ? "existing reviewed site contract defines category classes 12..19 when root HTML omits numeric category hrefs" : null,
      category_fail_closed_conditions: categoryDiscoveryMode === "reviewed_contract_fallback" ? ["any_reviewed_category_fetch_fails", "pagination_not_exhausted", "discovered_category_id_outside_reviewed_contract"] : [],
      categories: categories.map((entry) => entry.category_id),
      category_pages_discovered: categoryPagesDiscovered,
      category_pages_visited: categoryPagesVisited,
      root_count: rootIds.size,
      month_archive_unique_count: monthIds.size,
      category_unique_count: categoryIds.size,
      union_count: union.length,
      root_month_intersection_count: [...rootIds].filter((id) => monthIds.has(id)).length,
      root_only_count: [...rootIds].filter((id) => !monthIds.has(id) && !categoryIds.has(id)).length,
      category_only_count: [...categoryIds].filter((id) => !rootIds.has(id) && !monthIds.has(id)).length,
      formal_lineup: { source_url: QUALIA_LINEUP_ROOT, required_for_product_universe: false, completeness_known: null, status: "separate_contract_not_fetched" },
    },
  });
}

function buildProviderManifest({ provider, started, completed, sourceUrl, retrievalPlane, sourceSurfaces, recordsDiscovered, canonicalUniqueRecords, duplicateRecords, pagesDiscovered, pagesVisited, terminationReason, exhaustionProven, records, blockers, providerSpecific }) {
  const releaseKnown = records.filter((r) => r.detail_release_month).length;
  const archiveMonthKnown = records.filter((r) => r.archive_month || r.archive_year).length;
  const undated = records.filter((r) => r.classification === "undated").length;
  const target = records.filter((r) => r.classification === "target_period").length;
  const unknown = records.filter((r) => r.classification === "undated" || r.classification === "rejected").length;
  const blockingReasons = [...new Set(blockers)].sort();
  const completenessKnown = exhaustionProven && unknown === 0 && blockingReasons.length === 0;
  return {
    provider,
    snapshot_started_at: started,
    snapshot_completed_at: completed,
    source_surfaces: sourceSurfaces,
    retrieval_plane: retrievalPlane,
    source_url: sourceUrl,
    content_identity: sha256(sourceSurfaces.map((surface) => `${surface.source_url}:${surface.content_identity}`).sort().join("\n")),
    records_discovered: recordsDiscovered,
    canonical_unique_records: canonicalUniqueRecords,
    duplicate_records: duplicateRecords,
    pages_or_archives_discovered: pagesDiscovered,
    pages_or_archives_visited: pagesVisited,
    termination_reason: terminationReason,
    exhaustion_proven: exhaustionProven,
    release_month_known: releaseKnown,
    release_month_unknown: Math.max(0, records.length - releaseKnown),
    archive_month_known: archiveMonthKnown,
    detail_release_month_known: releaseKnown,
    undated_count: undated,
    target_period_count: target,
    target_period_unknown_count: unknown,
    completeness_known: completenessKnown,
    blocking_reasons: blockingReasons,
    database_writes: 0,
    records,
    ...providerSpecific,
  };
}

function mergeQualiaMembership(map, product, { month = null, category = null } = {}) {
  const current = map.get(product.source_product_id) || { ...product, membership: { root: false, month_archives: [], categories: [], lineup: false } };
  if (month) current.membership.month_archives = [...new Set([...current.membership.month_archives, month])].sort();
  if (category !== null) current.membership.categories = [...new Set([...current.membership.categories, Number(category)])].sort((a, b) => a - b);
  map.set(product.source_product_id, current);
}

function surfaceSnapshot(surface, sourceUrl, body, recordsDiscovered, retrievalPlane, capturedAt) {
  return { surface, captured_at: capturedAt || new Date().toISOString(), retrieval_plane: retrievalPlane, source_url: sourceUrl, content_identity: sha256(String(body || "")), records_discovered: Number(recordsDiscovered || 0) };
}

async function requestText(url, { fetchImpl, limits, budget, kind = "other" }) {
  let attempts = 0;
  while (attempts <= limits.retry_limit) {
    if (budget.actual >= limits.global_hard_cap) { budget.capExceeded = true; return { ok: false, issue_code: "official_universe_request_cap_exceeded", attempts }; }
    attempts += 1;
    budget.actual += 1;
    budget.actual_by_kind[kind] = (budget.actual_by_kind[kind] || 0) + 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limits.request_timeout_ms);
    try {
      const response = await fetchImpl(url, { headers: { accept: "text/html;q=0.9, */*;q=0.8", "user-agent": "GachaLensBot/0.1 (+read-only-official-source-universe-audit)" }, signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) return { ok: true, body: await response.text(), attempts };
      if (response.status !== 429 && response.status < 500) return { ok: false, issue_code: "official_universe_fetch_http_error", attempts };
    } catch {
      clearTimeout(timer);
    }
    if (attempts <= limits.retry_limit && limits.request_delay_ms > 0) await sleep(limits.request_delay_ms);
  }
  return { ok: false, issue_code: "official_universe_fetch_network_or_rate_limit", attempts };
}

function normalizeLimits(options) {
  return {
    global_hard_cap: bounded(options.globalHardCap, 20, 200, OFFICIAL_SOURCE_UNIVERSE_AUDIT_LIMITS.global_hard_cap),
    request_timeout_ms: bounded(options.requestTimeoutMs, 1_000, 60_000, OFFICIAL_SOURCE_UNIVERSE_AUDIT_LIMITS.request_timeout_ms),
    retry_limit: bounded(options.retryLimit, 0, 2, OFFICIAL_SOURCE_UNIVERSE_AUDIT_LIMITS.retry_limit),
    request_delay_ms: bounded(options.requestDelayMs, 0, 5_000, OFFICIAL_SOURCE_UNIVERSE_AUDIT_LIMITS.request_delay_ms),
    category_page_hard_cap: bounded(options.categoryPageHardCap, 8, 100, OFFICIAL_SOURCE_UNIVERSE_AUDIT_LIMITS.category_page_hard_cap),
  };
}

function createBudget(cap) { return { cap, actual: 0, planned: 0, planned_by_kind: { kitan_list: 0, kitan_archive: 0, kitan_detail: 0, qualia_root: 0, qualia_month_archive: 0, qualia_category: 0, qualia_detail: 0, lineup: 0 }, actual_by_kind: { kitan_list: 0, kitan_archive: 0, kitan_detail: 0, qualia_root: 0, qualia_month_archive: 0, qualia_category: 0, qualia_detail: 0, lineup: 0 }, capExceeded: false }; }
function planRequests(budget, kind, count) { const n = Math.max(0, Number(count || 0)); budget.planned += n; budget.planned_by_kind[kind] = (budget.planned_by_kind[kind] || 0) + n; }
function normalizeTargetMonth(value) { const raw = String(value || "").trim(); if (!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(raw)) throw new Error("targetMonth must be YYYY-MM"); return raw; }
function canonicalKitanArchiveUrl(value, base, year) { try { const url = new URL(value, base); if (url.protocol !== "https:" || url.hostname !== "kitan.jp" || url.search || url.hash || url.pathname !== `/product_age/${year}/`) return null; return url.toString(); } catch { return null; } }
function canonicalKitanProductUrl(value, base) { try { const url = new URL(value, base); url.hash = ""; url.search = ""; if (url.protocol !== "https:" || url.hostname !== "kitan.jp" || !/^\/products\/[^/]+\/$/.test(url.pathname)) return null; return url.toString(); } catch { return null; } }
function canonicalQualiaMonthUrl(value, base, month) { try { const url = new URL(value, base); url.hostname = "www.qualia-45.jp"; if (url.protocol !== "https:" || !/^\/product\/search\/ym:20\d{2}-(?:0[1-9]|1[0-2])$/.test(url.pathname) || !url.pathname.endsWith(month)) return null; url.hash = ""; url.search = "?target=product"; return url.toString(); } catch { return null; } }
function canonicalQualiaProductUrl(value, base, id) { try { const url = new URL(value, base); if (url.protocol !== "https:" || !["qualia-45.jp", "www.qualia-45.jp"].includes(url.hostname) || url.pathname.replace(/\/$/, "") !== `/product/view/${id}`) return null; url.hostname = "www.qualia-45.jp"; url.search = ""; url.hash = ""; url.pathname = `/product/view/${id}`; return url.toString(); } catch { return null; } }
function canonicalQualiaCategoryUrl(value, base, id) { try { const url = new URL(value, base); if (url.protocol !== "https:" || !["qualia-45.jp", "www.qualia-45.jp"].includes(url.hostname) || !new RegExp(`^/product/index/${id}/?$`).test(url.pathname)) return null; url.hostname = "www.qualia-45.jp"; url.pathname = `/product/index/${id}`; url.search = "?target=product"; url.hash = ""; return url.toString(); } catch { return null; } }
function canonicalQualiaCategoryPageUrl(value, base, id, page) { try { const url = new URL(value, base); if (url.protocol !== "https:" || !["qualia-45.jp", "www.qualia-45.jp"].includes(url.hostname)) return null; const slashPage = url.pathname.match(new RegExp(`^/product/index/${id}/page/(\\d+)/?$`)); const colonPage = url.pathname.match(new RegExp(`^/product/index/${id}/page:(\\d+)/?$`)); const queryPage = new RegExp(`^/product/index/${id}/?$`).test(url.pathname) ? Number(url.searchParams.get("page")) : 0; const resolved = Number(slashPage?.[1] || colonPage?.[1] || queryPage || page || 1); if (!Number.isInteger(resolved) || resolved < 1) return null; url.hostname = "www.qualia-45.jp"; if (colonPage) url.pathname = `/product/index/${id}/page:${resolved}`; else if (slashPage) url.pathname = `/product/index/${id}/page/${resolved}`; else url.pathname = `/product/index/${id}`; const params = new URLSearchParams(); params.set("target", "product"); if (!slashPage && !colonPage && resolved > 1) params.set("page", String(resolved)); url.search = `?${params.toString()}`; url.hash = ""; return url.toString(); } catch { return null; } }
function categoryPageNumber(url) { const parsed = new URL(url); return Number(parsed.pathname.match(/\/page[/:](\d+)/)?.[1] || parsed.searchParams.get("page") || 1); }
function sha256(value) { return `sha256:${crypto.createHash("sha256").update(String(value || "")).digest("hex")}`; }
function uniqueBy(values, key) { const map = new Map(); for (const value of values) if (!map.has(key(value))) map.set(key(value), value); return [...map.values()]; }
function cleanText(value) { return String(value || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#(x[\da-f]+|\d+);/gi, (_m, entity) => { const n = entity[0].toLowerCase() === "x" ? Number.parseInt(entity.slice(1), 16) : Number.parseInt(entity, 10); try { return String.fromCodePoint(n); } catch { return _m; } }).replace(/\s+/g, " ").trim(); }
function bounded(value, min, max, fallback) { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
