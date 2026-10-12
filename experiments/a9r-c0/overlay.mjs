// C0-B: overlay only in an independently cloned disposable renderer checkout.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {makeFixture,REVISION} from './synthetic-fixture.mjs';
const root=process.env.C0_RENDER_ROOT, pristine=process.env.GITHUB_WORKSPACE,sha=process.env.C0_SOURCE_SHA;
if(!root||!pristine||!path.isAbsolute(root)||(!root.startsWith('/tmp/')&&!root.startsWith('/home/runner/work/_temp/')))throw Error('disposable_root_required');
if(!/^[a-f0-9]{40}$/.test(sha||''))throw Error('exact_head_required');
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
if(git(root,'rev-parse','HEAD')!==sha||git(pristine,'rev-parse','HEAD')!==sha)throw Error('checkout_sha_mismatch');
if(git(root,'status','--porcelain'))throw Error('copy_not_clean');
const rel='lib/data/mock-gacha-records.js',file=path.join(root,rel);
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const original=fs.readFileSync(file);
const overlay=[
  "import {makeFixture} from '../../experiments/a9r-c0/synthetic-fixture.mjs';",
  "const data=makeFixture();",
  "export const mockSeries=data.series;",
  "export const mockVariants=data.variants;",
  "export const mockMarketListings=data.marketListings.map(x=>({...x,normalized_entity:'market_listing',market_review_type:'single',listing_type:'single',review_required:false}));",
  "export const mockXReactions=[];",
  "export const mockRestockEvents=[];",
  "export const mockStockReports=[];",
  ""
].join('\n');
fs.writeFileSync(file,overlay);
if(git(root,'status','--porcelain')!=='M '+rel)throw Error('disposable_mutation_not_isolated');
const records=makeFixture();
const counts={series:records.series.length,variants:records.variants.length,listings:records.marketListings.length,active:records.marketListings.filter(x=>x.status==='active').length,sold:records.marketListings.filter(x=>x.status==='sold').length};
if(JSON.stringify(counts)!==JSON.stringify({series:123,variants:237,listings:241,active:66,sold:0}))throw Error('fixture_count_mismatch');
const report={schema:'gacha.c0.overlay.v1',original_git_commit:sha,overlay_is_modified_worktree:true,modified_path:rel,original_blob_sha256:digest(original),overlay_blob_sha256:digest(Buffer.from(overlay)),fixture_sha256:digest(JSON.stringify(records)),data_revision:REVISION,counts,original_tree_identity_not_claimed_for_overlay:true};
const evidence=path.join(pristine,'experiments/a9r-c0/artifacts');fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'overlay-provenance.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));