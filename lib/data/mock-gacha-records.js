import { LISTING_TYPES, SOURCE_TYPES } from "../domain/gacha-schema";

export const mockSeries = [
  seriesRecord("chiikawa-osuwari", "chiikawa-osuwari-mascot", "ちいかわ おすわりマスコット", "ちいかわ", "バンダイ", "マスコット", "3月", "第1週", "2026-03-06", 400, true),
  seriesRecord("pokemon-terrarium", "pokemon-terrarium-mini", "ポケモン テラリウムミニコレクション", "ポケモン", "タカラトミーアーツ", "ミニチュア", "2月", "第3週", "2026-02-18", 500, true),
  seriesRecord("kirby-sweets", "kirby-sweets-charm", "星のカービィ スイーツチャーム", "星のカービィ", "バンダイ", "チャーム", "1月", "第4週", "2026-01-24", 400, true),
  seriesRecord("onepiece-wanted", "onepiece-wanted-poster", "ONE PIECE 手配書アクリルスタンド", "ONE PIECE", "バンダイ", "アクリル", "10月", "第2週", "2026-10-09", 500, false),
  seriesRecord("sumikko-cafe", "sumikko-cafe-mini", "すみっコぐらし 喫茶ミニチュア", "すみっコぐらし", "タカラトミーアーツ", "ミニチュア", "11月", "第3週", "2026-11-20", 400, false),
  seriesRecord("capsule-fair-clear", "capsule-toy-fair-limited", "カプセルトイフェア 限定クリアカラー", "オリジナル", "イベント限定", "限定カラー", "3月", "未定", null, 500, false),
];

export const mockVariants = [
  variantRecord("chiikawa-single", "chiikawa-osuwari-chiikawa", "chiikawa-osuwari", "ちいかわ", "normal", "通常", "主役キャラ", true, "#f7c8d8", { single: 1180, complete: 5200, popularSet: 3100 }, { complete: 92, ace: 96, compatibility: 78, limited: 72 }, { preorder: 0, x: 88 }, ["単品強い", "主役級", "コンプ需要"]),
  variantRecord("chiikawa-hachiware", "chiikawa-osuwari-hachiware", "chiikawa-osuwari", "ハチワレ", "normal", "通常", "人気キャラ", true, "#b7d9ff", { single: 1050, complete: 5200, popularSet: 3100 }, { complete: 90, ace: 94, compatibility: 76, limited: 70 }, { preorder: 0, x: 84 }, ["人気キャラ", "単品需要"]),
  variantRecord("chiikawa-usagi", "chiikawa-osuwari-usagi", "chiikawa-osuwari", "うさぎ", "normal", "通常", "当たり枠", true, "#ffe08a", { single: 1320, complete: 5200, popularSet: 3100 }, { complete: 91, ace: 98, compatibility: 80, limited: 74 }, { preorder: 0, x: 90 }, ["当たり枠", "単品最強", "回転早い"]),
  variantRecord("pokemon-pikachu", "pokemon-terrarium-pikachu", "pokemon-terrarium", "ピカチュウ", "normal", "通常", "主役キャラ", true, "#ffe16a", { single: 1280, complete: 5000, popularSet: 2900 }, { complete: 86, ace: 97, compatibility: 91, limited: 68 }, { preorder: 0, x: 86 }, ["単品強い", "棚映え", "ミニチュア互換"]),
  variantRecord("pokemon-gengar", "pokemon-terrarium-gengar", "pokemon-terrarium", "ゲンガー", "normal", "通常", "人気キャラ", true, "#c7b9ff", { single: 1120, complete: 5000, popularSet: 2900 }, { complete: 84, ace: 93, compatibility: 88, limited: 66 }, { preorder: 0, x: 80 }, ["人気キャラ", "単品需要"]),
  variantRecord("kirby-star", "kirby-sweets-star", "kirby-sweets", "スターケーキ", "rare_color", "レアカラー", "レア単品", true, "#ffd4a3", { single: 980, rare: 1480, complete: 4100, popularSet: 2400 }, { complete: 82, ace: 86, compatibility: 74, limited: 84 }, { preorder: 0, x: 76 }, ["レアカラー", "写真映え"]),
  variantRecord("onepiece-luffy", "onepiece-wanted-luffy", "onepiece-wanted", "ルフィ", "normal", "通常", "主役キャラ", false, "#ffcf75", {}, { complete: 84, ace: 96, compatibility: 62, limited: 78 }, { preorder: 74, x: 92 }, ["主役級", "初動注目", "単品需要"]),
  variantRecord("onepiece-zoro", "onepiece-wanted-zoro", "onepiece-wanted", "ゾロ", "normal", "通常", "当たり枠", false, "#a7e3b0", {}, { complete: 84, ace: 98, compatibility: 62, limited: 80 }, { preorder: 82, x: 94 }, ["当たり枠", "予約気配", "単品需要"]),
  variantRecord("onepiece-secret", "onepiece-wanted-secret", "onepiece-wanted", "シークレット手配書", "secret", "シークレット", "シークレット", false, "#d4af37", {}, { complete: 80, ace: 86, compatibility: 58, limited: 96 }, { preorder: 88, x: 88 }, ["シークレット", "限定性", "強気気配"]),
  variantRecord("sumikko-shirokuma", "sumikko-cafe-shirokuma", "sumikko-cafe", "しろくま喫茶テーブル", "normal", "通常", "ミニチュア小物", false, "#c8e7b8", {}, { complete: 94, ace: 86, compatibility: 96, limited: 70 }, { preorder: 68, x: 90 }, ["コンプ需要", "1/12小物", "喫茶テーマ"]),
  variantRecord("sumikko-secret", "sumikko-cafe-secret-menu", "sumikko-cafe", "シークレットメニュー", "secret", "シークレット", "シークレット", false, "#b8e7d0", {}, { complete: 92, ace: 88, compatibility: 94, limited: 92 }, { preorder: 84, x: 86 }, ["シークレット", "コンプ需要", "ミニチュア互換"]),
  variantRecord("fair-clear-blue", "capsule-fair-clear-blue", "capsule-fair-clear", "クリアブルー", "limited_color", "限定カラー", "イベント限定", false, "#bae6fd", {}, { complete: 70, ace: 58, compatibility: 74, limited: 98 }, { preorder: 76, x: 72 }, ["イベント限定", "未定枠", "限定カラー"]),
];

export const mockMarketListings = [
  market("m-1", "chiikawa-usagi", "うさぎ 単品", LISTING_TYPES.SINGLE, 1320, "sold", "mercari", "2026-03-22", 0.86),
  market("m-2", "chiikawa-usagi", "ちいかわ うさぎ 人気キャラセット", LISTING_TYPES.POPULAR_SET, 3100, "sold", "mercari", "2026-03-21", 0.78),
  market("m-3", "chiikawa-single", "ちいかわ 単品", LISTING_TYPES.SINGLE, 1180, "sold", "mercari", "2026-03-20", 0.84),
  market("m-4", "pokemon-pikachu", "ピカチュウ 単品", LISTING_TYPES.SINGLE, 1280, "sold", "mercari", "2026-03-18", 0.82),
  market("m-5", "kirby-star", "スターケーキ レア単品", LISTING_TYPES.RARE_SINGLE, 1480, "sold", "mercari", "2026-02-12", 0.72),
  market("m-6", "onepiece-zoro", "ゾロ 単品 予約", LISTING_TYPES.SINGLE, 1680, "pre_release", "mercari", "2026-09-10", 0.56),
  market("m-7", "onepiece-secret", "シークレット手配書 予告出品", LISTING_TYPES.SECRET_SINGLE, 2400, "pre_release", "mercari", "2026-09-11", 0.52),
  market("m-8", "sumikko-secret", "すみっコ 喫茶 コンプリート予約", LISTING_TYPES.COMPLETE_SET, 4600, "pre_release", "mercari", "2026-10-05", 0.5),
];

export const mockXReactions = [
  xReaction("x-1", "onepiece-zoro", SOURCE_TYPES.USER_X, "ゾロだけ欲しい。これは回す", 280, 76, 22, ["単品需要", "初動注目"], 0.62),
  xReaction("x-2", "sumikko-shirokuma", SOURCE_TYPES.USER_X, "喫茶テーブル全部欲しい。ドール小物に使える", 190, 42, 18, ["コンプ需要", "互換性"], 0.58),
  xReaction("x-3", "onepiece-secret", SOURCE_TYPES.SHOP_X, "シークレット入りの新作、入荷予定です", 120, 34, 10, ["限定性"], 0.76),
];

export const mockRestockEvents = [
  restock("r-1", "chiikawa-usagi", SOURCE_TYPES.SHOP_X, "東京", "秋葉原駅前", "補充告知", "2026-03-22T10:00:00+09:00", 0.76),
  restock("r-2", "pokemon-pikachu", SOURCE_TYPES.OFFICIAL_X, "全国", "公式", "再入荷予定", "2026-03-18T12:00:00+09:00", 0.9),
];

export const mockStockReports = [
  stock("s-1", "chiikawa-usagi", "東京", "秋葉原駅前", "残り少なめ", SOURCE_TYPES.SHOP_X, "2026-03-22T15:00:00+09:00", 0.74),
  stock("s-2", "pokemon-pikachu", "神奈川", "横浜", "売り切れ", SOURCE_TYPES.USER_X, "2026-03-19T18:20:00+09:00", 0.46),
  stock("s-3", "chiikawa-single", "大阪", "梅田", "在庫あり", SOURCE_TYPES.SHOP_X, "2026-03-21T14:30:00+09:00", 0.72),
];

function seriesRecord(id, slug, name, franchise, brand, category, release_month, release_week, release_date, price, is_released) {
  return { id, slug, name, franchise, brand, category, release_month, release_week, release_date, price, is_released, official_url: "" };
}

function variantRecord(id, slug, series_id, name, variant_type, rarity, role, released, color, market, axes, signals, tags) {
  return {
    id,
    slug,
    series_id,
    name,
    variant_type,
    rarity,
    role,
    image: createProductImage(name, rarity, color, "#ffffff"),
    released,
    market,
    axes,
    signals,
    tags,
  };
}

function market(id, variant_id, title, listing_type, price, status, source, listed_at, confidence) {
  return { id, variant_id, title, listing_type, price, status, source, listed_at, confidence };
}

function xReaction(id, variant_id, source_type, text, likes, reposts, quotes, intent_tags, confidence) {
  return { id, variant_id, source_type, text, likes, reposts, quotes, intent_tags, confidence, posted_at: "2026-09-01T12:00:00+09:00" };
}

function restock(id, variant_id, source_type, region, shop_name, event_type, reported_at, confidence) {
  return { id, variant_id, source_type, region, shop_name, event_type, reported_at, confidence };
}

function stock(id, variant_id, region, shop_name, status, source_type, reported_at, confidence) {
  return { id, variant_id, region, shop_name, status, source_type, reported_at, confidence, status_label: status };
}

function createProductImage(kicker, title, color, bg) {
  const safeKicker = escapeXml(kicker);
  const safeTitle = escapeXml(title);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${bg}" />
          <stop offset="1" stop-color="#f8fafc" />
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
