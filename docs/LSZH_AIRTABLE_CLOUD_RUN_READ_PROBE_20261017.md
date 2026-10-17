# LSZH Automations – Staging Airtable→Cloud Run reine Leseprobe

## UPDATE 17.10.2026 – Dienstkonto erstellt, getrennte leere Secret-Ressource vorbereitet

**Tatsächlicher Cloud-Shell-Nachweis durch Geschäftsführer**: `staging-airtable-identity.sh --create-identity` meldet `Created service account [lszh-airtable-read-stg]`, anschliessend `PASS: Dedicated staging Airtable-read service account exists, with NO new IAM grants.` Die andere erwartete Secret-Ressource und der Cloud-Run-Lesejob existierten laut unmittelbar vorausgegangenem Cloud-Inventar noch **nicht**. Kein IAM-Grant, Key, Secret oder Job durch den Befehl.

Neue **getrennte** Shell-Phase `staging-airtable-empty-secret.sh`, getestet durch `staging-airtable-empty-secret.test.mjs` (7 simulierte Prüfungen). Default `--plan` liest ausschliesslich GCP-Metadaten für aktives Geschäftskonto, Review-Git-Branch, bereits bestehende SA, Secret und Job; **noch keine Cloud-Änderung**. Späterer einmaliger `--create-empty`-Modus legt ausschliesslich das **leere** Secret `lszh-airtable-readonly-staging` mit `gcloud secrets create --replication-policy=user-managed --locations=europe-west6` an. Kein `--data-file`, keine Version, kein PAT, keine IAM-Rollenvergabe, keine Cloud-Run-Änderung. Prüft Resource-Name, genau eine Zürcher Replikation und **null Secret-Versionen** nach Anlage; STOP bei bestehenden Ressourcen oder unerwarteten Metadaten.

GitHub CI nach der Neuerung: **119/119 JS-Tests + 8/8 IAM-Tests grün**, nur Offline-Mocks, keine Cloud-Ressourcen durch Tests.

**Nächster Cloud-Shell-Aufruf (nur Plan!):**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-empty-secret.sh
```
Erwartet `Existing secret/job: false/false` und `PLAN ONLY`; sonst STOP und zuerst prüfen. Bei separater expliziter `--create-empty`-Ausführung kann das leere Secret geringe Kosten verursachen. Erst **anschliessend**, in jeweils getrennten gesicherten Schritten, eine Secret-Version mit ausschliesslich CRM-Read-PAT und eine **secret-spezifische** SecretAccessor-Rolle für das neue SA einrichten, dann Image/Job mit Versions-Pin erstellen und manuell genau einmal ausführen. Keine Tokens im Chat/GitHub/Cloud-Shell-Verlauf und kein Zugriff auf andere Secrets.

## UPDATE 17.10.2026 – Eigenständiges Cloud-Dienstkonto: Freigabe in Etappen

Der Geschäftsführer bestätigte mit `vamos` die Weiterarbeit an den zuvor vorgeschlagenen **separaten, rein synthetischen STAGING-Ressourcen**; noch kein Ausführen, Erzeugen, Hinterlegen oder Freigeben eines realen Google-Cloud-Secrets durch diesen Schritt.

Neu: `workers/onboarding-notifications/staging-airtable-identity.sh` (per Default `--plan`) prüft:
- ausschliesslich `lars@lszh-automations.ch` in `lszh-automations`, sauberen und mit `origin` synchronisierten Git-Review-Branch;
- lesende Inventarisierung von Dienstkonten, Secret-Manager-Secretnamen und Cloud-Run-Jobs (`europe-west6`). Enumeration-Fehler = STOP;
- exklusiv reservierte neue Namen `lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com`, `lszh-airtable-readonly-staging`, `lszh-airtable-read-probe-staging`; bereits vorhandene namensgleiche Ressourcen führen bei `--create-identity` zum STOP ohne Überschreiben.

Einzige ausdrücklich aktivierbare Änderung per `--create-identity`: **nur ein neues Google-Dienstkonto**, ohne IAM-Rollen, SA-Key, Secret-Version oder Cloud-Run-Job. Die sofortige `describe`-Rückleseprüfung bestätigt den korrekten Namen. Das Skript enthält keine Berechtigung zum Start eines Jobs, zum Zugriff auf Airtable-Daten oder zur Erstellung des PAT-Secrets.

**GitHub Actions Offline-Tests (STAGING-only):** Die neue `staging-airtable-identity.test.mjs` testet PLAN ONLY, separate Dienstkontoanlage ohne IAM-Binding, vorhandene Ressourcen, falsche Kontoidentität und fehlerhafte Inventarisierung, ungültige Flags sowie `bash -n` syntaktisch. Im Workflow am Commit `510d77825f75d8b25c653800bad2f0b426727d17` **112/112 JavaScript-Tests, 8/8 IAM-Tests bestanden**. Es wurden dabei keine Cloud-Ressourcen erstellt.

**Sicherer nächster Nutzerbefehl:**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-identity.sh
```
Erwartet `PLAN ONLY`; danach getrennt entscheiden, ob `--create-identity` ausgeführt wird. Keine Secret- oder Jobaktion im selben Schritt.

**Spätere Schritte (jeweils eigener Preflight und ausdrückliche Ausführung):** (1) überprüfte neue Dienstkontoidentität, (2) neues Secret im *globalen* Secret Manager, mit expliziter `user-managed` Replikation nur in `europe-west6`, danach Secret-Version nur über sicheren Kanal ohne Chat/GitHub/Shell-History, (3) `roles/secretmanager.secretAccessor` **nur auf dem einen Secret**, (4) review-gebundener Container-Build ohne PAT, (5) isolierter Cloud Run Job mit **Datei-Secret-Mount** und Versionspin, 1 Task/0 Retries, nicht automatisch ausführen, (6) getrennt freigegebene einmalige Execution und nur aggregierte PASS/STOP-Logs. Keine Cloud Run *regionalen Secrets* verwenden – diese werden laut aktueller Google-Dokumentation nicht als Cloud-Run-Job-Secrets unterstützt; ein globales Secret mit einer Zürcher benutzerverwalteten Replik ist die vorgesehene Form.

`--plan` kann auch bestehen, wenn Ressourcen schon existieren; **nicht** daraus auf Berechtigungen oder Benutzerzugriff schliessen. Vor jedem Folgeschritt tatsächliche IAM-Bindings und Secret-/Jobmetadaten getrennt prüfen. Die bestehenden Cloud-Run-HTTP-Dienste und vorher abgeschlossenen Firestore-Jobs nicht verändern.

**Stand 17.10.2026.** PR #8, isolierter Vorbereitungscode, **nicht in Google Cloud bereitgestellt oder gestartet**. Freigabe zum Lesen aus Cloud Shell ist keine Freigabe zur Ablage von Zugangsdaten im Cloud Secret Manager oder zum Job-Deployment.

## Aktueller verifizierter Nachweis

Der Geschäftsführer führte `staging-airtable-rest-read.sh --probe` im geprüften Firmen-Cloud-Shell-Checkout aus:
- 1. Aufruf: `STOP: airtable_token_not_authorized` (nicht weiter untersucht).
- 2. Aufruf: `PASS: Existing verifyOnboardingState() used Airtable REST via exactly one GET.`, `PASS: Fresh unprinted synthetic project code absent; processing (not completed).`, `PASS: No Airtable writes, Firestore operations, service changes or emails.`, `PASS: Isolated Airtable REST verifier finished; no customer record was changed.`

Damit ist ein **Airtable-REST-Token-basierter GET direkt aus Cloud Shell** bestätigt, nicht bereits ein Cloud-Run→Airtable-Zugriff. Das Token ist nicht im Code, Repository, Secret Manager oder Cloud-Run-Dienst hinterlegt.

## Neu vorbereiteter separater Laufzeit-Baustein

Der isolierte `workers/onboarding-notifications/airtable-runtime-probe.js` nutzt die unveränderte eigentliche `onboarding/confirmation.js` über `staging-airtable-rest-read.js`:

1. Ausschliesslich im speziell benannten **Cloud-Run-Job** `lszh-airtable-read-probe-staging`, Task-Index `0`, Versuch `0`, GCP-Projekt `lszh-automations`; Flags `LSZH_AIRTABLE_RUNTIME_PROBE_ONLY=true` und `LSZH_OUTBOX_STAGE_ENABLED=false` erforderlich.
2. Kein Secret als Umgebungsvariable oder Argument. Einziger erlaubter Secret-Pfad: `/var/secrets/lszh/airtable-read-pat` – **später**, nur mit expliziter Freigabe und Secret-Manager-Mount. Das Programm liest ihn einmalig ohne Ausgabe.
3. Die bestehende Verifizierungsfunktion erstellt einen kryptografisch zufälligen, unveröffentlichten `ob_<UUIDv4>`-Code und sendet **genau einen** gefilterten HTTPS-GET an `api.airtable.com/v0/appzJiskpAdaR1HEv/tblWIY4l4VASz8Vse`. Es darf kein Kundendetail-, Bestell- oder weiterer Read folgen. Die Abwesenheit muss als `processing` zurückkommen. Unexpected `completed` ist verboten. Die Antwort enthält kein Kunden-Payload.
4. Keine Firestore-Abhängigkeit, keine Make-Anfragen, kein Mailtransport, kein Scheduler und keine Verwendung des existierenden HTTP-Outbox-Dienstes. Kein eingebautes Deployment. Bei falschem Job/Projekt, nicht gemountetem Secret, fehlenden Flags, 401/403, 429 oder unerwarteten Daten: Fail closed.

Source: `airtable-runtime-probe.js` + `staging-airtable-rest-read.js` + `onboarding/confirmation.js`; `Dockerfile.airtable-read-probe` verpackt **nur diese drei .js-Dateien** in ein separates Node-22-Image ohne Secrets, Web-App oder Firestore-Code. Die vollständige Offline-/Mock-Testdatei `airtable-runtime-probe.test.mjs` prüft unter anderem Startup-Sperren, nur einen GET, fehlendes Secret, falsche Jobidentität, manipulierte Runtime-Umgebung und unerwartete Airtable-Treffer. CI baut das Container-Image **lokal ohne Push und ohne Cloud-Deployment** und prüft, dass es ohne Berechtigungsflag und Cloud-Jobidentität nicht ausgeführt werden kann.

## Sicherheitsdesign für eine *spätere* ausdrücklich freigegebene Cloud-Ausführung

- Separates GCP-Dienstkonto vorschlagen: `lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com`, **keine Firestore-, Cloud-Run-Service-Admin-, Make- oder Gmail-Rechte**.
- Neues, nur Staging zugewiesenes Secret vorschlagen: `lszh-airtable-readonly-staging`, Secret-Manager-IAM `roles/secretmanager.secretAccessor` **nur auf dieses einzelne Secret** und nur für dieses Dienstkonto, kein projektweites Secret-Reader-Grant.
- Das bereits interaktiv verwendete Airtable-PAT nur wiederverwenden, **wenn es tatsächlich ausschliesslich `data.records:read` für die eine LSZH Website-CRM-Basis** erlaubt und nicht überprivilegiert ist; besser bei Bedarf ein neues kurzlebiges Staging-PAT erstellen. Weder PAT noch Secret-Inhalt über Chat, git, Shell-History, Kommandozeilenargumente oder Logs übertragen.
- Nur neue **separate** Cloud-Run-Job-Ressource, 1 Task, 0 Retries, manuell einmal gestartet. Bei späterem Secret-Mount Dateiberechtigungen für den unprivilegierten Containerbenutzer kontrollieren. Secret-Version bewusst pinnen, nicht stillschweigend `latest` wechseln.
- Das neue Job-Image darf nicht in den bestehenden HTTP-Dienst deployt werden. Dessen `LSZH_OUTBOX_STAGE_ENABLED=false`, anonymer HTTP 403 und fehlende Versand-/Scheduler-Konfiguration bleiben unverändert. Die schon durchgeführten Firestore-Probejobs niemals erneut starten.
- Ein erfolgreicher Cloud-Run-Read-Probe würde nur die **einzelne** Cloud-Run→Airtable-Verbindung mit einem *nicht vorhandenen* zufälligen Testcode beweisen, **nicht** den End-to-End-Pfad mit einem vorhandenen Onboarding und auch keine rechtliche RC1-/AVV-/Versandfreigabe.
- Nach Probe separate Entscheidung über Secret-Rotation/Widerruf und das Löschen des nicht mehr benötigten Probe-Jobs. Keine unkontrollierte Archivierung von Zugangsdaten.

## Derzeitiger Status

- **BESTANDEN:** Echtes Airtable-GET von Cloud Shell; vorheriger CRM-Fixture-Test mit drei anschliessend bestätigten Löschungen; separat Firestore create/read/conditional delete; vorhandener privater HTTP-Outbox-Dienst mit disabled.
- **BESTANDEN (offline):** Separate Cloud-Run-Leseroutine mit strikter Job-/Secret-/Request-Sperre und automatisierten Mock-Tests, sofern GitHub CI grün.
- **NICHT DURCHGEFÜHRT:** Container-Image-Push, Dienstkonto- oder Secret-Anlage, Cloud-Run-Job-Deployment, Cloud-Run-Airtable-Live-GET, neuer CRM-Fixture-Test, PR-Merge oder E-Mail-Versand.
- **Nächste Freigabegrenze:** keine GCP-Ressourcen oder Secret-Kopien schaffen, bis ein eigener sicherheitsüberprüfter Build-/Deployplan vorliegt und der Geschäftsführer den genau definierten Vorgang ausdrücklich genehmigt.
