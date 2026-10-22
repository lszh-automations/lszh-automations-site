# LSZH – Firestore-Testdatenbank und getrenntes Cloud-Run-Dienstkonto

**Stand 15.10.2026. Status: VORBEREITET, NICHT IN GOOGLE CLOUD ANGELEGT.** Das Google-Cloud-Projekt wird nicht über die verbundenen ChatGPT-Apps administriert; deshalb sind die folgenden Anweisungen für den Kontoinhaber bestimmt. Nur fiktive Testdaten. Kein echter Vertrag, keine produktive Aktivierung oder juristische Freigabe.

## Warum getrennt?

Unsere erste **Google Cloud Run**-Funktion `lszh-archive-reader-staging` ist bewusst auf die geschäftliche Drive-**Leserolle** und interne IAM-Authentifizierung begrenzt; am 15.10.2026 per Logs erfolgreich **PASS** mit einem synthetischen AVV-PDF. Sie **darf keine** Firestore-Schreibrechte bekommen.

Das geplante **separate** Vertragsportal benötigt eine andere Dienstidentität, eine dedizierte Firestore-Datenbank und erst nach Staging-Prüfung eine kontrollierte HTTP-Oberfläche. Keine Servicekonto-JSON-Schlüssel erstellen; die Google-Sicherheitsrichtlinie `iam.managed.disableServiceAccountKeyCreation` bleibt an.

## Genaue Soll-Konfiguration (in Google Cloud noch NICHT erstellt)

| Einstellung | Wert |
|---|---|
| Google Cloud Project | `lszh-automations` (Geschäftskonto) |
| Cloud Firestore | **Native mode, Standard edition** |
| Datenbank-ID | **`lszh-offers-staging`** (nicht `(default)`) |
| Standort | **`europe-west6` (Zürich)** |
| Direktzugriff von Browser/Mobile | Nein; restriktive Client-Sicherheitsregeln |
| Sicherung/PITR/TTL | Für ersten rein synthetischen Test nicht aktivieren; diese Extras können kostenpflichtig sein |
| Nachweis & Verträge | Noch **keine** echten Kunden-Datensätze, keine automatisierte Rechtswirkung |
| Eigenes Staging-Dienstkonto | **`lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com`** |
| Bestehendes Archiv-Leserkonto | **Unverändert** `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com` |
| Firestore-Collection im Code | `lszh_staging_offers_v1` – noch **nicht** in echtem Firestore angelegt |
| Datenbank-Endpunkt im Code | `firestore.europe-west6.rep.googleapis.com`, Datenbank-ID **explizit gesetzt**, niemals impliziter Standard |
| Cloud-Run-Portal-Dienst | `lszh-offer-portal-staging` – noch **nicht** bereitgestellt |
| Annahme/SMTP/Make/Airtable/Beweis-PDF | Bis zur gesonderten Freigabe alles **deaktiviert** |

## Schritt A – nur nach ausdrücklicher Kostenentscheidung

Google Cloud Console mit `lars@lszh-automations.ch` und `lszh-automations` öffnen:
https://console.cloud.google.com/firestore/databases?authuser=2&project=lszh-automations

**Vor dem Klick auf Erstellen zuerst bestehende Datenbanken prüfen**. Falls `lszh-offers-staging` bereits existiert, nicht erneut anlegen und Eigenschaften kontrollieren. Bei erstmaliger Erstellung Datenbank-ID, `Standard`, `Native` und Zürich wählen. Eine Datenbank-ID/Region lassen sich später nicht beliebig ändern.

Wenn der Cloud Console-Assistent keine benannte Datenbank zulässt, erst die GUI/CLI-Verfügbarkeit überprüfen, **nicht** ersatzweise `(default)` erstellen. Offizieller gcloud-Befehl nur als kontrollierte Alternative **nach Kostenfreigabe**:

```bash
gcloud firestore databases create \
  --project=lszh-automations \
  --database=lszh-offers-staging \
  --location=europe-west6 \
  --edition=standard \
  --type=firestore-native \
  --delete-protection
```

**Wichtig:** Eine benannte Firestore-Datenbank ist nicht automatisch gratis. Google berechnet Nutzungsressourcen. Das kostenlose Kontingent gilt nicht unbegrenzt für alle Datenbanken und die Preisübersicht weist darauf hin, dass benannte Datenbanken nicht in die kostenlose Quote einbezogen werden können. Vor Erstellung aktuelles Guthaben/Konditionen kontrollieren und im Geschäftskonto ein kleines Kostenbudget mit Warnschwellen einrichten (Budgetwarnungen sind **keine** garantierte Kostensperre). Im früheren Screenshot standen 250 CHF Testguthaben, spätere Verfügbarkeit nicht erneut geprüft.

## Schritt B – getrennte Google-Identity ohne Schlüssel

IAM & Verwaltung → Dienstkonten, im Projekt `lszh-automations` eine **neue** Dienstidentität `lszh-offer-portal-staging` erstellen. Beim Erstellen zunächst **keine** projektweite `Owner`, `Editor`, `Cloud Datastore Owner` oder pauschale `roles/datastore.user`-Rolle erteilen; keine privaten Dienstkontoschlüssel erzeugen.

Später in `IAM` eine **konditionierte** Bindung der Rolle `roles/datastore.user` nur für Datenbank `lszh-offers-staging` festlegen. Dieser Dienst braucht Lesen/Schreiben innerhalb des Staging-Portals, aber keinen Datenbank-Administrator und keinen Zugriff auf andere Firestore-Datenbanken. Google dokumentiert IAM-Conditions mit `resource.name` für eine einzelne Datenbank:

```bash
gcloud projects add-iam-policy-binding lszh-automations \
  --member='serviceAccount:lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com' \
  --role='roles/datastore.user' \
  --condition='expression=resource.name=="projects/lszh-automations/databases/lszh-offers-staging",title=LSZHOnlyStagingFirestore,description=StagingPortalOnly'
```

Vor dem Ausführen muss der Anwender die aktuelle IAM-Policy kennen und prüfen, ob bereits eine breitere Bindung existiert; eine enge zusätzliche Bedingung reduziert **bestehende** überbreite Berechtigungen nicht. Konkrete Wirkung anschliessend mit positiven und negativen Berechtigungstests bestätigen. Google merkt an, dass die Console IAM-Conditions beim **Console-Zugriff** nicht identisch zu API-Client-Zugriffen interpretiert; die eigentlichen Server-SDK-Anfragen müssen geprüft werden.

Für den späteren direkten Drive-Zugriff dieses Portal-Dienstkontos müsste im **Geschäftsarchiv**, nicht im privaten Drive, ausschliesslich **Leser** zugeordnet werden. Keine allgemeinen Linkfreigaben; keine Editor-Rolle und keine Erlaubnis, Google-Drive-Berechtigungen zu ändern. Ob das in der Endarchitektur nötig bleibt, wird vor Deployment entschieden.

## Schritt C – getrennte, noch nicht aktivierte Cloud-Run-Bereitstellung

Cloud Run Service `lszh-offer-portal-staging`, Region Zürich, **anderes** Dienstkonto als beim Archiv-Reader, min 0 / max 1 Instanzen, Anfrageabrechnung, IAM-Zugriffssteuerung, zunächst **kein externer öffentlicher Portalzugang**. Nicht denselben Google-Cloud-Run-Reader-Dienst wiederverwenden.

Nicht automatisch deployte Quelldateien:
- `cloud-run/offer-portal-staging/index.mjs`: Functions-Framework-Einstiegspunkt `lszhOfferPortalStaging` mit Google Application Default Credentials (ADC) und der separaten Staging-Dienstidentität. Die anwendungsspezifischen Google-Bibliotheken werden nur bei ausdrücklich freigeschaltetem Staging geladen/verwendet.
- `stagingConfig.mjs`: Fail-Closed durch **`LSZH_PORTAL_STAGING_ENABLED=false`** als Standard; auch nach versehentlichem Aktivieren verweigert der Code falsche Region/Projekt/Datenbank/Revision/Konto-/Drive-Konfiguration und kryptografisches Geheimnis fehlt oder ist offensichtlich ein Testwert.
- `firestoreOfferStore.mjs`: **Firestore-Transaktion** auf `lszh_staging_offers_v1`, nur einem der gleichzeitig eintreffenden Annahmevorgänge wird erlaubt zu committen.
- `portalCore.mjs`, `portalHttp.mjs`: genau gehashte Token, Fristen und AVV-/Projektbedingungen-Zustimmung; HTTP standardmässig deaktiviert.
- `cloud-run/Dockerfile.offer-portal-staging`: für eine später reviewte Containerbereitstellung mit Build-Kontext `cloud-run/` und dem gemeinsamen Archiv-Bündelprüfer.
- Es existiert noch **kein** Deployment, keine schreibende Firestore- oder Drive-Verbindung, kein tokengebundenes öffentliches Kunden-Portal.

### Verifikationsstandard vor einem extern zugänglichen Vertragsportal

1. Ein echter synthetischer Staging-Angebotsdatensatz in der **benannten echten Firestore DB**, doppelte Annahme gegen *echte* Firestore-Transaktionen und nachweislich nur ein Update (Firestore-Emulator-Test ist bereits erfolgreich, aber kein Cloud-Test).
2. Dienstkonto greift korrekt nur auf `lszh-offers-staging` zu; anderer Datenbankzugriff verweigert. Keine bekannten Servicekonto-Schlüssel.
3. Cloud Run verwendet den verifizierten Geschäftskonto-Reader- bzw. den eigenen strikt eingegrenzten Principal; Archiv-PDF-Bytes werden unmittelbar vor Statusänderung geprüft. Drive-Schreibschutz ist widerrufbar und nicht WORM.
4. Nachweis- und Workflow-Verarbeitung erst via geprüften, idempotenten Outbox-Prozessor. Bis dahin bleibt `downstream.*=disabled`.
5. Browser-/Endpunkt-Schutz: Rate Limits, Origin/CSRF-Prüfungen, Token-Exfiltration, Abuse, Berechtigungsumgehung, Logging ohne Geheimnisse, DPA/AVV und spätere juristische Freigabe sowie ausdrückliche wirtschaftliche Go-Live-Freigabe.

## Dokumentationsquellen

- Firestore-Datenbank erstellen: https://docs.cloud.google.com/firestore/native/docs/manage-databases
- Regionen: https://docs.cloud.google.com/firestore/docs/locations
- Regionale Endpunkte: https://docs.cloud.google.com/firestore/native/docs/regional-endpoints
- Firestore Server IAM: https://docs.cloud.google.com/firestore/docs/security/iam
- Firestore Kosten und Free Tier: https://cloud.google.com/firestore/pricing
- Firebase Emulator: https://firebase.google.com/docs/emulator-suite
