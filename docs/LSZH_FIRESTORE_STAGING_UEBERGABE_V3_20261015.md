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
