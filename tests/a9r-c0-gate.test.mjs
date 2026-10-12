import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decide,EXPECTED_ROUTES} from '../experiments/a9r-c0/gate-core.mjs';
import {REVISION,makeFixture} from '../experiments/a9r-c0/synthetic-fixture.mjs';
const sha='a'.repeat(40),other='b'.repeat(40),hash='a'.repeat(64),now=Date.parse('2026-10-12T03:00:00.000Z');
function good(){return {schema:'gacha.c0.local.v1',source_sha:sha,data_revision:REVISION,complete:true,expected_routes:[...EXPECTED_ROUTES],generated_at_ms:now-10000,fresh_until_ms:now+10000,next_jst_midnight_ms:now+10000,next_evidence_expiry_ms:now+10000,update_sla_deadline_ms:now+10000,metrics:{sold_count:0,ranked_count:0,watch_count:30,sold_and_active_separated:true},provenance:{actual_page_dataset:REVISION,fixture_binding_proven:true},rsc_request:{query:'abc',state:'%5B%22%22%5D',prefetch:'',segment:'',next_url:''},assets:{html:{path:'/__c0_private/html',bytes:200,sha256:hash,content_type:'text/html'},rsc:{path:'/__c0_private/rsc',bytes:100,sha256:hash,content_type:'text/x-component'}}}}
function run({url='http://127.0.0.1:8787/ranking',headers={},manifest=good(),appSha=sha,trustedRevision=REVISION,time=now,method='GET'}={}){return decide({request:new Request(url,{method,headers:{'x-gacha-expected-app-source-sha':sha,...headers}}),manifest,appSha,trustedRevision,nowMs:time})}
test('canonical App-owned HTML + legacy 308 exact location after source gate',()=>{
 assert.equal(run().status,200);
 assert.deepEqual(run({url:'http://127.0.0.1:8787/ranking?tab=upcoming&scope=series'}),{status:308,location:'/ranking/upcoming/series'});
 assert.equal(run({url:'http://127.0.0.1:8787/unknown'}).status,404);
 assert.equal(run({url:'http://127.0.0.1:8787/ranking?search=x'}).status,503);
 assert.equal(run({method:'POST'}).status,405);
 assert.equal(run({appSha:other,url:'http://127.0.0.1:8787/ranking?tab=upcoming&scope=series'}).status,409);
});
test('expected SHA mismatch 409, absent/malformed trusted source identity 503',()=>{
 assert.equal(run({appSha:other}).status,409);
 assert.equal(run({appSha:''}).status,503);
 assert.equal(run({headers:{'x-gacha-expected-app-source-sha':''}}).status,503);
 const m=good();m.source_sha=other;assert.equal(run({manifest:m}).status,409);
});
test('snapshot missing/incomplete/corrupt metadata fails closed',()=>{
 assert.equal(run({manifest:null}).status,503);
 for(const edit of [m=>m.complete=false,m=>m.expected_routes=['/ranking'],m=>delete m.assets.html,m=>m.assets.html.sha256='bad',m=>m.assets.html.path='/public',m=>m.metrics.ranked_count=1,m=>m.metrics.watch_count=31]){
   const m=good();edit(m);assert.equal(run({manifest:m}).status,503);
 }
});
test('snapshot provenance mismatch cannot become a false green response',()=>{
 const m=good();m.provenance.fixture_binding_proven=false;
 assert.deepEqual(run({manifest:m}),{status:503,reason:'fixture_provenance_unproven'});
 m.provenance.fixture_binding_proven=true;m.provenance.actual_page_dataset='repository_builtin_sample';
 assert.equal(run({manifest:m}).status,503);
});
test('changed independent trusted data revision fails closed',()=>{
 assert.equal(run({trustedRevision:'new-dataset-revision'}).status,503);
 assert.equal(run({trustedRevision:''}).status,503);
});
test('expiry exactly at boundary: 1ms before PASS, at and after FAIL',()=>{
 const m=good();
 assert.equal(run({manifest:m,time:m.fresh_until_ms-1}).status,200);
 assert.equal(run({manifest:m,time:m.fresh_until_ms}).status,503);
 assert.equal(run({manifest:m,time:m.fresh_until_ms+1}).status,503);
 assert.equal(run({manifest:m,time:m.generated_at_ms-1}).status,503);
 m.fresh_until_ms++;assert.equal(run({manifest:m}).status,503);
});
test('RSC state exact match only; no HTML/Flight cross-type substitution',()=>{
 const url='http://127.0.0.1:8787/ranking?_rsc=abc',headers={RSC:'1','Next-Router-State-Tree':'%5B%22%22%5D'};
 assert.equal(run({url,headers}).kind,'rsc');
 assert.equal(run({url,headers:{...headers,'Next-Router-State-Tree':'different'}}).status,503);
 assert.equal(run({url,headers:{...headers,'Next-Router-Prefetch':'1'}}).status,503);
 assert.equal(run({url:'http://127.0.0.1:8787/ranking?_rsc=other',headers}).status,503);
 const m=good();m.assets.rsc.content_type='text/html';assert.equal(run({url,headers,manifest:m}).status,503);
});
test('Cookie/Authorization refuse shared assets; no-cache still verifies',()=>{
 assert.equal(run({headers:{Cookie:'secret=1'}}).status,503);
 assert.equal(run({headers:{Authorization:'Bearer secret'}}).status,503);
 assert.equal(run({headers:{'Cache-Control':'no-cache'}}).status,200);
});
test('synthetic fixture count 237/123/241/66/0, no fabricated sale',()=>{
 const v=makeFixture();
 assert.equal(v.variants.length,237);assert.equal(v.series.length,123);assert.equal(v.marketListings.length,241);
 assert.equal(v.marketListings.filter(x=>x.status==='active').length,66);
 assert.equal(v.marketListings.filter(x=>x.status==='sold').length,0);
 assert.equal(new Set(v.marketListings.map(x=>x.id)).size,241);
});
test('existing A9R immutable 52 assertion script untouched, no Vinext fallback in local gate',()=>{
 const a=fs.readFileSync('scripts/a9r-postflight-evidence.mjs','utf8');
 assert.match(a,/export const ASSERTIONS = Object\.freeze\(\[/);
 assert.match(a,/A\("ranking_legacy_redirect", "\/ranking\?tab=upcoming&scope=series", 308/);
 const gate=fs.readFileSync('experiments/a9r-c0/gate-core.mjs','utf8');
 assert.doesNotMatch(gate,/vinext\/server\/fetch-handler/);
});
