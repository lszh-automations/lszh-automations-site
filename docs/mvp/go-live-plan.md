# LSZH Automations – MVP Go-Live Plan (14.10.2026)

**Leitprinzip:** Mit vorhandenen Kernprozessen erste Kunden zuverlässig bedienen; weitere Spezialautomationen sind V2. **Keine Live-Szenarien unkontrolliert aktivieren.**

## Go-Live-Definition (MVP, noch NICHT erreicht)

Ein tatsächlicher Kunde kann:
1. Über das öffentliche Websiteformular eine Anfrage übermitteln, die nachweislich im CRM ankommt; korrekte Kunden- und interne Bestätigung.
2. Eine persönlich überprüfte, korrekt archivierte Offerte mit Projektdokumenten erhalten und rechtswirksam elektronisch annehmen.
3. Ein sicheres Kunden-Onboarding abschliessen. Das Unternehmen betreibt seine eigene Make-Organisation und lädt LSZH nach Bedarf ein; keine Übermittlung von Zugangsdaten.
4. Nach manueller Freigabe eine korrekte Swiss-QR-Rechnung samt nachvollziehbarem PDF-Archiv erhalten. Keine Doppelrechnung und keine unbemerkten Mehrfachmails.

Diese vier Schritte müssen *am selben fiktiven E2E-Kunden* untereinander abgestimmt nachgewiesen und ihre wesentlichen Fehlerfälle geprüft sein. Eine einzige grüne Make-Execution genügt nicht.

## Erste Priorität – Website-Eingang

**Vorhanden:** Render-Dienst `lszh-automations-site` läuft von GitHub `main` (Auto-Deploy bei Commits); das Formular POSTet an `/api/lead`; Server leitet über `MAKE_LEAD_WEBHOOK` an Make Szenario `7774243`; dieses schreibt den Lead in Airtable und sendet Kunden- und interne Bestätigung. Verbindungen laut Make 'ok', das Szenario ist jedoch **inactive**.

**Blocker vor Go-Live:** Auf GitHub `main` meldete `/api/lead` bisher HTTP 200 an die Website, sobald Make den Webhook akzeptierte, ohne Nachweis der Speicherung in Airtable. Benutzereingaben wurden im Make-Szenario direkt in rohe HTML- und JSON-Templates interpoliert. Vor öffentlicher Aktivierung Feldvalidierung, HTML-Escaping und JSON-Zuverlässigkeit prüfen. Wenn `SITE_PRIVATE` aktiv ist, muss diese separate Website-Freigabe ebenfalls bewusst erfolgen.

**Vorbereitete Verbesserung (noch NICHT in main/deployed):** GitHub-Branch `feature/mvp-website-intake-safety-20261014`:
- `server.js`: Feldlängen, Pflichtfelder und E-Mail-Form prüfen; erst expliziter Make-Beleg `{ok:true,record_id:'rec...'}` mit gültiger ID löst HTTP 200 `{confirmed:true}` aus, sonst HTTP 202 `{pending:true}`.
- `index.html`: Erfolg erst bei bestätigter Speicherung anzeigen; bei Pending die Formulareinträge behalten, keine falsche Erfolgsmeldung.
- `test/lead-intake.test.js` mit lokalen Mock-Webhooks: confirmed/pending/upstream error/invalid input/origin; `npm test` hinzugefügt. **GitHub Actions ist erfolgreich gelaufen: 5 Tests bestanden, 0 fehlgeschlagen**, Workflow-Run `38587043087` (14.10.2026). Separater Browser-/Make-/Airtable-Gesamttest steht noch aus. Die Änderungen sind auf eigenem Branch, nicht live.
- In bereits vorhandenes **inaktives** Make-Website-Szenario `7774243` direkt NACH Airtable Modul 2 die `gateway:WebhookRespond`-Antwort Modul 5 eingefügt: `{"ok":true,"record_id":"{{2.body.id}}"}`. Im Make-Blueprint geprüft: Webhook → Airtable POST → WebhookRespond → zwei Gmail-Module. Kein Testversand ausgelöst, weiterhin inactive.

**Test-Sicherheitsstellung (14.10.2026, nach CI):** Im bereits inaktiven Website-Make-Szenario 7774243 wurden die Gmail-Module 3 und 4 zusätzlich explizit deaktiviert. Damit kann ein späterer synthetischer Website-/Webhook-/Airtable-Test keine automatische Kunden- oder interne E-Mail auslösen. Nach dem Test müssen beide Module mit separater Freigabe und Empfängerprüfung wieder aktiviert werden; das Szenario selbst bleibt bis dahin inactive. Aktueller GitHub-Actions PR-Test 5/5 grün; keine Live-Bereitstellung. Ein echter Webhook-zu-Airtable-E2E-Test wurde noch nicht ausgeführt.

**Nächste Prüfungen (keine Live-Mails vor Nutzerfreigabe):**

Status: **Draft PR #3** https://github.com/lszh-automations/lszh-automations-site/pull/3. In Make Szenario `7774243` wurde der Code-Modulschritt `6` nach Webhook `1` in die bestehende inaktive Pipeline eingefügt. Modul `6` validiert und erstellt per `JSON.stringify` sicheres Airtable-JSON, escapt HTML- und E-Mail-Betreff-Daten. Modul `2` übernimmt den JSON-String, Antwortmodul `5` bestätigt die gespeicherte Airtable-ID, Gmail-Module `3` und `4` greifen ausschliesslich auf die bereinigten Felder zu. Die neue Code-Modul-Logik liegt versioniert als `scripts/lead-sanitize.make.js` auf der Feature-Branch. 5/5 Node/Mock-Tests grün. **Ein realer Make-Code-Lauf mit Airtable-Persistierung wurde noch nicht durchgeführt; im Gesamtstatus NICHT als E2E bestanden markieren.**
1. Make-Roh-HTML und Airtable-JSON für Anführungszeichen, Zeilenumbrüche und HTML-Sonderzeichen absichern, damit Eingaben sicher verarbeitet werden.
2. Lokale `npm test`-Prüfung und Testformulardurchlauf mit eindeutigem synthetischem Lead und ausschliesslich erlaubten Test-Mailadressen; Airtable-Record-ID mit Serverantwort abgleichen.
3. Öffentliche Website-Sichtbarkeit, Datenschutz/Impressum, Antwort-E-Mail und Spam-/Duplikatschutz verifizieren.
4. Erst danach Branch gezielt in `main` übernehmen und Webseite/Make-Leadeingang ausdrücklich freigeben.

## Zweite Priorität – Offerte, Annahme und Onboarding

- Make `7835327`: Qualifizierter Lead → Offertenentwurf; inactive.
- Make `7835460`: Offerten-PDF und Versand, bereits mit `Echtbetrieb – kein Test=1` gefiltert; inactive.
- Make `7940261` & `7940220`: persönliche Annahmelinks und Annahmebeleg/Bestätigung; STAGING und inactive. Beide verlangen dokumentierte Online-Rechtsfreigabe und Archivnachweise.
- Make `7779983`: Annahme → Auftrag, inactive.
- Make `7777695`: Kunden-Onboarding Eingang, inactive.
- Make `7936151`: Make-Einrichtungsmail, inactive.
- Airtable-Angebotsliste beim Audit: 9 Datensätze mit Nummern TEST*, keine dokumentierte echte Live-Annahme im geprüften Ausschnitt. Onboarding: 4 Datensätze, überwiegend Tests.

**Blocker:** Rechtliche Annahmefreigabe samt Beleg-/Archivnachweis, ein vollständiger synthetischer Test von Offerte bis Onboarding und manueller Abgleich mit der eigenen Make-Organisation des Kunden.

## Dritte Priorität – Rechnung (keine weitere Testmodul-Flut)

- Swiss-QR-PDF via Render/Staging + Make `7951674`, kombinierte PDF/Kundenmail-Vorschau `7956264`: technische Tests inkl. QR-Lesbarkeit, externe SIX-Validierung synthetischer Daten, Archiv-Hash und Layout erledigt; Szenarien inactive.
- Produktions-Freigabevorprüfung `7956605`: bewusst `can_send=false`, inactive.
- TEST-Nummernregister 218620, Fehlertests `7958849`: nur Testumgebung und inactive.
- ALT-Rechnungsversand `7781492`: QR-Platzhalter, gesperrt, Gmail-Modul disabled; **niemals aktivieren**.
- Airtable Betriebskonfiguration: `Rechnungsversand freigegeben=false`.

**Für MVP genügt eine manuell freizugebende Rechnung mit kontrolliertem Einmalversand.** Nicht nötig für den ersten Kunden: vollautomatische Recovery aller neun Test-Errorhandler, automatisches Mahnwesen, automatischer Zahlungsabgleich oder komplexes Reporting.

## Abschluss-Checkliste

- [ ] Website-Eingang speichert wirklich und bestätigt nur verifizierte Datensätze.
- [ ] Kundenmail und CRM behandeln Freitext sicher, keine versehentlichen Empfänger.
- [ ] Offertenunterlagen, Versionen, rechtliche Annahme und PDF-Archive im E2E-Test korrekt.
- [ ] Kunden-Onboarding inkl. Make-Organisation/einladung durchlaufen.
- [ ] QR-Rechnung mit korrekten Rechtsträger-, UID-/MWST-, IBAN-, Kunden-, Betrags- und Fälligkeitsdaten freigegeben.
- [ ] Duplikatnummer, Anhang-Hash und Versand-Message-ID überprüft; bei unsicherer Provider-Rückmeldung kein automatisches Retry.
- [ ] Ein vollständiger End-to-End-Test eines fiktiven Kunden besteht; danach ausdrücklich einzeln über Go-Live entscheiden.
- [ ] Vor Live-Aktivierung eine begrenzte Rückfallstrategie und Support-Kontakt definieren.

## Sauberkeit

In Make wurden drei Labels eingeführt: `MVP – Prüfung vor Go-Live` (12 Szenarien), `TEST / STAGING – kein Versand` (11), `ALT / nicht aktivieren` (2). **Labels verändern die Ausführung nicht.** Bestehende Szenarien wurden nicht gelöscht oder produktiv aktiviert.

Das Dokument erteilt keinerlei rechtliche Abnahme. Eine Zeitangabe von 1–2 Wochen bleibt eine Schätzung unter Vorbehalt der Prüfungen und Freigaben.


## Tatsächlicher Make-Webhook → Airtable E2E-Test bestanden (14.10.2026)

Nach dem erfolgreichen CI-Test wurde **ein einziger synthetischer Testlead** durch den Original-Make-Website-Webhook und die aktuelle, inaktive MVP-Sicherheitslogik geschickt. Beide Gmail-Module in Website-Szenario `7774243` waren **explizit disabled=true** und blieben auch danach deaktiviert.

- **Einmaliger Testsender:** On-Demand-Make-Szenario `7960269` mit streng kontrollierter Testkennung `LSZH-MVP-LEAD-E2E-20261014-01`. Es erstellt die neun Websiteformular-Pflichtangaben, Uhrzeit/Quelle und sendet genau einen HTTP-POST als JSON an denselben Make-Webhook, den die Website nutzt. Testsender ist kein Ersatz für die noch unveröffentlichte `server.js`-Version.
- **Echter Make-Webhook-Durchlauf:** Execution `a51a71dfff3344f1a0e331d61330dde0`, Status `success`.
- **Testsender-Durchlauf:** Execution `fbd0a2e33ca54befb8a5264f2191f0bd`, Status `success`; HTTP-Antwort als erfolgreiche gespeicherte Airtable-ID ausgewertet.
- **Airtable tatsächlich geschrieben:** Base `appzJiskpAdaR1HEv`, `Leads` Tabelle `tbldBCMm9NlSQqcq5`, Testdatensatz `recq55ozKTWUvqo3u`. Quelle `LSZH Automations Website`; Status `Neu`; Firma `LSZH E2E "Sonderzeichen" GmbH`, Name `LSZH E2E Test <Max & Co>`, Empfängeradresse `lars@lszh-automations.ch`. Sonderzeichen `<b>HTML-Test</b>`, `&`, Anführungszeichen und mehrzeilige Inhalte wurden in Airtable **unverändert als Text** gespeichert. Testdaten ausdrücklich `NUR SYNTHETISCHER TEST – NICHT KONTAKTIEREN`.
- **Echter Speicherbeleg:** WebhookRespond lieferte die Airtable-ID `recq55ozKTWUvqo3u`; dieser genaue Datensatz wurde anschliessend separat mit Airtable gelesen und verifiziert.
- **Sicherheit:** Gmail-Module `3` und `4` blieben `disabled=true`. Website-Szenario `7774243` und Testsender `7960269` unmittelbar nach dem einmaligen Test wieder `inactive`; Webhook-Queue stand wieder bei `0`. Es wurde kein Kundenmail-, Offerten- oder Rechnungsprozess aktiviert.

**Was das noch NICHT beweist:** Die neue Website-`server.js`/`index.html`-Version liegt weiterhin nur in **Draft PR #3**, wurde also noch nicht durch den echten Render-Webserver oder eine echte iPhone-Browsersitzung getestet. Der E2E-Test beginnt *an der Make-Webhook-Grenze*, nicht am Browser. Die separate GitHub CI mit 5/5 Tests simuliert Browser→Server→Webhook-Antworten, aber keine reale Render-Bereitstellung. Vor Merge/Go-Live müssen Website-UI/Origin/Spam-/Duplikatfälle und Empfänger/Mail-Fehler geprüft werden. Original-CRM-Testdatensatz bitte als Test belassen oder kontrolliert archivieren.


## Browser- und Offertenentwurfs-Test (14.10.2026, weiterer MVP-Fortschritt)

**Browser in GitHub Actions:** Auf dem isolierten MVP-Feature-Branch wurde `@playwright/test` ergänzt, `playwright.config.js` eingerichtet und `test/browser/lead-form.spec.js` eingeführt. Der Test öffnet die wirkliche Website im **headless Chromium auf Desktop und mobiler Bildschirmgrösse** gegen den lokal gestarteten Node-Server und einen lokalen Webhook-Mock, füllt sämtliche Pflichtfelder aus und testet die UI-Situation nach (a) bestätigtem Airtable-Beleg, (b) Make-Pending und (c) upstream-Fehler. Die Formulardaten bleiben bei nicht bestätigter Speicherung bestehen. Kein Zugriff auf echte Kundenwebhooks und keine Kundenmails.

GitHub Actions **Run `38594061718` erfolgreich**: `npm test` (5/5 Node-Tests) und `npm run test:browser` (1 Playwright-Test mit Desktop- und Mobilansicht, **1/1 bestanden**). Die Browser-Prüfung ersetzt keinen echten iOS-Safari- oder produktiven Render-Deployment-Test.

**Echte synthetische CRM→Offertenentwurf-Verbindung:** Der bereits nachweislich über das Make-Website-Webhook gespeicherte synthetische Lead `recq55ozKTWUvqo3u` wurde ausschliesslich zu Testzwecken auf `Qualifiziert` gestellt; der existierende Make-Entwurfsprozess `7835327` (Webhook-unabhängiger Scheduler; **kein Gmail-Modul**) wurde kurz aktiviert und einmal manuell ausgeführt. **Make Execution `1e4d78431ba24de7a6fb65ac13a5819b` erfolgreich**, Szenario danach wieder **inactive**. Airtable `Offerten` enthält nun **Entwurf `recJQ13OAtv6iSafG`** mit Nummer `OFF-recq55ozKTWUvqo3u`, korrektem verknüpftem Lead, Ausgangssituation und Ziel. `Echtbetrieb – kein Test=false`; `Versand freigegeben=false`. Kein Dokument versendet, keine Vertragsannahme, keine Rechnung. Der Entwurf ist absichtlich unvollständig: Leistungsumfang, Preise, Zahlungsbedingungen und rechtliche Freigaben müssen vor PDF/Versand ergänzt werden.

**Noch ungelöster Go-Live-Blocker bei Online-Annahme:** Das inaktive Make-Szenario `7940261` hat in der Kundenmail einen Link `https://lszh-automations.ch/offerte-annehmen/?code=...`. Im aktuellen Website-GitHub-`main` konnte unter `offerte-annehmen/index.html` keine Datei gefunden werden; `server.js` definiert auch keine spezifische `/offerte-annehmen/`-Route. Die öffentliche URL liess sich bei der technischen Abfrage nicht verlässlich abrufen. **Das ist ein zu prüfender Deploy-/Routing-Befund, kein endgültiger Beweis, dass die Seite öffentlich fehlt**, da alternative Hostings möglich sind. **Elektronische Annahme NICHT aktivieren** bis Zielseite, persönliche Tokenprüfung, archivierte Vertragsversion und rechtliche Freigabe nachweislich zusammenpassen.

**Weiter zu erledigen für MVP:** Offerte vervollständigen → PDF ohne Kundensend testen → Annahmelink/Archivrückverfolgung ohne Vertragsabschluss prüfen → Onboarding anhand desselben fiktiven Kunden → manuelle Rechnung freigeben. Public-Website-Deployment, Gmail-Module und echter Vertragsabschluss weiterhin gesperrt.


## Offerten-PDF-Test und unerwartete Testmail (14.10.2026) – Sicherheitsbefund

Für den bestehenden synthetischen Lead `recq55ozKTWUvqo3u` wurde die Airtable-Testofferte `recJQ13OAtv6iSafG` mit fiktiver Anschrift (Testweg 1, 5610 Wohlen), ausdrücklich nur demonstrativem Umfang und CHF 2500 einmalig / CHF 499 monatlich vervollständigt; `Echtbetrieb – kein Test=false`, `Versand freigegeben=false`, `Online-Annahme rechtlich freigegeben=false`.

**Wichtig: Während des PDF-Vorschautests trat ein unerwarteter Versand auf.** Das bestehende Make-Szenario `7835460` wurde inaktiv belassen, bevor die Änderung erfolgte; seine Gmail- und Post-Send-Statusmodule `5` und `6` wurden auf `disabled=true` gesetzt. Für den einmaligen Test wurde die Suchformel temporär auf den einzigen synthetischen Datensatz begrenzt, die Vorlage mit einer auffälligen `TESTVORSCHAU – NICHT VERSENDEN – KEIN VERTRAG`-Kennzeichnung versehen und der PDF-Archivstatus für den Test als `TEST_VORSCHAU` statt `VERIFIZIERT` konfiguriert. Die Aktivierung löste unmittelbar einen automatischen Polling-Lauf aus. Ein zusätzlicher manueller `scenario_run` wurde als «already being executed» abgewiesen; **es wurde nicht noch einmal gestartet**.

Make-Execution `ef368c5d863d402385a76b317b6cbe62` **success**, Module 1,2,3,4,7,9,10,11,8 **UND trotz disabled Flag auch Modul 5 (Gmail) und Modul 6 (Airtable-Statusupdate)** liefen je einmal. Das ist der bestätigte Sicherheitsbefund. Make meldete die Mailoperation als erfolgreich und setzte den synthetischen Datensatz auf Status `Versendet` / `Versendet am 2026-10-14`. Der im Testoffer-Datensatz verknüpfte E-Mail-Empfänger war die **interne LSZH-Testadresse** `lars@lszh-automations.ch`, nicht ein externer Kunde. Separater Nachweis der tatsächlichen Postfachzustellung war über die hier verfügbare Gmail-Verbindung nicht möglich (Suche ohne Treffer); deshalb Versand als **von Make ausgeführt/gemeldet**, Zustellung **nicht unabhängig bestätigt** dokumentiert. Das Ereignis ist in der internen Airtable-Notiz der Testofferte ausdrücklich festgehalten. Keine rechtliche Freigabe oder elektronische Annahme.

Der erzeugte private PDF-Archivbeleg hat laut Airtable Datensatz die Drive-ID `14hOfZHVRsBbMBGJCc6ZoAFyKErM37GOp`, SHA-256 `759d06e3352f89522aa5e92d14c89175c0d384974d144073299291d47135bff2`, Archivstatus `TEST_VORSCHAU`. Das verwendete verbundene Google-Drive-Konto konnte dieses File nicht unabhängig öffnen (404) – vermutlich andere Berechtigung; nicht als eigene manuelle PDF-Sichtprüfung ausgeben. Der archivierte PDF-Schreibvorgang und Hash wurden jedoch vom Make-Workflow bestätigt.

**Sofortige Nachsicherung:** Das Angebotsszenario `7835460` wieder `inactive`; sämtliche temporären Test-Mappings, Doc-Titel, Filter der Suchstufe, PDF-Dateiname und Archiv-Testparameter auf Original zurückgestellt. Modul `5` erhielt zusätzlich einen zwingend unerfüllbaren Filter `0=1` (Name «SICHERHEITSSPERRE – KEIN OFFERTENVERSAND VOR FREIGABE»). Module `5` und `6` bleiben `disabled=true`, aber **diese disabled-Flags sind alleine kein ausreichender Sicherheitsnachweis**. Testofferten-Notiz wurde um das Ereignis ergänzt, die Wiedervorlage gelöscht; keine weiteren Mailtests oder Vertragsaktionen.

**Go-Live-Blocker:** Vor jedem echten Offer-Send muss die Verlässlichkeit von Szenario-/Modul-Disabled-Mechanismen, Sendegates, konkreten Empfängern, E-Mail-Provider-Ausgang und atomaren Versandstatus aktualisiert und mit gesicherter NICHT-Versand-Testmethode geprüft werden. Kein weiteres Aktivieren von `7835460` für Vorschau, solange das Sende-Modul Teil der Flow-Konfiguration ist; die nächste Vorschau muss physisch **ohne Mailmodul** erfolgen oder PDF ausserhalb dieses gemischten Szenarios entstehen. Ausdrückliche Go-Live-Freigabe erforderlich.


## Gemeinsamer Integrationszweig – 14.10.2026

**Zusammengeführt, NICHT live:** Der eigenständige sichere Offertenannahme-Branch `feature/secure-offer-acceptance-20261013` (Draft PR #1) und der sichere Lead-/Browser-Branch `feature/mvp-website-intake-safety-20261014` (Draft PR #3) wurden als gemeinsamer Stand `feature/mvp-integration-20261014` in **Draft PR #4** unter https://github.com/lszh-automations/lszh-automations-site/pull/4 integriert. Kein Merge nach `main` und kein Render-Deployment.

Hier existiert **die Annahmeseite tatsächlich als `offerte-annehmen/index.html`**, dazu die statische `/offerte-annehmen/`-Serverroute, die POST-Routen `/api/offer/preview`, `/api/offer/document` und `/api/offer/accept`, und `offerAcceptance.js`/`offerArchiveVerifier.js`. Der zuvor festgestellte fehlende Pfad bezog sich nur auf `main`; die Annahmeimplementierung war bereits auf dem separaten Feature-Branch vorhanden. Es wurde **keine** zusätzliche Vertragsannahme erfunden oder aktiviert.

Der integrierte `server.js` behält die gesperrte Annahmearchitektur und übernimmt die bestätigte CRM-Speicher-ID statt einer Webhook-ACK-Scheinbestätigung. `index.html` verwendet die getestete bestätigte/Pending-Formularanzeige. Beide ursprünglichen Modultest-Suiten und der Desktop-/Mobil-Chromium-Browsertest sind enthalten.

**GitHub Actions Nachweis:**
- Offer acceptance checks Run `38597898306` SUCCESS, 22 Node-Tests bestanden, 0 fehlgeschlagen.
- MVP Lead Intake Tests Run `38597898105` SUCCESS, Node-Tests und realer headless Chromium-Browsertest bestanden.
- Die Browsertests verwenden lokalen Node-Server und simulierte Make-Webhook-Antworten. Es wurde NICHT die produktive Domain oder ein echtes Online-Vertragsgeschäft getestet.

**Freigabesperren unverändert:** Annahme-Feature Flag `OFFER_ACCEPTANCE_ENABLED` bleibt aus, juristisch genehmigte Projektbedingungen v1.0 liegen gemäss eigenem Staging-Freigaberegister noch NICHT vor, Drive-Read-Servicekonto und echte PDF-Archiv-/Token-/Signaturprüfung müssen vor Live-Einsatz nachgewiesen werden. Make Link- und Annahmeszenarien `7940261`/`7940220` bleiben inactive. Offerten-Sendeszenario `7835460` wegen des festgehaltenen überraschenden internen Testmail-Vorfalls zusätzlich am Gmail-Modul mit dauerhaft unerfüllbarer Filterbedingung `0=1` gesperrt.

**Nächste tatsächlich verkaufsnotwendige Aufgaben:** Juristisch und geschäftlich freigegebene Projektbedingungen/AVV (keine automatische rechtliche Freigabe), produktiv geprüfte Dokumentenarchive und Berechtigungen, isolierter Portal/Drive E2E-Test mit synthetischem Kunden, Onboarding desselben Kunden ohne produktive E-Mail, manueller QR-Rechnungs- und Versandfreigabeprozess. Erst danach eine ausdrückliche Entscheidung über Go-Live.


## Geschütztes Annahmeportal: Browser-Sicherheitsprüfung (14.10.2026)

Das gemeinsame MVP-Staging (GitHub Draft PR #4) wurde um `test/browser/offer-portal.spec.js` erweitert. Der Playwright-Test startet den **lokalen** Node-Webserver, öffnet `/offerte-annehmen/?demo=1` in headless Chromium in Desktop- und Mobilansicht und prüft:

- Nur die ausdrücklich unverbindliche Muster-Offerte wird angezeigt; der Verbindlich-Annehmen-Button ist deaktiviert.
- PDF-Links lösen im Demomodus **keine** `/api/offer/document`-Anfrage und keinen echten Dateidownload aus.
- `POST /api/offer/preview`, `/api/offer/accept` und `/api/offer/document` verweigern bei `OFFER_ACCEPTANCE_ENABLED=false` konsequent mit HTTP 503 `not_available`; weder Airtable- noch Drive-/Make-Zugriff nötig.
- Die Annahmeseite erhält `Cache-Control: no-store`, `X-Robots-Tag: noindex` und `Referrer-Policy: no-referrer`.
- Persönliche Token und der Demo-Query-Parameter werden nach dem Lesen aus der Browseradresszeile entfernt.

**Gefundener und behobener Bug:** Der generische `send()`-Handler von `server.js` überschrieb zuvor die für `/offerte-annehmen/` gesetzte `Referrer-Policy: no-referrer` mit `strict-origin-when-cross-origin`. Im Integrationszweig setzt `send()` jetzt `res.getHeader('Referrer-Policy') || 'strict-origin-when-cross-origin'`, behält also die strengere Sicherheitseinstellung des geschützten Portals.

**Verifizierte letzte CI-Läufe:**
- `38599038707` – Offer acceptance checks: SUCCESS, 22 Unit-Tests bestanden.
- `38599038390` – MVP Lead Intake Tests: SUCCESS, Unit-Tests bestanden und **2/2** Playwright-Browsertests (Website-Anfrage und Offertenannahme; jeweils Desktop/Mobil) bestanden.

**Geschäftliches Vertragsarchiv noch nicht End-to-End geprüft:** Die in der Projektdokumentation angegebenen geschäftlichen Google-Drive-Archivordner `1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in`, `1COIjnGZDK1XCPXNBNikHw-7eUKfjNXgU` und `1o9ADwrIAuhEtP7Mv7tDCY9-OkNpCxX3I` gaben über den in ChatGPT aktuell verbundenen Google-Drive-Zugriff jeweils HTTP **404**. Das belegt **nur einen fehlgeschlagenen Zugriff mit genau dieser Verbindung**; es beweist weder, dass die Ordner tatsächlich fehlen, noch, dass die separate Make-Geschäftskonto-Verbindung nicht funktioniert. Vor realer Annahme Berechtigungen mit dem richtigen Geschäftskonto und dem explizit befugten Read-only-Servicekonto verifizieren; keine privaten Dokumente öffentlich stellen. Bei den fiktiven Belegen liegen zudem nur Vorschau-/Teststatus und nicht freigegebene Projektbedingungen vor.

**Weiterhin KEINE Freigabe:** Juristisch genehmigte Vertragsbedingungen v1.0 fehlen laut bestehendem Freigaberegister; Projektbedingungen RC1 und AVV RC1 sind Entwürfe. Der echte geschäftliche Annahmelink darf weder versendet noch die produktive Annahme aktiviert werden. Keine Änderungen an `main`, keine Vertragsannahme, keine Kundenmail.
