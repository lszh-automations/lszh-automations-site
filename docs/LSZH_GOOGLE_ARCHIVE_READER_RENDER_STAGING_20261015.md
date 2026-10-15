# LSZH – Geschäftliches Google-Drive-Dienstkonto mit Render-Staging

**Stand:** 15.10.2026. Nur technische Staging-Freigabe. Keine juristische Freigabe, keine Kundenannahme, kein Versand, kein Eingriff in Live-Make-Szenarien.

## Geprüfte Ausgangslage

- Google Cloud Geschäftskonto/Organisation `lszh-automations.ch`, Projekt-ID `lszh-automations`, Google Drive API aktiviert.
- Dienstkonto `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com` ist in der Google-Cloud-Konsole erstellt/aktiviert.
- Echte Google-Drive-Berechtigung im Geschäftsarchiv `1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in` am 15.10.2026 per Make Drive API read-only bestätigt: Eigentümer `lars@lszh-automations.ch`, Dienstkonto ausdrücklich `role=reader`, Ordnerzugriff nicht öffentlich.
- Isolierter Render-Stagingdienst **`lszh-offer-acceptance-staging`**, ID `srv-db88q5jncjis73f2g93g`, Branch `feature/optional-avv-acceptance-staging-20261014`, Auto-Deploy ausgeschaltet, Plan free, Frankfurt.
- Konfiguration Staging: `SITE_PRIVATE=true`, `OFFER_ACCEPTANCE_ENABLED=false`, `NODE_ENV=staging`, `OFFER_DRIVE_ARCHIVE_FOLDER_ID=1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in`, `OFFER_DRIVE_SA_FILE=/etc/secrets/lszh-archive-reader.json`, `LSZH_STAGING_ARCHIVE_SMOKE=false`. **Die Pfadangabe ist kein Schlüssel. Die geheime Datei ist noch nicht bereitgestellt.**
- Neuer Staging-Build `dep-db8912navr4c73als4h0`, Commit `000c6089b0b0b74fad86a97b166d89f77e164af3`: Render `live` (nur isolierte Staging-Instanz), **43 Tests bestanden, 0 fehlgeschlagen**, Node-Server gestartet. Das vorherige fehlgeschlagene Build beruhte darauf, dass die Tests die neue Render-Variable `OFFER_DRIVE_SA_FILE` geerbt hatten; der Test-Runner `scripts/run-tests-safely.js` bereinigt seither alle `OFFER_*`-, `MAKE_*`- und sonstigen sensitiven Variablen in **Test-Unterprozessen**, ohne die Runtime-Konfiguration zu ändern.

## Besonders wichtiger Sicherheitsbefund und Codekorrektur

Render legt *Secret Files* bei nativen Node-Diensten auch im Stammverzeichnis des Services ab. Der alte LSZH-`server.js`-Static-Handler hat zuvor einen beliebigen existierenden Pfad unter dem Stammverzeichnis ausliefern können. Dies hätte beim Einspielen einer Secret File potenziell Zugangsdaten offengelegt.

**Auf dem separaten, nicht gemergten Entwicklungsbranch behoben:** `server.js` bedient nur noch explizit festgelegte öffentliche Pfade (`index.html`, zulässige fünf Unterseiten und `robots.txt`). Alle anderen Pfade erhalten HTTP 404, auch `/server.js`, `/package.json`, `/offerArchiveVerifier.js`, `/.env`, `/lszh-archive-reader.json`, Dokumentations- und Testpfade. Tatsächliche HTTP-Tests verifizieren die Sperre. Auf `main`/der produktiven LSZH-Website wurde **nichts verändert**. Vor künftigem Secret-File-Einsatz auf anderen LSZH-Servern muss dort ebenfalls die Auslieferung von internen Dateien geprüft und behoben werden.

Der Verifier `offerArchiveVerifier.js` kann neu einen privaten Schlüssel ausschliesslich vom fest erlaubten Secret-File-Pfad `/etc/secrets/lszh-archive-reader.json` laden; er akzeptiert in diesem Modus **nur die zuvor geprüfte Dienstkonto-E-Mail**. Falsche Dateipfade oder ein zweites paralleles Anmeldeverfahren werden zurückgewiesen. Das bestehende Test-Base64-Verfahren ist lediglich für den bisherigen gemockten HTTP-Testpfad weiterhin vorhanden.

Ein einmaliger, **standardmässig deaktivierter** Startup-Test `archiveStagingSmoke.js` nutzt bei `LSZH_STAGING_ARCHIVE_SMOKE=true` nur drei fiktive schreibgeschützte Offerten-/Projektbedingungen-/AVV-PDFs im Geschäftsarchiv. Er prüft Drive-Metadaten, SHA-256 und die echten AVV-PDF-Bytes per Dienstkonto. Im Log erscheinen nur `LSZH_STAGING_ARCHIVE_READER_CHECK: PASS` beziehungsweise `FAIL`, keine Schlüssel, Dokumente, ID- oder Hashwerte. Dieser Test ist keine öffentliche Route und gibt keine Kundendaten frei.

## Noch nicht getan

**Keine** Dienstkonto-JSON-Datei erzeugt, importiert oder an ChatGPT/GitHub/Airtable übermittelt. Google-Authentifizierung des Dienstkontos durch Render **noch nicht nachgewiesen**. Der Startup-Test ist `false` und wurde noch nicht mit echten Dienstkonto-Credentials ausgeführt. Die externe HTTP-503-Sperre kann per Web-HTTP-Checker aktuell nicht unabhängig gelesen werden; Render-Konfiguration und Server-Guard sind bestätigt.

## Entscheidung zum Authentifizierungsverfahren

Render-Dokumentation (Oktober 2026): Verwaltetes OIDC ist **ab Pro-Workspace** und für AWS, Anthropic und OpenAI direkt integriert – **Google Cloud nicht in der unterstützten Liste**. Google Cloud bietet zwar generell schlüssellose Workload Identity Federation, aber Render-Free stellt hier keinen fertig integrierten Google-Cloud-Identitätsnachweis bereit. Schlüsselvermeidung bleibt empfehlenswert, z.B. mit einem späteren Google-Cloud-Run-Lesedienst, der eine direkt angehängte Google-Dienstkonto-Identität hat.

Für einen **einmaligen Staging-Lesetest** ist technisch eine **Google-Servicekonto-JSON-Datei als Render-Secret-File** möglich; dies ist ein langlebiger privater Schlüssel und braucht streng geregelte Aufbewahrung, Rotation, Zugriffskontrolle und spätere Ablösung. Google-Organisationsrichtlinien zur Schlüsselerstellung nicht abschwächen.

### Noch erforderliche manuelle Aktion (nur nach ausdrücklich gewählter Secret-File-Variante)

1. **NUR IM GESCHÄFTSKONTO:** Google Cloud Console, Projekt `lszh-automations` (authuser=2), IAM & Verwaltung → Dienstkonten → `lszh-archive-reader` → **Schlüssel** → **Schlüssel hinzufügen** → neuen **JSON**-Schlüssel erstellen; falls Google wegen Organisationsrichtlinie ablehnt, nicht umgehen.
2. Die sensible JSON-Datei **nicht** in diesen Chat, Gmail, Make, Airtable, Drive, GitHub oder einen öffentlichen Link geben. Nicht als Screenshot zeigen, nicht in die Website kopieren.
3. **NUR IM ISOLIERTEN RENDER-STAGING**, nicht `lszh-automations-site`: `https://dashboard.render.com/web/srv-db88q5jncjis73f2g93g` → **Environment** → **Secret Files** → **Add Secret File** → Filename genau `lszh-archive-reader.json` → kompletten JSON-Dateiinhalt ausschliesslich im dafür vorgesehenen Render Secret Files-Editor einfügen. Render mountet die Datei unter `/etc/secrets/lszh-archive-reader.json`. Dies löst ein Staging-Deploy aus.
4. Danach kann die technische Prüfung `LSZH_STAGING_ARCHIVE_SMOKE=true` über die verbundenen Render-Tools auf der Testinstanz aktiviert und das `PASS`/ `FAIL` über die Logs kontrolliert werden. **Vorher keine** Einstellungen für echte Online-Annahmen, Airtable-Write-Tokens, Produktiv-Make-Webhooks oder E-Mails aktivieren.
5. Nach erfolgreicher Staging-Probe lokale Kopie auf dem PC sicher verwahren oder nach Unternehmensrichtlinie sicher beseitigen; im echten Betrieb Rotation, Schlüsselablösung und Umstellung auf schlüssellose Anmeldung erwägen.

## Unveränderte Sperren

- Echtbetrieb `www.lszh-automations.ch` läuft weiterhin auf `main`, Produktiv-PR-Vorschauen aus; Draft-PR #5 nicht gemergt.
- Betroffene Make-Link-/Annahmeszenarien inaktiv, harte `0=1`-Filter für Mail/Token/Claim; kein Kundenvertrag.
- Projektbedingungen/AVV technisch als freigegeben angenommen für Tests, **juristische Prüfung tatsächlich auf später vor Go-Live verschoben**.

Quellen: https://render.com/docs/oidc · https://render.com/docs/configure-environment-variables · https://docs.cloud.google.com/iam/docs/workload-identity-federation · https://docs.cloud.google.com/iam/docs/service-account-overview
