'use strict';
const crypto = require('crypto');

// This feature is OFF by default. Do not enable until a legally approved,
// downloadable terms PDF and an immutable quote PDF are linked to each offer.
module.exports = function createOfferAcceptance(deps) {
  const BASE = 'appzJiskpAdaR1HEv';
  const TABLE = 'tbljeIUoD7wwKuSmS';
  const inFlight = new Set();
  const {send, readJson, sameOrigin, rateLimited, clientIp} = deps;
  const TOKEN_RE = /^[A-Za-z0-9_-]{32,80}$/;
  const HASH_RE = /^[a-f0-9]{64}$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function enabled() {
    const version = String(process.env.OFFER_TERMS_APPROVED_VERSION || '');
    return process.env.OFFER_ACCEPTANCE_ENABLED === 'true'
      && version.length > 0 && !/entwurf|draft|0\.9/i.test(version)
      && Boolean(process.env.OFFER_AIRTABLE_PAT)
      && Boolean(process.env.OFFER_PROOF_SALT)
      && Boolean(process.env.OFFER_CONFIRMATION_WEBHOOK);
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
    return f.Status === 'Versendet'
      && f['Vertragsunterlagen versendet'] === true
      && f['Vertragsunterlagen akzeptiert'] !== true
      && !f['Online-Annahme Zeitstempel']
      && f['Projektbedingungen Version'] === version
      && /^\d{4}-\d{2}-\d{2}$/.test(String(f['Gültig bis'] || ''))
      && f['Gültig bis'] >= swissDate(new Date())
      && validUrl(f['Online-Annahme Offerten-PDF'])
      && validUrl(f['Online-Annahme Bedingungen-PDF'])
      && HASH_RE.test(String(f['Online-Annahme Offerten-SHA256'] || ''))
      && HASH_RE.test(String(f['Online-Annahme Bedingungen-SHA256'] || ''))
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
      quote_pdf:f['Online-Annahme Offerten-PDF'],
      terms_pdf:f['Online-Annahme Bedingungen-PDF'],
      quote_sha256:f['Online-Annahme Offerten-SHA256'],
      terms_sha256:f['Online-Annahme Bedingungen-SHA256']
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
      return reply(res,200,{ok:true,offer:display(record)});
    } catch(err) {
      return reply(res,502,{error:'temporarily_unavailable'});
    }
  }
  async function accept(req,res) {
    if(!allowed(req,res)) return;
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
      const f=record.fields, offer=display(record);
      if(b.quote_sha256 !== offer.quote_sha256 || b.terms_sha256 !== offer.terms_sha256)
        return reply(res,409,{error:'document_changed'});
      // The invitation is a bearer capability, not an identity verification.
      // Require the email address to match the address to which the quote was sent.
      const addressee=first(f['Lead E-Mail']).trim().toLowerCase();
      if(!addressee || email !== addressee)
        return reply(res,400,{error:'email_mismatch'});
      const now=new Date(), timestamp=now.toISOString();
      const evidence={
        method:'explicit_online_b2b_consent_v1',
        offer_number:offer.number, accepted_at_utc:timestamp,
        terms_version:offer.terms_version,
        quote_pdf_sha256:offer.quote_sha256,
        terms_pdf_sha256:offer.terms_sha256,
        authorized_confirmed:true, terms_confirmed:true,
        ip_pseudonym:sha(process.env.OFFER_PROOF_SALT + ':' + clientIp(req)),
        user_agent:String(req.headers['user-agent']||'').slice(0,200)
      };
      const update={
        fields:{
          'Status':'Angenommen',
          'Angenommen am':swissDate(now),
          'Vertragsunterlagen akzeptiert':true,
          'Online-Annahme Zeitstempel':timestamp,
          'Online-Annahme Person':name,
          'Online-Annahme E-Mail':email,
          'Online-Annahme Vertragsversion':offer.terms_version,
          'Online-Annahme Nachweis':JSON.stringify(evidence)
        }
      };
      const r=await fetch(urlFor(record.id),{
        method:'PATCH', headers:authHeaders(), body:JSON.stringify(update),
        signal:AbortSignal.timeout(15000)
      });
      if(!r.ok) throw Error('write_failed');
      let mailPending=false;
      try {
        const response=await fetch(process.env.OFFER_CONFIRMATION_WEBHOOK,{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            event:'online_offer_accepted',record_id:record.id,
            offer_number:offer.number,company:offer.company,
            name,email,accepted_at_utc:timestamp,
            terms_version:offer.terms_version,
            quote_pdf:offer.quote_pdf,terms_pdf:offer.terms_pdf
          }),signal:AbortSignal.timeout(15000)
        });
        mailPending=!response.ok;
      } catch { mailPending=true; }
      return reply(res,200,{ok:true,confirmed:true,offer_number:offer.number,confirmation_email_pending:mailPending});
    } catch(err) {
      return reply(res,502,{error:'temporarily_unavailable'});
    } finally {
      if(hash) inFlight.delete(hash);
    }
  }
  return {preview,accept};
};
