// LSZH G3 synthetic transport CANARY ONLY. No tokens, Firestore, Airtable,
// Google Docs, Drive, contracts, emails, or HTTP callbacks to other services.
// MUST be deployed to a separate private Cloud Run service protected by IAM.
// This endpoint DOES NOT reserve an offer or approve processing a receipt.
import http from 'node:http';
import {pathToFileURL} from 'node:url';

const CANARY='LSZH_G3_CANARY_NO_CONTRACT_20261018';
const SUB='projects/lszh-automations/subscriptions/lszh-g3-review-staging';
const KIND='LSZH_G3_PRIVATE_PUSH_CANARY_V1';
const MAX_BODY=2048;

const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x) &&
  Object.getPrototypeOf(x)===Object.prototype;
const keys=(x,k)=>object(x)&&Object.keys(x).sort().join('|')===k.slice().sort().join('|');
export function isSyntheticCanaryPush(body){
  if(!keys(body,['subscription','message'])||body.subscription!==SUB ||
     !keys(body.message,['data','attributes','messageId','publishTime']) ||
     typeof body.message.messageId!=='string'||
     !/^\d{4,25}$/.test(body.message.messageId) ||
     !keys(body.message.attributes,['kind','schema']) ||
     body.message.attributes.kind!==KIND ||
     body.message.attributes.schema!=='1' ||
     typeof body.message.data!=='string' ||
     !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.message.data))
    return false;
  const data=Buffer.from(body.message.data,'base64');
  if(data.length===0||data.length>300||
     data.toString('base64')!==body.message.data)return false;
  try{
    const parsed=JSON.parse(data.toString('utf8'));
    return keys(parsed,['schemaVersion','syntheticOnly','fixtureId']) &&
      parsed.schemaVersion===1&&parsed.syntheticOnly===true &&
      parsed.fixtureId===CANARY;
  }catch{return false;}
}
const headers={'cache-control':'no-store','x-content-type-options':'nosniff'};
export async function handleRequest(req,res){
  res.setHeader('cache-control',headers['cache-control']);
  res.setHeader('x-content-type-options',headers['x-content-type-options']);
  // Health does not return data and remains inaccessible due to private IAM.
  if(req.method==='GET'&&req.url==='/healthz'){
    res.writeHead(200);res.end('ok');return;
  }
  if(req.method!=='POST'||req.url!=='/g3-review'){
    res.writeHead(404);res.end();return;
  }
  let total=0,parts=[];
  try{
    for await(const part of req){
      total+=part.length;
      if(total>MAX_BODY){res.writeHead(413);res.end();return;}
      parts.push(part);
    }
    const body=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(isSyntheticCanaryPush(body)){
      // Sole allowed 2xx: no-op synthetic transport canary,
      // never a receipt reservation, customer acceptance or email GO.
      res.writeHead(204);res.end();return;
    }
  }catch{/* No user request bodies or error details are logged. */}
  // Fail closed for all real receipt envelopes. Pub/Sub will retry if sent:
  // the topic MUST remain without any real publisher and require separate GO.
  res.writeHead(503,{'retry-after':'600'});res.end();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const port=Number(process.env.PORT||8080);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('invalid_port');
  const server=http.createServer((req,res)=>{void handleRequest(req,res);});
  server.listen(port,'0.0.0.0',()=>console.log('G3_STAGING_CANARY_ONLY_READY'));
}
