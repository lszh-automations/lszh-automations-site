# Vereinfachtes Dashboard

Stand: 27.10.2026

Vier Kennzahlen: neue Leads, offene Offerten, offene Forderungen und aktive Projekte. Kennzahlen und Arbeitslisten stammen aus der vollständigen serverseitigen CRM-Auswertung. Ist diese nicht verfügbar, erscheinen keine unvollständigen Finanzsummen als Gesamtwerte.

Die Hauptansicht zeigt „Jetzt wichtig“ mit maximal fünf direkt sichtbaren Kategorien und weiteren dringenden Vorgängen zum Aufklappen. Überfällige Rechnungen, fällige Wiedervorlagen, fällige Offerten, ausstehende LSZH-Bestätigungen und Auftragsübernahmen stehen vorne. Offene Rechnungen sind nach Fälligkeit priorisiert und direkt zu öffnen; „Alle offenen Rechnungen“ setzt den vorhandenen serverseitigen Fälligkeitsfilter. Neue Leads und wartende Projekte öffnen den passenden Statusfilter.

„Offerten abschliessen“ zeigt bis zu acht Einträge je Schritt: Kundenannahme ohne LSZH-Bestätigung orange, bestätigter Auftrag mit ausstehender Übernahme grün. Öffnen bestätigt oder übernimmt nichts. Vorhandene Prüfungen, Bestätigungen und Buchungsregeln bleiben erhalten.

Fällige Lead-/Offertenrückmeldungen erscheinen nur bei tatsächlichen Einträgen. Der Bereich „Auswertungen und weitere Vorgänge“ enthält Lead-Pipeline, detaillierte Finanzen, Projektstatus, aktuelle Website-Leads und interne 24h-Erinnerungsvorschauen. Verbuchte Zahlungen bleiben dort sichtbar. Finanzielle Einordnungen und Datenbasis bleiben erhalten. Aufgeklappte Bereiche bleiben bei der normalen Aktualisierung offen.

Korrektur der rein lesenden Auswertung: online angenommene Offerten zählen nicht mehr als offen oder als Nachfassaufgabe. customer_response_recorded und awaiting_lszh_confirmation werden als ausstehende LSZH-Bestätigung ausgewertet, confirmed bei noch nicht übernommenem Auftrag separat als Übernahme. Die gespeicherte Offerte wird nicht geändert. Monatliche Vertragswerte werden erst bei interner Bestätigung bzw. bestehenden angenommenen Offerten gezählt; sie sind weiterhin weder Zahlungseingang noch realisierter Umsatz. Vorschauarrays bleiben auf acht Einträge pro Schritt begrenzt, die Zähler umfassen alle Einträge.

Validierung: 494 CRM-Tests einschliesslich globaler Auswertung von 235 Einträgen, Annahmestufen ohne Doppelzählung, begrenzter Vorschau trotz 25 Annahmen und unverändertem gespeichertem Status. Desktop und Mobilgerät mit künstlichen Daten und blockiertem externem Netzwerk: vollständige Summen trotz leerer lokaler Registerseiten, vier Kennzahlen, aufklappbare Details, direkte Annahme-Öffnung, serverseitige Status-/Fälligkeitsfilter, leere Daten und fehlende Gesamtauswertung. Keine schreibenden API-Aufrufe.
