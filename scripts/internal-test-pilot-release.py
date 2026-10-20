#!/usr/bin/env python3
"""One private no-traffic TEST_ONLY revision on the existing browser staging service.
The two temporary secret grants are explicitly operator-approved for this pilot.
No production enablement, customer release, source creation or acceptance POST.
"""
import importlib.util, json, sys, tempfile
from pathlib import Path
from datetime import datetime, timezone
spec=importlib.util.spec_from_file_location('release',Path(__file__).with_name('offer-browser-synthetic-release.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
r.SOURCE='ca1c7f036c07af6e3e75cd425a041e80341b10ee'
RECORD='recR70ZSPynGqA1LS'
REVISION=r.SERVICE+'-00010-lars'
IMAGE=r.REGION+'-docker.pkg.dev/'+r.PROJECT+'/cloud-run-source-deploy/lszh-offer-browser-staging:internal-'+r.SOURCE[:12]
CONDITION='expression=request.time < timestamp("2026-10-19T14:00:00Z"),title=internal-test-only-20261019'
def protected():
 r.protected_portal()
 s=r.service(r.SERVICE);r.private_service(s)
 r.require(r.traffic(s)=={r.BASELINE:100},'baseline_traffic_changed')
 prod=r.service('lszh-offer-portal')
 env={e['name']:e.get('value') for e in prod['spec']['template']['spec']['containers'][0].get('env',[])}
 r.require(env.get('LSZH_PORTAL_PRODUCTION_ENABLED')=='false','production_gate_changed')
 return s
def grants(action):
 if action=='add':
  # Do not grant already-expired access or start a test with too little time left.
  deadline=datetime.fromisoformat('2026-10-19T14:00:00+00:00')
  r.require((deadline-datetime.now(timezone.utc)).total_seconds()>=1800,
            'pilot_iam_window_expired_or_less_than_30min_manual_review')
 for secret in r.SECRETS.values():
  r.cloud(['secrets',action+'-iam-policy-binding',secret,'--member=serviceAccount:'+r.SA,
   '--role=roles/secretmanager.secretAccessor','--condition='+CONDITION])
def apply(resume_build=None):
 s=protected()
 r.require(not any(t.get('tag')==r.TAG for t in s['status'].get('traffic',[])),'pilot_tag_exists_inspect_before_retry')
 revs=r.cloud(['run','revisions','list','--service='+r.SERVICE,'--region='+r.REGION])
 r.require(not any(v['metadata']['name']==REVISION for v in revs),'pilot_revision_exists_inspect_before_retry')
 if resume_build:
  r.require(resume_build=='965c746c-3692-4f05-ac68-fb5ac31cf25d','unexpected_resume_build')
  build=r.cloud(['builds','describe',resume_build,'--region='+r.REGION])
  r.require(build.get('images')==[IMAGE],'resume_image_mismatch')
 else:
  with tempfile.TemporaryDirectory(prefix='lszh-internal-pilot-') as d:
   r.package(Path(d))
   print('BUILD: isolated internal TEST_ONLY code package',flush=True)
   build=r.cloud(['builds','submit',d,'--region='+r.REGION,'--tag='+IMAGE,'--suppress-logs'],timeout=1800)
 r.require(build.get('status')=='SUCCESS','build_failed')
 images=[i for i in build.get('results',{}).get('images',[]) if i.get('name')==IMAGE]
 r.require(len(images)==1,'build_digest_missing')
 image=IMAGE.split(':')[0]+'@'+images[0]['digest']
 protected();grants('add')
 env={
  'GOOGLE_CLOUD_PROJECT':r.PROJECT,'LSZH_PORTAL_STAGING_ENABLED':'true',
  'LSZH_PORTAL_BROWSER_PILOT_ENABLED':'true','LSZH_INTERNAL_TEST_PILOT_ENABLED':'true',
  'LSZH_PORTAL_DATABASE':'lszh-offers-staging','LSZH_PORTAL_ARCHIVE_FOLDER':'10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko',
  'LSZH_PORTAL_TERMS_VERSION':'TEST_v1.0_RC1','LSZH_PORTAL_ORIGIN':r.ORIGIN,
  'LSZH_PORTAL_SYNTHETIC_ACCEPT_ENABLED':'true','LSZH_PORTAL_SYNTHETIC_SOURCE_RECORD_ID':RECORD,
  'LSZH_SYNTHETIC_AIRTABLE_WRITEBACK_ENABLED':'true',
  'LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED':'false','LSZH_OFFER_TEMP_DRIVE_PROBE_ENABLED':'false'}
 r.cloud(['run','deploy',r.SERVICE,'--region='+r.REGION,'--image='+image,'--service-account='+r.SA,
  '--revision-suffix=00010-lars','--no-traffic','--tag='+r.TAG,'--invoker-iam-check',
  '--set-env-vars='+','.join(k+'='+v for k,v in env.items()),
  '--set-secrets='+','.join(k+'='+v+':1' for k,v in r.SECRETS.items()),
  '--min-instances=0','--max-instances=1','--concurrency=1','--memory=512Mi','--cpu=1','--timeout=60'],timeout=900)
 s=protected()
 tag=[t for t in s['status']['traffic'] if t.get('tag')==r.TAG]
 r.require(len(tag)==1 and tag[0].get('revisionName')==REVISION and tag[0].get('percent',0)==0,'tag_mismatch')
 print('PASS: private TEST_ONLY revision ready, baseline 100%, production false; no acceptance or mail.',flush=True)
def cleanup():
 s=protected()
 if any(t.get('tag')==r.TAG for t in s['status'].get('traffic',[])):
  r.cloud(['run','services','update-traffic',r.SERVICE,'--region='+r.REGION,'--remove-tags='+r.TAG])
 grants('remove')
 s=protected()
 r.require(not any(t.get('tag')==r.TAG for t in s['status'].get('traffic',[])),'tag_cleanup_failed')
 for secret in r.SECRETS.values():
  p=r.cloud(['secrets','get-iam-policy',secret])
  r.require(not any('serviceAccount:'+r.SA in b.get('members',[]) for b in p.get('bindings',[])),'secret_cleanup_failed')
 print('PASS: pilot tag and both temporary secret grants removed; private revision retired without traffic.',flush=True)
if __name__=='__main__':
 try:
  if len(sys.argv)==3 and sys.argv[1]=='--resume-build':apply(sys.argv[2])
  elif sys.argv[1:] == ['--cleanup']:cleanup()
  else:raise RuntimeError('only_resume_existing_build_or_cleanup_allowed')
 except Exception as e:
  print('STOP:',str(e) if isinstance(e,RuntimeError) else type(e).__name__)
  print('Inspect state before retry; cleanup remains available.');raise SystemExit(1)
