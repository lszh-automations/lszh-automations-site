'use strict';

// Static local previews only: synthetic lead, no Make, Gmail or Firestore.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {EVENT_TYPES,renderMail}=require('../crm-v2/mail-templates');

const fixture={
  id:'web_00000000000000000000000000000002',
  source:'LSZH Automations Website',
  status:'Neu',
  name:'Alex Muster',
  company:'Muster GmbH',
  email:'alex.muster@beispiel.ch',
  message:'Wir möchten unsere internen Abläufe automatisieren.\nAktuell erfolgen zahlreiche Schritte manuell.',
  createdAt:'2026-10-23T17:00:00Z'
};
for(const [kind,file] of [
  [EVENT_TYPES.INTERNAL_NEW,'lszh-crm-interne-leadmail-vorschau.html'],
  [EVENT_TYPES.INTERNAL_24H,'lszh-crm-interne-24h-vorschau.html']
]){
  const mail=renderMail(kind,fixture);
  const filename=path.join(os.tmpdir(),file);
  fs.writeFileSync(filename,mail.html,'utf8');
  process.stdout.write(kind+': '+filename+'\n');
}
process.stdout.write('Nur lokale HTML-Vorschauen, keine E-Mails versendet.\n');
