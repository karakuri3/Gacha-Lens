import assert from 'node:assert/strict';
import test from 'node:test';
import {decide,EXPECTED_ROUTES} from '../experiments/a9r-c0/gate-core.mjs';
const sha='a'.repeat(40),other='b'.repeat(40),hash='f'.repeat(64),now=Date.parse('2026-10-12T03:00:00Z');
const mk=(state,id)=>({request_url:'/ranking?_rsc='+id,headers:{rsc:'1','next-router-state-tree':state,'next-router-prefetch':'','next-router-segment-prefetch':'','next-url':''},asset:{path:'/__c0_private/flight-'+(id==='a'?'0':'1'),bytes:4500,sha256:hash,content_type:'text/x-component'}});
const manifest=()=>({schema:'gacha.c0.local.v1',source_sha:sha,data_revision:'fixture-r1',complete:true,expected_routes:[...EXPECTED_ROUTES],generated_at_ms:now-1,fresh_until_ms:now+1000,next_jst_midnight_ms:now+1000,next_evidence_expiry_ms:now+1000,update_sla_deadline_ms:now+1000,metrics:{sold_count:0,ranked_count:0,watch_count:30,sold_and_active_separated:true},provenance:{fixture_binding_proven:true,actual_page_dataset:'fixture-r1'},assets:{html:{path:'/__c0_private/html',bytes:6000,sha256:hash,content_type:'text/html'}},rsc_requests:[mk('router-state-a','a'),mk('router-state-b','b')]});
const run=(url,h,m=manifest(),revision='fixture-r1',clock=now)=>decide({request:new Request('http://127.0.0.1:8787'+url,{headers:{'x-gacha-expected-app-source-sha':sha,...h}}),manifest:m,appSha:sha,trustedRevision:revision,nowMs:clock});
test('two browser-like distinct captured RSC fingerprints map to distinct payloads, no invented broad fallback',()=>{
 const a=run('/ranking?_rsc=a',{rsc:'1','next-router-state-tree':'router-state-a'});
 const b=run('/ranking?_rsc=b',{rsc:'1','next-router-state-tree':'router-state-b'});
 assert.equal(a.status,200);assert.equal(b.status,200);assert.notEqual(a.asset.path,b.asset.path);
 assert.equal(run('/ranking?_rsc=a',{rsc:'1','next-router-state-tree':'router-state-b'}).status,503);
 assert.equal(run('/ranking?_rsc=a',{rsc:'1','next-router-state-tree':'router-state-a','next-router-prefetch':'1'}).status,503);
 assert.equal(run('/ranking',{RSC:'1'}).status,503);
});
test('changed revision, missing provenance, corrupt path and expired fixed snapshot do not serve cached Flight',()=>{
 const h={rsc:'1','next-router-state-tree':'router-state-a'};
 assert.equal(run('/ranking?_rsc=a',h,manifest(),'fixture-r2').status,503);
 const m=manifest();m.provenance.fixture_binding_proven=false;
 assert.equal(run('/ranking?_rsc=a',h,m).status,503);
 const path=manifest();path.rsc_requests[0].asset.path='/public/flight';
 assert.equal(run('/ranking?_rsc=a',h,path).status,503);
 assert.equal(run('/ranking?_rsc=a',h,manifest(),'fixture-r1',now+1000).status,503);
 const mismatch=manifest();mismatch.source_sha=other;assert.equal(run('/ranking?_rsc=a',h,mismatch).status,409);
});
