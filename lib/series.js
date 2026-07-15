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
  normalizeRecordShape,
} from "./data/gacha-repository";
import { createRepositoryRecords } from "./data/ingestion-adapters";
import { createOfficialFirstRecords, hasOfficialInput } from "./data/official-data-source";
import {
  createSupabaseGachaDataSource,
  fetchSupabaseCatalogCounts,
  fetchSupabaseCatalogPage,
  fetchSupabaseCatalogVariant,
  fetchSupabaseReleasedSignalCatalog,
} from "./data/supabase-gacha-repository";
import { hasSupabaseConfig, supabase } from "./supabase";

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
  const result = await fetchSupabaseCatalogPage(supabase, options);
  return {
    items: createGachaRepository(result.records).listVariants(),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

export async function getSeriesCatalogCounts() {
  if (!shouldUseSupabaseRecords()) return null;
  return fetchSupabaseCatalogCounts(supabase);
}

export async function getRankingSeries(mode = "released") {
  if (!shouldUseSupabaseRecords()) return (await getRepository()).listVariants();
  if (mode === "released") {
    const records = await fetchSupabaseReleasedSignalCatalog(supabase);
    return createGachaRepository(records).listVariants();
  }

  const first = await getSeriesCatalogPage({ filter: "upcoming", page: 1, pageSize: 120 });
  const pageCount = Math.min(3, Math.ceil(first.total / first.pageSize));
  const remaining = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
      getSeriesCatalogPage({ filter: "upcoming", page: index + 2, pageSize: 120 })
    )
  );
  return [...new Map([first, ...remaining].flatMap((page) => page.items).map((item) => [item.variant_id, item])).values()];
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
    try {
      const directRecords = await fetchSupabaseCatalogVariant(supabase, normalizeSlugValue(slug));
      if (directRecords) return createGachaRepository(directRecords).findVariantBySlug(normalizeSlugValue(slug));
    } catch (error) {
      console.warn(`[gacha-repository] Direct variant fetch failed: ${error.message}`);
    }
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

export async function getSeriesSlugs() {
  return (await getRepository()).listVariants().map((item) => item.slug);
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

export async function createRepositoryFromDataSource(dataSource = createStaticGachaDataSource(getInitialRecords())) {
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

export default createGachaRepository(getInitialRecords()).listVariants();

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
  const fallbackRecords = getInitialRecords();
  if (!shouldUseSupabaseRecords()) return createGachaRepository(fallbackRecords);

  try {
    const loadStartedAt = Date.now();
    const dbRecords = await createSupabaseGachaDataSource(supabase, {
      includeImportIssues: false,
      publicCatalogLimit: getPublicCatalogLimit(),
    }).loadRecords();
    const loadedAt = Date.now();
    if (!dbRecords.series.length || !dbRecords.variants.length) {
      return createGachaRepository(fallbackRecords);
    }

    const repository = createGachaRepository(dbRecords);
    console.info("[gacha-repository] public snapshot loaded", {
      series: dbRecords.series.length,
      variants: dbRecords.variants.length,
      fetchMs: loadedAt - loadStartedAt,
      enrichMs: Date.now() - loadedAt,
    });
    return repository;
  } catch (error) {
    console.warn(`[gacha-repository] Supabase load failed. Falling back to file records: ${error.message}`);
    return createGachaRepository(fallbackRecords);
  }
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
  const fallbackRecords = getInitialRecords();
  if (!shouldUseSupabaseRecords()) return createGachaRepository(fallbackRecords).getDataModel();
  try {
    const [dbRecords, catalogCounts] = await Promise.all([
      createSupabaseGachaDataSource(supabase, {
        includeImportIssues: true,
        publicCatalogLimit: 200,
      }).loadRecords(),
      fetchSupabaseCatalogCounts(supabase),
    ]);
    if (!dbRecords.series.length || !dbRecords.variants.length) return createGachaRepository(fallbackRecords).getDataModel();
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
  } catch (error) {
    console.warn(`[gacha-admin-repository] Supabase load failed. Falling back to file records: ${error.message}`);
    return createGachaRepository(fallbackRecords).getDataModel();
  }
}

function shouldUseSupabaseRecords() {
  return hasSupabaseConfig && process.env.GACHA_DATA_SOURCE === "supabase";
}

function getRepositoryCacheKey() {
  return shouldUseSupabaseRecords() ? "supabase" : "file";
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

function createGachaRepository(records = getInitialRecords()) {
  const normalized = normalizeRecords(records);
  const realVariantSeriesIds = new Set(
    normalized.variants
      .filter((variant) => variant.variant_type !== "provisional")
      .map((variant) => variant.series_id)
  );
  const visibleVariantRows = normalized.variants.filter((variant) => {
    if (variant.variant_type !== "provisional") return true;
    return !realVariantSeriesIds.has(variant.series_id);
  });
  const indexes = buildRecordIndexes(normalized);
  const variants = visibleVariantRows
    .map((variant) => enrichVariant(variant, normalized, indexes))
    .filter(Boolean)
    .sort(compareDisplayPriority);

  return {
    listVariants() {
      return variants;
    },
    findVariantBySlug(slug) {
      return findVariantBySlugValue(variants, slug);
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
        variants,
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

function getInitialRecords() {
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
    marketListings: shaped.marketListings.map((entry) => normalizeMarketListing(entry, catalog)),
    marketObservations: shaped.marketObservations,
    restockEvents: shaped.restockEvents.map((entry) => normalizeRestockEvent(entry, catalog)),
    stockReports: shaped.stockReports.map((entry) => normalizeStockReport(entry, catalog)),
    xReactions: shaped.xReactions.map((entry) => normalizeXReaction(entry, catalog)),
    communityReports: shaped.communityReports,
    importIssues: shaped.importIssues,
  };

  return {
    ...normalized,
    importIssues: collectReviewQueue(normalized),
  };
}

function enrichVariant(variant, records, indexes) {
  const parent = indexes.seriesById.get(variant.series_id);
  if (!parent) return null;

  const variantMarketListings = indexes.marketByVariant.get(variant.id) ?? [];
  const marketObservations = indexes.marketObservationsByVariant.get(variant.id) ?? [];
  const seriesSetListings = indexes.setMarketBySeries.get(parent.id) ?? [];
  const marketListings = [...variantMarketListings, ...seriesSetListings];
  const restockEvents = indexes.restockByVariant.get(variant.id) ?? [];
  const stockReports = indexes.stockByVariant.get(variant.id) ?? [];
  const availabilitySummary = buildAvailabilitySummary(variant, restockEvents, stockReports);
  const xReactions = indexes.xByVariant.get(variant.id) ?? [];
  const siblings = indexes.siblingsBySeries.get(variant.series_id) ?? [];
  const marketSummary = buildMarketSummary(variant, marketListings);
  const forecastVariant = {
    ...variant,
    axes: deriveOfficialForecastAxes({ variant, parent, siblingCount: siblings.length }),
  };
  const forecast = calculateUpcomingVariantForecast({
    variant: forecastVariant,
    marketListings,
    xReactions,
    restockEvents,
    stockReports,
  });
  const trendSummary = buildTrendSummary({
    variant,
    marketSummary,
    availabilitySummary,
    xReactions,
    marketListings,
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
  const displayName = `${variant.name}単品`;

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
    image_url: variant.image,
    imageUrl: variant.image,
    market_listings: marketListings,
    market_observations: marketObservations,
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
    sibling_variants: siblings,
    listing_groups: variant.released ? buildListingGroups(marketSummary) : [],
    summary: variant.released
      ? `${variant.name}の参考相場、話題度、在庫の動きを確認できます。`
      : `${variant.name}の先行注目度を、コンプ需要・キャラクター人気・互換性・限定性から確認できます。`,
    description: variant.released
      ? `${parent.name}の中の個別種です。単品、レア単品、コンプセットを分けて判断します。`
      : `${parent.name}の中の個別種です。発売前のため価格相場は出さず、先行反応だけを表示します。`,
  };
}

function buildRecordIndexes(records) {
  const seriesById = new Map(records.series.map((entry) => [entry.id, entry]));
  const marketByVariant = groupBy(records.marketListings.filter((entry) => entry.variant_id), "variant_id");
  const marketObservationsByVariant = groupBy(records.marketObservations, "variant_id");
  const setMarketBySeries = groupBy(
    records.marketListings.filter(
      (entry) => !entry.variant_id && [LISTING_TYPES.COMPLETE_SET, LISTING_TYPES.PARTIAL_SET, LISTING_TYPES.POPULAR_SET].includes(entry.listing_type)
    ),
    "series_id"
  );
  const restockByVariant = groupBy(records.restockEvents, "variant_id");
  const stockByVariant = groupBy(records.stockReports, "variant_id");
  const xByVariant = groupBy(records.xReactions, "variant_id");
  const siblingsBySeries = new Map();

  for (const [seriesId, variants] of groupBy(records.variants, "series_id")) {
    siblingsBySeries.set(seriesId, variants.map((entry) => ({
      id: entry.id,
      slug: entry.slug,
      name: entry.name,
      rarity: entry.rarity,
      role: entry.role,
    })));
  }

  return {
    seriesById,
    marketByVariant,
    marketObservationsByVariant,
    setMarketBySeries,
    restockByVariant,
    stockByVariant,
    xByVariant,
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
