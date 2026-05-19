import { X_INTENT_TAGS } from "./source-normalizers";

export function buildTrendSummary({ variant, marketSummary = {}, availabilitySummary = {}, xReactions = [], marketListings = [], forecast = {} }) {
  const xIntentCounts = countXIntents(xReactions);
  const activeListings = marketSummary.active_listing_count ?? 0;
  const soldListings = marketSummary.sold_count ?? 0;
  const stockMovement = (availabilitySummary.restock_event_count ?? 0) + (availabilitySummary.stock_report_count ?? 0);
  const releasedRecently = isRecentRelease(variant);
  const rareMentions = countRareMentions(xReactions, marketListings);
  const score = Math.min(100, Math.round(
    (forecast.x ?? 0) * 0.22 +
    Math.min(35, xReactions.length * 7) +
    Math.min(24, activeListings * 4) +
    Math.min(28, soldListings * 8) +
    Math.min(25, stockMovement * 6) +
    (releasedRecently ? 14 : 0) +
    Math.min(18, rareMentions * 6)
  ));

  return {
    score,
    tags: buildTrendTags({ score, xIntentCounts, activeListings, soldListings, stockMovement, availabilitySummary, releasedRecently, rareMentions, marketSummary }),
    x_intent_counts: xIntentCounts,
    x_reaction_count: xReactions.length,
    market_listing_count: marketSummary.listing_count ?? marketListings.length,
    sold_count: soldListings,
    active_listing_count: activeListings,
    stock_movement_count: stockMovement,
    rare_mention_count: rareMentions,
    released_recently: releasedRecently,
  };
}

export function buildCirculationScore({ marketSummary = {}, availabilitySummary = {} }) {
  const score = Math.min(100, Math.round(
    Math.min(42, (marketSummary.active_listing_count ?? 0) * 9) +
    Math.min(35, (marketSummary.sold_count ?? 0) * 10) +
    Math.min(18, (availabilitySummary.stock_report_count ?? 0) * 6) +
    Math.min(18, (availabilitySummary.restock_event_count ?? 0) * 6)
  ));
  if (score >= 70) return { score, label: "今出回っている" };
  if (score >= 42) return { score, label: "流通シグナルあり" };
  if (score > 0) return { score, label: "観測あり" };
  return { score, label: "未取得" };
}

function buildTrendTags({ score, xIntentCounts, activeListings, soldListings, stockMovement, availabilitySummary, releasedRecently, rareMentions, marketSummary }) {
  const tags = [];
  if (score >= 72) tags.push("急上昇");
  if (stockMovement > 0) tags.push("在庫動きあり");
  if ((availabilitySummary.status_counts?.sold_out ?? 0) > 0) tags.push("売り切れ報告");
  if ((availabilitySummary.event_counts?.restock ?? 0) > 0 || (availabilitySummary.event_counts?.replenishment ?? 0) > 0) tags.push("再入荷あり");
  if (xIntentCounts[X_INTENT_TAGS.ATTENTION] || xReactionsStrong(xIntentCounts)) tags.push("X反応強め");
  if (xIntentCounts[X_INTENT_TAGS.ACE_DEMAND] || (marketSummary.type_stats?.single?.sold_count ?? 0) > 0) tags.push("単品需要強め");
  if (xIntentCounts[X_INTENT_TAGS.COMPLETE_DEMAND] || (marketSummary.type_stats?.complete_set?.sold_count ?? 0) > 0) tags.push("コンプ需要強め");
  if (activeListings >= 3) tags.push("出品増加中");
  if (soldListings > 0) tags.push("売れ行きあり");
  if (rareMentions > 0) tags.push("レア言及あり");
  if (releasedRecently) tags.push("発売直後");
  return [...new Set(tags)].slice(0, 5);
}

function xReactionsStrong(counts) {
  return Object.values(counts).reduce((sum, value) => sum + value, 0) >= 2;
}

function countXIntents(xReactions = []) {
  return xReactions.reduce((counts, reaction) => {
    for (const tag of reaction.intent_tags ?? []) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
    return counts;
  }, {});
}

function countRareMentions(xReactions = [], marketListings = []) {
  const xCount = xReactions.filter((reaction) => /レア|シークレット|secret|rare|当たり/.test(reaction.text || "")).length;
  const marketCount = marketListings.filter((listing) => /rare|secret|レア|シークレット|当たり/.test(`${listing.title || ""} ${listing.listing_type || ""}`)).length;
  return xCount + marketCount;
}

function isRecentRelease(variant) {
  const value = variant.release_date || variant.raw?.release_date;
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp < 1000 * 60 * 60 * 24 * 21;
}
