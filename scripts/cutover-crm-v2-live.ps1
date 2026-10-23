# LSZH CRM V2 - authorised productive traffic cutover with an HTTP website lead
# smoke test and automatic rollback on failure. No Render or Make changes.
#
# Approved previous revision: lszh-crm-v2-00002-6lh
# Approved V2 revision:       lszh-crm-v2-00004-mez
# This intentionally creates one TEST_ONLY website lead in live Firestore.
param(
  [string]$Project="lszh-automations",
  [string]$Region="europe-west6",
  [string]$Website="https://lszh-automations.ch"
)
$ErrorActionPreference="Stop"
$service="lszh-crm-v2"
$previous="lszh-crm-v2-00002-6lh"
$candidate="lszh-crm-v2-00004-mez"
$tag="crm-v2-candidate"
$serviceAccount="lszh-crm-v2@$Project.iam.gserviceaccount.com"
$backup="gs://lszh-firestore-backups-470613067122/backups/20261023-094036/20261023-094036.overall_export_metadata"
$productionUrl="https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app"
$candidateUrl="https://crm-v2-candidate---lszh-crm-v2-ozx7mp2bka-oa.a.run.app"
$switchoverAttempted=$false
$completed=$false

function CheckExit([string]$message) {
  if($LASTEXITCODE -ne 0){throw $message}
}
function DescribeService {
  $json=(& gcloud.cmd run services describe $service --project $Project --region $Region --format=json) -join [Environment]::NewLine
  CheckExit "Cloud Run Dienst nicht lesbar"
  return ($json | ConvertFrom-Json)
}
function EnvItem($container,[string]$key) {
  $matches=@($container.env | Where-Object { $_.name -eq $key })
  if($matches.Count -ne 1){throw "Umgebungsvariable fehlt/ist mehrdeutig: $key"}
  return $matches[0]
}
function ActiveRevision($svc) {
  $active=@($svc.status.traffic | Where-Object { $_.percent -gt 0 })
  if($active.Count -ne 1 -or [int]$active[0].percent -ne 100){return "UNEXPECTED_SPLIT"}
  return [string]$active[0].revisionName
}
function Http([string]$uri,[string]$method="GET",[string]$body="",[string]$origin="") {
  $parameters=@{Uri=$uri;Method=$method;UseBasicParsing=$true;TimeoutSec=30;ErrorAction="Stop"}
  if($origin){$parameters.Headers=@{Origin=$origin}}
  if($method -eq "POST"){$parameters.Body=$body;$parameters.ContentType="application/json"}
  try {
    $resp=Invoke-WebRequest @parameters
    return @{status=[int]$resp.StatusCode;content=[string]$resp.Content}
  } catch {
    if($_.Exception.Response -and $_.Exception.Response.StatusCode){
      return @{status=[int]$_.Exception.Response.StatusCode;content=""}
    }
    throw
  }
}
function RollBack {
  Write-Warning "Rueckfall auf die fruehere produktive Revision wird ausgefuehrt."
  & gcloud.cmd run services update-traffic $service --project $Project --region $Region ("--to-revisions="+$previous+"=100") --quiet
  CheckExit "KRITISCH: Rollback-Kommando fehlgeschlagen; Cloud Run Traffic sofort manuell pruefen!"
  $after=DescribeService
  if((ActiveRevision $after) -ne $previous){
    throw "KRITISCH: Rueckfall ist noch nicht bestaetigt; Cloud Run Routing sofort pruefen!"
  }
  Write-Host "ROLLBACK PASS: $previous erhaelt wieder 100 Prozent Traffic."
}
if($Project -ne "lszh-automations" -or $Region -ne "europe-west6"){throw "Projekt/Region nicht freigegeben"}
if($Website -notin @("https://lszh-automations.ch","https://www.lszh-automations.ch")){throw "Nur offizielle Website-Origin erlaubt"}
if(-not (Get-Command gcloud.cmd -ErrorAction SilentlyContinue)){throw "gcloud CLI fehlt"}
$worktree=Split-Path $PSScriptRoot -Parent
Push-Location $worktree
try {
  $branch=((& git branch --show-current) -join "").Trim()
  if($LASTEXITCODE -ne 0 -or $branch -ne "feature/crm-v2-cloud-staging-20261023"){throw "Unerwarteter Git-Branch"}
  $dirty=((& git status --porcelain) -join "").Trim()
  if($LASTEXITCODE -ne 0 -or $dirty){throw "Lokale Git-Aenderungen vorhanden. Bitte vor Cutover pruefen."}
} finally {Pop-Location}

Write-Host "1. Vorbedingungen vor dem Produktivwechsel lesen"
$before=DescribeService
if((ActiveRevision $before) -ne $previous){throw "Aktive Live-Revision hat sich geaendert. Abbruch."}
$tagTargets=@($before.status.traffic | Where-Object {$_.tag -eq $tag})
if($tagTargets.Count -ne 1 -or $tagTargets[0].revisionName -ne $candidate -or [int]$tagTargets[0].percent -ne 0){
  throw "Getaggte Kandidatenrevision stimmt nicht. Abbruch."
}
if($before.spec.template.spec.serviceAccountName -ne $serviceAccount){throw "Live-Servicekonto ist nicht das erwartete CRM-Servicekonto"}
$container=@($before.spec.template.spec.containers)[0]
$secretRef=(EnvItem $container "CRM_INGEST_SECRET").valueFrom.secretKeyRef
if(!$secretRef -or !$secretRef.name){throw "Serverseitiger Website-Intake Secret Manager Bezug fehlt"}
if((EnvItem $container "CRM_RECORD_PREFIX").value -ne "lszh_crm_v2_"){throw "Produktiv-Präfix ist nicht lszh_crm_v2_"}
if((EnvItem $container "CRM_WEBSITE_INTAKE_ENABLED").value -ne "true"){throw "Website-Intake ist am Kandidaten nicht aktiviert"}
if((EnvItem $container "GOOGLE_OAUTH_CLIENT_ID").value -ne "470613067122-ib82le89g17hqaq3ljd005jiglep7pk1.apps.googleusercontent.com"){
  throw "Google OAuth ID hat sich geaendert"
}
if((EnvItem $container "CRM_ALLOWED_EMAILS").value -ne "lars@lszh-automations.ch"){throw "CRM E-Mail-Allowlist hat sich geaendert"}
& gcloud.cmd storage ls $backup --project $Project | Out-Null
CheckExit "Firestore-Backup-Metadaten nicht lesbar"
# Check the externally reachable website before changing its downstream Cloud Run revision.
$homepage=Invoke-WebRequest -UseBasicParsing -Uri ($Website+"/") -TimeoutSec 30 -ErrorAction Stop
if([int]$homepage.StatusCode -ne 200){throw "Oeffentliche Website nicht erreichbar"}
$finalUri=[Uri]$homepage.BaseResponse.ResponseUri
if($finalUri.Scheme -ne "https" -or $finalUri.Host -notin @("lszh-automations.ch","www.lszh-automations.ch")){
  throw "Unerwartete Redirect-Adresse der Website"
}
$origin=$finalUri.GetLeftPart([UriPartial]::Authority)
Write-Host "PASS: Website erreichbar unter $origin"
Write-Host "PASS: Altrevision, Kandidat-Tag, CRM-Praefix, OAuth, Secret und Backup vorhanden"
$preflight=Http ($candidateUrl+"/api/records/leads")
if($preflight.status -ne 401){throw "Kandidaten-API ohne ID-Token muss HTTP 401 liefern"}
Write-Host "PASS: Kandidaten-API bleibt ohne Anmeldung gesperrt"

try {
  Write-Host "2. Erteilte Freigabe umsetzen: CRM V2 Revision erhaelt 100 Prozent Traffic"
  $switchoverAttempted=$true
  & gcloud.cmd run services update-traffic $service --project $Project --region $Region ("--to-revisions="+$candidate+"=100") --quiet
  CheckExit "Cloud-Run-Traffic-Update fehlgeschlagen"
  $after=DescribeService
  if((ActiveRevision $after) -ne $candidate){throw "V2 hat nicht 100 Prozent Traffic"}
  Write-Host "PASS: $candidate erhaelt 100 Prozent produktiven Traffic"

  Write-Host "3. Live-CRM-URL und anonymen API-Schutz kontrollieren"
  $crmHomeResponse=Http ($productionUrl+"/")
  if($crmHomeResponse.status -ne 200 -or $crmHomeResponse.content -notmatch "LSZH"){throw "CRM V2 Live-HTML nicht erreichbar"}
  $config=Http ($productionUrl+"/api/config")
  if($config.status -ne 200){throw "CRM V2 OAuth-Konfiguration fehlt"}
  $records=Http ($productionUrl+"/api/records/leads")
  if($records.status -ne 401){throw "Live-Leads sind ohne Anmeldung zugreifbar oder API fehlerhaft"}
  Write-Host "PASS: CRM V2 auf der produktiven URL sichtbar, API geschuetzt"

  Write-Host "4. Echte oeffentliche Website -> Render -> Cloud Run -> Firestore testen"
  $submission=[guid]::NewGuid().ToString()
  $fields=[ordered]@{
    submission_id=$submission
    name="TEST_ONLY Website Go-Live"
    company="TEST_ONLY LSZH CRM V2"
    email="lszh-cutover-test@example.com"
    street="Musterweg 1"
    postal_code="5610"
    city="Wohlen"
    country="Schweiz"
    message="TEST_ONLY: Verifizierte LSZH Website und CRM V2 Integration"
    current_process="TEST_ONLY manuell"
    systems="TEST_ONLY Testsystem"
    main_problem="TEST_ONLY Website Intake"
    frequency="Taeglich"
    desired_result="TEST_ONLY CRM V2"
  }
  $payload=$fields | ConvertTo-Json -Compress -Depth 5
  $formEndpoint=$origin+"/api/lead"
  $first=Http $formEndpoint "POST" $payload $origin
  if($first.status -ne 200){throw "Website-Anfrage nicht HTTP 200 bestaetigt: HTTP $($first.status)"}
  try{$receipt=$first.content|ConvertFrom-Json}catch{throw "Website liefert keine gueltige JSON-Bestaetigung"}
  if(!$receipt.confirmed -or !$receipt.ok -or $receipt.recordId -notmatch "^web_[0-9a-f]{32}$"){
    throw "Website hat Firestore-Speicherung nicht bestaetigt"
  }
  $second=Http $formEndpoint "POST" $payload $origin
  if($second.status -ne 200){throw "Identischer Website-Retry nicht erfolgreich: HTTP $($second.status)"}
  try{$repeat=$second.content|ConvertFrom-Json}catch{throw "Website-Retry liefert kein JSON"}
  if(!$repeat.confirmed -or $repeat.recordId -ne $receipt.recordId){throw "Website-Retry hat einen anderen Datensatz bestaetigt"}
  Write-Host "PASS: ECHTES Website-Formular-Backend -> CRM V2 -> Firestore bestaetigt"
  Write-Host "PASS: Identische Formulareinreichung erzeugt KEIN zweites Lead-Dokument"
  Write-Host "TEST_ONLY LIVE LEAD ID: $($receipt.recordId)"
  $completed=$true
} finally {
  if($switchoverAttempted -and !$completed){
    RollBack
  }
}
Write-Host "GO-LIVE PASS: CRM V2 aktiv; 100 Prozent Traffic, echte Website-Leads in Live-Firestore."
Write-Host "NEXT: im Live CRM Dashboard TEST_ONLY LSZH CRM V2 unter Website Leads kontrollieren."
Write-Host "Hinweis: Der TEST_ONLY Datensatz bleibt als nachvollziehbarer Smoke-Test erhalten."
