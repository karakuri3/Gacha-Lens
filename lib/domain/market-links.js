function clean(value) {
  return String(value || "").replace(/単品$/u, "").replace(/\s+/g, " ").trim();
}

export function buildMarketSearchQuery(item = {}) {
  const seriesName = clean(item.series_name || item.parent_series?.name);
  const variantName = clean(item.variant_name || item.name);
  return [...new Set([seriesName, variantName, "ガチャ"].filter(Boolean))].join(" ");
}

export function buildMarketplaceLinks(item = {}) {
  const query = buildMarketSearchQuery(item);
  if (!query) return [];
  const amazonTag = String(process.env.AMAZON_ASSOCIATE_TAG || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80);
  const amazonParams = new URLSearchParams({ k: query });
  if (amazonTag) amazonParams.set("tag", amazonTag);

  return [
    { id: "mercari", label: "メルカリで探す", href: `https://jp.mercari.com/search?keyword=${encodeURIComponent(query)}` },
    { id: "yahoo", label: "Yahoo!で探す", href: `https://shopping.yahoo.co.jp/search?p=${encodeURIComponent(query)}` },
    { id: "rakuten", label: "楽天市場で探す", href: `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(query)}/` },
    { id: "amazon", label: "Amazonで探す", href: `https://www.amazon.co.jp/s?${amazonParams.toString()}` },
  ];
}
