# LSZH Portal – schlüsselloser Lese-Vortest (Cloud Run, NICHT produktiv)

Stand: 15.10.2026. **Nur synthetische Testdatei, keine echten Kunden, keine Schreiben, keine Vertragsannahmen.** Das bestehende Dienstkonto des Archiv-Readers und die bisherigen Make-Szenarien nicht verändern.

## Zweck

Separater Cloud-Run-Dienst `lszh-offer-portal-staging` verwendet **sein eigenes** Dienstkonto
`lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com`.
Beim Start prüft `index.js` unter Google Application Default Credentials / kurzlebigen Metadata-Token:
1. Tatsächlich verwendete Cloud-Run-Laufzeitidentität ist exakt das vorgesehene Portal-Dienstkonto.
2. Das **synthetische** Geschäftskonto-Archiv-PDF kann per Google-Drive-Lese-API erreicht werden; zugehöriger geschäftlicher Ordner, `readOnly`-Content Restriction und **echter Byte-SHA256** stimmen.
3. Die benannte Firestore-Stagingdatenbank `lszh-offers-staging` lässt sich per REST-`listDocuments` **lesend** anfragen. Erwartet ist HTTP **200**, auch für eine leere Collection. Keine Felder werden ausgelesen, weitergegeben oder protokolliert.

**Der Funktionsendpunkt liefert absichtlich immer HTTP 503 `staging_disabled`**. Er gibt weder Archivinhalte noch Test-/API-Ergebnisse an Aufrufer aus. Ergebnisse stehen nur in den internen Cloud-Run-Logs.

## Manuelle Einrichtung in Google Cloud

1. Geschäftskonto `lars@lszh-automations.ch`, Projekt `lszh-automations`, Cloud Run -> **neuen, separaten Dienst** mit Name **`lszh-offer-portal-staging`** erstellen. Den bestehenden `lszh-archive-reader-staging` **nicht** bearbeiten.
2. Region `europe-west6` (Zürich), Node.js 22 mit **Inline-Editor**, keine Trigger.
3. **Authentifizierung verlangen -> IAM**; **Ingress -> Intern**, *nicht* `Alle`; kein externer Load Balancer. Anfragebasierte Abrechnung und Autoscaling 0 bis 1.
4. Unter `Container, Netzwerk, Sicherheit -> Sicherheit -> Dienstkonto` explizit **`LSZH Offer Portal Staging`** wählen. *Nicht* `LSZH Archive Reader` und nicht das Google Default-Compute-Konto.
5. Im Editor alle Zeilen der beigefügten `index.js` ersetzen, `package.json` übernehmen und den **Funktionseinstiegspunkt `lszhPortalPreflight`** eintragen. Die letzten Zeilen mit schliessenden Klammern prüfen.
6. Bereitstellen. Protokolle `Observability -> Logs`, Suche einzeln nach **`LSZH_PORTAL_PREFLIGHT`**:
   - `START`, `IDENTITY_PASS`, `DRIVE_PASS`, `FIRESTORE_READ_PASS`, `PASS` = alle drei Lese-/Identitätsprüfungen abgeschlossen.
   - `FAIL (firestore_iam_denied)` = Rolle/IAM-Bedingung oder Tokenberechtigung nicht wirksam.
   - `FAIL (drive_read_denied)` oder `drive_metadata_mismatch` = geschäftliche Freigabe/Ordner oder Datei-Inhalt prüfen.
   - `FAIL (wrong_principal)` = falsches Laufzeit-Dienstkonto.
   - `FAIL (firestore_unexpected_status)` = u.a. falscher Datenbank-Endpunkt oder nicht eingerichtete Firestore-API.
   - `FAIL (unexpected)` = generische Fehler inkl. Zeitüberschreitung. Keine Zugangsdaten loggen.
7. Eine erfolgreiche **Lesefreigabe** ist noch **kein Beweis für Schreibberechtigungen oder die komplette Firestore-IAM-Isolation gegenüber anderen Datenbanken**. Diese Aspekte erfordern separaten synthetischen Positiv- und Negativtest.

## Verbindliche Sicherheitsgrenzen

- Nur lesende GET-Anfragen gegen benannte Zürcher Firestore-Datenbank und **ein festes synthetisches Drive-PDF**; kein dynamischer Datei-ID-Parameter; keine Firestore-Write, kein API-Key, kein JSON-Schlüssel.
- Das Portal ist **noch nicht live**, auch falls es technisch bereitgestellt wird. Netzwerkzugriff bleibt intern; IAM schützt den Endpunkt zusätzlich; der Programmcode blockiert HTTP-Aufrufe immer mit 503.
- Die bestehende Staging-Collection muss dafür **nicht** manuell angelegt werden. Firestore `listDocuments` liefert normalerweise eine 200-Antwort mit leerem Ergebnis.
- Die bisherigen GitHub-Actions-Tests für das künftige Vertragsportal betreffen den Code und den Firestore-Emulator; diese Google-Cloud-Leseprobe ist ein zusätzlicher Test, kein produktives Portal.
- Firestore-Staging kann geringe nutzungsabhängige Kosten verursachen, auch bei lesendem Zugriff. Die Budgetwarnungen sind keine harte Kostensperre.
- Kein öffentliches Cloud Run oder Produktivangebot und keine juristische Freigabe. Bestehende Drive-Freigabe `Leser` belassen.

Offizielle Dokumentation: [Firestore IAM-Bedingungen](https://cloud.google.com/firestore/docs/manage-databases), [Firestore REST list](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/list), [Cloud-Run-Dienstidentität](https://docs.cloud.google.com/run/docs/securing/service-identity).
