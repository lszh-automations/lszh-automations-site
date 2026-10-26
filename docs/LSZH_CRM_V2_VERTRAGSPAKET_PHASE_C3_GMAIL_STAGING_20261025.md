# LSZH CRM V2 – Phase C.3.1: Gmail 2-/3-PDF-Testversand vorbereiten (kein Versand)

**Stand:** 25.10.2026. Branch `feature/crm-v2-contract-gmail-staging-20261025`, Ausgangspunkt C.2 `feature/crm-v2-contract-firestore-emulator-20261025`. **KEINE** Aktivierung/Änderung von produktivem Make `8144117`, bestehendem inaktivem Make-STAGING `8162162`, Gmail-Sendeverbindung, Cloud Run, produktivem Firestore oder CRM-Mail-API.

## 1. Technisch bestätigte Voraussetzungen

- C.2 Betreiberabnahme: **204/204** reguläre Node-Tests PASS und **6/6** echte Firestore-Emulator-Tests PASS, 0 Fehler. Demo-Projekt `demo-lszha-c2-20261025`, `127.0.0.1:8788`. Emulator nach Test korrekt heruntergefahren.
- C.1 hat signiertes TEST_ONLY-Release-Manifest aus überprüften PDF-Archivbytes, Operator-/Empfänger-Allowlist, frisches manuelles Freigabefenster und dauerhaftes, separat transaktionales Firestore-Ledger. Die endgültigen echten RC1-Verträge und AVV-Anlagen sind noch nicht für produktiven externen Versand freigegeben.
- Vorheriges Make B-STAGING **8162162 ist inaktiv**, ein HTTP-423-Sperrmodul bleibt bestehen. MAKE-Bestätigung `HTTP 200` oder `423` ist **kein** Gmail-Zustellnachweis.

## 2. Neue C.3-Versandvorbereitung ohne Sendezugriff

**`crm-v2/contract-gmail-draft-staging.js`:**

- `createGmailTestDraftBuilder({signingSecret,allowedRecipients,readArchivedPdf,now}).prepare(manifest)` liest nur bereits freigegebene synthetische Archivdokumente. Prüft das vom Server HMAC-signierte, frische C.1-Manifest; exact-match-Testempfänger; Archiv-Dateinamen/Versionen `TEST_ONLY`; 2 (`offer`, `terms`) oder 3 (`offer`, `terms`, `avv`) tatsächliche PDF-Originalbytes mit SHA-256, max. 5MB pro PDF und 8MB gesamt.
- Gibt ein **Gmail-kompatibles vorbereitetes Datenobjekt** zurück: `to:[testRecipient]`, `subject`, `bodyType:rawHtml`, LSZH HTML-Vorschau, `attachments:[{filename,dataBase64,sha256,bytes,mimeType,kind}]`, `emailHeaders:[X-LSZH-Contract-Event,X-LSZH-Package-SHA256]`.
- Das Datenobjekt hat absichtlich `kind=lszh_contract_gmail_test_draft`, `sendMode=prepare_only`, `neverSend=true`, Betreff `[TEST_ONLY – KEIN VERSAND]`. Es ist **keine tatsächlich gespeicherte Gmail-Draft**, und die PDF-Bytes werden **nicht** in Firestore gespeichert. `validateGmailTestDraft` prüft Bytes, Reihenfolge, Identitäten und Kennzeichnung nochmals.
- **Keine** `post`, `fetch`, HTTP-/Gmail-/Make-/Firestore-Verbindung oder Sende-API im Modul. Es kann selbst keine Mail auslösen.

**`crm-v2/contract-gmail-evidence-staging.js`:**

- `createGmailSentEvidenceVerifier({readSentMessage,allowedSenders}).verify({receipt,expected})` erwartet *zukünftig* einen **unabhängigen, privilegierten, read-only Gmail-Adapter** und kontrolliert bei tatsächlichen Sendetests das aus dem echten **SENT**-Postfach nachgeladene Message-Objekt.
- Verifiziert: exakte Gmail-Message-ID, Label `SENT`, Sender-Allowlist, genau einen vorher freigegebenen Empfänger, leere CC/BCC, `[TEST_ONLY]`-Betreff, Paket-Event-ID und Paket-SHA-256 aus zusätzlichen Mail-Headern, **2/3 PDF-Binärdateien** (Name, MIME, Anzahl, Bytes, `%PDF-` und SHA-256). Falsche/fehlende Daten, Ausnahme der Gmail-Lese-API oder veränderte PDFs führen zu **false**, niemals zur Versandbestätigung.
- Der unabhängige Read-only-Adapter ist **noch nicht** mit einer konkreten Gmail-Verbindung verdrahtet. Unit-Tests benutzen nur injizierte synthetische Readback-Nachrichten. Ein Make-Receipt allein gilt nicht als Provider-Beweis. Das Ledger setzt `confirmed_test_only` erst, wenn dieser Verifier später serverseitig wirklich angeschlossen ist.

## 3. Make Gmail V4 – konkretes vorbereites Mapping (nicht aktiviert)

- Make `google-email:sendAnEmail`, Gmail V4: benötigt eine geprüfte `__IMTCONN__`-Verbindung; `mapper.to` als E-Mail-Array, `subject`, `bodyType=rawHtml`, `content`, `attachments` als Array **mit `filename` und binärem `data`**, optional `emailHeaders`. Make listet bestehende Gmail-Verbindungen auf; **keine davon wurde für Phase C.3 neu zugeordnet oder gestartet**.
- **Wichtig:** Unser lokaler `dataBase64`-Wert ist **kein** bereits binäres Make-File. Im späteren *dedizierten und inaktiven* Transportpfad muss jeder PDF-Eintrag als `filename:<TEST_ONLY_...pdf>` und `data:toBinary(dataBase64; "base64")` zugeordnet werden. Iteration/Aggregation müssen gewährleisten, dass eine einzige Gmail-Operation genau 2 bzw. 3 Anhänge bekommt. Make-Funktion `toBinary(value; base64)` entspricht der Make-Hilfe: https://help.make.com/text-and-binary-functions.
- **Provider-Korrelation:** Gmail V4 `emailHeaders` muss `X-LSZH-Contract-Event` und `X-LSZH-Package-SHA256` übernehmen. Der künftige tatsächliche TEST_ONLY-Sendebetreff soll `[TEST_ONLY]...` tragen; ein rein vorbereiteter `[TEST_ONLY – KEIN VERSAND]`-Entwurf darf nie irrtümlich in das Sendemodul umgeleitet werden.
- Selbst beim späteren Test gilt: eine frische operator-authentifizierte Freigabe **für eine konkrete Testadresse**, synthetische PDFs, separater geheimer Transporthook, `ledger.reserve(manifest)` atomar vor **einem** Sendversuch, keinerlei automatische Retry-Route, bei Timeout `delivery_review`, danach read-only Gmail-Readback und `confirmVerifiedReceipt`.
- Ein generisches HTTP 200, ein zurückgegebenes `messageId` ohne Postfach-Readback, ein Mismatch der Header oder ein unklarer Timeout **dürfen niemals** `confirmed_test_only` erzeugen.

## 4. Neue Regressionen

- `crm-v2/test/contract-gmail-phase-c3.test.js`: **11 neue Tests** für zwei/drei PDF-Drafts, AVV, exakte Freigabe, korrekte Header, HMAC, Archiv-SHA/Manipulationen, niemals Auto-Send, positiver Gmail-Readback-Fake, Negativfälle für falschen Sender/Empfänger/SENT/Anhang, fehlende Gmail-Provider-Bestätigung und Schutz vor Produktivimport.
- `crm-v2/emulator-tests/contract-dispatch-firestore.test.js`: **1 zusätzlicher** echter Firestore-Emulator-Test für `delivery_review`→`confirmed_test_only` mit dem neuen Readback-Verifier als **injizierter Mock**. Manipuliertes drittes PDF muss zunächst verweigert werden; bei gültigen 3 PDFs genau einmal bestätigen; Lock bleibt erhalten. Der Emulator kontaktiert **kein** echtes Gmail.
- CI-Workflow umfasst den neuen Feature-Branch und drei neue JS-Syntaxchecks. Neue Tests noch **nicht** durch Betreiber ausgeführt: regulär **215** erwartet (204 + 11), Firestore-Emulator **7** erwartet (6 + 1).

```powershell
git fetch origin
git switch --track origin/feature/crm-v2-contract-gmail-staging-20261025
npm.cmd test --prefix .\crm-v2
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\test-crm-contract-firestore-emulator.ps1"
```

## 5. Verbleibende Freigabegrenzen vor dem ersten echten TEST_ONLY-Gmail-Send

1. Konkrete Testpostfach-Adresse nochmals **explizit freigeben** (keine echten Kundenadressen, keine unbekannten CC/BCC). Der geschäftliche Gmail-Absender und zugehörige Make-V4-Verbindung müssen ebenfalls identifiziert und geprüft werden.
2. Separaten **initial inaktiven** Make-C3-Sendepfad und dessen Gmail-`attachments`-Binary-Mapping erstellen; vollständig kontrollierten Freigabe- und Firestore-Ledger-Fail-Closed-Gate davor setzen. Vorher keine externen Mails.
3. Unabhängige Gmail-Readback-Implementierung mit **tatsächlichen** Headern, Labeln und PDF-Inhalten statt gemockten Objekten über die Verbindung verifizieren. Integrationsgrenzen/Google IAM/Secret Manager beurteilen.
4. Erst nach positivem TEST_ONLY-Verifikationsbeweis einen separaten Go/No-Go-Entscheid zu produktiven Kundenpaketen treffen, mit rechtlicher Prüfung der Projektbedingungen RC1, AVV RC1 und Anlagen A–C, echter Archivdokumentversionierung und Schweizer Datenschutzanforderungen.

**STATUS:** C.3.1 Code + Tests erstellt, ohne Aktivierung oder Send. C.3 echter Gmail-Transport und echter unabhängiger Provider-Nachweis **noch nicht ausgeführt**.
