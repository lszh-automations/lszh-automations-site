# LSZH Firestore-Staging – Übergabe V3 (15.10.2026)

**NICHT PRODUKTIV. Keine Firestore-Schreibvorgänge, keine E-Mails, keine Vertragsannahmen.**

## Bestätigte Zuordnung
- Google-Cloud-Projekt-ID: `lszh-automations`
- Datenbank-ID: `lszh-offers-staging`
- Firestore Native, Standard Edition; Standort `europe-west6` (Zürich)
- In der Google Cloud Console am 15.10.2026 als **vorhanden und leer** bestätigt.
- Cloud Run `lszh-offer-portal-staging` und `lszh-archive-reader-staging` sind separate Dienste. Eine erfolgreiche Firestore-Anbindung an den dort deployten Anwendungscode ist **noch nicht bewiesen**.

**Korrektur:** V2 des lokalen Fixture-Manifests führte `lszh-offers-staging` irrtümlich als `target_project`. V3 setzt `target_project=lszh-automations` und `target_database=lszh-offers-staging`.

## Lokales synthetisches Testpaket V3
Als Chat-Artefakt: `LSZH_Firestore_Staging_Testpaket_V3_20261015.zip`.
- Fiktiv: `LSZH-STAGING-20261015-001`, Offerte `DEMO-OFF-20261015-001`; nur `lars@lszh-automations.ch`.
- Drei unterschiedliche simulierte A4-PDFs (Offerte, Projektbedingungen, AVV); **nicht** die RC1-Vertragsoriginale.
- PDF-Bytes und SHA-256, Prüfmarkierungen und Testflags lokal überprüft.
- Token-Hash im Ausgangs-Fixture besitzt keinen verfügbaren Klartext; wird in der vorgeschlagenen Firestore-Abbildung bewusst **nicht** übernommen (`tokenHash=null`).
- Lokale Prüfungen: 17 Python-Tests, 8 Node-Fixture-Tests, 8 Node-Code-Tests bestanden.
- `prepare-firestore-staging.js` ist strikt offline und führt nur lokales Mapping / PDF-Hashvergleich aus. Es nutzt keine Firebase-Bibliothek, keine Zugangsdaten und keinen Netz- oder Schreibzugriff.
- Vorgeschlagene Collection `stagingOfferFixtures`: **nicht** als bestehendes Cloud-Run-Schema verifiziert. In Firestore ist bislang keine Collection eingerichtet.

## Immer geschlossene Sperren
- `testOnly=true`, `legallyApproved=false`, `acceptanceEnabled=false`, `deliveryEnabled=false`, `archiveVerified=false`, `acceptedAt=null`, `tokenHash=null`.
- `import_gate.ready=false`; das Testskript stellt den Import nicht scharf.
- Originale RC1-Projektbedingungen/AVV weiterhin nicht juristisch freigegeben; produktive Make-Szenarien gesperrt.

## Nächste kontrollierte Schritte
1. Über den Codex-Firebase-MCP-Zugriff zuerst **lesend** das Projekt und die Staging-Datenbank prüfen; der Plugin-Eintrag allein verleiht keinen Zugriff.
2. Tatsächlich deployten Cloud-Run-Code und Firestore-Collection-/Feldschema abgleichen; ggf. eigene minimalistische Staging-Collection festlegen, ohne Produktivänderungen.
3. Drei Test-PDFs in das private *geschäftliche* Drive-STAGING-Archiv kopieren und dort per Servicekonto Readback, SHA256 und Zugriffsschutz prüfen. Cloud-/Drive-Hashes nicht aus lokalen Hashes ableiten.
4. Erst nach gesonderter Test-Schreibfreigabe **einen** idempotenten synthetischen Firestore-Datensatz erstellen, keine echten Verträge oder Mail-Module aktivieren.
5. Mehrfachklick-, manipulierte-PDF-, falscher-Token- und Abbruchtests durchführen; die spätere Annahme atomar und testisoliert implementieren.

**Kleines System:** Airtable = CRM, Google Drive = Dateien, Firestore = atomare Annahmezustände, Make = Folgeautomationen. Keine zusätzliche Datenbank und kein zweites CRM erforderlich.

## Geschäftliches Google Drive – verifizierte Bestandsbelege vom 14./15.10.2026

- Make-Verbindung `11904271` für Geschäftskonto `lars@lszh-automations.ch` meldet `ok`. Das **erfolgreiche** read-only Audit 7965546 vom 15.10.2026, 08:10 UTC bestätigt Eigentum des privaten geschäftlichen STAGING-Archivs.
- Make-Test 7965246 hat am 14.10.2026 vier **ältere rein synthetische** PDF-Dateien (Offerte, Bedingungen, AVV, simulierter Annahmebeleg) tatsächlich aus dem geschäftlichen privaten Archiv gelesen. Vier-Dokumente-Modus `Ja`: `ok=true`, vier Binärdaten vorhanden, `send_permitted=false`.
- Drei davon (Offerte, Bedingungen, AVV) hatten jeweils einen gültigen SHA-256, korrektes `application/pdf`, eigene Datei-ID, Geschäftsinhaber, `shared=false` und `contentRestrictions.readOnly=true`. Sie gehören zur früheren **TEST_ONLY**-Serie vom 14.10. und **nicht** zu den lokal erzeugten V3-PDFs vom 15.10. Wiederverwendung kann separate doppelte Uploads sparen; ihre Dateinummern gehören nur in **private** Testkonfigurationen, nicht in das öffentliche GitHub-Repository.
- Schreibschutz ist keine unveränderliche WORM-Speicherung. Weitere Hash-/Zugriffsprüfung unmittelbar vor Annahme bleibt verpflichtend.
- **Noch nicht bestätigt:** Die aktuellen V3-Dateien wurden nicht über Make oder Drive hochgeladen; kein synchroner Readback-Abgleich mit diesem Manifest; kein Nachweis des tatsächlichen Cloud-Run-Firestore-Collection-Schemas.

## Minimaler nächste-Schritte-Plan ohne Neuaufbau

1. Codex/Firebase MCP read-only im Projekt `lszh-automations`: Datenbank `lszh-offers-staging` und vorhandene Collections prüfen.
2. Cloud Run `lszh-offer-portal-staging`: die **tatsächlich deployte** Revision, verwendetes Dienstkonto, gesperrte POST-Routen, Firestore-Zugriff und erwartete Feldstruktur überprüfen. Keine Secrets ausgeben.
3. Die vorhandenen und schon archivierten fiktiven PDFs für einen getrennten Firestore-Test verwenden **oder** die drei V3-Dateien ins private Geschäftskonto übertragen; keinesfalls beide Dokumentserien zu einem Angebotsnachweis vermischen.
4. Erst nach separat bestätigtem Staging-Schreibentscheid einen einzelnen synthetischen Datensatz mit garantiert geschlossenen Freigabefeldern importieren und read-back prüfen. Kein Token in Klartext und keinerlei Mail/Annahme aktivieren.

**Wichtig:** Aktuelle Cloud-Run-Dienste gehören zu Google Cloud. Der separat angeschlossene Render-Account kann sie nicht stellvertretend verifizieren.

## Codex-Abgleich 15.10.2026 – belegte Architekturabweichungen

- GitHub-Lesung des Branchs `feature/firestore-staging-dryrun-20261015` erfolgreich. Google-Cloud-Verwaltungs-APIs konnten in der Codex-Umgebung **wegen Netzwerkproxy HTTP 403** nicht erreicht werden. Das ist **kein** belastbarer Beleg für fehlende IAM-Rechte.
- `offerAcceptance.js` verwendet weiterhin Airtable für Token-Lookup und Status-PATCH. **Keine Firestore-Lese-/Schreiblogik** existiert in der betrachteten Anwendung.
- `inFlight` ist eine lokale `Set`-Sperre pro Prozess; nicht atomar über Cloud-Run-Instanzen. Ein späterer Firestore-Zustandswechsel muss transaktional erfolgen, ohne den Vertrieb in Firestore doppelt zu speichern.
- `offerArchiveVerifier.js` und die Dokument-API behandeln in diesem Stand nur Offerte und Bedingungen. Die optionale AVV aus dem synthetischen Test muss zusätzlich geschützt ausgeliefert und vor Annahme auf Integrität geprüft werden.
- `scripts/prepare-firestore-staging.js` ist **nur ein Offline-Mapping**, keine Portalimplementierung und kein importfertiges Cloud-Schema. Collection `stagingOfferFixtures` niemals ohne bewusste Entscheidung anlegen.
- Welche Git-Revision tatsächlich in Cloud Run läuft, ist weiter unbestätigt.

### Read-only Cloud-Shell-Abgleich statt Proxy-Umgehung mittels zusätzlicher Schlüssel

GitHub-Skript: `scripts/audit-gcp-staging-readonly.sh`. **Läuft nur lokal in einer bereits angemeldeten Google Cloud Shell**, liest ausschliesslich Datenbankmetadaten und Cloud-Run-Revision/Servicekonto/Image-Digest zweier Staging-Dienste. Keine IAM-Änderung, API-Key-Erstellung, Firestore-Schreiboperation, Deployments oder Ausgabe von Umgebungsvariablen.

1. Im Google-Cloud-Projekt `lszh-automations` oben Cloud Shell öffnen.
2. GitHub-Skript vor Ausführung lesen; dann in der eigenen Shell herunterladen und ausführen.
3. Die zurückgelieferte Ausgabe prüfen (keine Secrets weitergeben). Ein Image-Digest **allein** beweist noch keine Commit-Zuordnung.
4. Erst anhand dieser realen Revision die kleinste Firestore-Transaktionsanbindung spezifizieren; produktive Freigabeflags bleiben weiterhin aus.


## Google Cloud Shell – verifizierter Live-Metadatenabgleich 15.10.2026

Vom Projektbetreiber nach Ausführung von `scripts/audit-gcp-staging-readonly.sh` in einer authentifizierten Google Cloud Shell übermittelte Ausgabe:

- Angemeldete Google-Identität: `lars@lszh-automations.ch`.
- Firestore: `projects/lszh-automations/databases/lszh-offers-staging`, Region `europe-west6`, `FIRESTORE_NATIVE`, `PESSIMISTIC`.
- Cloud Run Offertenportal: `lszh-offer-portal-staging`, zuletzt bereite Revision `lszh-offer-portal-staging-00004-qt7`, Dienstkonto `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com`, Image-Digest `sha256:b92e8b201f8d2d43c90bc626e74a3bfba2d6adedf015634e432ffdd61af6cd1e`.
- Cloud Run Archivdienst: `lszh-archive-reader-staging`, zuletzt bereite Revision `lszh-archive-reader-staging-00003-d9m`, Dienstkonto `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com`, Image-Digest `sha256:e83ffc7f0b9cc10b30b5516c0afe0e53a79357ef7af8d74deb52a6d4755abc4b`.
- Alle Anfragen waren reine Leseabfragen; kein Deployment, Import, Datenbank- oder IAM-Schreibzugriff.

**Grenzen dieser Verifikation:** Die zuletzt bereite Revision ist nicht zwingend der exakte aktuell geroutete Traffic-Stand (Traffic-Split separat auslesen). Ein vorhandenes Dienstkonto beweist weder seine IAM-Rollen noch dessen Zugriffsrechte auf Firestore oder Drive. Auch der Image-Digest stellt **keine belegte Zuordnung** zum GitHub-Quellstand dar. Der Cloud Run-Code und die End-to-End-Anbindung zu Firestore bleiben ungeprüft. In Codex blockiert ein Netzwerkproxy HTTP 403; dies ist kein Beleg fehlender Cloud-IAM-Rechte.

**Nächster ausschließlich lesender Prüfpunkt:** Cloud-Run-Traffic-Zuordnung sowie Betriebs-/Startlog der *tatsächlich mit Traffic belieferten* Portal-Revision, ohne Secrets und ohne Identitätstokens offenzulegen. Erst danach den zugehörigen Code dem getesteten GitHub-Stand zuordnen. Keine Firestore-Dokumente oder Collection zum jetzigen Zeitpunkt anlegen.


## Cloud Run Traffic- und Statusprüfung – 15.10.2026

Durch den Nutzer in der angemeldeten Google Cloud Shell rein lesend ausgeführt:
`gcloud run services describe lszh-offer-portal-staging --project=lszh-automations --region=europe-west6 --format='json(status.traffic,status.conditions)'`

- `Ready=True`, `ConfigurationsReady=True`, `RoutesReady=True`, `BaseImageValidated=True`.
- `status.traffic=[{percent:100,revisionName:"lszh-offer-portal-staging-00004-qt7"}]`: Traffic wird zu 100 % auf die zuletzt bereite Revision geroutet.
- **Noch nicht bestätigt:** welche tatsächliche Anwendung im Container läuft, ob ein Platzhalter-Image verwendet wird, der aktuelle Endpunkt-Vertrag, Git-Commit-Zuordnung und Firestore-Zugriff.
- Keine Daten geändert; keine Aktivierung/Deployment/Secrets ausgelesen.

Als nächster enger read-only Prüfschritt: sicher gefilterte Startlog-Suche genau dieser Revision auf die ursprüngliche Cloud-Run-Platzhalter-Meldung. Das Vorhandensein der Meldung innerhalb dieser Revision ist ein starker Platzhalter-Hinweis; das Fehlen beweist die echte Anwendung nicht.


## Cloud-Shell Logprüfung – 15.10.2026

Die in der authentifizierten Cloud Shell ausgeführte gefilterte Leseabfrage nach `textPayload:"Hello from Cloud Run!"` für Revision `lszh-offer-portal-staging-00004-qt7` lieferte **keine Ausgabe**. Das beweist weder eine funktionierende Anwendung noch, dass der Platzhalter abgelöst wurde (beispielsweise können Logs fehlen, anders codiert oder nicht mehr aufbewahrt sein). Kein Live-Code-Befund aus diesem Filter. Die nächste Prüfung erfolgt über gefilterte Standardausgabe-/Fehler-Logs der exakt gerouteten Revision; ohne produktive Requests oder Cloud-Änderungen.

## Authentifizierte Cloud-Shell-Logprüfung – 15.10.2026

Vom Nutzer per `gcloud logging read` (nur Lesen) direkt aus Cloud Logging, Filter `resource.type="cloud_run_revision"`, Revision `lszh-offer-portal-staging-00004-qt7`, `stdout`/`stderr`:

| Zeitpunkt UTC | Startlog |
| --- | --- |
| 2026-10-15T12:34:58.969966Z | `LSZH_PORTAL_PREFLIGHT: START` |
| 2026-10-15T12:34:59.071192Z | `LSZH_PORTAL_PREFLIGHT: IDENTITY_PASS` |
| 2026-10-15T12:35:00.179213Z | `LSZH_PORTAL_PREFLIGHT: DRIVE_PASS` |
| 2026-10-15T12:35:00.287765Z | `LSZH_PORTAL_PREFLIGHT: FIRESTORE_READ_PASS` |
| 2026-10-15T12:35:00.287779Z | `LSZH_PORTAL_PREFLIGHT: PASS` |

**Bestätigt:** Die mit 100 % Traffic belegte und als Ready gemeldete Cloud-Run-Revision gibt LSZH-spezifische Startprüfungen mit erfolgreichem Identitäts-, Google-Drive- und Firestore-Lesetest aus. Dies ist wesentlich stärkere Evidenz für eine echte LSZH-Preflight-Anwendung als das Fehlen der Standard-Platzhaltermeldung.

**Nicht bestätigt:** welchen Dokumentpfad/welche Firestore-Collection die Startprüfung liest; ob es eine geschützte Angebotsvorschau, AVV-Dokumentenprüfung und eine Transaktionslogik für mehrfache Annahmen gibt; welcher Git-Commit im Image-Digest enthalten ist; ob Frontend/API und die eigentliche Annahme überhaupt implementiert bzw. deaktiviert sind. Startup-PASS ist kein End-to-End-Test. Keine Annahme-/Versand-/Schreibfunktion aktivieren.

**Nächster sicherer Schritt:** Ohne Deployments und ohne Geheimnisoffenlegung nur lesend die Cloud-Run-Revisionsmetadaten auf Herkunfts-/Build-Informationen prüfen und die Anwendungsschnittstellen (falls vorhanden) ohne produktive Zustandsänderung ermitteln. Anschliessend Designentscheidung für Firestore: nur atomaren Annahmestatus transaktional ergänzen, Airtable weiterhin CRM; kein zweites CRM bauen.
