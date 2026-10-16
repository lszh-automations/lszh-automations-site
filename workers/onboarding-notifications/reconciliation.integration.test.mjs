import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createServer}=require('./server');

const CODE='ob_00000000-0000-4000-8000-000000000000';
const ID='rec'+'A'.repeat(14);
const ORDER='rec'+'B'.repeat(14);
const CUSTOMER='rec'+'C'.repeat(14);
const SECRET='SYNTHETIC_PRIVATE_TEST_SECRET_0123456789';
const collection='projects/lszh-automations/databases/lszh-offers-staging/documents/lszh_onboarding_notification_drafts_staging/';
const invoice={
  'Rechnungsstrasse':'Synthetic 1','Rechnungs-PLZ':'5610',
  'Rechnungsort':'Wohlen','Rechnungsland':'Schweiz',
  'Rechnungs-E-Mail':'synthetic@example.invalid'
};

function fakeProviders() {
  const firestore=new Map();
  const state={customerReady:true,airtableOutage:false,firestoreOutage:false};
  const seen={createAttempts:0,firestoreReads:0,airtableReads:0,emails:0};
  const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
  const provider=async (address,options)=>{
    const url=new URL(address);
    const name=url.pathname;
    if(url.hostname==='metadata.google.internal') {
      assert.equal(options.method,'GET');
      return response({access_token:'SYNTHETIC_METADATA_ACCESS',expires_in:1200});
    }
    if(url.hostname==='api.airtable.com'){
      seen.airtableReads++;
      assert.equal(options.method,'GET');
      assert.equal(options.headers.Authorization,'Bearer SYNTHETIC_READ_ONLY');
      if(state.airtableOutage)return response({},503);
      if(name.endsWith('/tblWIY4l4VASz8Vse')) {
        if(url.searchParams.has('offset'))throw Error('unexpected cursor');
        if(url.searchParams.has('pageSize'))
          return response({records:[{fields:{Projektcode:CODE}}]});
        assert.ok(url.searchParams.get('filterByFormula').includes(CODE));
        return response({records:[{id:ID,fields:{
          Projektcode:CODE,Auftrag:[ORDER],Status:'Eingegangen',
          'Sensible Daten':'Nein','Make-Konto Status':'Noch kein Make-Konto',
          'Make-Organisation':'','Make-Einladung Status':'Noch nicht eingeladen',
          ...invoice
        }}]});
      }
      if(name.endsWith('/tblXUogIvWbulxfnN/'+ORDER))
        return response({id:ORDER,fields:{
          'Onboarding-Token':CODE,'Kunden-Onboarding':[ID],Kunde:[CUSTOMER],
          'Verbindungen erforderlich':true,'AVV erforderlich':'Prüfen',
          'Make-Kontostatus':'Noch kein Make-Konto','Make-Organisation':'',
          'Make-Einladungsstatus':'Noch nicht eingeladen'
        }});
      if(name.endsWith('/tbl8cUUfFVqsjj2Z0/'+CUSTOMER))
        return response({id:CUSTOMER,fields:state.customerReady?invoice:
          {...invoice,'Rechnungsort':'not-yet-synced'}});
      throw Error('unexpected Airtable URL');
    }
    if(url.hostname==='firestore.googleapis.com'){
      assert.equal(options.headers.Authorization,'Bearer SYNTHETIC_METADATA_ACCESS');
      if(state.firestoreOutage)return response({},503);
      const id=options.method==='POST'?url.searchParams.get('documentId'):
        name.split('/').at(-1);
      if(options.method==='POST'){
        seen.createAttempts++;
        if(firestore.has(id))return response({},409);
        const document=JSON.parse(options.body);
        assert.equal(document.fields.state.stringValue,'DRAFT_NOT_SENT');
        assert.equal(document.fields.testOnly.booleanValue,true);
        assert.equal(document.fields.deliveryEnabled.booleanValue,false);
        assert.equal(document.fields.emailSent.booleanValue,false);
        const saved={name:collection+id,fields:document.fields};
        firestore.set(id,saved);
        return response(saved);
      }
      if(options.method==='GET'){
        seen.firestoreReads++;
        const existing=firestore.get(id);
        return existing?response(existing):response({},404);
      }
      throw Error('unexpected Firestore operation');
    }
    throw Error('unrecognized external hostname');
  };
  return {provider,firestore,state,seen};
}
async function harness(providers) {
 const server=createServer({env:{
    LSZH_OUTBOX_STAGE_ENABLED:'true',
    FIRESTORE_PROJECT_ID:'lszh-automations',
 FIRESTORE_DATABASE_ID:'lszh-offers-staging',
 LSZH_STAGING_FIXTURE_CODES:'ob_00000000-0000-4000-8000-000000000000',
    AIRTABLE_ONBOARDING_READ_TOKEN:'SYNTHETIC_READ_ONLY',
    OUTBOX_CONTROL_SECRET:SECRET
  },fetchImpl:providers.provider});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {
   async reconcile(){
     const r=await fetch('http://127.0.0.1:'+server.address().port+'/internal/reconcile',{
       method:'POST',headers:{'x-lszh-outbox-key':SECRET}
     });
     return {status:r.status,body:await r.json()};
   },
   close:()=>new Promise(r=>server.close(r))
 };
}
test('HTTP -> Airtable -> Firestore once; replay creates no second draft',async()=>{
  const mock=fakeProviders(),app=await harness(mock);
  try{
    const first=await app.reconcile();
    assert.equal(first.status,200);
    assert.equal(first.body.created,1);
    assert.equal(first.body.mode,'STAGING_DRAFT_ONLY');
    assert.equal(mock.firestore.size,1);
    const second=await app.reconcile();
    assert.equal(second.status,200);
    assert.equal(second.body.created,0);
    assert.equal(second.body.alreadyExisting,1);
    assert.equal(mock.firestore.size,1);
    assert.equal(mock.seen.createAttempts,2);
    assert.equal(mock.seen.firestoreReads,1);
    assert.equal(mock.seen.emails,0);
    assert.ok(!JSON.stringify(first.body).includes(CODE));
    assert.ok(!JSON.stringify(first.body).includes('example.invalid'));
  }finally{await app.close();}
});
test('incomplete record blocks draft; subsequent completed run creates one',async()=>{
  const mock=fakeProviders(),app=await harness(mock);
  try{
    mock.state.customerReady=false;
    const incomplete=await app.reconcile();
    assert.equal(incomplete.body.processing,1);
    assert.equal(mock.firestore.size,0);
    mock.state.customerReady=true;
    const complete=await app.reconcile();
    assert.equal(complete.body.created,1);
    assert.equal(mock.firestore.size,1);
  }finally{await app.close();}
});
test('provider outage cannot become completed or sent',async()=>{
  const mock=fakeProviders(),app=await harness(mock);
  try{
    mock.state.airtableOutage=true;
    const failed=await app.reconcile();
    assert.equal(failed.status,503);
    assert.equal(mock.firestore.size,0);
    mock.state.airtableOutage=false;
    mock.state.firestoreOutage=true;
    const outage=await app.reconcile();
    assert.equal(outage.status,200);
    assert.equal(outage.body.created,0);
    assert.equal(outage.body.unavailable,1);
    assert.equal(mock.firestore.size,0);
  }finally{await app.close();}
});
