// C0-A: localhost-only pure gate. Not imported by Production workers.
export const RANKING_PATH='/ranking';
export const EXPECTED_ROUTES=Object.freeze(['/ranking','/ranking/series','/ranking/upcoming','/ranking/upcoming/series']);
const SHA=/^[0-9a-f]{40}$/, HASH=/^[0-9a-f]{64}$/;
export function decide({request,manifest,appSha,trustedRevision,nowMs}) {
  const url=new URL(request.url);
  if (!['GET','HEAD'].includes(request.method)) return {status:405,reason:'method_not_allowed'};
  if (url.pathname!==RANKING_PATH) return {status:404,reason:'not_app_owned_ranking'};
  if (url.search==='?tab=upcoming&scope=series') return {status:308,location:'/ranking/upcoming/series'};
  if (url.searchParams.has('tab') || url.searchParams.has('scope')) return {status:308,location:'/ranking'};
  const expected=request.headers.get('x-gacha-expected-app-source-sha');
  if (!SHA.test(appSha||'') || !SHA.test(expected||'')) return {status:503,reason:'identity_missing'};
  if (expected!==appSha) return {status:409,reason:'mixed_source_sha'};
  if (request.headers.has('cookie')||request.headers.has('authorization')) return {status:503,reason:'personal_request'};
  if (!manifest) return {status:503,reason:'snapshot_missing'};
  if (!SHA.test(manifest.source_sha||'') || manifest.source_sha!==appSha) return {status:409,reason:'snapshot_source_sha_mismatch'};
  if (!trustedRevision || manifest.data_revision!==trustedRevision) return {status:503,reason:'revision_stale'};
  if (manifest.schema!=='gacha.c0.local.v1'||manifest.complete!==true) return {status:503,reason:'snapshot_incomplete'};
  if (!Array.isArray(manifest.expected_routes)||manifest.expected_routes.length!==EXPECTED_ROUTES.length||!EXPECTED_ROUTES.every((x,i)=>x===manifest.expected_routes[i])) return {status:503,reason:'route_contract_incomplete'};
  // Critical: no 200 from an authentic Next sample page tagged as 237/123/241 data.
  if (manifest.provenance?.fixture_binding_proven!==true||manifest.provenance?.actual_page_dataset!==manifest.data_revision) return {status:503,reason:'fixture_provenance_unproven'};
  if (!Number.isFinite(nowMs)||![manifest.generated_at_ms,manifest.fresh_until_ms,manifest.next_jst_midnight_ms,manifest.next_evidence_expiry_ms,manifest.update_sla_deadline_ms].every(Number.isSafeInteger)) return {status:503,reason:'invalid_expiry'};
  if (nowMs<manifest.generated_at_ms||nowMs>=manifest.fresh_until_ms) return {status:503,reason:'snapshot_expired'};
  if (manifest.fresh_until_ms>Math.min(manifest.next_jst_midnight_ms,manifest.next_evidence_expiry_ms,manifest.update_sla_deadline_ms)) return {status:503,reason:'expiry_not_bounded'};
  if (manifest.metrics?.sold_count!==0||manifest.metrics?.ranked_count!==0||manifest.metrics?.watch_count>30||manifest.metrics?.sold_and_active_separated!==true) return {status:503,reason:'ranking_truth_mismatch'};
  const isRsc=request.headers.get('rsc')==='1'||request.headers.has('next-router-state-tree')||request.headers.has('next-router-prefetch')||url.searchParams.has('_rsc');
  if (!isRsc&&url.search!=='') return {status:503,reason:'unsupported_query'};
  const asset=isRsc?manifest.assets?.rsc:manifest.assets?.html;
  if (!asset||!HASH.test(asset.sha256||'')||!Number.isSafeInteger(asset.bytes)||asset.bytes<=0||!/^\/__c0_private\/[a-z0-9-]+$/.test(asset.path||'')) return {status:503,reason:'invalid_asset'};
  if (isRsc) {
    const requestInfo=manifest.rsc_request||{};
    if (request.headers.get('rsc')!=='1'||url.searchParams.size!==1||url.searchParams.get('_rsc')!==requestInfo.query||
      (request.headers.get('next-router-state-tree')||'')!==requestInfo.state||
      (request.headers.get('next-router-prefetch')||'')!==requestInfo.prefetch||
      (request.headers.get('next-router-segment-prefetch')||'')!==requestInfo.segment||
      (request.headers.get('next-url')||'')!==requestInfo.next_url) return {status:503,reason:'unsupported_rsc_router_state'};
    if (asset.content_type!=='text/x-component') return {status:503,reason:'rsc_type_mismatch'};
  } else if (asset.content_type!=='text/html') return {status:503,reason:'html_type_mismatch'};
  return {status:200,kind:isRsc?'rsc':'html',asset};
}
export async function sha256Hex(buffer) {
  const digest=await crypto.subtle.digest('SHA-256',buffer);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
