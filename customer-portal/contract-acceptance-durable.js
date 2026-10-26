'use strict';
// Server-only durable boundary. Merely importing this file performs no I/O.
const {repository,key}=require('./contract-acceptance-store-staging');
const {digest}=require('./offer-contract-package');
const {fault}=require('./contract-acceptance-staging');
function createDurableAcceptance({db,projectId,databaseId='(default)',prefix,now=Date.now,emulator=false}={}){
  const local=emulator&&projectId==='demo-lszha-c2-20261025'&&process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8788';
  if(!db||db.projectId!==projectId||db.databaseId!==databaseId||
     (!local&&(projectId!=='lszh-automations'||databaseId!=='(default)'||process.env.FIRESTORE_EMULATOR_HOST))||
     !['lszh_crm_v2_staging_','lszh_crm_v2_'].includes(prefix))throw fault('PERSISTENCE_TARGET_REJECTED',503);
  const collection=db.collection(prefix+'acceptance_v1');
  const reference=id=>{
    const match=/^(crmOffer|crmLead|crmCustomer):([A-Za-z0-9_-]{1,100})$/.exec(id);
    if(match)return db.collection(prefix+{crmOffer:'offerten',crmLead:'leads',crmCustomer:'kunden'}[match[1]]).doc(match[2]);
    if(id.includes(':'))throw fault('INVALID_RECORD_REFERENCE');
    return collection.doc(id);
  };
  const transaction=work=>db.runTransaction(tx=>work({
    get:async id=>{const snap=await tx.get(reference(id));return snap.exists?snap.data():null;},
    set:(id,data)=>tx.set(reference(id),data),create:(id,data)=>tx.create(reference(id),data)
  }));
  const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  const fingerprint=offer=>digest(Buffer.from(canonical(offer)));
  const store=repository(transaction,now,{beforeIssue:async(tx,{record})=>{
    const pkg=record.package;
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(pkg.offerId))throw fault('CRM_BINDING_INVALID',409);
    const offer=await tx.get('crmOffer:'+pkg.offerId);
    const old=await tx.get('binding_'+digest(Buffer.from(pkg.packageId)));
    if(!offer||offer.status!=='Versendet'||offer.onlineAcceptance||
       (old&&(old.crmFingerprint!==fingerprint(offer)||old.recipient!==record.recipient)))throw fault('CRM_BINDING_INVALID',409);
    tx.set('binding_'+digest(Buffer.from(pkg.packageId)),{offerId:pkg.offerId,packageSha256:pkg.packageSha256,
      offerSnapshotSha256:pkg.offerSnapshotSha256,recipient:record.recipient,crmFingerprint:fingerprint(offer)});
  },beforeConsume:async(tx,{record,evidence,package:pkg})=>{
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(pkg.offerId))throw fault('CRM_BINDING_INVALID',409);
    const offer=await tx.get('crmOffer:'+pkg.offerId);
    const binding=await tx.get('binding_'+digest(Buffer.from(pkg.packageId)));
    // Binding is written only by the internal, authorised package publisher.
    if(!offer||offer.status!=='Versendet'||offer.onlineAcceptance||!binding||
       binding.offerId!==pkg.offerId||binding.packageSha256!==pkg.packageSha256||
       binding.recipient!==record.recipient||binding.crmFingerprint!==fingerprint(offer)||binding.offerSnapshotSha256!==pkg.offerSnapshotSha256)
      throw fault('CRM_BINDING_INVALID',409);
    tx.set('crmOffer:'+pkg.offerId,{...offer,onlineAcceptance:{responseId:evidence.responseId,
      packageId:pkg.packageId,packageSha256:pkg.packageSha256,acceptedAt:evidence.acceptedAt,
      state:'customer_response_recorded',reviewRequired:true,archiveState:'pending'},updatedAt:evidence.acceptedAt});
    tx.create('archive_'+evidence.responseId,{responseId:evidence.responseId,offerId:pkg.offerId,
      packageId:pkg.packageId,state:'pending',createdAt:evidence.acceptedAt,
      evidenceSha256:digest(Buffer.from(canonical(evidence)))});
  }});
  // Workers receive an ID from a trusted queue/operator, never a browser path.
  async function archiveResponse(responseId,archive){
    if(!/^response_[a-f0-9]{32}$/.test(responseId)||typeof archive?.reserveId!=='function'||typeof archive?.putVerified!=='function')
      throw fault('ARCHIVE_NOT_CONFIGURED',503);
    const id='archive_'+responseId;
    const pending=await transaction(tx=>tx.get(id));
    if(!pending)throw fault('RESPONSE_NOT_FOUND',404);
    if(pending.state==='complete')return pending.archiveFileId;
    const reserved=pending.archiveFileId||await archive.reserveId();
    const entry=await transaction(async tx=>{
      const row=await tx.get(id);if(!row)throw fault('RESPONSE_NOT_FOUND',404);
      if(row.archiveFileId)return row;
      const next={...row,archiveFileId:reserved};tx.set(id,next);return next;
    });
    const proof=await transaction(tx=>tx.get(key('response',entry.packageId)));
    const bytes=Buffer.from(canonical(proof));
    if(!proof||digest(bytes)!==entry.evidenceSha256)throw fault('EVIDENCE_INTEGRITY_FAILED',409);
    // Stable provider ID makes a lost response/restart safe to retry.
    await archive.putVerified(entry.archiveFileId,bytes,{responseId,sha256:entry.evidenceSha256});
    await transaction(async tx=>{
      const row=await tx.get(id),offer=await tx.get('crmOffer:'+entry.offerId);
      if(!row||row.archiveFileId!==entry.archiveFileId||offer?.onlineAcceptance?.responseId!==responseId)
        throw fault('CRM_BINDING_INVALID',409);
      tx.set(id,{...row,state:'complete',archivedAt:new Date(now()).toISOString()});
      tx.set('crmOffer:'+entry.offerId,{...offer,onlineAcceptance:{...offer.onlineAcceptance,
        archiveState:'complete',archiveFileId:entry.archiveFileId}});
    });
    return entry.archiveFileId;
  }
  return Object.freeze({store,transaction,archiveResponse});
}
module.exports={createDurableAcceptance};
