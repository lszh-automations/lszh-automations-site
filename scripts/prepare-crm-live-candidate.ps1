# LSZH CRM V2 Live-Candidate preflight.
# DEFAULT: READ ONLY. Explicit -Deploy builds a tagged 0%-traffic revision
# of the EXISTING lszh-crm-v2 service. Does not switch Render/website traffic.
param(
  [string]$Project="lszh-automations",
  [string]$Region="europe-west6",
  [string]$ExpectedLiveRevision="lszh-crm-v2-00002-6lh",
  [string]$OAuthClientId="470613067122-ib82le89g17hqaq3ljd005jiglep7pk1.apps.googleusercontent.com",
  [string]$AllowedEmails="lars@lszh-automations.ch",
  [switch]$Deploy
)
$ErrorActionPreference="Stop"
$service="lszh-crm-v2"
$tag="crm-v2-candidate"
$expectedAccount="lszh-crm-v2@$Project.iam.gserviceaccount.com"
$source=Join-Path (Split-Path $PSScriptRoot -Parent) "crm-v2"
$repoRoot=Split-Path $PSScriptRoot -Parent
if($Project -ne "lszh-automations" -or $Region -ne "europe-west6"){throw "Projekt/Region nicht freigegeben"}
if($service -ne "lszh-crm-v2"){throw "Live-Dienstname muss exakt stimmen"}
if($OAuthClientId -notmatch "^[a-zA-Z0-9.-]+[.]apps[.]googleusercontent[.]com$"){throw "Google OAuth Client-ID ungueltig"}
if($AllowedEmails -notmatch "^[^, @]+@[^, @]+([.][^, @]+)+(,[^, @]+@[^, @]+([.][^, @]+)+)*$"){throw "AllowedEmails ungueltig"}
foreach($cmd in @("gcloud.cmd","git","node")){
  if(-not (Get-Command $cmd -ErrorAction SilentlyContinue)){throw "$cmd fehlt"}
}
if(-not (Test-Path (Join-Path $source "cloud-records.js"))){throw "Cloud-CRM-Version fehlt im Worktree"}
Push-Location $repoRoot
try{
  $gitBranch=((& git branch --show-current) -join "").Trim()
  if($LASTEXITCODE -ne 0 -or $gitBranch -ne "feature/crm-v2-cloud-staging-20261023"){
    throw "Abbruch: falscher Git-Branch. Nur der getestete Cloud-Staging-Branch ist freigegeben."
  }
  $dirty=((& git status --porcelain) -join "").Trim()
  if($LASTEXITCODE -ne 0 -or $dirty){throw "Abbruch: lokale nicht gespeicherte oder unversionierte Dateien vorhanden."}
  $sha=((& git rev-parse --short HEAD) -join "").Trim()
  if($LASTEXITCODE -ne 0){throw "Git Commit konnte nicht bestimmt werden."}
}finally{Pop-Location}
function ReadService {
  $json=(& gcloud.cmd run services describe $service --project $Project --region $Region --format=json) -join [Environment]::NewLine
  if($LASTEXITCODE -ne 0){throw "Live-Dienst nicht lesbar"}
  return $json|ConvertFrom-Json
}
function GetSecretBinding($svc){
  $container=@($svc.spec.template.spec.containers)[0]
  $matches=@($container.env|Where-Object {$_.name -eq "CRM_INGEST_SECRET"})
  if($matches.Count -ne 1 -or !$matches[0].valueFrom.secretKeyRef){throw "Bestehender Live-Intake-Secret-Verweis fehlt"}
  return (($matches[0].valueFrom.secretKeyRef|ConvertTo-Json -Compress -Depth 5))
}
function ActiveTrafficSignature($svc){
  $active=@($svc.status.traffic|Where-Object {$_.percent -gt 0}|
    ForEach-Object {("{0}:{1}" -f $_.revisionName,$_.percent)}|Sort-Object)
  return ($active -join ";")
}
Write-Host "1. Bestehende Live-Revision und Secret-Referenz READ ONLY pruefen"
$before=ReadService
$active=ActiveTrafficSignature $before
if($active -ne ($ExpectedLiveRevision+":100")){
  throw "Abbruch: Produktivtraffic weicht von der abgenommenen Revision ab: $active"
}
if($before.spec.template.spec.serviceAccountName -ne $expectedAccount){throw "Live-Dienstkonto unerwartet"}
$secretBinding=GetSecretBinding $before
Write-Host "PASS: Produktivtraffic unveraendert auf $active"
Write-Host "PASS: bestehendes Live-Dienstkonto / Secret Manager Referenz vorhanden"
Write-Host "Source Commit: $sha"
Write-Host "Ziel-Namespace: lszh_crm_v2_ (LIVE); Website-Eingang: true"
Write-Host "CRM Kandidaten-Tag: $tag (keine Umschaltung des stabilen Service URL)"
Write-Host "2. Lokale CRM-Tests"
Push-Location $source
try{
  & node --test
  if($LASTEXITCODE -ne 0){throw "CRM Tests fehlgeschlagen"}
}finally{Pop-Location}
if(-not $Deploy){
  Write-Host "READ ONLY abgeschlossen: kein Deployment, keine Cloud-Run-Aenderung."
  Write-Host "Spaeterer Kandidaten-Deploy erfordert explizit -Deploy (separate Freigabe)."
  return
}
Write-Host "3. Live-Kandidatenrevision mit 0% Traffic bauen (KEIN Cutover)"
$envValues=("CRM_RECORD_PREFIX=lszh_crm_v2_,CRM_WEBSITE_INTAKE_ENABLED=true,GOOGLE_OAUTH_CLIENT_ID={0},CRM_ALLOWED_EMAILS={1}" -f $OAuthClientId,$AllowedEmails)
$deployArgs=@("run","deploy",$service,
  "--source",$source,
  "--project",$Project,
  "--region",$Region,
  "--service-account",$expectedAccount,
  "--no-traffic",
  "--tag",$tag,
  "--update-env-vars",$envValues,
  "--quiet")
# --update-env-vars deliberately preserves existing CRM_INGEST_SECRET secret binding.
# Never use --set-env-vars here (it would replace the existing configuration).
& gcloud.cmd @deployArgs
if($LASTEXITCODE -ne 0){throw "Build oder No-Traffic-Deployment fehlgeschlagen"}
Write-Host "4. Produktivtraffic und Secret-Bindung nach Deployment erneut lesen"
$after=ReadService
$afterTraffic=ActiveTrafficSignature $after
if($afterTraffic -ne $active){
  Write-Warning "ALARM: Live-Traffic abweichend; sofort via update-traffic auf $ExpectedLiveRevision zurueckschalten"
  throw "No-traffic-Eigenschaft nicht nachgewiesen"
}
if((GetSecretBinding $after) -ne $secretBinding){
  throw "ALARM: Secret-Manager-Verweis der Live-Servicevorlage hat sich unerwartet geaendert."
}
if($after.spec.template.spec.serviceAccountName -ne $expectedAccount){throw "Live-Dienstkonto hat sich unerwartet geaendert"}
$revision=$after.status.latestReadyRevisionName
if(!$revision -or $revision -eq $ExpectedLiveRevision){throw "Kandidaten-Revision nicht verifiziert"}
$tagged=@($after.status.traffic|Where-Object {$_.tag -eq $tag})
if($tagged.Count -ne 1 -or $tagged[0].revisionName -ne $revision -or $tagged[0].percent -gt 0){
  throw "Kandidaten-Tag fehlt oder hat unerwarteten Traffic"
}
Write-Host "PASS: 100% Live-Traffic weiterhin auf $ExpectedLiveRevision"
Write-Host "PASS: Live-Secret-Verweis und Dienstkonto unveraendert"
Write-Host "KANDIDAT REVISION: $revision"
Write-Host "KANDIDAT URL (nur Test, NICHT Website-Ziel): $($tagged[0].url)"
Write-Host "INFO: Google OAuth Origins muessen Kandidaten- und spaetere Live-Origin zulassen."
Write-Host "KEIN Go-Live und keine Kundenkommunikation erfolgt."
