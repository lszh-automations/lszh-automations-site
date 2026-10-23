# LSZH Automations – CRM V2: Übergabe für neuen Chat

**Stand:** 23.10.2026. Diese Datei ist der **aktuelle operative Übergabestand** und ergänzt ältere, teils überholte chronologische Einträge in `docs/LSZH_AUTOMATIONS_PROJEKTSTAND.md`. Bei Widersprüchen gelten die neueren bestätigten Live-Ergebnisse. Keine Passwörter, Token oder Webhook-URLs in diese Datei schreiben.

## Kurzfazit und verifizierte Freigaben

**LSZH CRM V2 läuft produktiv.** Letzte vom Geschäftsführer per PowerShell-Ausgabe bestätigte erfolgreiche Bereitstellung:

- `CRM OFFER PDF AND MAIL DESIGN LIVE PASS`
- Cloud Run: `lszh-crm-v2`, Projekt `lszh-automations`, Region `europe-west6`
- **Live Revision: `lszh-crm-v2-00038-gic` (100 % Traffic)**
- Rollback-Revision: `lszh-crm-v2-00036-ret`
- Bisheriger E-Mail-Cutoff unverändert: `2026-10-23T16:15:28Z`
- CRM-URL: `https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app`
- Produktiver Lead-Eingang: Render Website → Cloud Run → Firestore mit Namespace `lszh_crm_v2_`. Ein Airtable-Import wurde ausdrücklich **abgewählt**.
- GitHub: `lszh-automations/lszh-automations-site`, Arbeitsbranch `feature/crm-v2-cloud-staging-20261023`.
- Windows Checkout: `C:\Users\larss\Projects\lszh-crm-cloud-staging`.
- CI für die zuletzt ausgerollten Vorlagen: **81/81 Tests bestanden**, plus PowerShell-Parserprüfung.

## CRM-Funktionen und geschäftliche Entscheidungen

- CRM-Register Dashboard, Website Leads, Offerten, Kunden, Projekte, Rechnungen. Google-Login; bestehender Kontaktverlauf, Follow-ups, Qualifizierung und automatische Erstellung einer fortlaufend nummerierten Offerte bei Lead-Qualifizierung.
- **Offerten-PDF und Kunden-E-Mail:** neues freigegebenes LSZH-Design ist mit Revision `00038-gic` produktiv. Separate Einmal-/Monatsbeträge, Schweizer Daten, Firmenanschrift `LSZH Invest GmbH, Rummelmatt 8, 5610 Wohlen AG`, UID `CHE-369.474.125`, Kontakt `info@lszh-automations.ch`.
- **MWST:** Der Geschäftsführer hat ausdrücklich bestätigt, dass LSZH Invest GmbH **nicht MWST-registriert** ist. Keine MWST-Beträge, kein fiktiver Steuersatz, UID ohne Zusatz `MWST`. Die Vorlagen erklären das. Bei Änderung der Registrierung anpassen.
- **Offerten-Versand:** aktiv, aber ausschliesslich nach manuellem CRM-Klick und ausdrücklicher Versandbestätigung. Offerte muss auf `Bereit` stehen, korrekte Empfängeradresse, positive Position und gültiges Gültigkeitsdatum enthalten. Make/Gmail-Receipt wird überprüft; danach Status `Versendet`, Versanddaten und Nachfasstermin. Bei uneindeutiger Provider-Antwort keine automatische Wiederholung, sondern manuelle Prüfung.
- **Make-Szenario Offerten-PDF:** ID `8144117`, `LSZH CRM V2 – Offerten-PDF (Produktiv, manuell)`. Letzte Connector-Prüfung: Szenario aktiv, Gmail-Verbindung `ok`, Filter erwartet `kind=offer_send`, `sendMode=production`, passende `offer_send_`-Event-ID, Betreff `Ihre Offerte Nr.`, E-Mail-Empfänger und `.pdf` im Anhangnamen.
- Bestehender Cloud-Scheduler `lszh-crm-v2-mail-tick` (Lead-Kundenbestätigung, interne Neumeldung, 24h-Erinnerung) wurde durch den Offerten-Release **nicht verändert**.
- **Keine automatische Auftragsannahme:** Die Beauftragung/Online-Annahme ist nicht freigegeben; Versand und Auftragserteilung sind zwei getrennte Prozesse. Die Offerte und Mail verwenden einen Unverbindlichkeits- und schriftlichen Bestätigungsvorbehalt. Rechtliche Wirksamkeit gegenüber Kunden und Geschäftsbedingungen bei Gelegenheit fachlich prüfen.
- Keine echten Kunden-E-Mails oder Vertrags-/Rechnungsversände ohne bewusste manuelle Freigabe. Keine unnötigen zusätzlichen Make-Szenarien; Ziel: produktiver, fokussierter KMU-Betrieb.

## Nächster Entwicklungsschritt: Rechnungsmodul + Swiss QR

**Die nächste priorisierte Aufgabe** ist das produktive Rechnungsmodul mit professioneller, aus gespeicherten Rechnungsdaten generierter PDF und regelkonformer Schweizer QR-Rechnung. Bis zur Abnahme mit synthetischen Daten arbeiten, keine echten Rechnungen verschicken.

Bereits vorhanden (aus Repository-Code, 23.10.2026):

- `crm-v2/invoice-pricing.js`: Rechnungspositionen, CHF-Summen in Rappen; keine fiktive Steuer; Rechnung ist bei `Bezahlt`/`Storniert` gesperrt.
- `crm-v2/invoice-preview.js` und `crm-v2/public/invoice-preview.html`: HTML-/Druckvorschau mit nummerierter Rechnung, Kunde, Leistungspositionen und Terminen. **Das ist noch keine fertige Swiss-QR-PDF.**
- `crm-v2/cloud-records.js`: Die Rechnungserstellung verwendet die fortlaufende Sequenz `invoice` und Nummern `RE-<Nummer>`, beginnend bei 1000 im gewünschten leeren Live-Bestand; Statusmodell `Entwurf`, `Offen`, `Bezahlt`, `Storniert`.
- `crm-v2/public/index.html` enthält Rechnungseditor und Vorschau/Print-Button, aber **noch keinen nachgewiesenen produktiven PDF-Mailversand mit Swiss QR**.

Empfohlene Reihenfolge:
1. Live-/Repo-Ist-Zustand und den aktuellen Projektstand kurz erneut prüfen; zwischen historischer Planung und live bestätigten Ergebnissen unterscheiden.
2. Rechnungs-PDF im bestehenden LSZH-Design entwickeln; Rechnungsempfänger, Rechnungsnummer, Rechnungsdatum, Fälligkeit, Einzelpositionen, Betrag CHF, Firmenanschrift und den korrekten **Nicht-MWST-Hinweis** aufnehmen.
3. Swiss QR nach gültigen SIX-Spezifikationen ergänzen, mit synthetischer IBAN und Empfängerdaten testen. **Produktive Firmen-IBAN wurde noch nicht bestätigt:** niemals erraten, echte QR-Rechnungen mit produktiver Zahlungsadresse bis zur Bestätigung blockieren.
4. Nummern und Bezahlstatus erhalten; Zahlung zunächst manuell und nachvollziehbar erfassen. Erst danach einen eigenständigen, manuell freigegebenen Rechnungsversand planen.
5. Tests, PDF-Layoutkontrolle, kein produktiver Versand während der Entwicklung, Deployment mit 0%-Kandidat und überprüfbarem Rollback.

## Technische Startpunkte für Fortsetzung

- Operative Übergabe: `docs/LSZH_CRM_V2_HANDOFF_20261023.md` (diese Datei)
- Historische Projektdokumentation: `docs/LSZH_AUTOMATIONS_PROJEKTSTAND.md` (chronologisch, ältere Abschnitte nicht als aktuellen Live-Status lesen)
- Offerten-PDF: `crm-v2/offer-pdf.js`, Kundenmail `crm-v2/offer-mail.js`, Versand `crm-v2/offer-send.js`
- Rechnungs-Code: `crm-v2/invoice-pricing.js`, `crm-v2/invoice-preview.js`, `crm-v2/public/invoice-preview.html`, `crm-v2/cloud-records.js`
- Produktive Tests: `npm test --prefix .\crm-v2`.
- Bisheriges erfolgreiches Offerten-Release: `scripts/deploy-crm-offer-design-no-vat-live.ps1`, **nicht nochmals ausführen** (erwartet die vorherige Revision `00036-ret`).

## Für den nächsten Chat

> VAMOS – Wir setzen LSZH Automations CRM V2 direkt fort. Lies zuerst die GitHub-Datei `docs/LSZH_CRM_V2_HANDOFF_20261023.md` und dann `docs/LSZH_AUTOMATIONS_PROJEKTSTAND.md` im Repo `lszh-automations/lszh-automations-site`, Branch `feature/crm-v2-cloud-staging-20261023`. Der letzte bestätigte Live-Stand ist `lszh-crm-v2-00038-gic` (100 %), mit freigegebenen Offerten-PDFs und Mails ohne MWST. Bitte als Nächstes das CRM-Rechnungsmodul inkl. Swiss-QR-Rechnung mit synthetischen Daten umsetzen; keine echten Mails/Rechnungen versenden, ohne mich ausdrücklich zu fragen. Beachte weiterhin zentrale Dokumentation, Live-Isolation und Rollback.


## Fortsetzung im selben Chat am 23.10.2026 – QR-Rechnungsmodul im Entwicklungsbranch

Im Branch `feature/crm-v2-cloud-staging-20261023` wurden `crm-v2/swiss-qr.js`, `crm-v2/invoice-pdf.js`, ein authentifizierter und standardmässig gesperrter PDF-Download, der Swiss-QR-PDF-Button im Rechnungseditor, npm-Abhängigkeiten sowie synthetische Tests hinzugefügt. **Nicht produktiv deployed.** QR-Payload isoliert geprüft (31 Felder, NON, CHF und strukturierte Adressen). Laufzeittests mit pdf-lib/qrcode, visueller PDF- und SIX-Prüfung stehen noch aus. Neue Tests dürfen nicht mit den alten 81/81 verwechseln.

**Release-Gates:** `CRM_INVOICE_QR_ENABLED=true`, produktiv zusätzlich `CRM_INVOICE_PRODUCTION_APPROVED=true`, sowie die noch nicht bestätigte Bank-IBAN als `CRM_INVOICE_IBAN`. Diese Gates bleiben absichtlich ungesetzt. Kein Kundenmail-/Rechnungsversand implementiert. Siehe Nachtrag in `docs/LSZH_AUTOMATIONS_PROJEKTSTAND.md` für Details. Nächste Aufgabe: echte Build-/PDF-/Reader-Tests im isolierten Staging, SIX-Validierung, Layoutprüfung und 0%-Deployment ohne Produktiv-Release.


**QA-Nachtrag (23.10.2026):** Neues rein synthetisches Smoke-Fixture `crm-v2/scripts/invoice-qr-smoke.js` erzeugt ein internes Test-PDF aus Beispiel-IBAN und Fake-Kunde. CI-Workflow `.github/workflows/crm-v2-invoice-qr.yml` ist auf Entwicklungsbranch und Draft-PR beschränkt: installiert CRM-Abhängigkeiten, führt die CRM-Suite aus, prüft A4 und den Nicht-MWST-Text, rendert das PDF mit Poppler und versucht unabhängiges QR-Decoding mit OpenCV sowie Feldvergleich. **Workflow geschrieben, Ergebnis noch NICHT bestätigt; kein PASS behaupten.** Alle produktiven Betriebs-Gates bleiben deaktiviert.


### QR-Rechnung QA (23.10.2026, 23:40 MESZ) – erfolgreich im isolierten Render-Build, OFFIZIELLE SIX-PORTALPRÜFUNG OFFEN

- **IBAN neu durch Geschäftsführer angegeben:** Format CH/LI mit 21 Zeichen, Modulo-97-Prüfsumme **1**, reguläre IBAN (QR-IID nicht 30000–31999). Ausschliesslich die letzten vier Ziffern `2002` zur Wiedererkennung dokumentiert. **IBAN nicht als Konstante in GitHub oder QA-Umgebungsvariablen hinterlegt.** Rechtliche Inhaberschaft «LSZH Invest GmbH» nicht durch Bankbeleg überprüft.
- SIX-Primärquelle: `https://www.six-group.com/de/products-services/banking-services/payment-standardization/standards/qr-bill.html`, aktuell IG QR-Bill **v2.3**, v2.4 erst ab 14.11.2026 (CHF keine technischen Änderungen). Pflichtbegriffe gemäss Annex C auf `Zahlteil`, `Währung`, `Zusätzliche Informationen` korrigiert; irrtümlich bis in den QR-Zahlteil laufende allgemeine Seitenfusszeile entfernt. Die Zahlteil- und Empfangsscheinabmessungen sind 148 x 105 mm und 62 x 105 mm, QR 46 x 46 mm und mit Fehlerkorrekturlevel M. Bei Papierausgabe ist passende Perforation nötig. Die technische QR-Datei-Konformität ist nicht identisch mit einer gedruckten Abnahme.
- **Tatsächlicher Render-Build nach Korrektur** `dep-dbdt7mcipgvc73a26r2g` (GitHub-Commit `844187d749cae0a16a43aac6d3ff0f81110d01d8`): **86/86 CRM-Tests bestanden**, synthetische PDF generiert (13'152 Byte), optische PDF-Prüfung mit PyMuPDF + OpenCV **PASS**: A4, 31 QR-Felder, erwartete Test-IBAN (nicht Firmen-IBAN), Betrag CHF 499.90, Referenztyp NON, Empfänger, Label/Sprache und kein MWST-Ausweis. Diese Tests machten keine echten Kundenkontakte und verbuchten nichts.
- Erstes Build `dep-dbdt6olg1s2s73b0onv0` scheiterte an nicht aktualisierten bisherigen HTTP-Testmocks (frühes `require('./invoice-pdf')`). Durch einen verzögerten Import im tatsächlich authentifizierten PDF-Endpoint behoben; das zweite Build ist grün.
- **Isolierte Render-QA-Serviceinstanz** `srv-dbdt6o5g1s2s73b0on0g`, `lszh-crm-v2-qr-qa-20261023`, Region Frankfurt, Kostenplan free, Branch `feature/crm-v2-cloud-staging-20261023`, AutoDeploy **no**. Ausschliesslich Staging-Prefix, Website-Intake, CRM Mail, Offer-Mail und Rechnungspdf-Export **ausgeschaltet**. Kein OAuth-Client und keine produktiven Secrets eingerichtet. Diese Instanz ist **nicht** der produktive Cloud-Run-CRM-Dienst. Update der Deploy-Finalstatus anhand Render getrennt prüfen; erfolgreicher Build heisst noch nicht zwingend `live`.
- **SIX offizielles Portal** `https://validation.iso-payments.ch/qrrechnung`: vom SIX-Webauftritt gefunden, aber öffentliches Portal verlangt interaktives JavaScript/Log On; es wurde **keine Testdatei hochgeladen** und keine portalgestützte Abnahme erteilt. Technische Prüfung gegen veröffentlichte IG v2.3 und optisches unabhängiges Decoding bestanden; Portal-Prüfung weiter offen.
- Vor produktivem Rechnungs-PDF: Eigentümername/Bankunterlagen zur Firmen-IBAN plausibilisieren, finalen PDF-Druck im Originalmassstab kontrollieren, SIX-Portal mit synthetischem PDF-QR-Code/Textfile prüfen, 0%-Cloud-Run-Kandidat erstellen und explizite Freigabe des Geschäftsführers einholen. **Kein** produktiver Rechnungsversand und keine Änderung `lszh-crm-v2-00038-gic`.


**Render-QA Deployment-Abschluss (23.10.2026, 23:40 MESZ):** Service `srv-dbdt6o5g1s2s73b0on0g` / `https://lszh-crm-v2-qr-qa-20261023.onrender.com` ist laut Render-Deploy `dep-dbdt7mcipgvc73a26r2g` **LIVE** (Status `live`, `finishedAt=2026-10-23T21:39:58Z`). Build: `86/86 tests PASS`; generierte Test-PDF 13'152 Bytes; **PyMuPDF + OpenCV optical scan PASS** mit den 31 erwarteten Feldern und Layout-Texten. Render-Appstart `LSZH CRM V2 Cloud listening on 10000`. **Bedeutung von LIVE:** ausschliesslich das separate, nicht für Kunden freigegebene Render-QA-System, **nicht** die produktive Cloud-Run-Anwendung. Kein automatisches Deploy, keine CRM-Mails, keine produktive IBAN, kein Rechnungs-PDF-Download im QA-Dienst freigeschaltet. Der externe Read-only-Webcheck der QA-URL war aus dem verfügbaren Werkzeug nicht abrufbar; deshalb dessen HTTP-Antwortstatus nicht als extern verifiziert deklarieren. Offizielle SIX-Portalprüfung bleibt offen.


### SIX-Testartefakte vom 23.10.2026 (Benutzer-Upload und CRM-gemässer NON-Test)
- Vom Benutzer in Chat hochgeladen: `LSZH_SIX_Validierung_SYNTHETISCH.png` und gleichnamige TXT, **31 Felder, QR optisch mit OpenCV auslesbar, PNG-Daten exakt identisch mit TXT, synthetische IBAN-Prüfziffer korrekt, SCOR-Referenz-Prüfziffer korrekt**. PNG/TXT benutzen `SCOR`, `Musterfirma AG`, CHF 1'250.00 und sind **nicht** der aktive CRM-V2-Rechnungsgenerator (`NON`). Das Bild des SIX-Portals zeigte nur `Validierung abgeschlossen`, **keinen Ergebnisbericht mit konkretem PASS/Fehleranzahl**. Keinerlei offizielle SIX-Konformitätsfreigabe behaupten.
- Für den SIX-Test des aktuellen CRM-V2-Schemas zusätzlich temporär im Chat angefertigt: `LSZH_CRM_V2_SIX_TEST_ONLY_NON.txt` und `.png`: `SPC/0200/1`, `LSZH Invest GmbH`, Rummelmatt 8, synthetischer Debitor `TEST_ONLY Musterfirma AG`, CHF 499.90, `NON`, leere Referenz, `Rechnung RE-1000`, `EPD`. Ausschliesslich die vom Benutzer als synthetischer Test übermittelte Platzhalter-IBAN (hier keine Voll-IBAN im GitHub dokumentiert) benutzt. PNG/TXT optisch dekodiert und verglichen: PASS. Diese Dateien testen das **Payload-Schema**, nicht die komplette produktiv generierte PDF.
- SIX-Quellen: https://www.six-group.com/en/products-services/banking-services/payment-standardization/standards/qr-bill.html und https://www.six-group.com/en/products-services/banking-services/payment-standardization/downloads-faq/faq.html. SCOR mit normaler IBAN grundsätzlich erlaubt; NON mit normaler IBAN ebenfalls. SIX-Portal akzeptiert QR-Bild und TXT, keine komplette PDF. **OFFEN:** SIX-Ergebnisbericht mit konkretem Validierungsergebnis für die eigentliche CRM-V2-NON-Testdatei sowie ggf. Druck-/PDF-Abnahme. Vorhandenes isoliertes Render-QA-Deployment und produktiver Cloud Run unverändert.


### SIX-Validierung CRM V2 NON – bestanden (23.10.2026; vom Benutzer bestätigter SIX-Screenshot)

- SIX QR-bill Validation.Portal: synthetische Datei `LSZH_CRM_V2_SIX_TEST_ONLY_NON.txt` mit Standard **`QR;2.3;CH`** geprüft. Nutzer zeigte im Screenshot **grüne Ergebnisfläche, blaues Doppelhäkchen, `Validierung abgeschlossen`, leere Fehlerspalte `Ergebnis`**. Ergebnis: **SIX-Validierung der synthetischen CRM-V2-NON-Daten ohne Fehler BESTANDEN**.
- Eindeutige offizielle Auslegung nach SIX-Anleitung `https://www.six-group.com/dam/download/banking-services/standardization/validation-swiss-qr-code-user-guide-de.pdf`, Kapitel 3.2.1, Seite 9: grün + „Validierung abgeschlossen“ = erfolgreich validiert, keine Fehler. Rot + „Validierung abgeschlossen“ = Fehler; deshalb kein zusätzliches Fehlerprotokoll erforderlich. Eingesandtes XML war die erkannte Datenstruktur, **nicht** das Prüfresultat.
- Synthetischer geprüfter Datensatz: `SPC/0200/1`, fiktive CH-IBAN (kein echtes Bankkonto), Zahlungsempfänger `LSZH Invest GmbH`, `Rummelmatt 8, 5610 Wohlen, CH`, Testkunde `TEST_ONLY Musterfirma AG`, CHF 499.90, Referenztyp `NON`, leere Referenz, Mitteilung `Rechnung RE-1000`, Abschluss `EPD`.
- **Reichweite:** Offizielle SIX-Portalprüfung betrifft hochgeladene **synthetische TXT-QR-Nutzdaten**, nicht den vollständigen aus CRM generierten Rechnungs-PDF-Zahlteil oder echte Firmen-IBAN. Separat zuvor bestanden: reale Test-PDF-Erstellung, optischer PDF-QR-Scan, 86/86 CRM-Tests, Render-QA-Deployment `dep-dbdt7mcipgvc73a26r2g` LIVE ausschliesslich in isoliertem QA-Service. Keine Änderungen am Cloud Run Live-CRM.
- **Nächster Gates:** Druck/Positionierung von QR-Zahlteil/Empfangsschein im originalen PDF und gegebenenfalls Banking-App-Test, Bankkontoinhaberschaft/IBAN-Konfiguration ausserhalb GitHub, kontrollierter Cloud-Run-Kandidat ohne Traffic, explizite Freigabe bevor produktive Rechnungen ausgestellt/versendet werden. Kein produktiver Mailversand.
