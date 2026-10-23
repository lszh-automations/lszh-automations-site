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

## Produktiv-Preflight erfolgreich – 23.10.2026

Der Geschäftsführer hat den Read-only-Befehl `scripts/preflight-crm-production.ps1` im Surface-Worktree ausgeführt:

- **Live-Dienst** `lszh-crm-v2`, zuletzt bereitstehende und zu **100 %** bediente Revision `lszh-crm-v2-00002-6lh`
- **Live-Service-URL** `https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app`
- **Live-Servicekonto** `lszh-crm-v2@lszh-automations.iam.gserviceaccount.com`
- **Website-Intake-Schlüssel**: Secret-Manager-Referenz vorhanden (kein Secret offengelegt)
- **Live-Flag** `CRM_WEBSITE_INTAKE_ENABLED` und `CRM_RECORD_PREFIX` derzeit nicht gesetzt, da die bisherige Serverversion Standardwerte verwendet
- **Staging** `CRM_RECORD_PREFIX=lszh_crm_v2_staging_`, `CRM_WEBSITE_INTAKE_ENABLED=false`
- Das Read-only-Skript hat keine Cloud-Run- oder Firestore-Ressourcen verändert.

**Neu vorbereitet: Firestore-Inventar ohne personenbezogene Inhalte.** Befehl aus dem Staging-Worktree:

```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\inventory-crm-firestore-readonly.ps1"
```

Der Befehl ruft mit `gcloud auth print-access-token` ausschliesslich Firestore-REST-**COUNT**-Aggregationen und die `next`-Felder der Live-/Staging-Sequenzzähler ab. Er führt keine Schreiboperation aus und zeigt keine Lead-, Kontakt- oder Zahlungsdaten. Die tatsächlichen Inventarwerte **stehen noch aus**. Vor Live-Cutover zusätzlich ein überprüftes Firestore-Backup, einen vollständigen Nummernkreis-Abgleich und einen Rollback-Nachweis erstellen. Die reine Anzahlerhebung ersetzt keine Datenmigration.

## Produktions-Preflight – nur lesen

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\preflight-crm-production.ps1
```

Dieser Befehl liest Cloud-Run-Konfiguration (Revisionen, Dienstkonto, Staging-Präfix, Existenz/Art des Secret-Manager-Verweises), gibt **keine** geheimen Werte aus und verändert nichts.

## 23.10.2026 – Render bestätigt, Firestore-Backup erfolgreich, Kandidat vorbereitbar

Der Geschäftsführer bestätigt, dass der produktive Render-Dienst die korrekte CRM_LEAD_INGEST_URL (https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app/api/internal/website-leads) und CRM_INGEST_SECRET (vorhanden) verwendet. Die Secretwerte wurden nicht geteilt.

Cloud Firestore liegt in europe-west6 (Zürich). Der verwaltete Export ist mit done=True und operationState=SUCCESSFUL abgeschlossen. Backup-Pfad: gs://lszh-firestore-backups-470613067122/backups/20261023-094036; Metadaten und Datendatei output-0 nachgewiesen. **Isolierter Restore noch nicht durchgeführt.**

Read-only Firestore-Inventar: Live lszh_crm_v2_ hat 0 Leads/Kunden/Offerten/Projekte/Rechnungen; Offerten- und Rechnungszähler noch nicht angelegt (Start 1000). Staging lszh_crm_v2_staging_ hat 2 Leads, je 1 Kunde/Offerte/Projekt/Rechnung; nächste Sequenzen 1001. **Ein leerer Live-Firestore-CRM-Bestand beweist nicht, dass Airtable und andere Altsysteme leer sind.**

Neue abgesicherte Kandidatenwerkzeuge (bisher **nicht** auf Live ausgeführt):

- scripts/prepare-crm-live-candidate.ps1: standardmässig READ ONLY; validiert Revision lszh-crm-v2-00002-6lh mit 100 % Traffic, Dienstkonto, Secret-Referenz, sauberen Git-Branch und Node-Tests. Nur expliziter Schalter -Deploy würde eine getaggte Kandidatenrevision mit 0 % Traffic auf dem vorhandenen Dienst bauen. --update-env-vars soll die bestehende Secret Manager Referenz bewahren. Kandidatenpräfix lszh_crm_v2_; Website-Eingang true.
- scripts/check-crm-live-candidate-http.ps1: nur anonyme HTTP-Prüfungen an der getaggten Kandidaten-URL (HTML/Config 200, Daten-/Druck-/Website-API ohne Berechtigung 401), keine Firestore-Datenschreibungen.
- Im unveröffentlichten Branch wurde der Datenschutztext der Website für den echten Kontaktformularweg Render -> Cloud Run -> Firestore aktualisiert. Vor Veröffentlichung rechtlich/redaktionell freigeben.

**Live bleibt unverändert:** Kein Git-Merge, Render-Deployment oder Cutover. Rückfallrevision lszh-crm-v2-00002-6lh. Späterer Recovery-Befehl erst nach Freigabe eines produktiven Cutovers:

    gcloud.cmd run services update-traffic lszh-crm-v2 --project lszh-automations --region europe-west6 --to-revisions=lszh-crm-v2-00002-6lh=100

Den Rückfallbefehl **jetzt nicht ausführen**. Vor dem Wechsel ausserdem Altbestand, Google OAuth Origins, Rollen/Negativtests und die unmittelbar vorherige aktuelle Sicherung kontrollieren.

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
- Das externe Formular und der Render-Server wurden nicht geändert. **Der echte Staging-HTTP-Test wurde am 23.10.2026 erfolgreich ausgeführt (201/200/409/401); der öffentliche Render-Formularweg bleibt noch ungeprüft.**
- Kein Merge in `main`, kein Produktiv-Deployment oder Umschalten des Render-Routings. Aktueller Draft-PR: #11.
