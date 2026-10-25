# LSZH CRM V2 – C3.5: separater autorisierter Gmail-Read-only-Adapter

**Stand: 25.10.2026 – isolierter Code erstellt; keine echte LSZH-OAuth-Autorisierung, kein E-Mail-Versand, kein Cloud-Deployment.**

## Ausgangspunkt und verifizierte Verbindungen

- C3.4: **249/249 CRM-Node-Tests** und **11/11 lokale Firestore-Emulatorfälle** vom Betreiber bestätigt. Die Gmail-Antworten kamen ausschliesslich aus Test-Fixtures; kein echter Gmail-`SENT`-Nachweis.
- Die hier über ChatGPT verbundene Gmail-App wurde **nur über das Profil** gelesen und gehört zu **lars.schulthess10@gmail.com**. Diese Verbindung ist **keine** serverseitige LSZH-OAuth-Freigabe und wird nicht als Backend-Token oder Secret benutzt.
- Make-Szenario **8144117**, read-only inspiziert: **active**, bestehende Verbindung mit Bezeichnung `lars@lszh-automations.ch` (Make Gmail Credentials), im Gmail-Sendemodul festgelegtes From `"LSZH Automations" <info@lszh-automations.ch>`. Das ist keine neue Berechtigung für C3.5.
- Make-C3.2 **8166714**: **inactive**, keine Gmail-Verbindungen, nur Webhook → Iterator → Aggregator → HTTP-423-Responder. Weder die Produktivverbindung noch C3.2 verändert.

**Identitätsunterscheidung:** Ein künftig freizugebender LSZH-Gmail-OAuth-Account könnte **lars@lszh-automations.ch** sein. Der gewünschte From-Alias könnte **info@lszh-automations.ch** sein. Dies sind lediglich anhand des bisherigen produktiven Make-Setups ermittelte **Kandidaten**, keine automatische Autorisierung für diese neue Teststrecke. Der Betreiber muss sowohl die OAuth-Kontoidentität als auch die ausdrücklich genehmigten `From`-Adressen festlegen. Das reine Lesen einer vorhandenen Make-Verbindung vergibt keine OAuth-Rechte an unser Backend.

## Implementierung (kein Send)

- Neuer Branch: `feature/crm-v2-contract-c35-gmail-readonly-adapter-20261025`.
- Neu: `crm-v2/contract-gmail-c35-readonly-api-staging.js`.
- `createC35GmailApiReadOnlyAdapter({authClient,expectedMailbox,timeoutMs})`: erwartet ausschliesslich einen **vertrauenswürdigen, vom Backend injizierten OAuth-Client**; niemals Browser-Felder, Schlüssel, tokens oder Geheimnisse in Git. Der Adapter erzeugt **keine** OAuth-Freigabe und ruft nichts beim Import auf.
- Erlaubte HTTPS-Gmail-API-Endpunkte sind ausschliesslich diese drei **GET**-Operationen:
  - `/gmail/v1/users/me/profile` zur exakten Überprüfung des OAuth-Kontoinhabers (`emailAddress`).
  - `/gmail/v1/users/me/messages/{id}?format=full` mit geprüfter Message-ID und nur nach identischer Profilprüfung.
  - `/gmail/v1/users/me/messages/{id}/attachments/{id}` mit geprüften IDs und nur nach identischer Profilprüfung.
- Nur sichere ASCII-Identifier ohne Pfadtrenner/Query-Zeichen, feste HTTPS-Domain, Timeout 1–30 Sekunden. Ein anderes OAuth-Konto, API-Fehler oder inkonsistente Daten brechen sicher ab. Kein POST, kein `messages.send`, keine Draft-/Modify-Methode.
- `createC35ReadOnlyGmailVerifier` verbindet diesen GET-Adapter mit der bestehenden C3.4-SENT- und SHA-256-Prüfung. Zusätzliche **`approvedSenders`-Allowlist** ist erforderlich, **getrennt** von der OAuth-`expectedMailbox`-Identität. Nur so ist ein ausdrücklich genehmigter geschäftlicher `From`-Alias sicher abbildbar.
- `createC35DemoGmailReadback`: ausschliesslich lokaler Firestore-Emulator `127.0.0.1:8788`, Demo-Projekt `demo-lszha-c2-20261025`, nur `verifyMailbox`, `inspect`, `reconcile`. C3.3-Transaktionsreservierung erfolgt davor. Kein neues Versandgate, keine neue automatische Wiederholung.

## Authentifizierung und Compliance – offen

1. Für vollständigen Gmail-MIME- und PDF-Anhangsabruf ist **`https://www.googleapis.com/auth/gmail.readonly`** passend; `gmail.metadata` reicht hierfür nicht. Der OAuth-Client muss separat für das **LSZH-Geschäftspostfach** eingerichtet und mit diesem kleinsten ausreichend mächtigen Scope authentifiziert werden. **Keinen** `gmail.send`, `gmail.modify` oder `https://mail.google.com/`-Scope an diesen Prüfclient vergeben.
2. `gmail.readonly` ist laut Google ein **restricted scope**. Je nach externer Bereitstellung, Speicherung und Übertragung von Daten können Verifizierung und Sicherheitsprüfungen erforderlich sein. Siehe [Google Scope-Dokumentation](https://developers.google.com/workspace/gmail/api/auth/scopes).
3. Secrets nur über den bestehenden sicheren Backend-Secret-Manager / kontrollierte Berechtigungen; keine Tokens oder OAuth-Client-Secrets in GitHub, Chat, Test-Files oder Browserlog.
4. Eine personalisierte Gmail-Verbindung in ChatGPT oder ein bereits in Make gespeicherter Produktiv-Gmail-Connector ist **nicht** automatisch über den Cloud-Run- oder Node-Backend-Code verfügbar.
5. Kein echter Testmailversand ohne ausdrücklich freigegebene Kombination aus OAuth-Inhaber, From-Alias und Empfänger. Kein Produktiv-Go-live ohne juristische Schlussabnahme RC1/AVV mit Anlagen.

## Neue Tests – NICHT ausgeführt

- `crm-v2/test/contract-gmail-c35-readonly-api.test.js`: **10** neue Tests, u. a. exakt gepinntes Profil, zweifache PDF-Prüfung, AVV-3-Anhänge per GET, falsche Gmail-Identität, ausgetauschter From-Alias, Fake-`SENT`, PDF-SHA-Manipulation, ungültige IDs/URLs und No-Send-Isolation.
- `crm-v2/emulator-tests/contract-dispatch-firestore.test.js`: **1** neuer lokaler Test verknüpft C3.3-Test-Reservierung mit dem tatsächlichen C3.5-Adapterinterface über einen simulierten OAuth-Client. Falscher OAuth-Inhaber blockiert; der passende Inhaber kann nach Prüfung von 3 PDFs einmalig bestätigen.
- **Erwartet 259/259 Node-Tests und 12/12 Emulator-Tests**; Resultate noch nicht durch Betreiber oder CI bestätigt.

## Betreiber: ausschliesslich gefahrlose lokale Tests

Auf dem bisherigen C3.4-Branch:

```powershell
git fetch origin
git switch --track origin/feature/crm-v2-contract-c35-gmail-readonly-adapter-20261025
npm.cmd test --prefix .\crm-v2
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\test-crm-contract-firestore-emulator.ps1"
```

**Weder die Node-Tests noch der Firestore-Emulator kontaktieren Gmail oder versenden E-Mails.** Alle OAuth-/Gmail-Antworten sind Test-Fakes. Der Firestore-Emulator verwendet offene Testregeln, keine Bestätigung produktiver IAM- oder Firestore-Sicherheitsregeln.

**Nach den Tests:** Nur falls 259/259 und 12/12 PASS, die getrennte geschäftliche Read-only-OAuth-Autorisierung planen. Vor jeglicher echten Nachricht benötigt C3.5 eine ausdrückliche Sender-/From-Alias-/Empfängerfreigabe. Bei Provider-Unklarheit kein automatischer zweiter Versand.
