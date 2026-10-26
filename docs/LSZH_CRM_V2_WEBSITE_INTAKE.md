> Historische Einrichtungsanleitung: PR #10 ist seit 22.10.2026 gemergt, der Website-V2-Eingang ist produktiv aktiviert. Aktueller Stand: [Produktionsrelease 26.10.2026](LSZH_PRODUCTION_RELEASE_20261026.md).

# LSZH CRM V2 – Websiteformular direkt an Firestore

Stand: 22.10.2026. Implementiert im Entwicklungsbranch `feature/crm-v2-foundation-20261022`; **noch nicht produktiv geschaltet**.

## Ziel und Ablauf

```
Öffentliche Website / Kontaktformular
  POST /api/lead (gleicher Ursprung; Website-Server bei Render)
    -> HTTPS POST /api/internal/website-leads (separater CRM-V2-Cloud-Run-Dienst)
       -> Bearer-Secret serverseitig prüfen
       -> Pflichtfelder, E-Mail, Längen, Adressfelder prüfen
       -> Firestore lszh_crm_v2_leads / web_<UUID>
       -> 201 {ok:true, confirmed:true, recordId, created:true}
    <- Nur mit expliziter bestätigter Datensatz-ID als erfolgreich behandeln
<- 200 {ok:true, confirmed:true, recordId}
```

Die Website hat eine `submission_id` pro Formularausfüllung; nach einem temporären Fehler wird dieselbe ID für erneutes Absenden verwendet. Der CRM-Dienst nutzt `create()` und prüft bei Wiederholung die identischen Formulardaten. Dadurch keine doppelten Leads bei üblichen Wiederholungen. Keine automatischen Kunden-E-Mails.

**Kein Airtable und kein Make** in dieser Strecke. Die bisherige Make-Webhook-Umgebungsvariable `MAKE_LEAD_WEBHOOK` wird nicht verwendet. Falls das CRM noch nicht konfiguriert oder Firestore nicht erreichbar ist, liefert die Website einen Fehler und zeigt **keine Erfolgsmeldung**.

## Übertragene Angaben

Name, Firma, E-Mail, optionale Strasse/Hausnummer, PLZ, Ort, Land, Automationswunsch, heutiger Prozess, verwendete Systeme, Hauptproblem, Häufigkeit und optionales Wunschergebnis. In Firestore: `postal_code -> postalCode`, `current_process -> currentProcess`, `main_problem -> mainProblem`, `desired_result -> desiredResult`; Status `Neu`.

## Sichere Einrichtung – Reihenfolge

1. Bestehenden GitHub-Branch aktualisieren. Keine fremden lokalen Änderungen überschreiben.
2. `cd crm-v2; npm install; npm test; npm run check; cd ..` ausführen.
3. Aus dem Repository-Root in PowerShell `./scripts/deploy-crm-intake.ps1` ausführen. Das Skript erstellt bei Bedarf das dedizierte Cloud-Run-Dienstkonto, prüft Firestore, erstellt den Secret-Manager-Schlüssel und stellt `lszh-crm-v2` nach `europe-west6` bereit. **Benötigt vorhandene GCP-Anmeldung und die erforderlichen Google-Cloud-Berechtigungen.** Die Website wird dabei nicht umgestellt.
4. Im Render-Webdienst `lszh-automations-site` über `Environment` die zwei Variablen hinterlegen:
   - `CRM_LEAD_INGEST_URL`: die vom Skript ausgegebene Cloud-Run-URL plus `/api/internal/website-leads`.
   - `CRM_INGEST_SECRET`: derselbe Geheimwert wie im Cloud Run Secret Manager; das Skript kopiert ihn ausschliesslich in die **lokale** Zwischenablage. Nicht im Chat oder GitHub teilen. Danach Zwischenablage leeren.
5. **Erst jetzt** den PR #10 nach Codeprüfung und Testfreigabe mit `main` zusammenführen. Der Render-Dienst `lszh-automations-site` wird laut tatsächlicher Dienstkonfiguration aus `main` automatisch bereitgestellt. Damit wird das Websiteformular auf das CRM umgeschaltet.
6. Ein ausdrücklich gekennzeichnetes synthetisches Testformular auf der echten Website absenden, erfolgreiche `200`-Antwort mit `confirmed:true` kontrollieren und in Firestore nachsehen: **genau ein** `lszh_crm_v2_leads/web_<uuid>`-Datensatz. Gleiche `submission_id` erneut mit gleicher Eingabe -> gleiches Ergebnis, kein Duplikat. Andere Eingaben mit derselben ID -> HTTP 409.
7. Prüfen, dass fehlender oder falscher Bearer-Secret am CRM-Endpunkt HTTP 401 liefert und Firestore bei Schreibfehlern keine bestätigte Website-Meldung auslöst.

## Wichtige Grenzen

- Das CRM-Webinterface kann erst nach zusätzlicher Konfiguration von `GOOGLE_OAUTH_CLIENT_ID` und `CRM_ALLOWED_EMAILS` benutzt werden. Der Website-Leadeingang ist davon bewusst unabhängig und schreibt direkt nach Firestore.
- Diese Phase betrifft **nur den Website-Lead-Eingang**. Alte Seitenfunktionen `/api/onboarding`, `/api/secure/` und PDF-/Offertenflüsse können weiterhin auf inzwischen gelöschten Make-Szenarien beruhen; nicht als produktiv getestet betrachten.
- Keine produktiven Anfragen oder echte Kundendaten als Test verwenden, bevor Live-Nachweis vollständig ist.
- Die Website wird im PR, **nicht** durch das Deployment-Skript, verändert. Vor dem Merge bleibt Render auf seiner bisherigen Main-Revision und verwendet möglicherweise noch den gelöschten Make-Webhook.
- Firestore `(default)` muss im Projekt bereits vorhanden sein. Der Endpunkt ist über HTTPS erreichbar, aber ein Zugriff ist nur mit dem gemeinsamen serverseitigen Geheimnis möglich. Geheimnis nicht im Browser oder öffentlich ausgeben.
- Die Quelle der CRM-UI bleibt `crm-v2/public/index.html`, das Backend `crm-v2/server.js` und die zentrale Eingabefeld-/Duplikatlogik `crm-v2/lead-ingest.js`.
