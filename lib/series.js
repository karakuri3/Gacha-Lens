import {
  DB_TABLES,
  LISTING_TYPE_LABELS,
  LISTING_TYPES,
  SOURCE_WEIGHTS,
} from "./domain/gacha-schema";
import { calculateUpcomingVariantForecast, deriveOfficialForecastAxes } from "./domain/forecast-score";
import { buildListingGroups, buildMarketSummary } from "./domain/market-summary";
import { buildAvailabilitySummary } from "./domain/stock-summary";
import { buildCirculationScore, buildTrendSummary } from "./domain/trend-summary";
import {
  buildLineupPublicationState,
  isPublicVariant,
  signalIsPublic,
} from "./domain/variant-publication";
import {
  normalizeMarketListing,
  normalizeRestockEvent,
  normalizeStockReport,
  normalizeXReaction,
} from "./domain/source-normalizers";
import {
  mockMarketListings,
  mockRestockEvents,
  mockSeries,
  mockStockReports,
  mockVariants,
  mockXReactions,
} from "./data/mock-gacha-records";
import {
  collectReviewQueue,
  createStaticGachaDataSource,
  EMPTY_GACHA_RECORDS,
  normalizeRecordShape,
} from "./data/gacha-repository";
import {
  resolveDataSource,
  runDataSourceOperation,
} from "./data/data-source-policy";
import { createRepositoryRecords } from "./data/ingestion-adapters";
import { createOfficialFirstRecords, hasOfficialInput } from "./data/official-data-source";
import {
  createSupabaseGachaDataSource,
  fetchSupabaseCategoryCatalog,
  fetchSupabaseCatalogCounts,
  fetchSupabaseCatalogPage,
  fetchSupabaseCatalogSeries,
  fetchSupabaseCatalogVariant,
  fetchSupabaseParentSeriesCatalogPage,
  fetchSupabasePublicVariantIdentifiers,
  fetchSupabaseReleasedSignalCatalog,
  fetchSupabaseReleasedSeriesSignalCatalog,
} from "./data/supabase-gacha-repository";
import {
  hasServiceRoleSupabaseConfig as hasSupabaseConfig,
  serviceRoleSupabase as supabase,
} from "./supabase/service-role-client";
import { unstable_cache } from "next/cache";

const PUBLIC_CACHE_SECONDS = 120;
const CATALOG_CACHE_SECONDS = 300;

const loadCachedCatalogPage = unstable_cache(
  async (options) => {
    const result = await fetchSupabaseCatalogPage(supabase, options);
    return {
      items: createGachaRepository(result.records).listVariants(),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  },
  ["gacha-catalog-page-v2"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: ["gacha-public-catalog"] }
);

const loadCachedCatalogCounts = unstable_cache(
  async () => fetchSupabaseCatalogCounts(supabase),
  ["gacha-catalog-counts-v2"],
  { revalidate: CATALOG_CACHE_SECONDS, tags: ["gacha-public-counts"] }
);

const loadCachedParentSeriesPage = unstable_cache(
  async (options) => fetchSupabaseParentSeriesCatalogPage(supabase, options),
  ["gacha-parent-series-page-v1"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: ["gacha-public-catalog"] }
);

const loadCachedCategoryCatalog = unstable_cache(
  async () => fetchSupabaseCategoryCatalog(supabase),
  ["gacha-category-catalog-v1"],
  { revalidate: CATALOG_CACHE_SECONDS, tags: ["gacha-public-catalog"] }
);

const loadCachedReleasedRanking = unstable_cache(
  async () => fetchSupabaseReleasedSignalCatalog(supabase),
  ["gacha-released-ranking-v2"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: ["gacha-public-ranking"] }
);

const loadCachedUpcomingRanking = unstable_cache(
  async () => {
    const firstResult = await fetchSupabaseCatalogPage(supabase, { filter: "upcoming", page: 1, pageSize: 120 });
    const first = {
      items: createGachaRepository(firstResult.records).listVariants(),
      total: firstResult.total,
      page: firstResult.page,
      pageSize: firstResult.pageSize,
    };
    const pageCount = Math.min(3, Math.ceil(first.total / first.pageSize));
    const remainingResults = await Promise.all(
      Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
        fetchSupabaseCatalogPage(supabase, { filter: "upcoming", page: index + 2, pageSize: 120 })
      )
    );
    const remaining = remainingResults.map((result) => ({
      items: createGachaRepository(result.records).listVariants(),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    }));
    return [...new Map([first, ...remaining].flatMap((page) => page.items).map((item) => [item.variant_id, item])).values()];
  },
  ["gacha-upcoming-ranking-v2"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: ["gacha-public-ranking"] }
);

const loadCachedReleasedSeriesRanking = unstable_cache(
  async () => fetchSupabaseReleasedSeriesSignalCatalog(supabase),
  ["gacha-released-series-ranking-v1"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: ["gacha-public-ranking"] }
);

const loadCachedUpcomingSeriesRanking = unstable_cache(
  async () => {
    const result = await fetchSupabaseParentSeriesCatalogPage(supabase, { filter: "upcoming", page: 1, pageSize: 120 });
    return result.records;
  },
  ["gacha-upcoming-series-ranking-v1"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: ["gacha-public-ranking"] }
);

const loadCachedVariant = unstable_cache(
  async (slug) => {
    const records = await fetchSupabaseCatalogVariant(supabase, slug);
    return records ? createGachaRepository(records).findVariantBySlug(slug) : null;
  },
  ["gacha-catalog-variant-v2"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: ["gacha-public-variant"] }
);

const loadCachedParentSeries = unstable_cache(
  async (slug) => {
    const records = await fetchSupabaseCatalogSeries(supabase, slug);
    return records ? createGachaRepository(records).findParentSeriesBySlug(slug) : null;
  },
  ["gacha-parent-series-detail-v1"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: ["gacha-public-series"] }
);

let repositoryPromise;
let repositoryLoadedAt = 0;
let repositoryCacheKey = "";
let adminDataModelPromise;
let adminDataModelLoadedAt = 0;

export async function getSeriesList() {
  return (await getRepository()).listVariants();
}

export async function getSeriesCatalogPage(options = {}) {
  if (!shouldUseSupabaseRecords()) {
    const variants = (await getRepository()).listVariants();
    return { items: variants, total: variants.length, page: 1, pageSize: variants.length };
  }
  return runDataSourceOperation("catalog-page", () => loadCachedCatalogPage(normalizeCatalogOptions(options)));
}

export async function getParentSeriesCatalogPage(options = {}) {
  if (!shouldUseSupabaseRecords()) {
    const items = (await getRepository()).listParentSeries();
    return { items, total: items.length, page: 1, pageSize: items.length };
  }
  const result = await runDataSourceOperation(
    "parent-series-page",
    () => loadCachedParentSeriesPage(normalizeCatalogOptions(options))
  );
  return {
    items: createGachaRepository(result.records).listParentSeries(),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

export async function getSeriesCatalogCounts() {
  if (!shouldUseSupabaseRecords()) return null;
  return runDataSourceOperation("catalog-counts", () => loadCachedCatalogCounts());
}

export async function getCategoryCatalog() {
  if (shouldUseSupabaseRecords()) {
    return runDataSourceOperation("category-catalog", () => loadCachedCategoryCatalog());
  }
  const categories = new Map();
  for (const item of (await getRepository()).listVariants()) {
    const name = String(item.category || "").trim();
    if (!name) continue;
    const current = categories.get(name) ?? { name, item_count: 0, image_url: item.image_url || "" };
    current.item_count += 1;
    if (!current.image_url) current.image_url = item.image_url || "";
    categories.set(name, current);
  }
  return [...categories.values()].sort((a, b) => b.item_count - a.item_count || a.name.localeCompare(b.name, "ja"));
}

export async function getRankingSeries(mode = "released", scope = "variant") {
  if (!shouldUseSupabaseRecords()) {
    const repository = await getRepository();
    return scope === "series" ? repository.listParentSeries() : repository.listVariants();
  }
  if (scope === "series") {
    const records = await runDataSourceOperation(
      "series-ranking",
      () => mode === "released" ? loadCachedReleasedSeriesRanking() : loadCachedUpcomingSeriesRanking()
    );
    return createGachaRepository(records).listParentSeries();
  }
  if (mode === "released") {
    const records = await runDataSourceOperation("variant-ranking", () => loadCachedReleasedRanking());
    return createGachaRepository(records).listVariants();
  }
  return runDataSourceOperation("variant-ranking", () => loadCachedUpcomingRanking());
}

export async function getParentSeriesBySlug(slug) {
  const normalizedSlug = normalizeSlugValue(slug);
  if (shouldUseSupabaseRecords()) {
    return runDataSourceOperation("parent-series-detail", () => loadCachedParentSeries(normalizedSlug));
  }
  return (await getRepository()).findParentSeriesBySlug(normalizedSlug);
}

export async function getAllSeries() {
  return (await getRepository()).listVariants();
}

export async function getSeries() {
  return (await getRepository()).listVariants();
}

export async function fetchSeriesList() {
  return (await getRepository()).listVariants();
}

export async function fetchSeries() {
  return (await getRepository()).listVariants();
}

export async function listSeries() {
  return (await getRepository()).listVariants();
}

export async function getSeriesBySlug(slug) {
  if (shouldUseSupabaseRecords()) {
    return runDataSourceOperation("variant-detail", () => loadCachedVariant(normalizeSlugValue(slug)));
  }
  return (await getRepository()).findVariantBySlug(slug);
}

export async function findSeriesBySlug(slug) {
  return getSeriesBySlug(slug);
}

export async function getSeriesDetail(slug) {
  const variant = await getSeriesBySlug(slug);
  if (!variant) return null;

  return {
    series: variant,
    variant,
    lineup: variant.sibling_variants,
    marketListings: variant.market_listings,
    restockInfo: variant.restock_events,
    stockReports: variant.stock_reports,
  };
}

function normalizeSlugValue(value) {
  const text = String(value || "").trim();
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function normalizeCatalogOptions(options = {}) {
  return {
    q: String(options.q || "").trim().slice(0, 120),
    filter: String(options.filter || "all"),
    sort: String(options.sort || "recommended"),
    page: Math.max(1, Number(options.page) || 1),
    pageSize: Math.max(1, Math.min(120, Number(options.pageSize) || 120)),
    category: String(options.category || "").trim().slice(0, 120),
  };
}

export async function getSeriesSlugs() {
  if (shouldUseSupabaseRecords()) {
    const rows = await runDataSourceOperation(
      "public-variant-slugs",
      () => fetchSupabasePublicVariantIdentifiers(supabase)
    );
    return rows.map((item) => item.slug).filter(Boolean);
  }
  return (await getRepository()).listVariants().map((item) => item.slug);
}

export async function getPublicFavoriteIdentifiers(identifiers = []) {
  const candidates = [...new Set(identifiers.map(normalizeSlugValue).filter(Boolean))].slice(0, 100);
  if (!candidates.length) return [];
  if (shouldUseSupabaseRecords()) {
    const rows = await runDataSourceOperation(
      "public-favorite-identifiers",
      () => fetchSupabasePublicVariantIdentifiers(supabase, candidates)
    );
    const publicValues = new Set(rows.flatMap((item) => [item.id, item.slug]).filter(Boolean));
    return candidates.filter((candidate) => publicValues.has(candidate));
  }
  const repository = await getRepository();
  return candidates.filter((candidate) => repository.findVariantBySlug(candidate));
}

export async function getRelatedSeries(slug, limit = 4) {
  return (await getRepository()).getRelatedVariants(slug, limit);
}

export async function getPriceHistoryMapBySeriesSlugs(slugs = []) {
  const repository = await getRepository();
  return Object.fromEntries(normalizeSlugList(slugs).map((slug) => [slug, repository.findVariantBySlug(slug)?.market_listings ?? []]));
}

export async function getRestockInfoMapBySeriesSlugs(slugs = []) {
  const repository = await getRepository();
  return Object.fromEntries(normalizeSlugList(slugs).map((slug) => [slug, repository.findVariantBySlug(slug)?.restock_events ?? []]));
}

export async function getStockReportMapBySeriesSlugs(slugs = []) {
  const repository = await getRepository();
  return Object.fromEntries(normalizeSlugList(slugs).map((slug) => [slug, repository.findVariantBySlug(slug)?.stock_reports ?? []]));
}

export async function getDataModel() {
  return getAdminDataModel();
}

export async function createRepositoryFromDataSource(dataSource = createStaticGachaDataSource(EMPTY_GACHA_RECORDS)) {
  const records = typeof dataSource.loadRecords === "function" ? await dataSource.loadRecords() : dataSource;
  return createGachaRepository(records);
}

export function invalidateRepositoryCache() {
  repositoryPromise = null;
  repositoryLoadedAt = 0;
  repositoryCacheKey = "";
  adminDataModelPromise = null;
  adminDataModelLoadedAt = 0;
}

export { createGachaRepository, createRepositoryRecords };

async function getRepository() {
  const cacheKey = getRepositoryCacheKey();
  const cacheTtlMs = getRepositoryCacheTtlMs();
  const isExpired = Number.isFinite(cacheTtlMs) && Date.now() - repositoryLoadedAt > cacheTtlMs;

  if (!repositoryPromise || repositoryCacheKey !== cacheKey || isExpired) {
    repositoryPromise = createPreferredRepository();
    repositoryLoadedAt = Date.now();
    repositoryCacheKey = cacheKey;
  }

  return repositoryPromise;
}

async function createPreferredRepository() {
  const source = resolveConfiguredDataSource();
  if (source === "sample") return createGachaRepository(getSampleRecords());

  return runDataSourceOperation("public-catalog", async () => {
    const loadStartedAt = Date.now();
    const dbRecords = await createSupabaseGachaDataSource(supabase, {
      includeImportIssues: false,
      publicCatalogLimit: getPublicCatalogLimit(),
    }).loadRecords();
    const loadedAt = Date.now();
    const repository = createGachaRepository(dbRecords);
    console.info("[gacha-repository] public snapshot loaded", {
      series: dbRecords.series.length,
      variants: dbRecords.variants.length,
      fetchMs: loadedAt - loadStartedAt,
      enrichMs: Date.now() - loadedAt,
    });
    return repository;
  });
}

async function getAdminDataModel() {
  const cacheTtlMs = getRepositoryCacheTtlMs();
  const isExpired = Number.isFinite(cacheTtlMs) && Date.now() - adminDataModelLoadedAt > cacheTtlMs;
  if (!adminDataModelPromise || isExpired) {
    adminDataModelPromise = createAdminDataModel();
    adminDataModelLoadedAt = Date.now();
  }
  return adminDataModelPromise;
}

async function createAdminDataModel() {
  const source = resolveConfiguredDataSource();
  if (source === "sample") return createGachaRepository(getSampleRecords()).getDataModel();
  return runDataSourceOperation("admin-data-model", async () => {
    const [dbRecords, catalogCounts] = await Promise.all([
      createSupabaseGachaDataSource(supabase, {
        includeImportIssues: true,
        publicCatalogLimit: 200,
      }).loadRecords(),
      fetchSupabaseCatalogCounts(supabase),
    ]);
    const normalized = normalizeRecordShape(dbRecords);
    return {
      tables: DB_TABLES,
      listingTypes: LISTING_TYPES,
      listingTypeLabels: LISTING_TYPE_LABELS,
      sourceWeights: SOURCE_WEIGHTS,
      ...normalized,
      importIssues: collectReviewQueue(normalized),
      catalogCounts,
    };
  });
}

function shouldUseSupabaseRecords() {
  return resolveConfiguredDataSource() === "supabase";
}

function resolveConfiguredDataSource() {
  return resolveDataSource({ hasSupabaseConfig });
}

function getRepositoryCacheKey() {
  return resolveConfiguredDataSource();
}

function getPublicCatalogLimit() {
  const parsed = Number(process.env.GACHA_PUBLIC_CATALOG_LIMIT);
  if (Number.isFinite(parsed) && parsed >= 100) return Math.round(parsed);
  return 600;
}

function getRepositoryCacheTtlMs() {
  if (!shouldUseSupabaseRecords()) return Infinity;
  const parsed = Number(process.env.GACHA_REPOSITORY_CACHE_TTL_MS);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return 60_000;
}

function createGachaRepository(records = EMPTY_GACHA_RECORDS) {
  const normalized = normalizeRecords(records);
  const seriesIds = new Set(normalized.series.map((series) => String(series.id || "").trim()).filter(Boolean));
  const visibleVariantRows = normalized.variants.filter((variant) => isPublicVariant(variant, { seriesIds }));
  const indexes = buildRecordIndexes(normalized, visibleVariantRows);
  const variants = visibleVariantRows
    .map((variant) => enrichVariant(variant, normalized, indexes))
    .filter(Boolean)
    .sort(compareDisplayPriority);
  const variantsBySeries = groupBy(variants, "series_id");
  const parentSeries = normalized.series
    .map((parent) => enrichParentSeries(parent, variantsBySeries.get(parent.id) ?? [], normalized, indexes))
    .filter(Boolean)
    .sort(compareDisplayPriority);

  return {
    listVariants() {
      return variants;
    },
    listParentSeries() {
      return parentSeries;
    },
    findVariantBySlug(slug) {
      return findVariantBySlugValue(variants, slug);
    },
    findParentSeriesBySlug(slug) {
      return parentSeries.find((item) => slugMatches(slug, item.slug, item.id)) ?? null;
    },
    getRelatedVariants(slug, limit = 4) {
      const base = findVariantBySlugValue(variants, slug);
      return variants
        .filter((item) => !slugMatches(slug, item.slug, item.series_slug, item.id, item.variant_id))
        .sort((a, b) => {
          const sameSeries = Number(b.series_id === base?.series_id) - Number(a.series_id === base?.series_id);
          if (sameSeries !== 0) return sameSeries;
          const sameRelease = Number(b.is_released === base?.is_released) - Number(a.is_released === base?.is_released);
          if (sameRelease !== 0) return sameRelease;
          return getDisplayScore(b) - getDisplayScore(a);
        })
        .slice(0, limit);
    },
    getDataModel() {
      return {
        tables: DB_TABLES,
        listingTypes: LISTING_TYPES,
        listingTypeLabels: LISTING_TYPE_LABELS,
        sourceWeights: SOURCE_WEIGHTS,
        series: normalized.series,
        variants: normalized.variants,
        marketListings: normalized.marketListings,
        restockEvents: normalized.restockEvents,
        stockReports: normalized.stockReports,
        xReactions: normalized.xReactions,
        importIssues: normalized.importIssues,
        ingestionRuns: normalized.ingestionRuns,
      };
    },
  };
}

function getSampleRecords() {
  return hasOfficialInput() ? createOfficialFirstRecords() : getMockRecords();
}

function getMockRecords() {
  return {
    series: mockSeries,
    variants: mockVariants,
    marketListings: mockMarketListings,
    restockEvents: mockRestockEvents,
    stockReports: mockStockReports,
    xReactions: mockXReactions,
    importIssues: [],
  };
}

function normalizeRecords(records) {
  const shaped = normalizeRecordShape(records);
  const catalog = {
    series: shaped.series,
    variants: shaped.variants,
  };
  const normalized = {
    series: shaped.series,
    variants: shaped.variants,
    marketListings: shaped.marketListings.map((entry) => preserveMatchedVariant(normalizeMarketListing(entry, catalog), entry)),
    marketObservations: shaped.marketObservations,
    restockEvents: shaped.restockEvents.map((entry) => preserveMatchedVariant(normalizeRestockEvent(entry, catalog), entry)),
    stockReports: shaped.stockReports.map((entry) => preserveMatchedVariant(normalizeStockReport(entry, catalog), entry)),
    xReactions: shaped.xReactions.map((entry) => preserveMatchedVariant(normalizeXReaction(entry, catalog), entry)),
    communityReports: shaped.communityReports,
    importIssues: shaped.importIssues,
  };

  return {
    ...normalized,
    importIssues: collectReviewQueue(normalized),
  };
}

function preserveMatchedVariant(normalizedEntry, sourceEntry) {
  const matchedVariantId = sourceEntry?.matched_variant_id || sourceEntry?.matchedVariantId;
  return {
    ...normalizedEntry,
    ...(matchedVariantId ? { matched_variant_id: matchedVariantId } : {}),
    last_observed_at: sourceEntry?.last_observed_at || normalizedEntry.last_observed_at || "",
    created_at: sourceEntry?.created_at || normalizedEntry.created_at || "",
    updated_at: sourceEntry?.updated_at || normalizedEntry.updated_at || "",
  };
}

function enrichVariant(variant, records, indexes) {
  const parent = indexes.seriesById.get(variant.series_id);
  if (!parent) return null;

  const variantMarketListings = indexes.marketByVariant.get(variant.id) ?? [];
  const marketObservations = indexes.marketObservationsByVariant.get(variant.id) ?? [];
  const seriesSetListings = indexes.setMarketBySeries.get(parent.id) ?? [];
  const forecastMarketListings = [...variantMarketListings, ...seriesSetListings];
  const restockEvents = indexes.restockByVariant.get(variant.id) ?? [];
  const stockReports = indexes.stockByVariant.get(variant.id) ?? [];
  const availabilitySummary = buildAvailabilitySummary(variant, restockEvents, stockReports);
  const xReactions = indexes.xByVariant.get(variant.id) ?? [];
  const siblings = indexes.siblingsBySeries.get(variant.series_id) ?? [];
  const siblingVariants = siblings.map((entry) => ({
    ...entry,
    image: resolveVariantImage(entry, parent, siblings.length),
  }));
  const marketSummary = buildMarketSummary(variant, variantMarketListings, { scope: "variant" });
  const forecastVariant = {
    ...variant,
    axes: deriveOfficialForecastAxes({ variant, parent, siblingCount: siblings.length }),
  };
  const forecast = calculateUpcomingVariantForecast({
    variant: forecastVariant,
    marketListings: forecastMarketListings,
    xReactions,
    restockEvents,
    stockReports,
  });
  const trendSummary = buildTrendSummary({
    variant,
    marketSummary,
    availabilitySummary,
    xReactions,
    marketListings: variantMarketListings,
    forecast,
  });
  const circulation = buildCirculationScore({ marketSummary, availabilitySummary });
  const price = variant.price ?? parent.price;
  const releaseMonth = variant.release_month || parent.release_month;
  const releaseWeek = variant.release_week || parent.release_week;
  const releaseDate = variant.release_date || parent.release_date;
  const singleMarket = variant.released ? marketSummary.single : null;
  const estimatedResale = variant.released ? marketSummary.estimated_resale_range : null;
  const profit = variant.released && Number.isFinite(estimatedResale?.midpoint) && Number.isFinite(price)
    ? estimatedResale.midpoint - price
    : null;
  const displayName = variant.name;
  const variantImage = resolveVariantImage(variant, parent, siblings.length);

  return {
    ...variant,
    id: variant.id,
    variant_id: variant.id,
    series_id: parent.id,
    series_slug: parent.slug,
    series_name: parent.name,
    parent_series: parent,
    name: displayName,
    variant_name: variant.name,
    title: displayName,
    brand: variant.brand || parent.brand,
    character: parent.franchise,
    category: parent.category,
    price,
    release_date: releaseDate,
    releaseDate,
    schedule_month: releaseMonth,
    schedule_week: releaseWeek,
    official_url: variant.official_url || parent.official_url,
    officialUrl: variant.official_url || parent.official_url,
    is_released: variant.released,
    isReleased: variant.released,
    image_url: variantImage,
    imageUrl: variantImage,
    series_image_url: parent.image_url || "",
    has_variant_image: Boolean(variantImage),
    image_scope: variantImage ? "variant" : "missing",
    market_listings: variantMarketListings,
    market_observations: marketObservations,
    market_evidence: marketSummary.evidence,
    market_summary: variant.released ? marketSummary : {},
    marketSummary: variant.released ? marketSummary : {},
    market_price_median: singleMarket,
    marketPriceMedian: singleMarket,
    estimated_resale_range: estimatedResale,
    estimatedResaleRange: estimatedResale,
    profit_estimate: profit,
    profitEstimate: profit,
    listing_count: variant.released ? marketSummary.listing_count : 0,
    sold_count: variant.released ? marketSummary.sold_count : 0,
    active_listing_count: variant.released ? marketSummary.active_listing_count : 0,
    last_observed_at: variant.released ? marketSummary.last_observed_at : "",
    price_confidence: variant.released ? marketSummary.price_confidence : { score: 0, label: "未取得", reason: "upcoming" },
    circulation_score: variant.released ? circulation.score : 0,
    circulation_label: variant.released ? circulation.label : "発売前",
    trend_score: trendSummary.score,
    trend_summary: trendSummary,
    trend_tags: trendSummary.tags,
    forecast_score: forecast.total,
    forecastScore: forecast.total,
    complete_set_score: forecast.complete,
    ace_character_score: forecast.ace,
    compatibility_score: forecast.compatibility,
    limitedness_score: forecast.limited,
    preorder_signal_score: forecast.preorder,
    x_signal_score: forecast.x,
    forecast_breakdown: forecast,
    forecast_tags: variant.tags,
    restock_events: restockEvents,
    stock_reports: stockReports,
    availability_summary: availabilitySummary,
    stock_summary: availabilitySummary,
    forecast_summary: {
      score: forecast.total,
      complete: forecast.complete,
      ace: forecast.ace,
      compatibility: forecast.compatibility,
      limited: forecast.limited,
      preorder: forecast.preorder,
      x: forecast.x,
      tags: trendSummary.tags,
    },
    x_reactions: xReactions,
    sibling_variants: siblingVariants,
    listing_groups: variant.released ? buildListingGroups(marketSummary) : [],
    summary: variant.released
      ? `${variant.name}の参考相場、話題度、在庫の動きを確認できます。`
      : `${variant.name}の先行注目度を、コンプ需要・キャラクター人気・互換性・限定性から確認できます。`,
    description: variant.released
      ? `${parent.name}の中の個別種です。単品、レア単品、コンプセットを分けて判断します。`
      : `${parent.name}の中の個別種です。発売前のため価格相場は出さず、先行反応だけを表示します。`,
  };
}

function enrichParentSeries(parent, variants, records, indexes) {
  const rawChildren = indexes.rawVariantsBySeries.get(parent.id) ?? [];
  const lineupState = buildLineupPublicationState(rawChildren, variants);
  const marketListings = dedupeById(indexes.marketBySeries.get(parent.id) ?? []).filter((listing) =>
    [LISTING_TYPES.COMPLETE_SET, LISTING_TYPES.PARTIAL_SET, LISTING_TYPES.POPULAR_SET].includes(listing.listing_type)
  );
  const restockEvents = dedupeById([
    ...(indexes.restockBySeries.get(parent.id) ?? []),
    ...variants.flatMap((variant) => variant.restock_events ?? []),
  ]);
  const stockReports = dedupeById([
    ...(indexes.stockBySeries.get(parent.id) ?? []),
    ...variants.flatMap((variant) => variant.stock_reports ?? []),
  ]);
  const xReactions = dedupeById([
    ...(indexes.xBySeries.get(parent.id) ?? []),
    ...variants.flatMap((variant) => variant.x_reactions ?? []),
  ]);
  const released = Boolean(parent.is_released ?? parent.released);
  const syntheticVariant = {
    id: parent.id,
    name: parent.name,
    variant_type: "series",
    released,
    price: parent.price,
    market: {},
  };
  const marketSummary = buildMarketSummary(syntheticVariant, marketListings, { scope: "series" });
  const availabilitySummary = buildAvailabilitySummary(syntheticVariant, restockEvents, stockReports);
  const childForecasts = variants.map((variant) => variant.forecast_score).filter(Number.isFinite);
  const officialAxes = deriveOfficialForecastAxes({ variant: syntheticVariant, parent, siblingCount: variants.length });
  const fallbackForecast = calculateUpcomingVariantForecast({
    variant: { ...syntheticVariant, axes: officialAxes },
    marketListings,
    xReactions,
    restockEvents,
    stockReports,
  });
  const forecastScore = childForecasts.length ? Math.max(...childForecasts) : fallbackForecast.total;
  const trendSummary = buildTrendSummary({
    variant: syntheticVariant,
    marketSummary,
    availabilitySummary,
    xReactions,
    marketListings,
    forecast: fallbackForecast,
  });
  const circulation = buildCirculationScore({ marketSummary, availabilitySummary });

  return {
    ...parent,
    id: parent.id,
    series_id: parent.id,
    series_slug: parent.slug,
    series_name: parent.name,
    name: parent.name,
    title: parent.name,
    entity_type: "series",
    variant_type: "series",
    variant_count: variants.length,
    lineup_count: variants.length,
    ...lineupState,
    variants,
    sibling_variants: variants,
    image_url: parent.image_url || "",
    imageUrl: parent.image_url || "",
    image_scope: "series",
    price: parent.price,
    schedule_month: parent.release_month,
    schedule_week: parent.release_week,
    releaseDate: parent.release_date,
    is_released: released,
    isReleased: released,
    officialUrl: parent.official_url,
    market_listings: marketListings,
    market_evidence: marketSummary.evidence,
    market_summary: released ? marketSummary : {},
    marketSummary: released ? marketSummary : {},
    market_price_median: released ? marketSummary.complete_set : null,
    estimated_resale_range: released ? marketSummary.estimated_resale_range : null,
    listing_count: released ? marketSummary.listing_count : 0,
    sold_count: released ? marketSummary.sold_count : 0,
    active_listing_count: released ? marketSummary.active_listing_count : 0,
    last_observed_at: released ? marketSummary.last_observed_at : "",
    price_confidence: released ? marketSummary.price_confidence : { score: 0, label: "未取得", reason: "upcoming" },
    circulation_score: released ? circulation.score : 0,
    circulation_label: released ? circulation.label : "発売前",
    trend_score: trendSummary.score,
    trend_summary: trendSummary,
    trend_tags: trendSummary.tags,
    forecast_score: forecastScore,
    forecastScore: forecastScore,
    complete_set_score: maxChildMetric(variants, "complete_set_score", fallbackForecast.complete),
    ace_character_score: maxChildMetric(variants, "ace_character_score", fallbackForecast.ace),
    compatibility_score: maxChildMetric(variants, "compatibility_score", fallbackForecast.compatibility),
    limitedness_score: maxChildMetric(variants, "limitedness_score", fallbackForecast.limited),
    preorder_signal_score: maxChildMetric(variants, "preorder_signal_score", fallbackForecast.preorder),
    x_signal_score: maxChildMetric(variants, "x_signal_score", fallbackForecast.x),
    forecast_breakdown: fallbackForecast,
    forecast_summary: { ...fallbackForecast, score: forecastScore },
    restock_events: restockEvents,
    stock_reports: stockReports,
    availability_summary: availabilitySummary,
    stock_summary: availabilitySummary,
    x_reactions: xReactions,
    summary: released
      ? "シリーズ全体のラインナップ、セット相場、流通状況を確認できます。"
      : "シリーズ全体の発売情報とラインナップの注目度を確認できます。",
  };
}

function resolveVariantImage(variant, parent, siblingCount) {
  const candidate = String(variant.image || variant.image_url || "").trim();
  if (!candidate || variant.variant_type === "provisional") return "";
  const explicitScope = variant.image_scope || variant.raw?.image_scope;
  if (explicitScope === "series") return "";
  if (String(variant.id || "").startsWith("tarts-")) return "";
  if (/タカラトミーアーツ/.test(String(parent.brand || "")) && siblingCount > 1) return "";
  const parentImage = String(parent.image_url || "").trim();
  if (parentImage && normalizeImageUrl(candidate) === normalizeImageUrl(parentImage) && siblingCount > 1) return "";
  return candidate;
}

function normalizeImageUrl(value) {
  return String(value || "").trim().replace(/^http:/, "https:").replace(/[?#].*$/, "").replace(/\/$/, "");
}

function maxChildMetric(variants, key, fallback) {
  const values = variants.map((variant) => variant?.[key]).filter(Number.isFinite);
  return values.length ? Math.max(...values) : fallback;
}

function dedupeById(items = []) {
  return [...new Map(items.filter(Boolean).map((item, index) => [item.id || `${item.source_url || "row"}-${index}`, item])).values()];
}

function buildRecordIndexes(records, publicVariants = []) {
  const publicVariantIds = new Set(publicVariants.map((variant) => String(variant.id || "").trim()).filter(Boolean));
  const publicMarketListings = records.marketListings.filter((entry) => signalIsPublic(entry, publicVariantIds));
  const publicMarketObservations = records.marketObservations.filter((entry) => signalIsPublic(entry, publicVariantIds));
  const publicRestockEvents = records.restockEvents.filter((entry) => signalIsPublic(entry, publicVariantIds));
  const publicStockReports = records.stockReports.filter((entry) => signalIsPublic(entry, publicVariantIds));
  const publicXReactions = records.xReactions.filter((entry) => signalIsPublic(entry, publicVariantIds));
  const seriesById = new Map(records.series.map((entry) => [entry.id, entry]));
  const marketByVariant = groupBy(publicMarketListings.filter((entry) => entry.variant_id), "variant_id");
  const marketBySeries = groupBy(publicMarketListings, "series_id");
  const marketObservationsByVariant = groupBy(publicMarketObservations, "variant_id");
  const setMarketBySeries = groupBy(
    publicMarketListings.filter(
      (entry) => !entry.variant_id && [LISTING_TYPES.COMPLETE_SET, LISTING_TYPES.PARTIAL_SET, LISTING_TYPES.POPULAR_SET].includes(entry.listing_type)
    ),
    "series_id"
  );
  const restockByVariant = groupBy(publicRestockEvents, "variant_id");
  const stockByVariant = groupBy(publicStockReports, "variant_id");
  const xByVariant = groupBy(publicXReactions, "variant_id");
  const restockBySeries = groupBy(publicRestockEvents, "series_id");
  const stockBySeries = groupBy(publicStockReports, "series_id");
  const xBySeries = groupBy(publicXReactions, "series_id");
  const rawVariantsBySeries = groupBy(records.variants, "series_id");
  const siblingsBySeries = new Map();

  for (const [seriesId, variants] of groupBy(publicVariants, "series_id")) {
    siblingsBySeries.set(seriesId, variants.map((entry) => ({
      id: entry.id,
      slug: entry.slug,
      name: entry.name,
      rarity: entry.rarity,
      role: entry.role,
      image: entry.image,
      image_scope: entry.image_scope,
      variant_type: entry.variant_type,
      raw: entry.raw,
    })));
  }

  return {
    seriesById,
    marketByVariant,
    marketBySeries,
    marketObservationsByVariant,
    setMarketBySeries,
    restockByVariant,
    stockByVariant,
    xByVariant,
    restockBySeries,
    stockBySeries,
    xBySeries,
    rawVariantsBySeries,
    siblingsBySeries,
  };
}

function groupBy(records = [], key) {
  const groups = new Map();
  for (const record of records) {
    const value = record?.[key];
    if (!value) continue;
    const group = groups.get(value) ?? [];
    group.push(record);
    groups.set(value, group);
  }
  return groups;
}

function compareDisplayPriority(a, b) {
  return getDisplayScore(b) - getDisplayScore(a);
}

function getDisplayScore(item) {
  if (!item.is_released) return (item.forecast_score ?? 0) + (item.trend_score ?? 0) * 0.2;
  return (
    Math.max(0, item.profit_estimate ?? 0) * 0.8 +
    (item.circulation_score ?? 0) * 18 +
    (item.trend_score ?? 0) * 12 +
    (item.sold_count ?? 0) * 45
  );
}

function normalizeSlugList(slugs) {
  if (!Array.isArray(slugs)) return [];
  return [...new Set(slugs.filter(Boolean).map(String))];
}

function findVariantBySlugValue(variants = [], slug = "") {
  return (
    variants.find((item) => slugMatches(slug, item.slug, item.series_slug, item.id, item.variant_id)) ??
    null
  );
}

function slugMatches(input, ...values) {
  const inputCandidates = slugCandidates(input);
  if (!inputCandidates.size) return false;

  return values.some((value) => {
    const valueCandidates = slugCandidates(value);
    return [...valueCandidates].some((candidate) => inputCandidates.has(candidate));
  });
}

function slugCandidates(value) {
  if (value == null) return new Set();
  const raw = String(value).trim().replace(/^\/series\//, "");
  if (!raw) return new Set();

  const decoded = safeDecode(raw);
  const encodedComponent = safeEncodeURIComponent(decoded);
  const encodedPath = safeEncodeURI(decoded);
  return new Set(
    [raw, decoded, encodedComponent, encodedPath]
      .filter(Boolean)
      .flatMap((candidate) => [candidate, candidate.toLowerCase()])
  );
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeEncodeURIComponent(value) {
  try {
    return encodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeEncodeURI(value) {
  try {
    return encodeURI(value);
  } catch {
    return value;
  }
}
