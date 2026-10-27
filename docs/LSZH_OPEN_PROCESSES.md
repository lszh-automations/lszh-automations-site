# Aktuell: Ablaufbereich vollständig entfernt

Auf Benutzerwunsch ist der komplette Bereich „Deine laufenden Abläufe“ aus dem Dashboard entfernt, einschliesslich seiner Karten, Filter und speziellen Öffnungsfunktionen/Stile. Vier Kennzahlen und aufklappbare Auswertungen bleiben bestehen. Die folgenden Beschreibungen dokumentieren frühere Stände. [Live-Nachweis](../releases/remove-dashboard-flows-live-20261027.json).

---

# Aktuelle Hauptansicht: zusammenhängende Abläufe

Die frühere Liste einzelner offener Datensätze ist durch Auftragsbündelung mit getrennten eigenen Schritten und Wartezeiten ersetzt. [Aktuelle Logik und Bedienung](LSZH_DASHBOARD_PROCESS_LOGIC.md). Die folgenden Angaben beschreiben den früheren Stand beziehungsweise weiterhin vorhandene Auswertungen.

---

# Alle offenen Vorgänge im Dashboard

Stand: 27.10.2026

Die Hauptansicht zeigt eine vollständige Arbeitsliste aus allen fünf CRM-Registern. Jeder offene Lead, jede offene Offerte, jede nicht abgeschlossene Rechnung und jedes laufende Projekt erscheint mit Status, nächstem Schritt und vorhandenem Termin. Zukünftige Termine, fehlende Termine und Warten auf Kunde oder Zahlung blenden nichts aus. Kundeneinträge allein gelten nicht als offene Aufgabe.

Keine Begrenzung auf die ersten 50 Registereinträge oder acht Vorschauen. Standardmässig stehen alle Vorgänge in der Liste; Suche und Bereichsfilter zeigen ausdrücklich den gefilterten Anteil. „Alle anzeigen“ setzt beides zurück. Dringende und ungeklärte Vorgänge stehen zuerst. Ergänzende bisherige Annahme- und Wiedervorlagenlisten liegen unter den aufklappbaren Auswertungen.

Ein Klick lädt den aktuellen Datensatz anhand seiner konkreten ID und fehlende verknüpfte Datensätze nach. Ein fehlender verknüpfter Datensatz verhindert das Öffnen zur Korrektur nicht. Veraltete Antworten nach Navigation oder Anmeldung öffnen keinen anderen Vorgang. Öffnen und Auswerten verändern nichts.

## Wann verschwindet ein Vorgang?

- Leads: Gewonnen oder Verloren.
- Offerten: Abgelehnt oder angenommen und an Kunde/Projekt übergeben; bei einmaligen Leistungen muss eine zugehörige Rechnung existieren. Noch fehlende LSZH-Bestätigung oder Auftragsübernahme bleibt sichtbar. Die Rechnung bleibt separat bis zu ihrem Abschluss offen.
- Rechnungen: Bezahlt oder Storniert. Entwürfe sowie offene/teilbezahlte Rechnungen bleiben sichtbar. Ungeklärter Rechnungs- oder Erinnerungsversand bleibt auch nach Zahlung sichtbar, bis der Versand geklärt ist.
- Projekte: Abgeschlossen. Geplant, In Arbeit und Wartet auf Kunde bleiben sichtbar. Der nächste Schritt verwendet vorhandene Projektvorbereitung, Make-Einladung und bestehende Aufgaben.

Fehlende oder unbekannte Status werden zur Prüfung angezeigt. Eine manuell als abgeschlossen markierte Arbeit gilt als abgeschlossen; das CRM kann tatsächliche Tätigkeiten ausserhalb der gespeicherten Daten nicht erkennen. Einzelne verknüpfte Datensätze können als mehrere Vorgänge erscheinen, etwa laufendes Projekt und offene Rechnung. Das sind getrennte noch offene Arbeitsschritte, keine doppelte Buchung.

## Aktualisierung und Grenzen

Die Liste stammt aus der vollständigen authentifizierten serverseitigen Auswertung; die vorhandene Hintergrundaktualisierung lädt sie auf dem sichtbaren Dashboard auch bei unveränderten Leads neu. Offene Dialoge und die aktive Bearbeitung der Listenfilter werden nicht unterbrochen. Standzeit ist sichtbar; „Aktualisieren“ lädt den aktuellen Stand. Fehler zeigen keine unvollständigen Registerseiten als vollständige Liste. Ohne verfügbare Gesamtauswertung wird deutlich zur Aktualisierung aufgefordert.

Die Auswertung liest alle CRM-Register. Bei starkem Wachstum sollte sie später durch gespeicherte Aggregate ersetzt werden. Es entstehen keine neuen Checklisten, Wiedervorlagen, Nachrichten, Statusänderungen, Zahlungen oder Make-Szenarien.

## Validierung

509 CRM-Tests erfolgreich. Neue fachliche Prüfungen decken 235 Leads über mehrere Registerseiten, alle offenen Status, Zukunfts-/fehlende Termine, Annahme und Übernahme, abgeschlossene Vorgänge, Teilzahlungen, ungeklärten Versand trotz Zahlung, bestehende Projektaufgaben, unbekannte Status und unveränderte Quelldaten ab. Desktop und Mobilgerät mit 242 synthetischen offenen Vorgängen geprüft: vollständige Liste trotz leerer Browserregister, Suche/Filter/Rücksetzen, direkte ältere ID samt Kunden-Nachladen, neue Projekte trotz unveränderter Leads, verspätete Antworten, leere/fehlerhafte Auswertung, kein Schreibaufruf oder externes Netzwerk.

## Live-Nachweis

Revision `lszh-crm-v2-00129-buq`, 100 % Verkehr. Alle 81 bereitgestellten Laufzeitdateien bytegleich geprüft; nur cockpit-summary.js und public/index.html geändert. Konfiguration und Dienstkonto unverändert. Live-HTML bytegleich; Gesamtauswertung ohne Anmeldung HTTP 401. Keine jüngsten Revisionsfehler. Beide GitHub-Prüfungen erfolgreich. Rückkehrrevision `lszh-crm-v2-00127-nam`.

Bestehende Daten zusätzlich rein lesend geprüft: 20 offene Vorgänge (7 Leads, 5 Offerten, 5 Rechnungen, 3 Projekte), davon 13 ohne Termin. Dies ist eine Momentaufnahme; Anzahl verändert sich mit der Bearbeitung. Keine Kundendatenänderung oder Mail. Offerte 1003 ohne Zuordnung belassen. Make, Website und Portal unverändert.

[Release-Nachweis](../releases/open-processes-live-20261027.json) - [PR 37](https://github.com/lszh-automations/lszh-automations-site/pull/37).
