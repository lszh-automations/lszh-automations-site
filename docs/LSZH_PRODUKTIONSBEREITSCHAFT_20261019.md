# LSZH Automations – Produktionsbereitschaft

Stand: 19.10.2026 (Europe/Zurich). Diese Liste bereitet einen begrenzten Produktivstart vor. Sie ist kein Go-live und erteilt keine Versand-, Vertrags- oder Kundenfreigabe.

## Aktueller Stand

Der synthetische Staging-Ablauf für AVV Nein und AVV Ja wurde end-to-end über Cloud Run, Firestore, Airtable und Make-Belegablage geprüft. Die zugehörigen Make-Offerten- und Annahmeszenarien sind laut aktuellem Read-only-Check inaktiv; offene fehlgeschlagene Ausführungen: 0. Kein Kundenmailversand wurde getestet.

Die geprüfte Cloud-Run-Anwendung ist ausdrücklich auf Staging und synthetische Offerten festgelegt: Staging-Projekt/Dienst, Test-Datenbank und Test-Collection, synthetische Airtable-Quelle und Testversionen. Kundenroute und produktiver Identitätsnachweis sind nicht als produktiv freigegeben. Daher ist die bestehende Anwendung kein Produktionskandidat, den man nur durch Einschalten eines Flags umstellt.

## Erforderliche Arbeit in dieser Reihenfolge

| Reihenfolge | Ergebnis | Konkrete Arbeit |
| --- | --- | --- |
| 1. Produktarchitektur | Getrennte Produktionsumgebung beschlossen | Eigenen Cloud-Run-Dienst, Laufzeitidentität, Firestore-Datenbank/Collection, Airtable-Ziel, Secret-Manager-Secrets und Drive-Ordner festlegen. Region, Aufbewahrung, Backups, Logging und Alarmzuständigkeit dokumentieren. Keine Staging-Secrets oder Testdaten übernehmen. |
| 2. Produktionsimplementierung | Kundentauglicher, abgesicherter Ablauf | Staging-Hardcodes und Synthetic-only-Abbruchbedingungen durch geprüfte Konfiguration ersetzen. Kundenroute und Identitätsprüfung festlegen; Zugriff pro Offerte begrenzen, Tokens sicher speichern/ablaufen lassen und Wiederholung/Replay verhindern. Rollen und Berechtigungen auf minimalen Umfang setzen. |
| 3. Fehlerkonsistenz | Kontrollierter Wiederanlauf | Annahme einmalig/idempotent speichern. Firestore und Airtable sind keine gemeinsame atomare Transaktion: Statusmodell für manual_review_required, Duplikatvermeidung, abgestimmte Wiederaufnahme und Alarmierung implementieren und testen. |
| 4. Kundendokumente | Freigegebene, richtige PDFs | Geschäftsbedingungen aus der Datei mit Endkontrollvermerk in eine finale Kundenfassung überführen. Die vorhandene AVV ist TEST_ONLY; eine reale AVV samt Anlagen mit tatsächlichen Unterauftragsbearbeitern, Regionen, Datenarten, Löschfristen, Sicherheitsmassnahmen und Kontakt für Vorfälle erstellen und prüfen. Versionierung und Hashes festlegen. |
| 5. Make und E-Mail | Kontrollierter Versandpfad | Produktive Szenarien/Verbindungen und eindeutige Verantwortlichkeit festlegen. Polling-/Trigger-Duplikate verhindern. Absenderdomain, Empfängerregeln, Vorlagen, Anhänge, Zustellfehler und Wiederholungen prüfen. Tests zunächst ohne Empfänger und dann nur intern; Versand- und Versanddatums-Schritte bleiben bis dahin aus. |
| 6. Abnahme | Nachweisbarer Freigabestand | Tests für AVV Nein/Ja, abgelaufene/ungültige Links, doppelte Annahme, Airtable-Ausfall, Make-Ausfall, Drive-/PDF-Fehler, E-Mail-Fehler, Wiederanlauf und Audit-Readback in einer getrennten Produktionsvorbereitung bestehen lassen. Geheimnisse, personenbezogene Testdaten und Mailzustellung gesondert kontrollieren. |
| 7. Begrenzter Start | Ein benannter Pilotfall mit Rückfallplan | Verantwortliche, Supportweg, Beobachtungszeit, Erfolgskriterien und Rückfall auf manuelle Abwicklung festlegen. Erst nach bestandenem Abnahmesatz Dienste/Trigger für den konkreten Pilotfall aktivieren. |

## Bereits belegte Punkte

- Beide synthetischen Varianten AVV Nein/Ja wurden erfolgreich angenommen und in Firestore sowie Airtable zurückgelesen.
- Für beide Varianten wurden TEST_ONLY-Belege in Google Drive erzeugt und mit Airtable verknüpft.
- Bestätigungsanhänge wurden statisch geprüft: drei PDFs ohne AVV, vier PDFs mit AVV. Kein Mailversand erfolgte.
- Temporärer Cloud-E2E-Tag und zwei Testrevisionen wurden bereinigt; temporäre Secret-Zugriffe entfernt; Browser-Demo blieb zu 100 % auf der bisherigen Revision.
- Im Make-Read-only-Check vom 19.10.2026 waren die Szenarien 7835460, 7940261, 7940220, 7965215 und 7965223 inaktiv; alle meldeten null offene fehlgeschlagene Ausführungen.

## Startkriterium

Produktionsstart erst, wenn die sieben Ergebnisse oben als belegt dokumentiert sind, insbesondere finale Kundenunterlagen, isolierte Produktionsumgebung, sichere Kundenroute, getestete Wiederaufnahme und kontrollierter E-Mail-Pfad. Der bisherige Staging-Test belegt die technische Teststrecke, nicht die rechtliche, sicherheitstechnische oder betriebliche Produktionsfreigabe.
