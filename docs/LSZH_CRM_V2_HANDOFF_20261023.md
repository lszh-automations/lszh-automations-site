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
