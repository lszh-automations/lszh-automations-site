# Safe CRM V2 UI-only lead auto-refresh rollout to the existing production service.
# No changes to Render, data, IAM, CRM secret, Firebase/Firestore, Google OAuth or website routing.
param(
  [string]$Project="lszh-automations",
  [string]$Region="europe-west6"
)
$ErrorActionPreference="Stop"
$service="lszh-crm-v2"
$previous="lszh-crm-v2-00004-mez"
$tag="crm-v2-lead-refresh"
$expectedAccount="lszh-crm-v2@lszh-automations.iam.gserviceaccount.com"
$switched=$false
$done=$false
if($Project -ne "lszh-automations" -or $Region -ne "europe-west6"){throw "Nur freigegebenes Produktivprojekt und Region erlaubt"}
if(!(Get-Command gcloud.cmd -ErrorAction SilentlyContinue)){throw "gcloud.cmd fehlt"}
$projectRoot=Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
function CheckExit([string]$reason){if($LASTEXITCODE -ne 0){throw $reason}}
function ReadService{
  $raw=(& gcloud.cmd run services describe $service --project $Project --region $Region --format=json) -join [Environment]::NewLine
  CheckExit "Cloud Run Service kann nicht gelesen werden"
  return ($raw|ConvertFrom-Json)
}
function ActiveRevision($svc){
  $active=@($svc.status.traffic|Where-Object{$_.percent -gt 0})
  if($active.Count -ne 1 -or [int]$active[0].percent -ne 100){throw "Traffic wird nicht zu 100 Prozent von einer Revision bedient"}
  return [string]$active[0].revisionName
}
function SelectedSettings($svc){
  $container=@($svc.spec.template.spec.containers)[0]
  $keys=@("CRM_RECORD_PREFIX","CRM_WEBSITE_INTAKE_ENABLED","CRM_INGEST_SECRET","GOOGLE_OAUTH_CLIENT_ID","CRM_ALLOWED_EMAILS")
  $picked=@{}
  foreach($key in $keys){
    $items=@($container.env|Where-Object{$_.name -eq $key})
    if($items.Count -ne 1){throw "Unvollstaendige Servicekonfiguration: $key"}
    $picked[$key]=$items[0] | ConvertTo-Json -Depth 10 -Compress
  }
  if(!$picked["CRM_INGEST_SECRET"].Contains("secretKeyRef")){throw "CRM_INGEST_SECRET darf kein Klartext sein"}
  if($svc.spec.template.spec.serviceAccountName -ne $expectedAccount){throw "Falsche Service-Identitaet"}
  return $picked
}
function Probe([string]$base){
  $base=$base.TrimEnd("/")
  foreach($path in @("/", "/api/config", "/api/records/leads")){
    try{
      $result=Invoke-WebRequest -Uri ($base+$path) -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
      $code=[int]$result.StatusCode
      $html=[string]$result.Content
    }catch{
      if(!$_.Exception.Response -or !$_.Exception.Response.StatusCode){throw}
      $code=[int]$_.Exception.Response.StatusCode
      $html=""
    }
    $expect=if($path -eq "/api/records/leads"){401}else{200}
    if($code -ne $expect){throw "HTTP $code auf $path, erwartet $expect"}
    if($path -eq "/" -and $html -notmatch "LSZH"){throw "Kein CRM-HTML unter $base"}
  }
  Write-Host "PASS: CRM UI HTTP 200, Google config HTTP 200, Leads ohne Login HTTP 401."
}
function Rollback {
  Write-Warning "Die vorige funktionierende Produktivrevision wird wiederhergestellt."
  & gcloud.cmd run services update-traffic $service --project $Project --region $Region ("--to-revisions="+$previous+"=100") --quiet
  CheckExit "CRITICAL: Rueckfall-Befehl fehlgeschlagen, Traffic manuell ueberpruefen!"
  $result=ReadService
  if((ActiveRevision $result) -ne $previous){throw "CRITICAL: Rueckfall noch nicht nachgewiesen!"}
  Write-Host "ROLLBACK PASS: $previous ist wieder zu 100 Prozent aktiv."
}
try{
  $branch=((& git branch --show-current) -join "").Trim()
  if($LASTEXITCODE -ne 0 -or $branch -ne "feature/crm-v2-cloud-staging-20261023"){throw "Bitte aus dem CRM-V2-Entwicklungsbranch arbeiten"}
  $dirty=((& git status --porcelain) -join "").Trim()
  if($LASTEXITCODE -ne 0 -or $dirty){throw "Lokale Aenderungen vorhanden; nicht deployen"}
  $html=Get-Content -Path ".\crm-v2\public\index.html" -Raw
  if($html -notmatch "LEAD_REFRESH_INTERVAL_MS=30000" -or $html -notmatch "refreshLeads"){
    throw "Neue CRM-Lead-Aktualisierung fehlt in der lokalen Version"
  }
  Write-Host "1. Produktive Revision und unveraenderte Servicekonfiguration pruefen"
  $before=ReadService
  if((ActiveRevision $before) -ne $previous){throw "Aktive Produktivrevision hat sich unerwartet geaendert"}
  $expected=SelectedSettings $before
  Write-Host "PASS: Bestehendes Live-CRM und Secret Manager Bindung erkannt"
  Write-Host "2. Neue UI-Revision ohne Traffic bereitstellen"
  & gcloud.cmd run deploy $service --source ".\crm-v2" --project $Project --region $Region --no-traffic --tag $tag --quiet
  CheckExit "Staging-Deployment im Live-Service fehlgeschlagen"
  $after=ReadService
  if((ActiveRevision $after) -ne $previous){throw "ALARM: Bisheriger Live-Traffic wurde beim No-Traffic-Deploy veraendert"}
  $actual=SelectedSettings $after
  foreach($key in $expected.Keys){if($expected[$key] -ne $actual[$key]){throw "ALARM: $key hat sich beim Deployment veraendert"}}
  $revision=$after.status.latestReadyRevisionName
  if(!$revision -or $revision -eq $previous){throw "Keine neue Release-Revision sichtbar"}
  $tags=@($after.status.traffic|Where-Object{$_.tag -eq $tag})
  if($tags.Count -ne 1 -or $tags[0].revisionName -ne $revision -or [int]$tags[0].percent -ne 0){
    throw "Neues UI-Tag oder dessen 0%-Traffic nicht nachgewiesen"
  }
  Write-Host "PASS: Alte Live-Revision weiterhin mit 100 Prozent Traffic; Konfiguration unveraendert"
  Write-Host "NEUE REVISION: $revision"
  Write-Host "3. Neue Revision auf getaggter URL pruefen"
  Probe $tags[0].url
  Write-Host "4. Aktualisierte CRM-Oberflaeche produktiv aktivieren"
  $switched=$true
  & gcloud.cmd run services update-traffic $service --project $Project --region $Region ("--to-revisions="+$revision+"=100") --quiet
  CheckExit "Umschaltung auf aktualisierte CRM-Revision fehlgeschlagen"
  $live=ReadService
  if((ActiveRevision $live) -ne $revision){throw "Neue Revision erhielt nicht 100 Prozent Traffic"}
  Probe "https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app"
  $done=$true
  Write-Host "GO-LIVE PASS: Automatische Lead-Aktualisierung im Live CRM aktiv."
  Write-Host "NEUE LIVE REVISION: $revision"
  Write-Host "ROLLBACK-REVISION: $previous"
  Write-Host "Hinweis: Bereits geoeffnetes CRM einmalig neu laden und ggf. erneut mit Google anmelden."
} finally {
  try{
    if($switched -and !$done){Rollback}
  } finally {
    Pop-Location
  }
}
