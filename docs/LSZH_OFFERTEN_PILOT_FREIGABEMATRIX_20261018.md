# LSZH Automations – Freigabegrenzen für den Offerten-Pilot

Stand: 19.10.2026. Abgleich der dokumentierten Nachweise bis 18.10.2026; keine neue Live-Prüfung.
Verbindliche technische Übergabe: [Projektstand](LSZH_AUTOMATIONS_PROJEKTSTAND.md).
Diese Matrix ersetzt die frühere G1–G7-Arbeitsreihenfolge.

## Vorhandene Freigaben

| Umfang | Stand |
| --- | --- |
| Separater synthetischer Airtable-Schreibtest | Ausdrücklich freigegeben und abgeschlossen; kein Wiederholungsauftrag |
| Einmaliger privater synthetischer Cloud-Run-Staging-Test | Ausdrücklich freigegeben; Firestore-Seed erledigt, eigentliche Portal-Testrevision/HTTP-Annahme noch offen |
| Geschäftsregeln der Projektbedingungen | Intern bereits akzeptiert; nicht erneut abstimmen |

Der Cloud-Test ist auf den vorhandenen Testfall und die isolierte Staging-Prüfung begrenzt. Er erlaubt keine echten Kunden, produktiven Mails/Verträge, Main-Merge oder allgemeinen öffentlichen Go-Live. Benötigt der konkrete Testplan weitergehende Änderungen an Ingress/IAM, diese gesondert begründen und innerhalb der tatsächlichen Autorisierung behandeln.

## Noch zu erfüllende Schritte

| Bereich | Erforderliches Ergebnis | Einordnung |
| --- | --- | --- |
| Testzugang | Erreichbarer privater Testpfad, passende Runtime-Identität/Secrets, bestehender Traffic erhalten | Unmittelbarer nächster Schritt; internen Ingress und fehlende Firestore-Rechte des temporären Browserdienstes berücksichtigen |
| Durchgängige Annahme | Cloud-HTTP-Annahme → Firestore → Airtable mit Readback für synthetischen Testfall | Freigabe vorhanden, vollständiger Live-Nachweis fehlt |
| Beleg und Bestätigung | Bestehende Make-Strecke, richtige PDFs, Beleg und eindeutig nachvollziehbarer Versandstatus | Nicht durch bisherigen Emulator-/Airtable-Test belegt; konkrete Schreib-/Versandfreigabe beachten |
| Dokumente | Endgültige Kunden-PDFs und Versionen, rechtliche Endprüfung und konkrete AVV-Anlagen | Geschäftsbedingungen nicht erneut verhandeln; TEST_ONLY nicht in Echtverträge umdeuten |
| Kundenbetrieb | Tatsächlicher Kundenweg, passende Rechte/Verbindungen, Support, Fehlerbehandlung und Rückabwicklung | Vor begrenztem Kundenpilot konkret abschliessen |
| Pilotstart | Benannter Kunde, Leistungsumfang und ausdrückliches Aktivierungs-/Versand-GO | Noch nicht freigegeben |

## Fortgeltende Grenzen

- Bestehende Make-Szenarien bleiben laut letztem Nachweis inaktiv und ihre Sperren erhalten, bis die jeweilige konkrete Aktion autorisiert ist.
- Keine echten Verträge, produktiven E-Mails, externen Kundeneinladungen, allgemeine Aktivierung oder Main-Merge aus einem technischen PASS ableiten.
- Google Drive ausschliesslich geschäftlich. Drive-Schreibschutz nicht als WORM-Archiv darstellen.
- Frühere IAM-/CAS-Tests belegen ihren konkreten Prüfbereich, keine allgemeine Produktionsfreigabe.
- Firestore-Transaktion und Airtable-Update sind keine gemeinsame atomare Transaktion; unklare Folgeergebnisse kontrolliert nachbearbeiten.
- G3 bleibt zurückgestellt und technisch gesperrt. Kein neues G3-/Registry-/Pub/Sub-Programm als Voraussetzung für diesen Pilot.

Die alte detaillierte G1–G7-Matrix ist über den Historienlink im Projektstand erhalten. Ihre überholten Schritte sind keine aktuelle Arbeitsanweisung.
