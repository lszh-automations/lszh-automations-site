'use strict';
// Explicit operator repair. Uses the exact CRM business methods, never sends mail.
const {buildStore}=require('../crm-v2/cloud-records');
function encode(value){
 if(value===null)return {nullValue:null};if(typeof value==='string')return {stringValue:value};if(typeof value==='boolean')return {booleanValue:value};
 if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
 if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};
 if(value&&typeof value==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))}};
 throw Error('Unsupported Firestore value');
}
function decode(value){
 if('stringValue' in value)return value.stringValue;if('integerValue' in value)return Number(value.integerValue);if('doubleValue' in value)return value.doubleValue;if('booleanValue' in value)return value.booleanValue;if('nullValue' in value)return null;
 if('arrayValue' in value)return (value.arrayValue.values||[]).map(decode);if('mapValue' in value)return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([k,v])=>[k,decode(v)]));
 if('timestampValue' in value)return value.timestampValue;throw Error('Unsupported Firestore type');
}
function createRestDb({projectId,token,emulatorHost,fetchImpl=fetch}={}){
 if(emulatorHost?(projectId!=='demo-lszha-c2-20261025'||emulatorHost!=='127.0.0.1:8788'):projectId!=='lszh-automations')throw Error('Unapproved target');
 const resource='projects/'+projectId+'/databases/(default)/documents',base=(emulatorHost?'http://'+emulatorHost:'https://firestore.googleapis.com')+'/v1/'+resource;
 const headers={'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})};
 async function call(suffix,body,method=body?'POST':'GET'){
  const r=await fetchImpl(base+suffix,{method,headers,...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)}),v=await r.json();
  if(!r.ok){const error=Error(v.error?.status||'REST_FAILED');error.status=r.status;throw error;}return v;
 }
 function snapshot(ref,doc){return {exists:Boolean(doc),id:ref.id,ref,data:()=>doc?Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,decode(v)])):undefined};}
 function doc(collection,id){if(!/^[A-Za-z0-9_-]{1,180}$/.test(id||''))throw Error('Invalid document id');return {id,path:collection+'/'+id,async get(transaction){
  if(transaction){const rows=await call(':batchGet',{documents:[resource+'/'+this.path],transaction});return snapshot(this,rows.find(row=>row.found)?.found||null);}
  try{return snapshot(this,await call('/'+this.path));}catch(e){if(e.status===404)return snapshot(this,null);throw e;}
 }};}
 const collection=name=>{
  if(!/^lszh_crm_v2_(?:staging_)?(?:kunden|leads|offerten|projekte|rechnungen|_meta)$/.test(name))throw Error('Unapproved collection');
  return {doc:id=>doc(name,id),where:(field,operator,value)=>{
   if(operator!=='==')throw Error('Only exact queries permitted');let limit=2;
   const query={limit:n=>{limit=n;return query;},async get(transaction){const rows=await call(':runQuery',{structuredQuery:{from:[{collectionId:name}],where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:encode(value)}},limit},...(transaction?{transaction}:{})});const docs=rows.filter(r=>r.document).map(r=>{const id=r.document.name.split('/').at(-1);return snapshot(doc(name,id),r.document);});return {docs,empty:!docs.length};}};return query;
  }};
 };
 return {collection,async runTransaction(work){
  for(let attempt=0;attempt<4;attempt++){
   const {transaction}=await call(':beginTransaction',{}),writes=[];let writing=false;
   const fields=data=>Object.fromEntries(Object.entries(data).map(([k,v])=>[k,encode(v)]));
   try{
    const result=await work({get:ref=>{if(writing)throw Error('Reads must precede writes');return ref.get(transaction);},
     create:(ref,data)=>{writing=true;writes.push({update:{name:resource+'/'+ref.path,fields:fields(data)},currentDocument:{exists:false}});},
     set:(ref,data,options)=>{writing=true;writes.push({update:{name:resource+'/'+ref.path,fields:fields(data)},...(options?.merge?{updateMask:{fieldPaths:Object.keys(data)}}:{})});},
     update:(ref,data)=>{writing=true;writes.push({update:{name:resource+'/'+ref.path,fields:fields(data)},updateMask:{fieldPaths:Object.keys(data)},currentDocument:{exists:true}});}});
    await call(':commit',{transaction,writes});return result;
   }catch(error){await call(':rollback',{transaction}).catch(()=>{});if(error.message==='ABORTED'&&attempt<3)continue;throw error;}
  }
 }};
}
async function main(){
 const args=process.argv.slice(2),offerId=args.find(x=>x.startsWith('--offer-id='))?.slice(11),apply=args.includes('--apply');
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(offerId||'')||!process.env.LSZH_REPAIR_TOKEN)throw Error('Explicit --offer-id and in-memory LSZH_REPAIR_TOKEN required');
 if(args.some(x=>x!=='--apply'&&!x.startsWith('--offer-id=')))throw Error('Unexpected argument');
 const store=buildStore(createRestDb({projectId:'lszh-automations',token:process.env.LSZH_REPAIR_TOKEN}),'lszh_crm_v2_'),offer=await store.get('offerten',offerId);
 if(!offer||offer.status!=='Angenommen')throw Error('Only an already accepted offer can be repaired');
 const {existingLines,quoteTotals}=require('../crm-v2/offer-pricing'),totals=quoteTotals(existingLines(offer));
 console.log(JSON.stringify({mode:apply?'apply':'dry_run',offerId,offerNumber:offer.number,customerId:offer.customerId,customerNumber:offer.customerNumber||null,oneTimeCHF:totals.oneTimeCHF,monthlyCHFExcluded:totals.monthlyCHF,emailSent:false}));
 if(!apply)return;
 const result=await store.ensureInitialInvoice(offerId,{email:'lars@lszh-automations.ch'}),customer=await store.get('kunden',result.offer.customerId);
 console.log(JSON.stringify({offerId,customerId:customer.id,customerNumber:customer.customerNumber,invoice:result.invoice?{id:result.invoice.id,number:result.invoice.number,status:result.invoice.status,amountCHF:result.invoice.amountCHF,projectId:result.invoice.projectId}:null,emailSent:false}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={createRestDb};
