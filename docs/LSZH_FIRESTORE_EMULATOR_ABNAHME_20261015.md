# LSZH Firestore – echter lokaler Emulatorlauf, Nachweis 15.10.2026

**Status: Emulator technisch BESTANDEN; echtes Cloud-Run-/Firestore-STAGING weiterhin NICHT beschrieben oder abgenommen.** Keine produktiven Vertragsannahmen, Make-Szenarien, Mails, Google-Drive-Dateien, IAM oder Domains verändert.

## Reproduzierbar ausgeführte GitHub-Actions-Prüfungen

Workflow: [LSZH Firestore emulator proof (synthetic only)](../.github/workflows/lszh-firestore-emulator.yml), branchengebunden an `feature/firestore-staging-dryrun-20261015`.

| Nachweis | GitHub Actions | Resultat |
| --- | --- | --- |
| Erster echter Emulatorlauf | [Run 38769381514](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38769381514), Job 116540889448 | Erfolg, 7/7 Konfigurationstests und 2/2 Firestore-Integrationstests |
| Zusätzlicher Isolationslauf | [Run 38769645834](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38769645834), Job 116541789628 | Erfolg, 7/7 Konfigurationstests und 2/2 Firestore-Integrationstests, inklusive **benanntes DB-Schema gegen (default)** |

Laufumgebung: Ubuntu GitHub-Runner, Node.js 22, Java 21, `firebase-tools@15`, `@google-cloud/firestore@7`, Firestore Emulator v1.22.0. Testausführung mit dem Firebase-**Demoprojekt** `demo-lszh-offers`; Emulator hört ausschliesslich auf `127.0.0.1:8080`; Datenbank-ID `lszh-offers-staging`. Das **echte** Google-Cloud-Projekt `lszh-automations` ist für diese Testläufe **nicht** als Ziel verwendet worden. Weder GCP-Schlüssel noch OAuth-Token oder Cloud-Schreibberechtigungen im Job.

## Tatsächlich nachgewiesenes Verhalten

1. Zwei **unabhängige** Firestore-Server-SDK-Clients senden gleichzeitig eine transaktionale synthetische Annahme. Genau ein Auftrag ist erfolgreich, der andere scheitert; Firestore enthält danach `status=ACCEPTED` und `reconciliationStatus=PENDING`.
2. Der vollständige lokale HTTP-Test sendet zwei parallele POSTs an das ausschliesslich lokale, im Produktionseinstiegspunkt **nicht verfügbare** Testgateway; die Antworten sind **200** und **409**. Das lokal gespeicherte AVV-Nachweisfeld wird geprüft.
3. Ein manipulierter AVV-Digest wird **vor dem Transaktionsabschluss** abgewiesen; der Ausgangsstatus bleibt unverändert.
4. Der zweite Lauf liest nach dem Schreiben eines Dokuments mit dem benannten DB-Client denselben Dokumentpfad mit einem **separaten `(default)`-Datenbank-Client**: `exists=false`, auch nach der Annahme. Damit ist die **beobachtete Isolation im verwendeten Emulator** nachgewiesen.
5. 7/7 Unit-Checks prüfen eine geschlossene Standardkonfiguration, falsche Serviceidentitäten und Datenbanknamen, fehlende Testfreigaben, Remote-Emulator-Host und die hart erzwungene `demo-lszh-offers`-Projekt-ID. Sämtliche Tests wurden tatsächlich unter Node ausgeführt.

## Wichtige Einschränkungen

- Der Emulator meldete ausdrücklich die Warnung `Cloud Firestore Emulator does not support multiple databases yet.` Gleichzeitig gelang die benannte Datenbankabfrage und sie blieb im Test getrennt von `(default)`. **Diese beobachtete Isolation überwindet nicht automatisch alle Emulator-Einschränkungen** oder ersetzt einen künftigen echten Test der benannten Google-Cloud-Datenbank.
- Der Test überträgt **synthetische PDF-Bytes und Dummy-Drive-IDs**. Weder tatsächlich rechtlich freigegebene RC1-Originale noch echte Google-Drive-Byte-Checks oder reale Identitätsprüfung wurden getestet.
- Die positiven Testzustände `legallyApproved=true`, `deliveryConfirmed=true` und `acceptanceEnabled=true` wurden **nur für die künstlichen Emulator-Fixtures** gesetzt; die tatsächlichen V4-Staging-Fixtures und Online-Freigaben bleiben unverändert gesperrt.
- Google Cloud Run hat nachweislich einen eigenen, unveränderten Preflight-Dienst. **Kein** neuer Annahmedienst wurde deployed; das echte Dienstkonto, IAM und die Firestore-Laufzeit auf Google Cloud sind noch nicht geprüft.
- Es existiert noch **keine echte Kundenlink-Ausgabe** durch einen transaktionalen Issuance-Adapter und **kein produktionsfähiger** Firestore-Reconciliation-Worker zu Airtable/Make. Auch der Browserteil kennt noch keine End-to-End-Abnahme.
- Datenschutz, Beweisführung, allfällige Aufbewahrung/Unveränderlichkeit sowie juristische Freigabe Projektbedingungen/AVV RC1 bleiben offen.

## Nächste sinnvolle Arbeit ohne Freigabeänderung

A) Erstellen und offline testen des **idempotenten** Ausgabestatus `ISSUED` mit echtem 256-bit-Tokenhash, zugewiesenen und byteverifizierten drei Dokumenten und Sperrung bereits ausgegebener Angebote. Kein echter Token-Link.

B) Den Annahmenachweis nach einem Transaktionscommit über einen **idempotenten, wiederaufnehmbaren** Outbox-/Reconciliation-Prozess von Firestore nach Airtable übertragen, bevor E-Mail-Automationen aktivierbar sind.

C) Noch vor einem echten Cloud-STAGING-Test einen **eigenen** Cloud-Run-Dienstkonto-/IAM- und Domain/Ingress-Plan separat freigeben. Kein öffentlicher Cloud-Firestore-Schreibendpunkt, keine dauerhaften JSON-Keys auf Render, die vorhandene Preflight-Revision nicht überschreiben.

**Freigabegrenze:** Die technische Emulatorprüfung ist abgeschlossen, die End-to-End-/Produktionsabnahme ist es ausdrücklich nicht.
