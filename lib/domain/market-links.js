import { getAffiliateProviderConfig } from "./affiliate-providers.js";

function clean(value) {
  return String(value || "").replace(/単品$/u, "").replace(/\s+/g, " ").trim();
}

export function buildMarketSearchQuery(item = {}) {
  const seriesName = clean(item.series_name || item.parent_series?.name);
  const variantName = clean(item.variant_name || item.name);
  return [...new Set([seriesName, variantName, "ガチャ"].filter(Boolean))].join(" ");
}

export function buildMarketplaceLinks(item = {}, env = process.env) {
  const query = buildMarketSearchQuery(item);
  if (!query) return [];
  const affiliate = getAffiliateProviderConfig(env);
  const amazonTag = affiliate.amazon.tag;
  const amazonParams = new URLSearchParams({ k: query });
  if (amazonTag) amazonParams.set("tag", amazonTag);

  return [
    { id: "mercari", label: "メルカリ", href: `https://jp.mercari.com/search?keyword=${encodeURIComponent(query)}`, isAffiliate: false },
    { id: "yahoo", label: "Yahoo!ショッピング", href: `https://shopping.yahoo.co.jp/search?p=${encodeURIComponent(query)}`, isAffiliate: affiliate.yahoo.active },
    { id: "rakuten", label: "楽天市場", href: `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(query)}/`, isAffiliate: affiliate.rakuten.active },
    { id: "amazon", label: "Amazon", href: `https://www.amazon.co.jp/s?${amazonParams.toString()}`, isAffiliate: affiliate.amazon.active },
  ];
}
