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
