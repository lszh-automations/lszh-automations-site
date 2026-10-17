import {randomBytes} from 'node:crypto';

// Isolated read/write smoke probe. Every created document is synthetic and
// lives ONLY in its own probe collection, never in the offer/customer table.
const COLLECTION='lszh_synthetic_txn_smoke_v1';
const OWNER='LSZH_SYNTHETIC_TRANSACTION_TEST_ONLY';
const EXPECTED=12;
function problem(code){throw Error(code);}

export async function runSyntheticTransactionTest(db,{count=EXPECTED}={}){
  if(!db||typeof db.collection!=='function'||typeof db.runTransaction!=='function'||
     count!==EXPECTED)problem('configuration_invalid');
  const marker=randomBytes(20).toString('hex');
  const ref=db.collection(COLLECTION).doc('synthetic_'+marker);
  let created=false;
  let clean=false;
  let originalError;
  let summary;
  try{
    // create(), unlike set(), refuses to overwrite an existing document.
    await ref.create({
      owner:OWNER,synthetic:true,marker,kind:'no_customer_or_contract',
      status:'sent',revision:1,
      downstream:{make:'disabled',airtable:'disabled',pdf:'disabled',email:'disabled'}
    });
    created=true;
    // 12 simultaneous transactions against the SAME real Firestore document.
    // Each callback is side-effect-free because SDK can retry it.
    const results=await Promise.allSettled(Array.from({length:EXPECTED},()=>db.runTransaction(async tx=>{
      const snapshot=await tx.get(ref);
      if(!snapshot.exists)problem('synthetic_missing');
      const data=snapshot.data();
      if(data.owner!==OWNER||data.marker!==marker||data.synthetic!==true)
        problem('synthetic_mismatch');
      if(data.status==='accepted'&&data.revision===2)return 'already_accepted';
      if(data.status!=='sent'||data.revision!==1)problem('synthetic_changed');
      tx.update(ref,{status:'accepted',revision:2});
      return 'accepted';
    },{maxAttempts:15})));
    const accepted=results.filter(r=>r.status==='fulfilled'&&r.value==='accepted').length;
    const duplicate=results.filter(r=>r.status==='fulfilled'&&r.value==='already_accepted').length;
    const errors=results.filter(r=>r.status==='rejected').length;
    const unexpected=EXPECTED-accepted-duplicate-errors;
    const final=await ref.get();
    const data=final.data();
    if(accepted!==1||duplicate!==11||errors!==0||unexpected!==0||
       data?.owner!==OWNER||data?.marker!==marker||data?.status!=='accepted'||
       data?.revision!==2||
       data?.downstream?.email!=='disabled'||
       data?.downstream?.make!=='disabled')
      problem('transaction_check_failed');
    summary={attempts:EXPECTED,accepted,declined:duplicate};
  }catch(err){
    originalError=err;
  }finally{
    if(created){
      // Cleanup guarded by transaction, marker and unique collection.
      // Never delete a document of unknown provenance.
      try{
        const deleted=await db.runTransaction(async tx=>{
          const snapshot=await tx.get(ref);
          if(!snapshot.exists)return true;
          const d=snapshot.data();
          if(d.owner!==OWNER||d.marker!==marker||d.synthetic!==true)
            problem('cleanup_identity_mismatch');
          tx.delete(ref);
          return true;
        });
        const gone=await ref.get();
        clean=deleted===true&&!gone.exists;
      }catch{
        clean=false;
      }
    }
  }
  if(created&&!clean)problem('cleanup_failed');
  if(originalError)throw originalError;
  return summary;
}

// Simpler explicit cleanup path and no user-visible return values.
export const SYNTHETIC_COLLECTION=COLLECTION;
