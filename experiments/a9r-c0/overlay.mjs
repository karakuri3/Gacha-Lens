// C0-C: only mutate files in an independent temporary checkout, never main or PR app/lib.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {makeFixture,REVISION} from './synthetic-fixture.mjs';
const root=process.env.C0_RENDER_ROOT, pristine=process.env.GITHUB_WORKSPACE,head=process.env.C0_SOURCE_SHA;
if(!root||!pristine||!path.isAbsolute(root)||(!root.startsWith('/tmp/')&&!root.startsWith('/home/runner/work/_temp/'))) throw Error('disposable_root_required');
if(!/^[0-9a-f]{40}$/.test(head||'')) throw Error('exact_commit_required');
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
if(git(root,'rev-parse','HEAD')!==head||git(pristine,'rev-parse','HEAD')!==head)throw Error('checkout_source_identity_drift');
if(git(root,'status','--porcelain'))throw Error('disposable_worktree_not_clean');
const originalSeries=fs.readFileSync(path.join(root,'lib/series.js'),'utf8');
const originalPolicy=fs.readFileSync(path.join(root,'lib/data/official-data-source.js'),'utf8');
if(!originalSeries.includes('return hasOfficialInput() ? createOfficialFirstRecords() : getMockRecords()')||
   !originalPolicy.includes('return officialSchedule.length > 0 || officialProducts.length > 0'))throw Error('sample_route_contract_changed');
const fixture=makeFixture();
const counts={variants:fixture.variants.length,series:fixture.series.length,listings:fixture.marketListings.length,active:fixture.marketListings.filter(x=>x.status==='active').length,sold:fixture.marketListings.filter(x=>x.status==='sold').length};
if(JSON.stringify(counts)!==JSON.stringify({variants:237,series:123,listings:241,active:66,sold:0}))throw Error('fixture_exact_counts_mismatch');
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
const mock=[
"import {makeFixture} from '../../experiments/a9r-c0/synthetic-fixture.mjs';",
"const data=makeFixture();",
"export const mockSeries=data.series;",
"export const mockVariants=data.variants;",
"export const mockMarketListings=data.marketListings.map(x=>({...x,normalized_entity:'market_listing',market_review_type:'single',listing_type:'single',review_required:false}));",
"export const mockXReactions=[];",
"export const mockRestockEvents=[];",
"export const mockStockReports=[];",
""].join('\n');
const official="export const officialSchedule=[];\nexport const officialProducts=[];\n";
const replacements=[
  ['lib/data/mock-gacha-records.js',mock],
  ['lib/data/official-input.js',official]
];
const files={};
for(const [rel,body] of replacements){
  const file=path.join(root,rel);
  const original=fs.readFileSync(file);
  if(rel.endsWith('official-input.js')&&!original.toString('utf8').includes('export const officialProducts = ['))throw Error('original_official_file_changed');
  fs.writeFileSync(file,body);
  files[rel]={original_sha256:sha256(original),overlay_sha256:sha256(Buffer.from(body)),overlay_bytes:Buffer.byteLength(body)};
}
const modified=git(root,'status','--porcelain').split('\n').filter(Boolean).map(l=>l.slice(3)).sort();
if(JSON.stringify(modified)!==JSON.stringify(replacements.map(x=>x[0]).sort()))throw Error('unapproved_worktree_mutations');
const officialIsEmpty=official.includes('officialProducts=[]')&&official.includes('officialSchedule=[]');
if(!officialIsEmpty)throw Error('official_precedence_not_disabled');
const report={
 schema:'gacha.c0.overlay.v2',
 immutable_git_commit:head,
 overlay_is_modified_worktree:true,
 modified_paths:modified,
 files,
 fixture_sha256:sha256(JSON.stringify(fixture)),
 data_revision:REVISION,
 counts,
 source_path_contract:{data_source:'sample',official_has_input:false,
 selected:'lib/series.js:getSampleRecords()->getMockRecords()',route_verified_by_source:true,actual_renderer_verified:false},
 original_tree_identity_not_claimed_for_overlay:true
};
const dir=path.join(pristine,'experiments/a9r-c0/artifacts');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'overlay-provenance.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));