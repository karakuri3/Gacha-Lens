import assert from "node:assert/strict";
import test from "node:test";
import {
  buildObservedListingLink,
  buildObservedListingLinks,
} from "../lib/domain/market-observed-listings.js";
import {
  RAKUTEN_AFFILIATE_PROVENANCE_CONTRACT,
  RAKUTEN_ITEM_SEARCH_DOCUMENTATION,
} from "../lib/domain/rakuten-affiliate-link.js";

const VARIANT_ID = "tarts-y901539-おやすみ";

function listing(overrides = {}) {
  return {
    id: "rakuten-auc-toysanta-10381220",
    variant_id: VARIANT_ID,
    series_id: "tarts-y901539",
    listing_type: "single",
    price: 568,
    status: "active",
    source: "rakuten",
    source_url: "https://item.rakuten.co.jp/auc-toysanta/g-5l3l0018ik-004/",
    review_required: false,
    last_observed_at: "2026-08-29T00:00:00.000Z",
    raw: {
      provider: "rakuten_ichiba",
      source_listing_id: "auc-toysanta:10381220",
      storefront_id: "auc-toysanta",
      storefront_name: "ToySanta",
    },
    ...overrides,
  };
}

test("observed listing links expose safe direct offers in price order", () => {
  const offers = buildObservedListingLinks({
    variant_id: VARIANT_ID,
    market_listings: [
      listing({ id: "rakuten-expensive", price: 748, source_url: "https://item.rakuten.co.jp/realize-store/qq082607s248jjk4", raw: { provider: "rakuten_ichiba", storefront_id: "realize-store" } }),
      listing(),
      listing({ id: "yahoo-middle", source: "yahoo_shopping", price: 650, source_url: "https://store.shopping.yahoo.co.jp/example/item-1.html", raw: { provider: "yahoo_shopping", storefront_id: "example" } }),
    ],
  });

  assert.deepEqual(offers.map((offer) => offer.price), [568, 650, 748]);
  assert.deepEqual(offers.map((offer) => offer.id), ["rakuten", "yahoo", "rakuten"]);
  assert.equal(offers[0].marketplaceLabel, "楽天市場");
  assert.equal(offers[0].storefrontLabel, "ToySanta");
  assert.equal(offers[0].isAffiliate, false);
});

test("observed listing links fail closed for unsafe or semantically wrong rows", () => {
  const rejected = [
    listing({ review_required: true }),
    listing({ status: "sold_out" }),
    listing({ listing_type: "complete_set" }),
    listing({ variant_id: "other-variant" }),
    listing({ price: 0 }),
    listing({ source_url: "http://item.rakuten.co.jp/example/item" }),
    listing({ source_url: "https://evil.example/item" }),
    listing({ source: "mercari", source_url: "https://jp.mercari.com/item/example" }),
  ];

  for (const row of rejected) {
    assert.equal(buildObservedListingLink(row, { variantId: VARIANT_ID }), null);
  }
});

test("observed listing links dedupe the same canonical public URL", () => {
  const offers = buildObservedListingLinks({
    variant_id: VARIANT_ID,
    market_listings: [
      listing({ id: "first", price: 568 }),
      listing({ id: "second", price: 600, source_url: "https://item.rakuten.co.jp/auc-toysanta/g-5l3l0018ik-004" }),
    ],
  });

  assert.equal(offers.length, 1);
  assert.equal(offers[0].price, 568);
});

test("observed listing links support persisted nested storefront provenance without inventing merchant identity", () => {
  const offer = buildObservedListingLink(listing({
    raw: {
      raw: {
        provider: "rakuten_ichiba",
        source_listing_id: "realize-store:10745012",
        storefront_id: "realize-store",
        storefront_name: "REALiZE",
      },
    },
  }), { variantId: VARIANT_ID });

  assert.equal(offer.storefrontLabel, "REALiZE");
  assert.equal(Object.hasOwn(offer, "merchant"), false);
  assert.equal(Object.hasOwn(offer, "merchantIdentity"), false);
});

test("observed listing becomes affiliate only when existing strict Rakuten provenance passes", () => {
  const publicUrl = "https://item.rakuten.co.jp/auc-toysanta/g-5l3l0018ik-004/";
  const offer = buildObservedListingLink(listing({
    source_url: publicUrl,
    raw: {
      provider: "rakuten_ichiba",
      itemCode: "auc-toysanta:10381220",
      source_listing_id: "auc-toysanta:10381220",
      affiliate_url: publicUrl,
      affiliate_url_source: "rakuten_api",
      affiliate_url_contract: RAKUTEN_AFFILIATE_PROVENANCE_CONTRACT,
      source_documentation: RAKUTEN_ITEM_SEARCH_DOCUMENTATION,
    },
  }), { variantId: VARIANT_ID });

  assert.equal(offer.isAffiliate, true);
  assert.equal(offer.href, publicUrl);
});

test("observed listing never promotes unproven affiliate metadata", () => {
  const publicUrl = "https://item.rakuten.co.jp/auc-toysanta/g-5l3l0018ik-004/";
  const offer = buildObservedListingLink(listing({
    source_url: publicUrl,
    raw: {
      provider: "rakuten_ichiba",
      source_listing_id: "auc-toysanta:10381220",
      affiliate_url: "https://example.com/not-proven",
      affiliate_url_source: "manual",
      affiliate_url_contract: "unknown",
      source_documentation: "https://example.com",
    },
  }), { variantId: VARIANT_ID });

  assert.equal(offer.isAffiliate, false);
  assert.equal(offer.href, publicUrl);
});
