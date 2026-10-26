'use strict';

// The only public website intake -> Firestore mapping. This module never talks to Make or Airtable.
const crypto = require('node:crypto');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function field(payload,name,maxLength,required=false) {
  const value=payload[name];
  if(value===undefined || value===null) {
    if(required) throw Object.assign(new Error('missing_'+name),{status:400});
    return '';
  }
  if(typeof value!=='string') throw Object.assign(new Error('invalid_'+name),{status:400});
  const cleaned=value.trim();
  if(cleaned.length>maxLength) throw Object.assign(new Error('too_long_'+name),{status:400});
  if(required && !cleaned) throw Object.assign(new Error('missing_'+name),{status:400});
  return cleaned;
}
function prepareWebsiteLead(payload) {
  if(!payload || typeof payload!=='object' || Array.isArray(payload)) {
    throw Object.assign(new Error('invalid_body'),{status:400});
  }
  const requestId=field(payload,'submission_id',36,true).toLowerCase();
  if(!uuid.test(requestId)) throw Object.assign(new Error('invalid_submission_id'),{status:400});
  const lead = {
    name:field(payload,'name',180,true),
    company:field(payload,'company',180,true),
    email:field(payload,'email',254,true).toLowerCase(),
    street:field(payload,'street',180,true),
    postalCode:field(payload,'postal_code',16,true),
    city:field(payload,'city',120,true),
    country:field(payload,'country',80,true),
    message:field(payload,'message',4000,true),
    currentProcess:field(payload,'current_process',4000,true),
    systems:field(payload,'systems',2000,true),
    mainProblem:field(payload,'main_problem',180,true),
    frequency:field(payload,'frequency',100,true),
    desiredResult:field(payload,'desired_result',4000)
  };
  if(!emailPattern.test(lead.email)) throw Object.assign(new Error('invalid_email'),{status:400});
  const payloadHash=crypto.createHash('sha256').update(JSON.stringify(lead)).digest('hex');
  return {id:'web_'+requestId.replace(/-/g,''),data:lead,payloadHash};
}
// Explicit collection names prevent staging intake from accidentally writing
// to the live website collection. The legacy live intake keeps its old default.
const INTAKE_COLLECTIONS=new Set(['lszh_crm_v2_leads','lszh_crm_v2_staging_leads']);
async function saveWebsiteLead(db,payload,now=new Date().toISOString(),collection='lszh_crm_v2_leads') {
  if(!INTAKE_COLLECTIONS.has(collection))
    throw Object.assign(new Error('unapproved_intake_collection'),{status:500});
  const p=prepareWebsiteLead(payload);
  const ref=db.collection(collection).doc(p.id);
  const data={...p.data,status:'Neu',source:'LSZH Automations Website',createdAt:now,updatedAt:now,payloadHash:p.payloadHash};
  try {
    await ref.create(data);
    return {id:p.id,created:true};
  } catch(err) {
    // A retried submission never creates a second lead. Changed data with reused ID is a conflict.
    const isDuplicate=err.code===6 || err.code==='6' || err.code==='already-exists';
    if(!isDuplicate) throw err;
    const existing=await ref.get();
    if(existing.exists && existing.data()?.payloadHash===p.payloadHash) {
      return {id:p.id,created:false};
    }
    throw Object.assign(new Error('submission_id_conflict'),{status:409});
  }
}
module.exports={prepareWebsiteLead,saveWebsiteLead};
