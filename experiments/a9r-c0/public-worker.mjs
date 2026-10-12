// Local workerd Public simulation: no asset-first route, one fixed App service binding.
const SH=/^[a-f0-9]{40}$/;
const error=(status,reason)=>Response.json({error:reason},{status,headers:{'cache-control':'no-store'}});
export default {async fetch(request,env){
  const start=performance.now(),url=new URL(request.url),sha=env.C0_SOURCE_SHA;
  if(url.pathname==='/api/runtime-diagnostics/release-source')return Response.json({plane:'public',source_sha:sha},{status:SH.test(sha||'')?200:503});
  if(url.pathname==='/api/runtime-diagnostics/app-delegation'){
    if(!SH.test(sha||''))return error(503,'public_identity_missing');
    const r=await env.APP.fetch(new Request('https://gacha-lens.internal/api/runtime-diagnostics/release-source'));
    const v=r.ok?await r.json().catch(()=>null):null;
    if(!SH.test(v?.source_sha||''))return error(503,'app_identity_missing');
    if(v.source_sha!==sha)return error(409,'mixed_source_sha');
    return Response.json({ok:true,public_source_sha:sha,app_source_sha:v.source_sha});
  }
  if(url.pathname!=='/ranking')return error(404,'route_not_owned_by_public');
  if(!SH.test(sha||''))return error(503,'public_identity_missing');
  const headers=new Headers(request.headers);headers.set('x-gacha-expected-app-source-sha',sha);
  const res=await env.APP.fetch(new Request('https://gacha-lens.internal'+url.pathname+url.search,{method:request.method,headers}));
  const appSha=res.headers.get('x-gacha-app-source-sha');
  if(!SH.test(appSha||''))return error(503,'app_identity_missing');
  if(appSha!==sha)return error(409,'mixed_source_sha');
  const out=new Headers(res.headers);out.set('x-gacha-public-plane','c0-local');out.set('server-timing',(out.get('server-timing')||'')+', c0_public;dur='+(performance.now()-start).toFixed(3));
  return new Response(res.body,{status:res.status,headers:out});
}};
