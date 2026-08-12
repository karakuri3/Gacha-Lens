import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildMarketCandidateKey } from "../lib/domain/market-candidate-key.js";
import { buildSanitizedMarketCandidateAudit } from "../lib/domain/market-candidate-audit.js";
import { buildMarketBoundedRows } from "../lib/domain/market-bounded-write.js";
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
  const itemUrl = "https://item.rakuten.co.jp/shop/item-1";
  const affiliateUrl = "https://hb.afl.rakuten.co.jp/hgc/test-link";
  const result = await fetchOne({
    affiliateId: "fake-affiliate-id",
    fetchImpl: async () => response(rakutenBody({ itemUrl, affiliateUrl })),
  });
  assert.equal(result.records[0].source_url, itemUrl);
  assert.equal(result.records[0].raw.public_item_url, itemUrl);
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
  const older = safeListing({ id: "listing-old", last_observed_at: "2026-08-10T00:00:00Z", raw: safeRaw("https://hb.afl.rakuten.co.jp/hgc/old") });
  const newer = safeListing({ id: "listing-new", last_observed_at: "2026-08-11T00:00:00Z", raw: safeRaw("https://hb.afl.rakuten.co.jp/hgc/new") });
  const item = { name: "Hero", series_name: "Example Series", market_listings: [older, newer] };
  const selected = selectRakutenAffiliateListing(item.market_listings);
  const link = buildMarketplaceLinks(item, { RAKUTEN_AFFILIATE_ID: "configured-for-test" }).find((entry) => entry.id === "rakuten");
  assert.equal(selected.id, "listing-new");
  assert.equal(link.href, newer.raw.affiliate_url);
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
    safeListing({ raw: safeRaw("https://attacker.example/redirect") }),
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

test("Rakuten affiliate provenance survives sanitized audit and automatic bounded persistence", async () => {
  const itemUrl = "https://item.rakuten.co.jp/shop/item-1";
  const affiliateUrl = "https://hb.afl.rakuten.co.jp/hgc/provider-issued-link";
  const credentials = ["fake-affiliate-id", "fake-application-id", "fake-access-key"];
  const withAffiliate = await fetchOne({
    affiliateId: credentials[0],
    applicationId: credentials[1],
    accessKey: credentials[2],
    fetchImpl: async () => response(rakutenBody({ itemUrl, affiliateUrl })),
  });
  const withoutAffiliate = await fetchOne({
    affiliateId: "",
    fetchImpl: async () => response(rakutenBody({ itemUrl, affiliateUrl: "" })),
  });
  const affiliateAudit = automaticAudit(withAffiliate.records[0]);
  const ordinaryAudit = automaticAudit(withoutAffiliate.records[0]);
  const affiliateRows = automaticRows(affiliateAudit);
  const ordinaryRows = automaticRows(ordinaryAudit);
  const affiliateListing = affiliateRows.listingRows[0];
  const ordinaryListing = ordinaryRows.listingRows[0];

  assert.equal(affiliateAudit.candidates[0].candidate_key, ordinaryAudit.candidates[0].candidate_key);
  assert.equal(affiliateListing.id, ordinaryListing.id);
  assert.equal(affiliateListing.source_url, itemUrl);
  assert.equal(ordinaryListing.source_url, itemUrl);
  assert.equal(affiliateListing.raw.public_url, itemUrl);
  assert.equal(affiliateListing.raw.affiliate_url, affiliateUrl);
  assert.equal(affiliateListing.raw.affiliate_url_source, "rakuten_api");
  assert.equal(ordinaryListing.raw.affiliate_url, undefined);

  const direct = rakutenLink(affiliateListing, "configured-for-test");
  const fallback = rakutenLink(ordinaryListing, "configured-for-test");
  assert.deepEqual({ href: direct.href, isAffiliate: direct.isAffiliate }, { href: affiliateUrl, isAffiliate: true });
  assert.match(fallback.href, /^https:\/\/search\.rakuten\.co\.jp\/search\/mall\//);
  assert.equal(fallback.isAffiliate, false);

  const output = JSON.stringify({ audit: affiliateAudit, rows: affiliateRows });
  for (const credential of credentials) assert.equal(output.includes(credential), false);
});

test("bounded affiliate provenance fails back for fabricated and unsafe listings", () => {
  const legitimate = safeListing();
  const fabricated = safeListing({ raw: { ...legitimate.raw, affiliate_url_source: "manual" } });
  const reviewRequired = safeListing({ review_required: true });
  const setListing = safeListing({ listing_type: "partial_set" });
  for (const listing of [fabricated, reviewRequired, setListing]) {
    const link = rakutenLink(listing, "configured-for-test");
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
  assert.match(footer, /<a href="https:\/\/developers\.rakuten\.com\/" target="_blank">Supported by Rakuten Developers<\/a>/);
  assert.doesNotMatch(footer, /href="https:\/\/developers\.rakuten\.com\/"[^>]*rel=/);
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
  const sourceUrl = overrides.source_url ?? "https://item.rakuten.co.jp/shop/item-1";
  return {
    id: "listing-1",
    variant_id: "variant-hero",
    listing_type: "single",
    status: "active",
    source: "rakuten",
    source_url: sourceUrl,
    review_required: false,
    last_observed_at: "2026-08-10T00:00:00Z",
    raw: safeRaw("https://hb.afl.rakuten.co.jp/hgc/test"),
    ...overrides,
  };
}

function safeRaw(affiliateUrl) {
  return {
    provider: "rakuten_ichiba",
    source_listing_id: "shop:item-1",
    public_url: "https://item.rakuten.co.jp/shop/item-1",
    source_documentation: "https://webservice.rakuten.co.jp/documentation/ichiba-item-search",
    affiliate_url_source: "rakuten_api",
    affiliate_url: affiliateUrl,
  };
}

function automaticAudit(record) {
  const assessed = {
    ...record,
    market_safety_assessed: true,
    market_safety: {
      accepted: true,
      review_required: false,
      reason: "variant_and_parent_evidence_confirmed",
      confidence: 0.9,
      listing_type: "single",
      matched_variant_ids: [query.variant_id],
      checks: {
        variant_evidence_present: true,
        parent_series_evidence_present: true,
        set_signal_detected: false,
        multiple_variant_candidates: false,
        explicit_variant_conflict: false,
        explicit_label_other_variant_match: false,
        explicit_label_unresolved: false,
        parent_series_edition_conflict: false,
      },
    },
  };
  return buildSanitizedMarketCandidateAudit({
    records: [assessed],
    queryPlan: [query],
    catalog: {
      variants: [{ id: query.variant_id, slug: "hero", name: query.variant_name, series_id: query.series_id, variant_type: "single" }],
      series: [{ id: query.series_id, slug: "example-series", name: query.series_name }],
    },
    runContext: {
      mode: "dry-run",
      source_scope: "planner-apis",
      run_id: "31519031733",
      run_attempt: "1",
      head_sha: "a".repeat(40),
      event_name: "schedule",
      generated_at: "2026-08-11T17:43:36.000Z",
    },
    summary: { safety_assessed_records: 1 },
  });
}

function automaticRows(audit) {
  const candidateKey = audit.candidates[0].candidate_key;
  return buildMarketBoundedRows({
    audit,
    plan: {
      selected_candidate_keys: [candidateKey],
      policy_digest: "b".repeat(64),
      audit_digest: "c".repeat(64),
      plan_digest: "d".repeat(64),
    },
    workflow: { run_id: "31519031733", run_attempt: "1", head_sha: "a".repeat(40) },
    observed_at: "2026-08-11T17:43:36.000Z",
  });
}

function rakutenLink(listing, affiliateId) {
  return buildMarketplaceLinks(
    { name: "Hero", series_name: "Example Series", market_listings: [listing] },
    { RAKUTEN_AFFILIATE_ID: affiliateId }
  ).find((entry) => entry.id === "rakuten");
}
