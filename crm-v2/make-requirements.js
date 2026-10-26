'use strict';
const {createHash}=require('node:crypto');
const MAKE_REQUIREMENTS_VERSION='MAKE_CUSTOMER_ORGANISATION_v1_20261026';
const title='Ihr Make-Konto und die Einrichtung';
const displayVersion='Version 1 vom 26.10.2026';
const paragraphs=Object.freeze([
 'Die Umsetzung erfolgt in Ihrer eigenen Make-Organisation. Dafür benötigen Sie ein eigenes Make-Konto. Nach der schriftlichen Auftragsbestätigung laden Sie LSZH Automations mit den erforderlichen Berechtigungen in Ihre Organisation ein. Wir unterstützen Sie bei der Einrichtung.',
 'Allfällige Make-Abonnements und nutzungsabhängige Kosten werden direkt zwischen Ihnen und Make abgerechnet und sind im Offertenpreis nicht enthalten.',
 'Die technische Umsetzung beginnt, sobald die benötigten Zugänge eingerichtet und geprüft sind.'
]);
const sha256=createHash('sha256').update(JSON.stringify({version:MAKE_REQUIREMENTS_VERSION,displayVersion,title,paragraphs}),'utf8').digest('hex');
function makeRequirements(version){
 if(version===undefined||version===null)return null;
 if(version!==MAKE_REQUIREMENTS_VERSION)throw Error('MAKE_REQUIREMENTS_VERSION_INVALID');
 return {version,displayVersion,title,paragraphs:[...paragraphs],sha256};
}
function makeRequirementsMetadata(version){
 const policy=makeRequirements(version);
 return policy?{makeRequirementsVersion:policy.version,makeRequirementsSha256:policy.sha256}:{};
}
module.exports={MAKE_REQUIREMENTS_VERSION,makeRequirements,makeRequirementsMetadata};
