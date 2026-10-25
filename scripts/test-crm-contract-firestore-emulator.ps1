# LSZH CRM V2 Phase C.2 - offline/demo Firestore emulator ONLY.
# No Make, Gmail, Cloud Run, production Firestore, customer documents or send calls.
$ErrorActionPreference='Stop'
$project='demo-lszha-c2-20261025'
$repository=Split-Path -Parent $PSScriptRoot
if(!(Test-Path -LiteralPath (Join-Path $repository 'firebase.json'))){
  throw 'Local Firebase emulator config missing.'
}
if(!(Get-Command node.exe -ErrorAction SilentlyContinue) -or
   !(Get-Command npx.cmd -ErrorAction SilentlyContinue)){
  throw 'Node.js and npx.cmd required. No emulator started.'
}
if(!(Get-Command java.exe -ErrorAction SilentlyContinue)){
  throw 'JDK 21+ required for the Firestore emulator. No emulator started.'
}
$previousActionPreference=$ErrorActionPreference
$ErrorActionPreference='Continue'
try {
  # Java prints its version to stderr even on success. Under Windows
  # PowerShell 5.1, ErrorActionPreference=Stop would otherwise abort.
  $javaOutput=(& java.exe -version 2>&1 | Out-String)
  $javaExit=$LASTEXITCODE
} finally {
  $ErrorActionPreference=$previousActionPreference
}
if($javaExit -ne 0 -or $javaOutput -cnotmatch '(?m)(?:version |openjdk )"?21(?:[.\s\"]|$)|(?:version |openjdk )"?(?:2[2-9]|[3-9][0-9])(?:[.\s\"]|$)'){
  throw 'Java 21 or later required. No emulator started.'
}
if($env:FIRESTORE_EMULATOR_HOST){
  throw 'An emulator host is already set. Clear it before starting a new isolated test.'
}
$previous=@{}
foreach($key in @('GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID','GOOGLE_APPLICATION_CREDENTIALS')){
  $previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process')
}
Push-Location $repository
try{
  $env:GCLOUD_PROJECT=$project
  $env:GOOGLE_CLOUD_PROJECT=$project
  $env:FIREBASE_PROJECT_ID=$project
  Remove-Item Env:\GOOGLE_APPLICATION_CREDENTIALS -ErrorAction SilentlyContinue
  Write-Host 'CONTRACT FIRESTORE EMULATOR ONLY: demo project, 127.0.0.1:8788, no cloud credentials or emails.'
  & npx.cmd --yes firebase-tools@15.1.0 emulators:exec --only firestore --project $project 'node --test crm-v2/emulator-tests/contract-dispatch-firestore.test.js'
  if($LASTEXITCODE -ne 0){throw 'Firestore emulator test failed. Do not send or deploy anything.'}
  Write-Host 'CONTRACT FIRESTORE EMULATOR TEST PASS (demo only).'
}finally{
  Pop-Location
  foreach($key in $previous.Keys){
    [Environment]::SetEnvironmentVariable($key,$previous[$key],'Process')
  }
}
