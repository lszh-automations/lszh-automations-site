# LSZH CRM V2 – Phase B.2: Make-kompatibles Mehrfach-PDF-Paket im isolierten Mock

**25.10.2026 · Status:** Domain-Adapter + Node-Tests auf `feature/crm-v2-contract-package-mail-staging-20261025` erstellt. **Keine** neue Make-Scenario-Aktivierung, **kein** Webhook-/Gmail-Aufruf, **keine** Live-CRM-Anbindung, **keine** rechtliche Freigabe.

## Phase B.1 bestätigt

- Der Nutzer hat die Phase-B.1-Regressionen tatsächlich lokal unter Windows PowerShell getestet: **171/171 Node-Tests PASS, 0 Fehler**.
- Ein PDF-Paket kann als interne TEST_ONLY-Mailvorschau mit 2 oder 3 Anhang-PDFs und nachgewiesenen SHA-256-Bytes zusammengestellt werden; bisher absichtlich ohne echte Zustellung.

## Neuer Phase-B.2-Adapter

- Neue Datei `crm-v2/offer-contract-package-make-mock.js`: erstellt ein **Make-kompatibles Testprotokoll** aus der vorhandenen `buildStagingContractPreview`-Ausgabe, mit expliziter Attachment-Liste `attachments[{kind,filename,mimeType,contentBase64,sha256,bytes}]`.
- Feste Ausgabewerte: `kind=contract_package_staging_mock`, `sendMode=staging_mock_only`, `neverSend=true`, `to=preview@example.invalid`, paketgebundene `eventId` und `packageSha256`. Dieser neue `kind`-Wert ist **nicht** `offer_send` und entspricht nicht dem Filter des aktiven Make-Szenarios 8144117.
- `inspectMakeContractMockEnvelope(message)` prüft sowohl das Metadaten-Schema als auch jede Base64-PDF selbst gegen `%PDF-`, SHA-256 und die Dokumentgrössen; genau 2 (`offer`,`terms`) oder 3 (`offer`,`terms`,`avv`) Anlagen. Kein Kunde, keine echten Vertrags-PDFs, keine beliebigen Zieladressen.
- `verifyMockMakeReceipt(envelope,receipt)` akzeptiert nur `simulated=true`, `transmitted=false`, `provider=NONE`, `messageId=null`, exakt gleiche Paketkennung, Paket-Hash, Event-ID und Anhangzahl. **Kein** vorgetäuschter Gmail-Receipt, kein `Versendet`, keine echte Auftragsannahme.
- `createMockMakeContractClient(mockGateway)` nimmt einen **explizit injizierten Test-Callback**, hat bewusst keinen Netzwerktransport oder Hook und reserviert eine Event-ID vor dem Callback im lokalen Set. Doppelte oder unklare simulierte Versuche werden nicht automatisch wiederholt. Dieses Set gilt nur für **einen Prozess**, ist keine Firestore-Deduplikation zwischen Instanzen oder nach Neustart.

## Testumfang

- Neue Datei `crm-v2/test/offer-contract-package-make-mock.test.js` (**10 weitere Node-Testfälle**): 2-/3-PDF-Envelope aus echten synthetischen LSZH-PDF-Bytes; Gmail-freie Mock-Quittung; Event-Deduplikation; verlorene Gateway-Antwort; falsche Receipt-Werte; Live-/falsche Empfängerdaten; manipulierte Base64-Anhänge oder Hashes; manipulierte Mail; Guard auf fehlenden Transport und fehlende Produktivimportierung.
- Die beiden neuen JS-Dateien haben eine isolierte V8-Syntaxprüfung bestanden. Der CI-Workflow ist für Branch und zwei neue `node --check`-Prüfungen bereits aufgesetzt.
- **Echte Node-Gesamtsuite noch nicht ausgeführt/bestätigt.** Nach 171 bisher bestandenen Tests erwarten wir nun **181**.

```powershell
git pull --ff-only
npm.cmd test --prefix .\crm-v2
```

## Nächster echter Integrationsschritt (nach bestandenen Tests)

1. Neues **gesondertes Make-STAGING-Szenario** (eines für diese Integration, nicht im vorhandenen aktiven Make-Pfad), zunächst **inaktiv** und mit harter SEND-SPERRE, aufsetzen. Dafür das Feldschema des synthetischen Webhook-Pakets im isolierten Test prüfen.
2. Zwei oder drei PDF-Anhänge in Gmail **strukturell** konfigurieren, jedoch den SEND-Block bis zur ausdrücklichen Betreiberfreigabe nicht öffnen. Bestehendes Szenario 8144117 und bestehende CRM-Mail-/QR-Rechnung unverändert.
3. Staging-E2E über eine explizit genehmigte synthetische Adresse prüfen, inklusive des Provider-Receipt-/Reconciliation-Protokolls. Aus einem Mock-Resultat kann nie eine produktive CRM-Versandbestätigung abgeleitet werden.
4. Erst später, nach rechtlicher Dokumentfreigabe, tatsächlichen Archivbytes aus eingeschränktem Geschäftskonto und überprüfter Firestore-Idempotenz, den manuellen CRM-Vertragsversand freigeben.

**Nicht erledigt:** echtes 2/3-PDF-Gmail-Senden, Make-Szenario-Deployment oder aktive Gmail-Verbindungsprüfung für den neuen Pfad. Bestehendes Produktivsystem ist weiterhin unverändert.