// C0-B real local Chromium CDP trace, with zero fabricated Next Router state.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as wait} from 'node:timers/promises';
const origin=process.env.C0_NEXT_ORIGIN,bin=process.env.C0_CHROME_BIN,root=process.env.GITHUB_WORKSPACE;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin||'')||!bin||!root)throw Error('localhost_browser_required');
const output=path.join(root,'experiments/a9r-c0/artifacts');
const privateDir=path.join(output,'__c0_private');fs.mkdirSync(privateDir,{recursive:true});
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const report={schema:'gacha.c0.browser.v1',browser_binary:path.basename(bin),browser_version:null,source:'actual_local_chromium_cdp',direct_document:null,transitions:[],flight:[],exceptions:[],error:null};
let stderr='';
const profile=fs.mkdtempSync(path.join('/tmp/','c0-chrome-'));
const chrome=spawn(bin,['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
chrome.stderr.on('data',c=>stderr=(stderr+c.toString()).slice(-7000));
let ws;
const pending=new Map(),traffic=new Map(),flightBodies=[];
let seq=0,session,firstHttp500=null;
function send(method,params={},sid=session){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}));setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('local_cdp_timeout_'+method))}},12000).unref();})}
function onMsg(data){
 const msg=JSON.parse(String(data));
 if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p.reject(Error('cdp_command_failed_'+String(msg.error.code)));else p.resolve(msg.result);return}
 if(msg.method==='Runtime.exceptionThrown'){const d=msg.params?.exceptionDetails||{};report.exceptions.push({category:'browser_exception',text_class:String(d.text||'').slice(0,100)});return}
 if(msg.method==='Network.requestWillBeSent'){
  const d=msg.params||{},req=d.request||{},u=new URL(req.url);
  if(u.origin!==origin||u.pathname!=='/ranking')return;
  const h=req.headers||{};const get=k=>Object.entries(h).find(([n])=>n.toLowerCase()===k.toLowerCase())?.[1]??'';
  const isFlight=get('RSC')==='1'||u.searchParams.has('_rsc');
  if(isFlight)traffic.set(d.requestId,{url:u.pathname+u.search,headers:{rsc:get('RSC'),'next-router-state-tree':get('Next-Router-State-Tree'),'next-router-prefetch':get('Next-Router-Prefetch'),'next-router-segment-prefetch':get('Next-Router-Segment-Prefetch'),'next-url':get('Next-Url')},status:null,mime:null,request_id:d.requestId});
 }
 if(msg.method==='Network.responseReceived'){
  const t=traffic.get(msg.params?.requestId);if(t){t.status=msg.params.response?.status;t.mime=msg.params.response?.mimeType;if(t.status>=500&&!firstHttp500)firstHttp500={status:t.status,request:t.url}}
 }
 if(msg.method==='Network.loadingFinished'&&traffic.has(msg.params?.requestId)){
  const t=traffic.get(msg.params.requestId);
  void send('Network.getResponseBody',{requestId:t.request_id}).then(x=>{
    const body=Buffer.from(x.body||'',x.base64Encoded?'base64':'utf8');
    const i=flightBodies.length,asset='flight-'+i;
    const hasRanking=body.includes(Buffer.from('C0 synthetic'))||body.includes(Buffer.from('出品価格ウォッチ'));
    const item={request:t.url,headers:t.headers,status:t.status,mime:t.mime,bytes:body.length,sha256:sha(body),payload_has_ranking:hasRanking,body_asset:'/__c0_private/'+asset,router_state_sha256:sha(t.headers['next-router-state-tree']),preview_only:false};
    fs.writeFileSync(path.join(privateDir,asset),body);flightBodies.push(item);
  }).catch(()=>report.exceptions.push({category:'cdp_flight_body_unavailable'}));
 }
}
async function evaluate(expression){let x=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(x.exceptionDetails)throw Error('browser_eval_exception');return x.result?.value}
async function untilPath(p,deadline=15000){
 const start=Date.now();while(Date.now()-start<deadline){try{if(await evaluate('location.pathname')===p)return true}catch{}await wait(300)}return false;
}
async function navigate(url){await send('Page.navigate',{url:origin+url});if(!await untilPath(url.split('?')[0]))throw Error('document_navigation_failed')}
try{
 let listening=null;for(let i=0;i<60;i++){listening=stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-z0-9-]+)/i)?.[1];if(listening)break;if(chrome.exitCode!==null)break;await wait(250)}
 if(!listening)throw Error('local_chromium_cdp_start_failed');
 ws=new WebSocket(listening);await new Promise((ok,bad)=>{ws.onopen=ok;ws.onerror=()=>bad(Error('local_websocket_failed'))});ws.onmessage=e=>onMsg(e.data);
 report.browser_version=(await send('Browser.getVersion',{},null)).product;
 const target=(await send('Target.createTarget',{url:'about:blank'},null)).targetId;
 session=(await send('Target.attachToTarget',{targetId:target,flatten:true},null)).sessionId;
 await send('Page.enable');await send('Network.enable');await send('Runtime.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
 await navigate('/ranking');await wait(1700);
 report.direct_document={path:await evaluate('location.pathname'),has_watch:await evaluate('document.body.innerText.includes("出品価格ウォッチ")'),has_empty_sold:await evaluate('document.body.innerText.includes("現在、成約価格として確認できるデータがありません")'),watch_cards:await evaluate('document.querySelectorAll("#listing-watch-title").length ? document.querySelectorAll(".product-name").length : 0')};
 if(!report.direct_document.has_watch||!report.direct_document.has_empty_sold||report.direct_document.watch_cards!==30)throw Error('real_browser_render_fixture_mismatch');
 for(const from of ['/','/series']){
  await navigate(from);await wait(1400);
  const prior=await evaluate('performance.timeOrigin');
  const click=await evaluate('(()=>{const links=[...document.links];const a=links.find(x=>x.getAttribute("href")==="/ranking"&&x.closest(".app-sidebar"))||links.find(x=>x.getAttribute("href")==="/ranking");if(!a)return false;a.click();return true})()');
  if(!click||!await untilPath('/ranking'))throw Error('real_next_link_navigation_failed');
  const after=await evaluate('performance.timeOrigin');
  const correct=await evaluate('document.body.innerText.includes("出品価格ウォッチ")');
  report.transitions.push({from,to:'/ranking',next_link:true,same_document:prior===after,rendered_watch:correct});
  await wait(2400);if(firstHttp500)throw Error('real_browser_flight_http_5xx');await evaluate('history.back()');
  if(!await untilPath(from))throw Error('history_back_failed');
  await evaluate('history.forward()');if(!await untilPath('/ranking'))throw Error('history_forward_failed');
  report.transitions.at(-1).back_forward=true;
  await wait(800);
 }
 await wait(1200);if(firstHttp500)throw Error('real_browser_flight_http_5xx');
 report.flight=flightBodies.map(x=>({...x,headers:{rsc:x.headers.rsc,'next-router-state-tree-sha256':x.router_state_sha256,'next-router-prefetch':x.headers['next-router-prefetch'],'next-router-segment-prefetch':x.headers['next-router-segment-prefetch'],'next-url':x.headers['next-url']}}));
 const full=flightBodies.filter(x=>x.status===200&&x.mime==='text/x-component'&&x.payload_has_ranking&&x.bytes>1024);
 const distinct=new Set(full.map(x=>x.router_state_sha256));
 report.prefetch_observed=[...traffic.values()].some(x=>x.headers['next-router-prefetch']==='1');
 if(traffic.size&&[...traffic.values()].some(x=>x.status>=500))throw Error('real_browser_flight_http_5xx');
 if(report.transitions.some(x=>!x.same_document||!x.rendered_watch||!x.back_forward))throw Error('real_browser_navigation_semantics_failed');
 if(distinct.size<2)throw Error('two_legitimate_flight_states_not_proven');
 if(!report.prefetch_observed)throw Error('real_next_prefetch_not_observed');
 report.selected_flight=full.slice(0,2).map(x=>({request:x.url,headers:x.headers,asset:x.body_asset,sha256:x.sha256,bytes:x.bytes,mime:x.mime}));
} catch(e){report.error=String(e?.message||'browser_unknown_error').slice(0,120)}
finally{
 report.flight_count=flightBodies.length;report.captured_at_utc=new Date().toISOString();
 fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
 if(ws?.readyState===1)ws.close();chrome.kill('SIGTERM');
}
console.log(JSON.stringify({schema:report.schema,version:report.browser_version,document:report.direct_document,transitions:report.transitions,flight:report.flight.map(x=>({status:x.status,mime:x.mime,bytes:x.bytes,sha256:x.sha256,router_state_sha256:x.router_state_sha256,has_ranking:x.payload_has_ranking})),error:report.error}));
if(report.error)process.exitCode=2;