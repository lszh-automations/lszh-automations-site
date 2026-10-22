# Lokaler interner Wiederanlauf: Live-Prüfung

Am 20.10.2026 vom Benutzer aus PowerShell auf dem Surface ausgeführt und durch die zurückgegebenen Ergebnisse bestätigt:

- `LOCAL_RUNTIME_AUTHORIZED`: Geschäftskonto `lars@lszh-automations.ch`; Zugangsdaten für den Windows-Benutzer verschlüsselt gespeichert; keine Mail versendet.
- `LOCAL_RUNTIME_READONLY_PASS`: beide hinterlegten Beleg-Pins erfolgreich mit Drive-Metadaten verglichen; null Firestore-Schreibzugriffe, null PDF-Downloads, kein Mailversand.
- Manueller Lauf für `recR70ZSPynGqA1LS`: `ALREADY_SENT`, `canSend: false`, `canCreateReceipt: false`.
- Manueller Lauf für `recktLXj5wUxLmHFQ`: `ALREADY_SENT`, `canSend: false`, `canCreateReceipt: false`.

Vorherige Korrekturen: falsche Zeichencodierung des ersten Übernahmepatches behoben; sieben gezielte Tests bestanden. Die Gmail API wurde nach fehlendem Eintrag in der Liste aktivierter APIs im vorhandenen Projekt zur Aktivierung angewiesen; die anschliessende erfolgreiche Gmail-Profilprüfung bestätigt den funktionierenden Zugriff. Der vorherige vollständige lokale Testlauf hatte 288 Tests, 282 bestanden, sechs Emulatorfälle übersprungen, keine Fehler.

Die früher im Einrichtungsbericht als ausstehend bezeichnete lokale Anmeldung, Windows-Speicherung und lesende Provider-Prüfung sind damit erfolgreich abgeschlossen. Die tatsächliche erstmalige Zustellung über diese neue Wiederanlaufstrecke wurde nicht ausgeführt; beide erlaubten Testfälle waren bereits zugestellt und wurden unverändert belassen. Es gibt keinen Nachweis eines neuen Live-Erstversands und keine Produktivfreigabe. Keine automatische Ausführung oder Deployment-Einbindung eingerichtet.

Die lokal installierten Bibliotheken unter `cloud-run/offer-portal-staging/node_modules/` sind keine Quelländerungen und werden nicht committed. Zugangsdaten und heruntergeladene OAuth-JSON gehören ebenfalls nicht in Git.
