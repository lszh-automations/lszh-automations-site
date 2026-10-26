# LSZH CRM V2 – C3.7.1: Offline-OAuth-Gmail-Readonly zu Google Secret Manager

**25.10.2026 – Implementiert und synthetisch getestet, jedoch kein echter Offline-OAuth-Consent erfolgt. Kein Kunden- oder Produktivmailversand.**

## Bestätigte Ausgangslage

- C3.6: echte Google-Anmeldung von `lars@lszh-automations.ch`, tatsächlicher Scope exakt `gmail.readonly`, aber **kein dauerhaft gespeichertes Refresh-Token**.
- C3.7: 292/292 Node-Tests lokal, 12/12 Firestore-Emulatorfälle in GitHub CI. Spätere C3.7.1-Infrastrukturtests 297/297 Node PASS.
- Servicekonto `lszh-crm-c37-ro@lszh-automations.iam.gserviceaccount.com` wurde vom Betreiber erstellt.
- Dediziertes Secret `lszh-crm-c37-gmail-readonly` im Projekt `lszh-automations`, **user-managed-Replikation ausschliesslich in `europe-west6` (Zürich)**, secret-spezifisches IAM `roles/secretmanager.secretAccessor` nur für das C3.7-Servicekonto.
- Betreiber hat zuletzt **alle fünf Live-Metadaten-Preflight-Checks bestätigt**: Servicekonto, Region, IAM, leere Secret-Versionsliste, No-Secret-Read.
- Keine Secret-Version angelegt, kein Cloud-Run-Staging-Dienst, keine produktive Änderung.

## Neu gebaut

**Branch:** `feature/crm-v2-contract-c37-gmail-backend-staging-20261025`.

1. `crm-v2/contract-gmail-c371-offline-consent.js`: gesonderter lokaler Einmal-Flow mit **PKCE S256** und konstantzeitlich abgeglichenem zufälligem `state`, maximale 5 Minuten, genau `gmail.readonly`, `access_type=offline`, `prompt=consent select_account` und `include_granted_scopes=false`. Antwortcodes nur einmal verwertbar. Google-Tokens werden nicht in einen Protokollausdruck übernommen.
2. Aus dem OAuth-Autorisierungscode erzeugte Tokens werden **vor Speicherung** geprüft: `getTokenInfo` bestätigt `aud` = exakte Web-OAuth-Client-ID, Scope-Liste mit ausschliesslich Gmail Readonly und ausreichend lange Laufzeit. Der Gmail-API-Adapter liest ausschliesslich **GET /users/me/profile** und prüft `emailAddress === lars@lszh-automations.ch`. Keine Nachrichten oder Anhänge werden bei der Einwilligung gelesen. Fehlt ein Refresh-Token oder schlagen einzelne Gates fehl, wird die Sitzung abgebrochen und **keine Version** geschrieben.
3. `crm-v2/contract-gmail-c371-local-callback.js`: nur `127.0.0.1:8789`, Callback `http://127.0.0.1:8789/oauth2/callback`; Browser erhält statische PASS-/BLOCKED-Nachrichten, nie Google-Codes, Refresh-/Access-Tokens oder vertrauliche Provider-Fehlermeldungen.
4. `crm-v2/contract-gmail-c371-secret-writer.js`: prüft die leere Versionsliste **noch einmal direkt vor dem Schreibvorgang** und legt **nur eine** Version an. Die validierte JSON-Hülle wird ausschliesslich in **Speicher** erstellt und über `gcloud.cmd secrets versions add lszh-crm-c37-gmail-readonly --project=lszh-automations --data-file=- --quiet` über die **Kindprozess-Standardeingabe** übertragen. Keine sensiblen Daten in Prozessargumenten, PowerShell-Verlauf, Dateien, Browser, Chat oder Anwendungslogs; Cloud-/Provider-Ausgabe des Schreibvorgangs wird nicht durchgereicht. Einmalige Schreibattempts, keine automatischen Retries. Wie bei Node.js üblich kann die Runtime kurzlebige Kopien im RAM halten – physisches Speicherauslöschen aller JS-Strings wird nicht versprochen.
5. `crm-v2/scripts/c371-offline-oauth-to-secret.cjs`: nur auf ausdrücklichen Opt-in-Befehl ausführbar; akzeptiert nur die bereits verwendete **absolute externe** Google Web-OAuth-Client-JSON (keine Zugangsdaten im Repository) und das exakte Ziel-Secret. Die internen Test-Allowlisten in der späteren C3.7-Backend-Hülle lauten **`approvedSenders: [info@lszh-automations.ch]`** und **`allowedRecipients: [lars@lszh-automations.ch]`**; dies genehmigt **keinen** automatischen Versand.
6. `crm-v2/test/contract-gmail-c371-offline-consent.test.js`: 12 neue synthetische Regressionstests für korrektes OAuth-URL-Profil, Konto- und Scope-Identität, fehlende Refresh-Tokens, falsche E-Mail, CSRF/TTL, Fail-Closed-Write, Versions-Dubletten und No-Send-Isolation.

## Ablauf – nur nach grünem CI und bewusstem Operatorentscheid

**Schritt A – Sicherer Code-Sync und Regressionstest** auf dem Surface im Repository:

```powershell
git pull --ff-only
npm.cmd test --prefix .\crm-v2
```

**Schritt B – Einmaligen Offline-Consent ausdrücklich starten**, nur falls Secret weiterhin leer ist und die freigegebene externe Web-OAuth-Client-JSON lokal existiert. Die PowerShell-Variable `$credentials` enthält nur den absoluten **Dateipfad** (nicht den geheimen Inhalt), wie bei C3.6:

```powershell
node .\crm-v2\scripts\c371-offline-oauth-to-secret.cjs --enable-offline-readonly-secret-store --credentials $credentials --confirm-secret lszh-crm-c37-gmail-readonly
```

Danach **lokal** `http://127.0.0.1:8789/` aufrufen, im eigenen Browser ausschliesslich das LSZH-Geschäftskonto wählen und die genaue Leseberechtigung prüfen. Dieser Browserklick autorisiert die sichere Speicherung einer einmaligen Secret-Version. **Die vollständige Google-Callback-URL mit `code` und `state` darf niemals kopiert oder gesendet werden.** Nur die schlichte PowerShell-PASS-/BLOCKED-Statuszeile ist zur Projektdokumentation geeignet.

Erwartete Ausgabe bei tatsächlichem Erfolg:

```text
LSZH C3.7.1 PASS: Gmail readonly verifiziert, Secret-Version im dedizierten Secret gespeichert; kein Versand.
```

**Schritt C – Metadaten-Nachweis nach Speicherung** (keine Secret-Payload auslesen):

```powershell
gcloud.cmd secrets versions list lszh-crm-c37-gmail-readonly --project=lszh-automations --format="table(name,state)"
```

Die Versionsliste soll genau **eine ENABLED Version** zeigen. Danach **nicht erneut den Offline-Consent-Befehl ausführen**; ein erneuter Versuch scheitert bei belegtem Secret absichtlich. Der ältere Preflight `check-crm-c37-oauth-infrastructure.ps1` ist explizit auf **null Versionen** ausgelegt und soll nach der ersten Speicherung nicht mehr als allgemeiner Health-Check dienen.

## Unverändert gesperrt

- **Keine Cloud-Run-Bereitstellung** durch dieses Skript, kein echter Gmail-SENT-2/3-PDF-Readback, kein Mailversand, keine Offertenannahme und kein Live-CRM-/Make-Hook.
- Keine Änderung an Make 8144117 / 8166714 oder an produktiven CRM-Cloud-Run-Traffic-Regeln.
- Ein eigenständiges Audit vererbter IAM-Rechte und die spätere kontrollierte Secret-Rotation bleiben separate Betriebsaufgaben.
- Es wird **nicht** Workspace Domain-Wide Delegation verwendet.
- Bei mehrfachem OAuth-Grant kann Google die eigenen Token-Ausgabe- bzw. Refresh-Token-Richtlinien anwenden; bei `NO_REFRESH_TOKEN` keinerlei Secret speichern und nicht versuchen, irgendein vorhandenes persönliches Konto-Token zu verwenden.

Google-Dokumentation: https://developers.google.com/identity/protocols/oauth2/web-server und https://cloud.google.com/secret-manager/docs/add-secret-version .

### 25.10.2026 – C3.7.1 sicherer Offline-OAuth zu Secret Manager: CODE + CI PASS

- Der Betreiber bestätigte den echten, nicht mutierenden Cloud-Metadaten-Preflight vollständig: Servicekonto, Secret in Zürich, Secret-Level-IAM, null Secret-Versionen, keine Secretwerte ausgelesen.
- Auf demselben isolierten C3.7-Branch implementiert: `crm-v2/contract-gmail-c371-offline-consent.js`, `crm-v2/contract-gmail-c371-local-callback.js`, `crm-v2/contract-gmail-c371-secret-writer.js`, `crm-v2/scripts/c371-offline-oauth-to-secret.cjs`, zwei neue Testsuiten und Benutzeranleitung `docs/LSZH_CRM_V2_C371_OFFLINE_OAUTH_SECRET_HANDOFF_20261025.md`.
- Lokaler expliziter Operator-Consent per PKCE S256 / `state`, TTL 5 Minuten, `access_type=offline`, erzwungener Consent, genau `gmail.readonly`, exakter Google-OAuth-Client und Gmail-Profil `lars@lszh-automations.ch`. Fehlt ein gültiger Refresh-Token, ist Gmail-Profil falsch, ist Scope/Audience falsch oder existiert bereits eine Secret-Version, wird **keine neue Version** angelegt.
- Version-1-Envelope mit `purpose=LSZH_C37_GMAIL_READONLY_STAGING`, enger Absenderliste `info@lszh-automations.ch` und Testempfänger `lars@lszh-automations.ch` ausschliesslich als Bytes auf der stdin-Pipe des lokal aufgerufenen gcloud-Kindprozesses; keine Secret-Payload in GitHub, PowerShell-History, Browser, Log oder Kommandoargumenten. Keine automatische Wiederholung, kein E-Mail-Versand.
- **Finaler GitHub-Actions-Lauf [40201526351](https://github.com/lszh-automations/lszh-automations-site/actions/runs/40201526351): 310/310 Node PASS, 0 FAIL; 12/12 isolierte Firestore-Emulatorfälle PASS; 1/1 echter Windows-Subprozess-Transporttest gegen *synthetisches* `gcloud.cmd` PASS; Windows-PowerShell-Syntax-/Mockprüfungen PASS.** Der Live-Google-OAuth-Consent und echte Secret-Version wurden **nicht** angelegt/getestet.
- Nächste explizite Operator-Handlung nach `git pull --ff-only` / `npm.cmd test --prefix .\crm-v2`: `node .\crm-v2\scripts\c371-offline-oauth-to-secret.cjs --enable-offline-readonly-secret-store --credentials $credentials --confirm-secret lszh-crm-c37-gmail-readonly`, danach **nur lokal** `http://127.0.0.1:8789/` öffnen, mit LSZH-Gmail-Workspace-Konto bestätigen. Nur statische PASS/BLOCKED-Zeile teilen, niemals OAuth-Code-/State-URL, Token, JSON-Inhalt oder Fehlermeldungen mit vertraulicher Nutzlast.
- Nach echtem PASS nur per `gcloud.cmd secrets versions list lszh-crm-c37-gmail-readonly --project=lszh-automations --format="table(name,state)"` prüfen: genau eine aktive Version. Danach den bisherigen **Empty-Secret-Preflight nicht** erneut als Health-Check ausführen (dieser lehnt belegte Secrets absichtlich ab).
- Make 8144117/C3.2 8166714, produktive CRM-/Cloud-Run-Dienste, Firestore und Kundennachrichten unberührt. Das separate Cloud-Run-Staging-Deployment und echte SENT-2/3-PDF-Leseprüfung stehen weiterhin aus.
