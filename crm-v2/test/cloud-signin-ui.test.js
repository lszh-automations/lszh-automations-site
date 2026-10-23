'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
const script=html.match(/<script>\s*('use strict';[\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'CRM JavaScript vorhanden');

function newLogin(){
  const ids=new Map();
  const elem=id=>{
    if(!ids.has(id))ids.set(id,{
      id,hidden:false,textContent:'',
      handlers:{},addEventListener(event,fn){this.handlers[event]=fn;}
    });
    return ids.get(id);
  };
  const calls={configured:[],button:0,prompt:0,disabled:0,intervals:[],documentEvents:{},windowEvents:{}};
  const id={
    initialize(options){calls.configured.push(options);},
    renderButton(target){assert.equal(target,elem('googleButton'));calls.button++;},
    prompt(){calls.prompt++;},
    disableAutoSelect(){calls.disabled++;}
  };
  const google={accounts:{id}};
  const source=script.replace(/\binitialise\(\);\s*$/,'')+'\n({initialise,state});';
  const ctx={
    document:{getElementById:elem,addEventListener(event,fn){calls.documentEvents[event]=fn;}},
    window:{google,alert:msg=>{throw Error(msg)},addEventListener(event,fn){calls.windowEvents[event]=fn;}},
    google,
    fetch:async(url)=>{
      assert.equal(url,'/api/config');
      return {ok:true,json:async()=>({clientId:'test.apps.googleusercontent.com'})};
    },
    Intl,Date,console,setTimeout,
    setInterval(fn,ms){calls.intervals.push({fn,ms});return 1;}
  };
  const app=vm.runInNewContext(source,ctx);
  return {app,calls,elem};
}
test('CRM reload asks Google for a fresh credential rather than persisting a token',async()=>{
  const {app,calls}=newLogin();
  await app.initialise();
  assert.equal(calls.configured.length,1);
  assert.equal(calls.configured[0].client_id,'test.apps.googleusercontent.com');
  assert.equal(calls.configured[0].auto_select,true);
  assert.equal(calls.configured[0].button_auto_select,true);
  assert.equal(typeof calls.configured[0].callback,'function');
  assert.equal(calls.button,1);
  assert.equal(calls.prompt,1);
  assert.equal(calls.intervals.length,1);
  assert.equal(calls.intervals[0].ms,30000);
  assert.equal(typeof calls.documentEvents.visibilitychange,'function');
  assert.equal(typeof calls.windowEvents.focus,'function');
  assert.doesNotMatch(script,/localStorage\.(?:setItem|getItem)/);
  assert.doesNotMatch(script,/sessionStorage\.(?:setItem|getItem)/);
});
test('explicit logout disables automatic Google account selection',async()=>{
  const {app,calls,elem}=newLogin();
  await app.initialise();
  app.state.token='temporary-id-token';
  app.state.records={leads:[{id:'private'}]};
  elem('logout').handlers.click();
  assert.equal(app.state.token,'');
  assert.equal(Object.keys(app.state.records).length,0);
  assert.equal(calls.disabled,1);
  assert.equal(elem('workspace').hidden,true);
  assert.equal(elem('signin').hidden,false);
});
