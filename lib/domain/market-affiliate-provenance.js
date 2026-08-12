import { sanitizeRakutenAffiliateProvenance } from "./rakuten-affiliate-link.js";
import { sanitizeYahooAffiliateProvenance } from "./yahoo-affiliate-link.js";

export function sanitizeMarketplaceAffiliateProvenance(input = {}) {
  const provider = String(input.provider || "").toLowerCase();
  if (provider === "rakuten_ichiba") return sanitizeRakutenAffiliateProvenance(input);
  if (provider === "yahoo_shopping") return sanitizeYahooAffiliateProvenance(input);
  return null;
}
