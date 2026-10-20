import assert from "node:assert/strict";
import test from "node:test";

import {
  describeMercariMcpSearchSafety,
  normalizeMercariMcpSearchResponse,
} from "../lib/fetchers/mercari-mcp-search-normalizer.js";

test("normalizes only sold Mercari C2C products and preserves exact query provenance", () => {
  const result = normalizeMercariMcpSearchResponse({
    products: [
      {
        product_id: "m89767613255",
        title: "mofusand めじるしアクセサリー ベーカリーにゃん クロワッサン",
        price: 300,
        status: "sold",
        category_id: 7380,
        category_name: "カプセルトイ・ガチャガチャ",
        condition_id: 1,
        condition: "新品、未使用",
        seller_id: "638883082",
        created_age: "3 days ago",
        updated_age: "2 days ago",
      },
      {
        product_id: "m60339636910",
        title: "ガチャ mofusand めじるしアクセサリー ベーカリーにゃん クロワッサン",
        price: 350,
        status: "available",
      },
      {
        product_id: "2JXaxXQm4DUr2ZLBdn9dgE",
        title: "Mercari Shops item",
        price: 4041,
        status: "sold",
      },
    ],
  }, {
    query: "mofusand めじるしアクセサリー ベーカリーにゃん クロワッサン",
    fetchedAt: "2026-10-02T10:00:00+09:00",
  });

  assert.equal(result.records.length, 1);
  assert.deepEqual(result.records[0], {
    id: "mercari-m89767613255",
    title: "mofusand めじるしアクセサリー ベーカリーにゃん クロワッサン",
    price: 300,
    status: "sold",
    source: "mercari",
    source_type: "marketplace",
    source_url: "https://jp.mercari.com/item/m89767613255",
    listed_at: null,
    sold_at: null,
    last_observed_at: "2026-10-02T01:00:00.000Z",
    variant_id: null,
    series_id: null,
    raw: {
      provider: "mercari_chatgpt_app_mcp",
      query: "mofusand めじるしアクセサリー ベーカリーにゃん クロワッサン",
      keyword: "mofusand めじるしアクセサリー ベーカリーにゃん クロワッサン",
      product_id: "m89767613255",
      seller_id: "638883082",
      category_id: 7380,
      category_name: "カプセルトイ・ガチャガチャ",
      condition_id: 1,
      condition: "新品、未使用",
      image_url: null,
      created_age: "3 days ago",
      updated_age: "2 days ago",
      observed_at: "2026-10-02T01:00:00.000Z",
      acquisition_mode: "official_chatgpt_app_search",
      commercial_storage_authorization: "unverified",
    },
  });
  assert.equal(result.summary.rejection_counts.not_sold, 1);
  assert.equal(result.summary.rejection_counts.non_c2c_product, 1);
  assert.equal(result.summary.production_write_ready, false);
});

test("fails closed when query provenance is missing", () => {
  const result = normalizeMercariMcpSearchResponse({
    products: [{ product_id: "m12345678901", title: "ガチャ", price: 500, status: "sold" }],
  }, { fetchedAt: "2026-10-02T00:00:00Z" });

  assert.equal(result.records.length, 0);
  assert.equal(result.summary.rejection_counts.missing_query, 1);
});

test("deduplicates repeated product ids inside one search response", () => {
  const result = normalizeMercariMcpSearchResponse({
    products: [
      { product_id: "m12345678901", title: "A", price: 500, status: "sold" },
      { product_id: "m12345678901", title: "A duplicate", price: 500, status: "sold" },
    ],
  }, { query: "test query", fetchedAt: "2026-10-02T00:00:00Z" });

  assert.equal(result.records.length, 1);
  assert.equal(result.summary.rejection_counts.duplicate_product_id, 1);
});

test("does not invent exact sold_at from relative MCP ages", () => {
  const result = normalizeMercariMcpSearchResponse({
    products: [{
      product_id: "m12345678901",
      title: "A",
      price: "900 JPY",
      status: "sold",
      created_age: "3 hours ago",
      updated_age: "1 hour ago",
    }],
  }, { query: "test query", fetchedAt: "2026-10-02T00:00:00Z" });

  assert.equal(result.records[0].sold_at, null);
  assert.equal(result.records[0].last_observed_at, "2026-10-02T00:00:00.000Z");
  assert.equal(result.summary.sold_at_semantics, "not_provided_use_first_observed_at_only");
});

test("safety contract stays fail-closed for Production until storage rights are verified", () => {
  const safety = describeMercariMcpSearchSafety();
  assert.equal(safety.official_interface, true);
  assert.equal(safety.sold_only, true);
  assert.equal(safety.c2c_only, true);
  assert.equal(safety.production_write_ready, false);
  assert.equal(safety.blocking_reason, "commercial_storage_and_republication_rights_unverified");
});
