// Offline regression for the real inline onboarding form, no Make/Google/Airtable.
// Run: node --test onboarding/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, 'The real inline script must exist');
const source = match[1];
const PROJECT_CODE = 'ob_00000000-0000-4000-8000-000000000000';
const verified = {status:200,body:JSON.stringify({ok:true,state:'completed',confirmed:true,verified:true})};
const queued = {status:202,body:JSON.stringify({ok:true,state:'processing',pending:true})};
const responseOf = x => ({status:x.status, ok:x.status>=200 && x.status<300, text:async()=>x.body});

async function simulate(initial, subsequent=[]) {
  const status = {textContent:'',style:{}};
  const button = {textContent:'Onboarding übermitteln',disabled:false};
  let submit, checkStatus, resets=0, posts=0, statusReads=0;
  const form = {
    dataset:{makeWebhook:'/api/onboarding'},
    querySelector:()=>button,
    reset:()=>{resets++;}
  };
  const fields={
    project_code:{value:''}, company:{value:''}, project_name:{value:''},
    projectCodeFallback:{classList:{remove:()=>{}}},
    status, onboardingForm:{addEventListener:(event,fn)=>{assert.equal(event,'submit');submit=fn;}},
    checkOnboardingStatus:{addEventListener:(event,fn)=>{assert.equal(event,'click');checkStatus=fn;}}
  };
  class FakeFormData {
    constructor(f){assert.equal(f,form);}
    entries(){return [['project_code',PROJECT_CODE],['company','Nur synthetisch']][Symbol.iterator]();}
  }
  const sandbox={
    URLSearchParams,location:{search:'?code='+PROJECT_CODE},
    document:{getElementById:id=>{assert.ok(fields[id],id);return fields[id];}},
    FormData:FakeFormData,
    setTimeout:(fn)=>fn(), // complete all polling intervals instantly for offline tests
    fetch:async(url,opts)=>{
      assert.equal(opts.method,'POST');
      assert.equal(opts.headers['Content-Type'],'application/json');
      if(url==='/api/onboarding'){
        posts++;assert.equal(JSON.parse(opts.body).company,'Nur synthetisch');
        if(initial.reject) throw new Error('network-failure');
        return responseOf(initial);
      }
      assert.equal(url,'/api/onboarding/status');
      statusReads++;
      assert.deepEqual(JSON.parse(opts.body),{project_code:PROJECT_CODE});
      const next=subsequent[Math.min(statusReads-1,subsequent.length-1)] || queued;
      if(next.reject) throw new Error('status-failure');
      return responseOf(next);
    }
  };
  runInNewContext(source,sandbox,{timeout:1000,filename:'onboarding/index.html'});
  assert.equal(typeof submit,'function');
  assert.equal(typeof checkStatus,'function');
  await submit({currentTarget:form,preventDefault:()=>{}});
  return {status,button,resets,posts,statusReads};
}

const cases=[
  {name:'Make Accepted is not completion',initial:{status:200,body:'Accepted'},want:'noch nicht abschliessend',resets:0},
  {name:'HTTP 202 queued is not completion',initial:queued,want:'noch nicht abschliessend',resets:0},
  {name:'Legacy valid record ID without verification is not completion',
   initial:{status:200,body:JSON.stringify({ok:true,record_id:'rec'+'A'.repeat(14)})},
   want:'noch nicht abschliessend',resets:0},
  {name:'Explicit server verification completes instantly',initial:verified,want:'technisch abgeschlossen',resets:1,statusReads:0},
  {name:'Pending later transitions to verified completed',initial:queued,
   subsequent:[queued,queued,verified],want:'technisch abgeschlossen',resets:1,statusReads:3},
  {name:'Pending changes to manual review',initial:queued,
   subsequent:[{status:409,body:'{"state":"requires_review"}'}],want:'manuelle Prüfung',resets:0,statusReads:1},
  {name:'An upstream HTTP 500 alone never confirms completion',
   initial:{status:500,body:'Server Error'},want:'nicht bestätigt',resets:0,statusReads:0},
  {name:'Ambiguous submit timeout may be reconciled read-only',initial:{reject:true},
   subsequent:[queued,verified],want:'technisch abgeschlossen',resets:1,statusReads:2},
  {name:'Ambiguous submit timeout without verification remains open',initial:{reject:true},
   want:'noch nicht abschliessend',resets:0,statusReads:4},
  {name:'Status endpoint error is not completion',initial:queued,
   subsequent:[{status:503,body:'{"error":"status_not_configured"}'}],
   want:'noch nicht abschliessend',resets:0,statusReads:1},
  {name:'409 direct conflict is never retried',initial:{status:409,body:'{"error":"already_submitted"}'},
   want:'geprüft werden',resets:0,statusReads:0}
];
for(const c of cases) test(c.name,async()=>{
 const r=await simulate(c.initial,c.subsequent);
 assert.match(r.status.textContent,new RegExp(c.want));
 assert.equal(r.resets,c.resets);
 assert.equal(r.posts,1,'Never resubmit form as recovery');
 assert.equal(r.statusReads,c.statusReads??4);
 assert.equal(r.button.disabled,true);
});
