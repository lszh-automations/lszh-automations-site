# LSZH Onboarding-Outbox – STAGING-only, keine E-Mails

**Stand:** 16.10.2026. Nur Entwurf auf Branch `feature/onboarding-notification-outbox-20261016` / Draft PR #8; nicht gemergt, nicht deployt, nicht aktiv.

## Bestätigte Infrastruktur aus Geschäftskonto (diagnostiziert am 16.10.2026)

- Google-Cloud-Projekt: `lszh-automations`; aktives Geschäftskonto bestätigt.
- Firestore Native: **bestehende benannte** Datenbank `lszh-offers-staging`, Region **`europe-west6` (Zürich)**. Es gibt **keine** `(default)`-Datenbank. Keine neue Datenbank nur für diesen synthetischen Versuch erstellen.
- Artifact Registry: **bestehendes** Docker-Repository `cloud-run-source-deploy`, Standort `europe-west6`. Kein neues Repository erforderlich.
- APIs aktiviert: Cloud Run, Cloud Build, Artifact Registry, Firestore, Secret Manager.
- Vorhandene Cloud-Run-Staging-Services: `lszh-archive-reader-staging`, `lszh-offer-acceptance-staging`, `lszh-offer-portal-staging`. **Nicht verändern.**
- Outbox-spezifisches Dienstkonto `lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com`: **am 16.10.2026 von Geschäftsführer in Google Cloud Shell erstellt**; Cloud IAM-Änderung mit `Updated IAM policy` bestätigt. **Tatsächliche REST-Berechtigung und Scope noch nicht nachgewiesen**.
- Outbox-spezifischer Cloud-Run-Dienst `lszh-onboarding-outbox-staging`: **fehlt**.

**Sicherheitshinweis:** Die vorhandene Firestore-Datenbank ist für Offerten-Staging benannt. Eine zusätzliche, getrennte Collection für rein synthetische Onboarding-Tests ist funktional möglich und vermeidet eine neue Datenbank. **IAM lässt sich per Bedingung auf diese Datenbank, aber nicht auf unsere einzelne Collection begrenzen.** Daher darf das Servicekonto nur für den isolierten synthetischen Staging-Test genutzt werden; vor Livebetrieb separate Datenbank oder stärker isolierte Architektur prüfen.

## Datenfluss (nur Testentwürfe)

```
privater Cloud-Run-Worker (im Code standardmässig DEAKTIVIERT)
   + explizit genehmigter synthetischer Onboarding-Projektcode
   -> Airtable lesend: Onboarding -> Auftrag -> Kunde -> ggf. DSG-Aufgabe
   -> nur wenn alle Persistenzprüfungen erfolgreich sind:
      Firestore projects/lszh-automations/databases/lszh-offers-staging/
       documents/lszh_onboarding_notification_drafts_staging/<SHA256-key>
      status DRAFT_NOT_SENT, testOnly=true, deliveryEnabled=false, emailSent=false
   X kein Gmail, Make-Mail-Modul, SMTP oder Versand-Consumer
```

Der technische Abschluss der **Onboarding-Eingabe** ist *nicht* der Abschluss des Kundenprojekts. Es wird nur ein Entwurf für eine spätere Benachrichtigung vorgemerkt; es ist keine Empfangs- oder Versandgarantie.

### Sicherheitsgates

- Der Dienst ist ohne `LSZH_OUTBOX_STAGE_ENABLED=true` deaktiviert. **Keine** produktiven Aktivierungen, Scheduler oder E-Mails.
- `FIRESTORE_PROJECT_ID=lszh-automations` **und** `FIRESTORE_DATABASE_ID=lszh-offers-staging` sind erforderlich und intern noch einmal hart verdrahtet.
- `LSZH_STAGING_FIXTURE_CODES` muss **1 bis maximal 3** ausdrücklich genehmigte synthetische Codes enthalten (Kommatrennung, `ob_<UUID>`). Der Dienst scannt **nicht mehr** alle CRM-Onboardings. Ohne Fixture-Allowlist keine Verarbeitung. Diese Codes als Secret behandeln, nicht ins GitHub-Repo oder Logs schreiben.
- `AIRTABLE_ONBOARDING_READ_TOKEN`: Airtable Personal Access Token mit **ausschliesslich Lesezugriff** auf die Website-CRM-Base; als Google-Secret, nicht im Repo.
- `OUTBOX_CONTROL_SECRET`: zufällig gewählter, mindestens 32 Zeichen langer Header-Wert; nur als Secret.
- Nur privates Cloud Run mit `--no-allow-unauthenticated`, eigener Laufzeitidentität, `POST /internal/reconcile` über Cloud-Run-Invoker-Authentisierung **plus** zusätzlichem Header-Secret; keine beliebigen HTTP-Body-Inhalte.
- Firestore-REST-Zugriff über kurzfristiges Metadaten-Token der Cloud-Run-Dienstidentität; **kein JSON-Dienstkontoschlüssel**.
- Atomare `createDocument(documentId)` mit Event-ID SHA-256 aus Record-ID und Ereignisversion; bei 409 nur verifizierte identische `DRAFT_NOT_SENT`-Dokumente als existent behandeln. Fehler bleiben fail-closed; keine erneuten Sendungen.
- Entwürfe enthalten keine Projektcode-Links, Empfängeradressen oder Rechnungsangaben. **Airtable-Lesezugriff kann diese Daten dennoch sehen**, deshalb beschränkte Fixture-Allowlist.
- Erst **vor** echtem Einsatz dedizierte Firestore-Datenbank sowie kontrollierte Versandzustände, Provider-Idempotenz, Retention und Fehler-Reconciliation festlegen.

## Bereits vorbereitete, nicht ausgeführte Dateien

- `Dockerfile`: separater Node-Worker, Docker COPY-Allowlist, kein .env, keine Website, keine Git-Metadaten im Container.
- `cloudbuild.staging.yaml`: baut/pusht ein separat benanntes Image unter **`europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-onboarding-outbox`**; **kein** Deployment. Ausführen erst nach ausdrücklicher Freigabe.
- `staging-preflight.sh`: rein lesender Check der **tatsächlich vorhandenen** benannten Datenbank und Docker-Registry sowie fehlender Staging-Laufzeitidentität.
- `staging-diagnostics.sh`: rein lesende detaillierte Google-Cloud-Inspektion.
- `staging-identity-setup.sh`: ohne Argumente nur Plan/Prüfung; **nur mit** `--apply` explizites Erstellen des eigenen Staging-Dienstkontos und Setzen einer **datenbankbezogenen** IAM Condition. Keine Schlüssel, Datenbank, Deploys oder Kundenmails.
- `airtable-candidates.js`: ausdrücklich genehmigte synthetische Codes, **kein vollständiger Airtable-Scan**.
- `firestore-store.js`: fest verdrahtete benannte Staging-Datenbank und Collection.
- `.github/workflows/onboarding-notification-outbox.yml`: synthetische Offline-/HTTP-Integrations- und Docker-Build-Tests, ohne Push/Deploy.

## Nächste Entscheidungen und Grenzen

1. **Erledigt:** Für die Staging-Prüfung ist das dedizierte Outbox-Dienstkonto nach ausdrücklicher Ausführung durch den Geschäftsführer angelegt worden. Kein Service-Account-Key erzeugt.
2. **Policy eingerichtet; Wirksamkeit offen:** `roles/datastore.user` mit IAM-Bedingung `resource.name=="projects/lszh-automations/databases/lszh-offers-staging"`. Das ist **datenbankweit**, nicht collection-spezifisch. Projekt-Policy und mögliche zusätzliche Rollen mit read-only Skript prüfen. Vor Produktiveinsatz getrennte Datenbank.
3. Gegebenenfalls Cloud-Build-/Artifact-Registry- und Cloud-Run-Invoker-Rechte separat prüfen. Kein Admin-/Editor-Projektrollenpaket pauschal verleihen.
4. Private Cloud-Run-Testinstanz getrennt von bestehendem Angebotssystem erstellen und zuerst mit `LSZH_OUTBOX_STAGE_ENABLED=false` auf `/health` prüfen. Testcodes/Secrets nicht als Klartext im Repository oder Chat veröffentlichen.
5. **Nur** nach verifizierten synthetischen Airtable-Fixtures und ausdrücklicher Testfreigabe `LSZH_OUTBOX_STAGE_ENABLED=true` und einen **manuellen** Testlauf durchführen. Der Dienst legt höchstens einen gesperrten Firestore-Entwurf pro Fixture an. Kein Scheduler, kein Sendetransport.
6. Für spätere Produktivbenachrichtigungen erst getrennten Outbox-Consumer, echte E-Mail-Freigabe, Vertrags-/AVV-Gates, Zustandsautomaten und Provider-ID-Abgleich konzipieren. Make Szenario `7777695` und seine `0=1`-Kundenmail-Sperre unverändert lassen.

### Staging-Identität angelegt; IAM-Prüfung steht an

Am 16.10.2026 ausgeführt: Der Geschäftsführer hat in Google Cloud Shell `staging-identity-setup.sh --apply` ausgeführt. Rückgabe: `Created service account [lszh-onboarding-outbox-staging]` und `Updated IAM policy for project [lszh-automations]`. Kein Schlüssel, kein Firestore-Schreiben, kein Deployment.

**Jetzt ausschliesslich lesende Prüfung:**

```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-identity-verify.sh
```

Dieser Check verifiziert die aktive geschäftliche Identität, die benannte Zürcher Datenbank, den aktivierten Dienstkontonamen, den **exakt formulierten** projektspezifischen IAM-Binding `roles/datastore.user` mit `resource.name`-Bedingung und das Fehlen zusätzlicher Projektrollen sowie nutzerverwalteter Dienstkontoschlüssel. Im Fehlerfall **keine neue Rolle blind vergeben und `--apply` nicht erneut ausführen**; erst den konkreten Fehler prüfen.

**Grenze des Checks:** Projekt-IAM-Policy ist nicht dasselbe wie effektive REST-Berechtigung. Rollen von einer übergeordneten Organisation/einem Folder werden nicht angezeigt; Firestore-Rechte können erst nach einigen Minuten wirksam werden. Das benannte Dienstkonto wird später nur über einen privaten Cloud-Run-Testdienst mit dieser Identität für synthetische Datensätze geprüft. Noch **keine** Berechtigung auf eine bestimmte Collection beschränkt.

#### Nachweis der ursprünglichen Einrichtung


Ausschliesslich im bestehenden geschäftlichen Cloud-Shell-Klon:

```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-identity-setup.sh
```

Der ursprüngliche rein lesende Einrichtungsplan wurde durchgeführt; der nachfolgende `--apply`-Befehl wurde am 16.10.2026 vom Geschäftsführer bereits ausdrücklich ausgeführt. **Nicht wiederholen**, sofern keine gezielte Korrektur nötig ist. Der historische Einrichtungsbefehl war:

```bash
bash workers/onboarding-notifications/staging-identity-setup.sh --apply
```

Die IAM-Rolle wurde mit Bedingung auf die **existierende** `lszh-offers-staging`-Datenbank angelegt. **Diese IAM-Rolle umfasst alle Collections dieser Datenbank**, nicht nur die Benachrichtigungs-Collection. Bei Fehlern (z.B. fehlenden IAM-Berechtigungen) keine breitreichende Rolle als Workaround vergeben. Weiterhin kein Cloud-Run-Deployment und keine E-Mails.

## Vorbereitet: getrenntes privates Cloud-Run-Staging – weiterhin NICHT erstellt

Nachdem der Geschäftsführer das Dienstkonto, die Datenbankregion, den **exakten** Datenbank-IAM-Binding, das Fehlen zusätzlicher Projektrollen und das Fehlen von nutzerverwalteten Schlüsseln erfolgreich **lesend** geprüft hat, ist der nächste Schritt eine **separate, standardmässig deaktivierte** Cloud-Run-Instanz. Die tatsächliche Datenbankberechtigung und vererbte Rollen sind noch offen. Es gibt noch keinen Outbox-Service, kein Deployment, keine aktiven Scheduler und keine Sendefunktion.

Die neue Datei `staging-service.sh` hat **drei getrennte Modi**:

1. **Nur Plan/Preflight**, ohne Änderungen:
   ```bash
   cd ~/lszh-outbox-review
   git pull --ff-only
   bash workers/onboarding-notifications/staging-service.sh
   ```
   Überprüft geschäftliches Konto, Projekt, richtigen Git-Branch/Commit, sauberes Checkout, benannte Datenbank und vorhandene Container-Registry, Dienstkonto und **Abwesenheit** eines gleichnamigen Cloud-Run-Service.
2. **Image-Build und Upload** nur nach eigener Freigabe; kann Google-Cloud-Kosten verursachen:
   ```bash
   bash workers/onboarding-notifications/staging-service.sh --build-only
   ```
   Packt **ausschliesslich acht ausdrücklich geprüfte** Quelldateien in ein temporäres Verzeichnis (keine .git-, .env-, Dokumentations- oder Secret-Dateien). Erzeugt über Cloud Build ein nach Commit versioniertes Container-Image im **bestehenden** Container-Repository. **Kein Deployment.**
3. **Erst nach erfolgreichem Build eine neue, deaktivierte private Cloud-Run-Instanz**:
   ```bash
   bash workers/onboarding-notifications/staging-service.sh --deploy-disabled
   ```
   Führt `gcloud run deploy` ausschliesslich für den **neuen** Service `lszh-onboarding-outbox-staging` aus und bricht ab, falls der Name bereits vergeben ist. Bestehende Offer-/Archiv-Services werden nie verändert. Setzt `LSZH_OUTBOX_STAGE_ENABLED=false`, keine Airtable-PAT, keine Fixture-Codes, kein Control-Secret, kein Scheduler; daher kann `POST /internal/reconcile` keine Daten verarbeiten.
   
   Der Endpoint hat **Ingress `all`, aber Cloud-Run-IAM-Authentisierung ist erforderlich** (`--no-allow-unauthenticated`). Das ist *authentifiziert privat, nicht netzwerkintern*: Netzverkehr erreicht zwar die Cloud-Run-Kante, **unautorisierte** Besucher erhalten keinen API-Zugriff. Für spätere produktive Inter-Service-Aufrufe gegebenenfalls auf `internal` umstellen.
   
   Limitierungen: `min-instances=0`, `max-instances=1`, Concurrency 1, 256 MiB, Timeout 30 Sekunden. Je nach IAM/Billing können Cloud-Build, Container-Speicherung oder Cloud Run Gebühren verursachen. Bei einem Rechtefehler **keine pauschalen Editor-/Owner-Rechte** nachtragen; erst den Fehler prüfen.
4. **Rein lesender, authentifizierter Gesundheitscheck** nach einem solchen Deploy:
   ```bash
   bash workers/onboarding-notifications/staging-health-check.sh
   ```
   Prüft den Cloud-Run-Service, die Laufzeitidentität, die abgeschalteten Umgebungsvariablen und die fehlende öffentliche Invoker-Freigabe. Ruft nur `GET /health` mit einem temporären Identity Token der aktiven Cloud-Shell-Identität ab und verlangt `{"service":"lszh-onboarding-draft-outbox","enabled":false}`. Kein POST und keine Firestore-/Airtable-Abfrage. Falls `403`, nicht den Dienst öffentlich machen; Berechtigung `run.routes.invoke` für den eigenen Benutzer auf dem **einzelnen Service** prüfen.

**Wichtige Grenze:** Das Setup ist Staging und *ohne* Versandkomponenten. Ein grüner Healthcheck beweist, dass der deaktivierte Worker erreichbar ist, **nicht**, dass der Dienstkonto-IAM-Zugriff auf Firestore tatsächlich funktioniert. Ein synthetischer Datenbank-Schreibtest und der Versand bleiben separate, noch nicht freigegebene Schritte.

## Wiederholbare Kontrollen

Im bestehenden Cloud-Shell-Klon (nur lesend):
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-preflight.sh
```

Synthetische Tests:
```bash
node --test workers/onboarding-notifications/*.test.mjs
```

Diese Dokumentation und der Code bereiten die Staging-Integration vor, führen sie aber **nicht** aus.
