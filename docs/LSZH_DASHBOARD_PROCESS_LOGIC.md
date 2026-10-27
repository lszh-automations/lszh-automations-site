# Aktuell: Ablaufbereich vollständig entfernt

Auf Benutzerwunsch ist der komplette Bereich „Deine laufenden Abläufe“ aus dem Dashboard entfernt, einschliesslich seiner Karten, Filter und speziellen Öffnungsfunktionen/Stile. Vier Kennzahlen und aufklappbare Auswertungen bleiben bestehen. Die folgenden Beschreibungen dokumentieren frühere Stände. [Live-Nachweis](../releases/remove-dashboard-flows-live-20261027.json).

---

# Dashboard nach tatsächlichen Abläufen

Stand: 27.10.2026

Die bisherige vollständige Datensatzliste zeigte zusammengehörige Leads, Offerten, Projekte und Rechnungen gleichwertig nebeneinander. Dadurch erschienen etwa eine qualifizierte Anfrage und ihre bereits vorhandene Offerte doppelt, und das Warten auf eine noch nicht fällige Zahlung wirkte wie eine unmittelbare Aufgabe.

## Neue Einordnung

Ein Ablauf wird über konkrete Offerten-/Projektverknüpfungen gebündelt. Verschiedene Aufträge desselben Kunden bleiben getrennt. Firmennamen und E-Mail-Adressen bilden keine Zuordnung. Widersprüchliche Kunden-/Auftragsverknüpfungen werden nicht zusammengeführt. Ein qualifizierter Lead ohne eigene nächste Aktion erzeugt keinen zusätzlichen Hinweis zum Erstellen einer Offerte, wenn seine Offerte bereits besteht. Explizite Lead-Aktionen bleiben erhalten.

**Deine nächsten Schritte** zeigt tatsächliche Arbeit: neue Anfrage bearbeiten, Offerte fertigstellen/versenden, Kundenannahme bestätigen, Auftrag übernehmen, Projekt vorbereiten/umsetzen, Rechnung prüfen/versenden sowie fällige Rückmeldungen oder überfällige Forderungen bearbeiten. Ungeklärter Versand bleibt vorn zur Prüfung.

**Warten auf Kunde oder Zahlung** zeigt versendete Offerten vor ihrem Nachfassdatum, kontaktierte Leads ohne fällige Rückmeldung, wartende Projekte und versendete Rechnungen vor Überfälligkeit. Ein Fälligkeitsdatum innerhalb sieben Tagen allein erzeugt keine Mahnaufgabe. Der bestehende Mindestabstand zwischen Mahnstufen wird berücksichtigt; eine wartende Forderung wird nicht täglich erneut als sofortige Mahnaufgabe gezeigt. Nach abgeschlossener dreistufiger Mahnfolge lautet der nächste Schritt persönliche Klärung statt weitere Mahnung.

Läuft ein Projekt und gleichzeitig eine unbezahlte Rechnung, bleibt beides in einer Auftragskarte: konkrete eigene Arbeit zuerst; die Zahlung unter Parallel ausstehend. Mehrere gleichzeitig mögliche eigene Schritte bleiben unter Als Nächstes/Ausserdem sichtbar und direkt zu öffnen. Ein abgeschlossener Projektstatus schliesst eine offene Rechnung nicht aus, und eine bezahlte Rechnung beendet kein laufendes Projekt.

Alle Abläufe werden ohne Vorschaugrenze erfasst. Suche und Filter bieten alle, eigene Bearbeitung oder Warten; die gefilterte Anzahl bleibt sichtbar. Die früheren zusätzlichen Kategorien-/Vorschaukästen liegen unter den Auswertungen und verdoppeln die Hauptansicht nicht mehr. Fehler führen nicht zu einer scheinbar vollständigen leeren Liste. Die bisherige vollständige Datensatzprojektion bleibt für bestehende Auswertungen erhalten; die Hauptansicht verwendet die Ablaufbündelung.

## Grenzen und Prüfung

Die Einordnung folgt gespeicherten Status, Verknüpfungen, Terminen und Aufgaben; sie kann nicht erkennen, was ausserhalb des CRM bereits erledigt wurde. Es werden keine gespeicherten Daten korrigiert oder neu zugeordnet. Insbesondere bleibt Offerte 1003 unzugeordnet. Keine neuen Checklisten, Wiedervorlagen, Szenarien, Nachrichten oder Buchungen.

521 CRM-Tests sowie Desktop-/Mobilprüfung erfolgreich. Fachliche Fälle: Auftrag mit Projekt und paralleler Rechnung, nicht mehr erforderliche Lead-Hinweise, mehrere Aufträge desselben Kunden, widersprüchliche Verknüpfungen, fristgerechtes Warten/Nachfassen, sieben volle Tage zwischen Mahnstufen, ungeklärter Versand trotz Zahlung, vollständige Erfassung ohne Begrenzung und unveränderte Quelldaten. Browserprüfung mit leer geladenen Registern, konkreten IDs, Suche/Filter, getrennten Abschnitten sowie leerer/fehlgeschlagener Auswertung; keine Schreibaufrufe oder externen Testnachrichten.

Bestehende Daten rein lesend geprüft: Momentaufnahme 21 offene Datensätze ergeben 10 Abläufe, davon 7 mit eigener Arbeit und 3 im Warten. Fünf durch bestehende Offerten überholte Lead-Hinweise entfallen; offene Projekt-/Rechnungsschritte bleiben gebündelt erhalten.

## Live-Nachweis

Revision `lszh-crm-v2-00135-nen`, 100 % Verkehr. Alle 81 Laufzeitdateien bytegleich geprüft; nur public/index.html und die rein lesende cockpit-summary.js geändert. Konfiguration und Dienstkonto unverändert. Live-HTML bytegleich; Gesamtauswertung anonym HTTP 401. Keine jüngsten Revisionsfehler. Beide GitHub-Prüfungen erfolgreich; die Datenbankprüfung wurde nach einem geschlossenen Emulator-Testtransaktionslauf erfolgreich wiederholt. Rückkehrrevision `lszh-crm-v2-00133-des`.

[Release-Nachweis](../releases/dashboard-process-logic-live-20261027.json) - [PR 40](https://github.com/lszh-automations/lszh-automations-site/pull/40).
