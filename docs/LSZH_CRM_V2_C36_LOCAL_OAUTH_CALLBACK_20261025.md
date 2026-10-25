# LSZH CRM V2 – C3.6: lokaler Gmail-OAuth-Callback und einmalige Read-only-Prüfung

**25.10.2026 – isolierter Branch, Implementierung vorbereitet. Keine echten OAuth-Tokens angefordert, keine Gmail-Nachricht versendet, keine produktiven Dienste verändert.**

## Grundlage

- Betreiber bestätigt C3.5: **259/259 Node-Tests und 12/12 lokale Firestore-Emulator-Tests PASS**.
- Google Cloud Projekt `lszh-automations`: OAuth-Nutzertyp **Intern**, Gmail API ist aktiviert, Scope `https://www.googleapis.com/auth/gmail.readonly` unter **eingeschränkte Bereiche** gespeichert.
- Betreiber hat separat einen **Webanwendungs-OAuth-Client** `LSZH CRM V2 – C3.5 Gmail Readonly – Staging` erstellt und dessen Client-Schlüssel **eigenständig sicher gespeichert**. Niemals Client Secret, JSON, Auth-Code oder Access-/Refresh-Token in Chat, GitHub oder Screenshots teilen.
- Google-Dokumentation erlaubt zu Testzwecken localhost-Redirects bei OAuth-Webanwendungen: https://developers.google.com/identity/protocols/oauth2/web-server
- C3.5-Adapter besitzt ausschließlich GET-Endpunkte für Profil, Gmail-Nachricht und Anhänge; weiterer Versand oder Cloud-Run-Deployment weiterhin gesperrt.

## Implementierung

**Branch:** `feature/crm-v2-contract-c36-oauth-callback-20261025`

**Neue Dateien:**
- `crm-v2/contract-gmail-c36-local-oauth.js`: gesicherter Einmal-OAuth-Flow mit **PKCE S256** und kryptografischem **state**; Ablaufdatum 5 Minuten, höchstens eine Callback-Verwendung; fordert genau `gmail.readonly` mit `access_type=online` an. Bevor Gmail-Profil gelesen wird, prüft `google-auth-library.getTokenInfo` die tatsächlichen Token-Eigenschaften: **`aud` = exakte neue OAuth-Client-ID**, nur dieser eine Scope und Token noch mindestens 30 Sekunden gültig. Erst dann GET `/gmail/v1/users/me/profile` und Vergleich mit expliziter erwarteter LSZH-Mailbox. Keine Gmail-Nachrichten-/PDF-Abfragen und keine Schreib-/Sendeoperationen. Nach Abschluss wird die Access-Token-Referenz aus `OAuth2Client` gelöscht; es wird **kein Refresh-Token** verwendet oder auf Disk geschrieben.
- `crm-v2/scripts/c36-local-oauth-probe.cjs`: streng **opt-in** gestarteter lokaler Test auf nur **127.0.0.1:8789**, HTTP nur für Loopback, feste Host-/Methoden-/Endpunktprüfung und Sicherheitsheader; geheimer Google-Web-Client-JSON wird **ausschließlich von einem absoluten lokalen Pfad ausserhalb des Repository** gelesen; kein Print oder Upload des Client Secrets. Der Browser startet bei `http://127.0.0.1:8789/` und öffnet einen Link zur echten Google-Zustimmung. Diese Anfrage wird **nicht automatisch** gestartet. Lokaler Server schliesst nach Erfolg, Fehler oder 5 Minuten.
- `crm-v2/test/contract-gmail-c36-local-oauth.test.js`: **11 synthetische Offline-Node-Tests** für PKCE, Einmaligkeit, richtige/falsche State, fehlende Zustimmung, fehlende/breitere Scopes, falsches `aud`, abgelaufene Tokens, falsches privates OAuth-Konto, Credential-Sicherheit und Trennung vom produktiven CRM.
- GitHub CI-Branch- und Syntaxchecks ergänzt.

**Geprüfter Google-TokenInfo-Feldname:** `aud` (nicht `audience`), siehe https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/oauth2client.ts .

## Exakte autorisierte Weiterleitungs-URI

Im **neu erstellten** Google OAuth-Client unter **Clients → [C3.5 Gmail Readonly Staging] → Bearbeiten → Autorisierte Weiterleitungs-URIs** exakt eintragen und speichern:

```text
http://127.0.0.1:8789/oauth2/callback
```

- **Autorisierte JavaScript-Quellen** leer lassen.
- Keine Änderungen an bestehenden OAuth-Clients.
- Das ist eine **lokale Test-URI** auf dem Surface, keine öffentliche Backend-Callback-Adresse oder spätere Cloud-Run-Go-Live-Konfiguration.
- Eine geänderte URI oder fehlende Registrierung führt bei Google zu `redirect_uri_mismatch`. Keine erfundenen Cloud-Run-URLs ergänzen.

## Erstes technisches Test-Gate – offline

Auf dem bisherigen C3.5-Branch:

```powershell
git fetch origin
git switch --track origin/feature/crm-v2-contract-c36-oauth-callback-20261025
npm.cmd test --prefix .\crm-v2
```

**Erwartet: 270/270 Node-Tests, 0 Fehler** (zuvor 259 PASS + 11 neue); **12/12 Demo-Firestore-Emulatorfälle** bleiben technisch unverändert. Die Offline-Tests brauchen weder den gespeicherten Clientschlüssel noch eine Gmail-Verbindung und führen keinen OAuth-Consent aus.

## Separates zweites Gate – echte lokale OAuth-Leseprüfung, noch nicht freigegeben/ausgeführt

**Erst nach** korrekter Redirect-Registrierung, erfolgreichem Offline-Test und ausdrücklicher Operator-Aktion:

```powershell
node .\crm-v2\scripts\c36-local-oauth-probe.cjs --enable-live-readonly-probe --credentials "C:\ABSOLUTER\PFAD\ZUR\GMAIL-WEBCLIENT-JSON.json" --expected-mailbox "lars@lszh-automations.ch"
```

Der JSON-Pfad ist nur ein Platzhalter; Betreiber trägt seinen echten lokalen Dateipfad **selbst** ein. **Keine** Secrets in Chat oder GitHub kopieren. Danach lokal `http://127.0.0.1:8789/` öffnen, **lars@lszh-automations.ch** bewusst als Google-Account auswählen und den eng begrenzten **Gmail – Nur lesen**-Scope prüfen.

**Erwartete sichere Ausgabe:** `LSZH C3.6 PASS: Konto=..., gmail.readonly bestätigt; keine Tokens gespeichert, kein Versand.` Bei falschem Account, Scope oder Fehler wird die Session sofort gesperrt und keine Anmeldung dauerhaft gespeichert. **Dieses Gate wurde noch nicht ausgeführt**. Die statischen Tests bestätigen nicht, dass die reale geschäftliche OAuth-Freigabe bereits funktioniert.

## Was weiterhin fehlt

Ein dauerhafter Backend-OAuth-Prozess mit separatem HTTPS-Callback, kontrolliertem Secret Manager, Token-Rotation und IAM ist **nicht** Teil dieses lokalen Probes. Einmaliger Gmail-Testversand, PDF-SENT-Readback, juristische RC1/AVV-Freigabe sowie produktive CRM-/Make-Integration sind weiterhin offen. Make 8144117 und C3.2-Szenario 8166714 bleiben unangetastet. **Keine automatischen E-Mails oder Retries.**


### 25.10.2026 – C3.6 lokaler OAuth-Callback: 270/270 Offline-Node-Tests PASS

- Betreiber hat Branch `feature/crm-v2-contract-c36-oauth-callback-20261025` via `git fetch origin` und `git switch --track origin/...` ausgecheckt und `npm.cmd test --prefix .\crm-v2` ausgeführt. **270 Tests PASS, 0 FAIL, 0 SKIP, 0 TODO.** Alle elf neuen C3.6-OAuth-Tests grün, inklusive PKCE-S256, festem Loopback-Redirect, State-CSRF, Einmal-Callback, exakter `gmail.readonly`-Scope-/`aud`-Validierung, Ablaufdatum, Ablehnung anderer OAuth-Konten, Geheimnisschutz und Sendepfad-Isolation.
- **Status: C3.6-Implementierung lokal offline getestet; echte LSZH-Gmail-OAuth-Autorisierung ist weiter OFFEN.** Der Test hat keine echten Google Access-Tokens angefordert, keinen Postfachinhalt gelesen, keine Mail gesendet und keine produktive CRM-/Firestore-/Make-Komponente verändert.
- Google-Cloud-Client ist bereits vom Betreiber erstellt und sein Secret eigenständig sicher gesichert. Die exakt registrierte Weiterleitungs-URI `http://127.0.0.1:8789/oauth2/callback` wurde dem Betreiber zur Eintragung mitgeteilt, aber **ein bestätigter Google-Cloud-Nachweis der Speicherung liegt noch nicht vor**. Vor erster echter Anmeldung die gespeicherte URI im neuen OAuth-Client prüfen.
- **Nächster Operator-Schritt nach Redirect-Prüfung:** Einmaliger lokaler Leserechte-Consent mit `node .\crm-v2\scripts\c36-local-oauth-probe.cjs --enable-live-readonly-probe --credentials "<ABSOLUTER_DATEIPFAD_ZUR_EXTERN_GESPEICHERTEN_WEB_OAUTH_JSON>" --expected-mailbox "lars@lszh-automations.ch"`, dann nur auf eigenem Surface `http://127.0.0.1:8789/` öffnen. Niemals JSON, Client Secret, Auth-Code oder Tokens hier teilen; nur die ungefährliche PASS-/FAIL-Statuszeile. Eine JSON-Datei ist erforderlich, nicht bloss eine separat kopierte Geheimzeichenfolge. Keine echten Nachrichten/Anhänge oder Versandaufrufe bei dieser Profilprüfung.
- Die letzten 12/12 Emulatorintegrationstests wurden auf C3.5 bestätigt; im aktuellen Betreiberprotokoll wurde nur die **270er Node-Suite** erneut ausgeführt, kein erneuter Firestore-Emulatortest. Keine produktive Freigabe aus Offline-Tests ableiten.
