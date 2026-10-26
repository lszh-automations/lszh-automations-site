# LSZH CRM V2 – C3.3: Versandsicherheit, Pflichtprüfungen, Dublettenschutz (STAGING)

**25.10.2026 | Entwicklungsstand, KEIN SEND-GO-LIVE**

Basis: C3.2 Make 8166714 (inaktiv) ist mit synthetischen 2- und 3-PDF-Paketen bis zur HTTP-423-Antwort geprüft. Keine Gmail-Verbindung, keine Test- oder Kundenmail. C1/C2 haben signiertes Release-Manifest und transaktionales, dauerhaftes Firestore-Ledger (echter lokaler Emulator zuvor 7/7 PASS). C3.1/C3.2 bauen nur sichere PDF-Vorschau, Gmail-MIME-Mapping und spätere READ-ONLY-Prüfadapter.

## Was im separaten C3.3-Branch hinzugefügt wurde

- Neue reine Staging-Komponente crm-v2/contract-dispatch-preflight-staging.js. Sie akzeptiert ausschliesslich serverseitig konfigurierte releaseGate, draftBuilder, ledger, signingSecret, allowedRecipients und eine kontrollierte Clock. Keine HTTP-, Make-, Gmail- oder produktive CRM-Route.
- Ablauf reserveForReview(pkg, approval):
  1. Prüft tatsächliche operator-authentifizierte Freigabe mittels C1 releaseGate.approve (nicht Browser-Flag), Purpose TEST_ONLY_CONTRACT_DISPATCH, exakt freigegebene Testadresse und 15-Minuten-Fenster.
  2. Verifiziert die Signatur des Release-Manifests.
  3. Liest die synthetischen Test-Archivbytes, verifiziert SHA-256/Dateigrössen und erstellt das gesperrte Gmail-Preview-Paket (nur 2 PDF offer+terms oder 3 PDF offer+terms+avv).
  4. Prüft nochmals Base64/Binärdaten, Dokumentreihenfolge, AVV-Anzahl und neverSend=true, sendMode=blocked_preview_only.
  5. Erst nach sämtlichen Pflichtprüfungen reserviert das bestehende Firestore-Ledger den deterministischen Event-Key und den dauerhaften pro-Offerte-Lock atomar.
  6. Prüft den Ledger-Response und gibt ausschliesslich minimale Audit-Metadaten mit sendPermitted=false, transmitted=false, provider=NONE, messageId=null zurück. Keine PDF-Bytes, keine Gmail-Transport-Payloads.
- Doppelte oder parallele Requests sowie erneute Revisionen derselben Offerte werden durch das bestehende transaktionale Ledger abgewiesen; bei unklarer Reservierung niemals automatisch erneut versuchen. inspectOnly(eventId) darf nur den Status lesen.
- Neue Tests crm-v2/test/contract-dispatch-c33-preflight.test.js (10 Testfälle) prüfen 2/3 PDFs, AVV-Pflicht/Unklarheit, Empfänger und Betreiber, Freigabealter, Archiv-SHA-Manipulationen, atomare Doppelreservierung, Revisionswechsel, widersprüchliche Ledger-Quittung und das Verbot produktiver Imports.
- CI-Workflow ergänzt, um den neuen Branch bei Push sowie neue Dateien mit node --check zu berücksichtigen. Neuer Gesamt-Testlauf noch nicht bestätigt; letzter vom Betreiber bestätigter CRM-Stand vor C3.3: 230/230 und Firestore-Emulator 7/7.
- Keine neuen Sendemodule, Make-Szenarien, Webhook-Aufrufe, produktive Änderungen oder externen Mails.

## Was weiterhin NICHT als verifiziert gilt

1. Keine echte Verknüpfung des reservierten Ledger-Records mit einem isolierten produktionsfernen Gmail-Transportadapter; C3.3 ist nur ein kein-Send-Preflight.
2. Kein echter Gmail-SENT-Readback samt Original-PDF-Bytes, Absender/Empfänger/Event-ID und SHA-256 unter den geplanten Provider-Berechtigungen.
3. Keine produktive Firestore-IAM-/Security-Rules-Abnahme; bisherige Integrationstests nutzen nur lokalen Emulator.
4. Keine juristische Schlussfreigabe der Vertragsbedingungen RC1, AVV RC1 und Anlagen A–C.
5. Keine explizite Einzelfreigabe einer konkreten Testmail/Absenderkombination für einen realen C3.3-Test.

## Sicherheitsgrenze / nächste Freigabe

Die neue Komponente darf ausschliesslich mit synthetischen Offerten und Test-Archivdaten und nur gegen das separate Staging-Ledger ausgeführt werden. Keine Verbindung zu Make 8144117 (produktiv), 8162162 (altes B-Staging) oder 8166714 (C3.2, weiterhin inaktiv) herstellen. Keine Live-Cloud-Run-Routen und keine echten Kunden.

Zuerst Node-Tests lokal ausführen (erwartete Gesamtzahl 240 = 230 bisher + 10 neue Tests):

- git fetch origin
- git switch --track origin/feature/crm-v2-contract-c33-safety-preflight-20261025
- npm.cmd test --prefix .\crm-v2

Falls Tests fehlschlagen: keine Staging-Aktivierung; Fehler vor weiteren Schritten prüfen. Danach optional den bereits bekannten Firestore-Emulatortest wiederholen; niemals produktive Firestore-Daten verwenden. Erst nach verifizierten PASS-Ergebnissen kann ein weiteres separates TEST_ONLY-Transportgate entworfen und mit ausdrücklicher Freigabe einer konkreten Sender-/Empfänger-Kombination für einen realen Test vorbereitet werden.


### 25.10.2026 – C3.3 Betreiberabnahme: 240/240 Node-Tests PASS

- Betreiber hat auf dem Branch `feature/crm-v2-contract-c33-safety-preflight-20261025` erfolgreich `git fetch origin`, `git switch --track origin/feature/crm-v2-contract-c33-safety-preflight-20261025` und `npm.cmd test --prefix .\crm-v2` ausgeführt.
- **240/240 PASS**, **0 FAIL**, **0 SKIP**, **0 CANCELLED**; die zehn neuen C3.3-Sicherheitstests sind einzeln als PASS protokolliert: 2-/3-PDF-Pflichtfelder/AVV, abgewiesene unklare AVV-Einstufung, nicht autorisierter Testempfänger/Operator, veraltete Freigabe, manipulierte Archiv-PDFs, gleichzeitige und wiederholte Reservierungsversuche, Offerten-Revisionswechsel, widersprüchliche Ledger-Quittung, unvollständige Vertrauenskonfiguration und Isolierung der produktiven Routen. Testlauf ca. 1,18 Sekunden.
- Das Protokoll ist eine **lokale Node-/FakeDb-Regression des neu verketteten C3.3-Preflights**. Der zuvor bestätigte Firestore-Emulatorstand **7/7 PASS** bezieht sich auf C2/C3.2; die neue C3.3-End-to-End-Verkettung wurde bislang **nicht erneut im echten Firestore-Emulator** geprüft. Kein Gmail-Transport, keine echte SENT-Readback-Prüfung, keine Prüfung produktiver Firestore-IAM-Regeln und keine rechtliche RC1-/AVV-Endfreigabe.
- **Betriebsgrenze bleibt unverändert:** C3.3 antwortet nur mit `sendPermitted=false`, `transmitted=false`, `provider=NONE`, `messageId=null`. Kein C3.2-Make-Webhook, kein Gmail-Modul und kein produktiver Kundenversand auf Grund dieses Testlaufs aktiviert.
- **Nächster sicherer Schritt:** C3.3-Verkettung mit einem neuen lokalen Demo-Firestore-Emulatortest (Freigabe → PDF-Prüfungen → atomare Lock-Reservierung; parallel, AVV, Negative Cases) verifizieren. Erst danach gesondert und mit ausdrücklich freigegebener Sender-/Testempfängeradresse über eine isolierte TEST_ONLY-Gmail-Strecke entscheiden. Keine automatische Wiederholung nach unklarem Versand.


### 25.10.2026 – C3.3: zwei zusätzliche echte lokale Firestore-Emulator-Integrationen vorbereitet

- Auf gleichem Branch die bestehenden Emulator-Tests in `crm-v2/emulator-tests/contract-dispatch-firestore.test.js` um **2 reine Demo-Integrationsfälle** ergänzt: (1) vollständige C3.3-Operatorfreigabe → synthetische 3 PDFs → beschädigte AVV-Datei stoppt VOR jeder Ledger-Reservierung → anschliessend gültiger Preflight mit exakt 1 Attempt und 1 Lock ohne Versandberechtigung; (2) zwei unabhängige Firestore-Clients konkurrieren mit vollständigem C3.3-Preflight, genau eine Reservierung gewinnt, neue Offertenrevision bleibt gesperrt.
- Tests erzwingen wie zuvor **FIRESTORE_EMULATOR_HOST=127.0.0.1:8788** und `demo-lszha-c2-20261025`; keine Cloud-Fallbacks, keine Gmail/Make-Aufrufe. Gesamtzahl lokaler Emulatorfälle **9 erwartet, NICHT bislang ausgeführt**. Bestätigter älterer Emulatorstand bleibt **7/7 PASS**; bestätigter CRM-Node-Stand **240/240 PASS** (Node-Suite durch diese zwei separaten Emulatorfälle unverändert).
- Nächste Schritte auf dem bestehenden Tracking-Branch: `git pull --ff-only`; `npm.cmd test --prefix .\crm-v2`; `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\test-crm-contract-firestore-emulator.ps1"`. Ausgaben zuerst beurteilen; bei Fehlern keine Aktivierung/kein echter Versand.


### 25.10.2026 – C3.3 Emulator 8/9 PASS: Race im Test-Fixture korrigiert, erneuter Test offen

- Betreiber `git pull --ff-only`, `npm.cmd test --prefix .\crm-v2`: **240/240 Node-Tests PASS**, **0 FAIL**. Firestore-Demoemulator: **8/9 PASS**, **1 FAIL**; sieben bisherige Emulatorfälle und der neue konkurrierende Zwei-Client-Vollpreflight bestanden.
- Einzige Fehlstelle im neuen negativen AVV-Integrationsfall: `Vertragspaket ungueltig: PDF-SHA-256 stimmt nicht`. Dies ist die **gewünschte** Ablehnung einer beschädigten TEST_ONLY-AVV-PDF, aber das gemeinsame `fixture()` startet zusätzlich eine asynchrone `manifest: gate.approve(...)`-Promise. Diese war im neuen Test noch unaufgelöst, während derselbe Test die Archivbytes absichtlich manipulierte. Die unabhängige Promise konnte deshalb unkontrolliert mit derselben SHA-256-Meldung scheitern und den Test als FAIL melden. **Kein Hinweis auf eine defekte Firestore-Transaktion oder fehlende PDF-Integritätsprüfung.**
- Korrektur ausschliesslich in `crm-v2/emulator-tests/contract-dispatch-firestore.test.js`: in beiden neuen C3.3-Fällen (einschliesslich Revisions-Fixture) `await f.manifest` bzw. `await revised.manifest` **vor** PDF-Manipulation / weiterem parallelem Testablauf; damit wird der nebenläufige Fixture-Prozess deterministisch abgeschlossen. JavaScript-Syntax des geänderten Tests geprüft. **Neuer 9/9-Emulatortestlauf noch ausstehend, nicht als bestanden ausgeben.**
- Betreiberschritt auf aktuellem C3.3-Branch: `git pull --ff-only`, dann `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\test-crm-contract-firestore-emulator.ps1"`. Bei fehlerfreiem 9/9-Lauf ist C3.3-Emulatorabnahme möglich; bei weiterer Abweichung keine Wiederholung der produktiven Versandschritte und zunächst Testlog prüfen.
- Firebase-Demo-Emulator meldet bekannte Warnung, dass ohne Rules-Datei lokal Lese-/Schreibzugriffe freigegeben sind; das ist **keine** Bestätigung produktiver Firestore-IAM- oder Security-Rules. Der Emulator wurde nach dem Fehlversuch ordnungsgemäss heruntergefahren. Keine produktive E-Mail, kein Make-/Gmail-Aufruf und kein Deployment ausgeführt.


### 25.10.2026 – C3.3 lokale Emulatorabnahme: 9/9 PASS, Phase technisch abgeschlossen

- Betreiber hat auf Branch `feature/crm-v2-contract-c33-safety-preflight-20261025` den Patch `33d5218..c8a54ad` per `git pull --ff-only` übernommen. **Letzter CRM-Node-Testlauf: 240/240 PASS, 0 Fehler.**
- Erneuter tatsächlicher lokaler Firestore-Emulatortest über `scripts/test-crm-contract-firestore-emulator.ps1`: **9/9 PASS**, 0 Fehler/Skips, Exit-Code **0**, `CONTRACT FIRESTORE EMULATOR TEST PASS (demo only)`. Isoliertes Projekt `demo-lszha-c2-20261025`, Host `127.0.0.1:8788`. Emulator anschliessend kontrolliert heruntergefahren.
- Beide neuen C3.3-Full-Preflight-Fälle sind bestätigt: **(1)** manipulierte AVV-PDF mit SHA-256-Abweisung **vor jeder Firestore-Reservierung**, danach gültiges 3-PDF-Paket mit genau einem Attempt und einem permanenten Offerten-Lock; **(2)** konkurrierende vollständige Preflight-Requests über zwei unabhängige Firestore-Clients mit genau einem Gewinner und blockierter neuer Offertenrevision.
- **Status C3.3: STAGING-PREFLIGHT TECHNISCH ABGENOMMEN.** Das ist kein produktiver Versand-Go-live. Der Demo-Emulator verwendet mangels Rules-Datei lokal offene Zugriffe; die produktiven IAM-/Security-Regeln sind weiterhin nicht abgenommen. Keine echte Gmail-SENT-Readback-Bestätigung, kein Gmail-Testversand, keine RC1-/AVV-Endfreigabe. Die separate produktive Make-/CRM-Strecke und Kundenkommunikation bleiben unverändert.
- **Nächster Abschnitt C3.4:** isolierten TEST_ONLY-Gmail-Transport ausschliesslich als getrennten, zunächst gesperrten Entwurf vorbereiten. Keine Änderung an aktiver Make-8144117-Strecke oder C3.2-8166714. Vor erstem echten Testversand Freigabe der konkreten Sender-/Testempfänger-Kombination und Prüfung des unabhängigen Gmail-SENT-Readback zwingend; kein Auto-Retry bei unklarer Zustellung.
