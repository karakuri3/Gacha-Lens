import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFixture,PINNED_NOW} from '../experiments/a9r-c0/synthetic-fixture.mjs';
import {classifyMarketEvidence,buildActiveListingWatchEvidence} from '../lib/domain/market-evidence.js';
import {jstCalendarDate,effectiveReleaseState} from '../lib/domain/release-state.js';
const now=Date.parse(PINNED_NOW),day=86400000;
const {variants,marketListings}=makeFixture();
const subject=variants[0];
function single(status,age,id){return {...marketListings[0],id,source_url:'https://example.invalid/'+id,status,last_observed_at:new Date(now-age).toISOString(),sold_at:status==='sold'?new Date(now-age).toISOString():null};}
const evidence=ls=>classifyMarketEvidence({subject,listings:ls,scope:'variant',now:new Date(now)});
test('existing app classifier sees 0 sold and 66 active, zero price-ranked',()=>{
 const reports=variants.map(v=>classifyMarketEvidence({subject:v,listings:marketListings.filter(x=>x.matched_variant_id===v.id),scope:'variant',now:new Date(now)}));
 assert.equal(reports.filter(x=>x.eligibleForPriceRanking).length,0);
 assert.equal(reports.reduce((n,x)=>n+x.completedCount,0),0);
 assert.equal(reports.reduce((n,x)=>n+x.activeCount,0),66);
});
test('existing active watch evidence yields 66 eligible variants and bounded top 30',()=>{
 const watch=variants.map(v=>buildActiveListingWatchEvidence({subject:v,listings:marketListings.filter(x=>x.matched_variant_id===v.id),now:new Date(now)})).filter(x=>x.listingCount>0);
 assert.equal(watch.length,66);assert.equal(watch.slice(0,30).length,30);
});
test('existing sold90d cutoff ±1ms and 3-sale eligibility',()=>{
 assert.equal(evidence([single('sold',90*day-1,'a')]).completedCount,1);
 assert.equal(evidence([single('sold',90*day,'a')]).completedCount,1);
 assert.equal(evidence([single('sold',90*day+1,'a')]).completedCount,0);
 const r=evidence([single('sold',1000,'a'),single('sold',2000,'b'),single('sold',3000,'c')]);
 assert.equal(r.completedCount,3);assert.equal(r.eligibleForPriceRanking,true);
});
test('existing active30d cutoff ±1ms; sold and active prices separated',()=>{
 assert.equal(evidence([single('active',30*day-1,'a')]).activeCount,1);
 assert.equal(evidence([single('active',30*day,'a')]).activeCount,1);
 assert.equal(evidence([single('active',30*day+1,'a')]).activeCount,0);
 const x=evidence([single('active',1000,'a'),single('sold',2000,'b')]);
 assert.equal(x.activeCount,1);assert.equal(x.completedCount,1);assert.equal(x.eligibleForPriceRanking,false);
});
test('real JST release-state changes at 15:00 UTC / 00:00 JST',()=>{
 const before=new Date('2026-10-11T14:59:59.999Z'),after=new Date('2026-10-11T15:00:00.000Z');
 assert.equal(jstCalendarDate(before),'2026-10-11');assert.equal(jstCalendarDate(after),'2026-10-12');
 assert.equal(effectiveReleaseState({released:false,release_date:'2026-10-12'},{now:before}),false);
 assert.equal(effectiveReleaseState({released:false,release_date:'2026-10-12'},{now:after}),true);
});
