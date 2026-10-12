import assert from "node:assert/strict";
import test from "node:test";
import { createVariantTermContext, classifyMarketListingDetailed, resolveVariantFromListing, resolveVariantsFromListing } from "../lib/domain/listing-classifier.js";
import { normalizeMarketListing } from "../lib/domain/source-normalizers.js";

function catalog() {
  return {
    series: [
      { id: "parent", name: "初音ミク", franchise: "初音ミク" },
      { id: "parent", name: "should-not-win", franchise: "違う親" },
      { id: "parent-2", name: "パンどろぼう", franchise: "パンどろぼう" },
    ],
    variants: [
      { id: "miku", slug: "miku", name: "初音ミク", series_id: "parent" },
      { id: "rin", slug: "rin", name: "鏡音リン", series_id: "parent" },
      { id: "ren", slug: "ren", name: "鏡音レン", series_id: "parent" },
      { id: "clock", slug: "clock", name: "パンどろぼう（チクタク）", series_id: "parent-2" },
      { id: "dup", slug: "dup-1", name: "テスト", series_id: "parent-2" },
      { id: "dup", slug: "dup-2", name: "テスト", series_id: "parent-2" },
    ],
  };
}
function list(c) {
  const titles = [
    "【リン・レン】　ノーマル2種 セット", "初音ミク ミクさん 単品",
    "パンどろぼう　チクタク シークレット", "ＭＩＫＵ・ｒｉｎ レア",
    "テスト まとめ", "UNKNOWN", "鏡音リン 鏡音レン ひとつ", "初音ミク レアは含まれません",
    "初音ミク 全6種 フルコンプ", "初音ミク 2種セット", "初音ミク シクレ",
    "パンどろぼう やめられない", "ミクさん 単品",
  ];
  return titles.map((title, i) => ({
    id: "listing-"+i, title, price: i*100+400, source: "test",
    status: i===5?"sold":"active", sold_at: i===5?"2026-09-30T00:00:00Z":null,
    variant_id: i%4===0?"miku":null,
  }));
}
function compareEntry(raw, c, ctx) {
  assert.deepStrictEqual(resolveVariantFromListing(raw, c, ctx), resolveVariantFromListing(raw,c));
  for (const allowFranchiseVariant of [true,false]) {
    assert.deepStrictEqual(resolveVariantsFromListing(raw,c,{allowFranchiseVariant},ctx),
      resolveVariantsFromListing(raw,c,{allowFranchiseVariant}));
  }
  assert.deepStrictEqual(classifyMarketListingDetailed(raw,c,ctx), classifyMarketListingDetailed(raw,c));
  assert.deepStrictEqual(normalizeMarketListing(raw,c,ctx), normalizeMarketListing(raw,c));
}
test("request-scoped cached terms reproduce every full classification object and market record",()=>{
  const c=catalog(),ctx=createVariantTermContext(c);
  for(const row of [...list(c),...list(c)])compareEntry(row,c,ctx);
  ctx.dispose();
  assert.throws(()=>resolveVariantFromListing(list(c)[0],c,ctx),/DISPOSED/);
});
test("catalog mutation invalidates cache in same context, including first duplicate parent and field edits",()=>{
  const c=catalog(),ctx=createVariantTermContext(c);
  const raw={title:"鏡音リン / 初音ミク / テスト", variant_id:"ren", status:"active"};
  compareEntry(raw,c,ctx);
  c.variants[1].name="鏡音レン";
  c.variants[2].slug="new-ren";
  c.series[0].name="変更後";
  compareEntry(raw,c,ctx);
  c.series.reverse();
  compareEntry(raw,c,ctx);
  c.variants.push({id:"new",name:"テスト",slug:"test-extra",series_id:"parent-2"});
  compareEntry(raw,c,ctx);
  c.variants.splice(0,1);
  compareEntry(raw,c,ctx);
  ctx.dispose();
});
test("fresh contexts see mutations between batches; contextless public calls are unchanged",()=>{
  const c=catalog(),raw={title:"ミクさん",status:"active"};
  const first=createVariantTermContext(c);
  compareEntry(raw,c,first);first.dispose();
  c.variants[0].name="変更した名前";
  c.series[0].franchise="変更";
  const second=createVariantTermContext(c);
  compareEntry(raw,c,second);second.dispose();
  assert.deepStrictEqual(normalizeMarketListing(raw,c),normalizeMarketListing(raw,c));
});
test("catalog ownership cannot silently reuse terms from another catalog",()=>{
  const one=catalog(),two=catalog(),ctx=createVariantTermContext(one);
  assert.throws(()=>resolveVariantFromListing({title:"初音ミク"},two,ctx),/CATALOG_MISMATCH/);
  ctx.dispose();
});
test("sold vs active and classification metadata remain identical with cache enabled",()=>{
  const c=catalog(),ctx=createVariantTermContext(c);
  const input=[
    {title:"鏡音リン 単品",status:"sold",sold_at:"2026-10-01T00:00:00Z",price:2100},
    {title:"鏡音リン 単品",status:"active",price:9999},
    {title:"鏡音リン 全6種コンプ",status:"active",price:8000},
  ];
  const a=input.map(v=>normalizeMarketListing(v,c));
  const b=input.map(v=>normalizeMarketListing(v,c,ctx));
  assert.deepStrictEqual(b,a);
  assert.equal(b[0].status,"sold");
  assert.equal(b[1].status,"active");
  assert.equal(b[0].price,2100);
  assert.equal(b[1].price,9999);
  ctx.dispose();
});

test("237/123/241 batch context parity, synthetic sold-zero and positive-sold regressions", () => {
  const c={
    series:Array.from({length:123},(_,i)=>({id:"series-"+i,name:"シリーズ"+i,franchise:"作品"+(i%9)})),
    variants:Array.from({length:237},(_,i)=>({id:"v-"+i,slug:"variant-"+i,series_id:"series-"+(i%123),name:"キャラ"+i,variant_name:"キャラ"+i})),
  };
  const rows=Array.from({length:241},(_,i)=>({
    id:"raw-"+i,title:"シリーズ"+(i%123)+" キャラ"+(i%237)+(i%7===0?" レア":" 単品"),
    variant_id:i%17===0?"v-"+(i%237):null,source:"test",price:500+i,status:i<66?"active":"unknown",
  }));
  const context=createVariantTermContext(c);
  const before=rows.map(raw=>normalizeMarketListing(raw,c));
  const after=rows.map(raw=>normalizeMarketListing(raw,c,context));
  assert.deepStrictEqual(after,before);
  for(const raw of rows) {
    assert.deepStrictEqual(classifyMarketListingDetailed(raw,c,context),classifyMarketListingDetailed(raw,c));
  }
  assert.equal(after.filter(row=>row.status==="sold").length,0);
  assert.equal(after.filter(row=>row.status==="active").length,66);
  context.dispose();
  const positive=rows.slice(0,4).map((row,i)=>({...row,id:"sold-"+i,status:"sold",sold_at:"2026-10-01T00:00:00Z"}));
  const fresh=createVariantTermContext(c);
  const exact=positive.map(row=>normalizeMarketListing(row,c));
  assert.deepStrictEqual(positive.map(row=>normalizeMarketListing(row,c,fresh)),exact);
  assert.equal(exact.filter(row=>row.status==="sold").length,4);
  fresh.dispose();
});
