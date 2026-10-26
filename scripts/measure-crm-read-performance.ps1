# LSZH CRM V2: privacy-preserving, read-only Cloud Run / Firestore performance report.
# Calls only gcloud Cloud Logging, Cloud Run describe, and Cloud Monitoring GET.
param(
  [ValidateRange(1,72)][int]$Hours=12,
  [ValidateRange(100,5000)][int]$MaxLogEntries=1500
)
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$live='lszh-crm-v2-00065-xuk'
$previous='lszh-crm-v2-00063-baz'
$culture=[Globalization.CultureInfo]::InvariantCulture

function Check([string]$reason){
  if($LASTEXITCODE -ne 0){throw "$reason (exit $LASTEXITCODE)"}
}
function Quantile([double[]]$numbers,[double]$fraction){
  if(!$numbers -or $numbers.Count -eq 0){return $null}
  $ordered=@($numbers|Sort-Object)
  $idx=[int][Math]::Ceiling($fraction*$ordered.Count)-1
  if($idx -lt 0){$idx=0}
  if($idx -ge $ordered.Count){$idx=$ordered.Count-1}
  return [Math]::Round([double]$ordered[$idx],0)
}
function Endpoint([string]$requestUrl){
  # Never print raw URL, customer search string, contact names or other query text.
  try{
    $uri=[uri]$requestUrl
    if($uri.AbsolutePath -ceq '/api/cockpit/summary'){return 'dashboard'}
    if($uri.AbsolutePath -match '^/api/records/(leads|kunden|offerten|rechnungen|projekte)$'){
      if($uri.Query -match '(?:^\?|&)(?:q|status|due)='){return 'search_or_filter'}
      if($uri.Query -match '(?:^\?|&)pageSize='){return 'register_page'}
    }
  }catch{return $null}
  return $null
}
function AddLogEntries([object]$value,[System.Collections.Generic.List[object]]$target){
  # Windows PowerShell 5.1 ConvertFrom-Json can wrap a root JSON array
  # as one pipeline object. Flatten containers before reading HTTP properties.
  if($null -eq $value){return}
  if($value -is [System.Array]){
    foreach($item in $value){AddLogEntries $item $target}
    return
  }
  if($value -is [pscustomobject]){[void]$target.Add($value)}
}
function ReadRevisionLog([string]$revision){
  # Windows PowerShell 5.1 via gcloud.cmd may strip embedded double quotes.
  # Use quote-free Cloud Logging values and --freshness instead of timestamps.
  if($revision -notmatch '^[A-Za-z0-9_-]+$' -or $service -notmatch '^[A-Za-z0-9_-]+$'){
    throw 'Unsafe Cloud Logging filter value'
  }
  $filter='resource.type=cloud_run_revision AND '+
    'resource.labels.service_name='+$service+' AND '+
    'resource.labels.revision_name='+$revision+' AND '+
    'httpRequest.requestMethod=GET AND '+
    '(httpRequest.requestUrl:cockpit OR httpRequest.requestUrl:records)'
  $raw=(& gcloud.cmd logging read $filter "--freshness=${Hours}h" "--project=$project" "--limit=$MaxLogEntries" '--format=json') -join [Environment]::NewLine
  Check ('Failed to read sanitized HTTP statistics for '+$revision)
  if(!$raw.Trim()){return @()}
  $entries=New-Object 'System.Collections.Generic.List[object]'
  AddLogEntries (ConvertFrom-Json -InputObject $raw) $entries
  $points=New-Object 'System.Collections.Generic.List[object]'
  foreach($entry in $entries){
    $request=$entry.httpRequest
    if(!$request -or $request -is [System.Array]){continue}
    $kind=Endpoint ([string]$request.requestUrl)
    if(!$kind){continue}
    # Malformed request logs are ignored, never cast a list of statuses.
    if($null -eq $request.status -or $request.status -is [System.Array]){continue}
    [int]$status=0
    if(![int]::TryParse([string]$request.status,[ref]$status)){continue}
    if($status -lt 100 -or $status -gt 599){continue}
    $latency=[string]$request.latency
    if($latency -notmatch '^([0-9]+(?:\.[0-9]+)?)s$'){continue}
    [double]$seconds=0
    if(![double]::TryParse($matches[1],[Globalization.NumberStyles]::Float,$culture,[ref]$seconds)){continue}
    if($seconds -gt 300){continue}
    $points.Add([pscustomobject]@{group=$kind;status=$status;ms=$seconds*1000})
  }
  # Emit points through the pipeline; Windows PowerShell 5.1 should not
  # package the results in another object[] when there is only one request.
  return $points.ToArray()
}
function PrintFailureBreakdown([object[]]$errors){
  if(!$errors -or $errors.Count -eq 0){return}
  $auth=@($errors|Where-Object {$_.status -eq 401 -or $_.status -eq 403}).Count
  $otherClient=@($errors|Where-Object {$_.status -ge 400 -and $_.status -lt 500 -and $_.status -ne 401 -and $_.status -ne 403}).Count
  $server=@($errors|Where-Object {$_.status -ge 500}).Count
  Write-Host ('    HTTP errors: 401/403 auth='+$auth+', other 4xx='+$otherClient+', 5xx='+$server)
}
function PrintLatency([object[]]$points,[string]$revision){
  Write-Host ''
  Write-Host ('REVISION '+$revision+' - Cloud Run Request Logs')
  foreach($group in @('search_or_filter','register_page','dashboard')){
    $all=@($points|Where-Object {$_.group -eq $group})
    $okay=@($all|Where-Object {$_.status -ge 200 -and $_.status -lt 400})
    $errors=@($all|Where-Object {$_.status -ge 400})
    [double[]]$latencies=@($okay|ForEach-Object {$_.ms})
    if(!$latencies.Count){
      Write-Host ('  '+$group+': 0 successful timings, '+$errors.Count+' errors')
      PrintFailureBreakdown $errors
      continue
    }
    $p50=Quantile $latencies 0.5
    $p95=Quantile $latencies 0.95
    Write-Host ('  '+$group+': '+$latencies.Count+' successful, '+$errors.Count+
      ' errors; p50='+$p50+' ms, p95='+$p95+' ms')
    PrintFailureBreakdown $errors
    if($latencies.Count -lt 20){
      Write-Host '    Note: p95 is unreliable with fewer than 20 samples.'
    }
  }
}
function FetchMonitoring([string]$metric,[string]$fromUtc,[string]$toUtc,[string]$token){
  $filter='metric.type = "'+$metric+'"'
  $urlBase='https://monitoring.googleapis.com/v3/projects/'+$project+'/timeSeries'
  $query='?filter='+[uri]::EscapeDataString($filter)+
    '&interval.startTime='+[uri]::EscapeDataString($fromUtc)+
    '&interval.endTime='+[uri]::EscapeDataString($toUtc)+
    '&view=FULL&pageSize=4000'
  $next=''
  [decimal]$total=0
  $points=0
  $seriesCount=0
  do{
    $url=$urlBase+$query
    if($next){$url+='&pageToken='+[uri]::EscapeDataString($next)}
    $response=Invoke-RestMethod -Method GET -Uri $url -TimeoutSec 45 -Headers @{Authorization=('Bearer '+$token);Accept='application/json'}
    foreach($series in @($response.timeSeries)){
      if(!$series){continue}
      $seriesCount++
      foreach($point in @($series.points)){
        if(!$point -or !$point.value){continue}
        if($null -ne $point.value.int64Value){
          $total+=[decimal]::Parse([string]$point.value.int64Value,$culture)
          $points++
        }elseif($null -ne $point.value.doubleValue){
          $total+=[decimal]$point.value.doubleValue
          $points++
        }
      }
    }
    $next=[string]$response.nextPageToken
  }while($next)
  return [pscustomobject]@{metric=$metric;total=$total;series=$seriesCount;points=$points}
}
function PrintFirestore([string]$fromUtc,[string]$toUtc){
  Write-Host ''
  Write-Host 'FIRESTORE - successful document reads across the project, NOT per CRM request'
  # Modern Database metric first; older firestore_instance metric as a fallback.
  $metrics=@(
    'firestore.googleapis.com/document/read_ops_count',
    'firestore.googleapis.com/document/read_count'
  )
  # OAuth token never printed or stored on disk.
  $token=((& gcloud.cmd auth print-access-token) -join '').Trim()
  Check 'Cannot obtain Google Cloud OAuth token'
  if(!$token){throw 'Empty OAuth token'}
  $answer=$null
  foreach($metric in $metrics){
    try{
      $result=FetchMonitoring $metric $fromUtc $toUtc $token
      if($result.points -gt 0){$answer=$result;break}
    }catch{
      Write-Host ('  Metric unavailable: '+$metric)
    }
  }
  $token=$null
  if(!$answer){
    Write-Host '  No metric data available. This is NOT proof of zero reads.'
    Write-Host '  Check monitoring.timeSeries.list permission and Monitoring API.'
    return
  }
  Write-Host ('  Source metric: '+$answer.metric)
  Write-Host ('  Successful document reads: '+$answer.total+
    '; series: '+$answer.series+'; points: '+$answer.points)
  Write-Host '  Includes other Cloud services using the same database.'
  Write-Host '  May exclude zero-result queries and index-entry billing.'
}
if(!(Get-Command gcloud.cmd -ErrorAction SilentlyContinue)){
  throw 'Google Cloud CLI is required.'
}
$svcRaw=(& gcloud.cmd run services describe $service "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
Check 'Cannot read Cloud Run service'
$svc=$svcRaw|ConvertFrom-Json
$routes=@($svc.status.traffic|Where-Object {[int]$_.percent -gt 0})
if($routes.Count -ne 1 -or [int]$routes[0].percent -ne 100 -or
   [string]$routes[0].revisionName -cne $live){
  throw 'Live CRM revision drifted from 00065; do not compare these samples.'
}
$end=[DateTimeOffset]::UtcNow
$start=$end.AddHours(-$Hours)
$fromUtc=$start.ToString('yyyy-MM-ddTHH:mm:ssZ',$culture)
$toUtc=$end.ToString('yyyy-MM-ddTHH:mm:ssZ',$culture)
Write-Host 'LSZH CRM V2 READ-ONLY PERFORMANCE MEASUREMENT'
Write-Host ('Project: '+$project+' | Live: '+$live+' (100%); rollback: '+$previous)
Write-Host ('UTC window: '+$fromUtc+' to '+$toUtc)
Write-Host ('Request logs limited to '+$MaxLogEntries+' entries per revision')
foreach($revision in @($live,$previous)){
  $samples=ReadRevisionLog $revision
  PrintLatency $samples $revision
}
try{PrintFirestore $fromUtc $toUtc}
catch{
  Write-Host 'Firestore Monitoring unavailable. HTTP statistics above are still valid.'
  Write-Host 'Check Cloud Monitoring IAM/API access before interpreting Firestore usage.'
}
Write-Host ''
Write-Host 'Limitations: different release periods and traffic mixes are not controlled experiments.'
Write-Host 'No customer search terms, full URLs, data records or OAuth credentials were output.'
Write-Host 'No CRM write, payment, reminder, mail or traffic operation executed.'
Write-Host 'CRM READ-ONLY PERFORMANCE REPORT COMPLETE'
