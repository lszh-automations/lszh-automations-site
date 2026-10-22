'use strict';

// Read-only startup probe for *synthetic* locked business Drive PDFs.
// Not an HTTP route. Never prints tokens, file IDs, document contents or hashes.
// Explicitly gated: only private staging, never customer acceptance.
async function runArchiveStagingSmoke(){
  if(process.env.NODE_ENV!=='staging' ||
    process.env.SITE_PRIVATE!=='true' ||
    process.env.OFFER_ACCEPTANCE_ENABLED==='true' ||
    process.env.LSZH_STAGING_ARCHIVE_SMOKE!=='true')return;
  try{
    const fields={
      'AVV erforderlich':'Ja',
      'Online-Annahme Offerten-Archivstatus':'VERIFIZIERT',
      'Online-Annahme Offerten-Archivprüfung am':'2026-10-14T12:00:00Z',
      'Online-Annahme Offerten Drive ID':'1kExaJGY_meuP0a-msW-RC-q9S6efzkqd',
      'Online-Annahme Offerten-SHA256':'3aabb6fe87f0561f09d5a5252fdc6c1a0a9d601a6ae3290556a143b3700e6493',
      'Online-Annahme Bedingungen Drive ID':'1DM8PVHXhTqGeYMXaksF6ShV5p4Z8Tv4A',
      'Online-Annahme Bedingungen-SHA256':'31d8df223238ea9f10ea67265043c32730b4e63b4206b83818c22ae8a048ab1d',
      'Online-Annahme AVV Drive ID':'1W-ZB32pxV7R6EC928BU0iMIAFhSlTno8',
      'Online-Annahme AVV-SHA256':'0e5e304feb775fc9ff45478970d6a1582542f58f84c5b03b1f5d8d94fdcea536',
      'Online-Annahme AVV-Version':'TEST_ONLY_AVV_v0.9_RC1_ABC'
    };
    const verifier=require('./offerArchiveVerifier')();
    const valid=await verifier.verify(fields);
    if(!valid)throw Error('archive_invalid');
    await verifier.pdf(fields,'avv'); // verifies real downloaded bytes, not only metadata
    console.info('LSZH_STAGING_ARCHIVE_READER_CHECK: PASS');
  }catch(err){
    // Do not leak OAuth responses, private keys, IDs or other vendor details.
    console.error('LSZH_STAGING_ARCHIVE_READER_CHECK: FAIL');
  }
}
module.exports=runArchiveStagingSmoke;
