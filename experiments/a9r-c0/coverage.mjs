// C0-B: classify every unchanged A9R assertion; no Production postflight executed.
import fs from 'node:fs';
import {ASSERTIONS} from '../../scripts/a9r-postflight-evidence.mjs';
const base='experiments/a9r-c0/artifacts';
if(ASSERTIONS.length!==52)throw Error('a9r_52_definition_changed');
const read=name=>{try{return JSON.parse(fs.readFileSync(base+'/'+name,'utf8'))}catch{return null}};
const work=read('workerd-report.json'),capture=read('capture-report.json'),browser=read('browser-report.json');
const actual=work?.status==='PASS'&&capture?.authentic===true&&!browser?.error;
const simulated=new Set(['release_source','app_delegation','ranking_legacy_redirect']);
const proven=new Set(actual?['ranking','ranking_legacy_redirect']:[]);
const rows=ASSERTIONS.map((a,index)=>({
 index:index+1,id:a.id,expected_status:a.status,route:typeof a.route==='string'?a.route:'dynamic',
 classification:proven.has(a.id)?'LOCAL PASS':simulated.has(a.id)?'SIMULATED':'NOT_RUN',
 basis:proven.has(a.id)?'real localhost workerd plus immutable captured Next fixture':
 simulated.has(a.id)?'isolated C0 semantics only; not full Production parity':'not exercised as an exact A9R route'
}));
const names=['LOCAL PASS','SIMULATED','NOT_RUN','FAIL'];
const counts=Object.fromEntries(names.map(n=>[n,rows.filter(x=>x.classification===n).length]));
if(rows.length!==52||names.reduce((n,k)=>n+counts[k],0)!==52)throw Error('coverage_count_mismatch');
fs.mkdirSync(base,{recursive:true});
fs.writeFileSync(base+'/a9r-coverage.json',JSON.stringify({schema:'gacha.c0.a9r-coverage.v2',total:52,counts,rows,full_52_claim:false,production_a9r_executed:false},null,2)+'\n');
console.log(JSON.stringify({total:52,counts,full_52_claim:false}));