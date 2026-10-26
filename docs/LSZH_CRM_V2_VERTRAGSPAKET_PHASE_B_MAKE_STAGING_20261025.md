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


## 7. 25.10.2026 – Kontrollierter Make-Lauf vorbereitet; nur Staging aktiviert

- Betreiber meldete die Node-Suite im aktuellen Branch **185/185 PASS**, 0 Fail, 0 Skip. Damit sind die 4 Tests zum synthetischen Webhook-Lern-Generator tatsächlich bestanden.
- Neuer PowerShell-Runner `scripts/smoke-crm-contract-make-staging.ps1`: nimmt ausschliesslich `-Avv no` oder `-Avv yes`, erzeugt die bereits getesteten synthetischen 2/3-PDF-Make-Payloads, kontrolliert `TEST_ONLY`-Kennzeichnungen, AVV-Anzahl/Reihenfolge, festes `preview@example.invalid`, verdeckte Webhook-URL und wertet **nur** HTTP **423** mit exaktem JSON-Denial als gewünschtes Staging-Ergebnis. **HTTP 200 Accepted gilt als NICHT BESTANDEN**, denn inaktive Webhooks können Requests nur speichern. Keine automatische Wiederholung, keine echten Mail-/CRM-Operationen.
- Sicherheitsregression für den neuen Runner zu `crm-v2/test/offer-contract-make-learn-sample.test.js` hinzugefügt. Insgesamt **186 Tests erwartet, neuer Node-Test noch nicht vom Betreiber ausgeführt**. PDF-Gesamtarchitektur unverändert.
- Vor der Aktivierung wurde Szenario **8162162** nochmals read-only geprüft: 4 Module ausschliesslich `CustomWebHook → BasicFeeder → BasicAggregator → WebhookRespond`, **0 Gmail-Verbindungen**, Status `inactive`, feste Antwort HTTP 423 `STAGING_CONTRACT_NOT_ENABLED`, `transmitted=false`, `messageId=null`, 0 offene Ausführungen. Danach wurde **ausschliesslich dieses separate Staging-Szenario aktiviert**; erneute Make-Inspektion bestätigte `status=active`, `queued=0`, `learning=false`, 0 Verbindungen. **Produktives Szenario 8144117 nicht angetastet.**
- Betreiber kann jetzt **genau einen** kontrollierten Smoke-Request ausführen und die **geheim gehaltene Webhook-URL** lokal eingeben:

```powershell
git pull --ff-only
npm.cmd test --prefix .\crm-v2
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\smoke-crm-contract-make-staging.ps1" -Avv no
```

- Der Runner gibt einen expliziten 423-Block als Bestätigung zurück; **dies beweist nicht selbst, ob Feeder und Aggregator erwartungsgemäss liefen**. Danach Make-Run via `scenario_execution_list`, `scenario_execution_inspect` sowie Moduldaten/Counts prüfen: Iterator 2 Operationen, Aggregator 1, WebhookRespond 1, keine Fehler. Kein echtes Gmail-SENT.
- Bei erfolgreichem ersten Durchgang optional AVV-3-PDF-Variante ausführen (gleicher Befehl `-Avv yes`) und Make-Aggregator erneut prüfen. Danach Staging-Szenario **wieder deaktivieren**, damit es nicht unbegrenzt aktiv bleibt. Nicht automatisch mit echten Kundenunterlagen fortfahren.

**Aktueller Betriebsstatus beim Schreiben:** Szenario 8162162 ist **aktiv** ausschliesslich für den gesperrten Staging-Smoke-Test. Es besitzt weiterhin **keine** Gmail-Verbindung und keinen produktiven CRM-Schreibpfad; keine neuen externen Nachrichten wurden in diesem Schritt verschickt.


## 8. 25.10.2026 – Live-2-PDF-Smoke: Make PASS, PowerShell-423-Body-Parser korrigiert

- **Benutzer bestätigt:** `npm.cmd test --prefix .\crm-v2` **186/186 PASS**, 0 Fehler; danach `scripts/smoke-crm-contract-make-staging.ps1 -Avv no` mit verborgen eingegebener Make-STAGING-Hook-URL, zwei synthetische Anhänge. Skript erhielt einen HTTP **423**-Status, brach jedoch mit `HTTP 423 deny response did not match expected safe contract.` ab. **Dieser erste Betreiber-Lauf ist auf Clientseite formal NICHT bestanden.**
- **Make-Connector-Beweislage:** Szenario **8162162** hatte einen echten automatischen Run `aa164ae101334e4ab8588f96f588fe19` am `2026-10-25T08:10:16.177Z`, Status **success**, 4 Operationen, 0 Modulfehler; alle 4 Module (Webhook 1, Feeder 3, Aggregator 4, WebhookRespond 2) liefen. Feeder 3 lieferte **zwei** Output-Bundles (`offer`, `terms`, je 3'717 Bytes, beide PDF-Hexe SHA-256). Aggregator 4 bekam beide Bundles und lieferte ein `array`-Objekt ohne Fehler; dessen vollständige Ausgabe wurde durch Make bei der Toolabfrage **abgeschnitten** (kein Byte-für-Byte-Output-Nachweis). WebhookRespond 2 wurde mit `status:423` und exaktem Body-Template `{ok:false,error:STAGING_CONTRACT_NOT_ENABLED,transmitted:false,provider:NONE,messageId:null}` aufgerufen.
- **Befund:** Keine Gmail-/Kundenmail-Aktion, der tatsächliche Make-Verarbeitungsweg für 2 PDFs ist erfolgreich. Die lokale Powershell 5.1 `Invoke-WebRequest`-Ausnahmebehandlung konnte bei HTTP 423 die Fehlerantwort leer oder verändert lesen; genaue lokal empfangene Antwortbytes waren im geteilten Log **nicht vorhanden**. Daher wahrscheinlicher Clientparser-Bug, nicht nachweislich Make-Fehler.
- **Fix in GitHub:** `scripts/smoke-crm-contract-make-staging.ps1` verwendet jetzt `.NET System.Net.Http.HttpClient` mit `AllowAutoRedirect=false` und `ReadAsStringAsync()`; HTTP-423-Antworten verursachen dort keinen WebException-Datenverlust. Neuer `-SelfTest` prüft offline, dass eine valide 423-Antwort akzeptiert und 5 falsche Antworten abgewiesen werden; null Netzwerk/Hook-/Make-Anrufe. Ein zusätzlicher Node-Test prüft auf Windows PowerShell die tatsächliche lokale `-SelfTest`-Ausführung. **187/187** erwartet, noch **nicht** vom Betreiber ausgeführt.
- **Nächster sicherer Betreiberablauf:** `git pull --ff-only`; `npm.cmd test --prefix .\crm-v2` (**187** erwartet); optional explizit `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\smoke-crm-contract-make-staging.ps1" -SelfTest` (ohne Hook-Eingabe). Danach kann kontrolliert **ein einziges** synthetisches AVV-3-PDF-Paket `-Avv yes` gegen das weiterhin nur blockierende STAGING-Szenario getestet werden. Im Fehlerfall **nicht** automatisch wiederholen, zuerst Make-Execution prüfen.
- **Betrieb:** Szenario 8162162 zum Zeitpunkt des Fixes weiterhin **active**, aber **keine Gmail-Verbindung**; Produktivszenario 8144117, produktives CRM/Cloud Run, Firestore, Send-/Zahlungs-/Annahmeprozesse unverändert. Nach dem 3-PDF-Smoke das Staging-Szenario **deaktivieren**.


### 25.10.2026 – 187/187 PASS; 3-PDF-AVV-Make-Staging E2E mit hartem Mail-Stopp bestanden und deaktiviert

- Betreiber bestätigte im Branch `feature/crm-v2-contract-package-mail-staging-20261025` vollständige Node-Tests: **187 Tests PASS**, 0 FAIL/Skip. Zusätzlicher Windows PowerShell 5.1 Offline-Selbsttest `-SelfTest` **PASS** (1 gültige, 5 ungültige HTTP-423-Antworten, **0 HTTP-Anfragen**).
- Kontrollierter synthetischer Smoke `scripts/smoke-crm-contract-make-staging.ps1 -Avv yes` meldete `attachments=3`, `Make STAGING deny response VERIFIED: HTTP 423 | transmitted=false | messageId=null`. Als Empfänger war ausschliesslich `preview@example.invalid` vorgesehen. Keine reale E-Mail und kein CRM-Schreibvorgang.
- Make-Szenario **8162162**, Run **`8ec49aa96eeb48458b6e5c04b283af4e`** vom `2026-10-25T08:18:46.011Z`, `status=success`, **4 Moduloperationen**, **0 Fehler**: Webhook(1) → Feeder(3) → Aggregator(4) → gesperrter WebhookRespond(2).
- Iterator-Output hat nachweislich **3 Einzelbundles** emittiert: `offer` = `TEST_ONLY_offer.pdf`, **3717 Bytes**; `terms` = `TEST_ONLY_terms.pdf`, **3717 Bytes**; `avv` = `TEST_ONLY_avv.pdf`, **3713 Bytes**. Zu jedem Bundle sind `contentBase64` und SHA-256 präsent. Aggregator-Input enthält alle drei Elemente und meldete erfolgreiche Ausgabe; der komplette Output ist in Make-Inspektion aus Längengründen gekürzt, daher **keine Behauptung einer unabhängigen Vollbyte-Verifikation des Aggregator-Ausgangs**.
- Response-Modul erhielt festes HTTP **423** JSON `ok:false`, `error:STAGING_CONTRACT_NOT_ENABLED`, `transmitted:false`, `provider:NONE`, `messageId:null`. Der lokale HTTP-Client bestätigte die tatsächlich erhaltene Sperrantwort. Das ist **kein** Gmail-Receipt und **kein** echter Vertragsversand.
- **Nach dem PASS das separate Make-Szenario 8162162 über die Make-Verbindung deaktiviert** und ein zweites Mal geprüft: `status=inactive`, `queued=0`, `learning=false`, `connections=0`. Das produktive Make-Szenario **8144117**, CRM Cloud Run, Firestore und externe Kundennachrichten blieben unverändert.
- **Nächste Phase C (noch nicht umgesetzt/freigegeben):** isolierter transportseitiger Entwurf für tatsächlich mehrere PDF-Anhänge mit harter Testempfänger-Allowlist, manuellem explizitem Versandgate, Archivversion/Byte-SHA-256, sicherer dauerhafter Firestore-Idempotenz und Gmail-Receipt-Reconciliation; bestehende aktive Einzel-PDF-Make-Strecke nicht überschreiben. Rechtliche Endabnahme der Projektbedingungen/AVV RC1 und kundenbezogene AVV-Anlagen vor externem Versand erforderlich.
