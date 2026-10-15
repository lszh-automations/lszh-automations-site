# LSZH – Lokaler HTTP-Transaktionstest (15.10.2026)

**Entwicklungszweig:** `feature/firestore-staging-dryrun-20261015`. Keine produktive E-Mail, kein tatsächlicher Vertragsabschluss, kein Google-Cloud-Deployment, kein Firestore-Schreibzugriff.

## Was die Integration jetzt abdeckt

- Die bestehende Staging-HTTP-App `services/offer-acceptance-staging/app.js` hat eine **ausschliesslich lokal injizierbare Testnaht** `POST /__local_fixture/claim`. Sie ist nur bei `NODE_ENV=test`, ohne `K_SERVICE`, bei TCP-Verbindungen **Loopback zu Loopback** und mit explizit übergebenem `localFixtureClaim`-Testhandler erreichbar.
- Der tatsächliche Cloud-Run-Einstiegspunkt `services/offer-acceptance-staging/index.js` ruft `createGateway()` **ohne** Testhandler auf. Der Dockerfile kopiert **keine Testordner und keinen Firestore-SDK-Testhandler**. Im Produktivmodus ist die neue Testroute nicht vorhanden (404).
- Die für Kunden vorgesehenen drei Routen `/api/offer/preview`, `/api/offer/document` und `/api/offer/accept` bleiben **immer HTTP 503**. Es gibt weiterhin **keine** aktivierbare Kundenannahme und keinen produktiven Firestore-Schreibadapter.
- `services/offer-acceptance-staging/test/localFixtureClaims.js` prüft die synthetische HTTP-Eingabe, liest **nur lokale Test-PDF-Bytes**, berechnet ihre SHA-256 unabhängig von den vom Testclient übermittelten Hashes und ruft dann den unveränderten Kandidaten `firestoreAcceptanceState.claimOfferOnce` auf.
- Das Transaktionsmodul führt den Statuswechsel `ISSUED → ACCEPTED` atomar über das injizierte `db.runTransaction` aus und legt den noch unvollendeten Airtable-Abgleich als `reconciliationStatus=PENDING` ab. Dieses Verhalten ist **nur im lokalen Fake getestet**; der Fake serialisiert konkurrierende Anfragen und ersetzt keine echte Firestore-Transaktionssemantik.
- Alle Beispielnamen, Token, PDF-Bytes und Statuswerte sind erfunden. Die lokalen Positivtests setzen nur im Fake vorübergehend `legallyApproved=true` usw., um den *hypothetischen* freigegebenen Fall zu simulieren. **Die echten V4-Fixtures und RC1-Verträge bleiben ungeprüft/nicht freigegeben und die reale Cloud-Datenbank bleibt unverändert.**
- Keine echte Google-Drive-Prüfung in diesem lokalen Test: Die Hashes stammen aus einem Testbuffer und die Drive-IDs sind bewusst Dummywerte.

## Tatsächlich ausgeführte Node-Tests

Auf einer lokalen Node.js-22-Laufzeit wurde `node --test services/offer-acceptance-staging/test/*.test.js` (ohne optionales Emulator-Testfile) ausgeführt:

- **20 bestanden, 0 fehlgeschlagen, 0 übersprungen.**
- Darin 9 neue lokale Gateway-/Transaktionschecks: einzelner Abschluss, zwei konkurrierende HTTP-Aufrufe (genau einer erfolgreich), Token-/Hashmanipulation, fehlende AVV-Zustimmung, geänderte lokale PDF-Bytes, fehlende Geschäftsfreigabe, vollständig deaktivierte Produktionsrouten, K_SERVICE-Blockade, `NODE_ENV=production`-Blockade und Prüfung, dass der Docker-Bauplan keine Testdateien enthält.
- Die bisherigen 11 Gateway-/Linktests blieben erfolgreich.
- **Wichtig:** Dies ist ein lokaler Testnachweis und **kein** GitHub-Actions-, Firebase-Emulator-, Cloud-Firestore- oder realer Kunden-End-to-End-Test.

## Optionaler echter Emulator-Test (noch NICHT ausgeführt)

`services/offer-acceptance-staging/test/firestoreEmulatorGateway.integration.test.js` wurde zusätzlich vorbereitet. Er verbindet auf einem lokalen Node-Testserver zwei **unabhängige** Firestore-SDK-Clients mit dem Firestore-Emulator, sendet gleichzeitig zwei HTTP-Annahmen, erwartet einmal 200 und einmal 409 sowie genau einen gespeicherten `ACCEPTED`-Status. Der Test wird **standardmässig übersprungen**.

Für die Aktivierung müssen sämtliche Bedingungen gelten:

- `FIRESTORE_EMULATOR_HOST` referenziert nachweisbar ausschliesslich Loopback.
- `LSZH_STAGING_EMULATOR_TEST=yes`.
- `LSZH_RUN_EMULATOR_TRANSACTION_TEST=I_UNDERSTAND_LOCAL_ONLY`.
- Zielprojekt und Ziel-Datenbank sind exakt `lszh-automations` und `lszh-offers-staging`; **dies sind im Emulator bloss Test-Namensbezeichner**.
- Keine Cloud-Run-`K_SERVICE`-Umgebung oder exportierte Cloud-Schlüssel.
- `@google-cloud/firestore` und ein lokal gestarteter Emulator sind vorhanden.

Der SDK und die Emulatorprogramme stehen in der aktuellen isolierten Testumgebung nicht zur Verfügung; **kein Emulator-Lauf wird behauptet**. Das GitHub-Workflow enthält Syntaxprüfung und einen standardmässig übersprungenen Lauf des optionalen Integrationstests. Kein neuer Cloud Run, IAM, DNS, Airtable, Make, Drive oder Firestore-Datensatz wurde angelegt.

## Nächste Freigabegrenzen

1. Optionalen Emulator-Test in einer eigens vorbereiteten lokalen Entwicklungsumgebung wirklich ausführen und getrennt protokollieren.
2. Einen final geprüften **serverseitigen** Issuance-Adapter bauen: keine Kundenlinks bis alle Vertrags-/AVV-PDFs unveränderlich versionsbezogen verfügbar, jeder ausgestellte Token-Hash transaktional registriert und kein Status doppelt geändert werden kann.
3. Für den künftigen Cloud-Run-Dienst Google-eigenes **kurzlebiges Dienstkonto** mit minimalen Firestore-/Drive-Rechten planen; keine JSON-Schlüssel in Render, keine Cloud-Run-Preflight-Revision überschreiben.
4. Danach *nur nach ausdrücklicher Testfreigabe* einen einzelnen synthetischen Datensatz in der benannten **echten** Firestore-Staging-Datenbank anlegen und seine Race-/Fehlerfälle prüfen.
5. Erst nach technischer, Datenschutz- und juristischer Freigabe der RC1-Verträge und AVV über Produktivfreigabe sprechen.

Diese lokale Testnaht ist kein öffentliches Produktfeature.
