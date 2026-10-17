# LSZH Automations – Quarantäne-CAS: freigabepflichtiger STAGING-Testplan

Status: **Quarantäne-Named-Database am 17.10.2026 erfolgreich erstellt, Löschschutz bestätigt; Service-Account, Rolle, IAM-Bindung, Cloud-Run-Runtime und Dokument-Schreibtests noch NICHT eingerichtet/freigegeben.** Ältere nachfolgende Abschnitte dokumentieren den vorherigen Planungsstand.

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
