## Interne Lead-Mails im LSZH-Design – Release vorbereitet (23.10.2026)

Die zwei internen Benachrichtigungen `internal_new` (neuer Website-Lead) und `internal_24h` (nach 24 Stunden noch `Neu`) verwenden nun denselben LSZH-Markenauftritt wie die live geschaltete Kundenbestätigung: navyfarbener Header, Dreifarben-Akzentlinie, aufgeräumte Kontaktübersicht, Anfrage im eigenen Abschnitt und eine feste Schaltfläche «Live-CRM öffnen». Für beide Varianten werden ausschliesslich statische Links und inline-styles ohne externe Assets, JavaScript oder SVG verwendet; alle dynamischen Felder werden HTML-escaped.

**Unverändert:** Kundenbestätigung, die zwei internen Betreffzeilen und Empfänger (`lars@lszh-automations.ch`), Website-Lead-Filter, automatisches einmaliges Versenden, 24h-Bedingung, Scheduler-Cutoff `2026-10-23T16:15:28Z`, Firestore-Outbox und Make/Gmail-Verbindung.

Für zwei Offline-Vorschauen mit erfundenen Beispieldaten (ohne Versand):

```powershell
node.cmd .\scripts\preview-crm-internal-mails.js
Start-Process (Join-Path $env:TEMP 'lszh-crm-interne-leadmail-vorschau.html')
Start-Process (Join-Path $env:TEMP 'lszh-crm-interne-24h-vorschau.html')
```

**Produktionsumschaltung:** Nach erfolgreich durchlaufener GitHub-CI den autorisierten Surface-Checkout aktualisieren und das gesonderte Release-Skript ausführen. Es akzeptiert nur die vom letzten Go-Live bestätigte Live-Revision `lszh-crm-v2-00012-haz`, prüft die E-Mail- und CRM-Umgebungsvariablen, den aktiven OIDC-Scheduler und die HTTP-Schutzendpunkte, baut einen Kandidaten mit 0 % Live-Traffic und schaltet erst nach erfolgreicher Prüfung um. Bei Fehlschlag nach Umschaltung wird auf `00012-haz` zurückgeschaltet. **Kein SMTP-/Gmail-Testversand und keine Neuanlage von Mail-Events im Skript.**

```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\deploy-crm-internal-mail-design-live.ps1"
```

Status: Im GitHub-Branch integriert, produktiv erst nach bestätigtem `INTERNAL MAIL DESIGN LIVE PASS`. Der aktive Cloud-Scheduler und der bisherige E-Mail-Versand bleiben bis dahin unverändert.

---

## LSZH-Kundenmail – produktiven Design-Rollout vorbereitet (23.10.2026)

Das neue HTML liegt in `crm-v2/mail-templates.js` auf `feature/crm-v2-cloud-staging-20261023`. Kundenseitiges Branding ist fertig; interne Lead- und 24h-Mails bleiben unverändert. Make-Szenario 8135270 ist live aktiv, das Gmail-Modul übergibt unverändert `{{1.html}}`; deshalb wird das neue Design nicht in Make, sondern durch eine neue CRM-Cloud-Run-Revision aktiviert.

Ein abgesichertes PowerShell-Release liegt unter `scripts/deploy-crm-customer-mail-design-live.ps1`. Es prüft die bekannte Live-Revision `lszh-crm-v2-00010-raf`, aktive Scheduler-Konfiguration, bestehenden Mail-Cutoff, Dienstkonto/Secrets/Env, alle CRM-Tests und anonyme HTTP-Schutzendpunkte. Die neue Revision wird zuerst mit **0 % Traffic** gebaut und geprüft; nur bei bestandenen Kontrollen wird 100 % Traffic auf sie umgeschaltet. Bei Fehlern nach Umschaltung erfolgt Rollback auf `00010-raf`. Keine direkten E-Mail-Testsendungen, kein Zurücksetzen von `mail_events`, keine Änderung an Make oder Scheduler.

Auszuführen auf dem autorisierten Surface mit `gcloud.cmd`-Zugang:

```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\deploy-crm-customer-mail-design-live.ps1"
```

**Status:** Quellcode und Deploy-Skript im Entwicklungsbranch versioniert; produktive Bereitstellung ist erst nach erfolgreichem Skriptlauf bestätigt. Das CI prüft das Skript inklusive PowerShell-Syntax, baut aber selbst **keinen** Cloud-Run-Dienst. Ein vorhandener Versand bleibt bis zur Umschaltung auf der alten Darstellung.

---

## Kundenbestätigung im LSZH-Website-Design – vorbereitet, noch nicht deployed

Die **ausschliesslich kundenseitige** Bestätigung wurde in `crm-v2/mail-templates.js` optisch an das produktive `index.html` angelehnt. Verbindliche LSZH-Website-Farben: Navy `#06101d`, dunkel `#0a1728`, Text `#0f1726`, Hintergrund `#f4f7fb`, Akzente Cyan `#74d8ff`, Blau `#5b8cff`, Violett `#8e72ff`. Header im Navy/Blau-Stil mit typografischer LSZH-Wortmarke und vereinfachtem L-Zeichen als E-Mail-kompatible Darstellung (das SVG der Website wird bewusst NICHT eingebettet, da E-Mail-Clients SVG nicht zuverlässig darstellen). Farbige Dreier-Akzentlinie, weisser Inhalt, personalisierte Anrede, verständlicher «Wie geht es weiter?»-Block, Signatur und dunkler Geschäftsfooter mit `LSZH Invest GmbH`, `Rummelmatt 8, 5610 Wohlen AG`, `info@lszh-automations.ch` sowie `https://lszh-automations.ch/`.

Das HTML verwendet tabellenbasiertes, inline gestyltes E-Mail-Layout ohne JavaScript, SVG, externe Fonts/Bilder oder dynamisch von Kunden kontrollierte Links. Kundenname wird HTML-escaped; sensible Anfragetexte werden NICHT an den Kunden zurückgeschickt. Betreff, Empfänger, Versandtrigger und vorliegende Eindeutigkeits-/24h-Regeln bleiben unverändert. **Die internen Mails sind optisch und inhaltlich noch auf dem alten Stand und wurden absichtlich nicht angefasst.** Zwei neue Tests prüfen Kundenbranding, Sicherheit, erreichbare öffentliche Links und dass die internen Templates unverändert bleiben. Ein lokaler Lauf der Template-Funktion (statischer Beispiel-Lead) bestätigte alle Brand-/Escape-/Empfänger-Assertions; vollständige 31+ CRM-Testreihe muss noch auf dem Surface laufen.

**Lokale Vorschau, ohne E-Mail-Versand:** Nach `git pull --ff-only` im CRM-Checkout:

```powershell
node.cmd .\scripts\preview-crm-customer-mail.js
Start-Process (Join-Path $env:TEMP 'lszh-crm-kundenmail-vorschau.html')
```

Die Vorschau verwendet einen erfundenen Musterkunden und erzeugt ausschliesslich eine lokale HTML-Datei im Benutzer-TEMP-Verzeichnis. **Keine Änderung an Cloud Run, Make, Cloud Scheduler oder bestehenden Kunden-E-Mails**, solange keine neue CRM-Revision mit dem aktualisierten Quellcode deployed wird. Nach visuellem Check folgt eine kontrollierte E-Mail-Vorlagenrevision bei unverändertem Aktivierungszeitpunkt und ohne erneutes Versenden früherer Ereignisse.

## Make aktiv – letzte Produktivschaltung vorbereitet (23.10.2026)

Der Geschäftsführer hat **Make-Szenario 8135270 aktiviert**; unmittelbar danach über die Make-App als `active` bestätigt. Vorhandene geschäftliche Gmail-Verbindung 11904991 war `ok`, Webhook-Warteschlange `0`, alle drei Mailfilter für `customer_ack`, `internal_new`, `internal_24h` vorhanden. Es wurden hierbei keine neuen Webhook-Daten oder Kundenmails abgeschickt.

Cloud Run-Cutover erfolgreich laut Surface-Ausgabe: **31/31 CRM-Tests PASS**, alte Mail-Revision `lszh-crm-v2-00008-zog` nimmt **100 % Traffic** und bedient Website→Firestore unverändert, Mailversand **CRM_MAIL_ENABLED=false**; Cloud Scheduler `lszh-crm-v2-mail-tick` **PAUSED**. Die vorherige Revision `00006-moz` bleibt als Rückfall erhalten.

**Neu:** `scripts/activate-crm-mail-live.ps1` erstellt aus der funktionierenden Revision eine zusätzliche Cloud-Run-Revision mit `CRM_MAIL_ENABLED=true` und `CRM_MAIL_ACTIVE_FROM=<UTC-Zeit bei Skriptlauf>`, anfänglich mit **0 % Traffic**. Das Skript prüft Quell-Image, alle CRM-/Website-/OAuth-/Secret-/Dienstkonto-Parameter, die OIDC-Konfiguration des pausierten Schedulers und die HTTP-Sperre (Mail-Tick ohne OIDC: 401). Nach dem Trafficwechsel auf 100 % aktualisiert es den pausierten Scheduler auf `* * * * *` (jede Minute) und aktiviert ihn **erst zum Schluss**. Bei Abbruch nach einem Trafficwechsel pausiert es Scheduler und setzt die alte Mail-deaktivierte Revision `00008-zog` auf 100 % zurück. Es werden **nur nach dem festgelegten UTC-Zeitpunkt gespeicherte Website-Leads** berücksichtigt; Altleads bleiben ausgeschlossen. Eindeutige Firestore-Ereignisse verhindern automatisches doppeltes Versenden; unklare Make-Ergebnisse erhalten `manual_review`.

**Wichtig:** Dieses neue Skript versendet nach der Scheduler-Aktivierung **automatisch echte Kunden-Eingangsbestätigungen und interne Lead-Mails**. Es darf deshalb nur mit klarer Freigabe für den produktiven Versand ausgeführt werden. Noch NICHT ausgeführt; die drei Automationen sind trotz aktivem Make gegenwärtig nicht produktiv. Die erste echte Website-Anfrage nach dem Cutoff sowie die 24h-Erinnerung müssen anschliessend anhand von Firestore `mail_events`, Make-Ausführung und Gmail-Postfach geprüft werden. Die HTTP-Prüfung bestätigt lediglich den API-Schutz, **nicht** eine erfolgreiche OIDC-Scheduler-Ausführung oder E-Mail-Zustellung.

Auf dem Surface:

```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw "Git-Pull fehlgeschlagen" }
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\activate-crm-mail-live.ps1"
```

Erwartete Schlussmeldung: `MAIL GO-LIVE PASS` und `SCHEDULER ENABLED`. Beim ersten tatsächlichen Scheduler-Lauf prüfen, dass die OIDC-Signatur vom Endpoint akzeptiert wird und keine Fehler in Cloud Scheduler oder Cloud Run auftreten. Rollback: Cloud Scheduler pausieren und Cloud Run Traffic auf `lszh-crm-v2-00008-zog=100` schalten.

## Produktionsumschaltung – vorbereitete Mail-Revision ohne Versand (23.10.2026)

Das dokumentierte Live-CRM verwendet Revision `lszh-crm-v2-00006-moz` zu 100 %, der Mailkandidat `lszh-crm-v2-00008-zog` ist fertig deployed und hat 0 % Traffic. Die echte HTTP-POST-Prüfung des Mailendpunkts ergab **404 beim Kandidaten** (deaktiviert) und **401 bei der alten Live-Version** (bisheriger Login-Schutz). Cloud Scheduler `lszh-crm-v2-mail-tick` ist PAUSED; Make Szenario 8135270 ist inaktiv. Das Mail-Secret ist bereits in Secret Manager gespeichert.

Neu: `scripts/cutover-crm-mail-safe.ps1` führt den ersten Teil des Go-lives durch, **ohne produktive E-Mails einzuschalten**. Das Skript startet alle CRM-Regressionstests, kontrolliert alte/neue Revision und identische Konfiguration von Datenbank, Website-Intake, OAuth und Dienstkonto, prüft das pausierte Scheduler-Jobziel sowie das deaktivierte Mail-Gate. Erst dann setzt es 100 % Traffic auf `00008-zog` und testet fünf HTTP-Endpunkte erneut. Bei jedem fehlgeschlagenen Post-Switch-Test wird automatisch auf `00006-moz` zurückgeschaltet. Die vorherige funktionierende Revision bleibt als Rollback erhalten.

Auf dem Surface nach `git pull --ff-only` auf dem Branch `feature/crm-v2-cloud-staging-20261023` ausführen:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\\scripts\\cutover-crm-mail-safe.ps1"
```

Zielausgabe: `CUTOVER PASS: lszh-crm-v2-00008-zog = 100 percent, mail OFF`. **Danach erst** die eigentliche Mail-Aktivierung: Gmail/Make prüfen, neuen UTC-Aktivierungszeitpunkt einführen (keine rückwirkenden Altlead-Mails), neue sendefähige Cloud-Run-Revision vorbereiten, Post-Switch-Sicherheit prüfen und den minütlichen Scheduler **als letzten Schritt** freigeben. Die Mailzustellung an echte Kunden muss dabei separat abgenommen werden; die bisherige Testmail hat nur den geschäftlichen Versand nachgewiesen.

## Cloud Scheduler Vorbereitung – Wiederaufnahme nach URI-Fehler

Erster Lauf des PowerShell-Vorbereitungsskripts am 23.10.2026: **31/31 Tests PASS**, APIs aktiviert, Secret `lszh-crm-v2-mail-make-hook` mit Version 1 gespeichert und Berechtigung gesetzt, separates Scheduler-Dienstkonto erstellt. Abbruch beim Anlegen des Scheduler-Jobs, da die CLI `--uri` als leere Adresse erhielt. Daher keine Cloud-Run-Mailrevision deployed und keine Mail versendet.

Das Skript wurde aktualisiert, um für `gcloud.cmd` eine eigene Argumentliste `$scheduleArgs` mit überprüfter Scheduler-Zieladresse zu nutzen. Ausserdem verwendet es JSON-Auflistungen statt der fehleranfälligen `gcloud --filter`-Ausdrücke; so werden **bestehende Secrets, aktivierte Secret-Versionen und Dienstkonten** beim erneuten Aufruf erkannt und wiederverwendet.

**Erneuter Aufruf:** `git pull --ff-only`, dann `powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\scripts\prepare-crm-mail-live.ps1'`. Dabei nicht erneut ein Secret eingeben müssen, wenn Version 1 weiterhin aktiviert ist. Der resultierende Scheduler muss `PAUSED` sein und die Mailrevision muss 0 % Traffic mit `CRM_MAIL_ENABLED=false` erhalten. Das Make-Szenario 8135270 bleibt INAKTIV. Bei erneutem Fehler Ausgabe prüfen, kein manuelles `scheduler resume` oder produktives `CRM_MAIL_ENABLED=true` auslösen.
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
