# Aktuell: Ablaufbereich vollständig entfernt

Auf Benutzerwunsch ist der komplette Bereich „Deine laufenden Abläufe“ aus dem Dashboard entfernt, einschliesslich seiner Karten, Filter und speziellen Öffnungsfunktionen/Stile. Vier Kennzahlen und aufklappbare Auswertungen bleiben bestehen. Die folgenden Beschreibungen dokumentieren frühere Stände. [Live-Nachweis](../releases/remove-dashboard-flows-live-20261027.json).

---

# Aktuelle Hauptansicht: zusammenhängende Abläufe

Die frühere Liste einzelner offener Datensätze ist durch Auftragsbündelung mit getrennten eigenen Schritten und Wartezeiten ersetzt. [Aktuelle Logik und Bedienung](LSZH_DASHBOARD_PROCESS_LOGIC.md). Die folgenden Angaben beschreiben den früheren Stand beziehungsweise weiterhin vorhandene Auswertungen.

---

# Aktuelle Ergänzung: vollständige Vorgangsübersicht

Seit 27.10.2026 zeigt die Hauptansicht zusätzlich **Alle offenen Vorgänge** ohne Vorschaugrenze, mit nächstem Schritt, Status, Termin, Suche und Bereichsfilter. Auch wartende Vorgänge, Entwürfe und Datensätze ohne Termin bleiben sichtbar. Frühere separate Annahme-/Wiedervorlagenvorschauen liegen unter den Auswertungen. [Aktuelle Bedienung und Abschlussregeln](LSZH_OPEN_PROCESSES.md), [Live-Nachweis](../releases/open-processes-live-20261027.json). Die folgende Dokumentation beschreibt den weiterhin vorhandenen Kennzahlen-/Auswertungsteil.

---

# Vereinfachtes Dashboard

Stand: 27.10.2026

Vier Kennzahlen: neue Leads, offene Offerten, offene Forderungen und aktive Projekte. Kennzahlen und Arbeitslisten stammen aus der vollständigen serverseitigen CRM-Auswertung. Ist diese nicht verfügbar, erscheinen keine unvollständigen Finanzsummen als Gesamtwerte.

Die Hauptansicht zeigt „Jetzt wichtig“ mit maximal fünf direkt sichtbaren Kategorien und weiteren dringenden Vorgängen zum Aufklappen. Überfällige Rechnungen, fällige Wiedervorlagen, fällige Offerten, ausstehende LSZH-Bestätigungen und Auftragsübernahmen stehen vorne. Offene Rechnungen sind nach Fälligkeit priorisiert und direkt zu öffnen; „Alle offenen Rechnungen“ setzt den vorhandenen serverseitigen Fälligkeitsfilter. Neue Leads und wartende Projekte öffnen den passenden Statusfilter.

„Offerten abschliessen“ zeigt bis zu acht Einträge je Schritt: Kundenannahme ohne LSZH-Bestätigung orange, bestätigter Auftrag mit ausstehender Übernahme grün. Öffnen bestätigt oder übernimmt nichts. Vorhandene Prüfungen, Bestätigungen und Buchungsregeln bleiben erhalten.

Fällige Lead-/Offertenrückmeldungen erscheinen nur bei tatsächlichen Einträgen. Der Bereich „Auswertungen und weitere Vorgänge“ enthält Lead-Pipeline, detaillierte Finanzen, Projektstatus, aktuelle Website-Leads und interne 24h-Erinnerungsvorschauen. Verbuchte Zahlungen bleiben dort sichtbar. Finanzielle Einordnungen und Datenbasis bleiben erhalten. Aufgeklappte Bereiche bleiben bei der normalen Aktualisierung offen.

Korrektur der rein lesenden Auswertung: online angenommene Offerten zählen nicht mehr als offen oder als Nachfassaufgabe. customer_response_recorded und awaiting_lszh_confirmation werden als ausstehende LSZH-Bestätigung ausgewertet, confirmed bei noch nicht übernommenem Auftrag separat als Übernahme. Die gespeicherte Offerte wird nicht geändert. Monatliche Vertragswerte werden erst bei interner Bestätigung bzw. bestehenden angenommenen Offerten gezählt; sie sind weiterhin weder Zahlungseingang noch realisierter Umsatz. Vorschauarrays bleiben auf acht Einträge pro Schritt begrenzt, die Zähler umfassen alle Einträge.

Validierung: 494 CRM-Tests einschliesslich globaler Auswertung von 235 Einträgen, Annahmestufen ohne Doppelzählung, begrenzter Vorschau trotz 25 Annahmen und unverändertem gespeichertem Status. Desktop und Mobilgerät mit künstlichen Daten und blockiertem externem Netzwerk: vollständige Summen trotz leerer lokaler Registerseiten, vier Kennzahlen, aufklappbare Details, direkte Annahme-Öffnung, serverseitige Status-/Fälligkeitsfilter, leere Daten und fehlende Gesamtauswertung. Keine schreibenden API-Aufrufe.

## Live-Nachweis

CRM-Version `lszh-crm-v2-00123-kev`, 100 % Verkehr. Rückkehrversion `lszh-crm-v2-00121-keq`. Beide GitHub-Prüfungen erfolgreich. Alle 80 Laufzeitdateien bestätigt, nur public/index.html und die rein lesende cockpit-summary.js geändert. Konfiguration und Dienstkonto unverändert; Live-HTML bytegleich, Gesamtauswertung und Vertragsstatus anonym HTTP 401. Keine Kundendatenänderung, Nachricht, Zahlung oder Dokumentänderung. [Nachweis](../releases/simple-dashboard-live-20261027.json), [PR 34](https://github.com/lszh-automations/lszh-automations-site/pull/34).
