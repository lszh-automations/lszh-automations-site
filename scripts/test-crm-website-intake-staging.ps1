# Only synthetic Website -> Cloud Run -> Firestore traffic in STAGING.
# Generates a separate secret. Temporarily enables the test ingress and
# disables it again, even if an HTTP assertion fails. NO live service changes.
param([string]$Project="lszh-automations",[string]$Region="europe-west6")
$ErrorActionPreference="Continue"
$service="lszh-crm-v2-staging"
$secretName="lszh-crm-v2-staging-website-test"
$serviceAccount="lszh-crm-v2@$Project.iam.gserviceaccount.com"
$mustDisable=$false
function NativeCheck([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
function CallIntake([string]$url,[string]$body,[string]$token){
  $headers=@{}
  if($token){$headers['Authorization']="Bearer $token"}
  try{
    $result=Invoke-WebRequest -UseBasicParsing -Uri $url -Method Post -Body $body -ContentType "application/json" -Headers $headers -TimeoutSec 30 -ErrorAction Stop
    return @{status=[int]$result.StatusCode;data=($result.Content|ConvertFrom-Json)}
  }catch{
    $response=$_.Exception.Response
    if($null -ne $response -and $null -ne $response.StatusCode){
      return @{status=[int]$response.StatusCode;data=$null}
    }
    throw
  }
}
try{
  if(-not (Get-Command gcloud.cmd -ErrorAction SilentlyContinue)){throw "gcloud fehlt"}
  $infoText=(& gcloud.cmd run services describe $service --project $Project --region $Region --format=json) -join [Environment]::NewLine
  NativeCheck "Staging Dienst nicht abrufbar"
  $info=$infoText|ConvertFrom-Json
  $container=@($info.spec.template.spec.containers)[0]
  $prefix=@($container.env|Where-Object {$_.name -eq "CRM_RECORD_PREFIX"})[0].value
  $enabled=@($container.env|Where-Object {$_.name -eq "CRM_WEBSITE_INTAKE_ENABLED"})[0].value
  if($prefix -ne "lszh_crm_v2_staging_" -or $enabled -ne "false"){throw "Nur ein deaktivierter Staging-Webhook ist erlaubt"}
  if($info.spec.template.spec.serviceAccountName -ne $serviceAccount){throw "Staging Dienstkonto stimmt nicht"}
  $existing=@(& gcloud.cmd secrets list --project $Project --format="value(name)")
  NativeCheck "Secret Liste nicht verfuegbar"
  $found=@($existing|Where-Object {$_ -eq $secretName -or $_ -eq ("projects/$Project/secrets/$secretName")}).Count -gt 0
  if(-not $found){
    $random=New-Object byte[] 48
    $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
    try{$rng.GetBytes($random)}finally{$rng.Dispose()}
    $secret=[Convert]::ToBase64String($random).TrimEnd("=").Replace("+","-").Replace("/","_")
    $temp=Join-Path ([IO.Path]::GetTempPath()) ("lszh-staging-"+[guid]::NewGuid().ToString("N")+".txt")
    try{
      [IO.File]::WriteAllText($temp,$secret,[Text.Encoding]::ASCII)
      & gcloud.cmd secrets create $secretName --project $Project --replication-policy automatic --data-file $temp --quiet | Out-Null
      NativeCheck "Staging Secret konnte nicht erstellt werden"
    }finally{Remove-Item $temp -ErrorAction SilentlyContinue}
  }else{
    $secret=((& gcloud.cmd secrets versions access latest --project $Project --secret $secretName) -join "").Trim()
    NativeCheck "Staging Secret kann nicht gelesen werden"
  }
  if(!$secret -or $secret.Length -lt 32){throw "Staging Secret ist ungueltig"}
  & gcloud.cmd secrets add-iam-policy-binding $secretName --project $Project --member ("serviceAccount:"+$serviceAccount) --role roles/secretmanager.secretAccessor --condition=None --quiet | Out-Null
  NativeCheck "Staging Secret Berechtigung fehlt"
  Write-Host "1. Webhook NUR in Cloud-Staging temporaer aktivieren"
  $mustDisable=$true
  & gcloud.cmd run services update $service --project $Project --region $Region --update-secrets ("CRM_INGEST_SECRET={0}:latest" -f $secretName) --update-env-vars "CRM_WEBSITE_INTAKE_ENABLED=true" --quiet | Out-Null
  NativeCheck "Temporarer Staging-Eingang konnte nicht aktiviert werden"
  $url=((& gcloud.cmd run services describe $service --project $Project --region $Region --format="value(status.url)") -join "").Trim()
  NativeCheck "Staging URL nicht verfuegbar"
  if($url -notmatch "^https://lszh-crm-v2-staging-[a-z0-9-]+[.]((a[.]run)|(europe-west6[.]run))[.]app$"){throw "Abbruch: Service URL ist nicht Staging"}
  $endpoint=$url.TrimEnd("/")+"/api/internal/website-leads"
  $submission=[guid]::NewGuid().ToString()
  $payload=[ordered]@{
    submission_id=$submission
    name="TEST_ONLY Webseite"
    company="TEST_ONLY LSZH Website Intake"
    email="website-smoke@example.com"
    street="Musterweg 1"
    postal_code="5610"
    city="Wohlen"
    country="Schweiz"
    message="TEST_ONLY: CRM Cloud Website HTTP Test"
    current_process="TEST_ONLY manuell"
    systems="TEST_ONLY Excel"
    main_problem="TEST_ONLY wiederkehrende Eingabe"
    frequency="Taeglich"
    desired_result="TEST_ONLY automatischer Eingang"
  }
  Write-Host "2. Website HTTP POST, Wiederholung, Konflikt und Zugriff pruefen"
  $body=$payload|ConvertTo-Json -Compress -Depth 5
  $first=CallIntake $endpoint $body $secret
  if($first.status -ne 201 -or !$first.data.confirmed -or !$first.data.created -or $first.data.recordId -notmatch "^web_[0-9a-f]{32}$"){
    throw "Erste Firestore Speicherung nicht bestaetigt: HTTP $($first.status)"
  }
  $repeat=CallIntake $endpoint $body $secret
  if($repeat.status -ne 200 -or !$repeat.data.confirmed -or $repeat.data.created -or $repeat.data.recordId -ne $first.data.recordId){
    throw "Wiederholung fehlgeschlagen: HTTP $($repeat.status)"
  }
  $payload.message="TEST_ONLY veraenderter Inhalt muss Konflikt liefern"
  $conflict=CallIntake $endpoint ($payload|ConvertTo-Json -Compress -Depth 5) $secret
  if($conflict.status -ne 409){throw "HTTP 409 erwartet, erhalten $($conflict.status)"}
  $unauthorized=CallIntake $endpoint $body ""
  if($unauthorized.status -ne 401){throw "HTTP 401 erwartet, erhalten $($unauthorized.status)"}
  Write-Host "PASS: HTTP 201 / 200 / 409 / 401, derselbe Firestore-Datensatz"
  Write-Host "PASS: Nur Staging, synthetische ID: $($first.data.recordId)"
}finally{
  if($mustDisable){
    Write-Host "3. Webhook in Cloud-Staging wieder deaktivieren"
    & gcloud.cmd run services update $service --project $Project --region $Region --update-env-vars "CRM_WEBSITE_INTAKE_ENABLED=false" --quiet | Out-Null
    if($LASTEXITCODE -ne 0){Write-Warning "DEAKTIVIERUNG FEHLGESCHLAGEN: Staging-Cloud-Run sofort manuell pruefen"}
    else{Write-Host "PASS: Staging Webhook wieder deaktiviert"}
  }
}
