'use strict';
// Produces reviewable Make patch operations, never calls Make or uses credentials.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const state=JSON.parse(fs.readFileSync(path.join(root,'.crm-cloud-state.json'),'utf8'));
const contractSource=fs.readFileSync(path.join(root,'cloud-run/crm-offer-links/dispatchContract.cjs'),'utf8').replace(/^module\.exports=.*;\s*$/m,'');
const old=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/make-crm-dispatch-7835460-before-20261021.json'),'utf8'));
const C=require('../cloud-run/crm-offer-links/dispatchContract.cjs');
if(!/^rec[A-Za-z0-9]{14}$/.test(state.recordId||'')||!/^rec[A-Za-z0-9]{14}$/.test(state.leadId||''))throw Error('pilot_required');
const policy={recordId:state.recordId,leadId:state.leadId},airtable={__IMTCONN__:11101358},drive={__IMTCONN__:11904271};
const rowUrl='v0/appzJiskpAdaR1HEv/tbljeIUoD7wwKuSmS/'+state.recordId;
const api=(parameters,url,method='GET',body)=>({parameters,mapper:{url,method,headers:body?[{key:'Content-Type',value:'application/json'}]:[],qs:[],...(body?{body}:{})}});
const code=(input,action)=>({parameters:{},mapper:{input,language:'javascript',inputFormat:'editor',codeEditorJavascript:contractSource+'\n'+action}});
const definitions=[
 {key:'preflight',module:'code:ExecuteCode',version:1,label:'CRM-Pflichtfelder und feste interne Quelle prüfen'},
 {key:'status',module:'airtable:makeApiCall',version:3,label:'Versandstatus oder konkrete Blockierung speichern'},
 {key:'terms',module:'google-drive:getAFile',version:4,label:'Finale TEST-Bedingungen erneut aus Drive lesen'},
 {key:'termsMeta',module:'google-drive:makeApiCall',version:4,label:'Hash, Ordner und Schreibschutz der TEST-Bedingungen lesen'},
 {key:'fresh',module:'airtable:makeApiCall',version:3,label:'CRM unmittelbar vor Linkausgabe erneut lesen'},
 {key:'snapshot',module:'code:ExecuteCode',version:1,label:'Quellfingerabdruck und PDF-Bytes prüfen; zufälligen Link erzeugen'},
 {key:'firestore',module:'google-cloud-firestore:universal',version:1,label:'Unveränderlichen Link-Snapshot create-only speichern'},
 {key:'mailReserve',module:'datastore:AddRecord',version:1,label:'Mailversuch dauerhaft einmalig reservieren'},
 {key:'receipt',module:'google-cloud-firestore:universal',version:1,label:'Gmail-ID nach erfolgreichem Versand create-only sichern'},
 {key:'mailError',module:'airtable:makeApiCall',version:3,label:'Unklarer Mailausgang: manuelle Prüfung, keine Wiederholung'},
 {key:'commit',module:'builtin:Commit',version:1,label:'Mailreservierung bei Fehler behalten'}
];
function config(key,ids={}){
 const i=ids;
 if(key==='preflight')return code([{name:'record',value:'{{`1`}}'}],'return preflight({id:input.record.id,fields:input.record},'+JSON.stringify(policy)+');');
 if(key==='status')return api(airtable,rowUrl,'PATCH','{{'+i.preflight+'.result.patchBody}}');
 if(key==='terms')return{parameters:drive,mapper:{select:'map',file:C.PILOT.termsId}};
 if(key==='termsMeta')return{parameters:drive,mapper:{url:'/v3/files/'+C.PILOT.termsId,method:'GET',headers:[],qs:[{key:'fields',value:'id,mimeType,size,sha256Checksum,parents,contentRestrictions'}]}};
 if(key==='fresh')return api(airtable,rowUrl);
 if(key==='snapshot')return code([{name:'row',value:'{{'+i.fresh+'.body}}'},{name:'sourceFingerprint',value:'{{'+i.preflight+'.result.fingerprint}}'},{name:'quoteMeta',value:'{{11.body}}'},{name:'quoteBase64',value:'{{base64(9.data)}}'},{name:'termsMeta',value:'{{'+i.termsMeta+'.body}}'},{name:'termsBase64',value:'{{base64('+i.terms+'.data)}}'}],'const out=prepareSnapshot({...input,policy:'+JSON.stringify(policy)+',origin:"https://lszh-crm-offer-links-ozx7mp2bka-oa.a.run.app"});delete out.snapshot;return out;');
 if(key==='firestore')return api({__IMTCONN__:12198232},'/v1/projects/lszh-automations/databases/lszh-offers-staging/documents/lszh_crm_cloud_links?documentId={{'+i.snapshot+'.result.tokenHash}}','POST','{{'+i.snapshot+'.result.firestoreBody}}');
 if(key==='mailReserve')return{parameters:{datastore:227219},mapper:{key:C.PILOT.purpose+':'+state.recordId+':MAIL_ATTEMPT',overwrite:false}};
 if(key==='receipt')return api({__IMTCONN__:12198232},'/v1/projects/lszh-automations/databases/lszh-offers-staging/documents/lszh_crm_cloud_receipts?documentId='+state.recordId,'POST',JSON.stringify({fields:{status:{stringValue:'PROVIDER_CONFIRMED'},gmailId:{stringValue:'{{5.id}}'},tokenHash:{stringValue:'{{'+i.snapshot+'.result.tokenHash}}'},sentAt:{timestampValue:'{{formatDate(now; "YYYY-MM-DDTHH:mm:ssZ")}}'}}}));
 if(key==='mailError')return api(airtable,rowUrl,'PATCH',JSON.stringify({fields:{Versandstatus:'Manuelle Prüfung',Versandfehler:'Gmail-Ausgang unklar; Mailversuch reserviert. Nicht erneut freigeben.','Versand freigegeben':false,Schnellaktion:null}}));
 return{};
}
if(process.argv[2]==='--definitions'){
 // Detached valid modules are configured and wired in the second atomic save.
 const harmless={preflight:config('preflight'),status:api(airtable,rowUrl),terms:config('terms'),termsMeta:config('termsMeta'),fresh:config('fresh'),snapshot:code([],'return {configured:false};'),firestore:api({__IMTCONN__:12198232},'/v1/projects/lszh-automations/databases/lszh-offers-staging/documents/lszh_crm_cloud_receipts/'+state.recordId),mailReserve:config('mailReserve'),receipt:api({__IMTCONN__:12198232},'/v1/projects/lszh-automations/databases/lszh-offers-staging/documents/lszh_crm_cloud_receipts/'+state.recordId),mailError:api(airtable,rowUrl),commit:{}};
 console.log(JSON.stringify(definitions.map(d=>({op:'module_add',module:d.module,version:d.version,label:d.label,root:'orphan',config:harmless[d.key]}))));
}else if(process.argv[2]==='--patch'){
 const ids=JSON.parse(fs.readFileSync(path.join(root,'.crm-cloud-module-ids.json'),'utf8')),ops=[];
 for(const d of definitions)ops.push({op:'module_config_set',moduleId:ids[d.key],config:config(d.key,ids)});
 const sequence=[1,ids.preflight,ids.status,12,2,3,4,7,9,10,11,8,ids.terms,ids.termsMeta,ids.fresh,ids.snapshot,ids.firestore,ids.mailReserve,5,6,ids.receipt];
 for(let n=1;n<sequence.length;n++)ops.push({op:'module_move',moduleId:sequence[n],follows:sequence[n-1]});
 ops.push({op:'module_move',moduleId:ids.mailError,parent:{moduleId:5,kind:'errorHandler'}},{op:'module_move',moduleId:ids.commit,follows:ids.mailError});
 const original=id=>structuredClone(old.modules.find(m=>m.id===id).config);
 const trigger=original(1);trigger.mapper.formula="AND(RECORD_ID()='"+state.recordId+"',{Offertennummer}='"+C.PILOT.number+"',{Status}='Entwurf',{Schnellaktion}='Für Versand freigeben',NOT({Online-Annahme Offerten Drive ID}),NOT({Echtbetrieb – kein Test}),NOT({Online-Annahme rechtlich freigegeben}))";
 ops.push({op:'module_config_set',moduleId:1,config:trigger});
 const pdfReserve=original(12);pdfReserve.mapper.key=C.PILOT.purpose+':'+state.recordId+':PDF';pdfReserve.mapper.overwrite=false;ops.push({op:'module_config_set',moduleId:12,config:pdfReserve});
 const document=original(3);document.mapper.name='TEST_ONLY – dauerhafter CRM-Versand – kein Vertrag';document.mapper.content='{{'+ids.preflight+'.result.html}}';ops.push({op:'module_config_set',moduleId:3,config:document});
 const archive=original(8);archive.mapper.body=JSON.stringify({fields:{'Online-Annahme Offerten Drive ID':'{{9.id}}','Online-Annahme Offerten-SHA256':'{{11.body.sha256Checksum}}','Online-Annahme Offerten-Archivstatus':'VERIFIZIERT','Online-Annahme Offerten-Archivprüfung am':'{{formatDate(now; "YYYY-MM-DDTHH:mm:ssZ")}}','Google Doc ID':'{{3.id}}'}});ops.push({op:'module_config_set',moduleId:8,config:archive});
 const mail={parameters:{__IMTCONN__:11904991},mapper:{to:[C.PILOT.email],cc:[],bcc:[],from:'"LSZH Automations" <info@lszh-automations.ch>',bodyType:'rawHtml',subject:'TEST_ONLY – Cloud-CRM-Offerte – kein Vertrag',content:'<h2>Interner Test aus deiner CRM-Freigabe</h2><p>CHF 120 einmalig, CHF 0 monatlich. Kein Vertrag. Keine Rechnung.</p><p><a href="{{'+ids.snapshot+'.result.link}}">Offerte und TEST-Bedingungen öffnen</a></p><p>Annahme deaktiviert. Link sieben Tage, höchstens bis zum Ablauf der Offerte gültig.</p>',attachments:[{filename:'TEST_ONLY_Offerte_Cloud.pdf',data:'{{9.data}}'},{filename:'TEST_ONLY_Projektbedingungen.pdf',data:'{{'+ids.terms+'.data}}'}]}};
 ops.push({op:'module_config_set',moduleId:5,config:mail});
 ops.push({op:'module_config_set',moduleId:6,config:api(airtable,rowUrl,'PATCH',JSON.stringify({fields:{Status:'Versendet','Versendet am':'{{formatDate(now; "YYYY-MM-DD")}}','Vertragsunterlagen versendet':true,'Online-Annahme Link gesendet am':'{{formatDate(now; "YYYY-MM-DDTHH:mm:ssZ")}}','Online-Annahme Token-Hash':'{{'+ids.snapshot+'.result.tokenHash}}','Online-Annahme Bedingungen Drive ID':C.PILOT.termsId,'Online-Annahme Bedingungen-SHA256':C.PILOT.termsHash,'Versand freigegeben':false,Schnellaktion:null,Versandstatus:'Versandt',Versandfehler:'','Nächster Schritt':'TEST_ONLY Cloud-CRM-Versand bestätigt. Keine Annahme oder Rechnung.'}}))});
 const eq=(a,b,o='text:equal')=>({a,b,o});
 ops.push({op:'filter_set',moduleId:12,filter:{name:'Nur geprüfte feste interne Cloud-Offerte',conditions:[[eq('{{'+ids.preflight+'.result.ok}}',true,'boolean:equal'),eq('{{1.id}}',state.recordId)]]}},
 {op:'filter_set',moduleId:2,filter:{name:'Nur feste interne Adresse und Firma',conditions:[[eq('{{1.`Lead E-Mail`[1]}}',C.PILOT.email),eq('{{1.`Lead Firma`[1]}}',C.PILOT.company)]]}},
 {op:'filter_set',moduleId:5,filter:{name:'Nur bestätigter Snapshot der festen internen Quelle',conditions:[[eq('{{1.id}}',state.recordId),eq('{{'+ids.firestore+'.statusCode}}',200,'number:equal'),{a:'{{'+ids.snapshot+'.result.tokenHash}}',o:'exist'},eq('{{'+ids.preflight+'.result.ok}}',true,'boolean:equal')]]}},
 {op:'filter_set',moduleId:6,filter:{name:'Nur nach bestätigter Gmail-ID',conditions:[[{a:'{{5.id}}',o:'exist'}]]}},
 {op:'module_disabled_set',moduleId:5,disabled:false},{op:'module_disabled_set',moduleId:6,disabled:false},{op:'scheduling_set',scheduling:{type:'indefinitely',interval:60}});
 console.log(JSON.stringify(ops));
}else throw Error('explicit_plan_mode_required');

