import assert from "node:assert/strict";
import test from "node:test";
import * as before from "./fixtures/a9r-listing-classifier-baseline.js";
import * as after from "../lib/domain/listing-classifier.js";
import { makeFixture, assertFixture, SHAPE, fixtureResponse } from "../scripts/a9r-local-cpu-profile.mjs";

// The baseline file is a literal copy of exact main 0dd0c538... with only its
// relative schema import rewritten; comparisons include details, confidence,
// matched keywords, match order, and duplicate behavior, not just listing_type.
const compare = (listing, catalog, label) => {
  for (const method of ["classifyListingTitle", "classifyListingTitleDetailed"]) {
    const title = listing.title || listing.name || "";
    assert.deepStrictEqual(after[method](title), before[method](title), label + ":" + method);
  }
  for (const method of ["classifyMarketListing", "classifyMarketListingDetailed",
                        "resolveVariantFromListing", "resolveVariantsFromListing",
                        "resolveSeriesFromListing"]) {
    assert.deepStrictEqual(after[method](listing, catalog), before[method](listing, catalog),
      label + ":" + method);
  }
};

const parent = (id, name, franchise = name) => ({ id, slug: String(id), name, franchise, brand: "玩具" });
const variant = (id, series_id, name, other = {}) => ({
  id, series_id, name, variant_name: name, slug: "variant-" + String(id), ...other,
});

function edgeCatalog() {
  const series = [
    parent("s1", "パンどろぼう", "パンどろぼう"),
    parent("s2", "VOCALOID", "初音ミク"),
    parent("s3", "鏡音リン", "鏡音リン"),
    parent("s4", "Ｆｕｌｌ・Ｗｉｄｔｈ", "Ｆｕｌｌ Ｗｉｄｔｈ"),
    parent("s4", "shadow-duplicate-ID", "shadow"),
  ];
  const variants = [
    variant("v1", "s1", "パンどろぼう（チクタク）"),
    variant("v2", "s1", "パンどろぼう（やめられない）"),
    variant("v3", "s1", "パンどろぼう（へんしん）"),
    variant("v4", "s1", "パンどろぼう（やい）"),
    variant("v5", "s2", "初音ミク"),
    variant("v6", "s3", "鏡音リン"),
    variant("v7", "s3", "鏡音レン"),
    variant("v8", "s4", "Ｈｅｒｏ（Ｐｉｎｋ）"),
    variant("v9", "s1", "パンどろぼう"),
    variant("v10", "s3", "鏡音リン"),
    variant("v10", "s2", "鏡音レン", { slug: "duplicate-id-alias" }),
    variant("v11", "s2", "", { variant_name: null }),
    variant("v12", "unknown", "単品"),
  ];
  return { series, variants };
}

test("all title aliases, Unicode width, punctuation, franchise, matching and reason/confidence stay exactly equal", () => {
  const catalog = edgeCatalog();
  const titles = [
    "", " ", "ー・（）【】／_！",
    "パンどろぼうチクタク", "パンどろぼう チクタク", "チクタク",
    "パンどろぼうやめられない", "やめられない",
    "パンどろぼうへんしん", "へんしんだ",
    "パンどろぼうやい",
    "リンレン", "リン・レン", "リン&レン", "リン レン",
    "ミクさん", "miku", "ＭＩＫＵ", "初音ミク", "鏡音リン", "鏡音レン",
    "Ｈｅｒｏ（Ｐｉｎｋ）", "hero (pink)", "ヒーロー・ピンク",
    "パンどろぼう", "パンどろぼう 単品", "パンどろぼう パンどろぼう",
    "全５種 コンプリート", "４種セット", "３点セット", "フルコンプ",
    "セミコンプ", "2種", "未開封", "シークレット", "レア",
    "レアは含みません", "クリアカラー", "限定カラー", "まとめ",
    "一種", "単体", "ひとつ", "【鏡音リン】/【鏡音レン】",
    "ｶﾀｶﾅ 全角半角 ｶﾞﾁｬ", "タイトル！？。　 ａｂｃ",
  ];
  for (const title of titles) {
    for (const explicit of [null, "v1", "v5", "v7", "v10", "not-found"]) {
      const listing = { id: "edge", title, ...(explicit ? {variant_id:explicit} : {}) };
      compare(listing, catalog, JSON.stringify({title, explicit}));
    }
  }
});

test("duplicate IDs, multiple matches, additional matches despite explicit IDs, partial/complete/rare/secret and no-match fail closed", () => {
  const c = edgeCatalog();
  const listings = [
    {title:"リンレン",variant_id:"v5"},
    {title:"ミクさん",variant_id:"v6"},
    {title:"鏡音リン 鏡音レン",variant_id:"v6"},
    {title:"鏡音リン 鏡音レン",variantId:"v7"},
    {title:"コンプ ミクさん 鏡音リン",series_id:"s2"},
    {title:"2種セット ミクさん 鏡音リン"},
    {title:"シークレット 鏡音リン",variant_id:"v5"},
    {title:"レア 鏡音レン",variant_id:"v7"},
    {title:"nothing",series_id:"s1"},
    {name:"パンどろぼう（チクタク）",variant_id:"v1"},
    {title:null,name:"ミクさん"},
    {title:"",listing_type:"single"},
    {title:"ミクさん",listing_type:"complete_set"},
    {title:"ミクさん",listingType:"partial_set"},
    {title:"ミクさん",listing_type:"INVALID"},
  ];
  for (const [i, listing] of listings.entries()) compare(listing,c,"branch-"+i);
  const ambiguous = after.classifyMarketListingDetailed({title:"リンレン",variant_id:"v5"},c);
  assert.ok(ambiguous.details.matched_variant_ids.length > 1, "explicit ID must not skip title alternatives");
  assert.equal(ambiguous.reason,"multiple_variants_detected");
});

test("a reused mutable catalog cannot preserve stale parent, name or alias matches across calls", () => {
  const catalog=edgeCatalog();
  const titles=["チクタク","パンどろぼう","パンどろぼう 単品","初音ミク","ミクさん","鏡音リン"];
  for(let round=0;round<7;round++){
    catalog.variants[0].name = round%2 ? "変更した名前" : "パンどろぼう（チクタク）";
    catalog.variants[0].variant_name = round%2 ? "別名" : "パンどろぼう（チクタク）";
    catalog.series[0].franchise = round%2 ? "別作品" : "パンどろぼう";
    catalog.series[0].name = round%2 ? "変更シリーズ" : "パンどろぼう";
    catalog.variants.reverse();
    catalog.series.reverse();
    for(const title of titles)compare({title},catalog,"mutation-"+round+"-"+title);
  }
  const fresh = edgeCatalog();
  compare({title:"チクタク"},fresh,"fresh-catalog");
});

test("full 237-variant/123-series/241-listing synthetic dataset agrees for every classified record",()=>{
  const fixture=makeFixture();assertFixture(fixture);
  assert.deepStrictEqual(SHAPE,{variants:237,series:123,marketListings:241,sold:0,active:66});
  const catalog={variants:fixture.variants,series:fixture.series};
  for(const [i, row] of fixture.listings.entries()){
    const original={...row,listing_type:null,
      title:i%11===0?"全種 "+fixture.variants[i%237].name:
            i%11===1?"単品 "+fixture.variants[i%237].name:
            i%11===2?"2種セット "+fixture.variants[i%237].name:
            i%11===3?"レア "+fixture.variants[i%237].name:
            i%11===4?"シークレット "+fixture.variants[i%237].name:
            i%11===5?"unknown title":
            fixture.variants[i%237].name};
    compare(original,catalog,"full-fixture-"+i);
  }
  assert.equal(fixtureResponse("/rest/v1/market_listings?select=variant_id",fixture).body.length,241);
  assert.equal(fixture.listings.filter(x=>x.status==="active").length,66);
  assert.equal(fixture.listings.filter(x=>x.status==="sold"||x.sold_at).length,0);
  const withSold=structuredClone(fixture);
  for(const row of withSold.listings.slice(0,4)){
    row.status="sold";row.sold_at="2026-10-01T00:00:00Z";
  }
  assert.equal(withSold.listings.filter(x=>x.status==="sold"||x.sold_at).length,4);
  assert.equal(withSold.listings.filter(x=>x.status==="active").length,62);
  assert.equal(fixtureResponse("/rest/v1/market_listings?select=*",withSold).body.filter(x=>x.sold_at).length,4);
});
