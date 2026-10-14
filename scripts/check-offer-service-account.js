'use strict';
// READ-ONLY smoke test for an existing, explicitly non-contractual archived PDF.
// Does not touch Airtable, issue a token, send email, or enable acceptance.
// Usage in a secure runtime with the Render secret configured:
// node scripts/check-offer-service-account.js <DRIVE_PDF_ID> <SHA256_HEX>
const crypto=require('node:crypto');
const createVerifier=require('../offerArchiveVerifier');
const ID_RE=/^[A-Za-z0-9_-]{20,100}$/;
const HASH_RE=/^[a-f0-9]{64}$/;

async function verifyTestArchive({id,hash,env=process.env,verifier}={}) {
  if(env.OFFER_ACCEPTANCE_ENABLED==='true')
    throw Error('acceptance_must_remain_disabled_for_smoke_test');
  if(!ID_RE.test(String(id||''))||!HASH_RE.test(String(hash||'')))
    throw Error('invalid_test_archive_input');
  if(!env.OFFER_DRIVE_SA_B64)
    throw Error('read_only_service_account_secret_not_configured');
  const api=verifier||createVerifier();
  // Only one intentionally selected TEST PDF is checked. Never mark contract
  // terms as approved or copy this status into an Airtable acceptance field.
  const fields={'Online-Annahme Offerten Drive ID':id,
    'Online-Annahme Offerten-SHA256':hash};
  const bytes=await api.pdf(fields,'quote'); // checks metadata, readOnly, hash, exact PDF bytes
  const actual=crypto.createHash('sha256').update(bytes).digest('hex');
  if(actual!==hash)throw Error('archive_changed');
  return {status:'TEST_PDF_READ_ONLY_VERIFIED_NOT_APPROVED',
    id,sha256:actual,size:bytes.length,contract_approved:false};
}
module.exports={verifyTestArchive};
if(require.main===module){
  verifyTestArchive({id:process.argv[2],hash:process.argv[3]})
    .then(x=>{process.stdout.write(JSON.stringify(x)+'\n');})
    .catch(e=>{
      // Never print OAuth token / credential JSON or stack traces to build logs.
      process.stderr.write('Archive preflight failed: '+String(e.message||'unavailable').slice(0,90)+'\n');
      process.exitCode=1;
    });
}
