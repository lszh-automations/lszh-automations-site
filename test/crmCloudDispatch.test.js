const test=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),vm=require('node:vm'),{createServer}=require('node:http');
const real=require('../cloud-run/crm-offer-links/dispatchContract.cjs');
const policy={recordId:'rec12345678901234',leadId:'rec12345678901235'},now=new Date('2026-10-21T17:00:00Z');
function source(){return{id:policy.recordId,fields:{Offerte:'Internal cloud pilot',Offertennummer:real.PILOT.number,Status:'Entwurf',Schnellaktion:'Für Versand freigeben',Versandprüfung:'BEREIT',Lead:[policy.leadId],'Lead E-Mail':[real.PILOT.email],'Lead Firma':[real.PILOT.company],'Lead Name':['Lars Schulthess'],'Lead Strasse':['Rummelmatt 8'],'Lead PLZ':['5610'],'Lead Ort':['Wohlen AG'],'Lead Land':['Schweiz'],Übernommen:true,'Interne Notiz':real.PILOT.purpose,Leistung:'Individuelle Leistung',Ausgangssituation:'Manuell',Ziel:'Ohne Rechner',Leistungsumfang:'Interne Weiterleitung','Nicht enthalten':'Kundenbetrieb','Beteiligte Systeme':'Make','Einmalig CHF':120,'Monatlich CHF':0,Zahlungsmodell:'100% bei Auftrag','Zahlungsziel Tage':30,'Gültig bis':'2026-11-20','Projektbedingungen Version':'TEST_v1.0_RC1','AVV erforderlich':'Nein'}};}
test('cloud dispatch fails closed for missing fields, recipients, expired offers and customer releases',()=>{
 const row=source();assert.equal(real.preflight(row,policy,now).ok,true);
 for(const patch of [{Ziel:''},{'Lead E-Mail':['customer@example.com']},{'Echtbetrieb – kein Test':true},{'Vertragsunterlagen versendet':true},{Übernommen:false},{Schnellaktion:null},{'Gültig bis':'2026-10-20'},{'Lead Land':[]},{'Einmalig CHF':121}]){const r=real.preflight({id:row.id,fields:{...row.fields,...patch}},policy,now);assert.equal(r.ok,false);assert.equal(JSON.parse(r.patchBody).fields.Versandstatus,'Blockiert');}
 assert.notEqual(real.fingerprint(row.fields),real.fingerprint({...row.fields,'Lead Strasse':['Andere Adresse']}));
 const html=real.offerHtml({...row.fields,Ziel:'<script>x</script>&'});assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));
});
async function fixture(){
 const {files}=await import('../scripts/offerSyntheticPdfFixtures.mjs').then(x=>x.buildFixtures());
 // Pin purely synthetic bytes in an isolated copy of the exact Make contract.
 // Runtime retains the independently verified business TEST-terms hash.
 const termsHash=real.sha(files.terms),sandbox={module:{exports:{}},require,Buffer};
 vm.runInNewContext(readFileSync('cloud-run/crm-offer-links/dispatchContract.cjs','utf8').replace(real.PILOT.termsHash,termsHash),sandbox);const c=sandbox.module.exports;
 const row=source(),meta=(id,b,folder)=>({id,mimeType:'application/pdf',size:String(b.length),sha256Checksum:c.sha(b),parents:[folder],contentRestrictions:[{readOnly:true}]});
 const quoteMeta=meta('1CLOUDQUOTEFIXTURE00000000',files.quoteNein,c.PILOT.quoteFolder),termsMeta=meta(c.PILOT.termsId,files.terms,c.PILOT.termsFolder);
 Object.assign(row.fields,{'Online-Annahme Offerten Drive ID':quoteMeta.id,'Online-Annahme Offerten-SHA256':quoteMeta.sha256Checksum,'Online-Annahme Offerten-Archivstatus':'VERIFIZIERT'});
 const args={row,policy,sourceFingerprint:c.fingerprint(row.fields),quoteMeta,quoteBase64:files.quoteNein.toString('base64'),termsMeta,termsBase64:files.terms.toString('base64'),origin:'https://lszh-crm-offer-links-ozx7mp2bka-oa.a.run.app',now};return{c,args,result:c.prepareSnapshot(args)};
}
test('snapshot binds exact source and independently read PDF bytes; random links and expiration',async()=>{
 const {c,args,result:r}=await fixture();assert.match(r.tokenHash,/^[a-f0-9]{64}$/);assert.notEqual(c.prepareSnapshot(args).tokenHash,r.tokenHash);assert.equal(c.validateSnapshot(r.snapshot,r.tokenHash,policy.recordId,now).recordId,policy.recordId);
 assert.throws(()=>c.prepareSnapshot({...args,row:{...args.row,fields:{...args.row.fields,Ziel:'Changed'}}}),/pilot_source_changed/);
 assert.throws(()=>c.prepareSnapshot({...args,quoteBase64:Buffer.from('%PDF-tampered').toString('base64')}),/pilot_archive_rejected/);
 assert.throws(()=>c.prepareSnapshot({...args,termsMeta:{...args.termsMeta,contentRestrictions:[]}}),/pilot_archive_rejected/);
 assert.throws(()=>c.validateSnapshot(r.snapshot,r.tokenHash,policy.recordId,new Date('2026-10-29T00:00:00Z')),/pilot_snapshot_rejected/);
 const corrupt=JSON.parse(JSON.stringify(r.snapshot));corrupt.documents.quote.base64=Buffer.from('%PDF-changed').toString('base64');assert.throws(()=>c.validateSnapshot(corrupt,r.tokenHash,policy.recordId,now),/pilot_snapshot_bytes_rejected/);
});
test('persistent HTTP links survive independent requests, return exact bytes, and forbid acceptance',async()=>{
 const {c,result:r}=await fixture(),{createLinkHandler,linkConfig}=await import('../cloud-run/crm-offer-links/links.mjs');assert.equal(linkConfig({}).enabled,false);assert.throws(()=>linkConfig({LSZH_CRM_LINKS_ENABLED:'true'}));
 let loads=0;const origin='https://lszh-crm-offer-links-ozx7mp2bka-oa.a.run.app',code=new URLSearchParams(new URL(r.link).hash.slice(1)).get('code');
 const handler=createLinkHandler({config:{enabled:true,origin,recordId:policy.recordId},pageHtml:readFileSync('offerte-annehmen/index.html','utf8'),clock:()=>now,validateSnapshot:c.validateSnapshot,readSnapshot:async h=>{loads++;return h===r.tokenHash?JSON.parse(JSON.stringify(r.snapshot)):null;}});
 const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,post=(path,body,requestOrigin=origin)=>fetch(base+path,{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{assert.equal((await post('/api/offer/accept',{code})).status,503);assert.equal(loads,0);assert.equal((await post('/api/offer/preview',{code},'https://evil.invalid')).status,403);assert.equal(loads,0);assert.equal((await post('/api/offer/preview',{code:'x'.repeat(43)})).status,404);for(let i=0;i<2;i++){const p=await(await post('/api/offer/preview',{code})).json();assert.equal(p.offer.number,c.PILOT.number);assert.equal(p.offer.test_accept_enabled,false);}for(const which of ['quote','terms']){const response=await post('/api/offer/document',{code,which});assert.equal(response.status,200);assert.equal(c.sha(Buffer.from(await response.arrayBuffer())),r.snapshot.offer.bundle[which].sha256);}assert.equal((await post('/api/offer/document',{code,which:'avv'})).status,404);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
