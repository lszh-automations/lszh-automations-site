# Deploy only the CRM V2 backend for the website form. No production website cutover.
param([string]$Project="lszh-automations",[string]$Region="europe-west6")
$ErrorActionPreference="Stop"
if(-not (Get-Command gcloud.cmd -ErrorAction SilentlyContinue)){throw "Google Cloud SDK fehlt."}
$service="lszh-crm-v2"
$secretName="lszh-crm-v2-intake"
$serviceAccount="lszh-crm-v2@$Project.iam.gserviceaccount.com"
$source=Join-Path (Split-Path $PSScriptRoot -Parent) "crm-v2"
if(-not (Test-Path (Join-Path $source "lead-ingest.js"))){throw "CRM-V2-Branch zuerst auschecken."}
& gcloud.cmd config set project $Project
if($LASTEXITCODE -ne 0){throw "Google Cloud Projekt nicht gesetzt"}
& gcloud.cmd services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com secretmanager.googleapis.com --project $Project
if($LASTEXITCODE -ne 0){throw "Cloud APIs fehlen"}
& gcloud.cmd firestore databases describe --database="(default)" --project $Project --format="value(name)" | Out-Null
if($LASTEXITCODE -ne 0){throw "Firestore (default) existiert nicht"}
# Avoid 'describe' for a not-yet-created account: its expected NOT_FOUND is
# surfaced as a terminating NativeCommandError in Windows PowerShell 5.1.
$accountEmails=@(& gcloud.cmd iam service-accounts list --project $Project --format="value(email)")
if($LASTEXITCODE -ne 0){throw "Dienstkonten konnten nicht aufgelistet werden (Berechtigungen pruefen)"}
if($accountEmails -notcontains $serviceAccount){
  Write-Host "CRM-Dienstkonto fehlt: wird jetzt erstellt."
  & gcloud.cmd iam service-accounts create lszh-crm-v2 --display-name "LSZH CRM V2" --project $Project
  if($LASTEXITCODE -ne 0){throw "Dienstkonto konnte nicht erstellt werden"}
}else{
  Write-Host "CRM-Dienstkonto bereits vorhanden."
}
& gcloud.cmd projects add-iam-policy-binding $Project --member "serviceAccount:$serviceAccount" --role roles/datastore.user --quiet | Out-Null
if($LASTEXITCODE -ne 0){throw "Firestore-Berechtigung fehlgeschlagen"}
# Likewise, use a successful list operation instead of a failing 'describe'.
# Never print the secret value. This is safe to rerun after a partial deploy.
$secretNames=@(& gcloud.cmd secrets list --project $Project --format="value(name)")
if($LASTEXITCODE -ne 0){throw "Secret Manager konnte nicht aufgelistet werden (Berechtigungen pruefen)"}
$hasSecret=@($secretNames | Where-Object {
  $_ -eq $secretName -or $_ -eq ("projects/$Project/secrets/$secretName")
}).Count -gt 0
if(-not $hasSecret){
  Write-Host "CRM-Verbindungsschluessel fehlt: wird jetzt erstellt."
  $bytes=New-Object byte[] 48
  $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
  try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}
  $intakeSecret=[Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
  $tmp=Join-Path ([IO.Path]::GetTempPath()) ("lszh-crm-"+[guid]::NewGuid().ToString("N")+".txt")
  try{
    [IO.File]::WriteAllText($tmp,$intakeSecret,[Text.Encoding]::ASCII)
    & gcloud.cmd secrets create $secretName --replication-policy=automatic --data-file=$tmp --project $Project
    if($LASTEXITCODE -ne 0){throw "Secret Manager konnte den Schlüssel nicht speichern"}
  }finally{Remove-Item $tmp -ErrorAction SilentlyContinue}
}else{
  Write-Host "CRM-Verbindungsschluessel bereits vorhanden; wird wiederverwendet."
  $intakeSecret=(& gcloud.cmd secrets versions access latest --secret $secretName --project $Project).Trim()
  if($LASTEXITCODE -ne 0){throw "Schlüssel konnte nicht gelesen werden"}
}
Set-Clipboard -Value $intakeSecret
& gcloud.cmd secrets add-iam-policy-binding $secretName --project $Project --member "serviceAccount:$serviceAccount" --role roles/secretmanager.secretAccessor --quiet | Out-Null
if($LASTEXITCODE -ne 0){throw "Secret-Berechtigung fehlgeschlagen"}
& gcloud.cmd run deploy $service --source $source --region $Region --project $Project --allow-unauthenticated --service-account $serviceAccount --memory 512Mi --max-instances 2 --update-secrets ("CRM_INGEST_SECRET={0}:latest" -f $secretName) --quiet
if($LASTEXITCODE -ne 0){throw "Cloud-Run-Deployment fehlgeschlagen"}
$url=(& gcloud.cmd run services describe $service --region $Region --project $Project --format="value(status.url)").Trim()
if($LASTEXITCODE -ne 0 -or -not $url){throw "Cloud-Run-URL fehlt"}
Write-Host "CRM-Backend bereit: $url"
Write-Host "Website-Render-Service: lszh-automations-site"
Write-Host "Variable CRM_LEAD_INGEST_URL = $url/api/internal/website-leads"
Write-Host "Variable CRM_INGEST_SECRET = Wert aus Zwischenablage (NICHT im Chat posten)"
Write-Host "Nach Render-Konfiguration Zwischenablage leeren: Set-Clipboard -Value ''"
Write-Host "Produktive Website ist noch NICHT umgeschaltet."
