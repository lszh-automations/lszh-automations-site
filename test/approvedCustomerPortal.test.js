'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const TOKEN='Z'.repeat(48);
const digest=createHash('sha256').update(TOKEN).digest('hex');
const lookup=v=>({linkedRecordIds:['rec12345678901234'],
 valuesByLinkedRecordId:{rec12345678901234:[v]}});
const approved=()=>({
 id:'recABCDEFGH123456',
 cellValuesByFieldId:{
  fldNluaFeT1mWGMJY:'LSZH-2026-0001',
  fld2XdyW6ZE4XlSz3:{name:'Versendet'},
  fldkvLOuDmQoSCjuI:'v1.0',
  fldOZcNcm2PQwP7Rt:{name:'Nein'},
  fldl0MMMOh95Y7N1q:'2026-11-01',
  flduZx5dzgpMfyXDu:lookup('pilot@fictional.example'),
  fldZDij0YpvnqFgPO:lookup('Fiktive Pilot GmbH'),
  fldBWHnMXuL46y5L9:digest,
  fldjQ5EmGioSEA2dw:'1ABCDEFGHIJKLMNOPQRSTUVWX123456',
  fldcUBIpCMmKbmq0Q:'b'.repeat(64),
  fldGolGjsXMtaHdfY:'1BCDEFGHIJKLMNOPQRSTUVWXYZ123456',
  fldLSUNx2D7uwEjCY:'c'.repeat(64),
  fldkiRZao205kv63x:true,
  fldOe2lL8inXnOWwi:true,
  fldM2gGMhQKonLACU:true,
  fld0lzVTwul6ibTle:true
 }
});
async function make(){
 const [{mapApprovedCustomerOffer},{createOfferPortal}]=await Promise.all([
  import('../cloud-run/offer-portal-production/approvedCustomerOffer.mjs'),
  import('../cloud-run/offer-portal-staging/portalCore.mjs')
 ]);
 let doc=mapApprovedCustomerOffer(approved(),{
  now:new Date('2026-10-19T12:00:00Z'),termsVersion:'v1.0'
 });
 let commits=0;
 const store={
  get:async hash=>hash===digest?structuredClone(doc):null,
  claim:async(hash,fingerprint,evidence,now)=>{
   if(hash!==digest||doc.status!=='sent')return 'offer_changed';
   doc={...doc,status:'accepted',acceptedAt:now.toISOString(),evidence};
   commits++;
   return 'accepted';
  }
 };
 const portal=createOfferPortal({
  store,verifyBundle:async()=>true,productionOnly:true,
  approvedVersion:'v1.0',proofSalt:'not-a-real-credential-for-tests-only',
  clock:()=>new Date('2026-10-19T12:00:00Z')
 });
 return {portal,mutate:fn=>{doc=fn(doc)},get:()=>({doc,commits})};
}
test('production-only portal can preview an explicitly released mapped customer offer',async()=>{
 const {portal}=await make();
 const result=await portal.preview(TOKEN);
 assert.equal(result.test_only,false);
 assert.equal(result.number,'LSZH-2026-0001');
 assert.equal(result.avv_required,false);
 assert.ok(!JSON.stringify(result).includes('pilot@fictional.example'));
});
test('production-only rejects changed release metadata before any document reads',async()=>{
 const {portal,mutate}=await make();
 mutate(d=>({...d,source:{...d.source,liveApproved:false}}));
 await assert.rejects(()=>portal.preview(TOKEN),e=>e.code==='unavailable');
});
test('production-only acceptance requires recipient match and retains customer evidence',async()=>{
 const {portal,get}=await make();
 const b={name:'Pilot Testperson',email:'pilot@fictional.example',
  authorized:true,accept_quote:true,accept_terms:true,accept_avv:false,
  quote_sha256:'b'.repeat(64),terms_sha256:'c'.repeat(64)};
 await assert.rejects(()=>portal.accept(TOKEN,{...b,email:'attacker@fictional.example'}),e=>e.code==='invalid_identity');
 assert.equal(get().commits,0);
 const accepted=await portal.accept(TOKEN,b,{ip:'192.0.2.10'});
 assert.equal(accepted.accepted,true);
 assert.equal(accepted.test_only,false);
 assert.equal(accepted.confirmation_email_pending,false,'no production writeback or mail transport is wired yet');
 assert.equal(get().commits,1);
 assert.equal(get().doc.evidence.method,'lszh_b2b_customer_v1');
});
test('production mode and synthetic-only mode cannot both be enabled',async()=>{
 const {createOfferPortal}=await import('../cloud-run/offer-portal-staging/portalCore.mjs');
 assert.throws(()=>createOfferPortal({
  store:{get(){},claim(){}},verifyBundle:async()=>true,
  proofSalt:'test-only-long-secret',approvedVersion:'v1.0',
  productionOnly:true,syntheticOnly:true
 }),/portal_not_configured/);
});
