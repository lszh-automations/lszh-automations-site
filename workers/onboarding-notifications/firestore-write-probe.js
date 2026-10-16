'use strict';
// LSZH STAGING: one-shot, wholly synthetic Firestore write+verify+cleanup probe.
// This is deliberately NOT in the existing Cloud Run HTTP outbox service.
// It exercises the real production-shaped Firestore createOnce() implementation.
// Never calls Airtable, Make, email, or any non-staging Firestore resource.
const assert = require('node:assert/strict');
const {createFirestoreStore, toFirestore} = require('./firestore-store');
const {eventId, makeDraft} = require('./outbox');

const PROJECT = 'lszh-automations';
const DATABASE = 'lszh-offers-staging';
const COLLECTION = 'lszh_onboarding_notification_drafts_staging';
const RECORD_ID = 'recZZZZZZZZZZZZZZ'; // synthetic, not sourced from Airtable
const DRAFT = makeDraft(RECORD_ID, new Date('2026-10-17T00:00:00.000Z'));
const ID = eventId(RECORD_ID);
const DOCUMENT_NAME = 'projects/' + PROJECT + '/databases/' + DATABASE +
  '/documents/' + COLLECTION + '/' + ID;
const URL = 'https://firestore.googleapis.com/v1/' + DOCUMENT_NAME;
const METADATA =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const FLAGS = Object.freeze({
  LSZH_SYNTHETIC_WRITE_PROBE_ONLY:'true',
  LSZH_OUTBOX_STAGE_ENABLED:'false',
  FIRESTORE_PROJECT_ID:PROJECT,
  FIRESTORE_DATABASE_ID:DATABASE
});

async function run({env=process.env, fetchImpl=fetch, log=console.log,
                    storeFactory=createFirestoreStore}={}) {
  for (const [k,v] of Object.entries(FLAGS))
    if (env[k] !== v) throw new Error('synthetic_write_probe_disabled');
  if (process.argv.length > 2 && require.main===module)
    throw new Error('write_probe_takes_no_arguments');

  const metadata = await fetchImpl(METADATA,{
    method:'GET',headers:{'Metadata-Flavor':'Google'},
    signal:AbortSignal.timeout(5000)
  });
  if (!metadata.ok) throw new Error('runtime_identity_unavailable');
  const identity = await metadata.json();
  if (typeof identity?.access_token !== 'string' || identity.access_token.length<16)
    throw new Error('runtime_identity_unavailable');
  const headers={Authorization:'Bearer '+identity.access_token,Accept:'application/json'};

  // Before creating, reject even a synthetically shaped document from an
  // earlier execution. Never overwrite or delete a pre-existing document.
  const pre=await fetchImpl(URL,{
    method:'GET',headers,signal:AbortSignal.timeout(10000)
  });
  if (pre.status!==404) throw new Error('test_document_not_verified_absent');
  log('PASS: Fixed synthetic STAGING document was absent before the write.');

  // Use the *same* createOnce routine as the separate disabled outbox worker.
  const result=await storeFactory(fetchImpl).createOnce(ID,DRAFT);
  if (result!=='created') throw new Error('synthetic_create_not_exclusive');
  log('PASS: Actual outbox createOnce persisted one test-only, send-disabled draft.');

  const read=await fetchImpl(URL,{
    method:'GET',headers,signal:AbortSignal.timeout(10000)
  });
  if (read.status!==200) throw new Error('synthetic_document_readback_failed');
  const document=await read.json();
  if (document?.name!==DOCUMENT_NAME ||
      typeof document?.updateTime!=='string' ||
      !Number.isFinite(Date.parse(document.updateTime)))
    throw new Error('synthetic_document_identity_mismatch');
  try {
    assert.deepStrictEqual(document.fields,toFirestore(DRAFT).fields);
  }catch {
    // If the document ever changed, DO NOT delete it; manual review is safer.
    throw new Error('synthetic_document_fields_mismatch');
  }
  log('PASS: Created draft read back with exact testOnly=true and delivery=false fields.');

  // Conditioned deletion only of the *specific version* we just read.
  // No bulk deletes, no collection/database deletion, no unrelated records.
  const deleteURL=new URL(URL);
  deleteURL.searchParams.set('currentDocument.updateTime',document.updateTime);
  const deleted=await fetchImpl(deleteURL.toString(),{
    method:'DELETE',headers,signal:AbortSignal.timeout(10000)
  });
  if (!deleted.ok) throw new Error('synthetic_cleanup_unverified');
  log('PASS: Test fixture deleted with a version precondition.');

  const after=await fetchImpl(URL,{
    method:'GET',headers,signal:AbortSignal.timeout(10000)
  });
  if (after.status!==404) throw new Error('synthetic_cleanup_unverified');
  log('PASS: Test fixture removal verified (HTTP 404).');
  log('PASS: Outbox Firestore synthetic WRITE/READ/DELETE cycle completed.');
  log('No Airtable calls, emails, customer records or credentials logged.');
  return true;
}
if (require.main===module) {
  run().catch(error=>{
    // Do not expose error bodies, access tokens or Firestore document fields.
    const safe=new Set([
      'synthetic_write_probe_disabled','write_probe_takes_no_arguments',
      'runtime_identity_unavailable','test_document_not_verified_absent',
      'synthetic_create_not_exclusive','synthetic_document_readback_failed',
      'synthetic_document_identity_mismatch','synthetic_document_fields_mismatch',
      'synthetic_cleanup_unverified'
    ]);
    console.error('FAIL: '+(safe.has(error?.message)?error.message:'write_probe_unavailable'));
    console.error('A synthetic fixture may remain. DO NOT rerun or auto-delete without inspection.');
    process.exitCode=2;
  });
}
module.exports={run,FLAGS,ID,DOCUMENT_NAME,DRAFT};
