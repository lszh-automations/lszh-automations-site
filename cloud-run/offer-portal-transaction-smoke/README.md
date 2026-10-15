## WICHTIGER REALBETRIEBSBEFUND vom 15.10.2026

**Dieses zuvor beschriebene Startup-Verfahren NICHT erneut anwenden.** Der erste echte Google-Cloud-Run-Test wurde am 15.10.2026 13:55 MESZ gestartet und protokollierte nur `START`, `IDENTITY_PASS`, `IAM_NEGATIVE_INCONCLUSIVE_DB_ABSENT`. In den vom Geschäftsführer übermittelten Logs fehlen bis zur letzten Aufnahme **`TRANSACTION_PASS`, `CLEANUP_PASS`, `PASS`, `FAIL`**. Der Datenzustand ist unbekannt.

Der beschriebene Code führt Firestore-Schreib-/Parallelitätstest beim **Startup eines anfragebasiert abgerechneten Webdienstes** aus; Google Cloud Run kann CPU nach der Startphase begrenzen, wenn keine HTTP-Anfragen verarbeitet werden. Es ist daher *möglich*, dass der synthetische Test während der Durchführung stockt. Die Cloud-Run-Revision als `Ready` beweist keinen erfolgreichen Geschäfts-/Firestore-Test. Eine wiederholte Bereitstellung oder ein Kaltstart kann zudem weitere synthetische Testdokumente erzeugen. **Keine erneute Testbereitstellung.**

**Sicheres Vorgehen:**
1. Neueste Logs nach `LSZH_PORTAL_TX_SMOKE` prüfen (Filter, Zeitraum, Severity) und kontrollieren, ob inzwischen `PASS` oder `FAIL` sichtbar ist.
2. In `lszh-offers-staging` nur die gesonderte `lszh_synthetic_txn_smoke_v1`-Collection ansehen. Bei vorhandenen Dokumenten deren `owner`, `synthetic`, `marker`, `status`, `revision` zunächst anhand Screenshots prüfen. Vorher **nichts löschen**.
3. Nach gesicherter Diagnose die temporäre Testrevision durch den bisherigen **read-only** Preflight ersetzen (unter `cloud-run/offer-portal-preflight/`); ohne erneuten Schreibtest. Die Anwendung bleibt intern und IAM-geschützt.
4. Für die Wiederholung statt eines Start-Hooks einen **separaten, einmalig ausgeführten Cloud Run Job** entwerfen. Dieser erhält für die kurze Laufzeit CPU, bestätigt Bereinigung und wird danach beendet. Zuerst Datenzustand des möglicherweise unvollständigen Tests klären.

Der übrige Text ist lediglich die **ursprüngliche historische Testanleitung** und keine aktuelle Empfehlung zum erneuten Einsatz.
 
# LSZH – Einmaliger Firestore-Transaktionstest auf echtem Cloud Run

**Stand: 15.10.2026. Noch nicht in Google Cloud bereitgestellt.** Keine Kundendaten, keine E-Mails, kein Vertrag, kein produktives Portal. Der Test darf ausschliesslich mit dem getrennten Cloud-Run-Dienst `lszh-offer-portal-staging` und dem dafür erstellten Dienstkonto durchgeführt werden.

## Warum dieser Schritt?

Der bisherige **echte schlüssellose Cloud-Run-Lesetest** hat am 15.10.2026 mit `LSZH_PORTAL_PREFLIGHT: IDENTITY_PASS`, `DRIVE_PASS`, `FIRESTORE_READ_PASS` und `PASS` bestanden. Das beweist **nicht** Firestore-Schreibrechte, Transaktions-Einmaligkeit unter echter Google-Cloud-Last oder die negative Isolation zu anderen Firestore-Datenbanken.

Der neue temporäre Code nutzt das Google-Cloud-Firestore-Server-SDK mit **Application Default Credentials** der separaten Dienstidentität, `databaseId:'lszh-offers-staging'` und regionalem Endpunkt `firestore.europe-west6.rep.googleapis.com`. Die bestehende Archiv-Reader-Funktion `lszh-archive-reader-staging` bleibt unangetastet und behält nur Drive-Leserechte.

## Bereits vor dem Google-Cloud-Deploy tatsächlich geprüft

GitHub-Actions-Workflow `38729580092`, Commit `5d2aa3f6c69b8a65825a699e3b9ebe10fc5c3a34`:
- 67 allgemeine Unit-Tests **PASS** (ein emulatorabhängiger Test im generellen Lauf bewusst übersprungen).
- Im getrennten Firestore-Emulator-Job **2 PASS, 0 FAIL**. Der zweite ruft exakt `transactionTest.mjs` auf und bestätigt auf dem echten lokalen Firestore-Emulator 12 parallele konkurrierende Transaktionen: **1 Commit, 11 abgewiesene Wiederholungen, anschliessend Löschung des synthetischen Testdokuments**.
- Diese Prüfungen erzeugen **keine** Datensätze in einer echten Google-Cloud-Firestore-Datenbank.

## Was bei einer manuellen Bereitstellung getestet wird

1. Beim Start prüft `index.js` die Cloud-Run-Metadatenidentität `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com`.
2. Eine **ausschliesslich lesende** Kontrollanfrage versucht auf der alternativen Datenbank `(default)` in einer künstlichen Testsammlung zu lesen, ohne Daten zurückzugeben oder zu protokollieren:
   - `IAM_NEGATIVE_DENIED` zeigt eine tatsächliche Zugriffsverweigerung.
   - `IAM_NEGATIVE_INCONCLUSIVE_DB_ABSENT` bedeutet, dass diese Datenbank nicht existiert; damit ist eine negative IAM-Isolation **nicht bewiesen**.
   - Bei unerwartet erlaubtem Lesezugriff `FAIL (unexpected_broad_access)`; es werden **keine** synthetischen Schreibtests gestartet.
3. Es wird **ein** Dokument `lszh_synthetic_txn_smoke_v1/synthetic_<zufällige Kennung>` in der **benannten** DB `lszh-offers-staging` per `create()` angelegt. Kein Token, kein echter Kunde, keine Offertennummer, keine PDF-Daten.
4. 12 gleichzeitige `runTransaction()`-Aufrufe wollen den Status von `sent` auf `accepted` und die Revision 1 auf 2 setzen. Die Prüfung verlangt **exakt einen** erfolgreichen Commit und elf bestätigte `already_accepted`-Ergebnisse, danach einen echten Readback des Datensatzes.
5. In `finally` erfolgt die **geschützte Löschung** per Transaktion. Die Dokumentkennung ist kryptografisch zufällig, die Collection ausschliesslich synthetisch und jede Löschung prüft einen eindeutigen Marker. **Nur wenn die Rückleseprüfung beweist, dass das Dokument entfernt wurde, kann `PASS` erscheinen.**
6. Der HTTP-Handler bleibt immer `503 {"error":"staging_disabled"}`; keine Annahmeschnittstelle, keine öffentlich auslesbaren Testdaten. **Kein produktiver Vertrag wird angenommen.**

## Manuelle Bereitstellung (durch Kontoinhaber)

**Nicht einen neuen Cloud-Run-Dienst erstellen.** Diesen bereits vorhandenen **separaten** Dienst nur für einen kurzfristigen Test aktualisieren:

1. Cloud Console mit dem Geschäftskonto öffnen: https://console.cloud.google.com/run?project=lszh-automations&authuser=2
2. Dienst `lszh-offer-portal-staging` öffnen, kontrollieren: Region **europe-west6**, **Ingress Intern**, **Authentifizierung IAM erforderlich**, Dienstkonto **LSZH Offer Portal Staging** (nicht Archiv-Reader), min. Instanzen **0**, max. **1**. Diese Einstellungen nicht ändern.
3. `Quelle` → `Quelle bearbeiten`:
   - `index.js`: **vollständiger** Inhalt aus [index.js](./index.js), nicht nur die sichtbaren ersten Zeilen.
   - `package.json`: **vollständiger** Inhalt aus [package.json](./package.json) (neu `@google-cloud/firestore` zusätzlich zum Functions Framework).
   - Neue Datei **`transactionTest.mjs`** mit dem vollständigen Inhalt aus [transactionTest.mjs](./transactionTest.mjs) anlegen. Die Datei muss im gleichen Verzeichnis wie `index.js` liegen; kein Unterordner.
4. **Funktionseinstiegspunkt `lszhPortalPreflight` unverändert** lassen; Node.js 22. **Speichern und wieder bereitstellen**. Kein `LSZH_PORTAL_STAGING_ENABLED=true` setzen; dieser temporäre Preflight hat keine solche Anforderung und aktiviert kein Portal.
5. Nach erfolgreicher Bereitstellung im Cloud-Run-Dienst `Observability → Logs` ohne widersprüchliche Filter nach `LSZH_PORTAL_TX_SMOKE` suchen. Erwartet: `START`, `IDENTITY_PASS`, `IAM_NEGATIVE_DENIED` oder `IAM_NEGATIVE_INCONCLUSIVE_DB_ABSENT`, `TRANSACTION_PASS (12_ATTEMPTS_1_COMMIT_11_DECLINED)`, `CLEANUP_PASS`, `PASS`. **Nicht** aus `Ready` allein auf Firestore-Schreibzugriff schliessen.
6. Bei `FAIL (firestore_iam_denied)`: die bedingte `Cloud Datastore-Nutzer`-IAM-Zuweisung, den genauen Database-CEL-Ausdruck und IAM-Caching prüfen, aber keine breite Owner/Editor-Rolle vergeben. Bei `FAIL (cleanup_failed)`: In Firestore **nur** innerhalb `lszh_synthetic_txn_smoke_v1` nach einem Dokument mit `owner=LSZH_SYNTHETIC_TRANSACTION_TEST_ONLY` schauen; vor Löschung Identität/Marker prüfen. Keine anderen Collections anfassen.
7. **Nach dokumentiertem Test** die vorherige reine Lese-Vorprüfung aus `cloud-run/offer-portal-preflight/index.js` und `package.json` wiederherstellen, die Datei `transactionTest.mjs` im Cloud-Run-Editor löschen und **erneut bereitstellen**. Dies verhindert, dass der einmalige Schreibtest bei jeder späteren kalten Instanz erneut ausgeführt wird. Originalcode und die bisherigen PASS-Logs bewahren. Der Dienst bleibt intern und IAM-geschützt.

## Einschränkungen und Freigaben

- Der Test kann geringe Firestore-API-, Speicher- und Cloud-Run-Abrechnung verursachen; dies ist ein bewusst manuell einzuleitender synthetischer Test.
- Falls die `(default)`-Datenbank nicht vorhanden ist, wird die *Negativprüfung* als `INCONCLUSIVE` ausgewiesen. Die zuvor verifizierte CEL-Bedingung ist ein gutes Sicherheitsdesign, aber die Abwesenheit einer zweiten DB kann **keine** echte negative IAM-Prüfung ersetzen. **Nicht** extra eine produktive Datenbank für diesen Test erstellen.
- Dieser Test führt eine minimale **echte Schreibaktion ausschliesslich auf der dedizierten Staging-Datenbank** aus, löscht sie hinterher und verschickt keine E-Mail. Der Cloud-Run-Dienst kann durch wiederholte Startvorgänge erneut Testdaten erzeugen, solange die temporäre Version installiert bleibt; deshalb danach wieder auf die lesende Version zurückstellen.
- Nicht mit juristischer Freigabe, WORM-Archiv, echtem Kunden-Onboarding oder produktiver Vertragsannahme verwechseln.
- Nur geschäftliche Google-Dienste, keine privaten Google Drives, keine herunterladbaren Dienstkontoschlüssel, keine Links mit offenem Archivzugriff.

Offizielle Quellen: [Firestore SDK-Transaktionen](https://firebase.google.com/docs/firestore/manage-data/transactions), [Firestore IAM](https://firebase.google.com/docs/firestore/security/iam), [Firestore database IAM conditions](https://firebase.google.com/docs/firestore/manage-databases).
