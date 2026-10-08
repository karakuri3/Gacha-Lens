import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {SHAPE,makeFixture,assertFixture,fixtureResponse,analyze} from "../scripts/a9r-local-cpu-profile.mjs";

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
 const variants=fixtureResponse("/rest/v1/variants?id=in.(v0,v1,v2)&select=*",f);
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
