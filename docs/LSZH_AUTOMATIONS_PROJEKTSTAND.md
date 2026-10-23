### 23.10.2026 – Freigabe Offerten-Design + Nicht-MWST-Registrierung; Deployment bereit

**Freigabe durch den Benutzer:** Die bereits gestaltete LSZH-Offerten-PDF und Kundenmail sind visuell ausdrücklich angenommen und dürfen übernommen werden. Der Benutzer hat zusätzlich ausdrücklich bestätigt: **LSZH Invest GmbH ist aktuell NICHT bei der MWST angemeldet**. Diese Bestätigung ist Grundlage für die Darstellung; eine nicht belegte Aussage über Jahresumsatz, Steuerbefreiung oder Vorsteuerabzug wird daraus nicht abgeleitet.

**Implementierung im GitHub-Branch `feature/crm-v2-cloud-staging-20261023`:**
- `crm-v2/offer-pdf.js` zeigt unter den getrennten Einmal-/Monatsbeträgen den Hinweis `Keine MWST ausgewiesen - nicht MWST-registriert.`. Der PDF-Block erhält genügend Platz, damit Datum und unverbindlicher Auftragsbestätigungsvorbehalt nicht abgeschnitten werden. UID bleibt `CHE-369.474.125`, **ohne** den Zusatz `MWST`, und es wird weder ein MWST-Satz noch ein MWST-Betrag berechnet.
- `crm-v2/offer-mail.js` zeigt denselben Sachverhalt unmittelbar unter den Preispositionen: `Keine MWST ausgewiesen – LSZH Invest GmbH ist nicht MWST-registriert.`. Markenstil, persönliche Anrede, Schweizer Datum, Absender und separates schriftliches Auftragsbestätigungserfordernis bleiben unverändert.
- `crm-v2/test/offer-send.test.js`: zusätzliche Assertions bestätigen in beiden Kundenunterlagen die negative MWST-Darstellung und Abwesenheit einer fingierten 8,1-%-Besteuerung.
- `scripts/deploy-crm-offer-design-no-vat-live.ps1` ist das **neue spezifische Live-Rollout-Skript**, nicht zu verwechseln mit dem alten Cutover. Es verlangt als unveränderbare Ausgangsrevision `lszh-crm-v2-00036-ret` (letzte vom Benutzer bestätigte Live-Revision), verifiziert die produktive **manuelle** Offertenversandkonfiguration, die unveränderten Mail-/Webhook-/Firestore-Umgebungsvariablen, Scheduler/OIDC, aktive Mail-Cutoff-Grenze, Quellcode-Marker und vollständige CRM-Tests. Neue Cloud-Run-Revision wird mit **0 % Traffic** erstellt und live sowie vor dem Umschalten mit GET/POST-Statuscodes und `/api/config` geprüft. Danach 100 % Traffic; bei Fehler nach Umschaltung Rollback auf `00036-ret`. Das Skript verändert **keine** Make-Szenarien, Secrets, Firestore-Daten, Scheduler und löst selbst **keine** E-Mail aus. CI PowerShell-Parserprüfung ergänzt.

**Vorbereitung abgeschlossen, aber Deployment noch NICHT vom Benutzer ausgeführt/bestätigt.** Die letzte bestätigte Live-Revision bleibt `lszh-crm-v2-00036-ret`. Erwartete neue Erfolgsmeldung `CRM OFFER PDF AND MAIL DESIGN LIVE PASS`; neue Revision erst aus dem späteren PowerShell-Log übernehmen.

**Nächster manueller Schritt auf Surface:**
```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\deploy-crm-offer-design-no-vat-live.ps1"
```
Danach per Log Cloud Run Traffic/Mode, fortbestehenden Scheduler und sämtliche Tests bestätigen. Kein unnötiger echter Kundenversand zu Testzwecken. Es gibt keine automatisierte Auftragsannahme; echte E-Mails werden ausschliesslich durch bestätigten CRM-Klick versendet.

**Betriebliche Folge:** Wenn sich die MWST-Registrierung später ändert, Offerten- und Rechnungsdarstellung sowie allfällige Steuercodes gezielt anpassen. Die UID allein darf weiterhin nicht als MWST-Nummer mit Zusatz `MWST` bezeichnet werden.

---

### 23.10.2026 – Qualitätsprüfung Offerten-PDF und Kundenmail (Verbesserungen im Branch, NOCH NICHT PRODUKTIV)

**Ausgangslage:** Benutzer bestätigte Produktiv-Go-Live `CRM OFFER CUSTOMER GO LIVE PASS`; Cloud Run `lszh-crm-v2-00036-ret` bei **100 % Traffic**, Rückfallrevision `lszh-crm-v2-00034-hec`, deduplizierender Mail-Cutoff `2026-10-23T16:15:28Z`. Make-Szenario `8144117` ist produktiv, überprüfte Gmail-Verbindung; Filter verlangt `kind=offer_send`, `sendMode=production`, das Offerten-Ereignis und passenden Betreff/PDF-Namen. Die Produktivrevision darf ohne weiteres Rollout nicht mit den hier bearbeiteten Quellen gleichgesetzt werden.

**Quellcodeprüfung ergab:**
- PDF hatte bisher nur `LSZH Invest GmbH | Schweiz` und keine vollständige Firmenanschrift oder UID, trotz vorhandener vollständiger Absenderangaben in `crm-v2/mail-templates.js`.
- Kundenmail begann mit `Guten Tag <Firma>`, nutzte ISO-Datumsdarstellung `YYYY-MM-DD`, eigenes abweichendes Branding und keine eindeutige Aussage, dass das Versenden keine Beauftragung auslöst.
- Preise werden korrekt **separat** nach einmaligen und monatlich wiederkehrenden Leistungen berechnet; ein kombiniertes Total wäre irreführend. Der angebotene `items`-Inhalt stammt aus der gespeicherten CRM-Offerte.
- Keine eindeutige MWST-Deklaration. Die UID **CHE-369.474.125** ist nach dem Handelsregistereintrag der LSZH Invest GmbH dokumentiert, aber eine UID alleine bestätigt **nicht**, ob die Unternehmung derzeit MWST-pflichtig bzw. freiwillig registriert ist. Zum Zeitpunkt dieser Änderung wurde der effektive MWST-Status **nicht verifiziert**; daher **keine erfundene MWST-Nummer oder ein erfundener Steuersatz** in die Vorlagen geschrieben.
- Firmendaten `LSZH Invest GmbH, Rummelmatt 8, 5610 Wohlen AG` stammen aus bestehendem LSZH-Kundenmaildesign und öffentlich auffindbarem Handelsregisterauszug (letzte bekannte Meldung 2024); aktueller Register-/Domizilstatus sollte vor Freigabe bestätigt werden.

**Im Entwicklungsbranch überarbeitet, noch nicht deployed:**
- `crm-v2/offer-pdf.js`: LSZH-Navy/Blau, vollständiger Absender in wiederholter Fusszeile, UID korrekt als UID (ohne `MWST`-Suffix), geschäftliche Kontaktadresse, mehrzeilige Offertentitel, schriftlicher Auftragsbestätigungsvorbehalt nach dem Preisblock.
- `crm-v2/offer-mail.js`: an bestehende LSZH-Kundenbestätigung angeglichenes HTML-Tabellenlayout (Gmail/Outlook, Inline-CSS, keine Fernressourcen), persönliche Anrede über `name` oder `contactName`, Schweizer Datumsformat `DD.MM.YYYY`, getrennte Einmal-/Monatsbeträge, Firmenadresse, UID und Kontakt, gleicher Vorbehalt. Alle Eingaben werden HTML-escaped; vorhandene Make-Filter-/Betreffkonvention `Ihre Offerte Nr.` und Dateiname `LSZH-Offerte-NNN.pdf` bleiben erhalten.
- Angebotshinweis: `Diese Offerte ist unverbindlich. Ein Auftrag kommt erst durch unsere ausdrückliche schriftliche Auftragsbestätigung zustande.` Die exakte rechtliche Wirkung ist unter Art. 3/7 OR und den tatsächlichen Geschäftsbedingungen vor Verwendung zu überprüfen. Keine automatische Auftragsannahme wurde freigeschaltet.
- `scripts/preview-crm-offer-documents.js`: produziert lokal ausschliesslich **synthetische** Beispieldaten in `%TEMP%\\lszh-offerten-vorschau`, PDF und HTML, ohne CRM-Login, Firestore, Make, Gmail oder Cloud-Zugriff. Für die menschliche Layoutfreigabe im Browser/PDF-Betrachter.
- Regressionstests `crm-v2/test/offer-send.test.js` wurden um Unternehmensidentifikation, nicht-bindende Bedingungen, Schweizer Datumsformat, personalisierte Anrede, Escaping und Titelzeilenumbruch erweitert. Bis dahin alle **81** Tests erfolgreich.

**Freigabe noch offen:** Tatsächlichen MWST-Status in ESTV/UID prüfen, Adresse/Kontakt bestätigen, Vertragstext gegen genehmigte Projektbedingungen/AGB abstimmen, synthetische PDF-/HTML-Vorschau auf Inhalt und Zeilenumbrüche prüfen. **Nicht automatisch live deployen** und keine produktiven Empfänger anschreiben. Bestehender Cloud Run bleibt `lszh-crm-v2-00036-ret`; danach kann ein eigenes überprüftes Null-Traffic-Kandidaten-Rollout für die Angebotsvorlagen erfolgen.

**Offline-Vorschau auf dem Surface (kein Mailversand):**
```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
node .\scripts\preview-crm-offer-documents.js
explorer.exe "$env:TEMP\lszh-offerten-vorschau"
```

---

### 23.10.2026 – Benutzerfreigabe fuer regulären Offertenversand, Make-Filter angepasst (Cloud Run noch TEST_ONLY)

**Explizite Entscheidung:** Der Benutzer hat den TEST_ONLY-Zwang für den PDF-Offertenversand aufgehoben. Jede E-Mail soll ausschliesslich nach bewusstem, manuellem CRM-Klick samt Empfängerbestätigung verschickt werden; digitale Auftragsannahme ist weiterhin nicht freigeschaltet und bleibt ein getrennter Prozess. Das ist eine Freigabe fuer den Versandkanal, **keine** automatische Annahme von Kundenaufträgen.

**Vorhanden:** Erfolgreicher synthetischer E2E-Test Offerte Nr. `1003`, Outlook-Zustellung, PDF sichtbar und CRM-Status `Versendet` bestätigt. Revision `lszh-crm-v2-00034-hec` dient auf Cloud Run 100 % Traffic, neuer Code verlangt ausdrücklich `CRM_OFFER_MAIL_MODE=production` und fehlende `CRM_OFFER_MAIL_TEST_TO`. Bis zur separaten Laufzeitumschaltung weiterhin TEST_ONLY.

**Make jetzt:** Szenario `8144117`, produktiver manueller Offertenversand, weiterhin aktiv. Der Gmail-Modulfilter wurde nach Benutzerfreigabe auf `kind=offer_send`, `sendMode=production`, `eventId` enthält `offer_send_`, Betreff enthält `Ihre Offerte Nr.`, empfangende Adresse enthält `@` und PDF-Dateiname enthält `.pdf` geändert. Google-Gmail-Verbindung unverändert. Lead-/Website-Mail-Szenario `8135270` blieb unangetastet. Das Make-Szenario befindet sich **vorübergehend im Webhook-Feld-Lernmodus**: Nächste Request wird zum Nachlernen von `sendMode` abgefangen, **ohne Gmail-Sendung**. Benutzer muss `scripts/learn-crm-offer-send-webhook.ps1` auf Surface mit der richtigen geheimen Make-Webhook-URL ausführen; Skript enthält ein komplett synthetisches `sendMode=test_only`. Anschliessend Datenschema `sendMode` in Make durch `scenario_trigger_inspect` bestätigen und verifizieren, dass Lernmodus beendet ist.

**Nächster Aktivierungsschritt nach bestätigt gelerntem Feld:** `scripts/activate-crm-offer-production-live.ps1`, mit `git pull --ff-only` vorher; verlangt bewusste Freigabephrase. Die Skriptvorprüfung erzwingt die aktive, getestete `crm-offer-production-code-ready`-Revision. Deployt neue Revision mit explizitem `CRM_OFFER_MAIL_MODE=production` und **entfernter** Testadresse zunächst auf 0 % Traffic. Vergleicht Dienstkonto, bestehende Mail-/Ingest-Umgebung, Scheduler, Container-Image und Secret-Referenzen mit vorher; testet neue /api/config und schaltet danach 100 % Traffic um. Rollback vorgesehen. **Kein Kundenversand bis dahin aktiv.**

**Wichtige offene Aspekte:** Webhook-URL wurde zuvor im Chat gepostet: Vor langfristigem Regelbetrieb über Make neu erzeugen/rotieren und neues URL-Secret in Google Secret Manager hinterlegen; keine Secrets in Chat oder GitHub veröffentlichen. Rechtlich gilt: Die Tatsache, dass das Annahmeportal deaktiviert ist, bedeutet nicht, dass ein Kunde eine verbindliche Offerte nicht auf anderem Weg annehmen kann. Nach Art. 3 OR kann ein Antrag mit Annahmefrist bindend sein, sofern kein gültiger Unverbindlichkeitsvorbehalt (Art. 7 OR) besteht. Möchte der Benutzer aktuell gar keine bindenden Angebote machen, die Angebotsformulierung und Rechtsfolgen ausdrücklich vor echtem Versand prüfen. Kein künstliches Abhaken/Behaupten einer Auftragsannahme.

---

### 23.10.2026 – Produktiv-Go-Live des automatischen PDF-Offertenversands: VORBEREITET, NICHT FREIGESCHALTET

**Letzte reale Prüfung:** Der Nutzer hat den Eingang der CRM-Offertenmail Nr. **1003**, die Öffnung des PDF-Anhangs und den CRM-Status `Versendet` bestätigt. Make-Execution `e2f0d5fcd23a4a3f988f5d820c68a97c` wurde als `success` (Webhook, Gmail, WebhookRespond jeweils 1x) überprüft; Gmail lieferte eine Nachrichten-ID und Make eine passende Event-ID-Antwort. Dies bestätigt **nur** den synthetischen TEST_ONLY-Workflow.

**Ist-Zustand:** Live Cloud Run `lszh-crm-v2-00032-new`, 100 % Traffic, `CRM_OFFER_MAIL_ENABLED=true`, `CRM_OFFER_MAIL_TEST_TO=lars.schulthess@outlook.com`, `CRM_OFFER_MAIL_MODE` bislang nicht gesetzt. Im laufenden Softwarestand blockiert die Testadress-Sperre echte Empfänger. Make-Szenario `8144117` ist **aktiv, TEST_ONLY** und versendet nur bei `to=lars.schulthess@outlook.com` und `[TEST_ONLY]` im Betreff. Bestehendes Lead-Mail-Szenario `8135270`, Cloud Scheduler `lszh-crm-v2-mail-tick` und Mail-Cutoff bleiben unberührt. Realer Kundenversand wurde **nicht** autorisiert/aktiviert.

**Verbesserung für echte Kunden im Entwicklungsbranch:** In `crm-v2/offer-send.js` und `crm-v2/server.js` ist ein **ausdrücklicher Produktivmodus** vorgesehen: nur wenn `CRM_OFFER_MAIL_ENABLED=true`, `CRM_OFFER_MAIL_MODE=production`, **kein** `CRM_OFFER_MAIL_TEST_TO` und eine gültige Secret-Manager-Webhook-URL vorhanden sind, darf eine reale Offerte an den verknüpften Empfänger gesendet werden. Fehlt bloss die Testadresse, bleibt der Versand ausdrücklich **disabled** statt unbemerkt zum Kundenversand zu wechseln. Bestandskunden-TEST_ONLY-Versionen (Mail-Testadresse gesetzt, Modus bislang leer) funktionieren unverändert. In Produktion werden Offertentitel mit `TEST_ONLY` vor und nach der Reservierung abgewiesen. Der Make-Payload trägt das Feld `sendMode: 'production'|'test_only'`; echte Mail wird weiterhin **nur durch den bestätigten CRM-Button** ausgelöst und erst nach gültiger Gmail-Nachrichten-ID plus korrekter Event-ID auf `Versendet` gesetzt. Keine automatische Wiederholung bei unklaren Antworten. Bestehende Firestore-Statuslogik bleibt unverändert.

**Zweistufige Release-Skripte vorbereitet:**

1. `scripts/deploy-crm-offer-production-code-ready.ps1` bringt diese geprüfte Codebasis auf Cloud Run, ohne irgendetwas für echte Kunden freizuschalten. Preflight verlangt die bekannte bisherige Live-Revision `00032-new`, unverändertes Dienstkonto, Mail-Scheduler, Firestore-Präfix, Make-Secret-Referenz, exakt denselben Mail-Cutoff und TEST_ONLY-Sperre. Kandidat erhält vor dem Traffic-Switch **0 % Traffic**, unveränderte Umgebungsvariablen und `/api/config` weiterhin `offerMailMode=test_only` und dieselbe Testadresse. Rollback auf vorherige Live-Revision bei fehlgeschlagenem Switch. Erfolgsmeldung `CRM OFFER PRODUCTION CODE READY LIVE PASS`; ausdrücklich **kein Go-Live für echte Kunden**.
2. `scripts/activate-crm-offer-production-live.ps1` ist der **separate zukünftige** Produktivschalter und darf **erst nach ausdrücklicher Freigabe des Nutzers** ausgeführt werden. Verlangt die zuvor ausgelieferte und getaggte Codebasis `crm-offer-production-code-ready` im TEST_ONLY-Modus, dieselben bisherigen Unternehmens-/Mail-/Scheduler-Einstellungen und die bewusst eingegebene Freigabephrase `FREIGABE-LSZH-OFFERTENVERSAND-PRODUKTIV`. Erst dann wird eine neue Revision mit `CRM_OFFER_MAIL_MODE=production` und ohne `CRM_OFFER_MAIL_TEST_TO` bei **0 % Traffic** erstellt und via `/api/config`/Secret-/Image-/Env-/Scheduler-Prüfung validiert. Danach explizite Traffic-Umschaltung und Rollback auf letzte TEST_ONLY-Revision, falls der Cutover fehlschlägt. Erfolg `CRM OFFER CUSTOMER GO LIVE PASS`. **Diese Datei nicht als Folge des Vorbereitungsauftrags automatisch ausführen.** Cloud Run Rollback macht bereits verschickte E-Mails nicht rückgängig.

**Make-Go-Live (noch NICHT geändert):** Bestehendes Szenario `8144117` weiterverwenden, **keine unnötigen neuen Make-Szenarien**. Vor dem Umschalten die bislang im Chat gepostete Webhook-URL **rotieren**, die neue geheime URL nur in Google Secret Manager Version `lszh-crm-v2-offer-make-hook:latest` eintragen und die Zielversion auf der neuen Cloud-Run-Revision prüfen. Das `sendMode`-Feld mit `scripts/learn-crm-offer-send-webhook.ps1` bei vorübergehendem Make-Lernmodus (ohne Gmail-Ausführung) in der Trigger-Datenstruktur erfassen. Vor dem Cutover Make-Gmail-Filter ausdrücklich auf `kind=offer_send`, `sendMode=production`, erwartete Event-ID `offer_send_`, normalen Offertenbetreff und gültigen Empfänger umstellen. Aktuell bleiben dagegen **Empfänger-Fixierung und TEST_ONLY-Betreff bestehen**. Kontrollieren, dass Make nur bei tatsächlich erfolgter Gmail-Send-Aktion eine `messageId` an das CRM zurückgibt. Die Produktivfilter-Umschaltung ebenfalls erst nach ausdrücklicher Freigabe des Nutzers ausführen.

**Geschäftliche Prüfung vor echtem Kundenversand:** Der aktuelle PDF-Generator hat Markenheader und Preisübersicht, zeigt aber nur `LSZH Invest GmbH | Schweiz` und noch **keine vollständige überprüfte Geschäftsanschrift / UID-/Steuerangaben** im PDF. Deshalb finale Offerte und E-Mail auf Firmenidentifikation, Kontakt, Angebotspositionen, Preis-/MWST-Hinweis je nach effektivem MWST-Status, Leistungsumfang, Laufzeit, Gültigkeitsdatum und vereinbarte Vertragsunterlagen/Annahmeweg prüfen. Keine MWST-Registrierung oder rechtliche Vertragsannahme aus der blossen UID ableiten. Zusaetzlich die bereits geplante Handelsregister-Zweckaenderung auf Dienstleistungen/Automationen mit einem aktuellen offiziellen Handelsregisterauszug pruefen: oeffentliche Drittanbieter-Eintraege zeigen derzeit noch den alten Zweck Handel mit Waren aller Art (z.B. https://www.moneyhouse.ch/de/company/lszh-invest-gmbh-13733887291). Keine unbestaetigte Zweckaenderung annehmen. Das separate Online-Offertenannahmeportal ist noch **nicht** vollständig in die CRM-V2-Mailstrecke integriert. Versand-Go-Live und digitale Vertragsannahme sind getrennte Meilensteine.

**Jetzt gefahrlos ausfuehrbar (nach Codeabnahme, weiterhin TEST_ONLY):**
```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\deploy-crm-offer-production-code-ready.ps1"
```
**Danach** erst ein separater freigegebener Produktiv-Cutover mit Make-Filterwechsel, Secret-Rotation und `activate-crm-offer-production-live.ps1`. Keine ungefragten echten Kunden-E-Mails.

---

### 23.10.2026 – CRM TEST_ONLY-Deployment produktiv, Make aktiviert

**Bestätigung per Benutzerlog:** `scripts/deploy-crm-offer-send-test-only-live.ps1` endete erfolgreich mit `CRM OFFER TEST ONLY LIVE PASS`. Alle **74/74 CRM-Tests bestanden**. Cloud-Run-Revision `lszh-crm-v2-00032-new` hat **100 % Produktiv-Traffic**, Rollback-Revision `lszh-crm-v2-00030-ren`. Separater Make-Offerten-Webhook als Secret `lszh-crm-v2-offer-make-hook` in Google Secret Manager Version 1 erstellt und Zugriff für CRM-Dienstkonto erteilt. `CRM_OFFER_MAIL_ENABLED=true` gilt **nur im stark eingeschränkten TEST_ONLY-Modus** (`CRM_OFFER_MAIL_TEST_TO=lars.schulthess@outlook.com`). Das bestehende Make-Lead-Mail-Szenario, Cloud Scheduler und E-Mail-Cutoff blieben unverändert.

**Make geprüft und aktiviert:** Make-Szenario `8144117` wurde nach Prüfung des eingeschränkten Filters und der verbundenen Gmail-Anbindung aktiviert. Der Filter akzeptiert `kind=offer_send`, `eventId` enthält `offer_send_`, Empfänger ausschliesslich `lars.schulthess@outlook.com`, Betreff enthält `[TEST_ONLY]`. Das CRM kontrolliert zusätzlich vor und unmittelbar nach der Reservierung, dass der gespeicherte Offertentitel mit `TEST_ONLY` beginnt und die Lead-/Kunden-E-Mail exakt dem Testpostfach entspricht. Andere CRM-Offerten bleiben vom automatischen Versand ausgeschlossen.

**Noch offen:** Echter End-to-End-Klick **aus dem CRM** wurde bislang nicht ausgeführt. Dafür einen synthetischen CRM-Lead mit der Outlook-Testadresse manuell erstellen, zu `Qualifiziert` führen, die automatisch erstellte Offerte öffnen und ihren Titel mit `TEST_ONLY` beginnen lassen; Positionszeile mit positivem Preis und künftiges Gültigkeitsdatum eintragen und Status `Bereit` speichern. Danach ausschliesslich den speziellen Button `TEST_ONLY: PDF ans Testpostfach senden` betätigen. Erwartung: Mail mit echtem CRM-Offerten-PDF trifft beim Testpostfach ein, Make-Gmail-Receipt wird bestätigt, CRM-Offerte wechselt auf `Versendet`, `sentTo` und Wiedervorlage gesetzt. Anschliessend Go-Live für reale Kunden gesondert und bewusst freigeben; **aktuelle TEST_ONLY-Beschränkung nicht aufheben**.

---

### 23.10.2026 – CRM-Offerten-PDF Preview produktiv + Testmodus vorbereitet

**Vom Benutzer per PowerShell bestätigt:** `scripts/deploy-crm-offer-send-preview-live.ps1` endete mit `CRM OFFER SEND PREVIEW LIVE PASS`. Neue produktive Cloud-Run-Revision `lszh-crm-v2-00030-ren` hat **100 % Traffic**. Verifizierter Rückfallanker ist `lszh-crm-v2-00028-lij`. Alle **71/71** bisherigen Tests erfolgreich. Bestehender Cloud-Scheduler und Make-Lead-Mails unverändert; **CRM_OFFER_MAIL_ENABLED weiterhin false**, noch kein automatischer Kundenversand.

**Nächster Schritt implementiert, noch nicht ausgerollt:** Gezielter Testmodus für den echten CRM-Versandbutton. `crm-v2/offer-send.js` prüft bei `CRM_OFFER_MAIL_TEST_TO` **vor** der Versandreservierung und nochmals unmittelbar **nach** der atomaren Reservierung sowohl die gespeicherte Offerte (`title` beginnt mit `TEST_ONLY`) als auch die unveränderte Empfängeradresse (`lars.schulthess@outlook.com`). Bei Abweichung wird vor jedem HTTP-Aufruf an Make abgebrochen; bei einer Änderung während der Reservierung wird `preparation_failed` protokolliert. Testmails erhalten einen Betreff beginnend mit `[TEST_ONLY]`. `/api/config` liefert nur `offerMailEnabled`, `offerMailMode` und den erlaubten Testempfänger; `crm-v2/public/index.html` zeigt den Versandbutton im Testmodus ausschliesslich für passend markierte Testofferten. Neue Regressionstests prüfen Freigaben, Ablehnungen und Race-Schutz.

**Make-Szenario 8144117:** Separat, **inaktiv**, Gmail-Verbindung weiterhin funktionstüchtig. Sein Gmail-Filter wurde an dynamische CRM-Testofferten angepasst: `kind=offer_send`, Event-ID mit `offer_send_`, Empfänger genau `lars.schulthess@outlook.com`, Betreff enthält `[TEST_ONLY]`. Echte Kunden-E-Mails werden vom Make-Filter abgewiesen.

**Rollout-Skript:** `scripts/deploy-crm-offer-send-test-only-live.ps1`. Prüft die konkrete live bestätigte Revision `lszh-crm-v2-00030-ren`, den unveränderten bestehenden Kunden-Mailbetrieb, Scheduler und 74 CRM-Tests. Legt für die separate Make-Offerten-Webhook-URL ein Secret `lszh-crm-v2-offer-make-hook` im Google Secret Manager an bzw. verwendet eine aktivierte Version. Bei neuer Secret-Version wird die URL **im verdeckten PowerShell-Prompt** des Nutzers angefordert, niemals in Git gespeichert. Nur dem CRM-Dienstkonto wird Secret-Accessor auf dieses Secret erteilt. Baut Kandidat mit `CRM_OFFER_MAIL_ENABLED=true`, `CRM_OFFER_MAIL_TEST_TO=lars.schulthess@outlook.com` und `CRM_OFFER_MAIL_WEBHOOK_URL` aus Secret Manager zunächst mit **0 % Traffic**. Prüft Kandidaten-HTTP, Testmodus sowie alle übrigen unveränderten Umgebungsvariablen und Scheduler. Erst danach Traffic-Umschaltung auf 100 %, mit Rollback auf `00030-ren` bei Problemen.

**Ausführung auf dem Surface (kein echter Kundenversand):**
```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\deploy-crm-offer-send-test-only-live.ps1"
```
Erfolgscode `CRM OFFER TEST ONLY LIVE PASS`. Falls nach der **neuen Offerten-Make-Webhook-URL** gefragt wird, die URL aus dem Webhook-Modul von Szenario `8144117` eingeben (nicht die Lead-Mail-Webhook-URL von `8135270`). Nicht in Git, Mail oder Chat posten.

**Test nach dem Release:** Das separate Szenario `8144117` nur mit festem TEST_ONLY-Filter aktivieren; im CRM einen synthetischen Testlead mit der eigenen Outlook-Adresse erstellen und qualifizieren, die automatisch nummerierte Offerte `TEST_ONLY ...` nennen, Position und gültiges Ablaufdatum erfassen, Status `Bereit`, dann den speziellen Button **«TEST_ONLY: PDF ans Testpostfach senden»** auslösen. Empfang im Outlook-Postfach, PDF, Gmail-Receipt, CRM-Status `Versendet` und Wiedervorlage prüfen. Erst nach diesem Test und **separater Freigabe** die Einschränkung für echte Kunden ändern.

---

### 23.10.2026 – Offerten-PDF Preview-Deploy: Cloud Run Tag-Guard korrigiert

Beim ersten Aufruf von `scripts/deploy-crm-offer-send-preview-live.ps1` durch den Benutzer: **alle 71 CRM-Tests bestanden**, Vorprüfung bei `Unrecognised live CRM revision/tag: lszh-crm-v2-00028-lij; no changes made` abgebrochen. Es wurde **keine** neue Cloud-Run-Revision erstellt und **kein** Traffic umgestellt. Ursache im Vorprüfungsskript: bislang musste die frühere Release-Tag-Zuordnung im **selben Traffic-Eintrag** wie die 100-%-Revision stehen. Ein `gcloud run services update-traffic --to-revisions=...=100` kann jedoch separate 0-%-Tags erzeugen oder die Tag-Zuordnung entfernen.

**Behoben:** Tag-Zuordnung wird nun unabhängig von `percent` geprüft. Gibt es keinen bekannten Tag, erlaubt der Guard ausnahmsweise **nur** die im echten Benutzerlog beobachtete laufende Revision `lszh-crm-v2-00028-lij` und verifiziert deren bestehende Kontakt-, Qualifizierungs-, Wiedervorlage- und Offerten-UI-Marker via HTTP, bevor das normale strenge Preflight fortgesetzt wird. Alle übrigen Prüfungen (Cloud-Run-Konto, CRM-Firestore-Präfix, Mail-Env und Cutoff, Cloud Scheduler, HTTP, Kandidaten-Tag bei 0 %, keine aktivierte Offerten-Mailfunktion, unveränderter Env-Signaturvergleich, Traffic-Switch mit Rollback) bleiben unverändert. PowerShell-Datei weiterhin vollständig ASCII für Windows PowerShell 5.1.

**Erneut ausführen:**
```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\deploy-crm-offer-send-preview-live.ps1"
```

**Status:** Preview ist erst nach `CRM OFFER SEND PREVIEW LIVE PASS` bestätigt. Separates Make-Offerten-Szenario `8144117` bleibt inaktiv; produktive Offerten-E-Mails bleiben aus.

---

### 23.10.2026 – Make-Offerten-PDF E2E: synthetischer Gmail-Test erfolgreich

- **Make-Szenario:** `8144117`, «LSZH CRM V2 – Offertenversand PDF (TEST / INAKTIV)». Der Benutzer verwendete zunächst die URL des alten Lead-Mail-Szenarios `8135270`; jener Lauf wurde bereits am Webhook-Filter beendet und versendete keine Nachricht. Anschliessend wurde korrekt das neue Offerten-Webhook genutzt.
- **Webhook-Lernlauf:** Alle acht Felder `kind, eventId, offerId, to, subject, html, pdfFilename, pdfBase64` erkannt. PDF-Base64 beginnt mit `JVBERi0` (`%PDF-`) und endet korrekt. Synthetischer Testdatensatz ohne produktive Kunden/Offerten.
- **Kontrollierter Gmail-Lauf:** Make-Execution `dd89a12f79054d9da193a512ac763824` vom 23.10.2026, 19:47:40 UTC: **success, 3/3 Module, 0 Fehler**. Webhook, Gmail-`sendAnEmail` und `WebhookRespond` liefen. Gmail-Input: nur `lars.schulthess@outlook.com`; Betreff `[TEST_ONLY] Ihre Offerte Nr. 999999 | LSZH Automations`; PDF-Anhang `LSZH-Offerte-999999.pdf` als `IMTBuffer(3070, binary, ...)`, beginnt mit hex `25504446` = `%PDF`. Gmail-Modul lieferte Provider-Nachrichten-ID `1a16a4e0f6cfe35f`; WebhookRespond lieferte erfolgreich `{ok:true,eventId:'offer_send_TEST_ONLY_learning_20261023',messageId:'1a16a4e0f6cfe35f'}`.
- **E-Mail-Zustellstatus – vom Benutzer bestätigt (23.10.2026):** Die TEST_ONLY-E-Mail ist im freigegebenen Outlook-Testpostfach angekommen und die angehängte PDF-Datei lässt sich öffnen. Damit ist die synthetische Strecke Make-Webhook → Gmail → Outlook → nutzbarer PDF-Anhang aus Anwendersicht bestätigt. Der Inhalt der PDF wurde nicht zusätzlich visuell geprüft.
- **Abschluss:** Make-Testscenario ist nach dem erfolgreichen Test wieder **inaktiv** geschaltet. Der Filter bleibt auf die synthetische Test-Offerte `999999` und das Testpostfach begrenzt. Produktiver CRM-Offertenversand über `CRM_OFFER_MAIL_ENABLED` ist **nicht freigeschaltet**; keinen zusätzlichen Versand ohne gezielte Freigabe auslösen.
- **Nächste Schritte:** Synthetischer E-Mail-Empfang und Öffnen des Anhangs sind bestätigt. Nun sicheren Cloud-Run-Preview-Deploy mit deaktiviertem Offertenversand durchführen bzw. Status `CRM OFFER SEND PREVIEW LIVE PASS` verifizieren; danach den Make-Webhook als Secret sicher anbinden, einen echten CRM-Klick mit synthetischer Offerte ausschliesslich an das freigegebene Testpostfach testen und erst nach expliziter Versandfreigabe Make-Filter sowie `CRM_OFFER_MAIL_ENABLED` für echte Kunden aktivieren. Bestehendes Lead-Mail-Szenario nicht anfassen.

---

### CRM V2 – automatischer PDF-Offertenversand (Entwicklung 23.10.2026)

**Ziel:** Aus der bereits gespeicherten, nummerierten und als `Bereit` markierten Offerte eine PDF-Datei erzeugen und nach ausdrücklichem Klick des angemeldeten CRM-Bearbeiters im LSZH-Design via Make/Gmail an den verknüpften Lead/Kunden senden. Erst nach einer Gmail-Nachrichten-ID und passendem Event-ID-Echo wird die Offerte als `Versendet` gespeichert. Das bestehende Mail-Szenario **8135270** für Website-Leads darf nicht verändert werden.

**Implementiert auf Branch `feature/crm-v2-cloud-staging-20261023`, noch nicht für Kunden aktiviert:**
- `crm-v2/offer-pdf.js`: serverseitiger A4-PDF-Generator ohne zusätzliche Abhängigkeiten. Verwendet **gespeicherte** Angebotspositionen, Totale, Gültigkeitsdatum und Anschrift. Eigener LSZH-Look (dunkles Blau, cyanfarbener Akzent), mehrseitige Positionstabelle. `crm-v2/offer-mail.js`: kundenseitige responsive HTML-Mailvorlage mit Offertennummer und Preisübersicht sowie PDF-Dateiname `LSZH-Offerte-NNNN.pdf`.
- `crm-v2/offer-send.js`: POST an einen **separaten** Make-Webhook, nur wenn `CRM_OFFER_MAIL_ENABLED=true` und `CRM_OFFER_MAIL_WEBHOOK_URL` gesetzt und korrekt sind. Payload `{kind:'offer_send',eventId,to,subject,html,pdfFilename,pdfBase64}`. Verifiziert nach der Gmail-Aktion Antwort `{ok:true,eventId:<gleich>,messageId:<Gmail-Message-ID>}`. Ein HTTP-200 ohne Gmail-ID ist **keine** Zustellbestätigung.
- `crm-v2/cloud-records.js`: Transaktion `claimOfferSend` reserviert die Offerte (Status `Bereit`) atomar und verhindert parallele Klicks, Statusänderungen oder manuellen Doppelversand; `finishOfferSend` setzt nur bei bestätigtem Gmail-Receipt auf `Versendet` und erstellt die Wiedervorlage. Bei Fehler vor Netzwerkübertragung Status `preparation_failed`, sichere Korrektur möglich. Bei verlorener/unklarer Antwort `manual_review` und **keine automatischen Wiederholungen**. `resolveOfferSend` ermöglicht erst nach manueller Postfachprüfung die Entscheidungen «gesendet» / «sicher nicht gesendet». Ein nach Prozessabbruch verwaister `sending`-Auftrag wird frühestens nach fünf Minuten manuell überprüfbar. Alte Offerten-/Kunden-/Projektdaten, PDF-Druckansicht und Mail-Event-Deduplizierung werden nicht verändert.
- `crm-v2/server.js`: bestehende Google-CRM-Anmeldung und Same-Origin-Kontrolle für `POST /api/records/offerten/:id/send` und `POST /api/records/offerten/:id/send/resolve`. Öffentliche Konfigurationsantwort zeigt ausschliesslich den booleschen Wert `offerMailEnabled`, niemals den geheimen Make-Webhook.
- `crm-v2/public/index.html`: Bei `Bereit` und aktivierter Freigabe Button **«Automatisch mit PDF versenden»** mit Empfängerbestätigung. Solange das Feature deaktiviert ist, weiterhin manueller Versand möglich. Unklare Zustellungen sind blockiert und werden mit konkreter Prüfaktion angezeigt. Nach bestätigtem Versand funktionieren Dashboard-Nachverfolgung, Angenommen/Abgelehnt sowie Kunden-/Projekterstellung wie bisher.

**Make:** Neues eigenständiges Szenario [8144117](https://eu1.make.com/1728770/scenarios/8144117) «LSZH CRM V2 – Offertenversand PDF (TEST / INAKTIV)». Webhook → Gmail `sendAnEmail` (bestehende Verbindung `11904991`; Absender `info@lszh-automations.ch`; PDF-Anhang aus `toBinary(1.pdfBase64; "base64")`) → `WebhookRespond` mit Event-ID und Gmail-Message-ID. Szenario bleibt **inaktiv**. Gmail-Filter ist ausschliesslich für das freigegebene synthetische TEST_ONLY-Postfach `lars.schulthess@outlook.com` gesetzt; echte Kundenmails können dadurch derzeit nicht ausgelöst werden. Make-Webhook-URL ist geheim und wird nicht in GitHub gespeichert. Webhook wurde in Lernmodus versetzt, damit der nächste Testdatensatz die Felder ohne Versand erfasst.

**Qualitätssicherung:** Automatische Tests für gültiges mehrseitiges PDF, Absender-E-Mail-Rendering, Feature-aus-Sperre, HTTP-Auth/Origin, genau einmalig reservierten Versandauftrag, prüfbare Gmail-Receipt-ID, unklare Antworten ohne Wiederholung, manuelle Rekonziliation und abgestürzte/in-flight-Aufträge. GitHub-CI prüft JavaScript und Windows-PowerShell-Skripte.

**Sichere erste Bereitstellung (noch **ohne** automatischen Versand):**
```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\deploy-crm-offer-send-preview-live.ps1"
```
Dieses Skript fordert eine bekannte produktive Vorversion mit Tag `crm-offer-tracking` oder `crm-empty-quote-description`, prüft den bisherigen Kunden-Mailbetrieb und hält `CRM_OFFER_MAIL_ENABLED` **ausgeschaltet** (auch beim Null-Traffic-Kandidaten). Erfolgscode `CRM OFFER SEND PREVIEW LIVE PASS` bestätigt nur die sichere Vorschau, **nicht** den Produktivversand.

**Webhook-Lernen ohne Kundenkontakt:** In Make Szenario 8144117 den geheimen Trigger-Webhook kopieren. `scripts/learn-crm-offer-send-webhook.ps1` erzeugt eine vollständig synthetische Offerte und sendet deren PDF-Base64 an den Webhook im Lernmodus; der Lernmodus verarbeitet den Datensatz **ohne Gmail-Versand**. Danach Make-Datenstruktur und Anhangsmapping überprüfen und einen echten Testversand ausschliesslich an das TEST_ONLY-Postfach verifizieren. Das Szenario und der produktive Versand bleiben bis zur geprüften Freigabe ausdrücklich inaktiv/deaktiviert. **Keine automatischen echten Kundenmails und keine produktiven Offertenversände ohne separate Prüfung/Freigabe.**

```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\learn-crm-offer-send-webhook.ps1"
```

**Offen:** Lern-Payload bei Make verifizieren, isolierten TEST_ONLY-Gmail-Versand inkl. PDF-Anhang durchführen, Zustellnachweis und Rendering kontrollieren, vertraulichen Webhook per GCP Secret Manager an Cloud Run binden, Testmodus und schliesslich explizit autorisierten produktiven Versand aktivieren. Auch der Portal-Annahmelink bleibt späterer Arbeitsschritt.

---

### CRM V2 – Leistungsbeschreibung neuer Offerten standardmässig leer (23.10.2026)

Neue automatisch erzeugte Offerten aus der Lead-Qualifizierung erhalten `description: ''` und werden **nicht** mehr mit der Anfrage, dem bisherigen Ablauf oder den Qualifizierungsangaben des Leads vorausgefüllt. Dies betrifft beide bestehenden Firestore-Pfade: direkte Anlage eines qualifizierten Leads und späterer Statuswechsel auf `Qualifiziert`. Der Website-Lead behält sämtliche ursprünglichen Felder; die Offertennummerierung, Positionen, Preise, CRM-Zustände und der Mailbetrieb bleiben unverändert. Die Leistungsbeschreibung kann im Offerteneditor weiterhin freiwillig manuell erfasst werden. **Bereits erstellte Offerten, einschliesslich Nr. 1000, werden nicht rückwirkend verändert.**

`crm-v2/test/cloud-records.test.js` prüft beide Erstellungspfade, den leeren Standardwert, die manuelle Bearbeitbarkeit und dass spätere Lead-Änderungen den Offertentext nicht überschreiben.

Live-Rollout: `scripts/deploy-crm-empty-description-live.ps1` akzeptiert ausschliesslich die bereits produktiv bestätigte Vorversion mit Tag `crm-offer-tracking` auf 100 % Traffic, liest deren konkrete Revision als Rollback-Ziel, startet CRM-Tests und legt vor der Prüfung des Candidates eine Null-Traffic-Revision an. Cloud-Run-Umgebung, Mail-Scheduler, Identitäten und HTTP-Schutz bleiben unverändert. Der Live-Status wird erst nach `CRM EMPTY OFFER DESCRIPTION LIVE PASS` bestätigt.

```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\deploy-crm-empty-description-live.ps1"
```

---

### CRM V2 – Offertenversand dokumentieren und gezielt nachfassen (23.10.2026)

**Ausgangslage:** Nummerierung, Offertenbearbeitung, gespeicherte PDF-/Druckansicht und Annahme/Abschluss inklusive automatischer Kunden-/Projektanlage funktionieren bereits. Es fehlten ein nachvollziehbarer Versandnachweis und die Wiedervorlagen zwischen Angebot und Kundenentscheid.

**Umgesetzt auf `feature/crm-v2-cloud-staging-20261023` (noch nicht live):**
- Im vorhandenen Offerteneditor gibt es neu den Bereich **«Versand und Nachverfolgung»**. Bei `Entwurf`: Offerte bearbeiten und auf `Bereit` setzen. Bei `Bereit`: vorbereiteten E-Mail-Text mit Empfänger und Betreff kopieren, die vorhandene gespeicherte Druckansicht als PDF verwenden und **E-Mail inkl. Anhang ausserhalb des CRM manuell verschicken**. Erst nach Bestätigungsdialog kann der Mitarbeiter den erfolgten Versand als `Versendet` protokollieren. **Dieser Klick sendet nie eine E-Mail.** Er trägt den nächsten Nachfasstermin ein.
- Backend `POST /api/records/offerten/:id/dispatch` benötigt die bestehende Google-CRM-Anmeldung und Same-Origin, prüft atomar Status `Bereit`, gültiges Gültigkeitsdatum, positive Offertenposition(en), verknüpfte Empfänger-E-Mail und Nachfassdatum. Im Firestore-Dokument werden `sentAt`, `sentBy`, `sentTo`, `followUpDate`, `followUpCount` gespeichert. Mehrfacher Versandnachweis ist durch den Statuswechsel blockiert; generischer Statuswechsel auf `Versendet` ebenfalls.
- **Versendete Offerten bleiben inhaltlich schreibgeschützt.** Im Dialog können manuell durchgeführte Nachfassaktionen mit Datum/Notiz über `POST /api/records/offerten/:id/followup` dokumentiert werden; neue Wiedervorlage ersetzt die alte, Geschichte und Bearbeiter werden aufgezeichnet. Keine automatischen E-Mails und keine automatisch ausgeführten Follow-ups.
- Klare Aktionen **«Als angenommen markieren»** und **«Als abgelehnt markieren»** mit Bestätigungsdialog. Annahme nutzt die vorhandenen Firestore-Transaktionen, erzeugt Kunde und Projekt weiterhin nur einmal und sperrt die Offerte. Ablehnung markiert einen verknüpften Lead wie bisher als `Verloren`. Alte angenommene oder versendete Offerten bleiben lesbar. Bestehende Statusübergänge für legacy-Records sind weiterhin kompatibel.
- Im Dashboard zusätzliche **«Offerten-Nachverfolgung»** mit heute fälligen/überfälligen Offerten und direktem Sprung zum Offerteneditor; Kennzahl in «Jetzt wichtig». Offertenregister mit neuer Spalte «Nachfassen». Keine neuen Make-Szenarien, keine Änderung am produktiven Website-Lead- oder CRM-Mailbetrieb.
- Neue Validatoren in `crm-v2/offer-tracking.js`, API in `crm-v2/server.js`, Transaktionen in `crm-v2/cloud-records.js`, Oberfläche in `crm-v2/public/index.html`. Regressionstests prüfen Versandbereitschaft, Datumsgrenzen, Doppelaktionen, gesperrte versendete Offerten, Nachfassgeschichte, Annahme/Ablehnung, unveränderte Kunden-/Projekterstellung, auth-/Origin-Schutz und Dashboard.

**Deployment vorbereitet, nicht automatisch live:** `scripts/deploy-crm-offer-tracking-live.ps1` verlangt beim Preflight die vom Geschäftsführer bestätigte vorige Produktivrevision mit Tag `crm-contact-workflow` auf 100 % Traffic und speichert sie als Rollback-Ziel. Danach vollständige CRM-Tests, Prüfung von Mail-Env, Cloud Scheduler, Service Account, Secret-Referenzen und bestehendem HTTP-Schutz; neue Revision zunächst bei 0 % Traffic. Erst wenn alle Prüfungen erfolgreich sind, Produktionswechsel. Kein Versand, keine Testdatensätze oder Mail-Event-Neuabwicklung beim Deploy.

```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\deploy-crm-offer-tracking-live.ps1"
```

**Produktivstatus erst nach `CRM OFFER TRACKING LIVE PASS` behaupten.** Danach im Browser das CRM neu laden und eine synthetische/ungefährliche Testofferte durch die manuelle Dokumentation durchgehen; keinesfalls behaupten, dass der Versand selbst automatisiert ist.

---

### CRM V2 – Kontaktmanagement und Wiedervorlagen (23.10.2026)

**Ziel:** Den Weg von Website-Lead → Kontaktaufnahme → Qualifizierung → Offerte ohne Medienbrüche unterstützen. Alle Änderungen im bestehenden Cloud-Run-CRM und dessen Firestore-Namespace; keine neuen Make-Szenarien oder automatischen Kundenmails.

**Neue CRM-Funktionen (GitHub-Branch `feature/crm-v2-cloud-staging-20261023`, noch nicht live):**
- **Kontaktverlauf im Lead-Detail:** Kontaktart Telefon, E-Mail, Besprechung oder Sonstiges; Ergebnis Erreicht, Nicht erreicht, Nachricht gesendet; verpflichtende Gesprächsnotiz; serverseitiger Zeitstempel und Bearbeiter. Append-only `contactHistory` (bis 100 Einträge pro Lead) via Google-ID-Token und Same-Origin-geschütztem `POST /api/records/leads/:id/contacts`. Firestore-Transaktion verhindert Überschreibungen bei gleichzeitigem Bearbeiten. Erfolgreicher dokumentierter Kontakt setzt einen Lead von `Neu` auf `Kontaktiert`; `Nicht erreicht` belässt den Status `Neu`. Kein E-Mail- oder Telefonversand wird vom Kontaktprotokoll ausgelöst.
- **Wiedervorlage:** Am Lead `nextAction` (max. 180 Zeichen) und `followUpDate` (gültiges ISO-Datum) gemeinsam speichern, im Lead-Detail ändern oder mit «Als erledigt markieren» löschen. Eigene Spalte in Website Leads zeigt den Termin. Dashboard zeigt heute fällige und überfällige nächste Aktionen als einzelne anklickbare Leads sowie deren Anzahl bei «Jetzt wichtig». Lokal-datumsbasiert, aktualisiert bei Tageswechsel im offenen Dashboard. Nur offene Lead-Phasen `Neu`, `Kontaktiert`, `Qualifiziert`; keine zusätzlichen Scheduler- oder E-Mail-Reminders.
- **Qualifizierung:** Im Lead-Detail die bereits bekannten Felder Ablauf, Systeme, Problem, Häufigkeit und gewünschtes Ergebnis sowie neue interne Felder `budgetRange`, `qualificationNotes` bearbeiten. Die Aktion «Speichern & qualifizieren» erfasst den Bedarf und setzt den Status in einer einzigen CRM-Transaktion auf `Qualifiziert`, wodurch wie bisher exakt eine nummerierte, bearbeitbare Offerte entsteht. **Historischer Entwicklungsstand:** Damals enthielt der Entwurf vorbefüllte Bedarfsangaben. Dies wurde am 23.10.2026 durch die leere Standard-Leistungsbeschreibung ersetzt. Bestehende Offerten werden nicht ungefragt geändert.
- **Datenregeln:** Verfügbare CRM-Bearbeiter unverändert (`CRM_ALLOWED_EMAILS`), Kontaktverlauf wird nicht über generische PATCH-Felder überschrieben, Firestore-Präfixe und Mail-Event-IDs bleiben unverändert. `crm-v2/lead-contact.js` enthält Validierungsregeln und die reine Offerten-Vorbefüllung.

**Release:** `scripts/deploy-crm-contact-workflow-live.ps1` startet mit allen lokalen CRM-Regressionstests, prüft bestehende aktive Live-Revision mit dem Tag `crm-lead-age-traffic-light` bei 100 % Traffic, Cloud-Run-Identität und alle Environment-/Secret-Referenzen sowie den aktiven OIDC-Scheduler. Danach erstellt das Skript eine getaggte 0%-Revision, prüft HTTP-Auth (inkl. Kontakt-POST ohne Token = 401) und schaltet nur bei Erfolg um. Bei Fehler nach Umschaltung Rückfall auf die vorher erkannte Revision. **Keine echten Kontakte/Leads bei Deploy erzeugen, keine Mails versenden, keine bestehenden Events zurücksetzen.**

```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\deploy-crm-contact-workflow-live.ps1"
```

**Status:** Im Branch entwickelt und über GitHub Actions geprüft; für Produktivstatus ausdrücklich erst nach `CRM CONTACT WORKFLOW LIVE PASS` und manuellem Browser-Test im bestehenden CRM melden.

---

### Website Leads – Ampel nach Eingangsalter (23.10.2026)

Die Spalte **Eingegangen** im produktiven CRM V2 erhält eine kompakte, farbige Anzeige mit kleinem Punkt. **Grün**: Lead ist weniger als 8 Stunden alt. **Orange**: 8 bis unter 16 Stunden. **Rot**: mindestens 16 Stunden, bleibt auch nach 24 Stunden rot. Die Berechnung erfolgt stets gegen `createdAt` des ursprünglichen Website-Leads, statusunabhängig und ohne Backendänderung. Ungültige oder fehlende Zeitstempel erhalten die neutrale Anzeige «–».

Der vorhandene Text («gerade eben», «vor 3 Min.», «vor 8 Std.», «vor 1 Tag») und der Hover-Zeitstempel bleiben erhalten. CSS-Klassen, Hintergrund, Punkt und Schriftfarbe machen die Ampel erkennbar; zusätzlich erhalten die Werte eine beschreibende `aria-label`-Angabe. Die bisherige einminütige DOM-Aktualisierung `refreshLeadAges` aktualisiert **Text und Farbe**, auch genau an den Übergängen 8/16 Stunden. Kein weiterer API-Aufruf. Die 24h-Lead-Erinnerung, die Regeln zur Löschung «Neu» und sämtliche CRM-Mailabläufe bleiben unverändert.

Regressionstests kontrollieren exakte Grenzwerte `8h-1ms`/8h/`16h-1ms`/16h/24h/72h sowie die Minutenerneuerung inkl. Farben und Hilfstext. Der verantwortliche Deploy ist `scripts/deploy-crm-lead-traffic-light-live.ps1`. Er akzeptiert beim Preflight sowohl die vorherige Dashboard-Only-KPI-Revision mit Tag `crm-dashboard-kpis-only` als auch die danach aktivierte Lead-Controls-Version mit Tag `crm-lead-workflow-refresh`; welches von beiden live ist, wird **gelesen, nicht geraten**. Vor produktiver Umschaltung folgen CRM-Tests, 0%-Kandidat, Cloud-Run-/Scheduler-/Secret-/HTTP-Prüfung. Rollback erfolgt auf die bei Start festgestellte aktive Revision. Keine Cloud-Daten, Kundenmails oder Make-Szenarien durch das Skript verändern.

```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\deploy-crm-lead-traffic-light-live.ps1"
```

Nur nach `CRM LEAD TRAFFIC LIGHT LIVE PASS` und 100% neuem Traffic als produktiv melden. Seite danach neu laden.

---

### CRM V2 Website Leads – Löschen, Statussperre und relative Altersanzeige (23.10.2026)

Im Register **Website Leads** hat jeder Lead mit aktuellem Status **Neu** rechts neben **Öffnen** ein rotes **×** mit Bestätigungsdialog. Nach bestätigtem Löschen ruft die angemeldete CRM-Oberfläche `DELETE /api/records/leads/:id` auf und aktualisiert alle Listen und Dashboard-Kennzahlen. Für andere Status fehlt das ×. Der Server verlangt bestehende Google-ID-Token-Authentifizierung sowie Same-Origin-Kontrolle und prüft in einer Firestore-Transaktion den tatsächlich aktuellen Status und das Fehlen einer verknüpften Offerte. Nur **Neu** ohne Offerte kann dauerhaft gelöscht werden; andere Register haben keine DELETE-Route. E-Mail-Versandereignisse werden nicht zurückgesetzt oder erneut versendet.

Status **Neu** ist nur Einstiegsstatus; die Statusauswahl im Lead-Detail und im Bearbeitungsformular bietet ihn nach jeder anderen Statusstufe nicht mehr an. Der Backend-Updatepfad weist Übergänge von jedem anderen Status zurück auf **Neu** mit HTTP 409 ab. Andere Statusübergänge bleiben wie gehabt. In der Lead-Tabelle gibt es jetzt die zusätzliche Spalte **Eingegangen** mit Altersanzeige (z. B. «vor 3 Min.», «vor 2 Std.», «vor 4 Tagen») auf Basis von `createdAt`; die lokale Originalzeit ist per Hover verfügbar. Die Altersangaben werden einmal pro Minute im DOM aktualisiert, ohne einen zusätzlichen Backend-Request auszulösen.

Tests: neue Firestore-Fakes/Regressionsprüfungen für erlaubte/abgelehnte Löschungen, irreversible Neu-Stati, Verknüpfung zu bestehenden Offerten; Browser-Checks für ×, Altersberechnung/Refresh und die beiden Statusauswahlen. Bestehendes 30-Sekunden-Lead-Polling und Kundenmail-Templates bleiben unverändert.

**Produktionsumstellung vorbereitet, noch nicht aktiv:** `scripts/deploy-crm-lead-controls-live.ps1` überprüft zu Beginn, dass die vorherige Dashboard-Only-KPI-Revision unter dem Tag `crm-dashboard-kpis-only` tatsächlich **100 % Traffic** bedient. Die konkrete Revision wird vor dem Deployment aus Cloud Run gelesen und als Rollback vorgemerkt (kein geratenes Revisionskürzel). Danach Tests, unveränderte Firestore-/Website-/Scheduler-/Mail-Konfiguration, 0%-Deploy, HTTP-Schutznachweis und Umschaltung mit Rollback im Fehlerfall. Keine Test-Leads oder echten Datensatz-Löschungen im Deploy-Skript.

```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\deploy-crm-lead-controls-live.ps1"
```

Der neue Stand ist erst nach `CRM LEAD WORKFLOW LIVE PASS` produktiv. Zur Sichtprüfung danach das CRM im Browser neu laden.

---

### CRM V2: KPI-Übersicht nur auf Dashboard (23.10.2026)

Die bisherige doppelte KPI-Leiste (Website Leads, Kunden, Offerten, Rechnungen, Projekte) wird in `crm-v2/public/index.html` in sämtlichen Arbeitsregistern `leads`, `kunden`, `offerten`, `rechnungen` und `projekte` vollständig ausgeblendet. Die Dashboard-KPI-Karten (Neue Leads, offene Offerten/Rechnungen, aktive Projekte, Zahlungseingänge) bleiben unverändert. Auch der leere Abstand des KPI-Containers entfällt via `#kpis[hidden]{display:none}`. Ein isolierter UI-Regressions-Test prüft Tabwechsel Dashboard → Arbeitsregister → Dashboard, Kartenanzahl, Sichtbarkeit und fehlende Leerfläche. Keine Daten-/Mail-/CRM-Statuslogik verändert.

**Deployment vorbereitet, nicht automatisch live:** `scripts/deploy-crm-dashboard-kpis-live.ps1` erwartet die vom Nutzer bestätigte Live-Revision `lszh-crm-v2-00014-mad` mit 100 % Traffic. Vor dem Wechsel 0%-Kandidat, CRM-Tests, unveränderte Cloud-Run-Env-/Secret-Bindungen, bestehender mailaktiver Scheduler und HTTP-Schutzprüfungen; bei Fehler nach Trafficwechsel Rollback auf `00014-mad`. Keine neuen Mailereignisse, keine erneute Zustellung und kein Make-Eingriff. Live erst nach `DASHBOARD ONLY KPIS LIVE PASS` behaupten.

```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\deploy-crm-dashboard-kpis-live.ps1"
```

---

### Praxistest: automatische Lead-Aktualisierung im Live-Browser bestätigt (23.10.2026)

Der Geschäftsführer hat nach dem erfolgreichen Deployment der produktiven Cloud-Run-Revision `lszh-crm-v2-00006-moz` selbst das öffentliche Website-Formular getestet und bestätigt: **Neuer Website-Lead erscheint automatisch im geöffneten Live-CRM, ohne manuelles Neuladen oder erneute Google-Anmeldung.** Die 30-Sekunden-Synchronisierung funktioniert damit auch im echten Browser. Das Website→Render→Cloud Run→Firestore→CRM-UI-Ziel ist praktisch verifiziert. Keine zusätzliche Änderung, kein Deployment, keine produktive Mail oder Vertragsannahme durch diese Dokumentation.

## CRM V2 Lead-Auto-Refresh – PRODUKTIV seit 23.10.2026

Der Geschäftsführer führte `scripts/deploy-crm-lead-refresh-live.ps1` erfolgreich auf dem Surface aus und übermittelte die vollständige Ausgabe.

- **CRM-Testsuite: 23/23 PASS**, kein fehlgeschlagener Test.
- Neue Cloud-Run-Revision **`lszh-crm-v2-00006-moz`**, erst mit `0 %` Traffic erstellt und anschliessend nach bestandenen HTTP-Checks auf **100 % produktiven Traffic** umgeschaltet.
- **Aktuelle produktive Revision:** `lszh-crm-v2-00006-moz` (ersetzt als Traffic-Ziel `lszh-crm-v2-00004-mez`).
- **Unmittelbare Rückfallrevision:** `lszh-crm-v2-00004-mez` (nun 0 % Traffic, weiterhin per Tag `crm-v2-candidate` erreichbar).
- Gegen den neuen Kandidaten und anschliessend die Live-URL bestätigten HTTP-Probes: CRM HTML `200`, OAuth-Konfiguration `200` und Leads-API ohne Anmeldung `401`.
- Bestehende Live-Revisionszuordnung und Secret-Manager-Bindung wurden vor der Bereitstellung geprüft; nach `--no-traffic` waren Secret-, OAuth-, Präfix- und Diensteinstellungen unverändert.
- **Frontend-Funktion:** Website-Leads automatisch alle 30 Sekunden neu laden, beim Tab-Fokus/Zurückwechseln aktualisieren, manueller Knopf `↻ Aktualisieren`; keine Änderung offener Editierdialoge. Der eingeloggte Zustand bleibt während normaler Aktualisierungen bestehen.
- Die alte Seite im Browser muss **einmalig** neu geladen und gegebenenfalls wieder angemeldet werden, um die neue UI-Version zu bekommen. Bei vollständigem Seiten-Reload kann Google abhängig vom Browser weiterhin eine Anmeldung verlangen, weil kein ID-Token persistent gespeichert wird.
- **Nachkontrolle offen:** tatsächliche automatische Anzeige eines frisch eingesandten Leads im offenen Browser innerhalb ca. 30 Sekunden prüfen. Der frühere öffentliche Website→Firestore-End-to-End-Test war bereits erfolgreich und wurde bei diesem reinen UI-Deployment nicht erneut ausgeführt.
- **Rollback falls erforderlich:** `gcloud.cmd run services update-traffic lszh-crm-v2 --project lszh-automations --region europe-west6 --to-revisions=lszh-crm-v2-00004-mez=100` – nur bei tatsächlich erkanntem Problem, nicht vorsorglich ausführen.

## Produktiver CRM-V2-Cutover erfolgreich – 23.10.2026

Der Geschäftsführer hat nach ausdrücklicher Freigabe das Skript `scripts/cutover-crm-v2-live.ps1` auf dem Surface ausgeführt und die vollständige erfolgreiche PowerShell-Ausgabe übermittelt.

- **Live-Cloud-Run-Dienst:** `lszh-crm-v2`; Revision `lszh-crm-v2-00004-mez` erhält **100 % produktiven Traffic**.
- **Alte Rückfallrevision:** `lszh-crm-v2-00002-6lh` bleibt als benannter Rückfallpunkt erhalten. Kein Rollback ausgelöst.
- **Render-Website:** `https://www.lszh-automations.ch` war erreichbar. **Keine neue Render-Bereitstellung und kein Wechsel der Website-URL**.
- **Produktive CRM-Oberfläche:** `https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app` lieferte die erwartete CRM-V2-Oberfläche. Anonyme CRM-API-Anfragen blieben gesperrt.
- **Echter Website-to-CRM-HTTP-Test:** `POST /api/lead` über die öffentliche Render-Website → bestehendes Cloud-Run-Ziel → produktive Firestore-Sammlung mit `confirmed:true` und Datensatz-ID.
- **Testlead in Live:** `web_bc17917b879a4f4ab254456da78b68e5`, gekennzeichnet als `TEST_ONLY LSZH CRM V2`.
- **Dublettentest:** identische Wiederholung derselben `submission_id` lieferte denselben Datensatz; keine zweite Lead-Erstellung.
- **Website-Formularweg benötigt kein Airtable/Make.** Alte Datenmigration wurde vom Geschäftsführer ausdrücklich abgewählt; produktiver Startbestand war absichtlich leer.
- **Backup vor Cutover:** kompletter Export `gs://lszh-firestore-backups-470613067122/backups/20261023-094036` mit `SUCCESSFUL`; isolierter Restore nicht getestet.

**Produktivstatus:** CRM-V2-Cutover erfolgreich. Echte neue Website-Leads sollen ab jetzt in der produktiven CRM-V2-Firestore-Sammlung sichtbar sein. Die Anzeige des Testleads im angemeldeten Dashboard ist der nächste visuelle Abnahmeschritt; die HTTP-Speicherung ist bereits bestätigt. Website-Datenschutztext-Änderung befindet sich noch im unveröffentlichten Entwicklungsbranch und ist nicht automatisch auf Render veröffentlicht. Für weitere produktive Änderungen gesondert freigeben. Keine Kundenmail, Vertrag oder Rechnung durch diesen Cutover versandt.

## Verbindliche Geschäftsführerentscheidung – 23.10.2026: Kein Airtable-Import

- Für **LSZH CRM V2** werden weder Airtable noch die bisherigen Airtable-Datensätze benötigt. **Keine Migration, keine Zuordnung historischer Airtable-IDs, keine Nachführung historischer CRM-Daten**.
- Der Geschäftsführer bestätigt den durch die Firestore-Zählung ermittelten **leeren Live-Bestand** (`lszh_crm_v2_`: jeweils null Leads, Kunden, Offerten, Projekte und Rechnungen) als **korrekten gewünschten Startzustand**.
- Die produktiven Offerten- und Rechnungsnummern beginnen jeweils bei **1000**. Die Staging-Nummern zählen nicht zum Live-Bestand.
- Der produktive Website-Eingang bleibt **Render -> Cloud Run -> Firestore**; kein Make-/Airtable-Zwischenschritt im Hauptkontaktformular. Make für andere, ausdrücklich benötigte Kundenautomationen unabhängig davon weiter nutzbar.
- **Airtable-Inventur/Import ist kein Go-Live-Blocker mehr**. Historische Airtable-Datenbanken, Make-Szenarien, Google-Drive-Archive und Nachweise werden durch diese Entscheidung **nicht automatisch gelöscht oder deaktiviert**; hierfür wäre eine separate gezielte Freigabe erforderlich.
- Bereits bestanden: Staging-Prozess und Website-Ingest, produktiver Cloud-Run-Kandidat `lszh-crm-v2-00004-mez` mit `0 %` Traffic, anonyme API-Negativtests sowie erlaubter Google-OAuth-Login und leeres Live-Dashboard in Edge; Firestore-Gesamtexport nach Zürich mit Status `SUCCESSFUL`.
- Weiter offen: **isolierten Firestore-Restore nachweisen** (Backup vorhanden, Restore ungetestet), Website-Datenschutzerklärung im produktiven Render-Stand anpassen/veröffentlichen, produktiven Traffic-Switch bewusst freigeben und danach `POST /api/lead` durch die echte Render-Website mit synthetischer Anfrage testen. Derzeit läuft weiter `lszh-crm-v2-00002-6lh` mit 100 % Traffic. **Kein Cutover durch diese Dokumentationsentscheidung.**

# LSZH Automations – Projektstand & Betriebsentscheidungen

_Stand: 13.10.2026. Interne Arbeitsdokumentation. Keine Passwörter, API-Schlüssel oder Token hier eintragen._

## Nachtrag 23.10.2026 – CRM V2: gesonderte Cloud-Staging-Infrastruktur

- Der auf dem Surface getestete lokale CRM-V2-Fachprozess (Dashboard, Leads, Offerten, Kunden, Projekte und Rechnungen) wurde in einem eigenen Entwicklungsbranch erfolgreich durchgespielt. Keine automatischen Kundenmails oder echten Rechnungsversände.
- Für die sichere Cloud-Übernahme wurde **feature/crm-v2-cloud-staging-20261023** direkt aus main erstellt. Die vollständige Oberfläche und die fachlichen Validierungen werden über einen neuen authentifizierten Firestore-Dienst eingebunden.
- **Zielservice:** lszh-crm-v2-staging (neu), Sammlungen lszh_crm_v2_staging_*. **Der produktive Website-Lead-Eingang bleibt unverändert** auf lszh-crm-v2 mit seinen bestehenden Sammlungen und Secret-Manager-Zugängen. Staging-Website-Webhook ist hart deaktiviert.
- Google-OAuth-Anmeldung mit Workspace-Mail-Allowlist ist vorgesehen; noch keine OAuth-Client-ID eingerichtet oder geprüft. Der Cloud Run Staging-Deploy wurde noch **nicht** durchgeführt. Echte Firestore-End-to-End-Tests fehlen.
- Sieben pure simulierte Firestore-Funktionstests erfolgreich (Qualifizierung, Gewinnung, Offerten-Sperre, Projekt- und Rechnungsdaten, Remindervorschau). GitHub-Actions-Tests und separater PowerShell-Staging-Deploy eingerichtet.
- **Keine Produktionsfreigabe oder Merge in main.** Vor Cutover: OAuth, echter Staging-Test, Live-Daten/Nummernkreis, Rollback/Backup, Dienstkontorechte, echte interne Erinnerungs-E-Mail und Swiss-QR-Zahlteil klären.
- Technische Übergabe/Bedienung: siehe crm-v2/CLOUD-STAGING.md im Cloud-Staging-Branch. Lokale Preview weiter unverändert.

### Browserabnahme CRM-V2-Staging am 23.10.2026

Der Geschäftsführer bestätigt, dass in der Cloud-Version (`lszh-crm-v2-staging`) der komplette Testablauf **Lead → Qualifiziert/Offerte → Angenommen/Kunde/Projekt → Rechnung/Offen/Bezahlt** funktioniert. Firestore-Datensätze bleiben nach Neuladen erhalten, die Google-Anmeldung wurde ebenfalls erfolgreich getestet. Diese Bestätigung gilt für synthetische Daten im Staging, **nicht** für Produktionsfreigabe, produktiven Website-Eingang oder echte Zahlungsabwicklung.

**Nächste zielorientierte Schritte:** Live-Eingangsintegration ohne Downtime und mit überprüfbarem Rückfallweg vorbereiten; Vorhandene Live-Daten/Nummernkreis sowie Identitäts-/Zugriffsrechte und Backup prüfen. Erst nach Freigabe umschalten. Kundenversand bleibt gesperrt.

### 23.10.2026 – Website-Anbindung und Vorbereitung des Produktivstarts

- Analyse Website-`index.html` und Render-`server.js`: Hauptkontaktformular sendet bereits `POST /api/lead` und serverseitig über `CRM_LEAD_INGEST_URL` und `CRM_INGEST_SECRET` zu Firestore (direkt, ohne Make-/Airtable-Zwischenstufe). Ob die Live-Render-Umgebungsvariablen tatsächlich korrekt gesetzt sind, bleibt zu bestätigen.
- Wichtigste Anpassung im Cloud-Staging-Entwicklungsbranch: Annahme von Website-Leads in `crm-v2/server.js` verwendet nun die konfigurierte Firestore-Sammlung. `lead-ingest.js` erlaubt ausschliesslich `lszh_crm_v2_leads` beziehungsweise `lszh_crm_v2_staging_leads`. Schutz gegen irrtümliches Schreiben synthetischer Staging-Leads in die Live-Lead-Sammlung.
- Neue serverseitige Tests für identische Wiederholung (200), neue Einreichung (201), Konflikt (409), fehlendes Token (401) und deaktivierte Staging-Route (404).
- `scripts/test-crm-website-intake-staging.ps1`: einmaliger künstlicher HTTP-End-to-End-Test auf Cloud Run mit eigenem Secret Manager-Schlüssel und Deaktivierung des Staging-Webhooks im Anschluss; erst nach erneutem Cloud-Staging-Deploy ausführen.
- `scripts/preflight-crm-production.ps1`: reiner Lesecheck bestehender Cloud-Run-Revisionen, Servicekonto und Secret-Referenz. Produktivdateninventar, Backup und Render-Umgebung weiter offen.
- Ausführlicher Cutover-Plan: `crm-v2/WEBSITE-CUTOVER.md`. **Keine Render-Veränderung, kein Merge in main, kein Live-Cloud-Run-Deployment, keine Kundenmails.**

## Website-Eingang: HTTP-Test erfolgreich – 23.10.2026

Der Geschäftsführer hat den echten synthetischen Staging-HTTP-Test mit `scripts/test-crm-website-intake-staging.ps1` ausgeführt und die PowerShell-Ausgabe übermittelt:

- Dediziertes Staging-Testsecret `lszh-crm-v2-staging-website-test` Version 1 erstellt; Berechtigung für Cloud-Run-Dienstkonto gesetzt. Keine geheimen Werte im Chat.
- Nach temporärer Staging-Aktivierung Cloud-Run-Revision `lszh-crm-v2-staging-00004-njk`, 100 % Traffic.
- Synthetisches `POST /api/internal/website-leads`: **201** (erstellt), identischer Wiederholungs-POST **200** ohne Dublette, abweichender Retry **409**, fehlendes Secret **401**.
- Ein bestätigter Staging-Firestore-Datensatz mit ID `web_d05af7b4be214345af56948b2215e265`. Dies ist **kein realer Kunde**.
- Im `finally` Staging-Webhook wieder deaktiviert. Cloud-Run-Revision `lszh-crm-v2-staging-00005-sjv` hat danach 100 % Traffic. PowerShell bestätigte `PASS: Staging Webhook wieder deaktiviert`.
- Der Test wurde **direkt am Cloud-Run-Staging-Webhook**, nicht über das öffentlich erreichbare Render-Webformular ausgeführt. Nach Prüfung der produktiven Konfiguration und expliziter Freigabe bleibt ein separater echter Website-Test nötig.
- **Kein Merge, keine Render-Umstellung, kein Produktiv-Cutover**. Nächster Schritt: `scripts/preflight-crm-production.ps1` (read-only) ausführen, Ausgabe prüfen; Live-Dateninventar, Backup, Nummernkreis und Google-OAuth-Zugriff separat kontrollieren.

### 23.10.2026 – Read-only Live-Preflight erfolgreich, Firestore-Inventar als nächster Schritt

Surface-PowerShell hat bestätigt, dass `lszh-crm-v2` weiter auf `lszh-crm-v2-00002-6lh` mit 100 % Traffic läuft. Das Live-Dienstkonto ist `lszh-crm-v2@lszh-automations.iam.gserviceaccount.com`; der bestehende Website-Eingangs-Secret ist über Secret Manager referenziert. Die alte Version hat noch keine gesetzten Intake-/Collection-Präfix-Flags. Staging weist `CRM_RECORD_PREFIX=lszh_crm_v2_staging_` und `CRM_WEBSITE_INTAKE_ENABLED=false` aus. Keine produktiven Änderungen.

Vorbereitetes `scripts/inventory-crm-firestore-readonly.ps1` ermittelt als nächsten Test ausschliesslich Live-/Staging-Collection-Anzahlen und Sequenz-Zähler über Firestore REST, ohne Geheimnisse/PII auszugeben oder etwas zu verändern. Datenzahlen noch nicht bekannt. Ein Live-Firestore-Backup, Datenschutz-/IAM-/Negativtests und überprüfbarer Rollback bleiben vor Cutover erforderlich.

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

### 23.10.2026 – CRM-V2-Live-Kandidaten-Preflight bestanden, noch kein Deployment

Nutzer hat den rein lesenden `scripts/prepare-crm-live-candidate.ps1` ohne `-Deploy` ausgeführt. Live-Cloud-Run-Revision `lszh-crm-v2-00002-6lh` mit 100 % Traffic unverändert; Servicekonto und Secret-Manager-Referenz nachgewiesen; 20/20 CRM-Tests bestanden; geprüfter Source-Commit `8598f99`. Keine produktive Änderung. Als bewusster nächster Schritt ist der `-Deploy`-Aufruf für eine getaggte Kandidatenrevision mit 0 % Standardtraffic vorbereitet. **Eine Tag-URL ist dennoch direkt erreichbar und kann auf Live-Firestore zugreifen; keine echten Schreibtests vor gesonderter Freigabe.** Bestandsabgleich Airtable und isolierte Backup-Wiederherstellung bleiben offen.

### 23.10.2026 – Live-Kandidat mit 0 % Traffic erfolgreich bereitgestellt

Vom Geschäftsführer übermittelte PowerShell-Ausgabe:
- `git pull --ff-only` auf Commit `55a7a09`, danach `scripts/prepare-crm-live-candidate.ps1 -Deploy`.
- **20/20** Node-Tests bestanden.
- Neuer CRM-V2-Kandidat im bestehenden Cloud-Run-Dienst `lszh-crm-v2`: Revision `lszh-crm-v2-00004-mez`, **0 % produktiver Traffic**.
- Getaggte Test-URL: `https://crm-v2-candidate---lszh-crm-v2-ozx7mp2bka-oa.a.run.app`.
- Weiterhin **100 % produktiver Traffic** auf Alt-Revision `lszh-crm-v2-00002-6lh`.
- Cloud-Run-Dienstkonto und bisherige `CRM_INGEST_SECRET`-Referenz nach Deployment unverändert.
- Kandidat konfiguriert für `CRM_RECORD_PREFIX=lszh_crm_v2_`, Website-Intake `true`, **also mit potenziellem Zugriff auf Live-Firestore**.
- Kein Render-Deployment, keine produktive Website-Umstellung, kein Kundenversand und keine Live-Datenmigration.

**Als Nächstes:** `scripts/check-crm-live-candidate-http.ps1 -CandidateUrl 'https://crm-v2-candidate---lszh-crm-v2-ozx7mp2bka-oa.a.run.app'` durch den Geschäftsführer ausführen (nur anonymes HTML/Config-GET und verbotene API-Aufrufe; erwartet 200/401). Danach Google-OAuth-Ursprünge und einen isolierten Restore- bzw. Datenbestandsabgleich vor endgültiger Traffic-Umstellung prüfen. Freigabe zum Go-live ist noch **nicht** erteilt.
### 23.10.2026 – Kandidaten-HTTP-Prüfung erfolgreich

Der Geschäftsführer hat die korrigierte Datei `scripts/check-crm-live-candidate-http.ps1` in PowerShell nach `git pull --ff-only` ausgeführt. Die getaggte Kandidaten-URL war `https://crm-v2-candidate---lszh-crm-v2-ozx7mp2bka-oa.a.run.app`.

- **PASS:** Startseite HTTP 200, Google-OAuth-Konfiguration HTTP 200.
- **PASS:** `GET /api/me`, `GET /api/records/leads`, `GET /api/print/offerte/test` ohne ID Token HTTP 401.
- **PASS:** `POST /api/internal/website-leads` ohne Secret HTTP 401.
- **PASS:** Keine Firestore-Schreibvorgänge; kein Secret an den Kandidaten gesendet.
- Das Testskript musste nur wegen der reservierten PowerShell-Systemvariablen `$HOME` auf `$homeResponse` korrigiert werden. Die Korrektur erforderte kein Cloud-Run-Deployment.
- **Kein** Auth-Login und keine Berechtigungsprüfung mit einem gültigen Google-ID-Token am Kandidaten bisher. Der getestete anonyme Zugriff bestätigt **nicht** die korrekt autorisierte produktive Google-Anmeldung.
- **Nächster Schritt:** Im bestehenden Google OAuth Webclient die JavaScript-Ursprünge `https://crm-v2-candidate---lszh-crm-v2-ozx7mp2bka-oa.a.run.app` und `https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app` ergänzen (vorhandenen Staging-Ursprung erhalten), Login mit dem erlaubten Workspace-Konto auf Kandidaten-URL durchführen und die leeren Live-Register ausschließlich lesen; keine Live-Datensätze bearbeiten oder Website-Cutover durchführen.
### 23.10.2026 – Produktionskandidat: Google-Login im Browser erfolgreich

Der Geschäftsführer hat nach Behebung von Google `400 origin_mismatch` die Google-OAuth-JavaScript-Ursprünge konfiguriert und einen Screenshot aus Microsoft Edge vom **erfolgreich angemeldeten** CRM-V2-Produktionskandidaten zur Verfügung gestellt.

- Browser-URL: `https://crm-v2-candidate---lszh-crm-v2-ozx7mp2bka-oa.a.run.app`.
- In der CRM-Oberfläche ist das erlaubte Geschäftskonto `lars@lszh-automations.ch` angemeldet; Dashboard mit Leads, Offerten, Rechnungen, Projekten und Finanzübersicht geladen.
- Alle angezeigten Dashboard-Zahlen sind 0 und stimmen mit dem zuvor ausgelesenen leeren Live-CRM-Firestore-Inventar überein.
- Es fand **keine produktive Traffic-Umschaltung und keine bestätigte Schreiboperation auf Live-Firestore** statt; der Cloud-Run-Kandidat war bei Deploy auf 0 % regulären Traffic gesetzt.
- Die Sichtprüfung des angemeldeten Dashboards ist kein vollständiger Beweis für die Korrektheit sämtlicher rollenbasierter Zugriffe, für das historische Airtable-Inventar oder die Restore-Fähigkeit des Backups.

**Nächste kontrollierte Produktions-Gates:** Airtable-/Make-Altbestand bestimmen und Umgang festlegen, isolierten Restore nachweisen und Datenvollständigkeit kontrollieren; unmittelbar vor Cutover produktive Cloud-Run-Revision/Secret/Traffic erneut validieren. Kein Go-Live ohne ausdrückliche Freigabe.
### 23.10.2026 – Freigabe für Live-CRM-V2-Websiteanbindung erteilt (Umschaltung noch ausstehend)

Der Geschäftsführer hat nach erfolgreicher Kandidaten-Sicherheitsprüfung, OAuth-Anmeldung und ausdrücklicher Bestätigung des leeren Live-Datenbestands die **Freigabe für die produktive Umschaltung** erteilt. Ziel: Alle neuen Anfragen des öffentlichen Render-Kontaktformulars über den bestehenden Cloud-Run-Endpunkt direkt ins Live-CRM-V2/Firestore schreiben. **Airtable wird nicht benötigt; keine Bestandsmigration.**

Neues Script `scripts/cutover-crm-v2-live.ps1`: überprüft die Altrevision `lszh-crm-v2-00002-6lh` (100 % Traffic), den getrennt getaggten Kandidaten `lszh-crm-v2-00004-mez` (0 %), Secret Manager, OAuth, Zielprefix `lszh_crm_v2_`, aktivierten Website-Eingang, Backup-Metadaten und öffentliche Website. Anschließend schaltet es **nur** die Cloud-Run-Traffic-Zuordnung auf die Kandidatenrevision, überprüft CRM-UI/API-Schutz und sendet einen explizit gekennzeichneten synthetischen Testlead über `https://lszh-automations.ch/api/lead` (bzw. offiziellen Redirect) mit eindeutiger submission_id. Die Antwort muss `confirmed:true` und eine `web_...`-ID enthalten; identische Wiederholung muss dieselbe ID bestätigen. Bei Fehler nach Umschaltungsversuch erfolgt automatischer Rollback auf die Altrevision; ein einzelner TEST_ONLY-Datensatz kann bei einem erst später auftretenden Fehler verbleiben.

Der vollständige PowerShell-Skriptinhalt wurde im Cloud-Staging-Branch gespeichert und GitHub CI hat die PowerShell-Syntax und CRM-Regressionstests bestanden. **WICHTIG: Das Skript ist auf dem Computer des Nutzers NOCH NICHT ausgeführt worden; kein Cloud-Run-Traffic wurde von diesem Chat umgeschaltet.** Kein produktives Website-Render-Deployment oder Kundenmail ist Teil des Skripts. Das Backup ist erfolgreich exportiert, isolierter Restore bleibt ausstehend.
### 23.10.2026 – Öffentliche Datenschutzerklärung an CRM-V2-Livebetrieb angepasst

Nach produktivem CRM-V2-Cutover wurde der Datenschutztext im Website-Code auf das aktuelle Verfahren angepasst. Der Nutzer erteilte mit «starten wir mit der aktualisierten datenschutzerklärung» den Arbeitsauftrag.

- Eigener minimaler GitHub-Branch: `fix/privacy-policy-crm-v2-live-20261023` aus `main`, um keinen unfreigegebenen CRM-Feature-Code in den produktiven Website-Branch zu übernehmen.
- Pull Request [#12](https://github.com/lszh-automations/lszh-automations-site/pull/12) **erfolgreich nach `main` gemergt** (Squash-Commit `3c8e9aa7f084d72137d5693f7141e7139f543d4a`). Vergleich zeigte **genau eine geänderte Datei** `index.html`.
- Datenschutzerklärung Stand 23.10.2026: öffentliches Kontaktformular Render → Google Cloud Run → Firestore, ohne Make/Airtable; Firestore Zürich und mögliche Auslandsbearbeitung; Übermittlungskennung/Status; KI-Demos direkt via OpenAI oder abhängig von Konfiguration via Make; notwendige Serverprotokolle.
- Bestehende separate Funktionen (Make/Airtable für Secure-Transfer und übrige Automationen) werden nicht pauschal als entfernt dargestellt. Kunden-/CRM-/Render-Code, Secrets und produktive Cloud Run Konfiguration wurden durch diesen PR nicht geändert.
- `main/index.html` wurde nach dem Merge erneut aus GitHub gelesen und enthielt die neuen Texte.
- **Render-Deployment und tatsächliche Sichtbarkeit im öffentlichen Browser sind vom Assistant nicht unabhängig bestätigt**; die Website-URL war über das verfügbare Webabrufwerkzeug nicht erreichbar. Der Geschäftsführer kann im Footer die Datenschutzerklärung öffnen und Stand 23.10.2026 prüfen; falls alter Text erscheint, Render-Deploystatus des Dienstes `lszh-automations-site` prüfen.
### 23.10.2026 – Airtable vollständig aus der Datenschutzerklärung entfernt

Der Geschäftsführer wünschte die vollständige Entfernung aller namentlichen Airtable-Erwähnungen aus der Datenschutzerklärung. Ein minimaler Website-PR [#13](https://github.com/lszh-automations/lszh-automations-site/pull/13) wurde aus main erstellt und in den produktiven GitHub-Branch main gemergt (Commit `86b2e4d58ea2819ef87d422ae3a683d2b56f1b8b`). Im aktualisierten `main/index.html` wurde geprüft: **0 Airtable-Erwähnungen innerhalb der Datenschutzerklärung und der gesamten Datei**; CRM-Datenfluss Render → Cloud Run → Firestore bleibt beschrieben. Für getrennte bestehende Secure-Transfer-Abläufe wird weiterhin transparent auf Make und externe Speicher-Dienstleister als Kategorie hingewiesen. **Dies löscht oder beendet keine Airtable-Integration im Backend**, sofern dort noch vorhanden. Andere Website- und CRM-Dateien wurden nicht verändert. Öffentliche Render-Auslieferung im Browser noch nicht unabhängig bestätigt.

### 23.10.2026 – CRM V2: neue Website-Leads ohne Browser-Reload anzeigen (UI-Fix vorbereitet)

Der Geschäftsführer meldet aus echtem Live-Formulartest: Der Website-Lead wurde korrekt in Live Firestore gespeichert, war aber erst nach vollständigem CRM-Neuladen und erneuter Google-Anmeldung sichtbar. Ursache im Frontend: `loadAll()` wurde nur nach Login und eigenen Datensatzänderungen ausgeführt, es gab keine regelmässige externe Lead-Aktualisierung. Re-Login nach F5 kann beim bisherigen Google Identity Services ID-Token-Modell aus Sicherheitsgründen nötig sein, da Token absichtlich nur im Arbeitsspeicher liegt.

Im Entwicklungsbranch `feature/crm-v2-cloud-staging-20261023` angepasst:
- `crm-v2/public/index.html` lädt neue Website-Leads bei aktiver Anmeldung alle **30 Sekunden** und zusätzlich beim Wiederaufnehmen/Fokussieren des Browsertabs nach.
- Zusätzliche Schaltfläche **↻ Aktualisieren** und unaufdringliche Statusanzeige.
- Keine Live-Refresh-Requests in versteckten Tabs, bei offenen Bearbeitungsdialogen, während anderer Live-Refreshes oder ohne gültiges Login. Bei 401 wird eine neue Google-Anmeldung verlangt.
- Bereits vorhandene Leads/Datensätze werden bei geänderten Ergebnissen neu dargestellt. **Kein CRM-Backend, Firestore-Schema, Website-Formular oder Render-Routing verändert.**
- Neue Browser-JavaScript-Syntax- und Refresh-Invariantentests `crm-v2/test/lead-auto-refresh-ui.test.js`; Inline-Skript zudem direkt in V8 syntaktisch erfolgreich kompiliert und zentrale Refresh-Invarianten überprüft.
- `scripts/deploy-crm-lead-refresh-live.ps1` führt lokale CRM-Regressionstests aus, prüft vorher `lszh-crm-v2-00004-mez` (100% Traffic), erstellt eine neue 0%-Revision, bestätigt Secret-/OAuth-/Service-Konfiguration, prüft anonymes UI 200/config 200/API 401, wechselt nach PASS auf die neue Revision und hat automatischen Rollback auf die bisherige Live-Revision bei nachfolgendem Fehler. Keine Testdaten/CRM-Schreibvorgänge.
- **Wichtig: Änderung NOCH NICHT produktiv ausgerollt.** Zuerst lokales `git pull --ff-only`, dann PowerShell-Rolloutskript ausführen, Ausgabe kontrollieren, einmalig CRM-Browser neu laden und neue Formulareinreichung ohne Reload auf Live beobachten. GitHub Actions-Run war beim Dokumentationszeitpunkt noch nicht unabhängig bestätigt.
### 23.10.2026 – Drei E-Mail-Automationen in Arbeit (noch **nicht live**)

Auf Wunsch des Geschäftsführers: (1) Kunden-Eingangsbestätigung beim neuen Website-Lead, (2) interne Sofort-Mail für `lars@lszh-automations.ch`, (3) interne Erinnerung nach 24 Stunden **nur falls Status weiterhin `Neu`**.

Code im Branch `feature/crm-v2-cloud-staging-20261023`: `crm-v2/mail-templates.js`, `crm-v2/mail-dispatcher.js`, neuer (standardmässig deaktivierter) `POST /api/internal/mail/tick`-Endpunkt mit OIDC-Identitätsprüfung in `crm-v2/server.js`, Regressionstests `crm-v2/test/mail-notifications.test.js` und Lernskript `scripts/learn-crm-mail-webhook.ps1`. Ausführliche Betriebsanleitung `crm-v2/MAIL-AUTOMATIONS.md`.

**Make:** In Team `1728770` neu ein **inaktives** Szenario `8135270` `LSZH CRM V2 – Mailversand (TEST ONLY / INAKTIV)` mit generischem Webhook erstellt; aktuell Webhook-Lernmodus aktiviert. Webhook-URL ist ein Geheimnis und steht **nicht** in GitHub. Make Gmail-Send-Modul besitzt geschäftliche Verbindung **11904991** zu `lars@lszh-automations.ch`; Send-as-Alias `"LSZH Automations" <info@lszh-automations.ch>` ist vom Modul als verfügbar zurückgegeben worden. **Private Gmail-Verbindung nicht verwenden.** Mail-Modul/Response noch nicht verkabelt, bis eine synthetische Webhook-Nachricht das Schema bestätigt.

**Sicherheit/Betrieb:** keine produktive E-Mail versendet; bestehende Website→CRM→Firestore-Verbindung unverändert, Live-Revision `lszh-crm-v2-00006-moz`. Versandmechanismus wird getrennt und default-off eingeführt, Ereignisse werden nur einmal beansprucht und unklare Send-Resultate als `manual_review` markiert (keine blinden Retries). Geplante Cloud-Scheduler-Auslösung etwa jede Minute; 24h-Mail liest Live-Status und sendet nur für `Neu`. Keine rückwirkenden Altlead-Mails (Aktivierungszeitpunkt erforderlich).
### 23.10.2026 – Make CRM-V2-Maildispatcher: Webhook gelernt und interne Testfunktion aktiviert

- Benutzer hat den synthetischen PowerShell-Lernaufruf abgeschlossen. Make-Inspektion für Szenario **8135270** zeigt `learning=false`, alle 5 Felder **`eventId, kind, to, subject, html`**, Webhook-Queue 0.
- In Make Szenario 8135270: **Geschäftliches** Gmail-v4-Modul 2 verbunden (Connection 11904991, Status `ok`, Absenderalias `"LSZH Automations" <info@lszh-automations.ch>`). Modul 3 gibt nach erfolgreichem Gmail-Schritt `{"ok":true,"messageId":"{{2.id}}"}` als Antwort zurück.
- Szenario jetzt **aktiv**, aber zwingender Make-Filter vor Gmail: **nur** `kind=internal_new`, `to=lars@lszh-automations.ch` und `eventId` mit `test_only_`. Dadurch sind Kundenmails und produktive Lead-Nachrichten bis zur ausdrücklichen Abnahme gesperrt. Keine interne Mailtest-Ausführung bestätigt.
- Neues Skript `scripts/test-crm-business-mail.ps1` führt genau einen synthetischen **internen** Mailtest aus und fragt den Webhook-Link verdeckt ab. Das ursprüngliche `learn-crm-mail-webhook.ps1` bitte nicht wiederholen, nachdem das Szenario aktiv ist. PowerShell-Syntaxprüfung beider Skripte zum GitHub-CI-Workflow hinzugefügt.
- **CRM Live noch unverändert:** Revision `lszh-crm-v2-00006-moz` mit 100 % Traffic. Servermail-Dispatcher ist nur Quellcode, noch nicht deployt/aktiviert. Keine automatischen produktiven Kunden-E-Mails oder 24h-Erinnerungen.
- Nächster Schritt: Nutzer führt `git pull --ff-only`, `npm.cmd test --prefix .\crm-v2`, `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-crm-business-mail.ps1` aus, danach Make-Execution und Gmail-Message-ID prüfen. **Nicht doppelt absenden, wenn Antwort unklar!**

### 23.10.2026 – Mail-Test: Windows-PowerShell und Website-Test-Mocks korrigiert

Beim ersten Test nach `git pull` schlugen **2 von 30** CRM-Tests fehl: Die bisherige `cloud-website-intake.test.js`-Testumgebung erwartete `./mail-dispatcher` noch nicht. Dies war ein Test-Mock-Fehler beim Laden von `crm-v2/server.js`, nicht ein nachgewiesener Firestore-/Website-Produktivfehler. Zusätzlich war `scripts/test-crm-business-mail.ps1` durch ein UTF-8-Gedankenstrichzeichen unter Windows PowerShell 5.1 nicht parsbar. **Der Mail-Test wurde daher nicht ausgeführt.**

- GitHub Commit `ed50ce1`: `crm-v2/test/cloud-website-intake.test.js` kennt neu ein sicher deaktiviertes Fake-Mail-Modul; keine produktive Serverlogik geändert.
- GitHub Commit `66fc84b`: `scripts/test-crm-business-mail.ps1` ist vollständig ASCII-kompatibel; insbesondere Betreff und Meldungen ohne Sonderzeichen.
- Statische Prüfung nach der Änderung: Testdatei in V8 kompiliert; Script ist ASCII-only. **Vollständiger Node-Testlauf auf dem Benutzerrechner steht noch aus.**
- Make Szenario 8135270 blieb aktiv nur für intern TEST_ONLY gefilterte Mails. Kontrolle per Make: **keine Ausführungen registriert**; bei diesem Versuch wurden keine Mails versendet.
- Nächste Schritte: `git pull --ff-only`, `npm.cmd test --prefix .\crm-v2` muss alle 30 Tests bestehen; nur dann den einmaligen internen Test durch `scripts/test-crm-business-mail.ps1` senden. Ergebnis und Make-Ausführung prüfen, bevor produktive Mails aktiviert werden.
### 23.10.2026 – Geschäftliche Gmail-Testmail erfolgreich gesendet; synchrone Antwort uneindeutig

- Benutzer: `git pull --ff-only` erfolgreich und **30/30 CRM-Regressionstests PASS**.
- Einmaliger `scripts/test-crm-business-mail.ps1` erhielt **HTTP 200**, aber keinen per `ConvertFrom-Json` auswertbaren `ok:true`/`messageId`-Beleg. Skript stoppte mit Warnung; **kein wiederholter Versand auslösen**.
- Live Make-Historie Szenario **8135270**, Ausführung **`1d1c977319374415930355e5329ece88`** um 12:14:16 UTC zeigt **`success`** und **alle drei Module fehlerfrei**: Webhook (1), geschäftliche Gmail-Send-Aktion (2), WebhookRespond (3).
- Gmail-Modul-Ausgang bestätigte echte Nachricht **ID `1a168aef163cbf9f`**, Ordner `SENT`/`INBOX`; Absender `"LSZH Automations" <info@lszh-automations.ch>`, Empfänger `lars@lszh-automations.ch`, Betreff `[TEST_ONLY] LSZH CRM V2 - Geschaeftliche Gmail Anbindung`. Dies bestätigt **Versand durch Gmail**, nicht zwingend externe Postfachzustellung.
- Make WebhookRespond Eingabe laut Modul-Ausführung `{"ok":true,"messageId":"1a168aef163cbf9f"}`. Weshalb der Windows-Client keinen JSON-Beleg erhielt, ist nicht abschliessend nachgewiesen. Mögliche Make-Standardantwort `200 Accepted` statt synchronem Antwortinhalt, falls der Webhook asynchron quittiert wurde.
- In Make Antwortmodul 3 wurde zur korrekten Formatangabe der Header `Content-Type: application/json; charset=utf-8` ergänzt; weiterhin nur internes `TEST_ONLY`-Szenario aktiv.
- GitHub `scripts/test-crm-business-mail.ps1` aktualisiert: diagnostiziert künftig insbesondere Make `Accepted` als **kein Gmail-Versandnachweis**, ohne automatisch zu wiederholen. **Nicht erneut ausführen, solange wir den einmaligen Versand bereits bestätigt haben.**
- **Produktiver CRM-Service unverändert:** `lszh-crm-v2-00006-moz` 100 % Traffic; keine Kunden- oder 24h-Mailproduktivfunktion eingeschaltet. Nächster Schritt: Make-Produktionsfilter/Endpunkt und sicheren Cloud-Scheduler vorbereiten, vor echter Kundennachricht End-to-End-Abnahme.

### 23.10.2026 – CRM V2-Mailautomation: alle drei Mailtypen bereit, Make inaktiv, Cloud-Vorbereitung vorbereitet

- Nach dem bestätigten TEST_ONLY-Gmail-Versand wurde Make-Szenario **8135270 deaktiviert** (`status=inactive`, Queue 0). Gmail-Connection **11904991** weiterhin `ok`; drei OR-Filter für `customer_ack`, `internal_new`, `internal_24h` mit internen Empfängern ausschliesslich `lars@lszh-automations.ch`, kundenseitig dynamischem Empfänger und passender Website-Ereigniskennung `__web_` eingerichtet.
- CRM-Mail-Eligibility auf **tatsächliche öffentliche Website-Leads** eingeschränkt: Firestore `source='LSZH Automations Website'` plus passende `web_<32 hex>`-ID. Manuell erfasste CRM-Leads, TEST_ONLY sowie Leads vor dem späteren Aktivierungszeitpunkt bleiben ausgeschlossen. Neuer Regressionstest hinzugefügt.
- **Neu:** `scripts/prepare-crm-mail-live.ps1`: Windows-PowerShell-Skript zur sicheren Einrichtung des Webhook-Secrets im Secret Manager, separaten Cloud-Scheduler-Servicekontos und pausiertem OIDC-Job `lszh-crm-v2-mail-tick` in Zürich. Der 0%-Cloud-Run-Kandidat erhält `CRM_MAIL_ENABLED=false` und das Secret, die bestehende Live-CRM-Konfiguration und 100%-Revision `lszh-crm-v2-00006-moz` sollen unverändert bleiben; anonyme/API/Website-Smoke-Checks im Skript.
- GitHub-CI `.github/workflows/crm-v2-cloud-staging.yml` um Syntaxcheck des neuen PowerShell-Skripts erweitert; JavaScript-Module inkl. neuem Test in V8 syntaktisch geprüft. **Vollständiger CRM-Testlauf für neue Änderungen und Google-Cloud-Vorbereitungsdeployment noch nicht vom Benutzer ausgeführt**.
- **Produktive Kunden-/interne Mailautomationen und Scheduler aktuell NICHT aktiv.** Nächste Aktion des Geschäftsführers: `git pull --ff-only` und `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\prepare-crm-mail-live.ps1"` in `C:\Users\larss\Projects\lszh-crm-cloud-staging`. Make-Webhook geheim und nur im Prompt eingeben, falls nachgefragt; Konsole zurückmelden. Danach separater Kundenmail-Go-Live nach ausdrücklicher Freigabe.
### 23.10.2026 – Cloud Scheduler Vorbereitung nach teilweisem Erfolg fortsetzen

- Geschäftsführer führte `scripts/prepare-crm-mail-live.ps1` aus: **31/31 CRM-Tests PASS**, Cloud Scheduler und Secret Manager APIs aktiviert, Secret `lszh-crm-v2-mail-make-hook` angelegt (Version 1 `ENABLED`), Leserecht des CRM-Servicekontos gesetzt, Scheduler-Dienstkonto `lszh-crm-mail-scheduler@lszh-automations.iam.gserviceaccount.com` erfolgreich erstellt.
- Danach beim Cloud Scheduler Job `lszh-crm-v2-mail-tick` abgebrochen: `gcloud.scheduler.jobs.create.http argument --uri: Bad value []`; **kein Scheduler-Job nachgewiesen, keine neue Cloud-Run-Revision erstellt, keine automatische Mail gesendet.** Live bleibt `lszh-crm-v2-00006-moz` bei 100 % Traffic. Make-Szenario 8135270 weiterhin inaktiv.
- GitHub Fix `scripts/prepare-crm-mail-live.ps1`: statt PowerShell-Autovariable `$args` für native `gcloud.cmd`-Splatting neues `$scheduleArgs` mit explizit auf Gültigkeit geprüftem HTTPS-URI; Deploy mit eigenem `$deployArgs`. Nach ersten CLI-Warnungen unzuverlässige serverseitige `--filter=name:`/`--filter=state:`-Abfragen durch **JSON-Listen + exakte lokale Auswahl** ersetzt. Damit werden das bestehende Mail-Secret und dessen aktivierte Version sowie das schon angelegte Dienstkonto bei einem Folgeversuch wiederverwendet. Bei 0% Cloud-Run-Kandidat bleibt `CRM_MAIL_ENABLED=false` und pausierter Scheduler erforderlich.
- **Noch ausstehend:** erneuter vollständiger Lauf auf dem Surface mit `git pull --ff-only` und `powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\scripts\prepare-crm-mail-live.ps1'`; danach Status verifizieren. Das Mail-Secret ist bereits befüllt, daher **geheime Make-Webhook-URL nicht erneut eingeben**, ausser eine andere ausdrücklich begründete Prüfung ergibt, dass keine aktivierte Version existiert.
### 23.10.2026 – CRM V2 Mail HTTP-Status live per POST bestaetigt

- Echte anonyme `POST /api/internal/mail/tick`-Requests mit HTTP-Modul in Make getestet (separater on-demand Diagnoseablauf; nach der Pruefung deaktiviert), Execution `ac01d12520f946228d7295d7e96f0e24`, `status=success`: **Kandidat** `https://crm-v2-mail-prepared---lszh-crm-v2-ozx7mp2bka-oa.a.run.app` -> **HTTP 404** (Mailbox-Dispatch mit `CRM_MAIL_ENABLED=false` deaktiviert); **bestehendes Live-CRM** `https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app` -> **HTTP 401** (authentifizierungsbeduerftiger alter API-Router).
- Der vorherige Vorbereitungsskript-Abbruch entstand nur dadurch, dass `Probe` fuer beide Versionen HTTP 404 verlangte. Skript `scripts/prepare-crm-mail-live.ps1` korrigiert: neue 0%-Revision prueft 404, bestehende Live-Revision 401. Fix-Commit `9a926d37fcd4d3ee3a291b4247598fbd3a2a239b`.
- Der vorherige Lauf hatte **31/31 CRM-Tests bestanden**, Scheduler-Job erfolgreich **PAUSED**, Secret hinterlegt und Cloud-Run-Kandidat `lszh-crm-v2-00008-zog` mit **0%** bereitgestellt. Der HTTP-Check bestaetigt die erwartete Trennung der Revisionen; die produktive Traffic-Aufteilung wurde nicht ueber Google Cloud separat erneut abgefragt.
- Make-Szenario `8135270` erneut ueberprueft: **inaktiv**, geschäftlicher Gmail-Connector `11904991` Status `ok`. Bei der Diagnose wurden keine Mails gesendet und keine produktiven CRM- oder Cloud-Scheduler-Einstellungen geaendert. Die Mailautomationen bleiben bis zur gesonderten Go-Live-Freigabe deaktiviert.

### 23.10.2026 – Sicherer CRM Mail Cutover entwickelt, noch nicht ausgefuehrt

- Ziel: die bereits verifizierte Cloud-Run Mail-Kandidatenrevision `lszh-crm-v2-00008-zog` von 0 % auf 100 % Live-Traffic umschalten, dabei **keine E-Mails versenden**. Bisherige Revision `lszh-crm-v2-00006-moz` bleibt fuer automatischen Rollback verfuegbar.
- Neues Skript `scripts/cutover-crm-mail-safe.ps1` ist auf GitHub im Entwicklungsbranch angelegt, enthaelt 31+ CRM Tests, Versions-/Traffic-/Konfigurationsvergleich (Website, Firestore, Google OAuth, Secret Manager), pausierten Cloud Scheduler, HTTP-Pruefungen der Kandidaten-URL vor und des Live-Dienstes nach dem Wechsel. Falls Traffic gewechselt wurde und eine Nachpruefung scheitert, schaltet das Skript zur alten Revision zurueck. In CI zur PowerShell-Syntaxpruefung aufgenommen.
- Make Szenario 8135270 zuletzt bestaetigt INAKTIV mit gueltiger Geschaefts-Gmail-Verbindung und leerer Webhook-Queue. Scheduler `lszh-crm-v2-mail-tick` laut letzter gcloud-Ausgabe PAUSED. `CRM_MAIL_ENABLED=false` auf Kandidat aus vorherigem Cloud-Run-Deployment; Skript prueft das noch einmal in den eigentlichen Revisionsdetails.
- **Status:** Skript erstellt, noch NICHT vom Surface ausgefuehrt; daher keine neue Live-Traffic-Verteilung durch diesen Schritt. Nutzer muss `git pull --ff-only` und `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\\scripts\\cutover-crm-mail-safe.ps1"` ausfuehren. Erst nach dem Ergebnis folgt die Aktivierung der 3 E-Mail-Automationen mit neuem Aktivierungszeitpunkt und zuletzt Scheduler-Resume.

### 23.10.2026 – CRM-Mail-Go-Live: Make aktiviert, finales Scheduler-/Cloud-Run-Skript bereit

- Der Geschäfts-Gmail-Make-Dispatcher **8135270** wurde vom Geschäftsführer aktiviert und durch Make als `active` verifiziert. Geschäftliche Gmail-Verbindung 11904991 `ok`; Webhook-Queue 0; alle drei Typfilter `customer_ack`, `internal_new`, `internal_24h` vorhanden. Noch kein neuer Kundenversand als Folge der Aktivierung ausgelöst.
- Vorherige Surface-Ausgabe: `scripts/cutover-crm-mail-safe.ps1` erfolgreich abgeschlossen. **31/31 CRM-Tests**, Cloud Run **`lszh-crm-v2-00008-zog` bei 100 % Traffic**, CRM-Mailfunktion **OFF**, Website-Intake/OAuth-Schutz intakt; Cloud Scheduler `lszh-crm-v2-mail-tick` **PAUSED**.
- GitHub hat nun `scripts/activate-crm-mail-live.ps1`: neue 0%-Mail-Revision mit `CRM_MAIL_ENABLED=true` und frischem UTC-`CRM_MAIL_ACTIVE_FROM`, Vorabprüfungen von Datenbank/Intake/Google OAuth/Secret-Servicekonto/Image, OIDC-Scheduler-Ziel und HTTP-API. Danach kontrollierte 100%-Trafficumschaltung; Scheduler wird danach auf 1 Minute umkonfiguriert und als LETZTER Schritt resumed. Bei Folgefehler: Scheduler pause + Rückfall auf bewährte `00008-zog`.
- CI-Syntaxprüfung auf `scripts/activate-crm-mail-live.ps1` erweitert, Dokumentation `crm-v2/MAIL-AUTOMATIONS.md` fortgeschrieben.
- **Stand:** Script auf GitHub, noch nicht vom Surface ausgeführt; produktiver Versand weiterhin nicht aktiv. Nach Skriptlauf sind Kunden-Bestätigung, interne Neu-Lead-Mail und die nach 24h bedingte interne Erinnerungsmail freigeschaltet. Frühere Leads als UTC-Aktivierungszeitpunkt werden nicht rückwirkend benachrichtigt. Ersten authentifizierten Scheduler-Aufruf sowie Mail-Sendehistorie danach gesondert prüfen (reiner 401-Smoketest bestätigt nur unauthentisierten Schutz).

### 23.10.2026 – CRM V2 E-Mailautomationen produktiv aktiviert

- Der Geschäftsführer führte `scripts/activate-crm-mail-live.ps1` auf dem Surface aus; **31/31 Tests PASS**. Neue Cloud-Run-Revision **`lszh-crm-v2-00010-raf` bedient 100 % Traffic**, vorherige bewährte Revision `lszh-crm-v2-00008-zog` bleibt mit 0 % als Rollback verfügbar. HTTP-Smoketests auf Kandidat und Live erfolgreich. Website Intake und Google OAuth intakt.
- **Mail-Aktivierungscutoff `2026-10-23T16:15:28Z`** (18:15:28 Europa/Zurich). `CRM_MAIL_ENABLED=true` auf neuer Live-Revision; alle vor diesem Zeitpunkt erstellten Website-Leads werden ausgeschlossen.
- Cloud Scheduler `lszh-crm-v2-mail-tick` auf `* * * * *` (einmal pro Minute) gestellt und per gcloud `jobs resume` aktiviert; Schlussmeldung des Skripts: `MAIL GO-LIVE PASS`. Dieser Abschluss belegt Scheduler-Status ENABLED, aber **noch nicht die erfolgreiche Ausführung mit OIDC oder den tatsächlichen E-Mail-Versand**.
- Make Szenario **8135270** live nochmals geprüft: Status `active`, Geschäfts-Gmail-Verbindung **11904991 `ok`**, Webhook-Warteschlange **0**. Zum Kontrollzeitpunkt zeigte die Make-Ausführungshistorie **noch keine neuen Ausführungen nach dem Cutoff**, nur den früheren internen `TEST_ONLY`-Versand vom selben Tag. Ohne neue Website-Anfrage kann dies der erwartete Zustand sein.
- Offene Live-Abnahme: mit **lesendem** `gcloud scheduler jobs describe lszh-crm-v2-mail-tick --project lszh-automations --location europe-west6 --format="json(state,schedule,lastAttemptTime,status)"` prüfen, ob ein letzter Lauf mit Statuscode 0 statt Auth-/Run-Fehlern vorliegt. Danach einen neuen Website-Lead (ab Cutoff) von Ende zu Ende prüfen: Firestore mail_events, Make-Ausführung mit Gmail-ID, Empfang interner und Kunden-E-Mail; 24h-Erinnerung nur bei Status `Neu` zum Fälligkeitszeitpunkt.
### 23.10.2026 – Kundenmail LSZH Brand Redesign im Entwicklungsbranch

- Nach erfolgreicher Produktivaktivierung der drei CRM E-Mail-Automationen wurde die neue **Kunden-Eingangsbestätigung** im Website-Design vorbereitet: Navy/Weiss, cyan-blau-violette Akzente, LSZH-Wortmarke, personalisierte Anrede, Block «Wie geht es weiter?», Geschäftsfooter. Branding anhand des tatsächlichen `index.html` im Repo geprüft, nicht geraten.
- Änderungen in `crm-v2/mail-templates.js` isolieren die neue Kunden-Mail-HTML in `customerShell`/`customerConfirmation`; interner Neu-Lead-Versand und 24h-Erinnerung sind **unverändert**. Keine externen SVG-/Bild-/Font-Abhängigkeiten; tabellenbasiertes E-Mail-Layout (Gmail/Outlook), inline CSS, HTML-Escaping.
- Neue Tests `crm-v2/test/mail-notifications.test.js` prüfen Brandfarben, textbasierte Darstellung, Firmendaten, öffentliche Links, XSS-Escaping, dass keine Kundennachrichten/CRM-Links in der Kundenmail landen und dass interne Mailvorlagen unverändert bleiben. Bestehende Tests weiterhin im Code. Template in isoliertem V8-Kontext mit synthetischem Website-Lead geprüft; vollständiger CRM-Testlauf ist noch im Surface nachzuholen.
- `scripts/preview-crm-customer-mail.js` schreibt mit synthetischem Musterkunden eine lokale HTML-Vorschau nach `$env:TEMP\lszh-crm-kundenmail-vorschau.html` (ohne Versand). CI-Prüfung der neuen Datei ergänzt. Auf dem Surface nach `git pull --ff-only`: `node.cmd .\scripts\preview-crm-customer-mail.js` und `Start-Process (Join-Path $env:TEMP 'lszh-crm-kundenmail-vorschau.html')`.
- **Noch kein Deployment** des Designs; produktive Live-Revision `lszh-crm-v2-00010-raf` und ihr E-Mail-Versand laufen mit vorheriger Vorlage weiter. Nach Freigabe der Vorschau sicher deployen, ohne die Mail-Aktivierungsgrenze oder Firestore-Ereignis-IDs zu verändern und ohne alte E-Mails neu zu versenden.

## Geschäftsmodell / Eigentümerschaft

- LSZH Automations erbringt Beratung, Entwicklung, Einrichtung, Tests, Dokumentation und optionale Wartung für Schweizer KMU.
- **Kundenbetrieb:** Der Kunde nutzt eine eigene Make-Organisation und behält deren Kontrolle, Abrechnung, Ressourcen und Szenarien. Unser Zugang erfolgt über eine gezielte Einladung mit angemessener Berechtigung.
- Make-Pläne und -Credits werden vom Kunden direkt mit Make abgerechnet. LSZH stellt separat Dienstleistungen und laufende Betreuung in Rechnung.
- Der Erstkontakt und die Offerte setzen keine Registrierung bei Make voraus. Registrierung/Einladung folgen erst nach Annahme.
- Möglichst OAuth/Anbieterfreigaben verwenden. Keine Kundenpasswörter per Mail oder in Airtable abfragen.

## Prozess (verbindliches Zielbild)

1. Anfrage über LSZH-Website: Problem, Unternehmensdaten und Kontakt.
2. Rückfrage/Analyse, Offerte und allfällige vertragliche Vereinbarungen.
3. Annahme der Offerte und ausgelöstes Projekt-Onboarding.
4. Onboarding sammelt Rechnungsdaten, Anforderungen, Systemnamen, Status der kundeneigenen Make-Organisation und Stand der Einladung.
5. LSZH prüft Angaben, Kundenorganisation und benötigte Rollen. Bei Bedarf unterstützt LSZH Registrierung und Einladung.
6. Technische Verbindungen entstehen **in der Make-Organisation des Kunden**, möglichst durch den Kunden selbst mit OAuth.
7. Entwicklung, Funktionstests, Dokumentation, Kundenfreigabe und Go-Live im Kundenkonto.
8. Betrieb/Betreuung über separaten Servicevertrag. Kundeninhaberschaft und Freigaben bleiben erhalten.

## Bereits umgesetzt

- Öffentliche Website mit Kontakt, Leads, Offerten/Rechnungen und persönlichem Kunden-Onboarding (bestehender Prozess beibehalten).
- Formular `/onboarding/`: zusätzlicher Abschnitt **Make & technische Einrichtung** mit optionalem Organisationsnamen und Angaben zu Konto-/Einladungsstatus. Keine Secrets.
- Airtable `Kunden-Onboarding`: Felder **Make-Konto Status**, **Make-Organisation**, **Make-Einladung Status**, **Make-Einrichtung Hinweise**.
- Make `LSZH Kunden-Onboarding – Eingang`: Feldzuordnung auf diese Airtable-Spalten ergänzt.
- Make `LSZH Projekte – Onboarding anfordern`: Einladungsmail nach Offertenannahme erklärt das kundeneigene Make-Modell.
- Bestätigungsmail nach Onboarding: erklärt Organisation, Einladung und nächste Schritte.
- Kundenanleitung `/make-start/` erstellt und im Formular sowie in den E-Mails verlinkt.
- Drei alte Make-OAuth-Szenarien des früheren LSZH-eigenen Kontomodells als **ARCHIV – ALTES MODELL** gekennzeichnet und unverändert inaktiv belassen.
- Secure Transfer funktional mit Dummy-Schlüssel getestet: verschlüsselte Speicherung, einmaliger Abruf, Löschung der gespeicherten verschlüsselten Daten. Noch **nicht** für reale Kundenzugangsdaten freigegeben.

## Status / Sicherheit

- Onboarding-Anforderung und Eingangsszenario bleiben vorerst inaktiv, bis ein vollständiger Test mit einer vereinbarten Testofferte durchgeführt wurde. Keine unaufgeforderten Mails auslösen.
- Die Schlüssellieferung über Secure Transfer darf noch nicht produktiv eingesetzt werden, bis die Make-Webhooks authentifiziert und der parallele Abruf wiederholt getestet wurden.
- Neue Make-Verbindungen müssen gegen die jeweilige Kundenorganisation und deren Rollen geprüft werden. Alte LSZH-eigene OAuth-Automationen nicht reaktivieren.
- Make-Plan und Berechtigungen nach tatsächlichem Kundenbedarf prüfen. Nicht jedes Abonnement bietet identische Team-/Rollenoptionen.

## Nächste Tests

1. Neues Formular im Browser prüfen (Desktop / Mobile).
2. Mit freigegebenem Testprojekt Onboarding durchspielen; vier Make-Felder in Airtable kontrollieren.
3. Versand und Inhalt der zwei Kundenmails testen, bevor bisher inaktive Szenarien wieder aktiviert werden.
4. Einladung in eine vom Kunden verwaltete Testorganisation prüfen, ohne dessen Zugangsdaten einzusehen.
5. Kunden-Szenario dort erstellen, mit kundeneigener Verbindung autorisieren und Test/Übergabe dokumentieren.
6. Secure Transfer erst nach separater Security-Abnahme für Ausnahmen nutzen.

## Betrieb / Quellen

- [Website – Kunden-Onboarding](https://www.lszh-automations.ch/onboarding/)
- [Website – Make-Kundenanleitung](https://www.lszh-automations.ch/make-start/)
- [Make – Organizations](https://help.make.com/organizations)
- [Make – Teams](https://help.make.com/teams)
- [Make – Preise/Funktionen](https://www.make.com/en/pricing)

Letzte Architekturentscheidung: 13.10.2026 – Kunden besitzen ihre eigenen Make-Organisationen.

## Technische Prüfung vom 14.10.2026 – Onboarding-Fortsetzung (STAGING)

- Make-Szenario **7777695**: Kunden-Onboarding bleibt **inaktiv**. Kundenmail-Modul 9 hat unverändert die harte **0=1**-Sperre. Keine echten Einladungen, Vertragsfreigaben oder Kundensendungen.
- Der separate Datenschutz-Zweig (Router 14) läuft vor der erfolgreichen Webhook-Bestätigung; Prüfung bei `sensitive_data = Ja` oder `Unsicher`. Vor einer neuen DSG-Aufgabe erfolgt jetzt eine Airtable-Suche (Modul 15) nach dem stabilen `<Auftrag-ID>-DSG-01`-Schlüssel. Bereits existierende, z. B. erledigte Aufgaben werden nicht auf `Offen` zurückgesetzt.
- Die frühere GET-Dublettenprüfung (Modul 11) wurde durch wiederaufnehmbare Speicherung ersetzt: Modul 4 erzeugt ein Airtable-`performUpsert` mit `fieldsToMergeOn: ["Projektcode"]`. Modul 3 sendet `PATCH`, Modul 6 verknüpft den Datensatz mittels `3.body.records[1].id`; dieselbe ID wird in Modul 12 als Webhook-Beleg ausgegeben.
- **Test 1:** zweimaliges Airtable-Upsert auf bestehenden synthetischen Token `<synthetischer-testtoken-intern>` lieferte `recCTaZaoReFpBqxi` und änderte die Datensatzanzahl nicht (vier).
- **Test 2:** Isoliertes Make-Testscenario **7962957**, zweifacher sequentieller Aufruf: Erfolg, jeweils HTTP 200 und dieselbe Airtable-ID. Zusätzlich **zwei parallel gestartete Testläufe**: beide erfolgreich, HTTP 200, dieselbe ID; nachher weiterhin genau ein zugehöriger Datensatz. Testszenario wieder deaktiviert.
- **Test 3:** Read-only-Make-Testscenario **7962998**: existierende DSG-Aufgabe ergab `rec818rQl70Mf4UsW`, fehlender Aufgabencode ergab keine ID; beide HTTP 200. Existierende Aufgabe blieb auf `Erledigt`. Testscenario danach deaktiviert.
- **Keine Freigabe:** Diese Tests prüfen isolierte Module und einen vorhandenen synthetischen Datensatz. Sie sind **kein** vollständiger Webhook-End-to-End-Test, kein Paralleltest zweier echter erstmaliger Eingänge und keine tatsächlich unterbrochene Gesamtausführung. Wiederholungen mit **abweichenden** Formulardaten würden noch vorhandene Onboarding-Felder überschreiben; diese Geschäftspolitik ist abzuklären oder technisch abzusichern. Ebenfalls testen: Fehler bei Verknüpfung/Rechnungsdaten, Dauerhaftigkeit der Datensätze, Fehlerantwort und Datenschutzprüfung vor HTTP-200.
- Weitere Freigaben: Kundenorganisation und Einladungsberechtigung für `lars@lszh-automations.ch`; Google-Drive-Reautorisierung und separates eingeschränktes Dienstkonto; RC1-Projektbedingungen/AVV; Offerten-, Rechnungs-, Swiss-QR- und Archivtests.

## Technische Freigabeprüfung 14.10.2026 – Wiederholungs-Guard und kompletter On-Demand-Test

**Produktivstatus:** Make-Szenario `7777695` weiterhin **INAKTIV**, E-Mail-Versand durch Modul 9 mit harter `0=1`-Sperre verhindert. Keine Kundenmails, keine echten Einladungen, keine Vertragsfreigaben, keine Aktivierung.

**Neue Schutzlogik im Onboarding:**

1. Vor dem Airtable-Upsert fragt Modul 16 bestehende Onboardings für den Projektcode ab (maximal 2 Treffer).
2. Code-Modul 17 vergleicht den eingereichten Onboarding-Feldsatz mit dem bereits gespeicherten Datensatz, mit Normalisierung leerer Textfelder. Es unterscheidet `new`, `resume`, `conflict` (geänderte Angaben/mehrere Bestandsdatensätze/manuelle Klärung) und `already_complete`.
3. Router 18 leitet **nur** `new` und `resume` auf den Upsert und die restliche Projektverarbeitung weiter. Bei `conflict` sendet Make einen strukturierten Konflikt im JSON mit `duplicate=true` / `error=already_submitted`, den der bestehende Website-Proxy in HTTP 409 übersetzt. Make selbst liefert auf diesem Zweig zur Kompatibilität mit dem Website-Proxy HTTP 200 mit Geschäftsfehler im JSON; vor Direktzugriff auf den Make-Webhook prüfen. Bei `already_complete` wird der ursprüngliche Datensatz bestätigt, ohne erneut zu schreiben.
4. Datenschutz-Zweig bleibt unabhängig vom E-Mail-Zweig. Existenzprüfung über den stabilen Aufgabencode verhindert erneutes Öffnen einer bereits erledigten Datenschutzprüfung.
5. Bei identischer Wiederholung während unvollständiger Verarbeitung kann die Auftragsverknüpfung per erneutem `PATCH` repariert werden. Weiterhin keine Garantie echter atomarer Transaktion zwischen mehreren Airtable-Datensätzen.

**Isolierte Make-Testkopie `7963278` (nur synthetische Daten, ohne E-Mail-Modul):**
- Suchfilter in Modul 5 auf Auftrag `rec2958xrhm6QmIbM` eingeschränkt; keine echte Vertragsannahme gesetzt.
- Erste Ausführung: `saved` – Onboarding `recGKxPPzHhgUZ8W9` und genau eine neue Datenschutzaufgabe erstellt; alle Schreibmodule und die abschliessende Rückgabe erfolgreich.
- Gleiche Eingaben erneut: `saved` mit identischer Datensatz-ID, keine zweite Datenschutzaufgabe.
- Geänderter Projektname: `conflict` / `changed_input`; Ausführungsprotokoll zeigt **keine** Schreibmodule im Konfliktlauf. Der ursprüngliche Projektname blieb unverändert.
- Simulierte Teilunterbrechung: Auftragsverknüpfung beim fiktiven Onboarding entfernt, identische Eingabe erneut verarbeitet, Verknüpfung korrekt zum ursprünglichen Testauftrag wiederhergestellt.
- Einmalig Status `Vollständig` im Testdatensatz gesetzt: identische Eingabe führte zu `already_complete`; nur lesende Module und Antwortmodul liefen. Anschliessend ursprünglichen Teststatus `Eingegangen` wiederhergestellt.
- Die Testkopie `7963278` ist nach den Testläufen wieder **INAKTIV**. Ebenso sind die früheren isolierten Teststrecken `7962957`, `7962998`, `7963182` und `7963206` inaktiv.

**Noch nicht abgenommen:** Die Testkopie hat einen `StartSubscenario`-Trigger, **keinen Live-Webseiten-Webhook**. Noch nötig: tatsächlicher synthetischer HTTP-Webhook-Test, echte Unterbrechung in Make zwischen Modul 3 und Modul 6, gleichzeitige erstmalige Einsendungen, Fehlerantworten bei nicht autorisiertem Token oder Airtable-Ausfall sowie Stabilität bei späteren Datenaktualisierungen. Der instanzlokale Zwei-Minuten-Cache im Website-Proxy garantiert keine dauerhafte Exklusivität. Die übrigen Freigabeblocker zu Google Drive, RC1/AVV, Kundenorganisation und Rechnungs-/Offertenversand bleiben bestehen.


### Nachtrag 14.10.2026 – echter HTTP-Webhook im isolierten Test

- Eigenständiges Make-Webhook-Szenario **7963329** als eingeschränkte Kopie des Onboardings angelegt. Es enthält **kein Gmail-/E-Mail-Modul** und darf ausschliesslich den synthetischen Testauftrag `rec2958xrhm6QmIbM` verarbeiten. Getrenntes synthetisches HTTP-Sendeszenario **7963343**.
- **HTTP-E2E Wiederholung:** Ein tatsächlicher HTTP-POST aus Szenario 7963343 an den Test-WebHook 7963329 durchlief Validierung, Auftragsabfrage, JSON-Erzeugung, Existenzprüfung, Wiederholungs-Guard, Airtable-Upsert, Auftrags-/Kundendaten und Datenschutzaufgaben-Existenzprüfung. Die Webhook-Antwort enthielt `ok=true` und dieselbe ursprüngliche Datensatz-ID. Make-Ausführung ohne Fehler.
- **HTTP-E2E Konflikt:** Geänderter Projektname im POST führte zu `duplicate=true`, `error=already_submitted`. Ausführungsprotokoll durchlief nur die Validierung und lesenden Module sowie die Konflikt-Antwort (Modul 19), **kein** Airtable-Schreibmodul. Projektname, Verknüpfung und DSG-Aufgabe blieben unverändert.
- Beide Make-HTTP-Läufe meldeten HTTP **200** vom internen Webhook. Der bereits implementierte Website-Proxy wertet das Geschäftsfehler-JSON aus und soll bei `duplicate=true` selbst HTTP **409** ausgeben. Dieser Website-Proxy-Endpunkt wurde noch **nicht** selbst per HTTP getestet.
- Webhook-Queue nach Tests **0**. Szenarien **7963329** und **7963343** nach den Läufen deaktiviert, wie auch das originale Onboarding **7777695**. Dessen Kundenmail-Modul 9 behält die `0=1`-Sperre.
- Weiter offen bleiben: Durchlauf über das tatsächliche öffentlich zugängliche Website-Onboarding samt 409-Prüfung, echte Fehler-/Unterbrechungsinjektion in Make, initial gleichzeitige Eingänge für denselben noch nicht angelegten Datensatz, Fehlerbehandlung bei Ausfall von Airtable/Google und manuelle organisatorische Freigaben. **Keine Produktionsfreigabe.**


### Nachtrag 14.10.2026 – gleichzeitige Erstanfragen, echter Fehlerabbruch und Website-202-Hinweis

**Paralleltest nur mit synthetischem Auftrag:** Separater Testauftrag `recDXecnwGr3fyU9D`, ohne bestätigte Vertragsunterlagen, auf den der isolierte Test-WebHook `7963329` in seiner Airtable-Suchformel begrenzt wurde. Mit `sequential=true` wurden zwei nahezu zeitgleiche Erstübermittlungen an den isolierten Webhook ausgelöst. Die Make-HTTP-Sender erhielten beide zunächst `200 Accepted` als vorläufige Annahme, **nicht** als bestätigten Speicherbeleg. Die zweite Lieferung blieb zunächst in der Webhook-Warteschlange (Queue=1) und wurde nach erneuter Testaktivierung abgearbeitet (Queue anschliessend=0). Die beiden Webhook-Ausführungen meldeten **warning**, zeigten im Modulprotokoll jedoch keinen Modulfehler. Airtable enthielt anschliessend **genau einen** neuen Onboarding-Datensatz `recvv5IlhSJU8V4Qw` und **genau eine** Datenschutz-Aufgabe `reck61B1qYy3zEmOk` für den Testauftrag. Kein Kundenszenario aktiviert.

**Wichtige offene Semantik:** Bei konkurrierenden Webhook-Aufrufen liefert Make vor der vollständigen Bearbeitung `Accepted`. Der produktive Website-Proxy darf dies ausschliesslich als `202 pending` behandeln (keine verifizierte Speicherung). Seine Implementierung sieht dafür bereits die Unterscheidung vor; der echte öffentlich zugängliche Website-Endpunkt wurde noch nicht per HTTP geprüft. Die Ursache der Make-Ausführungsstatus `warning` ist noch separat zu beurteilen. Der Wartefall im Fehler-/Duplikatschutz darf nicht still als erfolgte Speicherung gelten.

**Echter Testfehler nach Upsert:** Neue ausschliesslich synthetische On-Demand-Testkopie `7963454` enthielt absichtlich ein `code:ExecuteCode`-Modul direkt nach Airtable-Upsert und vor der Auftragsverknüpfung, das `LSZH_SYNTHETIC_INJECTED_FAILURE_AFTER_UPSERT` auslöste. Beim fiktiven Datensatz `recGKxPPzHhgUZ8W9` war vorher die Auftragsverknüpfung entfernt worden. Make-Ausführung `79a93d7dddea450eac0d99baa4d6b63b` endete mit dem erwarteten RuntimeError, Datensatz blieb vorhanden und unverknüpft. Die anschliessende **saubere Wiederaufnahme** über die isolierte Teststrecke `7963278` (`870934398c354301b026a8d1c58dbe90`) war erfolgreich: dieselbe Datensatz-ID, korrekte Verknüpfung `rec2958xrhm6QmIbM`, keine zweite Datenschutz-Aufgabe. Beide Teststrecken anschliessend deaktiviert.

**Website-UI-Korrektur:** In `onboarding/index.html` wurde der Hinweis bei HTTP 202 berichtigt: Es wird ausdrücklich nur der Empfang zur Verarbeitung bestätigt, nicht die endgültige Speicherung und auch **keine später automatisch versandte E-Mail** versprochen, während der E-Mail-Versand gesperrt ist. GitHub-Commit `1acce5b93380d40f638a28594688669c7bdc842f`.

**Freigabegrenzen:** Öffentliche Website `/onboarding/` und `/make-start/` waren aus dem externen Prüfwerkzeug nicht erreichbar bzw. nicht verifizierbar; daraus folgt noch keine gesicherte Aussage zur Ursache. Website-/Render-Verfügbarkeit, echte HTTP-409-Rückgabe des Proxy, Fehler bei Airtable-Verbindungsunterbruch und kundenbezogene Rollen-/Vertragstests sind **OFFEN**. Produktiv-Onboarding `7777695` bleibt inaktiv, harte `0=1`-Kundenmail-Sperre unverändert. Teststrecken `7963278`, `7963329`, `7963343`, `7963454` bleiben deaktiviert. Keine Einladungen, echten E-Mails oder Vertragsfreigaben.


### Nachtrag 14.10.2026 – Google Drive: Zugriffstrennung und geschäftliche Archiv-Staging-Prüfung

**Befund:** Zwei Google-Konten/Drive-Berechtigungskontexte sind betroffen. Das über Google Drive direkt einsehbare ältere Vertragsarchiv mit Testangebot liegt im *privaten* Google-Konto und ist laut Metadaten nicht freigegeben. Die in Make verwendete Google-Drive-Verbindung (Geschäftsadresse `lars@lszh-automations.ch`, Connection 11904271) ist zwar autorisiert, kann diese private Test-PDF nicht laden (HTTP 404). Das ist ein **Zugriffsproblem**, kein Nachweis einer erneut abgelaufenen OAuth-Verbindung. Umgekehrt ist eine in Make erreichbare Geschäftskonto-PDF über den separat verbundenen privaten Drive-Connector nicht zugänglich. Eine globale Google-Drive-Reautorisierung ist für diesen Befund nicht nötig.

**Geschäftskonto-Zielarchiv bereits vorhanden:** Make hat den Ordner **LSZH Automations Vertragsarchiv – STAGING – Geschäftskonto** als eigenes Ziel angeboten. Der ältere private Ordner **LSZH Vertragsarchiv – STAGING (nicht produktiv)** ist hiervon getrennt. Für zukünftige Vertragsarchivierung den geschäftlich kontrollierten Speicherort verwenden und die bisherigen privaten Tests nicht als Produktionsarchiv behandeln. Keine automatischen Freigaben/Sharing der privaten Unterlagen ohne separate Zustimmung.

**Kontrollierte Lesetests:** Isoliertes, rein lesendes Make-Szenario `7963566` mit Geschäftskonto-Verbindung: bestehende synthetische Geschäftskonto-Test-PDF erfolgreich gelesen (630 Bytes, gültiger SHA-256). Die alte private Offerten-Test-PDF liefert mit derselben Make-Verbindung HTTP 404. Das Szenario wurde deaktiviert.

**Archivierung + Datenintegrität erfolgreich:** Neues isoliertes Make-Szenario `7963597` erstellt: vorhandene synthetische Mini-PDF im Geschäftskonto laden -> ausschliesslich in den genannten **Geschäftskonto-STAGING**-Ordner hochladen (Dateiname beginnt mit `TEST_ONLY_`) -> neu archivierte Datei herunterladen -> Größe und SHA-256 mit der Vorlage vergleichen. Ausführung `0fab42aac5ce44b99c02c27d83ea57f2`: **success**, Hashes identisch `c7694e7a617af93059204f790bcf9f306b8d3fa3c5a15e6a4f352a2abf6366c4`, beide Dateien 630 Bytes, Upload im richtigen Business-Staging-Ordner. Szenario direkt danach deaktiviert. Die Test-PDF ist **kein Vertrag**.

**Nicht freigegeben:** Online-Annahme, reale E-Mails, externe Freigaben/Einladungen, echte Kundenunterlagen und produktive Szenarien bleiben inaktiv. Das Bestehen des Upload/Download-Tests beweist weder rechtliche Dokumenteneinbindung noch Content Restrictions/WORM, SHA-Verifikation bei Online-Annahme, Backup-/Aufbewahrungskonzept oder Dienstkonto-Zugriff. Projektbedingungen und AVV RC1 bleiben unfreigegeben. Vor Produktivstart (1) Staging-Unterordner und Ablageziele in Geschäftskonto aufeinander abstimmen, (2) freigegebene finale PDFs unabhängig archivieren, (3) Download-/Hashprüfung bei Angebotsversand und Annahme, (4) restriktives serverseitiges Dienstkonto für lesenden Zugriff vorbereiten, (5) Rechte, Löschung, Backup und Unveränderbarkeit sowie externe Rechtsprüfung klären.


### Nachtrag 14.10.2026 – Make Offerten-/Annahmearchiv auf Geschäftskonto-STAGING vorbereitet

**Voraussetzung:** Das Make-Geschäftskonto `lars@lszh-automations.ch` kann den bestehenden Ordner `LSZH Automations Vertragsarchiv – STAGING – Geschäftskonto` erreichen. Die versuchte automatische Anlage von drei getrennten Unterordnern (Offerten, Projektbedingungen, Annahmenachweise) wurde durch die Sicherheitsprüfung des verbundenen Tools blockiert und **nicht durchgeführt**. Bis eine Unterordnerstruktur eingerichtet und separat geprüft ist, wird nur der nachweislich funktionierende Geschäfts-STAGING-Hauptordner verwendet; Dateinamen tragen `STAGING_`. Alte private Archiv-PDFs wurden nicht geteilt, verschoben, gelöscht oder überschrieben.

**Make `7835460` (Offerte PDF erzeugen und versenden, INAKTIV):** Google-Docs-Entwurf (Modul 3) und Offerten-PDF-Upload (Modul 7) auf denselben Geschäfts-STAGING-Ordner umgestellt. Modul 11 fordert nun zusätzlich `parents` aus Google Drive an; Modul 8 markiert einen Archivbeleg nur bei passender Datei-ID, passendem SHA-256, PDF-MIME-Type, aktiviertem Drive-Content-Restriction-`readOnly` und korrektem Geschäftskonto-Ordner als verifiziert. Die ursprünglich strukturell ungültige JSON-Feldzuordnung in Airtable-Statusmodul 6 korrigiert. Zusätzliche **harte 0=1-Sperre vor Google-Docs-Erzeugung** in Modul 2 sowie bestehende harte 0=1-Sperre vor Kundenmail in Modul 5; auch `disabled` nicht als alleinige Sicherheit betrachten.

**Make `7940261` (persönlichen Offerten-Annahmelink erstellen/mailen, INAKTIV):** Nach den beiden Google-Drive-Leseoperationen für Angebot und Projektbedingungen zwei zusätzliche read-only Drive-Metadatenmodule 9/10 eingefügt. Token-Hash-Schreibmodul 4 verlangt jetzt zusätzlich für **beide** PDFs den richtigen Geschäfts-STAGING-Elternordner, passenden Datei-ID- und SHA-256-Abgleich, Drive-Content-Restriction `readOnly=true` und API-HTTP 200. Eine syntaktisch fehlerhafte JSON-Feldzuordnung in Statusmodul 6 korrigiert. Token-Erstellung (Modul 2) und Kundenmail (Modul 5) jeweils **hart 0=1 gesperrt**. Keinerlei Annahmelink erzeugt oder verschickt.

**Make `7940220` (Online-Annahmebeleg und Bestätigung, INAKTIV):** Zwei Drive-Metadatenmodule 10/11 lesen vor dem Beanspruchen einer Bestätigung beide zuvor archivierten PDFs; vor Verarbeitung prüft Modul 2 die beiden Drive-Elternordner, Datei-IDs, SHA-256 und `readOnly`-Schreibschutz zusätzlich zu den vorhandenen Annahme-/Freigabebedingungen. Google-Docs-Nachweisentwurf (Modul 5) und PDF-Ablage (Modul 7) liegen im Geschäfts-STAGING-Hauptordner. Nach PDF-Upload liest Modul 12 den Nachweis erneut, Modul 13 setzt den Drive-Schreibschutz, Modul 14 verifiziert Archivpfad, SHA-256 und Schreibschutz. Kundenmail-Modul 8 verlangt die technischen Belege, bleibt aber unabhängig davon **hart 0=1 gesperrt**. Zusätzlich ist Claim-/Belegerstellung (Modul 2) **hart 0=1 gesperrt**. Fehlerhaft aufgebaute JSON-Feldzuordnung des Airtable-Abschlussmoduls 9 korrigiert.

**Isolierter Schreibschutz-Test `7963696`:** Ausschliesslich die synthetische 630-Byte-PDF aus dem zuvor überprüften Geschäftsarchiv verwendet (kein echter Vertragsbeleg). Lauf `2a981655f34a4d66b772177c7f619212` meldete **success**: Google Drive Content Restriction erfolgreich per PATCH gesetzt, per GET `readOnly=true` bestätigt, SHA-256 weiterhin identisch `c7694e7a617af93059204f790bcf9f306b8d3fa3c5a15e6a4f352a2abf6366c4`, richtiger Geschäftsarchiv-Elternordner. Die Teststrecke danach **deaktiviert**. Ein Drive-Schreibschutz ist nicht automatisch ein revisionssicheres WORM-Archiv.

**Verifikation:** Die drei Make-Szenarien `7835460`, `7940261` und `7940220` nach den Änderungen erneut ausgelesen: alle **INAKTIV**. Alle drei Kundenmail-Module besitzen harte `0=1`-Filter; vorgelagerte Schreib-/Vertragsprozesse ebenfalls. JSON-Bodies der drei korrigierten Airtable-Statusaktualisierungen sind syntaktisch gültig. Google-Drive-Verbindung ist autorisiert.

**Noch nicht abgenommen:** Vollständige E2E-Ausführung der drei Offerten-/Annahme-Staging-Szenarien (harte Sperren bleiben aktiv), eigene Geschäfts-STAGING-Unterordner, zwei **tatsächlich freigegebene** finale Projektbedingungen-/Offerten-PDFs samt SHA-256 und Archivzugriff, Berechtigungs- und Retention-/Backup-/WORM-Konzept, separates eingeschränktes serverseitiges Dienstkonto, RC1-Projektbedingungen und AVV mit geschäftlicher und juristischer Freigabe, scharfe Anbieter-/UID-/MWST-Daten, Kundeneinwilligung und ausdrückliche Produktionsfreigabe. Keine E-Mails, Einladungen oder Vertragsabschlüsse durchgeführt.


### AVV v0.9 / RC1 – Geschäftsentscheid vom 14.10.2026: INTERN PROVISORISCH FREIGEGEBEN

**Entscheid durch den LSZH-Geschäftsführer:** Das bestehende **LSZH_AVV_v0_9_RC1_Freigabeentwurf.docx**, Original vom **13.10.2026**, wird als **interne, provisorisch akzeptierte Arbeitsgrundlage** für technische Vorbereitung, Dokumentenabgleich und vollständig synthetische Tests behandelt. Original bleibt unverändert (auch wenn darauf noch „nicht freigegeben“ steht). Der Entscheid ist separat im Google-Drive-Freigaberegister **LSZH Vertragsarchiv – Freigaberegister (STAGING)** protokolliert.

**Eindeutige Status-Trennung:**
- AVV-Musterinhalt: **INTERN PROVISORISCH FREIGEGEBEN** / für Staging-Arbeit verwendbar.
- Unterschriften, Kunden- und Projektbezug: **NICHT FREIGEGEBEN**.
- AVV Anlagen A (Daten-/Projektsteckbrief), B (TOM-Nachweise), C (Subprozessoren inkl. Regionen/Genehmigung): **NOCH NICHT kundenbezogen abgeschlossen**.
- Juristische Prüfung inkl. Anwendbarkeit DSG/ggf. DSGVO und Auslandsdaten: **OFFEN**.
- Projektbedingungen v1.0 RC1: **SEPARAT OFFEN**.
- Online-Annahme rechtlich freigegeben in Airtable: **NEIN / unverändert**; sämtliche **harten Make-0=1-Sperren** bleiben bestehen; keine echten E-Mails, keine externe Bereitstellung oder Einladungen, keine Vertragsabschlüsse und keine Produktiv-Szenarien.

**Vor externer Verwendung pro Kunde prüfen:** Identität und Vertretungsbefugnis; Leistungs-/Datenfluss- und Rollenzuordnung (auch kundeneigene Make-Organisation); Kategorien inkl. besondere Daten/Profiling; eingesetzte Anbieter, Regionen, internationale Zugriffe, AVV/SCC; technische und organisatorische Massnahmen mit tatsächlichem Nachweis; Lösch-/Backupfristen; Kundenfreigabe Anlage C; Abstimmung mit finalen Projektbedingungen; richtige AVV-Version als eigenständige schreibgeschützte PDF im **geschäftlichen** Archiv mit SHA-256; unabhängige rechtliche und geschäftliche finale Freigabe.

**Wichtige Dokumentenidentität:** Das Original RC1 enthält Platzhalter, Entwurfsvermerke und keine Signaturen. Der provisorische Geschäftsentscheid wertet es *nicht* zu einer endgültigen rechtsgeprüften, signierten Vereinbarung auf. Es wird durch diese Notiz nicht umbenannt, überschrieben oder als final archiviert.



### Nachtrag 14.10.2026 – RC1-Originale geprüft und echte synthetische PDF-/Annahme-Nachweisstrecke

Die originalen **Projektbedingungen v1.0 RC1 (4 Seiten)** und das **Geschäftsbedingungen-Entscheidungsblatt RC1 (1 Seite)** wurden in der ChatGPT-Library wiedergefunden und mit der vorhandenen **AVV v0.9 RC1 (6 Seiten, Anlagen A–C)** textlich abgeglichen. Originale **nicht verändert**; die frühere Aussage „hier nicht abrufbar“ im Freigabeformular ist damit nur noch historischer Stand. Die AVV bleibt allein **intern provisorisch** als Muster freigegeben; die Projektbedingungen, eine endgültige AVV und kundenbezogene Anlagen sind **nicht extern/rechtlich freigegeben**.

**Bereits geschäftlich definierte Eckwerte (juristisch noch zu prüfen):** D1 Care-Kündigung 30 Tage auf Monatsende; D2 Werkabnahme innert 10 Arbeitstagen ohne automatische Schweigeabnahme; D3 Haftungsdeckel 12 Monate Leistungsentgelt, mindestens CHF 2'000. D3 ist ausdrücklich noch keine rechtsgeprüfte oder extern freigegebene Klausel. Zudem muss eine auftragsbezogene AVV mit Anlagen A–C vor der entsprechenden Kundendatenverarbeitung separat nachweisbar vereinbart werden; aktuelle Online-Angebotsstrecke prüft nur Offerte und Projektbedingungen.

**Isolierte synthetische Make-Tests durchgeführt:**
- `7963939`: zwei verschiedene, als `TEST_ONLY` gekennzeichnete Fake-PDFs erstellt, getrennt ins geschäftliche STAGING archiviert, erneut gelesen, mit SHA-256 sowie Drive Content Restriction kontrolliert. **SUCCESS** (fiktive Offerte 36'691 Bytes; fiktive Projektbedingungen 38'877 Bytes). Danach deaktiviert.
- `7963965`: beide fiktiven PDFs mit richtiger Version/Hash **PASS**. Manipulierter Hash, vertauschte IDs und dieselbe PDF für beide Dokumente wurden korrekt **abgewiesen**; reine Lesetests, kein Statuswechsel. Danach deaktiviert.
- `7963993`: einen **synthetischen, ausdrücklich rechtlich unwirksamen** Annahmenachweis aus den beiden archivierten Fake-PDFs erzeugt, als PDF gespeichert, gesperrt und Hash geprüft: **SUCCESS / actual_contract=false / email_sent=false**. Negativtest mit falschem Hash brach **vor** Dokumenterzeugung ab. Danach deaktiviert.

Ausführliche Klausel- und Testprüfung: [LSZH_RC1_KLAUSELPRUEFUNG_UND_SYNTHETISCHER_ANNAHMETEST_20261014.md](./LSZH_RC1_KLAUSELPRUEFUNG_UND_SYNTHETISCHER_ANNAHMETEST_20261014.md).

**Wichtige Restpunkte:** keine echten Kunden, E-Mails oder Vertragsannahmen getestet; öffentliches Website-/Token-/Annahme-Endpoint und vollständige Airtable-Nachweis-/Versandkette bleiben offen. Im produktiven Staging-Flow `7940220` einen möglichen Fehlerfall nach PDF-Archivierung und vor bestätigtem Mailversand auf Wiederanlauf/Status-Reset prüfen. Rechtliches und geschäftliches D1–D3-Freigabeverfahren sowie allfällige AVV-Anlagen und endgültige PDF-Versionen mit Archiv-ID/Hash bleiben offen. Die Szenarien `7835460`, `7940261`, `7940220` und alle obigen synthetischen Teststrecken sind **inaktiv**, harte `0=1`-Sperren bleiben unberührt. Keine Produktivfreigabe.


### Nachtrag 14.10.2026 – Annahmebeleg vor Versand persistieren und Fehlerwiederanlauf absichern

**Produktionsvorbereitung geändert, aber NICHT aktiviert:** Make `7940220` (Online-Annahmebeleg & Bestätigung). Die bisherige Schwachstelle: `Online-Annahme Beleg Drive ID` wurde erst nach erfolgreicher Kundenmail geschrieben, obwohl das PDF zuvor schon archiviert war. **Neu Modul 15** direkt nach dem abgeschlossenen Google-Drive-Hash/Schreibschutz-Check (Modul 14) und vor E-Mail-Modul 8: `PATCH` auf Airtable zur dauerhaften Speicherung der Beleg-Drive-ID bei weiter gesetzter `Online-Annahme Bestätigung in Bearbeitung=true`. E-Mail-Modul 8 prüft zusätzlich Airtable-PATCH-Erfolg und referenzierte Beleg-ID und bleibt **hart `0=1` gesperrt**. Abschlussmodul 9 schreibt erst **nach** erfolgreicher Mail das Versanddatum und setzt `in Bearbeitung=false`; eine verspätete Beleg-ID-Schreibung wurde entfernt. Polling-Modul 1 schliesst bereits archivierte `Online-Annahme Beleg Drive ID` aus. Szenario verarbeitet sequenziell.

**Synthetisch geprüft:** Fake-Offerte `TEST-RECOVERY-20261014-NO-CONTRACT`, Status Entwurf, `Online-Annahme rechtlich freigegeben = NEIN`. Isolierter Test `7964528` prüfte tatsächlich geschützten Fake-Drive-Nachweis, persistierte dessen ID via Airtable-API und erzeugte danach absichtlich einen Laufzeitfehler als simuliertes Mailproblem. Resultat: Ausführung `b296998f54ff453cbbb33434f9247bb4` mit erwarteter Exception **nach** erfolgreichem PATCH; Airtable-Beleg-ID unverändert vorhanden, `in Bearbeitung=true`, kein Versanddatum, keine Mail. Test deaktiviert.

**Read-only-Triage `7964549`:** drei Make-Testausführungen: (1) gespeicherter Beleg + unklarer Versand ⇒ **MANUAL_REVIEW_BEFORE_ANY_EMAIL**, (2) gesperrter Vorgang + noch keine Beleg-ID ⇒ **MANUAL_REVIEW_BEFORE_PROOF_RETRY**, (3) keine Freigabe ⇒ **BLOCKED_NOT_LEGALLY_APPROVED**. In allen Fällen `may_auto_send=false`. Test deaktiviert. Synthetische Offerte bleibt intern erkennbar und wurde in den gewollten Fehlerzustand zurückgesetzt.

**Operative Restgrenze:** Unterbrechung zwischen Drive-Upload und Modul-15-PATCH kann ein PDF ohne Referenz im Airtable-Datensatz hinterlassen; die Bearbeitungssperre verhindert automatische Zweiterstellung, aber eine **manuelle Drive-Suche** ist dann nötig. Bei erfolgreicher Kundenmail und fehlgeschlagener finaler Statusaktualisierung kann die E-Mail schon versandt sein; ohne providerseitige Idempotenz-/Transaktionsgarantie ist automatischer Retry riskant. **Nie blind erneut senden**, zuerst Postausgang und Make-Logs prüfen.

Detaillierte Anleitung/Entscheidungstabelle: [LSZH_ANNAHMEBELEG_WIEDERANLAUF_STAGING.md](./LSZH_ANNAHMEBELEG_WIEDERANLAUF_STAGING.md). Rechtliche/geschäftliche Freigabe, öffentliche Online-Annahme, echte Kundenmails und sämtliche produktiven Aktivierungen **weiterhin offen und gesperrt**.


### Klarstellung 14.10.2026 – D1–D3 geschäftlich bereits definiert
Auf ausdrücklichen Hinweis des Geschäftsführers sind **D1–D3 keine erneut zu entscheidenden Geschäftsfragen**. Die bereits erarbeiteten Geschäftsparameter gelten für die weitere interne Vertragserstellung als **festgelegt**:
- **D1 Care-Kündigung:** 30 Kalendertage auf Monatsende, soweit keine abweichende Mindestlaufzeit vereinbart; zwingende Rechte (insbesondere ggf. Art. 404 OR) vorbehalten.
- **D2 Abnahme:** Prüfung innerhalb von 10 Arbeitstagen, **keine** fiktive Abnahme allein durch Schweigen.
- **D3 Haftung:** Bei leicht fahrlässig verursachten unmittelbaren und vorhersehbaren Vermögensschäden Entgelt der betroffenen Leistung der letzten 12 Monate, **mindestens CHF 2'000**, soweit wirksam und angemessen; Vorsatz, grobe Fahrlässigkeit und zwingende Haftungsgrenzen nicht ausschliessen.
**Status-Trennung:** Geschäftliche Eckwerte **definiert**; juristische Angemessenheit/Wirksamkeit **ungeprüft bzw. offen**; RC1-Dokumente und tatsächlicher Kundeneinsatz **nicht final freigegeben**. Alte Einträge «D1–D3 Geschäftsentscheid offen» sind **historischer Prüfstand** und durch diese Klarstellung überholt. Kein zusätzlicher Freigabe- oder Versandautomatismus, Make-Sperren unverändert. Es wird nicht nochmals nach denselben Eckwerten gefragt.


### Nachtrag 14.10.2026 – Entwicklungsfreigabe ohne vorgezogene juristische Freigabe; optionale AVV

**Entscheid des Geschäftsführers:** Juristische Prüfung der Projektbedingungen und AVV soll **zu einem späteren Zeitpunkt** stattfinden. Alle weiteren technischen Entwicklungs- und synthetischen Integritätstests werden nun **unter der Arbeitsannahme „als ob juristisch freigegeben“** weitergeführt, ohne diese Freigabe als rechtliche Tatsache zu behaupten, echten Kundendatenzugriff oder Produktivabschlüsse zu erlauben. D1–D3 (Care 30 Kalendertage zum Monatsende, Abnahme 10 Arbeitstage ohne Schweigeabnahme, Haftung 12 Monate Entgelt der betroffenen Leistung mindestens CHF 2'000) sind **geschäftlich bereits definiert**; keine erneute Grundsatzrückfrage. RC1-Originale unverändert, interne AVV-provisorische Freigabe ebenfalls unverändert. Spätere Rechtsprüfung bleibt formeller Launch-Meilenstein.

**Airtable Offerten – neue additive Felder:** AVV Drive ID (`fldojDAkMfvjJycme`), AVV-SHA256 (`fldbhBi71Jmr6g9Uk`), AVV-Version (`fld4cMFAPuSfLjz2B`), AVV ausdrücklich akzeptiert (`fld8gm2LLGAeHeBSA`). Bestehendes Auswahlfeld `AVV erforderlich` (Ja, Nein, Prüfen) weiterverwendet. Keine bestehenden Offertenzellen/echten Kundenannahmen verändert.

**Testlauf mit realen Make-/Google-Drive-Modulen, jedoch rein fiktiven Dokumenten:**
- `7964777`: `TEST_ONLY`-AVV-Anlagen A–C als 47'341-Byte-PDF erzeugt, im Geschäftskonto-STAGING separat gespeichert, readOnly gesetzt und SHA-256 sowie Ordner geprüft – **SUCCESS**; danach deaktiviert.
- `7964807`: optionalen AVV-Pfad an 8 Konstellationen getestet. `Ja` mit drei PDFs und simulierter zusätzlicher AVV-Zustimmung/vertretungsberechtigter Person **SUCCESS**; `Nein` mit zwei PDFs **SUCCESS**. `Prüfen`, fehlende Zustimmung, falscher AVV-Hash, fehlende Vertretungsprüfung, fehlende Version und Inkonsistenzen **BLOCKIERT**. Danach fiktiven Annahmenachweis bei `Ja` und `Nein` tatsächlich als PDF archiviert und schreibgeschützt; falscher Hash stoppt vor Belegerstellung; `real_contract=false, email_sent=false`. Wieder deaktiviert.
- Im `Nein`-Beleg wurde eine anfangs irreführende AVV-Prüfsummendarstellung korrigiert und der zweidokumentige Pfad anschliessend erneut erfolgreich geprüft.

**Produktionsnahe Staging-Sicherheit:** `7940261` für Annahmelink hat zusätzlich `AVV erforderlich=Nein` als Filter, `7940220` für Annahmenachweis dieselbe Bedingung in der Suchformel. **AVV Ja und Prüfen sind bis zur echten Drei-Dokumenten-Verkabelung an Website/Token/Mail/Nachweis blockiert**; alle Szenarien weiterhin inaktiv und `0=1`-Mail-/Claim-Sperren aktiv. Es ist **keine** produktive Annahme freigegeben.

Technisches Testprotokoll und Integrationsplan: [LSZH_OPTIONALE_AVV_ANNAHME_TECHNIKTEST_20261014.md](./LSZH_OPTIONALE_AVV_ANNAHME_TECHNIKTEST_20261014.md). Nächster Fokus: vollständig bedingte AVV-Anzeige/Einzelzustimmung im **nicht live geschalteten** Website-Annahmezweig und korrekte bedingte AVV-PDF-Beilagen in Annahmelink und Beleg. Nach vollständiger technischer Abnahme bleiben echte Verträge/E-Mails, Kundenfreigabe und formelle spätere Rechtsprüfung getrennt.


### Nachtrag 14.10.2026 – Website-AVV-Draft ohne Live-Merge

**Entwicklung getrennt vom Livebetrieb:** GitHub **Draft PR #5** `feature/optional-avv-acceptance-staging-20261014` → `feature/secure-offer-acceptance-20261013`. Auf einer **isolierten, nicht auf die Live-Website gemergten Branch** wurden `offerAcceptance.js` und `offerArchiveVerifier.js` erweitert. Bei `AVV erforderlich=Ja`: Dritt-PDF inkl. Drive-ID, SHA-256, PDF-MIME, Drive-Schreibschutz, Geschäftsarchivordner und AVV-Version prüfen; Vorschau zeigt bedingte AVV-Version/Hash; gesicherter AVV-PDF-Download, Annahme benötigt zusätzliche explizite Zustimmung `accept_avv=true` sowie exakt passenden AVV-Hash und Version; AVV-Zustimmung und PDF-Hash werden im Nachweis sowie im Airtable-Feld `Online-Annahme AVV ausdrücklich akzeptiert` protokolliert. `AVV erforderlich=Nein` erlaubt keine unverlangte AVV-Zustimmung/-Dateien; `Prüfen` blockiert. Angebot-/Projektbedingungen-PDFs müssen zusätzlich demselben konfigurierten Geschäftsarchivordner angehören. Neues erforderliches Env-Gate `OFFER_DRIVE_ARCHIVE_FOLDER_ID`. Implementierter Testsatz `test/offerAcceptance.avv.test.js` prüft acht AVV-Konstellationen auf Node-Ebene; Syntax von drei Dateien über JavaScript-Parser geprüft.

**Offene technische Punkte:** Node-Tests noch nicht ausgeführt (`node --test`/CI), tatsächliche gemeinsame Website-UI/Checkbox-Präsentation nicht fertig, reale serverseitige Drive-Dienstkonto-Berechtigung noch offen, end-to-end Make-Attachments bei AVV=Ja noch nicht implementiert. **Draft PR nicht mergen oder deployen**. Die bisherigen isolierten Make-AVV-Tests bestanden; sie sind von dieser Server-Branch getrennt. Make-Produktionsvorbereitung `7940261`, `7940220` bleibt inaktiv und AVV=Ja/Prüfen bleibt fail-closed, alle Mail- und Claim-Gates `0=1` aktiv.

**Geschäftlicher Entscheid:** Entwicklung vorziehen, juristische Prüfung später vor echtem Kundenbetrieb; nicht als wirkliche aktuelle Freigabe kennzeichnen. Kein Kundenversand, keine Annahme, keine externe Einladung.

Link: https://github.com/lszh-automations/lszh-automations-site/pull/5


### Nachtrag 14.10.2026 – optionale AVV im Webformular und geprüfte Anhang-Metadaten

**Website-Draft (NICHT DEPLOYT):** Auf `feature/optional-avv-acceptance-staging-20261014`, [Draft PR #5](https://github.com/lszh-automations/lszh-automations-site/pull/5), die echte HTML-Oberfläche `offerte-annehmen/index.html` ergänzt. Bei `AVV erforderlich=Ja` erscheinen drittes PDF, AVV-Version und eine **eigene, nicht vorangekreuzte erforderliche Checkbox**. Bei `Nein` bleiben diese Elemente versteckt; `Prüfen` wird serverseitig verweigert. Der Client übergibt gesondertes `accept_avv`, AVV-Version und SHA-256 an `/api/offer/accept`; nur wenn die serverseitige Prüfung den richtigen archivierten PDF-Datensatz bestätigt, kann die AVV-Zustimmung im Entwurfszweig in Airtable protokolliert werden. Neue `OFFER_DRIVE_ARCHIVE_FOLDER_ID`-Anforderung bei PDF-Prüfung; kein serverseitiges Dienstkonto angelegt. Branch nicht in main gemergt.

**Automatisierte GitHub-Tests wirklich ausgeführt:** Die GitHub Actions-Suite `Offer acceptance checks` wurde um `test/offerAcceptance.avv.test.js` und `test/offerAcceptance.ui.test.js` erweitert. Veraltete frühere Test-Fixtures (fehlender AVV-Modus und fehlender Drive-Elternordner) korrigiert, ohne Sicherheitsprüfungen abzuschwächen. **Erfolgreicher GitHub Actions Lauf 38631231782: 28 Tests, 28 bestanden, 0 fehlgeschlagen; Node- und Browser-Skriptsyntax erfolgreich.** Dies ist eine Test-Branch-Prüfung, kein echtes Browser-/Dienstkonto-End-to-End.

**Make-STAGING (ausschliesslich synthetisch):** Isoliertes `7964807` nach erfolgreicher 2-/3-PDF-Prüfung um Modul 18 ergänzt, das **nur Metadaten** der vorgesehenen Anhänge als prüfbare Liste zusammenstellt: Offerte + Projektbedingungen bei `Nein` (2), zusätzlich AVV bei `Ja` (3). Manifest erhält separate PDF-Datei-IDs und SHA-256-Werte und wird im als ungültig beschrifteten synthetischen Annahmenachweis referenziert. Beide positiven Pfade in echten Make-Ausführungen erfolgreich durchlaufen, bewusst falscher AVV-Hash scheitert **vor** Belegerstellung. Kein Gmail-Modul in der Teststrecke; Testscenario danach wieder inaktiv.

**Wichtige Grenze:** Die Metadatenliste ist **noch kein real getesteter E-Mail-Anhang**. In den produktionsnahen, weiterhin inaktiven Make-Szenarien `7940261` und `7940220` ist der AVV=Ja/Prüfen-Pfad weiterhin **fail-closed**. Noch offen: bedingte 2/3 PDFs beim Linkversand und 3/4 PDFs bei der Bestätigung tatsächlich ohne echten Versand konfigurieren/verifizieren; Backend-E2E mit kundeneigenem Dienstkonto; Race-/Idempotenzkontrolle einer echten Annahme. Rechtsprüfung und echte Freigaben wie vom Geschäftsführer beschlossen erst vor Produktivstart. Alle Kundenmail-/Claim-0=1-Gates weiter aktiv; keine Live-Änderung.


### Nachtrag 14.10.2026 – tatsächlich konfigurierte Make-Gmail-Anhänge AVV Nein/Ja und Binärdatei-Test

**Änderung (STAGING, KEINE PRODUKTIONSAKTIVIERUNG):** Für den elektronischen Offerten-/Annahmeprozess sind bedingt nach `AVV erforderlich` getrennte, fail-closed Make-Verarbeitungspfade aufgebaut:
- **AVV Nein** – bestehendes Annahmelink-Szenario `7940261` (inaktiv, harter 0=1-Gate bei Token-Modul 2 und Mail-Modul 5): Airtable-Suchformel zusätzlich explizit `{AVV erforderlich}='Nein'`; echte Gmail-Modulzuordnung bereits **2 PDF-Anhänge** (Offerte, Projektbedingungen). Bestehendes Bestätigungs-Szenario `7940220` (inaktiv, Claim 2 und Gmail 8 0=1 gesperrt) selektiert ausschliesslich AVV Nein; echte Gmail-Zuordnung **3 PDF-Anhänge** (Offerte, Projektbedingungen, Annahmenachweis).
- **AVV Ja Offertenlink** – neues explizit getrenntes, **inaktives** Staging-Szenario `7965215`: auf Basis der bestehenden Abläufe mit zusätzlichem Google-Drive-Download Modul 11 und Metadaten-/SHA-Check Modul 12 für kundenspezifische AVV. Select-Formel verlangt AVV Ja, AVV-Datei-ID/-SHA/-Version und noch keine Annahme/AVV-Zustimmung; vor Token-Speicherung Dateiname/MIME, SHA-256 gegen Airtable und heruntergeladene Datei, Drive-Elternordner sowie `readOnly=true` durch Filter geprüft. In echtem Gmail-Modul 5 drei **fest und getrennt gemappte PDF-Attachments** `{{7.data}}` (Offerte), `{{8.data}}` (Projektbedingungen), `{{11.data}}` (AVV samt Anlagen). Token-Erstellung und Gmail behalten eigene harte `0=1`-Filter, E-Mail wird **nicht** versendet.
- **AVV Ja Annahmebestätigung** – neues explizit getrenntes, **inaktives** Staging-Szenario `7965223`: selektiert nur bereits angenommene, ausdrücklich AVV-akzeptierte Aufträge, deren Dritt-PDF-ID/Hash/Version hinterlegt ist. Module 16 und 17 lesen/prüfen AVV-PDF vor Claim; Claim 2 bleibt hart 0=1 gesperrt. Bewährte Reihenfolge Archivieren -> Schutz/Hash prüfen -> Drive-Beleg-ID VOR Mail in Airtable persistieren bleibt erhalten. Echtes Gmail-Modul 8 enthält **4 gemappte PDF-Anhänge** `{{3.data}}` Offerte, `{{4.data}}` Projektbedingungen, `{{16.data}}` AVV, `{{6.data}}` Annahmenachweis; ebenfalls harter `0=1`-Gate. Kundenmail-Text weist auf die AVV hin. Beide AVV-Ja-Varianten von Make strukturell ohne Validatorfehler gespeichert; vorhandene Verbindungen Google Drive/Gmail/Airtable sind `ok`.
- Es existieren damit vier **separate** derzeit inaktive Pfade (AVV Nein/Ja für Link und Bestätigung), nicht ein zentraler Router. Doppelte Verarbeitung wird durch gegenseitig ausschliessende `AVV erforderlich`-Suchbedingungen verhindert; für Livebetrieb zusätzlich organisations-/kundenbezogene Freigabe, Idempotenz und Monitoring abschliessend prüfen.

**Tatsächlich ausgeführter technischer Binärdatei-Test OHNE Mail:** Isoliertes On-Demand-Test-Szenario `7965246` lädt via geschäftlicher Make-Google-Drive-Verbindung vier synthetische `TEST_ONLY`-PDF-Dateien als **Binärdaten**, überprüft Dateibezeichner/IDs, MIME `application/pdf`, SHA-256-Format, Dateigrösse, Ablage im Geschäftsarchiv und vorhandene Daten. Lauf `fcdfa4ee1e1c4738bc4300abe8b05d2e`: AVV Ja -> **SUCCESS**, vier Anhänge: Offerte/Projektbedingungen/AVV/Annahmenachweis. Lauf `d2e8f0d006ab44d1b404cd51c7d96b64`: AVV Nein -> **SUCCESS**, drei Anhänge ohne AVV. Lauf `9ed43f65599446578ccf6c09bc77ba5c`: `Prüfen` -> bewusster **ERROR** `INVALID_AVV_MODE`. Danach Test-Szenario deaktiviert. Alle Ausgaben `send_permitted=false`; keine Mail in diesem Szenario.

**Wichtig für die Abnahme:** Die Gmail-Module sind nun wirklich mit den erwarteten 2/3/3/4 `attachments[]` (Dateiname plus `data` aus Drive-Modulen) konfiguriert, jedoch wegen der Einwilligungs-/Sicherheitsgrenzen **nicht durch tatsächliches Senden ausgeführt**. Der Binärtest prüfte die Dateien separat – er beweist **nicht**, dass Gmail sie bereits einmal erfolgreich als Nachricht transportiert hat. Alle produktiven/produktionsnahen Szenarien und ihre Mail- sowie Token/Claim-Gates bleiben inaktiv/gesperrt. Live-Website unverändert; GitHub [Draft PR #5](https://github.com/lszh-automations/lszh-automations-site/pull/5) bleibt ungemergt; GitHub CI für Branch hatte zuvor **28/28 Tests bestanden**.

**Noch offen:** sichere Integration der getrennten Make-Pfade in ein dokumentiertes Deployment-/Anlagen-Konzept, vollständiger Website→Airtable→Make→Drive-Nachweis mit synthetischem Token und echter Browser-Nutzung, Zugriff des eingeschränkten Google-Dienstkontos, Finalität der AVV-Anlagen/Projektbedingungen und später juristische Prüfung vor echtem Kundenbetrieb, ausdrückliche Einwilligung zu produktivem Versand/Aktivierungen. Keine echten Nachrichten, Verträge oder Einladungen.


### Nachtrag 14.10.2026 – HTTP-Synthetik und echte Make/Airtable/Drive-Testkette, Parallelitätsbefund

**Website-HTTP-Test (nur Mock-Provider):** Im nicht deployten GitHub Draft PR #5 `feature/optional-avv-acceptance-staging-20261014` läuft nun `test/offerAcceptance.http.test.js` mit tatsächlichem lokalem `server.js`-HTTP-Server. Airtable, OAuth und Drive werden ausschliesslich lokal mit ephemeren Test-Credentials simuliert. Es werden echte HTTP-Requests und echte Codepfade für Vorschau, PDF-Bytes, AVV-Zustimmung und Nachweis-PATCH getestet, ohne externe Daten zu bearbeiten. Rate-Limit-Schutz blieb erhalten. **GitHub Actions 38633804997: 42/42 Tests grün**, 0 fehlgeschlagen. Die CI-Konfiguration danach auf explizite `test/*.test.js` umgestellt.

**Make + Airtable + Google Drive (wirkliche, aber ausschliesslich fiktive Datensätze und Dateien):** Testofferte `TEST-HTTP-MAKE-AVV-20261014-NO-CONTRACT`, Airtable `recMv3OYZQwXzIHdF`, **Status Entwurf**, AVV-/Rechtsfreigabe nicht erteilt, keine Kundenadresse. Neues isoliertes Make-Szenario `7965394` holt *nur* diesen Datensatz, prüft strikte `TEST_ONLY`-Voraussetzungen, ruft Kind-Testscenario `7964807` für AVV-Ja-Nachweis aus **drei echten fiktiven PDFs** auf, erhält archivierte/geschützte Beleg-ID+SHA und schreibt nur beim Testdatensatz Belegreferenz sowie technischen Testnachweis. Ergebnis Eltern `c70e542cf2c942068cdabdd2e1c1e251` und `83338135d01a4f14804265ddf8f9f8dd`: jeweils SUCCESS, status **nicht** angenommen, no contract/no mail.

**Wichtiger aufgefundener Parallelitätsfehler:** Zwei nahezu gleichzeitige synthetische Läufe erzeugten ohne vorherige Sequenzialisierung zwei PDF-IDs `1tu_1vumOzKDI6KH1TQREYlya5JqZSf83` und `1jD8BXp5FjkXcChvrPvX974_9_o_UT4O9` (gleicher SHA-256, unterschiedliche Google-Dateien). Drittlauf `47013a17168e4a759cfe25fd0e5585dc` stoppte bei bereits vorhandener Beleg-ID. Danach **Make-Setting `sequential=true`** am isolierten Parent gesetzt; erneuter Lauf `eba45e394d0e40cf8709c92eaf647e2f` stoppte bereits beim Preflight ohne weitere Archivdatei. **Sequenziell reicht allein nicht für produktive Exactly-once-Garantie über mehrere Startkanäle und atomare Airtable-Transaktionen.** Die zwei fiktiven Belege bleiben als QA-Nachweis. Beide Make-Testszenarien am Ende **inaktiv**.

**Grenzen:** Diese beiden erfolgreichen Testhälften sind **noch keine** durchgehende öffentliche Website mit echter Airtable/Make/Drive-Annahme. Geschäftsarchive-Dienstkonto und Render-Workspace müssen noch kontrolliert werden; der Render-Connector verlangt eine explizite Workspace-Bestätigung, die nicht erraten werden darf. Produktive Szenarien, Sendegates und GitHub-Draft bleiben unangetastet/inaktiv. Kein Vertrag, keine Einladung, keine E-Mail, keine juristische Freigabe.

Ausführliches Prüfprotokoll: [LSZH_SYNTHETISCHER_HTTP_MAKE_AIRTABLE_DRIVE_E2E_20261014.md](./LSZH_SYNTHETISCHER_HTTP_MAKE_AIRTABLE_DRIVE_E2E_20261014.md).


### Nachtrag 14.10.2026 – Google-Identität: geschäftliche Eigentümerschaft und private Altbestände

**Verbindliche Zielvorgabe des Geschäftsführers:** Für LSZH Automations sollen Google Cloud, das serverseitige Archiv-Dienstkonto sowie die Google-Drive-/Docs-/Gmail-Verbindungen **ausschliesslich** über die Google-Identität `lars@lszh-automations.ch` bzw. geschäftlich kontrollierte Ressourcen laufen. **Keine neue produktive LSZH-Ablage im privaten `lars.schulthess10@gmail.com`.** Die privaten Altbestände erst nach nachgewiesen vollständiger geschäftlicher Sicherung und aktualisierten Referenzen bereinigen. Keine Dateilöschung, Freigabe oder Verschiebung ohne konkreten Migrationsnachweis.

**Kontrollierte Ownership-Prüfung (tatsächliche verbundene Apps):**
- Google-Drive-App direkt in ChatGPT ist zum Stand der Prüfung **mit privatem Gmail-Kontext verbunden** und zeigt privates STAGING-Vertragsarchiv `1_1jVIlD2MAwkVxpTsCUIZ-14LjQggmA3`, seine Unterordner `Offerten-PDF`, `Projektbedingungen`, `Annahmenachweise` sowie u.a. das **private** Google-Doc `LSZH Vertragsarchiv – Freigaberegister (STAGING)` `1ANPIYiKzLIg_yxKifhy5lZHQe0zIwfo2yD2Ll69fhtw`. Eigentümer durch Drive-Metadaten: `lars.schulthess10@gmail.com`. Die direkt verbundene private Drive-App kann das geschäftliche Ordner-ID `1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in` derzeit **nicht** lesen (HTTP 404 wegen kontengetrennten Zugriffs).
- Die zentrale **Make Google Drive**-Verbindung `11904271`, Google Docs `11905001` und Gmail `11904991` tragen den Geschäftskonto-Kontext `lars@lszh-automations.ch`, Status bei den LSZH-Szenarien `ok`. Über das nachweislich geschäftlich authentifizierte Make-Drive-API-Get wurden **Eigentümer und HTTP 200** für Vertragsarchiv-STAGING `1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in`, Unterordner `Offerten-PDF`, eine bereits kopierte Alt-Offerte und eine `TEST_ONLY`-AVV bestätigt: **jeweils Eigentümer `lars@lszh-automations.ch`**. Read-only-Szenario `7965546` nach der Prüfung deaktiviert.
- Das geschäftliche Staging-Hauptarchiv hat bereits Unterordner `Offerten-PDF` `1COIjnGZDK1XCPXNBNikHw-7eUKfjNXgU`, `Projektbedingungen` `1o9ADwrIAuhEtP7Mv7tDCY9-OkNpCxX3I` und `Annahmenachweise` `1Q8ws0VjPeDSOYhKrx5a6I5_uhzRM2zN7`; zum Prüfzeitpunkt **alle drei leer**, da neue synthetische PDFs bislang im Geschäfts-STAGING-Hauptordner liegen. Keine neuen Unterordner anlegen, bevor alte bereits vorhandene berücksichtigt sind.
- Geschäftlich kontrollierte Ordner `Migration-Altbestand Offerten` und `Migration-Altbestand Rechnungen` enthalten nach Read-only-Inventur **10** und **23** gespeicherte DOCX-Kopien. Dies ist eine **Bestandsaufnahme**, **noch kein lückenloser 1:1-Bytevergleich aller Quellen/Versionen**. Die privaten historischen LSZH-Rechnungen und Altverzeichnisse bleiben erhalten, bis Kopien und Ablage-Verweise geprüft sind.
- Zwei aktive Make-Szenarien gefunden, eines mit iOS-/Google-E-Mail-Integration und ein weiteres nicht zur LSZH-Vertragsablage gehörendes. Diese **nicht verändert**. LSZH-Offerten-/Annahme-Produktionsvorbereitungen bleiben inaktiv und hart gegatet.

**Entscheidung für Google Cloud:** Bei `console.cloud.google.com` **als `lars@lszh-automations.ch` anmelden**, das Google-Cloud-Projekt und ein auf Drive-Lesen beschränktes Dienstkonto in derselben geschäftlich verwalteten Identität/Projektverwaltung anlegen. Dem Dienstkonto **nur Leserechte** an den tatsächlich benötigten geschäftlichen Vertragsarchiv-Ordnern gewähren, keine pauschalen Google-Cloud-Administratorrollen oder private Drive-Freigaben. *Dienstkonto ist eine eigenständige technische Identität, nicht identisch mit dem Benutzer.* Noch keine JSON-Private-Key-Datei in GitHub/Airtable/ChatGPT hochladen. Später für Render eine sichere Authentisierung/Secret-Bereitstellung planen. Bei Google Workspace können Sharing-/Trust-Rules die Freigabe an `gserviceaccount.com` beeinflussen.

**Notwendige Umstellung vor realem Kundenbetrieb:**
1. ChatGPT Google-Drive-App **erst nach abgesicherter Migration** mit der Google-Identität `lars@lszh-automations.ch` (neu) verbinden oder umstellen; Benutzerinteraktion nötig, kein automatisches Connector-Account-Switching.
2. Den noch privat geführten **Freigaberegister-Originalinhalt** versioniert ins geschäftliche Google Drive übertragen, neues Geschäftsdokument als Quelle bestimmen; danach alle automatischen/doc-Referenzen des alten privaten Registers aktualisieren und Byte-/Inhaltsgleichheit verifizieren.
3. Private Rechnungs-/Offerten-Altbestände gegen die 10 + 23 Geschäftskopien auditieren und fehlende Exemplare sicher kopieren; keine Löschung der Quellen bis zum verifizierten Abgleich.
4. Die bestehenden drei geschäftlichen Unterordner nach Bedarf befüllen, Make-/Render-Archivpfade und SHA-/Parent-Prüfungen konsistent umstellen. Ordnerumzug ohne gleichzeitiges Metadaten-Gate-Update würde die Integritätstests blockieren.
5. Business-Google-Drive-Freigabe für Dienstkonto minimal halten. Dienstkonto-/Render-Zugang zuerst mit rein synthetischen Dateien testen, später formelle Betriebs-/Rechtsfreigabe.

**Während Audit ausgeführt:** Make-Szenario `7943019` (Geschäftskonto-Ordnerinventur read-only) temporär aktiviert, Hauptordner und fünf Unterordner inventarisiert, danach deaktiviert. Make-Szenario `7965546` (Business Drive Eigentümer read-only) ebenfalls nur für obige Viererprüfung temporär aktiviert und deaktiviert. **Keine Shares, neuen Fremd-Konten, Dateiumzüge, Dateilöschungen, E-Mails oder Vertragsabschlüsse.** Das frühere private Register wurde bei dieser Prüfung nicht verändert.


### Nachtrag 15.10.2026 – Google-Cloud-Dienstkonto und Archiv-Lesefreigabe bestätigt

**Google Cloud vom Geschäftsführer im Geschäftskonto erstellt/konfiguriert:** Organisation `lszh-automations.ch`, Projektname `LSZH Automations`, Projekt-ID `lszh-automations` (Projektnummer `470613067122`). Google Drive API im Projekt laut Console-Screenshot **aktiviert**. Dienstkonto `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com` mit Name `LSZH Archive Reader` laut Console-Screenshot **aktiviert**. Keine projektweiten IAM-Rollen vergeben; ausdrücklich **keine JSON-Schlüsseldatei** in GitHub, Airtable, ChatGPT oder E-Mail bereitstellen.

**Dienstkontoordnerfreigabe unmittelbar über die echte Make-Google-Drive-Geschäftsverbindung unabhängig verifiziert:** Read-only-Audit-Szenario `7965546`, Make-Ausführung `ebf4c08392874df496acfbb8004cb840`, Drive v3 `GET /files/1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in` mit `permissions(type,role,emailAddress),owners,shared,parents`, HTTP 200. Ordner `LSZH Automations Vertragsarchiv – STAGING – Geschäftskonto`. Eigentümer `lars@lszh-automations.ch`, zweite explizite Freigabe **`lszh-archive-reader@lszh-automations.iam.gserviceaccount.com` als `role=reader`**, nicht writer und nicht owner. Damit ist die **Drive-Berechtigungsfreigabe** bestätigt. Audit-Szenario danach **wieder deaktiviert**. Ordner selbst bleibt nicht öffentlich freigegeben.

**Weiterhin offen – nicht als erledigt melden:** Serverseitige Authentifizierung der Website/Render **als Dienstkonto selbst** und tatsächliche PDF-Integritätsabfrage über diesen Account sind noch nicht ausgeführt. Laufendes Render-Deployment weiterhin unverändert; keine echten Vertragsabschlüsse. Sicheres Secret-/Keyless-Verfahren wählen. Vorzugsweise Workload Identity Federation *nur falls* mit Hosting und zugelassenem Identitätsanbieter unterstützbar; falls technisch nur JSON-Schlüssel praktikabel, diesen ausschliesslich lokal/über Render Secret-Umgebung bereitstellen, nie als Nachricht/Repo/Airtable übermitteln, Rotation und Beschränkung planen. Geschäftliches Freigaberegister befindet sich noch im privaten Drive und muss versioniert migriert und geprüft werden. Das alte Privatkonto vor vollständiger Migration nicht trennen oder Dateiquellen löschen.


### Nachtrag 15.10.2026 – isoliertes Render-Staging für Offertenannahme erfolgreich bereitgestellt

**GitHub-Autorisierung Render:** Der Geschäftsführer hat die Render GitHub App für `lszh-automations/lszh-automations-site` verbunden. Die Live-Render-Website `lszh-automations-site` (Service `srv-db1r13ad0e5s7390tcr0`) bleibt auf `main`, Auto-Deploy **yes**, PR-Previews **off**, durch diese Arbeit **nicht verändert**. Eine vorhandene unabhängige Rechnungs-Testinstanz `lszh-swiss-qr-staging` (Service `srv-db7cn5q5b2lc73fecb1g`) bleibt ebenfalls unverändert.

**Neue separate, kostenlose Render-Webinstanz (keine gemeinsamen Live-Variablen):**
- Render-Workspace `My Workspace` / `tea-db1qm7btqb8s73eajs8g` (Geschäftskonto `lars@lszh-automations.ch`).
- Name `lszh-offer-acceptance-staging`; Render-Service-ID `srv-db88q5jncjis73f2g93g`; [Dashboard](https://dashboard.render.com/web/srv-db88q5jncjis73f2g93g); Testdomain `https://lszh-offer-acceptance-staging.onrender.com` (**nicht öffentlich für Nutzer freigegeben**).
- Gleicher GitHub-Repository-Quellcode, aber Branch `feature/optional-avv-acceptance-staging-20261014`, **nicht main**; Node, Region Frankfurt, `plan=free`, `autoDeploy=no`, PR-Preview `off`.
- Build-Befehl `npm test`, Start `node server.js`; ausschliesslich die neuen, nicht geheimen Umgebungsvariablen `SITE_PRIVATE=true`, `OFFER_ACCEPTANCE_ENABLED=false`, `NODE_ENV=staging`. **Keine** Live-Make-Webhooks, echten Airtable-Tokens, Google-Dienstkonto-Credentials oder produktiven E-Mails in dieser Staging-Instanz. Kein `PREVIEW_TOKEN` gesetzt: Site-Code verweigert ohne Vorschau-Token Requests mit HTTP 503. Dieser HTTP-Status wurde noch nicht von ausserhalb geprüft, Code-Gate und Konfiguration aber gelesen/gesetzt.
- Initiales Deploy `dep-db88q6bncjis73f2gagg`, Commit `0d9cfae30f366fee66f8c4b52fd91ec17fbd9d84`; via Render API `status=live` **nur für Staging-Service**, nicht LSZH-Live-Hauptseite. Render-Buildlogs: **41 Tests / 41 bestanden / 0 Fehler**, `Build successful`, Node-Server gestartet. Hier bedeutet Deploy `live` die erfolgreiche Bereitstellung des **gesperrten Staging-Dienstes**, **keine** Kundenfreigabe.
- Der User hat **keine** weiteren manuellen Arbeiten gebraucht. Neues GitHub-Draft-PR #5 bleibt ungemergt.

**Offen vor echten Website-/Drive-End-to-End-Tests:** Ein sicherer Preview-Zugang für den nur internen Testzugriff; serverseitige Authentifizierung als das inzwischen angelegte und zum **Geschäftsarchiv als Reader freigegebene** Google-Servicekonto `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com`, vorzugsweise kurzlebige bzw. keyless Anmeldedaten, alternativ eng kontrolliertes Secret in Render. Keine JSON-Private-Keys via Chat/GitHub/Airtable, keine ungeprüften Geheimnisse an die Staging-Instanz kopieren. Erst rein synthetische Dateien und Ansprüche testen; Produktionsszenarien/echte Kundendaten/Vertragsfreigaben bleiben gesperrt. Die spätere juristische Prüfung vor produktivem Vertragsabschluss ist ein separater Freigabepunkt.


### Nachtrag 15.10.2026 – Render-Staging Google-Reader vorbereitet und Secret-Datei-Auslieferung gesperrt

**Erfolgreich:** Auf dem weiterhin ungemergten PR #5 im Branch `feature/optional-avv-acceptance-staging-20261014` wurde eine konkrete Secret-File-Auslieferungsgefahr behoben: Render stellt bei Node-Diensten Secrets auch im Service-Stammverzeichnis bereit; der frühere beliebige Static-File-Zugriff wurde durch eine **explizite Liste öffentlicher HTML-/robots-Pfade** ersetzt. Neue HTTP-Negativtests verhindern das Ausliefern von Quellcode, `.env`, `package.json`, Test-/Docs-Dateien und `lszh-archive-reader.json`. Der Reader-Verifier akzeptiert neu im Staging das fest vorgegebene lokale Render-Secret-File `/etc/secrets/lszh-archive-reader.json` mit PIN auf `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com`. Fehlender oder fremder Pfad/falsches Dienstkonto werden abgelehnt. **Kein echtes JSON-Geheimnis erstellt oder hinterlegt.**

**Readiness:** Nur im privaten Staging `srv-db88q5jncjis73f2g93g` wurden harmlose Umgebungsvariablen `OFFER_DRIVE_ARCHIVE_FOLDER_ID`, `OFFER_DRIVE_SA_FILE` (nur Pfad) und `LSZH_STAGING_ARCHIVE_SMOKE=false` hinzugefügt; `SITE_PRIVATE=true`, `OFFER_ACCEPTANCE_ENABLED=false` unverändert. Der erste Render-Build brach ab, weil die ursprünglichen Testfälle `OFFER_DRIVE_SA_FILE` geerbt und deshalb parallele Fake-Credentials erkannt hatten – keine Live-Auswirkung. Korrigiert durch `scripts/run-tests-safely.js`: Unterprozesse für Node-Tests erhalten keinerlei Runtime-Keys/Webhooks und setzen `NODE_ENV=test`. Finaler GitHub CI-Lauf `38706766784`: alle Tests grün; **Render-Deploy `dep-db8912navr4c73als4h0` live auf isoliertem Staging**, `43 Tests / 43 bestanden / 0 Fehler`, Start `node server.js` geprüft. **Keine Änderung am produktiven Render-Service `lszh-automations-site`.**

Ein standardmässig **ausgeschalteter** einmaliger Staging-Startcheck `archiveStagingSmoke.js` kann später unter `LSZH_STAGING_ARCHIVE_SMOKE=true` drei nachweislich fiktive gesperrte Geschäftsarchiv-Dateien mit **echter Dienstkonto-Authentifizierung** lesen und SHA-256/PDF-Inhalt kontrollieren. Ergebnis erscheint im Staging-Log lediglich als PASS oder FAIL (ohne IDs, Hashes, Bytes, Schlüssel). Er wurde noch **nicht** mit dem echten Dienstkonto ausgeführt.

**Authentifizierungsentscheidung technisch:** Render Managed OIDC unterstützt laut offizieller Dokumentation aktuell AWS, Anthropic, OpenAI, aber keine direkte Google-Cloud-Anbindung und verlangt mindestens Pro-Workspace. Google Workload Identity Federation ist prinzipiell schlüssellos, aber für unsere Free-Render-Instanz nicht fertig verfügbar. Praktikable Testlösung wäre eine separat geschützte JSON-Dienstkonto-Datei **ausschliesslich als Render Secret File**, Filename `lszh-archive-reader.json`. Solche Schlüssel sind sicherheitskritisch und langlebig; keine Organisationspolitik dafür abschwächen. **Nutzer muss selbst im Google-Cloud-Geschäftskonto** die JSON-Datei erzeugen und **ausschliesslich in die Secret Files der separaten Staging-Render-Instanz** einfügen; niemals in Chat, GitHub, Drive, Airtable oder Live-Website. Danach kann der Assistant den Startcheck aktivieren und Logs auswerten. Eine spätere Cloud-Run-Lösung ohne langfristigen Schlüssel bleibt sicherere Zieloption. Noch keine Entscheidung durch technisch automatischen Key-Import erzwungen.

Detailliertes Prüf-/Betriebsverfahren: [LSZH_GOOGLE_ARCHIVE_READER_RENDER_STAGING_20261015.md](./LSZH_GOOGLE_ARCHIVE_READER_RENDER_STAGING_20261015.md). Live-Website, produktive Mail-/Annahmeszenarien, AVV- oder Rechtsfreigaben unverändert. **Keine erfolgreiche echte Google-Dienstkonto-Authentifizierung behaupten, bevor Staging-Check PASS erreicht.**
