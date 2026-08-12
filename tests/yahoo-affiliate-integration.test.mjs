import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildMarketBoundedRows } from "../lib/domain/market-bounded-write.js";
import { buildSanitizedMarketCandidateAudit } from "../lib/domain/market-candidate-audit.js";
import { buildMarketCandidateKey } from "../lib/domain/market-candidate-key.js";
import { buildMarketplaceLinks } from "../lib/domain/market-links.js";
import { fetchYahooShoppingListingsRaw } from "../lib/fetchers/yahoo-shopping-fetcher.js";

const ROOT = process.cwd();
const itemUrl = "https://store.shopping.yahoo.co.jp/example/item-1.html";
const query = Object.freeze({
  query: "Example Series Hero ガチャ",
  variant_id: "variant-hero",
  series_id: "series-example",
  variant_name: "Hero",
  series_name: "Example Series",
});

test("Yahoo discovery omits affiliate parameters when tracking is not configured", async () => {
  const calls = [];
  const result = await fetchOne({
    fetchImpl: async (url) => {
      calls.push(new URL(url));
      return response(yahooBody());
    },
  });
  assert.equal(result.records.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.has("affiliate_type"), false);
  assert.equal(calls[0].searchParams.has("affiliate_id"), false);
  assert.equal(result.records[0].raw.affiliate_url, "");
});

test("Yahoo uses one ordinary discovery request and one same-query ValueCommerce enrichment", async () => {
  const trackingId = "https%3A%2F%2Fck.jp.ap.valuecommerce.com%2Fservlet%2Freferral%3Fsid%3D111%26pid%3D222%26vc_url%3D";
  const appId = "fake-yahoo-app-id";
  const calls = [];
  const result = await fetchOne({
    appId,
    affiliateTrackingId: trackingId,
    fetchImpl: async (url) => {
      const requestUrl = new URL(url);
      calls.push(requestUrl);
      return response(requestUrl.searchParams.has("affiliate_id")
        ? yahooBody({ url: yahooAffiliateUrl(itemUrl) })
        : yahooBody());
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].searchParams.has("affiliate_type"), false);
  assert.equal(calls[0].searchParams.has("affiliate_id"), false);
  assert.equal(calls[1].searchParams.get("affiliate_type"), "vc");
  assert.equal(calls[1].searchParams.get("affiliate_id"), trackingId);
  assert.equal(calls[0].searchParams.get("query"), calls[1].searchParams.get("query"));
  assert.equal(result.records[0].source_url, itemUrl);
  assert.equal(result.records[0].raw.affiliate_url, yahooAffiliateUrl(itemUrl));
  assert.equal(result.records[0].raw.affiliate_url_source, "yahoo_api");
  assert.equal(result.records[0].raw.affiliate_url_contract, "item_search_v3_valuecommerce_code_join");
  assert.equal(result.records[0].raw.affiliate_url_documentation, "https://developer.yahoo.co.jp/webapi/shopping/affiliate.html");
  const diagnostics = JSON.stringify(result.feedResults);
  assert.equal(diagnostics.includes(trackingId), false);
  assert.equal(diagnostics.includes(appId), false);
});

test("Yahoo affiliate activation preserves record, candidate, item-code, and ordinary URL identity", async () => {
  const ordinary = await fetchOne();
  let calls = 0;
  const affiliate = await fetchOne({
    affiliateTrackingId: "fake-encoded-tracking-value",
    fetchImpl: async () => response(calls++ === 0 ? yahooBody() : yahooBody({ url: yahooAffiliateUrl(itemUrl) })),
  });
  assert.equal(ordinary.records[0].id, affiliate.records[0].id);
  assert.equal(buildMarketCandidateKey(ordinary.records[0]), buildMarketCandidateKey(affiliate.records[0]));
  assert.equal(ordinary.records[0].raw.code, affiliate.records[0].raw.code);
  assert.equal(ordinary.records[0].source_url, affiliate.records[0].source_url);
});

test("Yahoo bounded end-to-end uses only an API-issued affiliate destination", async () => {
  const trackingId = "fake-encoded-tracking-value";
  const affiliateUrl = yahooAffiliateUrl(itemUrl);
  let calls = 0;
  const fetched = await fetchOne({
    affiliateTrackingId: trackingId,
    fetchImpl: async () => response(calls++ === 0 ? yahooBody() : yahooBody({ url: affiliateUrl })),
  });
  const audit = automaticAudit(fetched.records[0]);
  const rows = automaticRows(audit);
  const listing = rows.listingRows[0];
  const ordinaryRecord = structuredClone(fetched.records[0]);
  ordinaryRecord.raw.affiliate_url = "";
  ordinaryRecord.raw.affiliate_url_source = "";
  ordinaryRecord.raw.affiliate_url_contract = "";
  const ordinaryAudit = automaticAudit(ordinaryRecord);
  const ordinaryRows = automaticRows(ordinaryAudit);
  const link = yahooLink(listing, "configured-for-test");

  assert.equal(audit.candidates[0].candidate_key, ordinaryAudit.candidates[0].candidate_key);
  assert.equal(listing.id, ordinaryRows.listingRows[0].id);
  assert.equal(audit.candidates[0].source.public_url, itemUrl);
  assert.equal(listing.source_url, itemUrl);
  assert.equal(listing.raw.public_url, itemUrl);
  assert.equal(listing.raw.source_listing_id, "store:item-1");
  assert.equal(listing.raw.affiliate_url, affiliateUrl);
  assert.deepEqual({ href: link.href, isAffiliate: link.isAffiliate }, { href: affiliateUrl, isAffiliate: true });
  assert.equal(link.listingId, listing.id);

  const serialized = JSON.stringify({ audit, rows });
  assert.equal(serialized.includes(trackingId), false);
  for (const forbidden of ["affiliate_id", "application_id", "authorization", "cookie", "access_key", "raw_response"]) {
    assert.equal(serialized.toLowerCase().includes(forbidden), false);
  }
});

test("Yahoo missing, failed, mismatched, and conflicting enrichment preserve ordinary market data", async () => {
  const cases = [
    async () => response({ hits: [] }),
    ...[403, 404, 429, 500, 503].map((status) => async () => failingResponse(status)),
    async () => response(yahooBody({ code: "other:item" })),
    async () => response({ hits: [
      yahooBody({ url: yahooAffiliateUrl(itemUrl) }).hits[0],
      yahooBody({ url: yahooAffiliateUrl(itemUrl, "different-pid") }).hits[0],
    ] }),
  ];
  for (const enrichmentResponse of cases) {
    let calls = 0;
    const result = await fetchOne({
      affiliateTrackingId: "fake-encoded-tracking-value",
      maxAttempts: 1,
      fetchImpl: async () => calls++ === 0 ? response(yahooBody()) : enrichmentResponse(),
    });
    assert.equal(calls, 2);
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].source_url, itemUrl);
    assert.equal(result.records[0].raw.affiliate_url, "");
    const link = yahooLink(automaticRows(automaticAudit(result.records[0])).listingRows[0], "configured-for-test");
    assert.match(link.href, /^https:\/\/shopping\.yahoo\.co\.jp\/search\?p=/);
    assert.equal(link.isAffiliate, false);
  }
});

test("Yahoo direct CTA stays disabled until server integration is configured", () => {
  const link = yahooLink(safeListing(), "");
  assert.match(link.href, /^https:\/\/shopping\.yahoo\.co\.jp\/search\?p=/);
  assert.equal(link.isAffiliate, false);
});

test("Yahoo rejects fabricated provenance, wrong targets, review rows, and set listings", () => {
  const legitimate = safeListing();
  const cases = [
    safeListing({ raw: { ...legitimate.raw, affiliate_url_source: "manual" } }),
    safeListing({ raw: { ...legitimate.raw, affiliate_url_contract: "manual_referral" } }),
    safeListing({ raw: { ...legitimate.raw, affiliate_url: yahooAffiliateUrl("https://store.shopping.yahoo.co.jp/example/other.html") } }),
    safeListing({ review_required: true }),
    safeListing({ listing_type: "partial_set" }),
    safeListing({ listing_type: "complete_set" }),
  ];
  for (const listing of cases) {
    const link = yahooLink(listing, "configured-for-test");
    assert.match(link.href, /^https:\/\/shopping\.yahoo\.co\.jp\/search\?p=/);
    assert.equal(link.isAffiliate, false);
  }
});

test("Yahoo requests are bounded to one discovery and one enrichment per query", async () => {
  const calls = [];
  const queries = [query, { ...query, query: "Second Series Mage ガチャ", variant_id: "variant-mage", series_id: "series-second" }];
  await fetchOne({
    queries,
    affiliateTrackingId: "fake-encoded-tracking-value",
    fetchImpl: async (url) => {
      const requestUrl = new URL(url);
      calls.push(requestUrl);
      const keyword = requestUrl.searchParams.get("query");
      const code = keyword.startsWith("Second") ? "store:item-2" : "store:item-1";
      const ordinary = code === "store:item-1" ? itemUrl : "https://store.shopping.yahoo.co.jp/example/item-2.html";
      return response(yahooBody({ name: keyword, code, url: requestUrl.searchParams.has("affiliate_id") ? yahooAffiliateUrl(ordinary) : ordinary }));
    },
  });
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((url) => url.searchParams.has("affiliate_id")), [false, true, false, true]);
});

test("Yahoo affiliate integration remains independent from ranking and forecast scoring", () => {
  assert.doesNotMatch(source("app/ranking/page.js"), /YAHOO_AFFILIATE_TRACKING_ID|affiliate_url|commission/i);
  assert.doesNotMatch(source("lib/domain/forecast-score.js"), /YAHOO_AFFILIATE_TRACKING_ID|affiliate_url|commission/i);
});

test("Yahoo public read and sponsored link semantics reuse the existing raw field", () => {
  assert.match(source("lib/data/supabase-gacha-repository.js"), /marketListings: "[^"]*review_required,raw,created_at/);
  assert.match(source("components/TrackedMarketLink.js"), /sponsored noopener noreferrer/);
  assert.match(source("components/MarketplaceLinks.js"), /links\.some\(\(link\) => link\.isAffiliate\)/);
});

async function fetchOne(overrides = {}) {
  return fetchYahooShoppingListingsRaw({
    enabled: true,
    appId: "fake-yahoo-app-id",
    affiliateTrackingId: "",
    queries: [query],
    delayMs: 0,
    sleep: async () => {},
    fetchImpl: async () => response(yahooBody()),
    ...overrides,
  });
}

function yahooBody(overrides = {}) {
  return { hits: [{
    name: "Example Series Hero ガチャ",
    code: "store:item-1",
    price: 1280,
    url: itemUrl,
    inStock: true,
    ...overrides,
  }] };
}

function yahooAffiliateUrl(target, pid = "fake-pid") {
  const url = new URL("https://ck.jp.ap.valuecommerce.com/servlet/referral");
  url.searchParams.set("sid", "fake-sid");
  url.searchParams.set("pid", pid);
  url.searchParams.set("vc_url", target);
  return url.toString();
}

function response(data) {
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => data };
}

function failingResponse(status) {
  return { ok: false, status, headers: { get: () => null }, json: async () => ({}) };
}

function safeListing(overrides = {}) {
  return {
    id: "listing-1",
    variant_id: "variant-hero",
    listing_type: "single",
    status: "active",
    source: "yahoo_shopping",
    source_url: itemUrl,
    review_required: false,
    last_observed_at: "2026-08-12T00:00:00Z",
    raw: {
      provider: "yahoo_shopping",
      source_listing_id: "store:item-1",
      public_url: itemUrl,
      source_documentation: "https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html",
      affiliate_url_documentation: "https://developer.yahoo.co.jp/webapi/shopping/affiliate.html",
      affiliate_url_source: "yahoo_api",
      affiliate_url_contract: "item_search_v3_valuecommerce_code_join",
      affiliate_url: yahooAffiliateUrl(itemUrl),
    },
    ...overrides,
  };
}

function automaticAudit(record) {
  return buildSanitizedMarketCandidateAudit({
    records: [{
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
    }],
    queryPlan: [query],
    catalog: {
      variants: [{ id: query.variant_id, slug: "hero", name: query.variant_name, series_id: query.series_id, variant_type: "single" }],
      series: [{ id: query.series_id, slug: "example-series", name: query.series_name }],
    },
    runContext: {
      mode: "dry-run",
      source_scope: "planner-apis",
      run_id: "31555550001",
      run_attempt: "1",
      head_sha: "a".repeat(40),
      event_name: "schedule",
      generated_at: "2026-08-12T00:00:00.000Z",
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
    workflow: { run_id: "31555550001", run_attempt: "1", head_sha: "a".repeat(40) },
    observed_at: "2026-08-12T00:00:00.000Z",
  });
}

function yahooLink(listing, trackingId) {
  return buildMarketplaceLinks(
    { name: "Hero", series_name: "Example Series", market_listings: [listing] },
    { YAHOO_AFFILIATE_TRACKING_ID: trackingId }
  ).find((entry) => entry.id === "yahoo");
}

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
