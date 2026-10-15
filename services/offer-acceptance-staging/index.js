'use strict';
const {createGateway}=require('./app');
const {createStagingReadProbe}=require('./stagingReadProbe');
const {runStartupReadProbe}=require('./startupReadProof');
const port=Number(process.env.PORT||8080);
if(!Number.isSafeInteger(port)||port<=0||port>65535)throw Error('Invalid PORT');

// Keep the optional diagnostic inside Cloud Run's STARTUP CPU allocation.
// Request-based CPU can be suspended immediately after the server starts,
// making a fire-and-forget Firestore background read unreliable.
// Never initialize the SDK if the probe is disabled.
async function start(){
  const stagingReadProbe=process.env.LSZH_STAGING_READ_PROBE_ENABLED==='yes'
    ? createStagingReadProbe()
    : null;
  // Exactly one fixed read; bounded to ten seconds; sanitizes errors.
  // Even a failed read is diagnostically useful and does NOT enable writes.
  if(stagingReadProbe)await runStartupReadProbe(stagingReadProbe);
  createGateway({stagingReadProbe}).listen(port,'0.0.0.0',()=>{
    console.log('LSZH_STAGING_GATEWAY: READY (ACCEPTANCE_DISABLED)');
  });
}
if(require.main===module){
  start().catch(()=>{
    // No exception or secret is printed during a startup config error.
    console.error('LSZH_STAGING_GATEWAY: STARTUP_CONFIG_ERROR');
    process.exitCode=1;
  });
}
module.exports={start};
