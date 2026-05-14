import {
  DB_TABLES,
  LISTING_TYPE_LABELS,
  LISTING_TYPES,
  SOURCE_WEIGHTS,
} from "./domain/gacha-schema";
import { calculateUpcomingVariantForecast } from "./domain/forecast-score";
import { buildListingGroups, buildMarketSummary } from "./domain/market-summary";
import { buildAvailabilitySummary } from "./domain/stock-summary";
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
  mergeGachaRecords,
  normalizeRecordShape,
} from "./data/gacha-repository";
import { createRepositoryRecords } from "./data/ingestion-adapters";
import { createOfficialFirstRecords, hasOfficialInput } from "./data/official-data-source";
import { createSupabaseGachaDataSource } from "./data/supabase-gacha-repository";
import { hasSupabaseConfig, supabase } from "./supabase";

let repositoryPromise;

export async function getSeriesList() {
  return (await getRepository()).listVariants();
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
  return (await getRepository()).findVariantBySlug(slug);
}

export async function findSeriesBySlug(slug) {
  return (await getRepository()).findVariantBySlug(slug);
}

export async function getSeriesDetail(slug) {
  const variant = await (await getRepository()).findVariantBySlug(slug);
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
  return (await getRepository()).getDataModel();
}

export async function createRepositoryFromDataSource(dataSource = createStaticGachaDataSource(getInitialRecords())) {
  const records = typeof dataSource.loadRecords === "function" ? await dataSource.loadRecords() : dataSource;
  return createGachaRepository(records);
}

export { createGachaRepository, createRepositoryRecords };

export default createGachaRepository(getInitialRecords()).listVariants();

async function getRepository() {
  if (!repositoryPromise) repositoryPromise = createPreferredRepository();
  return repositoryPromise;
}

async function createPreferredRepository() {
  const fallbackRecords = getInitialRecords();
  if (!shouldUseSupabaseRecords()) return createGachaRepository(fallbackRecords);

  try {
    const dbRecords = await createSupabaseGachaDataSource(supabase).loadRecords();
    if (!dbRecords.series.length || !dbRecords.variants.length) {
      return createGachaRepository(fallbackRecords);
    }

    return createGachaRepository(mergeGachaRecords(fallbackRecords, dbRecords));
  } catch (error) {
    console.warn(`[gacha-repository] Supabase load failed. Falling back to file records: ${error.message}`);
    return createGachaRepository(fallbackRecords);
  }
}

function shouldUseSupabaseRecords() {
  return hasSupabaseConfig && process.env.GACHA_DATA_SOURCE === "supabase";
}

function createGachaRepository(records = getInitialRecords()) {
  const normalized = normalizeRecords(records);
  const variants = normalized.variants
    .map((variant) => enrichVariant(variant, normalized))
    .filter(Boolean)
    .sort(compareDisplayPriority);

  return {
    listVariants() {
      return variants;
    },
    findVariantBySlug(slug) {
      return variants.find((item) => item.slug === slug || item.series_slug === slug) ?? null;
    },
    getRelatedVariants(slug, limit = 4) {
      const base = variants.find((item) => item.slug === slug);
      return variants
        .filter((item) => item.slug !== slug)
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
    restockEvents: shaped.restockEvents.map((entry) => normalizeRestockEvent(entry, catalog)),
    stockReports: shaped.stockReports.map((entry) => normalizeStockReport(entry, catalog)),
    xReactions: shaped.xReactions.map((entry) => normalizeXReaction(entry, catalog)),
    importIssues: shaped.importIssues,
  };

  return {
    ...normalized,
    importIssues: collectReviewQueue(normalized),
  };
}

function enrichVariant(variant, records) {
  const parent = records.series.find((entry) => entry.id === variant.series_id);
  if (!parent) return null;

  const variantMarketListings = records.marketListings.filter((entry) => entry.variant_id === variant.id);
  const seriesSetListings = records.marketListings.filter(
    (entry) =>
      !entry.variant_id &&
      entry.series_id === parent.id &&
      [LISTING_TYPES.COMPLETE_SET, LISTING_TYPES.PARTIAL_SET, LISTING_TYPES.POPULAR_SET].includes(entry.listing_type)
  );
  const marketListings = [...variantMarketListings, ...seriesSetListings];
  const restockEvents = records.restockEvents.filter((entry) => entry.variant_id === variant.id);
  const stockReports = records.stockReports.filter((entry) => entry.variant_id === variant.id);
  const availabilitySummary = buildAvailabilitySummary(variant, restockEvents, stockReports);
  const xReactions = records.xReactions.filter((entry) => entry.variant_id === variant.id);
  const marketSummary = buildMarketSummary(variant, marketListings);
  const forecast = calculateUpcomingVariantForecast({
    variant,
    marketListings,
    xReactions,
    restockEvents,
    stockReports,
  });
  const siblings = records.variants
    .filter((entry) => entry.series_id === variant.series_id)
    .map((entry) => ({
      id: entry.id,
      slug: entry.slug,
      name: entry.name,
      rarity: entry.rarity,
      role: entry.role,
    }));
  const price = variant.price ?? parent.price;
  const releaseMonth = variant.release_month || parent.release_month;
  const releaseWeek = variant.release_week || parent.release_week;
  const releaseDate = variant.release_date || parent.release_date;
  const singleMarket = variant.released ? marketSummary.single : null;
  const profit = variant.released && Number.isFinite(singleMarket) ? singleMarket - price : null;

  return {
    ...variant,
    id: variant.id,
    variant_id: variant.id,
    series_id: parent.id,
    series_slug: parent.slug,
    series_name: parent.name,
    parent_series: parent,
    name: `${variant.name} 単品`,
    variant_name: variant.name,
    title: `${variant.name} 単品`,
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
    market_summary: variant.released ? marketSummary : {},
    market_price_median: singleMarket,
    marketPriceMedian: singleMarket,
    profit_estimate: profit,
    profitEstimate: profit,
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
    x_reactions: xReactions,
    sibling_variants: siblings,
    listing_groups: variant.released ? buildListingGroups(marketSummary) : [],
    summary: variant.released
      ? `${variant.name}の単品相場を主軸に見ます。セット相場は補助情報です。`
      : `${variant.name}の発売前期待値を4軸と予約・X反応で見ます。`,
    description: variant.released
      ? `${parent.name}の中の個別種。単品、レア単品、コンプセットを分けて判断します。`
      : `${parent.name}の中の個別種。発売前のため相場は出さず、期待値の根拠だけを表示します。`,
  };
}

function compareDisplayPriority(a, b) {
  return getDisplayScore(b) - getDisplayScore(a);
}

function getDisplayScore(item) {
  return item.is_released ? item.profit_estimate ?? 0 : item.forecast_score ?? 0;
}

function normalizeSlugList(slugs) {
  if (!Array.isArray(slugs)) return [];
  return [...new Set(slugs.filter(Boolean).map(String))];
}
