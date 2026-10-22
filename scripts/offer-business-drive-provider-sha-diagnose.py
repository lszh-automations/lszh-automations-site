#!/usr/bin/env python3
"""READ-ONLY diagnosis of Drive-supplied SHA256 vs independently verified PDF bytes.

Used only under the business Google account. All file IDs and stored hashes
are operator arguments, never hardcoded or printed. No Cloud Run, IAM,
Firestore, upload, update or permission changes.
"""
import argparse
import json
import re
import subprocess
import sys
from urllib import parse, request, error

ACCOUNT="lars@lszh-automations.ch"
EXPECTED_NAMES={
 "TEST_ONLY_quote_AVV_JA_NO_CONTRACT.pdf",
 "TEST_ONLY_quote_AVV_NEIN_NO_CONTRACT.pdf",
 "TEST_ONLY_project_terms_NO_CONTRACT.pdf",
 "TEST_ONLY_avv_NO_CONTRACT.pdf",
}
ID=re.compile(r"[A-Za-z0-9_-]{20,100}\Z")
SHA=re.compile(r"[0-9a-f]{64}\Z")

class GateError(Exception):pass

def spec(s):
 p=s.split(",")
 if len(p)!=3 or not ID.fullmatch(p[0]) or not p[1].isdigit() or not SHA.fullmatch(p[2]):
  raise GateError("invalid_file_spec")
 n=int(p[1])
 if not 100<=n<=12*1024*1024:raise GateError("invalid_file_size")
 return p[0],n,p[2]

def evaluate(meta,file_id,size,digest,folder):
 if meta.get("id")!=file_id or meta.get("name") not in EXPECTED_NAMES:
  return "IDENTITY_MISMATCH"
 if meta.get("mimeType")!="application/pdf" or meta.get("parents")!=[folder]:
  return "PARENT_OR_MIME_MISMATCH"
 if str(meta.get("size"))!=str(size):
  return "STORED_SIZE_MISMATCH"
 if not any(x.get("readOnly") is True for x in (meta.get("contentRestrictions") or [])):
  return "LOCK_NOT_REPORTED"
 sha=meta.get("sha256Checksum")
 if sha is None:return "PROVIDER_SHA256_MISSING"
 if sha!=digest:return "PROVIDER_SHA256_DIFFERS"
 return "PROVIDER_SHA256_MATCH"

def cli(*a):
 return subprocess.run(a,check=True,capture_output=True,text=True,timeout=25).stdout.strip()

def run(folder,arguments):
 if not ID.fullmatch(folder):raise GateError("invalid_parent")
 if len(arguments)!=4:raise GateError("expected_exactly_four")
 items=[spec(x) for x in arguments]
 if len({x[0] for x in items})!=4:raise GateError("duplicate_file")
 if cli("gcloud","config","get-value","account")!=ACCOUNT:
  raise GateError("business_account_required")
 token=cli("gcloud","auth","print-access-token")
 if not token or "\n" in token:raise GateError("no_access_token")
 seen=set();outcomes=[]
 for file_id,size,digest in items:
  url="https://www.googleapis.com/drive/v3/files/"+parse.quote(file_id)+"?"+parse.urlencode({
   "fields":"id,name,mimeType,size,parents,contentRestrictions(readOnly),sha256Checksum",
   "supportsAllDrives":"true"})
  req=request.Request(url,headers={"Authorization":"Bearer "+token,
   "X-Goog-User-Project":"lszh-automations",
   "Accept":"application/json"},method="GET")
  with request.urlopen(req,timeout=25) as res:
   raw=res.read(64*1024+1)
  if len(raw)>64*1024:raise GateError("unbounded_metadata")
  data=json.loads(raw)
  name=data.get("name")
  if name in seen:raise GateError("duplicate_name")
  seen.add(name)
  outcome=evaluate(data,file_id,size,digest,folder)
  outcomes.append(outcome)
  print("CHECK "+name+": "+outcome)
 if seen!=EXPECTED_NAMES:raise GateError("wrong_file_set")
 if all(o=="PROVIDER_SHA256_MATCH" for o in outcomes):
  print("PASS: Drive metadata SHA256 matches all four stored PDFs. Diagnose Cloud Run service identity/scopes or folder listing next.")
 else:
  print("NO-GO: one or more provider SHA256 metadata fields do not match our locally computed checksums.")
  print("The existing archive verifier requires provider SHA256; do not loosen checks or grant IAM.")
  raise SystemExit(1)
 print("READ-ONLY: no Drive writes, Cloud Run changes or extra grants.")

def selftest():
 folder="1SYNTHETIC_FOLDER_1234567890"
 fid="1SYNTHETIC_FILE_1234567890000"
 expected="a"*64
 meta={"id":fid,"name":"TEST_ONLY_avv_NO_CONTRACT.pdf","size":"100",
  "mimeType":"application/pdf","parents":[folder],
  "contentRestrictions":[{"readOnly":True}],"sha256Checksum":expected}
 assert evaluate(meta,fid,100,expected,folder)=="PROVIDER_SHA256_MATCH"
 changed={**meta,"sha256Checksum":"b"*64}
 assert evaluate(changed,fid,100,expected,folder)=="PROVIDER_SHA256_DIFFERS"
 missing={k:v for k,v in meta.items() if k!="sha256Checksum"}
 assert evaluate(missing,fid,100,expected,folder)=="PROVIDER_SHA256_MISSING"
 unlocked={**meta,"contentRestrictions":[{"readOnly":False}]}
 assert evaluate(unlocked,fid,100,expected,folder)=="LOCK_NOT_REPORTED"
 wrong={**meta,"parents":["1WRONG_FOLDER_12345678901234"]}
 assert evaluate(wrong,fid,100,expected,folder)=="PARENT_OR_MIME_MISMATCH"
 assert spec(fid+",100,"+expected)==(fid,100,expected)
 import inspect
 assert '"X-Goog-User-Project":"lszh-automations"' in inspect.getsource(run)
 print("PASS: local read-only Drive SHA metadata diagnostic self-test (quota project set)")

if __name__=="__main__":
 if sys.argv[1:]==["--self-test"]:
  selftest()
 else:
  ap=argparse.ArgumentParser(description=__doc__)
  ap.add_argument("--folder",required=True)
  ap.add_argument("--file",required=True,action="append")
  args=ap.parse_args()
  try:run(args.folder,args.file)
  except GateError as ex:
   print("NO-GO: "+str(ex));sys.exit(2)
  except error.HTTPError as ex:
   print("NO-GO: Google Drive metadata HTTP "+str(ex.code)+".")
   if ex.code in (401,403):print("Verify current business-user Drive OAuth scope, without sharing tokens.")
   sys.exit(3)
  except (subprocess.CalledProcessError,subprocess.TimeoutExpired,OSError,json.JSONDecodeError):
   print("NO-GO: read-only metadata diagnostic could not complete.");sys.exit(4)
