'use strict';

// One-shot Cloud Run JOB read probe using the JOB'S OWN service identity.
// NOT the website, not the outbox HTTP service. No data writes and no email.
// The only Firestore document addressed is a fixed, deliberately absent test ID.
const PROJECT = 'lszh-automations';
const DATABASE = 'lszh-offers-staging';
const COLLECTION = 'lszh_onboarding_notification_drafts_staging';
const ABSENT_ID = 'lszh_readonly_probe_no_document_created_20261016';
const METADATA =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const DB_URL =
  'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/' + DATABASE;

async function run({fetchImpl = fetch, env = process.env, log = console.log} = {}) {
  // This job only runs when explicitly created and executed with a test flag.
  // Never accept arbitrary DB, collection or document paths via env or HTTP.
  if (env.LSZH_FIRESTORE_READ_PROBE_ONLY !== 'true' ||
      env.FIRESTORE_PROJECT_ID !== PROJECT ||
      env.FIRESTORE_DATABASE_ID !== DATABASE) {
    throw new Error('read_probe_disabled');
  }
  const tokenResponse = await fetchImpl(METADATA, {
    method:'GET',headers:{'Metadata-Flavor':'Google'},
    signal:AbortSignal.timeout(5000)
  });
  if (!tokenResponse.ok) throw new Error('cloud_run_metadata_identity_unavailable');
  const tokenResult = await tokenResponse.json();
  if (typeof tokenResult?.access_token !== 'string' ||
      tokenResult.access_token.length < 16)
    throw new Error('cloud_run_metadata_identity_invalid');

  // Short-lived metadata identity. Neither token nor response payloads logged.
  const headers = {Authorization:'Bearer ' + tokenResult.access_token, Accept:'application/json'};
  const meta = await fetchImpl(DB_URL, {
    method:'GET',headers,signal:AbortSignal.timeout(10000)
  });
  if (meta.status !== 200) throw new Error('firestore_metadata_read_denied_or_unavailable');
  log('PASS: Named Zurich STAGING Firestore metadata GET 200.');

  const doc = await fetchImpl(DB_URL + '/documents/' + COLLECTION + '/' + ABSENT_ID, {
    method:'GET',headers,signal:AbortSignal.timeout(10000)
  });
  if (doc.status !== 404) throw new Error('firestore_absent_document_get_unverified');
  log('PASS: Missing, fixed synthetic document GET 404.');
  log('PASS: Cloud Run service identity effective Firestore READ probe successful.');
  log('NO document body, personal data, token, customer info, write or email operation.');
  return true;
}

if (require.main === module) {
  run().catch(err => {
    // Only static non-sensitive exception identifiers.
    const safeCodes = new Set([
      'read_probe_disabled',
      'cloud_run_metadata_identity_unavailable',
      'cloud_run_metadata_identity_invalid',
      'firestore_metadata_read_denied_or_unavailable',
      'firestore_absent_document_get_unverified'
    ]);
    console.error('FAIL: ' + (safeCodes.has(err?.message) ? err.message : 'probe_unavailable'));
    process.exitCode = 2;
  });
}
module.exports={run};
