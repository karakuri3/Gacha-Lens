// C0-B genuine Next fixture capture; asset gate only if renderer/browser provenance both verified.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {makeFixture,REVISION,PINNED_NOW} from './synthetic-fixture.mjs';
const origin=process.env.C0_NEXT_ORIGIN,root=process.env.GITHUB_WORKSPACE,source=process.env.C0_SOURCE_SHA;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin||'')||!root||!/^[a-f0-9]{40}$/.test(source||''))throw Error('local_exact_source_required');
const out=path.join(root,'experiments/a9r-c0/artifacts'),privateDir=path.join(out,'__c0_private');
fs.mkdirSync(privateDir,{recursive:true});
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={schema:'gacha.c0.capture.v2',immutable_git_source_sha:source,overlay_modified_worktree:true,data_revision:REVISION,fixture_time:PINNED_NOW,authentic:false,error:null,html:null,rsc:[]};
try{
 const overlay=JSON.parse(fs.readFileSync(path.join(out,'overlay-provenance.json'),'utf8'));
 const browser=JSON.parse(fs.readFileSync(path.join(out,'browser-report.json'),'utf8'));
 const fixture=makeFixture(),fingerprint=digest(JSON.stringify(fixture));
 if(overlay.original_git_commit!==source||overlay.fixture_sha256!==fingerprint||overlay.overlay_is_modified_worktree!==true||browser.error||browser.direct_document?.watch_cards!==30||browser.transitions.length!==2)throw Error('renderer_browser_fixture_provenance_not_established');
 const res=await fetch(origin+'/ranking',{headers:{accept:'text/html','cache-control':'no-cache'},redirect:'manual',signal:AbortSignal.timeout(20000)});
 const bytes=Buffer.from(await res.arrayBuffer()),type=res.headers.get('content-type')||'';
 const html=bytes.toString('utf8');
 const cards=[...html.matchAll(/class="product-name"/g)].length;
 const valid=res.status===200&&type.startsWith('text/html')&&cards===30&&html.includes('C0 synthetic 0')&&html.includes('C0 synthetic 10')&&html.includes('出品価格ウォッチ')&&html.includes('現在、成約価格として確認できるデータがありません')&&!html.includes('rank-medal--');
 report.html={status:res.status,bytes:bytes.length,content_type:type,sha256:digest(bytes),listing_watch_cards:cards,sold_ranking_zero:html.includes('現在、成約価格として確認できるデータがありません'),contains_fixture_identity:html.includes('C0 synthetic 0')};
 if(!valid)throw Error('actual_next_html_fixture_truth_mismatch');
 fs.writeFileSync(path.join(privateDir,'html'),bytes);
 if(!Array.isArray(browser.selected_flight)||browser.selected_flight.length<2)throw Error('genuine_flight_pair_missing');
 const selections=[];
 for(let i=0;i<2;i++){
   const item=browser.selected_flight[i],file=path.join(privateDir,path.basename(item.asset||''));
   if(!fs.existsSync(file))throw Error('browser_flight_file_missing');
   const body=fs.readFileSync(file);
   if(digest(body)!==item.sha256||body.length!==item.bytes||!body.includes(Buffer.from('C0 synthetic'))||item.mime!=='text/x-component'||item.bytes<=1024)throw Error('genuine_flight_bytes_not_ranking');
   selections.push({url:item.request,headers:item.headers,sha256:item.sha256,bytes:item.bytes,asset:item.asset,content_type:'text/x-component'});
 }
 if(new Set(selections.map(x=>x.headers['next-router-state-tree'])).size<2)throw Error('browser_state_pair_not_distinct');
 const now=Date.now(),nextMidnight=(Math.floor((now+32400000)/86400000)+1)*86400000-32400000;
 const evidenceExpiry=Date.parse(PINNED_NOW)+29*86400000;
 if(now>=evidenceExpiry)throw Error('fixture_evidence_expired');
 const deadline=now+300000;
 const metrics={series_count:123,variant_count:237,listing_count:241,active_count:66,sold_count:0,ranked_count:0,watch_count:30,sold_and_active_separated:true};
 const manifest={schema:'gacha.c0.local.v1',source_sha:source,data_revision:REVISION,complete:true,expected_routes:['/ranking','/ranking/series','/ranking/upcoming','/ranking/upcoming/series'],prototype_routes:['/ranking'],generated_at_ms:now,fresh_until_ms:Math.min(nextMidnight,evidenceExpiry,deadline),next_jst_midnight_ms:nextMidnight,next_evidence_expiry_ms:evidenceExpiry,update_sla_deadline_ms:deadline,metrics,provenance:{actual_next_response:true,actual_page_dataset:REVISION,fixture_binding_proven:true,overlay_sha256:overlay.overlay_blob_sha256,fixture_sha256:fingerprint,modified_worktree:true},assets:{html:{path:'/__c0_private/html',bytes:bytes.length,sha256:digest(bytes),content_type:'text/html'}},rsc_requests:[]};
 for(const x of selections)manifest.rsc_requests.push({request_url:x.url,headers:x.headers,asset:{path:x.asset,bytes:x.bytes,sha256:x.sha256,content_type:x.content_type}});
 fs.writeFileSync(path.join(privateDir,'manifest'),JSON.stringify(manifest));
 report.rsc=selections.map(x=>({request_url:x.url,sha256:x.sha256,bytes:x.bytes,content_type:x.content_type,real_browser:true}));
 report.authentic=true;report.asset_count=1+selections.length+1;report.asset_bytes=bytes.length+selections.reduce((n,x)=>n+x.bytes,0)+Buffer.byteLength(JSON.stringify(manifest));
} catch(e){report.error=String(e?.message||'capture_failed').slice(0,120)}
finally{fs.writeFileSync(path.join(out,'capture-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
if(!report.authentic)process.exitCode=2;