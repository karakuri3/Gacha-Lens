import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  EDITORIAL_GUIDES,
  getEditorialGuide,
  getEditorialGuideSlugs,
} from "../lib/domain/editorial-guides.js";

const ROOT = process.cwd();
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const expectedSlugs = ["market-price", "price-history", "stock-restock", "forecast-ranking"];

test("guide hub exists and publishes exactly the initial evergreen guides", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "app/guides/page.js")), true);
  assert.deepEqual(getEditorialGuideSlugs(), expectedSlugs);
  assert.equal(new Set(getEditorialGuideSlugs()).size, expectedSlugs.length);
});

test("guide titles and descriptions are unique, meaningful, and sectioned", () => {
  assert.equal(new Set(EDITORIAL_GUIDES.map((guide) => guide.title)).size, EDITORIAL_GUIDES.length);
  for (const guide of EDITORIAL_GUIDES) {
    assert.ok(guide.description.trim().length >= 20, guide.slug);
    assert.ok(guide.sections.length >= 3, guide.slug);
    for (const section of guide.sections) {
      assert.ok(section.heading.trim().length > 0, guide.slug);
      assert.ok(section.paragraphs.length >= 2, guide.slug);
    }
  }
});

test("each guide has distinct section headings and a clear editorial eyebrow", () => {
  for (const guide of EDITORIAL_GUIDES) {
    assert.ok(guide.eyebrow.trim().length > 0, guide.slug);
    assert.equal(new Set(guide.sections.map((section) => section.heading)).size, guide.sections.length, guide.slug);
  }
});

test("guides only expose valid internal related links", () => {
  const allowed = new Set(["/series", "/stock", "/restocks", "/ranking", "/schedule"]);
  for (const guide of EDITORIAL_GUIDES) {
    for (const link of guide.relatedLinks) assert.equal(allowed.has(link.href), true, `${guide.slug}: ${link.href}`);
  }
});

test("schedule is a supplemental guide link rather than the primary related action", () => {
  const forecastGuide = getEditorialGuide("forecast-ranking");
  const scheduleLink = forecastGuide.relatedLinks.find((link) => link.href === "/schedule");
  assert.equal(scheduleLink.supplemental, true);
  assert.equal(forecastGuide.relatedLinks[0].href, "/ranking");
});

test("unknown guide is represented as not-found and known guides are static params", () => {
  assert.equal(getEditorialGuide("not-a-guide"), null);
  const text = source("app/guides/[slug]/page.js");
  assert.match(text, /if \(!guide\) notFound\(\)/);
  assert.match(text, /generateStaticParams/);
});

test("guide metadata is canonical, query noindex, and avoids invented publishing dates", () => {
  const hub = source("app/guides/page.js");
  const detail = source("app/guides/[slug]/page.js");
  assert.match(hub, /path: "\/guides"/);
  assert.match(detail, /path: `\/guides\/\$\{guide\.slug\}`/);
  assert.match(detail, /noIndex: hasQueryParameters\(await searchParams\)/);
  assert.match(detail, /type: "article"/);
  assert.doesNotMatch(detail, /datePublished|dateModified|author:/);
});

test("guide detail emits only Article and Breadcrumb structured data", () => {
  const text = source("app/guides/[slug]/page.js");
  assert.match(text, /"@type": "Article"/);
  assert.match(text, /"@type": "BreadcrumbList"/);
  assert.match(text, /publisher: \{ "@id": `\$\{homeUrl\}#organization` \}/);
  assert.doesNotMatch(text, /aggregateRating|review:|offers:/);
});

test("guide pages contain no product-marketplace CTA or sales claim components", () => {
  const pages = [source("app/guides/page.js"), source("app/guides/[slug]/page.js")].join("\n");
  assert.doesNotMatch(pages, /MarketplaceLinks|TrackedMarketLink|CommunityReportForm|ProductImage/);
  assert.match(pages, /関連ページ/);
});

test("sitemap includes the guide hub and every published guide below the existing cap", () => {
  const text = source("app/sitemap.js");
  assert.match(text, /path: "\/guides"/);
  assert.match(text, /getEditorialGuideSlugs/);
  assert.match(text, /\/guides\/\$\{encodeURIComponent\(slug\)\}/);
  assert.match(text, /MAX_SITEMAP_URLS = 50000/);
  assert.match(text, /entries\.length > MAX_SITEMAP_URLS/);
});

test("public navigation links to guides without adding an unimplemented menu item", () => {
  assert.match(source("components/Footer.js"), /href="\/guides"/);
  assert.match(source("app/series/page.js"), /href="\/guides"/);
  assert.match(source("app/ranking/page.js"), /href="\/guides\/forecast-ranking"/);
  assert.match(source("app/schedule/page.js"), /href="\/guides\/forecast-ranking"/);
  assert.match(source("app/restocks/page.js"), /href="\/guides\/stock-restock"/);
});

test("guide copy keeps market price, history, stock, and forecast semantics distinct", () => {
  const bySlug = Object.fromEntries(EDITORIAL_GUIDES.map((guide) => [guide.slug, guide]));
  const market = bySlug["market-price"].sections.flatMap((section) => section.paragraphs).join(" ");
  const history = bySlug["price-history"].sections.flatMap((section) => section.paragraphs).join(" ");
  const stock = bySlug["stock-restock"].sections.flatMap((section) => section.paragraphs).join(" ");
  const forecast = bySlug["forecast-ranking"].sections.flatMap((section) => section.paragraphs).join(" ");
  assert.match(market, /定価.*市場価格|市場価格.*定価/);
  assert.match(market, /単品、部分セット、コンプセット/);
  assert.match(history, /平均、最高、最安/);
  assert.match(history, /売れた数/);
  assert.match(stock, /在庫報告.*再入荷イベント/);
  assert.match(stock, /保証するサービスではなく/);
  assert.match(forecast, /順位や予測スコアは価格ではありません/);
  assert.match(forecast, /アフィリエイト設定/);
});

test("forecast guide describes only signals that the current forecast implementation supports", () => {
  const text = source("lib/domain/forecast-score.js");
  const guide = getEditorialGuide("forecast-ranking");
  const copy = guide.sections.flatMap((section) => section.paragraphs).join(" ");
  for (const term of ["marketListings", "xReactions", "restockEvents", "stockReports"]) assert.match(text, new RegExp(term));
  for (const term of ["市場観測", "在庫や再入荷", "X反応"]) assert.match(copy, new RegExp(term));
  assert.doesNotMatch(copy, /0\.\d+|\d+%|重み/);
});

test("guides do not introduce affiliate-driven ranking, ads, CMP, or tracking writes", () => {
  const pageSources = [source("app/guides/page.js"), source("app/guides/[slug]/page.js"), source("lib/domain/editorial-guides.js")].join("\n");
  assert.doesNotMatch(pageSources, /getAffiliateProviderConfig|MarketplaceLinks|commission.*sort|affiliate.*sort/i);
  assert.doesNotMatch(pageSources, /adsbygoogle|google_ad_client|consent banner|cmp/i);
  assert.doesNotMatch(pageSources, /supabase\.from|insert\(|upsert\(|\/api\/outbound-clicks/i);
});

test("guide copy avoids guarantee language and made-up calls to action", () => {
  const copy = EDITORIAL_GUIDES.flatMap((guide) => [guide.title, guide.description, ...guide.sections.flatMap((section) => section.paragraphs)]).join(" ");
  assert.doesNotMatch(copy, /必ず儲かる|確実に高騰|この商品を買えば|今すぐ購入|買い時保証/);
  assert.doesNotMatch(copy, /広告枠|AdSense|Cookie同意/);
});

test("guides remain independent from ranking and forecast source code", () => {
  const guideData = source("lib/domain/editorial-guides.js");
  assert.doesNotMatch(guideData, /FORECAST_WEIGHTS|releasedPriorityScore|opportunityScore|trend_score/);
  assert.doesNotMatch(source("app/ranking/page.js"), /editorial-guides|affiliate|commission/i);
});

test("guide content stays original across the four routes", () => {
  const firstParagraphs = EDITORIAL_GUIDES.map((guide) => guide.sections[0].paragraphs[0]);
  assert.equal(new Set(firstParagraphs).size, EDITORIAL_GUIDES.length);
});
