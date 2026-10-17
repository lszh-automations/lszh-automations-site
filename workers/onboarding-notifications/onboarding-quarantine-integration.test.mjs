import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {reviewOnboardingForQuarantine}=require('./onboarding-quarantine-integration');
const {eventId,makeDraft}=require('./outbox');
const {STATUS}=require('./draft-review-gate');
const {planQuarantine,STATES}=require('./quarantine-plan');
const {buildQuarantineCommit}=require('./firestore-quarantine-cas');
const {createScopedReader,ENABLE_FLAG}=require('./firestore-scoped-readers');
const {toFirestore}=require('./firestore-store');

const CODE='ob_12345678-1234-4234-8234-123456789abc';
const OTHER_CODE='ob_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RECORD='rec'+'A'.repeat(14);
const WRONG='rec'+'E'.repeat(14);
const ORDER='rec'+'B'.repeat(14);
const CUSTOMER='rec'+'C'.repeat(14);
const TOKEN='FAKE_READONLY_PAT_SECRET_SENTINEL';
const DATE='2026-10-17T15:40:00.000Z';
const ID=eventId(RECORD);
const DRAFT=makeDraft(RECORD,new Date('2026-10-17T12:00:00.000Z'));
const BILL={
 'Rechnungsstrasse':'Testweg 1','Rechnungs-PLZ':'5610',
 'Rechnungsort':'Wohlen','Rechnungsland':'Schweiz',
 'Rechnungs-E-Mail':'synthetic-not-sent@example.invalid'
};
function fakeAirtable(mode='complete'){
 const state={requests:[],writes:0,mail:0};
 const fetchImpl=async(input,options)=>{
  const url=new URL(input);
  state.requests.push({hostname:url.hostname,path:url.pathname,method:options.method});
  assert.equal(options.method,'GET');
  assert.equal(url.protocol,'https:');
  assert.equal(url.hostname,'api.airtable.com');
  assert.equal(options.headers.Authorization,'Bearer '+TOKEN);
  if(mode==='network-error')throw Error('secret '+TOKEN+' synthetic@example.invalid');
  if(mode==='down')return {ok:false,status:503};
  let payload;
  if(url.pathname.endsWith('/tblWIY4l4VASz8Vse')){
   assert.equal(url.searchParams.get('filterByFormula'),"{Projektcode}='"+CODE+"'");
   if(mode==='invalid-json')return {ok:true,json:async()=>({records:'malformed'})};
   if(mode==='duplicate')return {ok:true,json:async()=>({records:[
    {id:RECORD,fields:{Projektcode:CODE}},
    {id:WRONG,fields:{Projektcode:CODE}}
   ]})};
   if(mode==='missing')return {ok:true,json:async()=>({records:[]})};
   payload={records:[{id:mode==='wrong' ? WRONG : RECORD,fields:{
    Projektcode:CODE,Auftrag:[ORDER],
    Status:mode==='processing'?'Neu':'Eingegangen',
    'Sensible Daten':'Nein',
    'Make-Konto Status':'Noch kein Make-Konto',
    'Make-Organisation':'','Make-Einladung Status':'Noch nicht eingeladen',
    ...BILL
   }}]};
  }else if(url.pathname.endsWith('/tblXUogIvWbulxfnN/'+ORDER)){
   payload={id:ORDER,fields:{
    'Onboarding-Token':CODE,
    'Kunden-Onboarding':[mode==='wrong'?WRONG:RECORD],
    Kunde:[CUSTOMER],'Verbindungen erforderlich':true,
    'AVV erforderlich':'Prüfen',
    'Make-Kontostatus':'Noch kein Make-Konto',
    'Make-Organisation':'','Make-Einladungsstatus':'Noch nicht eingeladen'
   }};
  }else if(url.pathname.endsWith('/tbl8cUUfFVqsjj2Z0/'+CUSTOMER)){
   payload={id:CUSTOMER,fields:BILL};
  }else throw Error('unexpected read');
  return {ok:true,json:async()=>payload};
 };
 return {state,fetchImpl};
}
function input(f,change={}){
 return {draft:DRAFT,documentId:ID,projectCode:CODE,fixtureAllowlist:CODE,
  readToken:TOKEN,airtableFetchImpl:f.fetchImpl,
  firestoreReadStatus:404,reviewedAt:DATE,...change};
}
function protectedResult(r){
 assert.equal(r.deliveryAllowed,false);
 assert.equal(r.requiresManualApproval,true);
 assert.equal(r.retryAllowed,false);
 assert.equal(r.networkWriteAllowed,false);
 assert.equal(Object.isFrozen(r),true);
 const visible=JSON.stringify(r);
 for(const restricted of [CODE,TOKEN,RECORD,ID,'Bearer ','@','recipient','http','/documents:commit'])
  assert.equal(visible.includes(restricted),false,restricted);
 assert.equal('request' in r,false);
 assert.equal('proposal' in r,false);
 assert.equal('fetch' in r,false);
 assert.equal('send' in r,false);
}
function snap(review){
 const proposal=planQuarantine({draftId:ID,review,reviewedAt:DATE});
 const request=buildQuarantineCommit({proposal});
 return {name:request.body.writes[0].update.name,
  fields:structuredClone(request.body.writes[0].update.fields),
  updateTime:'2026-10-17T15:40:02.123456Z'};
}
test('real existing draft gate + verified synthetic Airtable completed state -> safe CAS summary only',async()=>{
 const f=fakeAirtable();
 const r=await reviewOnboardingForQuarantine(input(f));
 assert.equal(r.status,'OFFLINE_CAS_REVIEW_REQUIRED');
 assert.equal(r.operation,'created');
 assert.equal(r.expectedRevision,0);
 assert.equal(r.proposedRevision,1);
 assert.equal(r.quarantineState,STATES.REVIEW);
 assert.equal(f.state.requests.length,3);
 assert.equal(f.state.requests.every(x=>x.method==='GET'),true);
 protectedResult(r);
});
test('previously complete draft regresses to processing -> sticky quarantined plan, never sent',async()=>{
 const f=fakeAirtable('processing');
 const r=await reviewOnboardingForQuarantine(input(f));
 assert.equal(r.status,'OFFLINE_CAS_REVIEW_REQUIRED');
 assert.equal(r.quarantineState,STATES.QUARANTINED);
 assert.equal(f.state.requests.length,1);
 protectedResult(r);
});
test('duplicate Airtable onboarding record leads to manual-only quarantined plan',async()=>{
 const f=fakeAirtable('duplicate');
 const r=await reviewOnboardingForQuarantine(input(f));
 assert.equal(r.status,'OFFLINE_CAS_REVIEW_REQUIRED');
 assert.equal(r.quarantineState,STATES.QUARANTINED);
 assert.equal(f.state.requests.length,1);
 protectedResult(r);
});
test('missing or changed Airtable record cannot establish completion',async()=>{
 for(const mode of ['missing','wrong']){
  const f=fakeAirtable(mode);
  const r=await reviewOnboardingForQuarantine(input(f));
  assert.equal(r.status,'OFFLINE_CAS_REVIEW_REQUIRED');
  assert.equal(r.quarantineState,STATES.QUARANTINED);
  protectedResult(r);
 }
});
test('Airtable outages and invalid responses cause HOLD without a planned write',async()=>{
 for(const mode of ['down','network-error','invalid-json']){
  const f=fakeAirtable(mode);
  const r=await reviewOnboardingForQuarantine(input(f));
  assert.equal(r.status,'HOLD_NO_PERSISTENCE',mode);
  assert.equal(r.reason,'STATUS_CHECK_FAILED');
  protectedResult(r);
 }
});
test('an unsafe saved draft fails before any Airtable request and cannot plan CAS',async()=>{
 for(const draft of [
  {...DRAFT,deliveryEnabled:true},{...DRAFT,emailSent:true},
  {...DRAFT,state:'SENT'},{...DRAFT,testOnly:false},
  {...DRAFT,recipient:'synthetic@example.invalid'},null
 ]){
  const f=fakeAirtable();
  const r=await reviewOnboardingForQuarantine(input(f,{draft}));
  assert.equal(r.status,'BLOCKED_NO_PERSISTENCE');
  assert.equal(f.state.requests.length,0);
  protectedResult(r);
 }
});
test('document ID mismatch, extra keys and unauthorised fixture block prior to Airtable',async()=>{
 for(const changes of [
  {documentId:eventId(WRONG)},
  {documentId:'../unsafe'},
  {projectCode:OTHER_CODE},
  {fixtureAllowlist:OTHER_CODE},
  {fixtureAllowlist:CODE+','+CODE},
  {fixtureAllowlist:CODE+',invalid'},
  {readToken:''},
  {airtableFetchImpl:null}
 ]){
  const f=fakeAirtable();
  const r=await reviewOnboardingForQuarantine(input(f,changes));
  assert.equal(r.status,'BLOCKED_NO_PERSISTENCE',JSON.stringify(changes));
  assert.equal(f.state.requests.length,0);
  protectedResult(r);
 }
});
test('Firestore missing/forbidden/wrong identity/malformed snapshots never yield executable commit',async()=>{
 const baseline=snap({
  status:STATUS.CURRENTLY_COMPLETE,reason:'FRESH_COMPLETE_EVIDENCE',
  quarantineRecommended:false,deliveryAllowed:false,requiresManualApproval:true
 });
 for(const changes of [
  {firestoreReadStatus:403},{firestoreReadStatus:500},
  {firestoreReadStatus:200,firestoreDocument:null},
  {firestoreReadStatus:404,firestoreDocument:baseline},
  {firestoreReadStatus:200,firestoreDocument:{...baseline,name:baseline.name+'-wrong'}},
  {firestoreReadStatus:200,firestoreDocument:{...baseline,fields:{
   ...baseline.fields,deliveryAllowed:{booleanValue:true}
  }}}
 ]){
  const f=fakeAirtable();
  const r=await reviewOnboardingForQuarantine(input(f,changes));
  assert.equal(r.status,'BLOCKED_NO_PERSISTENCE');
  protectedResult(r);
 }
});
test('existing reviewed draft + newer quarantined state -> update summary only',async()=>{
 const initial=snap({
  status:STATUS.CURRENTLY_COMPLETE,reason:'FRESH_COMPLETE_EVIDENCE',
  quarantineRecommended:false,deliveryAllowed:false,requiresManualApproval:true
 });
 const f=fakeAirtable('processing');
 const r=await reviewOnboardingForQuarantine(input(f,{
  firestoreReadStatus:200,firestoreDocument:initial,
  reviewedAt:'2026-10-17T15:40:03.000Z'
 }));
 assert.equal(r.status,'OFFLINE_CAS_REVIEW_REQUIRED');
 assert.equal(r.operation,'updated');
 assert.equal(r.expectedRevision,1);
 assert.equal(r.proposedRevision,2);
 assert.equal(r.quarantineState,STATES.QUARANTINED);
 protectedResult(r);
});
test('identical review evidence is a no-op and never queues a write',async()=>{
 const baseline=snap({
  status:STATUS.CURRENTLY_COMPLETE,reason:'FRESH_COMPLETE_EVIDENCE',
  quarantineRecommended:false,deliveryAllowed:false,requiresManualApproval:true
 });
 const f=fakeAirtable();
 const r=await reviewOnboardingForQuarantine(input(f,{
  firestoreReadStatus:200,firestoreDocument:baseline,
  reviewedAt:'2026-10-17T15:40:03.000Z'
 }));
 assert.equal(r.status,'NO_CHANGE');
 assert.equal(r.revision,1);
 protectedResult(r);
});
test('offline parallel reviews can both plan same revision but no transport or blind commits exist',async()=>{
 const f1=fakeAirtable(),f2=fakeAirtable();
 const [a,b]=await Promise.all([
  reviewOnboardingForQuarantine(input(f1)),
  reviewOnboardingForQuarantine(input(f2))
 ]);
 assert.equal(a.status,'OFFLINE_CAS_REVIEW_REQUIRED');
 assert.equal(b.status,'OFFLINE_CAS_REVIEW_REQUIRED');
 assert.equal(a.expectedRevision,b.expectedRevision);
 assert.equal(a.proposedRevision,b.proposedRevision);
 protectedResult(a);protectedResult(b);
});
test('integration module exports only the planner, not credential or send methods',()=>{
 const m=require('./onboarding-quarantine-integration');
 assert.deepEqual(Object.keys(m),['reviewOnboardingForQuarantine']);
 for(const name of ['send','claim','persist','commit','createServer','run','deploy','auth'])
  assert.equal(name in m,false);
});

function scopedMock(scope,document,dbStatus=200) {
 const details=scope==='outbox'?
  {database:'lszh-offers-staging',collection:'lszh_onboarding_notification_drafts_staging',
   email:'lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com'}:
  {database:'lszh-quarantine-staging',collection:'lszh_onboarding_quarantine_cases_staging',
   email:'lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com'};
 const metadata='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/';
 const url='https://firestore.googleapis.com/v1/projects/lszh-automations/databases/'+
  details.database+'/documents/'+details.collection+'/'+ID;
 const visits=[];
 const fetchImpl=async(target,options)=>{
  visits.push({url:target,method:options.method});
  assert.equal(options.method,'GET');
  const reply=(status,body)=>({status,text:async()=>typeof body==='string'?body:JSON.stringify(body)});
  if(target===metadata+'email')return reply(200,details.email);
  if(target===metadata+'token')return reply(200,{
   access_token:'long-synthetic-only-token-nonproduction-123456789abcdef',
   token_type:'Bearer',expires_in:1800
  });
  if(target===url)return reply(dbStatus,document);
  throw Error('cross_database_or_metadata_violation');
 };
 const reader=createScopedReader({scope,fetchImpl,env:{
  [ENABLE_FLAG]:'true',LSZH_OUTBOX_STAGE_ENABLED:'false',
  LSZH_SCOPED_READER_SCOPE:scope,FIRESTORE_PROJECT_ID:'lszh-automations',
  FIRESTORE_DATABASE_ID:details.database
 }});
 return {reader,visits};
}
function outboxDocument() {
 return {name:'projects/lszh-automations/databases/lszh-offers-staging/documents/'+
  'lszh_onboarding_notification_drafts_staging/'+ID,
  fields:toFirestore(DRAFT).fields,updateTime:'2026-10-17T15:39:00.123456Z'};
}
test('offline end-to-end: two independent STAGING identities read their own DBs before draft review and CAS summary',async()=>{
 const source=scopedMock('outbox',outboxDocument());
 const destination=scopedMock('quarantine',null,404);
 const sourceRead=await source.reader.read(ID);
 const destRead=await destination.reader.read(ID);
 assert.equal(sourceRead.status,'VERIFIED_DRAFT');
 assert.equal(destRead.status,'MISSING');
 const f=fakeAirtable('processing');
 const summary=await reviewOnboardingForQuarantine(input(f,{
  draft:sourceRead.draft,firestoreReadStatus:destRead.readStatus,
  firestoreDocument:destRead.document
 }));
 assert.equal(summary.status,'OFFLINE_CAS_REVIEW_REQUIRED');
 assert.equal(summary.operation,'created');
 assert.equal(summary.quarantineState,STATES.QUARANTINED);
 protectedResult(summary);
 assert.equal(source.visits.length,3);
 assert.equal(destination.visits.length,3);
 assert.ok(source.visits.every(v=>!v.url.includes('lszh-quarantine-staging')));
 assert.ok(destination.visits.every(v=>!v.url.includes('lszh-offers-staging')));
 assert.equal(source.visits.some(v=>v.method!=='GET'),false);
 assert.equal(destination.visits.some(v=>v.method!=='GET'),false);
});
test('offline end-to-end: independent verified quarantine snapshot drives safe conditional update summary',async()=>{
 const initial=snap({
  status:STATUS.CURRENTLY_COMPLETE,reason:'FRESH_COMPLETE_EVIDENCE',
  quarantineRecommended:false,deliveryAllowed:false,requiresManualApproval:true
 });
 const source=scopedMock('outbox',outboxDocument());
 const destination=scopedMock('quarantine',initial);
 const sourceRead=await source.reader.read(ID);
 const destRead=await destination.reader.read(ID);
 assert.equal(destRead.status,'VERIFIED_QUARANTINE_SNAPSHOT');
 const f=fakeAirtable('processing');
 const result=await reviewOnboardingForQuarantine(input(f,{
  draft:sourceRead.draft,
  firestoreReadStatus:destRead.readStatus,
  firestoreDocument:destRead.document,
  reviewedAt:'2026-10-17T15:40:05.000Z'
 }));
 assert.equal(result.status,'OFFLINE_CAS_REVIEW_REQUIRED');
 assert.equal(result.operation,'updated');
 assert.equal(result.expectedRevision,1);
 assert.equal(result.proposedRevision,2);
 protectedResult(result);
 assert.ok(Object.isFrozen(destRead.document));
 assert.equal(source.visits.length,3);
 assert.equal(destination.visits.length,3);
});
