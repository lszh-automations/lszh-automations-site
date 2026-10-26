# Deploy the FULL CRM V2 to SEPARATE Cloud Run staging only.
# Live CRM intake service lszh-crm-v2 and Render website remain unchanged.
param(
  [string]$Project="lszh-automations",
  [string]$Region="europe-west6",
  [Parameter(Mandatory=$true)][string]$OAuthClientId,
  [Parameter(Mandatory=$true)][string]$AllowedEmails
)
$ErrorActionPreference="Continue"
$service="lszh-crm-v2-staging"
$source=Join-Path (Split-Path $PSScriptRoot -Parent) "crm-v2"
if($service -eq "lszh-crm-v2"){throw "Deployment des produktiven CRM ist hier gesperrt."}
if(-not (Test-Path (Join-Path $source "cloud-records.js"))){throw "Zuerst Cloud-Staging-Branch auschecken."}
if(-not (Get-Command gcloud.cmd -ErrorAction SilentlyContinue)){throw "Google Cloud SDK fehlt."}
if(-not (Get-Command node -ErrorAction SilentlyContinue)){throw "Node.js fehlt."}
if($OAuthClientId -notmatch "^[a-zA-Z0-9.-]+\.apps\.googleusercontent\.com$"){
  throw "Ungueltige Google-OAuth-Client-ID. Keine Client-Secrets eingeben."
}
$AllowedEmails=$AllowedEmails.Trim()
if($AllowedEmails -notmatch "^[^,\s@]+@[^,\s@]+(\.[^,\s@]+)+(,[^,\s@]+@[^,\s@]+(\.[^,\s@]+)+)*$"){
  throw "Mindestens eine gueltige Google-Workspace-Adresse ist erforderlich."
}
Write-Host "1. CRM Tests lokal ausfuehren (ohne produktive Verbindungen) ..."
Push-Location $source
try{
  & node --test
  if($LASTEXITCODE -ne 0){throw "CRM Tests fehlgeschlagen. Kein Deployment."}
}finally{Pop-Location}
Write-Host "2. Google Cloud und Firestore pruefen ..."
& gcloud.cmd config set project $Project
if($LASTEXITCODE -ne 0){throw "Cloud-Projekt nicht gesetzt."}
& gcloud.cmd firestore databases describe '--database=(default)' --project $Project --format "value(name)"
if($LASTEXITCODE -ne 0){throw "Firestore (default) fehlt oder ist nicht erreichbar."}
$account="lszh-crm-v2@$Project.iam.gserviceaccount.com"
$accounts=@(& gcloud.cmd iam service-accounts list --project $Project --format "value(email)")
if($LASTEXITCODE -ne 0 -or $accounts -notcontains $account){
  throw "CRM-Dienstkonto $account ist nicht vorhanden oder nicht sichtbar."
}
# No intake secret passed to staging. Only staging CRM records may be accessed.
$envValues="CRM_RECORD_PREFIX=lszh_crm_v2_staging_,CRM_WEBSITE_INTAKE_ENABLED=false,GOOGLE_OAUTH_CLIENT_ID=$OAuthClientId,CRM_ALLOWED_EMAILS=$AllowedEmails"
Write-Host "3. Nur $service bereitstellen ..."
$deploy=@("run","deploy",$service,"--source",$source,"--region",$Region,
  "--project",$Project,"--allow-unauthenticated","--service-account",$account,
  "--memory","512Mi","--max-instances","2","--set-env-vars",$envValues,"--quiet")
& gcloud.cmd @deploy
if($LASTEXITCODE -ne 0){throw "Staging-Deployment fehlgeschlagen. Live CRM bleibt unveraendert."}
# Public front-end loads Google Sign-In; CRM data APIs require verified ID token.
& gcloud.cmd run services update $service --region $Region --project $Project --no-invoker-iam-check --quiet
if($LASTEXITCODE -ne 0){
  Write-Warning "Cloud Run Invoker-Zugang konnte nicht eingestellt werden. IAM pruefen."
}
$url=(& gcloud.cmd run services describe $service --region $Region --project $Project --format "value(status.url)").Trim()
if($LASTEXITCODE -ne 0 -or -not $url){throw "Cloud Run Staging URL nicht gefunden."}
Write-Host "STAGING CRM URL: $url"
Write-Host "Google OAuth Client: $url als autorisierten JavaScript-Ursprung hinterlegen."
Write-Host "Staging-Firestore: lszh_crm_v2_staging_*"
Write-Host "Website-Lead-WebHook in Staging: DEAKTIVIERT"
Write-Host "Produktive Website und Service lszh-crm-v2: UNVERAENDERT"
