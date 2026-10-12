// Captures bytes from genuine local Next, never synthesizes Flight. No Production host.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {makeFixture,REVISION,PINNED_NOW} from './synthetic-fixture.mjs';
const root='experiments/a9r-c0/artifacts',privateDir=root+'/__c0_private';
fs.mkdirSync(privateDir,{recursive:true});
const origin=process.env.C0_NEXT_ORIGIN;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin||'')) throw Error('localhost_only_origin_required');
const sha=(process.env.C0_SOURCE_SHA||'').toLowerCase();
if(!/^[0-9a-f]{40}$/.test(sha))throw Error('exact_head_required');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const state=encodeURIComponent(JSON.stringify(['',{children:['ranking',{children:['__PAGE__',{}]}]}]));
const state2=encodeURIComponent(JSON.stringify(['',{children:['ranking',{children:['__PAGE__',{searchParams:{x:'2'}}]}]}]));
const calls=[
 {kind:'html',url:origin+'/ranking',headers:{Accept:'text/html'}},
 {kind:'rsc',url:origin+'/ranking?_rsc=c0a',headers:{Accept:'text/x-component',RSC:'1','Next-Router-State-Tree':state}},
 {kind:'rsc_other',url:origin+'/ranking?_rsc=c0b',headers:{Accept:'text/x-component',RSC:'1','Next-Router-State-Tree':state2}},
];
const results=[];
for(const call of calls){
  const row={kind:call.kind,actual_next_response:true,genuine:false,http_status:null,content_type:null,sha256:null,bytes:null,error:null};
  try{
    const resp=await fetch(call.url,{headers:call.headers,signal:AbortSignal.timeout(30000)});
    const b=Buffer.from(await resp.arrayBuffer()),ct=resp.headers.get('content-type')||'';
    row.http_status=resp.status;row.content_type=ct;row.sha256=digest(b);row.bytes=b.length;
    row.genuine=resp.status===200 && (call.kind==='html'?(ct.includes('text/html')&&b.includes(Buffer.from('<html'))&&b.includes(Buffer.from('RANKING'))):(ct.includes('text/x-component')&&b.length>0));
    if(row.genuine)fs.writeFileSync(privateDir+'/'+call.kind,b);
    else row.error='not_authentic_expected_content_type';
  }catch{row.error='localhost_capture_failed'}
  results.push(row);
}
const records=makeFixture(),metrics={variant_count:records.variants.length,series_count:records.series.length,listing_count:records.marketListings.length,active_count:records.marketListings.filter(x=>x.status==='active').length,sold_count:0,ranked_count:0,watch_count:30,sold_and_active_separated:true};
const report={schema:'gacha.c0.capture.v1',source_sha:sha,fixture_revision:REVISION,fixture_time:PINNED_NOW,real_next_uses_same_fixture:false,metrics,results};
fs.writeFileSync(root+'/capture-report.json',JSON.stringify(report,null,2)+'\n');
if(results.every(x=>x.genuine)){
  const now=Date.now();
  const nextMidnight=Math.floor((now+9*3600000)/86400000+1)*86400000-9*3600000;
  const minDeadline=now+5*60*1000;
  const assets=Object.fromEntries(['html','rsc'].map(kind=>{const bytes=fs.readFileSync(privateDir+'/'+kind);return [kind,{path:'/__c0_private/'+kind,bytes:bytes.length,sha256:digest(bytes),content_type:kind==='html'?'text/html':'text/x-component'}]}));
  const manifest={schema:'gacha.c0.local.v1',source_sha:sha,data_revision:REVISION,complete:true,expected_routes:['/ranking','/ranking/series','/ranking/upcoming','/ranking/upcoming/series'],prototype_routes:['/ranking'],generated_at_ms:now,fresh_until_ms:Math.min(nextMidnight,minDeadline),next_jst_midnight_ms:nextMidnight,next_evidence_expiry_ms:minDeadline,update_sla_deadline_ms:minDeadline,metrics,
    rsc_request:{query:'c0a',state,prefetch:'',segment:'',next_url:''},assets,
    provenance:{actual_next_response:true,actual_page_dataset:'repository_builtin_sample',fixture_binding_proven:false}};
  fs.writeFileSync(privateDir+'/manifest',JSON.stringify(manifest));
  report.generated_asset_count=3;
  report.generated_asset_bytes=Object.values(assets).reduce((s,x)=>s+x.bytes,0)+Buffer.byteLength(JSON.stringify(manifest));
  fs.writeFileSync(root+'/capture-report.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report));
if(results.some(x=>!x.genuine))process.exitCode=2;
