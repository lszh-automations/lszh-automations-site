# LSZH Onboarding-Outbox – STAGING-only, keine E-Mails

**Stand:** 16.10.2026. Nur Entwurf auf Branch `feature/onboarding-notification-outbox-20261016` / Draft PR #8; nicht gemergt, nicht deployt, nicht aktiv.

## Bestätigte Infrastruktur aus Geschäftskonto (diagnostiziert am 16.10.2026)

- Google-Cloud-Projekt: `lszh-automations`; aktives Geschäftskonto bestätigt.
- Firestore Native: **bestehende benannte** Datenbank `lszh-offers-staging`, Region **`europe-west6` (Zürich)**. Es gibt **keine** `(default)`-Datenbank. Keine neue Datenbank nur für diesen synthetischen Versuch erstellen.
- Artifact Registry: **bestehendes** Docker-Repository `cloud-run-source-deploy`, Standort `europe-west6`. Kein neues Repository erforderlich.
- APIs aktiviert: Cloud Run, Cloud Build, Artifact Registry, Firestore, Secret Manager.
- Vorhandene Cloud-Run-Staging-Services: `lszh-archive-reader-staging`, `lszh-offer-acceptance-staging`, `lszh-offer-portal-staging`. **Nicht verändern.**
- Outbox-spezifisches Dienstkonto `lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com`: **fehlt**.
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
- `airtable-candidates.js`: ausdrücklich genehmigte synthetische Codes, **kein vollständiger Airtable-Scan**.
- `firestore-store.js`: fest verdrahtete benannte Staging-Datenbank und Collection.
- `.github/workflows/onboarding-notification-outbox.yml`: synthetische Offline-/HTTP-Integrations- und Docker-Build-Tests, ohne Push/Deploy.

## Nächste Entscheidungen und Grenzen

1. Für die reine Staging-Prüfung das dedizierte Outbox-Dienstkonto **nach ausdrücklicher Freigabe** anlegen. KEIN Service-Account-Key erzeugen.
2. Der Identität **nur** `roles/datastore.user` mit IAM-Bedingung `resource.name=="projects/lszh-automations/databases/lszh-offers-staging"` geben. Das ist **datenbankweit**, nicht collection-spezifisch. Nur Staging; vor Produktiveinsatz getrennte Datenbank.
3. Gegebenenfalls Cloud-Build-/Artifact-Registry- und Cloud-Run-Invoker-Rechte separat prüfen. Kein Admin-/Editor-Projektrollenpaket pauschal verleihen.
4. Private Cloud-Run-Testinstanz getrennt von bestehendem Angebotssystem erstellen und zuerst mit `LSZH_OUTBOX_STAGE_ENABLED=false` auf `/health` prüfen. Testcodes/Secrets nicht als Klartext im Repository oder Chat veröffentlichen.
5. **Nur** nach verifizierten synthetischen Airtable-Fixtures und ausdrücklicher Testfreigabe `LSZH_OUTBOX_STAGE_ENABLED=true` und einen **manuellen** Testlauf durchführen. Der Dienst legt höchstens einen gesperrten Firestore-Entwurf pro Fixture an. Kein Scheduler, kein Sendetransport.
6. Für spätere Produktivbenachrichtigungen erst getrennten Outbox-Consumer, echte E-Mail-Freigabe, Vertrags-/AVV-Gates, Zustandsautomaten und Provider-ID-Abgleich konzipieren. Make Szenario `7777695` und seine `0=1`-Kundenmail-Sperre unverändert lassen.

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
