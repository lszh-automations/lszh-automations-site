import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createLinkHandler,linkConfig} from './links.mjs';
const handler=createLinkHandler({config:linkConfig(process.env),pageHtml:readFileSync(new URL('../../offerte-annehmen/index.html',import.meta.url),'utf8')});
createServer((req,res)=>Promise.resolve(handler(req,res)).catch(()=>{if(!res.headersSent)res.writeHead(503,{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();})).listen(Number(process.env.PORT||8080),'0.0.0.0');
