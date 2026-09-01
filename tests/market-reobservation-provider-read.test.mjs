import assert from "node:assert/strict";
import test from "node:test";

import { buildMarketplaceListingId } from "../lib/domain/market-canary-write.js";
import { planMarketReobservation } from "../lib/domain/market-reobservation.js";
import {
  buildRakutenExactItemUrl,
  buildYahooExactItemLookupUrl,
  extractYahooItemLookupHit,
  fetchExactMarketReobservation,
  fetchRakutenExactReobservation,
  fetchYahooExactReobservation,
  parseYahooItemLookupJsonp,
  sanitizeReobservationProviderRead,
} from "../lib/fetchers/market-reobservation-provider-read.js";

function listingFixture(provider = "rakuten_ichiba", overrides = {}) {
  const sourceListingId = overrides.source_listing_id ?? (provider === "rakuten_ichiba" ? "shop:item-1" : "shop_item-1");
  const publicUrl = overrides.public_url ?? (provider === "rakuten_ichiba"
    ? "https://item.rakuten.co.jp/shop/item-1/"
    : "https://store.shopping.yahoo.co.jp/shop/item-1.html");
  const source = provider === "rakuten_ichiba" ? "rakuten" : "yahoo_shopping";
  return {
    id: buildMarketplaceListingId({ provider, sourceListingId, publicUrl, title: "Example ガチャ 単品" }),
    variant_id: "variant-1",
    matched_variant_id: "variant-1",
    series_id: "series-1",
    title: "Example ガチャ 単品",
    listing_type: "single",
    market_review_type: "single",
    price: 500,
    status: "active",
    source,
    source_type: "marketplace",
    source_url: publicUrl,
    last_observed_at: "2026-09-01T00:00:00.000Z",
    review_required: false,
    raw: { provider, source_listing_id: sourceListingId, public_url: publicUrl },
    ...overrides,
  };
}

function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function textResponse(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": "application/javascript", ...headers },
  });
}

test("Rakuten exact request uses itemCode without keyword and keeps accessKey out of the URL", () => {
  const url = new URL(buildRakutenExactItemUrl({
    applicationId: "app-id",
    itemCode: "shop:item-1",
  }));
  assert.equal(url.protocol, "https:");
  assert.equal(url.searchParams.get("itemCode"), "shop:item-1");
  assert.equal(url.searchParams.get("keyword"), null);
  assert.equal(url.searchParams.get("accessKey"), null);
  assert.equal(url.searchParams.get("hits"), "1");
  assert.equal(url.searchParams.get("elements"), "itemCode,itemPrice,itemUrl,availability");
});

test("Yahoo exact request uses itemcode + fixed callback without keyword fallback", () => {
  const url = new URL(buildYahooExactItemLookupUrl({
    appId: "yahoo-app",
    itemCode: "shop_item-1",
  }));
  assert.equal(url.protocol, "https:");
  assert.equal(url.searchParams.get("itemcode"), "shop_item-1");
  assert.equal(url.searchParams.get("query"), null);
  assert.equal(url.searchParams.get("responsegroup"), "large");
  assert.equal(url.searchParams.get("callback"), "gachaLensItemLookupV1");
});

test("request builders reject non-HTTPS or credential-bearing custom endpoints", () => {
  assert.throws(() => buildRakutenExactItemUrl({ endpoint: "http://example.invalid/api", applicationId: "a", itemCode: "s:i" }));
  assert.throws(() => buildYahooExactItemLookupUrl({ endpoint: "https://user:pass@example.invalid/api", appId: "a", itemCode: "s_i" }));
});

test("Yahoo JSONP parser requires the exact fixed callback wrapper", () => {
  const parsed = parseYahooItemLookupJsonp("gachaLensItemLookupV1({\"ResultSet\":{\"totalResultsReturned\":0}});");
  assert.equal(parsed.ResultSet.totalResultsReturned, 0);
  assert.throws(() => parseYahooItemLookupJsonp("evilCallback({\"ResultSet\":{}});"));
  assert.throws(() => parseYahooItemLookupJsonp("gachaLensItemLookupV1({not-json});"));
});

test("Yahoo parser accepts historical indexed payload and upgrades only official Yahoo item URL to HTTPS", () => {
  const parsed = extractYahooItemLookupHit({
    ResultSet: {
      totalResultsReturned: "1",
      0: {
        Result: {
          0: {
            ItemCode: { Codes: { Code: "shop_item-1" } },
            Hit: {
              0: {
                Url: "http://store.shopping.yahoo.co.jp/shop/item-1.html",
                Price: { _value: "820" },
                Availability: "instock",
              },
            },
          },
        },
      },
    },
  });

  assert.equal(parsed.not_found, false);
  assert.deepEqual(parsed.item, {
    code: "shop_item-1",
    url: "https://store.shopping.yahoo.co.jp/shop/item-1.html",
    price: 820,
    inStock: true,
  });
});

test("Yahoo parser accepts direct Hit payload and fails closed on unknown availability or zero price", () => {
  const valid = extractYahooItemLookupHit({
    ResultSet: {
      totalResultsReturned: 1,
      Result: {
        Hit: {
          Code: "shop_item-2",
          Url: "https://store.shopping.yahoo.co.jp/shop/item-2.html",
          Price: 900,
          Availability: "outofstock",
        },
      },
    },
  });
  assert.equal(valid.item.inStock, false);

  const unknown = extractYahooItemLookupHit({
    ResultSet: {
      totalResultsReturned: 1,
      Result: { Hit: { Code: "shop_item-2", Url: "https://store.shopping.yahoo.co.jp/shop/item-2.html", Price: 900, Availability: "unknown" } },
    },
  });
  assert.equal(unknown.item, null);
  assert.equal(unknown.reason, "unknown_availability");

  const zero = extractYahooItemLookupHit({
    ResultSet: {
      totalResultsReturned: 1,
      Result: { Hit: { Code: "shop_item-2", Url: "https://store.shopping.yahoo.co.jp/shop/item-2.html", Price: 0, Availability: "instock" } },
    },
  });
  assert.equal(zero.item, null);
  assert.equal(zero.reason, "incomplete_exact_item");
});

test("Rakuten exact read sends accessKey only as a header and returns a sanitized exact result", async () => {
  let requestUrl = "";
  let requestHeaders = null;
  const read = await fetchRakutenExactReobservation({
    sourceListingId: "shop:item-1",
    publicUrl: "https://item.rakuten.co.jp/shop/item-1",
  }, {
    applicationId: "app-secret-example",
    accessKey: "access-secret-example",
    maxAttempts: 1,
    fetchImpl: async (url, init) => {
      requestUrl = String(url);
      requestHeaders = init.headers;
      return jsonResponse({ items: [{
        itemCode: "shop:item-1",
        itemUrl: "https://item.rakuten.co.jp/shop/item-1/",
        itemPrice: 680,
        availability: "1",
      }] });
    },
  });

  assert.equal(new URL(requestUrl).searchParams.get("accessKey"), null);
  assert.equal(requestHeaders.accessKey, "access-secret-example");
  assert.equal(read.result.outcome, "seen");
  assert.equal(read.result.source_listing_id, "shop:item-1");
  assert.equal(read.result.price, 680);
  const serialized = JSON.stringify(sanitizeReobservationProviderRead({
    ...read,
    raw_body: "access-secret-example",
    credential: "app-secret-example",
  }));
  assert.doesNotMatch(serialized, /access-secret-example|app-secret-example|raw_body|credential/);
});

test("Rakuten 429 becomes throttled with no false seen result", async () => {
  const read = await fetchRakutenExactReobservation({
    sourceListingId: "shop:item-1",
    publicUrl: "https://item.rakuten.co.jp/shop/item-1/",
  }, {
    applicationId: "app",
    accessKey: "key",
    maxAttempts: 1,
    fetchImpl: async () => jsonResponse({ error: "rate limit" }, 429),
  });
  assert.equal(read.result.outcome, "throttled");
  assert.equal(read.diagnostics.rate_limited, true);
  assert.equal(read.result.price, undefined);
});

test("Yahoo exact read parses fixed JSONP and preserves exact item identity", async () => {
  const body = "gachaLensItemLookupV1(" + JSON.stringify({
    ResultSet: {
      totalResultsReturned: 1,
      Result: {
        Hit: {
          Code: "shop_item-1",
          Url: "http://store.shopping.yahoo.co.jp/shop/item-1.html",
          Price: 760,
          Availability: "instock",
        },
      },
    },
  }) + ");";
  const read = await fetchYahooExactReobservation({
    sourceListingId: "shop_item-1",
    publicUrl: "https://store.shopping.yahoo.co.jp/shop/item-1.html",
  }, {
    appId: "yahoo-secret-example",
    maxAttempts: 1,
    fetchImpl: async (url) => {
      assert.equal(new URL(String(url)).searchParams.get("itemcode"), "shop_item-1");
      return textResponse(body);
    },
  });

  assert.equal(read.result.outcome, "seen");
  assert.equal(read.result.source_listing_id, "shop_item-1");
  assert.equal(read.result.public_url, "https://store.shopping.yahoo.co.jp/shop/item-1.html");
  assert.equal(read.result.price, 760);
  assert.equal(read.result.status, "active");
});

test("provider result with wrong identity is rejected by the re-observation planner", async () => {
  const listing = listingFixture("rakuten_ichiba");
  const read = await fetchExactMarketReobservation(listing, {
    rakuten: {
      applicationId: "app",
      accessKey: "key",
      maxAttempts: 1,
      fetchImpl: async () => jsonResponse({ items: [{
        itemCode: "shop:other-item",
        itemUrl: "https://item.rakuten.co.jp/shop/other-item/",
        itemPrice: 680,
        availability: "1",
      }] }),
    },
  });
  const plan = planMarketReobservation({
    listing,
    providerResult: read.result,
    observedAt: "2026-09-02T00:00:00.000Z",
    observationKey: "exact-provider-mismatch",
  });
  assert.equal(plan.outcome, "identity_mismatch");
  assert.equal(plan.writes.observation_insert, null);
});

test("invalid persisted identity fails before making any provider request", async () => {
  let requested = false;
  const read = await fetchExactMarketReobservation({
    id: "not-a-durable-listing-id",
    source: "rakuten",
    source_url: "https://item.rakuten.co.jp/shop/item-1/",
    raw: { provider: "rakuten_ichiba", source_listing_id: "shop:item-1" },
  }, {
    rakuten: {
      applicationId: "app",
      accessKey: "key",
      fetchImpl: async () => {
        requested = true;
        return jsonResponse({ items: [] });
      },
    },
  });
  assert.equal(requested, false);
  assert.equal(read.result.outcome, "identity_mismatch");
  assert.equal(read.diagnostics.attempt_count, 0);
});
