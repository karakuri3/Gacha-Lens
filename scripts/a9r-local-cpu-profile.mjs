import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const HOST="127.0.0.1", PORT=8787, INSPECTOR=9230, FIXTURE_PORT=8788;
const OUT=process.env.PROFILE_OUT_DIR||"cpu-profile-evidence";
export const SHAPE=Object.freeze({variants:237,series:123,marketListings:241,sold:0,active:66});
export function makeFixture(){
 const series=Array.from({length:SHAPE.series},(_,i)=>({id:"s"+i,slug:"fixture-series-"+i,name:"Fixture Series "+i,franchise:"Fixture",brand:"Fixture",category:"Fixture",is_released:true,release_date:"2026-09-01",release_month:"2026-09",price:300,image_url:"",official_url:""}));
 const variants=Array.from({length:SHAPE.variants},(_,i)=>({id:"v"+i,slug:"fixture-variant-"+i,name:"Fixture Variant "+i,series_id:series[i%123].id,variant_type:"normal",rarity:"normal",released:true,release_date:"2026-09-01",release_month:"2026-09",price:300,review_required:false,source_type:"fixture",image:"",parent:series[i%123],release_parent_true:series[i%123],release_parent_not_true:null,release_parent_past:series[i%123],release_parent_future_or_null:null}));
 const listings=Array.from({length:SHAPE.marketListings},(_,i)=>({id:"l"+i,variant_id:variants[i%237].id,matched_variant_id:variants[i%237].id,series_id:variants[i%237].series_id,title:"Fixture Listing "+i,listing_type:"single",market_review_type:"single",classification_reason:"explicit_listing_type",classification_confidence:0.99,price:400+i,status:i<66?"active":"ended",source:"fixture",source_type:"fixture",source_url:"https://example.invalid/item/"+i,listed_at:"2026-10-01T00:00:00Z",last_observed_at:"2026-10-08T00:00:00Z",sold_at:null,confidence:0.99,review_required:false,raw:{}}));
 return {series,variants,listings};
}
export function assertFixture(f){
 assert.equal(f.series.length,123);assert.equal(f.variants.length,237);assert.equal(f.listings.length,241);
 assert.equal(new Set(f.listings.map(x=>x.variant_id)).size,237);
 assert.equal(f.listings.filter(x=>x.status==="active").length,66);
 assert.equal(f.listings.filter(x=>x.sold_at||x.status==="sold").length,0);
}
export function fixtureResponse(url,f){
 const u=new URL(url,"http://"+HOST+":"+FIXTURE_PORT);
 if(!u.pathname.startsWith("/rest/v1/"))return {status:404,body:{message:"fixture only"}};
 const table=u.pathname.split("/").at(-1);
 let rows=table==="market_listings"?f.listings:table==="variants"?f.variants:table==="series"?f.series:null;
 if(!rows)return {status:404,body:{message:"table not in fixture"}};
 for(const field of ["id","series_id","variant_id"]){
  const value=u.searchParams.get(field);
  if(value?.startsWith("in.(")){const ids=value.slice(4,-1).split(",");rows=rows.filter(row=>ids.includes(row[field]));}
 }
 const offset=Number(u.searchParams.get("offset")||0),limit=Number(u.searchParams.get("limit")||0);
 if(offset)rows=rows.slice(offset);if(limit)rows=rows.slice(0,limit);
 if(u.searchParams.get("select")==="variant_id")rows=rows.map(x=>({variant_id:x.variant_id}));
 return {status:200,body:rows};
}
export function serveFixture(){
 const f=makeFixture();assertFixture(f);fs.mkdirSync(OUT,{recursive:true});
 fs.writeFileSync(path.join(OUT,"fixture-contract.json"),JSON.stringify({shape:SHAPE,synthetic:true,credentials:false},null,2));
 http.createServer((req,res)=>{
  const v=fixtureResponse(req.url||"",f);
  res.writeHead(v.status,{"content-type":"application/json","cache-control":"no-store"});
  res.end(JSON.stringify(v.body));
 }).listen(FIXTURE_PORT,HOST,()=>console.log("LOCAL_FIXTURE_READY "+FIXTURE_PORT));
}
async function inspectorUrl(){
 for(let i=0;i<30;i++){
  try{const r=await fetch("http://"+HOST+":"+INSPECTOR+"/json/list",{signal:AbortSignal.timeout(1000)});
   if(r.ok){const entries=await r.json();const target=entries.find(x=>x.webSocketDebuggerUrl);if(target)return target.webSocketDebuggerUrl;}
  }catch{}
  await new Promise(r=>setTimeout(r,250));
 }
 throw Error("INSPECTOR_UNAVAILABLE: no CDP websocket on localhost:9230");
}
export async function connectCDP(rawUrl){
 const url=new URL(rawUrl);
 if(url.protocol!=="ws:"||!["localhost","127.0.0.1"].includes(url.hostname)||url.port!==String(INSPECTOR))throw Error("NON_LOCAL_INSPECTOR_REFUSED");
 url.hostname=HOST;
 const {default:WS}=await import("../.github/vinext-toolchain/node_modules/ws/index.js");
 return new Promise((resolve,reject)=>{
  const socket=new WS(url.href,{origin:"http://"+HOST+":"+INSPECTOR,handshakeTimeout:5000});
  let id=0;const pending=new Map();
  const timer=setTimeout(()=>reject(Error("INSPECTOR_WS_TIMEOUT")),6000);
  socket.on("error",error=>{clearTimeout(timer);reject(Error("INSPECTOR_WS_ERROR "+String(error?.message||"unknown").slice(0,200)));});
  socket.on("open",()=>{
   clearTimeout(timer);
   socket.on("message",event=>{
    let obj;try{obj=JSON.parse(String(event));}catch{return;}
    if(!pending.has(obj.id))return;const p=pending.get(obj.id);pending.delete(obj.id);
    obj.error?p.reject(Error("CDP "+p.method+" "+JSON.stringify(obj.error))):p.resolve(obj.result||{});
   });
   resolve({send:(method,params={})=>new Promise((resolve,reject)=>{
    const key=++id;const wait=setTimeout(()=>{pending.delete(key);reject(Error("CDP_TIMEOUT "+method));},10000);
    pending.set(key,{method,resolve:v=>{clearTimeout(wait);resolve(v);},reject:e=>{clearTimeout(wait);reject(e);}});
    socket.send(JSON.stringify({id:key,method,params}));
   }),close:()=>socket.close()});
  });
 });
}
export function analyze(profile){
 assert.ok(profile&&profile.nodes?.length>0,"missing nodes");
 assert.ok(profile.samples?.length>0,"missing request samples");
 const nodes=new Map(profile.nodes.map(n=>[n.id,n]));
 const count=new Map();for(const id of profile.samples)count.set(id,(count.get(id)||0)+1);
 const totalMicroseconds=(profile.timeDeltas||[]).reduce((a,b)=>a+b,0);
 const top=profile.nodes.filter(n=>count.has(n.id)&&n.callFrame?.functionName&&!/^\(idle\)|^\(program\)|^\(root\)/.test(n.callFrame.functionName))
  .sort((a,b)=>(count.get(b.id)||0)-(count.get(a.id)||0)).slice(0,40)
  .map(n=>{let sum=0;for(const sample of profile.samples){let cursor=sample,seen=new Set();
   while(cursor&&!seen.has(cursor)){seen.add(cursor);if(cursor===n.id){sum++;break;}cursor=nodes.get(cursor)?.parent;}}
   return {name:n.callFrame.functionName,url:n.callFrame.url||"",self_samples:count.get(n.id),total_samples:sum,
    self_sampled_ms:totalMicroseconds*count.get(n.id)/profile.samples.length/1000,
    total_sampled_ms:totalMicroseconds*sum/profile.samples.length/1000};});
 assert.ok(top.length>0,"NO_FUNCTION_SAMPLES");
 return {sample_count:profile.samples.length,sampled_cpu_ms:totalMicroseconds/1000,
  top_functions:top,warning:"CDP sampling is local workerd CPU, not billed Production CPU"};
}
async function capture(client,label,iteration){
 const url="http://"+HOST+":"+PORT+(label==="phase1"?"/review":"/ranking");
 await client.send("Profiler.start");
 let res,raw;
 const start=performance.now();
 try{res=await fetch(url,{headers:{"cache-control":"no-cache","accept":"text/html"},
  signal:AbortSignal.timeout(20000)});raw=await res.arrayBuffer();}
 finally{var wall=performance.now()-start;}
 const p=(await client.send("Profiler.stop")).profile;
 const detail=analyze(p),data={phase:label,iteration,http_status:res.status,bytes:raw.byteLength,wall_ms:wall,...detail};
 const filename=path.join(OUT,label+"-"+iteration);
 fs.writeFileSync(filename+".cpuprofile",JSON.stringify(p));
 fs.writeFileSync(filename+".json",JSON.stringify(data,null,2));
 assert.equal(res.status,200,"LOCAL_REQUEST_HTTP_"+res.status);
 if(label!=="phase1"){
  const text=new TextDecoder().decode(raw);
  assert.match(text,/成約価格ランキング/,"actual ranking page missing");
  assert.match(text,/出品価格ウォッチ/,"actual ranking listing watch missing");
 }
 return data;
}
export async function run(){
 fs.mkdirSync(OUT,{recursive:true});
 const iteration=Number(process.argv.find(x=>x.startsWith("--iteration="))?.split("=")[1]||1);
 const client=await connectCDP(await inspectorUrl());
 try{
  await client.send("Profiler.enable");
  if(iteration===1){
   const proof=await capture(client,"phase1",iteration);
   fs.writeFileSync(path.join(OUT,"phase1-pass.json"),JSON.stringify({status:"PASS",samples:proof.sample_count}));
  } else assert.ok(fs.existsSync(path.join(OUT,"phase1-pass.json")),"PHASE1_NOT_PROVEN");
  const cold=await capture(client,"cold",iteration);
  const repeat=await capture(client,"repeat",iteration);
  console.log(JSON.stringify({iteration,cold_samples:cold.sample_count,repeat_samples:repeat.sample_count,
   cold_bytes:cold.bytes,repeat_bytes:repeat.bytes}));
 } finally {client.close();}
}
export function summarize(){
 const sort=x=>[...x].sort((a,b)=>a-b);
 const median=x=>sort(x)[1];let cold=[],repeat=[];
 for(let i=1;i<=3;i++){
  cold.push(JSON.parse(fs.readFileSync(path.join(OUT,"cold-"+i+".json"))));
  repeat.push(JSON.parse(fs.readFileSync(path.join(OUT,"repeat-"+i+".json"))));
 }
 const report={status:"PASS",fixture:SHAPE,runs:3,cold_median_sampled_cpu_ms:median(cold.map(x=>x.sampled_cpu_ms)),
  repeat_median_sampled_cpu_ms:median(repeat.map(x=>x.sampled_cpu_ms)),
  cold_median_bytes:median(cold.map(x=>x.bytes)),repeat_median_bytes:median(repeat.map(x=>x.bytes)),
  cold,repeat,warning:"Not evidence of passing Cloudflare Free 10ms budget"};
 fs.writeFileSync(path.join(OUT,"profile-summary.json"),JSON.stringify(report,null,2));
 console.log(JSON.stringify({cold_median_sampled_cpu_ms:report.cold_median_sampled_cpu_ms,repeat_median_sampled_cpu_ms:report.repeat_median_sampled_cpu_ms}));
}
const action=process.argv[2];
if(action==="serve")serveFixture();
else if(action==="profile")await run();
else if(action==="summarize")summarize();
else if(action&&!process.env.NODE_TEST_CONTEXT)throw Error("Unknown action");
