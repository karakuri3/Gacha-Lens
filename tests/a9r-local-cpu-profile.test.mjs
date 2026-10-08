import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {SHAPE,makeFixture,assertFixture,fixtureResponse,analyze,originalPosition,mapProfile,accountingSnapshot,assertRankingFidelity} from "../scripts/a9r-local-cpu-profile.mjs";

const workflow=fs.readFileSync(new URL("../.github/workflows/a9r-local-cpu-profiler.yml",import.meta.url),"utf8");
const script=fs.readFileSync(new URL("../scripts/a9r-local-cpu-profile.mjs",import.meta.url),"utf8");

test("synthetic production-shaped fixture has exact counts and zero sales",()=>{
 const f=makeFixture();assertFixture(f);
 assert.deepEqual(SHAPE,{variants:237,series:123,marketListings:241,sold:0,active:66});
 assert.equal(f.listings.filter(x=>x.sold_at).length,0);
 assert.equal(f.listings.filter(x=>x.status==="active").length,66);
 assert.equal(new Set(f.variants.map(v=>v.series_id)).size,123);
});
test("fixture REST mock preserves actual ranking candidate/variant/market hydration endpoints",()=>{
 const f=makeFixture();
 const candidate=fixtureResponse("/rest/v1/market_listings?select=variant_id&limit=1000",f);
 assert.equal(candidate.status,200);
 assert.equal(candidate.body.length,241);
 const variants=fixtureResponse("/rest/v1/variants?id=in.(v0,v1,v2)&select=id,parent:series!inner(id)",f);
 assert.equal(variants.body.length,3);
 assert.ok(variants.body[0].parent);
 const markets=fixtureResponse("/rest/v1/market_listings?series_id=in.(s0,s1)&select=*",f);
 assert.ok(markets.body.length>0);
 assert.ok(markets.body.every(x=>["s0","s1"].includes(x.series_id)));
});
test("CDP parser rejects startup-only empty samples and computes function-level work",()=>{
 assert.throws(()=>analyze({nodes:[{id:1,callFrame:{functionName:"render"}}],samples:[],timeDeltas:[]}),/samples/);
 assert.throws(()=>analyze({nodes:[],samples:[1],timeDeltas:[1000]}),/nodes/);
 const result=analyze({nodes:[{id:1,callFrame:{functionName:"render",url:"file:///worker.js"}}],samples:[1,1,1],timeDeltas:[1000,1000,1000]});
 assert.equal(result.sample_count,3);
 assert.equal(result.sampled_cpu_ms,3);
 assert.equal(result.top_functions[0].name,"render");
 const nested=analyze({nodes:[
  {id:1,callFrame:{functionName:"outer"},children:[2]},
  {id:2,callFrame:{functionName:"inner"},children:[]}
 ],samples:[2,2],timeDeltas:[1000,1000]});
 assert.equal(nested.top_functions.find(x=>x.name==="inner").self_samples,2);
 assert.equal(nested.top_functions.find(x=>x.name==="inner").total_samples,2);
});
test("profiler workflow is PR-only, local-only, pinned and bounded",()=>{
 assert.match(workflow,/on:\n  pull_request:/);
 assert.match(workflow,/permissions:\n  contents: read/);
 assert.match(workflow,/timeout-minutes: 20/);
 assert.match(workflow,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
 assert.match(workflow,/node-version: 24/);
 assert.match(workflow,/npm ci --ignore-scripts --prefix/);
 assert.match(workflow,/4\.131\.1/);
 assert.match(workflow,/vinext" build/);
 assert.match(workflow,/dev --local --config dist\/server\/wrangler\.json/);
 assert.match(workflow,/--inspector-port 9230/);
 assert.match(workflow,/LOCAL_WORKER_PROFILE_ITERATION_\$\{current_iteration\}_PASS/);
 assert.match(workflow,/127\.0\.0\.1:8788/);
 assert.match(workflow,/actions\/upload-artifact@v4/);
 assert.match(workflow,/if: always\(\)/);
 assert.doesNotMatch(workflow,/(?:^|\n)\s+(?:workflow_dispatch|issue_comment|push):/);
 assert.doesNotMatch(workflow,/\bwrangler\s+(?:deploy|versions\s+upload)\b/);
 assert.doesNotMatch(workflow,/https:\/\/[^'"\s]*supabase\.co/i);
 assert.doesNotMatch(workflow,/\$\{\{\s*secrets\./i);
 assert.match(script,/Profiler\.enable/);
 assert.match(script,/Profiler\.start/);
 assert.match(script,/Profiler\.stop/);
 assert.match(script,/\/ranking/);
});

test("source map zero-based CDP coordinates map to one-based original lines without guessing",()=>{
 const map={version:3,sources:["lib/series.js"],names:["verified"],mappings:"AAAA,CAACA;AACA"};
 assert.deepEqual(originalPosition(map,0,1),{source:"lib/series.js",line:1,column:1,name:"verified"});
 assert.equal(originalPosition(map,0,-1),null);
 assert.equal(originalPosition(map,7,0),null);
 const profile={nodes:[{id:1,callFrame:{functionName:"D",url:"series-test.js",lineNumber:0,columnNumber:1},children:[2]},{id:2,callFrame:{functionName:"D",url:"series-test.js",lineNumber:0,columnNumber:1}}],samples:[2,2,1],timeDeltas:[1000,2000,3000]};
 const result=mapProfile(profile,new Map([["series-test.js",[{path:"/tmp/series-test.js.map",map}]]]));
 assert.equal(result.hotspots[0].self_samples,3);
 assert.equal(result.hotspots[0].total_samples,3);
 assert.equal(result.hotspots[0].self_sampled_ms,6);
 assert.equal(result.hotspots[0].total_sampled_ms,6);
});
test("sanitized fixture counters distinguish candidate/variant/market and reject unsupported query",()=>{
 const f=makeFixture();
 assert.equal(fixtureResponse("/rest/v1/variants?unrecognized=eq.1",f).status,400);
 assert.equal(fixtureResponse("/rest/v1/variants?select=*",f).status,400);
 const v=fixtureResponse("/rest/v1/variants?id=in.(v0,v1)&select=id,parent:series!inner(id)",f);
 assert.equal(v.status,200);assert.equal(v.records.length,2);
 const account={calls:[{kind:"candidate",rows:241,active:66,sold:0}],candidateIds:new Set(f.variants.map(v=>v.id)),variantIds:new Set(),seriesIds:new Set(),marketIds:new Set(),activeIds:new Set(),soldIds:new Set()};
 assert.equal(accountingSnapshot(account).candidate.rows,241);
 assert.throws(()=>assertRankingFidelity(accountingSnapshot(account)),/VARIANT_HYDRATION_MISSING/);
});
test("local-only build sources and per-run KV persistence stay isolated",()=>{
 assert.match(workflow,/PROFILING_ONLY_VITE_SOURCEMAPS_CONFIGURED/);
 assert.match(workflow,/PROFILE_SOURCE_MAP_MISSING_CRITICAL_BUNDLES/);
 assert.match(workflow,/--persist-to "\/tmp\/a9r-profiler-cache-\$\{current_iteration\}"/);
 assert.match(script,/SOURCE_MAP_HOTSPOT_UNMAPPED/);
 assert.match(script,/WATCH_30_CARDS_NOT_RENDERED/);
});
