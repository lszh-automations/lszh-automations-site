# TEST_ONLY V3 – Abschluss 21.10.2026

Interner Test, kein Vertrag und keine Rechnung. Keine Kunden-/Auftragsanlage, Produktivfreigabe, externen Empfänger, Merge oder Deployment.

## Ergebnis

Tatsächliche Testannahme durch den Betreiber im lokalen Browser am 21.10.2026 um 13:58:53 Schweizer Zeit (11:58:53.342 UTC). Runner meldete PILOT_V3_ACCEPTANCE_VERIFIED. Unabhängiger zweiter Prozess scripts/internal-test-pilot-v3-readonly.mjs bestätigte Firestore-Offer, feste Record-/Token-Hash-Bindung und sämtliche erwarteten Airtable-Annahmefelder: V3_INDEPENDENT_FIRESTORE_AIRTABLE_READBACK_PASS, null Cloud-Schreibzugriffe. Person Lars Schulthess, lars@lszh-automations.ch, getrennte Berechtigungs-/Offerten-/Bedingungszustimmungen, AVV Nein, beide PDF-Hashes und Zeit identisch. Übernommen=true bleibt als Übernahmesperre, Kunde/Auftrag leer, Rechts-/Echtbetriebs-/Versandfreigaben false/leer.

Make 8091918, einmaliger manueller Lauf 52a191042f5e4b66bf6f17e736c56d54 vom 21.10.2026 12:00:44.774 UTC: alle 14 Module einmal, keine Fehler. Native Create-Reservierung TEST_MANUELL_20261020_V3:RECEIPT_MAIL mit overwrite=false vor Beleg/Mail. Beleg-PDF 1sVEheHTnw-35HBZoPTY6DI2WiCp3ewYm, 46754 Bytes, SHA-256 125d749eb5084f5e25df5c421a374082284d5472b0b79a558edbdb6d44a2ed94. Make-Modul 9 las den Beleg als PDF im Testarchiv 1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in mit readOnly=true zurück; Airtable-Beleg-ID unabhängig gelesen.

Genau ein Gmail-Aufruf in diesem Lauf, ID 1a15e5628735ab94. Empfänger ausschliesslich lars@lszh-automations.ch, kein CC/BCC, drei PDFs: Testofferte 68091 Bytes, TEST-Bedingungen 26544 Bytes und Annahmebeleg. Airtable-Versandzeit unabhängig gelesen: 2026-10-21T12:01:07.000Z (14:01:07 Schweizer Zeit). Betreiber bestätigt: **Angekommen, alle drei PDFs öffnen**. Kein Exactly-once-Versprechen des Mailproviders; kein Replay.

**Abnahmegrenze:** Die initiale Offertenmail 8092027 wurde nicht versandt. Der Betreiber nahm vor deren nächstem Poll direkt über die lokale Seite an; danach traf deren Entwurf-Filter nicht mehr zu. Kein Zurücksetzen oder nachträglicher Versand, keine neue Einladung zur künstlichen Vervollständigung dieses Teiltests. Nachgewiesen ist Registrierung → tatsächliche Browser-Testannahme → Firestore/Airtable → archivierter Beleg → Bestätigung mit drei PDFs. Kein öffentlicher Kundenlink, keine Kunden-/Onboarding-Abnahme.

## Abgleich und Runner

Ursprünglicher Surface-Checkout C:\Users\larss\Projects\lszh-automations-site war sauber auf dc8d707, GitHub auf bc073c1. Beide enthielten keinen V3-Runner; Port 8083 hatte keinen Listener. scripts/internal-test-pilot-v3.mjs wurde auf dem bestehenden Entwicklungsbranch feature/optional-avv-acceptance-staging-20261014 ergänzt und in den Surface-Checkout übernommen.

Fester Record recq58gMPjQPpNHYQ, Nummer TEST_MANUELL_20261020_V3_NO_CONTRACT, Zweck TEST_MANUELL_20261020_V3, einziger Test-Lead recRucAzmgvPhnNcj. Preise CHF 1500/99, 30 Tage, gültig bis 20.11.2026, TEST_v1.0_RC1. Die einmalige Record-/Hash-Bindung liegt in lszh_internal_pilot_v3_bindings, das Angebot in der bisherigen Staging-Offer-Collection. Keine frei wählbaren Records/Empfänger. Atomarer bestehender Portal-Kern, keine Annahme ohne tatsächliche getrennte Browserzustimmungen. Keine Klartexttokens in Dateien, URLs oder Ausgaben.

Vor Registrierung wurde Übernommen=true als Übernahmesperre gesetzt und nachgelesen. Beide PDFs wurden beim lokalen Start und vor Annahme inhaltlich geladen und auf Hash, exakten Archivordner und Schreibschutz geprüft. Offerte 1mnezAPrC9ynqFR_2z5lcMND4peoCylGK, SHA-256 ed7196404a88c86b5fc973cbf0e9193951b97f1c7b5e84fa405ad55f192cf095, Ordner 1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in. Bedingungen 1yPtsWTeEUclniKFWRM81EHEUMnu1E9nO, SHA-256 baec0946db9b892da86e4009ade769863d5087d8961e16940d0dda420d1bf279, Ordner 10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko.

## Anmeldung und Cleanup

Erster Start in Sandbox scheiterte am benutzergebundenen Tresor; unter Surface-13-Pro\larss lehnte Google die Token-Erneuerung mit HTTP 400 ab. Vorhandene Desktop-Client-Datei lokal gefunden und validiert. Der Betreiber erneuerte die Anmeldung im Browser, LOCAL_RUNTIME_AUTHORIZED bestätigt Geschäftskonto und bisherige Scopes. Alter DPAPI-Tresor als private verschlüsselte Sicherung im selben Windows-Verzeichnis erhalten. Keine neuen Scopes, IAM-Rechte oder Make-Verbindungen; kein Klartextexport.

Nach erfolgreicher Bestätigung beide V3-Szenarien 8092027 und 8091918 deaktiviert, unabhängig als inactive/isActive=false und 0 unvollständige Ausführungen zurückgelesen. Konfiguration/lastEdit unverändert. Lokalen V3-Listener anhand Prozessname und Befehlszeile identifiziert und beendet. Testrecord, Nachweise und Reservierungen bleiben erhalten. Kein weiterer Start, Seed, Annahme-POST oder Mail-Replay nötig.

## Offline-Prüfung

Runneränderung: 303 Tests, 296 bestanden, 7 übersprungen, 0 Fehler. Sieben V3-Fälle prüfen tatsächlichen Browser-Antwortparser, Preisprojektion, einmalige Annahme bei Konkurrenz, falsche Records/Empfänger/Zwecke, fehlende Zustimmungen/Hashabweichungen, CRM-Sperren und geänderte Angebotswerte. Das unabhängige Nur-Lesen-Prüfskript wurde auf Syntax geprüft und anschliessend live erfolgreich ausgeführt.
