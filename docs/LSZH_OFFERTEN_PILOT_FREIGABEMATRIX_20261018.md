# LSZH Automations – Freigabegrenzen für den Offerten-Pilot

Stand: 19.10.2026. Technischer Status und letzte Cloud-Nachweise: [Projektstand](LSZH_AUTOMATIONS_PROJEKTSTAND.md).

## Erledigt

| Bereich | Nachweis |
| --- | --- |
| Online-Annahme | Synthetische AVV-Nein- und AVV-Ja-Fälle live über Cloud Run angenommen; Firestore- und Airtable-Readback stimmten überein. |
| Dokumente und Beleg | AVV-Nein- und AVV-Ja-PDFs geprüft; Make-Belege im Geschäfts-Drive erzeugt und referenziert. Keine Kundenverträge. |
| Bestätigungsweg | Empfängerzuordnung und Anlagen statisch geprüft: 3 PDFs ohne AVV, 4 mit AVV. Versandmodule deaktiviert, Filter `0=1`; kein Mailversand ausgeführt. |
| Temporärer Cloud-Zugriff | Tag entfernt; Revisionen `00007-e2e` und `00008-json` gelöscht; beide temporären Secret-Berechtigungen entfernt. Revision `00009-avv` bleibt als neueste Revision retired, ungetaggt und ohne Traffic bestehen. Browser-Demo weiterhin 100 %. |

## Vor einem echten Kundenpilot

| Bereich | Noch erforderliches Ergebnis |
| --- | --- |
| Kundenunterlagen | Finale Kunden-PDFs und konkrete AVV-Anlagen festlegen; Projektbedingungen sind geschäftlich bereits akzeptiert. TEST_ONLY-Dateien bleiben ausschliesslich Testunterlagen. |
| Kundenablauf | Kundenroute, Make-Organisation, erforderliche Rollen/Verbindungen, Zuständigkeit und Support-/Fehlerweg für einen benannten Pilotfall festlegen. |
| Bestätigungsmail | Statische Prüfung ist bestanden. Vor einem echten Versand Absender, Empfänger, endgültige Anlagen und Versandfreigabe für den konkreten Kundenfall festlegen. |
| Pilotstart | Benannten Kunden und Leistungsumfang bestimmen; Aktivierung und produktive Kundenkommunikation nur im dafür freigegebenen Umfang ausführen. |

## Grenzen

- Synthetische Tests autorisieren keine echten Verträge, produktiven E-Mails, externen Einladungen, allgemeine Make-Aktivierung, Main-Merge oder öffentlichen Go-Live.
- Bestehende Make-Szenarien bleiben inaktiv; Mail- und Versanddatums-Module bleiben gesperrt.
- Airtable und Firestore bilden keine gemeinsame atomare Transaktion. Unklare Folgeergebnisse kontrolliert prüfen, nicht blind wiederholen.
- Nur das geschäftliche Google Drive verwenden.
- G3/Pub/Sub/Canary und Cockpit V2 bleiben zurückgestellt, solange sie keinen konkreten Pilot-Blocker beheben.

