import {createHash,createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
import {windowsVault,createTokenProvider,verifyAccount} from '../cloud-run/offer-portal-staging/internalRecoveryOAuth.mjs';
import {V3,assertOffer,acceptanceFields} from './internal-test-pilot-v3.mjs';
import {INTERNAL_TEST_PILOT_V3 as P} from '../cloud-run/offer-portal-staging/internalTestPilot.mjs';
// Read-only independent process: no create, transaction, PATCH or provider send.
let db;
try {
 const c=windowsVault('load'),getToken=createTokenProvider(c);
 await verifyAccount(await getToken());
 const require=createRequire(new URL('../cloud-run/offer-portal-staging/package.json',import.meta.url));
 const {Firestore}=require('@google-cloud/firestore');
 const {GoogleAuth,OAuth2Client}=require('google-auth-library');
 const authClient=new OAuth2Client(c.clientId,c.clientSecret);authClient.setCredentials({refresh_token:c.refreshToken});
 db=new Firestore({projectId:V3.project,databaseId:V3.database,preferRest:true,auth:new GoogleAuth({authClient})});
 const code=createHmac('sha256',c.refreshToken).update(P.purpose+'\0'+P.recordId).digest('base64url');
 const hash=createHash('sha256').update(code).digest('hex');
 const [a,b]=await Promise.all([db.collection('lszh_staging_offers_v1').doc(hash).get(),db.collection('lszh_internal_pilot_v3_bindings').doc(P.recordId).get()]);
 const offer=assertOffer(a.data(),hash),binding=b.data();
 if(!a.exists||!b.exists||binding.tokenHash!==hash||binding.recordId!==P.recordId||binding.purpose!==P.purpose||binding.testOnly!==true)throw Error();
 const fields=acceptanceFields(offer);
 const request=async(url,token)=>{const r=await fetch(url,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error();return r.json();};
 const secret=await request('https://secretmanager.googleapis.com/v1/projects/'+V3.project+'/secrets/lszh-offer-cloud-e2e-airtable/versions/1:access',await getToken());
 const pat=Buffer.from(secret.payload.data,'base64').toString('utf8');
 const row=await request(`https://api.airtable.com/v0/${V3.base}/${V3.table}/${P.recordId}`,pat);
 if(row.id!==P.recordId||row.fields['Online-Annahme Token-Hash']!==hash||!Object.entries(fields).every(([k,v])=>row.fields[k]===v)||row.fields.Übernommen!==true||['Kunde','Auftrag'].some(k=>row.fields[k]?.length)||['Echtbetrieb – kein Test','Online-Annahme rechtlich freigegeben','Versand freigegeben'].some(k=>row.fields[k]===true))throw Error();
 console.log(JSON.stringify({result:'V3_INDEPENDENT_FIRESTORE_AIRTABLE_READBACK_PASS',recordId:P.recordId,acceptedAt:offer.acceptedAt,person:offer.evidence.name,email:offer.evidence.email,quoteHash:V3.quote.sha256,termsHash:V3.terms.sha256,sourceBindingVerified:true,consentsVerified:true,cloudWrites:0,mailSent:false}));
} catch {console.error('STOP: v3_independent_readback_failed_no_secret_output');process.exitCode=1;}
finally {if(db)await db.terminate();}
