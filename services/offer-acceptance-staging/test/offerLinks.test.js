'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildOfferFragmentLink}=require('../offerLinks');
const token='A'.repeat(43);
const base={origin:'https://offers.staging.example',token,allowedOrigins:['https://offers.staging.example']};
test('generates URL fragments, never query parameters',()=>{
 const link=buildOfferFragmentLink(base);const u=new URL(link);
 assert.equal(u.origin,base.origin);assert.equal(u.pathname,'/offerte-annehmen/');
 assert.equal(u.search,'');assert.equal(u.hash,'#code='+token);
});
test('only exact preapproved trusted origins allowed',()=>{
 for(const origin of ['http://offers.staging.example','https://other.example',
  'https://offers.staging.example.evil.org','https://someone@offers.staging.example',
  'https://offers.staging.example/?code=anything','https://offers.staging.example/#bad',
  'https://offers.staging.example/untrusted']){
  assert.throws(()=>buildOfferFragmentLink({...base,origin}),/offer_origin_unapproved/);
 }
 assert.throws(()=>buildOfferFragmentLink({...base,allowedOrigins:[]}),/offer_origin_unapproved/);
});
test('only a 32-byte base64url bearer token is accepted',()=>{
 for(const candidate of ['','ABC','hello.world','A'.repeat(44),'A'.repeat(42),'A'.repeat(42)+'?']){
  assert.throws(()=>buildOfferFragmentLink({...base,token:candidate}),/invalid_offer_token/);
 }
});
