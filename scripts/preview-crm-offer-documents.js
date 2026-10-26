'use strict';
// Build customer-facing sample files without credentials, production data,
// Firestore writes, Make calls, Gmail sends or any Cloud Run changes.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {makePdf}=require('../crm-v2/offer-pdf');
const {renderOfferEmail}=require('../crm-v2/offer-mail');
const plusDays=(days)=>{
  const d=new Date();d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
};
const today=new Date().toISOString();
const sample={
  number:'999999',title:'Beispiel: Automatisierung der Kundenanfragen',
  createdAt:today,validUntil:plusDays(30),
  description:'Konzeption und Einrichtung einer automatisierten Erfassung und Bearbeitung von Kundenanfragen.\nDie Leistungen werden gemeinsam abgestimmt.',
  items:[
    {title:'Analyse, Konzeption und Einrichtung',qty:1,unitPriceCHF:850,mode:'einmalig'},
    {title:'Monatliche Betreuung und Support',qty:1,unitPriceCHF:149,mode:'monatlich'}
  ]
};
const recipient={
  company:'Muster AG',name:'Max Muster',email:'max.muster@example.ch',
  street:'Musterstrasse 12',postalCode:'5610',city:'Wohlen',country:'Schweiz'
};
const dir=path.join(os.tmpdir(),'lszh-offerten-vorschau');
fs.mkdirSync(dir,{recursive:true});
const pdf=path.join(dir,'VORSCHAU-LSZH-Offerte-999999.pdf');
const html=path.join(dir,'VORSCHAU-LSZH-Kundenmail-999999.html');
fs.writeFileSync(pdf,makePdf(sample,recipient));
fs.writeFileSync(html,renderOfferEmail(sample,recipient).html,'utf8');
console.log('SYNTHETISCHE VORSCHAU: KEINE echte Offerte, kein Versand.');
console.log('PDF:',pdf);
console.log('E-Mail-Vorschau:',html);
console.log('Geprueft werden sollen Adressdaten, Branding, Preise, Schriftbild und Unverbindlichkeitsvermerk.');
