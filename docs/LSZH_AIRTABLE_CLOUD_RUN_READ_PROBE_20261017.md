# LSZH Automations – Staging Airtable→Cloud Run reine Leseprobe

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
