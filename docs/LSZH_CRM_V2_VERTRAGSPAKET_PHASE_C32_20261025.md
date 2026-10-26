# LSZH CRM V2 – Phase C.3.2 Make-Transport-Staging und Gmail-SENT-Readback (GESPERRT / NO SEND)

**Datum:** 25.10.2026. **Branch:** `feature/crm-v2-contract-gmail-transport-staging-20261025`. **Status:** sicherer Code und separates Make-Blueprint vorbereitet, alle Sendefunktionen deaktiviert. Kein Kundensend, keine Produktiv-Deployment-Freigabe.

## Ausgangslage

- Betreiberbestätigt: **215/215** reguläre CRM-Testfälle und **7/7** lokale Firestore-Emulator-Integrationstests Phase C.3.1 PASS, 0 Fail/Skip. Emulator nach Test heruntergefahren.
- C.3.1 hat TEST_ONLY 2/3-PDF Gmail-Draft-*Payload* (keine reale Gmail-Draft), signierte Paketfreigabe mit Archivbyte-SHA-256 und einen injizierbaren unabhängigen Gmail-SENT-Verifier ohne Netzwerk.
- Produktiver Make-Gmail-Sender **8144117** ist weiterhin aktiv **und wurde nicht verändert**. Vorheriges Make-PDF-STAGING **8162162** bleibt inaktiv.

## Neu: dediziertes Make-Szenario 8166714 – INAKTIV

- Name: **LSZH CRM V2 – C3.2 Vertrags-PDF Gmail GATE – INAKTIV / KEIN VERSAND**.
- Make-Editor: https://eu1.make.com/1728770/scenarios/8166714
- Getrenntes eigenes Webhook (ID 3972953), **Webhook-URL ist ein Geheimnis und darf nicht in GitHub/Chats erscheinen**.
- Struktur überprüft über Make: `gateway:CustomWebHook` (1) → `builtin:BasicFeeder` (3) mit `{{1.attachments}}` → `builtin:BasicAggregator` (4) (Feeder 3) → `gateway:WebhookRespond` (2).
- Der Aggregator bildet je PDF die Dateieigenschaften und `data: {{toBinary(3.contentBase64; "base64")}}` als Make-Binärdaten ab. So entsteht voraussichtlich ein einziges Array aus zwei oder drei Anhängen. **Make-Runtime dieser C3.2-Binärumwandlung NOCH NICHT verifiziert: Webhook-Payload-Schema muss erst angelernt und mit echten synthetischen Daten getestet werden.**
- Letzter Schritt ist **unbedingt** und ohne Bedingungen der Sperr-Responder: **HTTP 423** mit `{ok:false,error:"STAGING_C3_2_SEND_NOT_AUTHORISED",transmitted:false,provider:"NONE",messageId:null}`. **Keine Gmail-Verbindung, keine Gmail-`sendAnEmail`-Aktion**, kein CRM/Firestore-Zugriff, Szenario bleibt **inactive**.
- `200 Accepted` von inaktivem Webhook bedeutet allenfalls *Schema-Lernen/Queue-Eingang*, **kein** Make-Modul- oder Gmail-Erfolgsnachweis.

## Neue reine Softwaremodule

- `crm-v2/contract-gmail-make-transport-staging.js`: erstellt aus dem geprüften C.3.1-Preview-Draft und dem vom Server HMAC-versiegelten Manifest ein neues **blocked_preview_only** Make-Envelope mit exakt 2 oder 3 `TEST_ONLY_*.pdf`. Kontrolle auf Paket-ID, Event, Empfänger, Freigabe-ID/-Zeit, Signatur, Header, SHA-256, Base64-Kanonizität und Original-PDF-Bytes. Keine echten Kundenadressen, keine Sendefunktion.
- `simulateMakeBinaryAttachmentsWithoutSend(envelope,manifest)` simuliert lokal die Binär-Konvertierung und EINMALIGE Array-Aggregation; **es ist kein Beweis dafür, dass der Make-Mapper live bereits arbeitet**.
- `crm-v2/contract-gmail-api-readonly-staging.js`: normalisiert ausschliesslich gelesene Gmail-API `messages.get(format=full)`-/`messages.attachments.get`-Rohstrukturen über injizierte **read-only**-Funktionen. Prüft Message-ID, Gmail-Label `SENT`, eindeutige Header, Einzelempfänger, keine CC/BCC, 2/3 MIME-PDFs, Base64url-Daten, Original-Bytes und Obergrenzen. Wird mit `createGmailSentEvidenceVerifier` aus C.3.1 verkettet. **Die tatsächliche GMail-Read-Only-Verbindung ist noch nicht integriert oder getestet.**
- `crm-v2/scripts/generate-contract-c3-2-blocked-make-sample.cjs`: erzeugt vollständig synthetisches 2-PDF- oder AVV-3-PDF-Paket für das C3.2-Webhook. Der enthaltene TEST_ONLY-Schlüssel ist öffentlich und niemals produktiv zu verwenden. Druckt ausschliesslich synthetisches JSON, unternimmt keinen Netzwerkversand.
- `scripts/test-crm-contract-c3-2-make-blocked.ps1`: fragt neuen 8166714-Webhook **verdeckt** ab, kontrolliert alle synthetischen Kennzeichnungen vor POST; `-Mode Learn` verlangt HTTP 200 und bezeichnet es ausdrücklich NICHT als Laufbestätigung. `-Mode Smoke` verlangt HTTP 423 + exaktes JSON `transmitted=false`, `messageId=null`; in Fehlerfällen keine automatischen Retries. **Nicht gegen produktive Webhooks verwenden.**

## Tests/CI

- **9 neue** reguläre Tests `crm-v2/test/contract-gmail-phase-c3-2.test.js`: 2/3 PDF-Binärmapping, HMAC/Empfänger/Revision/Headers, Fehlerfälle, echte Base64url/READ-ONLY Gmail-API-Objekte mit 2/3 Anhängen, positive/negative unabhängige Readback-Nachweise, keine Live-Imports.
- **4 zusätzliche** Tests `crm-v2/test/contract-gmail-phase-c3-2-generator.test.js`: synthetische Lernpayloads mit 2/3 PDFs, unbekannte AVV-Modi und Sicherheitsprüfung des PowerShell-Webhooks.
- CI-GitHub-Workflow auf neuen Branch erweitert (Node-Syntax, alle CRM-Tests, Windows PowerShell-Parser, Firestore-Emulator). **Erwartet: 228/228** normale Node-Tests (215+9+4), **7/7** Firestore-Emulator. Der neue Code ist **syntaktisch gültig**; diese Gesamtzahlen wurden nach den Änderungen **noch nicht vom Betreiber bestätigt**.

## Bedienerfolge ab jetzt (noch kein Gmail-Versand)

```powershell
git fetch origin
git switch --track origin/feature/crm-v2-contract-gmail-transport-staging-20261025
npm.cmd test --prefix .\crm-v2
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\test-crm-contract-firestore-emulator.ps1"
```

Nur nach erfolgreicher Regression: Erst einen synthetischen Lern-Webhook **während Szenario 8166714 inaktiv ist** einreichen:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\test-crm-contract-c3-2-make-blocked.ps1" -Mode Learn -Avv no
```

Die **geheim zu haltende Webhook-URL** ausschliesslich aus dem neuen Szenario 8166714 verwenden; keinesfalls die URLs von 8144117/8162162. Danach per Make-Verbindung zunächst `scenario_trigger_inspect` und gespeicherte Payload-Felder inspizieren. Erst nach erfolgreichem Lernen darf für einen kontrollierten rein synthetischen Smoke (2/3 PDFs) **nur 8166714** zeitweise aktiviert werden; anschliessend wieder deaktivieren. **Während des ganzen Tests bleibt Make ohne Gmail-Aktion.**

## Noch nicht freigegeben

- Keine automatische Aktivierung, keine reale Gmail-`sendAnEmail`-Aktion, kein echtes Kundenmail und keine verbindliche Vertragsannahme.
- Vor jedem ersten tatsächlich gesendeten TEST_ONLY-Gmail-Mail: konkrete Testadresse und geschäftliche Gmail-Verbindung explizit bestätigen; serverseitige echte Identitätsfreigabe und Firestore-Lock *vor* einem einmaligen Versand, unabhängige Gmail-API-Readback/Anhangsprüfung und No-Retry-on-uncertainty implementieren. Ein read-only SDK-Stub ist kein Produktivbeleg.
- Vor jeder Kundenfreigabe rechtliche Endprüfung der Projektbedingungen RC1, AVV RC1 einschliesslich Anlagen A–C, produktive Archivversionierung/IAM und Datenschutzprüfung abschliessen.

**Kurzer Handoff:** GitHub Feature-Branch `feature/crm-v2-contract-gmail-transport-staging-20261025`, Make C3.2 **8166714 INACTIVE / 0 Connections / HTTP423**, existierendes B-Staging 8162162 INACTIVE, Make-Produktion 8144117 UNVERÄNDERT; nach Tests neues Webhook-Schema anlernen und den rein synthetischen Iterator-/Aggregator-Lauf prüfen.

### 25.10.2026 – C3.2 228/228 PASS, 7/7 Emulator PASS; PowerShell-Skript Parserfehler vor POST korrigiert

- Betreiber auf `feature/crm-v2-contract-gmail-transport-staging-20261025`: `npm.cmd test --prefix .\crm-v2` **228/228 PASS**, 0 Fehlversuche/Skip; lokaler Firestore-Emulator **7/7 PASS**, heruntergefahren. Ohne echten Gmail-Versand.
- Der unmittelbar anschliessende Befehl `scripts/test-crm-contract-c3-2-make-blocked.ps1 -Mode Learn -Avv no` scheiterte beim Laden des Skripts: Windows PowerShell `ParserError: MissingStatementBlock` Zeile 73 bei `if($status -ne 200)throw`. **Kein HTTP-Request abgeschickt**, kein Schema neu angelernt.
- **Korrektur im selben Feature-Branch:** `if($status -ne 200){ throw (...) }` mit korrekten PowerShell-Klammern. Neuer **Windows-PowerShell-5.1-Offline-Parser-Test** sowie Negativtest für falsche Make-Webhook-URL. Ohne Windows wird zusätzlich die problematische if-Form statisch verboten.
- **Zusätzliche Sicherheitsabsicherung:** synthetischer Smoke verweigert jede URL ausser dem tatsächlichen Szenario-8166714-Webhook anhand einer intern berechneten, im Skript fest hinterlegten **SHA-256-Fingerprint-Prüfung**. Das geheime Hook-Token wird weder in GitHub noch in der Konsole gespeichert oder ausgegeben. Somit kein versehentlicher Post an die produktive Make-8144117-Mailstrecke.
- **Make-Kontrolle:** 8166714 weiterhin **inaktiv / 0 Gmail-Verbindungen / HTTP-423-Sperre**. Via Make-Schnittstelle wurde exklusiv für Szenario 8166714 das **Webhook-Schema-Lernen gestartet**; dies nimmt maximal den nächsten synthetischen Testrequest zur Felderkennung entgegen, **ohne die Make-Sendemodule auszuführen**.
- **Neue erwartete Anzahl:** **230 reguläre CRM-Tests** = 228 bisher bestanden + 2 neue Regressionen; Firestore bleibt bei **7 bestätigten Emulator-Tests**. Die aktualisierte Version ist noch nicht vom Betreiber ausgeführt. Windows CI führt ebenfalls `Parser.ParseFile` aus.
- **Betreiber-Nächste-Schritte:** auf gleichem Branch `git pull --ff-only`; `npm.cmd test --prefix .\crm-v2`; **nur bei 230/230 PASS** den Befehl `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\test-crm-contract-c3-2-make-blocked.ps1" -Mode Learn -Avv no` **genau einmal** ausführen und die URL nur aus Make-Szenario 8166714 verdeckt eingeben. Der Lernrequest liefert höchstens HTTP 200, **kein Versandbeweis**. Bei Fehler nicht wiederholen, stattdessen in Make prüfen.


### 25.10.2026 – C3.2 Windows-Parser-Failure isoliert und vollständiger Preflight repariert

- Betreiberlog auf `feature/crm-v2-contract-gmail-transport-staging-20261025`: 230 reguläre CRM-Tests, **228 PASS / 2 FAIL**. Die zwei fehlgeschlagenen Tests sind genau der neue Windows-PowerShell-5.1-Parser-Selbsttest und der Test für eine abgewiesene falsche Webhook-URL. Firestore-Emulator bleibt **7/7 PASS**, keine Produktivänderungen.
- Ursache im tatsächlichen GitHub-Skript `scripts/test-crm-contract-c3-2-make-blocked.ps1` nachverifiziert: Die frühere SHA-256-Pin-Ergänzung spaltete die Regex des URL-Host-Filters auf und verdoppelte Generator, HTTP-Aufruf und Antwortauswertung. Daher Windows `ParserError` noch vor jedem HTTP-Request. **Make hat dadurch kein synthetisches Paket empfangen; kein Gmail-Versand.**
- Reparatur auf gleichem Branch (Commit `bd38c72629ac558e49c0ce82431060fb5ef04131`): Datei als **einmaligen linearen Skriptpfad** aufgebaut, Reihenfolge: verborgene URL-Eingabe → Regex für Make-eu1-Hook → SHA-256-Pin auf exakt Make-8166714 → synthetischer Generator mit Validierung → **nur ein** HttpClient-POST → Learn HTTP 200 nur zur Schema-Erkennung oder Smoke HTTP 423 mit strikter denied-Receipt-Prüfung. Jeder Fehler scheitert sicher ohne Retry.
- Zusatzschutz in bestehendem Node-Test (Commit `0ee7e7c2a04af1a28d3cccfefb9c0db7f92f0233`): prüft exakt einmal vorhandene URL-/Pin-/Generator-/POST-/Antwort-Blöcke und Sicherheitsprüfung **vor** dem POST. Windows PowerShell Parser/Fail-closed-Test bleiben verpflichtend. JS-Testdatei-Syntax überprüft; **erneuter 230/230-Node-Lauf auf Windows noch nicht bestätigt**.
- Nächster Befehl für Betreiber: `git pull --ff-only`; `npm.cmd test --prefix .\crm-v2`. **Nur bei 230/230 PASS** exakt einen sicheren `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\test-crm-contract-c3-2-make-blocked.ps1" -Mode Learn -Avv no`-Aufruf mit der in Make-8166714 angezeigten und verdeckt eingegebenen Webhook-URL.
- Kein Versuch gegen Make-8144117 (produktiver Gmail-Sender). Make-8166714 muss weiter **inactive**, ohne Gmail-Verbindung, in Lernmodus bleiben, bis der Betreiber-Test erfolgt.


### 25.10.2026 – Phase C3.2 230/230 PASS, Make-Lernrequest erfolgreich, gefahrloser Live-Smoke ausstehend

- Betreiberlog auf Branch `feature/crm-v2-contract-gmail-transport-staging-20261025`: **230/230 CRM-Tests PASS**, 0 Fehler/Skip, PowerShell-Parser und falscher Make-Hook erfolgreich abgewiesen. Vorherige **7/7 Firestore-Emulator-Tests PASS** bleiben gültig.
- `scripts/test-crm-contract-c3-2-make-blocked.ps1 -Mode Learn -Avv no` sendete exakt einen synthetischen Lernrequest an den SHA-256-gepinnten Webhook **8166714**; PowerShell bestätigte `Make webhook HTTP 200 received for schema learning ONLY` und keinen Versand. Make-Inspektion: Delivery `80cc7c242cac64dc3c35f62f67acda26` am `2026-10-25T10:35:04.600Z`, Status `accepted`, **14 Strukturfelder erkannt**, darunter `attachments` (Array), `attachmentCount`, `emailHeaders`, `packageSha256`. Rohpayload geprüft: **genau 2** synthetische PDFs in korrekter Reihenfolge (`TEST_ONLY_offer.pdf`, `TEST_ONLY_terms.pdf`), `neverSend=true`, `sendMode=blocked_preview_only` und tatsächliche Base64-Inhalte. **Kein Make-Modullauf durch den Lernrequest**.
- Nach erneuter Sicherheitsprüfung (genau Webhook → BasicFeeder → BasicAggregator → WebhookRespond HTTP **423**, `transmitted=false`, `messageId=null`, exakt Hook-ID `3972953`, **0 Gmail-Verbindungen**) wurde **ausschliesslich das isolierte Szenario 8166714 vorübergehend aktiviert**, damit ein kontrollierter synthetischer Laufzeittest durchgeführt werden kann. Es ist derzeit `active`, aber **ohne Gmail-Modul, ohne Kunden-/CRM-Schreibzugriffe und mit hartem HTTP-423-Sperr-Responder**. Das ältere B-Staging 8162162 und produktives 8144117 nicht berührt.
- **Nächster Bediener-Schritt:** exakt einmal `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\test-crm-contract-c3-2-make-blocked.ps1" -Mode Smoke -Avv no` (WebHook-URL aus 8166714 verdeckt), Log an ChatGPT. Bei Erfolg: `C3.2 Make denial VERIFIED: HTTP 423 | transmitted=false | provider=NONE | messageId=null`. Bei anderem Status/Fehler **kein Retry**; Make-Execution prüfen und Szenario deaktivieren. Erst nach positivem 2-PDF-Runtime-Nachweis wird der 3-PDF-AVV-Lauf gestartet, danach 8166714 **sofort wieder deaktivieren**.
- **Freigabegrenze:** Kein echter Gmail-Testversand und keine Kundenmail. Ein HTTP-423-Abweisungsbeleg ist kein Gmail-Receipt. Produktives CRM, Make 8144117, Firestore-Livedaten, Rechnungen und Verträge unverändert.


### 25.10.2026 – Phase C3.2 – 2- und 3-PDF-Make-Smoke PASS; Staging deaktiviert

- **Basistests bestanden:** `npm.cmd test --prefix .\crm-v2`: **230/230 PASS**, 0 Fehler/Skip, einschliesslich Windows-PowerShell-5.1-Parser, exaktem C3.2-Hook-SHA-Pin, Einmal-POST-Guard und Gmail-MIME-/Binärmapping-Sicherheitstests. Vorherige Firestore-Emulator-Integration weiterhin **7/7 PASS**.
- **Make-Schema-Lernen ohne Modul-Ausführung:** Szenario **8166714** empfing den synthetischen 2-PDF-Lernrequest am **25.10.2026 10:35:04.600Z**, HTTP 200, 14 Felder erkannt. `TEST_ONLY_offer.pdf` und `TEST_ONLY_terms.pdf` korrekt als Base64 im `attachments`-Array. HTTP 200 ist nur Webhook-Annahme, **keine Zustellung**.
- **2-PDF-Runtime-Smoke:** Execution **`2dd0055490254cfe8752bd98c413cef6`**, **25.10.2026 10:40:16.263Z**, Make status `success`, vier Module je 1 Invocation, 0 Module Errors. Feeder erzeugte **2 Bundles** (`offer`, `terms`), Aggregator exakt **1 Array mit 2 Anhängen** und korrekten `filename`/SHA-/Byte-Metadaten. WebhookRespond: HTTP **423**, `transmitted=false`, `provider=NONE`, `messageId=null`; vom Operator per PowerShell bestätigt.
- **3-PDF-AVV-Runtime-Smoke:** Execution **`127e06ad530a4b8fb388230466409865`**, **25.10.2026 10:42:53.599Z**, Make status `success`, vier Module je 1 Invocation, **0 Module Errors**, rund 154 ms. `BasicFeeder` gab **genau 3 Bundles** mit Index 1/2/3 aus: `offer` (TEST_ONLY_offer.pdf, **3590 B**), `terms` (TEST_ONLY_terms.pdf, **3590 B**), `avv` (TEST_ONLY_avv.pdf, **3586 B**). `BasicAggregator` gab **ein einziges Array mit 3 Anhängen** aus (`__IMTAGGLENGTH__=3`), jeweils mit korrekter Reihenfolge, Dateinamen, gemeldeten Byte-Längen und SHA-256-Feldern. `WebhookRespond` wurde ausgeführt und lieferte HTTP **423** mit genau `STAGING_C3_2_SEND_NOT_AUTHORISED`, `transmitted=false`, `provider=NONE`, `messageId=null`; Operator bestätigte dieselbe Antwort auf Windows.
- **Einschränkung des Nachweises:** Der Make-Inspector stellt Binärwerte teilweise in serialisierter/verkürzter Form dar. Keine unabhängige Byte-für-Byte-Verifikation *nach tatsächlicher Gmail-Übertragung* und kein echter Gmail-`SENT`-Readback erfolgt. Das gezeigte `data`-Mapping wurde von Make ohne Modulfehler ausgeführt; der vollständige Gmail-Transport bleibt bewusst gesperrt.
- **Sofortige Sicherheitsmassnahme:** Nur Staging-Szenario **8166714 deaktiviert**; abschliessende Make-Abfrage: `status=inactive`, **0 Connections**, **0 wartende Webhook-Requests**, Modulkette weiterhin Webhook → Feeder → Aggregator → HTTP-423-Responder. Älteres B-STAGING **8162162 ebenfalls inaktiv** und ohne Gmail-Verbindungen. Produktives Mail-Szenario **8144117**, Cloud Run, CRM/Firestore, Rechnungen und echte Kundenmails **unverändert**.
- **Status/Übergabe:** **Phase C3.2 für den gesperrten synthetischen 2-/3-PDF-Transport ABGESCHLOSSEN.** Nächste Stufe C3.3 (noch NICHT implementiert/freigegeben): separater tatsächlicher Gmail-TEST_ONLY-Sendeweg, hinter serverseitiger authentifizierter Einzel-Freigabe, exakter geprüfter Empfänger-Allowlist, dauerhaftem Firestore-Lock VOR Versand, unabhängiger Gmail-`SENT`-Readback-Prüfung von Sender/Empfänger/Event/Paket-Hash und den echten PDF-Bytes; nie automatisches Retry bei Unsicherheit. **Vor erstem realen Testmail ist explizite Freigabe der konkreten Testadresse und des Absenders erforderlich.** Juristische Endprüfung RC1/AVV inkl. Anlagen A–C vor Kundenbetrieb offen.
