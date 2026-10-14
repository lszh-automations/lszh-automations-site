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

## Google-Drive-Konten und Vertragsarchiv – Zugriffstest 14.10.2026

**Technischer Status: Eine geschäftliche, bearbeitungsgesperrte Test-Offerten-PDF ist nachweislich über Make erreichbar. Der produktive Vertragsabschluss bleibt deaktiviert.**

### Zwei getrennte Google-Drive-Berechtigungsbereiche

1. Das mit ChatGPT verbundene Google Drive ist aktuell das **private Konto** \`lars.schulthess10@gmail.com\`. Es besitzt den privaten Ordner \`LSZH Vertragsarchiv – STAGING (nicht produktiv)\` (ID \`1_1jVIlD2MAwkVxpTsCUIZ-14LjQggmA3\`). Dessen Unterordner sind \`Offerten-PDF\` \`1a2GIXQ9hnLP27PQHZCdLBh2wLevvf9jN\`, \`Projektbedingungen\` \`1L6lESMSB0CFjZtgZ6vZaAl3zB-iNdI0M\` und \`Annahmenachweise\` \`1I0PA-oMOTYUzA-q16frxnLbTUTiw9DlA\`. Alle gehören dem privaten Account und haben **keine Freigaben** an weitere Konten oder die Öffentlichkeit. Projektbedingungen- und Annahmeordner sind leer. Ein fiktiver Test-PDF-Beleg \`1ZVFEASOJEvOfO3R6QcXxrbo4M4JxgrZL\` liegt im privaten Test-Unterordner. Die **historisch zuvor versuchten drei Ordner-IDs** waren keine IDs aus diesem Staging-Freigaberegister; ihre 404-Antworten sind für den Geschäftsaccount nicht aussagekräftig.
2. Die vorhandenen Make-Szenarien \`7940220\` und \`7940261\` verwenden die **geschäftliche** Google-Drive-Verbindung \`11904271\` für \`lars@lszh-automations.ch\`. Dieser Verbindungsstatus ist \`ok\`. Ein echter Leseversuch ist am 14.10.2026 gelungen und macht den früheren Hinweis "invalid refresh token" für *diesen* Zugriff hinfällig.

### Read-only Live-Prüfungen ohne Kundenaktion

Vorhandenes Make-On-Demand-Szenario \`7941848\` (nur \`StartSubscenario → google-drive:getAFile → ReturnData\`) jeweils kurz aktiviert, gelesen und sofort wieder deaktiviert, keine Gmail- oder Schreibmodule.

- Ursprünglicher Test auf Geschäftskonto-Datei \`1m8ayt5kbffbHyA9u11pABrfSJRZ4vQfq\`: **SUCCESS**, Execution \`6ec41eeea2a543f7b266143746a6bfd3\`, 630 Bytes, SHA-256 \`c7694e7a617af93059204f790bcf9f306b8d3fa3c5a15e6a4f352a2abf6366c4\`.
- Geschäftliche Testofferten-PDF \`14hOfZHVRsBbMBGJCc6ZoAFyKErM37GOp\`: **SUCCESS**, Execution \`9eb6438c03144cdfae0fec8aa5bb8373\`, Name \`TEST_NICHT_VERSENDEN_Offerte_OFF-recq55ozKTWUvqo3u.pdf\`, \`application/pdf\`, **69'771 Bytes**, SHA-256 \`759d06e3352f89522aa5e92d14c89175c0d384974d144073299291d47135bff2\` = genau der Airtable-Wert der Testofferte \`recJQ13OAtv6iSafG\`. Die Make-Dateimetadaten bestätigten \`contentRestrictions: readOnly=true\`, **owner \`lars@lszh-automations.ch\`**, \`shared=false\`, keine \`anyone\`-Berechtigung. Das ist ein belastbarer Nachweis der geschäftlichen Test-PDF mit Integritäts- und Bearbeitungsschutz.
- Dieselbe geschäftliche Make-Verbindung konnte die nur privat vorhandene Test-PDF \`1ZVFEASOJEvOfO3R6QcXxrbo4M4JxgrZL\` **nicht** lesen: erwarteter \`404 File not found\`, Execution \`09cd375cba8e487294477d9e82dcf5d5\`. Das bestätigt, dass die Konten nicht dieselben Leserechte haben. Die Datei ist nicht als verschwunden anzusehen.
- Nach den Diagnoseversuchen wurde \`7941848\` auf **ursprüngliche Datei-ID** \`1m8ayt5kbffbHyA9u11pABrfSJRZ4vQfq\` zurückgesetzt und ist **inactive**. Keine Freigaben wurden verändert; keine Mail, Rechnung oder Vertragsannahme.

### Verbindliche Architekturentscheidung für den ersten Kunden

Für den zukünftigen Vertragsworkflow **nur geschäftlich verwaltete, private Drive-Archivordner** als eine führende Quelle verwenden. **Nicht** versehentlich IDs aus dem privaten Staging-Archiv in die geschäftliche Make-Verbindung mappen und **keine** öffentliche Linkfreigabe als Berechtigungs-Workaround aktivieren. Der ausstehende Dienstkontozugriff soll minimaler **Leser auf den zwei endgültigen PDF-Artefakten bzw. genau ihrem geschäftlichen Archivordner** sein, nicht Editor und nicht pauschal auf das ganze Drive.

Vor Go-Live nachweisen:
1. Endgültige, juristisch/geschäftlich **freigegebene Projektbedingungen v1.0** und ausgefüllte AVV-Anlagen als separate echte PDFs, mit Versionsbezeichnungen und Hash; Entwürfe **nicht** als genehmigt markieren.
2. Beide PDFs im selben geschäftlichen Archiv hinterlegen, **nicht öffentlich**, SHA-256 und \`contentRestrictions.readOnly=true\` für beide belegen.
3. Eigenes Google-Dienstkonto (E-Mail des tatsächlich eingerichteten Servicekontos), gezielte Read-only-Freigabe im Geschäftskonto und separater Echttest des in \`offerArchiveVerifier.js\` verwendeten \`OFFER_DRIVE_SA_B64\` über Render-**Secret**. Eine OAuth-Make-Verbindung ist **nicht** gleich dem Dienstkonto und beweist dessen Zugriff nicht.
4. Die Airtable-Felder der jeweiligen echten Offerte (Drive-IDs, SHA-256, freigegebene Version, \`VERIFIZIERT\`, letzter Prüfzeitpunkt, rechtliche Freigabe) erst nach diesen echten Nachweisen befüllen.
5. \`OFFER_ACCEPTANCE_ENABLED=false\` und Make-Szenarien inaktiv belassen; zusätzlich den Offertenversand wegen des dokumentierten internen Testmail-Vorfalls mit dem \`0=1\`-Filter gesperrt lassen. Vor Kundenversand und echtem Vertragsabschluss explizite menschliche Freigabe.

**Limitation:** Der Geschäftskonto-Drive-Test verifiziert Zugang über Make OAuth und eine bereits vorhandene **synthetische** Offerte. Es ist **kein** Servicekonto-, finale-Bedingungen-, vollständiger Online-Annahme- oder juristischer Freigabetest.

## RC1 Freigabeunterlagen & Dienstkonto-Preflight (14.10.2026)

**Erledigt / STAGING only:** Bestehendes privates Freigaberegister in Google Drive (ID \`1ANPIYiKzLIg_yxKifhy5lZHQe0zIwfo2yD2Ll69fhtw\`) und GitHub-Vertragsannahme überprüft. Im verbundenden privaten Google Drive, dem Projekt-/Library-Dateisuchbereich und den zugänglichen GitHub-Quellen waren die ursprünglichen drei RC1-Word-/PDF-Dokumente **nicht als Volltext auffindbar**. Die alten, nur in früherer Chat-Ausgabe sichtbaren Dateinamen gelten **nicht als zugänglicher Dateiinhalt**. Die tatsächliche Klausel-für-Klausel-Prüfung ist damit BLOCKIERT und darf nicht als erfolgreich behauptet werden.

Als Ersatz für unbegründete Klauselkorrekturen wurden **zwei sauber eingegrenzte Arbeitsunterlagen** in diesem Draft-Branch erstellt:
- \`docs/mvp/freigabeakte-projektbedingungen-avv-rc1.md\`: RC1-Stand aus dem Register, Quellen-/Lückengrenzen, geschäftliche D1–D8-Entscheidungen, AVV-Anlagen A/B/C, Rechts- und Konsistenz-Checkliste, Freigabegates. Ist KEINE rechtlich genehmigte Vertragsfassung. Das Review-Paket als Word/PDF im aktuellen Gespräch bereitgestellt.
- \`docs/mvp/servicekonto-drive-readonly-setup.md\`: Geschäftskonto-/privates-Drive-Trennung, Reader-Berechtigungen für dediziertes Servicekonto, Secret-/Key-Schutz und nichtproduktive echte Smoke-Test-Anleitung.

**Technisch:** Neues Script \`scripts/check-offer-service-account.js\` als einmaliger lokaler/isolierter **READ ONLY**-Vorprüfungsschritt. Es prüft strikt \`OFFER_ACCEPTANCE_ENABLED!==true\`, formale PDF-ID & SHA256, Vorhandensein des Secrets \`OFFER_DRIVE_SA_B64\` und ruft \`offerArchiveVerifier.pdf\` auf. Das erzwingt gültige Google-Dateimetadaten, aktive ContentRestriction \`readOnly\`, Hash und die tatsächlich abgerufenen PDF-Bytes. Es kann niemals einen echten Vertrag freigeben, Mail senden oder Airtable bearbeiten; Rückgabe \`contract_approved:false\`. In \`test/service-account-preflight.test.js\` wurden vier zusätzliche Testfälle für gültigen Mock, fehlende Credentials/IDs, aktives Flag und manipulierte PDF eingebaut. **Kein** echter Servicekonto-Login, keine neuen Google Berechtigungen/Keys/Render Secrets erzeugt.

**CI erfolgreich:** GitHub Actions Runs \`38602648819\` und \`38602648558\` SUCCESS: **26 von 26 Node-Tests**, zusätzlich **2 von 2 Chromium-Browsertests** bestanden. In diesem CI werden Drive-/OAuth-Antworten simuliert; reale Make-Business-OAuth-Prüfung der früheren synthetischen Test-PDF ist unabhängig bereits nachgewiesen, aber ersetzt **keinen** Google-Cloud-Servicekonto-Test.

**Render-Befund:** \`lszh-automations-site\` (\`srv-db1r13ad0e5s7390tcr0\`) läuft von \`main\` mit automatischem Deploy; \`lszh-swiss-qr-staging\` (\`srv-db7cn5q5b2lc73fecb1g\`) folgt einer separaten QR-Staging-Branch und deployed nicht automatisch. Der neue Acceptance-Code ist ausschließlich im Draft PR #4, **nicht** im Render-Live-Hauptzweig; die Dienstkonto-Secrets und die Google Cloud IAM-Berechtigungen sind über die hier verfügbaren Render-APIs **nicht lesbar**, daher nicht als gesetzt / nicht gesetzt behaupten. Keine Produktionssettings wurden geändert.

**Offene externe Entscheide:** Drei originale RC1-Dokumente für echten Klauselabgleich zugänglich machen; Geschäfsentscheidungen zu Care 30 Tagen Monatsende, Abnahme 10 Arbeitstagen ohne Schweigeabnahme und CHF 2'000-Haftungsuntergrenze schriftlich treffen; juristische Endkontrolle; AVV je Kundentätigkeit mit A/B/C befüllen; dediziertes Dienstkonto im geeigneten Google-Cloud-Projekt autorisieren, mit minimalem read-only auf geschäftliche Test-PDF und später beide genehmigten PDFs. Freigabeansicht/Sendevorgang erst mit eigenständiger, dokumentierter menschlicher Entscheidung.

**Sicherheitszustand:** Draft PR #4 bleibt ungemergt, \`OFFER_ACCEPTANCE_ENABLED\` nicht eingeschaltet, Sendeszenarien inactive, Offerten-Mailmodul durch \`0=1\` blockiert, globale Airtable-Rechnungsversandfreigabe FALSE. Keine Annahme, keine E-Mail, keine Rechnungsaktivierung.
