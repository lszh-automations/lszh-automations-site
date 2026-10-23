# LSZH CRM V2 – Kunden- und Lead-Mails (Stand: 23.10.2026)

## Ziel

Drei unabhängige, transaktionale Nachrichten im CRM V2 – **nicht** über Airtable:

1. **Eingangsbestätigung an den Kunden:** Empfänger ist ausschliesslich die im neuen Website-Lead gespeicherte E-Mail-Adresse. Inhalt: Eingang bestätigt, Rückmeldung angekündigt, ausdrücklich noch kein Vertragsabschluss.
2. **Interne Meldung bei neuem Lead:** Empfänger `lars@lszh-automations.ch`. Enthält Unternehmensname, Kontakt, Anfrage und CRM-Link.
3. **Interne 24h-Erinnerung:** Nur wenn der Lead bei der Kontrolle mindestens 24h alt ist und **aktuell** den Status `Neu` trägt. Je Lead höchstens eine Erinnerung. Andere Status führen zu keiner Erinnerung.

Absender für alle drei Typen: eingerichtete geschäftliche Gmail-Sendeidentität **LSZH Automations <info@lszh-automations.ch>**; Make Google-E-Mail-Modul über vorhandene Geschäftskonto-Verbindung **11904991** (vorhandener bestätigter Send-as-Alias). **Keine Nutzung der privaten Gmail-Verbindung.**

## Architektur

```text
Öffentliche Website → Render /api/lead → Cloud Run /api/internal/website-leads → Firestore lszh_crm_v2_leads
                                                                                      |
Google Cloud Scheduler (jede Minute, Google OIDC) → Cloud Run /api/internal/mail/tick ─+
                                                                                      |
                                             Firestore lszh_crm_v2_mail_events (einmalige Claims)
                                                                                      |
                                           Make Webhook → Google Gmail geschäftlich → Webhook Response
```

- Der Versand erfolgt **nicht innerhalb der öffentlichen Formularantwort**. Mailprovider-Fehler dürfen Website-Leads nicht blockieren.
- Die Abfrage läuft nach geplanter Aktivierung ungefähr minütlich. Die 24h-Erinnerung wird damit in der Regel zwischen 24h und 24h+1 Minute verschickt, sofern der Lead noch `Neu` ist.
- Die drei Firestore-Ereignis-IDs sind deterministisch (`customer_ack__<leadId>`, `internal_new__<leadId>`, `internal_24h__<leadId>`).
- Der Claim mit Status `sending` erfolgt vor dem externen Send-Aufruf. Make muss **erst nach erfolgreicher Gmail-Aktion** mit `{"ok":true,"messageId":"<Gmail-ID>"}` antworten. Erst dann wird der Datensatz als `confirmed` markiert. Bei unklarem Ergebnis steht er auf `manual_review` und wird **nicht automatisch erneut versendet**, weil bei Timeouts eine Mail bereits verschickt worden sein könnte.
- `TEST_ONLY`-Leads und `example.com/.org/.net` werden nicht angeschrieben; alte Leads von vor dem ausdrücklich konfigurierten Aktivierungszeitpunkt ebenfalls nicht.
- Der Webhook ist ein geheim zu haltender Zugangslink; er darf nur als **Secret-Manager-Secret** an die CRM-Cloud-Run-Revision gebunden werden, nie in GitHub, Chat, Logs oder öffentliche Website-Variablen.

## Aktueller Umsetzungsstand

- `crm-v2/mail-templates.js`: alle drei HTML-Vorlagen, sichere HTML-Escapes, Status-/Zeitregel.
- `crm-v2/mail-dispatcher.js`: Firestore-Ereignisse und einmaliger, kontrollierter Gateway-Aufruf; bei Fehlern manuelle Prüfung.
- `crm-v2/server.js`: neuer Cron-Endpunkt `POST /api/internal/mail/tick`, geschützt mit Google-signiertem OIDC-ID-Token einer genau vorgegebenen Servicekonto-Adresse.
- `crm-v2/test/mail-notifications.test.js`: Testfälle für Mailinhalte, Empfänger, 24h-Bedingung, genau einmal, Timeouts und deaktivierten Modus.
- Make-Szenario **8135270** `LSZH CRM V2 – Mailversand (TEST ONLY / INAKTIV)` angelegt, **inaktiv**, bisher nur generischer Webhook. Es befindet sich im Lernmodus, damit eine TEST_ONLY-Payload die erwarteten Datenfelder `eventId,kind,to,subject,html` definiert.
- Geschäftliche Gmail-Verbindung 11904991 und Absenderalias `info@lszh-automations.ch` im verbundenen Make-Modul bestätigt.
- `scripts/learn-crm-mail-webhook.ps1`: Script für den synthetischen Lernaufruf, fragt die Make-Webhook-URL versteckt ab. Sendet **keine** echte Mail, solange Szenario inaktiv/lernt.
- **Noch nicht deployed; noch kein produktiver E-Mail-Versand; bestehende CRM-Live-Revision bleibt `lszh-crm-v2-00006-moz`.**

## Nächste Arbeitsschritte (zielgerichtet)

1. Geschäftsführer führt `git pull --ff-only`, `npm.cmd test --prefix .\crm-v2` und `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\learn-crm-mail-webhook.ps1` aus. Die geheime Webhook-URL wird lokal aus dem Make-Szenario kopiert, **nicht** in den Chat.
2. Nach Lern-POST Datenstruktur mit `mcp__Make__scenario_trigger_inspect` verifizieren. Den Business-Gmail-Send-Modul v4 anhängen, Felder `to,subject,html` aus dem Webhook mappen und WebhookResponse erst **nach** dem Gmail-Senden mit `ok:true,messageId` antworten lassen. Nur das Geschäftskonto 11904991 verwenden.
3. Mit einer **synthetischen internen Mail** an `lars@lszh-automations.ch` die tatsächliche Gmail-Ausführung und Make-Webhook-Response prüfen. Kundennachrichten vorher nicht produktiv senden.
4. Secret Manager und servicekontogeschützte Cloud-Scheduler-Jobkonfiguration in Zürich einrichten. Neuer Cloud-Run-Kandidat zuerst mit `--no-traffic` und ausgeschaltetem Mail-Gate deployen, Secret-/IAM-/Website-Intake-Verweise unverändert bewahren, OIDC-Schutz testen.
5. Einen Aktivierungszeitpunkt `CRM_MAIL_ACTIVE_FROM` setzen, damit **keine** alten, bereits gespeicherten Leads rückwirkend Kundenmails erhalten. Erst nach Abnahme `CRM_MAIL_ENABLED=true` und Cloud Scheduler (voraussichtlich minütlich) aktivieren; anschliessend echte Mailbestätigung, interne Sofort-Mail und konditionale 24h-Mail prüfen.
6. Rückfallrevision `lszh-crm-v2-00006-moz` bewahren. Beim Fehler: Mail-Scheduler deaktivieren und Mailfunktion zurückrollen, **nicht** den Website-Lead-Eingang verlieren.

**Bekannte Grenze:** `mail-dispatcher.js` scannt derzeit maximal die neuesten 100 Leads; bei grösserem Eingang müssen wir die Abfrage paginieren und für 24h-Kandidaten gesondert indizieren. Erstens ist das für die initiale KMU-Nutzung vertretbar, aber noch keine unbegrenzte Skalierung. Eine Gmail-Antwort kann verspätet sein, deshalb werden unklare Fälle bewusst nicht automatisch wiederholt.
