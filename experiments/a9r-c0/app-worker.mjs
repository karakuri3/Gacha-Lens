// Local workerd App simulation ONLY. No Vinext import, no Production runtime patch.
import {decide,sha256Hex} from './gate-core.mjs';
const SH=/^[a-f0-9]{40}$/;
const err=(status,reason,sha)=>Response.json({error:reason},{status,headers:{'cache-control':'no-store','x-gacha-app-source-sha':SH.test(sha||'')?sha:'invalid'}});
export default {async fetch(request,env){
  const url=new URL(request.url),sha=env.C0_SOURCE_SHA,start=performance.now();
  if(url.pathname==='/api/runtime-diagnostics/release-source')return Response.json({source_sha:sha},{status:SH.test(sha||'')?200:503,headers:{'cache-control':'no-store'}});
  if(url.pathname!=='/ranking')return err(404,'route_not_owned',sha);
  // Match the original App gate ordering: source identity before manifest/redirect.
  const expected=request.headers.get('x-gacha-expected-app-source-sha');
  if(!SH.test(sha||'')||!SH.test(expected||''))return err(503,'identity_missing',sha);
  if(expected!==sha)return err(409,'mixed_source_sha',sha);
  let manifest;
  try{const r=await env.ASSETS.fetch(new Request(new URL('/__c0_private/manifest',request.url)));if(!r.ok)return err(503,'manifest_missing',sha);manifest=await r.json()}catch{return err(503,'manifest_unreadable',sha)}
  const outcome=decide({request,manifest,appSha:sha,trustedRevision:env.C0_TRUSTED_REVISION,nowMs:Date.now()});
  if(outcome.status===308)return new Response(null,{status:308,headers:{location:outcome.location,'cache-control':'no-store','x-gacha-app-source-sha':sha}});
  if(outcome.status!==200)return err(outcome.status,outcome.reason,sha);
  try{
    const r=await env.ASSETS.fetch(new Request(new URL(outcome.asset.path,request.url)));
    if(!r.ok)return err(503,'asset_missing',sha);
    const bytes=await r.arrayBuffer();
    if(bytes.byteLength!==outcome.asset.bytes||(await sha256Hex(bytes))!==outcome.asset.sha256)return err(503,'asset_corrupt',sha);
    return new Response(request.method==='HEAD'?null:bytes,{status:200,headers:{'content-type':outcome.asset.content_type,'cache-control':'no-store, max-age=0','strict-transport-security':'max-age=63072000','x-gacha-app-source-sha':sha,'x-c0-variant':outcome.kind,'server-timing':'c0_app;dur='+(performance.now()-start).toFixed(3)}});
  }catch{return err(503,'asset_unreadable',sha)}
}};
