# LSZH Automations – Quarantäne-CAS: freigabepflichtiger STAGING-Testplan

## Offline-Integration bestehender Onboarding-Review → Quarantäne-CAS (17.10.2026)

Nach der erfolgreichen echten **synthetischen** Firestore-Liveprüfung (ein Create, ein Update; Revision 2; temporäre Service-Account-Berechtigung bestätigt entfernt) hat der Geschäftsführer mit `Vamos` den nächsten nichtproduktiven Entwicklungsschritt gestartet. Dieser ist **keine neue Freigabe** für weitere Cloud-IAM-Bindungen, Firestore-Operationen oder Runtime-/Make-Aktivierung.

**Neue reine Integrationsbibliothek:** `workers/onboarding-notifications/onboarding-quarantine-integration.js` exportiert `reviewOnboardingForQuarantine`. Sie verwendet **nur bestehende geprüfte Module**:

```text
synthetischer explizit allowlisteter ob_<UUID>-Projektcode
    + bestehender send-gesperrter Outbox-Entwurf
    + passende stabile eventId(recordId) aus outbox.js
    → listCandidateCodes() überprüft Fixture-Allowlist
    → reviewDraft() liest aktuelle Airtable-Onboarding-/Auftrag-/Kunden-/DSG-Belege
    → Status INVALID / UNAVAILABLE? BLOCKED bzw. HOLD_NO_PERSISTENCE
    → nur bei gültigem Review: prepareQuarantineCAS() für bereits zugeliefertes
       separat authentifiziertes Firestore-GET (404 für neue, 200 für bekannte)
    → NO_CHANGE / OFFLINE_CAS_REVIEW_REQUIRED / BLOCKED_NO_PERSISTENCE
    → AUSDRÜCKLICH KEIN Firestore-Write, keine Versandfreigabe
```

Die Bibliothek hat **keinen Firestore-/IAM-Transport**, keinen API-Endpunkt, keinen `fetch` auf Firestore, keinen eingebauten Scheduler und keine Sendefunktion. Sie gibt insbesondere **keinen ausführbaren CAS-Commit-Request**, keine Airtable-Codes, keine E-Mail-Adresse, keinen Record-ID-Wert, keine Token-Daten und keine Cloud-Dokumentadresse zurück. Ergebniswerte sind nur eingefrorene, nicht ausführbare Zustandsinformationen mit `deliveryAllowed:false`, `networkWriteAllowed:false`, `requiresManualApproval:true`, `retryAllowed:false`. Bei Airtable-Ausfall wird **nicht** allein aufgrund fehlender Information persistiert. Bei alter, ungültiger oder fremder Draft-ID ebenso **keine** CAS-Vorbereitung.

**12 neue vollständige Offline-Simulationen** prüfen reale vorhandene Funktionen `reviewDraft`, `planQuarantine`, `prepareQuarantineCAS` mit rein synthetischen Airtable-Responses und Snapshot-Fixtures, ohne eine echte Airtable- oder Firestore-API aufzurufen. Der Stand nach Einführung der Bibliothek meldete **357/357 GitHub-CI-Offline-Tests bestanden**, beide Workflows erfolgreich.

**Was diese Version ausdrücklich NICHT liefert:** Eine echte Live-Verbindung von `server.js` zur Quarantäne-Datenbank. Der Outbox-Worker bleibt separat deaktiviert. Firestore-`readStatus`/`firestoreDocument` werden derzeit nur als Eingaben für den Offline-Plan übernommen und müssen bei einem späteren genehmigten Lauf von einem eigenen nachweislich authentifizierten, genau auf die Quarantäne-Datenbank begrenzten Leseweg kommen. Dieser Authentifizierungs- und Transportweg ist **vor einer Aktivierung** separat zu planen und zu testen. Den bestehenden Outbox-Service-Account nicht durch pauschale Firestore-Projektrolle erweitern und den Quarantäne-Service-Account nicht auf `lszh-offers-staging` zugreifen lassen. Gültige Entwürfe sind zuerst über die bereits bestehende Offerten-STAGING-Identität ausschliesslich lesend nachzuweisen, bevor eine dedizierte Quarantäne-Prozessoridentität geordnet übergeben wird.

**Unverändert:** Das echte synthetische Testdokument mit ID `314baff3b1d52193fdd9e23dab4e9c39c38fdc5cff8980475cedce0d8b16bf42` verbleibt bewusst in `lszh-quarantine-staging`, Revision 2. Für eine spätere Entfernung wird eine eigene exakt befristete Freigabe benötigt; keinerlei DELETE, neuer Cloud-Run-Service, Scheduler, Mail oder erneute bereits genutzte Einmal-Tests ausführen.

## Live-Testnachweis: synthetischer CAS erfolgreich, permanenter Testdatensatz verbleibt (17.10.2026)

Der Geschäftsführer führte den zuvor ausdrücklich freigegebenen, neuen Einmal-Test `staging-quarantine-cas-write-once.sh --run-approved-once` in seiner LSZH Cloud Shell nach `git pull --ff-only` bis Commit `e682f7d` aus. Die wesentlichen Original-Statuszeilen:

```text
PASS: Exact 30-minute-limited SA-scoped IAM condition confirmed.
WAIT: 600 seconds for IAM propagation before impersonation.
PASS: Propagation wait completed; starting one gated synthetic CAS run.
FIXTURE_ID: 314baff3b1d52193fdd9e23dab4e9c39c38fdc5cff8980475cedce0d8b16bf42
FIXTURE_DB: lszh-quarantine-staging; FIXTURE_COLLECTION: lszh_onboarding_quarantine_cases_staging
PASS: Random synthetic document verified absent (404).
PASS: CREATE committed conditionally (exists:false); revision 1 read back and verified.
PASS: UPDATE committed with exact old updateTime; revision 2 verified.
DONE: One synthetic CREATE, one conditional UPDATE, three GETs, no deletes.
DONE: Case stays quarantined, send-disabled and requires manual approval.
PASS: Exact temporary Service Account Token Creator binding revoked.
PASS: Temporary IAM binding absent in fresh readback.
```

**Verifizierte Live-Wirkung:** Ein einziges synthetisches 64-stelliges Zufallsdokument wurde in `lszh-quarantine-staging` innerhalb `lszh_onboarding_quarantine_cases_staging` von anfänglichem 404 via `exists:false` atomar mit Revision 1 erstellt, separat per Dokument-GET bestätigt, dann mit exakt der gelesenen `updateTime` atomar auf Revision 2 aktualisiert und nochmals unabhängig GET-verifiziert. Finaler Quarantäne-Status hält `deliveryAllowed=false` und `requiresManualApproval=true` aufrecht. Genau **drei GET und zwei POST**; kein DELETE, keine Kundendaten, kein Cloud Run, kein Versand. Die temporäre Token-Creator-IAM-Bindung (nur auf dem dedizierten Service-Account; mit 30-minütiger Bedingung) wurde unmittelbar danach entfernt und nach unabhängigem Policy-Readback als **nicht mehr vorhanden** bestätigt.

**Bewusst verbleibender Testdatensatz:** `projects/lszh-automations/databases/lszh-quarantine-staging/documents/lszh_onboarding_quarantine_cases_staging/314baff3b1d52193fdd9e23dab4e9c39c38fdc5cff8980475cedce0d8b16bf42`. Erwartete Revision 2. Dokument nicht automatisch oder vorsorglich löschen. Die Service-Account-Custom-Role enthält **kein** `datastore.entities.delete`; für eine spätere Version-geprüfte Entfernung oder Archiventscheidung bedarf es einer **neuen ausdrücklichen und auf diesen synthetischen Fixture beschränkten Freigabe**. Prüfen, dass der Testdatensatz vor einem eventuellen zukünftigen Löschvorgang noch genau dem dokumentierten Zustand entspricht; keine blind wiederholten Writes.

**STOP – Einmal-Test vollständig verbraucht:** Den Aufruf `staging-quarantine-cas-write-once.sh --run-approved-once` **nicht erneut ausführen** – ebenso wenig die historischen IAM-/Named-DB-Provisionierer oder V1/V2-Leseproben. Die älteren Abschnitte dieses Runbooks, die den Schreibtest als erst bevorstehend beschreiben, sind historisch. Der Live-Test beweist genau diesen einzelnen atomaren CAS-Pfad, aber keinen produktiven End-to-End-Betrieb oder echten Konkurrenzlauf. Kein zusätzliches IAM, keine Cloud-Run-Aktivierung und kein Versand freigegeben.

## Einmaliger realer synthetischer CREATE-/UPDATE-CAS-Test – ausdrücklich freigegeben, Ausführung noch offen (17.10.2026)

**Freigabe:** Nach der 324/324 erfolgreich geprüften Offline-CAS-State-Machine und der ausdrücklichen Bitte um Genehmigung für einen ersten echten synthetischen Quarantäne-CAS-Schreibtest hat der Geschäftsführer mit `du hast die freigabe, vamos` zugestimmt. Diese Freigabe gilt **nur** für eine synthetische einmalige CREATE-/UPDATE-Serie im bereits bestehenden `lszh-quarantine-staging`, nicht für produktive Angebote, Notifications oder fremde Datenbanken.

**Die Ausführung erfolgt erst nach weiteren Offline-Tests durch den Geschäftsführer persönlich in Cloud Shell.** Vorhandene IAM-Role `projects/lszh-automations/roles/lszhQuarantineCasStaging` (genau `datastore.entities.create/get/update`) und Datenbank-IAM-Bedingung bleiben unverändert. Der Runner erteilt **maximal einmal** `roles/iam.serviceAccountTokenCreator` an `user:lars@lszh-automations.ch`, **nur auf** `lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com`, mit einer **30-Minuten-Ablaufbedingung**. Kein breitflächiges IAM und keine permanenten Schlüssel. Nach 600 Sekunden IAM-Propagation erzeugt nur der isolierte Node-Executor ein kurzlebiges impersoniertes Token im Prozessspeicher. Beide Runner haben einen EXIT- und Signal-Cleanup zur **sofortigen exakten Entfernung des temporären SA-Policy-Bindings plus unabhängiger Readback-Kontrolle**. Bei Abbruch ohne Cleanup lässt die Bedingung die Rolle nach maximal 30 Minuten unwirksam werden; bereits ausgestellte OAuth-Tokens können separat noch gültig bleiben, werden aber nicht auf Disk geschrieben.

**Eindeutige synthetische Daten:**
- 64 Hex-Zeichen aus kryptografischem Zufall, unabhängig von realen Airtable-Record-IDs; die Konsole zeigt `FIXTURE_ID` zur späteren manuellen Nachverfolgung. Einmal-Sperre am Host verhindert normale Wiederholung.
- Nur `projects/lszh-automations/databases/lszh-quarantine-staging/documents/lszh_onboarding_quarantine_cases_staging/<FIXTURE_ID>`. Start mit einem gezielten GET auf genau dieses Testdokument; nur bei `404` weiter.
- Schritt 1: genau ein atomarer `POST documents:commit` mit `currentDocument.exists=false`, Audit-Revision 1, `deliveryAllowed=false`, `requiresManualApproval=true`. Anschliessend unabhängig GET 200 und strenger Abgleich von Version, Identität, Schema und Audit.
- Schritt 2 nur nach bestätigtem Schritt 1: genau ein `POST documents:commit` mit der **gelesenen exakten** `currentDocument.updateTime`-Precondition, Revision 2 und stärkerem Sticky-Quarantäne-Status. Unabhängiger GET 200 mit verifizierter Version, Payload und Revision. Insgesamt maximal **3 Dokument-GET** und **2 konditionierte POST**. Kein Update bei einem unerwartet vorhandenen Dokument. Keine automatischen Wiederholungen bei HTTP 403/409/412/503, Netzwerkfehlern oder unklarem Ack.
- Der Test-Executor verwendet die bereits vorhandenen Offline-Sicherheitsbibliotheken `planQuarantine` und `buildQuarantineCommit` über `quarantine-cas-offline-cycle.js`. Firestore-normalisierte Zeitstempel werden strikt kanonisiert, ohne fehlerhafte Kalenderdaten oder Submillisekunden in der Auditspur zuzulassen.
- Da die CAS-Serviceidentität absichtlich **keine** `datastore.entities.delete`-Berechtigung besitzt, **bleibt das reine Testdokument bestehen**. Kein automatischer DELETE-Versuch, keine neue privilegierte Löschrolle und kein fremdes Löschen. Bei Fehlern nach dem ersten Commit könnte die Revision 1 bestehen bleiben. `FIXTURE_ID` und `BLOCKED`-/`PASS`-Zeilen reichen zur getrennten read-only Sichtung; keine Tokens/Rohantworten an ChatGPT senden.

**Der nun freigegebene Aufruf, EXAKT EINMAL (nicht bereits ausgeführt):**
```bash
cd ~/lszh-outbox-review &&
git pull --ff-only &&
LSZH_TEMPORARY_IMPERSONATION_APPROVAL=I_APPROVE_SINGLE_SYNTHETIC_QUARANTINE_CAS_WRITE \
bash workers/onboarding-notifications/staging-quarantine-cas-write-once.sh --run-approved-once
```

**Optionaler vorheriger nur lesender Planmodus:**
```bash
cd ~/lszh-outbox-review &&
git pull --ff-only &&
bash workers/onboarding-notifications/staging-quarantine-cas-write-once.sh --plan
```

**Erfolg erfordert** erfolgreiche Erstellung + Readback Revision 1, erfolgreiche bedingte Aktualisierung + Readback Revision 2 sowie die beiden Meldungen zum widerrufenen temporären IAM-Grant und unabhängigen IAM-Policy-Readback. Nach einem Fehler **niemals denselben Einmal-Runner wiederholen**. Für die spätere Aufräumung ist eine separate explizite Löschfreigabe und ein minimaler Löschweg zu planen; keine pauschale IAM-Aufrüstung. Ältere V1-/V2-Leserunner dürfen ebenfalls nicht erneut ausgeführt werden.

## Offline-CAS-Einmaldurchlauf: Create und Update vorbereitbar, reale Schreibprobe weiterhin gesperrt

Nach der erfolgreichen **echten** 404-/403-Leseisolation und unabhängig verifizierten Entfernung des V2-Token-Creator-Grants ist auf `Vamos` **ausschliesslich Offline-Code** entstanden:
- `workers/onboarding-notifications/quarantine-cas-offline-cycle.js` bindet die vorhandene Quarantäne-Planungs- und Firestore-CAS-Bibliothek zu einem reinen, nebenwirkungsfreien **GET → Prüfung → ein Commit-Entwurf oder No-op → unabhängiges Readback-Assessment** zusammen. Der Code sendet selbst keinerlei Requests.
- `buildQuarantineRead(draftId)` liefert nur einen fixen `GET` auf die dedizierte Quarantäne-Datenbank und ihre allowlistete Collection; 64-stellige Hex-IDs sind erforderlich.
- `prepareQuarantineCAS` unterscheidet striktes `404` (Create nur mit `exists:false`), striktes `200` (Update nur mit exakt gelesenem `updateTime`) und `NO_CHANGE`. Alles andere wird `BLOCKED_NO_RETRY`; kein freier Dokumentpfad, kein Send-/Approval-Feld und kein blindes Überschreiben.
- `assessQuarantineCommit` wertet nur einen einzelnen bereits extern eingetroffenen Commit-Status/Receipt mit einem separaten Dokument-Readback aus. `READBACK_VERIFIED` erfordert HTTP 200, gültige einzelne `writeResults`, exakt gleichen Datensatz und denselben bis Mikrosekunden normalisierten `updateTime`-Wert. Fehler, Timeout, 409/412, falsche Version oder mangelhafter Beleg enden in `BLOCKED_NO_RETRY`, **ohne** erneute Schreibabsicht.
- `firestore-quarantine-cas.js` verwirft jetzt auch kalendarisch ungültige `updateTime`-Werte, die JavaScript `Date.parse` sonst durch Normalisierung hätte akzeptieren können.
- `quarantine-cas-offline-cycle.test.mjs` simuliert parallel konkurrierende Erst-Anlagen und Updates, No-op, kritische Fehler, fehlende Commit-Receipts, Abweichungen nach Readback und verbotene Quell-Felder. Synthetische CI zuerst 324/324 PASS; endgültige Commit-CI separat geprüft.

**Entscheidende Grenze für den späteren Echtgeld-/Cloud-Test:** Die echte IAM-Rolle `lszhQuarantineCasStaging` hat ausschliesslich `datastore.entities.create/get/update`, **keine Delete-Berechtigung**. Eine echte synthetische Probe in dieser isolierten Datenbank würde ein Testdokument hinterlassen; weder automatische Löschung noch Rollenerweiterung sind genehmigt. Vor dem ersten realen Write braucht es eine eigene eng definierte Freigabe für genau eine synthetische Create-/Update-Serie mit bekannten Folgeschritten (inkl. Verbleib/Entfernung des Fixtures), eigene Token-/Impersonation-Freigabe, und ein fail-closed Runbook mit höchstens zwei konditionierten Commits und unabhängiger Nachkontrolle. Die früheren Einmal-Skripte für Datenbank, IAM oder lesende Isolation **nicht wiederholen**. Weiterhin keine Cloud Run Builds/Deployments oder produktive E-Mails.

## V2-Livetest erfolgreich und temporärer Grant entfernt – 17.10.2026

**Live-Nachweis anhand der vom Geschäftsführer gelieferten Cloud-Shell-Ausgabe** für `staging-quarantine-timed-read-check-v2.sh --run-approved-once` nach ausdrücklich begrenzter Freigabe:

```text
PASS: Exact 30-minute-limited SA-scoped IAM condition confirmed.
WAIT: 600 seconds for IAM propagation before impersonation.
PASS: Propagation wait completed; attempting one token request.
PASS: Quarantine DB authenticated GET returned 404 for random missing document.
PASS: Offers DB denied authenticated GET with HTTP 403.
DONE: Two REST GET requests, no Firestore writes.
PASS: Exact temporary Service Account Token Creator binding revoked.
PASS: Temporary IAM binding absent in fresh readback.
```

**Bewertung:** Die neue Quarantäne-Serviceidentität konnte eine zufällige, nicht vorhandene Dokument-ID in der zugehörigen Named Database lesen/abfragen (404); mit derselben Identität wurde derselbe GET auf die bestehende `lszh-offers-staging` mit 403 verweigert. Damit ist die **beobachtete Datenbank-Isolation für diese beiden Firestore-Dokument-GETs** nachgewiesen. Die vorübergehende Berechtigung `roles/iam.serviceAccountTokenCreator` auf dieser dedizierten Service-Account-Ressource wurde nach dem Test **sofort widerrufen**; ein neuer IAM-Policy-Readback bestätigte das Fehlen dieser exakten Berechtigung. Die 30-Minuten-Befristung war zusätzlich aktiv. Kein Datensatz geändert, erstellt oder gelöscht und kein Cloud Run gestartet.

**STOP – beide Einmal-Runner sind verbraucht:** `staging-quarantine-timed-read-check.sh --run-approved-once` (V1) und `staging-quarantine-timed-read-check-v2.sh --run-approved-once` (V2) **niemals erneut ausführen**. Kein neues Token-Creator-Recht ohne eigenständige Genehmigung. Die älteren, darunter stehenden Pläne mit noch bevorstehendem Live-Test sind **historisch**, nicht erneut auszuführende Anweisungen. Keine Behauptung, dass damit geerbte IAM-Rechte oder effektive Schreib-/CAS-Berechtigungen umfassend geprüft wären. **Nächster Freigabepunkt:** synthetische Firestore-CAS-Schreibprobe erst nach gesonderter technischer Vorbereitung und ausdrücklicher Freigabe; keine produktiven Dokumente, keine Mail, keine Cloud Run-Aktivierung.

Status am 17.10.2026: **Separat isolierte Quarantäne-Named-Database, aktiver Löschschutz, dedizierter Service-Account und exakt 3-rechtige, DB-konditionierte Custom Role sind erstellt und metadatengeprüft. Der reale impersonierte Read-Isolationstest V2 ist erfolgreich: Quarantäne-DB HTTP 404, Offerten-DB HTTP 403. Der kurzzeitige Token-Creator-Grant wurde entfernt und die Abwesenheit im IAM-Readback bestätigt.** Firestore-CAS-Schreibtest, Cloud-Run-Runtime, Deployment und Versand bleiben NICHT ausgeführt bzw. nicht freigegeben. Ältere Abschnitte dokumentieren historische Planstände.

## Einmaliger V2-Lesetest: zweite eng begrenzte IAM-Freigabe liegt vor (17.10.2026)

Nach erfolgreichem *realem* `--plan` des V2-Lesetestskripts (`PLAN ONLY: No Cloud changes or API calls to Firestore.`) hat der Geschäftsführer die **zweite, konkrete IAM-Genehmigung** am 17.10.2026 ausdrücklich mit `du hast meine genehmigung` erteilt. Diese Zustimmung gilt **ausschliesslich** für den bereits geprüften einmaligen V2-Ablauf: nur SA-gebundenes `roles/iam.serviceAccountTokenCreator` für `user:lars@lszh-automations.ch`, mit auf 30 Minuten ab Vergabe ablaufender Bedingung; 600 Sekunden IAM-Propagation-Wartezeit; genau ein impersonierter Tokenversuch; maximal zwei lesende GETs mit zufälliger Test-ID auf neue Quarantäne-Datenbank (404 erwartet) und bisherige Offerten-Datenbank (403 erwartet), und sofortige Entfernung der exakten temporären Bindung samt unabhängiger Prüfung auch bei Fehler. **Keine Firestore-Schreiboperation, kein Cloud Run/Deployment, keine produktive Aktivierung, keine neue permanente Berechtigung.**

**Einmalig genehmigter ausführbarer Cloud-Shell-Befehl:**
```bash
cd ~/lszh-outbox-review &&
git pull --ff-only &&
LSZH_TEMPORARY_IMPERSONATION_APPROVAL=I_SEPARATELY_APPROVE_SECOND_TIMED_QUARANTINE_READ_TEST_V2 \
bash workers/onboarding-notifications/staging-quarantine-timed-read-check-v2.sh --run-approved-once
```
Die bereits einmal ausgeführte V1 darf weiterhin **nie erneut** gestartet werden. Die V2 ist mit einer neuen eigenen `.once`-Sperre ausgestattet; bei Fehlschlag **nicht erneut ausführen**. Teilen nur kontrollierte Statusausgabe ohne Tokens. Erfolg verlangt positive Firestore-404- und verweigerte Offerten-403-Meldungen **sowie** den unabhängigen Nachweis, dass die temporäre IAM-Bindung entfernt ist. Ein 404 alleine beweist keinen vollständigen IAM-Isolationszustand. Die **Freigabe ist keine Behauptung, dass diese Live-Anwendung bereits stattgefunden hat**.

## Historischer Plan des Lesetests V2 – zuvor noch keine IAM-Freigabe (17.10.2026)

Auf das Fortsetzungssignal `Vamos` nach der **leeren `GenerateAccessToken`-Auditlogabfrage** und dem `null`-Ergebnis der projektseitigen `auditConfigs` wurden **nur Review-Branch-Code und Offline-Tests** erweitert. Eine erneute Berechtigungserteilung oder Live-Token-Erzeugung wurde **nicht** autorisiert. Vorheriger Einmal-Lauf (V1) bleibt abgeschlossen: kein Firestore GET, sofortige überprüfte Grant-Entfernung. **V1 niemals wiederholen.**

Der getrennte Runner `workers/onboarding-notifications/staging-quarantine-timed-read-check-v2.sh` übernimmt exakt die Quarantäne-/Firmenkonto-/IAM-Metadatenvorprüfungen und die auf `lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com` begrenzte bedingte Token-Creator-Rolle. Verbesserungen gegenüber V1:

- **Eine feste 600-Sekunden-Wartephase nach der bestätigten zeitlich bedingten Berechtigung**, bevor einmalig `gcloud auth print-access-token --impersonate-service-account=...` aufgerufen wird. Google dokumentiert üblicherweise ca. 2 Minuten IAM-Propagation, in Einzelfällen 7 Minuten oder länger; 10 Minuten reduzieren, aber beseitigen diese Unsicherheit nicht.
- Die Rolle würde weiterhin automatisch nach **30 Minuten** durch `request.time < timestamp(...)` unwirksam; unmittelbares, unabhängig nachkontrolliertes Entfernen im Cleanup nach Testende oder Fehler bleibt vorgeschrieben. Bereits vor Ablauf ausgestellte OAuth-Tokens können theoretisch länger gültig sein; das Skript verwendet sie nur im flüchtigen Prozessspeicher und gibt nichts davon aus.
- Token-Ausgaben und rohe Fehlermeldungen bleiben geheim. Es werden ausschliesslich allowlistete Kategorien ausgegeben (z. B. `PERMISSION_DENIED`, `SERVICE_ACCOUNT_NOT_FOUND`, `CREDENTIALS_API_UNAVAILABLE`, `CLI_AUTHENTICATION_UNAVAILABLE`, `COMMAND_TIMEOUT`, `UNCLASSIFIED_FAILURE`). Bei keiner gültigen Token-Ausgabe: **null Firestore GETs**. Bei Erfolg maximal zwei reine Dokument-`GET` auf einen zufälligen, faktisch nicht existierenden Pfad (Quarantäne 404, Offerten 403); kein `LIST/POST/PATCH/DELETE`, kein Lesen des Response-Bodys.
- Neuer, separater Freigabe-String `I_SEPARATELY_APPROVE_SECOND_TIMED_QUARANTINE_READ_TEST_V2` und eine eigene lokale `.once`-Sperre verhindern Wiederverwendung der **bereits aufgebrauchten Freigabe für V1**. **Diesen Approval-String nicht setzen, solange keine neue ausdrückliche Zustimmung des Geschäftsführers für eine zweite IAM-Zuweisung und diesen V2-Lesetest vorliegt.**
- Version V1 und dessen Marker werden unverändert beibehalten; bei jeder Warnung oder Teiländerung bleibt ein weiterer Versuch blockiert. Die separate Quarantäne-Datenbank, drei CAS-Entity-Berechtigungen und bestehende Offerten-Datenbank bleiben unverändert.

**Jetzt zulässig, ausschliesslich lesender Plan:**
```bash
cd ~/lszh-outbox-review &&
git pull --ff-only &&
bash workers/onboarding-notifications/staging-quarantine-timed-read-check-v2.sh --plan
```
Nicht `--run-approved-once` aufrufen; keine zusätzlichen IAM-Bindungen, API-/Audit-Aktivierung, Firestore-Dokumentzugriffe oder Deployments. **Die CI-Läufe simulieren alle IAM- und HTTP-Aktionen ohne Cloud-Zugriff; sie sind kein Nachweis eines echten Firestore-GET.**

## Live-Ausführung der einmaligen temporären Identitätsübernahme: fehlgeschlagen und sauber bereinigt

Nach dem Update auf Commit `d2ca43b` hat der Geschäftsführer den exakt freigegebenen `staging-quarantine-timed-read-check.sh --run-approved-once` **einmalig** gestartet. Alle IAM-Vorprüfungen und die präzise, an den dedizierten Service-Account gebundene 30-Minuten-Condition bestanden. Die danach sofort versuchte Token-Generierung meldete `BLOCKED: IMPERSONATION_NOT_VERIFIED; no Firestore GET sent.` Der EXIT-Cleanup meldete **`PASS: Exact temporary Service Account Token Creator binding revoked.`** und **`PASS: Temporary IAM binding absent in fresh readback.`** Es ist deshalb **keine temporäre Berechtigung mehr aktiv oder in der SA-Policy vorhanden**. Keine Dokumentabfrage fand statt. **Den Einmal-Runner NICHT erneut ausführen.** Die erwarteten 404/403-Ausgangswerte wurden **nicht** beobachtet.

Die Ursache kann nicht aus der absichtlich bereinigten Fehlermeldung bestimmt werden. Googles dokumentierte IAM-Propagation nach neuen Policy-Bindungen dauert typisch rund 2 Minuten und kann 7 Minuten oder länger dauern; ein Token-Mint unmittelbar nach der Metadaten-Prüfung kann daher noch `PERMISSION_DENIED` liefern. Dies ist eine plausible Hypothese, kein Nachweis. Vor einer neuen Freigabe: nur lesende Kontrolle vorhandener IAMCredentials-`GenerateAccessToken`-Auditlogs; wenn keine Log-Daten erscheinen, kann das daran liegen, dass Data-Access-Auditlogs nicht aktiviert waren. **Keine Logging-/IAM-Änderungen und keine neue Grant-Ausführung durch blosses `Vamos`.**

## Genehmigter temporärer Lesetest mit selbstablaufender SA-IAM-Bindung (17.10.2026)

Der Geschäftsführer genehmigte ausdrücklich eine **einmalige, höchstens einstündige Token-Creator-Berechtigung** auf dem dedizierten Quarantäne-Service-Account, mit anschliessender Entfernung. Vorherige Diagnose: `iamcredentials.googleapis.com` aktiv; Policy Troubleshooter `CANNOT_ACCESS` für den Benutzer und `iam.serviceAccounts.getAccessToken`. Die Policy-Troubleshooter-API wurde zuvor durch den Geschäftsführer interaktiv aktiviert.

**Neu:** `workers/onboarding-notifications/staging-quarantine-timed-read-check.sh`. Zwei Modi: Standard `--plan` (nur Bestandslesen) und `--run-approved-once` mit exaktem Freigabe-Marker `LSZH_TEMPORARY_IMPERSONATION_APPROVAL=I_APPROVE_TEMPORARY_QUARANTINE_SA_TOKEN_CREATOR_FOR_READ_TEST`. Der Runner setzt folgende Sicherheitsgrenzen:
- überprüft Firmenkonto, unveränderten und synchronisierten Feature-Branch, vorhandene Quarantäne-Datenbank sowie exakt begrenzte CAS-Rolle/IAM-Bindung über den bewährten `staging-quarantine-iam-preflight.sh --plan`; verifiziert aktivierte Credentials-API;
- prüft vor jeder Mutation die IAM-Policy **auf der Service-Account-Ressource** und stoppt, falls bereits direkte Berechtigungen für den Benutzer bestehen;
- verwendet nur einmal eine **auf diesen Service-Account beschränkte** `roles/iam.serviceAccountTokenCreator`-Bindung mit Condition `request.time < timestamp(...)` auf **30 Minuten** ab Cloud-Shell-Ausführung. Niemals projektweit und niemals unbegrenzt. Die Policy wird unmittelbar nach dem Grant erneut auf exakte Rolle, einzelnen Benutzer und Condition geprüft; Fehlschlag führt zur Bereinigung;
- genau ein kurzlebiges impersoniertes Zugriffstoken **nur im Python-Prozessspeicher**, kein JSON-Key, keine Ausgabe/Speicherung des Tokens; eine unvorhersehbare 64-stellige Hex-Testdokument-ID; **maximal zwei HTTP GETs** ohne Weiterleitungen, ohne Antwortinhalt zu lesen: zuerst neue `lszh-quarantine-staging` (erwartet 404), dann bei genau 404 alte `lszh-offers-staging` (erwartet 403);
- `EXIT`-/Signal-Cleanup versucht **unmittelbar nach Erfolg und Fehler** die **exakte zeitlich bedingte IAM-Bindung** wieder zu löschen und liest die SA-IAM-Policy unabhängig zurück. Bei unsicherem Ergebnis Warnung und **kein Retry**; die bedingte Rolle verliert nach 30 Minuten auch ohne erfolgreichen Cleanup ihre Wirksamkeit. Ein lokaler Einmal-Marker verhindert normale Wiederholungen.
- kein Firestore-POST/PATCH/DELETE/LIST, keine Cloud-Run-Aktivierung, keine Kundenaktion, keine permanenten Rollen, kein zusätzliches IAM auf `lszh-offers-staging`.

**Synthetisch lokal in GitHub-CI geprüft:** `staging-quarantine-timed-read-check.test.mjs` testet Plan, Freigabesperre, genau einen Grant mit Cleanup, 2-GET-Probe, existierende SA-Rolle, Token-Verweigerung, negative 404, Grant-/Remove-Fehler, falsche Identität und Syntax. Nach Korrektur des Condition-JSON-Encodings bestanden **300/300** Offline-Tests; keine echte Token-Minting-/Firestore-REST-Ausführung erfolgt durch CI.

**Cloud-Shell-Planmodus:**
```bash
cd ~/lszh-outbox-review &&
git pull --ff-only &&
bash workers/onboarding-notifications/staging-quarantine-timed-read-check.sh --plan
```

**Freigegebener einmaliger Live-Test (nicht wiederholen, auch bei Teilfehler):**
```bash
cd ~/lszh-outbox-review &&
git pull --ff-only &&
LSZH_TEMPORARY_IMPERSONATION_APPROVAL=I_APPROVE_TEMPORARY_QUARANTINE_SA_TOKEN_CREATOR_FOR_READ_TEST \
bash workers/onboarding-notifications/staging-quarantine-timed-read-check.sh --run-approved-once
```
Nur kontrollierte `PASS`-/`BLOCKED`-/`WARNING`-Ausgaben im Chat teilen. Falls der abschliessende Cleanup nicht unabhängig bestätigt ist: **keine weitere Mutation**, Zeitablauf der Condition respektieren und die SA-IAM-Policy später read-only überprüfen. Ein Erfolg bestätigt ausschliesslich diese beiden Lese-Resultate, nicht die Abwesenheit jeder denkbaren geerbten IAM-Berechtigung.

## Nachweis der einmaligen Quarantäne-IAM-Einrichtung (17.10.2026)

Auf Grundlage der ausdrücklich auf Service-Account, Custom Role und DB-konditionierten IAM-Grant begrenzten Freigabe führte der Geschäftsführer nach dem Update des Review-Branches `staging-quarantine-iam-setup.sh --apply-once` aus. Die Terminalausgabe bestätigte nacheinander:
- `PASS: New quarantine service identity matches approved name.`
- `PASS: Custom role exactly matches the 3 approved permissions.`
- `PASS: Exact quarantine SA, minimal custom role, single DB-scoped IAM condition.`
- `PASS: No user-managed service account keys detected.`
- `DONE: One isolated quarantine IAM setup completed; DO NOT RERUN.`

**Verifiziert nach diesen GCP-Metadaten:** dedizierter Service-Account `lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com`, Rolle `projects/lszh-automations/roles/lszhQuarantineCasStaging` mit exakt `datastore.entities.create/get/update`, eine Bedingung auf die separate Datenbank `lszh-quarantine-staging`. Die bisherige `lszh-offers-staging`-Datenbank wurde nicht verändert.

**STOP:** Alle Einmal-Provisionierungsskripte (`staging-quarantine-db-provision.sh --create-once`, `staging-quarantine-iam-setup.sh --apply-once`) **niemals wiederholen**. Zunächst nur Metadaten erneut lesen:
```bash
cd ~/lszh-outbox-review &&
git pull --ff-only &&
bash workers/onboarding-notifications/staging-quarantine-iam-preflight.sh --plan
```
Dieser Aufruf hat keinen Änderungsmodus. Bei `BLOCKED` zunächst die Sachlage ermitteln, nicht zusätzliche Rechte vergeben. **Geerbte Rollen und tatsächlicher Firestore-REST-Zugriff durch die neue Identität sind noch nicht bestätigt.** Für jeden echten Firestore-Dokument-Schreibtest, Cloud-Run-Build/Deployment und E-Mail-Versand sind weitere gesonderte Freigaben erforderlich.

## Dedizierte IAM-Einrichtung: historischer freigegebener Plan (bereits ausgeführt)

**Freigabe des Geschäftsführers am 17.10.2026:** Auf den konkret genannten nächsten Schritt «Service-Account, minimale Custom Role, nur auf `lszh-quarantine-staging` begrenzte IAM-Zuweisung» antwortete er `du hast meine freigabe, vamos`. **Umfang dieser Genehmigung:** genau eine dedizierte IAM-Dienstidentität und eine benutzerdefinierte Rolle mit **nur** `datastore.entities.create`, `datastore.entities.get`, `datastore.entities.update`, mit genau einer auf `projects/lszh-automations/databases/lszh-quarantine-staging` beschränkten projektweiten IAM-Bedingung. **Nicht freigegeben:** Cloud Run/Build, Firebase-Dokumentzugriffe, Testdaten-Schreiboperationen, E-Mails, Kunden-Onboarding oder Produktivbetrieb.

**Vorbereitete isolierte Skripte:** `workers/onboarding-notifications/quarantine-iam-provisioning.js` (rein synthetischer Metadatenvergleich), `staging-quarantine-iam-setup.sh` (Standard `--plan`, explizites gesichertes `--apply-once` nur nach genauer Approval-Markierung) und `staging-quarantine-iam-setup.test.mjs` (Mock-GCP mit Erfolgs-, Fehler- und Teilzustandsfällen). Die bestehende `quarantine-iam-plan.js` wurde so gehärtet, dass ein in der Cloud-API bei `false` fehlendes optionales `disabled`-Feld nicht fälschlich ablehnt und die Custom Role exakt `GA` sein muss.

**Sicherheitsbedingungen:** Vor jedem Cloud-Mutation-Befehl verifiziert das Skript Git-Branch, unveränderten und synchronisierten Checkout, LSZH-Geschäftsidentität, die bestehende separate Quarantäne-Named-Database mit aktivem Löschschutz, dass SA/Custom Role noch nicht existieren sowie das vollständige abrufbare Projekt-IAM-Policy-Metadatenbild ohne bereits an die neue Identität gebundene Rechte. **Kein pauschaler Wiederanlauf und keine Bereinigung** bei einer Teil-Einrichtung. Erst danach sind genau drei Änderungen zulässig: 1) Service Account ohne vom Skript angelegte Schlüssel, 2) exakt dreirechtige Custom Role, 3) exakt konditionierter IAM-Grant. Nach dem letzten Schritt werden SA-/Rollen-/IAM-/User-managed-Key-Metadaten streng geprüft. Die gesamte Ausgabe gibt nur kontrollierte Prüfstatusmeldungen aus; keine Tokens, rohen IAM-Policies oder Key-Metadaten. Eine bestandene IAM-Metadatenprüfung beweist **noch nicht** geerbte Rechte, effektive Firestore-REST-Berechtigungen oder eine aktive Runtime.

**Planmodus, derzeit ohne Cloud-Mutation ausführbar:**
```bash
cd ~/lszh-outbox-review &&
git pull --ff-only &&
bash workers/onboarding-notifications/staging-quarantine-iam-setup.sh --plan
```

**Nur bei bereits dokumentierter expliziter Freigabe und bestandener GitHub-CI kann danach einmalig ausgeführt werden:**
```bash
cd ~/lszh-outbox-review &&
git pull --ff-only &&
LSZH_QUARANTINE_IAM_PROVISIONING_APPROVAL=I_APPROVE_LSZH_QUARANTINE_SA_CUSTOM_ROLE_AND_CONDITIONAL_IAM \
bash workers/onboarding-notifications/staging-quarantine-iam-setup.sh --apply-once
```
Bei `BLOCKED`/`UNVERIFIED` **STOP, nicht erneut ausführen**. Bei Erfolg den stdout ohne geheime Daten zur Bestandsverifikation mitteilen. Keine zusätzliche Datenbank anlegen oder die bereits durch den Nutzer einmal erfolgreich ausgeführte Datenbankerstellung erneut starten.

## Nachweis der genehmigten einmaligen Datenbankerstellung (17.10.2026)

Der Geschäftsführer hat mit `du hast meine genehmigung, vamos` **explizit** die neue kostenpflichtig nutzbare Datenbank genehmigt und den freigegebenen Runner `staging-quarantine-db-provision.sh --create-once` selbst in Cloud Shell auf dem aktuellen Review-Branch ausgeführt. Der Ablauf meldete einen einzigen Firestore-Datenbank-Create-Versuch und anschliessend nach eigenem `describe`:
```text
PASS: Exact Zurich Native database and deletion protection verified.
PASS: Exactly one billable isolated staging database created; no IAM/data changes.
DO NOT RERUN. Service account, role, IAM and writes need separate approvals.
```
`projects/lszh-automations/databases/lszh-quarantine-staging` existiert nun als Standard/Native Named Database in Zürich (`europe-west6`) mit aktivem Löschschutz. Dies wurde anhand der vom Nutzer übermittelten Cloud-Shell-Ausgabe bestätigt, nicht durch einen zusätzlichen Cloud-Zugriff von ChatGPT.

**STOP: Das Einmal-Skript NICHT erneut ausführen.** Der alte Provisioning-Readiness-Check erwartet ausdrücklich, dass die Ziel-Datenbank noch fehlt; er ist deshalb **für weitere Bereitstellungsversuche obsolet**, nicht mehr als Nachweis für diesen bereits erfolgten Schritt geeignet. Nachfolgende Datenbankkontrollen müssen `describe` verwenden, nicht `create`.

**Nächste IAM-Grenze:** Der **separate** Service-Account `lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com`, die Custom Role `lszhQuarantineCasStaging` mit ausschliesslich `datastore.entities.get/create/update` und die Bedingung `resource.name=="projects/lszh-automations/databases/lszh-quarantine-staging"` sind noch **nicht** eingerichtet oder genehmigt. Keine automatische Bindung, kein SDK-Schreibzugriff, kein Cloud-Run-Job. Zuerst read-only prüfen/planen; dann gesonderte explizite IAM-Ressourcenfreigabe einholen. Der spätere einmalige synthetische Firestore-Schreibtest verlangt wiederum gesonderte Freigabe.

## Zweck und bewiesener Stand

Der existierende Cloud-Run-Job `lszh-airtable-read-probe-fix-staging` wurde bereits **genau einmal** mit einem erfolgreichen synthetischen Airtable-GET ausgeführt; **nicht wiederholen**. Die Quarantäne-Kette besteht bisher aus `reviewDraft` (frischer Airtable-Lesestatus, niemals Versandfreigabe), `planQuarantine` (monotone Revision und Audit, keine Wirkung) und `firestore-quarantine-cas.js` (ein einzelner bedingter Firestore-REST-`commit`-Anfrageentwurf, Identitätsprüfung beim Readback). Das ist **kein ausgerollter persistierender Dienst**.

## Freigabepflichtige Einmal-Erstellung – Skript vorbereitet, noch nicht ausgeführt

**Separate Billigungsgrenze:** Das einzelne Wort `Vamos` gilt hier nicht als Freigabe für die entstehende kostenpflichtige Cloud-Ressource. Es wurden nur GitHub-Quelltext und synthetische Tests verändert. Für den beabsichtigten Erstellungsbefehl muss der Geschäftsführer zuvor ausdrücklich bestätigen, dass er die **neue Named Database `lszh-quarantine-staging` (Standard, Firestore Native, `europe-west6`, Löschschutz) mit nutzungsabhängigen Kosten** genehmigt. Die Zustimmung zu dieser Datenbank gilt ausdrücklich **nicht** für die gesonderte Service-Account-, IAM-, Cloud-Run- oder Firestore-Write-Freigabe.

**Neuer geprüfter Runbook-Runner:** `workers/onboarding-notifications/staging-quarantine-db-provision.sh`. Default `--plan` ist read-only und ruft die bereits bewährte Provisioning-Metadatenprüfung erneut auf. `--create-once` ist technisch nur nach zusätzlichem Setzen der exakt benannten Approval-Umgebungsvariable freigeschaltet; er prüft erneut Firmenidentität, sauberen synchronisierten Branch, Billing/Firestore/Permissions und unmittelbar vor dem einzigen Erstellungsversuch nochmals das Datenbankinventar. Für die neue DB wird exakt **ein** `gcloud firestore databases create --project=lszh-automations --database=lszh-quarantine-staging --location=europe-west6 --edition=standard --type=firestore-native --delete-protection --quiet` ausgeführt. Danach erfolgt ein unabhängiges `describe` mit Identitäts-, Ort-, Typ-, Edition- und Löschschutzprüfung. Bei API-Fehlern, mehrdeutigem Ergebnis, fehlendem Löschschutz oder unerwarteter Ressource **STOP/UNVERIFIED; KEIN RETRY**. Keinerlei IAM-/Outbox-/Firestore-Datendokument-Mutation im Ablauf.

**Read-only Plan prüfen:**
```bash
cd ~/lszh-outbox-review &&
git pull --ff-only &&
bash workers/onboarding-notifications/staging-quarantine-db-provision.sh --plan
```

Der freigabepflichtige `--create-once`-Aufruf wird **erst nach separater ausdrücklicher Zustimmung** kommuniziert/ausgeführt. Auch eine erfolgreiche Datenbankanlage würde die bisherige Firestore-Schreibprobe noch **nicht** freigeben. CI bestätigt 279/279 rein synthetische Offline-Tests des gesamten Outbox-/Quarantäne-Branches (Stand 17.10.2026), einschliesslich der geschützten Einmal-Erstellung.

## Read-only Voraussetzungen und Kosten – vor Ressourcenerstellung

**Zusätzlicher vorbereiteter Cloud-Shell-Befehl:**
```bash
cd ~/lszh-outbox-review &&
git pull --ff-only &&
bash workers/onboarding-notifications/staging-quarantine-provisioning-readiness.sh --plan
```
Dieser Befehl hat **keine** Apply-/Create-/Execute-Funktion. Er prüft exakt die aktive LSZH-Firmenidentität und den synchronisierten, sauberen Review-Branch und liest nur Metadaten mittels:
`gcloud billing projects describe`, `gcloud services list --enabled`, `gcloud firestore databases list`, `gcloud iam list-testable-permissions`. Temporäre JSON-Metadaten werden in einem lokalen restriktiven Verzeichnis verarbeitet und nachher gelöscht; nur allowlistete PASS-/BLOCKED-Codes gehen an die Konsole.

**Fail-closed Vorbedingungen:** Das Projekt muss aktives Billing haben, `firestore.googleapis.com` muss aktiviert sein, die bisherige Offerten-Staging-Datenbank muss in `europe-west6` als Firestore Native existieren, die neue `lszh-quarantine-staging` muss **noch fehlen**, die Projektliste muss unter dem Limit von 100 Datenbanken liegen und alle drei vorgesehenen Rechte (`datastore.entities.get/create/update`) müssen für Custom Roles als `SUPPORTED` in GA bestätigt sein. Fehlender Lesezugriff führt zu `BLOCKED`, nicht zu einer vermuteten Bereitschaft. Die effektiven GCP-Bereitstellungsrechte des angemeldeten Benutzers oder geerbte IAM-Rechte sind damit **nicht** erwiesen.

**Finanzielle Warnung:** Google verlangt für benannte (nicht-default) Firestore-Datenbanken eine aktivierte Abrechnung. Die neue benannte Datenbank erhält **kein Free Tier**; die reine Erstellung wird nicht zusätzlich berechnet, aber Daten-/Index-Lese-, Schreib- und Speichervorgänge sind nach Verbrauch kostenpflichtig. Freigabe der entstehenden Ausgaben und ggf. Budgetalarm vor Bereitstellung klären. Auch eine bestandene Vorprüfung bedeutet **keine Kosten-/Ressourcen-/IAM-Freigabe**.

Offizielle Referenzen: [Firestore-Datenbanken verwalten](https://cloud.google.com/firestore/docs/manage-databases), [Firestore-Preise](https://cloud.google.com/firestore/pricing), [Custom Roles erstellen](https://docs.cloud.google.com/iam/docs/creating-custom-roles).

## IAM und Isolation: separates STAGING-Ziel im Review-Code gewählt, Cloud-Freigabe offen

Für die nur nach separater Freigabe ausführbare Quarantäne-Schreibprobe ist im Review-Code nun eine **eigene, derzeit nicht vorhandene** Named Database `lszh-quarantine-staging` (geplante Region `europe-west6`) und eine **neue getrennte Dienstidentität** vorgesehen:
`lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com` (nicht als existierend bestätigt). **Nicht** die bisherige Outbox-/Airtable-Identität und **nicht** `roles/datastore.user` wiederverwenden.

Vorgeschlagene projektdefinierte Rolle `projects/lszh-automations/roles/lszhQuarantineCasStaging` mit **exakt**:
- `datastore.entities.get` für GET/Readback,
- `datastore.entities.create` für `commit` mit `exists:false`,
- `datastore.entities.update` für `commit` mit `currentDocument.updateTime`.

Explizit **nicht**: `delete`, `list`, `export`, Admin-, Owner-/Editorrollen, Secret-Manager- oder Gmail-Rechte. Projekt-IAM nur mit der Datenbank-Bedingung
`resource.name=="projects/lszh-automations/databases/lszh-quarantine-staging"` und eindeutiger `title=LSZHQuarantineCASStaging`.

**Wesentliche Beschränkung:** Bei serverseitiger Firestore-REST-Authentifizierung schützen Firestore Security Rules die Collection **nicht**; IAM mit dieser Bedingung ist **datenbankweit**, nicht collection-spezifisch. Deshalb wurden CAS, Quarantäne-IAM-Plan, Offline-Tests und rein lesender Preflight auf die **eigene** `lszh-quarantine-staging` umgestellt. Der bestehende Outbox-Store sowie historische Cloud-Run-Ausführungen bleiben auf `lszh-offers-staging` **unverändert**. Vor realen Schreibtests muss die neue DB gesondert genehmigt und erstellt werden; der Quarantäne-Account darf keinen Schreibzugriff auf `lszh-offers-staging` erhalten.

## Sichere Abfolge

1. **Read-only-Bestandsaufnahme:** `bash workers/onboarding-notifications/staging-quarantine-iam-preflight.sh --plan` nach `git pull --ff-only` auf dem Review-Branch. Prüft Firmenkonto, Git-Branch und die **separate** Named Database `lszh-quarantine-staging` sowie eine neue Dienstidentität, Custom Role und bedingte Projekt-IAM-Bindung. Bei fehlenden Ressourcen meldet es `BLOCKED` und nimmt keine Änderung vor. Die separate Benutzerabfrage vom 17.10.2026 hat für die neue DB `NOT_FOUND` ergeben; Rollen-`describe` ebenfalls `NOT_FOUND`, die SA-Liste keinen Treffer. Geerbte Rechte, effektiver REST-Zugriff und Service-Account-Schlüssel sind noch separat zu prüfen.
2. **Sicherheitsziel:** Für die Quarantäne-Schreibprobe ist die **eigene** `lszh-quarantine-staging` als geplanter Zielwert im Code gewählt. Ihre tatsächliche Erstellung, Kosten/Quotas, Region und IAM-Bindung bleiben **separat genehmigungspflichtig**. Kein `Vamos` und kein lesender `NOT_FOUND`-Befund gilt als Freigabe für GCP-Mutationen.
3. **Separate Freigabe zur Provisionierung:** Erst nach expliziter Ressourcenfreigabe **zuerst** die neue Named Database `lszh-quarantine-staging` in `europe-west6` bereitstellen, dann neue dedizierte Service-Account-Identität ohne JSON-Schlüssel und die exakt geprüfte minimale Custom Role erstellen, **nur** auf diese Datenbank binden. Vor jeder Änderung Namen, erlaubte Rechte und IAM-Ressourcenumfang prüfen; keine Owner-/Editor- oder unbedingte Datastore-User-Bindung.
4. **Neues isoliertes Cloud-Run-Image/Job (erneut separat genehmigen):** Nur reviewed Quellen, auf Image-Digest gepinnt, Zurich-Region, einzelne Task, `maxRetries=0`, feste synthetische Fixture. Kein Customer-CRM/Airtable-Lesen für diesen Schreibtest; keine Scheduler-/Mail-Komponenten; kein Secret-Payload; Outbox deaktiviert. Bei bereits vorhandener Execution nicht starten.
5. **Separate Freigabe für genau eine reale synthetische Firestore-Probe:** Feste opake Draft-ID, nur eine neu erzeugte Test-Quarantäne-Collection. Initialer GET erwartet 404; konditionelles Create `exists:false` → exakter GET-Readback → Update mit zuletzt gelesenem `updateTime` → exakter GET-Readback. Negativtest mit veraltetem `updateTime` darf nichts überschreiben. Keine blind wiederholten Writes; bei unklarem Commit zuerst lesen. **Keine automatische Löschung**, denn die minimale Rolle hat kein `delete`. Test-Auditdaten bleiben zur manuellen, separat zu genehmigenden Aufräumung.
6. **Nachtest:** Execution-ID, Task-Status, ausschliesslich allowlistete PASS/STOP-Klassen und endgültiger Firestore-Auditstand ohne rohe Tokens/Daten prüfen; keine automatische E-Mail- oder Versandfreigabe behaupten.

## Sicherheitsgrenzen

- Kein produktiver Kunde, kein Vertragsabschluss, kein E-Mail-Versand, keine Make-Aktivierung.
- Kein Deployment, keine IAM-/Firestore-Schreibänderung ohne **ausdrückliche separate Freigabe**.
- Ergebnisse einer Offline-Mock-CAS-Simulation **sind keine Beweise** für die effektive Berechtigungsprüfung oder Transaktion im Cloudbetrieb.
- Ein positives Onboarding / korrekt gespeicherte Quarantäne **ist keine** Berechtigung zum Versand.
- Aus dem Chat heraus wird keine Cloud Shell ausgeführt. Auch der aktuelle Preflight-Lauf muss vom berechtigten Nutzer gestartet werden.

## Offizielle Grundlagen

- Firestore Native IAM und erforderliche Methodeberechtigungen: https://cloud.google.com/firestore/docs/security/iam
- Datenbankbezogene IAM-Bedingungen: https://firebase.google.com/docs/firestore/manage-databases
- Cloud Firestore serverseitige Clients umgehen Security Rules: https://firebase.google.com/docs/firestore/security/rules-query
