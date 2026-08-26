import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { getEditorialGuideSlugs } from "../lib/domain/editorial-guides.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTACT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXPECTED_GUIDES = Object.freeze([
  "market-price",
  "price-history",
  "stock-restock",
  "forecast-ranking",
]);
const SENSITIVE_ENV_NAMES = Object.freeze([
  "GOOGLE_SITE_VERIFICATION",
  "NEXT_PUBLIC_CONTACT_EMAIL",
  "NEXT_PUBLIC_GOOGLE_ADSENSE_ACCOUNT",
  "AMAZON_ASSOCIATE_TAG",
  "RAKUTEN_AFFILIATE_ID",
  "YAHOO_AFFILIATE_TRACKING_ID",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SHARED_SECRET",
  "GITHUB_TOKEN",
]);

function text(value) {
  return String(value ?? "").trim();
}

function source(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function check(id, status, required, description) {
  return { id, status, required, description };
}

function invalidSiteUrlReason(value) {
  if (!value) return "Canonical production URL is not configured.";

  let url;
  try {
    url = new URL(value);
  } catch {
    return "Canonical production URL is not a valid absolute URL.";
  }

  if (url.protocol !== "https:") return "Canonical production URL must use HTTPS.";
  if (url.username || url.password || url.search || url.hash) return "Canonical production URL must be a clean origin.";
  if (url.pathname !== "/") return "Canonical production URL must not include a path.";
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1") {
    return "Canonical production URL must not point to a local host.";
  }

  const hostname = url.hostname.toLowerCase();
  const previewLikeVercelHost = hostname.endsWith(".vercel.app")
    && (hostname.includes("-git-") || /-[a-z0-9]{8,}$/i.test(hostname.split(".")[0]));
  if (previewLikeVercelHost) return "Canonical production URL must not use an obvious preview hostname.";

  return null;
}

function hasEvery(sourceText, fragments) {
  return fragments.every((fragment) => sourceText.includes(fragment));
}

export function isSitemapSourceReady(sourceText) {
  return hasEvery(sourceText, [
    '{ path: "/",',
    '{ path: "/series",',
    '{ path: "/ranking",',
    '{ path: "/schedule",',
    '{ path: "/guides",',
    "getEditorialGuideSlugs",
    "`/guides/${encodeURIComponent(slug)}`",
    "MAX_SITEMAP_URLS = 50000",
    "entries.length > MAX_SITEMAP_URLS",
  ]);
}

export function isObserverSitemapSourceReady({ robotsText, seriesRouteText, variantRouteText, publicationText }) {
  return hasEvery(robotsText, [
    'absoluteSiteUrl("/sitemap.xml")',
    'absoluteSiteUrl("/series-sitemap.xml")',
    'absoluteSiteUrl("/variant-sitemap.xml")',
    'disallow: ["/api/", "/review/", "/supabase-series"]',
  ])
    && [seriesRouteText, variantRouteText].every((route) => hasEvery(route, [
      'export const dynamic = "force-dynamic"',
      "new Response(buildObserverSitemapXml(entries",
      '"Content-Type": "application/xml; charset=utf-8"',
    ]))
    && hasEvery(publicationText, [
      "MAX_OBSERVER_SITEMAP_URLS = 50000",
      "Observer sitemap exceeds ${MAX_OBSERVER_SITEMAP_URLS} URLs",
      "collectSeriesObserverEntries",
      "collectVariantObserverEntries",
    ]);
}

function buildStaticChecks(root) {
  const robots = source(root, "app/robots.js");
  const sitemap = source(root, "app/sitemap.js");
  const seriesObserverRoute = source(root, "app/series-sitemap.xml/route.js");
  const variantObserverRoute = source(root, "app/variant-sitemap.xml/route.js");
  const sitemapPublication = source(root, "lib/domain/sitemap-publication.js");
  const affiliateProviders = source(root, "lib/domain/affiliate-providers.js");
  const marketLinks = source(root, "lib/domain/market-links.js");
  const rakutenFetcher = source(root, "lib/fetchers/rakuten-market-fetcher.js");
  const rakutenLink = source(root, "lib/domain/rakuten-affiliate-link.js");
  const yahooFetcher = source(root, "lib/fetchers/yahoo-shopping-fetcher.js");
  const yahooLink = source(root, "lib/domain/yahoo-affiliate-link.js");
  const automaticWorkflow = source(root, ".github/workflows/gacha-market-bounded-auto.yml");
  const marketCandidateAudit = source(root, "lib/domain/market-candidate-audit.js");
  const marketBoundedWrite = source(root, "lib/domain/market-bounded-write.js");
  const publicRepository = source(root, "lib/data/supabase-gacha-repository.js");
  const footer = source(root, "components/Footer.js");
  const ranking = source(root, "app/ranking/page.js");
  const forecast = source(root, "lib/domain/forecast-score.js");
  const guideSlugs = getEditorialGuideSlugs();

  const publicCatalogRoutes = [
    "app/series/page.js",
    "app/categories/page.js",
    "app/brands/page.js",
    "app/franchises/page.js",
  ];
  const legalRoutes = [
    "app/privacy/page.js",
    "app/terms/page.js",
    "app/disclaimer/page.js",
    "app/affiliate-disclosure/page.js",
    "app/operator/page.js",
    "app/contact/page.js",
  ];

  return [
    check(
      "robots",
      hasEvery(robots, ["absoluteSiteUrl(\"/sitemap.xml\")", 'disallow: ["/api/", "/review/", "/supabase-series"]']) ? "pass" : "fail",
      true,
      "Robots rules must publish the canonical sitemap and protect non-public routes."
    ),
    check(
      "sitemap",
      isSitemapSourceReady(sitemap) ? "pass" : "fail",
      true,
      "Sitemap must publish core public routes, guides, and retain the 50,000 URL cap."
    ),
    check(
      "observer_sitemaps",
      isObserverSitemapSourceReady({
        robotsText: robots,
        seriesRouteText: seriesObserverRoute,
        variantRouteText: variantObserverRoute,
        publicationText: sitemapPublication,
      }) ? "pass" : "fail",
      true,
      "Root, series, and variant observer sitemaps must remain published with independent 50,000 URL fail-closed caps."
    ),
    check(
      "public_catalog_routes",
      publicCatalogRoutes.every((route) => exists(root, route)) ? "pass" : "fail",
      true,
      "The public catalog and category, brand, and franchise discovery routes must exist."
    ),
    check(
      "legal_routes",
      legalRoutes.every((route) => exists(root, route)) ? "pass" : "fail",
      true,
      "Privacy, terms, disclaimer, advertising disclosure, operator, and contact routes must exist."
    ),
    check(
      "editorial_content",
      guideSlugs.length >= 4 && EXPECTED_GUIDES.every((slug) => guideSlugs.includes(slug)) ? "pass" : "fail",
      true,
      "At least the four published evergreen guides must remain available."
    ),
    check(
      "affiliate_ranking_safety",
      hasEvery(affiliateProviders, ["active: false", "sanitizeAmazonTag"])
        && hasEvery(marketLinks, ["isAffiliate", "amazonParams.set(\"tag\", amazonTag)"])
        && !/affiliate|commission/i.test(ranking)
        && !/affiliate|commission/i.test(forecast)
        ? "pass"
        : "fail",
      true,
      "Affiliate configuration must stay separate from ranking and forecast calculations."
    ),
    check(
      "rakuten_affiliate_code_readiness",
      hasEvery(rakutenFetcher, [
        "IchibaItem/Search/20260701",
        'DEFAULT_REQUEST_ORIGIN = "https://gachalens.com"',
        "DISCOVERY_ELEMENTS",
        "AFFILIATE_ENRICHMENT_ELEMENTS",
        'url.searchParams.set("affiliateId", params.affiliateId)',
        "const sourceUrl = publicItemUrl",
        "buildAffiliateDestinationsByItemCode",
        'responseItemUrl !== affiliateUrl',
        'affiliate_url_source: affiliateUrl ? "rakuten_api" : ""',
        'affiliate_url_contract: affiliateUrl ? "item_search_20260701_item_code_join" : ""',
      ])
        && hasEvery(rakutenLink, [
          "selectRakutenAffiliateListing",
          "sanitizeRakutenAffiliateProvenance",
          "RAKUTEN_AFFILIATE_PROVENANCE_CONTRACT",
          "affiliateUrl: listing.raw?.affiliate_url",
        ])
        && marketCandidateAudit.includes("affiliate_destination: affiliateDestination")
        && hasEvery(marketBoundedWrite, ["affiliate_url: affiliateProvenance.url", "affiliate_url_contract: affiliateProvenance.contract", "public_url: sourceUrl"])
        && hasEvery(marketLinks, ["getRakutenAffiliateDestination", "isAffiliate: true", "isAffiliate: false"])
        && publicRepository.includes("review_required,raw,created_at")
        && footer.includes('<a href="https://developers.rakuten.com/" target="_blank">Supported by Rakuten Developers</a>')
        ? "pass"
        : "fail",
      true,
      "Rakuten integration must use API-issued affiliate URLs, canonical request headers, safe public provenance, and the required Developers credit."
    ),
    check(
      "yahoo_affiliate_code_readiness",
      hasEvery(yahooFetcher, [
        "ShoppingWebService/V3/itemSearch",
        'requestKind: "discovery"',
        "normalizeYahooAffiliateTrackingId",
        "appendYahooAffiliateParameters",
        "MIN_REQUEST_SPACING_MS = 1000",
        "createYahooRequestPacer",
        "buildAffiliateDestinationsByCode",
        'affiliate_url_source: affiliateUrl ? "yahoo_api" : ""',
        'affiliate_url_contract: affiliateUrl ? AFFILIATE_PROVENANCE_CONTRACT : ""',
        'affiliate_url_documentation: affiliateUrl ? AFFILIATE_DOCUMENTATION : ""',
      ])
        && hasEvery(yahooLink, [
          "selectYahooAffiliateListing",
          "sanitizeYahooAffiliateProvenance",
          "YAHOO_AFFILIATE_PROVENANCE_CONTRACT",
          "YAHOO_AFFILIATE_DOCUMENTATION",
          'destinationUrl.searchParams.get("vc_url")',
        ])
        && marketCandidateAudit.includes("sanitizeMarketplaceAffiliateProvenance")
        && hasEvery(marketBoundedWrite, ["sanitizeMarketplaceAffiliateProvenance", "affiliate_url: affiliateProvenance.url", "public_url: sourceUrl"])
        && hasEvery(marketLinks, ["getYahooAffiliateDestination", "yahooAffiliate.href", "isAffiliate: true", "isAffiliate: false"])
        && automaticWorkflow.includes("YAHOO_AFFILIATE_TRACKING_ID: ${{ secrets.YAHOO_AFFILIATE_TRACKING_ID }}")
        && publicRepository.includes("review_required,raw,created_at")
        ? "pass"
        : "fail",
      true,
      "Yahoo integration must preserve ordinary item identity and publish only exact-code, API-issued ValueCommerce destinations."
    ),
  ];
}

function ensureSecretSafe(result, env) {
  const serialized = JSON.stringify(result);
  const leaked = SENSITIVE_ENV_NAMES.some((name) => {
    const value = text(env[name]);
    return value.length >= 4 && serialized.includes(value);
  });
  if (leaked) throw new Error("Launch readiness output included a sensitive environment value.");
}

export function auditLaunchReadiness({ env = process.env, root = ROOT } = {}) {
  const siteUrl = text(env.NEXT_PUBLIC_SITE_URL);
  const contactEmail = text(env.NEXT_PUBLIC_CONTACT_EMAIL);
  const googleVerification = text(env.GOOGLE_SITE_VERIFICATION);
  const adsenseAccount = text(env.NEXT_PUBLIC_GOOGLE_ADSENSE_ACCOUNT);
  const siteUrlError = invalidSiteUrlReason(siteUrl);

  const checks = [
    check(
      "canonical_production_url",
      siteUrlError ? "fail" : "pass",
      true,
      siteUrlError || "A canonical HTTPS production origin is configured."
    ),
    check(
      "public_contact",
      CONTACT_EMAIL.test(contactEmail) ? "pass" : "fail",
      true,
      CONTACT_EMAIL.test(contactEmail)
        ? "A public contact address is configured."
        : "A valid public contact address is required before launch."
    ),
    check(
      "search_console_verification",
      googleVerification ? "pass" : "warn",
      false,
      googleVerification
        ? "Google Search Console verification is configured."
        : "Google Search Console verification is not configured yet."
    ),
    check(
      "adsense_inactive",
      adsenseAccount ? "warn" : "pass",
      false,
      adsenseAccount
        ? "AdSense configuration needs a separate approval and CMP review."
        : "AdSense remains inactive for this launch readiness audit."
    ),
    ...buildStaticChecks(root),
  ];

  const requiredPass = checks.filter((item) => item.required && item.status === "pass").length;
  const requiredFail = checks.filter((item) => item.required && item.status !== "pass").length;
  const warnings = checks.filter((item) => item.status === "warn").length;
  const result = {
    schema_version: 1,
    checks,
    summary: {
      ready: requiredFail === 0,
      required_pass: requiredPass,
      required_fail: requiredFail,
      warnings,
    },
  };

  ensureSecretSafe(result, env);
  return result;
}

export function formatLaunchReadiness(result) {
  const lines = [
    `Launch readiness: ${result.summary.ready ? "ready" : "not ready"}`,
    `Required checks: ${result.summary.required_pass} passed, ${result.summary.required_fail} failed`,
    `Warnings: ${result.summary.warnings}`,
  ];
  for (const item of result.checks) {
    lines.push(`${item.status.toUpperCase()} ${item.required ? "required" : "review"} ${item.id}: ${item.description}`);
  }
  return lines.join("\n");
}

export function parseLaunchReadinessArgs(argv = []) {
  const options = { strict: false, json: false };
  for (const argument of argv) {
    if (argument === "--strict") options.strict = true;
    else if (argument === "--json") options.json = true;
    else throw new Error(`Unknown launch readiness option: ${argument}`);
  }
  return options;
}

function isDirectExecution() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  try {
    const options = parseLaunchReadinessArgs(process.argv.slice(2));
    const result = auditLaunchReadiness();
    process.stdout.write(`${options.json ? JSON.stringify(result, null, 2) : formatLaunchReadiness(result)}\n`);
    if (options.strict && !result.summary.ready) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Launch readiness audit failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 2;
  }
}
