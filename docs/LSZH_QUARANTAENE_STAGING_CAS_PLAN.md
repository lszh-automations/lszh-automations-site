# LSZH Automations – Quarantäne-CAS: freigabepflichtiger STAGING-Testplan

Status: **Nur Entwurf / kein Deployment / kein IAM-Grant / kein Cloud-Lauf**. Stand: 17.10.2026.

## Zweck und bewiesener Stand

Der existierende Cloud-Run-Job `lszh-airtable-read-probe-fix-staging` wurde bereits **genau einmal** mit einem erfolgreichen synthetischen Airtable-GET ausgeführt; **nicht wiederholen**. Die Quarantäne-Kette besteht bisher aus `reviewDraft` (frischer Airtable-Lesestatus, niemals Versandfreigabe), `planQuarantine` (monotone Revision und Audit, keine Wirkung) und `firestore-quarantine-cas.js` (ein einzelner bedingter Firestore-REST-`commit`-Anfrageentwurf, Identitätsprüfung beim Readback). Das ist **kein ausgerollter persistierender Dienst**.

## IAM und Isolation: Entscheidung offen

Provisorisch vorgesehen sind die existierende Named Database `lszh-offers-staging` (`europe-west6`) und eine **neue getrennte Dienstidentität**
`lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com` (nicht als existierend bestätigt). **Nicht** die bisherige Outbox-/Airtable-Identität und **nicht** `roles/datastore.user` wiederverwenden.

Vorgeschlagene projektdefinierte Rolle `projects/lszh-automations/roles/lszhQuarantineCasStaging` mit **exakt**:
- `datastore.entities.get` für GET/Readback,
- `datastore.entities.create` für `commit` mit `exists:false`,
- `datastore.entities.update` für `commit` mit `currentDocument.updateTime`.

Explizit **nicht**: `delete`, `list`, `export`, Admin-, Owner-/Editorrollen, Secret-Manager- oder Gmail-Rechte. Projekt-IAM nur mit der Datenbank-Bedingung
`resource.name=="projects/lszh-automations/databases/lszh-offers-staging"` und eindeutiger `title=LSZHQuarantineCASStaging`.

**Wesentliche Beschränkung:** Bei serverseitiger Firestore-REST-Authentifizierung schützen Firestore Security Rules die Collection **nicht**; das effektive IAM-Binding gilt trotz obiger Restriktion **datenbankweit**. Eine Beschränkung nur auf `lszh_onboarding_quarantine_cases_staging` ist durch diese IAM-Bedingung **nicht** bewiesen. Vor echtem Schreiben muss entschieden werden, ob eine separate Named Database zur vollständigen Isolation gegenüber Offerten/anderen Staging-Dokumenten benötigt wird. Wird eine separate DB gewählt, müssen sämtliche fest verdrahteten Datenbanknamen in CAS/IAM-Plan/Tests vor Freigabe gemeinsam aktualisiert und nochmals geprüft werden. Neue Datenbank und IAM-Bindungen **niemals** automatisch erstellen.

## Sichere Abfolge

1. **Read-only-Bestandsaufnahme:** `bash workers/onboarding-notifications/staging-quarantine-iam-preflight.sh --plan` nach `git pull --ff-only` auf dem Review-Branch. Prüft Cloud-Identität und Git-Zustand, Named Database, neue Dienstidentität, neue Custom Role und die einzelne exakte bedingte IAM-Bindung. Bei fehlenden Ressourcen meldet es `BLOCKED` und nimmt keine Änderung vor. Es prüft **weder** geerbte IAM-Rechte noch tatsächlichen REST-Zugriff oder nutzerverwaltete Service-Account-Schlüssel – diese sind separate Prüfpunkte.
2. **Sicherheitsentscheidung:** Geteilte Staging-Datenbank (bei bekanntem Datenbank-weitem Risiko) oder vorzugsweise eigene Quarantäne-Staging-Datenbank; die IAM-Zielkonfiguration entsprechend festlegen. Kein weiterer Schritt durch blosses `Vamos` als Freigabe für IAM-/GCP-Mutationen.
3. **Separate Freigabe zur Provisionierung:** Erst dann neue dedizierte Service-Account-Identität ohne JSON-Schlüssel und die exakt geprüfte minimale Custom Role erstellen, nur bedingt auf gewählte Datenbank binden. Vor jeder Änderung vollständige betroffene Ressource und Rollenzuweisung prüfen; **keine** Owner-/Editor- oder unbedingte Datastore-User-Bindung.
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
