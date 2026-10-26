'use strict';
const {digest,nextOfferPackageState}=require('./offer-contract-package');
const {fault}=require('./contract-acceptance-staging');
const COLLECTION='lszh_crm_v2_acceptance_staging_v1';
const DEMO_PROJECT='demo-lszha-c2-20261025';
const key=(kind,id)=>kind+'_'+digest(Buffer.from(id));
function repository(transaction,now,{beforeConsume=async()=>{},beforeIssue=async()=>{}}={}){
  async function resolveInside(tx,hash,time){
    const invitation=await tx.get(key('invitation',hash));
    if(!invitation)throw fault('LINK_INVALID',404);
    const record=await tx.get(key('package',invitation.packageId));
    const current=record?await tx.get(key('current',record.package.offerId)):null;
    const response=await tx.get(key('response',invitation.packageId));
    const offerResponse=record?await tx.get(key('offerResponse',record.package.offerId)):null;
    if(invitation.used||response||offerResponse)throw fault('LINK_ALREADY_USED',409);
    if(time>=invitation.expiresAt)throw fault('LINK_EXPIRED',410);
    if(!record||record.package.status!=='sent'||!current||
       current.packageId!==invitation.packageId||current.packageSha256!==invitation.packageSha256||
       record.package.packageSha256!==invitation.packageSha256)throw fault('DOCUMENT_VERSION_CHANGED',409);
    return {invitation,record};
  }
  async function issue(record,invitation){
    const r=structuredClone(record),i=structuredClone(invitation),pkg=r.package;
    return transaction(async tx=>{
      const previous=await tx.get(key('package',pkg.packageId));
      const current=await tx.get(key('current',pkg.offerId));
      const response=await tx.get(key('response',pkg.packageId));
      const priorInvitation=await tx.get(key('invitation',i.tokenHash));
      const offerResponse=await tx.get(key('offerResponse',pkg.offerId));
      if(response||priorInvitation||offerResponse)throw fault('LINK_ALREADY_USED',409);
      if(current&&(current.revision>pkg.revision||current.revision===pkg.revision&&current.packageSha256!==pkg.packageSha256))
        throw fault('DOCUMENT_VERSION_CHANGED',409);
      if(previous&&(previous.package.packageSha256!==pkg.packageSha256||previous.recipient!==r.recipient||
        previous.sentProof.messageId!==r.sentProof.messageId||previous.package.status!=='sent'))throw fault('PACKAGE_CONFLICT',409);
      await beforeIssue(tx,{record:r,invitation:i});
      if(!previous)tx.create(key('package',pkg.packageId),r);
      tx.set(key('current',pkg.offerId),{packageId:pkg.packageId,packageSha256:pkg.packageSha256,revision:pkg.revision});
      tx.create(key('invitation',i.tokenHash),i);
    });
  }
  const resolve=(hash,time)=>transaction(tx=>resolveInside(tx,hash,time));
  async function consume(hash,evidence,time){
    const proof=structuredClone(evidence);
    return transaction(async tx=>{
      const transactionTime=Math.max(time,now());
      if(!Number.isSafeInteger(transactionTime))throw fault('INVALID_CLOCK',503);
      const r=await resolveInside(tx,hash,transactionTime);
      if(proof.packageId!==r.record.package.packageId||proof.packageSha256!==r.invitation.packageSha256||
         proof.recipient!==r.invitation.recipient||proof.invitationHash!==hash)throw fault('PACKAGE_CONFLICT',409);
      const pkg=nextOfferPackageState(r.record.package,'record_customer_response',proof);
      await beforeConsume(tx,{record:r.record,evidence:proof,package:pkg});
      tx.create(key('response',pkg.packageId),proof);
      tx.create(key('offerResponse',pkg.offerId),{packageId:pkg.packageId,responseId:proof.responseId});
      tx.set(key('package',pkg.packageId),{...r.record,package:pkg});
      tx.set(key('invitation',hash),{...r.invitation,used:true,responseId:proof.responseId});
    });
  }
  return Object.freeze({issue,resolve,consume});
}
function createDemoMemoryAcceptanceStore({now=()=>Date.now()}={}){
  const records=new Map();let queue=Promise.resolve();
  const transaction=async work=>{
    let release;const next=new Promise(r=>{release=r}),previous=queue;queue=next;await previous;
    const writes=new Map();
    try{
      const result=await work({get:async id=>structuredClone(records.get(id)||null),
        create:(id,value)=>{if(records.has(id)||writes.has(id))throw fault('DUPLICATE_RECORD',409);writes.set(id,structuredClone(value));},
        set:(id,value)=>writes.set(id,structuredClone(value))});
      for(const [id,value] of writes)records.set(id,value);
      return structuredClone(result);
    }finally{release();}
  };
  return {store:repository(transaction,now),snapshot:()=>structuredClone([...records.values()])};
}
function createEmulatorAcceptanceStore(db,{now=()=>Date.now()}={}){
  if(!db||db.projectId!==DEMO_PROJECT||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8788')
    throw fault('DEMO_EMULATOR_REQUIRED',503);
  for(const name of ['GOOGLE_CLOUD_PROJECT','GCLOUD_PROJECT','FIREBASE_PROJECT_ID']){
    if(process.env[name]&&process.env[name]!==DEMO_PROJECT)throw fault('DEMO_EMULATOR_REQUIRED',503);
  }
  const col=db.collection(COLLECTION);
  return repository(work=>db.runTransaction(tx=>work({
    get:async id=>{const snap=await tx.get(col.doc(id));return snap.exists?snap.data():null;},
    create:(id,value)=>tx.create(col.doc(id),value),set:(id,value)=>tx.set(col.doc(id),value)
  })),now);
}
module.exports={repository,key,COLLECTION,DEMO_PROJECT,createDemoMemoryAcceptanceStore,createEmulatorAcceptanceStore};
