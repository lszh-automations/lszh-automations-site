# LSZH – synthetische Airtable→Firestore-Zuordnung: technischer Nachweis

**15.10.2026 – Entwicklung ausschliesslich im Branch `feature/firestore-staging-dryrun-20261015`.** Kein echter Airtable-Record wurde abgefragt oder verändert. Kein Cloud-Run-Deployment, kein echter Cloud-Firestore-Schreibzugriff, keine Make-Szenarien/E-Mails/Verträge freigegeben.

## Problem und technische Lösung

Eine angenommene Firestore-Offerte muss eindeutig genau dem richtigen Datensatz der Airtable-Tabelle **Offerten** zugeordnet werden können. Eine Offertennummer allein genügt nicht als Identifikation. Das vorherige Reconciliation-Modul benötigte `airtableRecordId`, doch die gesicherte Herkunft und Einmalzuordnung waren noch ungeklärt.

Neues Testmodul: `syntheticAirtableBinding.js`.

1. Ein **vertrauenswürdiger, serverseitiger Leser**, im Test explizit als reine Fake-`readRecord`-Funktion injiziert, liefert **lesend** den Airtable-Record und dessen eindeutige `rec...`-ID. **Weder Kunde/Browser noch URL-Parameter** dürfen diesen Wert für den späteren Produktivfall ungeprüft bestimmen.
2. Vor jeder Firestore-Änderung werden Status `Entwurf`, Offertennummer, Ablaufdatum, Empfänger-E-Mail, Projektbedingungen-Version, **beide PDF-SHA256 + Drive-Datei-IDs**, bei Bedarf **AVV-SHA256, Drive-ID, Version und Pflicht-Flag** überprüft. Bereits versendete, rechtlich freigegebene oder angenommene Airtable-Records sind für diese rein synthetische Bindung gesperrt.
3. Erst dann führt der Testcode eine **atomare Firestore-Transaktion** aus und liest dabei zwei Dokumente **vor jeder Schreiboperation**:
   - den gesperrten synthetischen Angebotsdatensatz `stagingOfferFixtures/{fixtureId}`;
   - einen eindeutigen Guard `stagingAirtableBindings/{airtableRecordId}`.
4. Besteht noch keine Bindung, speichert die Transaktion `airtableRecordId` und einen SHA-256-Fingerabdruck der zugeordneten Daten an der Offerte und erzeugt den Guard einmalig per `tx.create()`. Parallel auftretende Bindungen derselben Airtable-ID können dadurch **nicht gleichzeitig erfolgreich** sein.
5. Ergebnisstatus bleibt **`TEST_DRAFT_NOT_SENT`**, `acceptanceEnabled=false`, `legallyApproved=false`. Es wird kein Link versendet, kein Vertrag angenommen, kein Airtable-Datensatz aktualisiert.
6. Unzulässige Ausführungsumgebungen werden explizit gesperrt: Cloud Run `K_SERVICE`, reales LSZH-Google-Projekt, fehlender `offline-or-emulator-only`-Modus, andere als synthetische Fixture-IDs. Das Modul importiert **keine Airtable-SDKs, Credentials oder Netzwerkfunktion**.

## Vorbereiteter gesicherter Read-only-Airtable-Client

Ergänzend wurde `airtableReadonlyRecord.js` entwickelt. Der Baustein erfordert **explizit** eine serverseitig injizierte `fetchImpl`, die Identität der Base, die Identität der Tabelle und eine separate `getAccessToken`-Funktion. Er besitzt **keinen automatischen Netzwerkzugriff, keine selbstgelesenen Umgebungsvariablen und keinen API-Schlüssel**. Die URL wird ausschliesslich als `https://api.airtable.com/v0/{baseId}/{tableId}/{recordId}` zusammengesetzt; die drei IDs werden streng validiert. Die Anfrage ist **nur GET** mit ausgeschalteten Weiterleitungen, Caching, Cookies und Referrer. Der Rückgabedatensatz muss dieselbe Record-ID haben. HTTP-Fehler, fehlende Record-Felder und Netzwerkausnahmen werden mit neutralen Fehlern statt sensitiven Details zurückgegeben.

`test/airtableReadonlyRecord.test.js` verwendet **ausnahmslos einen erfundenen Fetch-Callback und ein Testtoken**. Keine echten Airtable-Zugangsdaten, kein produktiver API-Aufruf und kein Schreibzugriff. Die Ergänzung ist eine **Transportvorbereitung**, keine aktivierte Live-Verbindung. Spätere Anbindung darf nur serverseitig mit minimalen Rechten und zusätzlicher Freigabe-/Authentifizierungsprüfung erfolgen.

## Grenzen des Nachweises

- **Die Airtable-Felder existieren:** verbundenes Airtable-Schema am 15.10. ausschliesslich lesend überprüft. Die echte Base- und Tabellenidentität sind intern bekannt und wurden nicht mit synthetischen Daten beschrieben.
- **Noch keine tatsächliche Airtable-API-Integration:** Der Test liefert künstliche Datensätze an eine injizierte `readRecord`-Funktion. Es gibt **keinen produktiv nutzbaren GET/PATCH-Worker** und keine sichere Secret-/OAuth-Anbindung für Live-Airtable.
- Airtable und Firestore bieten **keine gemeinsame verteilte Transaktion**. Der in Airtable gelesene Status könnte sich zwischen Lesezeitpunkt und Firestore-Commit ändern. Später muss ein autorisierter Backendprozess mit angemessen frischem, unabhängig verifiziertem Readback und strenger Folgeprüfung vor Linkausstellung/Annahme arbeiten.
- Die neue Bindung wird **noch nicht** automatisch in die vorherige synthetische Linkausstellung oder Annahme übernommen. Der technische Weg ist vorbereitet, die verbindliche Integration als nächste Ausbaustufe offen. Auch `firestoreReconciliation.js` ist ausschliesslich für Fake-/Emulator-Datensätze.
- Es gibt keinen Mail-Outbox-/Make-Worker, keine kundenbezogenen Vertrags-PDFs oder juristische RC1-/AVV-Abnahme. Das echte Cloud-Run-Preflight-Image bleibt unberührt.
- Unklarer Airtable-PATCH-Ausgang wird im separat getesteten Reconciliation-Modul bewusst nicht erneut geschrieben, sondern `NEEDS_REVIEW` zugeordnet. Eine globale Exactly-once-Garantie über Firestore und Airtable wäre unzutreffend.

## Testplan

- `test/syntheticAirtableBinding.test.js`: synthetische Einheitstests auf Identitätsbindung, falsche Empfänger, abweichende PDF-IDs/Hashes, AVV-Zwang, bereits bestehende Bindung, Wiederholungen, parallele Worker, nicht freigegebene Zustände, fehlende Vertrauensquelle und ohne AVV.
- `test/syntheticAirtableBinding.integration.test.js`: zwei unabhängig initiierte echte Firestore-Transaktionen gegen den **lokalen Firebase-Emulator** mit **`demo-lszh-offers`** und `lszh-offers-staging` als *nur lokalen* Namensbezeichnern. Es darf nur eine Fixture denselben Airtable-Mockdatensatz binden; die zweite Transaktion muss abgewiesen werden. Kein Airtable-Netzwerk, keine Kunden- oder Produktivdaten.
- [GitHub-Actions-Workflow](../.github/workflows/lszh-firestore-emulator.yml) prüft Syntax/Unit/Emulator. Nachfolgende Ausführungsergebnisse separat anhand der Joblogs dokumentieren, nicht durch einen grünen Code-Commit behaupten.

## Tatsächlich verifizierter GitHub-Actions-Testlauf

[GitHub Actions Run #38774815271](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38774815271) erfolgreich abgeschlossen, Code-Revision `92ab208e09afa51f465471f2e41586be1880f9c2`:

- **44/44** Sicherheits- und Unit-Tests bestanden, keine fehlgeschlagenen Tests und keine Skips. Enthält die GET-only-Airtable-Testtransportprüfungen, ohne echte API-Aufrufe.
- **6/6** lokale Firestore-Emulator-Integrationstests bestanden. Der neue sechste Test beweist die atomare Eindeutigkeit der simulierten Airtable-Datensatz-ID bei zwei gleichzeitig bindenden Firestore-Clients.
- Die anfänglichen Tests fanden eine fehlende frühe Empfänger-Sperre und eine nicht präzise Fehlererwartung bei einer schon existierenden Zuordnung. Beides wurde korrigiert und durch einen abschliessend grünen CI-Lauf bestätigt.
- Der Firebase-Emulator meldet weiterhin eingeschränkte Unterstützung für mehrere Datenbanken; die benannte Datenbank ist **nicht** als echte Google-Cloud-Laufzeit verifiziert.

**Der Code ist nicht ausgerollt und führt keine realen Schreibvorgänge aus.** Die einzige transaktionale Bindung im Test erfolgte im kurzlebigen `demo-lszh-offers`-Emulator.

**Nächste Priorität:** Den geprüften `airtableRecordId`-Bindungsnachweis beim späteren Ausstellen und Annehmen zwingend mitvergleichen; zuvor die unabhängige authentifizierte Airtable-Leseverbindung unter einem freigegebenen Staging-Servicekonzept und echten PDFs planen. Weiterhin keine produktive Aktivierung ohne ausdrückliche Zustimmung.
