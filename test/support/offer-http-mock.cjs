'use strict';
// Only loaded by a spawned local Node test process. Never connect to real vendors.
// No production emails, Make webhooks or persistent Airtable writes.
const crypto=require('node:crypto');
const realFetch=global.fetch;
const originalToken='Z'.repeat(48);
const archiveFolder='1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in';
const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
process.env.OFFER_DRIVE_SA_B64=Buffer.from(JSON.stringify({
  client_email:'synthetic-local-only@example.invalid',
  private_key:privateKey.export({type:'pkcs8',format:'pem'})
})).toString('base64');
Object.assign(process.env,{
  OFFER_ACCEPTANCE_ENABLED:'true',
  OFFER_TERMS_APPROVED_VERSION:'v1.0',
  OFFER_AIRTABLE_PAT:'SYNTHETIC_MOCK_ONLY_NOT_REAL',
  OFFER_PROOF_SALT:'SYNTHETIC_NONPROD_SALT_ONLY',
  OFFER_DRIVE_ARCHIVE_FOLDER_ID:archiveFolder,
  SITE_PRIVATE:'false'
});
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const fileInfo={
  quote:{id:'1SyntheticOfferArchiveABC2026',body:Buffer.from('%PDF-1.4\n% STAGING OFFER SYNTHETIC\n'+ 'o'.repeat(180))},
  terms:{id:'1SyntheticTermsArchiveABC2026',body:Buffer.from('%PDF-1.4\n% STAGING TERMS SYNTHETIC\n'+ 't'.repeat(180))},
  avv:{id:'1SyntheticAVVArchiveABCDE2026',body:Buffer.from('%PDF-1.4\n% STAGING AVV A B C SYNTHETIC\n'+ 'a'.repeat(180))}
};
for(const doc of Object.values(fileInfo))doc.sha=hash(doc.body);
let avvRequired=true, failPatch=false, tamperAVV=false, sentCount=0, lastPatch=null, modifications=0;
let record={
  id:'recSYNTHETIC12345',
  fields:{
    Status:'Versendet',Offertennummer:'TEST-ONLY-HTTP-20261014',
    'AVV erforderlich':'Ja',
    'Online-Annahme rechtlich freigegeben':true, // local test flag only; never in connected Airtable
    'Vertragsunterlagen versendet':true,'Vertragsunterlagen akzeptiert':false,
    'Projektbedingungen Version':'v1.0','Gültig bis':'2099-12-31',
    'Online-Annahme Offerten-Archivstatus':'VERIFIZIERT',
    'Online-Annahme Offerten-Archivprüfung am':'2099-01-01T00:00:00Z',
    'Online-Annahme Offerten-SHA256':fileInfo.quote.sha,
    'Online-Annahme Bedingungen-SHA256':fileInfo.terms.sha,
    'Online-Annahme AVV-SHA256':fileInfo.avv.sha,
    'Online-Annahme Offerten Drive ID':fileInfo.quote.id,
    'Online-Annahme Bedingungen Drive ID':fileInfo.terms.id,
    'Online-Annahme AVV Drive ID':fileInfo.avv.id,
    'Online-Annahme AVV-Version':'TEST_ONLY_AVV_AB_C',
    'Online-Annahme Link gesendet am':'2099-01-01T00:00:00Z',
    'Lead Firma':['Synthetische Firma (keine Kunden)'],
    'Lead E-Mail':['user@example.invalid'],
    Leistung:'Synthetisches Testing','Einmalig CHF':0,'Monatlich CHF':0,
    Zahlungsmodell:'Keine reale Zahlung'
  }
};
function setMode(mode){
  avvRequired=mode==='Ja';
  record.fields['AVV erforderlich']=mode;
  if(mode!=='Ja'){
    delete record.fields['Online-Annahme AVV Drive ID'];
    delete record.fields['Online-Annahme AVV-SHA256'];
    delete record.fields['Online-Annahme AVV-Version'];
  } else {
    record.fields['Online-Annahme AVV Drive ID']=fileInfo.avv.id;
    record.fields['Online-Annahme AVV-SHA256']=fileInfo.avv.sha;
    record.fields['Online-Annahme AVV-Version']='TEST_ONLY_AVV_AB_C';
  }
  record.fields.Status='Versendet';
  record.fields['Vertragsunterlagen akzeptiert']=false;
  delete record.fields['Online-Annahme Zeitstempel'];
  delete record.fields['Online-Annahme Nachweis'];
  record.fields['Online-Annahme AVV ausdrücklich akzeptiert']=false;
  sentCount=0;lastPatch=null;
}
const json=(obj,status=200)=>Response.json(obj,{status});
global.fetch=async(input,options={})=>{
  const url=new URL(String(input));
  const host=url.hostname;
  if(host==='api.airtable.com'){
    if(options.method==='PATCH'){
      if(failPatch)return json({error:'synthetic failure'},500);
      const incoming=JSON.parse(options.body||'{}');
      if(url.pathname!== '/v0/appzJiskpAdaR1HEv/tbljeIUoD7wwKuSmS/'+record.id)
        throw Error('MOCK_WRONG_AIRTABLE_RECORD');
      record.fields={...record.fields,...incoming.fields};
      lastPatch=incoming.fields;sentCount++;return json(record);
    }
    const q=url.searchParams.get('filterByFormula')||'';
    if(!q.includes(hash(originalToken)))return json({records:[]});
    return json({records:[record]});
  }
  if(host==='oauth2.googleapis.com'){
    if(!String(options.body).includes('jwt-bearer'))throw Error('MOCK_INVALID_JWT');
    return json({access_token:'TEST_ONLY_OAUTH_ACCESS',expires_in:3600});
  }
  if(host==='www.googleapis.com'){
    const name=decodeURIComponent(url.pathname.split('/').pop());
    const doc=Object.values(fileInfo).find(d=>d.id===name);
    if(!doc)return json({error:'Not found'},404);
    if(url.searchParams.get('alt')==='media'){
      const bytes=doc.body;
      return new Response(bytes,{status:200,headers:{'Content-Type':'application/pdf','Content-Length':String(bytes.length)}});
    }
    return json({
      id:doc.id,name:'TEST_ONLY_'+(name.includes('AVV')?'AVV':name.includes('Terms')?'TERMS':'OFFER')+'.pdf',
      mimeType:'application/pdf',size:String(doc.body.length),
      sha256Checksum:doc.sha,parents:[archiveFolder],
      contentRestrictions:[{readOnly:true}],trashed:false
    });
  }
  // Only the local web server may use real fetch. No other network targets.
  if(['127.0.0.1','localhost','::1'].includes(host))return realFetch(input,options);
  throw Error('TEST_NETWORK_BLOCKED:'+host);
};
process.on('message',message=>{
  if(message.op==='mode')setMode(message.mode);
  if(message.op==='tamper')fileInfo.avv.sha=message.tamper ? '0'.repeat(64) : hash(fileInfo.avv.body);
  if(message.op==='failPatch')failPatch=!!message.value;
  if(message.op==='snapshot')process.send({kind:'snapshot',requestId:message.requestId,fields:record.fields,writes:sentCount,lastPatch,docs:Object.fromEntries(Object.entries(fileInfo).map(([kind,d])=>[kind,{sha:d.sha,id:d.id}]))});
  else if(message.op==='mode'||message.op==='tamper'||message.op==='failPatch')process.send({kind:'ack',requestId:message.requestId});
});
process.on('uncaughtException',err=>{process.stderr.write('TEST_CHILD_FATAL: '+err.message+'\n');process.exit(51)});
