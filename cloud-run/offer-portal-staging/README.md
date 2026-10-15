# LSZH – Kunden-Vertragsportal, isolierter Entwicklungsprototyp

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
