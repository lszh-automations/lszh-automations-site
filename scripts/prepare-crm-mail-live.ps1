# CRM V2 mail preparatory deployment ONLY. No production email can be sent.
# Compatible with Windows PowerShell 5.1. Mail scenario must remain inactive.
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$previous='lszh-crm-v2-00006-moz'
$runtime='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$scheduler='lszh-crm-mail-scheduler@lszh-automations.iam.gserviceaccount.com'
$secret='lszh-crm-v2-mail-make-hook'
$job='lszh-crm-v2-mail-tick'
$tag='crm-v2-mail-prepared'
$base='https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app'
function Assert-Last([string]$reason){if($LASTEXITCODE -ne 0){throw $reason}}
function Read-Service {
  $raw=(& gcloud.cmd run services describe $service --project $project --region $region --format=json) -join [Environment]::NewLine
  Assert-Last 'Cloud Run nicht erreichbar'
  return ($raw|ConvertFrom-Json)
}
function Live-Revision($svc){
  $live=@($svc.status.traffic|Where-Object{[int]$_.percent -gt 0})
  if($live.Count -ne 1 -or [int]$live[0].percent -ne 100){throw 'Unerwartete Traffic Aufteilung'}
  return [string]$live[0].revisionName
}
function Critical-Config($svc){
  if($svc.spec.template.spec.serviceAccountName -ne $runtime){throw 'Unerwartetes CRM Dienstkonto'}
  $envs=@($svc.spec.template.spec.containers)[0].env
  $keys=@('CRM_RECORD_PREFIX','CRM_WEBSITE_INTAKE_ENABLED','CRM_INGEST_SECRET','GOOGLE_OAUTH_CLIENT_ID','CRM_ALLOWED_EMAILS')
  $values=@{}
  foreach($key in $keys){
    $match=@($envs|Where-Object{$_.name -eq $key})
    if($match.Count -ne 1){throw ('Konfiguration fehlt: '+$key)}
    $values[$key]=$match[0]|ConvertTo-Json -Depth 8 -Compress
  }
  if($values['CRM_INGEST_SECRET'] -notmatch 'secretKeyRef'){throw 'Website Secret darf kein Klartext sein'}
  return $values
}
function Probe([string]$url){
  foreach($v in @(@('/','GET',200),@('/api/config','GET',200),@('/api/records/leads','GET',401),@('/api/internal/mail/tick','POST',404),@('/api/internal/website-leads','POST',401))){
    $code=0
    try{
      $response=Invoke-WebRequest -Uri ($url.TrimEnd('/')+$v[0]) -Method $v[1] -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
      $code=[int]$response.StatusCode
    }catch{
      if(!$_.Exception.Response -or !$_.Exception.Response.StatusCode){throw}
      $code=[int]$_.Exception.Response.StatusCode
    }
    if($code -ne [int]$v[2]){throw ('Probe fehlgeschlagen: '+$v[0]+' HTTP '+$code)}
  }
}
if(!(Get-Command gcloud.cmd -ErrorAction SilentlyContinue)){throw 'gcloud.cmd fehlt'}
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try{
  $branch=((& git branch --show-current)-join '').Trim()
  Assert-Last 'git branch fehlgeschlagen'
  if($branch -ne 'feature/crm-v2-cloud-staging-20261023'){throw 'Falscher Git Branch'}
  $dirty=((& git status --porcelain)-join '').Trim()
  Assert-Last 'git status fehlgeschlagen'
  if($dirty){throw 'Lokale Aenderungen vorhanden'}
  Write-Host '1. Alle CRM Tests'
  & npm.cmd test --prefix '.\crm-v2'
  Assert-Last 'CRM Tests fehlgeschlagen, KEIN Deploy'
  $oldService=Read-Service
  if((Live-Revision $oldService) -ne $previous){throw 'Live Revision ist nicht die erwartete 00006-moz'}
  $before=Critical-Config $oldService
  Write-Host '2. Cloud Scheduler und Secret Manager APIs sicherstellen'
  & gcloud.cmd services enable cloudscheduler.googleapis.com secretmanager.googleapis.com --project $project --quiet
  Assert-Last 'Google APIs konnten nicht bereitgestellt werden'
  Write-Host '3. Make Webhook Secret anlegen oder erhalten'
  $foundSecret=((& gcloud.cmd secrets list --project $project ('--filter=name:'+ $secret) '--format=value(name)')-join '').Trim()
  Assert-Last 'Secret-Liste konnte nicht gelesen werden'
  if(!$foundSecret){
    & gcloud.cmd secrets create $secret --project $project --replication-policy=automatic --quiet
    Assert-Last 'Secret konnte nicht erstellt werden'
  }
  $versions=((& gcloud.cmd secrets versions list $secret --project $project '--filter=state:ENABLED' '--format=value(name)')-join '').Trim()
  Assert-Last 'Secret-Versionen konnten nicht gelesen werden'
  if(!$versions){
    $secured=Read-Host 'Geheime Make Webhook URL eingeben (unsichtbar)' -AsSecureString
    $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secured)
    try{$hook=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim()}
    finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
    if($hook -notmatch '^https://hook[.]eu1[.]make[.]com/[A-Za-z0-9]+$'){throw 'Ungueltige Make URL'}
    $temp=Join-Path $env:TEMP ('lszh-mail-'+[guid]::NewGuid().ToString('N')+'.tmp')
    try{
      [IO.File]::WriteAllText($temp,$hook,(New-Object Text.UTF8Encoding($false)))
      $hook=$null
      & gcloud.cmd secrets versions add $secret ('--data-file='+$temp) --project $project --quiet | Out-Null
      Assert-Last 'Mail Secret-Version konnte nicht erstellt werden'
    }finally{if(Test-Path $temp){Remove-Item $temp -Force}}
  }else{Write-Host 'PASS: Secret hat bereits eine aktivierte Version'}
  & gcloud.cmd secrets add-iam-policy-binding $secret --project $project ('--member=serviceAccount:'+$runtime) --role=roles/secretmanager.secretAccessor --quiet | Out-Null
  Assert-Last 'CRM Dienstkonto erhaelt keinen Mail-Secret Zugriff'
  Write-Host '4. Nur fuer Scheduler bestimmtes Dienstkonto erstellen'
  $foundIdentity=((& gcloud.cmd iam service-accounts list --project $project ('--filter=email:'+ $scheduler) '--format=value(email)')-join '').Trim()
  Assert-Last 'Dienstkonto-Liste konnte nicht gelesen werden'
  if(!$foundIdentity){
    & gcloud.cmd iam service-accounts create lszh-crm-mail-scheduler --project $project --display-name='LSZH CRM mail clock' --quiet
    Assert-Last 'Mail Scheduler Dienstkonto konnte nicht erstellt werden'
  }
  Write-Host '5. Inaktiven Scheduler mit OIDC konfigurieren'
  $foundJob=((& gcloud.cmd scheduler jobs list --location $region --project $project ('--filter=name:'+ $job) '--format=value(name)')-join '').Trim()
  Assert-Last 'Scheduler-Job-Liste konnte nicht gelesen werden'
  if(!$foundJob){
    # Annual safe schedule on creation, then pause immediately.
    $args=@('scheduler','jobs','create','http',$job,'--location='+$region,'--project='+$project,'--schedule=0 0 1 1 *','--time-zone=Etc/UTC','--uri='+$base+'/api/internal/mail/tick','--http-method=POST','--oidc-service-account-email='+$scheduler,'--oidc-token-audience='+$base,'--max-retry-attempts=0','--attempt-deadline=180s','--quiet')
    & gcloud.cmd @args
    Assert-Last 'Cloud Scheduler Job konnte nicht erstellt werden'
  }
  $raw=(& gcloud.cmd scheduler jobs describe $job --location $region --project $project --format=json)-join [Environment]::NewLine
  Assert-Last 'Scheduler Status konnte nicht gelesen werden'
  $j=$raw|ConvertFrom-Json
  if($j.state -eq 'ENABLED'){
    & gcloud.cmd scheduler jobs pause $job --location $region --project $project --quiet
    Assert-Last 'Scheduler konnte nicht pausiert werden'
    $raw=(& gcloud.cmd scheduler jobs describe $job --location $region --project $project --format=json)-join [Environment]::NewLine
    Assert-Last 'Pausierter Scheduler konnte nicht gelesen werden'
    $j=$raw|ConvertFrom-Json
  }
  if($j.state -ne 'PAUSED' -or $j.httpTarget.uri -ne ($base+'/api/internal/mail/tick') -or $j.httpTarget.oidcToken.serviceAccountEmail -ne $scheduler -or $j.httpTarget.oidcToken.audience -ne $base){throw 'Scheduler Job Konfiguration unerwartet'}
  Write-Host 'PASS: Scheduler PAUSED und OIDC Konfiguration korrekt'
  Write-Host '6. Neue Cloud Run Mail Kandidaten-Revision bei 0 Prozent Traffic bereitstellen'
  $vars='CRM_MAIL_ENABLED=false,CRM_MAIL_SCHEDULER_EMAIL='+$scheduler+',CRM_MAIL_SCHEDULER_AUDIENCE='+$base
  $secrets='CRM_MAIL_WEBHOOK_URL='+$secret+':latest'
  $args=@('run','deploy',$service,'--source=.\crm-v2','--project='+$project,'--region='+$region,'--no-traffic','--tag='+$tag,'--update-env-vars='+$vars,'--update-secrets='+$secrets,'--quiet')
  & gcloud.cmd @args
  Assert-Last 'Mail Kandidat konnte nicht mit 0 Prozent Traffic erstellt werden'
  $next=Read-Service
  if((Live-Revision $next) -ne $previous){throw 'ALARM: CRM Live Traffic veraendert'}
  $after=Critical-Config $next
  foreach($key in $before.Keys){if($before[$key] -ne $after[$key]){throw ('ALARM: bestehende CRM Konfiguration veraendert: '+$key)}}
  $allVars=@($next.spec.template.spec.containers)[0].env
  $mode=@($allVars|Where-Object{$_.name -eq 'CRM_MAIL_ENABLED'})
  $webhook=@($allVars|Where-Object{$_.name -eq 'CRM_MAIL_WEBHOOK_URL'})
  if($mode.Count -ne 1 -or $mode[0].value -ne 'false'){throw 'Mail Kandidat muss deaktiviert bleiben'}
  if($webhook.Count -ne 1 -or $webhook[0].valueFrom.secretKeyRef.name -ne $secret){throw 'Mail Webhook nicht via Secret Manager verbunden'}
  $rev=[string]$next.status.latestReadyRevisionName
  $tagged=@($next.status.traffic|Where-Object{$_.tag -eq $tag})
  if(!$rev -or $tagged.Count -ne 1 -or [int]$tagged[0].percent -ne 0 -or $tagged[0].revisionName -ne $rev){throw 'Kandidat ist nicht 0 Prozent markiert'}
  Probe $tagged[0].url
  Probe $base
  Write-Host 'PREPARED PASS: Keine Kundennachrichten aktiviert; Scheduler PAUSED.'
  Write-Host ('Bisherige Live Revision weiterhin 100 Prozent: '+$previous)
  Write-Host ('Neue vorbereitete Revision mit 0 Prozent: '+$rev)
  Write-Host 'WICHTIG: Make Szenario 8135270 bleibt INAKTIV.'
}finally{Pop-Location}
