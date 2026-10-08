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

const SUPPORTED_FIELDS=new Set(["select","id","series_id","variant_id","slug","name","variant_type","review_required","last_observed_at","order","offset","limit","or","released","release_date","parent.is_released","parent.release_date","release_parent_true.is_released","release_parent_not_true.or","release_parent_past.release_date","release_parent_future_or_null.or","release_parent_true","release_parent_not_true","release_parent_past","release_parent_future_or_null"]);
const ALIASES=["release_parent_true","release_parent_not_true","release_parent_past","release_parent_future_or_null"];
export function fixtureResponse(url,f,{range}={}){
 const u=new URL(url,"http://"+HOST+":"+FIXTURE_PORT);
 if(!u.pathname.startsWith("/rest/v1/"))return {status:404,body:{message:"fixture only"},kind:"unsupported"};
 const table=u.pathname.split("/").at(-1);
 let rows=table==="market_listings"?f.listings:table==="variants"?f.variants:table==="series"?f.series:null;
 if(!rows)return {status:400,body:{message:"unsupported fixture table"},kind:"unsupported"};
 const invalid=[...u.searchParams.keys()].filter(k=>!SUPPORTED_FIELDS.has(k)&&!ALIASES.some(alias=>k.startsWith(alias+".")));
 if(invalid.length)return {status:400,body:{message:"unsupported fixture query key"},kind:"unsupported",unsupported_count:invalid.length};
 const select=u.searchParams.get("select")||"";
 const kind=table==="market_listings"?(select==="variant_id"?"candidate":"market_hydration"):table==="variants"?"variant_hydration":"series_hydration";
 if(kind==="candidate"&&!select.startsWith("variant_id"))return {status:400,body:{message:"invalid candidate selection"},kind:"unsupported"};
 if(kind==="variant_hydration"&&!select.includes("parent:series!inner("))return {status:400,body:{message:"missing parent hydration"},kind:"unsupported"};
 for(const field of ["id","series_id","variant_id","slug","name"]){
  const value=u.searchParams.get(field);
  if(!value)continue;
  if(value.startsWith("in.(")&&value.endsWith(")")){
   const ids=value.slice(4,-1).split(",");
   rows=rows.filter(row=>ids.includes(String(row[field])));
  }else if(value==="not.is.null"){rows=rows.filter(row=>row[field]!=null);}
  else if(value==="neq."){rows=rows.filter(row=>row[field]!=="" && row[field]!=null);}
  else return {status:400,body:{message:"unsupported identity predicate"},kind:"unsupported"};
 }
 const variantType=u.searchParams.get("variant_type");
 if(variantType){if(variantType!=="neq.provisional")return {status:400,body:{message:"unsupported variant type"},kind:"unsupported"};rows=rows.filter(row=>row.variant_type!=="provisional");}
 const review=u.searchParams.get("review_required");
 if(review){if(review!=="eq.false")return {status:400,body:{message:"unsupported review predicate"},kind:"unsupported"};rows=rows.filter(row=>row.review_required===false);}
 const cutoff=u.searchParams.get("last_observed_at");
 if(cutoff){if(!cutoff.startsWith("gte.")||!Number.isFinite(Date.parse(cutoff.slice(4))))return {status:400,body:{message:"unsupported timestamp predicate"},kind:"unsupported"};rows=rows.filter(row=>Date.parse(row.last_observed_at)>=Date.parse(cutoff.slice(4)));}
 const expressions=u.searchParams.getAll("or");
 for(const rawExpression of expressions){
  const expression=rawExpression.startsWith("(")&&rawExpression.endsWith(")")?rawExpression.slice(1,-1):rawExpression;
  if(table!=="variants")return {status:400,body:{message:"unsupported release logic"},kind:"unsupported"};
  if(expression==="variant_type.is.null,variant_type.neq.provisional"){rows=rows.filter(row=>row.variant_type==null||row.variant_type!=="provisional");continue;}
  if(expression.includes("released.eq.true")&&expression.includes("release_parent_true.not.is.null")){rows=rows.filter(row=>row.released===true);continue;}
  return {status:400,body:{message:"unsupported release logic"},kind:"unsupported"};
 }
 const releaseFlags=["release_parent_true.is_released","release_parent_not_true.or","release_parent_past.release_date","release_parent_future_or_null.or"];
 for(const field of releaseFlags){const val=u.searchParams.get(field);if(val&&!/^(eq\.true|lte\.\d{4}-\d{2}-\d{2}|\(is_released\.eq\.false,is_released\.is\.null\)|\(release_date\.gt\.\d{4}-\d{2}-\d{2},release_date\.is\.null\))$/.test(val))return {status:400,body:{message:"unsupported relation predicate"},kind:"unsupported"};}
 for(const param of u.searchParams.keys())if(["released","release_date","parent.is_released","parent.release_date"].includes(param))return {status:400,body:{message:"unimplemented direct release predicate"},kind:"unsupported"};
 const order=u.searchParams.get("order");
 if(order){if(order==="last_observed_at.desc")rows=rows.slice().sort((a,b)=>Date.parse(b.last_observed_at)-Date.parse(a.last_observed_at));else return {status:400,body:{message:"unsupported ordering"},kind:"unsupported"};}
 const off=Number(u.searchParams.get("offset")||0),lim=Number(u.searchParams.get("limit")||0);
 if(!Number.isSafeInteger(off)||off<0||!Number.isSafeInteger(lim)||lim<0)return {status:400,body:{message:"invalid pagination"},kind:"unsupported"};
 let from=off,to=lim?off+lim:Infinity;
 if(range){const match=/^(\d+)-(\d+)$/.exec(range);if(!match)return {status:400,body:{message:"unsupported range"},kind:"unsupported"};from=Number(match[1]);to=Number(match[2])+1;}
 rows=rows.slice(from,to);
 const records=rows;
 if(select==="variant_id")rows=rows.map(x=>({variant_id:x.variant_id}));
 return {status:200,body:rows,kind,records,table};
}
function blankAccounting(){return {calls:[],candidateIds:new Set(),variantIds:new Set(),seriesIds:new Set(),marketIds:new Set(),activeIds:new Set(),soldIds:new Set()};}
export function accountingSnapshot(account){
 const totals={candidate:{requests:0,rows:0},variant_hydration:{requests:0,rows:0},series_hydration:{requests:0,rows:0},market_hydration:{requests:0,rows:0,active_rows:0,sold_rows:0},unsupported:{requests:0,rows:0}};
 for(const call of account.calls){totals[call.kind].requests++;totals[call.kind].rows+=call.rows; if(call.kind==="market_hydration"){totals.market_hydration.active_rows+=call.active;totals.market_hydration.sold_rows+=call.sold;}}
 return {total_requests:account.calls.length,...totals,unsupported_reasons:[...new Set(account.calls.filter(c=>c.kind==="unsupported").map(c=>c.reason||"unknown"))],unique:{candidate_variant_ids:account.candidateIds.size,hydrated_variants:account.variantIds.size,hydrated_parent_series:account.seriesIds.size,hydrated_market_listings:account.marketIds.size,hydrated_active_listings:account.activeIds.size,hydrated_sold_listings:account.soldIds.size}};
}
export function assertRankingFidelity(a,{enforce=true}={}){
 assert.equal(a.unsupported.requests,0,"UNSUPPORTED_FIXTURE_QUERY");
 if(!enforce)return;
 assert.ok(a.candidate.requests>=1,"CANDIDATE_READ_NOT_PROVEN");
 assert.equal(a.unique.candidate_variant_ids,SHAPE.variants,"CANDIDATES_MISSING");
 assert.equal(a.unique.hydrated_variants,SHAPE.variants,"VARIANT_HYDRATION_MISSING");
 assert.equal(a.unique.hydrated_parent_series,SHAPE.series,"PARENT_SERIES_HYDRATION_MISSING");
 assert.equal(a.unique.hydrated_market_listings,SHAPE.marketListings,"MARKET_HYDRATION_MISSING");
 assert.equal(a.unique.hydrated_active_listings,SHAPE.active,"ACTIVE_HYDRATION_MISSING");
 assert.equal(a.unique.hydrated_sold_listings,0,"SOLD_HYDRATION_FABRICATED");
}
export function serveFixture(){
 const f=makeFixture();assertFixture(f);fs.mkdirSync(OUT,{recursive:true});
 fs.writeFileSync(path.join(OUT,"fixture-contract.json"),JSON.stringify({shape:SHAPE,synthetic:true,credentials:false},null,2));
 let account=blankAccounting();
 http.createServer((req,res)=>{
  if(req.url==="/__fixture__/reset"){account=blankAccounting();res.writeHead(200,{"content-type":"application/json"});res.end("{}");return;}
  if(req.url==="/__fixture__/accounting"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(accountingSnapshot(account)));return;}
  const v=fixtureResponse(req.url||"",f,{range:req.headers.range?.startsWith("0-")?req.headers.range:undefined});
  const records=v.records||[];
  account.calls.push({kind:v.kind,reason:v.kind==="unsupported"?v.body.message:null,rows:records.length,active:records.filter(x=>x.status==="active").length,sold:records.filter(x=>x.status==="sold"||x.sold_at).length});
  if(v.kind==="candidate")for(const r of records)account.candidateIds.add(r.variant_id);
  if(v.kind==="variant_hydration")for(const r of records){account.variantIds.add(r.id);if(r.parent?.id)account.seriesIds.add(r.parent.id);}
  if(v.kind==="market_hydration")for(const r of records){account.marketIds.add(r.id);if(r.status==="active")account.activeIds.add(r.id);if(r.status==="sold"||r.sold_at)account.soldIds.add(r.id);}
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
 const parentById=new Map();for(const node of profile.nodes)for(const child of node.children||[])parentById.set(child,node.id);
 const count=new Map();for(const id of profile.samples)count.set(id,(count.get(id)||0)+1);
 const totalMicroseconds=(profile.timeDeltas||[]).reduce((a,b)=>a+b,0);
 const top=profile.nodes.filter(n=>count.has(n.id)&&n.callFrame?.functionName&&!/^\(idle\)|^\(program\)|^\(root\)/.test(n.callFrame.functionName))
  .sort((a,b)=>(count.get(b.id)||0)-(count.get(a.id)||0)).slice(0,40)
  .map(n=>{let sum=0;for(const sample of profile.samples){let cursor=sample,seen=new Set();
   while(cursor&&!seen.has(cursor)){seen.add(cursor);if(cursor===n.id){sum++;break;}cursor=parentById.get(cursor);}}
   return {name:n.callFrame.functionName,url:n.callFrame.url||"",self_samples:count.get(n.id),total_samples:sum,
    self_sampled_ms:totalMicroseconds*count.get(n.id)/profile.samples.length/1000,
    total_sampled_ms:totalMicroseconds*sum/profile.samples.length/1000};});
 assert.ok(top.length>0,"NO_FUNCTION_SAMPLES");
 return {sample_count:profile.samples.length,sampled_cpu_ms:totalMicroseconds/1000,
  top_functions:top,warning:"CDP sampling is local workerd CPU, not billed Production CPU"};
}

function decodeVlq(segment){const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";let out=[],acc=0,shift=0;for(const char of segment){const d=alphabet.indexOf(char);if(d<0)throw Error("INVALID_VLQ");acc|=(d&31)<<shift;if(d&32){shift+=5;continue;}out.push(acc&1?-(acc>>1):(acc>>1));acc=shift=0;}if(shift)throw Error("UNTERMINATED_VLQ");return out;}
export function originalPosition(map,generatedLine,generatedColumn){
 if(!map||map.version!==3||!Array.isArray(map.sources)||typeof map.mappings!=="string")return null;
 let previousSource=0,previousLine=0,previousColumn=0,previousName=0;
 const lines=map.mappings.split(";");
 if(generatedLine<0||generatedLine>=lines.length)return null;
 for(let i=0;i<=generatedLine;i++){
  let generated=0,best=null;
  for(const segment of lines[i].split(",").filter(Boolean)){
   const fields=decodeVlq(segment);generated+=fields[0];
   if(fields.length>=4){previousSource+=fields[1];previousLine+=fields[2];previousColumn+=fields[3];if(fields.length>4)previousName+=fields[4];}
   if(i===generatedLine&&generated<=generatedColumn&&fields.length>=4){best={source:map.sources[previousSource],line:previousLine+1,column:previousColumn,name:fields.length>4?map.names?.[previousName]||null:null};}
  }
  if(i===generatedLine)return best;
 }
 return null;
}
function listMaps(root){
 const out=[];const walk=(dir)=>{if(!fs.existsSync(dir))return;for(const item of fs.readdirSync(dir,{withFileTypes:true})){const name=path.join(dir,item.name);if(item.isDirectory())walk(name);else if(item.name.endsWith(".js.map"))out.push(name);}};walk(root);return out;
}
export function mapProfile(profile,mapIndex){
 const nodeById=new Map(profile.nodes.map(n=>[n.id,n]));
 const parents=new Map();for(const n of profile.nodes)for(const child of n.children||[])parents.set(child,n.id);
 const self=new Map(),selfUs=new Map(),total=new Map(),totalUs=new Map();
 const deltas=profile.timeDeltas||[],samples=profile.samples||[];
 for(let i=0;i<samples.length;i++){const id=samples[i],micro=deltas[i]??0;self.set(id,(self.get(id)||0)+1);selfUs.set(id,(selfUs.get(id)||0)+micro);const seen=new Set();let cursor=id;while(cursor&&!seen.has(cursor)){seen.add(cursor);total.set(cursor,(total.get(cursor)||0)+1);totalUs.set(cursor,(totalUs.get(cursor)||0)+micro);cursor=parents.get(cursor);}}
 const mappedFrames=[],grouped=new Map(),sourceCache=new Map();
 for(const node of profile.nodes){
  const frame=node.callFrame||{},script=String(frame.url||""),base=path.basename(script);
  const matches=mapIndex.get(base)||[],mapEntry=matches.length===1?matches[0]:null;
  const pos=mapEntry?originalPosition(mapEntry.map,frame.lineNumber,frame.columnNumber):null;
  let source=null,sourceName=null,originalLine=null,originalColumn=null,verifiedFunction=null;
  if(pos&&typeof pos.source==="string"){
   const sourceRoot=mapEntry.map.sourceRoot||"";
   const raw=pos.source.startsWith("/")?pos.source:path.resolve(path.dirname(mapEntry.path),sourceRoot,pos.source);
   source=path.relative(process.cwd(),raw).replaceAll("\\","/");
   if(source.startsWith("..")||source.startsWith("/")||source.includes("node_modules/"))source="external/"+path.basename(pos.source);
   sourceName=pos.name;originalLine=pos.line;originalColumn=pos.column;
   if(!source.startsWith("external/")&&fs.existsSync(raw)){
    let lines=sourceCache.get(raw);if(!lines){lines=fs.readFileSync(raw,"utf8").split(/\r?\n/);sourceCache.set(raw,lines);}
    const declaration=lines[originalLine-1]||"";
    const match=declaration.match(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\b/)||declaration.match(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/);
    if(match)verifiedFunction=match[1];
   }
  }
  const key=JSON.stringify([script,frame.lineNumber,frame.columnNumber,source,originalLine,originalColumn]);
  const entry={node_id:node.id,script_url:script,script_id:frame.scriptId||"",generated_line:frame.lineNumber,generated_column:frame.columnNumber,generated_name:frame.functionName||"",source,original_line:originalLine,original_column:originalColumn,original_map_name:sourceName,verified_declaration:verifiedFunction,self_samples:self.get(node.id)||0,total_samples:total.get(node.id)||0,self_sampled_ms:(selfUs.get(node.id)||0)/1000,total_sampled_ms:(totalUs.get(node.id)||0)/1000};
  mappedFrames.push(entry);
  if(!grouped.has(key))grouped.set(key,{...entry,node_ids:[],self_samples:0,total_samples:0,self_sampled_ms:0,total_sampled_ms:0});
  const g=grouped.get(key);g.node_ids.push(node.id);g.self_samples+=entry.self_samples;g.self_sampled_ms+=entry.self_sampled_ms;
 }
 // Deduplicate samples across distinct recursive nodes at the same source location.
 const keyById=new Map(mappedFrames.map(x=>[x.node_id,JSON.stringify([x.script_url,x.generated_line,x.generated_column,x.source,x.original_line,x.original_column])]));
 for(let i=0;i<samples.length;i++){const seenGroups=new Set(),micro=deltas[i]??0;let cursor=samples[i],seenNodes=new Set();while(cursor&&!seenNodes.has(cursor)){seenNodes.add(cursor);const key=keyById.get(cursor);if(key)seenGroups.add(key);cursor=parents.get(cursor);}for(const key of seenGroups){const g=grouped.get(key);g.total_samples++;g.total_sampled_ms+=micro/1000;}}
 const groups=[...grouped.values()].sort((a,b)=>b.self_sampled_ms-a.self_sampled_ms);
 return {sample_count:samples.length,frames:mappedFrames,hotspots:groups.slice(0,50),unmapped_self_samples:groups.filter(g=>!g.source).reduce((sum,g)=>sum+g.self_samples,0)};
}
export function sourceMapIndex(root="dist/server"){
 const files=listMaps(root),mapIndex=new Map(),inventory=[];
 for(const file of files){const parsed=JSON.parse(fs.readFileSync(file,"utf8"));const base=path.basename(file).replace(/\.map$/,"");if(!mapIndex.has(base))mapIndex.set(base,[]);mapIndex.get(base).push({path:file,map:parsed});inventory.push({script:base,sources:parsed.sources?.length||0});}
 return {mapIndex,inventory};
}

async function capture(client,label,iteration){
 const url="http://"+HOST+":"+PORT+(label==="phase1"?"/review":"/ranking");
 await fetch("http://"+HOST+":"+FIXTURE_PORT+"/__fixture__/reset");
 await client.send("Profiler.start");
 let res,raw;
 const start=performance.now();
 try{res=await fetch(url,{headers:{"cache-control":"no-cache","accept":"text/html"},signal:AbortSignal.timeout(20000)});raw=await res.arrayBuffer();}
 finally{var wall=performance.now()-start;}
 const p=(await client.send("Profiler.stop")).profile;
 const detail=analyze(p),mapped=mapProfile(p,sourceMapIndex().mapIndex);
 const accounting=await (await fetch("http://"+HOST+":"+FIXTURE_PORT+"/__fixture__/accounting")).json();
 const html=new TextDecoder().decode(raw),watchCards=(html.match(/<span class="tag tag--signal">出品中<\/span>/g)||[]).length;
 const truth={sold_ranked_zero:/現在、成約価格として確認できるデータがありません/.test(html),active_distinct_from_sold:/出品中の価格は順位に使いません/.test(html),watch_cards_html:watchCards,watch_max_30:watchCards<=30,fabricated_rank:/(?:class="rank-medal|class="card rank-row")/.test(html)};
 const data={phase:label,iteration,http_status:res.status,html_bytes:raw.byteLength,bytes:raw.byteLength,wall_ms:wall,source_map_inventory:sourceMapIndex().inventory,...detail,source_attribution:{sample_count:mapped.sample_count,unmapped_self_samples:mapped.unmapped_self_samples,hotspots:mapped.hotspots},fixture_accounting:accounting,ui_truth:truth};
 const filename=path.join(OUT,label+"-"+iteration);
 fs.writeFileSync(filename+".cpuprofile",JSON.stringify(p));
 fs.writeFileSync(filename+".mapped-callframes.json",JSON.stringify({sample_count:mapped.sample_count,frames:mapped.frames,hotspots:mapped.hotspots},null,2));
 fs.writeFileSync(filename+".json",JSON.stringify(data,null,2));
 assert.equal(res.status,200,"LOCAL_REQUEST_HTTP_"+res.status);
 assert.equal(accounting.unsupported.requests,0,"UNSUPPORTED_FIXTURE_QUERIES");
 if(label!=="phase1"){
  assert.match(html,/成約価格ランキング/,"actual ranking page missing");
  assert.match(html,/出品価格ウォッチ/,"actual ranking listing watch missing");
  assertRankingFidelity(accounting,{enforce:label==="cold"});
  assert.ok(truth.sold_ranked_zero,"SOLD_EMPTY_STATE_NOT_RENDERED");
  assert.ok(truth.active_distinct_from_sold,"ASKING_AND_SOLD_NOT_SEPARATED");
  assert.equal(truth.watch_cards_html,30,"WATCH_30_CARDS_NOT_RENDERED");
  assert.equal(truth.fabricated_rank,false,"FABRICATED_COMPLETED_SALE_RANK");
  assert.ok(mapped.hotspots.some(g=>g.source&&g.self_samples>=10),"SOURCE_MAP_HOTSPOT_UNMAPPED");
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
 const report={status:"PASS",fixture:SHAPE,runs:3,cache_cold_definition:"new local workerd process and isolated --persist-to path; build-time caches still possible",cold_median_sampled_cpu_ms:median(cold.map(x=>x.sampled_cpu_ms)),
  repeat_median_sampled_cpu_ms:median(repeat.map(x=>x.sampled_cpu_ms)),
  cold_median_bytes:median(cold.map(x=>x.bytes)),repeat_median_bytes:median(repeat.map(x=>x.bytes)),
  cold_median_samples:median(cold.map(x=>x.sample_count)),repeat_median_samples:median(repeat.map(x=>x.sample_count)),
  cold,repeat,warning:"Not evidence of passing Cloudflare Free 10ms budget"};
 fs.writeFileSync(path.join(OUT,"profile-summary.json"),JSON.stringify(report,null,2));
 console.log(JSON.stringify({cold_median_sampled_cpu_ms:report.cold_median_sampled_cpu_ms,repeat_median_sampled_cpu_ms:report.repeat_median_sampled_cpu_ms}));
}
const action=process.argv[2];
if(action==="serve")serveFixture();
else if(action==="profile")await run();
else if(action==="summarize")summarize();
else if(action&&!process.env.NODE_TEST_CONTEXT)throw Error("Unknown action");
