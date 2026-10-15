# LSZH – durchgehender synthetischer Vertragsnachweis (15.10.2026)

**Status: nur Entwicklungszweig.** Weder echte Kundendaten noch die produktiven Make-/Airtable-/Google-Cloud-Dienste wurden geändert. Kein Cloud-Run-Deployment, keine E-Mail, keine Linkzustellung, keine Rechtsfreigabe und kein tatsächlicher Vertragsabschluss.

## Testweise verbundene Sicherheitskette

1. **Airtable-Bindung:** `syntheticAirtableBinding.js` prüft ausschliesslich simulierte Airtable-Felder; im lokalen Firestore-Emulator wird die ID transaktional und einmalig mit einem Angebotsentwurf verbunden. Ein zweiter konkurrierender Binder ist gesperrt.
2. **PDF-Vertragsfixierung:** `syntheticContractFreeze.js` berechnet aus **synthetischen PDF-Bytes** eine gemeinsame Manifest-Prüfsumme über Offerte, Projektbedingungen, AVV, zugehörige Dummy-Drive-Datei-IDs, synthetische Revisionen, Dokumentgrössen, Empfänger-Hash, eindeutige Airtable-ID und Versionsangaben. Firestore speichert `stagingContractFreezes/{fixtureId}` und den `contractManifestHash` an der Offerte in einer einzigen Transaktion. Die Manifestberechnung nutzt jetzt **kanonisch sortierte JSON-Schlüssel**, um Hash-Abweichungen bei Firestore-Feldsortierung zu verhindern.
3. **Synthetische Linkausstellung:** `syntheticOfferIssuance.js` liest den eingefrorenen Manifest-Guard sowie Airtable-Bindungs-Guard in derselben Firestore-Transaktion. Es akzeptiert keine fehlende, fremde, geänderte oder revisionsinkonsistente Vertragsversion; ein zusätzlicher fiktiver Airtable-Readback muss passend sein. Bei Erfolg erhält das Testdokument `TEST_ISSUED_NOT_DELIVERED` und `deliveryConfirmed=false`, `acceptanceEnabled=false`, `legallyApproved=false`. Es wird kein echter Kundenlink erstellt oder verschickt.
4. **Hypothetisch freigegebene Annahme separat getestet:** `firestoreAcceptanceState.js` verlangt den gleichen Manifest-Guard und trägt dessen `contractManifestHash` in die `acceptanceEvidence` ein. Der Claim-Test erzeugt dafür bewusst einen künstlich freigegebenen Firestore-Status. **Der echte synthetische Issuer schaltet diesen Status ausdrücklich niemals frei**, sodass der vollständige Issue→Accept-Übergang als reale Geschäftsaktion **nicht** simuliert oder freigegeben ist.
5. **Airtable-Abgleichsvorschau:** `firestoreReconciliation.js` verlangt ab jetzt bei `ACCEPTED` genau dieselbe `contractManifestHash` in Status und Annahmenachweis. Die eindeutige Event-ID und der JSON-Nachweis binden die konkrete Vertragsfassung. Unterschiedliche eingefrorene Fassungen erhalten unterschiedliche Event-IDs. Ein externer `PATCH`, eine unabhängige Live-Airtable-Verifikation oder eine Mail-Outbox existiert weiterhin nicht; abgelaufene Worker gehen in `NEEDS_REVIEW`.

## Tatsächlich geprüfte Ausführung

- [GitHub-Actions-Lauf 38782567607](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38782567607): **91/91 Unit-/HTTP-Tests und 8/8 echte Firestore-Emulator-Integrationstests bestanden**, 0 Fehler und Skips.
- Darin ein neuer **durchgehender Emulator-Test** `test/syntheticContractChain.integration.test.js`: **Airtable-Mockbindung → echte Emulator-Transaktion zum Vertrags-Freeze → konkurrierende echte Emulator-Transaktionen zur synthetischen Ausstellung → abgewiesener Annahmeversuch → abgewiesene Reconciliation-Vorschau**. Das Testprojekt `demo-lszh-offers` hat keinen Bezug zu produktiven Google-Cloud-Datensätzen.
- Die vorhandenen Tests für eine hypothetisch bereits versendete, freigegebene Offerte prüfen weiterhin doppelte/konkurrierende Annahmen, fehlende Freeze-Guards, veränderte Archive, AVV, falsche Airtable-Felder und den einmaligen Reconciliation-Lease.
- Der anschliessende [GitHub-Actions-Lauf 38782802281](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38782802281) bestätigt diese beiden neuen Regressionsprüfungen: **93/93 Unit-/HTTP-Tests und 8/8 echte Firestore-Emulator-Tests erfolgreich**, keine Fehler oder Skips. Die Reconciliation-Event-ID ändert sich mit der eingefrorenen Vertragsfassung und die kanonische Hashberechnung bleibt trotz umsortierter JSON-Schlüssel stabil.

## Kritische Grenzen (offen)

- **Der Hash schützt die Vertragsfassung im Code, nicht vor einem privilegierten Überschreiben oder Löschen der Cloud-Files.** Es gibt noch keinen echten Google-Drive-Reader, keine verifizierten Datei-Revisionen, keine unveränderliche Archivablage und keine signierte Beweis-/Zeitstempelurkunde.
- **Airtable ist noch ein Mock**: kein echtes Airtable-GET/PATCH. Ein Readback zwischen zwei unabhängigen Plattformen kann weiterhin nach dem GET bis zum Firestore-Commit veralten. Ein Betriebsprozess muss Freigabe-/Freeze-Änderungen als neue Fassung behandeln und Konflikte sperren.
- **Rechtlich:** Projektbedingungen RC1 und AVV RC1 sind weiterhin nicht rechtsverbindlich bzw. juristisch final freigegeben. Annahme eines echten Vertrags ist abgeschaltet; die positive Claim-Simulation ist keine Kundenabnahme.
- **Betrieb:** Keine öffentliche Portal-API, kein Cloud-Run-Deployment, keine produktive Firestore-Datenbank geschrieben, kein Make oder Versand ausgelöst. Service-Identität und IAM, Authentisierung, Anti-Missbrauch, Reconciliation-Worker, Bestätigungs-Outbox und Monitoring fehlen.
- **Emulator:** Die Firebase-Konsole meldet weiter eine Einschränkung bei der Unterstützung mehrerer Datenbanken; echte benannte Google-Cloud-Firestore-Laufzeit erfordert eine isolierte, explizit autorisierte Staging-Abnahme.

## Nächste Entscheidung

Der nächste sinnvolle Entwicklungsblock ist **echter lesender Zugriff** auf einen synthetischen Airtable-Datensatz unter eng begrenzten Rechten sowie ein revisionsbewusstes Google-Drive-Readback. Vor echtem Zugriff auf externe Systeme sind sichere Identitäten, Bearbeitungsrechte und Testfreigaben festzulegen; bis dahin kann das Verfahren ohne externe Daten weiter modelliert werden.
