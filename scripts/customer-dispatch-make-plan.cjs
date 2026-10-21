'use strict';
// Reviewable customer blueprint. BOTH search and Gmail gates are deliberately shut.
const fs=require('node:fs'),path=require('node:path');
const C=require('../cloud-run/offer-portal-production/customerDispatchContract.cjs'),I=C.CUSTOMER_DISPATCH;
function buildCustomerDispatchScenario(){
 const source=fs.readFileSync(path.join(__dirname,'../cloud-run/offer-portal-production/customerDispatchContract.cjs'),'utf8').replace(/^module\.exports=.*;\s*$/m,''),modules=[];
 const conn={airtable:11101358,docs:11905001,drive:11904271,firestore:12198232,gmail:11904991};
 const add=(id,module,version,label,config,filter)=>{modules.push({id,module,version,label,config,...(id===1?{root:'main'}:{follows:id-1}),...(filter?{filter}:{})});};
 const api=(type,url,method='GET',body)=>({parameters:{__IMTCONN__:conn[type]},mapper:{url,method,headers:body?[{key:'Content-Type',value:'application/json'}]:[],qs:[],...(body?{body}:{})}});
 const code=(input,action)=>({parameters:{},mapper:{language:'javascript',inputFormat:'editor',input,codeEditorJavascript:source+'\n'+action}}),arg=(name,value)=>({name,value}),condition=(a,b,o='text:equal')=>({a,b,o}),gate=(name,conditions)=>({name,conditions:[conditions]});
 const record='v0/'+I.baseId+'/'+I.tableId+'/{{1.id}}',documents='/v1/projects/'+I.project+'/databases/'+I.database+'/documents';
 const fmeta='id,mimeType,size,sha256Checksum,parents,contentRestrictions,trashed';
 add(1,'airtable:ActionSearchRecords',3,'Kundenversand vorbereitet – Ausführung noch gesperrt',{parameters:{__IMTCONN__:conn.airtable},mapper:{base:I.baseId,table:I.tableId,formulaField:'formula',formula:"AND(0=1,{Status}='Entwurf',{Schnellaktion}='Für Versand freigeben',{Echtbetrieb – kein Test}=1,{Online-Annahme rechtlich freigegeben}=1,NOT({Online-Annahme Offerten Drive ID}),NOT({Online-Annahme Token-Hash}))",maxRecords:1,useColumnId:false}});
 add(2,'airtable:makeApiCall',3,'CRM einschließlich aktueller Prüffelder neu lesen',api('airtable',record));
 add(3,'code:ExecuteCode',1,'Kundenquelle, Pflichtfelder und Freigaben prüfen',code([arg('row','{{2.body}}')],'return preflight(input.row);'));
 add(4,'airtable:makeApiCall',3,'Prüfergebnis speichern; erledigte Vorgänge unverändert lassen',api('airtable',record,'PATCH','{{3.result.patchBody}}'),gate('Nur tatsächlich neue Bedienaktion',[condition('{{3.result.shouldWrite}}',true,'boolean:equal')]));
 add(5,'datastore:AddRecord',1,'PDF-Erstellung für diese Offerte einmalig reservieren',{parameters:{datastore:227219},mapper:{key:'CUSTOMER_DISPATCH_V1:{{1.id}}:PDF',overwrite:false}},gate('Nur vollständige freigegebene Kundenquelle',[condition('{{3.result.ok}}',true,'boolean:equal')]));
 add(6,'google-docs:createADocument',1,'Kundenofferte aus geprüften CRM-Daten erstellen',{parameters:{__IMTCONN__:conn.docs},mapper:{name:'Offerte {{2.body.fields.Offertennummer}}',content:'{{3.result.html}}',destination:'drive',folderId:I.archiveFolder,header:false,footer:false}});
 add(7,'google-docs:exportADocument',1,'Offerte als PDF exportieren',{parameters:{__IMTCONN__:conn.docs},mapper:{document:'{{6.id}}',mimeType:'application/pdf',destination:'drive'}});
 add(8,'google-drive:uploadAFile',4,'Offerte im Produktionsarchiv ablegen',{parameters:{__IMTCONN__:conn.drive},mapper:{select:'map',folderId:I.archiveFolder,filename:'Offerte_{{2.body.fields.Offertennummer}}_ARCHIV.pdf',data:'{{7.data}}',convert:false}});
 add(9,'google-drive:getAFile',4,'Archivierte Offertenbytes erneut lesen',{parameters:{__IMTCONN__:conn.drive},mapper:{select:'map',file:'{{8.id}}'}});
 add(10,'google-drive:makeApiCall',4,'Archiv-PDF gegen Änderungen sperren',api('drive','/v3/files/{{9.id}}','PATCH',JSON.stringify({contentRestrictions:[{readOnly:true,reason:'Finale LSZH Kundenofferte; gebundene Vertragsversion.'}]})));
 const meta=api('drive','/v3/files/{{9.id}}');meta.mapper.qs=[{key:'fields',value:fmeta}];add(11,'google-drive:makeApiCall',4,'Offertenhash, Ordner und Schreibschutz nachlesen',meta);
 add(12,'airtable:makeApiCall',3,'Verifiziertes Angebot an denselben CRM-Datensatz binden',api('airtable',record,'PATCH',JSON.stringify({fields:{'Google Doc ID':'{{6.id}}','PDF Dateiname':'Offerte_{{2.body.fields.Offertennummer}}_ARCHIV.pdf','Online-Annahme Offerten Drive ID':'{{9.id}}','Online-Annahme Offerten-SHA256':'{{11.body.sha256Checksum}}','Online-Annahme Offerten-Archivstatus':'VERIFIZIERT','Online-Annahme Offerten-Archivprüfung am':'{{formatDate(now; "YYYY-MM-DDTHH:mm:ssZ")}}'}})),gate('Nur gebundenes, gesperrtes Produktions-PDF',[condition('{{9.id}}','{{11.body.id}}'),condition('{{9.sha256Checksum}}','{{11.body.sha256Checksum}}'),{a:'{{11.body.sha256Checksum}}',o:'exist'},condition('{{11.body.parents[1]}}',I.archiveFolder),condition('{{11.body.mimeType}}','application/pdf'),condition('{{11.body.contentRestrictions[1].readOnly}}',true,'boolean:equal')]));
 add(13,'google-drive:getAFile',4,'Freigegebene Projektbedingungen 1.0 lesen',{parameters:{__IMTCONN__:conn.drive},mapper:{select:'map',file:I.termsId}});
 const termsMeta=api('drive','/v3/files/'+I.termsId);termsMeta.mapper.qs=[{key:'fields',value:fmeta}];add(14,'google-drive:makeApiCall',4,'Projektbedingungen unabhängig prüfen',termsMeta);
 const avvId='{{if(2.body.fields.`AVV erforderlich` = "Ja"; 2.body.fields.`Online-Annahme AVV Drive ID`; "'+I.termsId+'")}}';
 // A Nein case reads terms a second time; these bytes never become an AVV attachment.
 add(15,'google-drive:getAFile',4,'Nur bei AVV Ja die kundenspezifische Datei lesen',{parameters:{__IMTCONN__:conn.drive},mapper:{select:'map',file:avvId}});
 const avvMeta=api('drive','/v3/files/'+avvId);avvMeta.mapper.qs=[{key:'fields',value:fmeta}];add(16,'google-drive:makeApiCall',4,'AVV-Metadaten für den Ja-Fall prüfen',avvMeta);
 add(17,'airtable:makeApiCall',3,'Quellstand nach PDF-Erzeugung nochmals lesen',api('airtable',record));
 add(18,'code:ExecuteCode',1,'Quelle und PDF-Bytes binden; Link und 2/3 Anhänge vorbereiten',code([arg('row','{{17.body}}'),arg('expectedFingerprint','{{3.result.sourceFingerprint}}'),arg('quoteMeta','{{11.body}}'),arg('quoteBase64','{{base64(9.data)}}'),arg('termsMeta','{{14.body}}'),arg('termsBase64','{{base64(13.data)}}'),arg('avvMeta','{{16.body}}'),arg('avvBase64','{{base64(15.data)}}')],'return prepareDispatch(input);'));
 add(19,'google-cloud-firestore:universal',1,'Offerte und eindeutigen Quellindex atomar vorbereiten',api('firestore',documents+':commit','POST','{{18.result.preparedCommitBody}}'));
 add(20,'datastore:AddRecord',1,'Genau einen Mailversuch reservieren',{parameters:{datastore:227219},mapper:{key:'CUSTOMER_DISPATCH_V1:{{1.id}}:MAIL_ATTEMPT',overwrite:false}});
 add(21,'airtable:makeApiCall',3,'Unmittelbar vor Versand Freigaben erneut lesen',api('airtable',record));
 add(22,'code:ExecuteCode',1,'Änderung oder Widerruf vor Mail blockieren',code([arg('row','{{21.body}}'),arg('prepared','{{18.result}}')],'return assertBeforeMail(input.row,input.prepared);'));
 add(23,'google-email:makeAnApiCall',4,'Kundenmail – bis kontrollierter Pilotfreigabe hart gesperrt',api('gmail','/v1/users/me/messages/send','POST','{{18.result.mailBody}}'),gate('HART GESPERRT – konkreter Kundenpilot noch nicht freigegeben',[condition('0',1,'number:equal'),condition('{{22.result.ok}}',true,'boolean:equal')]));
 add(24,'code:ExecuteCode',1,'Gmail-ID bestätigen und CRM-/Quittungsdaten festlegen',code([arg('prepared','{{18.result}}'),arg('gmailId','{{23.body.id}}')],"const receipt=confirmedMailReceipt(input.prepared,input.gmailId);return{receipt,receiptBody:JSON.stringify({fields:fields(receipt)}),sentPatchBody:JSON.stringify(sentPatch(input.prepared,receipt))};"));
 add(25,'google-cloud-firestore:universal',1,'Providerquittung vor dem CRM-PATCH create-only sichern',api('firestore',documents+'/lszh_customer_dispatch_receipts_v1?documentId={{1.id}}','POST','{{24.result.receiptBody}}'));
 add(26,'airtable:makeApiCall',3,'Bestätigten Mailversand mit unveränderter Dokumentbindung speichern',api('airtable',record,'PATCH','{{24.result.sentPatchBody}}'));
 add(27,'airtable:makeApiCall',3,'Versendeten CRM-Zustand unabhängig nachlesen',api('airtable',record));
 add(28,'google-cloud-firestore:universal',1,'Vorbereitete Offerte samt Update-Version lesen',api('firestore',documents+'/lszh_customer_offers_v1/{{18.result.tokenHash}}'));
 add(29,'google-cloud-firestore:universal',1,'Quellindex samt Update-Version lesen',api('firestore',documents+'/lszh_customer_source_index_v1/{{1.id}}'));
 add(30,'code:ExecuteCode',1,'Nur bestätigten unveränderten Versand zur Veröffentlichung zulassen',code([arg('row','{{27.body}}'),arg('prepared','{{18.result}}'),arg('receipt','{{24.result.receipt}}'),arg('storedOffer','{{28.body}}'),arg('storedIndex','{{29.body}}'),arg('offerUpdateTime','{{28.body.updateTime}}'),arg('indexUpdateTime','{{29.body.updateTime}}')],'return{commitBody:JSON.stringify(publicationCommit(input))};'));
 add(31,'google-cloud-firestore:universal',1,'Kundenlink atomar veröffentlichen – nur bei gleichem Datenstand',api('firestore',documents+':commit','POST','{{30.result.commitBody}}'));
 add(32,'airtable:makeApiCall',3,'Erst nach Linkveröffentlichung Versandt anzeigen',api('airtable',record,'PATCH',JSON.stringify({fields:{Versandstatus:'Versandt',Versandfehler:'','Nächster Schritt':'Offerte und persönlicher Link versendet; Kundenentscheidung abwarten.'}})));
 // Each irreversible-mail-stage failure retains reservations and requires reconciliation.
 for(const[target,id,reason]of[[23,33,'Gmail-Ausgang unklar. Nicht erneut freigeben; Mailversuch reserviert.'],[25,35,'Gmail hat Versand bestätigt; Quittungsspeicherung fehlgeschlagen. Nicht erneut senden.'],[26,37,'Gmail und Quittung bestätigt; CRM-Abgleich erforderlich. Nicht erneut senden.'],[31,39,'Mail bestätigt; Kundenlink noch nicht veröffentlicht. Quellstand abgleichen, nicht erneut senden.']]){
  modules.push({id,module:'airtable:makeApiCall',version:3,label:'Manuelle Prüfung nach '+target,parent:{moduleId:target,kind:'errorHandler'},config:api('airtable',record,'PATCH',JSON.stringify({fields:{Versandstatus:'Manuelle Prüfung',Versandfehler:reason,Schnellaktion:null}}))},{id:id+1,module:'builtin:Commit',version:1,label:'Reservierungen behalten, keine automatische Mailwiederholung',follows:id,config:{}});
 }
 return{teamId:1728770,folderId:390626,name:'LSZH Vertrieb – Kundenofferte vorbereiten und freigeben',autoActivate:false,scheduling:{type:'indefinitely',interval:900},modules};
}
module.exports={buildCustomerDispatchScenario};
if(require.main===module)process.stdout.write(JSON.stringify(buildCustomerDispatchScenario()));
