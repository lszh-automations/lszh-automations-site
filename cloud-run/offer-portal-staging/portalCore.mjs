import {createHash,createHmac} from 'node:crypto';

// Only pure domain logic here. No HTTP server, no live Airtable/Firestore writes.
// A transaction-capable store MUST enforce the claim atomically.
const TOKEN=/^[A-Za-z0-9_-]{40,80}$/;
const SHA=/^[a-f0-9]{64}$/;
const MAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID=/^[A-Za-z0-9_-]{20,100}$/;
const isoDate=v=>typeof v==='string'&&!Number.isNaN(Date.parse(v))&&
  /^\d{4}-\d{2}-\d{2}T/.test(v);
const sha=x=>createHash('sha256').update(x).digest('hex');
const SYNTHETIC_NUMBER=/^TEST[-_][A-Z0-9_-]{8,90}[-_]NO[-_]CONTRACT$/;
const SYNTHETIC_EMAIL=/^[a-z0-9._%+-]+@(?:[a-z0-9-]+\.)*example\.invalid$/;
const SYNTHETIC_SOURCE={baseId:'appzJiskpAdaR1HEv',tableId:'tbljeIUoD7wwKuSmS'};
function isSyntheticOnly(s){
  const source=s?.source, downstream=s?.downstream;
  return source?.kind==='LSZH_SYNTHETIC_ONLY' &&
    source.baseId===SYNTHETIC_SOURCE.baseId &&
    source.tableId===SYNTHETIC_SOURCE.tableId &&
    /^rec[A-Za-z0-9]{14}$/.test(source.recordId||'') &&
    SYNTHETIC_NUMBER.test(s.offerNumber||'') &&
    SYNTHETIC_EMAIL.test(s.recipientEmail||'') &&
    s.termsVersion==='TEST_v1.0_RC1' &&
    downstream?.airtable==='disabled' &&
    downstream?.proofPdf==='disabled' &&
    downstream?.email==='disabled';
}

function bad(code){const err=new Error(code);err.code=code;return err;}
function archiveShape(bundle){
  if(!bundle || typeof bundle!=='object' || Array.isArray(bundle) ||
     !['Ja','Nein'].includes(bundle.avv_required))throw bad('unavailable');
  const needed=bundle.avv_required==='Ja'?['avv','avv_required','quote','terms']:['avv_required','quote','terms'];
  if(JSON.stringify(Object.keys(bundle).sort())!==JSON.stringify(needed))throw bad('unavailable');
  for(const key of bundle.avv_required==='Ja'?['quote','terms','avv']:['quote','terms']){
    const part=bundle[key];
    if(!part || typeof part!=='object'||Array.isArray(part) ||
       !ID.test(part.id||'') || !SHA.test(part.sha256||'') ||
       JSON.stringify(Object.keys(part).sort())!==JSON.stringify(['id','sha256']))
      throw bad('unavailable');
  }
  const ids=(bundle.avv_required==='Ja'?['quote','terms','avv']:['quote','terms']).map(k=>bundle[k].id);
  if(new Set(ids).size!==ids.length)throw bad('unavailable');
}
function canonical(value) {
  if(Array.isArray(value))return value.map(canonical);
  if(value && typeof value==='object' && Object.getPrototypeOf(value)===Object.prototype)
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
export function offerFingerprint(s){
  // Canonical comparison also detects changed PDF/recipient/version, regardless
  // of Firestore object key order or whether writers incremented a revision.
  return sha(JSON.stringify(canonical([
    s.tokenHash,s.status,s.approved,s.revision,s.termsVersion,s.expiresAt,
    s.recipientEmail,s.offerNumber,s.bundle,s.details,s.source,s.downstream
  ])));
}
function validateOffer(s,tokenHash,now,approvedVersion){
  if(!s || s.tokenHash!==tokenHash || !SHA.test(s.tokenHash||'') ||
     s.status!=='sent' || s.approved!==true ||
     !Number.isSafeInteger(s.revision)||s.revision<1 ||
     typeof s.termsVersion!=='string'||s.termsVersion!==approvedVersion||
     !isoDate(s.expiresAt)||new Date(s.expiresAt).getTime()<now.getTime() ||
     !MAIL.test(s.recipientEmail||'') || s.recipientEmail!==s.recipientEmail.toLowerCase() ||
     typeof s.offerNumber!=='string'||s.offerNumber.length<3||s.offerNumber.length>100 ||
     !s.details || typeof s.details!=='object' ||Array.isArray(s.details))
    throw bad('unavailable');
  archiveShape(s.bundle);
  return offerFingerprint(s);
}
function consent(offer,b){
  if(!b||typeof b!=='object'||Array.isArray(b))throw bad('invalid_request');
  const expected=offer.bundle;
  const name=typeof b.name==='string'?b.name.trim().replace(/\s+/g,' '):'';
  const email=typeof b.email==='string'?b.email.trim().toLowerCase():'';
  if(name.length<4||name.length>120||email.length>254||!MAIL.test(email))
    throw bad('invalid_identity');
  if(email!==offer.recipientEmail)throw bad('invalid_identity');
  if(b.authorized!==true||b.accept_terms!==true)throw bad('consent_required');
  if(b.quote_sha256!==expected.quote.sha256||
     b.terms_sha256!==expected.terms.sha256)throw bad('document_changed');
  if(expected.avv_required==='Ja'){
    if(b.accept_avv!==true)throw bad('avv_consent_required');
    if(b.avv_sha256!==expected.avv.sha256 ||
       (b.avv_version!=null && b.avv_version!==offer.details.avvVersion))
      throw bad('document_changed');
  }else if(b.accept_avv===true || b.avv_sha256!=null || b.avv_version!=null)
    // The browser explicitly sends null for unused AVV fields.
    throw bad('unexpected_avv_consent');
  return {name,email,avv:expected.avv_required==='Ja'};
}
export function createOfferPortal({store,verifyBundle,readPdf,clock=()=>new Date(),approvedVersion,
  proofSalt,syntheticOnly=false}={}){
  if(!store||typeof store.get!=='function'||typeof store.claim!=='function'||
    typeof verifyBundle!=='function'||
    (readPdf!==undefined && typeof readPdf!=='function') ||
    typeof approvedVersion!=='string'||
    !approvedVersion||typeof proofSalt!=='string'||proofSalt.length<16 ||
    typeof syntheticOnly!=='boolean')
    throw Error('portal_not_configured');
  async function offerFor(code){
    if(typeof code!=='string'||!TOKEN.test(code))throw bad('unavailable');
    const tokenHash=sha(code);
    const offer=await store.get(tokenHash);
    const now=clock();if(!(now instanceof Date)||Number.isNaN(now.valueOf()))throw bad('unavailable');
    const fingerprint=validateOffer(offer,tokenHash,now,approvedVersion);
    if(syntheticOnly && !isSyntheticOnly(offer))throw bad('unavailable');
    return {offer,tokenHash,fingerprint,now};
  }
  async function preview(code){
    const {offer}=await offerFor(code);
    if(await verifyBundle(offer.bundle)!==true)throw bad('archive_changed');
    // Never expose email, archive file IDs, internal datastore IDs or token hash.
    // Keep the established browser form contract: flat, display-only fields.
    // Existing domain/API consumers may still use details and expires_at.
    return {number:offer.offerNumber,test_only:syntheticOnly,
      details:offer.details,
      company:String(offer.details.company||''),
      service:String(offer.details.service||''),
      once:offer.details.onceCHF??0,monthly:offer.details.monthlyCHF??0,
      payment_model:String(offer.details.paymentModel||''),
      valid_until:offer.expiresAt.slice(0,10),
      terms_version:offer.termsVersion,expires_at:offer.expiresAt,
      quote_sha256:offer.bundle.quote.sha256,
      terms_sha256:offer.bundle.terms.sha256,
      avv_required:offer.bundle.avv_required==='Ja',
      avv_version:offer.bundle.avv_required==='Ja'?(offer.details.avvVersion??null):null,
      avv_sha256:offer.bundle.avv_required==='Ja'?offer.bundle.avv.sha256:null};
  }
  async function accept(code,input,{ip=''}={}){
    const {offer,tokenHash,fingerprint,now}=await offerFor(code);
    const {name,email,avv}=consent(offer,input);
    // External Drive I/O happens BEFORE, never inside the Firestore transaction.
    if(await verifyBundle(offer.bundle)!==true)throw bad('archive_changed');
    const evidence={
      method:'lszh_b2b_staging_v1',offer_number:offer.offerNumber,
      accepted_at_utc:now.toISOString(),terms_version:offer.termsVersion,
      quote_pdf_sha256:offer.bundle.quote.sha256,
      terms_pdf_sha256:offer.bundle.terms.sha256,
      avv_required:avv,
      avv_pdf_sha256:avv?offer.bundle.avv.sha256:null,
      authorized_confirmed:true,terms_confirmed:true,avv_confirmed:avv,
      name,email,
      ip_pseudonym:createHmac('sha256',proofSalt).update(String(ip).slice(0,128)).digest('hex')
    };
    // This MUST compare the previously read fingerprint with transaction-time
    // state and commit ONCE, even across multiple Cloud Run instances.
    const result=await store.claim(tokenHash,fingerprint,evidence,now);
    if(result==='already_accepted')throw bad('already_accepted');
    if(result!=='accepted')throw bad('offer_changed');
    // This prototype has NO live delivery or legal approval. Match the
    // existing browser response contract without promising an email.
    return {ok:true,accepted:true,test_only:true,offer_number:offer.offerNumber,
      confirmation_email_pending:false};
  }
  // Documents are never looked up from a caller-supplied Drive ID.
  // Offer eligibility, expiry, approval and invitation token are checked again
  // for every download; 'avv' is only offered when expressly required.
  async function document(code,which){
    const {offer}=await offerFor(code);
    if(!['quote','terms','avv'].includes(which) ||
       (which==='avv' && offer.bundle.avv_required!=='Ja'))
      throw bad('unavailable');
    if(typeof readPdf!=='function')throw bad('temporarily_unavailable');
    let bytes;
    try{
      bytes=await readPdf(offer.bundle,which);
    }catch(err){
      // The keyless archive reader uses ordinary Error(message). Convert only
      // this known integrity failure into the public domain error. All other
      // internals must remain a generic 503 without diagnostic disclosure.
      if(err?.message==='archive_changed')throw bad('archive_changed');
      throw err;
    }
    if(!Buffer.isBuffer(bytes)||bytes.length<8||bytes.length>12*1024*1024 ||
       bytes.subarray(0,5).toString('ascii')!=='%PDF-')
      throw bad('archive_changed');
    const expected=offer.bundle[which].sha256;
    if(sha(bytes)!==expected)throw bad('archive_changed');
    // A bounded in-memory blob is returned only after bytes+SHA256 validation.
    return {bytes,which,
      number:offer.offerNumber,
      version:which==='terms'?offer.termsVersion:
        which==='avv'?String(offer.details.avvVersion||''):''};
  }
  return {preview,accept,document};
}
