import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {reviewDraft,STATUS}=require('./draft-review-gate');
const {makeDraft,eventId}=require('./outbox');

const CODE='ob_12345678-1234-4234-8234-123456789abc';
const ONB='rec'+'A'.repeat(14),OTHER='rec'+'E'.repeat(14);
const ORDER='rec'+'B'.repeat(14),CUSTOMER='rec'+'C'.repeat(14);
const TOKEN='SYNTHETIC_NO_NETWORK_TOKEN';
const draft=makeDraft(ONB,new Date('2026-10-17T10:00:00.000Z'));
const key=eventId(ONB);
function airtable(){
 const state={mode:'complete',requests:[],writes:0,mails:0};
 const billing={
  'Rechnungsstrasse':'Testweg 1','Rechnungs-PLZ':'5610',
  'Rechnungsort':'Wohlen','Rechnungsland':'Schweiz',
  'Rechnungs-E-Mail':'not-a-real-recipient@example.invalid'
 };
 const fetchImpl=async(input,options)=>{
  const u=new URL(input);
  state.requests.push({url:u,method:options?.method});
  assert.equal(options.method,'GET');
  assert.equal(options.headers.Authorization,'Bearer '+TOKEN);
  assert.equal(u.hostname,'api.airtable.com');
  assert.equal(u.protocol,'https:');
  let result;
  const identity=state.mode==='different-record'?OTHER:ONB;
  if(state.mode==='outage')return {ok:false,status:503};
  if(u.pathname.endsWith('/tblWIY4l4VASz8Vse')){
   assert.equal(u.searchParams.get('filterByFormula'),"{Projektcode}='"+CODE+"'");
   assert.equal(u.searchParams.get('maxRecords'),'2');
   result={records:state.mode==='missing'?[]:[{
     id:identity,fields:{
      Projektcode:CODE,Auftrag:[ORDER],
      Status:state.mode==='partial'?'Neu':'Eingegangen',
      'Sensible Daten':'Nein','Make-Konto Status':'Noch kein Make-Konto',
      'Make-Organisation':'','Make-Einladung Status':'Noch nicht eingeladen',
      ...billing
     }
    },...(state.mode==='duplicate'?[{
      id:OTHER,fields:{Projektcode:CODE}
    }]:[])]};
  }else if(u.pathname.endsWith('/tblXUogIvWbulxfnN/'+ORDER)){
   result={id:ORDER,fields:{
    'Onboarding-Token':CODE,'Kunden-Onboarding':[identity],Kunde:[CUSTOMER],
    'Verbindungen erforderlich':true,'AVV erforderlich':'Prüfen',
    'Make-Kontostatus':'Noch kein Make-Konto','Make-Organisation':'',
    'Make-Einladungsstatus':'Noch nicht eingeladen'
   }};
  }else if(u.pathname.endsWith('/tbl8cUUfFVqsjj2Z0/'+CUSTOMER)){
   result={id:CUSTOMER,fields:billing};
  }else throw Error('unexpected synthetic read');
  return {ok:true,json:async()=>result};
 };
 return {state,fetchImpl};
}
const review=(fake,changes={})=>reviewDraft({
 draft,documentId:key,projectCode:CODE,readToken:TOKEN,
 fetchImpl:fake.fetchImpl,...changes
});
function assertNeverSend(result){
 assert.equal(result.deliveryAllowed,false);
 assert.equal(result.requiresManualApproval,true);
 assert.equal('recipient' in result,false);
 assert.equal('projectCode' in result,false);
 assert.equal('token' in result,false);
 assert.equal('send' in result,false);
 assert.equal(Object.isFrozen(result),true);
}
test('freshly completed synthetic record is review-only, never a delivery authorization',async()=>{
 const f=airtable();
 const result=await review(f);
 assert.deepEqual(result,{
  status:STATUS.CURRENTLY_COMPLETE,reason:'FRESH_COMPLETE_EVIDENCE',
  quarantineRecommended:false,deliveryAllowed:false,requiresManualApproval:true
 });
 assertNeverSend(result);
 assert.equal(f.state.requests.length,3);
 assert.ok(f.state.requests.every(x=>x.method==='GET'));
 assert.equal(f.state.writes,0);
 assert.equal(f.state.mails,0);
});
test('an existing draft can regress and recover without ever enabling delivery or persisting quarantine',async()=>{
 const f=airtable();
 for(const [mode,status,reason] of [
  ['complete',STATUS.CURRENTLY_COMPLETE,'FRESH_COMPLETE_EVIDENCE'],
  ['partial',STATUS.QUARANTINE,'ONBOARDING_NOT_COMPLETE'],
  ['duplicate',STATUS.QUARANTINE,'AMBIGUOUS_ONBOARDING_STATE'],
  ['missing',STATUS.QUARANTINE,'ONBOARDING_NOT_COMPLETE'],
  ['outage',STATUS.UNAVAILABLE,'STATUS_CHECK_FAILED'],
  ['different-record',STATUS.QUARANTINE,'RECORD_ID_MISMATCH'],
  ['complete',STATUS.CURRENTLY_COMPLETE,'FRESH_COMPLETE_EVIDENCE']
 ]){
  f.state.mode=mode;
  const result=await review(f);
  assert.equal(result.status,status);
  assert.equal(result.reason,reason);
  assertNeverSend(result);
  if(mode!=='complete')
    assert.equal(result.quarantineRecommended,true);
  assert.equal(f.state.writes,0);
  assert.equal(f.state.mails,0);
 }
 assert.equal(draft.deliveryEnabled,false);
 assert.equal(draft.emailSent,false);
 assert.equal(draft.state,'DRAFT_NOT_SENT');
 assert.equal(f.state.requests.some(x=>x.method!=='GET'),false);
});
test('invalid, altered or sent drafts fail closed with NO external requests',async()=>{
 const malformed=[
  {...draft,deliveryEnabled:true},
  {...draft,emailSent:true},
  {...draft,state:'SENT'},
  {...draft,testOnly:false},
  {...draft,schemaVersion:2},
  {...draft,eventType:'WRONG'},
  {...draft,createdAt:'not-date'},
  {...draft,recordId:'bad'},
  {...draft,recordId:{toString:()=>ONB}},
  {...draft,recipient:'someone@example.invalid'},
  {state:'DRAFT_NOT_SENT'},null,[],{}
 ];
 for(const bad of malformed){
  const f=airtable();
  const result=await review(f,{draft:bad});
  assert.equal(result.status,STATUS.INVALID);
  assert.equal(result.quarantineRecommended,true);
  assertNeverSend(result);
  assert.equal(f.state.requests.length,0);
 }
 const f=airtable();
 const mismatch=await review(f,{documentId:eventId(OTHER)});
 assert.equal(mismatch.status,STATUS.INVALID);
 assert.equal(f.state.requests.length,0);
});
test('missing status lookup credentials or invalid bearer project link fails before network',async()=>{
 for(const overrides of [
  {projectCode:"ob_' OR TRUE"},
  {projectCode:''},{projectCode:null},
  {readToken:''},{readToken:null}
 ]){
  const f=airtable();
  const result=await review(f,overrides);
  assert.equal(result.status,STATUS.UNAVAILABLE);
  assert.equal(result.quarantineRecommended,true);
  assertNeverSend(result);
  assert.equal(f.state.requests.length,0);
 }
});
test('status errors cannot leak tokens, emails, URLs or exceptions',async()=>{
 const fetchImpl=async()=>{throw Error('PAT_SUPERSECRET_BAD test@example.invalid https://private.example');};
 const result=await reviewDraft({
  draft,documentId:key,projectCode:CODE,readToken:TOKEN,fetchImpl
 });
 assert.equal(result.status,STATUS.UNAVAILABLE);
 assert.equal(result.reason,'STATUS_CHECK_FAILED');
 assertNeverSend(result);
 const serialized=JSON.stringify(result);
 for(const forbidden of ['PAT_SUPERSECRET_BAD','example.invalid','private.example',CODE,TOKEN,ONB])
  assert.equal(serialized.includes(forbidden),false);
});
