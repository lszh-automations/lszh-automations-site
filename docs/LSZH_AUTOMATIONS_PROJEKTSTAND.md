# LSZH Automations – Projektstand & Betriebsentscheidungen

_Stand: 15.10.2026. Interne Arbeitsdokumentation. Keine Passwörter, API-Schlüssel oder Token hier eintragen._

## Update 15.10.2026 – Firestore-STAGING, ausschliesslich synthetisch

- Google Cloud Console: Projekt-ID `lszh-automations`, Datenbank-ID `lszh-offers-staging`, Region `europe-west6`. Die Datenbank wurde als **vorhanden und leer** bestätigt. V2-Testmanifest verwechselte Projekt- und Datenbank-ID; V3 korrigiert dies.
- ZIP-Gesprächsartefakt `LSZH_Firestore_Staging_Testpaket_V3_20261015.zip`: drei simulierte PDF-Dateien, lokale SHA-256-Prüfungen und Firestore-Mapping. Insgesamt 17 Python- und 16 Node-Prüfungen lokal bestanden. Dies beweist **keine** Cloud-End-to-End-Verbindung.
- Entwicklungszweig `feature/firestore-staging-dryrun-20261015`: `scripts/prepare-firestore-staging.js`, `test/firestoreStagingDryrun.test.js` und `docs/LSZH_FIRESTORE_STAGING_UEBERGABE_V3_20261015.md`. Kein Merge auf `main`.
- Vorschlag `stagingOfferFixtures` ist **nicht** als im deployten Cloud-Run-Portal vorhandene Collection bestätigt. Die Datenbank wurde nicht beschrieben. Die bestehenden produktiven Make-/Mail-/Annahmewege bleiben inaktiv.
- Offene technische Freigaben: echtes Business-Drive-Archiv-Readback samt SHA/Zugriffsprüfung, Firestore-MCP-Berechtigung, aktuelles Cloud-Run-Collection-Schema, separater Test-Schreibentscheid. Token-Herkunft ungeprüft; Firestore-Vorschlag enthält `tokenHash=null`.
- Vor produktiver Verwendung bleiben juristische Prüfung von Projektbedingungen v1.0 RC1 und AVV RC1 sowie gesonderte Freigaben offen.

### Verifizierter Geschäftsarchiv-Stand 15.10.2026

- Make-Verbindung `11904271` (`lars@lszh-automations.ch`) meldet `ok`. Read-only Audit 7965546 vom 15.10. bestätigte Archiv-Eigentum mit HTTP 200.
- Vorhandene ältere synthetische PDF-Testserie wurde am 14.10. in Make 7965246 aus dem privaten Geschäftsarchiv **binär** erfolgreich gelesen: Offerte, Projektbedingungen, AVV und simulierter Annahmebeleg; Vier-Anhangs-Modus bestand, kein Mailversand. Die ersten drei PDFs besitzen korrekte SHA256, eigenen Geschäftsinhaber, keinen öffentlichen Share und aktiven Drive-Bearbeitungsschutz.
- Diese frühere Geschäftskonto-Testserie ist **nicht identisch** mit den drei lokalen PDFs aus Paket V3. Nicht vermischen, keine Remote-Datei-IDs aus lokalen Prüfsummen ableiten.
- Ohne Firebase-/Cloud-Run-API-Zugriff bleibt das tatsächlich bereitgestellte Firestore-Collection-Schema offen; die Datenbank wurde noch nicht beschrieben.
- Isolierte CI-Datei `.github/workflows/firestore-staging-check.yml` für lokale Tests ohne Cloud-Credentials ergänzt. Keine Produktivaktivierung.

## Geschäftsmodell / Eigentümerschaft

- LSZH Automations erbringt Beratung, Entwicklung, Einrichtung, Tests, Dokumentation und optionale Wartung für Schweizer KMU.
- **Kundenbetrieb:** Der Kunde nutzt eine eigene Make-Organisation und behält deren Kontrolle, Abrechnung, Ressourcen und Szenarien. Unser Zugang erfolgt über eine gezielte Einladung mit angemessener Berechtigung.
- Make-Pläne und -Credits werden vom Kunden direkt mit Make abgerechnet. LSZH stellt separat Dienstleistungen und laufende Betreuung in Rechnung.
- Der Erstkontakt und die Offerte setzen keine Registrierung bei Make voraus. Registrierung/Einladung folgen erst nach Annahme.
- Möglichst OAuth/Anbieterfreigaben verwenden. Keine Kundenpasswörter per Mail oder in Airtable abfragen.

## Prozess (verbindliches Zielbild)

1. Anfrage über LSZH-Website: Problem, Unternehmensdaten und Kontakt.
2. Rückfrage/Analyse, Offerte und allfällige vertragliche Vereinbarungen.
3. Annahme der Offerte und ausgelöstes Projekt-Onboarding.
4. Onboarding sammelt Rechnungsdaten, Anforderungen, Systemnamen, Status der kundeneigenen Make-Organisation und Stand der Einladung.
5. LSZH prüft Angaben, Kundenorganisation und benötigte Rollen. Bei Bedarf unterstützt LSZH Registrierung und Einladung.
6. Technische Verbindungen entstehen **in der Make-Organisation des Kunden**, möglichst durch den Kunden selbst mit OAuth.
7. Entwicklung, Funktionstests, Dokumentation, Kundenfreigabe und Go-Live im Kundenkonto.
8. Betrieb/Betreuung über separaten Servicevertrag. Kundeninhaberschaft und Freigaben bleiben erhalten.

## Bereits umgesetzt

- Öffentliche Website mit Kontakt, Leads, Offerten/Rechnungen und persönlichem Kunden-Onboarding (bestehender Prozess beibehalten).
- Formular `/onboarding/`: zusätzlicher Abschnitt **Make & technische Einrichtung** mit optionalem Organisationsnamen und Angaben zu Konto-/Einladungsstatus. Keine Secrets.
- Airtable `Kunden-Onboarding`: Felder **Make-Konto Status**, **Make-Organisation**, **Make-Einladung Status**, **Make-Einrichtung Hinweise**.
- Make `LSZH Kunden-Onboarding – Eingang`: Feldzuordnung auf diese Airtable-Spalten ergänzt.
- Make `LSZH Projekte – Onboarding anfordern`: Einladungsmail nach Offertenannahme erklärt das kundeneigene Make-Modell.
- Bestätigungsmail nach Onboarding: erklärt Organisation, Einladung und nächste Schritte.
- Kundenanleitung `/make-start/` erstellt und im Formular sowie in den E-Mails verlinkt.
- Drei alte Make-OAuth-Szenarien des früheren LSZH-eigenen Kontomodells als **ARCHIV – ALTES MODELL** gekennzeichnet und unverändert inaktiv belassen.
- Secure Transfer funktional mit Dummy-Schlüssel getestet: verschlüsselte Speicherung, einmaliger Abruf, Löschung der gespeicherten verschlüsselten Daten. Noch **nicht** für reale Kundenzugangsdaten freigegeben.

## Status / Sicherheit

- Onboarding-Anforderung und Eingangsszenario bleiben vorerst inaktiv, bis ein vollständiger Test mit einer vereinbarten Testofferte durchgeführt wurde. Keine unaufgeforderten Mails auslösen.
- Die Schlüssellieferung über Secure Transfer darf noch nicht produktiv eingesetzt werden, bis die Make-Webhooks authentifiziert und der parallele Abruf wiederholt getestet wurden.
- Neue Make-Verbindungen müssen gegen die jeweilige Kundenorganisation und deren Rollen geprüft werden. Alte LSZH-eigene OAuth-Automationen nicht reaktivieren.
- Make-Plan und Berechtigungen nach tatsächlichem Kundenbedarf prüfen. Nicht jedes Abonnement bietet identische Team-/Rollenoptionen.

## Nächste Tests

1. Neues Formular im Browser prüfen (Desktop / Mobile).
2. Mit freigegebenem Testprojekt Onboarding durchspielen; vier Make-Felder in Airtable kontrollieren.
3. Versand und Inhalt der zwei Kundenmails testen, bevor bisher inaktive Szenarien wieder aktiviert werden.
4. Einladung in eine vom Kunden verwaltete Testorganisation prüfen, ohne dessen Zugangsdaten einzusehen.
5. Kunden-Szenario dort erstellen, mit kundeneigener Verbindung autorisieren und Test/Übergabe dokumentieren.
6. Secure Transfer erst nach separater Security-Abnahme für Ausnahmen nutzen.

## Betrieb / Quellen

- [Website – Kunden-Onboarding](https://www.lszh-automations.ch/onboarding/)
- [Website – Make-Kundenanleitung](https://www.lszh-automations.ch/make-start/)
- [Make – Organizations](https://help.make.com/organizations)
- [Make – Teams](https://help.make.com/teams)
- [Make – Preise/Funktionen](https://www.make.com/en/pricing)

Letzte Architekturentscheidung: 13.10.2026 – Kunden besitzen ihre eigenen Make-Organisationen.
