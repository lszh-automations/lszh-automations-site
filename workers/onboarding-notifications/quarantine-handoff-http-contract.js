'use strict';
// PURE PRIVATE HTTP REQUEST CONTRACT, NOT AN HTTP SERVER and NOT DEPLOYED.
// The Cloud Run gateway must verify a Google-signed OIDC ID token with the
// receiving service URL as audience and exact source-SA roles/run.invoker.
// Caller-supplied HTTP headers, especially identity headers, are NOT IAM proof.
// This module only bounds/parses a candidate message. It cannot process it,
// write Firestore, create replay claims, send email or authenticate Cloud Run.
const ENABLE='LSZH_QUARANTINE_HANDOFF_HTTP_ENABLED';
const PATH='/internal/quarantine/handoff';
const MAX_BYTES=2048;
const CONTENT_KEYS=['version','issuer','audience','documentId','reviewStatus',
 'reviewReason','issuedAtMs','expiresAtMs','nonce'];
function exactly(obj,keys) {
 return !!obj && typeof obj==='object' && !Array.isArray(obj) &&
  Object.keys(obj).length===keys.length && keys.every(k=>Object.hasOwn(obj,k));
}
function blocked(reason) {
 return Object.freeze({
  status:'BLOCKED_NO_HTTP_PROCESSING',reason,
  authenticated:false,writeAllowed:false,deliveryAllowed:false
 });
}
function parseHandoffHttpRequest({
 method,path,headers={},body,env={}
}={}) {
 if(env[ENABLE]!=='true' ||
    env.LSZH_OUTBOX_STAGE_ENABLED!=='false' ||
    env.LSZH_QUARANTINE_HANDOFF_MODE!=='REVIEW_ONLY' ||
    env.FIRESTORE_PROJECT_ID!=='lszh-automations' ||
    env.FIRESTORE_DATABASE_ID!=='lszh-quarantine-staging')
  return blocked('ENDPOINT_DISABLED');
 if(method!=='POST' || path!==PATH)
  return blocked('ROUTE_OR_METHOD_NOT_ALLOWED');
 if(!headers || typeof headers!=='object' ||
    headers['content-type']!=='application/json' ||
    headers['content-encoding']!==undefined)
  return blocked('CONTENT_TYPE_INVALID');
 if(!Buffer.isBuffer(body) || body.byteLength<2 ||
    body.byteLength>MAX_BYTES)
  return blocked('BODY_SIZE_INVALID');
 const length=headers['content-length'];
 // The runtime must enforce the byte cap while streaming the body.
 // The header is not trusted; compare it with the actual accumulated Buffer.
 if(length!==undefined && (typeof length!=='string' ||
    !/^[1-9]\d{0,3}$/.test(length) ||
    Number(length)!==body.byteLength))
  return blocked('BODY_LENGTH_MISMATCH');
 let envelope;
 try {envelope=JSON.parse(body.toString('utf8'));}
 catch{return blocked('BODY_JSON_INVALID');}
 if(!exactly(envelope,['payload','signature']) ||
    !exactly(envelope.payload,CONTENT_KEYS) ||
    typeof envelope.signature!=='string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(envelope.signature))
  return blocked('ENVELOPE_SHAPE_INVALID');
 // Crucial: parsing is NOT authentication or replay verification; a private
 // Cloud Run service and its IAM policy are not provisioned by this code.
 return Object.freeze({
  status:'UNAUTHENTICATED_ENVELOPE_PARSED_NOT_ACCEPTED',
  envelope:Object.freeze({...envelope,payload:Object.freeze({...envelope.payload})}),
  authenticated:false,writeAllowed:false,deliveryAllowed:false
 });
}
module.exports=Object.freeze({parseHandoffHttpRequest,PATH,ENABLE,MAX_BYTES});
