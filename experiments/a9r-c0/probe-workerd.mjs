// Local 127.0.0.1 only; no remote worker/deploy. This is evidence collection.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
const out=path.resolve('experiments/a9r-c0/artifacts'),root=process.cwd(),sha=process.env.C0_SOURCE_SHA;
const report={schema:'gacha.c0.workerd.v1',status:'NOT_PROVEN',startup_ms:null,self_sampled_cpu_ms:null,billable_cpu_ms:null,requests:[]};
if(!/^[a-f0-9]{40}$/.test(sha||''))throw Error('source_sha_required');
if(!fs.existsSync(out+'/__c0_private/manifest')){
  report.error='authentic_flight_or_html_missing';fs.writeFileSync(out+'/workerd-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));process.exit(0);
}
const tool=path.resolve('.github/vinext-toolchain/node_modules/.bin/wrangler');
if(!fs.existsSync(tool)){report.error='locked_wrangler_missing';fs.writeFileSync(out+'/workerd-report.json',JSON.stringify(report,null,2));process.exit(0)}
const vars={C0_SOURCE_SHA:sha,C0_TRUSTED_REVISION:'c0-synthetic-237-123-241-v1'};
const a={name:'gacha-c0-app',main:path.resolve('experiments/a9r-c0/app-worker.mjs'),compatibility_date:'2026-09-18',workers_dev:false,vars,assets:{directory:out,binding:'ASSETS',run_worker_first:true}};
const p={name:'gacha-c0-public',main:path.resolve('experiments/a9r-c0/public-worker.mjs'),compatibility_date:'2026-09-18',workers_dev:false,vars,services:[{binding:'APP',service:'gacha-c0-app'}]};
const ac=out+'/app.local.json',pc=out+'/public.local.json';
fs.writeFileSync(ac,JSON.stringify(a));fs.writeFileSync(pc,JSON.stringify(p));
const began=performance.now();
const child=spawn(tool,['dev','--config',pc,'--config',ac,'--ip','127.0.0.1','--port','8787'],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',b=>log=(log+b.toString()).slice(-2000));child.stderr.on('data',b=>log=(log+b.toString()).slice(-2000));
try {
  let ready=false;
  for(let i=0;i<50;i++){
    if(child.exitCode!==null)break;
    await pause(500);
    try{const r=await fetch('http://127.0.0.1:8787/api/runtime-diagnostics/release-source',{signal:AbortSignal.timeout(1000)});if(r.status===200){ready=true;break}}catch{}
  }
  if(!ready)report.error='local_workerd_start_failed';
  else {
    report.startup_ms=performance.now()-began;
    const manifest=JSON.parse(fs.readFileSync(out+'/__c0_private/manifest','utf8'));
    const tasks=[
      ['cold_html','/ranking',{'accept':'text/html'}],
      ['repeat_html','/ranking',{'accept':'text/html'}],
      ['nocache_html','/ranking',{'accept':'text/html','cache-control':'no-cache'}],
      ['rsc','/ranking?_rsc=c0a',{rsc:'1','next-router-state-tree':manifest.rsc_request.state,accept:'text/x-component'}],
      ['rsc_wrong_state','/ranking?_rsc=c0a',{rsc:'1','next-router-state-tree':'wrong',accept:'text/x-component'}],
      ['legacy_308','/ranking?tab=upcoming&scope=series',{'accept':'text/html'}],
      ['bypass_attempt','/__c0_private/html',{}],
    ];
    for(const [label,url,headers] of tasks)for(let repeat=1;repeat<=3;repeat++){
      const start=performance.now();
      try{
        const response=await fetch('http://127.0.0.1:8787'+url,{headers,redirect:'manual',signal:AbortSignal.timeout(15000)});
        const body=Buffer.from(await response.arrayBuffer());let reason=null;
        if(response.status>=400){try{reason=JSON.parse(body.toString()).error}catch{reason='non_json_error'}}
        report.requests.push({label,repeat,http_status:response.status,bytes:body.length,content_type:(response.headers.get('content-type')||'').split(';')[0],location:response.headers.get('location'),wall_ms:Number((performance.now()-start).toFixed(3)),server_timing:response.headers.get('server-timing'),failure_class:reason});
      }catch{report.requests.push({label,repeat,error:'localhost_fetch_failed'})}
    }
    // Fixture provenance is known to be unproven; 503 is required, never 200.
    const docs=report.requests.filter(x=>['cold_html','repeat_html','nocache_html','rsc'].includes(x.label));
    report.fail_closed=docs.length===12&&docs.every(x=>x.http_status===503&&x.failure_class==='fixture_provenance_unproven');
    report.asset_bypass_blocked=report.requests.filter(x=>x.label==='bypass_attempt').every(x=>x.http_status===404);
    report.status=report.fail_closed&&report.asset_bypass_blocked?'SIMULATED_GUARD_PASS_NOT_PROVEN':'FAIL';
  }
} finally {
  child.kill('SIGTERM');await pause(250);
  report.log_class=log.includes('Error')?'local_workerd_warning_or_error':'local_workerd_log_available';
  fs.writeFileSync(out+'/workerd-report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}
