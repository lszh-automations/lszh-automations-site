'use strict';
// Explicit operator-only metadata backfill. Never creates or sends commercial records.
const fs=require('node:fs'),crypto=require('node:crypto');
const {createRestDb}=require('./crm-rest-repair.cjs'),{buildStore}=require('../crm-v2/cloud-records');
const normalize=x=>String(x||'').trim().toLocaleLowerCase('de-CH').replace(/\s+/g,' ');
async function main(){
 const args=process.argv.slice(2),ids=args.filter(x=>x.startsWith('--offer-id=')).map(x=>x.slice(11)),apply=args.includes('--apply');
 if(ids.length<1||ids.length>10||new Set(ids).size!==ids.length||ids.some(x=>!/^[A-Za-z0-9_-]{1,100}$/.test(x))||args.some(x=>x!=='--apply'&&!x.startsWith('--offer-id=')))throw Error('One to ten explicit offer IDs required');
 let token='';for await(const chunk of process.stdin)token+=chunk;token=token.trim();if(!token||/\s/.test(token))throw Error('In-memory gcloud token required');
 const db=createRestDb({projectId:'lszh-automations',token}),store=buildStore(db,'lszh_crm_v2_'),proof=[];
 for(const id of ids){
  const ref=db.collection('lszh_crm_v2_offerten').doc(id),snap=await ref.get();if(!snap.exists)throw Error('Offer not found');const before=snap.data();
  if(before.customerId){proof.push({offerId:id,number:before.number,state:'already_assigned',customerId:before.customerId});continue;}
  const lead=before.leadId?await db.collection('lszh_crm_v2_leads').doc(before.leadId).get():null;
  if(!lead?.exists)throw Error('Missing lead');const person=lead.data(),rows=await db.collection('lszh_crm_v2_kunden').where('email','==',normalize(person.email)).limit(2).get();
  if(rows.docs.length!==1||normalize(rows.docs[0].data().company)!==normalize(person.company))throw Error('No unique exact email/company match');
  const customerId=rows.docs[0].id,hash=record=>crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.keys(record).filter(k=>!['customerId','updatedAt','updatedBy'].includes(k)).sort().map(k=>[k,record[k]])))).digest('hex');
  const entry={offerId:id,number:before.number,customerId,mode:apply?'applied':'dry_run',originalLinkMetadata:Object.fromEntries(['customerId','updatedAt','updatedBy'].map(k=>[k,before[k]??null])),unchangedCommercialDataSha256:hash(before)};
  if(apply){await store.linkCustomer('offerten',id,{email:'lars@lszh-automations.ch'},customerId);const after=(await ref.get()).data();if(after.customerId!==customerId||hash(after)!==entry.unchangedCommercialDataSha256)throw Error('Unexpected repair result');entry.commercialDataUnchanged=true;}
  proof.push(entry);
 }
 const output={project:'lszh-automations',apply,offers:proof,emailSent:false,invoiceCreated:false};
 fs.writeFileSync('../live-customer-overview-20261027/'+(apply?'backfill-applied.json':'backfill-plan.json'),JSON.stringify(output,null,2));
 console.log(JSON.stringify({mode:apply?'applied':'dry_run',offers:proof.map(x=>({number:x.number,customerId:x.customerId,state:x.state||x.mode,commercialDataUnchanged:x.commercialDataUnchanged})),emailSent:false,invoiceCreated:false}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
