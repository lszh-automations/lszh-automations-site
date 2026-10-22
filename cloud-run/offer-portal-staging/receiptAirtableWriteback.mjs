// Existing Airtable Offerten record PATCH, invoked only when explicitly wired.
// No startup hook, scheduler, Make trigger, token storage, or Cloud Run route.
// Caller must provide a client; the imported module performs no I/O by itself.
import {prepareSyntheticAirtableAcceptanceHandoff} from './receiptAirtableHandoff.mjs';
import {isInternalTestPilot,INTERNAL_TEST_PILOT} from './internalTestPilot.mjs';

const BASE='appzJiskpAdaR1HEv';
const TABLE='tbljeIUoD7wwKuSmS';
const ROOT='https://api.airtable.com';
const EMPTY=v=>v===undefined||v===null||v==='';
const choice=v=>v && typeof v==='object' && !Array.isArray(v)?v.name:v;
function fail(reason){throw Error('synthetic_airtable_writeback_'+reason);}
const match=(left,right)=>left===right || (right===false && EMPTY(left));

// This intentionally does NOT set legal release, verified archive, Make claim,
// proof ID, sent timestamp, or a customer notification.
export async function executeSyntheticAirtableAcceptanceWriteback(acceptedOffer,{
  readRecord,patchRecord
}={}){
  const plan=prepareSyntheticAirtableAcceptanceHandoff(acceptedOffer);
  if(typeof readRecord!=='function'||typeof patchRecord!=='function')
    fail('client_required');

  const address={baseId:plan.baseId,tableId:plan.tableId,recordId:plan.recordId};
  const current=await readRecord(address);
  if(!current||current.id!==plan.recordId||!current.fields||
     typeof current.fields!=='object'||Array.isArray(current.fields))
    fail('source_mismatch');
  const fields=current.fields;
  if(acceptedOffer.source?.internalPilot && (
     !isInternalTestPilot(acceptedOffer,plan.recordId) ||
     fields['Echtbetrieb – kein Test']===true || fields['Versand freigegeben']===true ||
     JSON.stringify(fields['Lead E-Mail'])!==JSON.stringify([INTERNAL_TEST_PILOT.email]) ||
     !String(fields['Interne Notiz']||'').includes(INTERNAL_TEST_PILOT.purpose)))
    fail('internal_pilot_source_conflict');
  const number=acceptedOffer.offerNumber;
  if(fields.Offertennummer!==number ||
     fields['Online-Annahme Token-Hash']!==acceptedOffer.tokenHash ||
     choice(fields['AVV erforderlich'])!==plan.fields['AVV erforderlich'] ||
     fields['Online-Annahme rechtlich freigegeben']===true ||
     fields['Online-Annahme Bestätigung in Bearbeitung']===true ||
     !EMPTY(fields['Online-Annahme Bestätigung gesendet am']) ||
     !EMPTY(fields['Online-Annahme Beleg Drive ID']))
    fail('source_conflict');

  const identical=Object.entries(plan.fields).every(([k,v])=>
    match(choice(fields[k]),v));
  if(choice(fields.Status)==='Angenommen'){
    if(!identical)fail('already_accepted_mismatch');
    return {result:'already_identical',sourceRecordId:plan.recordId,patched:false};
  }
  // A valid *draft* already contains the verified PDF references and SHA256:
  // the Airtable->Firestore importer requires them before acceptance. Never
  // reject those fields merely for being present or silently overwrite changes.
  const documentary=['Online-Annahme Offerten Drive ID',
    'Online-Annahme Bedingungen Drive ID','Online-Annahme Offerten-SHA256',
    'Online-Annahme Bedingungen-SHA256'];
  if(plan.fields['AVV erforderlich']==='Ja')documentary.push(
    'Online-Annahme AVV Drive ID','Online-Annahme AVV-SHA256',
    'Online-Annahme AVV-Version');
  if(documentary.some(k=>fields[k]!==plan.fields[k]))
    fail('source_documents_changed');
  if(choice(fields.Status)!=='Entwurf' ||
     fields['Vertragsunterlagen akzeptiert']===true ||
     !EMPTY(fields['Online-Annahme Zeitstempel']) ||
     !EMPTY(fields['Online-Annahme Person']) ||
     !EMPTY(fields['Online-Annahme Vertragsversion']) ||
     !EMPTY(fields['Online-Annahme E-Mail']) ||
     fields['Online-Annahme AVV ausdrücklich akzeptiert']===true ||
     (plan.fields['AVV erforderlich']==='Nein' && (
       !EMPTY(fields['Online-Annahme AVV Drive ID']) ||
       !EMPTY(fields['Online-Annahme AVV-SHA256']) ||
       !EMPTY(fields['Online-Annahme AVV-Version']))))
    fail('source_conflict');

  // One PATCH, never in the Firestore claim transaction. Airtable PATCH has
  // no atomic compare-and-swap; another writer must not edit this source.
  // Every unverified/interrupted write requires reconciliation, not replay.
  const written=await patchRecord(address,{fields:plan.fields});
  if(!written||written.id!==plan.recordId||!written.fields ||
     !Object.entries(plan.fields).every(([k,v])=>match(choice(written.fields[k]),v)))
    fail('patch_unconfirmed');
  return {result:'synthetic_fields_patched',sourceRecordId:plan.recordId,
    receiptReviewKey:plan.receiptReviewKey,patched:true};
}

// A deliberately unconfigured REST client factory: secrets/fetcher are supplied
// only by a future explicitly authorised internal caller, never by this repo.
export function createSyntheticAirtableRestClient({fetcher,accessToken}={}){
  if(typeof fetcher!=='function'||typeof accessToken!=='string'||
     accessToken.length<12||/[\r\n]/.test(accessToken))
    fail('client_required');
  async function request(method,{baseId,tableId,recordId},body){
    if(baseId!==BASE||tableId!==TABLE||
       !/^rec[A-Za-z0-9]{14}$/.test(recordId||''))fail('invalid_address');
    const url=ROOT+'/v0/'+BASE+'/'+TABLE+'/'+recordId;
    const response=await fetcher(url,{
      method,redirect:'error',
      headers:{Authorization:'Bearer '+accessToken,
        'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    if(!response||!response.ok)fail('provider_request_failed');
    const result=await response.json();
    if(!result||result.id!==recordId||!result.fields||
       typeof result.fields!=='object'||Array.isArray(result.fields))
      fail('provider_response_invalid');
    return result;
  }
  return {
    readRecord:address=>request('GET',address),
    patchRecord:(address,body)=>request('PATCH',address,body)
  };
}
