# Drei Dashboard-Ansichten

- Geschäftsüberblick: heutiger Kundenbestand, laufende Projekte, offene Offerten und ausstehende Rechnungsbeträge über alle erfassten Datensätze. Dazu Offertenstatus und Rechnungsüberblick. Kein Zeitraumfilter.
- Finanzen: verrechnet, erfasste Zahlungen, heutige offene und überfällige Reste der ausgewählten Rechnungen, Zahlungsentwicklung und Details.
- Monatsrückblick: startet im aktuellen Monat; Neukunden, Zahlungen und neue Projekte mit Vorperiodenvergleich, heute angenommene Offerten aus der gewählten Erfassungskohorte. Wählbare Entwicklung und Detailtabelle.

Finanzen und Monatsrückblick merken sich ihre Zeitraumwahl getrennt während der Sitzung. Die Kundenzahlen und offenen Beträge im Geschäftsüberblick sind nicht auf den ausgewählten Berichtszeitraum begrenzt. Die bestehenden Grenzen historischer Daten bleiben bestehen: keine Rekonstruktion von Löschungen oder Annahme-/Abschlusszeitpunkten aus dem heutigen Status. Zahlungsbuchungen sind keine Bankanbindung. Vollständige serverseitige Datenbasis; keine Änderung an Daten oder Abläufen.

Validierung: 529 CRM-Tests erfolgreich; Desktop 1440px und Mobil 390px mit drei Ansichten, getrennten Filtern, Standardmonat, vollständigen offenen Beträgen, ohne Seitenfehler oder externe Schreibzugriffe. PR 43 ist auf PR 42 gestapelt.

Live: lszh-crm-v2-00141-tim, 100 % Verkehr; HTML bytegleich. Rückkehrrevision: lszh-crm-v2-00139-mib. [Release-Nachweis](../releases/dashboard-three-views-live-20261027.json).
