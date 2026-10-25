# LSZH CRM V2 – Phase C.2: echte Firestore-Emulator-Tests des Vertragspaket-Ledgers

**Stand:** 25.10.2026. Branch `feature/crm-v2-contract-firestore-emulator-20261025` (Basis C.1 `feature/crm-v2-contract-release-ledger-staging-20261025`). **Nur Tests und Dokumentation. Kein produktiver Cloud-Run-/Firestore-/Make-/Gmail-Eingriff.**

## 1. Gesicherter Ausgangspunkt

- Betreiber hat **201/201** reguläre CRM-V2-Tests auf Phase C.1 **bestanden** (0 Fehler, 0 übersprungen). Diese Tests verwendeten für die neue Versand-Ledger-Logik nur ein FakeDb-Transaktionsmodell.
- Der B-Phase-Make-PDF-Pfad ist für 2/3 synthetische PDFs getestet; STAGING Make `8162162` bleibt **inaktiv**. Produktiver Einzel-PDF-Pfad Make `8144117` bleibt unverändert.

## 2. Tatsächlich implementierte Erweiterungen

- Neue minimalistische **`firebase.json`**, ausschliesslich Emulator: Firestore bindet `127.0.0.1:8788`, die Emulator-Weboberfläche ist deaktiviert, keine Hosting-/Firestore-Deployregeln vorhanden.
- Neue separate **`crm-v2/emulator-tests/contract-dispatch-firestore.test.js`** mit **6 Tests unter dem echten Firestore-Emulator** und dem offiziellen `@google-cloud/firestore` SDK. Diese liegen absichtlich ausserhalb des regulären `test/*.test.js`-Mustes und werden nur im ausdrücklich gestarteten Emulator ausgeführt.
- Harter Vorab-Guard: `FIRESTORE_EMULATOR_HOST` muss exakt `127.0.0.1:8788` sein, die Projektkennung fest `demo-lszh-contract-dispatch-20261025`. Abweichende Projekt-Umgebungsvariablen werden verweigert. Kein Fallback auf die produktive Cloud-API.
- Neue Windows-Anleitung als ausführbares Skript **`scripts/test-crm-contract-firestore-emulator.ps1`**. Es prüft Node.js, `npx.cmd`, Java **21+**, installiert nichts Globales (Firebase CLI temporär via npx), setzt alle Cloud-Projektvariablen auf die Demo-Kennung, entfernt für den Lauf etwaige Google-Credential-Datei-Variablen und startet `firebase-tools@15.1.0 emulators:exec` lokal. Nach dem Test fährt die Firebase CLI den Emulator wieder herunter; vorhandene Prozessvariablen werden im `finally` wiederhergestellt.
- Drei zusätzliche **normale** Node-Sicherheitstests in `crm-v2/test/contract-dispatch-emulator-guard.test.js`: nur lokale `firebase.json`, Emulator verweigert ungültige Host-Konfigurationen, kein Gmail/Make-/Produktiv-Deploy im Testskript. Dafür sind **204** reguläre CRM-Tests zu erwarten (201 + 3).
- `.github/workflows/crm-v2-search-ci.yml` enthält den neuen Branch, beide Test-/Syntaxprüfungen und einen **separaten GitHub-Actions-Job** auf Ubuntu 24.04 mit **Java 21**, Node 22 und Firebase CLI 15.1.0. Dieser startet das Demo-Firestore-Emulatorprogramm, führt die 6 separaten echten SDK-Integrationstests aus und beendet den Emulator wieder. Keine GCP Service-Account-Secrets oder Auth-Aktionen sind im Job erforderlich.

## 3. Sechs Emulator-Testfälle

| Test | Nachweisziel |
|---|---|
| Reservieren | Zwei Dokumente werden **atomar** erstellt: ein Attempt und ein dauerhafter per-Offerte-Lock |
| Konkurrenz | Zwei unabhängige Firestore-SDK-Clients reservieren **gleichzeitig** dieselbe Offerte; nur ein Auftrag darf gewinnen |
| Revision | Eine zweite Paketrevision darf den bestehenden per-Offerte-Lock nicht umgehen |
| Prozessneustart | Neues Firestore-Clientobjekt sieht eine vorherige Reservierung und verweigert Wiederholung; manuelle Review nötig |
| Provider-Nachweis | Falsche Gmail-Metadaten und ein ablehnender Prüfer führen nie zu `confirmed_test_only`; ein **simulierter vertrauenswürdiger Prüfer** darf höchstens einmal bestätigen |
| Nicht versendet | Eine bestätigte manuelle Prüfung kann einen unklaren Zustand schliessen, löscht aber den Sperr-Lock nicht |

**Wichtig:** Es wird **niemals** eine echte Gmail-Verbindung hergestellt; der Verifier in den Tests ist ein Stub. Der Emulator bestätigt Firestore-Transaktionssemantik, keine reale Gmail-Zustellung und keine rechtliche Vertragsfreigabe.

## 4. Operatorbefehle auf dem Surface

Im Projektverzeichnis:

```powershell
git fetch origin
git switch --track origin/feature/crm-v2-contract-firestore-emulator-20261025
npm.cmd test --prefix .\crm-v2
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\test-crm-contract-firestore-emulator.ps1"
```

- Reguläre Node-Suite: **204** erwartet, noch nicht bestätigt.
- Emulator: **6 Integrationstests** erwartet, noch nicht bestätigt. Voraussetzung JDK **21 oder neuer** (`java -version`). Bei fehlendem Java bricht das Skript vor jedem Emulatorstart ab. Firebase-CLI und Emulator-Binärdatei können beim ersten Mal Downloads erfordern.
- Den Emulator **nicht** gegen `lszh-automations` oder andere reale Cloud-Projektkennungen betreiben. Der Demo-Projektname ist absichtlich fest programmiert.
- **Nicht** `gcloud deploy`, `firebase deploy`, `Make activation` oder einen CRM-Kundenmailtest auf Basis dieser Tests ausführen.

## 5. Übergabe nach bestandenem Test

Bei 204/204 regulären Node-Tests und 6/6 Emulator-Tests wird Phase C.2 als technisch bestanden dokumentiert; danach folgt Phase C.3: separater Testmailversand mit autorisierter Empfänger-Allowlist und nachweislichem Gmail-Receipt, nur nach ausdrücklicher Freigabe der konkreten Zieladresse. Die bestehende Live-Sendestrecke bleibt unverändert.

**Freigabegrenzen bleiben:** Vertragsbedingungen RC1/AVV RC1 einschliesslich Anlagen A–C vor externem Einsatz rechtlich/inhaltlich endprüfen; echtes Google-Drive-Archiv-/Dienstkonto, operative Rollen, Gmail-Provider-Review und 0%-Deployment vor Kundeneinsatz nachweisen.
