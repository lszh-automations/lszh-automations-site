# LSZH CRM V2 invoice settlement – safe production service candidate.
# Default: read-only preflight. -DeployCandidate: build with ZERO traffic.
# No Live cutover, test customer writes, emails or modifications to Make.
param([switch]$DeployCandidate)

$ErrorActionPreference = 'Stop'
$project = 'lszh-automations'
$region = 'europe-west6'
$service = 'lszh-crm-v2'
$expectedLive = 'lszh-crm-v2-00043-wur'
$serviceAccount = "lszh-crm-v2@$project.iam.gserviceaccount.com"
$requiredBranch = 'feature/crm-v2-invoice-settlement-20261024'
$tag = 'crm-settlement-qa'
$root = Split-Path $PSScriptRoot -Parent

function AssertExit([string]$context) {
  if($LASTEXITCODE -ne 0) { throw "$context (exit $LASTEXITCODE)" }
}
function ReadService {
  $raw = (& gcloud.cmd run services describe $service "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
  AssertExit 'Cloud Run service cannot be read'
  return $raw | ConvertFrom-Json
}
function ReadRevision([string]$revision) {
  $raw = (& gcloud.cmd run revisions describe $revision "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
  AssertExit ("Cloud Run revision cannot be read: " + $revision)
  return $raw | ConvertFrom-Json
}
function ActiveRevision($svc) {
  $active = @($svc.status.traffic | Where-Object { [int]$_.percent -gt 0 })
  if($active.Count -ne 1 -or [int]$active[0].percent -ne 100) {
    throw 'Unexpected production traffic split. DO NOT DEPLOY.'
  }
  return [string]$active[0].revisionName
}
function EnvItem($rev,[string]$name) {
  $values = @(@($rev.spec.containers)[0].env | Where-Object { $_.name -eq $name })
  if($values.Count -gt 1) { throw "Ambiguous env $name" }
  if($values.Count -eq 0) { return $null }
  return $values[0]
}
function AssertEnv($rev,[string]$name,[string]$expected) {
  $item = EnvItem $rev $name
  if(!$item -or [string]$item.value -cne $expected) {
    throw "Production baseline changed at $name. DO NOT DEPLOY."
  }
}
function EnvSignature($rev) {
  $envs = @(@($rev.spec.containers)[0].env | Sort-Object name | ForEach-Object {
    [pscustomobject]@{
      name = [string]$_.name
      value = [string]$_.value
      valueFrom = ($_.valueFrom | ConvertTo-Json -Depth 12 -Compress)
    }
  })
  return ConvertTo-Json -InputObject $envs -Depth 15 -Compress
}
function HttpStatus([string]$url) {
  try {
    return [int](Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop).StatusCode
  } catch {
    if($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      return [int]$_.Exception.Response.StatusCode
    }
    throw
  }
}

foreach($command in @('git','node','npm.cmd','gcloud.cmd')) {
  if(!(Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "Required command missing: $command"
  }
}

Push-Location $root
try {
  $branch = ((& git branch --show-current) -join '').Trim()
  AssertExit 'Cannot read Git branch'
  if($branch -cne $requiredBranch) {
    throw "Wrong branch: $branch (expected: $requiredBranch)"
  }
  $dirty = ((& git status --porcelain) -join '').Trim()
  AssertExit 'Cannot read Git worktree state'
  if($dirty) { throw 'Git worktree is not clean; refusing release candidate.' }
  $sha = ((& git rev-parse HEAD) -join '').Trim()
  AssertExit 'Cannot read Git commit'
  $remoteSha = ((& git rev-parse "origin/$requiredBranch") -join '').Trim()
  AssertExit 'Remote feature branch not fetched; run git fetch first.'
  if($sha -cne $remoteSha) { throw 'Local branch is not exactly the fetched origin branch.' }
  Write-Host ('SOURCE COMMIT: ' + $sha)

  Write-Host '1/4: Install test dependencies (without writing package-lock) and run CRM tests'
  & npm.cmd install --prefix '.\crm-v2' '--no-package-lock' '--no-audit' '--no-fund'
  AssertExit 'Cannot install CRM dependencies'
  & npm.cmd test --prefix '.\crm-v2'
  AssertExit 'CRM test suite FAILED; no deploy permitted'
  $dirtyAfter = ((& git status --porcelain) -join '').Trim()
  AssertExit 'Cannot verify Git status after tests'
  if($dirtyAfter) { throw 'Worktree became dirty during test installation; no deploy.' }

  Write-Host '2/4: Check exact current live traffic + protected settings'
  $before = ReadService
  if((ActiveRevision $before) -cne $expectedLive) {
    throw 'Current Live revision no longer matches the approved baseline; STOP.'
  }
  $baseline = ReadRevision $expectedLive
  if([string]$baseline.spec.serviceAccountName -cne $serviceAccount) {
    throw 'Cloud Run production service identity changed.'
  }
  foreach($pair in @(
    @('CRM_RECORD_PREFIX','lszh_crm_v2_'),
    @('CRM_WEBSITE_INTAKE_ENABLED','true'),
    @('CRM_MAIL_ENABLED','true'),
    @('CRM_OFFER_MAIL_ENABLED','true'),
    @('CRM_OFFER_MAIL_MODE','production'),
    @('CRM_MAIL_ACTIVE_FROM','2026-10-23T16:15:28Z'),
    @('CRM_INVOICE_QR_ENABLED','true'),
    @('CRM_INVOICE_PRODUCTION_APPROVED','true')
  )) { AssertEnv $baseline ([string]$pair[0]) ([string]$pair[1]) }

  foreach($gate in @('CRM_INVOICE_MAIL_ENABLED','CRM_INVOICE_MAIL_PRODUCTION_APPROVED')) {
    $item = EnvItem $baseline $gate
    if($item -and [string]$item.value -eq 'true') {
      throw "Invoice emails are already enabled: $gate. Stop for manual review."
    }
  }
  $iban = EnvItem $baseline 'CRM_INVOICE_IBAN'
  if(!$iban -or $iban.value -or
    [string]$iban.valueFrom.secretKeyRef.name -cne 'lszh-crm-v2-invoice-iban' -or
    [string]$iban.valueFrom.secretKeyRef.key -cne '1') {
    throw 'Protected company IBAN binding must remain Secret Manager v1.'
  }
  $signature = EnvSignature $baseline
  Write-Host ('PASS: live remains ' + $expectedLive + ' at 100 percent')
  Write-Host 'PASS: mail / intake / invoice / IBAN protection gates match the baseline'

  if(!$DeployCandidate) {
    Write-Host 'PRE-FLIGHT PASS: READ ONLY. No candidate deployed and no production changes.'
    Write-Host 'To build ZERO TRAFFIC candidate: add -DeployCandidate'
    return
  }

  Write-Host '3/4: Create zero-traffic candidate from tested code'
  # Keep existing service settings and all secret bindings by not specifying
  # --set-env-vars, --update-env-vars, --set-secrets, --service-account or --allow-unauthenticated.
  & gcloud.cmd run deploy $service '--source' '.\crm-v2' "--project=$project" "--region=$region" '--no-traffic' "--tag=$tag" '--quiet'
  AssertExit 'Cloud Run candidate build failed'
  $after = ReadService
  if((ActiveRevision $after) -cne $expectedLive) {
    throw 'CRITICAL: live traffic changed unexpectedly – check traffic immediately.'
  }
  $candidate = [string]$after.status.latestReadyRevisionName
  if(!$candidate -or $candidate -ceq $expectedLive) {
    throw 'Candidate revision not created or not ready.'
  }
  $revision = ReadRevision $candidate
  if([string]$revision.spec.serviceAccountName -cne $serviceAccount) {
    throw 'Candidate service identity differs from live.'
  }
  if((EnvSignature $revision) -cne $signature) {
    throw 'Candidate env/secret references differ from active live revision.'
  }
  $route = @($after.status.traffic | Where-Object {
    $_.revisionName -eq $candidate -and $_.tag -eq $tag -and [int]$_.percent -eq 0
  })
  if($route.Count -ne 1) {
    throw 'Candidate is not uniquely routed at zero traffic.'
  }

  Write-Host '4/4: Verify candidate HTTP config and authentication denial'
  $url = [string]$route[0].url
  if(!$url -or !$url.StartsWith('https://')) { throw 'Candidate tag URL not found.' }
  if((HttpStatus ($url.TrimEnd('/')+'/api/config')) -ne 200) {
    throw 'Candidate config endpoint unavailable.'
  }
  if((HttpStatus ($url.TrimEnd('/')+'/api/records/rechnungen')) -ne 401) {
    throw 'Candidate invoice API is unexpectedly accessible without authentication.'
  }
  if((ActiveRevision (ReadService)) -cne $expectedLive) {
    throw 'Live traffic drift after candidate verification.'
  }

  Write-Host 'CRM INVOICE SETTLEMENT ZERO TRAFFIC PASS'
  Write-Host ('CANDIDATE REVISION: ' + $candidate)
  Write-Host ('CANDIDATE URL: ' + $url)
  Write-Host ('LIVE UNCHANGED: ' + $expectedLive + ' (100 percent)')
  Write-Host 'NO EMAIL SEND / NO PAYMENT RECORDS / NO CUSTOMER DATA CHANGES.'
  Write-Host 'STOP: candidate is NOT yet deployed to Live URL. Cutover is a separate step.'
} finally {
  Pop-Location
}
