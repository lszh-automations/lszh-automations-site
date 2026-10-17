import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {createServer}=require('./server');
const {createFirestoreStore}=require('./firestore-store');
const {eventId}=require('./outbox');

const CODE='ob_00000000-0000-4000-8000-000000000000';
const ONBOARDING='rec'+'A'.repeat(14);
const ORDER='rec'+'B'.repeat(14);
const CUSTOMER='rec'+'C'.repeat(14);
const TASK='rec'+'D'.repeat(14);
const EVENT=eventId(ONBOARDING);
const SECRET='lszh-synthetic-only-trigger-secret-123456789';
const FIRESTORE_NAME=
 'projects/lszh-automations/databases/lszh-offers-staging/documents/lszh_onboarding_notification_drafts_staging/'+EVENT;
const CLOCK='2026-10-17T00:00:00.000Z';

function fixture({sensitive='Nein',taskPresent=true,invoiceMatches=true,
                  duplicate=false,airtable503=false}={}) {
 const requests=[];
 const docs=new Map();
 const onboarding={
  id:ONBOARDING,fields:{
   Projektcode:CODE,Auftrag:[ORDER],Status:'Eingegangen',
   'Sensible Daten':sensitive,'Make-Konto Status':'Noch kein Make-Konto',
   'Make-Organisation':'','Make-Einladung Status':'Noch nicht eingeladen',
   'Rechnungsstrasse':'Fiktivweg 1','Rechnungs-PLZ':'0000',
   'Rechnungsort':'Musterstadt','Rechnungsland':'Schweiz',
   'Rechnungs-E-Mail':'noreply@example.invalid'
  }
 };
 const order={
  id:ORDER,fields:{
   'Onboarding-Token':CODE,'Kunden-Onboarding':[ONBOARDING],Kunde:[CUSTOMER],
   'Verbindungen erforderlich':true,'AVV erforderlich':'Prüfen',
   'Make-Kontostatus':'Noch kein Make-Konto','Make-Organisation':'',
   'Make-Einladungsstatus':'Noch nicht eingeladen'
  }
 };
 const customer={
  id:CUSTOMER,fields:{
   'Rechnungsstrasse':'Fiktivweg 1','Rechnungs-PLZ':'0000',
   'Rechnungsort':invoiceMatches?'Musterstadt':'Falscher Ort',
   'Rechnungsland':'Schweiz','Rechnungs-E-Mail':'noreply@example.invalid'
  }
 };
 const fetchImpl=async(input,options={})=>{
  const url=new URL(input);
  requests.push({host:url.hostname,pathname:url.pathname,method:options.method});
  if(url.hostname==='api.airtable.com') {
   assert.equal(options.method,'GET','Never mutate Airtable');
   assert.equal(options.headers.Authorization,'Bearer SYNTHETIC_READ_ONLY');
   assert.equal(url.pathname.split('/')[2],'appzJiskpAdaR1HEv');
   if(airtable503)return {ok:false,status:401};
   let payload;
   if(url.pathname.endsWith('/tblWIY4l4VASz8Vse')) {
    assert.equal(url.searchParams.get('filterByFormula'),"{Projektcode}='"+CODE+"'");
    assert.equal(url.searchParams.get('maxRecords'),'2');
    payload={records:[onboarding,...(duplicate?[{...onboarding,id:TASK}]:[])]};
   }else if(url.pathname.endsWith('/tblXUogIvWbulxfnN/'+ORDER)){
    payload=order;
   }else if(url.pathname.endsWith('/tbl8cUUfFVqsjj2Z0/'+CUSTOMER)){
    payload=customer;
   }else if(url.pathname.endsWith('/tblwbAszWFlFJGmgQ')){
    assert.equal(url.searchParams.get('filterByFormula'),"{Aufgabencode}='"+ORDER+"-DSG-01'");
    payload={records:taskPresent?[{id:TASK,fields:{Aufgabencode:ORDER+'-DSG-01',Auftrag:[ORDER]}}]:[]};
   }else throw Error('Unexpected Airtable endpoint');
   return {ok:true,status:200,json:async()=>structuredClone(payload)};
  }
  if(url.hostname==='metadata.google.internal') {
   assert.equal(options.method,'GET');
   assert.equal(options.headers['Metadata-Flavor'],'Google');
   return {ok:true,status:200,json:async()=>({access_token:'SYNTHETIC_RUNTIME_TOKEN',expires_in:3000})};
  }
  if(url.hostname==='firestore.googleapis.com'){
   assert.equal(options.headers.Authorization,'Bearer SYNTHETIC_RUNTIME_TOKEN');
   assert.equal(options.method==='POST'||options.method==='GET',true);
   assert.equal(url.pathname.startsWith('/v1/projects/lszh-automations/databases/lszh-offers-staging/documents/lszh_onboarding_notification_drafts_staging'),true);
   if(options.method==='POST') {
    assert.equal(url.searchParams.get('documentId'),EVENT);
    const fields=JSON.parse(options.body).fields;
    assert.equal(fields.recordId.stringValue,ONBOARDING);
    assert.equal(fields.state.stringValue,'DRAFT_NOT_SENT');
    assert.equal(fields.testOnly.booleanValue,true);
    assert.equal(fields.emailSent.booleanValue,false);
    assert.equal(fields.deliveryEnabled.booleanValue,false);
    assert.equal(fields.createdAt.timestampValue.includes('T'),true);
    if(docs.has(EVENT))return {ok:false,status:409};
    docs.set(EVENT,{name:FIRESTORE_NAME,fields});
    return {ok:true,status:200,json:async()=>({name:FIRESTORE_NAME})};
   }
   assert.equal(url.pathname.endsWith('/'+EVENT),true);
   const d=docs.get(EVENT);
   return d?{ok:true,status:200,json:async()=>structuredClone(d)}:{ok:false,status:404};
  }
  throw Error('Unexpected external endpoint');
 };
 return {fetchImpl,docs,requests};
}
async function runServer(opts={},overrides={}) {
 const f=fixture(opts);
 const env={
  LSZH_OUTBOX_STAGE_ENABLED:'true', // IN-MEMORY LOCAL TEST ONLY; live service stays OFF
  FIRESTORE_PROJECT_ID:'lszh-automations',FIRESTORE_DATABASE_ID:'lszh-offers-staging',
  LSZH_STAGING_FIXTURE_CODES:CODE,
  AIRTABLE_ONBOARDING_READ_TOKEN:'SYNTHETIC_READ_ONLY',
  OUTBOX_CONTROL_SECRET:SECRET,
  ...overrides
 };
 const server=createServer({env,fetchImpl:f.fetchImpl,store:createFirestoreStore(f.fetchImpl)});
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 const post=async(secret=SECRET)=>fetch(url+'/internal/reconcile',{
  method:'POST',headers:{'x-lszh-outbox-key':secret}
 });
 return {f,env,post,health:()=>fetch(url+'/health'),
  close:()=>new Promise(resolve=>server.close(resolve))};
}
function firestoreWrites(f){return f.requests.filter(r=>r.host==='firestore.googleapis.com'&&r.method==='POST').length;}
function airtableGets(f){return f.requests.filter(r=>r.host==='api.airtable.com'&&r.method==='GET').length;}

test('full local route: synthetic Airtable links -> real validator -> real Firestore createOnce -> no-send draft',async()=>{
 const s=await runServer();
 try{
  const res=await s.post();assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.ok,true);
  assert.equal(body.mode,'STAGING_DRAFT_ONLY');
  assert.deepEqual({created:body.created,completed:body.completed,unavailable:body.unavailable},
   {created:1,completed:1,unavailable:0});
  assert.equal(airtableGets(s.f),3);
  assert.equal(firestoreWrites(s.f),1);
  assert.equal(s.f.docs.size,1);
  const stored=[...s.f.docs.values()][0].fields;
  assert.equal(stored.state.stringValue,'DRAFT_NOT_SENT');
  assert.equal(stored.emailSent.booleanValue,false);
  assert.equal(stored.deliveryEnabled.booleanValue,false);
  assert.equal(stored.testOnly.booleanValue,true);
  assert.equal(JSON.stringify(body).includes(CODE),false);
  assert.equal(JSON.stringify(body).includes('noreply@example.invalid'),false);
  const again=await s.post();assert.equal(again.status,200);
  const repeated=await again.json();
  assert.equal(repeated.created,0);assert.equal(repeated.alreadyExisting,1);
  assert.equal(s.f.docs.size,1);
  assert.equal(firestoreWrites(s.f),2); // second atomic create returns 409; existing GET verifies identity
 }finally{await s.close();}
});

test('DSG-required onboarding cannot create draft without a matching review task',async()=>{
 const s=await runServer({sensitive:'Unsicher',taskPresent:false});
 try{
  const r=await s.post();assert.equal(r.status,200);
  const b=await r.json();assert.equal(b.processing,1);assert.equal(b.created,0);
  assert.equal(firestoreWrites(s.f),0);assert.equal(s.f.docs.size,0);
  assert.equal(airtableGets(s.f),4);
 }finally{await s.close();}
});

test('onboarding/customer invoice mismatch fails closed before Firestore metadata token',async()=>{
 const s=await runServer({invoiceMatches:false});
 try{
  const r=await s.post();assert.equal(r.status,200);
  assert.equal((await r.json()).processing,1);
  assert.equal(s.f.requests.some(x=>x.host==='metadata.google.internal'),false);
  assert.equal(firestoreWrites(s.f),0);
 }finally{await s.close();}
});

test('duplicate Airtable project codes require review and no Firestore attempt',async()=>{
 const s=await runServer({duplicate:true});
 try{
  const r=await s.post();assert.equal(r.status,200);
  assert.equal((await r.json()).requiresReview,1);
  assert.equal(firestoreWrites(s.f),0);assert.equal(airtableGets(s.f),1);
 }finally{await s.close();}
});

test('Airtable 401 produces unavailable, not false completion',async()=>{
 const s=await runServer({airtable503:true});
 try{
  const r=await s.post();assert.equal(r.status,200);
  const b=await r.json();
  assert.equal(b.unavailable,1);assert.equal(b.created,0);
  assert.equal(firestoreWrites(s.f),0);
 }finally{await s.close();}
});

test('disabled runtime never asks for credentials, Airtable records or Firestore',async()=>{
 const s=await runServer({}, {LSZH_OUTBOX_STAGE_ENABLED:'false'});
 try{
  const health=await s.health();
  assert.deepEqual(await health.json(),{service:'lszh-onboarding-draft-outbox',enabled:false});
  const res=await s.post();assert.equal(res.status,503);
  assert.deepEqual(await res.json(),{error:'outbox_disabled'});
  assert.equal(s.f.requests.length,0);
 }finally{await s.close();}
});

test('even locally enabled runtime refuses a missing second secret before any side effects',async()=>{
 const s=await runServer();
 try{
  const res=await s.post('wrong');
  assert.equal(res.status,403);assert.equal(s.f.requests.length,0);
 }finally{await s.close();}
});
