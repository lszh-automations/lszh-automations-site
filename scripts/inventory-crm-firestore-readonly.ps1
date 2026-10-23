# CRM V2 Firestore inventory: READ ONLY, no PII or token output.
# All writes, deployments, migrations and production traffic changes prohibited.
param([string]$Project="lszh-automations")
$ErrorActionPreference="Stop"
if($Project -ne "lszh-automations"){throw "Projekt nicht freigegeben: $Project"}
if(-not (Get-Command gcloud.cmd -ErrorAction SilentlyContinue)){throw "Google Cloud CLI ist nicht installiert"}

# Do not print bearer tokens or raw REST responses containing records.
$token=((& gcloud.cmd auth print-access-token --project $Project 2>$null) -join "").Trim()
if($LASTEXITCODE -ne 0 -or !$token){throw "Google Cloud Anmeldung fehlt. gcloud.cmd auth login ausfuehren."}
$headers=@{Authorization="Bearer $token"}
$base="https://firestore.googleapis.com/v1/projects/$Project/databases/(default)/documents"
function ReadCount([string]$collectionName) {
  $query=@{
    structuredAggregationQuery=@{
      structuredQuery=@{from=@(@{collectionId=$collectionName})}
      aggregations=@(@{alias="total";count=@{}})
    }
  }|ConvertTo-Json -Depth 10 -Compress
  $requestParams=@{Uri=($base+":runAggregationQuery");Headers=$headers;Method="Post";ContentType="application/json";Body=$query;ErrorAction="Stop"}
  $response=Invoke-RestMethod @requestParams
  $parts=@($response)
  if($parts.Count -lt 1 -or $null -eq $parts[0].result.aggregateFields.total.integerValue){
    throw "Keine gueltige COUNT-Antwort fuer $collectionName"
  }
  return [long]$parts[0].result.aggregateFields.total.integerValue
}
function ReadNext([string]$prefix,[string]$kind) {
  # Prefix ends with underscore and _meta begins with underscore: double underscore.
  $documentName=$prefix+"_meta/"+$kind+"_sequence"
  try{
    $uri=$base+"/"+$documentName+"?mask.fieldPaths=next"
    $document=Invoke-RestMethod -Uri $uri -Headers $headers -Method Get -ErrorAction Stop
    if($null -eq $document.fields.next.integerValue){return "nicht konfiguriert"}
    return [string]$document.fields.next.integerValue
  }catch{
    $code=$null
    if($_.Exception.Response){$code=[int]$_.Exception.Response.StatusCode}
    if($code -eq 404){return "nicht vorhanden (Standardstart 1000)"}
    throw "Firestore Sequenzabfrage fehlgeschlagen (HTTP $code). Keine Daten veraendert."
  }
}
$tables=@("leads","kunden","offerten","projekte","rechnungen")
$prefixes=@("lszh_crm_v2_","lszh_crm_v2_staging_")
foreach($prefix in $prefixes){
  $environment=if($prefix -eq "lszh_crm_v2_"){"LIVE"}else{"STAGING"}
  Write-Host ""
  Write-Host "$environment - $prefix"
  $counts=@{}
  foreach($table in $tables){
    $collection=$prefix+$table
    $count=ReadCount $collection
    $counts[$table]=$count
    Write-Host ("{0,-17} : {1,8}" -f $table,$count)
  }
  $offerNext=ReadNext $prefix "offer"
  $invoiceNext=ReadNext $prefix "invoice"
  Write-Host ("{0,-23} : {1}" -f "Offerten naechste Nr.",$offerNext)
  Write-Host ("{0,-23} : {1}" -f "Rechnungen naechste Nr.",$invoiceNext)
  if($counts["offerten"] -gt 0 -and $offerNext -like "nicht*"){
    Write-Warning "Offerten vorhanden, aber Sequenzzaehler fehlt. Vor Go-Live Nummernkreis abgleichen!"
  }
  if($counts["rechnungen"] -gt 0 -and $invoiceNext -like "nicht*"){
    Write-Warning "Rechnungen vorhanden, aber Sequenzzaehler fehlt. Vor Go-Live Nummernkreis abgleichen!"
  }
}
Write-Host ""
Write-Host "PASS: Inventar gelesen; keine Datensaetze, Secrets oder Dienste veraendert."
Write-Host "HINWEIS: Anzahlen allein beweisen keine Schema-/Nummernkreis-Kompatibilitaet."
