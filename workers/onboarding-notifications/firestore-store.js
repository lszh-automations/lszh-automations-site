'use strict';
const {eventId, TYPE} = require('./outbox');

// Cloud Run metadata identity (short-lived token). No JSON service-account key.
// This worker is hard-pinned to the TEST outbox in LSZH's business GCP project.
const PROJECT = 'lszh-automations';
const DATABASE = 'lszh-offers-staging';  // EXISTING named Zurich database, staging only.
const COLLECTION = 'lszh_onboarding_notification_drafts_staging';
const DOCUMENTS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT +
  '/databases/' + DATABASE + '/documents/' + COLLECTION;
const METADATA = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

function toFirestore(draft) {
  return {fields:{
    schemaVersion:{integerValue:String(draft.schemaVersion)},
    eventType:{stringValue:draft.eventType},
    recordId:{stringValue:draft.recordId},
    state:{stringValue:draft.state},
    testOnly:{booleanValue:draft.testOnly},
    deliveryEnabled:{booleanValue:draft.deliveryEnabled},
    emailSent:{booleanValue:draft.emailSent},
    createdAt:{timestampValue:draft.createdAt}
  }};
}

function createFirestoreStore(fetchImpl = fetch) {
  let cached = null;
  async function auth() {
    if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;
    const result = await fetchImpl(METADATA, {
      method:'GET', headers:{'Metadata-Flavor':'Google'},
      signal:AbortSignal.timeout(5000)
    });
    if (!result.ok) throw new Error('metadata_unavailable');
    const json = await result.json();
    if (typeof json?.access_token !== 'string' || !json.access_token ||
        !Number.isFinite(Number(json.expires_in))) throw new Error('invalid_metadata_token');
    cached = {token:json.access_token,
      expiresAt:Date.now() + Math.min(Number(json.expires_in), 3300) * 1000};
    return cached.token;
  }
  async function createOnce(id, draft) {
    if (id !== eventId(draft?.recordId) || !/^[a-f0-9]{64}$/.test(id) ||
        draft?.eventType !== TYPE || draft?.state !== 'DRAFT_NOT_SENT' ||
        draft?.testOnly !== true || draft?.deliveryEnabled !== false ||
        draft?.emailSent !== false || draft?.schemaVersion !== 1)
      throw new Error('invalid_notification_draft');
    const token = await auth();
    const address = new URL(DOCUMENTS);
    address.searchParams.set('documentId', id);
    const response = await fetchImpl(address.toString(), {
      method:'POST',
      headers:{Authorization:'Bearer ' + token,'Content-Type':'application/json'},
      body:JSON.stringify(toFirestore(draft)),
      signal:AbortSignal.timeout(10000)
    });
    if (response.ok) {
      const saved=await response.json();
      if (saved?.name !== 'projects/' + PROJECT + '/databases/' + DATABASE + '/documents/' + COLLECTION + '/' + id) throw new Error('draft_persistence_unverified');
      return 'created';
    }
    if (response.status !== 409) throw new Error('draft_persistence_unavailable');
    const existing = await fetchImpl(DOCUMENTS + '/' + id, {
      method:'GET', headers:{Authorization:'Bearer ' + token},
      signal:AbortSignal.timeout(10000)
    });
    if (!existing.ok) throw new Error('draft_duplicate_unverifiable');
    const document=await existing.json();
    if (document?.name !== 'projects/' + PROJECT + '/databases/' + DATABASE + '/documents/' +
        COLLECTION + '/' + id ||
        document?.fields?.schemaVersion?.integerValue !== '1' ||
        document?.fields?.eventType?.stringValue !== TYPE ||
        document?.fields?.recordId?.stringValue !== draft.recordId ||
        document?.fields?.testOnly?.booleanValue !== true ||
        document?.fields?.deliveryEnabled?.booleanValue !== false)
      throw new Error('draft_duplicate_conflict');
    return 'exists';
  }
  return {createOnce};
}
module.exports = {createFirestoreStore, toFirestore, PROJECT, DATABASE, COLLECTION};
