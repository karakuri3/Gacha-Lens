import fs from 'node:fs';
import {ASSERTIONS} from '../../scripts/a9r-postflight-evidence.mjs';
if(ASSERTIONS.length!==52)throw Error('frozen_a9r_assertions_not_52');
const simulated=new Set(['release_source','app_delegation','ranking_legacy_redirect']);
const rows=ASSERTIONS.map((a,i)=>({index:i+1,id:a.id,expected_status:a.status,route:typeof a.route==='string'?a.route:'dynamic',classification:simulated.has(a.id)?'SIMULATED':'NOT_RUN',explanation:simulated.has(a.id)?'C0 local behavior only; not full A9R':'outside /ranking same-fixture real local proof'}));
const counts=Object.fromEntries(['LOCAL PASS','SIMULATED','NOT_RUN','FAIL'].map(k=>[k,rows.filter(x=>x.classification===k).length]));
const out='experiments/a9r-c0/artifacts';fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(out+'/a9r-coverage.json',JSON.stringify({schema:'gacha.c0.a9r-coverage.v1',total:52,counts,rows,full_52_claim:false},null,2)+'\n');
console.log(JSON.stringify({total:52,counts}));
