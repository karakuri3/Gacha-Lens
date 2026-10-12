// C0-C: bounded localhost readiness observer. Stores allowlisted diagnostics, never raw logs.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {setTimeout as wait} from 'node:timers/promises';

const root=process.env.C0_RENDER_ROOT, pristine=process.env.GITHUB_WORKSPACE,sha=process.env.C0_SOURCE_SHA;
const out=path.join(pristine||'/tmp','experiments/a9r-c0/artifacts');
fs.mkdirSync(out,{recursive:true});
const report={schema:'gacha.c0.readiness.v1',classification:'NOT_PROVEN',source_git_commit:sha,
  overlay_modified_worktree:true,now_iso:new Date().toISOString(),source_identity:null,
  child:{spawned:false,pid_present:false,state:'not_started',exit_code:null,signal:null},
  next:{project_root:'disposable_checkout',node_modules_physical_inside_worktree:null,phase:'not_started',error_categories:[]},
  attempts:[],first_fatal:null,first_success:null,html_body_saved:false,raw_logs_saved:false};
let child=null,logFd=null;
const save=()=>{report.finished_at_utc=new Date().toISOString();fs.writeFileSync(path.join(out,'readiness-report.json'),JSON.stringify(report,null,2)+'\n')};
const categorise=(text)=>{
  const allow=[
    [/EADDRINUSE/i,'PORT_IN_USE'],[/module not found|can't resolve|ERR_MODULE_NOT_FOUND/i,'MODULE_RESOLUTION'],
    [/turbopack.*(?:fail|error)|TurbopackInternalError/i,'TURBOPACK_ERROR'],
    [/syntaxerror|unexpected token/i,'SYNTAX_ERROR'],[/typeerror/i,'TYPE_ERROR'],
    [/referenceerror/i,'REFERENCE_ERROR'],[/Failed to compile/i,'COMPILE_ERROR'],
    [/Error:|error -|ERROR/i,'OTHER_ERROR']
  ];
  for(const line of text.split(/\r?\n/).slice(-120)){
    const category=allow.find(([re])=>re.test(line))?.[1];
    if(!category)continue;
    const p=line.match(/(?:^|[\s("])((?:app|lib|components|experiments|node_modules\/next)\/[A-Za-z0-9_.\/-]+\.(?:js|jsx|mjs|ts|tsx)):(\d+)(?::(\d+))?/);
    const one={category,relative_source:p?.[1]||null,line:p?Number(p[2]):null};
    if(!report.next.error_categories.some(x=>x.category===one.category&&x.relative_source===one.relative_source&&x.line===one.line))
      report.next.error_categories.push(one);
    if(report.next.error_categories.length>=5)break;
  }
};
const readLog=()=>{
 try{
  const f=path.join(process.env.RUNNER_TEMP||'/tmp','c0-next-local.log');
  const fd=fs.openSync(f,'r'),stat=fs.fstatSync(fd),start=Math.max(0,stat.size-32768);
  const b=Buffer.alloc(Math.min(32768,stat.size-start));
  fs.readSync(fd,b,0,b.length,start);fs.closeSync(fd);
  const txt=b.toString('utf8');
  if(/\bReady in\b|✓ Ready\b/.test(txt))report.next.phase='listening';
  if(/\bCompiling\b|Compiling \/ranking/.test(txt))report.next.phase='compile';
  if(/GET \/ranking/.test(txt))report.next.phase='render';
  categorise(txt);
 }catch{}
};
async function tcpProbe(){
 return new Promise(resolve=>{
  const s=net.connect({host:'127.0.0.1',port:3011});let done=false;
  const settle=value=>{if(done)return;done=true;s.destroy();resolve(value)};
  s.once('connect',()=>settle('connected'));
  s.once('error',e=>settle(e.code==='ECONNREFUSED'?'refused':'error'));
  s.setTimeout(700,()=>settle('timeout'));
 });
}
async function curlProbe(){
 return new Promise(resolve=>{
  const at=performance.now(),c=spawn('curl',['--silent','--fail','--output','/dev/null','--write-out','%{http_code}','--max-time','3','http://127.0.0.1:3011/ranking'],{stdio:['ignore','pipe','ignore']});
  let output='',done=false;
  const finish=(code,signal)=>{
    if(done)return;done=true;
    const rc=Number.isInteger(code)?code:-1;
    const status=/^\d{3}$/.test(output)?Number(output):0;
    let family=rc===0?'HTTP_OK':rc===7?'TCP_REFUSED':rc===22?'HTTP_ERROR':rc===28?'TIMEOUT':rc===52?'EMPTY_RESPONSE':rc===56?'RECEIVE_ERROR':'OTHER_CURL_FAILURE';
    // --fail is deliberately not used: curl rc=0 plus HTTP500 is still HTTP_ERROR.
    if(rc===0&&status>=400)family='HTTP_ERROR';
    resolve({curl_rc:rc,http_status:status,reason:family,elapsed_ms:Math.round(performance.now()-at)});
  };
  c.stdout.on('data',b=>output=(output+b.toString()).slice(0,3));
  c.on('error',()=>finish(-1,null));c.on('close',finish);
 });
}
try{
 if(!root||!pristine||!path.isAbsolute(root)||!/^[a-f0-9]{40}$/.test(sha||''))
   throw Error('readiness_source_identity_missing');
 if(process.env.WORKERS_CI_COMMIT_SHA!==sha)throw Error('next_config_sha_not_pinned');
 const nextBin=path.join(root,'node_modules/next/dist/bin/next');
 const resolved=fs.realpathSync(nextBin);
 const resolvedDir=fs.realpathSync(path.join(root,'node_modules/next/package.json'));
 report.next.node_modules_physical_inside_worktree=resolved.startsWith(root+'/')&&resolvedDir.startsWith(root+'/');
 if(!report.next.node_modules_physical_inside_worktree)throw Error('dependency_outside_turbopack_root');
 const nextConfig=(await import(pathToFileURL(path.join(root,'next.config.mjs')).href)).default;
 const configured=nextConfig?.env?.GACHA_RELEASE_SOURCE_SHA||null;
 report.source_identity={immutable_git_head:sha,next_config_sha:configured,next_config_pinned:configured===sha,
   runtime_embedded_sha:'NOT_PROVEN',overlay_unmodified:false};
 if(configured!==sha)throw Error('next_config_source_sha_mismatch');
 const logfile=path.join(process.env.RUNNER_TEMP||'/tmp','c0-next-local.log');
 logFd=fs.openSync(logfile,'w',0o600);
 child=spawn(process.execPath,[nextBin,'dev','--hostname','127.0.0.1','--port','3011'],
    {cwd:root,env:{...process.env,GACHA_DATA_SOURCE:'sample',WORKERS_CI_COMMIT_SHA:sha},
     detached:true,stdio:['ignore',logFd,logFd]});
 report.child.spawned=!!child.pid;report.child.pid_present=!!child.pid;report.child.state='starting';report.next.phase='spawn';
 if(!child.pid)throw Error('next_process_spawn_failed');
 fs.writeFileSync(path.join(process.env.RUNNER_TEMP||'/tmp','c0-next.pid'),String(child.pid));
 let exitCode=null,exitSignal=null,spawnError=false;
 child.on('exit',(code,signal)=>{exitCode=code;exitSignal=signal;report.child.state='exited';report.child.exit_code=code;report.child.signal=signal;});
 child.on('error',()=>{spawnError=true;report.child.state='spawn_error'});
 const maxAttempts=75;
 for(let i=1;i<=maxAttempts;i++){
   const tcp=await tcpProbe();
   const result=await curlProbe();
   const item={attempt:i,tcp,...result};
   report.attempts.push(item);
   readLog();
   if(spawnError||exitCode!==null||exitSignal!==null){
     report.classification='CHILD_EXITED';report.first_fatal={attempt:i,category:'CHILD_EXITED'};
     break;
   }
   if(result.http_status===200&&result.curl_rc===0){
     report.child.state='alive';report.classification='HTTP_200_RENDERER_REACHABLE';
     report.first_success={attempt:i,status:200,elapsed_ms:result.elapsed_ms};
     break;
   }
   if(result.http_status>=400){
     report.classification='HTTP_ERROR';report.first_fatal={attempt:i,category:'HTTP_'+result.http_status,curl_rc:result.curl_rc};
     break;
   }
   if([52,56].includes(result.curl_rc)){
     report.classification='CONNECTION_ABORTED';report.first_fatal={attempt:i,category:result.reason};
     break;
   }
   if(i===maxAttempts){
     report.classification='READINESS_BUDGET_EXHAUSTED';
     report.first_fatal={attempt:i,category:result.reason};
     break;
   }
   await wait(1400);
 }
 readLog();
 if(exitCode!==null||exitSignal!==null){report.child.state='exited';report.child.exit_code=exitCode;report.child.signal=exitSignal}
 if(report.classification!=='HTTP_200_RENDERER_REACHABLE'){
   if(child&&report.child.state!=='exited')child.kill('SIGTERM');
   process.exitCode=2;
 }else child.unref();
} catch(e){
 report.classification='HARNESS_PRECONDITION_FAILURE';
 report.first_fatal={category:['readiness_source_identity_missing','next_config_sha_not_pinned',
 'dependency_outside_turbopack_root','next_config_source_sha_mismatch','next_process_spawn_failed'].includes(e.message)?e.message:'unexpected_harness_failure'};
 if(child)child.kill('SIGTERM');process.exitCode=2;
} finally{
 if(logFd!==null)fs.closeSync(logFd);
 save();
 console.log(JSON.stringify({schema:report.schema,classification:report.classification,source_identity:report.source_identity,
    next:report.next,child:report.child,first_fatal:report.first_fatal,first_success:report.first_success,
    attempts_count:report.attempts.length,attempts_last:report.attempts.slice(-3),raw_logs_saved:false}));
}
