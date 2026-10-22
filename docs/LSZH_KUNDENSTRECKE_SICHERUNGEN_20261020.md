# Kundenbestätigung: zusätzliche Sicherungen vorbereitet

Stand 20.10.2026. Kein Go-live. Der Betreiber hat bestätigt, dass noch kein konkreter Kunde für den ersten Pilot feststeht.

## Geprüfter Ausgangsstand

Commit `43661d3480b2e07c1bd8c75cb01d31d994e330b1`: GitHub-Lauf [39471744324](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39471744324) mit allen vier Jobs erfolgreich (Validierung, Chromium, benannter Firestore-Emulator, Offline-Container-Build). Separater Build-only-Lauf 39471744288 ebenfalls erfolgreich. Kein Deployment.

Das produktive Konzept verwendet die vorhandenen Cloud-Run- und Make-Dienste. Der manuelle lokale Wiederanlauf ist ausschliesslich auf zwei interne TEST_ONLY-Records begrenzt und kein ständig laufender Kunden-Versanddienst. Dafür ist keine zusätzliche Surface-Daueraufgabe erforderlich.

## Gespeicherte Make-Änderungen, weiterhin inaktiv

Betroffene bestehende Szenarien: `7940220` (AVV Nein) und `7965223` (AVV Ja).

- Die Suchformeln verlangen jetzt zusätzlich `Versand freigegeben` und `Vertragsunterlagen versendet`. TEST-/TEST_/DEMO-/DEMO_-Präfixe werden unabhängig von Gross-/Kleinschreibung ausgeschlossen.
- Nach den vorhandenen PDF-Archivprüfungen wird derselbe Airtable-Datensatz neu gelesen. Freigaben, Quelle, Empfänger und eindeutiger Lead-E-Mail-Lookup, Zustimmungen, Annahmezeit, Versionen und Dokument-IDs/Hashes müssen zum ursprünglichen Ergebnis passen. Bereits vorhandener Beleg, Versandzeitpunkt oder Bearbeitungsflag blockiert diesen Weg.
- Anschliessend muss das native Firestore-Modul genau einmal das Dokument `lszh_customer_confirmation_attempts_v1/<Airtable-Record-ID>` in der benannten Kundendatenbank `lszh-offers` anlegen. Beide AVV-Szenarien verwenden denselben Schlüsselraum. Es gibt keinen Update-/Upsert-/Löschpfad für diese Reservierung. Ein schon vorhandenes Dokument blockiert einen neuen Durchlauf, auch wenn Annahmezeit oder PDF-Hashes geändert wurden.
- Erst danach wird das bisherige Airtable-Bearbeitungsflag gesetzt. Die Doc-/PDF-Erzeugung setzt nun den erfolgreichen PATCH-Rücklauf mit korrekter Record-ID und gesetztem Flag voraus.
- Unmittelbar vor Gmail wird Airtable erneut gelesen. Quelle/Freigaben/Empfänger/Nachweise müssen weiterhin stimmen; die Beleg-ID muss zum gerade archivierten Beleg passen, Bearbeitung muss gesetzt und Versandzeit weiterhin leer sein.
- Ein Fehler am Gmail-Modul endet über eine `Commit`-Fehlerroute. Sie bewahrt Reservierung und Bearbeitungsflag und läuft nicht zum Versandzeitstempel weiter. Es ist keine automatische Retry-/Break-Route eingerichtet. Der Betreiber muss einen unklaren Ausgang manuell klären.

Es wurden weder Make-Zeitpläne noch Kunden-Szenarien eingeschaltet. Keine Kundenofferte, kein Annahmestatus und kein Freigabe-Flag wurden geändert. Keine Kunden-PDFs erzeugt oder Mails versandt. Die Kundendatenbank wurde in diesem Schritt nicht beschrieben; ihre neue Reservierungssammlung entsteht erst bei einem später separat freigegebenen Kundenlauf.

## Nachweise und Grenzen

- Beide Konfigurationen nach dem Speichern zurückgelesen: korrekte Reihenfolge, keine gemeldeten Modulprobleme, fünf Verbindungen jeweils `ok`, inaktiv, null unvollständige Ausführungen.
- Namen der neuen Airtable-Prüffelder gegen das tatsächliche Tabellenschema abgeglichen.
- Isolierter Make-Test `8078273` ohne Mail-/Dokumentmodule: Reservierung in `lszh-offers-staging` erfolgreich angelegt; zweiter Versuch mit gleichem Schlüssel erwartungsgemäss HTTP 409. Dies war ein Wiederholungs-, kein paralleler Live-Lasttest. Die parallelen SDK-Transaktionstests sind separat in CI grün.
- Make-Test `8078309` enthält nur Start, Filter und Rückgabe; keine externen Provider. Die tatsächlich gespeicherten neuen Bedingungen wurden mit künstlichen Daten getestet: vier zulässige Kombinationen (Reservierung/Mail je AVV Nein/Ja) passieren; neun Änderungen (entzogene Versand-/Rechtsfreigabe, geänderter Empfänger, bereits versendet, falscher Beleg, Unterlagen nicht versendet, fehlende AVV-Zustimmung, geänderter Annahmehash) blockieren. 13 Fälle insgesamt bestanden.
- Beide Testszenarien abschliessend inaktiv und null unvollständige Ausführungen. Die erwartete 409 bleibt als Testfehler in der Ausführungshistorie sichtbar.
- Aktualisierung: Der produktive Make-Firestore-Schreibzugriff in `lszh-offers` ist inzwischen durch einen isolierten TEST_ONLY-Prüfeintrag bestätigt (siehe Betriebsalarme-Bericht). Noch nicht bewiesen: vollständiger Erstlauf mit diesen neuen Modulen, Zustellung über die endgültige Kundenstrecke und tatsächliches Fehlerverhalten des Gmail-Moduls nach unbekanntem Provider-Ausgang. Die neue Konfiguration wurde nicht mit Kundendaten ausgeführt. Kein Exactly-once-Zustellversprechen gegenüber Gmail.
- Airtable-Lesen und Gmail-Versand sind keine gemeinsame Transaktion. Die neue Prüfung begrenzt das Zeitfenster, ersetzt aber keine atomare Kopplung zwischen beiden Diensten.

## Betrieb des ersten begrenzten Piloten

Verantwortlicher Betreiber: Lars Schulthess. Nach jedem abgeschlossenen Pilotlauf Beleg-ID und Bestätigungszeitstempel in Airtable sowie den Make-Verlauf abgleichen. Ein abgeschlossener Lauf mit vorhandener Reservierung, aber ohne bestätigten Versandzeitstempel verlangt manuelle Prüfung, auch wenn Make den Lauf wegen der Commit-Route als beendet ausweist. Ein grüner Szenariostatus allein ist keine Versandbestätigung.

Bei unklarem Gmail-Ausgang zuerst den tatsächlichen Gesendet-Ordner und den zugehörigen Make-Vorgang abgleichen. Keine erneute Ausführung ab Gmail, kein Löschen der Firestore-Reservierung und kein Zurücksetzen des Bearbeitungsflags als automatische Reparatur. Bei Fehlern Kunden-Szenarien ausschalten und den bereits gespeicherten Vertrags-/Annahmenachweis erhalten. Bei Bedarf manuell mit dem Kunden klären; der erste Kundenfall ist ausdrücklich separat freizugeben.

Aktualisierung: [Stündliche Betriebsalarmierung](LSZH_BETRIEBSALARME_20261020.md) ist inzwischen aktiv; Empfänger und Testzustellung sind bestätigt. Für den ersten begrenzten Pilot bleibt die begleitete manuelle Kontrolle vorgesehen. Vor unbeaufsichtigtem Serienbetrieb einen unabhängigen Meldeweg bei Ausfall der gemeinsamen Gmail-Verbindung prüfen. Die ursprüngliche Aussage über fehlende Alarmierung ist damit überholt; die übrigen Nachweisgrenzen dieses Berichts bleiben bestehen.

## Rückfall auf die gesicherte Konfiguration

Vor jeder Rücknahme beide Kunden-Szenarien inaktiv halten. Die JSON-Dateien `make-kundenstrecke-<ID>-vor-reservierung-20261020.json` enthalten ursprüngliche Struktur und Konfigurationen der geänderten Module. Rücknahme ausschliesslich auf Konfigurationsebene: ursprüngliche Suche und Filter wiederherstellen; Filter an Modul 5 entfernen; neue Lese-, Reservierungs- und Fehlerhandler-Module entfernen; ursprüngliche Verbindungen der Hauptkette wiederherstellen. Danach speichern und inaktiv zurücklesen. Keine bestehenden Reservierungsdokumente oder Annahmen löschen. Eine Rücknahme erteilt keine Erlaubnis zum erneuten Versand.

Evidenz: `lszh-kundenstrecke-sicherungen-evidenz-20261020.json`. Vorher-/Nachher-Snapshots liegen im gleichen Verzeichnis und gehören zur technischen Übergabe.
