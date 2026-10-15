'use strict';
const {createGateway}=require('./app');
const port=Number(process.env.PORT||8080);
if(!Number.isSafeInteger(port)||port<=0||port>65535)throw Error('Invalid PORT');
createGateway().listen(port,'0.0.0.0',()=>{
  console.log('LSZH_STAGING_GATEWAY: READY (ACCEPTANCE_DISABLED)');
});
