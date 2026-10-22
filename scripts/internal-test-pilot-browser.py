#!/usr/bin/env python3
"""Authenticated private operator browser bridge for exactly one internal offer.
The personalized invitation stays server-side, out of URLs, UI and access logs.
Cloud Run keeps IAM invoker enforcement; this adds no public cloud permission.
"""
import json, os, subprocess, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler,HTTPServer
from pathlib import Path
ORIGIN='https://cloud-e2e---lszh-offer-browser-staging-ozx7mp2bka-oa.a.run.app'
STATE=Path.home()/'.lszh-internal-test-pilot-20261019.json'
GCLOUD='gcloud.cmd' if os.name=='nt' else 'gcloud'
HOST='127.0.0.1' if os.name=='nt' else '0.0.0.0'
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):self.forward()
 def do_POST(self):self.forward()
 def forward(self):
  try:
   if self.command=='GET' and self.path=='/offerte-annehmen/':body=None
   elif self.command=='POST' and self.path in ['/api/offer/preview','/api/offer/document','/api/offer/accept']:
    n=int(self.headers.get('Content-Length','0'))
    if not 0<n<=12288:raise ValueError()
    data=json.loads(self.rfile.read(n));state=json.loads(STATE.read_text())
    if state['recordId']!='recR70ZSPynGqA1LS':raise ValueError()
    data['code']=state['code'];body=json.dumps(data).encode()
   else:self.send_error(404);return
   identity=subprocess.run([GCLOUD,'auth','print-identity-token','--account=lars@lszh-automations.ch'],capture_output=True,text=True,timeout=30)
   if identity.returncode:raise ValueError()
   req=urllib.request.Request(ORIGIN+self.path,data=body,headers={
    'Authorization':'Bearer '+identity.stdout.strip(),'Origin':ORIGIN,'Content-Type':'application/json'})
   try:
    with urllib.request.build_opener(NoRedirect()).open(req,timeout=90) as response:
     status=response.status;payload=response.read(13*1024*1024);kind=response.headers.get('Content-Type','application/octet-stream')
   except urllib.error.HTTPError as error:
    status=error.code;payload=b'{"error":"temporarily_unavailable"}';kind='application/json'
   if body is None and status==200:
    # The browser uses a non-secret placeholder. The bridge alone supplies the
    # real code in POST bodies to the IAM-private, exact-record Cloud Run tag.
    payload=payload.replace(b"const code=params.get('code')||'';",b"const code='"+b'I'*48+b"';")
   self.send_response(status)
   for k,v in [('Content-Type',kind),('Cache-Control','no-store'),('X-Content-Type-Options','nosniff'),('Referrer-Policy','no-referrer')]:self.send_header(k,v)
   self.end_headers();self.wfile.write(payload)
  except Exception:
   self.send_response(503);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"error":"temporarily_unavailable"}')
if __name__=='__main__':
 print('TEST_ONLY browser bridge on '+HOST+':8080; no token in URL/logs.',flush=True)
 HTTPServer((HOST,8080),Handler).serve_forever()
