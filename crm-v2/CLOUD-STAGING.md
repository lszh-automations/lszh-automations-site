## Verbindliche Geschäftsführerentscheidung – 23.10.2026: Kein Airtable-Import

- Für **LSZH CRM V2** werden weder Airtable noch die bisherigen Airtable-Datensätze benötigt. **Keine Migration, keine Zuordnung historischer Airtable-IDs, keine Nachführung historischer CRM-Daten**.
- Der Geschäftsführer bestätigt den durch die Firestore-Zählung ermittelten **leeren Live-Bestand** (`lszh_crm_v2_`: jeweils null Leads, Kunden, Offerten, Projekte und Rechnungen) als **korrekten gewünschten Startzustand**.
- Die produktiven Offerten- und Rechnungsnummern beginnen jeweils bei **1000**. Die Staging-Nummern zählen nicht zum Live-Bestand.
- Der produktive Website-Eingang bleibt **Render -> Cloud Run -> Firestore**; kein Make-/Airtable-Zwischenschritt im Hauptkontaktformular. Make für andere, ausdrücklich benötigte Kundenautomationen unabhängig davon weiter nutzbar.
- **Airtable-Inventur/Import ist kein Go-Live-Blocker mehr**. Historische Airtable-Datenbanken, Make-Szenarien, Google-Drive-Archive und Nachweise werden durch diese Entscheidung **nicht automatisch gelöscht oder deaktiviert**; hierfür wäre eine separate gezielte Freigabe erforderlich.
- Bereits bestanden: Staging-Prozess und Website-Ingest, produktiver Cloud-Run-Kandidat `lszh-crm-v2-00004-mez` mit `0 %` Traffic, anonyme API-Negativtests sowie erlaubter Google-OAuth-Login und leeres Live-Dashboard in Edge; Firestore-Gesamtexport nach Zürich mit Status `SUCCESSFUL`.
- Weiter offen: **isolierten Firestore-Restore nachweisen** (Backup vorhanden, Restore ungetestet), Website-Datenschutzerklärung im produktiven Render-Stand anpassen/veröffentlichen, produktiven Traffic-Switch bewusst freigeben und danach `POST /api/lead` durch die echte Render-Website mit synthetischer Anfrage testen. Derzeit läuft weiter `lszh-crm-v2-00002-6lh` mit 100 % Traffic. **Kein Cutover durch diese Dokumentationsentscheidung.**

# LSZH CRM V2 – Cloud Staging und Firestore-Übernahme

## Website-Eingang: HTTP-Test erfolgreich – 23.10.2026

Der Geschäftsführer hat den echten synthetischen Staging-HTTP-Test mit `scripts/test-crm-website-intake-staging.ps1` ausgeführt und die PowerShell-Ausgabe übermittelt:

- Dediziertes Staging-Testsecret `lszh-crm-v2-staging-website-test` Version 1 erstellt; Berechtigung für Cloud-Run-Dienstkonto gesetzt. Keine geheimen Werte im Chat.
- Nach temporärer Staging-Aktivierung Cloud-Run-Revision `lszh-crm-v2-staging-00004-njk`, 100 % Traffic.
- Synthetisches `POST /api/internal/website-leads`: **201** (erstellt), identischer Wiederholungs-POST **200** ohne Dublette, abweichender Retry **409**, fehlendes Secret **401**.
- Ein bestätigter Staging-Firestore-Datensatz mit ID `web_d05af7b4be214345af56948b2215e265`. Dies ist **kein realer Kunde**.
- Im `finally` Staging-Webhook wieder deaktiviert. Cloud-Run-Revision `lszh-crm-v2-staging-00005-sjv` hat danach 100 % Traffic. PowerShell bestätigte `PASS: Staging Webhook wieder deaktiviert`.
- Der Test wurde **direkt am Cloud-Run-Staging-Webhook**, nicht über das öffentlich erreichbare Render-Webformular ausgeführt. Nach Prüfung der produktiven Konfiguration und expliziter Freigabe bleibt ein separater echter Website-Test nötig.
- **Kein Merge, keine Render-Umstellung, kein Produktiv-Cutover**. Nächster Schritt: `scripts/preflight-crm-production.ps1` (read-only) ausführen, Ausgabe prüfen; Live-Dateninventar, Backup, Nummernkreis und Google-OAuth-Zugriff separat kontrollieren.


Stand 23.10.2026. **Technisch vorbereitet; weder ausgerollt noch produktiv freigegeben.**

## Architektur

Die produktive Render-Website sendet Kontaktanfragen weiterhin an Cloud Run **lszh-crm-v2** und in die Firestore-Sammlung **lszh_crm_v2_leads**. Diese Verbindung wird in dieser Phase nicht verändert.

Unser auf dem Surface getestetes CRM (Dashboard, Leads, Kunden, Offerten, Projekte, Rechnungen) verbleibt in **feature/crm-local-preview-20261023** mit ausschliesslich lokalen Testdaten. Die neue Cloud-Integration entsteht aus **main** in einem unabhängigen Branch **feature/crm-v2-cloud-staging-20261023** und enthält keinen unsicheren lokalen Demo-Server.

| Baustein | Cloud Staging | Bestehender Live-Betrieb |
| --- | --- | --- |
| Cloud Run | lszh-crm-v2-staging (neu) | lszh-crm-v2 |
| Firestore-Sammlungen | lszh_crm_v2_staging_* | lszh_crm_v2_* |
| Website-Webhook | deaktiviert; HTTP 404 | unverändert |
| Mitarbeiter-Login | Google OAuth ID-Token + E-Mail-Allowlist | noch nicht eingerichtet |
| Offerten/Rechnungen | authentifizierte HTML-Druckansichten | bestehende Version |
| E-Mail/Kundenversand | kein Versand | unverändert |

**Die Daten befinden sich in derselben GCP-Firestore-Datenbank**, sind durch getrennte Sammlungsnamen isoliert, aber noch nicht durch eine separate IAM-Projektgrenze. Keine lokalen Beispieldaten werden automatisch migriert; die bisherige Live-Lead-Sammlung wird vom Staging-Backend nicht gelesen.

## Portierte Funktionen

- Lead-Status Neu, Kontaktiert, Qualifiziert, Gewonnen und Verloren
- Qualifiziert: genau eine editierbare Offerte mit fortlaufender Nummer
- Gewonnen / Angenommen: Kunden- und Projektanlage mit Referenzen, in Firestore-Transaktion
- Angenommene Offerten, bezahlte und stornierte Rechnungen: schreibgeschützt
- Projektstatus, Termine, Aufgaben und sicher verknüpfte Kunden/Offerten
- Rechnungspositionen, CHF-Berechnung, Nummernkreis, Status und Fälligkeit
- Nur nach Mitarbeiteranmeldung zugängliche PDF-Druckansichten
- Nach 24 Stunden unbearbeitete Leads: interne Erinnerungsvorschau, noch keine Mail

## Entwicklungsverzeichnis auf dem Surface

**Die laufende CRM Live-Vorschau nicht umschalten.** In einem zweiten PowerShell-Fenster ein Git Worktree anlegen:

    cd C:\Users\larss\Projects\lszh-automations-site
    git fetch origin
    git worktree add -b feature/crm-v2-cloud-staging-20261023 ..\lszh-crm-cloud-staging origin/feature/crm-v2-cloud-staging-20261023
    cd ..\lszh-crm-cloud-staging\crm-v2
    node --test

Für die Cloud-Anmeldung ist ein Google-OAuth-Client des Typs **Webanwendung** erforderlich. Seine Client-ID endet auf .apps.googleusercontent.com. Niemals Client Secret oder Passwörter eingeben. Nach dem Staging-Deployment die HTTPS-Service-URL als autorisierten JavaScript-Ursprung in der Google-OAuth-Konfiguration hinterlegen.

Deployment (erst nach Vorliegen des OAuth-Clients):

    cd C:\Users\larss\Projects\lszh-crm-cloud-staging
    .\scripts\deploy-crm-cloud-staging.ps1 -OAuthClientId 'DEINE-ID.apps.googleusercontent.com' -AllowedEmails 'lars@lszh-automations.ch'

Das Script führt lokale Tests aus und deployed ausschliesslich den neuen Service lszh-crm-v2-staging in europe-west6. Die produktive Render-Website und der bisherige lszh-crm-v2-Intake bleiben unberührt.

## Deployment-Nachtrag 23.10.2026 – erster echter Staging-Deploy

**Vom Surface-Pro-PowerShell-Log bestätigt (kein unabhängiger HTTP-Abruf):**

- Nach Umgehung der lokalen PowerShell-Skript-Ausführungsbeschränkung liefen **13/13 Node-Tests erfolgreich**.
- Firestore-Datenbank `projects/lszh-automations/databases/(default)` wurde erfolgreich angesprochen.
- Der separate Cloud-Run-Dienst `lszh-crm-v2-staging` wurde in `europe-west6` als Revision `lszh-crm-v2-staging-00001-mlq` mit 100 % Traffic erstellt.
- Ursprüngliche Warnung beim IAM-Policy-Setzen während `gcloud run deploy`; anschliessendes `gcloud run services update ... --no-invoker-iam-check` meldete erfolgreiches Update. **Öffentliche Erreichbarkeit noch gesondert testen.**
- Zuletzt vom `gcloud run services describe` gemeldete Staging-URL: `https://lszh-crm-v2-staging-ozx7mp2bka-oa.a.run.app`.
- Website-Webhook im Staging deaktiviert. **Bestehender Dienst `lszh-crm-v2` und Render-Website wurden vom Staging-Skript nicht verändert.**
- Die neue eigenständige OAuth-Client-ID wurde vom Nutzer angelegt und beim Staging-Deploy übergeben; **autorisierter JavaScript-Ursprung ist noch zu konfigurieren**. Die Web-Anmeldung mit `lars@lszh-automations.ch` ist **noch nicht end-to-end getestet**.
- Die Live-Staging-URL muss ohne abschliessenden Slash beim OAuth-Webclient unter `Autorisierte JavaScript-Ursprünge` eingetragen werden. Danach echte Anmeldung sowie negative Zugriffsprüfungen durchführen.

Dies ersetzt die Aussage im älteren Erstentwurf, dass kein Deploy erfolgte, ist aber **keine Produktionsfreigabe**.

## Update 23.10.2026 – Google Login nach Neuladen

- Der Cloud-Staging-Login wurde vom Geschäftsführer mit dem Geschäftskonto erfolgreich getestet. Eine neue Website-Testanfrage blieb nach Browser-Neuladen in Firestore bestehen.
- Festgestellt: Vorher war die Google-Anmeldung nach jedem Neuladen erneut manuell nötig. Jetzt versucht Google Identity Services bei geladenem Browser automatisch eine neue Anmeldung mit `auto_select: true`, `button_auto_select: true` und `google.accounts.id.prompt()`.
- **Wichtig:** Eine automatische Anmeldung hängt von Googles und Browsers Datenschutz-/FedCM-Regeln ab. Bei wiederholten Logins, mehreren Konten oder abgelaufener Einwilligung kann weiterhin ein Bestätigungsklick nötig sein. Der reguläre Anmeldeknopf bleibt sichtbar.
- Es werden keine Google-ID-Tokens in Local Storage oder Session Storage persistiert; jede vom Browser zurückgegebene Credential wird weiterhin durch die Cloud-API validiert. «Abmelden» deaktiviert die automatische Kontoauswahl.
- Tests: `crm-v2/test/cloud-signin-ui.test.js`. Nach Änderung **Cloud-Staging neu deployen**, die bereits laufende Cloud-Run-Revision übernimmt GitHub-Änderungen nicht automatisch.

## Update 23.10.2026 – Zweites Cloud-Staging-Deployment

PowerShell-Ausgabe des zweiten Deploys vom Nutzer bestätigt:
- `git pull --ff-only` hat die Google-One-Tap-Verbesserung und Tests ins zweite Worktree übernommen.
- 15/15 Node-Tests bestanden; Cloud Build erfolgreich; Revision `lszh-crm-v2-staging-00002-fgh` erhält 100 % Traffic.
- Dienst `lszh-crm-v2-staging` in `europe-west6`; aktuelle URL unverändert: `https://lszh-crm-v2-staging-ozx7mp2bka-oa.a.run.app`.
- `gcloud run deploy` meldete Warnung zu initialer IAM-Policy, gefolgt von erfolgreichem `gcloud run services update --no-invoker-iam-check`. Browsererreichbarkeit ist separat zu bestätigen.
- Test im echten Browser ausstehend: erneute Anmeldung nach F5, bestehender Testlead bleibt erhalten, Qualifiziert erzeugt genau eine Offerte, Gewonnen Kunde und Projekt. Die Tests waren unit-/simulierte Firestore-Tests und kein echter Lead-Workflow-E2E.
- Produktiver Cloud-Run-Dienst `lszh-crm-v2`, Website-Intake und Make-Szenarien wurden durch das Staging-Skript nicht geändert. Kein Cutover.

## Bestätigung aus dem Browser – 23.10.2026

Der Nutzer bestätigt nach Revision `lszh-crm-v2-staging-00002-fgh` ausdrücklich, dass die zuletzt geprüften Abläufe funktionieren: Google-Login / erneutes Laden des Cloud CRM, Persistenz des bereits erstellten Testleads und `Qualifiziert` → automatische, verknüpfte Offerte. Diese Feststellung beruht auf dem Nutzertest im echten Browser, nicht auf einem unabhängigen API-Abruf.

**Noch nicht dadurch nachgewiesen:** vollständiger E2E-Pfad `Angenommen/Gewonnen → Kunde → Projekt → Rechnung → Bezahlt` in der Cloud; Rollen-/Negativtests, Website-Eingangsmigration, Live-Datenübernahme, sichere Produktionsumschaltung. Cloud-Staging bleibt vom produktiven Website-Eingang getrennt.

## Erfolgreicher Cloud-End-to-End-Geschäftstest – 23.10.2026

Der Nutzer bestätigt nach manueller Browserprüfung ausdrücklich, dass der komplette CRM-V2-Geschäftsprozess im Cloud-Run-Staging funktioniert:

1. Testlead in Firestore gespeichert und nach Neuladen weiterhin vorhanden.
2. Lead `Qualifiziert` erstellt automatisch eine verknüpfte Offerte.
3. Offerte `Angenommen` legt Kunde und Projekt an.
4. Projekt ermöglicht das Erstellen einer Rechnung.
5. Rechnung wurde erfolgreich durch `Offen` bis `Bezahlt` geführt.

Diese Abnahme beruht auf einem **realen Nutzertest im Cloud-Staging**, nicht auf einer selbst ausgeführten unabhängigen API-Prüfung. Das ist **keine Produktionsfreigabe**. Noch offen sind insbesondere Berechtigungs-/Negativtests, Verbindung des produktiven Website-Eingangs, Daten- und Nummernkreisprüfung, Backup/Rollback, reale interne Reminder-E-Mails und produktive Swiss-QR-Rechnungen.

## Website-Intake / Produktivvorbereitung – 23.10.2026

Die Website-Codeprüfung zeigt: Das öffentliche Hauptformular nutzt bereits `POST /api/lead` auf Render und den serverseitigen `CRM_LEAD_INGEST_URL`-Proxy zu Cloud Run / Firestore, nicht direkt Make/Airtable. Render-Umgebungsvariablen und ihr tatsächlicher Live-Zustand sind noch separat zu prüfen.

**Codeänderung ohne Live-Eingriff:** `crm-v2/lead-ingest.js` akzeptiert nur die explizit zugelassenen Firestore-Leadsammlungen. `crm-v2/server.js` übergibt `CRM_RECORD_PREFIX+'leads'`; ein künstlicher Staging-Aufruf kann deshalb nie in `lszh_crm_v2_leads` schreiben. Die produktive Website und Cloud-Run-Live-Revision wurden nicht geändert.

**Zusätzliche Prüfer:** `test/cloud-website-intake.test.js` testet den tatsächlichen Node-HTTP-Endpunkt mit in-memory Firestore. `scripts/test-crm-website-intake-staging.ps1` prüft nach erneutem Staging-Deploy die reale Cloud-Run-Strecke (201/200/409/401) mit einem dedizierten Staging-Secret und deaktiviert den Eingang wieder. `scripts/preflight-crm-production.ps1` liest nur Cloud-Run-Metadaten, keine Geheimnisse.

**Kein Produktiv-Cutover:** Die Website bleibt auf dem bestehenden Cloud-Run-Ziel. Erst bestehende Live-Lead-Sammlung, Sequenznummern, Backup, OAuth, Render-Ziel/Secrets und Rückfallrevision prüfen. Siehe `crm-v2/WEBSITE-CUTOVER.md`.

## Live-Cloud-Run-Preflight am 23.10.2026 bestätigt

Aus dem vom Geschäftsführer ausgeführten Read-only-Skript: `lszh-crm-v2` läuft weiterhin mit Revision `lszh-crm-v2-00002-6lh` (100 % Traffic) und dem bestehenden Dienstkonto. Der Website-Intake-Schlüssel ist weiterhin als Secret-Manager-Referenz hinterlegt. `CRM_RECORD_PREFIX` und `CRM_WEBSITE_INTAKE_ENABLED` fehlen noch absichtlich in der alten produktiven Serverversion; vor einem späteren Deployment müssen sie ausdrücklich auf `lszh_crm_v2_` und `true` gesetzt werden. Staging verwendet weiterhin `lszh_crm_v2_staging_` und hat den Website-Eingang deaktiviert.

Der neue **rein lesende** Firestore-Inventarbefehl `scripts/inventory-crm-firestore-readonly.ps1` zeigt lediglich die Anzahlen der fünf Collections und die Zähler `offer_sequence` / `invoice_sequence` für Live und Staging. Noch nicht ausgeführt; die Inventarzahlen sind **unbekannt**. Kein Produktiv-Deployment durchgeführt.

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

## Noch offen vor Produktion

1. Google-OAuth-Client, autorisierter Service-Ursprung und Workspace-Login einrichten.
2. Staging deployen und mit synthetischen Firestore-Datensätzen vollständig testen, inklusive zweier paralleler Statuswechsel.
3. Unangemeldete API- und Druckaufrufe müssen HTTP 401 liefern, Staging-Website-Webhook HTTP 404; keine fremden Konten zulassen.
4. Rollen und Servicekonto-IAM, Firestore-Backup und Rollback prüfen; produktiven Nummernkreis sowie historische Status gegen vorhandene Daten abgleichen.
5. Für späteren Cutover explizit freigeben: bestehender Dienst muss Website-Intake-Secret und Live-Sammlung behalten. Nicht ohne Rollback und Abnahme ersetzen.
6. 24h-Mail nur mit bestätigtem internem Empfänger und idempotentem Scheduler; Swiss-QR erst nach verifizierter Bankverbindung und MWST-Konfiguration.

## Aktueller Prüfstand

Die JS-Syntax und sieben simulierte Firestore-Transaktions-Regressionstests wurden überprüft. GitHub Actions überwacht den Staging-Branch. **In diesem Schritt fand noch kein Cloud-Run-Deploy und kein echter Firestore-End-to-End-Test statt.**
