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
