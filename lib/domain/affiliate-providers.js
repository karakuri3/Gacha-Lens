const PROVIDERS = Object.freeze({
  mercari: { label: "メルカリ", affiliateMode: "unsupported" },
  yahoo: { label: "Yahoo!ショッピング", affiliateMode: "provider-integration" },
  rakuten: { label: "楽天市場", affiliateMode: "api-link-only" },
  amazon: { label: "Amazon", affiliateMode: "query-parameter" },
});

export function getAffiliateProviderConfig(env = process.env) {
  const amazonTag = sanitizeAmazonTag(env.AMAZON_ASSOCIATE_TAG);
  return {
    mercari: { ...PROVIDERS.mercari, configured: false, active: false },
    yahoo: {
      ...PROVIDERS.yahoo,
      configured: Boolean(String(env.YAHOO_AFFILIATE_TRACKING_ID || "").trim()),
      active: false,
    },
    rakuten: {
      ...PROVIDERS.rakuten,
      configured: Boolean(String(env.RAKUTEN_AFFILIATE_ID || "").trim()),
      active: false,
    },
    amazon: {
      ...PROVIDERS.amazon,
      configured: Boolean(amazonTag),
      active: Boolean(amazonTag),
      tag: amazonTag,
    },
  };
}

export function hasActiveAffiliateProvider(config = getAffiliateProviderConfig()) {
  return Object.values(config).some((provider) => provider.active === true);
}

export function sanitizeAmazonTag(value) {
  return String(value || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80);
}
