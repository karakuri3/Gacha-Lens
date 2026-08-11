import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildMarketCandidateKey } from "../lib/domain/market-candidate-key.js";
import { buildMarketplaceLinks } from "../lib/domain/market-links.js";
import { selectRakutenAffiliateListing } from "../lib/domain/rakuten-affiliate-link.js";
import { compactMarketRawPayload } from "../lib/domain/market-raw.js";
import { fetchRakutenMarketListingsRaw } from "../lib/fetchers/rakuten-market-fetcher.js";

const ROOT = process.cwd();
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const query = Object.freeze({
  query: "Example Series Hero ガチャ",
  variant_id: "variant-hero",
  series_id: "series-example",
  variant_name: "Hero",
  series_name: "Example Series",
});

test("Rakuten requests use the canonical Gacha Lens origin and referer by default", async () => {
  const calls = [];
  await fetchOne({
    requestOrigin: "",
    siteUrl: "",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), headers: init.headers });
      return response(rakutenBody());
    },
  });
  assert.equal(calls[0].headers.origin, "https://gachalens.com");
  assert.equal(calls[0].headers.referer, "https://gachalens.com/");
});

test("Rakuten request origin supports a controlled explicit override", async () => {
  let headers;
  await fetchOne({
    requestOrigin: "https://preview.example.test/path/",
    fetchImpl: async (_url, init) => {
      headers = init.headers;
      return response(rakutenBody());
    },
  });
  assert.equal(headers.origin, "https://preview.example.test");
  assert.equal(headers.referer, "https://preview.example.test/");
});

test("Rakuten request origin follows the configured canonical site URL", async () => {
  let headers;
  await fetchOne({
    requestOrigin: "",
    siteUrl: "https://canonical.example.test/catalog",
    fetchImpl: async (_url, init) => {
      headers = init.headers;
      return response(rakutenBody());
    },
  });
  assert.equal(headers.origin, "https://canonical.example.test");
  assert.equal(headers.referer, "https://canonical.example.test/");
});

test("Rakuten omits affiliateId when it is not configured", async () => {
  let requestUrl;
  await fetchOne({
    affiliateId: "",
    fetchImpl: async (url) => {
      requestUrl = new URL(url);
      return response(rakutenBody());
    },
  });
  assert.equal(requestUrl.searchParams.has("affiliateId"), false);
});

test("Rakuten sends the exact configured affiliateId without exposing credentials in diagnostics", async () => {
  const affiliateId = "fake-affiliate-id-for-test";
  const applicationId = "fake-application-id-for-test";
  const accessKey = "fake-access-key-for-test";
  let requestUrl;
  const result = await fetchOne({
    affiliateId,
    applicationId,
    accessKey,
    fetchImpl: async (url) => {
      requestUrl = new URL(url);
      return response(rakutenBody({ affiliateUrl: "https://hb.afl.rakuten.co.jp/hgc/test-link" }));
    },
  });
  assert.equal(requestUrl.searchParams.get("affiliateId"), affiliateId);
  assert.equal(requestUrl.searchParams.get("applicationId"), applicationId);
  assert.equal(requestUrl.searchParams.get("accessKey"), accessKey);
  const diagnostics = JSON.stringify({ feedResults: result.feedResults, issues: result.issues });
  for (const secret of [affiliateId, applicationId, accessKey]) assert.equal(diagnostics.includes(secret), false);
});

test("Rakuten preserves and prefers the official API affiliate URL", async () => {
  const affiliateUrl = "https://hb.afl.rakuten.co.jp/hgc/test-link";
  const result = await fetchOne({
    affiliateId: "fake-affiliate-id",
    fetchImpl: async () => response(rakutenBody({ affiliateUrl })),
  });
  assert.equal(result.records[0].source_url, affiliateUrl);
  assert.equal(result.records[0].raw.affiliate_url, affiliateUrl);
  assert.equal(result.records[0].raw.affiliate_url_source, "rakuten_api");
  assert.equal(compactMarketRawPayload(result.records[0]).affiliate_url, affiliateUrl);
});

test("Rakuten keeps the ordinary item URL when no affiliate URL is returned", async () => {
  const itemUrl = "https://item.rakuten.co.jp/shop/item-1";
  const result = await fetchOne({ fetchImpl: async () => response(rakutenBody({ itemUrl })) });
  assert.equal(result.records[0].source_url, itemUrl);
  assert.equal(result.records[0].raw.affiliate_url, "");
  assert.equal(result.records[0].raw.affiliate_url_source, "");
});

test("affiliate activation does not change Rakuten listing or candidate identity", async () => {
  const itemUrl = "https://item.rakuten.co.jp/shop/item-1";
  const ordinary = await fetchOne({ fetchImpl: async () => response(rakutenBody({ itemUrl })) });
  const affiliate = await fetchOne({
    affiliateId: "fake-affiliate-id",
    fetchImpl: async () => response(rakutenBody({ itemUrl, affiliateUrl: "https://hb.afl.rakuten.co.jp/hgc/test-link" })),
  });
  assert.equal(ordinary.records[0].id, affiliate.records[0].id);
  assert.equal(buildMarketCandidateKey(ordinary.records[0]), buildMarketCandidateKey(affiliate.records[0]));
});

test("public marketplace links use a current safe API-derived Rakuten affiliate URL", () => {
  const older = safeListing({ id: "listing-old", last_observed_at: "2026-08-10T00:00:00Z", source_url: "https://hb.afl.rakuten.co.jp/hgc/old" });
  const newer = safeListing({ id: "listing-new", last_observed_at: "2026-08-11T00:00:00Z", source_url: "https://hb.afl.rakuten.co.jp/hgc/new" });
  const item = { name: "Hero", series_name: "Example Series", market_listings: [older, newer] };
  const selected = selectRakutenAffiliateListing(item.market_listings);
  const link = buildMarketplaceLinks(item, { RAKUTEN_AFFILIATE_ID: "configured-for-test" }).find((entry) => entry.id === "rakuten");
  assert.equal(selected.id, "listing-new");
  assert.equal(link.href, newer.source_url);
  assert.equal(link.isAffiliate, true);
  assert.equal(link.listingId, "listing-new");
});

test("a stored API affiliate URL remains inactive until the server integration is configured", () => {
  const link = buildMarketplaceLinks({
    name: "Hero",
    series_name: "Example Series",
    market_listings: [safeListing()],
  }, { RAKUTEN_AFFILIATE_ID: "" }).find((entry) => entry.id === "rakuten");
  assert.match(link.href, /^https:\/\/search\.rakuten\.co\.jp\/search\/mall\//);
  assert.equal(link.isAffiliate, false);
});

test("unsafe or review-required Rakuten rows fall back to a non-affiliate search URL", () => {
  const unsafe = [
    safeListing({ review_required: true }),
    safeListing({ raw: { provider: "rakuten_ichiba", affiliate_url_source: "manual", affiliate_url: "https://hb.afl.rakuten.co.jp/hgc/test" } }),
    safeListing({ source_url: "https://attacker.example/redirect" }),
  ];
  for (const listing of unsafe) {
    const link = buildMarketplaceLinks(
      { name: "Hero", series_name: "Example Series", market_listings: [listing] },
      { RAKUTEN_AFFILIATE_ID: "configured-for-test" }
    )
      .find((entry) => entry.id === "rakuten");
    assert.match(link.href, /^https:\/\/search\.rakuten\.co\.jp\/search\/mall\//);
    assert.equal(link.isAffiliate, false);
  }
});

test("public read mapping includes raw provenance without changing DB schema", () => {
  const repository = source("lib/data/supabase-gacha-repository.js");
  assert.match(repository, /marketListings: "[^"]*review_required,raw,created_at/);
  assert.doesNotMatch(repository, /affiliate_url\s*:/);
});

test("Rakuten sponsored semantics, disclosure, and official Developers credit remain visible", () => {
  assert.match(source("components/TrackedMarketLink.js"), /sponsored noopener noreferrer/);
  assert.match(source("components/MarketplaceLinks.js"), /links\.some\(\(link\) => link\.isAffiliate\)/);
  const footer = source("components/Footer.js");
  assert.match(footer, /<a href="https:\/\/developers\.rakuten\.com\/" target="_blank" rel="noopener noreferrer">Supported by Rakuten Developers<\/a>/);
});

test("Rakuten affiliate integration remains independent from ranking and forecast scoring", () => {
  assert.doesNotMatch(source("app/ranking/page.js"), /RAKUTEN_AFFILIATE_ID|affiliate_url|commission/i);
  assert.doesNotMatch(source("lib/domain/forecast-score.js"), /RAKUTEN_AFFILIATE_ID|affiliate_url|commission/i);
});

async function fetchOne(overrides = {}) {
  return fetchRakutenMarketListingsRaw({
    enabled: true,
    applicationId: "application-id",
    accessKey: "access-key",
    affiliateId: "",
    requestOrigin: "https://gachalens.com",
    queries: [query],
    delayMs: 0,
    sleep: async () => {},
    ...overrides,
  });
}

function rakutenBody(overrides = {}) {
  return {
    items: [{
      itemName: "Example Series Hero ガチャ",
      itemCode: "shop:item-1",
      itemPrice: 1280,
      itemUrl: "https://item.rakuten.co.jp/shop/item-1",
      availability: "1",
      ...overrides,
    }],
  };
}

function response(data) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => data,
  };
}

function safeListing(overrides = {}) {
  const sourceUrl = overrides.source_url ?? "https://hb.afl.rakuten.co.jp/hgc/test";
  return {
    id: "listing-1",
    variant_id: "variant-hero",
    listing_type: "single",
    status: "active",
    source: "rakuten",
    source_url: sourceUrl,
    review_required: false,
    last_observed_at: "2026-08-10T00:00:00Z",
    raw: {
      provider: "rakuten_ichiba",
      itemCode: "shop:item-1",
      source_documentation: "https://webservice.rakuten.co.jp/documentation/ichiba-item-search",
      affiliate_url_source: "rakuten_api",
      affiliate_url: sourceUrl,
    },
    ...overrides,
  };
}
