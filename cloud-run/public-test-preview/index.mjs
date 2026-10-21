import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {previewConfig,createPublicPreview} from './preview.mjs';
import {createCrmSnapshotPreview} from './crmSnapshotPreview.mjs';
const config=previewConfig(process.env);
const pageHtml=readFileSync(new URL('../../offerte-annehmen/index.html',import.meta.url),'utf8');
const handler=process.env.LSZH_PUBLIC_TEST_SOURCE==='CRM_FIRESTORE'?createCrmSnapshotPreview({config,recordId:process.env.LSZH_PUBLIC_TEST_RECORD_ID,pageHtml}):createPublicPreview({config,pageHtml});
createServer((req,res)=>Promise.resolve(handler(req,res)).catch(()=>{if(!res.headersSent)res.writeHead(503,{'Cache-Control':'no-store'});res.end();})).listen(Number(process.env.PORT||8080),'0.0.0.0');
