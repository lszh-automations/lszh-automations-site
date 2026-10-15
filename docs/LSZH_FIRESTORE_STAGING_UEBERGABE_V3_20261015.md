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
