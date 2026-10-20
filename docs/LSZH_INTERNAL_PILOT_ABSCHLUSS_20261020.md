# LSZH interner Pilot – Prüfstand 20.10.2026

Nur TEST_ONLY, kein Vertrag, kein Produktivstart.

- Bestehender Testdatensatz: `recR70ZSPynGqA1LS`.
- Ersatz der verlorenen Einladung unabhängig bestätigt; alter Zugang gesperrt.
- Neue private Einladung bleibt ausschliesslich auf dem Surface. Kein Token in diesem Bericht.
- Bestehender Build wiederverwendet; private Testrevision `lszh-offer-browser-staging-00010-lars`, kein normaler Traffic.
- Browser-Testannahme erfolgreich. Betreiber-Readback bestätigt Firestore/Airtable, Person, Zustimmungen, PDF-Hashes und Zeitstempel.
- Testtag und beide neuen temporären Secret-Grants entfernt; Demo 100 %, Produktion false.
- Beleg- und Bestätigungsstrecke erfolgreich: Make-Lauf `9d725883751c44ff8363e7ae64097991`, alle 15 Module je einmal, 0 Fehler.
- Testmail ausschliesslich an `lars.schulthess@outlook.com`, Versandzeitstempel 20.10.2026 17:14:15 Europe/Zurich. Der Nutzer hat Eingang und Öffnen aller drei PDF-Anhänge ausdrücklich bestätigt.
- Beleg-PDF `1N12eE6DgZ1mCQOpqXOHfAD31gvtNuXnk` im Testarchiv `10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko`, in Airtable zurückgelesen. PDF-Inhalt unabhängig über Drive gelesen: TEST_ONLY, kein Vertrag, korrekte Person, Record-ID, Testzeit und Dokument-Hashes.
- Rechtliche Freigabe, Echtbetrieb und Versandfreigabe weiterhin leer/false. Keine Kunden-/Auftragsverknüpfung am Testrecord; Übernahmesperre weiterhin true.
- Make-Szenario `7940220` wieder inaktiv. Alle Modulkonfigurationen, Filter und der ursprüngliche 15-Minuten-Zeitplan stimmen mit der vor dem Test gespeicherten Fassung überein. 0 unvollständige Ausführungen. AVV-Ja-Szenario `7965223` weiterhin inaktiv und unverändert.

## Ergebnis und Grenzen

Der interne End-to-End-Ablauf **AVV Nein** ist erfolgreich: private Einladung → Browserzustimmungen → Firestore/Airtable → Testbeleg → Testarchiv → Outlook-Mail mit drei lesbaren PDFs. Kein Produktivstart und kein rechtsverbindlicher Kundenabschluss.

Die Hash-/Ordner-/Schreibschutzfilter der Belegstrecke wurden erfolgreich durchlaufen. Einzelne gespeicherte Make-Modulpakete waren über den Connector nicht verfügbar; ein separater aktueller SHA-256-/Schreibschutz-Readback des neuen Belegs wurde daher nicht behauptet. Drive bestätigte unabhängig Datei, PDF-Inhalt und Testarchiv-Parent.

## Zusätzliche lokale Tests

- Neue Surface-Helfer: 11 gezielte Tests bestanden.
- Unveränderter Windows-Projektordner: 248 Tests bestanden, 4 fehlgeschlagen, 5 übersprungen. Ursachen: Bash fehlt im Suchpfad und CRLF-Zeilenenden in Shell-Prüfungen.
- Isolierte Kopie des Git-HEAD mit vorhandenem Git-Bash und ausschliesslich dort auf LF normalisierten Shell-Dateien: **252 bestanden, 0 fehlgeschlagen, 5 übersprungen** (257 gesamt).
- Emulator-/Browser-/Docker-CI wurde in dieser Sitzung nicht neu ausgeführt. Keine pauschale Freigabe der Variante AVV Ja oder der Produktivumgebung.

## Verbleibende Arbeit

- Windows-Testumgebung dauerhaft für Bash und LF-Zeilenenden festlegen; die isolierte Normalisierung hat den Projektordner nicht geändert.
- Projektdokumentation aktualisieren: ein separat bereitgestellter Patch enthält den neuen Stand, wurde im schreibgeschützten Projektordner noch nicht angewandt.
- Für einen Kundenstart bleiben die gesonderten Freigaben und bei AVV Ja die individuellen Anlagen erforderlich. Dieser interne Test ersetzt keine Kundenfreigabe.

[Testbeleg in Drive](https://drive.google.com/file/d/1N12eE6DgZ1mCQOpqXOHfAD31gvtNuXnk/view)

Verwendete Make-Skills: `make-scenario-building` und `make-scenario-operations`. Zusätzliche Readbacks über Airtable und Google Drive. Keine geheimen Einladungen, Tokens oder Zugangsdaten im Bericht.
