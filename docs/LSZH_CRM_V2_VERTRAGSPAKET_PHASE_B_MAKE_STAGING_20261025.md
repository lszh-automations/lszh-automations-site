# LSZH CRM V2 – Phase B.3: getrenntes Make-STAGING (Webhook-Schema lernen)

**Stand:** 25.10.2026. **Betriebsgrenze:** Kein Kundenversand, keine produktiven CRM-Vertragsänderungen, keine Annahme. Nur technische Vorbereitungen.

## 1. Verifizierter Ausgangspunkt

- Betreiber hat im Branch `feature/crm-v2-contract-package-mail-staging-20261025` die Node-Suite erfolgreich ausgeführt: **181/181 PASS, 0 Fehler**; enthalten Phase-A-Vertragspaket, Phase-B.1-PDF-Vorschau und Phase-B.2-Make-Mock.
- Bereits aktives Make-Szenario `8144117` fuer manuellen produktiven Offerten-/Rechnungsversand bleibt unangetastet.

## 2. Neues separates Make-Szenario

- **Szenario-ID: `8162162`**, Name `LSZH CRM V2 – Vertragspaket 2-3 PDFs – STAGING (kein Versand)`.
- Team: `1728770` / Make Zone `eu1.make.com`; [Make-Szenario ansehen](https://eu1.make.com/1728770/scenarios/8162162).
- **Geprüfter Status:** `inactive`; nicht aktiviert, `0` gespeicherte unvollständige Ausführungen; **keine Gmail-App oder -Verbindung** im Szenario.
- Module: **1 `gateway:CustomWebHook`** (STAGING-Empfang, nur zum Lernen der JSON-Struktur); **2 `gateway:WebhookRespond`** (fester blockierender Status **HTTP 423**).
- Antwort Modul 2: `{ "ok": false, "error": "STAGING_CONTRACT_NOT_ENABLED", "transmitted": false, "provider": "NONE", "messageId": null }`. Auch eine spätere versehentliche Aktivierung würde mit dem aktuellen Aufbau **keine E-Mail senden**; nicht als produktiven Schutz gegen spätere unreviewte Konfigurationsänderungen missverstehen.
- `scenario_trigger_learn` wurde für dieses Szenario **gestartet und als `learning=true` verifiziert**. Der nächste synthetische HTTP-POST erfasst das Webhook-Datenschema, **ohne die Szenario-Module auszuführen**. Danach automatische Beendigung des Lernmodus und erneute Prüfung via `scenario_trigger_inspect`.
- **Webhook-URL wird weder in GitHub noch im Chat dokumentiert**. Sie ist wie ein Zugangstoken zu behandeln. Nicht in öffentliche Logs oder Screenshots kopieren; bei Offenlegung rotieren.

## 3. Synthetische, geheimnisfreie Lern-Payloads

- Neuer Node-Generator: `crm-v2/scripts/generate-contract-make-learn-sample.cjs`, CLI `no` oder `yes`. Generiert rein lokale TEST_ONLY-A4-PDFs über den vorhandenen Generator und verwendet die bestandenen `prepareOfferPackage`, `buildStagingContractPreview`, `buildMakeContractMockEnvelope`-Funktionen.
- `no`: genau 2 Test-PDFs `offer` und `terms`. `yes`: genau 3 Test-PDFs inkl. `avv`. Die erzeugten Test-PDFs sind *keine* finalen Vertragsunterlagen und haben keine echte rechtsverbindliche Wirkung.
- Der Testumschlag nutzt `kind=contract_package_staging_mock`, `sendMode=staging_mock_only`, `neverSend=true`, Testadresse `preview@example.invalid`, Test-Dateinamen, PDF-Bytes, SHA-256 und Paket-Event-ID.
- Neues Skript: `scripts/learn-crm-contract-make-staging.ps1`. Es generiert den JSON-Testkörper lokal, prüft vor der Anfrage das Test-Kennzeichen, erlaubt nur `https://hook.eu1.make.com/<token>`, fragt die Webhook-URL verdeckt über `Read-Host -AsSecureString` ab und sendet **genau einen** HTTP-POST zur Schema-Erkennung. Es gibt die Webhook-URL und die PDF-Inhalte nicht aus.
- Neue lokale Regressionen: `crm-v2/test/offer-contract-make-learn-sample.test.js` (**4 Tests**); zwei und drei Test-PDFs, falscher AVV-Parameter, statische Sicherheitsgrenzen für PowerShell. CI enthält Syntaxchecks der neuen JS-Dateien.
- **Echte Node-Ausführung dieses neuen Lern-Generators und seiner Regressionen noch nicht durch den Betreiber bestätigt.** Erwarte `185/185` (181 bestehend + 4 neu) bei bestandenem Lauf.

## 4. Betreiberprüfung (PowerShell)

Arbeitsverzeichnis: bisheriger Projektordner `lszh-automations-site`, Branch `feature/crm-v2-contract-package-mail-staging-20261025`.

```powershell
git pull --ff-only
npm.cmd test --prefix .\crm-v2
```

**Erst bei bestandenem Test** den Empfänger-Webhook aus dem oben verlinkten **inaktiven Make-STAGING-Szenario, Modul 1**, in die lokale verdeckte Eingabe einfügen. Keine URL in den Chat posten.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\learn-crm-contract-make-staging.ps1" -Avv no
```

Das Skript sendet **ausschliesslich an Make zur Webhook-Schema-Erkennung**. Falls es erfolgreich ist, Ausgabetext **ohne URL oder sonstige Tokens** hier teilen. Kein automatischer Retry und vorerst **kein** zweiter POST mit `-Avv yes`, weil Make den Lernmodus nach dem ersten Request beendet und inaktive Szenarien andernfalls Requests zwischenspeichern könnten.

## 5. Folgearbeiten nach nachgewiesenem Webhook-Schema

1. Empfangene Felder und verschachtelte Attachment-Struktur via `scenario_trigger_inspect` verifizieren; wenn Make Nested-Array-Items nicht sauber erkannt hat, sichere Mapping-Abstraktion in Staging ergänzen.
2. Den dauerhaft deaktivierten Webhook-Prozess um technische 2/3-PDF-Validierung und einen festen 423-Denial-Response erweitern. **Kein Gmail-Sende-Modul** ohne eigene strukturelle und Sicherheitsabnahme, falls später benötigt.
3. Separat echte 2/3-PDF-Binärmappings mit geblocktem Provider-Sendegate konfigurieren; nach ausdrücklicher Freigabe nur synthetische Testdaten und freigegebene Testpostfächer.
4. Vor echtem Vertragsversand: finale juristische Freigaben, geprüftes Geschäftsarchiv, reale Firestore-Idempotenz, Paketversions-Lock und rechtskonformes Annahme-/Auftragsbestätigungsverfahren.

**Status:** Phase A, Phase B.1 und Phase B.2 getestet; Phase B.3 Make-Szenario **inaktiv** und Webhook in **Lernmodus**; echtes Mehrfach-PDF-Gmail-Senden **nicht getestet und nicht aktiviert**.

## 6. 25.10.2026 – Make-Webhookschema erfolgreich gelernt; Iterator + Aggregator strukturell eingebaut

- **Betreiber-Nachweis:** `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\learn-crm-contract-make-staging.ps1" -Avv no` hat genau eine synthetische HTTP-POST-Anfrage gesendet, Ausgabe: `PDF attachments=2`, `Make STAGING webhook HTTP 200`, kein Versandnachweis.
- **Make-Inspektion:** Lernmodus automatisch **beendet** (`learning=false`), Delivery `0938b6d05d547c0f47c57ea8e5bfe47d` am `2026-10-25T00:29:56.709Z` mit Status `accepted`, Queue **0**. Empfangen: `kind=contract_package_staging_mock`, `sendMode=staging_mock_only`, `neverSend=true`, Test-Empfänger `preview@example.invalid`, `attachmentCount=2`. Zwei JSON-Array-Einträge (`offer` und `terms`), je mit `kind`, `filename`, `mimeType`, `contentBase64`, `sha256`, `bytes`; beide Test-PDFs jeweils 3'717 Bytes, Base64 je 4'956 Zeichen. URL und PDF-Binärdaten nicht in GitHub dokumentiert.
- **Szenario 8162162 weiterhin inaktiv** (`status=inactive`, `incompleteExecutions=0`, keine Gmail-App-/Provider-Verbindungen); durch Make-Verbindung bestätigt. Nach dem Schema-Lernen sind zwei reine Datenverarbeitungs-Module hinzugekommen, Make hat die Konfiguration angenommen: Modul **3** `builtin:BasicFeeder` (Iterator) mit `mapper.array={{1.attachments}}`; Modul **4** `builtin:BasicAggregator` mit `parameters.feeder=3` und Mappings `kind`, `bytes`, `sha256`, `filename`, `mimeType`, `contentBase64` von Modul 3. Reihenfolge: `1 Webhook → 3 Iterator → 4 Aggregator → 2 WebhookRespond`.
- **Sperre unverändert:** Modul 2 antwortet mit HTTP **423**, JSON `ok=false`, `STAGING_CONTRACT_NOT_ENABLED`, `transmitted=false`, `provider=NONE`, `messageId=null`. Diese Module führen **keine** externe E-Mail, Cloud-Run- oder Firestore-Aktion aus.
- **Wichtige Abgrenzung:** Die dynamischen Feldmappings sind in Make **gespeichert und read-only nachgeprüft**, aber **noch nicht tatsächlich ausgeführt**; weder Aggregator-Ausgabe noch 3-PDF-Lauf ist aktuell end-to-end getestet. Kein echtes `Gmail SENT` / kein Empfängerbestätigungstest.
- **Nächster Testpunkt:** Nach ausdrücklicher technischer Freigabe kann ein isolierter Make-Lauf mit ausschliesslich synthetischen Daten bei gesperrtem HTTP-423-Ausgang folgen; Make-Szenario vorerst nicht aktivieren. Node-Tests nach den neu hinzugefügten 4 Lern-Tests sollten `185/185` ergeben, Betreiberabnahme noch nicht als bestätigt dokumentieren.
