# LSZH – erneuter Airtable-Readback vor Ausgabe und Annahme

**Entwicklungsstand 15.10.2026:** rein synthetische Tests im Branch `feature/firestore-staging-dryrun-20261015`. Keine neue produktive Verbindung, keine echten Kundendaten, keine E-Mail, kein Airtable-PATCH, kein Cloud-Run-Deployment und kein Google-Cloud-Firestore-Schreibzugriff.

## Sicherheitslücke des bisherigen Entwurfs

Die bestehende Zuordnung `stagingAirtableBindings/{airtableRecordId}` bewies, dass eine simulierte Airtable-Offerte **zum Zeitpunkt der Bindung** mit dem Firestore-Datensatz übereinstimmte. Airtable könnte später verändert werden, während der alte Firestore-Guard weiterhin passt. Ein Guard allein genügt nicht.

## Neu implementiert – nur lokaler / Emulator-Testpfad

- `syntheticAirtableReadback.js` verlangt eine **serverseitig injizierte vertrauenswürdige Read-only-Funktion** `readRecord(recordId)`. Die Funktion liest neu, prüft die exakte Record-ID und klont die zurückgegebenen Felder. **Das Modul ist nicht selbst mit Airtable verbunden.** Der separate `airtableReadonlyRecord.js`-Baustein bleibt ebenso unkonfiguriert; im Test werden ausschliesslich Mock-Antworten verwendet.
- `syntheticOfferIssuance.js` und `firestoreAcceptanceState.js` verlangen beide nun zwingend `airtableRecordId` und `readRecord`. Der Record wird **vor** dem Firestore-Transaktionsaufruf lesend abgerufen; innerhalb des Transaktionscallbacks werden aktuelle Firestore-Offerte, eindeutiger Bindungs-Guard und dieser Snapshot gemeinsam mit den erwarteten Angebotsdaten verglichen. **Keine Netzwerkaufrufe innerhalb einer wiederholbaren Firestore-Transaktion.**
- `issuance` verlangt Status `Entwurf`, keine Freigabe/kein Versand, nicht gesetzten Token-Hash, exakte Offertennummer/Empfänger/Gültigkeit/Bedingungen-Version, passende Offerten- und Bedingungen-SHA256 samt Drive-IDs sowie bei AVV-Pflicht SHA256, Drive-ID und AVV-Version. Fehlende oder abweichende Daten verhindern die **synthetische** Ausstellung. Ergebnis bleibt `TEST_ISSUED_NOT_DELIVERED`, niemals versendet oder annehmbar.
- `acceptance` verlangt den hypothetischen Testzustand `ISSUED`, `Versendet` in der simulierten Airtable-Kopie, das Versandmerkmal, freigegebene Vertragsunterlagen, gültigen Versandzeitstempel, identischen Token-Hash, alle Vertrags-/AVV-/PDF-Dokumentdetails und einen noch unangenommenen Zustand. Fehlende Freigabe, zwischenzeitlich geänderte PDFs oder Empfängerdaten blockieren die **rein synthetische** Transaktion.
- `test/helpers/mockAirtableOffer.js`, `test/syntheticAirtableReadback.test.js` sowie bestehende Issuance-/Claim-/HTTP-Tests wurden angepasst; die GitHub-CI verlangt den zusätzlichen Readback-Code. Eine irrtümliche Lücke, bei der ein bereits freigegebener Teststatus als `issuance`-Entwurf gelesen werden konnte, wurde durch getrennte strikte Firestore-Lebenszyklus-Prüfungen geschlossen.

## Testbelege und Grenzen

- [Erster erfolgreicher Gesamtlauf nach Einbindung](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38778369473): **76/76 Unit-/HTTP-Sicherheitstests, 6/6 echte lokale Firestore-Emulatortests, keine Fehlschläge**.
- Zusätzliche Emulator-Negativfälle wurden anschliessend **erfolgreich** nachgewiesen: künstlich geänderter AVV-SHA256-Wert verhindert die Linkausstellung; ein geänderter Airtable-Versandstatus verhindert die Annahme. Der Folge-Testlauf [#38778628864](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38778628864) ist **vollständig erfolgreich: 76/76 Unit-/HTTP-Tests und 6/6 echte Firestore-Emulatortests**. Der angenommene Zustand bleibt bei den manipulierten Testfällen unverändert.
- Emulator-Projekt ist ausdrücklich `demo-lszh-offers`, Loopback `127.0.0.1`. Der Emulator weist weiterhin auf unvollständige Unterstützung benannter Datenbanken hin.

**Fundamentale Grenze:** Die Airtable-Lesung und die Firestore-Transaktion sind **nicht übergreifend atomar**. Airtable kann sich nach einem erfolgreichen GET und vor dem Firestore-Commit verändern. Der Code reduziert offensichtliche Drift und schliesst bekannte inkonsistente Zustände, garantiert aber keine Echtzeitkonsistenz und keine transaktionssichere Kopplung beider Systeme. Vor einem produktiven Release braucht es daher ein definiertes Vertrags-Freeze-/Versionierungsprotokoll, belastbare Freigaben, echte Google-Drive-Archivbyte-Verifikation, IAM/Authentisierung und nachvollziehbare Betriebsprozesse.

Das öffentliche Portal bleibt auf `/api/offer/{preview,document,accept}` mit HTTP 503 gesperrt. `OFFER_ACCEPTANCE_ENABLED` schaltet diese Testmodule nicht produktiv frei; produktive Nachrichten-/Make-Automation sind aus.

## Nachfolgende Priorität

Erst eine isolierte, authentifizierte **read-only** Airtable-Integration mit minimalem Zugriff und separater Freigabe; vor einem echten Abschluss zusätzlich ein verlässliches, revisionsbezogenes Freeze-/Freigabeverfahren der Dokumente. Jede produktive Änderung verlangt weiterhin eine ausdrückliche Nutzerentscheidung.
