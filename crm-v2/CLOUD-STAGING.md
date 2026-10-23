# LSZH CRM V2 – Cloud Staging und Firestore-Übernahme

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

## Noch offen vor Produktion

1. Google-OAuth-Client, autorisierter Service-Ursprung und Workspace-Login einrichten.
2. Staging deployen und mit synthetischen Firestore-Datensätzen vollständig testen, inklusive zweier paralleler Statuswechsel.
3. Unangemeldete API- und Druckaufrufe müssen HTTP 401 liefern, Staging-Website-Webhook HTTP 404; keine fremden Konten zulassen.
4. Rollen und Servicekonto-IAM, Firestore-Backup und Rollback prüfen; produktiven Nummernkreis sowie historische Status gegen vorhandene Daten abgleichen.
5. Für späteren Cutover explizit freigeben: bestehender Dienst muss Website-Intake-Secret und Live-Sammlung behalten. Nicht ohne Rollback und Abnahme ersetzen.
6. 24h-Mail nur mit bestätigtem internem Empfänger und idempotentem Scheduler; Swiss-QR erst nach verifizierter Bankverbindung und MWST-Konfiguration.

## Aktueller Prüfstand

Die JS-Syntax und sieben simulierte Firestore-Transaktions-Regressionstests wurden überprüft. GitHub Actions überwacht den Staging-Branch. **In diesem Schritt fand noch kein Cloud-Run-Deploy und kein echter Firestore-End-to-End-Test statt.**
