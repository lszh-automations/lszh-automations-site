'use strict';
// Synthetic test fixture ONLY. Never copy to a Cloud Run/Docker build.
// The gateway production entrypoint never imports this test harness.
const crypto=require('node:crypto');
const {claimOfferOnce,ClaimRejected}=require('../../../firestoreAcceptanceState');
const {documentPath}=require('../../../stagingOfferSchema');
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
function hash(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function createLocalFixtureClaim({db,fixture,archiveBytes,readRecord}={}){
  if(!db||!fixture||!/^LSZH-EMULATOR-[A-Za-z0-9_-]{12,60}$/.test(fixture.fixtureId||''))
    throw Error('invalid_test_fixture');
  if(!archiveBytes||!Buffer.isBuffer(archiveBytes.offer)||!Buffer.isBuffer(archiveBytes.terms)||
     (fixture.avvRequired===true&&!Buffer.isBuffer(archiveBytes.avv)))
    throw Error('invalid_test_archive');
  return async(req,res,{json,headers})=>{
    let code=400,error='invalid_test_request';
    try {
      if(req.headers['content-type']?.split(';')[0]?.trim()!=='application/json')
        throw Error('bad_content_type');
      let length=0,raw='';
      for await(const chunk of req){
        length+=chunk.length;
        if(length>8192){code=413;throw Error('oversize');}
        raw+=chunk.toString('utf8');
      }
      const b=JSON.parse(raw);
      if(!b||typeof b!=='object'||!TOKEN.test(String(b.code||''))||
        typeof b.quote_sha256!=='string'||typeof b.terms_sha256!=='string'||
        (fixture.avvRequired===true&&typeof b.avv_sha256!=='string'))
        throw Error('bad_input');
      if(b.authorized!==true||b.accept_terms!==true||
        (fixture.avvRequired===true&&b.accept_avv!==true)){
        error='consent_required';throw Error('no_consent');
      }
      // These are local synthetic PDF bytes. No claim of a Google Drive read.
      const expected={offerNumber:fixture.offerNumber,termsVersion:fixture.termsVersion,
        tokenHash:hash(String(b.code)),quoteSha256:hash(archiveBytes.offer),
        termsSha256:hash(archiveBytes.terms),
        ...(fixture.avvRequired===true?{avvVersion:fixture.avvVersion,
          avvSha256:hash(archiveBytes.avv)}:{})};
      for(const kind of fixture.avvRequired===true?['offer','terms','avv']:['offer','terms']){
        const bytes=archiveBytes[kind];
        if(bytes.length<8||bytes.subarray(0,5).toString()!=='%PDF-')
          {code=409;error='archive_changed';throw Error('invalid_pdf');}
      }
      if(b.quote_sha256!==expected.quoteSha256||b.terms_sha256!==expected.termsSha256||
        (fixture.avvRequired===true&&b.avv_sha256!==expected.avvSha256)){
        code=409;error='document_changed';throw Error('hash_mismatch');
      }
      const actor={name:b.name,email:b.email,authorized:b.authorized,
        acceptTerms:b.accept_terms,acceptAvv:b.accept_avv===true};
      const result=await claimOfferOnce({db,documentPath:documentPath(fixture.fixtureId),
        expected,actor,now:new Date(),
        airtableRecordId:fixture.airtableRecordId,readRecord});
      return json(res,200,{ok:true,offer_number:result.offerNumber,
        reconciliation_pending:true},headers);
    }catch(e){
      if(e instanceof ClaimRejected){
        code=e.reason==='invalid_input'?400:409;
        error=e.reason==='already_processed'?'already_processed':
          e.reason==='not_eligible'?'not_eligible':
          e.reason==='document_changed'?'document_changed':'invalid_test_request';
      }
      // No tokens, PDF bytes, exception strings, headers or stack traces in response.
      return json(res,code,{ok:false,error},headers);
    }
  };
}
module.exports={createLocalFixtureClaim};
