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


### CRM V2 Swiss-QR PDF Drucklayout- und Releasekandidatenprüfung, 23.10.2026

**Referenz:** SIX IG QR-Rechnung v2.3 Kapitel 3.3–3.7 und 6.3–6.4 (`https://www.six-group.com/dam/download/banking-services/standardization/qr-bill/ig-qr-bill-v2.3-de.pdf`). Der SIX-Portal-PASS bezog sich auf synthetische NON-Daten (separates vorheriges Gate).

**Codekorrekturen auf Entwicklungsbranch:**
- `crm-v2/invoice-pdf.js`: Swiss QR um 15 pt höher gesetzt (5mm-Mindestabstand zur gedruckten Betragssektion). IBAN auf Empfangsschein/Zahlteil in Vierergruppen (5×4 + 1 Zeichen), Tausender-Leerzeichen bei Beträgen. Zusätzliche Scherenmarkierung an vertikaler Trennlinie. `Annahmestelle` rechtsbündig. Abstand zwischen Rechnungsinhalt und 105-mm-Zahlteil auf >=5mm erhöht. Branding im Rechnungsbereich und Nicht-MWST-Hinweis bleiben bestehen.
- `crm-v2/scripts/invoice-qr-smoke.js`: erstellt 1-seitige und 5-seitige synthetische PDF in `crm-v2/out/`; Test-IBAN ohne produktive Verbindung.
- `crm-v2/scripts/invoice-qr-scan.py`: mit **unabhängigem PDF-Renderer PyMuPDF und OpenCV** jetzt A4, korrekte 210×105mm-Zahlteil-Trennlinie und 62mm-Empfangsschein-Trennlinie, optischen QR-Code 46×46mm, leeren 5mm-Bereich um den QR-Code, Klartext-IBAN-Gruppierung, NON-QR-Daten und keinen doppelten Zahlteil bei mehrseitigen Rechnungen prüfbar.
- **Render-QA real ausgeführt:** Build `dep-dbdtj02qqsrs73d828v0` (Source commit `43ed504fc15f18a05421f8abeb27807eeb34cb3e`), am 23.10.2026 um 22:04:15Z **LIVE** in isolierter Render-QA-Instanz `srv-dbdt6o5g1s2s73b0on0g` (NICHT produktiver Cloud Run). **86/86 CRM-Tests PASS**, zwei PDFs erzeugt (13'349 und 30'252 Bytes), **beide erweiterte PDF-Print-Layout- und QR-Scanprüfungen PASS**. Gemessene QR-Decoder-Abmessungen **45.98 × 45.98 mm**, 1× und 5× A4; 31 QR-Datenfelder, NON, CHF 499.90 / CHF 120.00. QR-PDF-Layout an 100%-Druckmassstab rechnerisch geprüft; kein physischer Papiertest an Drucker/Bankapparat.
- Nur im separaten Render-QA mit `CRM_INVOICE_QA_PREVIEW_ENABLED=true`, `CRM_RECORD_PREFIX=lszh_crm_v2_staging_`, allen Mail-, Intake- und Produktiv-QR-Gates false ist die rein synthetische PDF unter `https://lszh-crm-v2-qr-qa-20261023.onrender.com/qa/TEST_ONLY_LSZH_Swiss_QR.pdf` per GET vorgesehen. Live-QA-Service selbst bei Render bestätigt; externes Abrufen des individuellen PDF-HTTP-Endpunkts konnte aus dem zugänglichen Web-Werkzeug nicht unabhängig bestätigt werden. Falls kein Abruf möglich, Render-Requests prüfen, nicht als extern verifiziert behaupten.
- **0%-Cloud-Run Kandidat vorbereitet, NICHT ausgeführt:** `scripts/deploy-crm-invoice-qr-zero-traffic-candidate.ps1` verifiziert Git-Zweig und sauberen Working-Tree, 86 CRM-Tests, bekannte Live-Revision `lszh-crm-v2-00038-gic` mit 100%, Service-Konto, bestehende Mail-/Website-Gates und unveränderte Env-/Secrets-Signatur. Erst danach deployt es eine separate Quellcode-Revision `--no-traffic --tag crm-invoice-qr-qa` und kontrolliert weiter 100% Traffic auf `00038-gic`; kein Traffic-Switch, keine Kunden-E-Mails und keine produktive Rechnungsfreigabe.
- **Noch offen für produktiven QR-Download:** Cloud-Run-0%-Kandidat wirklich ausführen (durch Nutzer/geeignete GCP-Umgebung), QA-Endpoint prüfen, Bank-Kontoinhaberschaft zu Firmen-IBAN plausibilisieren, IBAN per geschützter Runtime-Konfiguration statt Repository hinterlegen und erst mit expliziter Freigabe `CRM_INVOICE_QR_ENABLED` sowie `CRM_INVOICE_PRODUCTION_APPROVED` einschalten. Kein automatischer Rechnungsversand implementiert. Die bereits freigegebenen produktiven Offer-Mail/Lead-Mail-Flows bleiben unverändert.


### Cloud Run CRM V2 – Swiss-QR 0%-Releasekandidat tatsächlich erstellt (Bestätigung aus PowerShell vom 23.10.2026)

- **Ergebnis:** `CRM INVOICE QR ZERO TRAFFIC CANDIDATE PASS` – reales Nutzerprotokoll, nicht lediglich Plan.
- Aktuell bekannte Live-Revision: `lszh-crm-v2-00038-gic` mit **100 % Kundenverkehr**, unverändert. Neue Revision: `lszh-crm-v2-00040-dax` mit **0 % Kundenverkehr**. Revisionstag und Prüf-URL: `https://crm-invoice-qr-qa---lszh-crm-v2-ozx7mp2bka-oa.a.run.app`.
- Skript: `scripts/deploy-crm-invoice-qr-zero-traffic-candidate.ps1`; erfolgreich ausgeführt durch Benutzer lokal in `C:\\Users\\larss\\Projects\\lszh-crm-cloud-staging`, Branch `feature/crm-v2-cloud-staging-20261023`, nach `git pull --ff-only`.
- Protokoll bestätigte **86/86 Tests PASS, 0 Fehler**, gcloud Source Build erfolgreich, Cloud Run Revision erstellt und über `/api/config` auf Null-Traffic-Tag geprüft, unveränderte live-/mail-/lead-/serviceaccount-Konfiguration; keine Firestore-Schreibzugriffe, kein Rechnungs-/E-Mail-Versand, keine Trafficumschaltung.
- Cloud Run Kandidat `00040-dax` **hat Rechnungs-PDF-Export weiterhin deaktiviert** (`CRM_INVOICE_QR_ENABLED` und `CRM_INVOICE_PRODUCTION_APPROVED` nicht aktiv); dies ist beabsichtigt. Der separate, vollständig synthetische Render-QA-Build hatte bereits den echten Rechnungs-PDF-QR-Scan und die Druckgeometrie geprüft (1/5 Seiten, 45.98 mm optisch). SIX-Portal bestätigte zuvor synthetische `NON`-QR-Daten ohne Fehler.
- **Nächste Release-Gates:** Firmen-IBAN (nur Endziffern `2002` dokumentiert) dem Geschäftskonto von LSZH Invest GmbH zuordnen/Bankbeleg plausibilisieren, geschützte Cloud Secret Manager-Konfiguration für die tatsächlich zahlbare IBAN vorsehen; danach einen 0%-Kandidaten mit scharfem aber nur intern zugänglichem Rechnungs-PDF-Endpoint testen, während die Live-Revision und bestehende E-Mails unverändert bleiben. Keine Freigabe echter Kundenrechnungen und keine Änderung der Kundenmail-Automationen ohne explizites OK. Ein physischer 100%-Drucktest und ein Scan mit einer Bank-App sind noch nicht durch Benutzer bestätigt.


### 24.10.2026 – QR-Rechnungsmodul: kontrollierte Freigabe Phase 1 VORBEREITET, NICHT ausgeführt

Letzter bestätigter CRM-Produktivstand laut Benutzer: lszh-crm-v2-00038-gic mit 100 % Traffic; freigegebener, aber noch gesperrter 0%-Kandidat lszh-crm-v2-00040-dax. SIX-Portal hat synthetische NON-Zahlungsdaten fehlerfrei validiert; Render-QA hat das echte PDF-Drucklayout und QR-Scan in 1- und 5-seitiger Fassung geprüft; 86/86 Tests erfolgreich. Firmen-IBAN-Prüfziffer gültig, bekannte Endziffern 2002. Kontoinhaberschaft erfordert noch Nutzerprüfung der Bankunterlagen.

NEU vorbereitet: scripts/prepare-crm-invoice-qr-protected-candidate.ps1 (GitHub Entwicklungsbranch feature/crm-v2-cloud-staging-20261023). PowerShell verlangt Firmen-IBAN als verdeckte lokale Eingabe und explizites JA zur Bankkontoinhaberschaft LSZH Invest GmbH. Prüft CH-IBAN Modulo-97, reguläre IBAN, bekannte Endziffern 2002, vertraulicher Wert wird nicht in GitHub, Prozess-Args oder Logs abgelegt. Erzeugt Secret Manager Secret lszh-crm-v2-invoice-iban und gepinnte Version via --data-file=-; stoppt bei bereits existierendem Secret statt Überschreiben. Gibt dem CRM-Dienstkonto lszh-crm-v2@lszh-automations.iam.gserviceaccount.com secretAccessor nur auf dieses Secret.

Phase 1 GCP: nach lokalen CRM Regressionstests, Live-/IAM-/Mail-Cutoff-/Env-/Secret-Vergleich gegen Revision 00038-gic und bekannten safe 00040-dax deployt das Skript per gcloud run deploy --source .\crm-v2 --no-traffic --tag crm-invoice-qr-protected einen NEUEN 0%-Kandidaten mit --update-secrets CRM_INVOICE_IBAN=lszh-crm-v2-invoice-iban:<pinned-version> sowie --update-env-vars CRM_INVOICE_QR_ENABLED=true,CRM_INVOICE_PRODUCTION_APPROVED=true. Diese Variablen gelten nur auf dem 0%-Kandidaten; bestehende Variablen/Secrets dürfen sich sonst nicht verändern. Es prüft GET /api/config (200), nicht angemeldeten GET /api/pdf/rechnung/TEST_ONLY_NOT_REAL (401), unveränderte 100%-Live-Revision. Keinerlei Rechnungsversand, Firestore-Writes oder Mailvorgänge vorgesehen.

Release Gate NACH dem Script-Ergebnis CRM INVOICE QR PROTECTED ZERO TRAFFIC PASS: authentifizierten PDF-Download auf Kandidaten in einer autorisierten Testumgebung mit kontrollierter Rechnung prüfen (wenn OAuth-Ursprung für Tag-Domain nicht registriert, zuerst konfigurieren; keine Authentisierungsumgehung), Bankkontoinhaber bestätigt, Ausdruck bei 100 % und Bank-App-Scan falls erforderlich. Erst anschliessend separates ausdrücklich freizugebendes 100%-Traffic-Umschalten mit kontrolliertem Rollback. Bisheriger aktiver Live-CRM- und Offer-Mail/Lead-Mail-Betrieb bleibt unverändert. Kein GCP-Schreibzugriff über Chat vorhanden: Script ist vorbereitet, nicht ausgeführt, Secret nicht hinterlegt.

### 24.10.2026 – Protected Swiss-QR-Release: IAM-Fehler und punktuelle Wiederaufnahme

Benutzer führte scripts/prepare-crm-invoice-qr-protected-candidate.ps1 aus. Ergebnis: 86/86 CRM-Tests PASS, eingegebene Firmen-IBAN CH regulär/Modulo-97 PASS, Endziffern 2002, Bankkontoinhaberschaft LSZH Invest GmbH vom Benutzer mit JA bestätigt. Google Cloud Secret Manager hat das neue Secret lszh-crm-v2-invoice-iban und dessen ENABLED Version 1 erfolgreich erstellt. Fehlgeschlagen ist ausschliesslich die anschliessende IAM-Rollenvergabe: gcloud.secrets.add-iam-policy-binding meldete 'unrecognized arguments: serviceAccount:lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'. Ursache ist die Windows-PowerShell-Argumentübergabe im Skript (--member getrennt vom Wert statt ein vollständiges Flag). Folglich **keine** neue Cloud-Run-Revision in diesem Lauf, kein Traffic-Umschalten, keine Rechnungen/Emails versendet. Bekannter letzter bestätigter Produktivstand 00038-gic (100%), letzter bestätigter sicherer Kandidat 00040-dax (0%).

Fix im GitHub-Branch: In scripts/prepare-crm-invoice-qr-protected-candidate.ps1 IAM-Argument als einen vollständigen String '--member=serviceAccount:<runtimeSA>' an gcloud.cmd übergeben (statt PowerShell-eigener --member=(...) Schreibweise). **Nicht** das Erstsetup erneut ausführen: das IBAN-Secret existiert bereits und dessen Schutz gegen Überschreiben würde zurecht abbrechen.

Neues Wiederaufnahmeskript: scripts/resume-crm-invoice-qr-protected-candidate.ps1. Nach Git-Preflight, bekannten Revisionen, unveränderten Mail/Lead-/Secret-Variablen und 86 Tests prüft es, dass das bereits vorhandene Secret exakt eine ENABLED Version 1 besitzt (ohne den Wert auszulesen). Es repariert ausschliesslich die IAM-Berechtigung roles/secretmanager.secretAccessor am einzelnen Secret für das CRM-Laufzeitdienstkonto und bestätigt die Bindung über get-iam-policy. Dann baut es einen NEUEN Cloud-Run-Kandidaten mit --no-traffic, gepinnter CRM_INVOICE_IBAN-Secret-Version 1 und den 2 Invoice-Gates (nur neue Revision). Abschliessend prüft es tag-URL, Auth-HTTP 401 für fiktive Rechnungs-ID und 100%-Bestand von lszh-crm-v2-00038-gic. **Wiederaufnahmeskript ist vorbereitet, noch nicht durch Benutzer ausgeführt.** Keine zweite IBAN-Eingabe, keine neue Secret-Version und kein produktiver Cutover.

Bedienung: Im lokalen Repo git pull --ff-only; danach powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\resume-crm-invoice-qr-protected-candidate.ps1. Erfolg nur bei 'CRM INVOICE QR PROTECTED ZERO TRAFFIC PASS'. Danach Auth-Berechtigung und echten PDF-Download separat prüfen, erst nach ausdrücklicher Freigabe live schalten.
### 24.10.2026 – geschützte Rechnungsfreigabe: IAM repariert; Windows gcloud-Deploy-Aufruf korrigiert

**Benutzerbericht:** scripts/resume-crm-invoice-qr-protected-candidate.ps1 erneut ausgeführt. Alle 86/86 CRM-Tests PASS. Secret Manager `lszh-crm-v2-invoice-iban` Version 1 ENABLED ohne Auslesen bestätigt. IAM-Rolle `roles/secretmanager.secretAccessor` für CRM-Laufzeitdienstkonto erfolgreich gesetzt und via `get-iam-policy` verifiziert (`Updated IAM policy for secret...`, `Secret IAM verified`). Keine erneute Eingabe oder Speicherung der Firmen-IBAN.

**Abbruch bei Schritt 4:** Windows PowerShell 5.1 zerlegte den gcloud-Run-Deploy-Argumentarray-Ausdruck `--project='+$project`, `--region='+$region`, `--tag='+$tag`, `--update-secrets='+...` in mehrere argv-Tokens; Google Cloud SDK meldete `unrecognized arguments: lszh-automations europe-west6 crm-invoice-qr-protected lszh-crm-v2-invoice-iban : 1`. Daher **noch keine neue Cloud Run-Revision erstellt**, keine produktive Traffic-Umschaltung. Bekannte Baseline `lszh-crm-v2-00038-gic` 100%, 0%-Kandidat `lszh-crm-v2-00040-dax` bleibt. Keine reale Rechnung oder E-Mail versandt.

**Korrektur im Entwicklungsbranch:** `scripts/resume-crm-invoice-qr-protected-candidate.ps1` und das ursprüngliche `scripts/prepare-crm-invoice-qr-protected-candidate.ps1`: gcloud-Argumente als feste, vollständig expandierte Strings mit `"--project=$project"`, `"--region=$region"`, `"--tag=$tag"`, `"--update-secrets=CRM_INVOICE_IBAN=${secret}:$version"` in `[string[]]$deployArgs` und anschliessend `gcloud.cmd @deployArgs` (statt `$args`-Sondervariable). 11-Tokens-Preflight einschliesslich `--no-traffic` und `--quiet`. PowerShell Argument-Parser dokumentiert unter https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_Parsing und Array-Splatting unter https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_Splatting ; Cloud-Run-Flags unter https://cloud.google.com/sdk/gcloud/reference/run/deploy.

**Nächster Schritt:** lokal `git pull --ff-only` und ausschliesslich `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\resume-crm-invoice-qr-protected-candidate.ps1"` erneut ausführen. Wiederholt nur idempotente IAM-Prüfung und danach den weiterhin gesperrten kontrollierten 0%-Kandidaten. Ergebnis `CRM INVOICE QR PROTECTED ZERO TRAFFIC PASS` abwarten und Cloud-Run-Kandidaten sowie PDF-Auth prüfen. In diesem Chat wurde kein Zugriff auf laufende GCP-Revisionen behauptet.