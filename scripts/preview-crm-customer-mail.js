'use strict';

// Local-only preview with invented data. No Make, Gmail, Firestore or Cloud Run.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {EVENT_TYPES,renderMail}=require('../crm-v2/mail-templates');

const fixture={
  id:'web_00000000000000000000000000000001',
  source:'LSZH Automations Website',
  status:'Neu',
  name:'Alex Muster',
  company:'Muster GmbH',
  email:'alex.muster@beispiel.ch',
  message:'Wir moechten administrative Ablaeufe automatisieren.',
  createdAt:'2026-10-23T19:00:00Z'
};
const mail=renderMail(EVENT_TYPES.CUSTOMER_ACK,fixture);
const filename=path.join(os.tmpdir(),'lszh-crm-kundenmail-vorschau.html');
fs.writeFileSync(filename,mail.html,'utf8');
process.stdout.write('LSZH Kundenmail Vorschau: '+filename+'\n');
process.stdout.write('Nur lokale HTML-Vorschau. Keine E-Mail versendet.\n');
