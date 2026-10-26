# LSZH CRM V2 – Vertragspaket Phase B: isolierte 2/3-PDF-Vorschau

**Datum:** 25.10.2026 · **Status:** Code + 10 neue Testfälle im isolierten Branch, echte Node-Gesamtsuite noch nicht vom Betreiber bestätigt. **KEIN Mailversand und KEIN Produktiv-Deployment.**

## Auslöser und Abnahme Phase A

Der Betreiber hat unter Branch `feature/crm-v2-offer-contract-package-staging-20261025` **161/161 CRM-Tests bestanden, 0 Fehler**, darunter die 13 neuen Testfälle der Paket-/AVV-/Statuslogik. Dieser Nachweis rechtfertigt die Weiterentwicklung, nicht die produktive Aktivierung des Vertragsversands.

## Funktion

Neues Modul `crm-v2/offer-contract-package-preview.js` (Phase B) baut ausschliesslich aus einem gültigen, *prepared* Phase-A-Paket und aus verifizierten **TEST_ONLY**-Buffer-Inhalten eine interne Offertenmail-Vorschau:

- `buildStagingContractPreview(pkg, readArchivedPdf, {label})` prüft die Paket-ID, Revisions-/Snapshot-Metadaten, zwei Dokumente (`offer`, `terms`) oder bei AVV `yes` genau drei (`offer`, `terms`, `avv`), Archiv-IDs mit `test_`, PDF-Dateinamen mit `TEST_ONLY_`, Dokumentversion mit `TEST_ONLY`, Bytes `%PDF-`, Dateigrösse und SHA-256, und erstellt eine markierte HTML-Mail sowie ein Attachment-Array.
- Die erzeugte Vorschau ist stets `kind=contract_package_preview_only`, `sendMode=staging_mock_only`, `neverSend=true`, `simulated=true` und Empfänger **`preview@example.invalid`**. Der Betreff beginnt `[TEST_ONLY – KEIN VERSAND]`. Keine echte Kundenadresse kann als Empfänger übergeben werden.
- `simulateStagingDelivery(preview)` prüft Metadaten, Binärinhalt und kanonisches Base64 nochmals und liefert ausschliesslich `status=mock_preview_validated`, `transmitted=false`, `provider=NONE`, `messageId=null`. **Kein Gmail-Receipt und kein CRM-Status `Versendet` werden behauptet.**
- Keine `fetch`, Webhooks, Gmail, Make, Cloud Run, Google Drive, Firestore, Datenbankänderung, Speicherung, UI-Route oder externes Senden. Die PDF-Quelle wird nur als explizit injizierter Test-Callback verwendet.
- Grössenlimits: jedes PDF max. 5 MB, Gesamtdokumente max. 8 MB, plus bereits bestehende Phase-A-Dokumentvalidierung. Keine unbekannten Mailoptionen, fremden Paketzustände oder rechtlich unfreigegebenen Fassungen.
- `crm-v2/offer-contract-package.js` sowie `crm-v2/server.js`, `offer-send.js`, `cloud-records.js` und das aktive Make-Szenario **8144117** bleiben unverändert. Der produktive Einzel-PDF-Workflow bleibt vollständig erhalten.

## Tests

Neue Tests `crm-v2/test/offer-contract-package-preview.test.js` (10): echte lokal generierte synthetische LSZH-A4-PDFs; zweifacher Standardpaketpfad; dreifacher AVV-Pfad; Paketsnapshot-/Statusmanipulation; veränderte, falsche oder fehlende Archivbytes; TEST_ONLY-Sperren; sichere unzustellbare Empfängeradresse; manipuliertes Mockpayload inkl. andere Empfänger/production-Kind, beschädigte Base64-Daten und Hashes; kombiniertes Grössenlimit; Import-/Netzwerk-Guard.

GitHub-Workflow `.github/workflows/crm-v2-search-ci.yml` prüft auf diesem Branch die Node-Gesamtsuite und Syntax der beiden neuen Dateien. **Bisher kein bestätigter CI-/Node-Testlauf für Phase B.** Erwartete Zahl bei unverändertem Basissatz: 161+10 = **171 Tests**.

```powershell
git fetch origin
git switch --track origin/feature/crm-v2-contract-package-mail-staging-20261025
npm.cmd test --prefix .\crm-v2
```

## Wichtige Schnittstellengrenze und Phase B.2

Die Vorschau ist **keine** echte E-Mail-Zustellung, und ein 2-/3-PDF-Anhang im aktuellen produktiven Make-Szenario ist **noch nicht** implementiert. Vor jeder echten Versandprobe muss eine voneinander isolierte, eigens freigegebene Test-Transportstrecke entwickelt werden. Diese muss den bestehenden Gmail-Receipt-/Keine-Doppelversand-Schutz erhalten, die archivierten Dokumente über ein eingeschränktes Geschäftsdienstkonto lesen und einen ausdrücklichen Testempfänger/Betreiberfreigabeprozess verwenden.

Später folgen Original-/Sichtprüfung der Projektbedingungen RC1 und AVV RC1 einschliesslich Anlagen A–C, signierte/freigegebene Dokumentversionen, kundenbezogene Einstufung sowie technische und rechtliche Abnahme. Die Geschäftsparameter D1–D3 bleiben unverändert festgelegt; keine automatische Rechtsfreigabe, Kundenannahme oder `Gewonnen`-Buchung.

**Keine produktive E-Mail, keine Vertragsannahme, kein Make-Szenario aktiviert oder verändert.**