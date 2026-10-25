# LSZH CRM V2 – C3.7: Gmail-Read-only-Stagingbackend mit Secret Manager

**Stand 25.10.2026 – Implementierung auf isoliertem Branch; noch kein produktives Deployment, keine echte Gmail-PDF-Leseprüfung, kein Vertragsmailversand.**

## Ausgangslage und nachgewiesene Berechtigung

- **C3.6 echte Read-only-Anmeldung erfolgreich:** Der Betreiber hat `LSZH C3.6 PASS: Konto=lars@lszh-automations.ch, gmail.readonly bestätigt; keine Tokens gespeichert, kein Versand.` gemeldet.
- C3.6 war eine **Online-OAuth-Einmalsitzung**: Sie hat **kein Refresh-Token** erlangt oder dauerhaft gespeichert. **Eine dauerhafte Cloud-Run-Gmail-Berechtigung existiert daher weiterhin nicht.**
- GitHub Actions C3.6: **276/276 Node-Tests**, **12/12 Emulatorfälle** bestanden. Der Branch verwendet dieselbe Basis und erweitert nur die isolierte Staging-Leseprüfung.
- Produktive Make-Szenarien, CRM-Mailversand, Kundenkonten, Cloud-Run-Traffic, Firestore und Verträge bleiben unverändert.

## C3.7 Staging-Code

Branch: `feature/crm-v2-contract-c37-gmail-backend-staging-20261025`

- `crm-v2/contract-gmail-c37-backend-staging.js` – **isolierter Backend-Dienstvertrag**, nicht von `server.js` oder `offer-send.js` importiert und ohne HTTP-Routen, Scheduler, Gmail-Send, Draft, Make- oder Firestore-Schreiboperationen.
- Zwingende Umgebung, andernfalls sofort BLOCK: `K_SERVICE=lszh-crm-v2-c37-readonly-staging`, `GOOGLE_CLOUD_PROJECT=lszh-automations`, `LSZH_C37_READONLY_ENABLED=true`, `LSZH_C37_TEST_ONLY=true`; `LSZH_C37_ENABLE_SENDING=true` und `LSZH_C37_ALLOW_CUSTOMER_MAIL=true` werden abgelehnt. Das sind **Anwendungsgates**, kein Ersatz für Cloud IAM, AuthN oder Netzwerkisolation.
- **Geheimer Dateimount:** `/var/run/secrets/lszh-c37/gmail-readonly.json`, aus einem später eigens zu erstellenden Secret-Manager-Secret. Nur `createC37MountedSecretBackend` liest ihn und ausschließlich nach einem ausdrücklichen Leseaufruf. Keine Speicherung der Secret-Inhalte auf Disk durch die Anwendung und kein Fallback auf Downloads/`.env`/ChatGPT/GitHub.
- Vollständige, intern prüfbare JSON-Version-1-Hülle mit Schlüsselmenge `version`, `purpose`, `expectedMailbox`, `clientId`, `clientSecret`, `refreshToken`, `approvedSenders`, `allowedRecipients`. `purpose` muss exakt `LSZH_C37_GMAIL_READONLY_STAGING` sein. `expectedMailbox` muss exakt `lars@lszh-automations.ch` sein; Absender-Aliasse und Empfänger sind **separat freizugeben**, niemals aus dem OAuth-Konto abgeleitet. **Die tatsächlichen Secret-Werte gehören ausschliesslich in Secret Manager, nicht in GitHub oder Screenshots.**
- Mit dem Refresh-Token wird je Aufruf ein **kurzlebiges Access-Token** erzeugt. Bevor Gmail gelesen wird, wird die tatsächliche Token-Gewährung über Google `getTokenInfo` auf genau **`gmail.readonly`**, exakte `aud`-Client-ID und Ablaufzeit kontrolliert.
- Die eigentlichen Gmail-Aufrufe verwenden einen **zweiten OAuth2Client, der nur das überprüfte Access-Token und niemals das Refresh-Token erhält**. Erlaubte Gmail-API-Aufrufe stammen ausschließlich vom C3.5-Adapter: **GET** /users/me/profile, /messages/{id}?format=full und /messages/{id}/attachments/{id}. Strikter Abgleich der Kontoidentität.
- Die C3.4/C3.5-Prüfung kontrolliert unabhängig **Gmail-SENT-Label, From-Allowlist, To-Allowlist, unveränderliches Event-/Package-SHA-Identifikationsmerkmal, genau 2 oder 3 PDFs, MIME und echte PDF-SHA-256-Werte**. Beschädigte Beweise, falsche Identität, zusätzliche Scopes, Tokenfehler oder Secretfehler liefern nur `BLOCKED`. Keine automatischen Wiederholungen und kein automatisches „Versendet“ im Live-CRM.
- C3.7 beschränkt die für einen realen Gmail-PDF-Nachweis akzeptierten Events auf `contract_send_pkg_test_...`; normale Kundenereignisse werden **vor dem Provider-Zugriff** blockiert. Empfangene Gmail-Inhalte und Tokens werden **nicht** im Ergebnis ausgegeben.
- `crm-v2/test/contract-gmail-c37-backend-staging.test.js`: **16 neue vollständig synthetische Offline-Tests**, zusätzlich zu den 276 Baseline-Tests: runtime isolation, Secret-Schema, lazy load, readonly GET, echt wirkende 2-/3-PDF-Test-Fix­tures, Scope, Audience, Expiry, falsches Gmail-Profil, falscher Absender/Empfänger, veränderte Hashes, Providerfehler, No-Send und fixer Secret-Mount.
- CI erweitert für neuen Feature-Branch und Syntaxprüfungen. **Erwartet: 292/292 Node-Tests plus 12/12 Firestore-Emulatorfälle**; tatsächlichen Stand erst aus CI-Lauf oder Betreiberprotokoll übernehmen.

## Separater Secret Manager/IAM-Aufbau – NOCH NICHT umgesetzt

Dieser Abschnitt ist eine **gesicherte Zielkonfiguration**, keine Aufforderung, vorhandene Produktivberechtigungen zu verändern:

1. Für C3.7 **separates** Servicekonto vorsehen, ausschliesslich an einen späteren privaten Cloud-Run-Staging-Dienst gebunden. Keine IAM-Rolle `Editor`, keine Rollen auf alle vorhandenen Kunden-/CRM-Ressourcen; **keine Workspace-Domain-Wide Delegation**.
2. Nur dem dedizierten C3.7-Servicekonto die Rolle `roles/secretmanager.secretAccessor` auf **einem einzigen dedizierten Gmail-Read-only-Secret** gewähren, nicht projektweit.
3. Dieses Secret als Datei nach `/var/run/secrets/lszh-c37/gmail-readonly.json` mounten. Keine Client-Secrets, Refresh-Tokens oder OAuth-Codes als Klartext-CLI-Argument, GitHub-Action-Secret in Logs, CRM-Browser, Website-Formular oder Chat verwenden.
4. **Offline-Consent neu durchführen:** Ein später separat zu entwickelnder, operatorbestätigter OAuth-Flow braucht `access_type=offline` mit genau `gmail.readonly`; nur so kann der Betreiber für einen dauerhaften Backend-Abruf ein Refresh-Token erhalten. C3.6 `access_type=online` kann hierfür **nicht wiederverwendet** werden. Die spätere Eingabe in Secret Manager muss eine lokale sichere Methode verwenden, welche **keinen Refresh-Token auf STDOUT, in CLI-Verlauf, Dateien des Repositories oder in Logs** ausgibt. Bestehenden C3.6-Client nicht unbemerkt auf erweiterten Scope ändern.
5. Erst nach Scope-/Konto-/IAM-Gates einen separaten internen Cloud-Run-Staging-Dienst aufbauen, ohne öffentlich erreichbare Routen, ohne an produktive CRM/Make-Läufe angeschlossen zu sein. Die C3.7-Modulfunktionen sind **noch kein ausführbarer Cloud-Run-Server**.
6. Für einen echten PDF-Readback benötigt die Testnachricht einen **bekannten echten Gmail-SENT-Message-ID-Bezug** und vorab **freigegebene** Absender-/Empfänger-Adressen sowie 2/3 unveränderliche Test-PDF-Hashes. Die Tests heute nutzen ausschließlich synthetische Gmail-Fixtures, kein LSZH-Postfachinhalt.

## Abnahmegrenzen

| Stufe | Status |
| --- | --- |
| C3.6 echte Gmail-OAuth-Identität und genaues Read-only-Scope | PASS (Betreiberprotokoll) |
| C3.7 isolierter Token-/Gmail-Lese-Backendcode | Implementiert im Branch |
| C3.7 Offline-Node-Tests und Emulator-CI | Nach CI verifizieren |
| C3.7 Secret Manager mit dediziertem Servicekonto und eigenem Refresh-Token | **OFFEN** |
| C3.7 Cloud-Run-Staging-Dienst und echter Test-PDF-Readback | **OFFEN** |
| Vertragliche/juristische Schlussabnahme, Make- und produktiver Kundenversand | **NICHT freigegeben** |

Google-Hinweise: https://developers.google.com/workspace/gmail/api/auth/web-server ; https://cloud.google.com/run/docs/configuring/services/secrets ; https://cloud.google.com/iam/docs/best-practices-service-accounts .


**C3.7 CI-Abnahme 25.10.2026:** GitHub Actions-Lauf [40194138028](https://github.com/lszh-automations/lszh-automations-site/actions/runs/40194138028) auf Commit `6b2ebeba7b7dec024dfdfdcfa027a1def6f9dfc8`: **292/292 Node-Tests PASS, 0 FAIL**, **12/12 lokale Firestore-Emulatortests PASS, 0 FAIL**, JavaScript-Parser und Windows PowerShell Parser PASS. Alle drei CI-Jobs erfolgreich. Der C3.7-Code ist **isoliert/offline getestet**, nicht live bereitgestellt, und der reale Google OAuth Refresh-Token-/Secret-Manager-Prozess bleibt explizit OFFEN. Die zuvor bestätigte echte C3.6-Online-OAuth-Identität ersetzt diesen Offline-Consent nicht.


### C3.7 – lokale Betreiberprüfung 292/292 PASS (25.10.2026)

- Betreiber hat nach Wechsel auf den C3.7-Branch `npm.cmd test --prefix .\crm-v2` auf dem Surface ausgeführt und bestätigt: **292 Tests, 292 bestanden, 0 Fehler, 0 übersprungen** (Gesamtdauer 1226.03 ms). Das bestätigt zusätzlich zum bereits grünen GitHub-Actions-Lauf 40194138028 die lokale Code-Regression.
- **Nächster Schritt (noch nicht durchgeführt):** dediziertes IAM-Servicekonto `lszh-crm-c37-ro@lszh-automations.iam.gserviceaccount.com` für zukünftigen separaten Read-only-Staging-Dienst anlegen bzw. vorab auf Existenz prüfen. Keine Projekt-IAM-Rolle, kein Key-Download, keine Änderung bestehender produktiver Servicekonten. Rollen `roles/secretmanager.secretAccessor` erst später auf dem **einzelnen neu anzulegenden dedizierten Secret**, nicht projektweit, vergeben.
- Die separate Offline-OAuth-Freigabe mit Refresh-Token, sichere Secret-Manager-Einspielung, Cloud-Run-Staging und ein echter Gmail-PDF-SENT-Lesetest bleiben ausdrücklich offen. Keine Kundenmails, kein Make- oder CRM-Deployment.
