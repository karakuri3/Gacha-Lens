import { sanitizeRakutenAffiliateProvenance } from "./rakuten-affiliate-link.js";
import { sanitizeYahooAffiliateProvenance } from "./yahoo-affiliate-link.js";

export function buildVerifiedAffiliatePersistenceFields(candidate = {}) {
  const source = candidate?.source;
  const destination = source?.affiliate_destination;
  if (!source || typeof source !== "object" || !destination || typeof destination !== "object") return {};

  const provider = text(source.provider).toLowerCase();
  const publicUrl = text(source.public_url);
  const affiliateUrl = text(destination.url);
  const affiliateUrlSource = text(destination.source);
  const affiliateUrlContract = text(destination.contract);
  const sourceDocumentation = text(destination.documentation);
  if (!provider || !publicUrl || !affiliateUrl || !affiliateUrlSource || !affiliateUrlContract || !sourceDocumentation) return {};

  let verified = null;
  if (provider === "rakuten_ichiba") {
    verified = sanitizeRakutenAffiliateProvenance({
      provider,
      publicUrl,
      affiliateUrl,
      affiliateUrlSource,
      affiliateUrlContract,
      sourceDocumentation,
    });
  } else if (provider === "yahoo_shopping") {
    verified = sanitizeYahooAffiliateProvenance({
      provider,
      listingId: text(source.listing_id),
      publicUrl,
      affiliateUrl,
      affiliateUrlSource,
      affiliateUrlContract,
      sourceDocumentation,
    });
  }

  if (!verified) return {};
  return {
    affiliate_url: verified.url,
    affiliate_url_source: verified.source,
    affiliate_url_contract: verified.contract,
    source_documentation: verified.documentation,
  };
}

function text(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/gu, "").trim();
}
