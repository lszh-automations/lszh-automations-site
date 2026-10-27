# Vereinfachte Rechnungsansicht

Stand: 27.10.2026

Die Registerliste zeigt Nummer, Rechnung, Firma mit kleiner Kundennummer, Betrag, Fälligkeit und Status. Bei Teilzahlung erscheint der Restbetrag unter dem Gesamtbetrag. Aktion: Öffnen. Such- und Status-/Fälligkeitsfilter bleiben erhalten.

Beim Öffnen stehen Kunde, Beschreibung, Fälligkeit und Status im Vordergrund. Bei gespeicherten Rechnungen ausser Entwürfen folgen Gesamtbetrag, Zahlungseingänge und offener Restbetrag sowie der bestehende nächste Schritt. Neue Rechnungen und Entwürfe zeigen ihre Positionen aufgeklappt.

Aufklappbar sind Positionen und Gesamtbetrag, Projekt/Rechnungsdatum/weitere Angaben, Versanddetails, Buchungshistorie mit Korrekturen, Zahlung erfassen und Zahlungserinnerungen mit Verlauf. Druckansicht liegt unter weiteren Angaben. Swiss-QR-PDF, Schliessen und bei bearbeitbaren Rechnungen Speichern bleiben unten erreichbar, auch auf Mobilgeräten. Beim erneuten Öffnen beginnt der Inhalt oben.

Rechnung senden steht beim nächsten Schritt. Vor dem Versand sind weiterhin gespeicherte Daten, serverseitige Freigabe, geöffnetes PDF, die bewusste Prüfbestätigung und die Versandbestätigung erforderlich. Bei bestätigtem oder unklarem Versand und bei abgeschlossenen Rechnungen wird keine weitere Senden-Schaltfläche gezeigt. Klärung eines unklaren Versands bleibt direkt im nächsten Schritt erreichbar. Eine Änderung setzt PDF- und Versandfreigabe zurück; verspätete Prüfantworten können sie nicht wiederherstellen.

Die Einträge von Projekt und Rechnungsdatum bleiben im selben Formular und werden trotz eingeklappter Darstellung unverändert gespeichert. Preise, Buchungs-, Mahn- und Versandregeln, Daten, Dokumente sowie Endpunkte bleiben unverändert. Öffnen erzeugt keine Buchung oder Nachricht.

Validierung: 493 CRM-Tests; Desktop/Mobilgerät mit künstlichen Daten und gesperrtem externem Netzwerk. Geprüft: neue Rechnung, Speichern eingeklappter Felder und Positionen, PDF-/Empfängerfreigabe, expliziter simulierter Versand, Teilzahlung, Bezahlt/Storniert, unklarer Versand, fehlgeschlagene Prüfung, verspätete Prüfantwort nach Änderung, zugängliche Buchungs-/Mahnaktionen und sichtbare Fussbuttons.

## Live-Nachweis

CRM-Version `lszh-crm-v2-00119-niz`, 100 % Verkehr. Rückkehrversion: `lszh-crm-v2-00117-bof`. Beide GitHub-Prüfungen erfolgreich; alle 80 Laufzeitdateien bestätigt, ausschliesslich public/index.html geändert. Konfiguration und Dienstkonto unverändert; Live-HTML bytegleich, anonyme Rechnungs-/Prüfabfragen HTTP 401. Keine Kundendatenänderung, Zahlung, Mail oder Dokumentänderung. [Nachweis](../releases/simple-invoices-live-20261027.json), [PR 33](https://github.com/lszh-automations/lszh-automations-site/pull/33).

## Ampel bei Fällig am

Offene und teilbezahlte Rechnungen mit Restbetrag: Datum rot bei Überfälligkeit, orange von heute bis einschliesslich sieben Tage vor Fälligkeit, grün ab acht Tagen. Bezahlte, stornierte und Entwurfsrechnungen sowie vollständig beglichene Rechnungen und fehlende/ungültige Daten bleiben neutral. Tooltip und zugänglicher Text erklären die Einstufung. Dieselbe Kalendertagsberechnung wie Fälligkeitsfilter und Übersicht; die bestehende Minutenaktualisierung hält die Farbanzeige auch bei Tageswechsel aktuell, ohne Serverzugriff oder Speicherung.

Geprüft: 493 CRM-Tests sowie Desktop/Mobilgerät mit zwölf künstlichen Rechnungsvarianten, Grenzen gestern/heute/1/7/8 Tage, Teilzahlung, Bezahlt/Storniert/Entwurf, vollständige Zahlung, fehlendes/ungültiges Datum, Tageswechsel und Zeitumstellung.

Ampelfarben live auf `lszh-crm-v2-00121-keq` mit 100 % Verkehr. Rückkehrversion `lszh-crm-v2-00119-niz`. Alle 80 Dateien bestätigt, nur public/index.html geändert, Konfiguration unverändert, Live-HTML bytegleich und Prüf-Endpunkt anonym HTTP 401. [Nachweis](../releases/invoice-due-colours-live-20261027.json).
