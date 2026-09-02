import assert from "node:assert/strict";
import test from "node:test";

import { buildMarketplaceListingId } from "../lib/domain/market-canary-write.js";
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

function resolvedIdentity(provider = "rakuten_ichiba") {
  const row = listingFixture(provider);
  return {
    provider,
    sourceListingId: row.raw.source_listing_id,
    publicUrl: row.source_url,
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

test("Rakuten exact request uses only the reviewed official endpoint and exact itemCode", () => {
  const url = new URL(buildRakutenExactItemUrl({ applicationId: "app-id", itemCode: "shop:item-1" }));
  assert.equal(url.origin, "https://openapi.rakuten.co.jp");
  assert.equal(url.pathname, "/ichibams/api/IchibaItem/Search/20260701");
  assert.equal(url.searchParams.get("itemCode"), "shop:item-1");
  assert.equal(url.searchParams.get("keyword"), null);
  assert.equal(url.searchParams.get("accessKey"), null);
  assert.equal(url.searchParams.get("hits"), "1");
  assert.equal(url.searchParams.get("elements"), "itemCode,itemPrice,itemUrl,availability");
});

test("Yahoo exact request uses only the reviewed official endpoint and exact itemcode", () => {
  const url = new URL(buildYahooExactItemLookupUrl({ appId: "yahoo-app", itemCode: "shop_item-1" }));
  assert.equal(url.origin, "https://shopping.yahooapis.jp");
  assert.equal(url.pathname, "/ShoppingWebService/V1/json/itemLookup");
  assert.equal(url.searchParams.get("itemcode"), "shop_item-1");
  assert.equal(url.searchParams.get("query"), null);
  assert.equal(url.searchParams.get("responsegroup"), "large");
  assert.equal(url.searchParams.get("callback"), "gachaLensItemLookupV1");
});

test("request builders reject arbitrary HTTPS hosts, wrong paths, query injection and credential-bearing endpoints", () => {
  const rakutenInput = { applicationId: "a", itemCode: "s:i" };
  const yahooInput = { appId: "a", itemCode: "s_i" };
  assert.throws(() => buildRakutenExactItemUrl({ ...rakutenInput, endpoint: "https://example.invalid/api" }), /reviewed official API destination/);
  assert.throws(() => buildRakutenExactItemUrl({ ...rakutenInput, endpoint: "https://openapi.rakuten.co.jp/other" }), /reviewed official API destination/);
  assert.throws(() => buildRakutenExactItemUrl({ ...rakutenInput, endpoint: "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?evil=1" }), /reviewed official API destination/);
  assert.throws(() => buildYahooExactItemLookupUrl({ ...yahooInput, endpoint: "https://user:pass@shopping.yahooapis.jp/ShoppingWebService/V1/json/itemLookup" }), /reviewed official API destination/);
  assert.throws(() => buildYahooExactItemLookupUrl({ ...yahooInput, endpoint: "http://shopping.yahooapis.jp/ShoppingWebService/V1/json/itemLookup" }), /reviewed official API destination/);
});

test("arbitrary HTTPS Rakuten endpoint is rejected before accessKey can reach fetch", async () => {
  let requested = false;
  await assert.rejects(() => fetchRakutenExactReobservation(resolvedIdentity("rakuten_ichiba"), {
    applicationId: "app-secret-example",
    accessKey: "access-secret-example",
    endpoint: "https://attacker.example/api",
    fetchImpl: async () => {
      requested = true;
      return jsonResponse({ items: [] });
    },
  }), /reviewed official API destination/);
  assert.equal(requested, false);
});

test("arbitrary HTTPS Yahoo endpoint is rejected before appid can reach fetch", async () => {
  let requested = false;
  await assert.rejects(() => fetchYahooExactReobservation(resolvedIdentity("yahoo_shopping"), {
    appId: "yahoo-secret-example",
    endpoint: "https://attacker.example/api",
    fetchImpl: async () => {
      requested = true;
      return textResponse("gachaLensItemLookupV1({});");
    },
  }), /reviewed official API destination/);
  assert.equal(requested, false);
});

test("Yahoo JSONP parser accepts only the exact callback with no padding or observed /* */ padding", () => {
  const payload = "{\"ResultSet\":{\"totalResultsReturned\":0}}";
  const direct = parseYahooItemLookupJsonp(`gachaLensItemLookupV1(${payload});`);
  const observedPadded = parseYahooItemLookupJsonp(`/* */gachaLensItemLookupV1(${payload});`);
  assert.equal(direct.ResultSet.totalResultsReturned, 0);
  assert.equal(observedPadded.ResultSet.totalResultsReturned, 0);

  for (const invalid of [
    `/**/gachaLensItemLookupV1(${payload});`,
    `/*x*/gachaLensItemLookupV1(${payload});`,
    `/* *//* */gachaLensItemLookupV1(${payload});`,
    `/* */ gachaLensItemLookupV1(${payload});`,
    `/* */\ngachaLensItemLookupV1(${payload});`,
    `evilCallback(${payload});`,
    payload,
    "gachaLensItemLookupV1({not-json});",
  ]) {
    assert.throws(() => parseYahooItemLookupJsonp(invalid));
  }
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
  assert.deepEqual(parsed.item, {
    code: "shop_item-1",
    url: "https://store.shopping.yahoo.co.jp/shop/item-1.html",
    price: 820,
    inStock: true,
  });
});

test("Yahoo parser fails closed on unknown availability or zero price", () => {
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

test("Rakuten exact read sends accessKey only as a header, refuses redirects and sanitizes output", async () => {
  let requestUrl = "";
  let requestInit = null;
  const read = await fetchRakutenExactReobservation(resolvedIdentity("rakuten_ichiba"), {
    applicationId: "app-secret-example",
    accessKey: "access-secret-example",
    maxAttempts: 1,
    fetchImpl: async (url, init) => {
      requestUrl = String(url);
      requestInit = init;
      return jsonResponse({ items: [{
        itemCode: "shop:item-1",
        itemUrl: "https://item.rakuten.co.jp/shop/item-1/",
        itemPrice: 680,
        availability: "1",
      }] });
    },
  });

  assert.equal(new URL(requestUrl).searchParams.get("accessKey"), null);
  assert.equal(requestInit.headers.accessKey, "access-secret-example");
  assert.equal(requestInit.redirect, "error");
  assert.equal(read.result.outcome, "seen");
  assert.equal(read.result.price, 680);
  const serialized = JSON.stringify(sanitizeReobservationProviderRead({
    ...read,
    raw_body: "access-secret-example",
    credential: "app-secret-example",
  }));
  assert.doesNotMatch(serialized, /access-secret-example|app-secret-example|raw_body|credential/);
});

test("Yahoo exact read refuses redirects and preserves exact item identity with observed padding", async () => {
  const body = "/* */gachaLensItemLookupV1(" + JSON.stringify({
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
  let requestInit = null;
  const read = await fetchYahooExactReobservation(resolvedIdentity("yahoo_shopping"), {
    appId: "yahoo-secret-example",
    maxAttempts: 1,
    fetchImpl: async (url, init) => {
      assert.equal(new URL(String(url)).searchParams.get("itemcode"), "shop_item-1");
      requestInit = init;
      return textResponse(body);
    },
  });
  assert.equal(requestInit.redirect, "error");
  assert.equal(read.result.outcome, "seen");
  assert.equal(read.result.source_listing_id, "shop_item-1");
  assert.equal(read.result.public_url, "https://store.shopping.yahoo.co.jp/shop/item-1.html");
  assert.equal(read.result.price, 760);
  assert.equal(read.result.status, "active");
});

test("Rakuten 429 becomes throttled with no false seen result", async () => {
  const read = await fetchRakutenExactReobservation(resolvedIdentity("rakuten_ichiba"), {
    applicationId: "app",
    accessKey: "key",
    maxAttempts: 1,
    fetchImpl: async () => jsonResponse({ error: "rate limit" }, 429),
  });
  assert.equal(read.result.outcome, "throttled");
  assert.equal(read.diagnostics.rate_limited, true);
  assert.equal(read.result.price, undefined);
});

test("provider returning a different exact item fails closed before creating seen evidence", async () => {
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
  assert.notEqual(read.result.outcome, "seen");
  assert.equal(read.result.reason, "exact_item_identity_mismatch");
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