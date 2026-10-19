'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
async function setup(){
  return import('../cloud-run/offer-portal-production/approvedCustomerOffer.mjs');
}
const lk=value=>({linkedRecordIds:['rec12345678901234'],
 valuesByLinkedRecordId:{rec12345678901234:[value]}});
const base=()=>({
  id:'recABCDEFGH123456',
  cellValuesByFieldId:{
   fldNluaFeT1mWGMJY:'LSZH-2026-0001',
   fld2XdyW6ZE4XlSz3:{name:'Versendet'},
   fldkvLOuDmQoSCjuI:'v1.0',
   fldOZcNcm2PQwP7Rt:{name:'Nein'},
   fldl0MMMOh95Y7N1q:'2026-11-01',
   flduZx5dzgpMfyXDu:lk('pilot@fictional.example'),
   fldZDij0YpvnqFgPO:lk('Fiktive Pilot GmbH'),
   fldBWHnMXuL46y5L9:'a'.repeat(64),
   fldjQ5EmGioSEA2dw:'1ABCDEFGHIJKLMNOPQRSTUVWX123456',
   fldcUBIpCMmKbmq0Q:'b'.repeat(64),
   fldGolGjsXMtaHdfY:'1BCDEFGHIJKLMNOPQRSTUVWXYZ123456',
   fldLSUNx2D7uwEjCY:'c'.repeat(64),
   fldkiRZao205kv63x:true,
   fldOe2lL8inXnOWwi:true,
   fldM2gGMhQKonLACU:true,
   fld0lzVTwul6ibTle:true,
   fldvtGMbHGeQGBrnl:490,
   fldYboIZUI70VNUlw:90
  }
});
const opts={termsVersion:'v1.0',now:new Date('2026-10-19T12:00:00Z')};
test('maps only an explicitly released live customer offer, without raw tokens',async()=>{
 const {mapApprovedCustomerOffer}=await setup();
 const r=mapApprovedCustomerOffer(base(),opts);
 assert.equal(r.offerNumber,'LSZH-2026-0001');
 assert.equal(r.recipientEmail,'pilot@fictional.example');
 assert.equal(r.details.company,'Fiktive Pilot GmbH');
 assert.equal(r.bundle.avv_required,'Nein');
 assert.equal(r.status,'sent');
 assert.equal(r.source.kind,'LSZH_CUSTOMER_APPROVED_V1');
 assert.equal(r.source.liveApproved,true);
 assert.deepEqual(Object.keys(r.bundle).sort(),['avv_required','quote','terms']);
 assert.ok(!JSON.stringify(r).includes('plain_test_bearer'));
});
test('rejects missing production/legal approvals and TEST_ONLY data',async()=>{
 const {mapApprovedCustomerOffer:f}=await setup();
 for(const [k,v] of [
  ['fldkiRZao205kv63x',false],
  ['fldOe2lL8inXnOWwi',false],
  ['fldM2gGMhQKonLACU',false],
  ['fld0lzVTwul6ibTle',false],
  ['fldNluaFeT1mWGMJY','TEST_ONLY_20261019'],
  ['fld2XdyW6ZE4XlSz3',{name:'Angenommen'}],
  ['flduZx5dzgpMfyXDu',lk('fake@example.invalid')]
 ]){
  const r=base();r.cellValuesByFieldId[k]=v;
  assert.throws(()=>f(r,opts),/customer_offer_/);
 }
 assert.throws(()=>f(base(),{...opts,termsVersion:'TEST_v1.0_RC1'}),/terms_not_final/);
});
test('AVV Ja requires final document and rejects unrequested AVV',async()=>{
 const {mapApprovedCustomerOffer:f}=await setup();
 const r=base(),v=r.cellValuesByFieldId;
 v.fldOZcNcm2PQwP7Rt={name:'Ja'};
 assert.throws(()=>f(r,opts),/document_incomplete/);
 v.fldojDAkMfvjJycme='1CDEFGHIJKLMNOPQRSTUVWXYZ1234567';
 v.fldbhBi71Jmr6g9Uk='d'.repeat(64);
 v.fld4cMFAPuSfLjz2B='AVV-PILOT-1.0';
 const out=f(r,opts);
 assert.equal(out.bundle.avv.sha256,'d'.repeat(64));
 const n=base();n.cellValuesByFieldId.fldojDAkMfvjJycme=v.fldojDAkMfvjJycme;
 assert.throws(()=>f(n,opts),/unexpected_avv/);
});
test('expiry is end of the Swiss day including October DST change',async()=>{
 const {mapApprovedCustomerOffer:f}=await setup();
 const r=base();r.cellValuesByFieldId.fldl0MMMOh95Y7N1q='2026-10-25';
 const offer=f(r,{...opts,now:new Date('2026-10-25T12:00:00Z')});
 assert.equal(offer.expiresAt,'2026-10-25T22:59:59.000Z');
 assert.throws(()=>f(r,{...opts,now:new Date('2026-10-26T00:00:00Z')}),/offer_expired/);
});
test('never silently accepts ambiguous lead lookup or a changed base',async()=>{
 const {mapApprovedCustomerOffer:f}=await setup();
 const r=base();
 r.cellValuesByFieldId.flduZx5dzgpMfyXDu={linkedRecordIds:['rec12345678901234','recABCDEFGHIJKLMN'],valuesByLinkedRecordId:{}};
 assert.throws(()=>f(r,opts),/ambiguous_lookup/);
 assert.throws(()=>f(base(),{...opts,baseId:'another'}),/wrong_source/);
});
