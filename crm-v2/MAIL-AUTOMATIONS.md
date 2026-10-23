## Stand: drei CRM-E-Mail-Automationen technisch vorbereitet, noch nicht produktiv (23.10.2026)

Make-Szenario [8135270](https://eu1.make.com/1728770/scenarios/8135270) wurde nach dem erfolgreichen geschäftlichen Gmail-Test **deaktiviert**. Das Gmail-Modul nutzt weiterhin ausschliesslich den bestätigten Geschäftskonto-Connector `11904991` und den Send-as-Absender `LSZH Automations <info@lszh-automations.ch>`. Der vorherige `TEST_ONLY`-Filter ist durch drei OR-Filter für die genauen Ereignistypen `customer_ack`, `internal_new`, `internal_24h` ersetzt worden. Die beiden internen Typen sind auf `lars@lszh-automations.ch` festgelegt; alle drei benötigen ein zu ihrem Typ passendes Firestore-Ereignis mit `__web_` in der Kennung. Die Webhook-Warteschlange war bei der Prüfung **leer**. **Das Szenario bleibt bis zur bestätigten Produktionsfreigabe inaktiv; keine weiteren Mails senden.**

Die CRM-Logik verschickt nun ausschliesslich E-Mails für tatsächliche Website-Leads (`source='LSZH Automations Website'` und ID `web_` mit 32 hex-Zeichen); manuell erfasste CRM-Kontakte, Testdatensätze und vor der späteren Aktivierung erstellte Leads werden ausgeschlossen. Neue Regressionstests für diese Einschränkung sind implementiert; der vollständige neue Testlauf auf dem Surface steht noch aus.

Das neue Skript `scripts/prepare-crm-mail-live.ps1` ist **nur eine Vorbereitung**: Es prüft alle CRM-Tests und den Live-Cutover-Stand, legt bei Bedarf den Make-Webhook als Google-Secret-Manager-Secret ab, berechtigt ausschliesslich das bestehende CRM-Dienstkonto für dieses Secret, erstellt ein dediziertes Scheduler-Dienstkonto und einen **pausierten** OIDC-Scheduler-Job. Anschliessend deployt es eine CRM-Revision mit `CRM_MAIL_ENABLED=false` und **0 % produktivem Traffic**; der bisherige Website→CRM-Betrieb bleibt auf `lszh-crm-v2-00006-moz`. Staging und Live werden per HTTP getestet, einschliesslich `POST /api/internal/mail/tick` mit HTTP 404 (deaktiviert). Es werden durch dieses Skript keine E-Mails verschickt.

**Nächster Schritt:** Auf dem Surface `git pull --ff-only` und das Vorbereitungsskript ausführen (Make-Webhook-URL nur im verdeckten PowerShell-Prompt eingeben, nie im Chat). Danach anhand der Konsolenausgabe die abgesicherte, pausierte Cloud-Scheduler-/Cloud-Run-Bereitstellung überprüfen. Erst nach separater Kundenmail-Freigabe Make aktivieren, die Mailfunktion mit einem neuen Aktivierungszeitpunkt scharf schalten und den minütlichen Scheduler freigeben. Vorher ausdrücklich **nicht** `gcloud scheduler jobs resume` ausführen.
## Stand nach erstem geschäftlichem Gmail-Test, 23.10.2026

**30/30 Regressionstests auf dem Surface PASS.** Einmaliger interner Test über Make-Szenario 8135270 erfolgreich: Ausführung `1d1c977319374415930355e5329ece88` meldete `success`, Gmail Modul 2 `sendAnEmail` lieferte Message-ID **`1a168aef163cbf9f`**, und WebhookRespond Modul 3 wurde ausgeführt. Empfänger war nur `lars@lszh-automations.ch`, Absender `info@lszh-automations.ch`, Betreff begann mit `[TEST_ONLY]`. Der Test-Client erhielt zwar HTTP 200, aber keinen auswertbaren synchronen JSON-Versandbeleg; Ursache noch nicht abschliessend festgestellt. WebhookRespond liefert jetzt explizit `Content-Type: application/json; charset=utf-8`. **Den Test nicht wiederholen, da Gmail den Versand bereits bestätigt hat.** Keine automatische produktive Kundenbestätigung oder 24h-Erinnerung aktiviert. Produktive CRM-Revision unverändert `lszh-crm-v2-00006-moz`.

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
- Make-Szenario **8135270** ist **INAKTIV** und auf genau die drei vorgesehenen CRM-Mailtypen (`customer_ack`, `internal_new`, `internal_24h`) gefiltert. Das Geschäftskonto `11904991`, der Send-as-Alias und die Webhook-Response sind bereits erfolgreich im internen Test geprüft; der produktive Versand wurde noch nicht freigegeben.
- Geschäftliche Gmail-Verbindung 11904991 und Absenderalias `info@lszh-automations.ch` im verbundenen Make-Modul bestätigt.
- `scripts/learn-crm-mail-webhook.ps1`: abgeschlossener Webhook-Lernaufruf. Für weitere Tests **nicht** verwenden, da das Szenario jetzt im eingeschränkten Testmodus aktiviert ist.
- `scripts/test-crm-business-mail.ps1`: sendet **eine echte, ausdrücklich `TEST_ONLY` gekennzeichnete interne Mail** über Make und geschäftliches Gmail. Die Webhook-URL wird ausschliesslich verdeckt in PowerShell eingegeben; kein Kundendatum wird übertragen.
- **Noch keine produktive Mail-Revision deployed, keine Kunden- oder 24h-E-Mail aktiv; bestehende CRM-Live-Revision bleibt `lszh-crm-v2-00006-moz`.**

## Nächste Arbeitsschritte (zielgerichtet)

1. Geschäftsführer führt `git pull --ff-only` und `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-crm-mail-live.ps1` aus. Das neue Skript wiederholt die CRM-Tests und bereitet ein **maildeaktiviertes** 0%-Deployment mit pausiertem Scheduler vor. Die geheime Webhook-URL wird ausschliesslich lokal eingegeben.
2. Nach der internen Testmail die Make-Ausführung und Gmail-Nachrichten-ID überprüfen; nur bei `ok:true` plus `messageId` gilt die Integration als bestätigt. Ein unklarer HTTP-Response darf nicht durch blindes Wiederholen weitere Testmails auslösen.
3. Vor produktiven Kundennachrichten den internen Testfilter gezielt auf eine strengere Validierung der drei Mailtypen anpassen. Vorher Absender, Empfänger, Mailinhalt und Webhook-Berechtigung testen; der derzeitige aktive Testfilter bleibt bis dahin aktiv.
4. Secret Manager und servicekontogeschützte Cloud-Scheduler-Jobkonfiguration in Zürich einrichten. Neuer Cloud-Run-Kandidat zuerst mit `--no-traffic` und ausgeschaltetem Mail-Gate deployen, Secret-/IAM-/Website-Intake-Verweise unverändert bewahren, OIDC-Schutz testen.
5. Einen Aktivierungszeitpunkt `CRM_MAIL_ACTIVE_FROM` setzen, damit **keine** alten, bereits gespeicherten Leads rückwirkend Kundenmails erhalten. Erst nach Abnahme `CRM_MAIL_ENABLED=true` und Cloud Scheduler (voraussichtlich minütlich) aktivieren; anschliessend echte Mailbestätigung, interne Sofort-Mail und konditionale 24h-Mail prüfen.
6. Rückfallrevision `lszh-crm-v2-00006-moz` bewahren. Beim Fehler: Mail-Scheduler deaktivieren und Mailfunktion zurückrollen, **nicht** den Website-Lead-Eingang verlieren.

**Bekannte Grenze:** `mail-dispatcher.js` scannt derzeit maximal die neuesten 100 Leads; bei grösserem Eingang müssen wir die Abfrage paginieren und für 24h-Kandidaten gesondert indizieren. Erstens ist das für die initiale KMU-Nutzung vertretbar, aber noch keine unbegrenzte Skalierung. Eine Gmail-Antwort kann verspätet sein, deshalb werden unklare Fälle bewusst nicht automatisch wiederholt.
