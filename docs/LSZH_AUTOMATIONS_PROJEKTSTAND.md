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


### Nachgewiesener Preflight-Stand und neue Offline-Sicherheitslogik, 15.10.2026

- Die Cloud-Run-Revision `lszh-offer-portal-staging-00004-qt7` erhält 100 % Traffic und ist Ready. Nachweisbar eingebaut: `lszhPortalPreflight` mit Startup-Logs `IDENTITY_PASS`, `DRIVE_PASS`, `FIRESTORE_READ_PASS`. Die direkt aus Cloud Storage stammende Build-Source-ZIP enthält nur `index.js` und `package.json`; eine statische Analyse erkennt weder Offerten-API/HTTP-Routen noch `runTransaction`. **Preflight ist kein fertiges Kundenportal.**
- Die Website mit `server.js`, `offerte-annehmen/index.html` und `offerAcceptance.js` ist separat in GitHub entwickelt; `README.txt` benennt Render als Hosting. **Render-Live-Revision ungeprüft.** Der bisherige Annahmecode arbeitet mit Airtable und lediglich prozesslokaler Doppelannahme-Sperre; AVV fehlt in diesem Annahmepfad.
- Auf `feature/firestore-staging-dryrun-20261015` neu `firestoreAcceptanceState.js` und `test/firestoreAcceptanceState.test.js`: rein isolierter, nirgendwo angebundener Firestore-Transaktionskandidat. 7 lokale synthetische Tests bestanden; Fake-Transaktionen sind kein Cloud-End-to-End-Test. GitHub-CI enthält Testbefehle; Ausführung offen.
- Offen vor einem echten STAGING-Schreibtest: Feldmapping zwischen Offline-Fixture und Transaktionscode, Authentifizierungsarchitektur Render/Cloud Run, optionaler AVV-Archivpfad, tatsächliche Dienste/IAM/Deploystand, getrennte Test-Schreibfreigabe. **Cloud-Run-Preflight nicht überschreiben, keine E-Mails oder echten Annahmen aktivieren.**


### Update V4 – einheitliches Firestore-Staging-Schema (15.10.2026)

- `stagingOfferSchema.js` definiert ein **einheitliches Offline-Schema v1**; `scripts/prepare-firestore-staging.js` und `firestoreAcceptanceState.js` verwenden es. Der bisherige Unterschied von Fixture- und Annahmefeldern ist im Entwicklungszweig behoben.
- Gesperrte synthetische Fixtures haben `status=TEST_DRAFT_NOT_SENT`, `tokenHash=null`, `expiresAt=null`, alle Freigabe-/Zustell-/Archiv-Flags `false`; eine Annahme ist damit im Code nicht möglich.
- Lokaler Testnachweis: 12 neue Node-Sicherheitsprüfungen und 17 bestehende PDF-Python-Tests erfolgreich. Das ursprüngliche V3-PDF-Manifest ist mit dem V4-Mapping geprüft. **Keine GitHub-CI-/echte Firestore-Schreib-/Deployment-/End-to-End-Prüfung.**
- Artefakt `LSZH_Firestore_Staging_Testpaket_V4_20261015.zip` enthält 3 unveränderte synthetische PDF-Dateien, Manifest, Schema, isolierten Transaktionskandidaten und Tests. GitHub-CI-Datei erweitert.
- Unverändert offen: echte AVV-Prüfung im bestehenden Website-Backend, sichere Hosting-/Auth-Anbindung und benannter Firestore-Datenbankclient, allfälliger autorisierter Staging-Import sowie Rechtsprüfung RC1. Bestehender Preflight bleibt unangetastet.

### AVV-Absicherung und atomarer Annahme-Release-Gate – 15.10.2026

- Airtable `Offerten` hat die benötigten Felder bereits: `AVV erforderlich`, `Online-Annahme AVV Drive ID`, `Online-Annahme AVV-SHA256`, `Online-Annahme AVV-Version` und `Online-Annahme AVV ausdrücklich akzeptiert`; lesende Schemaprüfung, keine Airtable-Änderungen.
- Im GitHub-Staging-Branch wurden `offerArchiveVerifier.js`, `offerAcceptance.js`, `offerte-annehmen/index.html` und ihre Tests erweitert: AVV ist nur bei `Ja` sichtbar/verpflichtend; geschützter PDF-Abruf und Archiv-Hashprüfung vor jedem möglichen Commit.
- **Sicherheitskorrektur:** Der alte, nicht atomare Airtable-Status-`PATCH` wurde aus dem Annahmepfad entfernt. Ohne injizierten `commitAtomic`-Adapter antwortet dieser mit HTTP 503. `server.js` stellt keinen solchen Adapter bereit; Annahmen bleiben somit technisch blockiert.
- Syntaktische Prüfung der betroffenen JS-/HTML-Dateien bestanden. Zusätzliche Unit-Tests sind geschrieben, **noch nicht** unter Node/GitHub Actions ausgeführt. Kein Render-/Cloud-Run-Deployment, keine echte Firestore-Transaktion, keine E-Mails.
- Detaillierte Abnahmehinweise: `docs/LSZH_AVV_PORTAL_HARDENING_20261015.md`. Historisches `docs/offertenannahme-konzept.md` oben mit Warnung über inzwischen veraltete Airtable-PATCH-Aussagen markiert.

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
