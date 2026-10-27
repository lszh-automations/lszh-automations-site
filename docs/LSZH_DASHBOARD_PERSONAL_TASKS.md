# Dashboard: Hier bist du dran

Die Startseite zeigt ausschliesslich persönliche nächste Aktionen. Keine Kennzahlen, Auswertungen, Ansichtswechsel oder Übersicht aller offenen Vorgänge. Jede Zeile enthält Kunde/Referenz, die konkrete Aktion und Öffnen. Prüfbedarf und überfällige Aufgaben stehen zuerst. Bei vollständig geladener, leerer Liste: „Aktuell ist nichts zu erledigen.“ Fehlende Daten werden ausdrücklich als Ladefehler angezeigt.

## Auswahlregeln

- Neue Website-Anfrage prüfen/kontaktieren. Explizite Lead-Aktionen ohne zukünftige Wiedervorlage sowie fällige Rückrufe anzeigen; kontaktierte Leads ohne Aufgabe warten. Qualifizierte Leads ohne zugehörige aktive Offerte benötigen eine Offerte. Durch Offerten abgelöste allgemeine Lead-Aufgaben entfallen.
- Offertenentwürfe fertigstellen, bereite Offerten prüfen/versenden, Kundenannahmen prüfen/bestätigen, bestätigte Aufträge übernehmen und fehlende Zuordnungen/Archivierung/erste Rechnungsentwürfe prüfen. Versendete Offerten nur bei fälliger Wiedervorlage nachfassen. Ablehnungen abgeschlossen.
- Rechnungsentwürfe vorbereiten, unbestätigten Versand prüfen und überfällige offene/teilbezahlte Rechnungen prüfen/erinnern. Versendete Rechnungen vor oder am Fälligkeitstag warten. Sieben volle Tage zwischen Mahnstufen abwarten; nach der dritten Stufe Forderung persönlich klären. Bezahlt/storniert erzeugt keine Zahlungsaufgabe.
- Unklarer Versand muss auch bei bereits bezahlten Rechnungen geklärt werden. Frischer Versand wird bis fünf Minuten ausgeblendet; danach gegebenenfalls Postfach prüfen. Öffnen versendet nichts.
- Projekte: konkrete nächste nicht erledigte Umsetzungsschritte anzeigen; nach einer vollständig erledigten Checkliste Ergebnis abnehmen/abschliessen. Ein Status „In Arbeit“ ohne definierte Aufgabe erzeugt keine pauschale Aufgabe. Vorbereitung zeigt konkret fehlende Kundenzuordnung, Make-Bedarf, Einladungs-/Zugangsprüfung oder Umsetzungsschritte. Vorbereitete künftige Projektstarts warten. Status „Wartet auf Kunde“ nur bei überschrittener Projektfrist nachfassen, abgeschlossene Projekte ausblenden.

## Verhalten und Grenzen

Vollständiger serverseitiger Scan sämtlicher Register, keine Begrenzung auf die ersten 50 geladenen Datensätze. Vorhandene Verknüpfungslogik über exakte Datensatz-IDs bleibt bestehen. Unterschiedliche erforderliche Aktionen eines Auftrags (z.B. Projektarbeit und Rechnungsentwurf) bleiben getrennt sichtbar. Pro Projekt erscheint der nächste definierte Schritt.

Beim Öffnen wird der aktuelle Datensatz einschliesslich seiner direkten Verknüpfungen gelesen; keine Bearbeitung aus einer veralteten Vorschau. Fehlende Verknüpfungen (404) verhindern nicht die Korrektur am Hauptdatensatz. Bestehende Bearbeitungs-, PDF-Prüf- und Versandbestätigungsdialoge bleiben erhalten. Erledigte Aufgaben verschwinden nach der nächsten Aktualisierung aus den aktuellen Fachdaten; keine neue Aufgaben-Datenbank oder zusätzliche manuelle Erledigt-Markierung. Automatische Aktualisierung alle 30 Sekunden nur im sichtbaren angemeldeten CRM, ohne offene Bearbeitungsdialoge oder laufendes Öffnen zu unterbrechen. Fehler werden nicht als erfolgreich leere Liste dargestellt.

Die Auswahl basiert auf den erfassten Status, Wiedervorlagen und Projektschritten. Nicht erfasste Verpflichtungen oder externe Zahlungseingänge können daraus nicht abgeleitet werden. Keine Bankanbindung und kein automatischer Versand.

## Prüfung

537 CRM-Tests erfolgreich, darunter Annahmeübergänge, fällige/zukünftige Wiedervorlagen, vollständige siebentägige Mahnfrist, frischer/unklarer Versand, Projektchecklisten, leere/fehlerhafte Auswertung und 235 Aufgaben über Registerseiten hinaus. Desktop 1440px und Mobil 390px: nur konkrete Aufgaben, Reihenfolge, direkte Navigation mit frisch gelesenen Daten ausschliesslich per GET, keine Kennzahlen/Wartevorgänge, kein Seitenüberlauf und keine Browserfehler.

Bestehende CRM-Daten rein lesend abgeglichen: 9 Aufgaben (1 Lead, 2 Offerten, 3 Rechnungen, 3 Projekte), 6 wartende Schritte ausgeblendet. Momentaufnahme, keine dauerhaft feste Anzahl. Keine Änderungen an Kundendaten, Nachrichten, Zahlungen, Make-Szenarien, Website oder Kundenportal.

[PR 44](https://github.com/lszh-automations/lszh-automations-site/pull/44), gestapelt auf PR 43.

## Live-Nachweis

Revision `lszh-crm-v2-00143-yeh`, 100 % Verkehr. 82 Laufzeitdateien bytegleich verglichen, genau zwei Änderungen: public/index.html und cockpit-summary.js. Konfiguration und Dienstkonto unverändert; Rechnungsversand bleibt im Produktionsmodus. Live-HTML bytegleich und anonyme Aufgaben-API HTTP 401. Beide GitHub-Prüfungen erfolgreich, 0 jüngste Revisionsfehler. Rückkehrrevision `lszh-crm-v2-00141-tim`. [Release-Nachweis](../releases/dashboard-personal-tasks-live-20261027.json).

## Ergänzung: vollständige Projektstartvoraussetzungen

Seit Revision lszh-crm-v2-00145-kud verwenden Projektaufgaben dieselbe Startbereitschaft wie die Startaktion. Insbesondere werden fehlendes gültiges Startdatum und Verantwortlichkeit vor der Startbestätigung angezeigt; ein künftiger Start wartet erst, wenn alle anderen Angaben vorliegen. Darstellung unverändert. [Fachlicher Gesamtabgleich](LSZH_CUSTOMER_FLOW_AUDIT_20261027.md).
