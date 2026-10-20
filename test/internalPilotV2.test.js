const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
const code='V'.repeat(48);
test('V2 preview envelope is accepted by the actual browser request parser',async()=>{
 const t=await setup();
 const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'../offerte-annehmen/index.html'),'utf8');
 const start=html.indexOf('async function request(path,payload){');
 const end=html.indexOf('\nconst errors=',start);
 assert.ok(start>0&&end>start);
 const envelope=await t.v.previewPayload(t.portal,code);
 const request=require('node:vm').runInNewContext('('+html.slice(start,end)+')',{
  fetch:async()=>new Response(JSON.stringify(envelope),{status:200,headers:{'Content-Type':'application/json'}})
 });
 const response=await request('/api/offer/preview',{code});
 assert.equal(response.ok,true);assert.equal(response.offer.number,t.doc().offerNumber);
 assert.equal(response.offer.once,1500);assert.equal(response.offer.test_accept_enabled,true);
});
async function setup(){
 const v=await import('../scripts/internal-test-pilot-v2.mjs');
 const {createOfferPortal}=await import('../cloud-run/offer-portal-staging/portalCore.mjs');
 const {createFirestoreOfferStore}=await import('../cloud-run/offer-portal-staging/firestoreOfferStore.mjs');
 let doc=v.makeOffer(hash(code)),updates=0,queue=Promise.resolve(),writes=0;
 const ref={get:async()=>({exists:true,data:()=>structuredClone(doc)})};
 const db={collection:()=>({doc:()=>ref}),runTransaction(fn){
  const result=queue.then(async()=>{let delta;const r=await fn({get:()=>ref.get(),update:(_,d)=>delta=d});if(delta){doc={...doc,...delta};updates++;}return r;});
  queue=result.catch(()=>{});return result;
 }};
 const portal=createOfferPortal({store:createFirestoreOfferStore(db),verifyBundle:async()=>true,
  approvedVersion:'TEST_v1.0_RC1',proofSalt:'fake-only-long-enough-salt-v2',clock:()=>new Date('2026-10-20T20:00:00Z'),
  syntheticOnly:true,internalPilotRecordId:'recZzNiq1LLmCOjNT',syntheticAcceptRecordId:'recZzNiq1LLmCOjNT',
  onAccepted:async s=>{v.acceptanceFields(s);writes++;return{result:'synthetic_fields_patched'};}});
 const body={name:'Lars Schulthess',email:'lars@lszh-automations.ch',authorized:true,accept_quote:true,accept_terms:true,
  quote_sha256:v.V2.quote.sha256,terms_sha256:v.V2.terms.sha256,accept_avv:false,avv_sha256:null,avv_version:null};
 return {v,portal,body,doc:()=>doc,mutate:f=>doc=f(doc),counts:()=>({updates,writes})};
}
test('V2 exact business pilot previews invented values and never projects recipient or token',async()=>{
 const t=await setup(),p=await t.portal.preview(code);
 assert.equal(p.test_only,true);assert.equal(p.test_accept_enabled,true);assert.equal(p.once,1500);assert.equal(p.monthly,99);
 assert.ok(p.company.includes('TEST_ONLY'));assert.ok(!JSON.stringify(p).includes('lars@'));assert.ok(!JSON.stringify(p).includes(hash(code)));
});
test('V2 accepts once under contention using original core and Firestore transaction adapter',async()=>{
 const t=await setup();const r=await Promise.allSettled([t.portal.accept(code,t.body),t.portal.accept(code,t.body)]);
 assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.deepEqual(t.counts(),{updates:1,writes:1});
 const fields=t.v.acceptanceFields(t.doc());assert.equal(fields.Status,'Angenommen');
 for(const key of ['Versand freigegeben','Echtbetrieb – kein Test','Online-Annahme rechtlich freigegeben','Online-Annahme Bestätigung gesendet am'])assert.ok(!(key in fields));
 const e=t.doc().evidence;const reordered=Object.fromEntries(Object.entries(e).reverse());
 assert.deepEqual(t.v.acceptanceFields({...t.doc(),evidence:reordered}),fields);
});
test('V2 refuses another record, recipient, purpose or company before claiming',async()=>{
 for(const change of [d=>({...d,source:{...d.source,recordId:'rec12345678901234'}}),d=>({...d,recipientEmail:'other@example.com'}),
  d=>({...d,source:{...d.source,internalPilot:'other'}}),d=>({...d,details:{...d.details,company:'Other'}})]){
  const t=await setup();t.mutate(change);await assert.rejects(()=>t.portal.preview(code));assert.deepEqual(t.counts(),{updates:0,writes:0});
 }
});
test('V2 rejects missing consents and changed document hashes without a claim',async()=>{
 for(const changes of [{accept_quote:false},{accept_terms:false},{authorized:false},{email:'another@example.com'},{quote_sha256:'a'.repeat(64)}]){
  const t=await setup();await assert.rejects(()=>t.portal.accept(code,{...t.body,...changes}));assert.deepEqual(t.counts(),{updates:0,writes:0});
 }
});
test('V2 CRM guard rejects customer release, links, wrong prices and altered archive IDs',async()=>{
 const t=await setup();const fields={Offertennummer:t.doc().offerNumber,Status:'Entwurf','AVV erforderlich':'Nein',
  'Projektbedingungen Version':'TEST_v1.0_RC1','Einmalig CHF':1500,'Monatlich CHF':99,'Zahlungsziel Tage':30,
  'Gültig bis':'2026-11-20','Interne Notiz':'TEST_ONLY NO_CONTRACT LSZH_INTERNAL_V2_20261020',Übernommen:true};
 const row={id:'recZzNiq1LLmCOjNT',fields};t.v.assertRow(row);
 for(const changed of [{'Versand freigegeben':true},{'Echtbetrieb – kein Test':true},{'Online-Annahme rechtlich freigegeben':true},
  {Kunde:['rec12345678901234']},{'Einmalig CHF':1501},{'Online-Annahme Offerten Drive ID':'wrong'},{'Online-Annahme Bestätigung gesendet am':'2026-10-20'}])
  assert.throws(()=>t.v.assertRow({...row,fields:{...fields,...changed}}));
});
test('V2 runtime guard rejects modified offer values even if new fingerprint would be valid',async()=>{
 const t=await setup();t.v.assertOffer(t.doc(),hash(code));
 for(const changed of [d=>({...d,details:{...d.details,onceCHF:0}}),d=>({...d,bundle:{...d.bundle,quote:{...d.bundle.quote,sha256:'a'.repeat(64)}}}),
  d=>({...d,downstream:{...d.downstream,email:'pending'}})])assert.throws(()=>t.v.assertOffer(changed(t.doc()),hash(code)));
});
