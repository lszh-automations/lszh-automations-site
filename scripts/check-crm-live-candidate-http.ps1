# Read-only HTTP smoke check for a Cloud Run CRM V2 candidate/tag URL.
# Does NOT pass the website intake secret or a Google ID token.
# No writes to Firestore, no public website changes.
param([Parameter(Mandatory=$true)][string]$CandidateUrl)
$ErrorActionPreference="Stop"
$base=$CandidateUrl.TrimEnd("/")
try{$uri=[Uri]$base}catch{throw "Ungueltige Kandidaten-URL"}
if($uri.Scheme -ne "https" -or $uri.Host -notmatch "^crm-v2-candidate---lszh-crm-v2-[a-z0-9-]+[.](a[.]run[.]app|europe-west6[.]run[.]app)$"){
  throw "Nur der getaggte Cloud-Run-Kandidat ist erlaubt. Nicht die Live- oder Staging-URL verwenden."
}
function Query([string]$method,[string]$endpoint,[string]$body=""){
  try{
    $p=@{UseBasicParsing=$true;Method=$method;Uri=$base+$endpoint;TimeoutSec=30;ErrorAction="Stop"}
    if($method -eq "POST"){$p.ContentType="application/json";$p.Body=$body}
    $r=Invoke-WebRequest @p
    return @{status=[int]$r.StatusCode;content=$r.Content}
  }catch{
    $r=$_.Exception.Response
    if(!$r -or !$r.StatusCode){throw}
    return @{status=[int]$r.StatusCode;content=""}
  }
}
$homeResponse=Query "GET" "/"
if($homeResponse.status -ne 200 -or $homeResponse.content -notmatch "LSZH"){throw "Kandidaten-UI liefert kein CRM-HTML: $($homeResponse.status)"}
$config=Query "GET" "/api/config"
if($config.status -ne 200){throw "Google OAuth-Konfiguration nicht vorhanden: $($config.status)"}
$me=Query "GET" "/api/me"
if($me.status -ne 401){throw "Unberechtigte API-Anfrage muss 401 liefern (erhalten $($me.status))"}
$records=Query "GET" "/api/records/leads"
if($records.status -ne 401){throw "CRM-Daten ohne ID Token muessen 401 liefern"}
$print=Query "GET" "/api/print/offerte/test"
if($print.status -ne 401){throw "Offerten-Druck ohne ID Token muss 401 liefern"}
# No bearer header at all: this request must fail before body is read or stored.
$ingest=Query "POST" "/api/internal/website-leads" '{"TEST_ONLY":true}'
if($ingest.status -ne 401){throw "Website-Webhook ohne Server-Secret muss 401 liefern"}
Write-Host "PASS: HTML 200; Google Config 200; API/CRM/Print/Website-Webhook ohne Berechtigung 401."
Write-Host "PASS: Keine Firestore-Daten geschrieben, kein Secret uebertragen."
