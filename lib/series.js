const LISTING_TYPES = {
  SINGLE: "single",
  RARE_SINGLE: "rare_single",
  SECRET_SINGLE: "secret_single",
  COMPLETE_SET: "complete_set",
  PARTIAL_SET: "partial_set",
  POPULAR_SET: "popular_set",
  SEALED_BULK: "sealed_bulk",
  LOOSE_BULK: "loose_bulk",
};

const SOURCE_WEIGHTS = {
  official: 1,
  official_x: 0.92,
  shop_x: 0.76,
  user_x: 0.48,
  marketplace: 0.62,
};

const series = [
  {
    id: "chiikawa-osuwari",
    slug: "chiikawa-osuwari-mascot",
    name: "ちいかわ おすわりマスコット",
    franchise: "ちいかわ",
    brand: "バンダイ",
    category: "マスコット",
    release_month: "3月",
    release_week: "第1週",
    release_date: "2026-03-06",
    price: 400,
    is_released: true,
    official_url: "",
  },
  {
    id: "pokemon-terrarium",
    slug: "pokemon-terrarium-mini",
    name: "ポケモン テラリウムミニコレクション",
    franchise: "ポケモン",
    brand: "タカラトミーアーツ",
    category: "ミニチュア",
    release_month: "2月",
    release_week: "第3週",
    release_date: "2026-02-18",
    price: 500,
    is_released: true,
    official_url: "",
  },
  {
    id: "kirby-sweets",
    slug: "kirby-sweets-charm",
    name: "星のカービィ スイーツチャーム",
    franchise: "星のカービィ",
    brand: "バンダイ",
    category: "チャーム",
    release_month: "1月",
    release_week: "第4週",
    release_date: "2026-01-24",
    price: 400,
    is_released: true,
    official_url: "",
  },
  {
    id: "onepiece-wanted",
    slug: "onepiece-wanted-poster",
    name: "ONE PIECE 手配書アクリルスタンド",
    franchise: "ONE PIECE",
    brand: "バンダイ",
    category: "アクリル",
    release_month: "10月",
    release_week: "第2週",
    release_date: "2026-10-09",
    price: 500,
    is_released: false,
    official_url: "",
  },
  {
    id: "sumikko-cafe",
    slug: "sumikko-cafe-mini",
    name: "すみっコぐらし 喫茶ミニチュア",
    franchise: "すみっコぐらし",
    brand: "タカラトミーアーツ",
    category: "ミニチュア",
    release_month: "11月",
    release_week: "第3週",
    release_date: "2026-11-20",
    price: 400,
    is_released: false,
    official_url: "",
  },
  {
    id: "capsule-fair-clear",
    slug: "capsule-toy-fair-limited",
    name: "カプセルトイフェア 限定クリアカラー",
    franchise: "オリジナル",
    brand: "イベント限定",
    category: "限定カラー",
    release_month: "3月",
    release_week: "未定",
    release_date: null,
    price: 500,
    is_released: false,
    official_url: "",
  },
];

const variants = [
  variant({
    id: "chiikawa-single",
    slug: "chiikawa-osuwari-chiikawa",
    series_id: "chiikawa-osuwari",
    name: "ちいかわ",
    variant_type: "normal",
    rarity: "通常",
    role: "主役キャラ",
    image: createProductImage("ちいかわ", "単品", "#f7c8d8", "#fff7fb"),
    released: true,
    market: { single: 1180, complete: 5200, rare: null, secret: null, popularSet: 3100 },
    sold_count: 38,
    axes: { complete: 92, ace: 96, compatibility: 78, limited: 72 },
    signals: { preorder: 0, x: 88 },
    tags: ["単品強い", "主役級", "コンプ需要"],
  }),
  variant({
    id: "chiikawa-hachiware",
    slug: "chiikawa-osuwari-hachiware",
    series_id: "chiikawa-osuwari",
    name: "ハチワレ",
    variant_type: "normal",
    rarity: "通常",
    role: "人気キャラ",
    image: createProductImage("ハチワレ", "単品", "#b7d9ff", "#f5fbff"),
    released: true,
    market: { single: 1050, complete: 5200, rare: null, secret: null, popularSet: 3100 },
    sold_count: 34,
    axes: { complete: 90, ace: 94, compatibility: 76, limited: 70 },
    signals: { preorder: 0, x: 84 },
    tags: ["人気キャラ", "単品需要"],
  }),
  variant({
    id: "chiikawa-usagi",
    slug: "chiikawa-osuwari-usagi",
    series_id: "chiikawa-osuwari",
    name: "うさぎ",
    variant_type: "normal",
    rarity: "通常",
    role: "当たり枠",
    image: createProductImage("うさぎ", "単品", "#ffe08a", "#fffced"),
    released: true,
    market: { single: 1320, complete: 5200, rare: null, secret: null, popularSet: 3100 },
    sold_count: 42,
    axes: { complete: 91, ace: 98, compatibility: 80, limited: 74 },
    signals: { preorder: 0, x: 90 },
    tags: ["当たり枠", "単品最強", "回転早い"],
  }),
  variant({
    id: "pokemon-pikachu",
    slug: "pokemon-terrarium-pikachu",
    series_id: "pokemon-terrarium",
    name: "ピカチュウ",
    variant_type: "normal",
    rarity: "通常",
    role: "主役キャラ",
    image: createProductImage("PIKACHU", "Terrarium", "#ffe16a", "#fffbea"),
    released: true,
    market: { single: 1280, complete: 5000, rare: null, secret: null, popularSet: 2900 },
    sold_count: 31,
    axes: { complete: 86, ace: 97, compatibility: 91, limited: 68 },
    signals: { preorder: 0, x: 86 },
    tags: ["単品強い", "棚映え", "ミニチュア互換"],
  }),
  variant({
    id: "pokemon-gengar",
    slug: "pokemon-terrarium-gengar",
    series_id: "pokemon-terrarium",
    name: "ゲンガー",
    variant_type: "normal",
    rarity: "通常",
    role: "人気キャラ",
    image: createProductImage("GENGAR", "Terrarium", "#c7b9ff", "#fbf8ff"),
    released: true,
    market: { single: 1120, complete: 5000, rare: null, secret: null, popularSet: 2900 },
    sold_count: 27,
    axes: { complete: 84, ace: 93, compatibility: 88, limited: 66 },
    signals: { preorder: 0, x: 80 },
    tags: ["人気キャラ", "単品需要"],
  }),
  variant({
    id: "kirby-star",
    slug: "kirby-sweets-star",
    series_id: "kirby-sweets",
    name: "スターケーキ",
    variant_type: "rare_color",
    rarity: "レアカラー",
    role: "レア単品",
    image: createProductImage("KIRBY", "Rare Star", "#ffd4a3", "#fffaf0"),
    released: true,
    market: { single: 980, complete: 4100, rare: 1480, secret: null, popularSet: 2400 },
    sold_count: 22,
    axes: { complete: 82, ace: 86, compatibility: 74, limited: 84 },
    signals: { preorder: 0, x: 76 },
    tags: ["レアカラー", "写真映え"],
  }),
  variant({
    id: "onepiece-luffy",
    slug: "onepiece-wanted-luffy",
    series_id: "onepiece-wanted",
    name: "ルフィ",
    variant_type: "normal",
    rarity: "通常",
    role: "主役キャラ",
    image: createProductImage("LUFFY", "Wanted", "#ffcf75", "#fff8e8"),
    released: false,
    axes: { complete: 84, ace: 96, compatibility: 62, limited: 78 },
    signals: { preorder: 74, x: 92 },
    tags: ["主役級", "初動注目", "単品需要"],
  }),
  variant({
    id: "onepiece-zoro",
    slug: "onepiece-wanted-zoro",
    series_id: "onepiece-wanted",
    name: "ゾロ",
    variant_type: "normal",
    rarity: "通常",
    role: "当たり枠",
    image: createProductImage("ZORO", "Wanted", "#a7e3b0", "#f4fff6"),
    released: false,
    axes: { complete: 84, ace: 98, compatibility: 62, limited: 80 },
    signals: { preorder: 82, x: 94 },
    tags: ["当たり枠", "予約気配", "単品需要"],
  }),
  variant({
    id: "onepiece-secret",
    slug: "onepiece-wanted-secret",
    series_id: "onepiece-wanted",
    name: "シークレット手配書",
    variant_type: "secret",
    rarity: "シークレット",
    role: "シークレット",
    image: createProductImage("SECRET", "Wanted", "#d4af37", "#fffbea"),
    released: false,
    axes: { complete: 80, ace: 86, compatibility: 58, limited: 96 },
    signals: { preorder: 88, x: 88 },
    tags: ["シークレット", "限定性", "強気気配"],
  }),
  variant({
    id: "sumikko-shirokuma",
    slug: "sumikko-cafe-shirokuma",
    series_id: "sumikko-cafe",
    name: "しろくま喫茶テーブル",
    variant_type: "normal",
    rarity: "通常",
    role: "ミニチュア小物",
    image: createProductImage("SUMIKKO", "Cafe Table", "#c8e7b8", "#f7fff4"),
    released: false,
    axes: { complete: 94, ace: 86, compatibility: 96, limited: 70 },
    signals: { preorder: 68, x: 90 },
    tags: ["コンプ需要", "1/12小物", "喫茶テーマ"],
  }),
  variant({
    id: "sumikko-secret",
    slug: "sumikko-cafe-secret-menu",
    series_id: "sumikko-cafe",
    name: "シークレットメニュー",
    variant_type: "secret",
    rarity: "シークレット",
    role: "シークレット",
    image: createProductImage("SECRET", "Cafe Menu", "#b8e7d0", "#f4fffb"),
    released: false,
    axes: { complete: 92, ace: 88, compatibility: 94, limited: 92 },
    signals: { preorder: 84, x: 86 },
    tags: ["シークレット", "コンプ需要", "ミニチュア互換"],
  }),
  variant({
    id: "fair-clear-blue",
    slug: "capsule-fair-clear-blue",
    series_id: "capsule-fair-clear",
    name: "クリアブルー",
    variant_type: "limited_color",
    rarity: "限定カラー",
    role: "イベント限定",
    image: createProductImage("CLEAR", "Blue", "#bae6fd", "#f7fcff"),
    released: false,
    axes: { complete: 70, ace: 58, compatibility: 74, limited: 98 },
    signals: { preorder: 76, x: 72 },
    tags: ["イベント限定", "未定枠", "限定カラー"],
  }),
];

const marketListings = [
  listing("m-1", "chiikawa-usagi", LISTING_TYPES.SINGLE, 1320, "sold", "mercari", "2026-03-22", 0.86),
  listing("m-2", "chiikawa-usagi", LISTING_TYPES.POPULAR_SET, 3100, "sold", "mercari", "2026-03-21", 0.78),
  listing("m-3", "chiikawa-single", LISTING_TYPES.SINGLE, 1180, "sold", "mercari", "2026-03-20", 0.84),
  listing("m-4", "pokemon-pikachu", LISTING_TYPES.SINGLE, 1280, "sold", "mercari", "2026-03-18", 0.82),
  listing("m-5", "kirby-star", LISTING_TYPES.RARE_SINGLE, 1480, "sold", "mercari", "2026-02-12", 0.72),
  listing("m-6", "onepiece-zoro", LISTING_TYPES.SINGLE, 1680, "pre_release", "mercari", "2026-09-10", 0.56),
  listing("m-7", "onepiece-secret", LISTING_TYPES.SECRET_SINGLE, 2400, "pre_release", "mercari", "2026-09-11", 0.52),
  listing("m-8", "sumikko-secret", LISTING_TYPES.COMPLETE_SET, 4600, "pre_release", "mercari", "2026-10-05", 0.5),
];

const restockEvents = [
  event("r-1", "chiikawa-usagi", "shop_x", "東京", "秋葉原駅前", "補充告知", "2026-03-22T10:00:00+09:00", 0.76),
  event("r-2", "pokemon-pikachu", "official_x", "全国", "公式", "再入荷予定", "2026-03-18T12:00:00+09:00", 0.9),
];

const stockReports = [
  stock("s-1", "chiikawa-usagi", "東京", "秋葉原駅前", "残り少なめ", "shop_x", "2026-03-22T15:00:00+09:00", 0.74),
  stock("s-2", "pokemon-pikachu", "神奈川", "横浜", "売り切れ", "user_x", "2026-03-19T18:20:00+09:00", 0.46),
  stock("s-3", "chiikawa-single", "大阪", "梅田", "在庫あり", "shop_x", "2026-03-21T14:30:00+09:00", 0.72),
];

const variantList = variants.map(enrichVariant).sort((a, b) => {
  const scoreA = a.is_released ? a.profit_estimate ?? 0 : a.forecast_score ?? 0;
  const scoreB = b.is_released ? b.profit_estimate ?? 0 : b.forecast_score ?? 0;
  return scoreB - scoreA;
});

export async function getSeriesList() {
  return variantList;
}

export async function getAllSeries() {
  return variantList;
}

export async function getSeries() {
  return variantList;
}

export async function fetchSeriesList() {
  return variantList;
}

export async function fetchSeries() {
  return variantList;
}

export async function listSeries() {
  return variantList;
}

export async function getSeriesBySlug(slug) {
  return variantList.find((item) => item.slug === slug || item.series_slug === slug) ?? null;
}

export async function findSeriesBySlug(slug) {
  return getSeriesBySlug(slug);
}

export async function getSeriesDetail(slug) {
  const item = await getSeriesBySlug(slug);
  if (!item) return null;
  return {
    series: item,
    variant: item,
    lineup: item.sibling_variants,
    marketListings: item.market_listings,
    restockInfo: item.restock_events,
    stockReports: item.stock_reports,
  };
}

export async function getSeriesSlugs() {
  return variantList.map((item) => item.slug);
}

export async function getRelatedSeries(slug, limit = 4) {
  const base = variantList.find((item) => item.slug === slug);
  return variantList
    .filter((item) => item.slug !== slug)
    .sort((a, b) => {
      const sameSeries = Number(b.series_id === base?.series_id) - Number(a.series_id === base?.series_id);
      if (sameSeries !== 0) return sameSeries;
      const sameRelease = Number(b.is_released === base?.is_released) - Number(a.is_released === base?.is_released);
      if (sameRelease !== 0) return sameRelease;
      return (b.forecast_score ?? b.profit_estimate ?? 0) - (a.forecast_score ?? a.profit_estimate ?? 0);
    })
    .slice(0, limit);
}

export async function getPriceHistoryMapBySeriesSlugs(slugs = []) {
  return Object.fromEntries(normalizeSlugList(slugs).map((slug) => [slug, getVariantBySlug(slug)?.market_listings ?? []]));
}

export async function getRestockInfoMapBySeriesSlugs(slugs = []) {
  return Object.fromEntries(normalizeSlugList(slugs).map((slug) => [slug, getVariantBySlug(slug)?.restock_events ?? []]));
}

export async function getStockReportMapBySeriesSlugs(slugs = []) {
  return Object.fromEntries(normalizeSlugList(slugs).map((slug) => [slug, getVariantBySlug(slug)?.stock_reports ?? []]));
}

export function getDataModel() {
  return {
    series,
    variants: variantList,
    listingTypes: LISTING_TYPES,
    marketListings,
    restockEvents,
    stockReports,
    sourceWeights: SOURCE_WEIGHTS,
  };
}

export default variantList;

function variant(input) {
  return input;
}

function listing(id, variant_id, listing_type, price, status, source, listed_at, confidence) {
  return { id, variant_id, listing_type, price, status, source, listed_at, confidence };
}

function event(id, variant_id, source_type, region, shop_name, event_type, reported_at, confidence) {
  return { id, variant_id, source_type, region, shop_name, event_type, reported_at, confidence };
}

function stock(id, variant_id, region, shop_name, status, source_type, reported_at, confidence) {
  return { id, variant_id, region, shop_name, status, source_type, reported_at, confidence };
}

function enrichVariant(item) {
  const parent = series.find((entry) => entry.id === item.series_id);
  const itemListings = marketListings.filter((entry) => entry.variant_id === item.id);
  const itemRestock = restockEvents.filter((entry) => entry.variant_id === item.id);
  const itemStock = stockReports.filter((entry) => entry.variant_id === item.id);
  const marketSummary = buildMarketSummary(item, itemListings);
  const forecast = buildForecast(item, itemListings);
  const siblings = variants
    .filter((entry) => entry.series_id === item.series_id)
    .map((entry) => ({ id: entry.id, slug: entry.slug, name: entry.name, rarity: entry.rarity, role: entry.role }));

  return {
    ...item,
    id: item.id,
    variant_id: item.id,
    series_id: parent.id,
    series_slug: parent.slug,
    series_name: parent.name,
    parent_series: parent,
    name: `${item.name} 単品`,
    variant_name: item.name,
    title: `${item.name} 単品`,
    brand: parent.brand,
    character: parent.franchise,
    category: parent.category,
    price: parent.price,
    release_date: parent.release_date,
    releaseDate: parent.release_date,
    schedule_month: parent.release_month,
    schedule_week: parent.release_week,
    is_released: item.released,
    isReleased: item.released,
    image_url: item.image,
    imageUrl: item.image,
    market_listings: itemListings,
    market_summary: marketSummary,
    market_price_median: marketSummary.single,
    marketPriceMedian: marketSummary.single,
    profit_estimate: item.released && Number.isFinite(marketSummary.single) ? marketSummary.single - parent.price : null,
    profitEstimate: item.released && Number.isFinite(marketSummary.single) ? marketSummary.single - parent.price : null,
    forecast_score: forecast.total,
    forecastScore: forecast.total,
    complete_set_score: forecast.complete,
    ace_character_score: forecast.ace,
    compatibility_score: forecast.compatibility,
    limitedness_score: forecast.limited,
    preorder_signal_score: forecast.preorder,
    x_signal_score: forecast.x,
    forecast_breakdown: forecast,
    forecast_tags: item.tags,
    restock_events: itemRestock,
    stock_reports: itemStock,
    sibling_variants: siblings,
    listing_groups: buildListingGroups(marketSummary),
    summary: item.released
      ? `${item.variant_name}の単品相場を主軸に見ます。セット相場は補助情報です。`
      : `${item.variant_name}の発売前期待値を、4軸と予約気配・X反応で見ます。`,
    description: item.released
      ? `${parent.name}の中の個別種。単品、レア単品、コンプセットを分けて判断します。`
      : `${parent.name}の中の個別種。発売前のため相場は出さず、需要の根拠を分解して表示します。`,
  };
}

function buildMarketSummary(item, listings) {
  const values = {
    single: item.market?.single ?? median(listings.filter((entry) => entry.listing_type === LISTING_TYPES.SINGLE && entry.status === "sold").map((entry) => entry.price)),
    rare_single: item.market?.rare ?? median(listings.filter((entry) => entry.listing_type === LISTING_TYPES.RARE_SINGLE && entry.status === "sold").map((entry) => entry.price)),
    secret_single: item.market?.secret ?? median(listings.filter((entry) => entry.listing_type === LISTING_TYPES.SECRET_SINGLE && entry.status === "sold").map((entry) => entry.price)),
    complete_set: item.market?.complete ?? median(listings.filter((entry) => entry.listing_type === LISTING_TYPES.COMPLETE_SET && entry.status === "sold").map((entry) => entry.price)),
    partial_set: median(listings.filter((entry) => entry.listing_type === LISTING_TYPES.PARTIAL_SET && entry.status === "sold").map((entry) => entry.price)),
    popular_set: item.market?.popularSet ?? median(listings.filter((entry) => entry.listing_type === LISTING_TYPES.POPULAR_SET && entry.status === "sold").map((entry) => entry.price)),
  };

  return values;
}

function buildForecast(item, listings) {
  const preorderListings = listings.filter((entry) => entry.status === "pre_release");
  const preorderFromListings = preorderListings.length
    ? Math.min(99, 50 + preorderListings.length * 8 + average(preorderListings.map((entry) => entry.confidence * 30)))
    : item.signals.preorder;
  const preorder = Math.round(Math.max(item.signals.preorder, preorderFromListings || 0));
  const x = Math.round(item.signals.x * 0.8 + getSourceSignal(item.id) * 0.2);
  const total = Math.round(
    item.axes.complete * 0.24 +
      item.axes.ace * 0.25 +
      item.axes.compatibility * 0.16 +
      item.axes.limited * 0.16 +
      preorder * 0.1 +
      x * 0.09
  );

  return {
    total,
    complete: item.axes.complete,
    ace: item.axes.ace,
    compatibility: item.axes.compatibility,
    limited: item.axes.limited,
    preorder,
    x,
    formula: "complete*0.24 + ace*0.25 + compatibility*0.16 + limited*0.16 + preorder*0.10 + x*0.09",
  };
}

function getSourceSignal(variantId) {
  const restock = restockEvents
    .filter((entry) => entry.variant_id === variantId)
    .map((entry) => (SOURCE_WEIGHTS[entry.source_type] ?? 0.4) * entry.confidence * 100);
  const stockSignal = stockReports
    .filter((entry) => entry.variant_id === variantId)
    .map((entry) => (SOURCE_WEIGHTS[entry.source_type] ?? 0.4) * entry.confidence * 100);
  return Math.round(average([...restock, ...stockSignal]) || 0);
}

function buildListingGroups(summary) {
  return [
    { type: LISTING_TYPES.SINGLE, label: "単品相場", value: summary.single },
    { type: LISTING_TYPES.RARE_SINGLE, label: "レア単品", value: summary.rare_single },
    { type: LISTING_TYPES.SECRET_SINGLE, label: "シークレット", value: summary.secret_single },
    { type: LISTING_TYPES.COMPLETE_SET, label: "コンプセット", value: summary.complete_set },
    { type: LISTING_TYPES.PARTIAL_SET, label: "一部セット", value: summary.partial_set },
    { type: LISTING_TYPES.POPULAR_SET, label: "人気キャラセット", value: summary.popular_set },
  ];
}

function getVariantBySlug(slug) {
  return variantList.find((item) => item.slug === slug);
}

function normalizeSlugList(slugs) {
  if (!Array.isArray(slugs)) return [];
  return [...new Set(slugs.filter(Boolean).map(String))];
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function average(values) {
  const filtered = values.filter(Number.isFinite);
  if (!filtered.length) return 0;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function createProductImage(kicker, title, color, bg) {
  const safeKicker = escapeXml(kicker);
  const safeTitle = escapeXml(title);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${bg}" />
          <stop offset="1" stop-color="#ffffff" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="24" stdDeviation="24" flood-color="#0f172a" flood-opacity="0.16" />
        </filter>
      </defs>
      <rect width="900" height="900" rx="64" fill="url(#bg)" />
      <circle cx="450" cy="350" r="228" fill="${color}" opacity="0.9" />
      <rect x="214" y="232" width="472" height="360" rx="58" fill="#ffffff" filter="url(#shadow)" />
      <circle cx="348" cy="370" r="72" fill="${color}" />
      <circle cx="552" cy="370" r="72" fill="${color}" opacity="0.72" />
      <rect x="306" y="490" width="288" height="48" rx="24" fill="#111827" opacity="0.92" />
      <text x="450" y="694" text-anchor="middle" font-family="Arial, sans-serif" font-size="52" font-weight="800" fill="#111827">${safeKicker}</text>
      <text x="450" y="750" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="#475569">${safeTitle}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeXml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
