# LSZH – Vertragsversionsnachweis und abgesicherter Airtable-GET (15.10.2026)

**STATUS:** technischer PROTOTYP auf dem Entwicklungszweig; reine Mock-/Firestore-Emulator-Tests. **Keine** echte rechtliche Freigabe, kein Cloud Run Deployment, keine Verbindungen zu Kunden, kein Airtable-PATCH, kein Versand, keine produktiven Firestore-Schreibvorgänge.

## Problem und Ziel

Der Airtable-Readback vor Ausstellung und Annahme kann geänderte Daten feststellen, aber **keinen gemeinsamen atomaren Commit mit Firestore erzwingen**. Ein normaler Hash verhindert nicht, dass jemand ein PDF in Drive nachträglich ersetzt. Wir brauchen eine explizite, gemeinsame **Vertragsfassung** mit definierten Quellrevisionen und einen überprüfbaren Workflow, in dem die verabschiedete Fassung nie stillschweigend durch spätere Änderungen ersetzt wird.

## Neu im Entwicklungszweig

### 1. Airtable-GET-Adapter sicherheitstechnisch gehärtet

`airtableReadonlyRecord.js` bleibt absichtlich **ohne automatisch abrufbaren Token, ohne default fetch und ohne konfigurierte produktive Airtable-Verbindung**. Wer den Adapter später serverseitig verwenden möchte, muss `fetchImpl`, `getAccessToken`, Base-ID und Tabellen-ID ausdrücklich übergeben.

Ergänzte Schutzregeln:

- Nur `https://api.airtable.com/v0/{baseId}/{tableId}/{recordId}`, exakt geprüfte IDs, nur `GET`. Keine Weiterleitungen, keine Cookies, kein Cache, kein Referrer.
- `AbortSignal.timeout(5000)` begrenzt für den tatsächlichen Node-Fetch die Netzwerkzeit. Eigene, fehlerhaft implementierte Fake-Transports könnten die Signalabbruchbedingung ignorieren; deshalb ist dies keine absolute Garantie für beliebige injizierte Clients.
- Eingrenzung der Antwortgrösse auf 256 KiB nach `Content-Length` und vor JSON-Parsing (wenn die echte HTTP-Antwort `text()` bietet). **Eine spätere Produktionshärtung sollte darüber hinaus einen begrenzten Stream-Reader nutzen**, damit der Speicherverbrauch schon während des Downloads beschränkt wird.
- Fehler beim Secret-Bezug werden in neutrale Fehler übersetzt. Keine Ausgabe von Tokenwerten, HTTP-Fehlerkörpern oder Netzwerkdetails. Rückgabe immer als unabhängig geklonter Datensatz.
- Die zugehörigen Tests `test/airtableReadonlyRecord.test.js` verwenden weiterhin ausschliesslich künstliche Zugangswerte und einen Mock-`fetchImpl`. **Es fand kein echter Airtable-GET statt.**

### 2. Gemeinsamer PDF-Vertragsversionsnachweis

Neu: `syntheticContractFreeze.js` mit `test/syntheticContractFreeze.test.js` und `test/syntheticContractFreeze.integration.test.js`.

- Nur `offline-or-emulator-only`, `LSZH-EMULATOR-...`-Fixtures und ungenehmigte Testentwürfe. Cloud-Run-Identität und das echte LSZH-Google-Projekt sind hart ausgeschlossen.
- Erfasst **Offerte, Bedingungen und, wenn erforderlich, AVV** in einer einheitlichen Datenstruktur mit Google-Drive-Datei-ID, übergebenem Revisionsbezeichner, SHA-256 der **lokalen synthetischen PDF-Bytes**, PDF-Grösse und MIME-Typ. Zudem werden Airtable-Record-ID, Bindungsfingerabdruck, Vertragsversion, AVV-Pflicht, Offer-ID und ein Hash der synthetischen Empfängeradresse berücksichtigt.
- Der deterministische `manifestHash=SHA256(JSON.stringify(manifest))` fixiert den Inhalt der Zusammenstellung. Es handelt sich **nicht** um eine elektronische Unterschrift, Zeitstempel einer anerkannten Stelle oder automatisch manipulationssichere Langzeitarchivierung.
- `freezeSyntheticContractOnce` verwendet eine echte Firestore-Transaktion: liest Angebotsdatensatz, bestehenden Freeze-Guard und Airtable-Bindungs-Guard, vergleicht den eingefrorenen Inhalt mit den Daten der Testofferte und legt `stagingContractFreezes/{fixtureId}` einmalig an; in der Testofferte wird `contractManifestHash` gespeichert.
- Zwei konkurrierende Firestore-Clients dürfen denselben Testvertragsstand **nur einmalig** festschreiben. Es findet keine Zustellung und keine rechtliche Freigabe statt.

## Getestet

[GitHub Actions #38779835279](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38779835279) – **88/88 Unit-/Sicherheits-/HTTP-Tests bestanden**, **7/7 echte lokale Firestore-Emulator-Integrationstests bestanden**, ohne Fehlschläge oder übersprungene Tests.

Die Emulatorumgebung verwendet ausschliesslich das Demo-Firebase-Projekt `demo-lszh-offers`; der Emulator warnt wie bisher vor eingeschränkter Mehrdatenbank-Unterstützung. Kein Firestore-Write im realen Cloud-Projekt.

## Ausdrücklich NICHT nachgewiesen

1. **Noch nicht als Pflichtprüfung in Ausstellung oder Annahme eingebunden:** Die bestehende synthetische Linkausstellung und die Annahmekandidaten verlangen noch keinen `contractManifestHash` als Vorbedingung; dies ist **der nächste technische Integrationsschritt**. Die erfolgreichen Manifesttests sind daher kein kompletter Live-End-to-End-Nachweis.
2. **Keine echte Drive-Revisionsprüfung:** Der `revisionId` wurde in Tests als künstlicher Wert übergeben. Es gibt bisher keinen sicheren Drive-Reader, der die angegebenen Revisionen, Eignerrechte, PDF-Bytes und Unveränderlichkeit unabhängig abruft. Drive-Datei-IDs allein garantieren weder Schreibschutz noch WORM-Ablage.
3. **Keine verteilte Transaktion über Airtable/Firestore/Drive:** Airtable kann nach dem GET verändert werden; ein Manifest löst diese Konsistenzfrage nicht, solange eine Produktionsregel für Vertrags-Freeze und Änderungen fehlt. Änderungswünsche nach Freigabe sollten einen neuen Angebot- und Manifeststand erfordern, statt die bestehende Version stillschweigend zu ersetzen.
4. **Noch keine echten Secrets oder Cloud IAM:** Nur injizierte Testtokens/Mock-Antworten, kein Live-Airtable-GET, keine Cloud-STAGING-Verbindung. Ein späterer eigener, minimal berechtigter Dienst ist separat zu konfigurieren und zu genehmigen.
5. **Keine materielle/rechtliche Freigabe:** Projektbedingungen RC1 und AVV RC1 sind nicht juristisch genehmigt; Archiv-/Beweis- und Datenschutzabläufe müssen extern überprüft werden.

## Nächster sicherer Entwicklungsschritt

Den Manifest-Guard auf dem synthetischen Entwicklungspfad verpflichtend in `syntheticOfferIssuance.js` und `firestoreAcceptanceState.js` prüfen und in der gesamten Testkette `Bindung → Freeze → Linkausstellung → (nur hypothetische) Annahme → Abgleich` nachweisen. Kein Live-Dienst wird aktiviert.
