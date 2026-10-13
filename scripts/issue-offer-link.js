#!/usr/bin/env node
'use strict';
const crypto = require('crypto');

// Internal operator-only tool. NOT a public endpoint.
// Usage after legal approval and approved PDF archiving:
// OFFER_AIRTABLE_PAT=... OFFER_TERMS_APPROVED_VERSION=v1.0 \
// SITE_BASE_URL=https://lszh-automations.ch node scripts/issue-offer-link.js recXXXXXXXXXXXXXX
const BASE='appzJiskpAdaR1HEv';
const TABLE='tbljeIUoD7wwKuSmS';
const REC=/^rec[A-Za-z0-9]{14}$/;
const SHA=/^[a-f0-9]{64}$/;
const id=process.argv[2];
const key=process.env.OFFER_AIRTABLE_PAT;
const termsVersion=process.env.OFFER_TERMS_APPROVED_VERSION;
const site=process.env.SITE_BASE_URL||'https://lszh-automations.ch';

function validLink(value) {
  try{const u=new URL(String(value||''));return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}
}
function fail(reason){console.error('Link nicht erstellt: '+reason);process.exit(1);}
if(!REC.test(String(id||'')))fail('ungültige Offerten-ID');
if(!key)fail('OFFER_AIRTABLE_PAT fehlt');
if(!termsVersion || /entwurf|draft|0\.9/i.test(termsVersion))fail('freigegebene Vertragsversion fehlt');
if(!validLink(site))fail('gültige SITE_BASE_URL fehlt');
const path='https://api.airtable.com/v0/'+BASE+'/'+TABLE+'/'+id;
const headers={Authorization:'Bearer '+key,'Content-Type':'application/json'};
(async()=>{
  const response=await fetch(path,{headers,signal:AbortSignal.timeout(15000)});
  if(!response.ok)fail('Offerte nicht lesbar');
  const record=await response.json(),f=record.fields||{};
  if(f.Status!=='Versendet')fail('Offerte noch nicht versendet oder bereits angenommen');
  if(f['Vertragsunterlagen versendet']!==true)fail('Vertragsunterlagen nicht als versendet bestätigt');
  if(f['Vertragsunterlagen akzeptiert']===true || f['Online-Annahme Zeitstempel'])fail('bereits angenommen');
  if(f['Projektbedingungen Version']!==termsVersion)fail('Vertragsversion stimmt nicht überein');
  if(!validLink(f['Online-Annahme Offerten-PDF']) || !validLink(f['Online-Annahme Bedingungen-PDF']))
    fail('PDF-Archivlinks fehlen oder sind nicht HTTPS');
  if(!SHA.test(String(f['Online-Annahme Offerten-SHA256']||'')) ||
     !SHA.test(String(f['Online-Annahme Bedingungen-SHA256']||'')))
    fail('geprüfte SHA-256-Dokument-Hashes fehlen');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(f['Gültig bis']||'')))fail('Gültigkeitsdatum fehlt');
  const token=crypto.randomBytes(32).toString('base64url');
  const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
  const patch=await fetch(path,{method:'PATCH',headers,signal:AbortSignal.timeout(15000),
    body:JSON.stringify({fields:{'Online-Annahme Token-Hash':tokenHash}})});
  if(!patch.ok)fail('Token-Hash konnte nicht in Airtable hinterlegt werden');
  const url=new URL('/offerte-annehmen/',site);
  url.searchParams.set('code',token);
  // Never write bearer tokens to Airtable, monitoring logs, or a website analytics system.
  console.log('Persönlicher Annahmelink (nur einmal sichtbar):');
  console.log(url.toString());
  console.log('Achtung: Erst nach juristischer Freigabe und End-to-End-Abnahme versenden.');
})().catch(()=>fail('technischer Fehler'));
