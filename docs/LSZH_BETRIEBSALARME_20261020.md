# LSZH Betriebsalarme – aktiviert und Transport bestätigt

Stand: 20.10.2026. Empfänger durch den Betreiber festgelegt: `lars@lszh-automations.ch`.

## Aktiver Umfang

Make-Szenario [8078663](https://eu1.make.com/1728770/scenarios/8078663) prüft stündlich die bestehenden Kundenbestätigungen 7940220 (AVV Nein) und 7965223 (AVV Ja). Es liest ausschliesslich Make-Zustände, Ausführungsprotokolle und die betreffende Airtable-Tabelle. Es startet keine Kundenläufe, verändert keine Annahmen, erzeugt keine Vertrags-PDFs und hebt keine Versandsperren auf.

Alarmfälle:

- Mindestens ein fehlgeschlagener Lauf mit Status 3 in der letzten Stunde, getrennt je Kundenszenario. Höchstens ein Beispiel pro Szenario und Scan; bei Alarm immer auch weitere Fehler im Verlauf prüfen.
- Ungültiges Szenario, blockierte Verarbeitung oder mindestens eine unvollständige Ausführung. Bewusst inaktive Kundenszenarien allein lösen keinen Alarm aus.
- Airtable-Bearbeitungsflag seit mindestens 30 Minuten gesetzt, aber noch kein Bestätigungszeitstempel. Massgeblich ist die letzte Änderung des Bearbeitungsflags, nicht das Annahmedatum. TEST-/TEST_/DEMO-/DEMO_-Offerten werden unabhängig von Gross-/Kleinschreibung ausgeschlossen. Die Abfrage liefert höchstens einen Beispielfall; bei Alarm alle offenen Bestätigungen prüfen.

Die Meldungen gehen ohne CC/BCC und ohne Anhänge von `info@lszh-automations.ch` an `lars@lszh-automations.ch`. Sie enthalten nur technische Szenario-/Ausführungs-/Record-IDs und feste Prüfanweisungen, keine persönlichen Einladungslinks oder Vertragsdokumente. Offene Zustände können stündliche Erinnerungen auslösen; es besteht keine Exactly-once-Garantie für Betriebsalarme.

## Live-Nachweise

- Die tatsächliche Make-Firestore-Verbindung hat das isolierte Dokument `lszh_customer_confirmation_attempts_v1/TEST_ONLY_PERMISSION_PROBE_20261020_NO_CUSTOMER` in der benannten Produktivdatenbank `lszh-offers` erfolgreich angelegt. Zweck: ausschliesslich Schreibrechteprüfung, kein Kundenrecord, kein Annahme-/Mailvorgang. Das Prüfdokument bleibt als Nachweis erhalten; es kollidiert nicht mit echten Airtable-Record-IDs.
- Alarm-Transporttest 8079076, Ausführung `79e5505bf1eb415f960c5bd14e97a711`, Gmail-ID `1a15ab29c63c964f`: genau eine klar markierte TEST_ONLY-Mail. Eingang vom Betreiber bestätigt. Testszenario danach inaktiv.
- 14 zusätzliche Fälle mit den gespeicherten Make-Alarmfiltern und künstlichen Eingaben bestanden: Fehler, ungültiger/blockierter Zustand, unvollständige Ausführung und gefundener Störfall lösen aus; erfolgreiche Läufe, normale Zustände und fehlende Störfälle nicht. Das Testszenario enthält keinen Mailanbieter und verändert keine Daten.
- Zusätzlicher Formeltest mit künstlichen 29-/30-/31-Minuten-Werten wurde vom vorgeschalteten Connector-Sicherheitsfilter mit HTTP 403/Cloudflare abgewiesen und nicht umgangen. Die genaue externe Grenzwertprüfung ist **nicht bestanden/nicht nachgewiesen**. Die unveränderte echte Airtable-Überwachungsabfrage lief zuvor und beim vollständigen Startlauf fehlerfrei.
- Erster vollständiger aktiver Scan `82118fe006de42d0b159c7a159570e77`: alle fünf Lese-Prüfmodule fehlerfrei, kein Alarm-Mailmodul ausgeführt. Anschliessender Readback: Überwachung aktiv, Intervall 3600 Sekunden, null unvollständige Ausführungen; beide Kundenszenarien inaktiv. Alle zusätzlichen Testwerkzeuge sind inaktiv.

## Grenzen vor unbeaufsichtigtem Serienbetrieb

Der Stundenrhythmus plus 30-Minuten-Schwelle kann eine Meldung über festhängende Bestätigung um bis zu ungefähr 90 Minuten nach Setzen des Flags verzögern. Eine überwachte Störung kann erneut gemeldet werden, bis sie geklärt wurde. Dies ist keine Echtzeitüberwachung und kein vollständiger Fehlerzähler.

Alarmversand und Kundenbestätigung nutzen dieselbe geschäftliche Gmail-Verbindung. Ein Ausfall dieser Verbindung kann auch die Alarmzustellung verhindern. Eine unabhängige Rückfallebene oder Make-Konto-Fehlerbenachrichtigung wurde nicht verifiziert. Beim begleiteten Erstpilot daher zusätzlich den Make-Verlauf direkt kontrollieren. Vor unbeaufsichtigtem Serienbetrieb einen unabhängigen Meldeweg einrichten und testen.

Diese Überwachung deckt die Make-Bestätigungsstrecke und deren Airtable-Bearbeitungszustände ab. Sie ist kein vollständiger Cloud-Run-/Firestore-zu-Airtable-Abgleich und kein Nachweis eines ersten Kundenabschlusses. Die vorhandene Produktivannahme wurde nicht eingeschaltet; kein Kunden-Go-live, kein Deployment und kein Merge nach main.

## Alarm bearbeiten und Rücknahme

Lars prüft zuerst den verlinkten Make-Verlauf und Airtable-Beleg-/Versandzustand. Bei unklarem Gmail-Ausgang tatsächlichen Gesendet-Ordner abgleichen. Keine Kundenannahme, PDF-Erstellung oder Bestätigung blind wiederholen; keine Firestore-Reservierung als automatische Reparatur löschen. Betroffene Kunden-Szenarien bei Bedarf ausgeschaltet lassen.

Zum Stoppen ausschliesslich Szenario 8078663 deaktivieren. Kundenkonfigurationen, Annahmen und Reservierungen unverändert lassen. Eine spätere Änderung des Empfängers gilt erst nach erneutem Konfigurationsreadback und Transporttest als bestätigt.

Konfiguration: `evidence/make-betriebsueberwachung-8078663-20261020.json`. Prüfungen: `evidence/lszh-betriebsalarme-evidenz-20261020.json`.
