import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {reconcile,eventId}=require('./outbox');
const {createFirestoreStore}=require('./firestore-store');
const {verifyOnboardingState}=require('../../onboarding/confirmation');

const CODE='ob_12345678-1234-4234-8234-123456789abc';
const ONB='rec'+'A'.repeat(14),ORDER='rec'+'B'.repeat(14);
const CUSTOMER='rec'+'C'.repeat(14),TASK='rec'+'D'.repeat(14);
const OTHER='rec'+'E'.repeat(14);
const BASE='https://api.airtable.com/v0/appzJiskpAdaR1HEv/';
const DOCS='projects/lszh-automations/databases/lszh-offers-staging/documents/lszh_onboarding_notification_drafts_staging/';
const TOKEN='SYNTHETIC_OFFLINE_TOKEN_ONLY';
const billing={
 'Rechnungsstrasse':'Testweg 1','Rechnungs-PLZ':'5610',
 'Rechnungsort':'Wohlen','Rechnungsland':'Schweiz',
 'Rechnungs-E-Mail':'synthetisch@example.invalid'
};

function fixture(){
 const f={
  stage:'missing',sensitive:'Nein',taskExists:true,duplicate:false,
  ownerValid:true,blankInvoice:'', mismatchedCustomer:false,
  fetches:[],docs:new Map(),posts:0,gets:0,mailCalls:0
 };
 const fetchImpl=async(input,options={})=>{
  const url=new URL(input);
  f.fetches.push({host:url.hostname,path:url.pathname,method:options.method});
  if(url.hostname==='api.airtable.com'){
   assert.equal(options.method,'GET');
   assert.equal(options.headers.Authorization,'Bearer '+TOKEN);
   assert.ok(url.href.startsWith(BASE),'Cannot read unrelated Airtable base');
   let json;
   if(url.pathname.endsWith('/tblWIY4l4VASz8Vse')){
    assert.equal(url.searchParams.get('filterByFormula'),"{Projektcode}='"+CODE+"'");
    assert.equal(url.searchParams.get('maxRecords'),'2');
    const record={id:ONB,fields:{
      Projektcode:CODE,Auftrag:[ORDER],Status:f.stage==='partial'?'Neu':'Eingegangen',
      'Sensible Daten':f.sensitive,'Make-Konto Status':'Noch kein Make-Konto',
      'Make-Organisation':'','Make-Einladung Status':'Noch nicht eingeladen',
      ...billing
    }};
    if(f.blankInvoice)record.fields[f.blankInvoice]='';
    json={records:f.stage==='missing'?[]:[record,...(f.duplicate?[{...structuredClone(record),id:OTHER}]:[])]};
   }else if(url.pathname.endsWith('/tblXUogIvWbulxfnN/'+ORDER)){
    json={id:ORDER,fields:{
     'Onboarding-Token':f.ownerValid?CODE:'ob_00000000-0000-4000-8000-000000000000',
     'Kunden-Onboarding':[ONB],Kunde:[CUSTOMER],
     'Verbindungen erforderlich':true,'AVV erforderlich':'Prüfen',
     'Make-Kontostatus':'Noch kein Make-Konto','Make-Organisation':'',
     'Make-Einladungsstatus':'Noch nicht eingeladen'
    }};
   }else if(url.pathname.endsWith('/tbl8cUUfFVqsjj2Z0/'+CUSTOMER)){
    json={id:CUSTOMER,fields:{...billing}};
    if(f.blankInvoice)json.fields[f.blankInvoice]='';
    if(f.mismatchedCustomer)json.fields.Rechnungsort='Different city';
   }else if(url.pathname.endsWith('/tblwbAszWFlFJGmgQ')){
    assert.equal(url.searchParams.get('filterByFormula'),"{Aufgabencode}='"+ORDER+"-DSG-01'");
    json={records:f.taskExists?[{id:TASK,fields:{Aufgabencode:ORDER+'-DSG-01',Auftrag:[ORDER]}}]:[]};
   }else throw Error('Unexpected Airtable endpoint');
   return {ok:true,json:async()=>json};
  }
  if(url.hostname==='metadata.google.internal'){
   assert.equal(options.method,'GET');
   assert.equal(options.headers['Metadata-Flavor'],'Google');
   return {ok:true,json:async()=>({access_token:'SYNTHETIC_GOOGLE_METADATA',expires_in:3000})};
  }
  assert.equal(url.hostname,'firestore.googleapis.com');
  assert.equal(options.headers.Authorization,'Bearer SYNTHETIC_GOOGLE_METADATA');
  if(options.method==='POST'){
   f.posts++;
   assert.ok(url.pathname.endsWith('/lszh_onboarding_notification_drafts_staging'));
   const id=url.searchParams.get('documentId');
   assert.equal(id,eventId(ONB));
   const fields=JSON.parse(options.body).fields;
   assert.equal(fields.state.stringValue,'DRAFT_NOT_SENT');
   assert.equal(fields.deliveryEnabled.booleanValue,false);
   assert.equal(fields.emailSent.booleanValue,false);
   if(f.docs.has(id))return {ok:false,status:409};
   f.docs.set(id,{name:DOCS+id,fields});
   return {ok:true,json:async()=>({name:DOCS+id})};
  }
  assert.equal(options.method,'GET');
  f.gets++;
  const existing=f.docs.get(url.pathname.split('/').at(-1));
  return existing?{ok:true,json:async()=>existing}:{ok:false,status:404};
 };
 const store=createFirestoreStore(fetchImpl);
 return {f,fetchImpl,store,
  scan:()=>reconcile({candidateCodes:[CODE],readToken:TOKEN,fetchImpl,store}),
  status:()=>verifyOnboardingState(CODE,TOKEN,fetchImpl)
 };
}
function onlyGetAirtable(f){
 assert.ok(f.fetches.filter(x=>x.host==='api.airtable.com').every(x=>x.method==='GET'));
 assert.equal(f.mailCalls,0);
}
test('missing -> incomplete -> completed -> replay is exactly one durable no-send draft',async()=>{
 const x=fixture();
 const a=await x.scan();
 assert.equal(a.processing,1);assert.equal(x.f.posts,0);
 x.f.stage='partial';
 const b=await x.scan();
 assert.equal(b.processing,1);assert.equal(x.f.posts,0);
 x.f.stage='completed';
 assert.deepEqual(await x.status(),{state:'completed',recordId:ONB});
 const c=await x.scan();
 assert.equal(c.created,1);assert.equal(c.completed,1);assert.equal(x.f.posts,1);
 assert.equal(x.f.docs.size,1);
 // Simulate same input being processed after a worker restart.
 const repeated=await x.scan();
 assert.equal(repeated.alreadyExisting,1);assert.equal(repeated.created,0);
 assert.equal(x.f.docs.size,1);assert.equal(x.f.posts,2);assert.equal(x.f.gets,1);
 onlyGetAirtable(x.f);
});
test('duplicate onboarding rows and mismatched owner block drafts',async()=>{
 const x=fixture();x.f.stage='completed';x.f.duplicate=true;
 assert.equal((await x.scan()).requiresReview,1);assert.equal(x.f.posts,0);
 x.f.duplicate=false;x.f.ownerValid=false;
 assert.equal((await x.scan()).requiresReview,1);
 assert.equal(x.f.docs.size,0);onlyGetAirtable(x.f);
});
test('sensitive-data task absent blocks draft until verified task present',async()=>{
 const x=fixture();x.f.stage='completed';x.f.sensitive='Unsicher';x.f.taskExists=false;
 assert.equal((await x.scan()).processing,1);assert.equal(x.f.posts,0);
 x.f.taskExists=true;
 assert.equal((await x.scan()).created,1);
 assert.equal(x.f.docs.size,1);onlyGetAirtable(x.f);
});
test('matching blanks on both records are not evidence of complete billing data',async()=>{
 for(const missing of Object.keys(billing)){
  const x=fixture();x.f.stage='completed';x.f.blankInvoice=missing;
  const state=await x.status();
  assert.equal(state.state,'processing','Missing '+missing+' on both mirrored records must never complete');
  const counts=await x.scan();
  assert.equal(counts.processing,1);
  assert.equal(counts.created,0);assert.equal(x.f.posts,0);onlyGetAirtable(x.f);
 }
});
test('divergent customer billing data never marks an onboarding complete',async()=>{
 const x=fixture();x.f.stage='completed';x.f.mismatchedCustomer=true;
 assert.deepEqual(await x.status(),{state:'processing'});
 assert.equal((await x.scan()).created,0);
 assert.equal(x.f.docs.size,0);onlyGetAirtable(x.f);
});
