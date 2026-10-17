'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const createVerifier=require('../offerArchiveVerifier');
const quote=Buffer.from('%PDF-1.4\nsample archive quote\n%%EOF\n');
const terms=Buffer.from('%PDF-1.4\napproved terms document\n%%EOF\n');
const qid='1ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef';
const tid='1BCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const fields={
  'AVV erforderlich':'Nein',
  'Online-Annahme Offerten Drive ID':qid,
  'Online-Annahme Offerten-SHA256':hash(quote),
  'Online-Annahme Bedingungen Drive ID':tid,
  'Online-Annahme Bedingungen-SHA256':hash(terms),
  'Online-Annahme Offerten-Archivstatus':'VERIFIZIERT',
  'Online-Annahme Offerten-Archivprüfung am':'2026-10-13T18:00:00Z'
};
const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
process.env.OFFER_DRIVE_ARCHIVE_FOLDER_ID='1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in';
process.env.OFFER_DRIVE_SA_B64=Buffer.from(JSON.stringify({
  client_email:'archive-test@example.iam.gserviceaccount.com',
  private_key:privateKey.export({type:'pkcs8',format:'pem'}).toString()
})).toString('base64');
function mockDrive({changed=false,unlocked=false,wrongBytes=false,readSecretFile}={}){
  const calls=[];
  async function fetcher(url,options={}){
    const address=String(url);calls.push(address);
    if(address==='https://oauth2.googleapis.com/token')
      return Response.json({access_token:'test-oauth',expires_in:3600});
    const id=address.split('/files/')[1]?.split('?')[0];
    const bytes=id===qid?quote:terms;
    const checksum=changed && id===qid?'f'.repeat(64):hash(bytes);
    if(address.includes('alt=media'))
      return new Response(wrongBytes?Buffer.from('%PDF-1.4\nTAMPERED\n'):bytes,
        {status:200,headers:{'content-type':'application/pdf'}});
    return Response.json({
      id,mimeType:'application/pdf',sha256Checksum:checksum,size:bytes.length,
      trashed:false,parents:['1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in'],contentRestrictions:[{readOnly:!unlocked}]
    });
  }
  return {verifier:createVerifier({fetcher,readSecretFile}),calls};
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

test('Render secret file authenticates only the pinned LSZH archive-reader account',async()=>{
  const oldFile=process.env.OFFER_DRIVE_SA_FILE;
  const oldB64=process.env.OFFER_DRIVE_SA_B64;
  process.env.OFFER_DRIVE_SA_FILE='/etc/secrets/lszh-archive-reader.json';
  delete process.env.OFFER_DRIVE_SA_B64;
  const credentials=JSON.stringify({
    client_email:'lszh-archive-reader@lszh-automations.iam.gserviceaccount.com',
    private_key:privateKey.export({type:'pkcs8',format:'pem'}).toString()
  });
  const paths=[];
  try{
    const reader=mockDrive({readSecretFile:(p)=>{paths.push(p);return Buffer.from(credentials)}});
    assert.equal(await reader.verifier.verify(fields),true);
    assert.deepEqual(paths,['/etc/secrets/lszh-archive-reader.json']);
    const wrongAccount=mockDrive({readSecretFile:()=>Buffer.from(credentials.replace('lszh-archive-reader@lszh-automations.iam.gserviceaccount.com','not-lszh@example.invalid'))});
    await assert.rejects(()=>wrongAccount.verifier.verify(fields),/archive_credentials_wrong_account/);
    process.env.OFFER_DRIVE_SA_FILE='/tmp/untrusted.json';
    await assert.rejects(()=>mockDrive({readSecretFile:()=>Buffer.from(credentials)}).verifier.verify(fields),/archive_credentials_path_invalid/);
  }finally{
    if(oldFile===undefined)delete process.env.OFFER_DRIVE_SA_FILE;else process.env.OFFER_DRIVE_SA_FILE=oldFile;
    if(oldB64===undefined)delete process.env.OFFER_DRIVE_SA_B64;else process.env.OFFER_DRIVE_SA_B64=oldB64;
  }
});
