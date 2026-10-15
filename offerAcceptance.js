'use strict';
const crypto = require('crypto');

// This feature is OFF by default. Do not enable until a legally approved,
// downloadable terms PDF and an immutable quote PDF are linked to each offer.
module.exports = function createOfferAcceptance(deps) {
  const BASE = 'appzJiskpAdaR1HEv';
  const TABLE = 'tbljeIUoD7wwKuSmS';
  const inFlight = new Set();
  // No production adapter exists yet. Without an injected atomic Firestore
  // commit, acceptance is always unavailable, even if old flags are set.
  const commitAtomic = typeof deps.commitAtomic === 'function' ? deps.commitAtomic : null;
  const {send, readJson, sameOrigin, rateLimited, clientIp} = deps;
  const archiveVerifier = deps.archiveVerifier || require('./offerArchiveVerifier')();
  const TOKEN_RE = /^[A-Za-z0-9_-]{32,80}$/;
  const HASH_RE = /^[a-f0-9]{64}$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function enabled() {
    const version = String(process.env.OFFER_TERMS_APPROVED_VERSION || '');
    return process.env.OFFER_ACCEPTANCE_ENABLED === 'true'
      && version.length > 0 && !/entwurf|draft|0\.9/i.test(version)
      && Boolean(process.env.OFFER_AIRTABLE_PAT)
      && Boolean(process.env.OFFER_PROOF_SALT)
      && Boolean(process.env.OFFER_DRIVE_SA_B64);
  }
  function reply(res, status, data) {
    return send(res, status, JSON.stringify(data));
  }
  function validUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' && !url.username && !url.password && url.hash === '';
    } catch { return false; }
  }
  function swissDate(date) {
    return new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Zurich', year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  }
  function sha(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
  }
  function authHeaders() {
    return {'Authorization':'Bearer ' + process.env.OFFER_AIRTABLE_PAT,
      'Content-Type':'application/json'};
  }
  function urlFor(id) {
    return 'https://api.airtable.com/v0/' + BASE + '/' + TABLE + (id ? '/' + encodeURIComponent(id) : '');
  }
  async function findOfferByToken(raw) {
    const hash = sha(raw);
    const params = new URLSearchParams({
      filterByFormula:"{Online-Annahme Token-Hash}='" + hash + "'",
      maxRecords:'2'
    });
    const r = await fetch(urlFor() + '?' + params.toString(), {
      headers:authHeaders(), signal:AbortSignal.timeout(15000)
    });
    if (!r.ok) throw Error('read_failed');
    const body = await r.json();
    if (!Array.isArray(body.records) || body.records.length !== 1) return null;
    return body.records[0];
  }
  function eligible(record) {
    const f = record.fields || {};
    const version = process.env.OFFER_TERMS_APPROVED_VERSION;
    const avvMode=f['AVV erforderlich'];
    const avvOkay=avvMode==='Nein'||(avvMode==='Ja'
      && HASH_RE.test(String(f['Online-Annahme AVV-SHA256']||''))
      && /^[A-Za-z0-9_-]{20,100}$/.test(String(f['Online-Annahme AVV Drive ID']||''))
      && typeof f['Online-Annahme AVV-Version']==='string'
      && f['Online-Annahme AVV-Version'].length>0
      && f['Online-Annahme AVV-Version'].length<=120);
    return avvOkay && f['Online-Annahme rechtlich freigegeben'] === true
      && f.Status === 'Versendet'
      && f['Vertragsunterlagen versendet'] === true
      && f['Vertragsunterlagen akzeptiert'] !== true
      && !f['Online-Annahme Zeitstempel']
      && f['Projektbedingungen Version'] === version
      && /^\d{4}-\d{2}-\d{2}$/.test(String(f['Gültig bis'] || ''))
      && f['Gültig bis'] >= swissDate(new Date())
      && f['Online-Annahme Offerten-Archivstatus'] === 'VERIFIZIERT'
      && Boolean(f['Online-Annahme Offerten-Archivprüfung am'])
      && HASH_RE.test(String(f['Online-Annahme Offerten-SHA256'] || ''))
      && HASH_RE.test(String(f['Online-Annahme Bedingungen-SHA256'] || ''))
      && /^[A-Za-z0-9_-]{20,100}$/.test(String(f['Online-Annahme Offerten Drive ID'] || ''))
      && /^[A-Za-z0-9_-]{20,100}$/.test(String(f['Online-Annahme Bedingungen Drive ID'] || ''))
      && Boolean(f['Online-Annahme Link gesendet am'])
      && typeof f.Offertennummer === 'string' && f.Offertennummer.length > 0;
  }
  function first(value) {
    return Array.isArray(value) ? String(value[0] || '') : String(value || '');
  }
  function display(record) {
    const f = record.fields;
    return {
      number:f.Offertennummer,
      company:first(f['Lead Firma']),
      service:f.Leistung || '',
      once:f['Einmalig CHF'] ?? 0,
      monthly:f['Monatlich CHF'] ?? 0,
      payment_model:f.Zahlungsmodell || '',
      valid_until:f['Gültig bis'],
      terms_version:f['Projektbedingungen Version'],
      quote_sha256:f['Online-Annahme Offerten-SHA256'],
      terms_sha256:f['Online-Annahme Bedingungen-SHA256'],
      avv_required:f['AVV erforderlich']==='Ja',
      avv_version:f['AVV erforderlich']==='Ja'?f['Online-Annahme AVV-Version']:null,
      avv_sha256:f['AVV erforderlich']==='Ja'?f['Online-Annahme AVV-SHA256']:null
    };
  }
  function allowed(req,res) {
    res.setHeader('Cache-Control','no-store');
    if (!sameOrigin(req)) { reply(res,403,{error:'forbidden'}); return false; }
    if (rateLimited(req)) { reply(res,429,{error:'rate_limited'}); return false; }
    if (!enabled()) { reply(res,503,{error:'not_available'}); return false; }
    return true;
  }
  async function preview(req,res) {
    if(!allowed(req,res)) return;
    try {
      const body=await readJson(req);
      const code=typeof body.code==='string' ? body.code : '';
      if(!TOKEN_RE.test(code)) return reply(res,404,{error:'invalid_or_expired'});
      const record=await findOfferByToken(code);
      if(!record || !eligible(record)) return reply(res,404,{error:'invalid_or_expired'});
      if(!await archiveVerifier.verify(record.fields)) return reply(res,409,{error:'archive_changed'});
      return reply(res,200,{ok:true,offer:display(record)});
    } catch(err) {
      return reply(res,502,{error:'temporarily_unavailable'});
    }
  }
  async function accept(req,res) {
    if(!allowed(req,res)) return;
    // Hard release gate: this service currently has no Firestore write adapter.
    // Never fall back to Airtable PATCH (not atomic across instances).
    if(!commitAtomic) return reply(res,503,{error:'not_available'});
    let hash=null;
    try {
      const b=await readJson(req);
      const code=typeof b.code==='string' ? b.code : '';
      const name=String(b.name || '').trim().replace(/\s+/g,' ');
      const email=String(b.email || '').trim().toLowerCase();
      if (!TOKEN_RE.test(code)) return reply(res,404,{error:'invalid_or_expired'});
      if(name.length < 4 || name.length > 120 || email.length>254 || !EMAIL_RE.test(email))
        return reply(res,400,{error:'invalid_identity'});
      if(b.authorized !== true || b.accept_terms !== true)
        return reply(res,400,{error:'consent_required'});
      hash=sha(code);
      if(inFlight.has(hash)) return reply(res,409,{error:'already_processing'});
      inFlight.add(hash);
      const record=await findOfferByToken(code);
      if(!record || !eligible(record)) return reply(res,409,{error:'already_accepted_or_expired'});
      if(!await archiveVerifier.verify(record.fields)) return reply(res,409,{error:'archive_changed'});
      const f=record.fields, offer=display(record);
      if(offer.avv_required && b.accept_avv!==true)
        return reply(res,400,{error:'consent_required'});
      if(b.quote_sha256 !== offer.quote_sha256 || b.terms_sha256 !== offer.terms_sha256
         || (offer.avv_required && b.avv_sha256 !== offer.avv_sha256))
        return reply(res,409,{error:'document_changed'});
      // The invitation is a bearer capability, not an identity verification.
      // Require the email address to match the address to which the quote was sent.
      const addressee=first(f['Lead E-Mail']).trim().toLowerCase();
      if(!addressee || email !== addressee)
        return reply(res,400,{error:'email_mismatch'});
      // Re-read the exact locked PDF bytes immediately before any atomic claim.
      // Metadata-only checks are insufficient for binding contract evidence.
      await Promise.all((offer.avv_required?['quote','terms','avv']:['quote','terms'])
        .map(which=>archiveVerifier.pdf(f,which)));
      const now=new Date(), timestamp=now.toISOString();
      const evidence={
        method:'explicit_online_b2b_consent_v1',
        offer_number:offer.number, accepted_at_utc:timestamp,
        terms_version:offer.terms_version,
        quote_pdf_sha256:offer.quote_sha256,
        terms_pdf_sha256:offer.terms_sha256,
        avv_required:offer.avv_required,
        ...(offer.avv_required ? {avv_version:offer.avv_version,
          avv_pdf_sha256:offer.avv_sha256,avv_confirmed:true}:{}),
        authorized_confirmed:true, terms_confirmed:true,
        ip_pseudonym:sha(process.env.OFFER_PROOF_SALT + ':' + clientIp(req)),
        user_agent:String(req.headers['user-agent']||'').slice(0,200)
      };
      // The injected adapter must atomically write to Firestore, then arrange
      // separate idempotent Airtable reconciliation after the transaction.
      // NO Airtable write, email or other side effect here.
      const receipt=await commitAtomic({
        offerId:record.id,tokenHash:hash,offer,
        actor:{name,email,authorized:true,acceptTerms:true,acceptAvv:offer.avv_required},
        evidence
      });
      if(!receipt || receipt.accepted!==true)throw Error('atomic_commit_failed');
      return reply(res,200,{ok:true,confirmed:true,offer_number:offer.number,confirmation_email_pending:true});
    } catch(err) {
      if(err.message==='archive_changed')return reply(res,409,{error:'archive_changed'});
      if(err.reason==='already_processed')return reply(res,409,{error:'already_accepted_or_expired'});
      return reply(res,502,{error:'temporarily_unavailable'});
    } finally {
      if(hash) inFlight.delete(hash);
    }
  }
  async function document(req,res) {
    if(!allowed(req,res))return;
    try {
      const b=await readJson(req);
      const code=typeof b.code==='string'?b.code:'';
      const which=b.which;
      if(!TOKEN_RE.test(code)||!['quote','terms','avv'].includes(which))
        return reply(res,404,{error:'invalid_or_expired'});
      const record=await findOfferByToken(code);
      if(!record||!eligible(record))
        return reply(res,404,{error:'invalid_or_expired'});
      if(which==='avv' && record.fields['AVV erforderlich']!=='Ja')
        return reply(res,404,{error:'invalid_or_expired'});
      if(!await archiveVerifier.verify(record.fields))
        return reply(res,409,{error:'archive_changed'});
      const bytes=await archiveVerifier.pdf(record.fields,which);
      const f=record.fields;
      const basename=(which==='quote'
        ? 'LSZH_Offerte_'+f.Offertennummer
        : which==='terms'
          ? 'LSZH_Projektbedingungen_'+f['Projektbedingungen Version']
          : 'LSZH_AVV_'+f.Offertennummer+'_'+f['Online-Annahme AVV-Version'])
        .replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,100);
      res.writeHead(200,{
        'Content-Type':'application/pdf',
        'Content-Length':String(bytes.length),
        'Content-Disposition':'attachment; filename="'+basename+'.pdf"',
        'Cache-Control':'no-store',
        'Pragma':'no-cache',
        'Referrer-Policy':'no-referrer',
        'X-Content-Type-Options':'nosniff',
        'X-Robots-Tag':'noindex, nofollow'
      });
      return res.end(bytes);
    } catch(err) {
      if(err.message==='archive_changed')return reply(res,409,{error:'archive_changed'});
      return reply(res,503,{error:'archive_unavailable'});
    }
  }
  return {preview,accept,document};
};
