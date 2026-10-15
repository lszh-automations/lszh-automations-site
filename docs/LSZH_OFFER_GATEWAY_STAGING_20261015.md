# LSZH – getrenntes Offertenportal auf Cloud Run (Entwicklungsstand 15.10.2026)

**Status: nur Code im Entwicklungszweig; KEIN Deployment, KEIN IAM-/DNS-Wechsel, KEINE Echtannahmen, KEINE Firestore-Schreibzugriffe.**

## Architekturlösung – kleine Schnittstellenfläche

1. **Render bleibt die bestehende LSZH-Hauptwebsite und CRM-Kontaktstrecke.** Der bestehende Live-Webserver wird nicht umkonfiguriert.
2. **Ein eigener späterer Cloud-Run-Dienst** `lszh-offer-acceptance-staging` soll ausschliesslich die Offerten-Webseite und ihre API unter **demselben Origin** bereitstellen. Das reduziert gegenüber einem Render→Cloud-Run-Proxy den Bedarf an plattformübergreifender Authentifizierung.
3. **Noch ist dieser Dienst weder eingerichtet noch öffentlich.** Für private interne Tests soll Cloud Run IAM aktiv bleiben. Externe Kunden werden sich später nicht mit dem LSZH-Google-Konto anmelden können; ein Go-live setzt daher eine **gesonderte öffentliche Zugangsarchitektur** samt Rate-Limiting, über HTTPS übertragener Einmalcode-Prüfung, Freigabe des individuellen Angebots und Transaktionsschutz voraus. Eine öffentliche URL allein ist **keine** Authentifizierung und ein Kundenlink ist **keine** starke Identitätsprüfung.
4. Der Cloud-Run-Dienst erhält künftig ein **eigenes, minimal berechtigtes Dienstkonto**, nutzt Google Application Default Credentials (ADC) für die **benannte** Firestore-Datenbank `lszh-offers-staging` und getrennte Drive-Leserechte. Kein exportierter Dienstkonto-Schlüssel wird in Render oder auf Clients hinterlegt. Die vorhandene Preflight-Revision `lszh-offer-portal-staging-00004-qt7` bleibt unberührt.
5. Airtable bleibt CRM; nur die endgültige **einmalige Annahme** soll Firestore transaktional entscheiden. Synchronisation zu Airtable/Make **danach** asynchron, dedupliziert und wiederaufnehmbar. Vertrags-AVV, Offerte, Bedingungen und Beweisprotokoll müssen mit vollständigen SHA-256-Werten verbunden werden.

## Jetzt wirklich implementiert (ohne Aktivierung)

- `services/offer-acceptance-staging/app.js`: Node.js-HTTP-App mit `GET /healthz`, `GET /offerte-annehmen/` und drei vollständig **blockierten** POST-Routen `/api/offer/preview`, `/api/offer/document`, `/api/offer/accept`. Alle drei geben stets HTTP 503 `not_available` zurück, unabhängig von Umgebungsvariablen.
- `services/offer-acceptance-staging/index.js`: HTTP-Server auf Cloud-Run-`PORT`, bindet `0.0.0.0`. Keine SDK-Datenbankverbindung und keine externen Anfragen.
- `services/offer-acceptance-staging/Dockerfile`: kleiner Node-22-Bauplan ohne SDK-Abhängigkeiten, nichtroot-Betrieb, kopiert die **bereits vorhandene** Seite statt ein zweites Frontend zu entwickeln. **Vor jedem künftigen Deployment:** Node-Basisimage auf geprüften Digest pinnen, Image scannen, Cloud-Run-Servicekonto und Ingress überprüfen.
- Sicherheitsheader: No-Store, No-Referrer, No-Index, MIME-Sniffing-Schutz, Frame-Verbot und **hashbasiertes CSP** statt `unsafe-inline`. Der Dienst antwortet ohne CORS-Freigaben.
- `offerte-annehmen/index.html`: liest den Einmalcode nur aus `location.hash` (`#code=...`), nicht mehr aus `location.search` (`?code=...`). Der Fragmentteil einer URL wird vom Browser **nicht** im HTTP-Request an den Server gesendet und reduziert das Risiko, dass der Token in regulären HTTP-Requestlogs landet; Token bleibt dennoch ein Geheimnis, das durch Browser-Erweiterungen/Script und Linkweiterleitung ausgelesen werden kann. **Bestehende Query-Links würden nicht mehr funktionieren und dürfen nicht ohne Migrationsplan verwendet werden.**
- `scripts/issue-offer-link.js`: die alte direkte Airtable-Tokenausstellung mit `?code=` ist **hart deaktiviert** (ohne Runtime-Flag zur Reaktivierung). Sie würde nur den Airtable-Hash speichern, nicht den Firestore-Ausgabestatus; neue Ausstellung muss künftig transaktional zu Firestore passen. Alter Quellcode in Git-Historie erhalten.
- Die API antwortet auf Legacy-`?code=` mit HTTP 400 (ohne Echo des Tokens). **Achtung:** Der HTTP-Request selbst kann einen Querytoken dennoch in Cloud-Run-Zugriffslogs hinterlassen; niemals Tokens als Query versenden.

## Überprüfungen

- Lokaler Node-22-HTTP-Test `services/offer-acceptance-staging/test/app.test.js`: **11/11 bestanden** (Health-Status, Oberfläche/Headers, alle drei blockierten Routen, Fragment vs Query, falsche Methoden, kein CORS, keine internen Dateien, CSP).
- Zusätzlich `services/offer-acceptance-staging/offerLinks.js`: reiner, nebenwirkungsfreier Helfer, der einen 43 Zeichen langen Zufallstoken ausschliesslich in ein URL-Fragment unter einer explizit freigegebenen HTTPS-Origin einsetzt. Er **stellt selbst keine Tokens aus**. Drei zugehörige Tests prüfen HTTPS-Host-Whitelist, Query-Freiheit und Tokenformat.
- Der Staging-Code wurde in GitHub gespeichert, der CI-Workflow `.github/workflows/offer-acceptance-check.yml` wurde ergänzt. **GitHub-Actions-Lauf nicht bestätigt; Docker-Image nicht gebaut; Cloud Run nicht deployed.**
- Bestehende isolierte Firestore-Fassade `stagingFirestoreConnection.js` und Transaktionskandidat `firestoreAcceptanceState.js` sind **noch nicht eingebunden**. Offline-Fake-Tests oder HTTP-Gateway-Tests sind kein echter Firestore-End-to-End-Test.

**Lokaler Abgleich nach Reparatur einer veralteten Testkopie:** 38 erfolgreiche Node-Tests über die lokal verfügbaren Firestore-/Gateway-Module, 1 bewusst übersprungener Emulator-Test, 0 Fehlschläge. Dieser Durchlauf ist kein bestätigter GitHub-CI-Lauf und kein echter Google-Cloud-Test.

## Nachtrag: lokaler HTTP-zu-Transaktions-Test (15.10.2026)

- `app.js` bietet neu eine **nur bei NODE_ENV=test, ohne Cloud-Run-K_SERVICE, bei beidseitiger Loopback-Verbindung und expliziter injizierter Testfunktion** erreichbare Sonderroute `/__local_fixture/claim`. Die reguläre Cloud-Run-Entrypoint injiziert diese Funktion **nicht**; der Docker-Bauplan nimmt den Testordner nicht auf.
- Die Sonderroute ruft mit nur **synthetischen lokalen PDF-Bytes** und Fake-Firestore-Transaktionen `firestoreAcceptanceState.claimOfferOnce` auf. Der ganze HTTP-Pfad ist also lokal testbar, ohne echte Annahmen zuzulassen. Kundenschnittstellen bleiben unverändert 503.
- **20 Gateway- und Linktests lokal unter Node 22 bestanden, 0 fehlgeschlagen, 0 übersprungen**; darin parallele HTTP-Annahmen mit genau einem simulierten Commit sowie Negativtests (AVV, Token, PDF-Änderung und Produktionssperre). Dies ist **keine echte Firestore-Emulator-Transaktion**.
- Zusätzlicher opt-in Firestore-Emulator-HTTP-Test mit zwei unabhängigen SDK-Clients im GitHub-Entwicklungszweig vorbereitet; standardmässig übersprungen, in dieser Testumgebung noch nicht durchführbar (kein SDK/Emulator vorhanden).
- Umfang, Grenzen und genaue Folgearbeit: [LSZH_LOKALER_HTTP_TRANSAKTIONSTEST_20261015.md](LSZH_LOKALER_HTTP_TRANSAKTIONSTEST_20261015.md). Ältere Aussagen weiter oben über „nicht eingebunden“ meinen weiterhin: **kein produktiver Firestore-Adapter und keine Kundenschnittstelle**, nicht den nun vorhandenen lokalen Test.

## Firestore-Emulator erfolgreich nachgeprüft (15.10.2026)

Die zuvor als ausstehend dokumentierten Firestore-Emulatorläufe sind im GitHub-Workflow **tatsächlich ausgeführt und erfolgreich**:
- [Emulatorlauf 38769381514](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38769381514)
- [Isolationslauf 38769645834](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38769645834)

Je 7 Security-Tests und 2 echte Firestore-Integrationstests bestanden. Genau eine Annahme bei parallelen Transaktionen, manipulierter AVV-Digest gesperrt. Der zweite Lauf verifiziert die Abgrenzung zu `(default)` **im Emulator**; Firebase-CLI wies zugleich auf eine Einschränkung bei mehreren Datenbanken hin. Konfiguration: nur `demo-lszh-offers`, lokaler Firestore-Emulator, keinerlei produktive Cloud-Aktionen.

Ausführliches Testprotokoll: [LSZH_FIRESTORE_EMULATOR_ABNAHME_20261015.md](LSZH_FIRESTORE_EMULATOR_ABNAHME_20261015.md).

### Synthetische Linkausstellung – atomarer Emulatornachweis (15.10.2026)

- Auf `feature/firestore-staging-dryrun-20261015` neues isoliertes Modul `syntheticOfferIssuance.js`. Es erzeugt **256-Bit-Random-Token**, legt **nur SHA-256** in genau einem `stagingOfferFixtures/LSZH-EMULATOR-...`-Testdatensatz ab und verwendet `db.runTransaction` mit Wiederholungs-/Doppel-Commit-Sperre. Archiv-Hashes für lokale synthetische Offerte/Bedingungen/AVV und `Europe/Zurich`-Gültigkeit werden vor Commit abgeglichen. Keine Drive-/Make-/Airtable-/Kundenanbindung.
- Ergebnisstatus **`TEST_ISSUED_NOT_DELIVERED`**, `deliveryConfirmed=false`, `deliveryEnabled=false`, `acceptanceEnabled=false`, `legallyApproved=false`. Selbst mit korrekt zurückgegebenem Testtoken ist **keine Vertragsannahme möglich**. Die vorhandenen V4-Fixtures bleiben blockiert; reale RC1-Freigaben fehlen.
- Echter [GitHub-Actions-Test #38771010960](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38771010960): **18/18 Unit-/Sicherheitschecks plus 3/3 echte Emulator-Integrationstests bestanden**, davon neuer Nachweis für zwei unabhängige konkurrierende Aussteller (genau ein gespeicherter Tokenhash), geschützte PDF-Hashes und nicht annehmbaren Endzustand. Spätere verschärfte Negativtests (Cloud-Run-Identität, ungültige Kalenderdaten) laufen separat in CI; der anfänglich belegte Run bleibt als unabhängiger Erfolg gültig.
- `scripts/issue-offer-link.js` bleibt gesperrt, geplante Kunden-Gateway-API liefert weiterhin HTTP 503. Dieser Ausstellungsprototyp ist **nicht** produktionsfähig. Das Risiko eines verlorenen Klartexttokens nach Commit und die revidierbare, sichere Zustellung müssen vor Kundenbetrieb gelöst werden.
- Detailbericht: `docs/LSZH_LINKAUSSTELLUNG_EMULATOR_20261015.md`. Noch zu erledigen: RC1-/AVV-Rechtsfreigabe, archivierte kundenbezogene PDFs nachweislich aus Drive lesen, eigener auth-geschützter Issuance-Dienst, Widerruf/Neuausgabe, idempotente Firestore→Airtable-/Make-Reconciliation, separater autorisierter **echter** Staging-Test.

## Freigabefolge (nichts davon ausgelöst)

1. Die echten Node-Tests der gesamten GitHub-Branch ausführen und Fehler beheben. Separater Firestore-Emulator-Test (zwei konkurrierende Annahmeversuche) nur lokal; keine Cloud-Schreibvorgänge.
2. Einen noch fehlenden **sicheren, geprüften** Firestore-Issuance-/Acceptance-Adapter hinter denselben Cloud-Run-Dienst integrieren, inklusive 3 PDF-Byte-Hashprüfungen, AVV-Einwilligung, Token-Hash, Ablauf, Atomizität, Nachweis und Wiederaufnahme nach Cloud-/Make-Abbruch.
3. Nur nach ausdrücklicher Zustimmung: eigene Cloud-Run-STAGING-Serviceidentität und least-privilege IAM konzipieren, sichere Vorabtests, Image-Digest-Pinning und später kontrolliertes Deployment **ohne Kundenaktivierung**.
4. Für externe Kunden erst nach Rechts-/Security-Freigabe öffentlich erreichbaren Origin und Domain/DNS einrichten (z. B. `angebote.lszh-automations.ch`; **Vorschlag, nicht bestätigt oder konfiguriert**). Die Google-Dokumentation empfiehlt für eigene Domains einen HTTPS Load Balancer; Kosten/Domainregeln separat prüfen.
5. Linkausstellung und Make-Automationen niemals vor Freigabe einschalten. Juristische Prüfung RC1-Projektbedingungen und AVV bleiben separate offene Punkte.

Offizielle technische Referenzen:
- https://docs.cloud.google.com/run/docs/securing/service-identity
- https://docs.cloud.google.com/run/docs/authenticating/overview
- https://docs.cloud.google.com/run/docs/mapping-custom-domains

**Zusätzliche abschliessende Sicherheitsprüfung:** [GitHub Actions Run #38771458875](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38771458875), **18/18 Unit-/Sicherheitstests und 3/3 Firestore-Emulator-Tests bestanden**. Der synthetische Aussteller verweigert jetzt zusätzlich sämtliche Aufrufe bei gesetztem Cloud-Run-`K_SERVICE` oder `GOOGLE_CLOUD_PROJECT`/`GCLOUD_PROJECT=lszh-automations`. Ungültige Kalendertage werden abgelehnt. Keine kundenbezogene Freigabe.
