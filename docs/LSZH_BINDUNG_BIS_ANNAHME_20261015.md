# LSZH – zwingende Airtable-Zuordnung vor synthetischer Ausstellung UND Annahme

**Stand: 15.10.2026, Entwicklungszweig `feature/firestore-staging-dryrun-20261015`.** Ausschliesslich lokaler Fake/kurzlebiger Firebase-Emulator mit dem Demoprojekt `demo-lszh-offers`; **keine produktive Aktivierung**. Kein echter Airtable-Record gelesen/geändert, keine Links verschickt, keine Verträge geschlossen, keine E-Mails, kein Cloud-Run-/Make-Deployment und keine echte Google-Cloud-Firestore-Schreiboperation.

## Geschlossene Zuordnungskette

1. `syntheticAirtableBinding.js` erstellt erst nach Vergleich einer **simulierten, vertrauenswürdigen, serverseitigen Airtable-Lesefunktion** den eindeutigen Firestore-Guard `stagingAirtableBindings/{airtableRecordId}` und schreibt die `airtableRecordId` plus SHA-256-Bindungsfingerabdruck in die synthetische Offerte.
2. `bindingFingerprint(state, recordId)` wird von Bindung, Ausstellung und Annahme gemeinsam verwendet. Er bindet Fixture-ID, Airtable-Record-ID, Offertennummer, Empfänger, Gültigkeit, Vertragsbedingungen-Version, AVV-Pflicht/-Version sowie die PDF-SHA-256 und Drive-Datei-IDs. Die ursprüngliche Bindung wird im Anwendungsdatensatz und im einmalig erzeugten Guard vermerkt.
3. **Synthetische Linkausstellung `syntheticOfferIssuance.js`:** Verlangt eine syntaktisch gültige Airtable-Record-ID, einen gültigen eingefrorenen Fingerabdruck und einen passenden eindeutigen Guard. **Beide Firestore-Dokumente werden in einer Transaktion vor der Statusänderung gelesen**. Fehlender, falscher oder veränderter Guard verhindert Token-Ausstellung. Das Ergebnis bleibt `TEST_ISSUED_NOT_DELIVERED`, `deliveryConfirmed=false`, `acceptanceEnabled=false`, `legallyApproved=false`; kein echter Kundenlink.
4. **Synthetischer Annahmekandidat `firestoreAcceptanceState.js`:** Erfordert ebenso vor dem einzelnen Übergang `ISSUED → ACCEPTED` denselben intakten, eindeutig gesperrten Airtable-Datensatz. Die zwei Dokumente werden in derselben Firestore-Transaktion gelesen. Fehlender, manipulierter oder nicht übereinstimmender Guard blockiert. Positivtests mit `ISSUED`/`legallyApproved=true` simulieren **nur einen hypothetischen Zustand im Emulator**; die reguläre synthetische Ausstellung aktiviert diesen Zustand **niemals**.
5. **Anschliessender Abgleich:** `firestoreReconciliation.js` verwendet `airtableRecordId`, Vertrags-/AVV-Fingerabdrücke und einen eindeutigen Ereignismarker für eine nachweisbasierte, deduplizierte Airtable-Abgleichsvorschau. Er stellt weder eine echte Airtable-Verbindung her noch sendet er Bestätigungsmails oder Make-Aktionen.

## Testnachweis

- [GitHub Actions Run #38775552863](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38775552863): **46/46 Node-Unit-Tests und 6/6 Firestore-Emulator-Tests erfolgreich**, insbesondere erst **Bindung → konkurrierende synthetische Ausstellung**.
- [GitHub Actions Run #38776172583](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38776172583): **56/56 Node-Unit-Tests und 6/6 Firestore-Emulator-Tests erfolgreich**, einschliesslich **verpflichtender Bindung im simulierten Annahmecode** und parallelen SDK-/HTTP-Tests. Die Emulatorwarnung zur eingeschränkten Multi-Datenbank-Unterstützung bleibt bestehen; echte Cloud-Laufzeit wurde nicht geprüft.
- Der GitHub-Workflow wurde zusätzlich erweitert, damit der lokale HTTP-Regressionstest `services/offer-acceptance-staging/test/localFixtureClaims.test.js` bei jeder relevanten Änderung gemeinsam mit den anderen Prüfungen ausgeführt wird. **Diesen zusätzlichen vollständigen Regressionslauf nur anhand des späteren GitHub-Jobergebnisses als bestanden dokumentieren.**

## Abschliessende Gesamtregression

[GitHub Actions Run #38776417489](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38776417489) **erfolgreich**: **66/66 Node-Unit-/HTTP-Sicherheitstests und 6/6 echte lokale Firestore-Emulatortests**, keine Fehlschläge oder übersprungenen Tests. Enthält auch die HTTP-Prüfung, dass ein nicht gebundener synthetischer Angebotsdatensatz selbst mit korrekten PDF-Hashes nicht angenommen werden kann. Der Firebase-Emulator meldet weiter eine Einschränkung bei benannten Datenbanken; die echte GCP-Datenbank wurde nicht angesprochen.

## Grenzen und Freigabepunkte

- Ein Guard beweist lediglich, dass **bei der synthetischen Bindung** Daten übereinstimmten. Er schützt vor unbemerkt veränderten Firestore-Feldern, aber **nicht** vor späteren Änderungen in der echten Airtable-Base. Ein späterer echter Ausstellungs- und Annahmedienst benötigt unmittelbar davor einen **unabhängigen, authentifizierten, frischen Airtable-GET**, dessen Ergebnis serverseitig mit dem eingefrorenen Vertrag verglichen wird.
- `airtableReadonlyRecord.js` ist bislang ein injizierter, GET-only HTTP-Adapter, ausschliesslich mit falschen Tokens und Mock-Responses getestet. **Kein produktives Airtable-PAT/OAuth-Secret** wurde eingebunden; keine kundenbezogene Airtable-Live-GET-Prüfung durchgeführt. Eine reale Anbindung verlangt minimierte Berechtigungen, Secret-Rotation, Timeout, Rate-Limit und eindeutige Datenschutz-/Freigabegrenzen.
- `firestoreAcceptanceState.js` und `syntheticOfferIssuance.js` sind **nicht** an den Kunden-Endpunkt `/api/offer/accept` angeschlossen. Der geplante Cloud-Run-Staging-Gateway gibt für sämtliche Kunden-Offerten-APIs weiterhin HTTP 503. Die lokale Testfunktion ist nicht Teil des produktiven Containers.
- Die eigentliche elektronische Annahme muss in der echten Google-Cloud-Datenbank `lszh-offers-staging` und mit echten Google-Drive-PDF-Byte-Hashes, der korrekten Dienstidentität, Auditing, Replay-Schutz und freigegebenen RC1-/AVV-Dokumenten noch separat getestet und bewilligt werden.
- **Cross-System Exactly-once ist nicht bewiesen.** Der Test-Reconciliation-Pfad markiert unklare Airtable-PATCH-Ausgänge für Überprüfung statt sie blind zu wiederholen. Ein produktiver Abgleichs-/Mail-Outbox-Worker existiert weiterhin nicht.
- Bis ausdrückliche schriftliche/Chat-Freigabe für isolierte echte Staging-Datenbank-Schreibtests vorliegt: keine externen Invites, keine Make-Mailaktivierung, keine echte Token-Ausgabe, kein Cloud-Deployment und keine juristische Freigabe vortäuschen.

## Nächste risikoarme Schritte

1. Den aktuellen Gesamt-CI-Lauf mit dem zusätzlich aufgenommenen lokalen HTTP-Regressionstest auswerten.
2. Das sichere **Readback-Protokoll** (Airtable → Firestore, kurz vor Ausgabe und Annahme) in Mock-Tests ergänzen, ohne Zugangsschlüssel oder Live-Daten zu benötigen.
3. Vor echter Cloud-STAGING-Schreib-/End-to-End-Probe die Cloud-Run-Serviceidentität, Berechtigungen, geschützte PDF-Archivquelle, Rechtsfreigaben und Testfreigabe getrennt bestätigen.

**Fertig bedeutet hier: Sicherheitsbedingungen auf Code-/Emulator-Ebene getestet; kein betriebsbereiter Kundenservice.**
