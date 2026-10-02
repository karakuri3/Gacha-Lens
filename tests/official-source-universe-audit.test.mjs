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
test("13 Qualia null detail month retains target archive membership",()=>assert.equal(classifyQualiaRecord({archiveMonths:["2026-10"],detailReleaseMonth:null,targetMonth:"2026-10"}).classification,"target_period"));
test("14 Qualia archive and detail month both unknown block classification",()=>assert.equal(classifyQualiaRecord({archiveMonths:[],detailReleaseMonth:null,targetMonth:"2026-10"}).classification,"undated"));
test("15 Qualia category pagination exhaustion parser",()=>{
  const body='<a href="/product/index/12/page:2?target=product">2</a><a href="/product/index/12/page/3/?target=product">3</a>'; const pages=parseQualiaCategoryPagination(body,"https://www.qualia-45.jp/product/index/12?target=product",12); assert.equal(pages.length,3); assert.ok(pages.some((url)=>url.includes("page:2")));
});
test("16 Qualia unvisited category page makes completeness false",async()=>{
  const audit=await fetchOfficialSourceUniverseAudit({fetchImpl:fixtureFetch({categoryPage2:true,failCategoryPage2:true}),requestDelayMs:0,retryLimit:0,globalHardCap:100}); const q=audit.providers[1]; assert.equal(q.completeness_known,false); assert.match(q.blocking_reasons.join(","),/category_page_fetch_failed|unvisited/);
});
test("17 source drift snapshot hashes differ when content differs",async()=>{
  const a=await fetchOfficialSourceUniverseAudit({fetchImpl:fixtureFetch({qualiaMonthIds:[2071,2073]}),requestDelayMs:0,retryLimit:0,globalHardCap:100});
  const b=await fetchOfficialSourceUniverseAudit({fetchImpl:fixtureFetch({qualiaMonthIds:[2071,2073,2103]}),requestDelayMs:0,retryLimit:0,globalHardCap:100});
  const sa=a.providers[1].source_surfaces.find(x=>x.surface==="month:2026-10"); const sb=b.providers[1].source_surfaces.find(x=>x.surface==="month:2026-10"); assert.notEqual(sa.content_identity,sb.content_identity);
});
test("18 global request cap exceeded fails closed",async()=>{
  const audit=await fetchOfficialSourceUniverseAudit({fetchImpl:fixtureFetch({qualiaRootProducts:Array.from({length:40},(_,i)=>1000+i)}),requestDelayMs:0,retryLimit:0,globalHardCap:20}); assert.equal(audit.completeness_known,false); assert.match(audit.blocking_reasons.join(","),/request_cap/);
});


test("global hard cap cannot be expanded above 150",async()=>{
  for (const globalHardCap of [151,200]) {
    const audit=await fetchOfficialSourceUniverseAudit({fetchImpl:fixtureFetch(),requestDelayMs:0,retryLimit:0,globalHardCap});
    assert.equal(audit.request_budget.global_hard_cap,150);
    assert.ok(audit.request_budget.actual_attempts<=150);
  }
});

test("retryLimit=2 is clamped to one retry per logical request",async()=>{
  const attemptsByUrl=new Map();
  const audit=await fetchOfficialSourceUniverseAudit({
    fetchImpl:async(url)=>{ attemptsByUrl.set(url,(attemptsByUrl.get(url)||0)+1); return response("",500); },
    requestDelayMs:0,
    retryLimit:2,
    globalHardCap:150,
  });
  assert.equal(audit.request_budget.actual_attempts,4);
  assert.deepEqual([...attemptsByUrl.values()].sort((a,b)=>a-b),[2,2]);
  assert.ok([...attemptsByUrl.values()].every((attempts)=>attempts<=2));
});

test("default pacing applies between successful requests without changing budget accounting",async()=>{
  const sleeps=[];
  let requests=0;
  const fixture=fixtureFetch();
  const audit=await fetchOfficialSourceUniverseAudit({
    fetchImpl:async(url,init)=>{ requests+=1; return fixture(url,init); },
    sleepImpl:async(ms)=>{ sleeps.push(ms); },
    retryLimit:0,
    globalHardCap:100,
  });
  assert.equal(audit.request_budget.actual_attempts,requests);
  assert.equal(sleeps.length,Math.max(0,requests-1));
  assert.ok(sleeps.every((ms)=>ms===750));
});

test("Qualia category navigation discovers reviewed classes from root",()=>assert.deepEqual(parseQualiaCategoryNavigation(qCats).map(x=>x.category_id),[12,13,14,15,16,17,18,19]));

test("complete small fixture proves both provider universes with zero writes",async()=>{
  const audit=await fetchOfficialSourceUniverseAudit({fetchImpl:fixtureFetch(),requestDelayMs:0,retryLimit:0,globalHardCap:100});
  assert.equal(audit.database_writes,0); assert.equal(audit.provider_mutations,0); assert.equal(audit.f0_activations,0); assert.equal(audit.providers[0].completeness_known,true); assert.equal(audit.providers[1].completeness_known,true);
});

function fixtureFetch({failKitanArchive=false,kitanIds=["k-before","k-target"],qualiaRootProducts=[2071],qualiaMonthIds=[2071,2073],categoryPage2=false,failCategoryPage2=false}={}){
  const root=`${kYears}${kList(...kitanIds.slice(0,1))}`;
  const qroot=`${qMonths}${qCats}${qList(...qualiaRootProducts)}`;
  return async(url)=>{
    if(url===KROOT)return response(root);
    if(url==="https://kitan.jp/product_age/2026/")return failKitanArchive?response("",500):response(kList(...kitanIds));
    if(url.includes("kitan.jp/products/"))return response(detail(url.includes("target")?"2026-10":"2026-09"));
    if(url===QROOT)return response(qroot);
    if(url.includes("/product/search/ym:2026-10"))return response(qList(...qualiaMonthIds));
    if(url.includes("/product/search/ym:2026-09"))return response("");
    if(url.includes("/product/index/")){
      if(url.includes("/page/2")||url.includes("/page:2"))return failCategoryPage2?response("",500):response(qList(2074));
      const id=Number(url.match(/\/product\/index\/(\d+)/)?.[1]);
      const pagination=categoryPage2&&id===12?'<a href="/product/index/12/page:2?target=product">2</a>':'';
      return response(`${qList(...(id===12?[2073]:[]))}${pagination}`);
    }
    if(url.includes("/product/view/"))return response(detail(url.endsWith("2071")?"2026-10":"2026-09"));
    return response("",404);
  };
}
