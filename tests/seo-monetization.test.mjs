import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { getAffiliateProviderConfig, sanitizeAmazonTag } from "../lib/domain/affiliate-providers.js";
import { buildMarketplaceLinks } from "../lib/domain/market-links.js";
import { collectPublicParentSeriesSlugs } from "../lib/domain/sitemap-publication.js";
import { absoluteSiteUrl, buildPageMetadata, getSiteUrl } from "../lib/site-metadata.js";

const ROOT = process.cwd();
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("site URL normalization supplies an HTTPS origin", () => {
  assert.equal(getSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://gachalens.example" }).toString(), "https://gachalens.example/");
  assert.equal(getSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "gachalens.vercel.app" }).toString(), "https://gachalens.vercel.app/");
  assert.equal(absoluteSiteUrl("/ranking", { NEXT_PUBLIC_SITE_URL: "https://gachalens.example" }), "https://gachalens.example/ranking");
});

test("page metadata includes canonical, Open Graph, Twitter and index controls", () => {
  const metadata = buildPageMetadata({ title: "商品", description: "説明", path: "/series/item", image: "/image.jpg" });
  assert.equal(metadata.alternates.canonical, "/series/item");
  assert.equal(metadata.openGraph.url, "/series/item");
  assert.equal(metadata.openGraph.images[0].url, "/image.jpg");
  assert.equal(metadata.twitter.card, "summary_large_image");
  assert.deepEqual(metadata.robots, { index: true, follow: true });
  assert.equal(buildPageMetadata({ title: "検索", noIndex: true }).robots.index, false);
});

test("Amazon tag is sanitized and only Amazon becomes an active affiliate provider", () => {
  assert.equal(sanitizeAmazonTag(" tag-22<script> "), "tag-22script");
  const config = getAffiliateProviderConfig({
    AMAZON_ASSOCIATE_TAG: "gacha-22",
    RAKUTEN_AFFILIATE_ID: "configured",
    YAHOO_AFFILIATE_TRACKING_ID: "configured",
  });
  assert.equal(config.amazon.active, true);
  assert.equal(config.amazon.tag, "gacha-22");
  assert.equal(config.rakuten.configured, true);
  assert.equal(config.rakuten.active, false);
  assert.equal(config.yahoo.configured, true);
  assert.equal(config.yahoo.active, false);
});

test("marketplace links preserve all providers and only add the approved Amazon parameter", () => {
  const links = buildMarketplaceLinks({ series_name: "作品", name: "キャラ" }, { AMAZON_ASSOCIATE_TAG: "gacha-22" });
  assert.deepEqual(links.map((link) => link.id), ["mercari", "yahoo", "rakuten", "amazon"]);
  assert.equal(links.find((link) => link.id === "amazon").isAffiliate, true);
  assert.match(links.find((link) => link.id === "amazon").href, /[?&]tag=gacha-22/);
  assert.equal(links.filter((link) => link.id !== "amazon").every((link) => link.isAffiliate === false), true);
});

test("robots allows public pages and blocks APIs and administration", () => {
  const text = source("app/robots.js");
  assert.match(text, /allow: "\/"/);
  assert.match(text, /"\/api\/"/);
  assert.match(text, /"\/review\/"/);
  assert.match(text, /sitemap\.xml/);
});

test("sitemap contains discovery and legal routes but not the redirect-only trends route", () => {
  const text = source("app/sitemap.js");
  for (const route of ["/ranking", "/schedule", "/series", "/categories", "/privacy", "/terms", "/disclaimer", "/affiliate-disclosure", "/operator", "/contact"]) {
    assert.match(text, new RegExp(route.replace("/", "\\/")));
  }
  assert.doesNotMatch(text, /path: "\/trends"/);
  assert.match(text, /getPublicSitemapIdentifiers/);
  assert.match(text, /\/series\/\$\{encodeURIComponent\(slug\)\}/);
  assert.match(text, /\/series\/group\/\$\{encodeURIComponent\(slug\)\}/);
  assert.match(text, /MAX_SITEMAP_URLS = 50000/);
});

const sitemapRow = (overrides = {}) => ({
  id: "variant-1",
  slug: "variant-1",
  series_id: "series-1",
  name: "公開単品",
  variant_type: "normal",
  parent: { id: "series-1", slug: "series-one" },
  ...overrides,
});

test("public variant includes its parent series slug", () => {
  assert.deepEqual(collectPublicParentSeriesSlugs([sitemapRow()]), ["series-one"]);
});

test("multiple public variants under one parent produce one parent slug", () => {
  assert.deepEqual(collectPublicParentSeriesSlugs([
    sitemapRow(),
    sitemapRow({ id: "variant-2", slug: "variant-2", name: "公開単品2" }),
  ]), ["series-one"]);
});

test("parent with provisional variants only is excluded", () => {
  assert.deepEqual(collectPublicParentSeriesSlugs([
    sitemapRow({ variant_type: "provisional" }),
  ]), []);
});

test("variant without a slug cannot publish its parent", () => {
  assert.deepEqual(collectPublicParentSeriesSlugs([sitemapRow({ slug: "" })]), []);
});

test("variant without a name cannot publish its parent", () => {
  assert.deepEqual(collectPublicParentSeriesSlugs([sitemapRow({ name: "" })]), []);
});

test("parent without a slug is excluded", () => {
  assert.deepEqual(collectPublicParentSeriesSlugs([
    sitemapRow({ parent: { id: "series-1", slug: "" } }),
  ]), []);
});

test("public sitemap source fetches only catalog identity columns in deterministic pages", () => {
  const text = source("lib/data/public-sitemap-identifiers.js");
  assert.match(text, /id,slug,series_id,name,variant_type,parent:series!inner\(id,slug,franchise,brand,category\)/);
  assert.match(text, /DEFAULT_PAGE_SIZE = 1000/);
  assert.match(text, /variant_type\.is\.null,variant_type\.neq\.provisional/);
  assert.match(text, /\.not\("series_id", "is", null\)/);
  assert.match(text, /\.neq\("slug", ""\)/);
  assert.match(text, /\.neq\("name", ""\)/);
  assert.match(text, /\.order\("id", \{ ascending: true \}\)/);
  assert.match(text, /\.range\(from, from \+ pageSize - 1\)/);
  assert.doesNotMatch(text, /market|signal|stock|reaction/i);
});

test("root metadata exposes website search structured data and verification hooks", () => {
  const text = source("app/layout.js");
  assert.match(text, /SearchAction/);
  assert.match(text, /Organization/);
  assert.match(text, /metadataVerification/);
  assert.match(text, /metadataOther/);
});

test("variant detail publishes Product and Breadcrumb structured data", () => {
  const text = source("app/series/[slug]/page.js");
  assert.match(text, /"@type": "Product"/);
  assert.match(text, /"@type": "BreadcrumbList"/);
  assert.match(text, /buildPageMetadata/);
  assert.match(text, /path: variantHref|const path = variantHref/);
  assert.doesNotMatch(text, /["']offers["']\s*:/);
  assert.doesNotMatch(text, /["']review["']\s*:/);
  assert.doesNotMatch(text, /["']aggregateRating["']\s*:/);
});

test("structured data renderer escapes HTML opening characters", () => {
  assert.match(source("components/StructuredData.js"), /replace\(\/<\/g, "\\\\u003c"\)/);
});

test("footer exposes every public legal and operator route", () => {
  const text = source("components/Footer.js");
  for (const route of ["/privacy", "/terms", "/disclaimer", "/affiliate-disclosure", "/operator", "/contact"]) {
    assert.match(text, new RegExp(`href="${route}"`));
  }
  assert.match(text, /ランキングは広告報酬と切り離して決定/);
});

test("affiliate links are marked sponsored while ordinary links remain unchanged", () => {
  const text = source("components/TrackedMarketLink.js");
  assert.match(text, /sponsored noopener noreferrer/);
  assert.match(text, /data-market-provider/);
  assert.match(text, /\/api\/outbound-clicks/);
});

test("marketplace comparison remains visible at mobile width", () => {
  const css = source("app/globals.css");
  assert.match(css, /\.detail-actions \.market-actions \{ display: grid;/);
  assert.doesNotMatch(css, /\.detail-actions \.market-actions \{ display: none;/);
});

test("all legal routes have metadata and customer-facing copy", () => {
  for (const route of ["privacy", "terms", "disclaimer", "affiliate-disclosure", "operator", "contact"]) {
    const text = source(`app/${route}/page.js`);
    assert.match(text, /buildPageMetadata/);
    assert.match(text, /<LegalPage/);
  }
});

test("privacy disclosure prepares conditional AdSense and personalized-ad controls", () => {
  const text = source("app/privacy/page.js");
  for (const term of ["Google AdSense", "Cookie", "パーソナライズ", "Google広告設定", "第三者"]) {
    assert.match(text, new RegExp(term));
  }
  assert.match(text, /将来有効化した場合/);
  assert.match(text, /myadcenter\.google\.com/);
  assert.match(text, /partner-sites\?hl=ja/);
  assert.match(text, /rel="noopener noreferrer"/);
});

test("AdSense activation gate documents regional CMP requirements without enabling ads", () => {
  const text = source("docs/monetization.md");
  for (const term of ["AdSense activation", "EEA", "英国", "スイス", "Google認定CMP"]) {
    assert.match(text, new RegExp(term));
  }
  assert.match(text, /does not load Google AdSense/);
  assert.match(text, /CMP\) is not implemented/);
});

test("affiliate status is not referenced by ranking or forecast scoring", () => {
  assert.doesNotMatch(source("app/ranking/page.js"), /affiliate|commission|報酬/i);
  assert.doesNotMatch(source("lib/domain/forecast-score.js"), /affiliate|commission|報酬/i);
});
