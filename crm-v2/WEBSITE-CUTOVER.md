# LSZH CRM V2 – Website-Anbindung und Produktivvorbereitung

## Website-Eingang: HTTP-Test erfolgreich – 23.10.2026

Der Geschäftsführer hat den echten synthetischen Staging-HTTP-Test mit `scripts/test-crm-website-intake-staging.ps1` ausgeführt und die PowerShell-Ausgabe übermittelt:

- Dediziertes Staging-Testsecret `lszh-crm-v2-staging-website-test` Version 1 erstellt; Berechtigung für Cloud-Run-Dienstkonto gesetzt. Keine geheimen Werte im Chat.
- Nach temporärer Staging-Aktivierung Cloud-Run-Revision `lszh-crm-v2-staging-00004-njk`, 100 % Traffic.
- Synthetisches `POST /api/internal/website-leads`: **201** (erstellt), identischer Wiederholungs-POST **200** ohne Dublette, abweichender Retry **409**, fehlendes Secret **401**.
- Ein bestätigter Staging-Firestore-Datensatz mit ID `web_d05af7b4be214345af56948b2215e265`. Dies ist **kein realer Kunde**.
- Im `finally` Staging-Webhook wieder deaktiviert. Cloud-Run-Revision `lszh-crm-v2-staging-00005-sjv` hat danach 100 % Traffic. PowerShell bestätigte `PASS: Staging Webhook wieder deaktiviert`.
- Der Test wurde **direkt am Cloud-Run-Staging-Webhook**, nicht über das öffentlich erreichbare Render-Webformular ausgeführt. Nach Prüfung der produktiven Konfiguration und expliziter Freigabe bleibt ein separater echter Website-Test nötig.
- **Kein Merge, keine Render-Umstellung, kein Produktiv-Cutover**. Nächster Schritt: `scripts/preflight-crm-production.ps1` (read-only) ausführen, Ausgabe prüfen; Live-Dateninventar, Backup, Nummernkreis und Google-OAuth-Zugriff separat kontrollieren.


Stand: 23.10.2026. **Nur Entwicklungsbranch und Staging; noch keine Änderung am öffentlichen Render-Dienst oder am produktiven CRM Cloud Run.**

## Was die Website bereits tut

- Das Website-Formular (`index.html`) sendet ein JSON an `POST /api/lead` auf derselben Render-Origin.
- `server.js` auf der Website prüft Pflichtfelder/Origin, ergänzt bei Bedarf eine `submission_id` und leitet den JSON-Body mit `CRM_LEAD_INGEST_URL` und internem `CRM_INGEST_SECRET` an `POST /api/internal/website-leads` weiter.
- Der bisherige Cloud-Run-Dienst `lszh-crm-v2` bestätigt nur nach erfolgreichem Firestore `create()` mit `confirmed:true` und einer `web_...`-Datensatz-ID.
- Gleiche `submission_id` + identische Felder → gleicher Datensatz, kein zweiter Lead; abweichende Felder mit derselben ID → HTTP 409.
- Im aktuellen Website-Code verwendet **dieser Hauptkontaktformularweg kein Airtable/Make**. Ob die beiden Render-Umgebungsvariablen produktiv tatsächlich korrekt gesetzt sind, ist über den Code allein nicht beweisbar. Die anderen Website-/Onboarding-Abläufe bleiben getrennt.

## Unterschiedliche Firestore-Sammlungen

| Zweck | Sammlung | Cloud Run |
| --- | --- | --- |
| Eingehende produktive Website-Leads | `lszh_crm_v2_leads` | `lszh-crm-v2` (bestehend) |
| Neue CRM-Oberfläche im Staging | `lszh_crm_v2_staging_leads` | `lszh-crm-v2-staging` |

Vor dem Umstieg **nicht** die Render-Website auf den Staging-Dienst umstellen. Sonst gelangen echte Kundendaten in den Testbestand oder die Website erhält wegen deaktiviertem Staging-Eingang Fehler.

Die Website selbst muss voraussichtlich **nicht** verändert werden: Beim kontrollierten Live-Cutover soll der bestehende Cloud-Run-Dienst `lszh-crm-v2` die komplette CRM-V2-App mit `CRM_RECORD_PREFIX=lszh_crm_v2_`, `CRM_WEBSITE_INTAKE_ENABLED=true`, vorhandenem Secret-Manager-Schlüssel und Google-OAuth-Allowlist ausführen. Die Render-Zieladresse bleibt dann unverändert. Keines dieser Produktionsänderungen wurde vorgenommen.

## Vorbereitung und synthetischer HTTP-Test (Surface, nur Staging)

Im bereits bestehenden zweiten Git-Worktree:

```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-crm-cloud-staging.ps1 -OAuthClientId '470613067122-ib82le89g17hqaq3ljd005jiglep7pk1.apps.googleusercontent.com' -AllowedEmails 'lars@lszh-automations.ch'
```

Damit werden die neuen Änderungen zuerst auf `lszh-crm-v2-staging` ausgerollt.  Danach **nur mit synthetischen Daten** den neuen Prüfer ausführen:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-crm-website-intake-staging.ps1
```

Das zweite Skript erzeugt einen **eigenen**, nicht ausgegebenen Staging-Secret-Manager-Schlüssel, aktiviert den Staging-Webhook vorübergehend und sendet eine künstliche Website-Anfrage an den realen Cloud-Run-HTTP-Endpunkt. Es prüft: `201` erstellt, identische Wiederholung `200` ohne Duplikat, geänderte Wiederholung `409`, fehlender Schlüssel `401`. Der Webhook wird in einem `finally` wieder deaktiviert; im Fehlerfall die finale Deaktivierungsausgabe prüfen. Es werden **keine Render-Einstellungen und keine Live-CRM-Daten verändert**. Der synthetische Testlead bleibt bewusst im Staging-Firestore sichtbar.

## Produktions-Preflight – nur lesen

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\preflight-crm-production.ps1
```

Dieser Befehl liest Cloud-Run-Konfiguration (Revisionen, Dienstkonto, Staging-Präfix, Existenz/Art des Secret-Manager-Verweises), gibt **keine** geheimen Werte aus und verändert nichts.

## Einmalige Voraussetzungen vor Live-Cutover

1. **Render-Konfiguration prüfen:** Richtiger Workspace und Dienst `lszh-automations-site`; Umgebungsvariablen `CRM_LEAD_INGEST_URL` und `CRM_INGEST_SECRET` sind gesetzt. Secrets nie exportieren oder im Chat teilen. Live-Website-Formular-HTTP-Test nur mit ausdrücklicher Freigabe.
2. **Live-Firestore-Inventar:** Zahl der vorhandenen Leads, Bestandskunden, Offerten, Projekte und Rechnungen feststellen; `web_<UUID>`-ID-Muster erhalten; Collections `lszh_crm_v2_...` und `_meta` sowie Offerten-/Rechnungsnummernkreis kontrollieren. Die Staging-Testdaten **nicht** in Live importieren.
3. **Backup:** Live-Firestore vor dem Cutover exportieren, Backup-Metadaten und Wiederherstellbarkeit prüfen. Vorhandene Airtable-Unterlagen nicht löschen.
4. **Zugang:** Neue CRM-Webanwendung benötigt neben dem bisherigen Intake-Secret die Google-Workspace-OAuth-Client-ID, erlaubte interne E-Mails und einen für die spätere Live-URL autorisierten Google-Client-Origin. Externe Nichtberechtigte dürfen keine Daten- oder Druck-API nutzen.
5. **Rollout ohne Website-Wechsel:** Bestehende Cloud-Run-Revision und Environment dokumentieren; neue vollständige Version zuerst mit `--no-traffic` und eindeutigem Tag deployen; dieselbe bestehende Website-Secret-Manager-Bindung erhalten. Live-Stichprobe und Sicherheitsprüfung mit **synthetischen** Daten, danach nur mit ausdrücklicher Freigabe auf 100 % Traffic umstellen. Bei Fehlern über Cloud Run auf die vorige Revision zurückstellen.
6. **Kommunikation:** Keine produktiven Kundenmails, Vertragsabschlüsse, automatische Rechnungsversände oder Swiss-QR-Zahlteile ohne gesonderte Abnahme.
7. **Datenschutz-/Website-Text:** Website-Datenschutzerklärung nennt noch Make/Airtable für Formulardaten. Vor Go-live redaktionell prüfen und den direkten Cloud-Run-/Firestore-Kontaktformularweg korrekt beschreiben; nicht ohne Freigabe veröffentlichen.

## Aktueller technischer Stand

- Server: `crm-v2/server.js` übergibt die explizite Collection aus `CRM_RECORD_PREFIX` an `saveWebsiteLead()`. Zulässige Collections sind nur Live- oder Staging-Leads.
- Tests: `crm-v2/test/lead-ingest.test.js` und `crm-v2/test/cloud-website-intake.test.js`; CI im Branch `feature/crm-v2-cloud-staging-20261023`.
- Das externe Formular und der Render-Server wurden nicht geändert. **Es hat noch kein echter Staging-HTTP-Test von PowerShell stattgefunden**, solange der Nutzer das zweite Skript nicht ausgeführt hat.
- Kein Merge in `main`, kein Produktiv-Deployment oder Umschalten des Render-Routings. Aktueller Draft-PR: #11.
