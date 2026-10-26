# RechnungsprÃ¼fung und Rechnungen im Projekt

## Bedienung

Unter **Projekte â†’ Projekt Ã¶ffnen â†’ Rechnungen zu diesem Projekt** stehen die zugeordneten Rechnungen mit Betrag, Versandstand, Buchungsstatus, Restbetrag, FÃ¤lligkeit und nÃ¤chster Aufgabe. **Rechnung Ã¶ffnen** fÃ¼hrt direkt in die betreffende Rechnung. Die Zuordnung wird unabhÃ¤ngig von der ersten Seite des Rechnungsregisters serverseitig abgefragt.

Im Rechnungsfenster zeigt **Rechnung prÃ¼fen** fehlende oder unpassende Angaben. Insbesondere ist bei automatisch aus der Auftragsannahme erzeugten EntwÃ¼rfen die FÃ¤lligkeit bewusst manuell zu ergÃ¤nzen. Kunde/E-Mail und Rechnungsanschrift kÃ¶nnen Ã¼ber **Kundendaten ergÃ¤nzen** geÃ¶ffnet werden. Rechnung und Kundendaten bewusst speichern; danach die Rechnung erneut Ã¶ffnen.

1. Leistungen, Betrag, Rechnungsdatum und FÃ¤lligkeit prÃ¼fen und ergÃ¤nzen.
2. Den Entwurf bewusst auf **Offen** setzen und speichern. Dies sendet keine Mail.
3. **Swiss-QR-PDF** laden und Inhalt sowie EmpfÃ¤nger kontrollieren.
4. Die PrÃ¼fbestÃ¤tigung setzen. Erst dann kann im CRM **Rechnung senden** freigegeben werden, sofern Daten, Versandfreigabe und gegebenenfalls TestempfÃ¤nger passen.
5. Den abschliessenden Versanddialog bewusst bestÃ¤tigen.

Jede InhaltsÃ¤nderung setzt PDF-PrÃ¼fung und BestÃ¤tigung zurÃ¼ck. Die HTML-Druckansicht allein gibt keinen Versand frei. Die PDF-BestÃ¤tigung ist eine Bedienerentscheidung im aktuellen Fenster; sie ist kein serverseitiger Lesebeweis und wird nicht als zusÃ¤tzlicher Vertrags-/Archivnachweis gespeichert.

Versand, Buchungsstatus und Zahlung bleiben getrennt: **Offen** bedeutet noch keinen Versand. Ein bestÃ¤tigter Versand verbucht keine Zahlung. ZahlungseingÃ¤nge weiterhin ausschliesslich nach tatsÃ¤chlichem Nachweis erfassen. Bei unklarem Versand zuerst Gmail Â«GesendetÂ» und Make prÃ¼fen; keinen zweiten Versand auslÃ¶sen.

## DatenprÃ¼fung und Grenzen

Die lesende PrÃ¼fung kontrolliert Rechnungsnummer und Beschreibung, gÃ¼ltiges Datum/FÃ¤lligkeit, zugeordneten Kunden, E-Mail, vollstÃ¤ndige und Swiss-QR-taugliche Anschrift, gÃ¼ltige Positionen mit passendem Gesamtbetrag, Projekt mit demselben Kunden und auswertbare Zahlungsdaten. Dieselbe DatenprÃ¼fung lÃ¤uft vor einer Versandreservierung erneut. Sie bestÃ¤tigt keine steuerliche oder fachliche Richtigkeit der Leistungen und ersetzt keine manuelle InhaltsprÃ¼fung.

Neue authentifizierte, ausschliesslich lesende Endpunkte:

- `GET /api/records/rechnungen/:id/readiness`: gespeicherte Rechnung, zugeordneter Kunde und PrÃ¼fergebnis.
- `GET /api/records/projekte/:id/billing`: bis zu 100 tatsÃ¤chlich zugeordnete Rechnungen samt PrÃ¼fergebnis; weitere Treffer werden ausdrÃ¼cklich angezeigt. Die Liste behauptet keine VollstÃ¤ndigkeit Ã¼ber dieses Limit hinaus.

Die Projektabfrage filtert direkt nach `projectId` und benÃ¶tigt keinen neuen zusammengesetzten Index. Sie hÃ¤ngt nicht von lokal geladenen Registerseiten ab. Ein Fehler wird mit erneutem Laden angezeigt; der Server liest nur Daten. Andere Rechnungen, Kunden und Projekte werden nicht verÃ¤ndert.

Die bestehende Versandreservierung und der bestehende Make-/Gmail-Versandpfad bleiben erhalten. ZusÃ¤tzlich behoben: ein Darstellungsfehler bei unklaren VersandbestÃ¤tigungen sowie die unbedingte Wiederfreigabe des Versandknopfs nach einem Versuch. Bereits bestÃ¤tigter oder unklarer Versand bleibt gesperrt.

Es werden keine FÃ¤lligkeit, Zahlung, Erinnerung oder monatliche Rechnung automatisch erzeugt. Monatliche Leistungen benÃ¶tigen weiterhin einen bewusst vereinbarten Abrechnungsbeginn. Die Ã„nderung fÃ¼hrt keine Migration durch und versendet keine Kundenmail.

## PrÃ¼fung

477 CRM-Tests erfolgreich. Neue FÃ¤lle prÃ¼fen fehlende Angaben, Kalenderdaten, Positionen/Gesamtbetrag, Projektzuordnung, getrennte Versand-/ZahlungsstÃ¤nde, Teilzahlungen, lesende Datenzugriffe, Projektzuordnung trotz weiterer RegistereintrÃ¤ge, Begrenzung auf 100, Authentifizierung und GET-only-Routen. Ein inkonsistenter Betrag verhindert die Versandreservierung ohne DatenÃ¤nderung.

Desktop und Mobil: fehlende FÃ¤lligkeit, erfolgreiche PDF-Bereitstellung, PrÃ¼fbestÃ¤tigung, RÃ¼cksetzung bei Ã„nderungen, WiederÃ¶ffnen nach verworfenen Ã„nderungen, genau ein simulierter Versand, anschliessende Versandsperre, unklare VersandbestÃ¤tigung und Projektlinks getestet. SÃ¤mtliche externen Netzwerkzugriffe blockiert, keine echte Mail. ZusÃ¤tzlicher Firestore-Emulatortest prÃ¼ft den bei Auftragsannahme erzeugten Entwurf und die lesende RechnungsprÃ¼fung.

Implementierung: [PR 24](https://github.com/lszh-automations/lszh-automations-site/pull/24). Live-Nachweis im zugehÃ¶rigen Release-Manifest.

## Live-Nachweis

Aktiv seit 26.10.2026: `lszh-crm-v2-00099-pok`, 100 % Verkehr. [Release-Manifest](../releases/project-invoice-review-live-20261026.json). Alle 79 tatsächlich gebauten Dateien bestätigt; gegenüber dem vorigen Release nur `cloud-records.js`, `invoice-pricing.js`, `public/index.html` und `server.js` geändert. GitHub-Staging- und Baselineprüfung einschliesslich echter Firestore-Emulatortests erfolgreich. Konfiguration und Dienstkonto unverändert. Live-Oberfläche HTTP 200; beide neuen Endpunkte anonym HTTP 401. Keine Fehler der neuen Revision im kontrollierten Zeitfenster. Keine Produktions-/Kundendatensätze bearbeitet, keine Mail, Rechnung oder Zahlung erzeugt. Portal und Make unverändert. Rückfallrevision: `lszh-crm-v2-00097-yun`.
