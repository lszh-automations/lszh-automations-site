'use strict';
// Pure helper for a future, explicitly approved Firestore-backed token issuer.
// NEVER issues tokens, persists state, performs IO or sends email.
const crypto=require('node:crypto');
const TOKEN_RE=/^[A-Za-z0-9_-]{43}$/; // 32 secure random bytes encoded as base64url
function buildOfferFragmentLink({origin,token,allowedOrigins}={}){
  if(!TOKEN_RE.test(String(token||'')))throw Error('invalid_offer_token');
  if(!Array.isArray(allowedOrigins)||allowedOrigins.length===0)
    throw Error('offer_origin_unapproved');
  let url;
  try{url=new URL(String(origin||''));}
  catch{throw Error('offer_origin_unapproved');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
    (url.pathname!=='/'&&url.pathname!=='')||
    !allowedOrigins.includes(url.origin))throw Error('offer_origin_unapproved');
  url.pathname='/offerte-annehmen/';
  url.hash=new URLSearchParams({code:token}).toString();
  return url.toString();
}
module.exports={buildOfferFragmentLink};
