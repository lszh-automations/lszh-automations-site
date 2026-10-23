# CRM V2 production readiness: READ ONLY. Does not deploy, move traffic,
# change IAM/Render, read secrets, import data, or trigger website forms.
param([string]$Project="lszh-automations",[string]$Region="europe-west6")
$ErrorActionPreference="Continue"
function ReadService([string]$name){
  $response=(& gcloud.cmd run services describe $name --project $Project --region $Region --format=json) -join [Environment]::NewLine
  if($LASTEXITCODE -ne 0){throw "Dienst $name konnte nicht gelesen werden"}
  return $response | ConvertFrom-Json
}
function ReadEnv($service,[string]$key){
  $container=@($service.spec.template.spec.containers)[0]
  $matches=@($container.env|Where-Object {$_.name -eq $key})
  if(!$matches.Count){return $null}
  return $matches[0]
}
function PrintValue([string]$label,[string]$value){
  Write-Host (($label.PadRight(34))+": "+$value)
}
if(-not (Get-Command gcloud.cmd -ErrorAction SilentlyContinue)){throw "Google Cloud SDK fehlt"}
$live=ReadService "lszh-crm-v2"
$staging=ReadService "lszh-crm-v2-staging"
$liveAccount=$live.spec.template.spec.serviceAccountName
$stagePrefix=ReadEnv $staging "CRM_RECORD_PREFIX"
$stageIntake=ReadEnv $staging "CRM_WEBSITE_INTAKE_ENABLED"
$liveIngest=ReadEnv $live "CRM_INGEST_SECRET"
$liveIntake=ReadEnv $live "CRM_WEBSITE_INTAKE_ENABLED"
$livePrefix=ReadEnv $live "CRM_RECORD_PREFIX"
PrintValue "LIVE Dienst" "lszh-crm-v2"
PrintValue "LIVE URL" ([string]$live.status.url)
PrintValue "LIVE aktuelle Revision" ([string]$live.status.latestReadyRevisionName)
PrintValue "LIVE Service Account" ([string]$liveAccount)
PrintValue "LIVE Intake Secret (nur Typ)" $(if($null -eq $liveIngest){"FEHLT"}elseif($liveIngest.valueFrom.secretKeyRef){"Secret Manager Referenz vorhanden"}else{"NICHT als Secret Manager Referenz hinterlegt"})
PrintValue "LIVE Website Intake Flag" $(if($null -eq $liveIntake){"nicht gesetzt (alte Serverversion)"}else{$liveIntake.value})
PrintValue "LIVE Collection Prefix" $(if($null -eq $livePrefix){"nicht gesetzt (alte Version: lszh_crm_v2_)"}else{$livePrefix.value})
PrintValue "STAGING Prefix" ([string]$stagePrefix.value)
PrintValue "STAGING Intake" ([string]$stageIntake.value)
PrintValue "LIVE Traffic" ((@($live.status.traffic)|ForEach-Object {"$($_.percent)% $($_.revisionName)"}) -join ", ")
if($stagePrefix.value -ne "lszh_crm_v2_staging_"){
  throw "STAGING ist nicht vom Live-Namespace getrennt"
}
if($stageIntake.value -ne "false"){
  Write-Warning "Staging-Webhook ist derzeit aktiv. Vor Freigabe deaktivieren."
}
if(!$liveAccount){throw "LIVE Dienstkonto konnte nicht gelesen werden"}
if($null -eq $liveIngest){Write-Warning "Live-Intake-Secret ist nicht als Environment-Eintrag vorhanden. Render Routing pruefen."}
# The data itself is NOT exported here. Before cutover, separately inventory
# live Firestore records, historical invoices and sequence counters.
Write-Host "READ ONLY abgeschlossen: keine Cloud-Ressourcen oder Datensaetze veraendert."
Write-Host "Fuer produktiven Cutover weiterhin offen: Live-Firestore-Backup,"
Write-Host "Bestandszahlen, Nummernkreis, auth. Zugriffs-Negativtests und Rollback."
