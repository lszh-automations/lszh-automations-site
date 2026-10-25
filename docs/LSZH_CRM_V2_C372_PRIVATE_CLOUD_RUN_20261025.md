# LSZH CRM V2 – C3.7.2: Private Gmail-Read-only-Staging-Laufzeit

**Stand 25.10.2026. Isolierter Code und Build-Quellordner vorbereitet. Noch KEIN Cloud-Run-Deployment und KEIN Gmail-Backend-Livetest.**

## Ausgangsnachweis

- C3.7.1 Offline-OAuth erfolgreich: Betreiber meldete `LSZH C3.7.1 PASS: Gmail readonly verifiziert, Secret-Version im dedizierten Secret gespeichert; kein Versand.`
- Anschliessende separate Secret-Manager-Metadatenprüfung durch Betreiber: `NAME  STATE` / `1     enabled`. **Damit ist genau eine aktive Secret-Version 1 belegt.** Keine Secretwerte wurden offengelegt.
- Verwendete Cloud-Ressourcen: Projekt `lszh-automations`, Region `europe-west6`, Servicekonto `lszh-crm-c37-ro@lszh-automations.iam.gserviceaccount.com`, Secret `lszh-crm-c37-gmail-readonly`. Die IAM-Zugriffsregel auf dem Secret selbst wurde geprüft; geerbte übergeordnete IAM-Berechtigungen wurden bislang nicht auditiert.

## Isolierter C3.7.2-Code

- `crm-v2/c372-readonly-server.js` ist ein **eigener** Cloud-Run-Prozess. Er importiert **nicht** den produktiven `crm-v2/server.js` und besitzt keinen Gmail-SEND-, Make-, Firestore-Schreib-, CRM- oder Rechnungspfad.
- Die Cloud-Run-Umgebung wird schon beim Start strikt begrenzt: `K_SERVICE=lszh-crm-v2-c37-readonly-staging`; `GOOGLE_CLOUD_PROJECT=lszh-automations`; `LSZH_C37_READONLY_ENABLED=true`; `LSZH_C37_TEST_ONLY=true`; alle Sendeschalter bleiben deaktiviert. Das ist eine zweite Sicherheitslinie nach den Cloud-Run-IAM- und Ingress-Einstellungen.
- `GET /healthz`: ausschliesslich statischer Gesundheitsstatus, kein Secret-Manager-, Google- oder Gmail-Zugriff.
- `POST /internal/gmail-readonly-check`: **nur ein ausdrücklich ausgelöster Aufruf**; keine Nutzlast oder URL-Query erlaubt. Er lädt die Secret-Version über den bestehenden festen Mountpfad `/var/run/secrets/lszh-c37/gmail-readonly.json`, frischt **nur** das Access-Token auf, validiert `aud`, exakt `gmail.readonly`, Ablaufzeit und GET Gmail-Profil `lars@lszh-automations.ch`. Die Antwort enthält nur statische Flags, keine Tokens, E-Mail-Inhalte, PDF-Daten oder Kundenidentifikatoren.
- Fehlende Berechtigung, falsche Identität, fehlendes Secret, unerwartete Anfrage, Fehler oder gleichzeitiger zweiter Aufruf werden blockiert. Diese HTTP-Anwendungsprüfung **ersetzt keine** Google-Cloud-IAM-Prüfung; der Dienst muss mit Cloud Run Invoker-Authentisierung und `--ingress=internal` bereitgestellt werden.
- `crm-v2/test/contract-gmail-c372-private-server.test.js`: synthetische HTTP-Fälle für isoliertes Service-Gate, statische Health, explizite POST-Autorisierung, Payload-/Pfadablehnung, Providerfehler, Nebenläufigkeit und No-Send-Trennung.
- `scripts/prepare-crm-c372-private-source.ps1`: erzeugt einen einzigartigen temporären Build-Kontext **nur aus zehn explizit erlaubten Git-Dateien plus minimaler package.json**. Er enthält nicht den produktiven CRM-Server, Make-Maildispatcher, lokal gespeicherte OAuth-Clients oder Kundendaten. Der Ordner wird **nicht automatisch hochgeladen, gebaut oder deployt**.
- GitHub Actions umfasst jetzt die C3.7.2-Node-Tests, JavaScript-Syntax und den Windows-Test des Source-Allowlist-Pakets.

## Operator – NÄCHSTER KONTROLLPUNKT (ohne Deployment)

Im Repository auf dem C3.7-Feature-Branch:

```powershell
git pull --ff-only
npm.cmd test --prefix .\crm-v2
$sourceDir = & ".\scripts\prepare-crm-c372-private-source.ps1"
Get-ChildItem -LiteralPath $sourceDir -Name
```

Erwartung: die zehn allowlist-Module und die minimale `package.json`, aber **kein** `server.js`, kein `offer-send.js`, keine Geheimdaten. Den erzeugten Ordner nach dem späteren Build mit `Remove-Item -LiteralPath $sourceDir -Recurse -Force` entfernen.

## Noch nicht ausgeführte separate Cloud-Run-Freigabe

Erst nach erfolgreicher Prüfung des erzeugten isolierten Build-Kontexts und ausdrücklicher Betreiberentscheidung:

1. Existenzprüfung des neuen, eigenständigen Dienstnamens `lszh-crm-v2-c37-readonly-staging` in `europe-west6`, keine Manipulation eines vorhandenen Dienstes.
2. Getrennte Cloud-Run-Quellcode-Bereitstellung `--source=$sourceDir` ausschliesslich aus diesem isolierten Ordner, mit `--service-account=lszh-crm-c37-ro@lszh-automations.iam.gserviceaccount.com`, `--no-allow-unauthenticated`, `--ingress=internal`, `--no-traffic`, `--max-instances=1`, `--concurrency=1`, `--min-instances=0`, und nur dem Secret-Mount `--update-secrets=/var/run/secrets/lszh-c37/gmail-readonly.json=lszh-crm-c37-gmail-readonly:1`. Die Schutzschalter werden als separate `--set-env-vars` gesetzt. Dies ist **noch nicht durchgeführt**. Google dokumentiert sowohl `--no-traffic` als auch private Zugangsprüfungen und Secret-Mounts: https://cloud.google.com/sdk/gcloud/reference/run/deploy .
3. Falls ein Null-Traffic-Deployment erfolgreich ist: erst dessen IAM, Ingress, Quellcode-Entry-Point, Servicekonto, Secret-Mount und null Traffic unabhängig prüfen, bevor ein isolierter Operator-Testaufruf mit gültiger Cloud-Run-Invoker-Identität aus einem **erlaubten internen Netzpfad** vorbereitet wird. Ein lokaler curl-Aufruf vom Surface ist bei `ingress=internal` nicht automatisch zugelassen.
4. Erst nach ausdrücklich freigegebenem, unabhängigem Live-Gmail-Profilcheck können wir den bestehenden C3.4/C3.5-Beweispfad für eine **vorher bekannte Test-Gmail-Nachricht mit 2/3 PDFs** getrennt prüfen. Weder Vertragsversand noch Firestore-Live-„SENT“ wird dadurch aktiviert.

**Bis dahin bleibt C3.7.2 in STAGING-CODE-ONLY.** Die produktiven Make-Szenarien 8144117 / 8166714, CRM-Cloud-Run-Dienste, Firestore und jegliche Kundenkommunikation bleiben unangetastet.


### C3.7.2 – Betreiber bestätigt privaten Quellordner (25.10.2026)

Betreiber hat auf dem C3.7-Branch `git pull --ff-only` und `npm.cmd test --prefix .\crm-v2` ausgeführt (**317 Tests, 317 PASS, 0 FAIL**) und nach Windows-PowerShell-ExecutionPolicy-Hinweis das Skript `prepare-crm-c372-private-source.ps1` explizit mit `powershell.exe -NoProfile -ExecutionPolicy Bypass -File` ausgeführt. `C3.7.2 SOURCE PASS`; `Get-ChildItem` zeigte **exakt 11 Dateien**: `c372-readonly-server.js`, `contract-dispatch-ledger-staging.js`, `contract-dispatch-release-staging.js`, `contract-gmail-api-readonly-staging.js`, `contract-gmail-c34-readback-staging.js`, `contract-gmail-c35-readonly-api-staging.js`, `contract-gmail-c36-local-oauth.js`, `contract-gmail-c37-backend-staging.js`, `contract-gmail-evidence-staging.js`, `offer-contract-package.js`, `package.json`. Keine produktive `server.js`, keine `offer-send.js`, kein OAuth-JSON im Quellordner. Noch **kein Cloud-Run-Deployment**, kein Backend-Live-Gmail-Test. Nächster Gate: ausschliesslich neue dedizierte Service-ID auf Existenz prüfen, danach explizit operatorausgelöstes Source-Deployment mit `--ingress=internal`, `--no-allow-unauthenticated`, SA `lszh-crm-c37-ro`, Secret-Version 1 am fixen Pfad, Versand-False-Gates und anschliessender Traffic-/IAM-Prüfung. Ein vom Surface direkter HTTP-Zugriff ist bei internem Ingress nicht möglich. Bestehende CRM-/Make-Dienste unverändert.

### 25.10.2026 – C3.7.2 Erst-Deployment STOP bei --no-traffic; sicherer Ersatz

- Betreiber hat den isolierten 11-Dateien-Source-Ordner geprüft und ein ausdrücklich operatorgestartetes `gcloud.cmd run deploy lszh-crm-v2-c37-readonly-staging` in `europe-west6` versucht, mit dediziertem Servicekonto, Secret-Mount Version 1, `--ingress=internal`, `--no-allow-unauthenticated`, `--no-traffic`, 1 Instanz und Readonly-Gates.
- Cloud Run lehnte die Neukonfiguration noch während der Validierung ab: **`--no-traffic not supported when creating a new service`**. Der anschliessende `gcloud.cmd run services describe` gab **`Cannot find service [lszh-crm-v2-c37-readonly-staging]`** zurück. **Kein Cloud-Run-Dienst, keine Revision und kein veränderter Produktiv-Traffic.** Es ist kein Gmail- oder Secret-Manager-Fehler.
- Korrektur nach aktueller Google-Dokumentation (https://cloud.google.com/run/docs/securing/ingress und https://cloud.google.com/sdk/gcloud/reference/run/deploy): Beim **ersten** Deployment `--no-traffic` weglassen und stattdessen **`--no-default-url`** setzen. **`--ingress=internal`**, **`--no-allow-unauthenticated`**, zusätzlich **`--invoker-iam-check`**, dediziertes SA, Secret-Version 1 und alle C3.7-Read-only/TEST_ONLY/Send-False-Flags beibehalten. Die erste Revision erhält somit regulär 100 % Service-Traffic, aber der Standard-`run.app`-Endpunkt ist gesperrt; keine kundenseitigen Service-Mappings oder Lastverteiler hinzufügen. Ohne freigegebene URL, passende interne Netzquelle und erlaubten Invoker ist kein Gmail-Test-Aufruf möglich.
- Direkt nach Deployment die effektiven Attribute **Ingress internal**, **Default URL disabled**, **IAM Invoker erforderlich**, **Servicekonto genau lszh-crm-c37-ro**, **Secret-Mount Version 1**, **eine bereitgestellte Staging-Revision**, **Service-Traffic gesondert vom produktiven CRM** überprüfen, IAM-Policy auf `allUsers` und `allAuthenticatedUsers` überprüfen. **Erst dann** einen separat autorisierten internen Testpfad konfigurieren. Das Deaktivieren der URL kann den künftigen Testzugang verzögern, ist hier aber absichtliche Sicherheit.
- Die zuvor im C3.7.2-Dokument genannten Erst-Deployment-Anweisungen mit `--no-traffic` sind **überholt und NICHT anzuwenden**. Kein Produktiv-Mail- oder Make-Szenario verändert; kein erneuter OAuth-Consent nötig.

### 25.10.2026 – C3.7.2 Skalierung bestaetigt, einmaliger Gmail-Lesejob CODE + CI PASS

- Betreiber-Cloud-Run-Describe des isolierten Dienstes bestaetigt `spec.template.metadata.annotations.autoscaling.knative.dev/maxScale: '1'` und `containerConcurrency: 1` trotz serviceweiter `run.googleapis.com/maxScale: '12'`. **Die Revisionsgrenze gilt; kein Cloud-Run-Service-Update noetig.** Bestehender Readonly-Dienst: `lszh-crm-v2-c37-readonly-staging`, private internal Ingress und default URL disabled, Secret v1, keine expliziten IAM-Invoker-Bindings.
- Separater einmailiger Cloud-Run-Job **CODE ONLY** implementiert: `crm-v2/c372-profile-job.js`; verifiziert echte Job-Laufzeit `CLOUD_RUN_JOB=lszh-crm-c372-profile-probe`, genau Task 0/1, null Retries, Projekt `lszh-automations`, Send-Flags false, dediziertes Secret v1, OAuth-Audience, exakt `gmail.readonly`, Ablauf und fuehrt danach ausschliesslich ein `GET /users/me/profile` fuer freigegebenes Geschaeftspostfach aus. Protokolliert nur PASS/BLOCKED, keinerlei Secretwerte.
- Der Job ist kein HTTP-Dienst und importiert weder produktiven CRM-Server noch Mailgateway; er kann von der abgeschotteten, ohne Default-URL bereitgestellten Cloud-Run-Webanwendung unabhaengig ausgefuehrt werden.
- `scripts/prepare-crm-c372-profile-job-source.ps1` erstellt ein separates temporäres Quellpaket nur aus zehn whitelisted JavaScript-Modulen und `package.json`, ohne OAuth JSON, produktive API, Kundenakten oder E-Mail-Versandkomponenten. Neu: `crm-v2/test/contract-gmail-c372-profile-job.test.js` mit sieben synthetischen Gate- und Nur-Lese-Tests, CI-Windows-Pakettest sowie `docs/LSZH_CRM_V2_C372_PROFILE_JOB_20261025.md` mit Operator-Schritten.
- **GitHub Actions https://github.com/lszh-automations/lszh-automations-site/actions/runs/40216329279: 324/324 Node PASS; 12/12 Firestore-Emulator PASS; Windows-PowerShell-Syntax, synthetischer stdin-Transporttest und Job-only-Quellpaketprüfung PASS.** **Noch KEIN Cloud-Run-Job erstellt, KEINE Job-Execution ausgelöst und KEIN serverseitiger Gmail-Live-Profiltest erfolgt.**
- Naechster sicherer Operator-Schritt: `git pull --ff-only`, `npm.cmd test --prefix .\crm-v2`, und mit `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-crm-c372-profile-job-source.ps1` den isolierten Job-Source-Ordner pruefen. Die Erstellung mit `gcloud run jobs deploy` wird getrennt von `gcloud run jobs execute --wait` freigegeben, jeweils nur fuer `lszh-crm-c372-profile-probe` mit max-retries=0 und dediziertem SA/Secret v1. Keine produktive Cloud-Run/Make/CRM/Firestore- oder Mailveraenderung.
