# LSZH CRM V2 – Phase C3.4: isolierte Gmail-SENT-Readback-Integration

**Stand: 25.10.2026 – Code und Testfälle vorbereitet; kein Gmail-Versand und kein Go-Live.**

## Grundlage

- C3.3 vom Betreiber bestätigt: **240/240 Node** und **9/9 lokale Firestore-Emulatorfälle PASS**, nur Demo `demo-lszha-c2-20261025` auf `127.0.0.1:8788`.
- Make **8166714** separat kontrolliert: **inaktiv**, **0 Gmail-Verbindungen**, ausschließlich Webhook → Feeder → Aggregator → HTTP-423-Responder.
- Produktive Make-8144117-Strecke und Live-CRM dürfen nicht verändert werden. Rechtliche Schlussabnahme RC1/AVV/Anlagen A–C und Freigabe einer konkreten Testsender-/Testempfängerkombination fehlen.

## C3.4 – neue technische Bausteine

**Datei:** `crm-v2/contract-gmail-c34-readback-staging.js`.

1. **`createC34GmailReadOnlyVerifier`** integriert den vorhandenen Gmail-API-Read-only-Normalisierer und Gmail-SENT-Evidence-Verifier. Es werden ausschließlich von einem **vertrauenswürdigen Backend bereitgestellte** `getMessage(messageId)`- und `getAttachment(messageId, attachmentId)`-Funktionen akzeptiert. Das Modul konfiguriert **keine Gmail-Verbindung**, speichert **keine Tokens** und enthält **keine Sende-API**.
2. Sender und Empfänger müssen in eindeutigen, vollständig ausgeschriebenen Allowlisten stehen; Wildcards, ungültige Adressen, `.invalid` und nicht genehmigte Ziele werden verweigert. Der Prüfer verwirft selbstberichtete Make-Erfolge ohne unabhängigen Gmail-`SENT`-Nachweis.
3. Geprüft werden exakt: Gmail-Message-ID, `SENT`-Label, Sender, genau ein Empfänger, **keine CC/BCC**, Betreffbeginn `[TEST_ONLY]`, `X-LSZH-Contract-Event`, `X-LSZH-Package-SHA256` sowie 2/3 unveränderte Original-PDFs samt Dateinamen, MIME-Typ, Reihenfolge, Byte-Größen und SHA-256.
4. **`createC34DemoGmailReadbackLedger`** integriert den Prüfer mit dem bestehenden transaktionalen C3-Ledger. Diese Verbindung akzeptiert **nur** `FIRESTORE_EMULATOR_HOST=127.0.0.1:8788`, Demo-Projekt `demo-lszha-c2-20261025` und passende Cloud-Projektvariablen. Keine Verbindung zu echtem Cloud Firestore. Die API stellt nur `inspect` und `reconcile` bereit, **keine `send`- oder `reserve`-Methode**.
5. Die Reservierung wird weiterhin separat durch den **C3.3-Operator-Preflight** nach allen Freigaben, Pflichtdokument- und PDF-Prüfungen vorgenommen. Erst ein späterer rein lesender Gmail-Nachweis kann im **Demo-Ledger** den Status `confirmed_test_only` bestätigen; unklare Ergebnisse dürfen niemals einen neuen automatischen Versand auslösen.
6. `reconcile` prüft zuerst, ob ein ungelöster reservierter Testvorgang existiert, und nutzt danach ausschließlich den Gmail-Readback-Verifier innerhalb von `ledger.confirmVerifiedReceipt`. Das Ziel ist ein lokaler Mock-Integrationsnachweis, **keine tatsächlich zugestellte Nachricht**.

## Automatisierte Testfälle – noch nicht vom Betreiber ausgeführt

- Neue Datei `crm-v2/test/contract-gmail-c34-readback.test.js`: **9 neue Node-Fälle**, darunter 2/3 PDF, inline/externe Gmail-Anhänge, manipuliertes AVV, falsche Message-/Paketdaten, Sender/Empfänger/CC/BCC, kein SENT, Header/MIME-Fehler, Timeout, ungültige Allowlisten und kein Produktivimport. **249/249 Node-Tests erwartet** (240 bisher bestätigt + 9 neu).
- Erweiterte Datei `crm-v2/emulator-tests/contract-dispatch-firestore.test.js`: **2 neue Demo-Integrationstests** mit echter lokaler Firestore-Transaktion, C3.3-Vorabprüfung und simuliertem, unabhängig gelesenen Gmail-SENT-Record. Einer kontrolliert beschädigtes AVV vor gültigem Readback und Einmalbestätigung, der andere fehlendes SENT/falschen Empfänger ohne Bestätigung. **11/11 Emulatorfälle erwartet** (9 zuvor bestätigt + 2 neu).
- CI-Workflow für neuen Branch und neue JavaScript-Dateien ergänzt; **noch kein PASS für diese neuen Fälle behauptet**.

## Betreiberablauf (Windows Surface – ausschliesslich ungefährliche lokale Tests)

Auf dem bisherigen C3.3-Branch:

```powershell
git fetch origin
git switch --track origin/feature/crm-v2-contract-c34-gmail-readback-staging-20261025
npm.cmd test --prefix .\crm-v2
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\test-crm-contract-firestore-emulator.ps1"
```

**Wenn ein Test fehlschlägt, nicht deployen, keinen Sendebetrieb aktivieren.** Der Firestore-Emulator läuft ausschließlich unter Demo-Projekt und wird vom Skript beendet. Die lokal offene Emulator-Rules-Konfiguration bestätigt keine produktive IAM-/Security-Rules-Sicherheit.

## Was für einen echten Gmail-TEST_ONLY-Send weiterhin fehlt

1. Konkret identifizierter und nochmals ausdrücklich freigegebener Gmail-Absender und Testempfänger.
2. Backend-seitig authentifizierter Gmail-Read-only-Adapter mit tatsächlich überprüftem Berechtigungsumfang und exakten Gmail-Message-/Attachment-Antworten.
3. Separater, initial gesperrter, einmaliger Gmail-Transport nach dauerhaftem Firestore-Lock – **nicht** durch C3.2-Make-WebHook oder bisherigen produktiven Mailflow.
4. Nachweis eines echten Gmail-`SENT`-Postfach-Readbacks inklusive realer PDF-Bytes, Hash, Event und Empfänger. Unklare Zustellung = manuelle Prüfung, nie automatische Wiederholung.
5. Juristische Schlussprüfung RC1/AVV/Anlagen und separate ausdrückliche produktive Go-Live-Entscheidung.

**Kein Versand in dieser Phase erfolgt; keine echte Gmail-Verbindung erstellt oder aktiviert.**
