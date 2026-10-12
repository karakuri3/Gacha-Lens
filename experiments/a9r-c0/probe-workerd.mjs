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
    const legit=manifest.rsc_requests||[];
    const tasks=[
      ['cold_html','/ranking',{accept:'text/html'}],
      ['repeat_html','/ranking',{accept:'text/html'}],
      ['nocache_html','/ranking',{accept:'text/html','cache-control':'no-cache'}],
      ...legit.map((x,i)=>['rsc_'+i,x.request_url,{...x.headers,accept:'text/x-component'}]),
      ...(legit.length?[['rsc_wrong_state',legit[0].request_url,{...legit[0].headers,'next-router-state-tree':'unrecognized-router-state'}]]:[]),
      ['legacy_308','/ranking?tab=upcoming&scope=series',{accept:'text/html'}],
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
    const positives=report.requests.filter(x=>['cold_html','repeat_html','nocache_html'].includes(x.label)||x.label.startsWith('rsc_')&&x.label!=='rsc_wrong_state');
    const negatives=report.requests.filter(x=>['rsc_wrong_state','legacy_308','bypass_attempt'].includes(x.label));
    const good=positives.length===(3+legit.length)*3&&positives.every(x=>x.http_status===200&&x.bytes>0&&
       (x.label.startsWith('rsc_')?x.content_type==='text/x-component':x.content_type==='text/html'));
    const bad=negatives.length===9&&negatives.every(x=>x.label==='rsc_wrong_state'?x.http_status===503:
      x.label==='legacy_308'?x.http_status===308&&x.location?.endsWith('/ranking/upcoming/series'):x.http_status===404);
    report.status=good&&bad?'PASS':'FAIL';
    report.startup_import_self_sampled_cpu_ms=null;
    report.public_self_sampled_cpu_ms=null;
    report.app_self_sampled_cpu_ms=null;
    report.idle_cpu_ms=null;
    report.cpu_attribution='server-timing and wall are durations, not sampled/billable CPU';

  }
} finally {
  child.kill('SIGTERM');await pause(250);
  report.log_class=log.includes('Error')?'local_workerd_warning_or_error':'local_workerd_log_available';
  fs.writeFileSync(out+'/workerd-report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}

if(report.status!=='PASS')process.exitCode=2;
