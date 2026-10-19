# LSZH Automations – Freigaberegister der Vertragsgrundlagen
Stand: 19.10.2026 · Entscheidung der Geschäftsführung auf Anweisung „implementiere alle vertragsunterlagen als geprüft, vamos“

## Bedeutung dieser Freigabe
Die Geschäftsführung der LSZH Invest GmbH hat die **inhaltlichen Vertragsgrundlagen aus geschäftlicher Sicht freigegeben**. Es wird **keine** externe anwaltliche Prüfung, Unterzeichnung durch Dritte, Prüfung jedes projektspezifischen Datenflusses oder Freigabe bestehender Airtable-Kundenofferten behauptet.

## 1. Projektbedingungen – geschäftlich freigegeben
- Version: **1.0**, Stand 19.10.2026.
- Geschlossener Kundenwortlaut, B2B Schweiz; die Test-/Endkontrollkennzeichnung der bisherigen RC1-Fassung wurde in einer **eigenständigen Kopie** entfernt. Bestehende RC1-Quelle bleibt erhalten.
- Geschäftliche Google Docs-Kundenfassung: [Projektbedingungen v1.0](https://docs.google.com/document/d/1bjFmtr-9WQxOZOv5YJtEc4_c4VIFFhgig06CoJah3z0/edit)
- **PDF im Produktionsarchiv:** [LSZH_Projektbedingungen_v1_0_GESCHAEFTLICH_FREIGEGEBEN_20261019.pdf](https://drive.google.com/file/d/1d-EEo4AjsZBWvlYPlZLxxXuXJDBz7hWX/view)
- Drive-ID: `1d-EEo4AjsZBWvlYPlZLxxXuXJDBz7hWX`
- SHA-256 des exportierten PDFs: `b5421778dd88bdac6697cb4f258319fba6577a9b26cba75509ef4e55df4fc2aa`; **Drive-Byte-Rückprüfung und Drive-Schreibschutz/ContentRestrictions noch offen**.
- Freigabestatus: **GESCHÄFTLICH GEPRÜFT/FREIGEGEBEN**. Eine konkrete Offerte mit Preis, Leistungen, Empfänger und korrekten PDFs bleibt separat freigabepflichtig.

## 2. AVV – Rahmenwortlaut geprüft, kundenspezifische Freigabe offen
- Rahmenversion **1.0**, Stand 19.10.2026, Geschäftsfassung aus den zwölf AVV-Hauptklauseln der bisherigen RC1-Testquelle. Die **fiktiven Kundendaten und simulierten Anlagen wurden NICHT übernommen**.
- Geschäftliche Google Docs-Rahmenvorlage: [LSZH AVV v1.0](https://docs.google.com/document/d/1D1ymeF7t7ObSoQ0zALlC5O19nquApnzlryQ1k_Hv_Cg/edit)
- **PDF im Produktionsarchiv (NICHT als unbefüllte Kunden-AVV versenden):** [LSZH_AVV_v1_0_RAHMENVORLAGE_ANLAGEN_VOR_EINSATZ_AUSFUELLEN.pdf](https://drive.google.com/file/d/1MhQvRxB_OsiBhLXSkGeVL-jGutO3vM8x/view)
- Drive-ID: `1MhQvRxB_OsiBhLXSkGeVL-jGutO3vM8x`
- SHA-256 des exportierten PDFs: `bde130a9cacd693265521df144fa236e43077ad8ed55388fae079cc7fd97ecc1`; **Drive-Byte-Rückprüfung und Drive-Schreibschutz/ContentRestrictions noch offen**.
- Freigabestatus: **RAHMENWORTLAUT GESCHÄFTLICH GEPRÜFT/FREIGEGEBEN**. **NICHT**: reale Kunden-AVV freigegeben. Für jeden echten Fall Anlagen A/B/C vollständig, wahrheitsgemäss und mit genehmigten Unterauftragsbearbeitern/Transfergrundlagen, tatsächlich umgesetzten TOM, Zweck/Datenarten/Dauer und Kontakt vervollständigen und vom Kunden akzeptieren lassen. Erst dann projektspezifische AVV mit Versionskennung und eigener PDF/Hash erzeugen.
- Bisherige `TEST_ONLY`-AVV einschliesslich Mustercoiffeur und fiktiver Anhänge bleibt in STAGING/Test; niemals umbenennen oder als echte AVV ausgeben.

## 3. Offerten und Online-Abschluss
- **Nur die Muster-Vertragsgrundlagen sind freigegeben**, nicht alle etwaigen Offerten oder beliebige Kundendatensätze.
- Der Status `Online-Annahme rechtlich freigegeben` in Airtable ist **datensatzbezogen** und darf **nicht pauschal auf alle Datensätze** gesetzt werden. Dasselbe gilt für `Echtbetrieb – kein Test`, `Vertragsunterlagen versendet` und `Versand freigegeben`. Eine echte freigegebene Kundenofferte muss einen tatsächlichen Empfänger, finale Dokumente, Prüfsummen und eine dokumentierte Betreiberentscheidung aufweisen.
- Offertentext pro Kunde muss Leistung, Lieferumfang, Ausschlüsse, Preis, Dauer, Abnahme, Drittanbieter, Zahlungsmodalität sowie ggf. AVV abdecken. Eine fiktive Offerte ist keine rechtlich geprüfte Kundenofferte.
- Online-Annahme-Portal: letzte verifizierte private Cloud-Run-Revision `lszh-offer-portal-00002-4zw` mit `LSZH_PORTAL_PRODUCTION_ENABLED=false`. Kein externer Kunde darf allein aufgrund der internen Freigabe den Prozess aktivieren.
- Eigener Geschäfts-Drive-Produktionsordner: `10VD4xYIxfQBJ9Q5wpGq3iflK4MNJ1PHN`. Reader-Zugriff für `lszh-offer-portal@lszh-automations.iam.gserviceaccount.com` geprüft.
- Make-Bestätigungsszenarien `7940220` und `7965223` bleiben bis zur letzten End-to-End-Prüfung deaktiviert.

## 4. Nächster tatsächlicher Schritt zum ersten Kunden
1. Projektbedingungen-PDF per Drive-API unter dem Cloud-Run-Dienstkonto lesen, SHA-256 und vor Annahme unveränderliche Archivkopie prüfen; für echte Verwendung ContentRestrictions je finalem PDF setzen.
2. Bei AVV Ja die **konkreten** Anhänge A/B/C ausgefüllt und korrekt genehmigt als eigene PDF sichern. Master-PDF nie unverändert als erteilte Genehmigung behandeln.
3. Finale Domain/Origin und Secrets einrichten, Cloud-Run zunächst privat und deaktiviert lassen; erst danach echten E2E-Pilot sicher testen und gezielt aktivieren.

Rechtsrahmen zur Bestimmung der noch auszufüllenden AVV-Angaben: Schweizer DSG Art. 8, 9 und 16 (Datensicherheit, vorgängige Unterauftragnehmer-Genehmigung, Auslandübermittlung): https://www.fedlex.admin.ch/eli/oc/2022/491/de
