'use strict';
const crypto = require('node:crypto');
const {verifyOnboardingState} = require('../../onboarding/confirmation');

const TYPE = 'ONBOARDING_INPUT_PROCESSED_V1';
const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;
const ONBOARDING_CODE = /^ob_[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/;

// Opaque stable key; no customer email or link token in Firestore.
function eventId(recordId) {
  if (!RECORD_ID.test(recordId)) throw new Error('invalid_record_id');
  return crypto.createHash('sha256')
    .update('lszh-onboarding:notification:v1:' + recordId).digest('hex');
}

function makeDraft(recordId, now = new Date()) {
  if (!RECORD_ID.test(recordId)) throw new Error('invalid_record_id');
  if (!(now instanceof Date) || Number.isNaN(now.valueOf())) throw new Error('invalid_clock');
  return Object.freeze({
    schemaVersion: 1,
    eventType: TYPE,
    recordId,
    state: 'DRAFT_NOT_SENT',
    testOnly: true,
    deliveryEnabled: false,
    emailSent: false,
    createdAt: now.toISOString()
  });
}

// One entire reconciliation run, independently repeatable after worker restarts.
// No send API exists here. Make still remains inactive.
async function reconcile({candidateCodes, readToken, store, fetchImpl = fetch, now = () => new Date()}) {
  if (!Array.isArray(candidateCodes) || candidateCodes.length > 200)
    throw new Error('invalid_candidates');
  if (!readToken || typeof store?.createOnce !== 'function')
    throw new Error('outbox_not_configured');
  const counts = {
    candidates: 0, completed: 0, created: 0, alreadyExisting: 0,
    processing: 0, requiresReview: 0, unavailable: 0
  };
  for (const code of new Set(candidateCodes)) {
    counts.candidates++;
    if (!ONBOARDING_CODE.test(code)) {counts.requiresReview++;continue;}
    let evidence;
    try {
      evidence = await verifyOnboardingState(code, readToken, fetchImpl);
    } catch {
      counts.unavailable++; // Never assume completed when Airtable is unavailable.
      continue;
    }
    if (evidence.state === 'requires_review') {counts.requiresReview++;continue;}
    if (evidence.state !== 'completed') {counts.processing++;continue;}
    counts.completed++;
    const id = eventId(evidence.recordId);
    const draft = makeDraft(evidence.recordId, now());
    try {
      const result = await store.createOnce(id, draft);
      if (result === 'created') counts.created++;
      else if (result === 'exists') counts.alreadyExisting++;
      else counts.unavailable++;
    } catch {
      counts.unavailable++; // Failed Firestore create has an unknown outcome, never resend.
    }
  }
  return counts;
}
module.exports = {TYPE, eventId, makeDraft, reconcile};
