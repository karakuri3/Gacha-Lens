// C0 fixture: NOT scraped, no Production DB/provider access.
export const PINNED_NOW='2026-10-12T03:00:00.000Z';
export const REVISION='c0-synthetic-237-123-241-v1';
export function makeFixture(now=Date.parse(PINNED_NOW)){
  const series=Array.from({length:123},(_,i)=>({id:'c0-series-'+i,slug:'c0-series-'+i,name:'C0 シリーズ '+i,source_type:'official_site',is_released:true,release_date:'2026-08-01'}));
  const variants=Array.from({length:237},(_,i)=>({id:'c0-variant-'+i,slug:'c0-variant-'+i,series_id:'c0-series-'+(i%123),name:'C0 synthetic '+i,source_type:'official_site',released:true,variant_type:'normal',review_required:false}));
  const marketListings=Array.from({length:241},(_,i)=>({id:'c0-listing-'+i,series_id:'c0-series-'+(i%123),variant_id:'c0-variant-'+(i%237),matched_variant_id:'c0-variant-'+(i%237),listing_type:'single',market_review_type:'single',status:i<66?'active':'ended',price:100+i,source:'c0-test',source_url:'https://example.invalid/listing/'+i,review_required:false,last_observed_at:new Date(now-86400000).toISOString(),listed_at:new Date(now-86400000).toISOString(),sold_at:null}));
  return {series,variants,marketListings,xReactions:[],stockReports:[],restockEvents:[],importIssues:[]};
}
