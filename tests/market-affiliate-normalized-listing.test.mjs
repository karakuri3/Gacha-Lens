import assert from "node:assert/strict";
import test from "node:test";
import {
  getRakutenAffiliateDestination,
  isSafeRakutenAffiliateListing,
  RAKUTEN_AFFILIATE_PROVENANCE_CONTRACT,
  RAKUTEN_ITEM_SEARCH_DOCUMENTATION,
} from "../lib/domain/rakuten-affiliate-link.js";
import {
  getYahooAffiliateDestination,
  isSafeYahooAffiliateListing,
  YAHOO_AFFILIATE_DOCUMENTATION,
  YAHOO_AFFILIATE_PROVENANCE_CONTRACT,
} from "../lib/domain/yahoo-affiliate-link.js";

const W_GUNDAM_PUBLIC_URL = "https://item.rakuten.co.jp/surugaya-a-too/87664313-1";
const W_GUNDAM_AFFILIATE_URL = "https://hb.afl.rakuten.co.jp/hgc/g00qk9an.qg3lu4cf.g00qk9an.qg3lv6ea/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fsurugaya-a-too%2F87664313-1%2F&m=http%3A%2F%2Fm.rakuten.co.jp%2Fsurugaya-a-too%2Fi%2F358369703%2F&rafcid=wsc_i_is_44d61149-dc47-4f77-98e8-7d1219b50c24";

function rakutenPayload(overrides = {}) {
  return {
    provider: "rakuten_ichiba",
    source_listing_id: "surugaya-a-too:358369703",
    affiliate_url: W_GUNDAM_AFFILIATE_URL,
    affiliate_url_source: "rakuten_api",
    affiliate_url_contract: RAKUTEN_AFFILIATE_PROVENANCE_CONTRACT,
    source_documentation: RAKUTEN_ITEM_SEARCH_DOCUMENTATION,
    ...overrides,
  };
}

function rakutenListing(raw) {
  return {
    id: "rakuten-surugaya-a-too-358369703",
    variant_id: "gashapon-4549660488491000-wガンダム",
    listing_type: "single",
    status: "active",
    source: "rakuten",
    source_url: W_GUNDAM_PUBLIC_URL,
    review_required: false,
    raw,
  };
}

test("Rakuten direct raw listing remains affiliate eligible", () => {
  const listing = rakutenListing(rakutenPayload());
  assert.equal(isSafeRakutenAffiliateListing(listing), true);
  assert.equal(getRakutenAffiliateDestination({ market_listings: [listing] })?.href, W_GUNDAM_AFFILIATE_URL);
});

test("Rakuten normalized persisted listing resolves nested raw provenance", () => {
  const listing = rakutenListing({
    id: "rakuten-surugaya-a-too-358369703",
    source: "rakuten",
    raw: rakutenPayload(),
  });
  assert.equal(isSafeRakutenAffiliateListing(listing), true);
  assert.equal(getRakutenAffiliateDestination({ market_listings: [listing] })?.href, W_GUNDAM_AFFILIATE_URL);
});

test("Rakuten nested persisted provenance is authoritative and still fails closed", () => {
  const listing = rakutenListing({
    provider: "rakuten_ichiba",
    source_listing_id: "surugaya-a-too:358369703",
    affiliate_url: W_GUNDAM_AFFILIATE_URL,
    affiliate_url_source: "rakuten_api",
    affiliate_url_contract: RAKUTEN_AFFILIATE_PROVENANCE_CONTRACT,
    source_documentation: RAKUTEN_ITEM_SEARCH_DOCUMENTATION,
    raw: rakutenPayload({ affiliate_url: "https://evil.example/redirect" }),
  });
  assert.equal(isSafeRakutenAffiliateListing(listing), false);
  assert.equal(getRakutenAffiliateDestination({ market_listings: [listing] }), null);
});

function yahooPayload(publicUrl, overrides = {}) {
  const affiliateUrl = `https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=123&pid=456&vc_url=${encodeURIComponent(publicUrl)}`;
  return {
    provider: "yahoo_shopping",
    source_listing_id: "example:item-1",
    affiliate_url: affiliateUrl,
    affiliate_url_source: "yahoo_api",
    affiliate_url_contract: YAHOO_AFFILIATE_PROVENANCE_CONTRACT,
    source_documentation: YAHOO_AFFILIATE_DOCUMENTATION,
    ...overrides,
  };
}

function yahooListing(raw) {
  return {
    id: "yahoo-example-item-1",
    variant_id: "variant-yahoo-1",
    listing_type: "single",
    status: "active",
    source: "yahoo",
    source_url: "https://store.shopping.yahoo.co.jp/example/item-1.html",
    review_required: false,
    raw,
  };
}

test("Yahoo normalized persisted listing resolves nested raw provenance", () => {
  const publicUrl = "https://store.shopping.yahoo.co.jp/example/item-1.html";
  const payload = yahooPayload(publicUrl);
  const listing = yahooListing({ id: "yahoo-example-item-1", source: "yahoo", raw: payload });
  assert.equal(isSafeYahooAffiliateListing(listing), true);
  assert.equal(getYahooAffiliateDestination({ market_listings: [listing] })?.href, payload.affiliate_url);
});

test("Yahoo normalized persisted listing rejects a mismatched affiliate target", () => {
  const publicUrl = "https://store.shopping.yahoo.co.jp/example/item-1.html";
  const wrongTarget = "https://store.shopping.yahoo.co.jp/example/other-item.html";
  const listing = yahooListing({
    raw: yahooPayload(publicUrl, {
      affiliate_url: `https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=123&pid=456&vc_url=${encodeURIComponent(wrongTarget)}`,
    }),
  });
  assert.equal(isSafeYahooAffiliateListing(listing), false);
  assert.equal(getYahooAffiliateDestination({ market_listings: [listing] }), null);
});
