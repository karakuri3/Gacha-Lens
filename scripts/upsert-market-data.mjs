import fs from "node:fs";
import path from "node:path";
import { marketListingsRaw } from "../lib/data/market-input.js";
import { officialProducts, officialSchedule } from "../lib/data/official-input.js";
import { applyMarketPersistenceSafety } from "../lib/domain/market-match-safety.js";
import { getGeneratedDataPath } from "./generated-paths.mjs";
import { loadOfficialCatalog } from "./load-official-catalog.mjs";
import { includeStaticSampleData, productionRecords } from "./nonproduction-data.mjs";
import { fetchIdSetSafe, fetchRows, upsertRows } from "./supabase-rest.mjs";

const TITLE_ALIASES = [
  { aliases: ["リンレン", "リン・レン", "リン&レン", "リン レン"], names: ["鏡音リン", "鏡音レン"] },
  { aliases: ["ミクさん", "miku"], names: ["初音ミク"] },
  { aliases: ["パンどろぼうチクタク", "パンどろぼう チクタク", "チクタク"], names: ["パンどろぼう（チクタク）"] },
];

loadEnvFile(".env.local");

const catalog = await loadOfficialCatalog([...officialSchedule, ...officialProducts]);
const generatedMarket = loadGeneratedMarketRaw();
const generatedProductionRows = productionRecords(generatedMarket.records);
const generatedIds = new Set(generatedProductionRows.map((row) => text(row.id) || stableId("market", row.source_url || row.url, row.title || row.name, row.listed_at || row.created_at || row.createdAt)).filter(Boolean));
const existingUnlinked = await loadExistingUnlinkedMarketRows();
const sampleRows = includeStaticSampleData() ? marketListingsRaw : [];
const safeMarketRaw = productionRecords(dedupeRawById([...existingUnlinked, ...generatedMarket.records, ...sampleRows]));
const marketRows = safeMarketRaw.map((raw) => normalizeMarketListing(raw, catalog));
const referenceIds = await loadReferenceIds();
const dbMarketRows = marketRows.map((row) => applyDbReferenceSafety(row, referenceIds));
const issueRows = dbMarketRows
  .filter((row) => row.review_required)
  .map((row) => createImportIssue("market_listings", row.raw, row.classification_reason || "unknown_variant", row.id));
const fetchIssueRows = generatedMarket.issues.map((issue) => ({
  ...issue,
  record_id: issue.record_id || issue.id,
  resolved: Boolean(issue.resolved),
}));

await upsertRows("market_listings", dbMarketRows, { label: "upsert-market" });
const observationRows = buildObservationRows(dbMarketRows.filter((row) => generatedIds.has(row.id)));
await upsertRows("market_listing_observations", observationRows, { label: "upsert-market-observations" });
await upsertRows("import_issues", [...issueRows, ...fetchIssueRows], { label: "upsert-market" });

const reviewRequired = dbMarketRows.filter((row) => row.review_required).length;
const linkedToVariant = marketRows.filter((row) => row.variant_id).length;
const linkedToSeries = marketRows.filter((row) => row.series_id).length;
const savedLinkedToVariant = dbMarketRows.filter((row) => row.variant_id).length;
const savedLinkedToSeries = dbMarketRows.filter((row) => row.series_id).length;
const breakdown = countBy(marketRows, "market_review_type");

console.log(JSON.stringify({
  ok: true,
  raw: safeMarketRaw.length,
  marketListings: dbMarketRows.length,
  observations: observationRows.length,
  importIssues: issueRows.length + fetchIssueRows.length,
  fetchIssues: fetchIssueRows.length,
  reviewRequired,
  linkedToVariant,
  linkedToSeries,
  savedLinkedToVariant,
  savedLinkedToSeries,
  breakdown,
}, null, 2));

function loadGeneratedMarketRaw() {
  const filePath = getGeneratedDataPath("market-raw.json");
  if (!fs.existsSync(filePath)) return { records: [], issues: [] };

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return {
    records: Array.isArray(parsed.records) ? parsed.records : [],
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
  };
}

async function loadExistingUnlinkedMarketRows() {
  const rows = await fetchRows("market_listings", {
    select: "id,title,price,status,source,source_type,source_url,listed_at,sold_at,raw",
  });
  return rows.map((row) => ({ ...(row.raw ?? {}), ...row }));
}

function dedupeRawById(records) {
  return [...new Map(records.filter(Boolean).map((record) => [text(record.id || record.source_url || record.url || record.title), record])).values()];
}

function normalizeMarketListing(raw, catalog) {
  const classification = classifyMarketListing(raw, catalog);
  const matchedVariant = classification.variantId ? catalog.variantById.get(classification.variantId) : null;
  const matchedSeries = classification.seriesId ? catalog.seriesById.get(classification.seriesId) : null;
  const reviewRequired = classification.marketReviewType === "unknown" || (!classification.variantId && !classification.seriesId);

  const row = {
    id: text(raw.id) || stableId("market", raw.source_url, raw.title, raw.listed_at),
    variant_id: classification.variantId || null,
    matched_variant_id: classification.variantId || null,
    series_id: classification.seriesId || matchedVariant?.series_id || matchedSeries?.id || null,
    title: text(raw.title || raw.name),
    listing_type: classification.listingType,
    market_review_type: classification.marketReviewType,
    classification_reason: classification.reason,
    classification_confidence: classification.confidence,
    classification_details: classification.details,
    price: number(raw.price),
    status: normalizeMarketStatus(raw.status),
    source: text(raw.source) || "mercari",
    source_type: "marketplace",
    source_url: text(raw.source_url || raw.url),
    listed_at: nullableText(raw.listed_at || raw.created_at || raw.createdAt),
    sold_at: nullableText(raw.sold_at || raw.soldAt),
    last_observed_at: nullableText(raw.last_observed_at || raw.observed_at || raw.fetched_at || raw.raw?.fetchedAt || raw.listed_at || new Date().toISOString()),
    confidence: reviewRequired ? 0.25 : classification.confidence,
    review_required: reviewRequired,
    raw,
  };
  return applyMarketPersistenceSafety(row, raw);
}

function buildObservationRows(rows) {
  const observedAt = new Date();
  observedAt.setUTCHours(0, 0, 0, 0);
  const bucket = observedAt.toISOString().slice(0, 10).replace(/[^0-9]/g, "");
  return rows
    .filter((row) => Number.isFinite(row.price))
    .map((row) => ({
      id: stableId("market-observation", bucket, row.id),
      listing_id: row.id,
      variant_id: row.variant_id,
      series_id: row.series_id,
      price: row.price,
      status: row.status,
      source: row.source,
      observed_at: row.last_observed_at || observedAt.toISOString(),
      raw: {
        classification_confidence: row.classification_confidence,
        review_required: row.review_required,
      },
    }));
}

async function loadReferenceIds() {
  const [seriesIds, variantIds] = await Promise.all([
    fetchIdSetSafe("series", "upsert-market"),
    fetchIdSetSafe("variants", "upsert-market"),
  ]);
  return { seriesIds, variantIds };
}

function applyDbReferenceSafety(row, referenceIds) {
  const next = { ...row };
  let droppedReference = false;

  if (next.variant_id && !referenceIds.variantIds.has(next.variant_id)) {
    next.variant_id = null;
    next.matched_variant_id = null;
    droppedReference = true;
  }

  if (next.series_id && !referenceIds.seriesIds.has(next.series_id)) {
    next.series_id = null;
    droppedReference = true;
  }

  if (droppedReference) {
    next.review_required = true;
    next.confidence = Math.min(next.confidence, 0.25);
    next.classification_details = {
      ...(next.classification_details ?? {}),
      db_reference_missing: true,
    };
  }

  return next;
}

function classifyMarketListing(raw, catalog) {
  const title = normalize(`${raw.title || raw.name || ""} ${expandAliases(raw.title || raw.name || "")}`);
  const explicitVariant = raw.variant_id || raw.variantId;
  const explicitSeries = raw.series_id || raw.seriesId;
  const typeSignal = classifyListingType(title);
  const matchedVariants = resolveVariants(title, catalog, explicitVariant);
  const matchedSeries = explicitSeries
    ? catalog.seriesById.get(explicitSeries)
    : resolveSeries(title, catalog);

  if (typeSignal.listingType === "complete_set") {
    return result("complete_set", "full_set", "", explicitSeries || matchedSeries?.id || matchedVariants[0]?.series_id || "", typeSignal.reason, typeSignal.confidence, typeSignal.keywords, []);
  }

  if (matchedVariants.length > 1 || typeSignal.listingType === "partial_set") {
    return result("partial_set", "partial_set", matchedVariants[0]?.id || explicitVariant || "", matchedVariants[0]?.series_id || explicitSeries || matchedSeries?.id || "", matchedVariants.length > 1 ? "multiple_variants_detected" : typeSignal.reason, Math.max(typeSignal.confidence, matchedVariants.length > 1 ? 0.82 : 0), typeSignal.keywords, matchedVariants.map((variant) => variant.id));
  }

  if (typeSignal.listingType === "rare_single" || typeSignal.listingType === "secret_single") {
    return result(typeSignal.listingType, "rare_or_secret", matchedVariants[0]?.id || "", matchedVariants[0]?.series_id || explicitSeries || matchedSeries?.id || "", typeSignal.reason, typeSignal.confidence, typeSignal.keywords, matchedVariants.map((variant) => variant.id));
  }

  if (matchedVariants.length === 1) {
    return result("single", "single", matchedVariants[0].id, matchedVariants[0].series_id, "single_variant_detected", 0.86, matchedVariants[0].matchedTerms, [matchedVariants[0].id]);
  }

  if (matchedSeries) {
    return result("unknown", "unknown", "", matchedSeries.id, "series_only_match", 0.32, matchedSeries.matchedTerms, []);
  }

  return result(typeSignal.listingType, toReviewType(typeSignal.listingType), "", "", typeSignal.reason, typeSignal.confidence, typeSignal.keywords, []);
}

function classifyListingType(title) {
  const completeMatch = title.match(/全\d+種|全部揃(?:って)?(?:ます|います)?|フルコンプ/);
  if (completeMatch) {
    return { listingType: "complete_set", reason: "full_set_pattern", confidence: 0.94, keywords: [completeMatch[0]] };
  }
  const numberedSetMatch = title.match(/(?:ノーマル)?\d+種セット|\d+点セット/);
  if (numberedSetMatch) {
    return { listingType: "partial_set", reason: "numbered_set_pattern", confidence: 0.86, keywords: [numberedSetMatch[0]] };
  }
  const rules = [
    { listingType: "complete_set", reason: "full_set_keyword", confidence: 0.92, keywords: ["コンプ", "コンプリート", "全種", "フルセット", "complete", "fullset"] },
    { listingType: "partial_set", reason: "partial_set_keyword", confidence: 0.74, keywords: ["セミコンプ", "準コンプ", "2種", "3種", "4種", "2点", "3点", "4点", "一部", "セット", "よりどり"] },
    { listingType: "secret_single", reason: "secret_keyword", confidence: 0.88, keywords: ["シークレット", "シクレ", "secret", "sec", "隠し", "レア枠"] },
    { listingType: "rare_single", reason: "rare_keyword", confidence: 0.82, keywords: ["レア", "rare", "限定カラー", "レアカラー", "リカラー", "クリアカラー", "当たり"] },
    { listingType: "unknown", reason: "loose_bulk_keyword", confidence: 0.38, keywords: ["まとめ", "まとめ売り", "バラ"] },
  ];

  for (const rule of rules) {
    const keyword = rule.keywords.find((entry) => title.includes(normalize(entry)));
    if (rule.listingType === "rare_single" && /レア(?:は)?(?:含まれ|含み)ません/.test(title)) continue;
    if (keyword) return { ...rule, keywords: [keyword] };
  }

  return { listingType: "unknown", reason: "no_type_keyword", confidence: 0.2, keywords: [] };
}

function resolveVariants(title, catalog, explicitVariant) {
  if (explicitVariant && catalog.variantById.has(explicitVariant)) {
    const variant = catalog.variantById.get(explicitVariant);
    const additional = catalog.variants.filter((entry) => entry.id !== explicitVariant && variantMatches(entry, title, catalog));
    return dedupeById([{ ...variant, matchedTerms: getMatchedTerms(variant, title) }, ...additional.map((entry) => ({ ...entry, matchedTerms: getMatchedTerms(entry, title) }))]);
  }

  return catalog.variants
    .filter((variant) => variantMatches(variant, title, catalog))
    .map((variant) => ({ ...variant, matchedTerms: getMatchedTerms(variant, title) }));
}

function resolveSeries(title, catalog) {
  for (const series of catalog.series) {
    const terms = getSeriesTerms(series);
    const matchedTerms = terms.filter((term) => term && title.includes(term));
    if (matchedTerms.length) return { ...series, matchedTerms };
  }
  return null;
}

function variantMatches(variant, title, catalog) {
  if (variant.variant_type === "provisional") return false;
  const parent = catalog.seriesById.get(variant.series_id);
  if (!parent || !getSeriesTerms(parent).some((term) => title.includes(term))) return false;
  return getVariantTerms(variant).some((term) => term && title.includes(term));
}

function getMatchedTerms(variant, title) {
  return getVariantTerms(variant).filter((term) => term && title.includes(term));
}

function getVariantTerms(variant) {
  return [
    variant.name,
    variant.slug,
    ...(TITLE_ALIASES.find((entry) => entry.names.some((name) => normalize(name) === normalize(variant.name)))?.aliases ?? []),
  ].filter(Boolean).map(normalize).filter((term) => term.length >= 3);
}

function getSeriesTerms(series) {
  return [series.name, series.slug]
    .filter(Boolean)
    .map(normalize)
    .filter((term) => term.length >= 4);
}

function result(listingType, marketReviewType, variantId, seriesId, reason, confidence, matchedKeywords, matchedVariantIds) {
  return {
    listingType,
    marketReviewType,
    variantId,
    seriesId,
    reason,
    confidence,
    details: {
      matched_keywords: matchedKeywords,
      matched_variant_ids: matchedVariantIds,
    },
  };
}

function toReviewType(listingType) {
  if (listingType === "single") return "single";
  if (listingType === "rare_single" || listingType === "secret_single") return "rare_or_secret";
  if (listingType === "complete_set") return "full_set";
  if (listingType === "partial_set") return "partial_set";
  return "unknown";
}

function createImportIssue(tableName, raw, issueType, recordId) {
  return {
    id: `issue-${tableName}-${recordId || raw.id || raw.url || raw.name || Date.now()}`.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 140),
    issue_type: issueType,
    table_name: tableName,
    record_id: recordId || raw.id || "",
    source: raw.source || "mercari",
    source_url: raw.source_url || raw.url || "",
    raw,
    resolved: false,
    note: "自動分類できないため、人間の確認対象として保持",
  };
}

function buildOfficialCatalog(rows) {
  const series = rows.map((raw) => ({
    id: text(raw.series_id || raw.id || raw.slug),
    slug: text(raw.slug || raw.series_slug || raw.id),
    name: text(raw.name || raw.title || raw.product_name),
    franchise: text(raw.franchise || raw.character || raw.work_name || raw.ip),
  }));
  const variants = rows.flatMap((row) => asArray(row.variants || row.items || row.lineup || row.line_up).map((variant) => ({
    id: text(variant.id || variant.variant_id),
    slug: text(variant.slug || variant.id || variant.variant_id),
    series_id: text(row.series_id || row.id || row.slug),
    name: text(variant.name || variant.title || variant.variant_name),
  })));

  return {
    series,
    variants,
    seriesById: new Map(series.map((entry) => [entry.id, entry])),
    variantById: new Map(variants.map((entry) => [entry.id, entry])),
  };
}

function expandAliases(value = "") {
  return TITLE_ALIASES.reduce((expanded, entry) => {
    if (entry.aliases.some((alias) => normalize(expanded).includes(normalize(alias)))) {
      return `${expanded} ${entry.names.join(" ")}`;
    }
    return expanded;
  }, String(value));
}

function normalizeMarketStatus(value) {
  const status = text(value).toLowerCase();
  if (["sold", "sold_out", "soldout", "売り切れ", "売却済み"].includes(status)) return "sold";
  if (["pre_release", "予約", "発売前"].includes(status)) return "pre_release";
  return status || "active";
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] || "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function dedupeById(items) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function loadEnvFile(fileName) {
  const envPath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;
  const body = fs.readFileSync(envPath, "utf8");
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = rest.join("=").replace(/^["']|["']$/g, "");
  }
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function nullableText(value) {
  return text(value) || null;
}

function number(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function stableId(...parts) {
  return parts.filter(Boolean).map((part) => String(part).replace(/[^a-zA-Z0-9_-]+/g, "-")).join("-").slice(0, 120);
}

function normalize(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[（）()・･\s_-]+/g, "");
}
