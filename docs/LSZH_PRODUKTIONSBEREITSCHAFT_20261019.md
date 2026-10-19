# LSZH Automations – Produktionsbereitschaft

Stand: 19.10.2026 (Europe/Zurich). Diese Liste bereitet einen begrenzten Produktivstart vor. Sie ist kein Go-live und erteilt keine Versand-, Vertrags- oder Kundenfreigabe.

## Aktueller Stand

Der synthetische Staging-Ablauf für AVV Nein und AVV Ja wurde end-to-end über Cloud Run, Firestore, Airtable und Make-Belegablage geprüft. Die zugehörigen fünf Make-Offerten- und Annahmeszenarien sind laut Read-only-Check inaktiv; offene fehlgeschlagene Ausführungen: 0. Zusätzlich wurden am 19.10. interne E-Mails mit drei bzw. vier echten synthetischen PDF-Anhängen erfolgreich von Make an Gmail übergeben. Das ist ein isolierter Versandtest, **keine Kundenmail und kein vollständiger Produktionspfad**.

Die geprüfte Cloud-Run-Anwendung ist ausdrücklich auf Staging und synthetische Offerten festgelegt: Staging-Projekt/Dienst, Test-Datenbank und Test-Collection, synthetische Airtable-Quelle und Testversionen. Kundenroute und produktiver Identitätsnachweis sind nicht als produktiv freigegeben. Daher ist die bestehende Anwendung kein Produktionskandidat, den man nur durch Einschalten eines Flags umstellt.

## Erforderliche Arbeit in dieser Reihenfolge

| Reihenfolge | Ergebnis | Konkrete Arbeit |
| --- | --- | --- |
| 1. Produktarchitektur | Getrennte Produktionsumgebung beschlossen | Eigenen Cloud-Run-Dienst, Laufzeitidentität, Firestore-Datenbank/Collection, Airtable-Ziel, Secret-Manager-Secrets und Drive-Ordner festlegen. Region, Aufbewahrung, Backups, Logging und Alarmzuständigkeit dokumentieren. Keine Staging-Secrets oder Testdaten übernehmen. |
| 2. Produktionsimplementierung | Kundentauglicher, abgesicherter Ablauf | Staging-Hardcodes und Synthetic-only-Abbruchbedingungen durch geprüfte Konfiguration ersetzen. Kundenroute und Identitätsprüfung festlegen; Zugriff pro Offerte begrenzen, Tokens sicher speichern/ablaufen lassen und Wiederholung/Replay verhindern. Rollen und Berechtigungen auf minimalen Umfang setzen. |
| 3. Fehlerkonsistenz | Kontrollierter Wiederanlauf | Annahme einmalig/idempotent speichern. Firestore und Airtable sind keine gemeinsame atomare Transaktion: Statusmodell für manual_review_required, Duplikatvermeidung, abgestimmte Wiederaufnahme und Alarmierung implementieren und testen. |
| 4. Kundendokumente | Freigegebene, richtige PDFs | Geschäftsbedingungen aus der Datei mit Endkontrollvermerk in eine finale Kundenfassung überführen. Die vorhandene AVV ist TEST_ONLY; eine reale AVV samt Anlagen mit tatsächlichen Unterauftragsbearbeitern, Regionen, Datenarten, Löschfristen, Sicherheitsmassnahmen und Kontakt für Vorfälle erstellen und prüfen. Versionierung und Hashes festlegen. |
| 5. Make und E-Mail | Kontrollierter Versandpfad | Interner Test von 3/4 PDF-Anhängen über Gmail am 19.10. bestanden – nicht wiederholen. Als Nächstes echte automatische Auslösung, feste Empfängerfreigabe, finale Vorlagen, Versandstatus, Fehlerbehandlung und Duplikatvermeidung in den bestehenden Offerten-/Annahmeszenarien fertigstellen. Kundenversand und Versanddatums-Schritte bis Pilot-GO aus. |
| 6. Abnahme | Nachweisbarer Freigabestand | Tests für AVV Nein/Ja, abgelaufene/ungültige Links, doppelte Annahme, Airtable-Ausfall, Make-Ausfall, Drive-/PDF-Fehler, E-Mail-Fehler, Wiederanlauf und Audit-Readback in einer getrennten Produktionsvorbereitung bestehen lassen. Geheimnisse, personenbezogene Testdaten und Mailzustellung gesondert kontrollieren. |
| 7. Begrenzter Start | Ein benannter Pilotfall mit Rückfallplan | Verantwortliche, Supportweg, Beobachtungszeit, Erfolgskriterien und Rückfall auf manuelle Abwicklung festlegen. Erst nach bestandenem Abnahmesatz Dienste/Trigger für den konkreten Pilotfall aktivieren. |

## Bereits belegte Punkte

- Beide synthetischen Varianten AVV Nein/Ja wurden erfolgreich angenommen und in Firestore sowie Airtable zurückgelesen.
- Für beide Varianten wurden TEST_ONLY-Belege in Google Drive erzeugt und mit Airtable verknüpft.
- Separater einmaliger Make-Mailtransporttest an die private Outlook-Adresse des Betreibers erfolgreich (Szenario `8038287`, danach inaktiv; Gmail-Message-ID `1a1517624c90bef0`). Das belegt den Gmail-Transport samt Absenderalias. Die produktiven Offerten-/Annahmevorlagen, PDF-Anhänge und Kundenempfänger sind damit nicht getestet.
- **Interner PDF-Mailtransport erfolgreich:** On-demand-Szenario `7965246` lud unverbindliche PDFs aus dem geschäftlichen Drive und versandte via Gmail einmal drei Anhänge (AVV Nein, Ausführung `c463db431a3d45f086496da9d80a9e12`, SENT-ID `1a151831230512c5`) sowie einmal vier Anhänge (AVV Ja, Ausführung `dd3d356c56674c1ba3065ae62259a8a1`, SENT-ID `1a15182409e89326`), jeweils an die intern freigegebene Outlook-Testadresse. Beide Läufe ohne Modulfehler; Szenario anschliessend wieder deaktiviert. Keine separate Outlook-Zustellbestätigung, keine echte Kundenmail; automatischer Offerten-/Bestätigungspfad bleibt deaktiviert.
- Temporärer Cloud-E2E-Tag und zwei Testrevisionen wurden bereinigt; temporäre Secret-Zugriffe entfernt; Browser-Demo blieb zu 100 % auf der bisherigen Revision.
- Im Make-Read-only-Check vom 19.10.2026 waren die Szenarien 7835460, 7940261, 7940220, 7965215 und 7965223 inaktiv; alle meldeten null offene fehlgeschlagene Ausführungen.

## Startkriterium

Produktionsstart erst, wenn die sieben Ergebnisse oben als belegt dokumentiert sind, insbesondere finale Kundenunterlagen, isolierte Produktionsumgebung, sichere Kundenroute, getestete Wiederaufnahme und kontrollierter E-Mail-Pfad. Der bisherige Staging-Test belegt die technische Teststrecke, nicht die rechtliche, sicherheitstechnische oder betriebliche Produktionsfreigabe.
