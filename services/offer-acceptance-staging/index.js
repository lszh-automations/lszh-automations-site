'use strict';
const {createGateway}=require('./app');
const {createStagingReadProbe}=require('./stagingReadProbe');
const port=Number(process.env.PORT||8080);
if(!Number.isSafeInteger(port)||port<=0||port>65535)throw Error('Invalid PORT');
// No Firestore SDK or network access during startup unless explicitly enabled.
// Misconfigured opt-in fails startup before any listener is made public.
const stagingReadProbe=process.env.LSZH_STAGING_READ_PROBE_ENABLED==='yes'
  ? createStagingReadProbe()
  : null;
createGateway({stagingReadProbe}).listen(port,'0.0.0.0',()=>{
  console.log('LSZH_STAGING_GATEWAY: READY (ACCEPTANCE_DISABLED)');
});
