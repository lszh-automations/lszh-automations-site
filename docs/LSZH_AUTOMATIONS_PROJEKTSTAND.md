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


### Keyless Firestore-Client – isolierte Read-only-Vorbereitung (15.10.2026)

- Neu `stagingFirestoreConnection.js` und `test/stagingFirestoreConnection.test.js`, ausschliesslich im Entwicklungszweig. Der Client verweist **explizit** auf Google-Cloud-Projekt `lszh-automations`, benannte Datenbank `lszh-offers-staging`, Collection `stagingOfferFixtures`.
- Strikte Schutzregeln: nur künftig **eigener** Dienst `lszh-offer-acceptance-staging` mit Cloud-Run-Dienstidentität, keine exportierten JSON-Key-Dateien, kein öffentlicher Remote-Emulator; die bestehende Preflight-Funktion bleibt unverändert. Die öffentliche Website erhält keinen direkten Datenbankzugriff.
- Aktuell **nur read-only Fassade** `readFixture(id)`, keine rohe SDK-Referenz und keine Schreib-/Transaktionsmethoden. Dokument muss `schemaVersion=1`, `testOnly=true` und passende Fixture-ID enthalten. Der Cloud-Run-Backend-Dienst ist **noch nicht erstellt oder deployt**; der Website-Aufruf zu Cloud Run ist **noch nicht authentifiziert**.
- 7 neue Unit-Tests und lokal mit den bisherigen 9 Transaktions- und 3 Schema-Tests insgesamt **19/19 bestanden**. Zusätzlich ist ein ausschließlich opt-in aktivierbarer lokaler Emulator-Doppelannahmetest in `test/firestoreEmulator.integration.test.js` vorbereitet. Standard-Node-Lauf: **19 bestanden, 1 sicher übersprungen, 0 fehlgeschlagen** – **kein echter Emulator-Lauf**. Fake-Client-Test, **kein** echter Firestore-IAM-Test oder Cloud-Firestore-Emulator-Test. GitHub-Actions-Workflow für Offline-Prüfungen ergänzt, tatsächlicher CI-Lauf noch offen.
- Technik-/Sicherheitsentscheidung und verbleibende Hosting-Optionen: `docs/LSZH_FIRESTORE_KEYLESS_CONNECTION_STAGING_20261015.md`. Vor echtem Firestore-STAGING-Schreibtest explizite gesonderte Autorisierung, Berechtigungskontrolle und sichere Authentifizierung nötig. Aktuelle RC1-Rechtsfreigabe fehlt.

### Staging-Offertengateway & geschützte Kundenlinks – 15.10.2026

- Neuer GitHub-Entwurf `services/offer-acceptance-staging/{app.js,index.js,Dockerfile,test/app.test.js}`. Separater, geplanter Cloud-Run-Dienst `lszh-offer-acceptance-staging` soll künftig **Offertenoberfläche und API unter demselben Origin** führen. Die bestehende Render-Website bleibt auf Render, die Cloud-Run-Preflight-Revision bleibt unverändert.
- **Noch nicht deployt**, keine Domain/Servicekonten/Firestore-Daten angefasst; APIs `/api/offer/preview`, `/api/offer/document`, `/api/offer/accept` antworten **immer 503**. Der Dienst lädt keine Datenbank und verschickt nichts.
- Testbeleg: 11 lokale Node-Gateway-/Link-Tests bestanden; CSP-Hashes, No-Store/No-Referrer/No-Index, CORS verweigert und keine Zustandsänderungen. GitHub-CI noch nicht bestätigt; Docker-Image noch nicht gebaut. Nach Abgleich einer alten lokalen Testkopie bestanden zusammen mit den verfügbaren Offline-Firestore-Tests 38 Node-Tests, 1 Emulator-Test übersprungen, 0 Fehler (kein Cloud-Test).
- Die Offertenoberfläche liest den geheimen Link-Token künftig ausschliesslich als URL-Fragment `#code=...`, nicht mehr als Queryparameter. Veraltete `?code=`-Links müssen vor jedem späteren Go-live bewusst migriert werden. Der bislang nicht atomare direkte Linkaussteller `scripts/issue-offer-link.js` ist im Entwicklungszweig hart deaktiviert.
- Künftige öffentliche Kundenlinks brauchen robuste Firestore-Ausstellung/Transaktion, Authentifizierungs-/Rate-Limit-Schutz, richtige private Drive-PDFs mit AVV, Wiederanlauf der Airtable-/Make-Synchronisation und Rechtsfreigabe. Technische Doku: `docs/LSZH_OFFER_GATEWAY_STAGING_20261015.md`.

### Lokaler HTTP-Doppelannahmetest & Emulatorvorbereitung – 15.10.2026

- Im GitHub-Entwicklungszweig verbindet ein ausschliesslich lokaler **Testhandler** die HTTP-Staging-App mit `firestoreAcceptanceState.claimOfferOnce`. Er verwendet nur lokale synthetische PDF-Bytes und einen serialisierenden Fake-Firestore-Store, nicht das Google-Cloud-Projekt. Produktive API-Routen `/api/offer/{preview,document,accept}` bleiben 503.
- Die Testnaht `/__local_fixture/claim` erfordert `NODE_ENV=test`, kein `K_SERVICE`, beidseitige Loopback-TCP-Verbindung und explizite Handler-Injektion; im Cloud-Run-Entrypoint nicht injiziert und im Docker-Bauplan nicht enthalten.
- **20 lokale Gateway-/Linktests in Node.js 22 bestanden, keine Fehler**: genau eine Annahme bei zwei gleichzeitigen HTTP-Anfragen, AVV-Einwilligung, manipulierte Tokens/Hashes, veränderte synthetische PDF-Datei und Produktionssperren. **Nur Fake-Transaktionen, nicht die tatsächliche Firestore-Transaktionsengine.**
- Neuer separater, opt-in geschützter Integrationstest für zwei unabhängige Firestore-SDK-Clients gegen einen **lokalen Firestore-Emulator** vorbereitet. Emulator und SDK stehen hier nicht zur Verfügung; daher noch kein echter Emulator-Lauf. CI-Workflow mit Test ergänzt, standardmässig im Skip-Modus; tatsächlicher CI-Lauf weiter unbestätigt.
- Dokumentation: `docs/LSZH_LOKALER_HTTP_TRANSAKTIONSTEST_20261015.md`. Kein Deployment, kein Cloud-Run-Dienst, keine Berechtigungen/Datensätze/Make-Szenarien geändert.

### ✅ Firestore-Emulator – erstmals echter Transaktionsnachweis (15.10.2026)

- **GitHub Actions erfolgreich:** [erster Emulatorlauf #38769381514](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38769381514) und [DB-Isolationslauf #38769645834](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38769645834). Jeweils **7/7 Sicherheitschecks plus 2/2 echte Firestore-SDK-Integrationstests**, keine Fehler. Dies ist nicht mehr nur ein serialisierender Fake.
- Beide unabhängigen Firestore-Clients im lokalen Emulator: bei zwei gleichzeitigen Annahmeversuchen genau ein Erfolg; zweite Antwort 409; gespeicherter Status `ACCEPTED`, `reconciliationStatus=PENDING`. AVV-Hash-Manipulation blockiert. Der zweite Lauf bestätigt ausserdem einen nicht vorhandenen identischen Dokumentpfad in `(default)` bei Verwendung der benannten Testdatenbank.
- **Zusätzliche Sicherheit:** Emulator-Modus fordert nun das **Firebase-Demoprojekt `demo-lszh-offers`** statt `lszh-automations`, die genaue Datenbank-ID `lszh-offers-staging` und `127.0.0.1:8080`; kein IAM-/Cloud-Schreibzugriff auf das echte Google-Cloud-Projekt.
- Einschränkung: Firebase-CLI warnte zugleich, dass mehrere Datenbanken im Emulator nicht voll unterstützt seien. Die Isolation wurde **beobachtet**, aber echte Google-Cloud-Firestore-Laufzeit, IAM, Drive-/PDF-Readback, tokenisierte Linkausstellung und Airtable-Reconciliation bleiben **ungeprüft**.
- Einzelheiten und Originalbelege: `docs/LSZH_FIRESTORE_EMULATOR_ABNAHME_20261015.md`. Vorherige Textabschnitte, die einen Emulatorlauf als offen nennen, sind **historische Zwischenstände** und durch diesen Nachweis technisch aktualisiert.
- **Weiterhin keine** Cloud-Run-Deployments, Firestore-Schreibzugriffe ausserhalb des kurzlebigen lokalen Emulators, echte Kundenannahmen oder produktive E-Mails.

### Synthetische Linkausstellung – atomarer Emulatornachweis (15.10.2026)

- Auf `feature/firestore-staging-dryrun-20261015` neues isoliertes Modul `syntheticOfferIssuance.js`. Es erzeugt **256-Bit-Random-Token**, legt **nur SHA-256** in genau einem `stagingOfferFixtures/LSZH-EMULATOR-...`-Testdatensatz ab und verwendet `db.runTransaction` mit Wiederholungs-/Doppel-Commit-Sperre. Archiv-Hashes für lokale synthetische Offerte/Bedingungen/AVV und `Europe/Zurich`-Gültigkeit werden vor Commit abgeglichen. Keine Drive-/Make-/Airtable-/Kundenanbindung.
- Ergebnisstatus **`TEST_ISSUED_NOT_DELIVERED`**, `deliveryConfirmed=false`, `deliveryEnabled=false`, `acceptanceEnabled=false`, `legallyApproved=false`. Selbst mit korrekt zurückgegebenem Testtoken ist **keine Vertragsannahme möglich**. Die vorhandenen V4-Fixtures bleiben blockiert; reale RC1-Freigaben fehlen.
- Echter [GitHub-Actions-Test #38771010960](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38771010960): **18/18 Unit-/Sicherheitschecks plus 3/3 echte Emulator-Integrationstests bestanden**, davon neuer Nachweis für zwei unabhängige konkurrierende Aussteller (genau ein gespeicherter Tokenhash), geschützte PDF-Hashes und nicht annehmbaren Endzustand. Spätere verschärfte Negativtests (Cloud-Run-Identität, ungültige Kalenderdaten) laufen separat in CI; der anfänglich belegte Run bleibt als unabhängiger Erfolg gültig.
- `scripts/issue-offer-link.js` bleibt gesperrt, geplante Kunden-Gateway-API liefert weiterhin HTTP 503. Dieser Ausstellungsprototyp ist **nicht** produktionsfähig. Das Risiko eines verlorenen Klartexttokens nach Commit und die revidierbare, sichere Zustellung müssen vor Kundenbetrieb gelöst werden.
- Detailbericht: `docs/LSZH_LINKAUSSTELLUNG_EMULATOR_20261015.md`. Noch zu erledigen: RC1-/AVV-Rechtsfreigabe, archivierte kundenbezogene PDFs nachweislich aus Drive lesen, eigener auth-geschützter Issuance-Dienst, Widerruf/Neuausgabe, idempotente Firestore→Airtable-/Make-Reconciliation, separater autorisierter **echter** Staging-Test.

### Firestore → Airtable: sicherer Wiederanlauf & deduplizierter Annahmenachweis (15.10.2026)

- `firestoreReconciliation.js`: isolierter **test-only** Baustein im GitHub-Entwicklungszweig, keine Verbindung zu Airtable/Make/E-Mail. Bindet eine akzeptierte synthetische Offerte an deterministische `eventId`, einmaligen zweiminütigen Firestore-Lease und einen **read-only verifizierbaren** Airtable-Feldplan auf Grundlage der vorhandenen Offerten-/Bedingungen-/AVV-Hashes, Vertragsversion und Annahme-Evidenz. Vorhandene Airtable-Tabellenfelder wurden lesend kontrolliert, keine neuen Felder.
- Zustände: `PENDING → LEASED → SYNCED` nur bei unabhängig eingelesenem, exakt übereinstimmendem Remote-Nachweis. Parallel laufende Worker werden ausgeschlossen. Nach unbekanntem Ausgang/abgelaufenem Lease folgt `NEEDS_REVIEW`, **kein blindes zweites PATCH**. Ein später nachgewiesener bereits korrekter Remote-Eintrag kann ohne erneute Remote-Schreibung sicher als `SYNCED` quittiert werden; fehlender/abweichender Nachweis bleibt prüfpflichtig.
- **GitHub Actions Run [#38773121610](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38773121610) tatsächlich erfolgreich:** **29/29 Sicherheits-/Unit-Tests und 5/5 echte Firestore-Emulator-Integrationstests**. Getestet wurden Doppel-Leases, Crash, Stale Worker, Readback-Evidenz, gezielter Wiederanlauf, Manipulationen und die bisherigen Link-/Annahmefälle. Firebase-Emulator verwendet ausschliesslich `demo-lszh-offers`; keine echte Google-Cloud-Datenbank.
- **Wesentliche Grenze:** Ein echter Airtable-PATCH und eine unabhängige lesende Remote-Verifikation sind **noch nicht implementiert**; die Testfälle speisen fingierte Airtable-Felder. Firestore und Airtable sind nicht gemeinsam transaktional; eine theoretische globale Exactly-once-Garantie wurde **nicht** nachgewiesen. E-Mail und Make bleiben hart ausgeschlossen. Für echte Synchronisierung fehlt zudem die verlässliche `airtableRecordId` im angenommenen Firestore-Datensatz; bisher nur synthetische Test-ID.
- Testbericht `docs/LSZH_AIRTABLE_RECONCILIATION_EMULATOR_20261015.md`. Produktive Abschluss-E-Mails, PDF-Belegarchivierung, Make-Onboarding, RC1-Rechtsfreigabe, echte GCP-IAM-/Staging-Tests bleiben separat **offen**. Keine Änderungen an produktiven Cloud-Run-Revisionen, Airtable-Datensätzen oder Make-Szenarien.

### Airtable-Datensatz eindeutig und sicher in Firestore zuordnen – 15.10.2026

- Neue ausschliesslich **synthetische** Module `syntheticAirtableBinding.js`, `airtableReadonlyRecord.js` und drei neue Testdateien im bestehenden Branch. Die Bindung prüft unabhängig gelesene (im Test **simulierte**) Airtable-Felder: Record-ID, Offertennummer, Empfänger, Status, Gültigkeit, Projektbedingungen-Version, PDF-SHA256, Drive-Datei-IDs und AVV-Versions-/Prüfsummendaten.
- Eine Firestore-Transaktion schreibt `airtableRecordId` und einen Bindungsfingerabdruck in die betreffende Fixture **und** erzeugt einen eindeutigen Guard `stagingAirtableBindings/{recordId}`. Zwei parallele Firestore-Fixtures können deshalb nicht denselben Airtable-Datensatz binden. Mehrfachzuordnung, Replay, abweichende Vertragsdokumente, versehentliche Freigaben oder nicht-synthetische Empfänger werden abgewiesen. Kein Token, keine Annahme, keine E-Mail.
- Der lesende Airtable-Transport ist explizit als **GET-only mit festem HTTPS-Host**, streng validierten IDs und ohne Standard-Credentials implementiert. Er wurde nur mit einem erfundenen `fetchImpl` und synthetischem Testtoken getestet – **noch keine echte Airtable-API-GET-/PATCH-Verbindung, kein echtes Airtable-Record gelesen oder beschrieben**.
- GitHub Actions [Run #38774815271](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38774815271) **erfolgreich**: **44/44 Unit-/Sicherheitsprüfungen** sowie **6/6 echte Firebase-Firestore-Emulatortests**, keine Fehler/Skips. Der Emulator verwendete nur `demo-lszh-offers`, keine produktive GCP-Datenbank; Warnung zur unvollständigen Multi-Datenbank-Unterstützung weiterhin vorhanden.
- **Noch offen:** die Bindung ist noch nicht verpflichtender Bestandteil des vorherigen synthetischen Ausstellungs-/Annahmepfads, ein authentifizierter echter Airtable-GET mit minimaler Berechtigung, eine geprüfte Cloud-Identität, Laufzeit-Readback bei Änderungen in Airtable, sichere idempotente Echt-PATCH-/Outbox-Auslieferung und alle RC1-/AVV-Freigaben. Kein Cloud Run/Render/Make/Airtable produktiv verändert.
- Detailbericht: `docs/LSZH_AIRTABLE_FIRESTORE_BINDING_20261015.md`.

### Pflichtbindung vor Ausstellung und Annahme – Gesamtprüfung bestanden (15.10.2026)

- Im GitHub-Entwicklungszweig sind `syntheticOfferIssuance.js` **und** `firestoreAcceptanceState.js` jetzt zwingend mit dem `syntheticAirtableBinding.js`-Zuordnungsfingerabdruck und dem eindeutigen `stagingAirtableBindings/{airtableRecordId}`-Guard verknüpft. Angebot und Guard werden jeweils **innerhalb derselben Firestore-Transaktion** geprüft, bevor ein synthetischer Tokenhash erstellt oder ein hypothetischer Annahmestatus geschrieben wird.
- Ungültige/fehlende Bindungen, abweichende PDF-Drive-IDs, Hashes, AVV, Empfänger sowie Replay/Doppelannahme werden blockiert. Der vollständige synthetische Issuer bleibt **`TEST_ISSUED_NOT_DELIVERED`**, ohne Rechtfreigabe oder Zustellung. Positive Annahmetests setzen eine freigegebene Lage **nur künstlich im kurzlebigen lokalen Emulator**.
- [GitHub-Actions-Gesamttest #38776417489](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38776417489) **erfolgreich: 66/66 Unit-/HTTP-Tests und 6/6 Emulator-Integrationstests**, 0 fehlgeschlagen. Unveränderte Warnung zur Multi-Datenbank-Unterstützung des Firebase-Emulators.
- **Kein** echter Airtable-GET mit produktiven Berechtigungen, **kein** Airtable-PATCH, keine Live-Drive-PDF-Bytes, Cloud-Run-Deployments, Make- oder Mailaktionen; alle öffentlichen Offerten-APIs bleiben 503. Dokumentiert unter `docs/LSZH_BINDUNG_BIS_ANNAHME_20261015.md`.
- Nächstes Risiko: Bindungs-Guard beweist nur die frühere Übereinstimmung. Vor einer echten Ausgabe/Annahme müssen autorisierte, frisch gelesene Airtable-Felder und endgültig archivierte PDFs erneut überprüft werden. RC1 und AVV bleiben juristisch ungeprüfte Freigabepunkte.

### Neuer Airtable-Readback vor Ausstellung und Annahme – getestet (15.10.2026)

- `syntheticAirtableReadback.js`: rein synthetische, vor jedem Transaktionsaufruf neu abgerufene **Mock-Airtable-Daten** werden im Firestore-Transaktionscallback gegen die eingefrorene eindeutige Airtable-Record-ID, Vertragsversion, Empfänger, Gültigkeit, PDF-Hashes, Drive-IDs und AVV geprüft. Linkausstellung verlangt `Entwurf` ohne Versand/Freigabe, der hypothetische Annahmepfad `Versendet` mit passenden Testfreigaben, Versandbeleg und Tokenhash. Unpassende Lebenszyklus-Stati sowie geänderte Archiv-/AVV-Daten blockieren den Commit.
- Der gesicherte lokale HTTP-Test und beide Firestore-Emulator-Integrationstests nutzen jetzt einen explizit injizierten `readRecord`-Testadapter. **Er ist noch nicht mit echter Airtable-API authentifiziert**; keine externen Lese- oder Schreibzugriffe, keine produktiven Kundendaten oder Links.
- [GitHub Actions #38778628864](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38778628864) **bestanden: 76/76 Unit-/HTTP-Tests und 6/6 echte Firestore-Emulatortests**, inklusive Änderung des Airtable-AVV-Hashes vor Ausgabe und Änderung des Versandstatus vor Annahme. Warnung des Firebase-Emulators zu benannten Datenbanken bleibt bestehen.
- **Wichtige Grenze:** Zwischen dem Airtable-GET und dem Firestore-Commit kann Airtable theoretisch erneut geändert werden (keine verteilte Transaktion / TOCTOU). Deshalb bleibt die produktive Versionierungs-/Freeze- und Rechtsfreigabefrage offen. Kein produktives Deployment, E-Mail, Make, Airtable-PATCH oder echter Firestore-STAGING-Schreibtest.
- Weitere Einzelheiten: `docs/LSZH_FRESH_AIRTABLE_READBACK_20261015.md`.

### Vertragssnapshot + Airtable-GET-Härtung – Offline-/Emulator-Test bestanden (15.10.2026)

- `airtableReadonlyRecord.js` weiterhin nur als **nicht konfigurierte**, GET-only API-Lesefassade, jetzt mit `AbortSignal.timeout(5000)`, maximal 256 KiB geprüfter Antwortgrösse, strikt überprüfter Airtable-Record-ID, abgelehnten Weiterleitungen und neutralen Fehlermeldungen auch bei Secret-Leseproblemen. Kein echter Airtable-GET oder Zugangsschlüssel verwendet.
- `syntheticContractFreeze.js`: neuer **rein synthetischer** Manifestentwurf für Offerte/Bedingungen/AVV mit SHA-256 über lokale PDF-Bytes, einzelnem Revisionsbezeichner, Drive-Datei-ID und eindeutigem Gesamtmanifest-Hash. Der `stagingContractFreezes/{fixtureId}`-Guard wird mit dem bestehenden Airtable-Bindungs-Guard durch eine Firestore-Transaktion einmalig angelegt. Künstliche Revisions-IDs sind **nicht** tatsächlich bei Google Drive ausgelesen. Keine Rechts-/Archivfreigabe durch einen Hash.
- Echter GitHub-Actions-Nachweis [#38779835279](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38779835279): **88/88 Unit-/HTTP-/Sicherheitstests und 7/7 Firestore-Emulator-Integrationstests bestanden**, inklusive zwei gleichzeitig einfrierender Firestore-Clients (nur ein Commit).
- **Wesentlicher noch offener Integrationspunkt:** Die **ausgestellten** synthetischen Links und der **Annahmekandidat** prüfen das neue `contractManifestHash` derzeit **noch nicht verpflichtend**. Erst nach dieser Code-Integration gilt die zusammenhängende Kette als getestet; vorher ist dies ein isolierter Sicherheitsbaustein. Auch die echten revisionsgenauen Drive-PDFs, eine authentifizierte Airtable-API-GET-Verbindung und das Airtable/Firestore-TOCTOU-Risiko bleiben offen.
- Keine Cloud-Deployments, produktiven Firestore-Writes, Airtable-PATCHes, E-Mails, Make-Ausführungen, Vertragsabschlüsse oder Freigaben. Technischer Bericht: `docs/LSZH_CONTRACT_FREEZE_STAGING_20261015.md`.

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

**Zusätzliche abschliessende Sicherheitsprüfung:** [GitHub Actions Run #38771458875](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38771458875), **18/18 Unit-/Sicherheitstests und 3/3 Firestore-Emulator-Tests bestanden**. Der synthetische Aussteller verweigert jetzt zusätzlich sämtliche Aufrufe bei gesetztem Cloud-Run-`K_SERVICE` oder `GOOGLE_CLOUD_PROJECT`/`GCLOUD_PROJECT=lszh-automations`. Ungültige Kalendertage werden abgelehnt. Keine kundenbezogene Freigabe.
