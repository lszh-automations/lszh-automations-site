# LSZH Automations – Produktionsbereitschaft

Stand: 20.10.2026. Kein Produktivstart freigegeben. Noch kein konkreter Kunde für den ersten Pilot ausgewählt (Betreiberantwort).

## Abgeschlossen

- Interne synthetische Annahmen und Beleg-/Mailtests für AVV Nein/Ja; bestätigter Eingang und drei beziehungsweise vier lesbare PDFs. Bereits erfolgreiche Tests nicht zurücksetzen oder wiederholen.
- Lokaler interner Wiederanlauf: Desktop-Anmeldung, Windows-verschlüsselte Ablage, Firestore-/Drive-Lesetest sowie zwei reale `ALREADY_SENT`-Negativläufe bestätigt. Nur interne Testrecords; keine allgemeine Kunden-Wiederanlaufstrecke.
- Commit `43661d3`: vier GitHub-Prüfjobs sowie separater Build-only-Lauf grün. Keine Bereitstellung durch diese Workflows.
- Vorhandene Cloud-Run-/Firestore-/Firebase-/Drive-Grundlage und produktive Lesepfade wurden bereits am 19.10. bestätigt; dies wurde heute nicht erneut geprüft. Die Architektur bleibt Cloud Run plus bestehende Make-Szenarien. Das Surface braucht dafür keine Daueraufgabe.
- Am 20.10. beide bestehenden Kunden-Bestätigungsszenarien um atomare einmalige Reservierung und frische Freigabeprüfungen ergänzt; weiterhin inaktiv. Native Create-Sperre in Staging und 13 isolierte Make-Filterfälle bestanden. Details und Grenzen: [Kundenstrecke-Sicherungen](LSZH_KUNDENSTRECKE_SICHERUNGEN_20261020.md).

## Noch erforderlich für einen begrenzten Kundenpilot

1. Tatsächlichen Kunden und Offertendatensatz festlegen. Reale Empfängeradresse, Leistung, Preise, Zahlungsmodell, Gültigkeit und Dokumentversionen prüfen. Keine Testofferte als echten Vertrag umbenennen.
2. Kundenunterlagen final zuordnen. Projektbedingungen v1.0 sind geschäftlich freigegeben. Bei AVV Ja die sachlich richtigen Anlagen A/B/C fertigstellen, genehmigen und als eigene finale PDF binden; die Rahmenvorlage allein genügt nicht. [Freigaberegister](LSZH_VERTRAGSFREIGABE_20261019.md).
3. Produktive Berechtigungen für die neue Make-Firestore-Reservierung und die endgültige Konfiguration vor dem kontrollierten Erstlauf bestätigen. Der Staging-Nachweis ersetzt diese Prüfung nicht.
4. Nach ausdrücklicher Freigabe genau einen Kundenfall durch die endgültige Strecke begleiten: Link, Vorschau, PDF-Download, getrennte Zustimmung, Firestore-Annahme, Airtable-Writeback, einmaliger Beleg und Bestätigung an den geprüften Empfänger. Erst hierbei kann die vollständige Produktionsstrecke abgenommen werden.
5. Erfolg und Fehlerpfad mit dem Betreiber abgleichen. Für den begrenzten Erstpilot ist die unmittelbare manuelle Überwachung vorgesehen. Unbeaufsichtigter Serienbetrieb benötigt noch eingerichtete und geprüfte Fehleralarmierung.

## Grenzen des heutigen Nachweises

Keine neue Live-Kundenannahme, kein produktiver Reservierungs-Schreibtest, kein Erstversand durch die geänderten Make-Szenarien, kein Deployment, kein Merge nach main und kein Kunden-Go-live. Kunden-Szenarien sowie zusätzliche Testwerkzeuge sind inaktiv; null unvollständige Ausführungen beim Abschlussreadback.

Die Produktivflag wurde in diesem Arbeitsschritt nicht geändert. Der zuletzt bestätigte Portalzustand bleibt eine historische Ausgangsbasis, kein heute erneuerter Live-Readback. Der erste Kundenstart erfordert den ausdrücklichen betreiberseitigen Pilotauftrag und die oben genannten Prüfungen.
