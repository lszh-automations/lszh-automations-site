'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');

const boot='scripts/offer-browser-cloud-bootstrap.sh';
const clean='scripts/offer-browser-cloud-cleanup.sh';
const resume='scripts/offer-browser-cloud-resume.sh';
const smoke='scripts/offer-browser-cloud-smoke.sh';
const demo='scripts/offer-browser-static-demo-release.sh';
const staticSmoke='scripts/offer-browser-static-demo-smoke.sh';
const driveProbeRelease='scripts/offer-temp-drive-probe-release.sh';

test('both Cloud Shell scripts parse safely and use exact isolated staging names',()=>{
 for(const file of [boot,clean,resume,smoke,demo,staticSmoke,driveProbeRelease]){
  const result=cp.spawnSync('bash',['-n',file],{encoding:'utf8',timeout:3000});
  assert.equal(result.status,0,file+': '+result.stderr);
  const s=fs.readFileSync(file,'utf8');
  assert.match(s,/TEMP="lszh-offer-browser-staging"/);
  if(file!==smoke && file!==demo && file!==staticSmoke && file!==driveProbeRelease)
   assert.match(s,/SA_EMAIL="lszh-offer-browser-tmp@lszh-automations\.iam\.gserviceaccount\.com"/);
  else if(file===smoke || file===staticSmoke)
   assert.match(s,/lszh-offer-browser-tmp@lszh-automations\.iam\.gserviceaccount\.com/);
  else if(file===driveProbeRelease)
   assert.match(s,/SA="lszh-offer-browser-tmp@lszh-automations\.iam\.gserviceaccount\.com"/);
  else
   assert.match(s,/SA_EMAIL="lszh-offer-browser-tmp@lszh-automations\.iam\.gserviceaccount\.com"/);
  assert.match(s,/offer-cloud-readiness-readonly\.py/);
  assert.doesNotMatch(s,/--allow-unauthenticated\b(?!\s)/,
    'must never allow anonymous access');
  assert.doesNotMatch(s,/--no-invoker-iam-check/,
    'must not disable Cloud Run Invoker validation');
 }
});
test('temp Cloud Run deploy uses IAM, independent identity and hard-off app flags',()=>{
 const s=fs.readFileSync(boot,'utf8');
 assert.match(s,/gcloud run deploy "\$TEMP"/);
 assert.match(s,/--ingress=all --no-allow-unauthenticated --invoker-iam-check/);
 assert.match(s,/--set-env-vars="LSZH_PORTAL_STAGING_ENABLED=false"/);
 assert.match(s,/--min-instances=0 --max-instances=1/);
 assert.match(s,/--labels="lszh-purpose=offer-browser-smoke,lszh-temporary=true"/);
 assert.match(s,/gcloud run services add-iam-policy-binding "\$TEMP"/);
 assert.match(s,/--member="user:\$ACCOUNT" --role="roles\/run\.invoker"/);
 assert.doesNotMatch(s,/gcloud run (services update|services replace|deploy) "\$ORIGINAL"/);
 assert.doesNotMatch(s,/gcloud run services add-iam-policy-binding "\$ORIGINAL"/);
 assert.doesNotMatch(s,/roles\/datastore\.user|roles\/storage\.admin/,
  'bootstrap must not grant database/storage permissions');
});
test('cleanup refuses to delete unlabelled/active/non-owned services',()=>{
 const s=fs.readFileSync(clean,'utf8');
 assert.match(s,/labels\.get\("lszh-temporary"\)!="true"/);
 assert.match(s,/env\.get\("LSZH_PORTAL_STAGING_ENABLED"\)!="false"/);
 assert.match(s,/gcloud run services delete "\$TEMP"/);
 assert.match(s,/gcloud iam service-accounts delete "\$SA_EMAIL"/);
 assert.doesNotMatch(s,/gcloud run services delete "\$ORIGINAL"/);
});

test('failed actAs deployment resumes from EXACT digest without rebuild or wider IAM',()=>{
 const s=fs.readFileSync(resume,'utf8');
 assert.match(s,/IMAGE_DIGEST="sha256:ba69188de7d71b9410ccc519b0249388d66401a01c20d09bb687932265f71678"/);
 assert.match(s,/\[ "\$ACTUAL_DIGEST" = "\$IMAGE_DIGEST" \]/);
 assert.match(s,/--member="user:\$ACCOUNT"/);
 assert.match(s,/--role="roles\/iam.serviceAccountUser"/);
 assert.match(s,/gcloud run deploy "\$TEMP"/);
 assert.match(s,/--no-allow-unauthenticated --invoker-iam-check/);
 assert.match(s,/--set-env-vars="LSZH_PORTAL_STAGING_ENABLED=false"/);
 assert.match(s,/--labels="lszh-purpose=offer-browser-smoke,lszh-temporary=true"/);
 assert.match(s,/gcloud run services add-iam-policy-binding "\$TEMP"/);
 assert.doesNotMatch(s,/gcloud builds submit|gcloud iam service-accounts create/);
 assert.doesNotMatch(s,/gcloud projects add-iam-policy-binding/);
 assert.doesNotMatch(s,/gcloud run deploy "\$ORIGINAL"/);
});

test('network smoke only calls read-only APIs, authenticated proxy and blocked HTTP GET/POST',()=>{
 const s=fs.readFileSync(smoke,'utf8');
 assert.match(s,/gcloud run services proxy "\$TEMP"/);
 assert.match(s,/gcloud run services get-iam-policy "\$TEMP"/);
 assert.match(s,/gcloud run services describe "\$TEMP"/);
 assert.match(s,/offer-cloud-readiness-readonly\.py/);
 assert.match(s,/\[ "\$STATUS" = "503" \]/);
 assert.match(s,/--data '\{"code":"SYNTHETIC_NOT_VALID"\}'/);
 assert.doesNotMatch(s,/gcloud run deploy|gcloud builds submit|gcloud run services update/);
 assert.doesNotMatch(s,/gcloud iam service-accounts (create|delete|add-iam-policy-binding)/);
 assert.doesNotMatch(s,/gcloud run services (delete|add-iam-policy-binding)/);
 assert.doesNotMatch(s,/gcloud auth print-identity-token|Authorization: Bearer/);
});

test('static demo release targets only existing labelled IAM-protected temporary service',()=>{
 const s=fs.readFileSync(demo,'utf8');
 assert.match(s,/gcloud run deploy "\$TEMP"/);
 assert.match(s,/--ingress=all --no-allow-unauthenticated --invoker-iam-check/);
 assert.match(s,/--set-env-vars="LSZH_PORTAL_STAGING_ENABLED=false,LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED=true,GOOGLE_CLOUD_PROJECT=lszh-automations"/);
 assert.match(s,/--labels="lszh-purpose=offer-browser-smoke,lszh-temporary=true"/);
 assert.match(s,/gcloud run services get-iam-policy "\$TEMP"/);
 assert.match(s,/lszh-offer-browser-staging-00001-7kx/);
 assert.match(s,/offer-cloud-readiness-readonly\.py/);
 assert.doesNotMatch(s,/gcloud run (deploy|services update) "lszh-offer-portal-staging"/);
 assert.doesNotMatch(s,/gcloud iam service-accounts (create|delete|add-iam-policy-binding)/);
 assert.doesNotMatch(s,/gcloud run services add-iam-policy-binding/);
 const cleanup=fs.readFileSync(clean,'utf8');
 assert.match(cleanup,/env\.get\("LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED"\)=="true"/);
});

test('deployed static-demo smoke remains read-only and blocks all offer APIs',()=>{
 const s=fs.readFileSync(staticSmoke,'utf8');
 assert.match(s,/EXPECTED_REVISION="lszh-offer-browser-staging-00002-fkq"/);
 assert.match(s,/gcloud run services proxy "\$TEMP"/);
 assert.match(s,/get-iam-policy "\$TEMP"/);
 assert.match(s,/LSZH_PORTAL_STAGING_ENABLED"\)=="false"/);
 assert.match(s,/LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED"\)=="true"/);
 assert.match(s,/connect-src 'none'/);
 assert.match(s,/form-action 'none'/);
 assert.match(s,/MUSTER-2026-001/);
 assert.match(s,/for route in '\/api\/offer\/preview' '\/api\/offer\/document' '\/api\/offer\/accept'/);
 assert.match(s,/offer-cloud-readiness-readonly\.py/);
 assert.doesNotMatch(s,/gcloud (run deploy|builds submit|run services update|run services delete|projects add-iam-policy-binding)/);
 assert.doesNotMatch(s,/gcloud iam service-accounts (create|delete|add-iam-policy-binding)/);
 assert.doesNotMatch(s,/gcloud run services add-iam-policy-binding/);
 assert.doesNotMatch(s,/gcloud auth print-identity-token|Authorization: Bearer/);
});

test('temporary Drive probe release never deploys to original or grants IAM roles',()=>{
 const s=fs.readFileSync(driveProbeRelease,'utf8');
 assert.match(s,/offer-cloud-readiness-readonly\.py/);
 assert.match(s,/offer-temp-drive-folder-reader\.py/);
 assert.match(s,/TEMP="lszh-offer-browser-staging"/);
 assert.match(s,/lszh-offer-browser-staging-00002-fkq/);
 assert.match(s,/--no-allow-unauthenticated --invoker-iam-check/);
 assert.match(s,/LSZH_PORTAL_STAGING_ENABLED: "false"/);
 assert.match(s,/LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED: "true"/);
 assert.match(s,/LSZH_OFFER_TEMP_DRIVE_PROBE_ENABLED: "true"/);
 assert.match(s,/LSZH_OFFER_TEMP_DRIVE_PROBE_FOLDER: "\$FOLDER"/);
 assert.match(s,/--min-instances=0 --max-instances=1/);
 assert.match(s,/gcloud run deploy "\$TEMP"/);
 assert.match(s,/lszh-purpose=offer-browser-smoke,lszh-temporary=true/);
 assert.doesNotMatch(s,/gcloud run deploy "lszh-offer-portal-staging"/);
 assert.doesNotMatch(s,/gcloud run services update-traffic "lszh-offer-portal-staging"/);
 assert.doesNotMatch(s,/gcloud (iam service-accounts add-iam-policy-binding|run services add-iam-policy-binding|projects add-iam-policy-binding)/);
 assert.doesNotMatch(s,/gcloud firestore|gcloud run jobs/);
});
