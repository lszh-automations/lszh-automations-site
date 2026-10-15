'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const createVerifier=require('../offerArchiveVerifier');
const quote=Buffer.from('%PDF-1.4\nsample archive quote\n%%EOF\n');
const terms=Buffer.from('%PDF-1.4\napproved terms document\n%%EOF\n');
const avv=Buffer.from('%PDF-1.4\nsynthetic AVV document\n%%EOF\n');
const qid='1ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef';
const tid='1BCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef';
const aid='1AVVDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const fields={
  'Online-Annahme Offerten Drive ID':qid,
  'Online-Annahme Offerten-SHA256':hash(quote),
  'Online-Annahme Bedingungen Drive ID':tid,
  'Online-Annahme Bedingungen-SHA256':hash(terms),
  'AVV erforderlich':'Nein',
  'Online-Annahme AVV Drive ID':aid,
  'Online-Annahme AVV-SHA256':hash(avv),
  'Online-Annahme AVV-Version':'TEST_ONLY_AVV',
  'Online-Annahme Offerten-Archivstatus':'VERIFIZIERT',
  'Online-Annahme Offerten-Archivprüfung am':'2026-10-13T18:00:00Z'
};
const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
process.env.OFFER_DRIVE_SA_B64=Buffer.from(JSON.stringify({
  client_email:'archive-test@example.iam.gserviceaccount.com',
  private_key:privateKey.export({type:'pkcs8',format:'pem'}).toString()
})).toString('base64');
function mockDrive({changed=false,unlocked=false,wrongBytes=false,avvChanged=false}={}){
  const calls=[];
  async function fetcher(url,options={}){
    const address=String(url);calls.push(address);
    if(address==='https://oauth2.googleapis.com/token')
      return Response.json({access_token:'test-oauth',expires_in:3600});
    const id=address.split('/files/')[1]?.split('?')[0];
    const bytes=id===qid?quote:id===tid?terms:avv;
    const checksum=(changed && id===qid)||(avvChanged && id===aid)?'f'.repeat(64):hash(bytes);
    if(address.includes('alt=media'))
      return new Response(wrongBytes?Buffer.from('%PDF-1.4\nTAMPERED\n'):bytes,
        {status:200,headers:{'content-type':'application/pdf'}});
    return Response.json({
      id,mimeType:'application/pdf',sha256Checksum:checksum,size:bytes.length,
      trashed:false,contentRestrictions:[{readOnly:!unlocked}]
    });
  }
  return {verifier:createVerifier({fetcher}),calls};
}
test('verified archive metadata matches both original PDF byte hashes',async()=>{
  const m=mockDrive();
  assert.equal(await m.verifier.verify(fields),true);
  assert.equal(m.calls.filter(x=>x.includes('oauth2')).length,1);
});
test('private PDF retrieval returns exact archived bytes',async()=>{
  const m=mockDrive();
  const result=await m.verifier.pdf(fields,'quote');
  assert.deepEqual(result,quote);
  assert.equal(hash(result),fields['Online-Annahme Offerten-SHA256']);
});
test('changed Drive metadata SHA256 invalidates contract archive',async()=>{
  const m=mockDrive({changed:true});
  assert.equal(await m.verifier.verify(fields),false);
});
test('read-only restriction must still be active',async()=>{
  const m=mockDrive({unlocked:true});
  assert.equal(await m.verifier.verify(fields),false);
});
test('reject PDF download if actual stored bytes do not match checksum',async()=>{
  const m=mockDrive({wrongBytes:true});
  await assert.rejects(()=>m.verifier.pdf(fields,'quote'),/archive_changed/);
});
test('missing or unverified archive never passes',async()=>{
  const m=mockDrive();
  assert.equal(await m.verifier.verify({...fields,'Online-Annahme Offerten-Archivstatus':'OFFEN'}),false);
  await assert.rejects(()=>m.verifier.pdf({...fields,'Online-Annahme Offerten Drive ID':'bad'},'quote'),/archive_fields_missing/);
});

test('required AVV is checked as third locked and hashed document',async()=>{
  const m=mockDrive();
  const f={...fields,'AVV erforderlich':'Ja'};
  assert.equal(await m.verifier.verify(f),true);
  assert.deepEqual(await m.verifier.pdf(f,'avv'),avv);
  assert.equal(m.calls.some(url=>url.includes(aid)),true);
});
test('missing or manipulated AVV fails closed when required',async()=>{
  const f={...fields,'AVV erforderlich':'Ja'};
  assert.equal(await mockDrive({avvChanged:true}).verifier.verify(f),false);
  assert.equal(await mockDrive().verifier.verify({...f,'Online-Annahme AVV Drive ID':''}).catch(()=>false),false);
  await assert.rejects(()=>mockDrive({wrongBytes:true}).verifier.pdf(f,'avv'),/archive_changed/);
});
test('AVV download not exposed when not required',async()=>{
  await assert.rejects(()=>mockDrive().verifier.pdf(fields,'avv'),/invalid_document/);
});
test('unknown AVV applicability cannot bypass the archive check',async()=>{
  assert.equal(await mockDrive().verifier.verify({...fields,'AVV erforderlich':''}),false);
});
