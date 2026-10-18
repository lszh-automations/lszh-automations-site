# LSZH – Kunden-Vertragsportal, isolierter Entwicklungsprototyp

## Aktuelle Integrationsstufe: gemeinsamer Portal-Ursprung, noch nicht deployt (17.10.2026)

Die bereits vorhandene Offerten-Weboberfläche und der isolierte Cloud-Run-Portalcode wurden im GitHub-Featurebranch zusammengeführt. **Es ist weiterhin kein produktiver Vertragsabschluss möglich; dieses Paket wurde nicht auf den laufenden Cloud-Run-Dienst bereitgestellt.**

**Neu:** `portalHttp.mjs` liefert bei ausdrücklich aktivierter Staging-Konfiguration `GET /offerte-annehmen/` als statische, gebündelte Kopie der *bestehenden* Datei `offerte-annehmen/index.html` (keine eigene neue Gestaltung). Auf derselben HTTPS-Origin laufen `POST /api/offer/preview`, `POST /api/offer/document` und `POST /api/offer/accept`. Dadurch sind keine CORS-Ausnahmen und kein Render-zu-Google-Cloud-Proxy für den späteren Kundenbrowser nötig. Die PDF-Route validiert den Einladungscode, Angebotsstatus und Ablauf und liest nur Dokumente aus der gebundenen privaten Angebotsakte. Sie nutzt `readVerifiedArchivePdf` zur Parent-/MIME-/Grössen-/SHA-256-Byteprüfung, keine fremde Drive-Datei-ID. `LSZH_PORTAL_STAGING_ENABLED` bleibt per Default **false**. HTML und APIs antworten im deaktivierten Zustand mit 503.

**Docker-Paket:** Kontext ist nun das **Repository-Hauptverzeichnis** (nicht `cloud-run/`):
```bash
docker build -f cloud-run/Dockerfile.offer-portal-staging -t lszh-offer-portal:local-check .
```
Das Dockerfile kopiert nur Portalcode, internen Verifier und `offerte-annehmen/index.html` in das Image. Keine Mail-, Airtable-, Make- oder archivschreibende Dienstkomponente; keine Zugangsschlüssel im Image. Das vollständige Image wurde in GitHub Actions ausschliesslich gebaut und deaktiviert auf localhost getestet; **kein Google-Cloud-Deploy**.

**Sicherheitsgrenze:** Der tatsächlich eingesetzte Cloud-Run-Dienst `lszh-offer-portal-staging` behält sein internes, IAM-geschütztes, rein lesendes Preflight (letzte vom Kontoinhaber bestätigte Traffic-Zuteilung: 100 % Revision `00004-qt7`). Der neue Docker-Entwurf darf diese Revision nicht stillschweigend ersetzen; Staging-Erreichbarkeit, öffentliche HTTPS-Invoker-/Origin-Strategie, Missbrauchsschutz, synthetische Seed-Daten und Freigabe müssen vor einem echten Browser→Cloud-Run-Test separat kontrolliert werden. Der Archiv-Reader bleibt durchgehend intern und schlüssellos. Keine juristische RC1/AVV-Freigabe und keine E-Mail-/Beleg-Outbox.

---


## Aktueller Infrastruktur- und Teststand (15.10.2026, Nachtrag)

Die folgenden historisch datierten Abschnitte beschreiben frühere Planungsstände. **Aktueller Stand:** Im Google-Cloud-Geschäftsprojekt `lszh-automations` sind die benannte Firestore-Datenbank `lszh-offers-staging` (`europe-west6`), das getrennte Dienstkonto `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com` mit bedingter `roles/datastore.user`-IAM-Rolle und Geschäftsstaging-Drive-Lesefreigabe sowie der separate Cloud-Run-Dienst `lszh-offer-portal-staging` inzwischen vorhanden. Cloud Run verwendet die sichere **read-only** Revision `00004-qt7` (100 % Traffic laut Kontoinhaber), die `IDENTITY_PASS`, `DRIVE_PASS`, `FIRESTORE_READ_PASS` und `PASS` in echten Google-Cloud-Logs nachgewiesen hat. Die zeitweise bereitgestellte schreibende Testrevision `00003-778` ist bei 0 % Traffic geblieben. Diese README-Dateien enthalten **nicht** den aktuell bereitgestellten Leseprüfer: Der Code für den ist unter `cloud-run/offer-portal-preflight/` abgelegt. Dieser Ordner bleibt ein **nicht bereitgestellter Entwurf des vollständigen Portals**.

Weitere echte und simulierte Nachweise: Der getrennte echte Cloud-Firestore-Smoketest hat **12 konkurrierende synthetische Transaktionen, 1 Commit, 11 Duplikate und bestätigte Bereinigung** protokolliert; eine negative Zugriffsprüfung auf eine andere DB blieb `INCONCLUSIVE_DB_ABSENT`. Zusätzlich hat [GitHub Actions 38736777386](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38736777386) **67/67 reguläre Tests und 4/4 Firestore-Emulator-Integrationstests** bestanden. Die zwei neuen `test/offerPortalEndToEnd.emulator.test.js`-Fälle führen für AVV **Ja/Nein** den echten Portal-HTTP-Adapter, echte PDF-Hash-Validierungslogik mit **synthetisch simulierten Drive-HTTP-Antworten** und echte Firestore-SDK-Transaktionen gegen den **Emulator** durch. 12 HTTP-Annahmeversuche ergeben jeweils genau 1 erfolgreiche Annahme und 11 abgewiesene Wiederholungen, ohne irgendwelche echten Kunden, E-Mails oder Produktivschreibzugriffe.

**Nicht ausgeführt:** ein vollständiges auf dem realen Cloud-Run-Dienst bereitgestelltes Vertragsportal, ein tatsächlicher Cloud-HTTP-/Browser-End-to-End-Kundenfluss, der automatische Airtable-zu-Firestore-Seed, idempotente Outbox-Verarbeitung und die spätere juristische Freigabe. Produktive Annahme bleibt blockiert. Das Freischalten/Deployen dieses Prototyps ist **kein** Teil der Emulator-Testfreigabe.

---


Stand: 15.10.2026. **Nicht bereitgestellt, kein Go-Live, kein Kunde kann damit einen Vertrag annehmen.** Quellcode nur auf dem ungemergten GitHub-Entwicklungsbranch `feature/optional-avv-acceptance-staging-20261014`.

## Bereits implementiert (synthetisch getestet)

- `portalCore.mjs`: persönliche, hochentropische Token-Annahme (nur SHA-256 des Tokens als Schlüssel; kein Roh-Token in der Datenbank). Für Preview/Annahme muss die Offerte gültig, freigegeben, noch nicht akzeptiert, rechtzeitig und an die richtige E-Mail adressiert sein. Stimmen die PDF-Hashes oder die expliziten Zustimmungen nicht, findet **keine** Annahme statt. Bei AVV erforderlich: dritte PDF und eigene Zustimmung zwingend; bei AVV nicht erforderlich: dritte Zustimmung ausdrücklich verboten.
- `firestoreOfferStore.mjs`: isolierte **Staging-Collection `lszh_staging_offers_v1`**. `get()` liest per Hash-Schlüssel. `claim()` ist eine **Firestore-Transaktion**: liest den Datensatz erneut, kontrolliert Status, Revision, Angebots-Fingerprint, Freigabe und Ablauf und schreibt den angenommenen Status + Beweisdaten **einmalig**. Gleichzeitige Annahmen über zwei Cloud-Run-Instanzen können nicht beide committen. **Keine fremden API-Aufrufe in der Firestore-Transaktion**, weil Google diese bei Konflikten erneut ausführen kann. Keine E-Mails, Make-Szenarien oder Airtable-Updates im Transaktionspfad.
- Jede erfolgreiche Staging-Transaktion markiert ausdrücklich `downstream.airtable=disabled`, `downstream.proofPdf=disabled`, `downstream.email=disabled`. Dies ist **kein implementierter Produktiv-Outbox-Worker**, sondern ein sicherer Stopp vor jeder externen Wirkung.
- `portalHttp.mjs`: deaktiviert, solange `enabled !== true`. Nur definierte POST-Routen `/api/offer/preview` und `/api/offer/accept`; HTTPS-Origin-Check, JSON-Content-Type, 12 KiB Body-Limit, keine Roh-Fehler, keine URL-Token, no-store/noindex/no-referrer. Ein Origin-Check allein ist **keine Identitätsprüfung** und ersetzt keine Rate-Limits/WAF.

## CI / Testgrenzen

- `test/offerPortalStaging.test.js` prüft synthetische Angebots-AVV-Ja/Nein-Fälle, gleichzeitige Annahme aus zwei simulierten Instanzen, Vergleich mit nachträglich geänderten PDF-Hashes, Status/Revision nach Zwischenzeitänderung, Ablauf, fehlerhafte Zustimmung, fremde Empfänger-E-Mail und Einmaligkeit.
- `test/offerPortalHttp.test.js` prüft deaktivierten Standardzustand, Origin/Methoden-/Pfad-Sperren, schlechte JSON-Eingaben, übergrossen Body und sichere Fehlerantworten.
- Der Firebase-/Firestore-Zugang ist in diesen Tests **ausschliesslich ein Fake mit transaktionsartiger serieller Ausführung**. Das zeigt die beabsichtigte Programmlogik, **nicht** die praktische E2E-Korrektheit einer echten Firestore-DB. Erst echte Last-/Konflikttests mit einer eigens errichteten **synthetischen** Cloud-Firestore-Stagingdatenbank können dies bestätigen.
- Weitere bestehende LSZH-Tests (Archivbündel, PDF-Checks, Make/Airtable-Mocks, Website/API) laufen im gleichen GitHub-Actions-Workflow.

## Nicht umgesetzte Komponenten

1. Noch **kein** Cloud-Run-Portal-Dienst erstellt, keine Cloud-Firestore-Datenbank, keine Firestore-/Drive-Writer-IAM-Rolle vergeben, keine API-Routen öffentlich erreichbar.
2. Die bereits funktionierende Cloud-Run-Reader-Testinstanz `lszh-archive-reader-staging` bleibt **intern, IAM-geschützt und mit ausschliesslich lesender Drive-Rolle**. Sie erhält **keine** Firestore-Schreibrolle. Für einen separaten Portal-Cloud-Run-Dienst wäre ein **eigenes** Servicekonto `lszh-offer-portal-staging` mit strikt getrennten minimalen Firestore- und Drive-Rechten notwendig, inklusive betrieblichem Rollen-/Kostenreview. Authentifizierung via Google-verwaltete Identität ohne JSON.
3. Der neue `archiveBundleVerifier.mjs` ist eine unabhängige Bibliothek. Das Portal ist **noch nicht** an deren kurzlebigen Google-OAuth-Zugriffstoken, echten Drive-Zugriff, Firestore, HTTP-Webserver oder an einen Browser-Client angeschlossen.
4. Es gibt noch keinen sicheren, geprüften Import aus Airtable nach Firestore, keine transaktionssichere Rückmeldung nach Airtable und noch keinen idempotenten Outbox-Prozessor für PDF-Beweismittel/E-Mail. Zwischen bestehender Airtable-Offerte und neuem Portal muss eine eindeutige Datenführerschaft festgelegt werden. **Die vorhandenen Make-/Airtable-E-Mail- und Statusszenarien bleiben deaktiviert.**
5. Tatsächliche Eingabefehler-, Rate-Limit-, CSRF-, Token-Leak-, XSS-, Session-, Audit-, Missbrauchs- und Lasttests fehlen für eine produktive Browseroberfläche. Kein identitätsgeprüfter Unterzeichner: Token-Besitz + angegebene E-Mail ist lediglich eine Erklärung, keine starke Personenidentitätsprüfung.
6. Die juristische Prüfung von Projektbedingungen/AVV wurde durch den Geschäftsführer auf später verschoben; der technische RC1-Test ist **keine Rechtsfreigabe**. Google-Drive-ContentRestrictions sind **kein WORM-Archiv**. Aufbewahrung, Revisionen und Geschäftsdaten im Ausland müssen vor Echtbetrieb separat überprüft werden.
7. Die Cloud-Run-Portalseite würde als **separat** extern erreichbarer HTTPS-Dienst benötigt; `Ingress=Intern` des bisherigen Reader darf nicht dafür geöffnet werden. Ein öffentlicher Portal-Eingang und ein nicht öffentlich zugänglicher PDF-Ordner sind getrennte Konzepte. Vor dem Öffnen Cloud Armor, Rate-Limits, Datenschutzprüfung, Service Identity, Kosten und Domain klären.

## Beabsichtigter nächster sichere Schritt

Geklärte Architektur mit dem Geschäftsführer abstimmen; dann ggf. getrennte **Firestore Native Staging-DB in `europe-west6` (Zürich)** für ausschliesslich synthetische Testangebote anlegen, eigenes Portal-Dienstkonto mit minimaler Firestore-Rolle und ausschliesslich nötigem Drive-Lesezugriff definieren, Cloud-Run-Code integrieren und Wiederholungs-/Parallelitätstests mit realen Firestore-Transaktionen ausführen. Noch keine produktive Freigabe. Offizielle Firestore-Transaktionsdokumentation: https://firebase.google.com/docs/firestore/manage-data/transactions. Standortliste: https://docs.cloud.google.com/firestore/docs/locations.


## Neuer Stand 15.10.2026 – reale Firestore-Emulator-Parallelität und Zürich-Konfiguration

Der ursprünglich reine Fake-Test wurde durch **einen zusätzlichen offiziellen Firestore-Emulator-Lauf** ergänzt. In einem vollständig lokalen `demo-lszh-automations`-Projekt mit benannter DB `lszh-offers-staging` erhalten **zwölf gleichzeitige Annahmeanfragen exakt einen erfolgreichen Transaktionsabschluss und elf Ablehnungen**. Der Datensatz hat anschliessend `status='accepted'`, `revision=2` und `downstream.airtable/proofPdf/email='disabled'`. Weder Google-Cloud-Abrechnung noch echte Firestore-Daten oder Benutzerkonten waren beteiligt. Der Emulator ist kein Beleg für IAM-/Cloud-Run-Konfiguration im Echtbetrieb.

Neu eingeführt: `stagingConfig.mjs` begrenzt Projekt, Revision, Dienstkonto (Runtime-Prüfung beim ersten Aufruf), benannte Datenbank, Geschäftsstaging-Ordner, Test-Vertragsversion und genau zulässige HTTPS-Staging-Origins. Default ist **disabled**; eine Aktivierung ohne gültiges Staging-Setup oder mit herunterladbarem Dienstkonto-JSON wird abgewiesen. `index.mjs` ist ein späterer Cloud-Run-Einstiegspunkt mit Firestore SDK (benannte Datenbank und regionaler Zürich-Endpunkt), Google Application Default Credentials, internem Google-Drive-PDF-Bündelprüfer, Firestore-Claim und HTTP-Adapter. **Noch nicht in Cloud Run bereitgestellt.**

Das getrennte Staging-Paket `package.json` pinnt `@google-cloud/firestore`, `google-auth-library` und das Functions Framework. Die optionale Containerverpackung liegt in `cloud-run/Dockerfile.offer-portal-staging`, mit dem **Build-Kontext `cloud-run/`**; der vorhandene reine Archiv-Reader-Dienst wird nicht umgebaut. Das Quellpaket ist noch kein getestetes Produktionscontainer-Image.

Die Tests werden im GitHub-Workflow parallel geprüft: normale synthetische Tests sowie ein separater CI-Job mit Java und `firebase-tools`/Firestore-Emulator. Die echte Google-Cloud-Datenbank und das separate Portal-Dienstkonto existieren **noch nicht**. Es ist **kein** Zugriff auf reale Firestore-Ressourcen aktiviert.

**Vollständige manuelle Einrichtung mit Kosten- und IAM-Vorbehalt:**
[LSZH_FIRESTORE_STAGING_SETUP_20261015.md](../../docs/LSZH_FIRESTORE_STAGING_SETUP_20261015.md).

### Sicherheit vor Go-Live

Firestore-Emulator-Tests sind keine Last-/Rechtsfreigabe. Der Portal-HTTP-Adapter enthält noch keinen WAF-/Rate-Limiting-Dienst oder vollständige Browseroberfläche. Firestore-Transaktion und Google-Drive-Prüfung können keine nachträgliche Veränderung von reversibel gesperrten Drive-Dateien verhindern; WORM/Beweissicherung und PDF-Zuordnung weiter lösen. Vor erster öffentlicher Kundenannahme eigene Identität, produktionsfähiges Hosting, eigenständige datenschutzrechtliche und juristische Prüfung, DNS und ausdrückliche Freigabe erforderlich.

## Einmaliger synthetischer Cloud-Run-Annahmetest (18.10.2026)

**Status: vorbereitet und offline getestet; NICHT deployed.** Keine neuen Dienste oder Make-Szenarien.

- `LSZH_PORTAL_SYNTHETIC_ACCEPT_ENABLED` bleibt standardmaessig aus. Nur `true` ermoeglicht eine synthetische Annahme; sonst HTTP 503.
- `LSZH_PORTAL_SYNTHETIC_SOURCE_RECORD_ID` muss bei aktivem Test genau eine zuvor genehmigte neue synthetische `rec...`-ID benennen; jede andere Offerte bleibt blockiert.
- `LSZH_SYNTHETIC_AIRTABLE_WRITEBACK_ENABLED=true` ist ebenfalls erforderlich. Den geschäftlichen `LSZH_AIRTABLE_ACCESS_TOKEN` nur als Runtime-Secret konfigurieren, nicht in Code, GitHub, Konsole oder Chat veroeffentlichen.
- Der existierende Service `lszh-offer-portal-staging` und die benannte Firestore-Datenbank werden verwendet. Ohne separat freigegebene neue IAM-geschuetzte, no-traffic Testrevision darf nichts deployed oder aktiviert werden.
- Testdatensatz muss neu sein, nicht der bereits am 18.10. manuell auf Angenommen gesetzte Testdatensatz. Er braucht fiktiven Empfaenger `example.invalid`, TEST/NO_CONTRACT-Kennzeichnung, gueltigen Token-Hash und tatsaechlich verifizierte synthetische Geschaefts-Drive-PDFs.
- Nach Freigabe genau einen privaten Preview/Document/Accept-Test gegen die Testrevision ausfuehren und Firestore sowie Airtable per separatem GET pruefen. Make, Mail und Beleg-Upload bleiben aus.
- Bei `airtable_sync_status=manual_review_required` nur lesend abgleichen, niemals einen zweiten Annahmeversuch als automatischen Retry ausloesen. Anschliessend Testoption deaktivieren, Testrevision ohne Traffic halten und synthetische Daten eindeutig markieren.

Offline CI mit Ein-Record-Filter: https://github.com/lszh-automations/lszh-automations-site/actions/runs/39166293848 (**SUCCESS**). Dieser Nachweis ist kein echter Cloud-Run-Airtable-End-to-End-Test.
