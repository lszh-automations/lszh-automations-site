// Post-Firestore-commit writeback for explicitly approved real customer offers.
// No external I/O on import. Caller supplies a scoped business Airtable client.
// An uncertain PATCH returns an error for manual reconciliation, not a blind retry.
const EMPTY=v=>v===undefined||v===null||v==='';
const choice=v=>v&&typeof v==='object'&&!Array.isArray(v)?v.name:v;
function fail(reason){const e=Error('customer_airtable_'+reason);e.code=reason;throw e;}
const same=(a,b)=>choice(a)===b||(b===false&&EMPTY(a));
function oneEmail(v){
  if(Array.isArray(v)&&v.length===1&&typeof v[0]==='string')return v[0].trim().toLowerCase();
  if(typeof v==='string')return v.trim().toLowerCase();
  return '';
}
function verified(offer,fields){
  const src=offer?.source,ev=offer?.evidence,docs=offer?.bundle;
  if(src?.kind!=='LSZH_CUSTOMER_APPROVED_V1'||src.legalApproved!==true||
     src.liveApproved!==true||offer.status!=='accepted'||offer.approved!==true||
     !ev||ev.method!=='lszh_b2b_customer_v1'||
     typeof ev.accepted_at_utc!=='string'||
     Number.isNaN(Date.parse(ev.accepted_at_utc))||
     ev.offer_number!==offer.offerNumber||
     ev.email!==offer.recipientEmail||
     ev.terms_version!==offer.termsVersion||
     !['Ja','Nein'].includes(docs?.avv_required)||
     ev.quote_pdf_sha256!==docs?.quote?.sha256||
     ev.terms_pdf_sha256!==docs?.terms?.sha256||
     ev.avv_required!==(docs.avv_required==='Ja'))
    fail('invalid_accepted_source');
  if(fields.Offertennummer!==offer.offerNumber||
     fields['Online-Annahme Token-Hash']!==offer.tokenHash||
     fields['Projektbedingungen Version']!==offer.termsVersion||
     choice(fields['AVV erforderlich'])!==docs.avv_required||
     fields['Online-Annahme rechtlich freigegeben']!==true||
     fields['Echtbetrieb – kein Test']!==true||
     fields['Versand freigegeben']!==true||
     fields['Vertragsunterlagen versendet']!==true||
     oneEmail(fields['Lead E-Mail'])!==offer.recipientEmail||
     fields['Online-Annahme Offerten Drive ID']!==docs.quote.id||
     fields['Online-Annahme Offerten-SHA256']!==docs.quote.sha256||
     fields['Online-Annahme Bedingungen Drive ID']!==docs.terms.id||
     fields['Online-Annahme Bedingungen-SHA256']!==docs.terms.sha256)
    fail('changed_customer_source');
  if(docs.avv_required==='Ja'){
    if(ev.avv_confirmed!==true ||
       ev.avv_pdf_sha256!==docs.avv?.sha256 ||
       ev.avv_version!==offer.details?.avvVersion ||
       fields['Online-Annahme AVV Drive ID']!==docs.avv?.id ||
       fields['Online-Annahme AVV-SHA256']!==docs.avv?.sha256 ||
       fields['Online-Annahme AVV-Version']!==offer.details?.avvVersion)
      fail('avv_changed');
  }else if(ev.avv_confirmed!==false || ev.avv_pdf_sha256!=null ||
     ev.avv_version!=null || fields['Online-Annahme AVV Drive ID']||
     fields['Online-Annahme AVV-SHA256']||
     fields['Online-Annahme AVV-Version']||
     fields['Online-Annahme AVV ausdrücklich akzeptiert']===true)
    fail('unexpected_avv');
}
export async function executeCustomerAirtableAcceptanceWriteback(offer,{
  readRecord,patchRecord
}={}){
  const src=offer?.source;
  if(!src||src.baseId!=='appzJiskpAdaR1HEv'||
     src.tableId!=='tbljeIUoD7wwKuSmS'||
     !/^rec[A-Za-z0-9]{14}$/.test(src.recordId||''))
    fail('source_invalid');
  if(typeof readRecord!=='function'||typeof patchRecord!=='function')
    fail('client_missing');
  const addr={baseId:src.baseId,tableId:src.tableId,recordId:src.recordId};
  const current=await readRecord(addr);
  if(current?.id!==src.recordId||!current.fields||Array.isArray(current.fields))
    fail('readback_invalid');
  const f=current.fields;
  verified(offer,f);
  const ev=offer.evidence;
  const tzDay=new Intl.DateTimeFormat('sv-SE',{
    timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date(ev.accepted_at_utc));
  const fields={
    Status:'Angenommen','Angenommen am':tzDay,
    'Vertragsunterlagen akzeptiert':true,
    'Online-Annahme Zeitstempel':ev.accepted_at_utc,
    'Online-Annahme Person':ev.name,
    'Online-Annahme E-Mail':ev.email,
    'Online-Annahme Vertragsversion':offer.termsVersion,
    'Online-Annahme Nachweis':JSON.stringify(ev),
    'Online-Annahme AVV ausdrücklich akzeptiert':offer.bundle.avv_required==='Ja'
  };
  if(!ev.name||!ev.email||ev.authorized_confirmed!==true||
     ev.quote_confirmed!==true||ev.terms_confirmed!==true)
    fail('consent_invalid');
  if(choice(f.Status)==='Angenommen'){
    if(!Object.entries(fields).every(([k,v])=>same(f[k],v)))
      fail('already_accepted_mismatch');
    return {result:'already_identical',sourceRecordId:src.recordId,patched:false};
  }
  if(choice(f.Status)!=='Versendet'||
     f['Vertragsunterlagen akzeptiert']===true||
     f['Online-Annahme Zeitstempel']||
     f['Online-Annahme E-Mail']||
     f['Online-Annahme Nachweis']||
     f['Online-Annahme Bestätigung gesendet am']||
     f['Online-Annahme Beleg Drive ID']||
     f['Online-Annahme Bestätigung in Bearbeitung']===true)
    fail('source_already_changed');
  const written=await patchRecord(addr,{fields});
  if(written?.id!==src.recordId ||!written.fields ||
     !Object.entries(fields).every(([k,v])=>same(written.fields[k],v)))
    fail('patch_unconfirmed');
  return {result:'customer_fields_patched',sourceRecordId:src.recordId,patched:true};
}
