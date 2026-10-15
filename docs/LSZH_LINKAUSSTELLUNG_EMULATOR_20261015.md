# LSZH – synthetische, einmalige Offertenlink-Ausstellung (15.10.2026)

**Stand: Technischer Prototyp im GitHub-Entwicklungszweig; echte Firestore-Emulator-Prüfung BESTANDEN. KEINE echten Kundenlinks, KEINE Vertragsannahme, KEINE realen Google-Cloud-Schreibvorgänge, KEIN Cloud-Run-Deployment, KEINE E-Mails.**

## Entwicklung

`syntheticOfferIssuance.js` stellt die nachfolgenden Eigenschaften bereit:

- `crypto.randomBytes(32)` erzeugt **256 Bit zufällige Einmalcode-Bytes**. Nur SHA-256 des URL-sicheren, 43 Zeichen langen Codes wird transaktional in der synthetischen Firestore-Fixture gespeichert. Der Klartextcode wird **erst nach erfolgreichem Commit** an den ausschliesslich lokalen Testaufrufer zurückgegeben und nicht in Firestore/Airtable/Logs geschrieben.
- `db.runTransaction()` prüft den ursprünglichen Zustand `TEST_DRAFT_NOT_SENT`, die Unbenutztheit von `tokenHash`, `issuedAt`, `expiresAt`, `acceptedAt` und `acceptanceEvidence` sowie `reconciliationStatus=NOT_STARTED`. Es gibt **keine Nebeneffekte innerhalb der wiederholbaren Transaktion**.
- Der erfolgreiche Zustand lautet bewusst **`TEST_ISSUED_NOT_DELIVERED`**, nicht `ISSUED`. `deliveryConfirmed=false`, `deliveryEnabled=false`, `acceptanceEnabled=false`, `legallyApproved=false` bleiben erhalten. Der vorhandene Annahmecode `firestoreAcceptanceState.claimOfferOnce` weist diese Testofferte weiterhin zurück.
- Strikter Schutz gegen Verwechslung mit echten Offerten: nur `testMode=offline-or-emulator-only`, IDs `LSZH-EMULATOR-...`, `testOnly=true`, `TEST_ONLY_`-Bedingungen/AVV, `DEMO-OFF-...` und `fake-...@example.invalid` sind zulässig. Die alten gesperrten V4-Fixtures mit `LSZH-STAGING-...` und ungeprüftem Drive-Archiv können nicht ausgestellt werden.
- Die **lokalen** PDF-Bytes von Offerte, Bedingungen und bei Bedarf AVV werden vor jeder Transaktion auf PDF-Kennung, Grösse und SHA-256 geprüft. Die gespeicherten Dokumentdaten müssen den Byte-Hashes entsprechen und `archiveVerified=true`, PDF-MIME sowie syntaktisch gültige Drive-IDs vorweisen. **Dies sind noch keine echten Google-Drive-Archivrechte oder Byte-Leseprüfungen**; die Testdateien und Drive-IDs sind erfunden.
- Ausstellungs-TTL muss mindestens 5 Minuten und höchstens 7 Tage betragen und darf den in `Europe/Zurich` bestimmten Gültigkeitstag nicht überschreiten.
- Token und Testlink `#code=...` werden niemals an Browser, Make oder echte Kundinnen/Kunden ausgeliefert. `services/offer-acceptance-staging/offerLinks.js` kann im Test ausschliesslich ein HTTPS-Fragment unter explizit zugelassener Demo-Origin bilden.
- **Crash-/Rückgabe-Risiko ausdrücklich offen:** Geht die Antwort nach dem Commit verloren, kann der Klartext-Token nicht wiederhergestellt werden. Eine spätere reale Ausstellungsarchitektur braucht ein geprüftes, protokolliertes Widerrufs-/Neuausgabeverfahren und eine gesicherte Zustellungsstrategie (z. B. geschützte Outbox mit Ablauf/Löschung). Aus dem Prototyp ist **keine automatische Zustellung ableitbar**.

## Belegte Tests: GitHub Actions

[Workflow-Ergebnis #38771010960](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38771010960), GitHub Actions Branch `feature/firestore-staging-dryrun-20261015`, Node.js 22, Java 21, `@google-cloud/firestore@7`, `firebase-tools@15`, Firestore Emulator v1.22.0.

- **18/18** Sicherheits- und Ausstellungs-Unit-Tests bestanden: 7 vorhandene Datenbankkonfigurations- und 11 neue Ausstellungs-/Negativtests. Unter anderem: parallele Ausgabe, Replay-Schutz, 256-Bit-Token, keine Klartext-Speicherung, keine Annahme trotz Token, geänderte PDFs, fehlende AVV, falsche Freigaben, TTL, falscher Testmodus.
- **3/3** echte Firestore-Emulator-Integrationstests bestanden: zwei frühere Annahme-/HTTP-Doppelannahme-Prüfungen und neu **zwei unabhängige parallele Aussteller** mit genau einem erfolgreichen Tokenhash-Commit. Der zweite wird als `already_issued` abgewiesen. Der Zustand bleibt `TEST_ISSUED_NOT_DELIVERED`; ein anschliessender Annahmeversuch wird abgewiesen. Getrennte Abfrage nach `(default)` bleibt leer.
- Testumgebung verwendet ausschliesslich `demo-lszh-offers`, nicht `lszh-automations`, und den **Loopback-Emulator**. Keine Remote-Firestore-Schreibzugriffe, keine Credentials, kein Google-Cloud-Deployment.
- Emulator meldet weiterhin: `Cloud Firestore Emulator does not support multiple databases yet.` Trotz beobachteter benannter Datenbanktrennung ist ein späterer tatsächlicher Google-Cloud-STAGING-Test weiterhin erforderlich.

## Was für den produktiven Ausgabepfad noch fehlt

1. Endgültig durch den Nutzer und juristisch freigegebene RC1-Projektbedingungen und AVV **mit konkreter Kundenfassung** sowie echte Archivierung und Drive-PDF-Readback samt SHA-256-Prüfung und Zugriffsrechte-Nachweis. Dienstidentitäten/Permissions kontrollieren.
2. Getrennter echter `ISSUED`-Ausgabeadapter (der aktuelle Prototyp **stellt absichtlich niemals echte Links aus**); Ablauf, Widerruf, Wiederholungen nach Netzwerkfehler, Zustellungs-Quittung und Trennung zwischen Ausstellung und Zustellung sicher festlegen.
3. Echte Cloud-Run-API samt Authentifizierung und Anti-Missbrauch für die Auswahl von Angeboten, geschützt ausstellender Operator, TLS/Ratelimits, Domain/Ingress und Geheimnis-Schutz; weiterhin ohne exportierte Google-JSON-Keys.
4. Nachgelagerte idempotente Airtable-/Make-Reconciliation mit `PENDING`/Fehler/Wiederanlauf; keine Bestätigungsmail aufgrund einer lediglich vorbereiteten oder fehlgeschlagenen Annahme.
5. Vor echten STAGING-Schreibvorgängen **explizite Zustimmung** und eindeutige Trennung zum produktiven Projekt; keine Freigabe oder Aktivierung durch diese Tests.

**Die aktuelle Cloud-Run-Preflight-Revision bleibt unberührt, und die Kunden-Endpunkte des geplanten Offerten-Gateways bleiben HTTP 503.**

**Zusätzliche abschliessende Sicherheitsprüfung:** [GitHub Actions Run #38771458875](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38771458875), **18/18 Unit-/Sicherheitstests und 3/3 Firestore-Emulator-Tests bestanden**. Der synthetische Aussteller verweigert jetzt zusätzlich sämtliche Aufrufe bei gesetztem Cloud-Run-`K_SERVICE` oder `GOOGLE_CLOUD_PROJECT`/`GCLOUD_PROJECT=lszh-automations`. Ungültige Kalendertage werden abgelehnt. Keine kundenbezogene Freigabe.
