'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash,randomBytes}=require('node:crypto');
const {createRequire}=require('node:module');
const loadSDK=createRequire(require('node:path').resolve('cloud-run/offer-portal-staging/package.json'));
const sha=v=>createHash('sha256').update(v).digest('hex');
const load=()=>import('../cloud-run/offer-portal-staging/airtableSyntheticImport.mjs');
const fields={
 number:'fldNluaFeT1mWGMJY',status:'fld2XdyW6ZE4XlSz3',
 terms:'fldkvLOuDmQoSCjuI',avvRequired:'fldOZcNcm2PQwP7Rt',
 validUntil:'fldl0MMMOh95Y7N1q',email:'flduZx5dzgpMfyXDu',
 tokenHash:'fldBWHnMXuL46y5L9',
 quoteId:'fldjQ5EmGioSEA2dw',quoteSha:'fldcUBIpCMmKbmq0Q',
 termsId:'fldGolGjsXMtaHdfY',termsSha:'fldLSUNx2D7uwEjCY',
 avvId:'fldojDAkMfvjJycme',avvSha:'fldbhBi71Jmr6g9Uk',
 avvVersion:'fld4cMFAPuSfLjz2B',prod:'fldOe2lL8inXnOWwi',
 legal:'fldkiRZao205kv63x',released:'fldM2gGMhQKonLACU',
 accepted:'fldgvIfuHuJ3JHOC0',avvAccepted:'fld8gm2LLGAeHeBSA',
 internalNote:'fldA4WCPe6jXCGkid',once:'fldvtGMbHGeQGBrnl',
 monthly:'fldYboIZUI70VNUlw',service:'fldnx2HPMJlyOaPyN',
 paymentModel:'fld5YaoIeYLE1MZFW'
};
const fixture=(mode='Ja')=>{
 const token=randomBytes(36).toString('base64url');
 const fieldsMap={
  [fields.number]:'TEST_ONLY_IMPORT_20261015_NO_CONTRACT',
  [fields.status]:{name:'Entwurf',id:'synthetic'},
  [fields.terms]:'TEST_v1.0_RC1',
  [fields.avvRequired]:{name:mode,id:'synthetic'},
  [fields.validUntil]:'2099-12-31',
  [fields.email]:{linkedRecordIds:['rec00000000000001'],
    valuesByLinkedRecordId:{rec00000000000001:['synthetic@example.invalid']}},
  [fields.tokenHash]:sha(token),
  [fields.quoteId]:'1ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef',
  [fields.quoteSha]:'a'.repeat(64),
  [fields.termsId]:'1BCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef',
  [fields.termsSha]:'b'.repeat(64),
  [fields.internalNote]:'TEST ONLY – NO CONTRACT; never email a customer',
  [fields.once]:25,[fields.monthly]:10,
  [fields.service]:{name:'Automations-Test'},
  [fields.paymentModel]:{name:'50 % bei Auftrag / 50 % nach Abnahme'}
 };
 if(mode==='Ja'){
   fieldsMap[fields.avvId]='1CDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefg';
   fieldsMap[fields.avvSha]='c'.repeat(64);
   fieldsMap[fields.avvVersion]='TEST_ONLY_AVV_v0.9_RC1_SYNTH';
 }
 return {id:'rec'+randomBytes(7).toString('hex'),cellValuesByFieldId:fieldsMap};
};
test('actual Airtable API cellValuesByFieldId maps synthetic AVV yes/no safely',async()=>{
 const {mapSyntheticAirtableOffer,SOURCE}=await load();
 assert.equal(SOURCE.table,'tbljeIUoD7wwKuSmS');
 for(const mode of ['Ja','Nein']){
   const s=fixture(mode);
   const item=mapSyntheticAirtableOffer(s);
   assert.equal(item.source.recordId,s.id);
   assert.equal(item.tokenHash,s.cellValuesByFieldId[fields.tokenHash]);
   assert.equal(item.offerNumber,'TEST_ONLY_IMPORT_20261015_NO_CONTRACT');
   assert.equal(item.status,'sent');
   assert.equal(item.details.service,'Automations-Test');
   assert.equal(item.details.paymentModel,'50 % bei Auftrag / 50 % nach Abnahme');
   assert.equal(item.approved,true); // staging synthetic ONLY
   assert.equal(item.bundle.avv_required,mode);
   assert.equal('avv' in item.bundle,mode==='Ja');
   assert.equal(item.recipientEmail,'synthetic@example.invalid');
   assert.equal(item.expiresAt,'2099-12-31T00:00:00.000Z');
   assert.deepEqual(item.downstream,{airtable:'disabled',proofPdf:'disabled',email:'disabled'});
   assert.ok(!JSON.stringify(item).includes('Bearer '));
   assert.ok(!JSON.stringify(item).includes('client@example.com'));
 }
});
test('rejects missing archive, malformed hash, AVV version or token',async()=>{
 const {mapSyntheticAirtableOffer:map}=await load();
 const edits=[
   s=>delete s.cellValuesByFieldId[fields.quoteId],
   s=>s.cellValuesByFieldId[fields.termsSha]='not-a-hash',
   s=>s.cellValuesByFieldId[fields.avvVersion]='AVV_REAL_CUSTOMER',
   s=>delete s.cellValuesByFieldId[fields.tokenHash],
   s=>s.cellValuesByFieldId[fields.quoteId]=s.cellValuesByFieldId[fields.termsId],
   s=>s.cellValuesByFieldId[fields.terms]='2026-10',
   s=>s.cellValuesByFieldId[fields.validUntil]='invalid-date'
 ];
 for(const change of edits){
   const s=fixture();change(s);
   assert.throws(()=>map(s));
 }
});
test('rejects real/mislabelled customers, released, accepted or productively approved records',async()=>{
 const {mapSyntheticAirtableOffer:map}=await load();
 const mutations=[
  s=>s.cellValuesByFieldId[fields.email].valuesByLinkedRecordId.rec00000000000001=['client@example.com'],
  s=>s.cellValuesByFieldId[fields.number]='OFF-2026-100',
  s=>s.cellValuesByFieldId[fields.internalNote]='Approved production client',
  s=>s.cellValuesByFieldId[fields.status]={name:'Versendet'},
  s=>s.cellValuesByFieldId[fields.status]={name:'Angenommen'},
  ...['prod','legal','released','accepted','avvAccepted'].map(k=>s=>{
   s.cellValuesByFieldId[fields[k]]=true;
  })
 ];
 for(const mutate of mutations){const s=fixture();mutate(s);assert.throws(()=>map(s));}
 const noAvv=fixture('Nein');
 noAvv.cellValuesByFieldId[fields.avvId]='1ABCDEFabcdef0123456789abcdef0000000000000';
 assert.throws(()=>map(noAvv));
});
test('wrong base or table is refused',async()=>{
 const {mapSyntheticAirtableOffer:map}=await load();
 assert.throws(()=>map(fixture(),{baseId:'appWrongBase'}));
 assert.throws(()=>map(fixture(),{tableId:'tblWrongTable'}));
});
test('outside emulator, creating a Firestore record is impossible even with fake db',async()=>{
 const {seedOnlyLocalEmulator}=await load();
 let writes=0;
 const fake={collection:()=>{writes++;return {doc:()=>{throw Error('not allowed')}}}};
 await assert.rejects(()=>seedOnlyLocalEmulator(fake,fixture(),{}),/local_emulator_required/);
 await assert.rejects(()=>seedOnlyLocalEmulator(fake,fixture(),{
  FIRESTORE_EMULATOR_HOST:'127.0.0.1:8088',GCLOUD_PROJECT:'lszh-automations'
 }),/local_emulator_required/);
 assert.equal(writes,0);
});

if(process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8088' &&
   process.env.GCLOUD_PROJECT==='demo-lszh-automations'){
 test('emulator only: create once, repeat no-op, reject changed data; cleanup precisely', {timeout:30000},async t=>{
   const {Firestore}=loadSDK('@google-cloud/firestore');
   const {mapSyntheticAirtableOffer,seedOnlyLocalEmulator}=await load();
   const db=new Firestore({projectId:'demo-lszh-automations',databaseId:'lszh-offers-staging'});
   const source=fixture('Ja');
   const item=mapSyntheticAirtableOffer(source);
   const ref=db.collection('lszh_staging_offers_v1').doc(item.tokenHash);
   const {syntheticSourceIndexId,SYNTHETIC_SOURCE_INDEX}=await import(
     '../cloud-run/offer-portal-staging/syntheticSourceIndex.mjs');
   const indexRef=db.collection(SYNTHETIC_SOURCE_INDEX)
     .doc(syntheticSourceIndexId(source.id));
   let created=false;
   t.after(async()=>{
    if(created){
     const s=await ref.get();
     if(s.exists){
      assert.equal(s.data().source.kind,'LSZH_SYNTHETIC_ONLY');
      assert.equal(s.data().source.recordId,source.id);
      const idx=await indexRef.get();
      assert.equal(idx.exists,true);
      assert.equal(idx.data().tokenHash,item.tokenHash);
      await Promise.all([ref.delete(),indexRef.delete()]);
      assert.equal((await ref.get()).exists,false);
      assert.equal((await indexRef.get()).exists,false);
     }
    }
    await db.terminate();
   });
   const createdResult=await seedOnlyLocalEmulator(db,source);created=true;
   assert.equal(createdResult.result,'created');
   const again=await seedOnlyLocalEmulator(db,source);
   assert.equal(again.result,'already_identical');
   const changed=structuredClone(source);
   changed.cellValuesByFieldId[fields.once]=125;
   await assert.rejects(()=>seedOnlyLocalEmulator(db,changed),/seed_conflict/);
   assert.equal((await ref.get()).data().details.onceCHF,25);
   assert.equal((await ref.get()).data().status,'sent');
 });
}
