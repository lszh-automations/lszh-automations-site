'use strict';

// Fully local, loopback-only CRM preview. No Google login, no Firestore, no Make.
// Uses the existing CRM interface and a separate local JSON file containing test data.
// NEVER deploy this server as a public service or use it with real customer information.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const HOST = '127.0.0.1';
const PORT = Number(process.env.LOCAL_CRM_PORT || 8765);
const DIR = process.env.LSZH_LOCAL_PREVIEW_DIR ? path.resolve(process.env.LSZH_LOCAL_PREVIEW_DIR) : path.join(__dirname, '.local-preview');
const FILE = path.join(DIR, 'data.json');
const UI = path.join(__dirname, 'public', 'index.html');
const LIVE_BOOT=crypto.randomUUID();
function liveVersion(){
  const stat=fs.statSync(UI);
  // Version changes when HTML changes or Node restarts after server code changes.
  return LIVE_BOOT+':'+stat.mtimeMs+':'+stat.size;
}
const TABLES = ['leads', 'kunden', 'offerten', 'rechnungen', 'projekte'];
const REQUIRED = {
  leads: ['name', 'company', 'email', 'street', 'postalCode', 'city', 'country'],
  kunden: ['company'],
  offerten: ['title'],
  rechnungen: ['description'],
  projekte: ['title']
};
const FIELDS = {
  leads: ['name','company','email','street','postalCode','city','country','message','currentProcess','systems','mainProblem','frequency','desiredResult','status'],
  kunden: ['company','contactName','email','street','postalCode','city','country','notes','status'],
  offerten: ['leadId','customerId','title','description','oneTimeCHF','monthlyCHF','validUntil','status'],
  rechnungen: ['customerId','projectId','description','amountCHF','dueDate','status'],
  projekte: ['customerId','offerId','title','description','dueDate','status']
};
const STATUSES = {
  leads: ['Neu','In Prüfung','Qualifiziert','Verloren'],
  kunden: ['Aktiv','Inaktiv'],
  offerten: ['Entwurf','Bereit','Versendet','Angenommen','Abgelehnt'],
  rechnungen: ['Entwurf','Offen','Bezahlt','Storniert'],
  projekte: ['Geplant','In Arbeit','Wartet auf Kunde','Abgeschlossen']
};
const MONEY = new Set(['oneTimeCHF','monthlyCHF','amountCHF']);

function seedData() {
  const t = new Date().toISOString();
  return {
    version: 1,
    nextOffer: 1001,
    nextInvoice: 1001,
    leads: [
      {
        id:'test-lead-1',name:'Max Muster',company:'Muster Sanitär AG',email:'max.muster@example.com',
        street:'Musterstrasse 12',postalCode:'5610',city:'Wohlen',country:'Schweiz',
        message:'TEST: Manuelle Offerten sollen automatisiert werden.',
        currentProcess:'TEST: Kundenanfrage per E-Mail, anschliessend Excel.',
        systems:'Excel, Outlook',mainProblem:'Hoher Zeitaufwand',frequency:'Täglich',
        desiredResult:'Automatisierte Offertenerstellung',status:'Neu',createdAt:t,updatedAt:t
      },
      {
        id:'test-lead-2',name:'Anna Beispiel',company:'Beispiel Coiffeur GmbH',email:'anna@example.com',
        street:'Beispielweg 4',postalCode:'8001',city:'Zürich',country:'Schweiz',
        message:'TEST: Termine besser organisieren.',
        currentProcess:'TEST: Buchungen per Telefon.',systems:'Kalender',
        mainProblem:'Fehlende Übersicht',frequency:'Mehrmals täglich',
        desiredResult:'Terminübersicht',status:'Qualifiziert',createdAt:t,updatedAt:t
      }
    ],
    kunden: [
      {id:'test-customer-1',company:'Demo Büro AG',contactName:'Eva Beispiel',
        email:'eva.demo@example.com',street:'Demostrasse 3',
        postalCode:'5000',city:'Aarau',country:'Schweiz',notes:'TESTDATENSATZ',
        status:'Aktiv',createdAt:t,updatedAt:t}
    ],
    offerten: [
      {id:'test-offer-1',number:'1000',leadId:'',customerId:'test-customer-1',
        title:'TEST: Büroautomation',description:'TESTENTWURF – keine echte Kundenofferte.',
        oneTimeCHF:1200,monthlyCHF:199,validUntil:'',status:'Entwurf',createdAt:t,updatedAt:t}
    ],
    rechnungen: [
      {id:'test-invoice-1',number:'RE-1000',customerId:'test-customer-1',
        projectId:'',description:'TEST: Musterrechnung – nicht versenden.',
        amountCHF:199,dueDate:'',status:'Entwurf',createdAt:t,updatedAt:t}
    ],
    projekte: [
      {id:'test-project-1',customerId:'test-customer-1',offerId:'test-offer-1',
        title:'TEST: Musterprojekt',description:'Nur für die lokale CRM-Vorschau.',
        dueDate:'',status:'Geplant',createdAt:t,updatedAt:t}
    ]
  };
}
// One-time fixture repair: old preview versions linked a demo offer/customer to
// an unqualified Muster Sanitär lead. Only update the four ORIGINAL, untouched
// demo fixtures; any user edits or new entries remain intact.
function reconcileDemoFixtures(data){
  if(data.demoFixtureRevision===2)return data;
  const customer=data.kunden.find(x=>x.id==='test-customer-1');
  const offer=data.offerten.find(x=>x.id==='test-offer-1');
  const invoice=data.rechnungen.find(x=>x.id==='test-invoice-1');
  const project=data.projekte.find(x=>x.id==='test-project-1');
  const lead=data.leads.find(x=>x.id==='test-lead-1');
  const pristine=lead && ['Neu','In Prüfung'].includes(lead.status) &&
    customer?.company==='Muster Sanitär AG' &&
    customer.contactName==='Max Muster' && customer.email==='max.muster@example.com' &&
    customer.street==='Musterstrasse 12' && customer.postalCode==='5610' &&
    customer.city==='Wohlen' && customer.country==='Schweiz' &&
    customer.status==='Aktiv' && customer.notes==='TESTDATENSATZ' &&
    offer?.leadId==='test-lead-1' && offer.customerId==='test-customer-1' &&
    offer.number==='1000' && offer.title==='TEST: Offertenautomation' &&
    offer.description==='TESTENTWURF – keine echte Kundenofferte.' &&
    offer.oneTimeCHF===1200 && offer.monthlyCHF===199 && offer.status==='Entwurf' &&
    invoice?.customerId==='test-customer-1' && invoice.id==='test-invoice-1' &&
    invoice.status==='Entwurf' && invoice.amountCHF===199 &&
    project?.customerId==='test-customer-1' && project.offerId==='test-offer-1' &&
    project.status==='Geplant' && project.title==='TEST: Musterprojekt' &&
    !data.offerten.some(x=>x.id!=='test-offer-1' && x.leadId==='test-lead-1') &&
    !data.offerten.some(x=>x.id!=='test-offer-1' && x.customerId==='test-customer-1') &&
    !data.rechnungen.some(x=>x.id!=='test-invoice-1' && x.customerId==='test-customer-1') &&
    !data.projekte.some(x=>x.id!=='test-project-1' && x.customerId==='test-customer-1');
  if(!pristine)return data; // Never change user-modified fixtures.
  Object.assign(customer,{
    company:'Demo Büro AG',contactName:'Eva Beispiel',email:'eva.demo@example.com',
    street:'Demostrasse 3',postalCode:'5000',city:'Aarau',country:'Schweiz'
  });
  offer.leadId='';
  offer.title='TEST: Büroautomation';
  data.demoFixtureRevision=2;
  save(data);
  console.log('Lokale Testdaten einmalig bereinigt: Muster Sanitär hat keine vorab erzeugte Offerte mehr.');
  return data;
}
function store() {
  if(!fs.existsSync(FILE)) {
    fs.mkdirSync(DIR,{recursive:true,mode:0o700});
    const initial=seedData();
    save(initial);
    return initial;
  }
  const data=JSON.parse(fs.readFileSync(FILE,'utf8'));
  if(data.version!==1 || TABLES.some(k=>!Array.isArray(data[k])))
    throw new Error('Lokale CRM-Testdatei hat ein unbekanntes Format; sie wurde nicht überschrieben.');
  return reconcileDemoFixtures(data);
}
function save(data) {
  fs.mkdirSync(DIR,{recursive:true,mode:0o700});
  const tmp=FILE+'.'+crypto.randomUUID()+'.tmp';
  try {
    fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{encoding:'utf8',mode:0o600});
    fs.renameSync(tmp,FILE);
  }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
function reply(res,status,body,type='application/json; charset=utf-8'){
  res.writeHead(status,{
    'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; object-src 'none'"
  });
  res.end(type.startsWith('application/json')?JSON.stringify(body):body);
}
function error(message,status=400){return Object.assign(new Error(message),{status});}
async function jsonBody(req) {
  let size=0;
  const chunks=[];
  for await(const chunk of req){
    size+=chunk.length;
    if(size>32768)throw error('Anfrage zu gross',413);
    chunks.push(chunk);
  }
  let body;
  try { body=JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch {throw error('Ungültiges JSON');}
  if(!body || typeof body!=='object' || Array.isArray(body))throw error('Ungültige Felder');
  return body;
}
function clean(table,input) {
  const out={};
  for(const key of FIELDS[table]) {
    if(!Object.prototype.hasOwnProperty.call(input,key))continue;
    const v=input[key];
    if(MONEY.has(key)) {
      if(v===null || v===''){out[key]=null;continue;}
      const n=Number(v);
      if(!Number.isFinite(n)||n<0||n>100000000)throw error('Ungültiger Betrag: '+key);
      out[key]=n;
    }else{
      if(typeof v!=='string'||v.length>5000)throw error('Ungültiges Feld: '+key);
      out[key]=v.trim();
    }
    if(key==='status' && out[key] && !STATUSES[table].includes(out[key]))
      throw error('Ungültiger Status');
    if(key==='email' && out[key] && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out[key]))
      throw error('Ungültige E-Mail');
  }
  return out;
}
function validate(table,record){
  const missing=REQUIRED[table].filter(k=>!String(record[k]??'').trim());
  if(missing.length)throw error('Pflichtfeld fehlt: '+missing.join(', '));
}
function previewHtml(){
  let html=fs.readFileSync(UI,'utf8');
  const loginAnchor="const config=await api('/api/config');";
  const logoutAnchor="google.accounts.id.disableAutoSelect();";
  if(!html.includes(loginAnchor)||!html.includes(logoutAnchor))
    throw new Error('CRM-Oberfläche hat sich geändert – lokale Vorschau bitte aktualisieren.');
  html=html.replace('<script src="https://accounts.google.com/gsi/client" async defer></script>','');
  html=html.replace(loginAnchor,loginAnchor+"\n    if(config.localDemo){await signedIn('local-demo');return;}");
  html=html.replace(logoutAnchor,"window.google?.accounts?.id?.disableAutoSelect?.();");
  html=html.replace("state.token='';state.records={};$('workspace').hidden=true;$('signin').hidden=false;","window.location.reload();return;");
  html=html.replace('<button class="btn" id="logout">Abmelden</button>','<button class="btn" id="logout">Neu laden</button>');
  html=html.replace('<title>LSZH CRM – Intern</title>','<title>LSZH CRM – Lokale Testversion</title>');
  html=html.replace('<main>\n    <div class="head">',
    '<main>\n    <div role="status" style="margin-bottom:20px;padding:13px 17px;border:1px solid #d4aa65;border-radius:12px;background:#392b1b;color:#ffe3ae;font-weight:750">LOKALE TESTVERSION · Nur Beispieldaten · Keine Verbindung zu Firestore, Make oder der öffentlichen Website</div>\n    <div class="head">');
  html=html.replace('Alle neuen Anfragen aus dem Website-Formular.','Lokale Beispieldaten – keine echten Website-Anfragen.');
  html=html.replace('Alle Daten werden serverseitig gespeichert.','Testdaten werden nur auf diesem Computer gespeichert.');
  if(process.env.LSZH_LIVE_PREVIEW==='1'){
    const startVersion=JSON.stringify(liveVersion());
    const reloadClient=String.raw`
<script>
(function(){
  // The live preview runs on localhost only. Never enable these routes in production.
  let version=START_VERSION;
  let checking=false;
  async function checkForChanges(){
    if(checking)return;
    checking=true;
    try {
      const res=await fetch('/__live/version',{cache:'no-store'});
      if(!res.ok)throw Error('offline');
      const data=await res.json();
      if(data.version!==version){window.location.reload();return;}
    } catch {
      // During a Node --watch restart the server is briefly unavailable.
      // The next successful check will compare against the previous version.
    } finally { checking=false; }
  }
  window.setInterval(checkForChanges,1400);
})();
</script>`.replace('START_VERSION',startVersion);
    html=html.replace('</body>',reloadClient+'</body>');
  }
  return html;
}
async function handle(req,res){
  const url=new URL(req.url,'http://127.0.0.1');
  if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){
    return reply(res,200,previewHtml(),'text/html; charset=utf-8');
  }
  if(req.method==='GET'&&url.pathname==='/__live/version'&&process.env.LSZH_LIVE_PREVIEW==='1')
    return reply(res,200,{version:liveVersion()});
  if(req.method==='GET'&&url.pathname==='/api/config')return reply(res,200,{localDemo:true});
  if(req.method==='GET'&&url.pathname==='/api/me')return reply(res,200,{email:'Lokale Testversion'});
  const parts=url.pathname.split('/').filter(Boolean);
  if(parts[0]!=='api'||parts[1]!=='records'||parts.length>4||!TABLES.includes(parts[2]))
    return reply(res,404,{error:'Nicht gefunden'});
  const tab=parts[2],id=parts[3];
  const db=store();
  if(req.method==='GET'&&!id){
    return reply(res,200,{records:[...db[tab]].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))});
  }
  if(!['POST','PATCH'].includes(req.method))return reply(res,405,{error:'Methode nicht erlaubt'});
  if(req.headers.origin&&req.headers.origin!=='http://'+HOST+':'+PORT)
    return reply(res,403,{error:'Unzulässiger Ursprung'});
  const body=await jsonBody(req);
  if(req.method==='POST'&&!id){
    const data=clean(tab,body);
    validate(tab,data);
    if(tab==='offerten' && data.leadId){
      const lead=db.leads.find(x=>x.id===data.leadId);
      if(!lead)throw error('Verknüpfter Lead nicht gefunden');
      if(lead.status!=='Qualifiziert')
        throw error('Lead zuerst qualifizieren, bevor eine Offerte erstellt wird');
    }
    const now=new Date().toISOString();
    const record={...data,id:'local-'+crypto.randomUUID(),status:data.status||STATUSES[tab][0],createdAt:now,updatedAt:now};
    if(tab==='offerten')record.number=String(db.nextOffer++);
    if(tab==='rechnungen')record.number='RE-'+String(db.nextInvoice++);
    db[tab].push(record);save(db);
    return reply(res,201,{record});
  }
  if(req.method==='PATCH'&&id){
    const idx=db[tab].findIndex(r=>r.id===id);
    if(idx<0)return reply(res,404,{error:'Eintrag nicht gefunden'});
    const updates=clean(tab,body);
    if(!Object.keys(updates).length)throw error('Keine Änderung');
    const record={...db[tab][idx],...updates,updatedAt:new Date().toISOString()};
    validate(tab,record);
    db[tab][idx]=record;save(db);
    return reply(res,200,{record});
  }
  return reply(res,405,{error:'Methode nicht erlaubt'});
}
function createApp(){
  return http.createServer((req,res)=>{
    handle(req,res).catch(err=>{
      if(!err.status)console.error('Local preview error:',err.message);
      reply(res,err.status||500,{error:err.status?err.message:'Interner Fehler'});
    });
  });
}
if(require.main===module) {
  const server=createApp();
  server.on('error',err=>{
    console.error('Lokale CRM-Vorschau konnte nicht starten:',err.message);
    process.exitCode=1;
  });
  server.listen(PORT,HOST,()=>{
    console.log('LSZH CRM – LOKALE TESTVERSION');
    console.log('Öffnen: http://'+HOST+':'+PORT);
    console.log('Daten: crm-v2/.local-preview/data.json');
    console.log('NUR TESTDATEN – keine Verbindung zu produktiven Systemen.');
    console.log('Beenden: Strg + C');
  });
}
module.exports={createApp,seedData,clean,validate};
