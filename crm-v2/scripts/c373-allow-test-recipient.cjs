'use strict';
// Never run emit mode into a terminal: output goes only to Secret Manager stdin.
const {readSecretEnvelope}=require('../contract-gmail-c37-backend-staging');
const TO='lars.schulthess@outlook.com';
function extendRecipientPolicy(input){
  const current=readSecretEnvelope(input);
  if(!current.approvedSenders.includes('info@lszh-automations.ch'))throw Error('POLICY BLOCKED');
  const original=JSON.parse(input);
  if(current.allowedRecipients.includes(TO))return {changed:false,updated:input};
  const next={...original,allowedRecipients:[...original.allowedRecipients,TO]};
  const updated=JSON.stringify(next);
  readSecretEnvelope(updated);
  for(const key of Object.keys(original)){
    if(key!=='allowedRecipients'&&JSON.stringify(original[key])!==JSON.stringify(next[key]))
      throw Error('POLICY BLOCKED');
  }
  return {changed:true,updated};
}
if(require.main===module){
  const mode=process.argv[2]||'--preview';
  if(process.argv.length>3||!['--preview','--emit-for-secret-manager'].includes(mode)){
    process.stderr.write('POLICY BLOCKED: invalid mode.\n');process.exitCode=1;
  }else{
    let input='';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data',part=>{
      input+=part;
      if(input.length>16384){input='';process.exitCode=1;process.stdin.destroy();}
    });
    process.stdin.on('end',()=>{
      try{
        const result=extendRecipientPolicy(input);
        if(mode==='--emit-for-secret-manager')process.stdout.write(result.updated);
        else process.stdout.write(JSON.stringify({valid:true,wouldAddRecipient:result.changed,
          recipient:TO,otherFieldsUnchanged:true})+'\n');
      }catch{process.stderr.write('POLICY BLOCKED: no output envelope generated.\n');process.exitCode=1;}
      finally{input='';}
    });
  }
}
module.exports={extendRecipientPolicy};
