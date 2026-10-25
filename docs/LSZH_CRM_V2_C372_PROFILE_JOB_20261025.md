# LSZH C3.7.2 – Einmaliger Cloud-Run-Job fuer Gmail-Read-only-Profilpruefung

Stand: 25.10.2026. Neue Job-Software und GitHub-CI sind abgenommen; es wurde bislang weder ein Job bereitgestellt noch ausgefuehrt.

## Herkunft und Sicherheit

- Betreiberbestaetigung: Cloud Run lszh-crm-v2-c37-readonly-staging, Revision 00001-6j2, ausschliesslich internal Ingress, default URL disabled, dediziertes Servicekonto lszh-crm-c37-ro@lszh-automations.iam.gserviceaccount.com, Secret Mount Version 1. IAM-Servicepolicy ohne explizite Bindings.
- Revisionsannotation autoscaling.knative.dev/maxScale=1 und containerConcurrency=1 durch Betreiber verifiziert. Die Service-Annotation run.googleapis.com/maxScale=12 ist eine separate Obergrenze; keine Aenderung erforderlich.
- Der separate Job lszh-crm-c372-profile-probe hat keinen HTTP-Port oder Mailversand. Start nur in CLOUD_RUN_JOB-Laufzeit mit exakt 1 Task, Index 0 und Versuch 0. Der Prozess verweigert K_SERVICE, falsches Projekt oder aktivierte Versandflags.
- Das Jobprogramm nutzt die schon validierte C3.7-Secret-Huelle mit Version 1 und ausschliesslich gmail.readonly. Nach OAuth Audience-, Scope- und Ablaufpruefung fuehrt es einen einzigen GET /users/me/profile fuer das bestehende LSZH-Geschaeftspostfach durch. Keine Messages, keine Anhaenge, keine Firestore- oder Make-Aenderung.
- Es schreibt lediglich C3.7.2 JOB PASS oder C3.7.2 JOB BLOCKED, nie Tokens, Nachrichten, Provider-Fehlermeldungen oder Secretinhalte.
- Die isolierte Quelle stammt nur aus scripts/prepare-crm-c372-profile-job-source.ps1: zehn allowlist JavaScript-Dateien (inklusive c372-profile-job.js) plus eigene minimale package.json. Weder produktive server.js noch HTTP-Staging-Server noch offer-send.js werden kopiert.
- GitHub Actions Run 40216329279: 324/324 Node, 12/12 Firestore, Windows PowerShell Parser und isolierter Job-Source-Test PASS. Kein Live-Job-Test.

## Vorbereitung am Surface – keine Cloud-Aktion

```powershell
git pull --ff-only
npm.cmd test --prefix .\crm-v2
$jobOutput = @(powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\prepare-crm-c372-profile-job-source.ps1")
if ($LASTEXITCODE -ne 0) { throw "Quellcodevorbereitung fehlgeschlagen" }
$jobSourceDir = ($jobOutput | Select-Object -Last 1).Trim()
if (-not (Test-Path -LiteralPath $jobSourceDir -PathType Container)) { throw "Job-Verzeichnis fehlt" }
Get-ChildItem -LiteralPath $jobSourceDir -Name
```

## Zweite Freigabestufe: Job erstellen (noch nicht ausfuehren)

Nach bewusstem Operatorentscheid einen eigenen Job erstellen, falls nicht existent, nur aus dem isolierten Ordner. Fuer die erstmalige Anlage gibt es KEINE execute-now Option und KEIN wait.

```powershell
$project = 'lszh-automations'
$region = 'europe-west6'
$job = 'lszh-crm-c372-profile-probe'
$sa = "lszh-crm-c37-ro@$project.iam.gserviceaccount.com"
$existing = @(gcloud.cmd run jobs list --project=$project --region=$region --format='value(metadata.name)')
if ($LASTEXITCODE -ne 0) { throw 'Job-Liste konnte nicht gelesen werden' }
if ($existing -contains $job) { throw 'Job existiert bereits, keine Aenderung' }
gcloud.cmd run jobs deploy $job --project=$project --region=$region --source=$jobSourceDir --service-account=$sa --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=60s --memory=512Mi --command=node --args=c372-profile-job.js --set-env-vars='GOOGLE_CLOUD_PROJECT=lszh-automations,LSZH_C37_READONLY_ENABLED=true,LSZH_C37_TEST_ONLY=true,LSZH_C37_ENABLE_SENDING=false,LSZH_C37_ALLOW_CUSTOMER_MAIL=false' --set-secrets='/var/run/secrets/lszh-c37/gmail-readonly.json=lszh-crm-c37-gmail-readonly:1'
if ($LASTEXITCODE -ne 0) { throw 'Job Deployment fehlgeschlagen' }
gcloud.cmd run jobs describe $job --project=$project --region=$region --format=yaml
```

Vor der Ausfuehrung pruefen: genaue Job-Identitaet, genau eine Task, 0 Retries, dediziertes Servicekonto, nur Secret-Version 1, Startkommando node c372-profile-job.js, Send-Flags false.

## Dritte ausdrueckliche Freigabestufe: One-shot-Gmail-Lesetest

Erst nach erfolgreicher Konfigurationspruefung; nicht gleichzeitig mit der Erstellung:

```powershell
gcloud.cmd run jobs execute lszh-crm-c372-profile-probe --project=lszh-automations --region=europe-west6 --wait
```

Ein Job-Execution-Lauf ist die erste tatsaechliche Gmail-Backend-Operation. Bei BLOCKED keine automatischen Wiederholungen. Dieser Test beweist ausschliesslich das Gmail-Profil – noch keine SENT-PDF-Beweiskette.

## Betriebssperren

- Keine Aenderungen am bestehenden CRM/Cloud Run Webdienst, an Make 8144117 oder 8166714, kein Vertrags- oder Kundenmailversand.
- Source-Ordner nach Abschluss mit Remove-Item -LiteralPath $jobSourceDir -Recurse -Force bereinigen.
- Google Docs: https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/deploy und https://docs.cloud.google.com/run/docs/configuring/jobs/secrets und https://docs.cloud.google.com/run/docs/container-contract