# LSZH Onboarding-Outbox – STAGING-only, keine E-Mails

**Stand:** 16.10.2026. Code weiterhin Draft PR #8 (nicht gemergt); **Container gebaut und separater Cloud-Run-STAGING-Dienst am 16.10.2026 bereitgestellt, aber Verarbeitung deaktiviert**. Keine Kundenmails, kein Scheduler, keine Onboarding-Datenverarbeitung.

## Bestätigte Infrastruktur aus Geschäftskonto (diagnostiziert am 16.10.2026)

- Google-Cloud-Projekt: `lszh-automations`; aktives Geschäftskonto bestätigt.
- Firestore Native: **bestehende benannte** Datenbank `lszh-offers-staging`, Region **`europe-west6` (Zürich)**. Es gibt **keine** `(default)`-Datenbank. Keine neue Datenbank nur für diesen synthetischen Versuch erstellen.
- Artifact Registry: **bestehendes** Docker-Repository `cloud-run-source-deploy`, Standort `europe-west6`. Kein neues Repository erforderlich.
- APIs aktiviert: Cloud Run, Cloud Build, Artifact Registry, Firestore, Secret Manager.
- Vorhandene Cloud-Run-Staging-Services: `lszh-archive-reader-staging`, `lszh-offer-acceptance-staging`, `lszh-offer-portal-staging`. **Nicht verändern.**
- Outbox-spezifisches Dienstkonto `lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com`: **am 16.10.2026 von Geschäftsführer in Google Cloud Shell erstellt**; Cloud IAM-Änderung mit `Updated IAM policy` bestätigt. **Tatsächliche REST-Berechtigung und Scope noch nicht nachgewiesen**.
- Outbox-spezifischer Cloud-Run-Dienst `lszh-onboarding-outbox-staging`: **seit 16.10.2026 bereitgestellt**, Revision `00001-pz6`, Image-Tag `staging-4075f23f47b8`, 100 % Traffic zur deaktivierten Revision. **Authentifizierter `/health`-Test noch offen.**

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

## Aktueller Folgecheck nach Deployment

Das isolierte Staging-Image wurde über Cloud Build `46e3293e-8b9b-44b1-b7ec-34dd330b3e44` erfolgreich erzeugt und in der bestehenden Artifact Registry gespeichert. `--deploy-disabled` wurde **erfolgreich** ausgeführt, wodurch der neue Cloud-Run-Dienst `lszh-onboarding-outbox-staging` in Zürich angelegt wurde. **Nicht erneut ausführen.** Der nächste Schritt ist ausschliesslich:

```bash
cd ~/lszh-outbox-review
bash workers/onboarding-notifications/staging-health-check.sh
```

Erwartung: Service-IAM ohne `allUsers`/`allAuthenticatedUsers`, Staging-Dienstkonto, `LSZH_OUTBOX_STAGE_ENABLED=false` und `GET /health` mit `enabled:false`. **Cloud Run kann Kosten verursachen**; min Instances 0. Keine Airtable-Credentials, keine Fixtures, keine Scheduler, keine E-Mails aktiviert. Bei `403` wegen fehlender Aufruferrechte **nicht** öffentlich schalten.

## Authentifizierter Cloud-Run-Gesundheitscheck: BESTANDEN

Der Geschäftsführer hat den **bereits bereitgestellten**, weiterhin deaktivierten Cloud-Run-Staging-Dienst lesend getestet. Bestätigte Resultate:
- `PASS: Cloud Run name, identity, ingress and disabled no-secret runtime environment.`
- `PASS: No allUsers/allAuthenticatedUsers entries in service IAM policy.`
- `PASS: Authenticated health returned enabled=false.`
- `PASS: Disabled private STAGING health check; no onboarding/Firestore/write path executed.`

Es wurde ausschliesslich ein authentifiziertes `GET /health` ausgeführt; der Worker führt weiterhin keine Aufträge aus, hat keine Airtable-Zugangsdaten und keine E-Mail-Funktion. Die Kontrolle deckt **nicht** geerbte IAM-Freigaben ab.
**Zusätzliche Sicherheit (neu, noch nicht ausgeführt):** `staging-health-check.sh` prüft bei der nächsten Ausführung auch einen **anonymen** `GET /health`-Aufruf. Nur HTTP 401/403 ist zulässig; HTTP 200 wäre ein Sicherheitsfehler und stoppt den Test. Damit wird die fehlende öffentliche Aufrufberechtigung auch am echten Endpoint geprüft, nicht nur anhand der direkten IAM-Richtlinie. Es bleibt ein ausschliesslich lesender Test.


### Als Nächstes: effektive Firestore-REST-Leseberechtigung separat prüfen

`staging-firestore-read-probe.sh` ist als **ausschliesslich lesender**, manuell zu genehmigender Test vorbereitet, mit Offline-Mocktests in GitHub Actions. Er benötigt **kein Deployment** und ändert keine Cloud-Run-Einstellungen.

Vorprüfung in der bestehenden Cloud Shell:
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-firestore-read-probe.sh
```

Das ruft **noch keine Firestore-REST-URL** auf, erstellt keine Zugangstokens und verändert nichts.

Wenn der Geschäftsführer danach selbst den einmaligen REST-Lesetest autorisiert, ist der separate Aufruf:
```bash
bash workers/onboarding-notifications/staging-firestore-read-probe.sh --probe-read
```

Der Test versucht zunächst, mit einer **kurzlebigen** und **nicht angezeigten** Dienstkonto-Identität zu arbeiten. Das erfordert bereits vorhandene Berechtigung `iam.serviceAccounts.getAccessToken` bzw. die auf das **einzelne Dienstkonto** beschränkte Token-Creator-Rolle und gegebenenfalls die aktivierte IAM-Credentials-API. Diese Rechte **nicht** unbesehen erstellen oder projektweit vergeben. Wenn Impersonation nicht möglich ist, endet das Skript mit `UNVERIFIED`; kein Workaround mit Editor/Owner.

Wenn die Token-Erzeugung erfolgreich ist, sendet es genau **zwei GET-Requests** an die Firestore-REST-API: zuerst nur Metadaten der benannten Datenbank `lszh-offers-staging` (erwartet HTTP 200), danach ein **absichtlich nicht angelegtes** Dokument der dedizierten Test-Collection `lszh_onboarding_notification_drafts_staging` (erwartet HTTP 404). Antwortinhalte und Tokens werden niemals ausgegeben oder gespeichert. **Keine Dokumente lesen, anlegen oder verändern**. 401/403/sonstige Ergebnisse werden nicht als bestanden behauptet.

Ein solcher PASS beweist einen technischen GET-Zugriff unter dieser Identität, aber **keine Firestore-Schreibberechtigung**, keinen echten Outbox-Lauf und keine Abwesenheit geerbter Berechtigungen. Dafür wären gesonderte, ausdrücklich freigegebene synthetische Tests notwendig. Die Firestore-Conditional-IAM-Syntax wurde mit der Google-Dokumentation abgeglichen.

## Impersonations-Test am 16.10.2026: NICHT NACHGEWIESEN

Der Geschäftsführer führte den getrennt freigegebenen Befehl `staging-firestore-read-probe.sh --probe-read` aus. Der Preflight für Konto, Ziel und Staging-Dienstkonto war erfolgreich. Die Ausgabe stoppte danach korrekt:

```
UNVERIFIED: Could not impersonate dedicated STAGING service account.
No IAM role changes were made.
```

**Wichtig:** Die zwei geplanten Firestore-GETs wurden **gar nicht** ausgeführt. Die Meldung betrifft den Versuch der Benutzeridentität, einen kurzlebigen Token für das Dienstkonto zu erzeugen. Sie belegt **keinen** Firestore-403 und keinen Cloud-Run-Fehler. Eine Ursache könnte sein, dass `iamcredentials.googleapis.com` nicht aktiviert ist oder dem Cloud-Shell-Benutzer die separate Berechtigung `iam.serviceAccounts.getAccessToken` fehlt. Die bereits erfolgreiche `--no-allow-unauthenticated`-Cloud-Run-Bereitstellung belegt nicht, dass der Benutzer auch Service-Account-Token erzeugen darf. **Keine** Editor-/Owner- oder projektweiten Token-Creator-Rechte als Workaround einrichten.

Neu hinzugefügt: `staging-impersonation-diagnostics.sh` (nur lesen; **erzeugt keine Tokens**) prüft den Status der IAM-Credentials-API und das Vorhandensein **direkter** Token-Creator-Bindings für den Geschäftsbenutzer auf dem einzelnen Dienstkonto bzw. dem Projekt. Es beurteilt weder Gruppen, geerbte Berechtigungen noch Custom Roles und ändert keinerlei Konfiguration.

```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-impersonation-diagnostics.sh
```

Alternative in Vorbereitung, ohne zusätzliche Token-Creator-Vergabe: eine **eigenständige, nur nach separater Freigabe zu erstellende und einmalig auszuführende** Cloud-Run-Job-Identitätsprobe. `firestore-runtime-probe.js` und `Dockerfile.firestore-probe` sind Entwürfe, **nicht** in der Cloud gebaut, deployt oder ausgeführt. Die Probe verwendet die an den Job angehängte bestehende Outbox-Dienstidentität und fragt ausschliesslich Firestore-Metadaten (GET 200) sowie einen festen nicht existierenden synthetischen Dokumentpfad (GET 404) ab; keine echten Datensatzantworten, Keys, E-Mails oder Schreiboperationen. Diese Cloud-Run-Job-Architektur vermeidet die Impersonationsberechtigung im Geschäftsbenutzerkonto, braucht aber eine eigene ausdrückliche Build-/Job-/Ausführungsentscheidung und kann Kosten auslösen.

Die laufende Cloud-Run-**Service**-Revision bleibt `00001-pz6` mit `enabled=false` und unveränderten Secrets/IAM-Konfigurationen; alle Produktions- und Mailfunktionen bleiben gesperrt.

## Einmaliger Cloud-Run-Job statt Benutzer-Impersonation: Bedienung (noch NICHT ausgeführt)

Die lesende Cloud-Shell-Diagnose bestätigte:
- `iamcredentials.googleapis.com` ist **aktiviert**.
- Für den Geschäftsbenutzer `lars@lszh-automations.ch` existiert **keine direkte Token-Creator-Rolle** am Ziel-Dienstkonto und keine direkte Token-Creator-Projektrolle.
- Rollen aus Gruppen/Custom Roles/Hierarchie wurden dabei nicht ausgeschlossen.
- Der manuelle Impersonations-Test blieb ohne Firestore-REST-Requests stehen. Keine zusätzliche IAM-Rolle vergeben.

Google Cloud Run Jobs können eine eigene Serviceidentität verwenden, deren kurzlebige Access Tokens innerhalb des laufenden Jobs vom Metadatenserver bezogen werden. Der bestehende Outbox-HTTP-Dienst wird dafür **nicht verändert**. Der separate, nur lesende Job basiert auf `firestore-runtime-probe.js` und `Dockerfile.firestore-probe`: genau zwei Firestore-GETs zu starren Zielen, kein Schreiben, kein Kunden-Datensatzinhalt, kein Mailversand. Eine einmalige Jobausführung kostet möglicherweise geringe Cloud-Run-Ressourcen.

**Der neue `staging-firestore-job.sh` erzwingt vier strikt getrennte Schritte**, unabhängig von `staging-service.sh`. Keiner wurde bisher in Google Cloud ausgeführt.

1. **Nur Prüfung, keine Änderungen (jetzt zulässig):**
   ```bash
   cd ~/lszh-outbox-review
   git pull --ff-only
   bash workers/onboarding-notifications/staging-firestore-job.sh
   ```
   Dieses Kommando bestätigt exakten Geschäftskonto-/Projekt-/Git-Zustand, benannte DB, Registry, Dienstkonto und dass noch kein gleichnamiger Probe-Job existiert. `PLAN ONLY` ist zwingend.
2. **Nur Image bauen und hochladen, nach separater bewusster Ausführung:**
   ```bash
   bash workers/onboarding-notifications/staging-firestore-job.sh --build-only
   ```
   Build-Archiv besteht ausschliesslich aus drei geprüften Dateien. Container wird in der bestehenden Artifact Registry unter dem geprüften Git-Commit getaggt. Kein Cloud-Run-Job wird angelegt/gestartet.
3. **Nur neuen Job anlegen, nach separater bewusster Ausführung:**
   ```bash
   bash workers/onboarding-notifications/staging-firestore-job.sh --create-only
   ```
   Legt nur einen neuen Job `lszh-firestore-read-probe-staging` mit dem bereits vorhandenen eingeschränkten Dienstkonto an. `--tasks=1`, `--max-retries=0`, feste Datenbank und Read-only-Flag, **keine automatische Ausführung**, kein Scheduler und keine Trigger. Ein bereits bestehender Job wird nicht überschrieben. Noch kein Firestore-GET.
4. **Einmaliger echter Firestore-Lesetest, nach separater bewusster Ausführung:**
   ```bash
   bash workers/onboarding-notifications/staging-firestore-job.sh --execute-once
   ```
   Das Skript prüft vor dem Ausführen nochmals Name, Container-Image, Service-Account, ausschliesslich die drei erwarteten Variablen, Task-Anzahl und Retry-Konfiguration. Dann genau eine `gcloud run jobs execute --wait`-Anforderung. Der Job selbst ruft ausschliesslich seine Metadatenidentität und die zwei definierten GETs auf. Ergebnis im Job-Log: erst `PASS: Named Zurich STAGING Firestore metadata GET 200.`, dann `PASS: Missing, fixed synthetic document GET 404.`. Bei `403`/Fehlern keine IAM-Rechte erweitern, sondern Ausführung untersuchen.

**Wichtig:** Der Job nutzt `roles/datastore.user` **nur in der bestehenden Staging-Datenbank**, wo diese Rolle alle Collections umfassen kann. Der Probe-Code greift aber ausdrücklich auf keinen bestehenden Offerten-Datensatz zu. Ein PASS bestätigt ausschliesslich die geprüften Leseoperationen, **nicht** die Schreibberechtigung oder sichere Isolation von geerbten Rollen. Es wird keine bestehende Outbox-Revisionskonfiguration verändert; insbesondere bleibt `LSZH_OUTBOX_STAGE_ENABLED=false` aktiv.

## Cloud-Run-Job-Fehler beim ersten Erstellen – korrigiert, keine Ausführung

Beim ausdrücklich gestarteten `--create-only` meldete Google Cloud am 16.10.2026:

```
Job failed to deploy
spec.template.spec.task_spec.containers[0].limits.memory:
Total memory < 512 Mi is not supported with gen2 execution environment
with cpu always allocated (unthrottled).
```

**Ursache:** Im Job-Deploy-Skript war für `1 CPU` versehentlich `--memory=256Mi` angegeben. Cloud Run Jobs verlangen mindestens **512 MiB**. **Korrektur:** `--memory=512Mi` in `staging-firestore-job.sh`, geprüft mit Offline-Tests. Bestehende Cloud-Run-Dienste und das Outbox-System wurden nicht geändert. Ein Job wurde laut der Fehlermeldung nicht erfolgreich deployed und **nicht ausgeführt**. Der genaue Ressourcenbestand wird beim nächsten Skriptlauf erneut lesend geprüft; falls ein Job trotz Fehlermeldung existiert, verweigert das Skript eine Überschreibung.

**Kein erneuter Build nötig:** Der Container selbst wurde vorher bereits erfolgreich unter `staging-49297f5b6cb0` gebaut (Cloud Build `609819f8-4597-4a6f-8779-0a23283df24c`, SUCCESS). Geändert wurde ausschliesslich das Betriebs-/Erstellungsskript, **nicht** `firestore-runtime-probe.js`, das Dockerfile oder die Cloud-Build-Definition. Der Deploy-Ablauf behält darum den **explizit festgelegten ursprünglichen Image-Tag**; ein Git-Diff prüft, dass die drei relevanten Quelldateien dem bereits gebauten Commit entsprechen. Ein versehentliches Überschreiben des Tags über `--build-only` wird abgewiesen.

**Nächster Schritt (erst nach grünem CI):**

```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-firestore-job.sh
```

Bei `PLAN ONLY` kann der Geschäftsführer separat erneut `--create-only` ausführen; das führt noch keine Firestore-Anfrage aus. **`--build-only` nicht erneut ausführen.**

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
