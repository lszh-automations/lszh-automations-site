# LSZH CRM V2 – Phase C.3.2 Make-Transport-Staging und Gmail-SENT-Readback (GESPE RRT / NO SEND)

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