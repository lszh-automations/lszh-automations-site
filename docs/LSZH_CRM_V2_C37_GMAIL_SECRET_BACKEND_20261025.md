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

### 25.10.2026 – C3.7.1 Secret-Infrastruktur-Preflight, ohne Token oder Mailverkehr

- Betreiber bestätigt C3.7: 292/292 lokale Node-Tests PASS, dediziertes Servicekonto lszh-crm-c37-ro@lszh-automations.iam.gserviceaccount.com erstellt und separates Secret lszh-crm-c37-gmail-readonly in europe-west6 erstellt. In der Secret-Ebene ist roles/secretmanager.secretAccessor ausschliesslich an dieses Servicekonto gebunden; vererbte Projekt-/Ordner-IAM-Rechte sind dadurch allein noch nicht ausgeschlossen.
- Der Betreiber hat ausdrücklich bestätigt: Secret-Versionsliste leer, Secret existiert ohne gespeicherten Token.
- Neuer sicherer Schritt im isolierten C3.7-Branch: scripts/check-crm-c37-oauth-infrastructure.ps1 prüft nur lesend die fest gepinnte Servicekonto-Identität, Secret-Identität und Zürich-Replikation, exakt einen Secret-spezifischen accessor-Principal und weiterhin null Secret-Versionen. Ein falsches Projekt, zusätzliche Secret-Ebene-Zugriffsberechtigte oder vorhandene Versionen werden abgelehnt.
- crm-v2/test/contract-gmail-c371-infrastructure.test.js enthält 4 synthetische/statische Regressionstests gegen Schreiboperationen, produktive Pfade, Tokenzugriffe und fehlende Fail-Closed-Gates. Neue C3.7-Testzahl: 296 Node-Tests. Actions-Lauf https://github.com/lszh-automations/lszh-automations-site/actions/runs/40199266701 zeigte 296/296 Node PASS, 12/12 Firestore Emulator PASS, noch vor Aufnahme der neuen PS-Datei in Windows-Parser.
- Der nachfolgende Workflow-Patch ergänzt Windows-PowerShell-Parser und Dateipfad in CI-Triggern. Operatoraktion ohne OAuth oder Secret-/IAM-Mutation: git pull --ff-only; dann powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-crm-c37-oauth-infrastructure.ps1. Erwartet ausschliesslich benannte PASS-Zeilen.
- Die separate Offline-OAuth-Einwilligung und Geheimnisübergabe ist weiterhin NICHT implementiert oder ausgeführt. C3.6 war ein einmaliger Online-Consent. Keine Access-/Refresh-Tokens, Client-Secrets oder OAuth-Callback-URLs im Chat, PowerShell-Verlauf oder GitHub; kein Cloud-Run-Deployment, keine Make-/CRM-Änderungen oder E-Mail-Versand.


### C3.7.1 synthetischer Windows-PowerShell-Test des IAM-Preflights

- Neues ausschliesslich lokal ausführbares Testskript scripts/test-crm-c37-oauth-infra-offline.ps1; es ersetzt den externen gcloud-Aufruf durch einen synthetischen, lokalen PowerShell-Funktionsmock, ohne Netzwerk- oder Secret-Zugriff.
- Der Mock simuliert drei Fälle: korrekte Account-/Secret- und IAM-Konfiguration mit null Versionen, unerwarteten zusätzlichen Secret-Accessor, bereits vorhandene Secret-Version. Erwartet: 1 PASS, 2 sichere Ablehnungen.
- Der GitHub-Workflow führt jetzt im Windows-Runner zusätzlich die PowerShell-Parserprüfung und das synthetische Testskript aus. Dies bestätigt die Laufzeitlogik des Metadaten-Preflights ohne produktive Ressourcen zu berühren.
- Dieser Schritt erteilt keinerlei Offline-Gmail-Berechtigung und erstellt keinen Refresh-Token.


### 25.10.2026 – C3.7.1 Secretless Preflight FINAL CI PASS

- GitHub Actions: https://github.com/lszh-automations/lszh-automations-site/actions/runs/40199907636; **296/296 Node-Tests, 0 FAIL; 12/12 lokale Firestore-Emulatorfälle, 0 FAIL; Windows-PowerShell-Parser PASS**.
- Der separate Windows-Lauf simuliert gcloud ausschließlich lokal und bestätigt: erwartetes Servicekonto/Secret/Zürich-Replikation und leere Versionsliste PASS; unerwartete zusätzliche Secret-Accessor-Berechtigungen BLOCK; vorhandene Secret-Version BLOCK.
- Code enthält KEINE OAuth-Token-Speicherung, keinen eigentlichen Offline-OAuth-Consent, keinen Gmail-Mailversand und keine produktiven Cloud-Ressourcenänderungen. Nur der Betreiber kann das neue Metadaten-Preflight-Skript auf seinem Surface gegen seine Google-Cloud-Metadaten ausführen.
- Operator: `git pull --ff-only` und `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\check-crm-c37-oauth-infrastructure.ps1"`; alle Ausgaben sind Metadaten-PASS-/BLOCKED-Zeilen und keine Secrets. Eine separat geprüfte OAuth-Speicherroutine ist weiter erforderlich.

### 25.10.2026 – C3.7.1 Korrektur: optionales disabled-Feld im gcloud-Servicekonto

- Betreiber hat nach git pull --ff-only das echte, nicht mutierende PowerShell-Preflight gestartet und den Fehler gemeldet: `Die Eigenschaft "disabled" wurde für dieses Objekt nicht gefunden` an `$sa.disabled` in `scripts/check-crm-c37-oauth-infrastructure.ps1`. Aktive Google-IAM-Servicekonten können `disabled` bei `gcloud iam service-accounts describe --format=json` auslassen. Mit `Set-StrictMode -Version Latest` ist der direkte Zugriff auf die fehlende Eigenschaft unzulässig.
- Korrektur im selben isolierten Branch: Zugriff über `$sa.PSObject.Properties['disabled']`; ein fehlendes Feld oder ein explizites boolesches `false` wird als aktiv akzeptiert; `true`, ein nicht-boolescher Wert oder eine falsche E-Mail werden unverändert fail-closed abgelehnt.
- Windows-PowerShell-Mock erweitert: fehlendes disabled PASS, explicit disabled=false PASS, disabled=true und malformed string BLOCK, zusätzliche Secret-Accessor-Berechtigung BLOCK, existierende Secret-Version BLOCK. Zusätzlicher statischer Node-Test gegen Rückfall auf direkten `$sa.disabled`-Zugriff.
- GitHub Actions [40200200601](https://github.com/lszh-automations/lszh-automations-site/actions/runs/40200200601): Windows-Sicherheitstest PASS, **297/297 Node-Tests PASS**, Firestore-Emulator-Teststatus separat prüfen. **Der korrigierte Code wurde noch nicht vom Betreiber gegen echte Cloud-Metadaten wiederholt.**
- Keine Änderung an Cloud IAM, Secret Manager, Gmail, Make, CRM, produktiven Kunden oder Cloud Run. Der Offline-OAuth-Consent/Refresh-Token-Transfer ist weiterhin offen und noch nicht automatisiert freigegeben.

**Abschliessende Verifikation:** GitHub Actions Lauf [40200200601](https://github.com/lszh-automations/lszh-automations-site/actions/runs/40200200601) wurde vollständig abgeschlossen: **297/297 Node PASS; 12/12 lokale Firestore-Emulatorfälle PASS; Windows PowerShell Parse und synthetischer gcloud-Mock PASS**. Der real ausgeführte Servicekonto-Preflight durch den Betreiber bleibt noch zur Wiederholung offen.


### 25.10.2026 – C3.7.1 echter Cloud-Metadaten-Preflight PASS (Betreiber)

- Betreiber hat `git pull --ff-only` auf dem C3.7-Branch durchgeführt und das read-only Skript `scripts/check-crm-c37-oauth-infrastructure.ps1` auf seinem Surface gegen reale Google-Cloud-Metadaten ausgeführt. Die Ausgabe lautete exakt: `C3.7 SA METADATA PASS`; `C3.7 SECRET ZURICH METADATA PASS`; `C3.7 DEDICATED SECRET IAM PASS`; `C3.7 EMPTY SECRET PASS`; `C3.7 METADATA-ONLY PRECHECK PASS - NO SECRET VALUES READ OR CHANGED`.
- Somit nachgewiesen: korrektes dediziertes Servicekonto, Google Secret Manager-Secret in `europe-west6`, nur das erwartete Secret-Level-IAM-Accessor-Binding und weiterhin **keine Secret-Version**. Das prüft keine geerbten Projekt-/Ordner-IAM-Rechte und keinen tatsächlichen OAuth-Refresh-Token.
- C3.7.1-Infrastruktur-Metadatenprüfung abgeschlossen. Nächster sachlicher Schritt ist ein **separater lokal gestarteter Offline-OAuth-Consent** für das erwartete LSZH-Gmail-Geschäftspostfach mit genau `gmail.readonly` und sicherer Secret-Manager-Versionierung. **Ein solches Offline-Consent-Skript wurde noch nicht erfolgreich fertiggestellt oder getestet und darf nicht als bereit oder ausgeführt beschrieben werden.** Keine Token-/Secret-Inhalte in Chat, GitHub oder normalen PowerShell-Befehlsargumenten. Weder produktiver CRM-/Make-Betrieb noch Gmail-Versand geändert.

### 25.10.2026 – C3.7.1 sicherer Offline-OAuth zu Secret Manager: CODE + CI PASS

- Der Betreiber bestätigte den echten, nicht mutierenden Cloud-Metadaten-Preflight vollständig: Servicekonto, Secret in Zürich, Secret-Level-IAM, null Secret-Versionen, keine Secretwerte ausgelesen.
- Auf demselben isolierten C3.7-Branch implementiert: `crm-v2/contract-gmail-c371-offline-consent.js`, `crm-v2/contract-gmail-c371-local-callback.js`, `crm-v2/contract-gmail-c371-secret-writer.js`, `crm-v2/scripts/c371-offline-oauth-to-secret.cjs`, zwei neue Testsuiten und Benutzeranleitung `docs/LSZH_CRM_V2_C371_OFFLINE_OAUTH_SECRET_HANDOFF_20261025.md`.
- Lokaler expliziter Operator-Consent per PKCE S256 / `state`, TTL 5 Minuten, `access_type=offline`, erzwungener Consent, genau `gmail.readonly`, exakter Google-OAuth-Client und Gmail-Profil `lars@lszh-automations.ch`. Fehlt ein gültiger Refresh-Token, ist Gmail-Profil falsch, ist Scope/Audience falsch oder existiert bereits eine Secret-Version, wird **keine neue Version** angelegt.
- Version-1-Envelope mit `purpose=LSZH_C37_GMAIL_READONLY_STAGING`, enger Absenderliste `info@lszh-automations.ch` und Testempfänger `lars@lszh-automations.ch` ausschliesslich als Bytes auf der stdin-Pipe des lokal aufgerufenen gcloud-Kindprozesses; keine Secret-Payload in GitHub, PowerShell-History, Browser, Log oder Kommandoargumenten. Keine automatische Wiederholung, kein E-Mail-Versand.
- **Finaler GitHub-Actions-Lauf [40201526351](https://github.com/lszh-automations/lszh-automations-site/actions/runs/40201526351): 310/310 Node PASS, 0 FAIL; 12/12 isolierte Firestore-Emulatorfälle PASS; 1/1 echter Windows-Subprozess-Transporttest gegen *synthetisches* `gcloud.cmd` PASS; Windows-PowerShell-Syntax-/Mockprüfungen PASS.** Der Live-Google-OAuth-Consent und echte Secret-Version wurden **nicht** angelegt/getestet.
- Nächste explizite Operator-Handlung nach `git pull --ff-only` / `npm.cmd test --prefix .\crm-v2`: `node .\crm-v2\scripts\c371-offline-oauth-to-secret.cjs --enable-offline-readonly-secret-store --credentials $credentials --confirm-secret lszh-crm-c37-gmail-readonly`, danach **nur lokal** `http://127.0.0.1:8789/` öffnen, mit LSZH-Gmail-Workspace-Konto bestätigen. Nur statische PASS/BLOCKED-Zeile teilen, niemals OAuth-Code-/State-URL, Token, JSON-Inhalt oder Fehlermeldungen mit vertraulicher Nutzlast.
- Nach echtem PASS nur per `gcloud.cmd secrets versions list lszh-crm-c37-gmail-readonly --project=lszh-automations --format="table(name,state)"` prüfen: genau eine aktive Version. Danach den bisherigen **Empty-Secret-Preflight nicht** erneut als Health-Check ausführen (dieser lehnt belegte Secrets absichtlich ab).
- Make 8144117/C3.2 8166714, produktive CRM-/Cloud-Run-Dienste, Firestore und Kundennachrichten unberührt. Das separate Cloud-Run-Staging-Deployment und echte SENT-2/3-PDF-Leseprüfung stehen weiterhin aus.

### 25.10.2026 – C3.7.1 Secret-Version bestätigt / C3.7.2 private Cloud-Run-Leselaufzeit vorbereitet

- Unabhängiger Betreiber-Google-Cloud-Metadatennachweis nach erfolgreichem Offline-OAuth: `gcloud.cmd secrets versions list lszh-crm-c37-gmail-readonly --project=lszh-automations --format="table(name,state)"` zeigte **NAME 1, STATE enabled**. Die dedizierte Secret-Version 1 ist damit aktiv, ohne Secretwerte offenzulegen.
- C3.7.2 ausschließlich auf `feature/crm-v2-contract-c37-gmail-backend-staging-20261025` implementiert: `crm-v2/c372-readonly-server.js` als eigener Node-Cloud-Run-Prozess, getrennt von produktivem `crm-v2/server.js` und Make/Firestore-Mailcode. Nur statische GET /healthz ohne OAuth sowie bewusster POST /internal/gmail-readonly-check ohne Nutzlast: bestehende C3.7-Gmail-Tokenvalidierung, exaktes Konto und ausschliesslich Profil-GET. Antworten enthalten keine Secrets, Nachrichten oder PDF-Bytes. Fehler/Parallelzugriffe BLOCK; strikte Runtime-Gates.
- `scripts/prepare-crm-c372-private-source.ps1` erzeugt eine **nur temporäre, isolierte Deployment-Quellmappe** aus zehn explizit erlaubten Gmail-Lesemodulen plus eigener minimaler `package.json`. Kein produktiver CRM-Server, kein Offer-Send oder Mail-Dispatcher, keine lokal gespeicherten OAuth-JSONs oder sonstige Dateien werden kopiert. Der Schritt ruft weder gcloud noch Cloud Build/Run auf.
- Ergänzt: `crm-v2/test/contract-gmail-c372-private-server.test.js` (sieben synthetische HTTP-Sicherheitsfälle), GitHub-Actions-Parser und Windows-Paket-Allowlisttest sowie `docs/LSZH_CRM_V2_C372_PRIVATE_CLOUD_RUN_20261025.md` mit Cloud-Run-Deployment-Freigabegates.
- **GitHub Actions [40202824012](https://github.com/lszh-automations/lszh-automations-site/actions/runs/40202824012): 317/317 Node PASS; 12/12 Firestore-Emulator PASS; Windows-PowerShell-Parser, 1/1 simulierte gcloud-stdin-Transportprüfung, C3.7.2 privater Source-Allowlisttest PASS.** Es wurde **kein** Cloud-Run-Staging-Service erstellt, kein Cloud-Build ausgelöst, keine echte Backend-Gmail-Leseprobe durchgeführt.
- Nächster sicherer Operator-Schritt: `git pull --ff-only`; `npm.cmd test --prefix .\crm-v2`; `$sourceDir = & ".\scripts\prepare-crm-c372-private-source.ps1"`; `Get-ChildItem -LiteralPath $sourceDir -Name`. Erst nach Begutachtung des minimierten Quellordners separaten privaten Cloud-Run-Dienst in Zürich mit dediziertem SA, interner Ingress, Invoker-IAM, Secret-Mount Version 1, null Traffic und Versand deaktiviert zur ausdrücklichen Freigabe bringen. Bestehende Produktivressourcen und Kundenmails unangetastet.
