# Dashboard: Kennzahlen und filterbare Auswertungen

Stand: 27.10.2026

Das Dashboard enthält ausschliesslich Kennzahlen und Auswertungen für Kunden, Rechnungen, Offerten und Projekte. Keine Aufgaben-, Wiedervorlagen-, Lead- oder Ablaufkarten. Nachfassdaten und Termine bleiben in den jeweiligen Arbeitsregistern; dortige Bearbeitungs-/Versandregeln sind unverändert.

## Filter und Vergleich

Oben gemeinsamer Zeitraumfilter: Monat, Quartal, Jahr, eigener Zeitraum mit Von/Bis oder Gesamt. Anwenden aktualisiert alle zeitbezogenen Zahlen ohne Datenänderung. Standard ist das laufende Jahr. Laufende Zeiträume enden heute nach Schweizer Kalender; vollständig zukünftige und ungültige Zeiträume zeigen einen verständlichen Fehler und keine scheinbar gültigen Kennzahlen.

Abgeschlossene Monate/Quartale/Jahre werden mit der vollständigen vorangehenden Kalenderperiode verglichen. Bei laufenden Perioden wird nur die gleich lange bereits verstrichene Spanne der Vorperiode berücksichtigt, begrenzt durch deren Ende. Eigene Zeiträume vergleichen die unmittelbar vorhergehende gleich lange Spanne. Bei Gesamt gibt es keinen Vorperiodenvergleich. Absoluter Unterschied und Prozentwert werden gezeigt; bei Vorwert null kein unendlicher Prozentwert.

Unter Entwicklung lassen sich Monate, Quartale oder Jahre sowie Kundenbestand, Neukunden, Zahlungen, Rechnungsvolumen, Offerten oder Projekte wählen. Balken und aufklappbare Zahlentabelle verwenden dieselben Daten. Erfassungszahlen sind pro Abschnitt, Kundenbestand ist kumuliert bis Abschnittsende. Filter bleiben bei Aktualisierung und Navigation innerhalb der angemeldeten Sitzung erhalten. Keine Speicherung von Zugangsdaten oder personenbezogenen Filterwerten im Browser.

## Kennzahlen und ihre Bedeutung

- Kunden: heutiger Gesamt-/Aktiv-/Inaktiv-Bestand, Neukunden im Zeitraum, Vergleich zur Vorperiode und aus bekannten Erfassungsdaten abgeleiteter Bestand am Periodenende. Die heutigen Bestandskennzahlen gelten ausdrücklich unabhängig vom Zeitraumfilter.
- Rechnungen: Volumen ohne Entwürfe/Stornos nach Rechnungsdatum (ersatzweise Erfassungsdatum), gültige Zahlungseinträge nach Zahlungsdatum, heutiger offener/überfälliger Rest der ausgewählten Rechnungen, Rechnungszahl und Anzahl nachgewiesener Zustellungen. Entwürfe und Stornos separat gezählt. Zahlungen können im gewählten Zeitraum liegen, auch wenn die Rechnung aus einer früheren Periode stammt.
- Offerten: im Zeitraum angelegte Offerten, heutiger Status, einseitige Kundenannahme separat, beidseitige Annahmen und Ablehnungen, Annahmequote nur aus entschiedenen Offerten. Vereinbarte Einmal-/Monatswerte nur aus beidseitigen Annahmen; keine Zahlungseingänge und kein realisierter Umsatz. Noch nicht übernommene, bereits intern bestätigte Online-Annahmen zählen als beidseitig bestätigt.
- Projekte: im Zeitraum angelegte Projekte mit ihrem heutigen Status, davon heute abgeschlossen, daneben heutiger aktiver Gesamtbestand ausdrücklich unabhängig vom Filter. Statusverteilung Geplant/In Arbeit/Wartet auf Kunde/Abgeschlossen. Keine erfundene zeitliche Verteilung von Abschlüssen.

Rechnungsvolumen ist kein Zahlungseingang. Zahlungskorrekturen werden anhand des heutigen gültigen Buchungsverlaufs abgezogen; alte Bezahlt-Markierungen ohne Einzelbuchungen werden nicht als Zahlung erfunden. Zahlungsdaten ersetzen keine Bankanbindung oder vollständige Buchhaltung.

## Datenbasis und historische Grenzen

Die vorhandene authentifizierte Gesamtauswertung liest alle CRM-Register, nicht nur die ersten Browserseiten. Das neue Modul bildet ausschliesslich tägliche Aggregate; keine Kundenidentitäten, E-Mail-Adressen, Zahlungsreferenzen oder Einzelbelege gelangen zusätzlich in die Auswertungsdaten. Datumswechsel werden nach Europe/Zurich ausgewertet, Intervalle einschliesslich beider Endtage. Beträge werden in ganzen Rappen gerechnet.

Der historische Kundenbestand ist aus heute vorhandenen Kunden und ihrem Erfassungsdatum abgeleitet. Frühere Löschungen und Aktiv-/Inaktiv-Wechsel sind nicht vollständig rekonstruierbar. Ebenso fehlen vollständige frühere Offerten-/Projektstatuswechsel und verlässliche Abschlusszeitpunkte. Die Oberfläche bezeichnet Statusauswertungen deshalb ausdrücklich als heutigen Stand der im Zeitraum angelegten Datensätze. Es werden keine historischen Ereignisse nachgetragen.

Datensätze ohne auswertbares Datum sind nur bei Gesamt enthalten und werden keiner Zeitspanne oder Kurve zugerechnet; Anzahl und Art werden sichtbar genannt. Der kumulierte historische Kundenbestand verwendet nur bekannte Erfassungsdaten. Ungültige Betragsangaben und Altrechnungen ohne Zahlungsbuchung werden ebenfalls ausdrücklich ausgewiesen. Bei fehlender Gesamtauswertung erscheinen keine unvollständigen Browserseiten als Gesamtzahlen.

## Validierung

529 CRM-Tests sowie Desktop-/Mobilprüfung erfolgreich. Abgedeckt: Monats-/Quartals-/Jahresgrenzen, Schaltjahr, Schweizer Datumswechsel, aktuelle vs abgeschlossene Vergleichsperioden, eigene inklusive Zeiträume, Kundenbestand vs Neukunden, getrennte Rechnungs-/Zahlungsdaten, Teilzahlungen, Korrekturen, Entwürfe, Stornos, Altrechnungen ohne Zahlungsbuchung, einseitige Annahmen, aktuelle Statuskohorten, undatierte Datensätze, mehr als 50 Einträge und keine zusätzlichen Identitätsdaten. Browserprüfung sämtlicher Filter, Entwicklung/Tabelle, Filtererhalt und Fehlerfälle mit vollständig blockiertem externem Netzwerk; keine Schreibaktionen.

Bestehende Daten zusätzlich rein lesend abgeglichen: 1 Kunde, 6 Rechnungen, 9 Offerten, 4 Projekte vollständig aggregiert. Zur Prüfzeit keine fehlenden Datumsangaben oder ungültigen Beträge. Keine Kunden-/Zuordnungsänderung, Nachricht, Buchung, Make- oder sonstige Szenarioänderung.

## Live-Nachweis

Revision `lszh-crm-v2-00139-mib`, 100 % Verkehr. Alle 82 Laufzeitdateien bytegleich geprüft; drei gezielte Änderungen einschliesslich des neuen rein lesenden dashboard-reporting.js. Konfiguration und Dienstkonto unverändert. Build erfolgreich, Image-Digest festgelegt und gegen das bereitgestellte Image geprüft. Nach verlorenem Build-Lookup des ersten CLI-Aufrufs wurde dasselbe erfolgreiche Build-Ergebnis ohne zweiten Build bereitgestellt. Live-HTML bytegleich, Auswertung anonym HTTP 401. Keine jüngsten Revisionsfehler. Beide GitHub-Prüfungen erfolgreich. Rückkehrrevision `lszh-crm-v2-00137-naf`.

[Release-Nachweis](../releases/dashboard-analytics-live-20261027.json) - [PR 42](https://github.com/lszh-automations/lszh-automations-site/pull/42).
