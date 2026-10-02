import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyKitanRecord,
  classifyQualiaRecord,
  countQualiaDuplicateMonthLinks,
  fetchOfficialSourceUniverseAudit,
  parseKitanProductLinks,
  parseKitanYearNavigation,
  parseQualiaCategoryNavigation,
  parseQualiaCategoryPagination,
  parseQualiaMonthNavigation,
  parseQualiaProductLinks,
} from "../lib/fetchers/official-sources/universe-audit.js";

const KROOT = "https://kitan.jp/products/";
const QROOT = "https://www.qualia-45.jp/product.html";
const kYears = `<a href="/product_age/2025/">2025</a><a href="/product_age/2026/">2026</a><a href="/product_age/2026/">dup</a>`;
const qMonths = `<a href="/product/search/ym:2026-09?target=product">9</a><a href="/product/search/ym:2026-10?target=product">10</a><a href="/product/search/ym:2026-10?target=product">dup</a>`;
const qCats = Array.from({length:8},(_,i)=>`<a href="/product/index/${12+i}?target=product">c</a>`).join("");
function kList(...ids){return ids.map(id=>`<a href="/products/${id}/">x</a>`).join("");}
function qList(...ids){return ids.map(id=>`<a href="/product/view/${id}">x</a>`).join("");}
function detail(month){return `<dl><dt>発売日</dt><dd>${month.replace("-","年")}月</dd></dl>`;}
function response(body,status=200){return {ok:status>=200&&status<300,status,text:async()=>body};}

test("1 Kitan year navigation dynamic discovery",()=>assert.deepEqual(parseKitanYearNavigation(kYears).map(x=>x.year),["2025","2026"]));
test("2 Kitan duplicate year link dedupe",()=>assert.equal(parseKitanYearNavigation(kYears).length,2));
test("3 Kitan target archive full classification",()=>{
  assert.equal(classifyKitanRecord({archiveYear:2026,detailReleaseMonth:"2026-09",targetMonth:"2026-10"}).classification,"before_target");
  assert.equal(classifyKitanRecord({archiveYear:2026,detailReleaseMonth:"2026-10",targetMonth:"2026-10"}).classification,"target_period");
});
test("4 Kitan undated blocker",()=>assert.equal(classifyKitanRecord({archiveYear:2026,targetMonth:"2026-10"}).classification,"undated"));
test("Kitan root-only detail uses detail month rather than inventing archive year",()=>{ const c=classifyKitanRecord({archiveYear:null,detailReleaseMonth:"2026-10",targetMonth:"2026-10"}); assert.equal(c.classification,"target_period"); assert.equal(c.classification_source,"detail_release_month"); assert.equal(c.archive_year,null); });
test("5 Kitan root/archive drift is observable",()=>{
  const root=new Set(parseKitanProductLinks(kList("a","b"),KROOT).map(x=>x.official_url)); const archive=new Set(parseKitanProductLinks(kList("b","c"),"https://kitan.jp/product_age/2026/").map(x=>x.official_url));
  assert.deepEqual([...root].filter(x=>!archive.has(x)).length,1);
});
test("6 Kitan unvisited archive makes completeness false",async()=>{
  const fetchImpl=fixtureFetch({failKitanArchive:true}); const audit=await fetchOfficialSourceUniverseAudit({fetchImpl,requestDelayMs:0,retryLimit:0,globalHardCap:100});
  assert.equal(audit.providers[0].completeness_known,false); assert.match(audit.providers[0].blocking_reasons.join(","),/archive_fetch_failed|unvisited/);
});
test("7 Kitan request cap exceeded fails closed",async()=>{
  const fetchImpl=fixtureFetch({kitanIds:Array.from({length:30},(_,i)=>`k${i}`),qualiaRootProducts:[]}); const audit=await fetchOfficialSourceUniverseAudit({fetchImpl,requestDelayMs:0,retryLimit:0,globalHardCap:20});
  assert.equal(audit.providers[0].completeness_known,false); assert.match(audit.providers[0].blocking_reasons.join(","),/request_cap/);
});

test("8 Qualia month navigation enumerates all exposed links",()=>{
  assert.deepEqual(parseQualiaMonthNavigation(qMonths).map(x=>x.month),["2026-09","2026-10"]);
  assert.equal(countQualiaDuplicateMonthLinks(qMonths),1);
});
test("9 Qualia root may omit month archive members",()=>{
  const root=new Set(parseQualiaProductLinks(qList(1),QROOT).map(x=>x.source_product_id)); const month=parseQualiaProductLinks(qList(1,2),QROOT); assert.equal(month.filter(x=>!root.has(x.source_product_id)).length,1);
});
test("10 Qualia category-only product is discoverable",()=>{
  const root=new Set(parseQualiaProductLinks(qList(1),QROOT).map(x=>x.source_product_id)); const cat=parseQualiaProductLinks(qList(2),QROOT); assert.equal(cat.filter(x=>!root.has(x.source_product_id))[0].source_product_id,"2");
});
test("11 Qualia same product multi-surface dedupe identity",()=>{
  const ids=[...parseQualiaProductLinks(qList(1,2),QROOT),...parseQualiaProductLinks(qList(2,3),QROOT)].map(x=>x.source_product_id); assert.equal(new Set(ids).size,3);
});
test("12 Qualia archive_month alone establishes target membership",()=>{
  const c=classifyQualiaRecord({archiveMonths:["2026-10"],targetMonth:"2026-10"}); assert.equal(c.classification,"target_period"); assert.equal(c.classification_source,"archive_month");
});
test("13 Qualia null detail month retains target archive membership",()=>assert.equal(classifyQualiaRecord({archiveMonths:["2026-10"],detailReleaseMon