# LSZH Automations – Projektstand & Betriebsentscheidungen

## 17.10.2026 – Failed Airtable-Cloud-Run-Job: Permission verweigert, sichere Dateibereichsklassifizierung nachgerüstet

Der Geschäftsführer hat nach synchronisiertem Git-Pull die read-only Diagnosis `staging-airtable-execution-diagnose.sh` erneut ausgeführt. **Reale, zuletzt bestätigte Befunde für die EXAKT EINE fehlgeschlagene Execution `lszh-airtable-read-probe-staging-xglcz`:**
```text
PASS: Exactly one recorded Job execution; expected failed execution ID confirmed.
PASS: Exact execution metadata read; no new task started.
Execution reported failed tasks: 1
Execution reported successful tasks: not reported
PASS: Cloud Logging query restricted to the exact STAGING job and Zurich region.
Job log entries returned: 14
Entries matching execution label: 12
Job entries without execution label (only one execution exists): 2
Other/unusable entries ignored: 0
Matching or safely attributable entries: 14
Safe application STOP code(s): none observed
Recognized runtime error category: FILE_PERMISSION_DENIED
Log source types: CONTAINER_STDERR, PLATFORM_OR_SYSTEM
Permission evidence classification: CONTAINER_FILESYSTEM_DENIED, GENERIC_PERMISSION_DENIED_ONLY
Application PASS log count: 0
No raw log text or Secret Manager payload printed.
READ ONLY: No Job execution, Secret read, IAM edit, deployment, Airtable request or customer data action.
```

**Was dieser Befund aussagt:** Eine Dateisystem-Operation bzw. ein generischer Ressourcenzugriff wurde verweigert. Aktuell weder eine sicher identifizierte betroffene Datei noch ein Secret-Manager-API-403 nachgewiesen. Keine Airtable-GET-PASS-Logs. Aus `USER node` und Secret-Volume-Ownership `root` allein ist die Ursache **nicht** bewiesen (Google Secret-Volume-Modus gewöhnlich 0444). **Keine IAM-Erweiterung, keinen Betrieb als Root und kein nochmaliger Start ohne Diagnose und separate Freigabe.**

**Neue weiter eingegrenzte, weiter read-only Diagnose** in `workers/onboarding-notifications/staging-airtable-execution-diagnose.sh` auf dem bestehenden GitHub-Review-Branch: Alle 14 Logeinträge werden lokal durch den schon bestehenden sanitizing Python-Code analysiert. Neu werden anhand der **gleichen Error-Logzeile** (keine spekulative Aggregation verschiedener Einträge) ausschliesslich Enum-Namen für `Denied error source` (`CONTAINER_STDERR` / `PLATFORM_OR_OTHER`), `Denied error identifiers` (`EACCES`, `EPERM` oder generisch), `Denied filesystem operation` (`OPEN`, `STAT`, `SCANDIR`, `ACCESS`, `READLINK`, `MKDIR`, `CHDIR`, `EXEC` oder unbestimmt) und `Denied path family (same log entry only)` ausgegeben: erwartete Secret-Datei / erwartetes Secret-Mountverzeichnis / Anwendung unter `/app` / Node-Home / temporäre Dateien / Systemdateien / sonstiger geschwärzter Pfad / kein Pfad erkennbar. Logtexte, Dateipfade und Secretwerte **werden nicht ausgegeben**. Weiterhin strikt der einzelne fehlgeschlagene Job, eine Execution und alle Cloud-Operationen nur lesend; **niemals** `gcloud run jobs execute` oder `gcloud secrets versions access`. Synthetischer CI-Lauf `39022908060` **183/183 JavaScript-Tests, 8/8 Python-IAM-Tests erfolgreich**. Die neue genaue Kategorisierung wurde vom Geschäftsführer **noch nicht live ausgeführt**.

**Einziger nächste Schritt, wiederum NUR METADATEN/LOGS lesen:**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-execution-diagnose.sh
```
Beurteilung anhand `Denied error identifiers:`, `Denied filesystem operation:` und `Denied path family (same log entry only):`; **nur** bei ausreichend eindeutiger Evidenz eine minimal nötige Codekorrektur bzw. einen getrennten neuen Staging-Job/Execution-Review planen. Keine unüberlegten Produktivaktionen.

## 17.10.2026 – Container-Zugriffsfehler bestätigt: FILE_PERMISSION_DENIED; Root Cause weiterhin ungeklärt

Der Geschäftsführer hat nach Git-Sync die **korrigierte, strikt lesende** `staging-airtable-execution-diagnose.sh` gegen die bereits einmal ausgeführte, fehlgeschlagene Cloud-Run-Execution `lszh-airtable-read-probe-staging-xglcz` ausgeführt. Die echte Cloud-Shell-Rückmeldung:
```text
PASS: Exactly one recorded Job execution; expected failed execution ID confirmed.
PASS: Exact execution metadata read; no new task started.
Execution reported failed tasks: 1
Execution reported successful tasks: not reported
PASS: Cloud Logging query restricted to the exact STAGING job and Zurich region.
Job log entries returned: 14
Entries matching execution label: 12
Job entries without execution label (only one execution exists): 2
Other/unusable entries ignored: 0
Matching or safely attributable entries: 14
Safe application STOP code(s): none observed
Recognized runtime error category: FILE_PERMISSION_DENIED
Application PASS log count: 0
No raw log text or Secret Manager payload printed.
READ ONLY: No Job execution, Secret read, IAM edit, deployment, Airtable request or customer data action.
```

**Auswertung:** Die Log-Abfrage funktioniert jetzt und hat **14 Einträge** für die eine Job-Execution gefunden; eine davon oder mehrere enthalten ein Permission-denied-Signal, in der Sicherheitsroutine nur als `FILE_PERMISSION_DENIED` ausgewiesen. **Einzelursache offen**: Der Fehler kann aus lokalem Datei-/Volume-Zugriff, verweigertem Secret-Manager-API-Zugriff oder einer anderen Container-/Plattform-Operation stammen. Kein fachlicher Airtable-PASS und keine Anwendung-STOP-Zeile ist sichtbar, also **kein erfolgreicher Cloud Run → Airtable-GET nachgewiesen**. Kein Cloud-Run-Rerun, keine neue Secret-Version, keine IAM-/Job-Mutation.

**Relevante technische Hypothese:** Unser gepinntes isoliertes Image `Dockerfile.airtable-read-probe` enthält `USER node` (nicht-root), während Cloud-Run-Jobs die zweite Ausführungsumgebung verwenden, in der laut Google Secret-Volume-Dateien/Verzeichnisse von `root` besessen werden. Google dokumentiert aber zugleich standardmässig **Dateimodus `0444`** für Secret-Volumes (von allen Benutzern lesbar); **Eigentümerschaft allein ist daher KEIN Beweis für die Ursache.** Unbedingt zunächst Permission-denied-Logtyp anhand sanitär gefilterter Indizien identifizieren; nicht voreilig Root aktivieren oder IAM projektweit erweitern. Quellen: https://docs.cloud.google.com/run/docs/configuring/jobs/secrets und https://docs.cloud.google.com/run/docs/reference/rest/v2/Volume .

**In GitHub Review-Branch ergänzte, strikt lesende Diagnose:** `staging-airtable-execution-diagnose.sh` liest dieselben 14 Raw-Log-Datensätze ausschliesslich **lokal zur Klassifizierung**, veröffentlicht nur **fest vorgegebene Kategorien**: `NODE_SECRET_MOUNT_FILE_DENIED` (lokales EACCES/EPERM + nur erwartete Secret-Datei im Rohtext), `CONTAINER_FILESYSTEM_DENIED`, `SECRET_MANAGER_API_ACCESS_DENIED`, `SECRET_ACCESS_OR_MOUNT_DENIED_UNSPECIFIED` oder `GENERIC_PERMISSION_DENIED_ONLY`; ausserdem `CONTAINER_STDERR`, `CONTAINER_STDOUT`, `PLATFORM_OR_SYSTEM` als Log-Typen ohne Payload. Quelle/Pfade/Anfrageinhalte/Tokens werden **nie** ausgegeben. Ein Test mit fingiertem Token verweigert dessen Veröffentlichung. **Kein Mutationsbefehl hinzugefügt.** GitHub-CI nach Erweiterung **180/180 Node-Tests und 8/8 Python-IAM-Tests** erfolgreich.

**Einziger nächster Schritt, NUR LESEN (identischer Befehl, neue Diagnoselogik via Git-Pull):**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-execution-diagnose.sh
```
Anhand der neuen `Permission evidence classification:`-Zeile entscheiden, ob lokale Dateirechte, Secret-API-IAM oder ein anderer Laufzeitbereich weiter untersucht werden soll. **Keine Ausführung/Job-Update/Neuanlage, kein Token-/Rollenwechsel** bis zur gesonderten Fehlerbehebung und ausdrücklichen Freigabe. Die bestehende HTTP-Outbox bleibt deaktiviert.

## 17.10.2026 – Failed Cloud Run Airtable-Job: erste Log-Abfrage ohne Treffer; Filter-Fehler behoben, sichere erneute Lesung offen

Der Geschäftsführer führte in Cloud Shell die ausschliesslich lesende `workers/onboarding-notifications/staging-airtable-execution-diagnose.sh` nach `git pull --ff-only` aus. Die tatsächlich gelieferte Antwort:
```text
PASS: Exactly one recorded Job execution; expected failed execution ID confirmed.
PASS: Cloud Logging query restricted to the one failed execution.
Matching log entries: 0
Safe application STOP code(s): none observed
Recognized runtime error category: none identified
Application PASS log count: 0
STOP: No exact-execution logs found; check Cloud console filters. Never rerun.
No raw log text or Secret Manager payload printed.
READ ONLY: No Job execution, Secret read, IAM edit, deployment, Airtable request or customer data action.
```
**Sicher bestätigt:** Genau die eine Cloud-Run-Job-Ausführung `lszh-airtable-read-probe-staging-xglcz` wurde von der reinen Lese-Diagnose inventarisiert; nach ihrem vorherigen Start war sie mit Task-Exit 1 fehlgeschlagen. **Keine Fehlerursache ist aus dem 0-Logs-Ergebnis nachgewiesen; insbesondere weder Airtable-Token noch IAM oder Netzfehler als Ursache annehmen.** Die spezifische Logging-Abfrage war **zu streng bzw. mit falschem Labelnamen**: Für Cloud Run Job `stdout` und `stderr` dokumentiert Google die LogEntry-Label-Eigenschaft `run.googleapis.com/execution_name`; die vorherige Abfrage verlangte `labels.execution_name`. Referenz: https://docs.cloud.google.com/logging/docs/api/platform-logs .

**Im GitHub Review-Branch korrigiert** wurde `staging-airtable-execution-diagnose.sh` auf einen Cloud-Logging-Filter nach exakt `resource.type=cloud_run_job`, `resource.labels.job_name=lszh-airtable-read-probe-staging` und `resource.labels.location=europe-west6`. Nach erfolgreichem Beleg, dass **genau eine Execution für diesen Job existiert**, verarbeitet das Skript alle Roh-Logs nur lokal und lässt Python eine konkrete Ausführungskennung mit `labels["run.googleapis.com/execution_name"]` (Fallback `labels.execution_name`) prüfen; abweichende Label-Werte werden ignoriert. Unlabelled Einträge werden separat gezählt, aber nur aufgrund des nachgewiesenen einzigen Job-Runs als möglicher Diagnosekontext verwendet. Ausgegeben werden **ausschliesslich erlaubte Fehlercodes, allgemeine Fehlerkategorien und Summenzahlen**, kein vollständiger Logtext, keine Dateipfade, kein Token. Zusätzlich wurde behoben, dass der alte Python-Metadatenpfad durch eine falsche `except`-Einrückung keine Count-Ausgabe erzeugt hatte; nun berichtet er tatsächlich (falls in der Google-Antwort vorhanden) `failedCount` und `succeededCount`.

**Vorerst weiterhin offen:** neue reale Logabfrage mit korrigiertem Filter, konkrete Ursache des Container-Exit 1, tatsächlicher Cloud Run → Airtable-GET-Erfolg. **Nicht erneut ausführen**: `staging-airtable-job-run.sh --execute-once`, `gcloud run jobs execute`, `staging-airtable-job.sh --create-only`, jegliche neue PAT-Version oder IAM-Rolle ohne getrennte Analyse/Freigabe. Bestehender HTTP-Outbox-Dienst und alle produktiven Vorgänge unverändert/deaktiviert.

**Einziger nächster Befehl, strikt read-only:**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-execution-diagnose.sh
```
Bei erneut null Logs ist die Ausführungsansicht **Logs** in Google Cloud Console separat zu prüfen, ohne Rohlogs unbesehen zu veröffentlichen. Offline-CI deckt jetzt die offiziellen Labels und die Unterdrückung fremder Logeinträge und fingierter PAT-Zeichenketten ab. Noch keine echte Reparatur oder neue Probe-Execution ausgelöst.

## 17.10.2026 – Failed-Execution-Diagnose (STRICT READ ONLY) bereit, LIVE-Lesung ausstehend

Nach dem gescheiterten ersten und einzigen `lszh-airtable-read-probe-staging-xglcz`-Test (Task 0 Exit 1) wurde im GitHub Review-Branch `workers/onboarding-notifications/staging-airtable-execution-diagnose.sh` hinzugefügt. Der Befehl **startet keine weitere Execution** und liest **keinen** Secret Manager Payload aus:
1. Prüft korrektes aktives LSZH-Geschäftskonto/Projekt und sauberen, synchronisierten Feature-Branch.
2. Ruft `gcloud run jobs executions list --job=lszh-airtable-read-probe-staging --project=lszh-automations --region=europe-west6 --format=json` auf und verlangt genau die eine erwartete Execution `lszh-airtable-read-probe-staging-xglcz`.
3. Liest die **Metadaten der exakt identifizierten Execution** via `gcloud run jobs executions describe ... --format=json` (nur kontrollierte Zählwerte).
4. Fragt Google Cloud Logging **nur für diesen Job und diese Execution** ab, `gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="lszh-airtable-read-probe-staging" AND labels.execution_name="lszh-airtable-read-probe-staging-xglcz"' --project=lszh-automations --limit=100 --format=json`. Der vollständige Roh-Logtext wird nur in lokalen Pipelinevariablen verarbeitet und **NICHT in den Chat oder das Terminal ausgegeben**; ein Python-Filter zeigt lediglich eine vordefinierte Menge sicherer Anwendungs-`STOP`-Codes, allgemeine Laufzeitfehler-Kategorien (z. B. `NODE_MODULE_NOT_FOUND`, `FILE_PERMISSION_DENIED`, `NODE_SYNTAX_ERROR`), Loganzahl und Anzahl Anwendung-`PASS`-Zeilen. Unerwartete Inhalte / etwaige Bearer-Tokens werden nicht übernommen. Bei fehlenden Logs wird der Status nicht als erfolgreich interpretiert.

**Offline CI:** 7 neue rein synthetische Tests stellen fehlgeschlagene Ausführung, exakte Identität, bekannte STOP-Codes, Unterschlagung fingierter PAT-Texte, Leerergebnisse, Account-/Git-Stop und Verbotsprüfung für sämtliche Mutationsbefehle nach. Erfolgreicher GitHub-Actions-Lauf `39021771890`: **176/176 Node-Tests und 8/8 Python-IAM-Tests**, kein Live-Cloud-Aufruf von CI.

**Nächster Benutzerbefehl ist AUSSCHLIESSLICH DIAGNOSE:**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-execution-diagnose.sh
```
Wenn das Skript eine Kategorie statt einer konkreten Ursache ausgibt, anhand des konkreten Status / privaten Cloud-Run-Logs weiter analysieren. Kein automatisches Neustarten und keine IAM-/Secret-/Deployment-Mutation. `--execute-once` ist endgültig verbraucht und darf auf dieser Jobversion nicht wiederholt werden. Offizielle Logs-Feldreferenz: https://docs.cloud.google.com/run/docs/logging .

## KRITISCH 17.10.2026 – Erster und einziger Cloud Run → Airtable-Lesejob gestartet, EXECUTION FAILED. NICHT wiederholen

Der Geschäftsführer führte ausdrücklich nach `git pull --ff-only` den abgesicherten Befehl `bash workers/onboarding-notifications/staging-airtable-job-run.sh --execute-once` aus. **Echte Cloud Shell-Ausgabe:**
```text
PASS: Existing Job has immutable image, dedicated identity, safe env and file-mounted Secret v1.
PASS: One task, parallelism one, retries zero, no overridden commands or args.
PASS: Zero Cloud Run executions registered for this exact Job.
PASS: Original successful Cloud Build and matching immutable registry digest.
PASS: Company identity, Zurich-only secret v1 and secret-level SecretAccessor IAM.
PASS: Cloud Run one-shot job configuration independently verified.
PASS: Zero Cloud Run executions registered for this exact Job.
EXECUTE ONCE: Starting the isolated read-only STAGING Cloud Run Job.
X Creating execution... Task lszh-airtable-read-probe-staging-xglcz-task0 failed with exit code: 1 and message: The container exited with an error.
OK Provisioning resources... Provisioned imported containers.
OK Starting execution... Started deployed execution in 3.93s.
X Running execution... 0 / 1 complete
Executing job failed
ERROR: (gcloud.run.jobs.execute) The execution failed.
STOP: Execution failed or result ambiguous. DO NOT RERUN. Inspect execution metadata/logs read-only.
```

**Wesentlicher Statuswechsel:** Job `lszh-airtable-read-probe-staging` ist nicht länger unausgeführt: Die **einzige reale Execution** `lszh-airtable-read-probe-staging-xglcz` existiert und ist **fehlgeschlagen**, Task `task0` **exit code 1**. Grund noch **unbekannt**; aus dieser Meldung kann weder ein Airtable-Authentifizierungsfehler noch ein fehlerhafter Secret-Dateimount, Laufzeitfehler oder fehlender API-Zugriff sicher abgeleitet werden. Die User-Ausgabe enthält **keine** Fach-PASS-Logs der eigentlichen Airtable-GET-Probe. **Es ist KEIN erfolgreicher Cloud Run → Airtable-GET nachgewiesen.** Die Ausführungsfunktion verfügt über `maxRetries=0`; der konkrete Task wurde nicht als erfolgreich gemeldet. **Nicht nochmals `--execute-once` ausführen und keine neue Jobversion/Deployment erstellen**, bis der Fehler read-only diagnostiziert, behoben und ein separater bewusst freigegebener neuer Prüfweg dokumentiert ist. Keine neue Secret-Version, keine zusätzlichen IAM-Rechte oder produktiven Änderungen vorsehen.

Nächste Diagnose ausschliesslich LESEND, eng an diese konkrete Ausführung in Region `europe-west6` und Projekt `lszh-automations` gebunden: `gcloud run jobs executions describe lszh-airtable-read-probe-staging-xglcz --project=lszh-automations --region=europe-west6 --format=json` und genau passende Cloud-Logging-Einträge für `resource.type=cloud_run_job`, `resource.labels.job_name=lszh-airtable-read-probe-staging`, `labels.execution_name=lszh-airtable-read-probe-staging-xglcz`. **Nicht unbesehen Log-Rohdaten veröffentlichen:** Text darf nach Möglichkeit nur sicher aggregierte bekannte STOP-Codes und nicht-sensitive Fehlertypen zeigen; Secret PAT niemals im Chat. Erst nach Diagnose fachlichen Status bewerten. Der bestehende produktive/private HTTP-Outbox-Dienst bleibt `LSZH_OUTBOX_STAGE_ENABLED=false`; keine Kundenbenachrichtigungen.

Offizielle Referenzen: https://docs.cloud.google.com/run/docs/managing/job-executions und https://docs.cloud.google.com/run/docs/logging .

## BESTÄTIGT 17.10.2026 – Airtable-Cloud-Run-EINMAL-Test-Preflight LIVE PASS; Ausführung noch ausstehend

Der Geschäftsführer führte in Google Cloud Shell nach `git pull --ff-only` den rein lesenden `bash workers/onboarding-notifications/staging-airtable-job-run.sh` aus. Die tatsächlichen Live-Ergebnisse:
```text
PASS: Existing Job has immutable image, dedicated identity, safe env and file-mounted Secret v1.
PASS: One task, parallelism one, retries zero, no overridden commands or args.
PASS: Zero Cloud Run executions registered for this exact Job.
PASS: Original successful Cloud Build and matching immutable registry digest.
PASS: Company identity, Zurich-only secret v1 and secret-level SecretAccessor IAM.
PASS: Cloud Run one-shot job configuration independently verified.
PLAN ONLY: No live Airtable GET, Job execution, secret payload read or other writes.
```

**Bestätigter Ist-Zustand:** Die existierende STAGING-Jobressource `lszh-airtable-read-probe-staging` ist exakt an `europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-airtable-read-probe@sha256:ce88fa70db14f5d297095da3e8faa26b72e69cdc837ca133212ebc10a09fe8ab` gebunden. Dediziertes aktives Dienstkonto `lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com`, Secret `lszh-airtable-readonly-staging` mit nur einer Zürich-Replik `europe-west6`, Version 1 `ENABLED`, sekret-spezifische IAM-Rolle `roles/secretmanager.secretAccessor` und read-only Datei-Mount `/var/secrets/lszh/airtable-read-pat` bestätigt. Cloud-Run-Job-Container hat exakt die drei freigegebenen STAGING-Umgebungsflags, `tasks=1`, `parallelism=1`, `maxRetries=0`, keine command/args-Overrides. Cloud-Run-Ausführungsliste über `--format=json` tatsächlich **leer**. **Eine echte Cloud Run → Airtable HTTPS-GET-Verbindung ist NOCH NICHT getestet.**

**Nächste explizite und irreversible Benutzeraktion (einmalig):**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-job-run.sh --execute-once
```
Vor dem Start führt das Skript sämtliche Metadatenprüfungen erneut und die Ausführungslistenprüfung **zweimal** aus. Nur bei weiterhin 0 Ausführungen startet es **maximal ein** `gcloud run jobs execute lszh-airtable-read-probe-staging --project=lszh-automations --region=europe-west6 --wait` ohne Overrides. Der Job soll genau eine **GET**-Abfrage nach frisch zufälligem, nicht vorhandenem synthetischen Projektcode an Airtable ausführen; niemals Kundendaten ändern, keine Firestore-, Make- oder E-Mail-Operation. **Egal ob PASS, STOP oder ambivalente CLI-Ausgabe: --execute-once NICHT wiederholen**, zuerst die exakten Cloud-Run-Execution- und Probelogs unabhängig und nur lesend prüfen. Ein `gcloud ... --wait`-SUCCESS allein beweist noch nicht den fachlichen Airtable-GET-Probe-Erfolg; dafür werden die drei beabsichtigten PASS-Logmeldungen benötigt.

Der HTTP-Outbox-Dienst bleibt deaktiviert `LSZH_OUTBOX_STAGE_ENABLED=false`. Keine produktiven E-Mails, Vertragsannahmen, Make-Szenarien oder Kundendatenänderungen freigeben.

## BESTÄTIGT 17.10.2026 – Separater Airtable-STAGING-Cloud-Run-Job erstellt, null Ausführungen; Einmal-Test nur als Plan vorbereitet

Der Geschäftsführer führte nach `git pull --ff-only` den bewusst freigegebenen `bash workers/onboarding-notifications/staging-airtable-job.sh --create-only` in Google Cloud Shell aus. Die tatsächlichen Live-Meldungen:
```text
PASS: Pinned Cloud Build ID reports SUCCESS for exactly the expected image tag.
PASS: Cloud Build result digest matches Artifact Registry.
PASS: Reviewed five-file source pin unchanged; tagged Artifact Registry image exists.
PASS: Immutable digest: sha256:ce88fa70db14f5d297095da3e8faa26b72e69cdc837ca133212ebc10a09fe8ab
PASS: Company identity, original five-file Cloud Build and exact SHA-256 image.
PASS: Dedicated service identity, single Zurich secret version 1 and secret-specific IAM.
CREATE ONLY: Creating one new staging Cloud Run Job; NEVER executing.
Creating Cloud Run job [lszh-airtable-read-probe-staging] in project [lszh-automations] region [europe-west6]
Job [lszh-airtable-read-probe-staging] has successfully been created.
PASS: Created Job spec pinned to exact digest, service identity, env gate and Secret v1 file.
PASS: New STAGING Cloud Run Job created and verified, with ZERO executions.
STOP HERE: Running job and live Airtable GET require a separate explicit step.
```

**Als LIVE verifiziert:** Ausschliesslich der vorher nicht existierende separate Cloud Run Job `lszh-airtable-read-probe-staging` in `europe-west6` ist nun **tatsächlich erstellt** und seine Metadaten nach der Anlage wurden rückgeprüft: exakter `@sha256:ce88fa70db14f5d297095da3e8faa26b72e69cdc837ca133212ebc10a09fe8ab`-Container, dediziertes Service Account `lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com`, Secret `lszh-airtable-readonly-staging` Version `1` als Datei-Mount `/var/secrets/lszh/airtable-read-pat`, isolierte drei Staging-Env-Flags, genau **eine Aufgabe**, **maxRetries=0**, damals **0 Job-Executions**. **`staging-airtable-job.sh --create-only` niemals wiederholen.** Keine Airtable-GET-Anfrage bisher, kein PAT-Klartext ausgelesen, keine Firestore- oder Mailaktion. Bestehender `lszh-onboarding-outbox-staging`-HTTP-Dienst bleibt `LSZH_OUTBOX_STAGE_ENABLED=false`, keine produktiven Änderungen.

**Neu in GitHub Draft-PR #8 – streng getrennter EINMAL-Test vorbereitet:** `workers/onboarding-notifications/staging-airtable-job-run.sh` mit Default `--plan` (keine Cloud-Mutation) und separatem `--execute-once` (maximal ein `gcloud run jobs execute <NAME> --region=europe-west6 --wait`, ohne Overrides). Der Preflight fordert:
- korrektes aktives LSZH-Geschäftskonto/Projekt, saubere synchronisierte Feature-Branch und unveränderte fünf am Original-Source-Commit gepinnte Container-Dateien;
- Live-Cloud-Build-ID `1b909760-deb7-49a9-bfe8-b4e20af68133` `SUCCESS`, exakter ursprünglicher Image-Tag und mit Artifact Registry abgeglichener **unveränderlicher** SHA-256-Digest;
- dediziertes aktives Dienstkonto, korrektes globales Secret mit exakt einer **user-managed Zurich-Replica**, genau eine `ENABLED`-Version `1` und genau passende eigene `roles/secretmanager.secretAccessor`-Binding auf diesem einen Secret;
- exakte **bereits existierende** Cloud-Run-Job-Spezifikation (v1/v2), eine Aufgabe, `parallelism=1`, `maxRetries=0`, unveränderlicher Image-Digest, keinerlei `command`-/`args`-Overrides, exakt drei vorgegebene Env-Flags, genau einen Secret-v1-Datei-Mount;
- via `gcloud run jobs executions list --job=... --format=json` **leere Ausführungsliste** `[]`, bei malformed/nonempty STOP. Der Einmal-Modus prüft die Liste **zweimal**, bevor er einen einzigen Jobstart auslöst; bei fehlgeschlagenem/unklarem Jobstart **nicht wiederholen**.

Der geplante einmalige Cloud-Run-Job würde exakt **eine** HTTPS-GET-Anfrage an Airtable mit einem frisch randomisierten synthetischen, nicht vorhandenen Projektcode ausführen, `processing` erwarten, nur fest definierte PASS-/STOP-Zeilen loggen und **keine** Kundendaten mutieren, Firestore aufrufen, Make triggern, Vertrag annehmen oder E-Mail versenden. Der Token-Wert wird nur im Job über den Secret-Datei-Mount gelesen, **nicht** im Shell-/GitHub-/Chat-/Cloud-Run-Env-Text. Die Google-Cloud-CLI `jobs execute --wait` und `jobs executions list --job` entsprechen https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/execute und https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/executions/list .

**Offline-CI**, kein Live-Jobstart: `staging-airtable-job-run.test.mjs` prüft Plan-only, einmalige Ausführung, v2-Metadaten, eine bestehende Execution, falsche Role/Secret/Quelle/Digest/Job-Spezifikation, fehlgeschlagene Ausführung ohne Retry und ungültige Flags. Erfolgreicher CI-Lauf `39021151705` mit **169/169 Node-Tests und 8/8 IAM-Tests**. GitHub-CI führt die eigentliche Execution niemals aus.

**Nächster Schritt – ausschliesslich lesender Cloud-Shell-Plan:**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-job-run.sh
```
Erwartet `PASS: Existing Job has immutable image, dedicated identity, safe env and file-mounted Secret v1.`, `PASS: Zero Cloud Run executions registered for this exact Job.` und `PLAN ONLY: No live Airtable GET, Job execution, secret payload read or other writes.`. Bei STOP keine Ausführung oder Änderung, Log einordnen. Erst nach unabhängigem tatsächlichen Live-Plan-PASS darf der Geschäftsführer **separat** `--execute-once` starten; ein erfolgreicher `gcloud --wait`-Exit beweist allein noch nicht die drei erwarteten Probe-PASS-Logs, Logs sind danach separat schreibgeschützt zu kontrollieren.

## BESTÄTIGT 17.10.2026 – Isolierter Cloud-Run-Airtable-JOB-Preflight LIVE PASS; Job-Erstellung ausstehend

Der Geschäftsführer hat den neuen `workers/onboarding-notifications/staging-airtable-job.sh` **ohne Argumente** nach einem sauberen `git pull --ff-only` in Cloud Shell ausgeführt; Live-Ausgabe:
```text
PASS: Pinned Cloud Build ID reports SUCCESS for exactly the expected image tag.
PASS: Cloud Build result digest matches Artifact Registry.
PASS: Reviewed five-file source pin unchanged; tagged Artifact Registry image exists.
PASS: Immutable digest: sha256:ce88fa70db14f5d297095da3e8faa26b72e69cdc837ca133212ebc10a09fe8ab
PASS: Cloud Run job lszh-airtable-read-probe-staging not yet created.
PASS: Company identity, original five-file Cloud Build and exact SHA-256 image.
PASS: Dedicated service identity, single Zurich secret version 1 and secret-specific IAM.
New separate Cloud Run Job: lszh-airtable-read-probe-staging
Immutable image: europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-airtable-read-probe@sha256:ce88fa70db14f5d297095da3e8faa26b72e69cdc837ca133212ebc10a09fe8ab
Secret version 1 mounted only as read-only file /var/secrets/lszh/airtable-read-pat.
Exactly one task, max retries zero, default-disabled outbox.
PLAN ONLY: No Cloud Run Job created/executed and no secret payload read.
```

**Stand:** Der Testjob `lszh-airtable-read-probe-staging` wurde nachweislich **noch nicht erstellt**, das Image ist eindeutig auf den geprüften Build-Digest gepinnt; die dedizierte SA und der genau auf `lszh-airtable-readonly-staging` beschränkte IAM-Grant sind bestätigt, Secret-Version 1 ist `ENABLED` und wird erst nach Job-Ausführung als Datei an den isolierten Worker gemountet. **Kein PAT-Payload-Read und keine tatsächliche Cloud-Run→Airtable-Verbindung.**

**Nächster separater Nutzerbefehl:**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-job.sh --create-only
```
Dies ist eine **echte Cloud-Run-Job-Erstellung** (mögliche Kosten), führt aber **keinen** Job aus. Das streng begrenzte Skript fordert sauberen Quellbranch/GCP-Account, erfolgreichen Original-Build, passenden Digest, aktives Dienstkonto, secret-spezifischen IAM-Grant, Secret-v1-Verfügbarkeit und Nichtexistenz des Jobs; erstellt danach genau einen Job mit **`--tasks=1 --parallelism=1 --max-retries=0 --task-timeout=90s`**, exakt drei statischen Env-Flags und dem ausschliesslich dateibasierten Secret-v1-Mount. Unmittelbare Metadaten-Rückprüfung von Job-Konfiguration, Dienstkonto, Image, Secret-Mount und **null Ausführungen**. Wenn die Rückprüfung wegen Cloud-Run-API-Format oder sonstiger Abweichungen STOP meldet, **nicht erneut `--create-only` ausführen**: Job kann bereits existieren und muss erst read-only geprüft werden.

**Nicht freigeschaltet:** `gcloud run jobs execute`, Cloud-Run-Ausführungslog-Review, Airtable-GET, Make, Gmail, Firestore, Verträge, produktiver Outbox-Service. Bestehender Dienst `lszh-onboarding-outbox-staging` bleibt deaktiviert; der Testjob ist vollständig separat.

## BESTÄTIGT 17.10.2026 – Cloud Build Image-Digest LIVE verifiziert; separater Cloud-Run-Job nur geplant

Der Geschäftsführer führte `staging-airtable-image-verify.sh` nach erfolgreichem `git pull --ff-only` tatsächlich in Google Cloud Shell aus:
```text
PASS: Pinned Cloud Build ID reports SUCCESS for exactly the expected image tag.
PASS: Cloud Build result digest matches Artifact Registry.
PASS: Reviewed five-file source pin unchanged; tagged Artifact Registry image exists.
PASS: Immutable digest: sha256:ce88fa70db14f5d297095da3e8faa26b72e69cdc837ca133212ebc10a09fe8ab
PASS: Deployable read-only image reference: europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-airtable-read-probe@sha256:ce88fa70db14f5d297095da3e8faa26b72e69cdc837ca133212ebc10a09fe8ab
PASS: Cloud Run job lszh-airtable-read-probe-staging not yet created.
READ ONLY: No Cloud Build, image upload, Job deployment/execution, PAT read or IAM changes.
```
**Jetzt unabhängig erwiesen:** Erfolgreicher Cloud Build `1b909760-deb7-49a9-bfe8-b4e20af68133`, identische SHA-256-Build-/Artifact-Registry-Digests, unveränderte gepinnte fünf Source-Dateien. Das **vollständig unveränderliche** Container-Image ist der oben genannte `@sha256:ce88...`-Bezug; nicht den veränderbaren Tag verwenden.

**Neu im Review-Branch PR #8, noch nicht live ausgeführt:** `workers/onboarding-notifications/staging-airtable-job.sh`. Modus `--plan` ist rein **lesend**, `--create-only` würde separat **genau einen neuen** Cloud-Run-Job `lszh-airtable-read-probe-staging` in `europe-west6` erstellen und **nicht ausführen** (kein `--execute-now`, kein `gcloud run jobs execute`). Vorher überprüft das Skript:
- korrektes Google-Geschäftskonto/Projekt, sauber synchronisierten Git-Branch und den unabhängigen Original-Build-/Registry-Digest-Validator;
- exakt das vorher live nachgewiesene Image mit dem SHA-256-Digest, ohne erneuten Build;
- dediziertes aktives Dienstkonto `lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com`;
- einziges STAGING-Secret `lszh-airtable-readonly-staging` mit einer user-managed Replikation **nur in Zürich**, genau einer `ENABLED`-Version `1` und dem exakten sekret-spezifischen `roles/secretmanager.secretAccessor`-Grant für das Dienstkonto;
- **Abwesenheit** des Cloud-Run-Jobs, um eine bestehende Ressource keinesfalls zu überschreiben.

Die **erst nach erneuter expliziter Nutzeraktion** mögliche `--create-only`-Aktion verwendet `gcloud run jobs create` mit dem **unveränderlichen Image-Digest**, `--tasks=1 --parallelism=1 --max-retries=0 --task-timeout=90s`, nur den drei statischen Env-Flags `LSZH_AIRTABLE_RUNTIME_PROBE_ONLY=true`, `LSZH_OUTBOX_STAGE_ENABLED=false`, `GOOGLE_CLOUD_PROJECT=lszh-automations` und **geheimem DATEI-MOUNT** `--set-secrets=/var/secrets/lszh/airtable-read-pat=lszh-airtable-readonly-staging:1`. Keine Token-Umgebungsvariable, kein Payload-Read, keine sonstigen Secrets. Nach Erstellung werden Cloud-Run-Job-Metadaten zur Bestätigung der Aufgabenanzahl, Wiederholungen, Umgebung, Dienstkonto, SHA-256-Image und Secret-v1-Mount geprüft und **null Ausführungen** verlangt. Die v1- und v2-Metadatenformate werden unterstützt. **STOP** bei Abweichungen; keine erneute Job-Anlage ohne Überprüfung. Offizielle Quellen: https://docs.cloud.google.com/run/docs/configuring/jobs/secrets und https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/create . Selbst eine erfolgreich erstellte Job-Ressource prüft noch **keinen** Airtable-Zugriff.

**Wichtig:** Bestehender `lszh-onboarding-outbox-staging`-HTTP-Dienst bleibt `LSZH_OUTBOX_STAGE_ENABLED=false`, Make, Gmail, Firestore, Airtable-Kundendaten unverändert. Die Live-Erstellung des Jobs und der später ausdrücklich separate einmalige Testlauf sind **noch nicht** geschehen.

**Nächster Schritt, nur lesen:**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-job.sh
```
Erwartet neben der unabhängigen verifizierten DIGEST-Prüfung `PASS: Company identity, original five-file Cloud Build and exact SHA-256 image.`, `PASS: Dedicated service identity, single Zurich secret version 1 and secret-specific IAM.`, `PLAN ONLY: No Cloud Run Job created/executed and no secret payload read.`. Bei einem STOP **nichts erstellen/ausführen**; Log prüfen. Erst nach dokumentiertem PASS die bewusste separate Genehmigung über `--create-only` erwägen.

## 17.10.2026 – Build-SUCCESS dokumentiert; sicherer SHA-256-Image-Digest-Preflight (READ ONLY) vorbereitet

Nach dem vom Geschäftsführer tatsächlich nachgewiesenen erfolgreichen Cloud Build `1b909760-deb7-49a9-bfe8-b4e20af68133` in `europe-west6` und Image-Tag `europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-airtable-read-probe:stg-c7ebdde79b67` wurde **ausschliesslich in GitHub PR #8** der unveränderliche Image-Nachweis vorbereitet: `workers/onboarding-notifications/staging-airtable-image-verify.sh`.

Der neue **nur lesende** Preflight verlangt das exakt richtige aktive Firmenkonto/Projekt, einen sauberen vollständig synchronisierten Review-Checkout, die unveränderten fünf am Commit `c7ebdde79b67ca767c3d36f28959a668fecbd458` gepinnten Container-Quelldateien. Er prüft die originale Cloud-Build-ID `1b909760-deb7-49a9-bfe8-b4e20af68133` via `gcloud builds describe --region=europe-west6` auf `SUCCESS` und exakt den erwarteten Image-Tag. Dann liest er via `gcloud artifacts docker images describe <TAG> --format='value(image_summary.digest)'` den **echten** Registry-Digest, verlangt strikt `sha256:` plus 64 Hexzeichen und gleicht den Build-Result-Digest ab, falls Google ihn separat ausweist. Schliesslich inventarisiert er Cloud-Run-Jobs read-only und verweigert einen unbemerkten bestehenden `lszh-airtable-read-probe-staging`-Job. Gibt die **unveränderliche vollständige Image-Referenz `...@sha256:...`** aus, ohne ein neues Image, einen Cloud Job oder ein Secret zu verändern.

**Offizielle Syntax:** Google Cloud Build `gcloud builds describe` und Artifact Registry `gcloud artifacts docker images describe`, insbesondere `value(image_summary.digest)` laut Google-Cloud-Dokumentation. **Nur synthetische CI:** `staging-airtable-image-verify.test.mjs` testet Build-Failure, falschen Tag/Digest, Umbenennung/Retagging, fehlende Repository-Metadaten, existente Jobs, falsche Identität und verbotene Mutationsbefehle. Nach Regressionstest-Korrektur meldete GitHub Actions `39014254676` **152/152 JavaScript-Tests und 8/8 IAM-Tests**, ohne Live-Google-Cloud-Aufruf in CI. Die tatsächliche SHA-256-Digest-Prüfung **wurde vom Geschäftsführer noch nicht ausgeführt**.

**Nächster ausschliesslich lesender Cloud-Shell-Aufruf:**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-image-verify.sh
```
Nur bei vollständigem PASS danach die **separate** Cloud-Run-Job-Erstellung vorbereiten. Vorher und nachher den bestehenden privaten HTTP-Outbox-Dienst unverändert `LSZH_OUTBOX_STAGE_ENABLED=false` belassen. Cloud-Run-Testjob bleibt **nicht erstellt**, Secret-PAT-Zugriff aus Cloud Run nicht getestet, keine Make-/Firestore-/E-Mail-/Kundenaktion.

## BESTÄTIGT 17.10.2026 – Separates Airtable-READ-Probe-Image in Zürcher Artifact Registry ERFOLGREICH GEBAUT

Der Geschäftsführer führte auf dem sauberen synchronisierten Review-Branch nach `git pull --ff-only` ausdrücklich `bash workers/onboarding-notifications/staging-airtable-image-build.sh --build-only` aus. Echte Cloud-Shell-Rückmeldung:
```text
PASS: LSZH identity, reviewed immutable five-file source and Zurich registry.
PASS: Exactly one enabled Secret version 1 and the secret-only IAM grant.
Isolated image target: europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-airtable-read-probe:stg-c7ebdde79b67
BUILD ONLY: five reviewed files; pushing separate image, but no Cloud Run Job.
Creating temporary archive of 5 file(s) totalling 11.5 KiB before compression.
Created [https://cloudbuild.googleapis.com/v1/projects/lszh-automations/locations/europe-west6/builds/1b909760-deb7-49a9-bfe8-b4e20af68133].
ID: 1b909760-deb7-49a9-bfe8-b4e20af68133
CREATE_TIME: 2026-10-17T07:32:20+00:00
DURATION: 18S
IMAGES: europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-airtable-read-probe:stg-c7ebdde79b67
STATUS: SUCCESS
PASS: Separate STAGING Airtable-read image build returned successfully.
STOP HERE: No Job was deployed or executed. Build image digest and service config require further review.
```

**Damit wirklich abgeschlossen:** Der isolierte, geprüfte Fünf-Dateien-Kontext wurde über Google Cloud Build in Zürich erfolgreich zu einem Image gebaut und in die vorhandene Artifact Registry veröffentlicht. **Build-ID** `1b909760-deb7-49a9-bfe8-b4e20af68133`, **Source-Pin** `c7ebdde79b67ca767c3d36f28959a668fecbd458`, **Tag** `stg-c7ebdde79b67`. Die Log-Zeile mit `gs://lszh-automations_cloudbuild/source/...` ist der temporär für Cloud Build bereitgestellte **Quellarchive-Pfad**, nicht ein Cloud-Run-Job und keine gespeicherte PAT-Datei. Das hochgeladene Tarball enthielt laut Skriptprüfung genau fünf allowgelistete Runtime/Build-Dateien.

**NOCH NICHT geprüft:** Artifact Registry `sha256`-Image-Digest und unabhängige Zuordnung zur Build-ID; diese werden als nächster **ausschliesslich lesender** GCP-Preflight geprüft. **NOCH NICHT erstellt:** `lszh-airtable-read-probe-staging` Cloud Run Job; keinerlei Jobausführung oder Cloud-Run→Airtable-REST-GET. Bestehender HTTP-Outbox-Dienst weiterhin `LSZH_OUTBOX_STAGE_ENABLED=false`. Keine neuen IAM-Bindings, Secret-Versionen, Firestore-Änderungen, Make-Aktivierungen, E-Mails oder Kundendaten durch den Build.

## BESTÄTIGT 17.10.2026 – Separater Airtable-Leseimage-Build PLAN ONLY live bestanden

Der Geschäftsführer hat im Firmen-Cloud-Shell-Checkout `git pull --ff-only` und anschliessend `bash workers/onboarding-notifications/staging-airtable-image-build.sh` **ohne** Schreibmodus ausgeführt. Die tatsächliche Google-Cloud-Ausgabe:
```text
Encryption: Google-managed key
Repository Size: 198.545MB
PASS: LSZH identity, reviewed immutable five-file source and Zurich registry.
PASS: Exactly one enabled Secret version 1 and the secret-only IAM grant.
Isolated image target: europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-airtable-read-probe:stg-c7ebdde79b67
Separate STAGING Job (NOT created): lszh-airtable-read-probe-staging
No PAT payload access, CRM/Make/Firestore operations, Cloud Run deployment or emails.
PLAN ONLY: no Cloud Build submission, image push, Job creation/execution or IAM changes.
```

**Befund:** Der synchronisierte Review-Branch, unveränderte und an `c7ebdde79b67ca767c3d36f28959a668fecbd458` gepinnte Fünf-Dateien-Buildkontext, die Zürcher Artifact Registry, ein einzelnes `ENABLED`-Secret Version 1 mit ausschliesslich direkter secret-spezifischer IAM-Zugriffsrolle und die Abwesenheit des separaten Cloud-Run-Jobs sind bestätigt. Die Container-Registry war laut CLI bereits vorhanden (`Repository Size: 198.545MB` beschreibt **das gesamte Repository**, nicht das neue Probe-Image). Der reine Planlauf hat **noch kein Probe-Image gebaut oder hochgeladen**.

Nächster ausdrücklich vom Geschäftsführer auszuführender **isolierter Build-only-Schritt**:
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-image-build.sh --build-only
```
Dieser Befehl würde einen Cloud Build aus exakt fünf allowgelisteten lokalen Dateien erstellen, das spezifisch gepinnte `lszh-airtable-read-probe:stg-c7ebdde79b67`-Image in die bestehende Zürcher Registry pushen (mögliche Build-/Registry-Kosten), aber **keinen** Job, Service, Scheduler, IAM-Grant, Secret-Wert-Zugriff, Airtable-GET, Firestore- oder Mailvorgang auslösen. Bei fehlgeschlagenem/unklarem Buildstatus **keinen automatischen Repeat**, zunächst Build-/Registry-Metadaten lesen. Nach PASS das Container-Image per Digest identifizieren und die separate Job-Erstellung zunächst nur planen; den bestehenden `lszh-onboarding-outbox-staging`-HTTP-Service nicht verändern.

## 17.10.2026 – Isolierter Cloud-Run-Airtable-Lese-Container: Build-Gate fertig, KEIN Build durchgeführt

Voraussetzungen **durch echte Geschäftskonto-Cloud-Shell bestätigt**: dediziertes Service Account `lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com` angelegt, `lszh-airtable-readonly-staging` mit genau einer Zürcher User-managed Replik `europe-west6`, Secret-Version `1` `ENABLED` nach einmaligem verdeckten Token-Upload. Der einzelne IAM-Grant `roles/secretmanager.secretAccessor` wurde tatsächlich **nur auf diesem einen Secret** für dieses SA eingeräumt und per `get-iam-policy` bestätigt. **Nicht durchgeführt:** Secret-Payload-Read, Cloud Build, Cloud Run Job/Execute oder Make-/Firestore-/E-Mail-Aktion.

**Neu im noch offenen GitHub PR #8:** `workers/onboarding-notifications/cloudbuild.airtable-read-probe.yaml` und `workers/onboarding-notifications/staging-airtable-image-build.sh` mit separaten Default `--plan` und explizitem `--build-only`. Es wird ausschliesslich ein privates, vom bestehenden Outbox-Service getrenntes Bild erstellt, **kein** Cloud-Run-Job bereitgestellt. Der Build-Kontext besteht aus exakt **5 allowgelisteten Source-Dateien**: `onboarding/confirmation.js`, `staging-airtable-rest-read.js`, `airtable-runtime-probe.js`, `Dockerfile.airtable-read-probe`, `cloudbuild.airtable-read-probe.yaml`; keine anderen Dateien, Zugangsdaten, Tests, Konfigurationsdateien, Website, CRM-Records oder .git-Ordner. Quelle auf unabhängig geprüften Commit `c7ebdde79b67ca767c3d36f28959a668fecbd458` gepinnt. Bei geänderten Quellen oder unsynchronem/dirty Checkout STOP.

Preflight **nur GCP-Metadaten lesen**: Business-Konto, LSZH-Projekt, dediziertes SA, Artifact Registry `cloud-run-source-deploy` in Zürich, korrektes Secret mit benannter/nummerischer Projektkennung und genau einer Zürcher Replik, genau eine `ENABLED`-Version 1, dedizierte und nicht öffentliche Secret-IAM-Bindung, **Abwesenheit des separaten Jobs** `lszh-airtable-read-probe-staging`. Der Payload des PAT wird dabei **nie** ausgelesen. Mit `--build-only` würde lediglich ein image unter `europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-airtable-read-probe:stg-c7ebdde79b67` mittels `gcloud builds submit` in Google Artifact Registry erzeugt, ohne Cloud-Run-Job-/Service-Änderung. Dieser Upload kann geringfügige Cloud-Build- und Registry-Kosten auslösen und braucht eine **separate ausdrückliche Nutzeraktion**.

**Offline-CI:** `staging-airtable-image-build.test.mjs` mockt 7 Szenarien für Plan-only, isolierte Build-Ausführung ohne Deploy, falsche GCP-/Git-Identität, unveränderliche Build-Quellen, fehlende PAT-Version/Secret-Berechtigung, existierenden Job und unzulässige Befehle. Ein erfolgreicher Build ist kein echter Cloud-Run-Test. GitHub-Action-Job `39013691976` meldete **145/145 Node-Tests und 8/8 Python-IAM-Tests**, kein GCP-Build in CI.

**Nächster risikofreier User-Befehl, nur Inventar/Preflight:**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-image-build.sh
```
Erwartetes Ende: `PASS: LSZH identity, reviewed immutable five-file source and Zurich registry.`, `PASS: Exactly one enabled Secret version 1 and the secret-only IAM grant.`, `PLAN ONLY: no Cloud Build submission, image push, Job creation/execution or IAM changes.`. Bei STOP **keinen** Build/Deploy starten. Erst nach Ausgabe getrennt `--build-only` prüfen. Bestehender privater HTTP-Outbox-Dienst bleibt `LSZH_OUTBOX_STAGE_ENABLED=false`, E-Mails und Make-Szenarien weiterhin deaktiviert.

## BESTÄTIGT 17.10.2026 – Secret-spezifisches IAM-Lese-Recht tatsächlich vergeben

Der Geschäftsführer führte in Cloud Shell nach einem `git pull --ff-only` das explizite `staging-airtable-secret-iam.sh --grant-secret-only` aus. **Echte Google-Cloud-Rückmeldung:**
```text
PASS: Company identity, clean review branch and dedicated service account.
PASS: Correct global STAGING secret, Zurich-only replica, exactly one ENABLED version (1).
PASS: Existing secret-specific IAM policy inspected; no binding for the dedicated identity.
Adding exactly one secret-specific Secret Accessor binding (no project IAM changes).
Updated IAM policy for secret [lszh-airtable-readonly-staging].
PASS: Dedicated service account has exactly one secret-level Secret Accessor binding.
PASS: Exactly one secret-level IAM grant verified; no PAT payload read.
STOP HERE: No Cloud Run job deployment or execution; review next gate separately.
```
**Ergebnis:** Das tatsächlich erstellte `lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com` hat nun die direkt am **einzelnen** Secret `lszh-airtable-readonly-staging` gebundene Rolle `roles/secretmanager.secretAccessor`; mittels `get-iam-policy` tatsächlich rückverifiziert, ohne Tokenwert auszulesen. **Nicht** als projektweiter Grant, keine neuen Firestore-/Make-/Gmail-Zugriffe; keine neue Secret-Version. **`--grant-secret-only` NICHT nochmals ausführen.** Das bewies keine allfällig andernorts vererbten Rechte, nur exakt die Secret-IAM-Bindung.

**Nächster Schritt:** Review-Pin/isolierter Cloud-Container-Build für `lszh-airtable-read-probe-staging`, bevorzugt zunächst rein lesenden Build-Preflight; jeder Push, jede Cloud-Run-Job-Anlage und jede Ausführung als getrennte Nutzeraktion. Der bestehende HTTP-Outbox-Dienst bleibt `LSZH_OUTBOX_STAGE_ENABLED=false`. Noch **kein** tatsächlicher Cloud-Run-zu-Airtable-Aufruf.

## BESTÄTIGT 17.10.2026 – Secret-spezifischer IAM-Preflight LIVE bestanden; Grant noch NICHT vergeben

Der Geschäftsführer hat in Google Cloud Shell nach einem sauberen `git pull --ff-only` den rein lesenden `staging-airtable-secret-iam.sh` ausgeführt. Die Live-Ausgabe bestätigte:
```text
PASS: Company identity, clean review branch and dedicated service account.
PASS: Correct global STAGING secret, Zurich-only replica, exactly one ENABLED version (1).
PASS: Existing secret-specific IAM policy inspected; no binding for the dedicated identity.
Proposed new member: serviceAccount:lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com
Proposed role: roles/secretmanager.secretAccessor
Scope: EXACTLY the one Secret Manager secret lszh-airtable-readonly-staging (not project-wide).
No PAT access, email, Firestore, Make, Cloud Run job or customer data operations.
PLAN ONLY: No IAM changes, no secret contents read and no Cloud Run deployment.
```

Das STAGING-Airtable-PAT liegt bereits in Secret-Manager-Version `1` (`ENABLED`) im globalen Secret mit exakt einer User-managed-Zürich-Replik `europe-west6`. Das dedizierte SA existiert und ist aktiv. Vor diesem Schritt existierte noch **keine direkte secret-spezifische IAM-Bindung** für das SA. **Wichtig: `PLAN ONLY` ist KEIN Nachweis, dass die Rolle bereits vergeben wurde.**

Nächster separater Cloud-Shell-Schritt: `cd ~/lszh-outbox-review && git pull --ff-only && bash workers/onboarding-notifications/staging-airtable-secret-iam.sh --grant-secret-only`. Das vorab offline getestete Skript führt maximal **eine** `gcloud secrets add-iam-policy-binding`-Aktion für **dieses eine Secret** (`roles/secretmanager.secretAccessor` zugunsten `lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com`) aus und prüft anschliessend die IAM-Richtlinie auf genau eine passende Bindung. Keine Projekt-IAM-Aktion. Es ist eine **echte Gewährung von Token-Lesezugriff**: nur mit bewusster Nutzeraktion ausführen. Falls der Befehl mit STOP abbricht, keine zweite Grant-Ausführung starten, bevor die IAM-Metadaten geprüft wurden.

Noch NICHT vorhanden/ausgeführt: Cloud-Run-Airtable-Lesejob, Build/Push/Deployment des separaten Images, Secret-Mount, realer Cloud-Run→Airtable-GET, E-Mail-/Make-/Firestore- oder produktiver Prozess. Bestehender HTTP-Outbox-Dienst bleibt deaktiviert und unverändert.

## BESTÄTIGT 17.10.2026 – Airtable-READ-PAT STAGING Secret-Version 1 erfolgreich gespeichert

Direkt aus **Google Cloud Shell** vom Geschäftsführer über `bash workers/onboarding-notifications/staging-airtable-secret-version.sh --add-once` ausgeführter, streng kontrollierter Upload. Die tatsächliche Ausgabe bestätigte erneut die unabhängige Projekt-/Secretnamensprüfung und **genau eine Zürcher user-managed Replikation**, `0` Versionen unmittelbar vor der Übertragung, danach:
```text
Created version [1] of the secret [lszh-airtable-readonly-staging].
PASS: Exactly one ENABLED STAGING secret version (1) verified; payload not read.
PASS: Airtable PAT was stored once in Secret Manager without plaintext logs or files.
STOP HERE: Service-account SecretAccessor IAM and Cloud Run deployment are separate gates.
```
**Damit nachgewiesen:** Der Token-Wert wurde genau einmal über verdecktes interaktives TTY und ephemeren Standard-Input an die **Secret-Version 1 (ENABLED)** in Google Secret Manager gesendet. Das Skript hat weder PAT-Klartext im Chat/GitHub gespeichert noch eine Secret-Version wieder ausgelesen; es wurden keine neuen IAM-Rechte, Cloud-Run-Jobs, Deployments, Make-Szenarien oder Kundenoperationen ausgelöst. **`--add-once` niemals erneut ausführen.** Aus den PASS-Meldungen allein lässt sich die tatsächliche Airtable-PAT-Scope-Beschränkung nicht unabhängig ableiten: diese ist zuvor durch den Inhaber auf `data.records:read` und nur die Website-CRM-Basis festzulegen und bei Bedarf im Airtable-Token-Portal separat zu kontrollieren (ohne Tokenwert preiszugeben).

**Nächster sicher getrennter Schritt – IAM nur auf diesem Secret:** Der in PR #8 angelegte `workers/onboarding-notifications/staging-airtable-secret-iam.sh` verwendet einen standardmässig rein lesenden `--plan`. Er prüft zunächst:
- Geschäftskonto `lars@lszh-automations.ch`, Projekt `lszh-automations`, sauber synchronisierten Review-Branch;
- vorhandenes aktives dediziertes SA `lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com`, Secret-Identität inkl. unabhängiger Projektnummer, **genau eine user-managed Replikation in `europe-west6`**;
- **eine einzelne `ENABLED`-Version `1`** ausschliesslich über *Versionsmetadaten*, kein PAT-/Payload-Read;
- per `gcloud secrets get-iam-policy` **fehlende bestehende Secret-spezifische IAM-Bindung** für das neue SA und keine öffentlichen Secret-Policy-Bindungen. Falls bereits Berechtigungen vorhanden sind: STOP zur manuellen Prüfung.

**Nur mit späterem expliziten `--grant-secret-only`:** genau ein `gcloud secrets add-iam-policy-binding lszh-airtable-readonly-staging --member=serviceAccount:lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor --condition=None`, danach sekret-spezifische Rückleseprüfung; keine projektweiten IAM- oder Firestore-Bindings, keine Cloud Run- oder E-Mail-Aktivierung. Das ist **ein echter neuer IAM-Lesezugriff auf Secret-Versionen**, deshalb muss die eigentliche Aktion getrennt geprüft und bewusst gestartet werden. Es wird keine Service Account Impersonation vorgenommen und es wurden keine geerbten Rollen geprüft; dieser Plan kontrolliert nur die direkte Secret-IAM-Policy.

**CI offline:** Die sechs neuen Mock-IAM-Tests bestehen; aktueller erfolgreicher Job `39013175244` meldete **138/138 JS-Tests plus 8/8 Python-IAM-Tests** (synthetisch, kein Cloud-IAM-Grant). Die Befehlssyntax entspricht Googles offizieller Doku https://docs.cloud.google.com/sdk/gcloud/reference/secrets/add-iam-policy-binding und https://docs.cloud.google.com/sdk/gcloud/reference/secrets/get-iam-policy .

**Als nächstes in Cloud Shell ausschliesslich der Planlauf:**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-secret-iam.sh
```
Erwartet `PLAN ONLY: No IAM changes, no secret contents read and no Cloud Run deployment.`. Bei `STOP` nicht selbst Rollen vergeben. Die bisherige private HTTP-Outbox bleibt disabled; separater Cloud-Run-Job ist weiterhin nicht erstellt.

## 17.10.2026 – Secret-Version PLAN ONLY live erfolgreich; PAT-Upload separat ausstehend

Der Geschäftsführer hat `git pull --ff-only` ausgeführt und in Cloud Shell den neuen sicheren `staging-airtable-secret-version.sh` **ohne `--add-once`** geprüft. Die tatsächliche Ausgabe bestätigt nochmals das richtige Projekt und Secret, nur die user-managed Replik `europe-west6`, **genau 0 Versionen** und das zweite maschinenlesbare Versions-Gate:
```text
PASS: Exactly zero secret versions.
PASS: Existing empty Zurich-only STAGING secret independently verified.
PASS: Secret has zero versions immediately before requested operation.
PASS: Verified unchanged business source, Zurich-only secret and zero versions.
PLAN ONLY: No credential requested or stored, no secret version created.
```
**Keine Secret-Version wurde dabei erstellt oder PAT eingegeben.** Als nächster separater bewusst vom Geschäftsführer zu startender Schritt ist `bash workers/onboarding-notifications/staging-airtable-secret-version.sh --add-once` nach Git-Sync vorgesehen. Dort darf ausschliesslich der auf `data.records:read` für die eine Website-CRM-Basis begrenzte Airtable-PAT am **verdeckten interaktiven Prompt** eingegeben werden; niemals im Chat oder Kommando. Einmaliger Secret-Manager-Upload durch stdin, erwartete genau eine `ENABLED`-Version 1 und danach STOP. Bei unklarem Fehler **nicht wiederholen**, sondern ausschliesslich lesen und prüfen. **Noch nicht durchgeführt:** PAT-Version, secret-spezifische IAM-Zugriffsrolle, Cloud-Run-Job oder Jobausführung.

## 17.10.2026 – Einmalige sichere Staging-PAT-Version vorbereitet, noch NICHT übertragen

**Live-STATUS:** Das Secret `lszh-airtable-readonly-staging` existiert; sein korrekter GCP-Projektbezug, `replication.userManaged` mit exakt einer Replikation `europe-west6` und **0 Secret-Versionen** wurden durch die vom Geschäftsführer ausgeführte korrigierte reine Lese-Diagnose vollständig bestätigt. Keine IAM-Rolle auf dem Secret, keine Airtable-PAT-Daten und kein Cloud-Run-Job eingerichtet. Das vorangegangene `staging-airtable-empty-secret.sh --create-empty` **nicht** wiederholen.

**In PR #8 erstellt:** `workers/onboarding-notifications/staging-airtable-secret-version.sh` mit Default `--plan` und getrenntem `--add-once`. Beide Modi prüfen ausschliesslich `lars@lszh-automations.ch` und GCP-Projekt `lszh-automations`, sauberen exakt synchronisierten Review-Branch, rufen die reale `staging-airtable-secret-diagnose.sh`-Prüfung auf (Projektnummer/Secretidentität/Zürich/0 Versionen) und bestätigen die Versionsliste zusätzlich unmittelbar maschinenlesbar als **leeres JSON-Array**. Bereits eine vorhandene Version sperrt die Ausführung. Der Standardmodus erfordert **kein** PAT und erstellt/ändert nichts.

Erst mit explizitem `--add-once` auf interaktiver **Cloud Shell**: verdeckter lokaler TTY-Prompt für das **ausschliesslich `data.records:read` auf `LSZH Automations – Website CRM` beschränkte Airtable-PAT**. Das PAT darf nicht in Chat, Shell-History, GitHub oder Cloud-Run-Umgebungsvariablen gelangen. Bash liest es ohne Terminal-Echo in eine **nicht exportierte Variable**, übergibt es per ephemerer Standardeingabe `printf '%s' "$token" | gcloud secrets versions add "$SECRET" --data-file=-` unmittelbar an Google Secret Manager, ohne Klartextdatei oder Kommandozeilenargument. **Genau ein Schreibaufruf, kein automatisches Retry.** Nach erfolgreichem Write wird **ausschliesslich Metadaten** abgefragt: genau eine `ENABLED`-Version `1`, kein Payload-Read. Bei ambivalentem Fehler NICHT erneut ausführen, zuerst read-only diagnostizieren. Keine IAM-Rolle, kein Job, keine Make-/Kundendaten-/Versandoperation.

Offizielle CLI-Syntax bestätigt: https://docs.cloud.google.com/sdk/gcloud/reference/secrets/versions/add (Secret-Name positional, `--data-file=-` für stdin). CI: `staging-airtable-secret-version.test.mjs` mockt Plan/fehlende Version/fehlerhafte Identität/unberechtigte Flags und erzwungene TTY-Grenze. **132/132 JavaScript-Tests und 8/8 IAM-Tests** am Source-Commit `e39b9daf2477928a7421c5951968e968a55ee295` bestanden; kein tatsächliches Secret wurde von CI hochgeladen.

**Nächster Schritt ohne Mutation:**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-secret-version.sh
```
Erwartet `PLAN ONLY` und 0 Versionen. Für die spätere Ausführung `--add-once` ausdrückliche lokale Benutzeraktion am verdeckten TTY; danach erst Secret-spezifische `roles/secretmanager.secretAccessor`-IAM-Bindung für das dedizierte Dienstkonto planen und isolierten Cloud-Run-Lesejob erstellen. **Der bestehende HTTP-Outbox-Dienst bleibt `LSZH_OUTBOX_STAGE_ENABLED=false`.**

## BESTÄTIGT 17.10.2026 – Leeres Zürich-STAGING-Secret tatsächlich vollständig verifiziert

Der Geschäftsführer führte `git pull --ff-only` und anschliessend das korrigierte rein lesende `staging-airtable-secret-diagnose.sh` im LSZH-Cloud-Shell-Projekt aus. Die Live-Ausgabe lautete:
```text
PASS: Company identity and independently verified project number.
Secret identifier matches: PASS
Secret project verified (ID or numeric): PASS
Replication mode: user-managed
Replica regions: europe-west6
Zurich-only replica: PASS
PASS: Exactly zero secret versions.
PASS: Existing empty Zurich-only STAGING secret independently verified.
READ ONLY: No token, IAM grants, Cloud Run resources or customer data touched.
```
Damit sind **Name, richtiges GCP-Projekt (Projekt-ID oder unabhängig nachgeprüfte Projektnummer), exakt eine Zürcher Replikation und 0 Secret-Versionen tatsächlich unabhängig geprüft**. Der frühere Fehler mit der falschen `gcloud secrets versions list --secret=...`-Syntax ist durch die korrigierte Positionsargument-Syntax nachweislich behoben. Keine zweite Secret-Ressource erstellen; insbesondere `staging-airtable-empty-secret.sh --create-empty` **nicht wiederholen**. Der gesonderte Lesedienst `lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com` existiert, hat jedoch keine neue SecretAccessor-Berechtigung; das Cloud-Run-Job-Deployment und die später zu hinterlegende Token-Version bleiben separate Schritte.

## 17.10.2026 – Secret-Name, Google-Projekt und Zürcher Replikation LIVE bestätigt; Versionsprüfung noch offen

Der Geschäftsführer führte `staging-airtable-secret-diagnose.sh` nach `git pull --ff-only` aus. **Nachgewiesene echte CLI-Antwort:**
```text
PASS: Company identity and independently verified project number.
Secret identifier matches: PASS
Secret project verified (ID or numeric): PASS
Replication mode: user-managed
Replica regions: europe-west6
Zurich-only replica: PASS
ERROR: (gcloud.secrets.versions.list) unrecognized arguments: --secret=lszh-airtable-readonly-staging
STOP: Cannot enumerate version metadata.
```

**Fazit:** `lszh-airtable-readonly-staging` ist tatsächlich im richtigen Projekt angelegt, mit genau einer vom Nutzer verwalteten Replikation ausschliesslich in `europe-west6`. Der frühere Ressourcen-/Replikations-STOP war ein zu strikter/inkompatibler Vergleich; das ist jetzt durch die unabhängige Diagnoseroutine korrigiert und live bestätigt. **Noch NICHT nachgewiesen:** tatsächliche Zahl der Secret-Versionen, weil die Secret-Manager-CLI bei `gcloud secrets versions list` den Secret-Namen als **Positionsargument** erwartet; `--secret=` ist für `versions list` unzulässig. Referenz: https://docs.cloud.google.com/sdk/gcloud/reference/secrets/versions/list .

**Codefix in PR #8:** Beide Skripte `staging-airtable-secret-diagnose.sh` und `staging-airtable-empty-secret.sh` verwenden jetzt `gcloud secrets versions list "$SECRET" --project="$PROJECT" --format='value(name)'`; Mock-Tests fordern die korrekte Positionsargument-Syntax ausdrücklich. Das Skript für die Initialanlage **niemals erneut mit `--create-empty` ausführen**. Keine neue Secret-Version, kein PAT, keine IAM-Bindung, kein Cloud-Run-Job.

**Einziger nächste Schritt (READ ONLY):**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-secret-diagnose.sh
```
Erwartetes Ende nur bei wirklich leerem Versionsinventar: `PASS: Exactly zero secret versions.` und `PASS: Existing empty Zurich-only STAGING secret independently verified.`. Bei STOP keinerlei weitere Änderungen; insbesondere keine PAT-Version hinterlegen oder IAM-Rechte vergeben.

## WICHTIG 17.10.2026 – Secret angelegt, strenge Replikations-/Namensprüfung zunächst fehlgeschlagen

Der Geschäftsführer führte nach sauberem Cloud-Shell-`git pull --ff-only` ausdrücklich `bash workers/onboarding-notifications/staging-airtable-empty-secret.sh --create-empty` aus. **Die Live-CLI hat bestätigt:** `Created secret [lszh-airtable-readonly-staging].` Unmittelbar darauf kam `STOP: Secret name or Zurich-only replication mismatch; inspect metadata, do not add PAT.`

**Ergebnis daher nicht als durchgängig PASS markieren!** Ein Secret-Manager-Ressourcenobjekt wurde wirklich erstellt, aber die Sicherheitsroutine hat das zurückgelesene Resource-`name` **oder** die exakte `replication.userManaged.replicas`-Liste nicht akzeptiert. Grund ist derzeit ungeklärt. Möglich wäre die alternative von Google ausgegebene Ressourcennotation `projects/<numericProjectNumber>/secrets/... ` statt `projects/lszh-automations/secrets/...`, aber diese Hypothese ist **nicht verifiziert**. Der Name und Speicherort werden erst mit Metadaten aus Cloud Shell beurteilt.

**STOP-Gate:** `--create-empty` nicht erneut aufrufen (Ressource existiert schon); **keine** Secret-Version / kein PAT hochladen, **keinen** IAM-SecretAccessor einrichten und **keinen** Cloud-Run-Job bauen/deployen/ausführen. Das Skript kam vor der nachfolgenden Secret-Versionskontrolle zum STOP; auch **null Versionen sind derzeit noch nicht unabhängig nachgewiesen**. Es wurde von diesem Skript kein PAT oder Secret-Wert hinzugefügt und kein IAM-Binding vergeben.

**Sicherer Diagnoseweg im GitHub-Zweig neu vorbereitet:** `workers/onboarding-notifications/staging-airtable-secret-diagnose.sh` darf ohne Argumente nur `gcloud projects describe`, `gcloud secrets describe`, `gcloud secrets versions list` und die Identitäts-/Git-Prüfung ausführen. Kein Secret-Payload-`access`, kein Mutationsbefehl. Das Skript akzeptiert nur den exakt erwarteten Secret-Namen unter entweder der korrekt unabhängig abgefragten **numerischen Projektkennung** oder `lszh-automations`, und fordert **genau eine** `userManaged`-Replik in `europe-west6` sowie **null** Versionen. Gibt einzelne Prüfergebnisse zur Fehlerunterscheidung aus. Falls es STOP meldet: keinen weiteren schreibenden Schritt durchführen.

**Nächster Befehl, nur Diagnose:**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-secret-diagnose.sh
```
Erst nach echter Log-Ausgabe Replikation und leeren Zustand als bestanden dokumentieren. Kein neuer Versuch, das Secret zu erstellen.

## 17.10.2026 – Leeres Airtable-STAGING-Secret PLAN ONLY in Cloud Shell bestätigt

Der Geschäftsführer führte nach `git pull --ff-only` das sichere `staging-airtable-empty-secret.sh` **ohne** schreibenden Modus aus. Tatsächlich von Google Cloud Shell bestätigte Ausgabe:

```text
PASS: Dedicated STAGING service identity exists and is enabled.
PASS: Company identity, reviewed branch and separate service account verified.
Expected empty Secret Manager resource: lszh-airtable-readonly-staging
Replication: user-managed, exactly one replica in europe-west6 (Zurich).
Existing secret/job: false/false
No PAT, secret version, IAM grant, Cloud Run job/service or customer data operation.
PLAN ONLY: no Secret Manager resources or versions created.
```

**Befund:** Das separate Dienstkonto ist aktiv, Secret und Testjob sind noch nicht vorhanden; der Planlauf hat keine neue Ressource und kein Secret-Payload angelegt. Nächster genau abgegrenzter Schritt ist `bash workers/onboarding-notifications/staging-airtable-empty-secret.sh --create-empty` nach `git pull --ff-only`: ausschliesslich leeres Secret `lszh-airtable-readonly-staging` mit einer Zürcher Replikation erstellen, anschliessend Resource-Name, Replikationsort und null Versionen bestätigen. Mögliche geringe Google-Cloud-Kosten. **Nach dem Anlegen stoppen**: Keine PAT-Version, SecretAccessor-Rolle, Cloud-Run-Job, E-Mail oder Kundenänderung durch diesen Schritt. Erst bei zurückgemeldetem Live-Output als erstellt dokumentieren.

## 17.10.2026 – Airtable-PAT-Secret sicher vorbereitet (nur leere Ressource; noch nicht angelegt)

Nach der vom Geschäftsführer bestätigten Erstellung von `lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com` ist der **nächste isolierte Schritt** als plan-first Shell-Skript vorbereitet: `workers/onboarding-notifications/staging-airtable-empty-secret.sh`. Er basiert auf dem Google-Cloud-CLI-Feature `gcloud secrets create --replication-policy=user-managed --locations=europe-west6`; Secret Manager verwaltet die Ressource global, die einzige Nutzdaten-Replikation soll in Zürich liegen.

Der Default `--plan` prüft Geschäftskonto, Projekt und sauberen Review-Git-Branch; er liest die vorhandene dedizierte Dienstkontoidentität und enumeriert die Secret-/Jobnamen. Bei nicht vorhandenen Ressourcen meldet er `Existing secret/job: false/false`, ohne Ressourcen zu erstellen. Ein separater expliziter `--create-empty`-Modus erstellt **ausschliesslich** das globale Metadaten-Secret `lszh-airtable-readonly-staging` ohne Wert, mit **genau einer user-managed Replik `europe-west6`**, und liest die exakte Resource-Identität, Replikationsliste und die erwartete **leere Versionsliste** zurück. Er bricht bei Fehlern und Namenskollisionen ab. Er besitzt **keine** Token-/Secret-Version-Upload-Funktion, IAM-Binding-, Cloud-Run-Job-, Kunden- oder Versandanweisungen. **Achtung:** Bei erfolgreichem Anlegen können geringe Secret-Manager-Grundkosten entstehen, auch wenn noch kein Token gespeichert ist.

**Offline-GitHub-CI:** `staging-airtable-empty-secret.test.mjs` simuliert ohne Cloud-Verbindung Plan, explizite leere Anlage, Zürich-Replikation, Schutz vor Ressourcenkollision, falsche Identität, Listen-Fehler, unerwartete Replikation, unerwartet bestehende Versionen und unerlaubte Modi. Der synthetische Outbox-CI-Lauf bestätigte **119/119 JavaScript-Tests und 8/8 IAM-Tests**; reiner lokaler CI-Test.

**Nächste überprüfbare Ausführung:** In Cloud Shell `cd ~/lszh-outbox-review && git pull --ff-only && bash workers/onboarding-notifications/staging-airtable-empty-secret.sh`. Nur der Default-Planlauf, **kein PAT nötig**. **Weder die Secret-Ressource noch eine Version oder SecretAccess-IAM-Bindung wurde durch diese Programmänderung angelegt.** Danach einzelne Freigabe für `--create-empty` und getrennt für die spätere sichere PAT-Version plus Secret-Level-Zugriffsrolle. Bestehender HTTP-Outbox-Dienst bleibt `enabled=false`; der ursprüngliche Firestore-Write-Job darf nicht wiederholt werden.

## BESTÄTIGT 17.10.2026 – separates Airtable-STAGING-Dienstkonto tatsächlich erstellt; noch keine Rechte oder Secrets

Direkt vom Geschäftsführer in der Geschäftskonto-Cloud-Shell ausgeführter Befehl `bash workers/onboarding-notifications/staging-airtable-identity.sh --create-identity`, nach erfolgreichem `git pull --ff-only`. Die vorgelagerte Inventarisierung meldete `Existing resources (identity/secret/job): false/false/false`; der Google-Cloud-CLI-Lauf:
```text
Created service account [lszh-airtable-read-stg].
Service account email: lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com
PASS: Dedicated staging Airtable-read service account exists, with NO new IAM grants.
STOP HERE: Secret creation, IAM secret access, job deployment and execution require separate gated steps.
```
**Nachgewiesen:** separates Dienstkonto `lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com` angelegt und per `describe` rückgelesen. Das Skript hat **keine** IAM-Bindings vergeben, keine Service-Account-Schlüssel, Secret-Manager-Secrets, Cloud-Run-Jobs oder -Deployments erstellt und keine Airtable-Datensätze oder Mails angefasst. Eine Prüfung eventuell **geerbter** IAM-Rollen ist durch diesen Schritt nicht erbracht.

**Als nächstes:** Nur die **leere** Secret-Manager-Ressource `lszh-airtable-readonly-staging` mit genau einer vom Benutzer verwalteten Replikation in `europe-west6` (Zürich) vorbereiten und eigenständig prüfen. **Keine** Secret-Version/PAT einspielen, keine Berechtigungen setzen und keinen Job erstellen oder ausführen, bis spätere getrennte Gates erfolgreich sind. Bestehender Outbox-HTTP-Service bleibt weiterhin `enabled=false`. Globaler Secret-Ressourcenname mit auf Zürich begrenzter Benutzer-Replikation ist von einem *regionalen Secret* zu unterscheiden.

## 17.10.2026 – Airtable-STAGING-Dienstkonto: reiner PLAN ONLY-Preflight bestanden

Der Geschäftsführer führte in Google Cloud Shell nach `git pull --ff-only` den Planlauf `bash workers/onboarding-notifications/staging-airtable-identity.sh` auf Branch `feature/onboarding-notification-outbox-20261016` aus. **Nachgewiesene Originalausgabe:**

```text
PASS: LSZH company identity, clean pinned branch and read-only metadata enumeration.
Proposed service account: lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com
Proposed separate job: lszh-airtable-read-probe-staging
No Firestore role, no emails, no production service changes and no customer records.
Existing resources (identity/secret/job): false/false/false
PLAN ONLY: no IAM grant, new service account, secret, image, job or execution.
```

**Interpretation:** Firmenkonto, ausgewähltes Projekt, synchroner sauberer Git-Branch und Leserechte auf das Ressourcen-Inventar sind bestätigt. Die drei exklusiv vorgesehenen neuen Ressourcennamen (Dienstkonto, Secret, Job) waren laut Live-Abfrage noch frei. **Es wurde bisher noch kein Google-Dienstkonto, Secret oder Cloud-Run-Job erstellt**, keine IAM-Rolle erteilt und keine Kunden- oder E-Mail-Operation ausgeführt.

**Nächster eigenständiger, eng begrenzter Schritt:** `bash workers/onboarding-notifications/staging-airtable-identity.sh --create-identity`; erstellt nur `lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com`, ohne zusätzliche IAM-Rolle, SA-Key, Secret, Cloud-Run-Deployment oder Ausführung; bricht bei zwischenzeitlich entstandenem Ressourcen-Namenskonflikt ab. Nach tatsächlicher Ausgabe den Erfolg prüfen und dokumentieren. Der zuvor erfolgreiche `--plan` ist **keine** Bestätigung der Erstellung.

## 17.10.2026 – Airtable→Cloud-Run-Staging-Identität vorbereitet, NOCH KEINE Ressourcen erstellt

Der Geschäftsführer gab mit `vamos` den Auftrag, an der zuvor vorgeschlagenen Einrichtung von separatem Service Account, Secret und STAGING-Probejob weiterzuarbeiten. Die Sicherheitsarbeit wurde bewusst auf den ersten isolierten Schritt begrenzt: **eigenes Google-Dienstkonto ohne zusätzliche Rollen**. Datei `workers/onboarding-notifications/staging-airtable-identity.sh` hat Default `--plan` (GCP-Konto-/Projektcheck, reines Listen der bereits vorhandenen Service Accounts, Secrets und Cloud-Run-Jobs) und optional `--create-identity` für maximal **ein** Dienstkonto `lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com` – nur wenn die drei geplanten Resource-Namen komplett frei sind. Kein Erzeugen von IAM-Keys, keine Projekt-/Firestore-Rollen, keine Secrets, keine Cloud-Run-Jobs, keine Änderungen bestehender Dienste, keine Kunden-/Make-/E-Mail-Operationen. Identitäts- und Kollisions-Fehler brechen vor Schreiboperationen ab.

In GitHub Actions bestätigt: **112/112 JavaScript- und 8/8 IAM-Tests** am Source-Commit `510d77825f75d8b25c653800bad2f0b426727d17`; sechs neue Shell-/Cloud-Simulationstests beweisen PLAN ONLY, bewusstes Identitäts-Anlegen ohne Rollen, STOP bei Bestandskollision, fehlerhafter Geschäftsidentität und unsicherem Git-Checkout. Detaillierter Folgeplan [LSZH_AIRTABLE_CLOUD_RUN_READ_PROBE_20261017.md](./LSZH_AIRTABLE_CLOUD_RUN_READ_PROBE_20261017.md).

**Nächster rein lesender Schritt, bevor irgendetwas in GCP erstellt wird:**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-identity.sh
```
Der erwartete Abschluss `PLAN ONLY` erstellt keinerlei Cloud-Ressourcen. **Offen:** Dienstkonto in Cloud wirklich erstellen, dann getrennt Secret/Zürich-Replikation/engste Secret-Zugriffsrolle/PAT-Version, review-pinned Build, separaten Job, einmalige Execution und anschliessende Prüfung. Keine PAT-Eingabe in den Chat; früherer Airtable-REST-Test aus Cloud Shell bleibt separat als PASS. Bestehender Outbox-Service bleibt disabled. Noch kein realer End-to-End-Cloud-Run→Airtable→Firestore-Lauf.

## 17.10.2026 – Separater Cloud-Run-Airtable-Lesetest entwickelt, NOCH NICHT DEPLOYED

Nach dem ausdrücklich bestandenen echten Airtable-REST-GET **aus Cloud Shell** (ein erster 401/403-ähnlicher Berechtigungsfehler, zweiter Durchlauf PASS) wurde **nur in GitHub PR #8** ein ausfallsicherer *separater* Job-Baustein vorbereitet:
- `workers/onboarding-notifications/airtable-runtime-probe.js`: benutzt die unveränderte `onboarding/confirmation.js::verifyOnboardingState` via dem zuvor geprüften `staging-airtable-rest-read.js`, erlaubt genau ein GET nach einem neuen zufälligen Abwesenheitscode und verbietet Nebenabfragen, Tokens in Environment/Logs, Firestore-Konfiguration und Outbox-Aktivierung. Die GCP-Projektidentität, der eigens vorgesehene Jobname `lszh-airtable-read-probe-staging` sowie Index 0/Attempt 0 und zwei streng definierte Betriebsflags sind zwingend. Ein erst später separat freigegebener Secret-Manager-Dateimount unter `/var/secrets/lszh/airtable-read-pat` wäre die einzige Credential-Quelle.
- `airtable-runtime-probe.test.mjs`: Offline-Tests mit vollständig synthetischen Antworten für fail-closed Flags, Secret-Verfügbarkeit, falschen Job, HTTP 403 und unerwarteten CRM-Datensatz.
- `Dockerfile.airtable-read-probe`: **nur drei Runtime-JavaScript-Dateien**, ausdrücklich **ohne** Server/Firestore/Make/Email-Code oder eingebettete Zugangsdaten. GitHub Actions überprüft Syntax, Testfälle, containerisierte Default-Sperre und führt lediglich einen lokalen Docker-Build ohne Push/Deployment durch.

Design und unabhängige Freigabegrenze: [LSZH_AIRTABLE_CLOUD_RUN_READ_PROBE_20261017.md](./LSZH_AIRTABLE_CLOUD_RUN_READ_PROBE_20261017.md). Für einen späteren STAGING-Job **separates Dienstkonto ohne Firestore-Zugriff**, neues beschränktes `data.records:read`-Airtable-Token nur auf Website CRM und **auf das einzelne Secret beschränktes** `roles/secretmanager.secretAccessor`; kein projektweites Grant. **Es wurde noch kein neues Dienstkonto, Secret, Google-Cloud-Image oder Cloud-Run-Job erzeugt und kein Zugangstoken in Google Cloud gespeichert.** Bestehender HTTP-Outbox-Dienst bleibt `enabled=false`; reale Kundendaten und Automationen unberührt. Ein späterer Cloud-Run-Lesetest beweist noch kein vollständiges Kunden-Onboarding, keine Mail und keine RC1/AVV-Freigabe.

## Bestätigt 17.10.2026 – Echte Airtable-REST-Authentifizierung in Cloud Shell: PASS

Der Geschäftsführer führte das zuvor genehmigte, gezielt lesende Skript `bash workers/onboarding-notifications/staging-airtable-rest-read.sh --probe` **zweimal** aus. Die Git-Branch-/Geschäftskonto- und Projektidentitätsprüfung war jeweils erfolgreich. Beim **ersten** Durchlauf wurde das verdeckt eingegebene Airtable-Token zurückgewiesen: `STOP: airtable_token_not_authorized` (401/403-Klasse; genaue Ursache nicht belegt). Nach einem zweiten verdeckten Eingabeversuch meldete derselbe strikt beschränkte Probe-Code:
```text
PASS: Existing verifyOnboardingState() used Airtable REST via exactly one GET.
PASS: Fresh unprinted synthetic project code absent; processing (not completed).
PASS: No Airtable writes, Firestore operations, service changes or emails.
PASS: Isolated Airtable REST verifier finished; no customer record was changed.
```

**Damit nachgewiesen:** Die unveränderte Node.js-`verifyOnboardingState()`-Funktion konnte **aus Cloud Shell heraus** mit einem vom Nutzer lokal verdeckt eingegebenen, für die LSZH Website-CRM-Basis bestimmten Airtable-REST-PAT genau einen HTTPS-`GET` auf die projektcodegefilterte Kunden-Onboarding-Tabelle ausführen und die Abwesenheit eines zufällig generierten, nicht veröffentlichten `ob_<UUIDv4>`-Fixture-Codes korrekt als `processing` einordnen. Keine Kundensuche ausserhalb der festgelegten Tabelle, kein Anlegen, keine E-Mail, keine Make-Aktion, keine Firestore-Aktion. Die bereits drei zuvor bereinigten CRM-Testdatensätze bleiben bereinigt; der Probe-Code speichert keinen Token und enthält keine Kunden-IDs in den Logs.

**Grenze:** Der erste Abweisungsgrund (ungültiges PAT, Scopes oder Base-Zugriff) wurde nicht diagnostiziert und muss nicht weiter erforscht werden, solange der spätere Zugriff sicher bestätigt ist. Der PAT wurde **nicht** in Google Secret Manager hinterlegt, nicht in Cloud Run exportiert und nicht im Repository gespeichert. Der Cloud-Run-HTTP-Outbox-Dienst `lszh-onboarding-outbox-staging` bleibt explizit `LSZH_OUTBOX_STAGE_ENABLED=false`, ohne Scheduler oder Mailtransport. **Noch NICHT nachgewiesen:** Cloud-Run-zu-Airtable-REST mit minimalem Secret-Zugriff, reale unveränderte Airtable-Onboarding-Fixture als `completed` via Node in Cloud Run, oder ein durchgehender verbunden gestarteter Airtable→Cloud-Run→Firestore-Probelauf. Erfolg eines Absenzchecks bedeutet kein erfolgreich abgewickeltes Kunden-Onboarding.

**Nächste technische Entscheidung:** Für einen sicheren Cloud-Run-STAGING-Read-Probe einen *separaten*, standardmässig nicht ausführbaren und ausschliesslich lesenden Cloud-Run-Job vorbereiten, mit nur einer festgelegten Airtable-REST-GET-Anfrage (neuer zufälliger Abwesenheitscode), ohne Cloud-Run-HTTP-Outbox zu aktivieren. Hierfür nach separater Freigabe den vorhandenen PAT ausschliesslich als geschütztes, eng berechtigtes Staging-Secret bereitstellen, keinen Key in Shell-History/GitHub/Logs. Nicht unbemerkt weiterverwenden oder extern versenden.

## Bestätigt 17.10.2026 – Airtable-REST-Einmal-Preflight `PLAN ONLY` erfolgreich

Der Geschäftsführer führte nach erfolgreichem `git pull --ff-only` im LSZH-Cloud-Shell-Checkout `bash workers/onboarding-notifications/staging-airtable-rest-read.sh` ohne Parameter aus. Die Ausgabe bestätigte `PASS: Checked business identity, source branch and clean reviewed checkout.` sowie `PLAN ONLY: no Airtable token requested, no external API calls or cloud changes.`. **Es wurde noch kein Airtable-REST-GET mit einem PAT ausgeführt.** Der beschränkte externe REST-Zugriff des vorhandenen Node.js-Statusverifizierers muss erst separat nachgewiesen werden. Keine CRM-Datensätze, Dienstkonfigurationen, Make-Szenarien, IAM-Berechtigungen oder E-Mails geändert.

**Nächster Schritt bei bereitgestelltem, ausdrücklich auf `data.records:read` und die eine Website-CRM-Airtable-Basis begrenzten PAT** (Token niemals in Chat/GitHub/Cloud-Logs einfügen): `bash workers/onboarding-notifications/staging-airtable-rest-read.sh --probe`, Token ausschliesslich an verdecktem Cloud-Shell-Prompt eingeben. Es ist ein eigenständiger bewusst ausgelöster **einziger GET** auf die synthetische zufällige Abwesenheit, keine Cloud-Run-Ausführung. Bei `STOP` nicht mit ungeschützten Curl- oder Logging-Alternativen fortsetzen.

## AKTUELL – 17.10.2026 07:34 (Zürich): Echte Airtable-REST-Leseprüfung vorbereitet, kein Cloud-Dienst aktiviert

**Erneuter exakter, ausschliesslich lesender Cleanup-Nachweis über den verbundenen Airtable-Zugang:** Die drei früheren ausschliesslich synthetischen Airtable-IDs aus dem ausdrücklich genehmigten CRM-Fixture-Test ergeben weiterhin jeweils **0 Treffer**: `Kunden-Onboarding/recx6PnnpSgpbZbYn`, `Aufträge/recPbqkocPYokgK2n`, `Kunden/rec6Mu0uaBdy4H3K7`. Es wurde kein weiterer Testkunde angelegt.

**Weiteres Sicherheits-Gate implementiert (offline getestet, NICHT live ausgeführt):**
- `workers/onboarding-notifications/staging-airtable-rest-read.sh`: ausschliesslich `--plan` (kein Netzwerkzugriff) oder bewusst `--probe` (interaktiv). Prüft das LSZH-Google-Geschäftskonto, den Projektkontext sowie den sauberen geprüften Git-Branch. Erfordert ein **nur auf die CRM-Basis eingeschränktes Airtable-PAT mit `data.records:read`**. Das PAT wird am sicheren Cloud-Shell-Prompt **verdeckt** eingegeben, über eine temporäre Standard-Input-Pipe direkt an Node übergeben, nicht als Parameter/Environment/Datei/GitHub/Cloud Run/Logs gespeichert. Token weder hier noch im Chat posten.
- `staging-airtable-rest-read.js`: verwendet die **unveränderte reale** `onboarding/confirmation.js -> verifyOnboardingState()`-Funktion, erzeugt einen frischen, kryptografisch zufälligen `ob_<UUIDv4>`-Testcode und erlaubt über eine Request-Whitelist **genau ein** `GET` an `https://api.airtable.com/v0/appzJiskpAdaR1HEv/tblWIY4l4VASz8Vse` mit streng geprüftem `{Projektcode}='...'`-Filter. Die Erwartung ist `processing` für die fehlende Fixture, **nicht `completed`**. Bei 401/403/429, unerwarteter Antwort oder zweiter Anforderung: STOP ohne Folgeanfrage; keine Kundendaten-Lektüre, Firestore, Make, E-Mail oder CRM-Schreiboperation. Es werden weder zufälliger Code noch Token oder Antwortbody geloggt.
- `staging-airtable-rest-read.test.mjs`: acht offline gefälschte REST-Testfälle für exakten GET, Freigabeflag, Token-/Codevalidierung, 401/403, 429, unerwartete Treffer und defekte Antwort. CI im Outbox-Workflow meldete nach Hinzufügung **99/99 JavaScript-Tests und 8/8 IAM-Tests** bestanden.

**Noch OFFEN:** Die externe Airtable-REST-Probe wurde **nicht** ausgeführt, da ein minimales echtes Airtable-PAT eingegeben werden muss. Der verbundene Airtable-App-Zugang wird niemals als Cloud-Run-PAT ausgegeben. Dieser PRE-Integrationstest validiert nur die Node.js-REST-Leseverbindung von Cloud Shell für einen **nicht vorhandenen** Testcode; er belegt **noch keinen** Cloud-Run-zu-Airtable-Lesezugriff und auch keinen vollständigen CRM→Outbox-Produktivzyklus. Kein Secret Manager, neues Cloud-Run-Deployment, neuer Testkunde oder Scheduler eingerichtet.

**Nächster Schritt für den Geschäftsführer (nur read-only zuerst):**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-rest-read.sh
```
Erwartet `PLAN ONLY`, ohne Passwortabfrage/API-Aufruf. Anschliessend als **eigene** Aktion und erst mit geeigneten Airtable-Read-only-PAT `bash workers/onboarding-notifications/staging-airtable-rest-read.sh --probe` (ein gezielter GET). Der Cloud-Run-HTTP-Outbox-Dienst bleibt `LSZH_OUTBOX_STAGE_ENABLED=false`; keine realen Kundenveränderungen oder Automationsaktivierungen.

## AKTUELL – 17.10.2026: Synthetischer Airtable-CRM-Onboarding-Test LIVE bestanden UND VOLLSTÄNDIG bereinigt

Der Geschäftsführer erteilte ausdrücklich die Freigabe für die kontrollierte Erstellung und anschliessende Bereinigung von **genau drei** synthetischen Datensätzen in der real verbundenen Website-CRM-Airtable-Basis `appzJiskpAdaR1HEv`. Vorher wurden live die neun Airtable-Automationen (acht aktiv), zwei aktiven Make-Szenarien (ohne Airtable) und sieben inaktiven Make-Onboarding-Szenarien überprüft. Die aktuellen Feldschema-Optionen und Berechnungsformeln bestätigten den geplanten risikoarmen Datensatztyp. Der einmalig zufällig generierte, nicht veröffentlichte synthetische Onboarding-Code hatte vor Anlage **0** exakte CRM-Treffer. Kein laufendes System wurde deaktiviert oder aktiviert.

In dieser Reihenfolge angelegt: fiktiver `Kunden`-Record `rec6Mu0uaBdy4H3K7`, fiktiver `Aufträge`-Record `recPbqkocPYokgK2n`, fiktiver `Kunden-Onboarding`-Record `recx6PnnpSgpbZbYn`. Nur `synthetisch@example.invalid` als Kontaktadresse, keine echten Personen-/Kundendaten, keine Offerte oder Rechnung, kein Versand. Der Auftrag war `Leistung=Beratung`, `Status=Pausiert`, `Abrechnungsmodell=Individuell`, `Standardaufgaben erstellt=true`, CHF 0 und ohne Fakturierungsdatum. **13/13 unabhängige Live-Leseprüfungen** der Verknüpfungen, Rechnungsdaten-/Make-Status-Konsistenz, Versandsperren und Sicherheitsformeln waren positiv. `Auto-Fakturierung fällig=0`, `Projekt vollständig=0`, keine automatisch angelegten Projektaufgaben-/Rechnungslinks.

Danach ausdrücklich **alle drei angelegten synthetischen Datensätze bereinigt**: Onboarding → Auftrag → Kunde. Vor jeder Löschung wurden Identität und fehlende nicht autorisierte Verknüpfungen kontrolliert. Die Cloud-Airtable-Schnittstelle bestätigte jede Delete-Aktion und gesonderte nachfolgende Reads meldeten **für jede der drei Record-IDs null Treffer**; die abschliessende projektcodegenaue Onboarding-Suche ergab ebenfalls **0 Treffer**. Keine synthetische Fixture blieb zurück. Keine Make-Einladung, Gmail-Nachricht, Cloud-Run-Reconcile, Firestore-Aktion oder Aktivierung des weiterhin gesperrten Cloud-Run-HTTP-Outbox-Dienstes. Die bestehenden erfolgreichen Firestore-Lese-/Schreib-/bereinigten Tests sind getrennte technische Nachweise.

**Wichtiges Gate bleibt bestehen:** Durchgängiger Live-Codepfad `verifyOnboardingState()` über echtes Airtable-REST-Token auf einem Cloud-Run-Ausführungsdienst und anschliessend Outbox-Speicherung **wurde NICHT ausgeführt**. Das Ergebnis ist ein nachweislich sauberer realer Airtable-Fixture-/Referenzdaten-/Konsistenz-/Cleanup-Test, ergänzt durch bereits grüne synthetische Offline-E2E-Tests. Rechtliche RC1-/AVV-Freigaben und produktive Systeme bleiben separat offen. Für erneute CRM-Fixtures oder Cloud-Run-Verbindung eigene erneute Freigaben einholen; **nicht** heimlich neue Testdaten anlegen.

**Einzelheiten:** [LSZH_AIRTABLE_E2E_FIXTURE_SAFETY_PLAN_20261017.md](./LSZH_AIRTABLE_E2E_FIXTURE_SAFETY_PLAN_20261017.md).

## Update 17.10.2026 – Airtable-Fixture-Nebenwirkungen auditiert; keine CRM-Schreibfreigabe

**Ausschliesslich lesende Live-Bestandsaufnahme:** In der Website-CRM-Airtable-Base `appzJiskpAdaR1HEv` sind 9 Automationen vorhanden, davon **8 deployed/aktiv**. Die vier wichtigsten Bedingungen wurden in der aktuell bereitgestellten Automation-Konfiguration kontrolliert:
- `LSZH Projekte – Standard-Onboarding` läuft nur bei Aufträgen `Leistung=Automation-Projekt` plus Kunden-Link, leerer Aufgaben-Linkliste und `Standardaufgaben erstellt=false`; Folge: **sechs Projektaufgaben** und ein Auftragsupdate. Für E2E-Test daher **Leistung=Beratung** und **Standardaufgaben erstellt=true**.
- `LSZH Projekte – Abschluss & Betreuung` reagiert auf `Projekt vollständig=1`, fehlendes Abschlussdatum und Nicht-Storniert; synthetischer Auftrag darf **Projektabschluss durchgeführt nicht setzen**.
- Zwei aktive Rechnungs-Automationen laufen **täglich 08:00 / 08:05 Europe/Zurich** und suchen Aufträge mit `Auto-Fakturierung fällig=1`; nur wiederkehrende beziehungsweise einmalige Abrechnungsmodelle. Für die Fixture `Abrechnungsmodell=Individuell`, `Status=Pausiert`, **kein Fakturierungstermin** und CHF-Entgelte 0.
- Die übrigen aktiven Trigger betreffen Website-Leads, Rechnungsstatus oder Projektaufgaben; wir erstellen **keinen** Website-Lead und keine Projektaufgabe. Keine direkte aktive Airtable-Automation wird von der `Kunden-Onboarding`- oder `Kunden`-Tabelle getriggert. Änderungen an Triggern unmittelbar vor einem echten Live-Test erneut lesen.

Make wurde ebenfalls live read-only geprüft: Organisation `LZSH AUTOMATIONS`, Team `My Team`; **zwei aktive** Szenarien (`Integration Apple iOS`, `MG - Delete`) ohne Airtable-App und sieben spezifische LSZH-Make-Onboarding-Szenarien (inkl. `7777695`, `7963278`, `7963329`, `7963343`, `7936546`, `7835639`, `7936151`) **inaktiv**. Die Verbindung im alten Onboarding-Szenario ist technisch OK, aber die produktive E-Mail-Sperre bleibt bestehen. **Kein** Szenario ausgeführt oder geändert.

**Neuer Live-Testentwurf ohne Cloud-Veränderungen:** [LSZH_AIRTABLE_E2E_FIXTURE_SAFETY_PLAN_20261017.md](./LSZH_AIRTABLE_E2E_FIXTURE_SAFETY_PLAN_20261017.md) beschreibt drei *später* anzulegende ausschliesslich synthetische CRM-Records (Kunde, Auftrag, Onboarding) mit `example.invalid`-Kontaktfeldern, zufälligem einmaligen `ob_<UUID4>`-Token, sicheren Leistungs-/Status-/Fakturierungswerten, exakten Verknüpfungen und kontrolliertem Cleanup. Das bisherige all-zero-Offline-Token ist als echter Link-Token ausdrücklich **verboten**. Der neue Code `synthetic-crm-fixture-gate.js` validiert diesen fixierten Datensatzumschlag vollständig **offline**; der Test lehnt Rechnungsdatum, realistische Empfänger, Automation-Projekt-Typ, Make-Einladungsbestätigung und unerwartete Felder ab. Code enthält **keine** Airtable-Schreiboperation.

**Wichtiger Gate:** Trotz der sorgfältigen Feldwahl garantiert nichts, dass ein gemeinsames, bereits aktives Website-CRM keinerlei weitere Trigger hat. **Bis auf ausdrückliche zusätzliche Genehmigung KEINE CRM-Fixture erstellen, keine Airtable-/Make-Automationen deaktivieren, keine E-Mails senden und den Cloud-Run-Outbox-Dienst nicht aktivieren.** Ein erfolgreiches Eingangsformular ist weiterhin kein vollständig abgeschlossenes Kunden-Onboarding.

## UPDATE 17.10.2026 – Automationstrigger vor echter synthetischer Airtable-Fixture geprüft

**Reine Metadaten-Leseprüfung mit verbundenen Apps:**
- `LSZH Automations – Website CRM`: **9 Airtable-Automationen**, davon **8 deployed/aktiv**. Die aktive `LSZH Projekte – Standard-Onboarding` erzeugt bei erfüllten Auftragsbedingungen automatisch mehrere Projektaufgaben und setzt Statusfelder. Die ebenfalls aktiven `LSZH Projekte – Abschluss & Betreuung` und `LSZH Betreuung – Folgecheck anlegen` können Folgeaufgaben auslösen; zwei weitere aktive Automationen betreffen die Fakturierung. Sie wurden **nicht** verändert.
- Make-Organisation `LZSH AUTOMATIONS` (verbundenes Team): Aktuell **2 aktive Szenarien**, keines davon das LSZH-Onboarding oder ein Airtable-Onboarding-Trigger. Sieben Szenarien mit `Onboarding` im Namen sind `inactive`, darunter `LSZH Kunden-Onboarding – Eingang` (`7777695`) und Make-Einrichtungs-/Folgecheck-Szenarien. Kein Szenario gestartet oder aktiviert.
- Ein gefilterter Airtable-Read auf den explizit fiktiven Projektcode `ob_00000000-0000-4000-8000-000000000000` ergab 0 Onboarding-Records. Der vollverbundene Test bleibt noch offen.

**Sicherheitsentscheid:** Keine künstlichen Kunden-/Auftrags-/Onboarding-Datensätze in der gemeinsam genutzten Website-CRM-Basis ohne gezielte Prüfung der aktiven Airtable-Trigger und eventueller automatischer Kettenreaktionen. Keine pauschalen Abschaltungen oder Änderungen am CRM. Für eine risikoarme fortgesetzte Staging-Integration zuerst ein isoliertes Testdatenkonzept ausarbeiten; nur mit separater Zustimmung erstellen/ausführen. Die Offline-E2E-Suite läuft erfolgreich über die echten Kernfunktionen (82/82 JavaScript-Tests plus 8/8 IAM). Verweis: [LSZH_ONBOARDING_OUTBOX_E2E_20261017.md](./LSZH_ONBOARDING_OUTBOX_E2E_20261017.md).

## UPDATE 17.10.2026 – Onboarding→Outbox Offline-End-to-End bestanden; reale CRM-Fixture fehlt

Fortsetzung nach vollständig abgeschlossenem Firestore-Lese-/Schreib-/Löschtest. Über den verbundenen Airtable-Zugang wurde die **tatsächliche Tabellen-/Feldstruktur ohne Kundendatenänderungen** geprüft. Die Basis `LSZH Automations – Website CRM` (`appzJiskpAdaR1HEv`) enthält die vier vom bestehenden `onboarding/confirmation.js` benötigten Tabellen `Kunden-Onboarding`, `Aufträge`, `Kunden`, `Projektaufgaben` mit den geprüften Feldern, Links und Auswahlwerten (einschliesslich `Eingegangen`/`Vollständig`, `Sensible Daten`, `AVV erforderlich=Prüfen`, Make-Statusfeldern). Die technisch referenzierten Spalten stimmen mit der Live-Metadatenstruktur überein.

**Sieben zusätzliche synthetische End-to-End-Testfälle** nutzen den bestehenden HTTP-Server, reale `listCandidateCodes`, `reconcile`, `verifyOnboardingState` und die echte Firestore-`createOnce`-Logik mit lokal abgefangenen Airtable-/Firestore-Antworten. Geprüft wurden vollständige Verknüpfung mit einem nicht sendbaren Draft, erneuter Aufruf mit idempotentem 409/GET, fehlende DSG-Aufgabe, Rechnungsdaten-Widerspruch, Doppelbelegung des Projektcodes, Airtable 401 und abgeschalteter/Falsch-Secret-Zugriff. GitHub CI meldet `82/82` JavaScript- und `8/8` separate IAM-Tests erfolgreich, **ohne** Cloud-Deployment oder Änderung echter Kundendaten. Neue Datei: `workers/onboarding-notifications/onboarding-e2e.synthetic.test.mjs`. Detaillierte Prüfmatrix: [LSZH_ONBOARDING_OUTBOX_E2E_20261017.md](./LSZH_ONBOARDING_OUTBOX_E2E_20261017.md).

**Live-Fixture-Existenz:** Eine gezielt auf den festen synthetischen Projektcode `ob_00000000-0000-4000-8000-000000000000` begrenzte Airtable-**Leseabfrage** der Onboarding-Tabelle ergab exakt **0 Datensätze**. Damit ist ein durchgängiger, real verbundener Airtable→Cloud-Run→Firestore-Test **noch NICHT durchgeführt**; diese Aussage nicht mit dem erfolgreichen Offline-Test oder dem separaten Firestore-Google-Cloud-Test verwechseln.

**Sicherer nächster Entscheidungspunkt:** Bevor wir eine echte Test-Fixture im gemeinsamen Website-CRM schreiben, müssen die dadurch möglicherweise ausgelösten Airtable-/Make-Automationen und Nebeneffekte gezielt geprüft werden. Keine neuen Testkunden im Live-CRM, keine Einladungen, keine externen E-Mails, keine Aktivierung des deaktivierten Cloud-Run-Outbox-Dienstes ohne separate ausdrückliche Freigabe. Make-Mitgliedseinladungen bleiben bislang nur kundenseitige Statusangaben, keine verifizierte Berechtigung.

## Bestätigter Abschluss 17.10.2026 – Firestore-Outbox-STAGING Lese- UND Schreibpfad bestanden

**Echter Cloud-Run-Nachweis aus den vom Geschäftsführer kontrollierten Execution-Logs** am 16.10.2026, 22:20:11 (UTC), für die genau einmal ausgeführte Cloud-Run-Execution `lszh-firestore-write-probe-staging-cb7mm` im Projekt `lszh-automations`, Region `europe-west6`, benannte Firestore-Datenbank `lszh-offers-staging`, eigenes Staging-Dienstkonto:

```text
PASS: Fixed synthetic STAGING document was absent before the write.
PASS: Actual outbox createOnce persisted one test-only, send-disabled draft.
PASS: Created draft read back with exact testOnly=true and delivery=false fields.
PASS: Test fixture deleted with a version precondition.
PASS: Test fixture removal verified (HTTP 404).
PASS: Outbox Firestore synthetic WRITE/READ/DELETE cycle completed.
No Airtable calls, emails, customer records or credentials logged.
```

**Technischer Befund: BESTANDEN.** Die echte `createFirestoreStore().createOnce()`-Implementierung konnte mit der Laufzeit-Dienstidentität ein **festes, fiktives Testdokument** in `lszh_onboarding_notification_drafts_staging` anlegen, als `DRAFT_NOT_SENT` mit `testOnly=true`, `deliveryEnabled=false`, `emailSent=false` vollständig zurücklesen, über die aktuelle `updateTime`-Versionsbedingung löschen und die Abwesenheit mit einem abschliessenden HTTP 404 bestätigen. Das synthetische Dokument ist nach dieser Abfrage nicht mehr vorhanden. Weitere Cloud-Firestore-Testarbeiten sind für diese eng umrissene Speicherfunktion **nicht nötig**. Den Einmal-Job **nicht nochmals starten**.

Bereits zuvor separat erfolgreich: Firestore-Metadaten-GET 200, absichtlich fehlendes Staging-Testdokument GET 404 durch dieselbe Cloud-Run-Identität; Cloud-Run-HTTP-Outbox-Service `lszh-onboarding-outbox-staging` meldete authentifiziert `enabled=false`; ein anonymer `GET /health` wurde nachweislich mit HTTP **403** verweigert. Es wurden keine Benutzer-Token-Creator-Rechte ergänzt, keine JSON-Schlüssel genutzt und keine produktiven E-Mails, Make-Szenarien, Airtable-Kundendaten oder Vertragsannahmen aktiviert.

**Weiterhin ausdrücklich OFFEN:** Der eigentliche Airtable→Onboarding-Verifikations→Outbox-End-to-End-Lauf wurde **nicht** live geprüft, und der bestehende Cloud-Run-HTTP-Dienst bleibt mit `LSZH_OUTBOX_STAGE_ENABLED=false` und ohne Airtable-Zugangsdaten, Fixture-Codes oder Scheduler gesperrt. Auch rechtliche RC1-/AVV-Freigaben, produktive Vertragsannahme/Archivierungsfreigabe, echtes Kunden-Onboarding, Versandpfad und allfällige vererbte IAM-Rechte sind nicht durch diesen synthetischen Speichertest abgedeckt. Der Code liegt weiterhin im nicht gemergten Draft-PR #8 (auf Draft-PR #7 aufbauend).

**Empfohlene nächste Arbeit:** Nicht noch einen Firestore-Probejob bauen. Stattdessen den gesamten bislang nur offline getesteten **Onboarding-Zustandsprüfpfad** für einen ausdrücklich synthetischen Airtable-Fall vorbereiten und über die App-/GitHub-Verbindungen lesend prüfen; keine produktiven Daten ändern und den Outbox-Dienst ohne ausdrückliche Freigabe nicht aktivieren. Ergebnisse fortlaufend hier festhalten.

## Update 17.10.2026 – Erster synthetischer Firestore-Schreibtest Cloud Run JOB: 1/1 erfolgreich, Logs noch offen

**Vom Geschäftsführer ausdrücklich in Cloud Shell ausgeführt:** `staging-firestore-write-job.sh --execute-once`, nachdem ein neuer, isolierter, nicht automatisch gestarteter Staging-Job angelegt worden war. Die vorangestellte Sicherheitskontrolle meldete `PASS: reviewed image, only test env vars, dedicated identity, task=1, retries=0.` Die eine Cloud-Run-Execution `lszh-firestore-write-probe-staging-cb7mm` wurde in `europe-west6` mit `1 / 1 complete` und `Execution [...] has successfully completed` beendet. Gepinntes Container-Image: `europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-firestore-write-probe:staging-a20757439a34`. Keine automatischen Retries, keine Änderung bestehender HTTP-Services/IAM/Make/E-Mail-Szenarien.

**Prüfstand:** Der Job-Exit-Code 0 ist ein starkes Indiz für den erfolgreichen vorgesehenen Zyklus (GET auf fehlende fixe synthetische ID, `createOnce` via echter Outbox-Firestore-Routine, strikte Readback-Prüfung, bedingtes DELETE, GET erwartet 404). **Noch nicht anhand der separaten Ausführungslogs einzeln bestätigt** sind alle PASS-Zeilen und damit die endgültige Bestätigung der Bereinigung. Nicht behaupten, dass Cleanup bereits anhand von Logdaten nachgewiesen sei. Als nächster *rein lesender* Schritt gezielt die Logs **dieser** Execution abrufen:

```bash
gcloud beta run jobs executions logs read lszh-firestore-write-probe-staging-cb7mm \
  --project=lszh-automations --region=europe-west6 --limit=50
```

Bei `PASS: Test fixture removal verified (HTTP 404).` und `PASS: Outbox Firestore synthetic WRITE/READ/DELETE cycle completed.` zusammen mit vorangegangenen Create/Readback/Cleanup-PASS als durchgängig verifiziert markieren. **Job keinesfalls erneut ausführen**; Skript verhindert einen Zweitlauf. Bei fehlenden PASS/unerwarteten Fehlern nur read-only analysieren, vor jeglicher manueller Bereinigung ausdrücklich entscheiden. Bestehender Outbox-HTTP-Dienst bleibt weiterhin `enabled=false`; produktiver Versand und Verträge nicht aktiviert.

## Update 17.10.2026 – Synthetischer Firestore-Schreibprobe-Job erfolgreich angelegt, nicht ausgeführt

Bestätigt durch Geschäftskonto/Cloud Shell: `staging-firestore-write-job.sh --create-only` lief erfolgreich, Google Cloud meldet `Job [lszh-firestore-write-probe-staging] has successfully been created` in `europe-west6`. Geplantes Container-Image: `europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-firestore-write-probe:staging-a20757439a34` (zuvor bereits Cloud Build SUCCESS). Das Skript bestätigte `PASS: New STAGING write-probe Job CREATED; NOT EXECUTED.`. Es hat damit bislang **noch keinen** Firestore-Testdatensatz geschrieben, gelesen oder gelöscht, keine Scheduler eingerichtet, keine IAM-Rollen geändert und keine E-Mails verschickt. Der ursprüngliche Cloud-Run-HTTP-Outbox-Dienst bleibt weiterhin deaktiviert (`enabled=false`).

**Nächster expliziter Gate:** `cd ~/lszh-outbox-review && git pull --ff-only && bash workers/onboarding-notifications/staging-firestore-write-job.sh --execute-once`. Dieser Modus muss vorher prüfen, dass es **keine frühere Execution** des neuen Jobs gibt, dass Image und Dienstidentität exakt stimmen, dass die Umgebungswerte nur den synthetischen Test mit deaktiviertem Outbox-HTTP-Dienst betreffen, sowie `taskCount=1` und `maxRetries=0`. Er startet maximal einmal den bewusst auf eine künstliche `recZZZZZZZZZZZZZZ`-ID begrenzten Test: vorheriges GET 404, echte Outbox-`createOnce`-Routine, strikte GET-Feldprüfung, versionsbedingte DELETE-Anfrage und erneutes GET 404. **Bei Fehlern nicht wiederholen und etwaige synthetische Restfixture zuerst separat überprüfen.** Das Ausführen verursacht reale synthetische Schreib-/Löschoperationen und ist von der vorausgegangenen Job-Erstellung unabhängig.

Die tatsächliche Firestore-Schreibberechtigung und die erfolgreiche Bereinigung sind aktuell **noch nicht verifiziert**; erst nach Ausführungs- und Container-Lognachweis als PASS markieren. Weiterhin keine produktiven Onboarding-, Vertragsannahme- oder Versandfreigaben.

## Update 17.10.2026 – Synthetisches Firestore-Schreibprobe-Image gebaut, Job noch nicht angelegt

Der Geschäftsführer hat den Build `bash workers/onboarding-notifications/staging-firestore-write-job.sh --build-only` erfolgreich in Google Cloud Shell ausgeführt. Cloud Build `59efd378-075e-4a53-8bc3-e72de99a5551` meldete **SUCCESS** (12 Sekunden, nur sechs explizit erlaubte Quelldateien). Das Image ist in der bestehenden Zürcher Artifact Registry gespeichert:
`europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-firestore-write-probe:staging-a20757439a34`.
Prüf-Basis: GitHub-Review-Branch `feature/onboarding-notification-outbox-20261016`, Runtime-/Dockerfile-Quellstand `a20757439a34`, mit korrigierter Firestore-RFC3339-Zeitstempel-Normalisierung.

**Nachweisliche Grenzen:** `PASS: Isolated synthetic probe image pushed; no job deployed/executed.` Es wurde kein Firestore-Dokument geschrieben oder gelöscht. Der Schreibprobe-Job `lszh-firestore-write-probe-staging` wurde noch nicht erstellt. Der bestehende Cloud-Run-HTTP-Outbox-Dienst `lszh-onboarding-outbox-staging` bleibt deaktiviert, ohne Airtable-/E-Mail-/Scheduler-Funktionen. Kein neues IAM gewährt.

**Nächster strikt getrennter Schritt:** Beim User ausschliesslich `bash workers/onboarding-notifications/staging-firestore-write-job.sh --create-only` auf dem bereits synchronisierten Branch; erzeugt maximal den **neuen**, nicht automatisch ausgeführten Testjob (1 Task, 0 Retries, 512 MiB). Bei `STOP` nicht umgehen. Erst danach nach separater bewusster Freigabe `--execute-once` und die tatsächlichen Cloud-Run-Logs prüfen. Der Test kann für genau eine fiktive Fixture Firestore-Create/Read/Conditional-Delete durchführen; es entstehen mögliche Cloud-Kosten. Das Image ist bereits gebaut, deshalb **kein erneuter `--build-only`-Aufruf**.

## Update 17.10.2026 – Firestore-Schreibprobe vor Container-Build um RFC3339-Normalisierung ergänzt

Der Geschäftsführer führte `staging-firestore-write-job.sh` erfolgreich im Modus `PLAN ONLY` aus: richtiges LSZH-Konto, benannte Zürcher Staging-Datenbank, eigenes Dienstkonto, kein bereits existierender Write-Probe-Job; es erfolgten weder Cloud-Build/Deployment noch Firestore-Operationen. Im anschliessenden Code-Review wurde eine **potenzielle Live-Falschfehlermeldung** entdeckt: Die echte Firestore-REST-API Z-normalisiert Zeitstempel beim Lesen (gesendet `.000Z`, zurückgeliefert unter Umständen `Z` oder `.000000Z`). Das vormals strikte Gleichsetzen aller JSON-Timestamp-Strings hätte nach erfolgreichem Schreibversuch einen unberechtigten Abbruch und ein stehen gebliebenes synthetisches Dokument verursachen können. **Vor dem ersten Build behoben:** Der Test akzeptiert nur 0/3/6/9 Nachkommastellen mit exakt null für den fest verankerten Testzeitpunkt; zusätzliche oder veränderte Mikrosekunden werden abgewiesen, alle anderen Felder strikt geprüft; DELETE weiterhin nur nach erfolgreicher Prüfung per `currentDocument.updateTime`-Precondition. Synthetische Offline-Testfälle umfassen die Firestore-Normalisierung und ablehnende Fehlerpfade.

Der geplante Container ist nun quellengebunden an den neuen Commit `a20757439a34`; bei späteren Änderungen der sechs Runtime-/Build-Dateien verweigert das Skript die Wiederverwendung des Image-Tags. **Nicht deployed, keine produktiven Daten angefasst, noch kein Schreibrecht live nachgewiesen.** Nächster Schritt nach Git-Pull erneut nur Preflight `staging-firestore-write-job.sh` (PLAN ONLY), danach separat ggf. Build-only. Bestehender Outbox-HTTP-Dienst bleibt deaktiviert; anonymer HTTP-Zugriff bereits mit 403 abgewiesen.

## AKTUELLER STAND – 17.10.2026: Cloud-Run-Outbox auch für anonymen Zugriff gesperrt; synthetischer Schreibtest OFFLINE vorbereitet

**Neue tatsächliche Gesundheitsprüfung vom Geschäftsführer:** `staging-health-check.sh` meldet
`PASS: Cloud Run name, identity, ingress and disabled no-secret runtime environment`;
`PASS: No allUsers/allAuthenticatedUsers entries in service IAM policy`;
`PASS: Anonymous caller rejected with HTTP 403`;
`PASS: Authenticated health returned enabled=false`;
und `PASS: Disabled private STAGING health check`.
Damit ist die Ablehnung des anonymen Aufrufs **am echten Cloud-Run-HTTP-Endpoint** zusätzlich zu den direkten IAM-Bindings nachgewiesen. Der Dienst `lszh-onboarding-outbox-staging` bleibt deaktiviert und verwendet weiterhin keine Airtable-Credentials, Fixture-Codes, E-Mail-Dienste oder Scheduler. Geerbte IAM-Zugriffsrechte wurden dadurch nicht formal vollständig auditiert.

**Neu nur im ungemergten PR #8 vorbereitet:** Der streng begrenzte synthetische Firestore-Schreibtest `firestore-write-probe.js` verwendet exakt die **vorhandene** Outbox-`createFirestoreStore().createOnce()`-Schreibroutine und `makeDraft()` für den ausdrücklich fiktiven Datensatz `recZZZZZZZZZZZZZZ`. Er verweigert einen bereits vorhandenen Dokumentpfad; legt maximal **ein** synthetisches `DRAFT_NOT_SENT`-Dokument mit `testOnly=true`, `deliveryEnabled=false`, `emailSent=false` in der vorhandenen dedizierten Staging-Collection an; liest das exakte Dokument samt Flags zurück; löscht es nur per Firestore-REST-`currentDocument.updateTime`-Precondition und prüft danach HTTP 404. Bei unbekannten Daten oder unpassenden Werten **keine** Löschung; bei Teilausfall kann das synthetische Dokument zur manuellen Nachkontrolle bestehen bleiben. Kein Airtable-/Make-/E-Mail-Zugriff oder Kundenrecord. Separates Minimal-Dockerfile und offline Mock-Tests; kein Aufruf oder Änderung an bestehenden Cloud-Run-HTTP-Diensten. Die noch nicht live gebaute/ausgeführte Probe verlangt neben den festen Datenbank- und Identitätswerten ausdrücklich `LSZH_SYNTHETIC_WRITE_PROBE_ONLY=true` und `LSZH_OUTBOX_STAGE_ENABLED=false`.

`staging-firestore-write-job.sh` sieht vier getrennte bewusst auszuführende Schritte vor: zuerst ausschliesslich `--plan` (read-only), danach optional `--build-only` (Image), `--create-only` (neuer Job ohne Execution) und zuletzt **nach ausdrücklicher Genehmigung** `--execute-once`. Das Skript bindet das Image an den überprüften Source-Commit, blockiert Job-Überschreibungen, verlangt 1 Task/0 Retries/512 MiB und verweigert einen zweiten Lauf auch nach fehlgeschlagener Ausführung. Es baut/deployt/startet **nichts automatisch**. Die Firestore-Leserechte sind bereits real geprüft; die Schreibrechte weiterhin **UNGETESTET**.

**Empfohlener nächster Schritt:** Im Geschäfts-Cloud-Shell-Checkout `git pull --ff-only`, anschliessend **nur** `bash workers/onboarding-notifications/staging-firestore-write-job.sh` (kein Cloud-Write). Vor späterem Live-Test synthetischen Schreibzugriff und mögliche Restfixture-Bereinigung ausdrücklich freigeben. Kein produktiver Versand/Vertragsabschluss/Deploy.

## AKTUELLER STAND – 17.10.2026: Firestore-REST-LESERECHTE NACHGEWIESEN (STAGING)

**Bestätigtes Ergebnis:** Der Geschäftsführer hat die Logs der am 16.10.2026 einmalig abgeschlossenen Cloud-Run-Jobausführung `lszh-firestore-read-probe-staging-s76jq` (Region Zürich, `europe-west6`) ausgelesen. Die relevanten Logzeilen lauteten:

```text
2026-10-16 22:01:33 PASS: Named Zurich STAGING Firestore metadata GET 200.
2026-10-16 22:01:33 PASS: Missing, fixed synthetic document GET 404.
2026-10-16 22:01:33 PASS: Cloud Run service identity effective Firestore READ probe successful.
2026-10-16 22:01:33 NO document body, personal data, token, customer info, write or email operation.
```

Damit sind **die technische Erreichbarkeit der benannten Firestore-Staging-Datenbank und die effektive Leseoperation mit der dedizierten Google-Cloud-Run-Dienstidentität** erstmals real belegt, **ohne** Token-Creator-Berechtigungen für den Cloud-Shell-Benutzer, Dienstkontoschlüssel oder separate Service-Credentials. Die Dokumentenabfrage betraf ausschliesslich eine **absichtlich nicht existente** synthetische Dokument-ID und bestätigte HTTP 404; die Probe hat keine vorhandenen Datensatzinhalte geladen.

**Weiterhin bewusst offen / nicht bewiesen:** Firestore-Schreibrechte (`createDocument`) sowie End-to-End-Airtable-/Outbox-Verarbeitung, produktiver Vertrags-/Rechnungs-/E-Mail-Versand, rechtliche RC1/AVV-Freigaben und übergeordnete IAM-Zugriffe. Es fand **kein** Schreibtest statt. Bestehender Cloud-Run-HTTP-Outbox-Dienst `lszh-onboarding-outbox-staging` ist weiterhin gesperrt: `LSZH_OUTBOX_STAGE_ENABLED=false`, keine Credentials/Fixture-Codes/Scheduler. Ein Service-Health-Test mit IAM wurde bereits bestanden; der später ergänzte anonyme HTTP-401/403-Gegencheck ist **noch ohne bestätigte Nutzerausgabe**.

**Sicherer nächster Schritt:** Ausschliesslich die erweiterte `staging-health-check.sh` mit Prüfung auf verweigerten anonymen Zugriff durchführen (kein POST, keine Datenbank, keine Änderungen). Erst danach separat einen exakt begrenzten synthetischen Firestore-Schreibtest vorbereiten, vor dessen Durchführung ausdrücklich die Ziel-Collection, den Testinhalt, die Idempotenz und Bereinigung festlegen. Der erfolgreiche Read-Job soll **nicht nochmals ausgeführt** werden. Vorhandene STAGING-Services niemals überschreiben oder aktivieren, ohne erneute manuelle Entscheidung.

## Nachtrag 16./17.10.2026 – Firestore-Leseprobe-Job einmalig erfolgreich abgeschlossen; Logs noch zu verifizieren

Der Geschäftsführer führte **ausdrücklich** den separat gesicherten `staging-firestore-job.sh --execute-once` in Cloud Shell aus. Der Sicherungscheck bestätigte `PASS: Job pinned to reviewed image, exact service identity and fixed read-only config.` Danach wurde die **eine** Cloud-Run-Jobausführung `lszh-firestore-read-probe-staging-s76jq` in `europe-west6` gestartet und von Google Cloud mit `1 / 1 complete` und `Execution [...] has successfully completed` abgeschlossen. Genaue Container-Version weiterhin `lszh-firestore-read-probe:staging-49297f5b6cb0`; es gab **keine automatische Wiederholung**. Der separate HTTP-Outbox-Staging-Dienst bleibt mit `LSZH_OUTBOX_STAGE_ENABLED=false` deaktiviert; keine produktiven E-Mails, keine Änderungen an Airtable/Firestore-Daten oder IAM-Rollen vorgesehen.

**Noch nicht unabhängig anhand der Container-Logs nachgewiesen:** Ob beide beabsichtigten Firestore-REST-GETs exakt `PASS: Named Zurich STAGING Firestore metadata GET 200.` und `PASS: Missing, fixed synthetic document GET 404.` protokollierten. Die erfolgreich abgeschlossene Jobausführung ist ein starkes Indiz, aber die Bestätigung soll über die Logs der **konkreten** Execution erfolgen. Nächster Schritt ausschliesslich lesend:

```bash
gcloud beta run jobs executions logs read lszh-firestore-read-probe-staging-s76jq \
  --project=lszh-automations --region=europe-west6 --limit=50
```

Die Antwort soll genau drei erwartete PASS-Zeilen zum benannten Datenbank- und fehlenden Dokumentzugriff zeigen. **Job nicht wiederholen**, bevor die konkreten Logs geprüft sind. Danach kann der read-only Firestore-IAM-Nachweis als bestanden dokumentiert werden; Schreibzugriff ist separat ungetestet.

## Nachtrag 16.10.2026 – Firestore-Leseprobe-Job erfolgreich erstellt (NOCH NICHT AUSGEFÜHRT)

Der Geschäftsführer hat nach Behebung des Cloud-Run-Gen2-Mindestwerts von 512 MiB RAM die Aktion `staging-firestore-job.sh --create-only` erfolgreich im LSZH-Geschäftskonto ausgeführt. Google Cloud bestätigt `Job [lszh-firestore-read-probe-staging] has successfully been created` in `europe-west6`, mit unverändert wiederverwendetem, zuvor gebauten Image `europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-firestore-read-probe:staging-49297f5b6cb0`. Das Tool meldet ausdrücklich: `PASS: New Cloud Run Job CREATED but NOT EXECUTED. No Firestore traffic.` Keine Scheduler, Schlüssel, Kunden- oder Firestore-Datenoperationen; der separate bestehende Outbox-HTTP-Dienst bleibt mit `enabled=false` deaktiviert.

**Nächster Gate:** Der `--execute-once`-Modus muss vor einer einzigen Ausführung die vorhandene Job-Spezifikation (Image-Tag, Laufzeit-Dienstkonto, ausschliesslich drei festgelegte Umgebungsvariablen, ein Task, null Retries) lesen und gegen die fest codierten Sicherheitswerte prüfen. Erst nach ausdrücklicher Aktion darf er `gcloud run jobs execute ... --wait` aufrufen. Dieser einmalige Job bezieht Tokens ausschliesslich von seiner Cloud-Run-Dienstidentität und führt nur zwei feste Firestore-GET-Abfragen aus (benannte DB-Metadaten und absichtlich fehlender synthetischer Dokumentpfad); keine Writes oder E-Mails. Der Erfolg dieser tatsächlichen Leseprobe ist noch **nicht bestätigt**. Bei unerwarteter Job-Konfiguration abbrechen, nicht ungeprüft neu deployen/ausführen.

## Nachtrag 16.10.2026 – Cloud Run Job Speichergrenze korrigiert

Der vom Geschäftsführer gestartete `staging-firestore-job.sh --create-only` ist beim Google-Cloud-Deploy wegen **256 MiB RAM mit 1 vCPU in Cloud Run Gen2** abgewiesen worden (Cloud Run Job verlangt mindestens 512 MiB). Die Ausgabe `Job failed to deploy` zeigt **keinen erfolgreichen Job-Deploy**; es erfolgte auch **keine Jobausführung, keine Firestore-Abfrage, keine Kundenmail**. Andere Cloud-Run-Dienste unverändert.

Korrektur ausschliesslich im Entwicklungsbranch: `--memory=512Mi`; der bestehende **erfolgreich gebaute** Container `lszh-firestore-read-probe:staging-49297f5b6cb0` wird absichtlich wiederverwendet, ohne Image-Rebuild. Das Job-Skript prüft dazu, dass Container-Code, Dockerfile und Cloud-Build-Definition seit dem Original-Build unverändert sind. Es verweigert weiterhin Überschreiben vorhandener Jobs und automatische Ausführung. Neue synthetische Tests prüfen die Cloud-Run-Gen2-Grenze und Image-Tag-Pinning. **Nächste userseitige Aktion: nach Pull rein lesendes `staging-firestore-job.sh`-Preflight**, dann ausdrücklich `--create-only` bei Erfolg. Bei unerwartet doch existierendem Job vor jeder Änderung stoppen.

## Nachtrag 16.10.2026 – Ursache des abgebrochenen Impersonations-Tests eingegrenzt; Cloud-Run-Job vorbereitet

Geschäftskonto bestätigte lesend mit `staging-impersonation-diagnostics.sh`: `iamcredentials.googleapis.com` ist **aktiv**. Für `lars@lszh-automations.ch` ist weder direkt am einzelnen Outbox-Dienstkonto noch direkt am Projekt eine `roles/iam.serviceAccountTokenCreator`-Bindung vorhanden. Die Prüfung beweist nicht, ob Gruppen-/Custom-/vererbte Berechtigungen existieren. Die vorherige Impersonation war `UNVERIFIED`, ohne dass Firestore auch nur einen Request erhalten hat. **Keine** neuen Rollen anlegen.

Technisch vorbereitet ist nun der ausschliesslich lesende, eigenständige Cloud-Run-Job `lszh-firestore-read-probe-staging`: `staging-firestore-job.sh` teilt die Aktion in **vier explizite** Modi – nur `--plan` (keine Änderungen), nur `--build-only` (3-Dateien-Container bauen), nur `--create-only` (Job ohne Ausführung anlegen), `--execute-once` (erst nach striktem Image-/Dienstkonto-/Umgebungsabgleich eine einzelne Ausführung ohne Retries). Der Job verwendet die vorhandene Dienstkontoidentität direkt aus dem Cloud-Run-Metadatenserver; er liest **nur** Datenbank-Metadaten sowie einen fest codierten nicht existierenden Test-Dokumentpfad und loggt nur PASS/FAIL, keine Daten/Kundencodes/Tokens. Offline-/Mock-Tests und GitHub CI sichern die Zwischenstufen. Cloud Run Jobs unterstützen ausdrücklich die konfigurierte Runtime-Serviceidentität und eine `execute`-Aktion mit `--wait` (Google-Cloud-Dokumentation geprüft). Bestehender Outbox-HTTP-Service bleibt unverändert und `enabled=false`.

**Wichtig:** Bis jetzt ist **kein** Probe-Image gepusht, **kein** Job angelegt oder ausgeführt. Zuerst nur `cd ~/lszh-outbox-review && git pull --ff-only && bash workers/onboarding-notifications/staging-firestore-job.sh` ausführen, erwartetes `PLAN ONLY`. Spätere Build-/Create-/Execute-Schritte können Cloud-Kosten auslösen und benötigen jeweils separate bewusste Ausführung. Keine Kundendaten oder produktiven E-Mails.

## Nachtrag 16.10.2026 – Firestore-Zugriffstest vor IAM-Impersonation gestoppt

Der separate `staging-firestore-read-probe.sh --probe-read`-Lauf wurde vom Geschäftsführer ausdrücklich gestartet. Geschäftskonto, benannte Staging-Datenbank und Ziel-Servicekonto waren bestätigt. Bei der anschliessenden **Benutzer-zu-Servicekonto-Impersonation** stoppte das Skript mit `UNVERIFIED: Could not impersonate dedicated STAGING service account`; es wurden **keine** Firestore-REST-GET-Requests ausgeführt. Das ist **kein** Nachweis einer fehlenden Firestore-Berechtigung des bereits bereitgestellten Cloud-Run-Dienstes. Der deaktivierte Health-Check war zuvor erfolgreich, das beweist jedoch ebenfalls keinen Firestore-Zugriff.

Neues rein lesendes Diagnose-Skript `workers/onboarding-notifications/staging-impersonation-diagnostics.sh`: kontrolliert aktive Geschäftsidentität, IAM-Credentials-API-Aktivierung und **direkte** Token-Creator-Rollen auf Ziel-Servicekonto und Projekt; keine Tokens, keine IAM-Änderungen. Als spätere, alternative sichere Prüfung sind `firestore-runtime-probe.js` + separates minimales `Dockerfile.firestore-probe` entworfen und offline getestet; ein einmaliger Cloud-Run-Job würde über **seine eigene** Service-Identität nur feste Firestore-Metadaten und ein absichtlich fehlendes Testdokument lesen. **Kein Job erstellt, kein neues Image hochgeladen, keine Probe ausgeführt.** Build, Bereitstellung und Test brauchen jeweils gesonderte manuelle Zustimmung. Bestehende Cloud-Run-Revision bleibt deaktiviert, keine Kundendaten, keine produktiven E-Mails.

## Nachtrag 16.10.2026 – Cloud-Run-Healthcheck bestanden, Firestore-Leseprobe vorbereitet

**Durch Geschäftsführer ausgeführter STAGING-Test:** `staging-health-check.sh` bestätigte die erwartete Cloud-Run-Laufzeitidentität, die ausschliesslich deaktivierten/no-secret Umgebungsvariablen, das Fehlen öffentlicher Invoker-Bindings *auf Service-Ebene* und den authentifizierten `GET /health` mit `enabled:false`. Alles PASS. Keine produktiven Onboardings, keine Firestore-Operation, kein Scheduler und kein Mailversand. Geerbte Invoker-Rechte und die tatsächliche Firestore-IAM-Wirksamkeit sind damit weiterhin **nicht** belegt.

Neu vorbereitet auf Draft-Branch/PR #8: `workers/onboarding-notifications/staging-firestore-read-probe.sh`. Ohne Argumente prüft es nur geschäftliche Identität, Datenbank und Servicekonto. Mit **separat manuell** ausgeführtem `--probe-read` versucht es eine kurzlebige Dienstkonto-Impersonation und dann zwei ausschliesslich lesende HTTP-GETs (benannte Firestore-DB-Metadaten: 200; garantiert nicht selbst erstelltes Probe-Dokument in dedizierter Outbox-Collection: erwartetes NOT_FOUND/404); Bodies und Tokens werden nicht ausgegeben. Eine Servicekonto-Impersonation setzt bereits vorhandene `iam.serviceAccounts.getAccessToken`-Berechtigung und ggf. die IAM-Credentials-API voraus. Bei Fehlen **keine** pauschalen Rollen vergeben, sondern den gescheiterten Test dokumentieren und den nächsten isolierten Ansatz abklären. Neue synthetische Tests prüfen beide Modi und Fehlersperren. **Kein neues Cloud-Run-Deployment**, vorhandene Revision weiterhin deaktiviert.

## Nachtrag 16.10.2026 – Outbox Cloud Run STAGING deployed (GESPERT)

**Über das LSZH-Geschäftskonto ausgeführt und durch Cloud-Shell-Erfolgsausgaben bestätigt:** Container-Build `46e3293e-8b9b-44b1-b7ec-34dd330b3e44` am 16.10.2026 um 21:32 UTC `SUCCESS`, 8 allowlist-Quelldateien, Container-Image `europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-onboarding-outbox:staging-4075f23f47b8`. Anschliessend wurde ausschliesslich der **neue** private Cloud-Run-Staging-Dienst `lszh-onboarding-outbox-staging` in `europe-west6` angelegt, Revision `lszh-onboarding-outbox-staging-00001-pz6`, 100% Traffic. Dienst-URL: `https://lszh-onboarding-outbox-staging-470613067122.europe-west6.run.app`. Das Deployment verwendete `--no-allow-unauthenticated`, das dedizierte Outbox-Servicekonto, `LSZH_OUTBOX_STAGE_ENABLED=false`, `FIRESTORE_PROJECT_ID=lszh-automations`, `FIRESTORE_DATABASE_ID=lszh-offers-staging`. **Keine Airtable-Credentials, synthetischen Fixture-Codes, Versand-Secrets oder Cloud Scheduler eingerichtet.** Der Dienst beantwortet nur den Gesundheitscheck; der geschützte `/internal/reconcile` ist technisch gesperrt. **Noch KEIN authentifizierter Live-Healthcheck**; Cloud-Run-IAM-Konfiguration und tatsächliche Firestore-REST-Wirksamkeit ebenfalls noch nicht mit dem laufenden Dienst getestet. **Nicht** `--deploy-disabled` erneut ausführen: Skript verweigert absichtlich das Ändern eines vorhandenen Dienstes.

**Nächste, ausschliesslich lesende Aktion:** `cd ~/lszh-outbox-review && bash workers/onboarding-notifications/staging-health-check.sh`. Der Check validiert nur Identität, deaktivierte Laufzeitvariablen, Service-IAM-Policy und authentifiziertes `GET /health`; erwartetes `enabled:false`. Bei 401/403 die Invoker-Rechte klären, **keine öffentliche Freigabe**. Kein POST, kein Airtable-/Firestore-Zugriff, keine E-Mails. PR #8 und vorgelagerter PR #7 bleiben Draft/ungemergt; Staging-Deployment ist keine produktive Freigabe.

## Nachtrag 16.10.2026 – private Cloud-Run-Staging-Bereitstellung vorbereitet

Der Geschäftsführer hat die *read-only* IAM-Sicherheitsprüfung bestanden: separate Staging-Dienstidentität vorhanden und aktiv; die benannte Firestore-Zürichdatenbank stimmt; exakt ein konditionierter `roles/datastore.user`-Projekt-IAM-Binding für diese Identität; keine weiteren Projektrollen für das Konto; keine nutzerverwalteten privaten Schlüssel. **Noch offen:** Vererbte Rechte und tatsächliche Firestore-REST-Wirksamkeit. Es erfolgte kein Firestore-Lese-/Schreibzugriff.

Im nicht gemergten Outbox-Branch sind danach die **sicher getrennten, ausdrücklich auszuführenden** Cloud-Shell-Schritte ergänzt:
- `workers/onboarding-notifications/staging-service.sh` ohne Argumente: prüft nur die vorhandenen Ressourcen, Geschäftskonto, exakten Git-Commit und Abwesenheit eines existierenden Cloud-Run-Outbox-Diensts (keine Änderungen).
- `--build-only`: nach expliziter Ausführung ausschliesslich die acht für den Worker nötigen Quelldateien über Cloud Build in die vorhandene Zürcher Artifact Registry bauen/hochladen; keine Geheimnisse und kein Deployment.
- `--deploy-disabled`: nach expliziter Ausführung **nur einen neuen** Cloud-Run-Service `lszh-onboarding-outbox-staging` mit separatem Dienstkonto, verpflichtender IAM-Authentisierung, `LSZH_OUTBOX_STAGE_ENABLED=false`, ohne Secrets, Testcodes, Scheduler und Mailtransporte deployen. Ein vorhandener Service wird nie aktualisiert. Es können Cloud-Kosten entstehen.
- `staging-health-check.sh`: liest Konfiguration/Service-IAM und führt nur einen authentifizierten `GET /health` aus; erwartet `enabled=false`, kein Kunden-/Datenbankzugriff.

**Momentaner Zustand:** Nur Code/CI/Dokumentation vorbereitet; **kein** Container-Push, **kein** Cloud-Run-Deployment, **keine** Kundenmails oder Onboarding-Schreibzugriffe. Vor späterer Aktivierung zusätzlich Test-Fixures und Firestore-Rechte isoliert prüfen. Erläuterungen in `workers/onboarding-notifications/README.md`.

## Nachtrag 16.10.2026 – Staging-Dienstidentität vom Geschäftsführer angelegt

Google Cloud Shell hat nach der ausdrücklich ausgeführten Aktion `bash workers/onboarding-notifications/staging-identity-setup.sh --apply` **`Created service account [lszh-onboarding-outbox-staging]`** und **`Updated IAM policy for project [lszh-automations]`** gemeldet. Die Identität ist `lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com`. Die eingerichtete `roles/datastore.user`-Bedingung zielt auf `resource.name=="projects/lszh-automations/databases/lszh-offers-staging"`. Keine Schlüsseldatei, kein Cloud-Run-Deployment, keine Firestore-Datenoperationen und keine Kundenmails.

**Nächster Gate:** Projekt-Policy ist noch keine bewiesene effektive Firestore-Berechtigung. Neu ergänzt: `workers/onboarding-notifications/staging-identity-verify.sh` und `verify_iam_policy.py` für eine rein lesende Prüfung des Konto-/Datenbank-/IAM-Zustands, zusätzlicher Projektrollen und user-managed SA-Keys; synthetische Policy-Tests in CI. Ererbte IAM-Berechtigungen und tatsächliche REST-Lese-/Schreibrechte sind mit diesem Check weiterhin nicht nachgewiesen. Vor Einsatz ausschliesslich synthetischen Staging-End-to-End-Test durch separate private Cloud Run durchführen; produktive Systeme bleiben unverändert.

## Nachtrag 16.10.2026 – Cloud-Shell-Diagnose und sichere Staging-Anpassungen

Die vom Geschäftsführer ausgeführte rein lesende Cloud-Shell-Diagnose bestätigt die **bestehende** Firestore-Native-Datenbank `lszh-offers-staging` in Zürich (`europe-west6`) und das bestehende Container-Repository `cloud-run-source-deploy`. Das zuvor hartkodierte Firestore-Ziel `(default)` war falsch: Eine solche Datenbank existiert hier nicht. Der Outbox-Worker und seine Tests wurden auf die **bestehende benannte Staging-Datenbank** und die separate Test-Collection `lszh_onboarding_notification_drafts_staging` angepasst. Cloud-Build verweist auf das vorhandene Registry-Repository. Somit aktuell **keine zweite Datenbank / kein zweites Registry-Repository nötig**.

Sicherheitskorrektur: Der Test-Worker führt **keine vollständige CRM-Liste** mehr durch, sondern lässt nur 1–3 explizit freigegebene synthetische Codes über `LSZH_STAGING_FIXTURE_CODES` zu. Ein falscher/unbekannter Code führt zum fail-closed Ergebnis. Zusätzlich wird `FIRESTORE_DATABASE_ID=lszh-offers-staging` verlangt; die Firestore-Duplikatprüfung blockiert auch vorhandene Einträge mit abweichendem Versandstatus. Alle Versandfunktionen sind weiterhin nicht implementiert.

**Noch nicht durchgeführt:** eigenes Dienstkonto `lszh-onboarding-outbox-staging` erstellen und nur für die benannte Firestore-Datenbank konditional autorisieren; Private-Cloud-Run-Testinstanz; eigene Airtable-Read-only-Secrets/Scheduler-Freigabe; echter rein synthetischer End-to-End-Lauf. Weil die benannte Datenbank Offerten-Staging enthält, gewährt ein IAM-Recht auf sie technisch auch Zugriff auf deren andere Collections. Nutzung nur für isolierte synthetische Tests; vor Produktionsanbindung separate Datenbank entscheiden. Keine bestehenden Offer-Dienste, Make-Szenarien oder Kundendaten wurden verändert.

Das Opt-in-Skript `workers/onboarding-notifications/staging-identity-setup.sh` ist vorbereitet. Ohne Parameter zeigt es nur eine reine Leseprüfung und den Berechtigungsplan; erst ein vom Geschäftsführer selbst ausgeführtes `--apply` erstellt das eigene Dienstkonto und die auf `lszh-offers-staging` konditionierte Firestore-IAM-Berechtigung. Es erzeugt **keine** Schlüsseldatei, startet keine Cloud-Run-Dienste, schreibt keine Datensätze und versendet nichts.

Einzelheiten: `workers/onboarding-notifications/README.md`.

## Nachtrag 16.10.2026 – dauerhafte Onboarding-Benachrichtigungsentwürfe (nur Code, STAGING)

Auf dem getrennten Branch `feature/onboarding-notification-outbox-20261016` ist ein **privater Cloud-Run-Outbox-Worker** vorbereitet. Er liest mögliche Onboarding-Abschlüsse aus Airtable, verifiziert den gesamten bisherigen Verarbeitungspfad mit der read-only Prüfkomponente und legt erst nach erfolgreich nachgewiesenem technischen Abschluss einen eindeutigen `DRAFT_NOT_SENT`-Eintrag per atomarem Firestore-Create an. Wiederholungen finden denselben Eintrag; Fehler erzeugen weder Erfolgsbehauptung noch Nachricht. Keine Kunden-E-Mail-Adresse und kein Geheimtoken werden gespeichert. Zugriffe sollen künftig über privates Cloud Run, dediziertes Google-Dienstkonto und separates Secret erfolgen. Keine JSON-Schlüsseldateien.

**Status (aktualisiert 16.10.):** Offline-/HTTP-Synthetiktests samt echtem lokalen HTTP-zu-Fake-Airtable-zu-Fake-Firestore-Integrationspfad und separatem Docker-Image-Build in GitHub Actions; kein Cloud-Run-Deployment, kein aktiver Scheduler, kein Firestore-Live-Test, kein produktiver E-Mail-Versand. Read-only Cloud-Shell-Prüfskript `workers/onboarding-notifications/staging-preflight.sh` bereitgestellt. Die Google-Cloud-Voraussetzungen müssen im Geschäftskonto noch tatsächlich geprüft werden. Das originale Make-Szenario `7777695` und dessen `0=1`-Mail-Sperre bleiben unverändert. Ein separater Sender mit Freigabegates und Provider-Deduplikation muss später noch gebaut werden. Branch enthält ausserdem eine öffentliche Static-File-Allowlist des Website-Servers, sodass `/workers/**`, interne Dateien und Dokumentation nicht öffentlich abrufbar sind. Laufende Tests für diese Grenzen.

Betriebs- und technische Einzelheiten: [Outbox-Staging README](../workers/onboarding-notifications/README.md).



## Nachtrag 16.10.2026 – serverseitige Onboarding-Vorgangsbestätigung (Entwicklungsbranch)

**Nur im isolierten Feature-Branch** `feature/onboarding-server-confirmation-20261016`: Das Website-Onboarding prüft nach einem Make-Eingang den technischen Abschluss durch **read-only** Airtable-Nachverifikation (Onboarding, Auftrag, Kundendaten und ggf. Datenschutz-Prüfaufgabe). Neuer `POST /api/onboarding/status`, fail-closed: nur tatsächliche geprüfte Persistenz = `completed`; Make-`Accepted`/200 = kein Erfolgsbeleg; sonst `processing`, `requires_review` oder Ausfall. Das Frontend fragt den Status nach einer unbestätigten Einsendung lesend nach, ohne erneut ein Formular zu senden.

**Wichtiger Unterschied:** Technischer Abschluss der Eingabeverarbeitung bedeutet **nicht** abgeschlossenes Kundenprojekt, geprüften Make-Zugriff oder versandte E-Mail. Tests synthetisch/offline; **keine produktiven Sends, Aktivierungen oder Deploys**, `main` unberührt. Für einen echten Staging-Nachweis wird noch ein auf die Website-CRM-Base begrenzter Airtable-Read-only-PAT als geschütztes Server-Secret benötigt. E-Mail bei späterem Abschluss nach Verlassen der Website ist noch nicht implementiert; separater persistenter Benachrichtigungsprozess erforderlich. Details: [Serverseitige Vorgangsbestätigung](./LSZH_ONBOARDING_VORGANGSBESTAETIGUNG_20261016.md).



_Stand: 13.10.2026. Interne Arbeitsdokumentation. Keine Passwörter, API-Schlüssel oder Token hier eintragen._

## Geschäftsmodell / Eigentümerschaft

- LSZH Automations erbringt Beratung, Entwicklung, Einrichtung, Tests, Dokumentation und optionale Wartung für Schweizer KMU.
- **Kundenbetrieb:** Der Kunde nutzt eine eigene Make-Organisation und behält deren Kontrolle, Abrechnung, Ressourcen und Szenarien. Unser Zugang erfolgt über eine gezielte Einladung mit angemessener Berechtigung.
- Make-Pläne und -Credits werden vom Kunden direkt mit Make abgerechnet. LSZH stellt separat Dienstleistungen und laufende Betreuung in Rechnung.
- Der Erstkontakt und die Offerte setzen keine Registrierung bei Make voraus. Registrierung/Einladung folgen erst nach Annahme.
- Möglichst OAuth/Anbieterfreigaben verwenden. Keine Kundenpasswörter per Mail oder in Airtable abfragen.

## Prozess (verbindliches Zielbild)

1. Anfrage über LSZH-Website: Problem, Unternehmensdaten und Kontakt.
2. Rückfrage/Analyse, Offerte und allfällige vertragliche Vereinbarungen.
3. Annahme der Offerte und ausgelöstes Projekt-Onboarding.
4. Onboarding sammelt Rechnungsdaten, Anforderungen, Systemnamen, Status der kundeneigenen Make-Organisation und Stand der Einladung.
5. LSZH prüft Angaben, Kundenorganisation und benötigte Rollen. Bei Bedarf unterstützt LSZH Registrierung und Einladung.
6. Technische Verbindungen entstehen **in der Make-Organisation des Kunden**, möglichst durch den Kunden selbst mit OAuth.
7. Entwicklung, Funktionstests, Dokumentation, Kundenfreigabe und Go-Live im Kundenkonto.
8. Betrieb/Betreuung über separaten Servicevertrag. Kundeninhaberschaft und Freigaben bleiben erhalten.

## Bereits umgesetzt

- Öffentliche Website mit Kontakt, Leads, Offerten/Rechnungen und persönlichem Kunden-Onboarding (bestehender Prozess beibehalten).
- Formular `/onboarding/`: zusätzlicher Abschnitt **Make & technische Einrichtung** mit optionalem Organisationsnamen und Angaben zu Konto-/Einladungsstatus. Keine Secrets.
- Airtable `Kunden-Onboarding`: Felder **Make-Konto Status**, **Make-Organisation**, **Make-Einladung Status**, **Make-Einrichtung Hinweise**.
- Make `LSZH Kunden-Onboarding – Eingang`: Feldzuordnung auf diese Airtable-Spalten ergänzt.
- Make `LSZH Projekte – Onboarding anfordern`: Einladungsmail nach Offertenannahme erklärt das kundeneigene Make-Modell.
- Bestätigungsmail nach Onboarding: erklärt Organisation, Einladung und nächste Schritte.
- Kundenanleitung `/make-start/` erstellt und im Formular sowie in den E-Mails verlinkt.
- Drei alte Make-OAuth-Szenarien des früheren LSZH-eigenen Kontomodells als **ARCHIV – ALTES MODELL** gekennzeichnet und unverändert inaktiv belassen.
- Secure Transfer funktional mit Dummy-Schlüssel getestet: verschlüsselte Speicherung, einmaliger Abruf, Löschung der gespeicherten verschlüsselten Daten. Noch **nicht** für reale Kundenzugangsdaten freigegeben.

## Status / Sicherheit

- Onboarding-Anforderung und Eingangsszenario bleiben vorerst inaktiv, bis ein vollständiger Test mit einer vereinbarten Testofferte durchgeführt wurde. Keine unaufgeforderten Mails auslösen.
- Die Schlüssellieferung über Secure Transfer darf noch nicht produktiv eingesetzt werden, bis die Make-Webhooks authentifiziert und der parallele Abruf wiederholt getestet wurden.
- Neue Make-Verbindungen müssen gegen die jeweilige Kundenorganisation und deren Rollen geprüft werden. Alte LSZH-eigene OAuth-Automationen nicht reaktivieren.
- Make-Plan und Berechtigungen nach tatsächlichem Kundenbedarf prüfen. Nicht jedes Abonnement bietet identische Team-/Rollenoptionen.

## Nächste Tests

1. Neues Formular im Browser prüfen (Desktop / Mobile).
2. Mit freigegebenem Testprojekt Onboarding durchspielen; vier Make-Felder in Airtable kontrollieren.
3. Versand und Inhalt der zwei Kundenmails testen, bevor bisher inaktive Szenarien wieder aktiviert werden.
4. Einladung in eine vom Kunden verwaltete Testorganisation prüfen, ohne dessen Zugangsdaten einzusehen.
5. Kunden-Szenario dort erstellen, mit kundeneigener Verbindung autorisieren und Test/Übergabe dokumentieren.
6. Secure Transfer erst nach separater Security-Abnahme für Ausnahmen nutzen.

## Betrieb / Quellen

- [Website – Kunden-Onboarding](https://www.lszh-automations.ch/onboarding/)
- [Website – Make-Kundenanleitung](https://www.lszh-automations.ch/make-start/)
- [Make – Organizations](https://help.make.com/organizations)
- [Make – Teams](https://help.make.com/teams)
- [Make – Preise/Funktionen](https://www.make.com/en/pricing)

Letzte Architekturentscheidung: 13.10.2026 – Kunden besitzen ihre eigenen Make-Organisationen.

## Technische Prüfung vom 14.10.2026 – Onboarding-Fortsetzung (STAGING)

- Make-Szenario **7777695**: Kunden-Onboarding bleibt **inaktiv**. Kundenmail-Modul 9 hat unverändert die harte **0=1**-Sperre. Keine echten Einladungen, Vertragsfreigaben oder Kundensendungen.
- Der separate Datenschutz-Zweig (Router 14) läuft vor der erfolgreichen Webhook-Bestätigung; Prüfung bei `sensitive_data = Ja` oder `Unsicher`. Vor einer neuen DSG-Aufgabe erfolgt jetzt eine Airtable-Suche (Modul 15) nach dem stabilen `<Auftrag-ID>-DSG-01`-Schlüssel. Bereits existierende, z. B. erledigte Aufgaben werden nicht auf `Offen` zurückgesetzt.
- Die frühere GET-Dublettenprüfung (Modul 11) wurde durch wiederaufnehmbare Speicherung ersetzt: Modul 4 erzeugt ein Airtable-`performUpsert` mit `fieldsToMergeOn: ["Projektcode"]`. Modul 3 sendet `PATCH`, Modul 6 verknüpft den Datensatz mittels `3.body.records[1].id`; dieselbe ID wird in Modul 12 als Webhook-Beleg ausgegeben.
- **Test 1:** zweimaliges Airtable-Upsert auf bestehenden synthetischen Token `<synthetischer-testtoken-intern>` lieferte `recCTaZaoReFpBqxi` und änderte die Datensatzanzahl nicht (vier).
- **Test 2:** Isoliertes Make-Testscenario **7962957**, zweifacher sequentieller Aufruf: Erfolg, jeweils HTTP 200 und dieselbe Airtable-ID. Zusätzlich **zwei parallel gestartete Testläufe**: beide erfolgreich, HTTP 200, dieselbe ID; nachher weiterhin genau ein zugehöriger Datensatz. Testszenario wieder deaktiviert.
- **Test 3:** Read-only-Make-Testscenario **7962998**: existierende DSG-Aufgabe ergab `rec818rQl70Mf4UsW`, fehlender Aufgabencode ergab keine ID; beide HTTP 200. Existierende Aufgabe blieb auf `Erledigt`. Testscenario danach deaktiviert.
- **Keine Freigabe:** Diese Tests prüfen isolierte Module und einen vorhandenen synthetischen Datensatz. Sie sind **kein** vollständiger Webhook-End-to-End-Test, kein Paralleltest zweier echter erstmaliger Eingänge und keine tatsächlich unterbrochene Gesamtausführung. Wiederholungen mit **abweichenden** Formulardaten würden noch vorhandene Onboarding-Felder überschreiben; diese Geschäftspolitik ist abzuklären oder technisch abzusichern. Ebenfalls testen: Fehler bei Verknüpfung/Rechnungsdaten, Dauerhaftigkeit der Datensätze, Fehlerantwort und Datenschutzprüfung vor HTTP-200.
- Weitere Freigaben: Kundenorganisation und Einladungsberechtigung für `lars@lszh-automations.ch`; Google-Drive-Reautorisierung und separates eingeschränktes Dienstkonto; RC1-Projektbedingungen/AVV; Offerten-, Rechnungs-, Swiss-QR- und Archivtests.

## Technische Freigabeprüfung 14.10.2026 – Wiederholungs-Guard und kompletter On-Demand-Test

**Produktivstatus:** Make-Szenario `7777695` weiterhin **INAKTIV**, E-Mail-Versand durch Modul 9 mit harter `0=1`-Sperre verhindert. Keine Kundenmails, keine echten Einladungen, keine Vertragsfreigaben, keine Aktivierung.

**Neue Schutzlogik im Onboarding:**

1. Vor dem Airtable-Upsert fragt Modul 16 bestehende Onboardings für den Projektcode ab (maximal 2 Treffer).
2. Code-Modul 17 vergleicht den eingereichten Onboarding-Feldsatz mit dem bereits gespeicherten Datensatz, mit Normalisierung leerer Textfelder. Es unterscheidet `new`, `resume`, `conflict` (geänderte Angaben/mehrere Bestandsdatensätze/manuelle Klärung) und `already_complete`.
3. Router 18 leitet **nur** `new` und `resume` auf den Upsert und die restliche Projektverarbeitung weiter. Bei `conflict` sendet Make einen strukturierten Konflikt im JSON mit `duplicate=true` / `error=already_submitted`, den der bestehende Website-Proxy in HTTP 409 übersetzt. Make selbst liefert auf diesem Zweig zur Kompatibilität mit dem Website-Proxy HTTP 200 mit Geschäftsfehler im JSON; vor Direktzugriff auf den Make-Webhook prüfen. Bei `already_complete` wird der ursprüngliche Datensatz bestätigt, ohne erneut zu schreiben.
4. Datenschutz-Zweig bleibt unabhängig vom E-Mail-Zweig. Existenzprüfung über den stabilen Aufgabencode verhindert erneutes Öffnen einer bereits erledigten Datenschutzprüfung.
5. Bei identischer Wiederholung während unvollständiger Verarbeitung kann die Auftragsverknüpfung per erneutem `PATCH` repariert werden. Weiterhin keine Garantie echter atomarer Transaktion zwischen mehreren Airtable-Datensätzen.

**Isolierte Make-Testkopie `7963278` (nur synthetische Daten, ohne E-Mail-Modul):**
- Suchfilter in Modul 5 auf Auftrag `rec2958xrhm6QmIbM` eingeschränkt; keine echte Vertragsannahme gesetzt.
- Erste Ausführung: `saved` – Onboarding `recGKxPPzHhgUZ8W9` und genau eine neue Datenschutzaufgabe erstellt; alle Schreibmodule und die abschliessende Rückgabe erfolgreich.
- Gleiche Eingaben erneut: `saved` mit identischer Datensatz-ID, keine zweite Datenschutzaufgabe.
- Geänderter Projektname: `conflict` / `changed_input`; Ausführungsprotokoll zeigt **keine** Schreibmodule im Konfliktlauf. Der ursprüngliche Projektname blieb unverändert.
- Simulierte Teilunterbrechung: Auftragsverknüpfung beim fiktiven Onboarding entfernt, identische Eingabe erneut verarbeitet, Verknüpfung korrekt zum ursprünglichen Testauftrag wiederhergestellt.
- Einmalig Status `Vollständig` im Testdatensatz gesetzt: identische Eingabe führte zu `already_complete`; nur lesende Module und Antwortmodul liefen. Anschliessend ursprünglichen Teststatus `Eingegangen` wiederhergestellt.
- Die Testkopie `7963278` ist nach den Testläufen wieder **INAKTIV**. Ebenso sind die früheren isolierten Teststrecken `7962957`, `7962998`, `7963182` und `7963206` inaktiv.

**Noch nicht abgenommen:** Die Testkopie hat einen `StartSubscenario`-Trigger, **keinen Live-Webseiten-Webhook**. Noch nötig: tatsächlicher synthetischer HTTP-Webhook-Test, echte Unterbrechung in Make zwischen Modul 3 und Modul 6, gleichzeitige erstmalige Einsendungen, Fehlerantworten bei nicht autorisiertem Token oder Airtable-Ausfall sowie Stabilität bei späteren Datenaktualisierungen. Der instanzlokale Zwei-Minuten-Cache im Website-Proxy garantiert keine dauerhafte Exklusivität. Die übrigen Freigabeblocker zu Google Drive, RC1/AVV, Kundenorganisation und Rechnungs-/Offertenversand bleiben bestehen.


### Nachtrag 14.10.2026 – echter HTTP-Webhook im isolierten Test

- Eigenständiges Make-Webhook-Szenario **7963329** als eingeschränkte Kopie des Onboardings angelegt. Es enthält **kein Gmail-/E-Mail-Modul** und darf ausschliesslich den synthetischen Testauftrag `rec2958xrhm6QmIbM` verarbeiten. Getrenntes synthetisches HTTP-Sendeszenario **7963343**.
- **HTTP-E2E Wiederholung:** Ein tatsächlicher HTTP-POST aus Szenario 7963343 an den Test-WebHook 7963329 durchlief Validierung, Auftragsabfrage, JSON-Erzeugung, Existenzprüfung, Wiederholungs-Guard, Airtable-Upsert, Auftrags-/Kundendaten und Datenschutzaufgaben-Existenzprüfung. Die Webhook-Antwort enthielt `ok=true` und dieselbe ursprüngliche Datensatz-ID. Make-Ausführung ohne Fehler.
- **HTTP-E2E Konflikt:** Geänderter Projektname im POST führte zu `duplicate=true`, `error=already_submitted`. Ausführungsprotokoll durchlief nur die Validierung und lesenden Module sowie die Konflikt-Antwort (Modul 19), **kein** Airtable-Schreibmodul. Projektname, Verknüpfung und DSG-Aufgabe blieben unverändert.
- Beide Make-HTTP-Läufe meldeten HTTP **200** vom internen Webhook. Der bereits implementierte Website-Proxy wertet das Geschäftsfehler-JSON aus und soll bei `duplicate=true` selbst HTTP **409** ausgeben. Dieser Website-Proxy-Endpunkt wurde noch **nicht** selbst per HTTP getestet.
- Webhook-Queue nach Tests **0**. Szenarien **7963329** und **7963343** nach den Läufen deaktiviert, wie auch das originale Onboarding **7777695**. Dessen Kundenmail-Modul 9 behält die `0=1`-Sperre.
- Weiter offen bleiben: Durchlauf über das tatsächliche öffentlich zugängliche Website-Onboarding samt 409-Prüfung, echte Fehler-/Unterbrechungsinjektion in Make, initial gleichzeitige Eingänge für denselben noch nicht angelegten Datensatz, Fehlerbehandlung bei Ausfall von Airtable/Google und manuelle organisatorische Freigaben. **Keine Produktionsfreigabe.**


### Nachtrag 14.10.2026 – gleichzeitige Erstanfragen, echter Fehlerabbruch und Website-202-Hinweis

**Paralleltest nur mit synthetischem Auftrag:** Separater Testauftrag `recDXecnwGr3fyU9D`, ohne bestätigte Vertragsunterlagen, auf den der isolierte Test-WebHook `7963329` in seiner Airtable-Suchformel begrenzt wurde. Mit `sequential=true` wurden zwei nahezu zeitgleiche Erstübermittlungen an den isolierten Webhook ausgelöst. Die Make-HTTP-Sender erhielten beide zunächst `200 Accepted` als vorläufige Annahme, **nicht** als bestätigten Speicherbeleg. Die zweite Lieferung blieb zunächst in der Webhook-Warteschlange (Queue=1) und wurde nach erneuter Testaktivierung abgearbeitet (Queue anschliessend=0). Die beiden Webhook-Ausführungen meldeten **warning**, zeigten im Modulprotokoll jedoch keinen Modulfehler. Airtable enthielt anschliessend **genau einen** neuen Onboarding-Datensatz `recvv5IlhSJU8V4Qw` und **genau eine** Datenschutz-Aufgabe `reck61B1qYy3zEmOk` für den Testauftrag. Kein Kundenszenario aktiviert.

**Wichtige offene Semantik:** Bei konkurrierenden Webhook-Aufrufen liefert Make vor der vollständigen Bearbeitung `Accepted`. Der produktive Website-Proxy darf dies ausschliesslich als `202 pending` behandeln (keine verifizierte Speicherung). Seine Implementierung sieht dafür bereits die Unterscheidung vor; der echte öffentlich zugängliche Website-Endpunkt wurde noch nicht per HTTP geprüft. Die Ursache der Make-Ausführungsstatus `warning` ist noch separat zu beurteilen. Der Wartefall im Fehler-/Duplikatschutz darf nicht still als erfolgte Speicherung gelten.

**Echter Testfehler nach Upsert:** Neue ausschliesslich synthetische On-Demand-Testkopie `7963454` enthielt absichtlich ein `code:ExecuteCode`-Modul direkt nach Airtable-Upsert und vor der Auftragsverknüpfung, das `LSZH_SYNTHETIC_INJECTED_FAILURE_AFTER_UPSERT` auslöste. Beim fiktiven Datensatz `recGKxPPzHhgUZ8W9` war vorher die Auftragsverknüpfung entfernt worden. Make-Ausführung `79a93d7dddea450eac0d99baa4d6b63b` endete mit dem erwarteten RuntimeError, Datensatz blieb vorhanden und unverknüpft. Die anschliessende **saubere Wiederaufnahme** über die isolierte Teststrecke `7963278` (`870934398c354301b026a8d1c58dbe90`) war erfolgreich: dieselbe Datensatz-ID, korrekte Verknüpfung `rec2958xrhm6QmIbM`, keine zweite Datenschutz-Aufgabe. Beide Teststrecken anschliessend deaktiviert.

**Website-UI-Korrektur:** In `onboarding/index.html` wurde der Hinweis bei HTTP 202 berichtigt: Es wird ausdrücklich nur der Empfang zur Verarbeitung bestätigt, nicht die endgültige Speicherung und auch **keine später automatisch versandte E-Mail** versprochen, während der E-Mail-Versand gesperrt ist. GitHub-Commit `1acce5b93380d40f638a28594688669c7bdc842f`.

**Freigabegrenzen:** Öffentliche Website `/onboarding/` und `/make-start/` waren aus dem externen Prüfwerkzeug nicht erreichbar bzw. nicht verifizierbar; daraus folgt noch keine gesicherte Aussage zur Ursache. Website-/Render-Verfügbarkeit, echte HTTP-409-Rückgabe des Proxy, Fehler bei Airtable-Verbindungsunterbruch und kundenbezogene Rollen-/Vertragstests sind **OFFEN**. Produktiv-Onboarding `7777695` bleibt inaktiv, harte `0=1`-Kundenmail-Sperre unverändert. Teststrecken `7963278`, `7963329`, `7963343`, `7963454` bleiben deaktiviert. Keine Einladungen, echten E-Mails oder Vertragsfreigaben.


### Nachtrag 14.10.2026 – Google Drive: Zugriffstrennung und geschäftliche Archiv-Staging-Prüfung

**Befund:** Zwei Google-Konten/Drive-Berechtigungskontexte sind betroffen. Das über Google Drive direkt einsehbare ältere Vertragsarchiv mit Testangebot liegt im *privaten* Google-Konto und ist laut Metadaten nicht freigegeben. Die in Make verwendete Google-Drive-Verbindung (Geschäftsadresse `lars@lszh-automations.ch`, Connection 11904271) ist zwar autorisiert, kann diese private Test-PDF nicht laden (HTTP 404). Das ist ein **Zugriffsproblem**, kein Nachweis einer erneut abgelaufenen OAuth-Verbindung. Umgekehrt ist eine in Make erreichbare Geschäftskonto-PDF über den separat verbundenen privaten Drive-Connector nicht zugänglich. Eine globale Google-Drive-Reautorisierung ist für diesen Befund nicht nötig.

**Geschäftskonto-Zielarchiv bereits vorhanden:** Make hat den Ordner **LSZH Automations Vertragsarchiv – STAGING – Geschäftskonto** als eigenes Ziel angeboten. Der ältere private Ordner **LSZH Vertragsarchiv – STAGING (nicht produktiv)** ist hiervon getrennt. Für zukünftige Vertragsarchivierung den geschäftlich kontrollierten Speicherort verwenden und die bisherigen privaten Tests nicht als Produktionsarchiv behandeln. Keine automatischen Freigaben/Sharing der privaten Unterlagen ohne separate Zustimmung.

**Kontrollierte Lesetests:** Isoliertes, rein lesendes Make-Szenario `7963566` mit Geschäftskonto-Verbindung: bestehende synthetische Geschäftskonto-Test-PDF erfolgreich gelesen (630 Bytes, gültiger SHA-256). Die alte private Offerten-Test-PDF liefert mit derselben Make-Verbindung HTTP 404. Das Szenario wurde deaktiviert.

**Archivierung + Datenintegrität erfolgreich:** Neues isoliertes Make-Szenario `7963597` erstellt: vorhandene synthetische Mini-PDF im Geschäftskonto laden -> ausschliesslich in den genannten **Geschäftskonto-STAGING**-Ordner hochladen (Dateiname beginnt mit `TEST_ONLY_`) -> neu archivierte Datei herunterladen -> Größe und SHA-256 mit der Vorlage vergleichen. Ausführung `0fab42aac5ce44b99c02c27d83ea57f2`: **success**, Hashes identisch `c7694e7a617af93059204f790bcf9f306b8d3fa3c5a15e6a4f352a2abf6366c4`, beide Dateien 630 Bytes, Upload im richtigen Business-Staging-Ordner. Szenario direkt danach deaktiviert. Die Test-PDF ist **kein Vertrag**.

**Nicht freigegeben:** Online-Annahme, reale E-Mails, externe Freigaben/Einladungen, echte Kundenunterlagen und produktive Szenarien bleiben inaktiv. Das Bestehen des Upload/Download-Tests beweist weder rechtliche Dokumenteneinbindung noch Content Restrictions/WORM, SHA-Verifikation bei Online-Annahme, Backup-/Aufbewahrungskonzept oder Dienstkonto-Zugriff. Projektbedingungen und AVV RC1 bleiben unfreigegeben. Vor Produktivstart (1) Staging-Unterordner und Ablageziele in Geschäftskonto aufeinander abstimmen, (2) freigegebene finale PDFs unabhängig archivieren, (3) Download-/Hashprüfung bei Angebotsversand und Annahme, (4) restriktives serverseitiges Dienstkonto für lesenden Zugriff vorbereiten, (5) Rechte, Löschung, Backup und Unveränderbarkeit sowie externe Rechtsprüfung klären.


### Nachtrag 14.10.2026 – Make Offerten-/Annahmearchiv auf Geschäftskonto-STAGING vorbereitet

**Voraussetzung:** Das Make-Geschäftskonto `lars@lszh-automations.ch` kann den bestehenden Ordner `LSZH Automations Vertragsarchiv – STAGING – Geschäftskonto` erreichen. Die versuchte automatische Anlage von drei getrennten Unterordnern (Offerten, Projektbedingungen, Annahmenachweise) wurde durch die Sicherheitsprüfung des verbundenen Tools blockiert und **nicht durchgeführt**. Bis eine Unterordnerstruktur eingerichtet und separat geprüft ist, wird nur der nachweislich funktionierende Geschäfts-STAGING-Hauptordner verwendet; Dateinamen tragen `STAGING_`. Alte private Archiv-PDFs wurden nicht geteilt, verschoben, gelöscht oder überschrieben.

**Make `7835460` (Offerte PDF erzeugen und versenden, INAKTIV):** Google-Docs-Entwurf (Modul 3) und Offerten-PDF-Upload (Modul 7) auf denselben Geschäfts-STAGING-Ordner umgestellt. Modul 11 fordert nun zusätzlich `parents` aus Google Drive an; Modul 8 markiert einen Archivbeleg nur bei passender Datei-ID, passendem SHA-256, PDF-MIME-Type, aktiviertem Drive-Content-Restriction-`readOnly` und korrektem Geschäftskonto-Ordner als verifiziert. Die ursprünglich strukturell ungültige JSON-Feldzuordnung in Airtable-Statusmodul 6 korrigiert. Zusätzliche **harte 0=1-Sperre vor Google-Docs-Erzeugung** in Modul 2 sowie bestehende harte 0=1-Sperre vor Kundenmail in Modul 5; auch `disabled` nicht als alleinige Sicherheit betrachten.

**Make `7940261` (persönlichen Offerten-Annahmelink erstellen/mailen, INAKTIV):** Nach den beiden Google-Drive-Leseoperationen für Angebot und Projektbedingungen zwei zusätzliche read-only Drive-Metadatenmodule 9/10 eingefügt. Token-Hash-Schreibmodul 4 verlangt jetzt zusätzlich für **beide** PDFs den richtigen Geschäfts-STAGING-Elternordner, passenden Datei-ID- und SHA-256-Abgleich, Drive-Content-Restriction `readOnly=true` und API-HTTP 200. Eine syntaktisch fehlerhafte JSON-Feldzuordnung in Statusmodul 6 korrigiert. Token-Erstellung (Modul 2) und Kundenmail (Modul 5) jeweils **hart 0=1 gesperrt**. Keinerlei Annahmelink erzeugt oder verschickt.

**Make `7940220` (Online-Annahmebeleg und Bestätigung, INAKTIV):** Zwei Drive-Metadatenmodule 10/11 lesen vor dem Beanspruchen einer Bestätigung beide zuvor archivierten PDFs; vor Verarbeitung prüft Modul 2 die beiden Drive-Elternordner, Datei-IDs, SHA-256 und `readOnly`-Schreibschutz zusätzlich zu den vorhandenen Annahme-/Freigabebedingungen. Google-Docs-Nachweisentwurf (Modul 5) und PDF-Ablage (Modul 7) liegen im Geschäfts-STAGING-Hauptordner. Nach PDF-Upload liest Modul 12 den Nachweis erneut, Modul 13 setzt den Drive-Schreibschutz, Modul 14 verifiziert Archivpfad, SHA-256 und Schreibschutz. Kundenmail-Modul 8 verlangt die technischen Belege, bleibt aber unabhängig davon **hart 0=1 gesperrt**. Zusätzlich ist Claim-/Belegerstellung (Modul 2) **hart 0=1 gesperrt**. Fehlerhaft aufgebaute JSON-Feldzuordnung des Airtable-Abschlussmoduls 9 korrigiert.

**Isolierter Schreibschutz-Test `7963696`:** Ausschliesslich die synthetische 630-Byte-PDF aus dem zuvor überprüften Geschäftsarchiv verwendet (kein echter Vertragsbeleg). Lauf `2a981655f34a4d66b772177c7f619212` meldete **success**: Google Drive Content Restriction erfolgreich per PATCH gesetzt, per GET `readOnly=true` bestätigt, SHA-256 weiterhin identisch `c7694e7a617af93059204f790bcf9f306b8d3fa3c5a15e6a4f352a2abf6366c4`, richtiger Geschäftsarchiv-Elternordner. Die Teststrecke danach **deaktiviert**. Ein Drive-Schreibschutz ist nicht automatisch ein revisionssicheres WORM-Archiv.

**Verifikation:** Die drei Make-Szenarien `7835460`, `7940261` und `7940220` nach den Änderungen erneut ausgelesen: alle **INAKTIV**. Alle drei Kundenmail-Module besitzen harte `0=1`-Filter; vorgelagerte Schreib-/Vertragsprozesse ebenfalls. JSON-Bodies der drei korrigierten Airtable-Statusaktualisierungen sind syntaktisch gültig. Google-Drive-Verbindung ist autorisiert.

**Noch nicht abgenommen:** Vollständige E2E-Ausführung der drei Offerten-/Annahme-Staging-Szenarien (harte Sperren bleiben aktiv), eigene Geschäfts-STAGING-Unterordner, zwei **tatsächlich freigegebene** finale Projektbedingungen-/Offerten-PDFs samt SHA-256 und Archivzugriff, Berechtigungs- und Retention-/Backup-/WORM-Konzept, separates eingeschränktes serverseitiges Dienstkonto, RC1-Projektbedingungen und AVV mit geschäftlicher und juristischer Freigabe, scharfe Anbieter-/UID-/MWST-Daten, Kundeneinwilligung und ausdrückliche Produktionsfreigabe. Keine E-Mails, Einladungen oder Vertragsabschlüsse durchgeführt.


### AVV v0.9 / RC1 – Geschäftsentscheid vom 14.10.2026: INTERN PROVISORISCH FREIGEGEBEN

**Entscheid durch den LSZH-Geschäftsführer:** Das bestehende **LSZH_AVV_v0_9_RC1_Freigabeentwurf.docx**, Original vom **13.10.2026**, wird als **interne, provisorisch akzeptierte Arbeitsgrundlage** für technische Vorbereitung, Dokumentenabgleich und vollständig synthetische Tests behandelt. Original bleibt unverändert (auch wenn darauf noch „nicht freigegeben“ steht). Der Entscheid ist separat im Google-Drive-Freigaberegister **LSZH Vertragsarchiv – Freigaberegister (STAGING)** protokolliert.

**Eindeutige Status-Trennung:**
- AVV-Musterinhalt: **INTERN PROVISORISCH FREIGEGEBEN** / für Staging-Arbeit verwendbar.
- Unterschriften, Kunden- und Projektbezug: **NICHT FREIGEGEBEN**.
- AVV Anlagen A (Daten-/Projektsteckbrief), B (TOM-Nachweise), C (Subprozessoren inkl. Regionen/Genehmigung): **NOCH NICHT kundenbezogen abgeschlossen**.
- Juristische Prüfung inkl. Anwendbarkeit DSG/ggf. DSGVO und Auslandsdaten: **OFFEN**.
- Projektbedingungen v1.0 RC1: **SEPARAT OFFEN**.
- Online-Annahme rechtlich freigegeben in Airtable: **NEIN / unverändert**; sämtliche **harten Make-0=1-Sperren** bleiben bestehen; keine echten E-Mails, keine externe Bereitstellung oder Einladungen, keine Vertragsabschlüsse und keine Produktiv-Szenarien.

**Vor externer Verwendung pro Kunde prüfen:** Identität und Vertretungsbefugnis; Leistungs-/Datenfluss- und Rollenzuordnung (auch kundeneigene Make-Organisation); Kategorien inkl. besondere Daten/Profiling; eingesetzte Anbieter, Regionen, internationale Zugriffe, AVV/SCC; technische und organisatorische Massnahmen mit tatsächlichem Nachweis; Lösch-/Backupfristen; Kundenfreigabe Anlage C; Abstimmung mit finalen Projektbedingungen; richtige AVV-Version als eigenständige schreibgeschützte PDF im **geschäftlichen** Archiv mit SHA-256; unabhängige rechtliche und geschäftliche finale Freigabe.

**Wichtige Dokumentenidentität:** Das Original RC1 enthält Platzhalter, Entwurfsvermerke und keine Signaturen. Der provisorische Geschäftsentscheid wertet es *nicht* zu einer endgültigen rechtsgeprüften, signierten Vereinbarung auf. Es wird durch diese Notiz nicht umbenannt, überschrieben oder als final archiviert.



### Nachtrag 14.10.2026 – RC1-Originale geprüft und echte synthetische PDF-/Annahme-Nachweisstrecke

Die originalen **Projektbedingungen v1.0 RC1 (4 Seiten)** und das **Geschäftsbedingungen-Entscheidungsblatt RC1 (1 Seite)** wurden in der ChatGPT-Library wiedergefunden und mit der vorhandenen **AVV v0.9 RC1 (6 Seiten, Anlagen A–C)** textlich abgeglichen. Originale **nicht verändert**; die frühere Aussage „hier nicht abrufbar“ im Freigabeformular ist damit nur noch historischer Stand. Die AVV bleibt allein **intern provisorisch** als Muster freigegeben; die Projektbedingungen, eine endgültige AVV und kundenbezogene Anlagen sind **nicht extern/rechtlich freigegeben**.

**Bereits geschäftlich definierte Eckwerte (juristisch noch zu prüfen):** D1 Care-Kündigung 30 Tage auf Monatsende; D2 Werkabnahme innert 10 Arbeitstagen ohne automatische Schweigeabnahme; D3 Haftungsdeckel 12 Monate Leistungsentgelt, mindestens CHF 2'000. D3 ist ausdrücklich noch keine rechtsgeprüfte oder extern freigegebene Klausel. Zudem muss eine auftragsbezogene AVV mit Anlagen A–C vor der entsprechenden Kundendatenverarbeitung separat nachweisbar vereinbart werden; aktuelle Online-Angebotsstrecke prüft nur Offerte und Projektbedingungen.

**Isolierte synthetische Make-Tests durchgeführt:**
- `7963939`: zwei verschiedene, als `TEST_ONLY` gekennzeichnete Fake-PDFs erstellt, getrennt ins geschäftliche STAGING archiviert, erneut gelesen, mit SHA-256 sowie Drive Content Restriction kontrolliert. **SUCCESS** (fiktive Offerte 36'691 Bytes; fiktive Projektbedingungen 38'877 Bytes). Danach deaktiviert.
- `7963965`: beide fiktiven PDFs mit richtiger Version/Hash **PASS**. Manipulierter Hash, vertauschte IDs und dieselbe PDF für beide Dokumente wurden korrekt **abgewiesen**; reine Lesetests, kein Statuswechsel. Danach deaktiviert.
- `7963993`: einen **synthetischen, ausdrücklich rechtlich unwirksamen** Annahmenachweis aus den beiden archivierten Fake-PDFs erzeugt, als PDF gespeichert, gesperrt und Hash geprüft: **SUCCESS / actual_contract=false / email_sent=false**. Negativtest mit falschem Hash brach **vor** Dokumenterzeugung ab. Danach deaktiviert.

Ausführliche Klausel- und Testprüfung: [LSZH_RC1_KLAUSELPRUEFUNG_UND_SYNTHETISCHER_ANNAHMETEST_20261014.md](./LSZH_RC1_KLAUSELPRUEFUNG_UND_SYNTHETISCHER_ANNAHMETEST_20261014.md).

**Wichtige Restpunkte:** keine echten Kunden, E-Mails oder Vertragsannahmen getestet; öffentliches Website-/Token-/Annahme-Endpoint und vollständige Airtable-Nachweis-/Versandkette bleiben offen. Im produktiven Staging-Flow `7940220` einen möglichen Fehlerfall nach PDF-Archivierung und vor bestätigtem Mailversand auf Wiederanlauf/Status-Reset prüfen. Rechtliches und geschäftliches D1–D3-Freigabeverfahren sowie allfällige AVV-Anlagen und endgültige PDF-Versionen mit Archiv-ID/Hash bleiben offen. Die Szenarien `7835460`, `7940261`, `7940220` und alle obigen synthetischen Teststrecken sind **inaktiv**, harte `0=1`-Sperren bleiben unberührt. Keine Produktivfreigabe.


### Nachtrag 14.10.2026 – Annahmebeleg vor Versand persistieren und Fehlerwiederanlauf absichern

**Produktionsvorbereitung geändert, aber NICHT aktiviert:** Make `7940220` (Online-Annahmebeleg & Bestätigung). Die bisherige Schwachstelle: `Online-Annahme Beleg Drive ID` wurde erst nach erfolgreicher Kundenmail geschrieben, obwohl das PDF zuvor schon archiviert war. **Neu Modul 15** direkt nach dem abgeschlossenen Google-Drive-Hash/Schreibschutz-Check (Modul 14) und vor E-Mail-Modul 8: `PATCH` auf Airtable zur dauerhaften Speicherung der Beleg-Drive-ID bei weiter gesetzter `Online-Annahme Bestätigung in Bearbeitung=true`. E-Mail-Modul 8 prüft zusätzlich Airtable-PATCH-Erfolg und referenzierte Beleg-ID und bleibt **hart `0=1` gesperrt**. Abschlussmodul 9 schreibt erst **nach** erfolgreicher Mail das Versanddatum und setzt `in Bearbeitung=false`; eine verspätete Beleg-ID-Schreibung wurde entfernt. Polling-Modul 1 schliesst bereits archivierte `Online-Annahme Beleg Drive ID` aus. Szenario verarbeitet sequenziell.

**Synthetisch geprüft:** Fake-Offerte `TEST-RECOVERY-20261014-NO-CONTRACT`, Status Entwurf, `Online-Annahme rechtlich freigegeben = NEIN`. Isolierter Test `7964528` prüfte tatsächlich geschützten Fake-Drive-Nachweis, persistierte dessen ID via Airtable-API und erzeugte danach absichtlich einen Laufzeitfehler als simuliertes Mailproblem. Resultat: Ausführung `b296998f54ff453cbbb33434f9247bb4` mit erwarteter Exception **nach** erfolgreichem PATCH; Airtable-Beleg-ID unverändert vorhanden, `in Bearbeitung=true`, kein Versanddatum, keine Mail. Test deaktiviert.

**Read-only-Triage `7964549`:** drei Make-Testausführungen: (1) gespeicherter Beleg + unklarer Versand ⇒ **MANUAL_REVIEW_BEFORE_ANY_EMAIL**, (2) gesperrter Vorgang + noch keine Beleg-ID ⇒ **MANUAL_REVIEW_BEFORE_PROOF_RETRY**, (3) keine Freigabe ⇒ **BLOCKED_NOT_LEGALLY_APPROVED**. In allen Fällen `may_auto_send=false`. Test deaktiviert. Synthetische Offerte bleibt intern erkennbar und wurde in den gewollten Fehlerzustand zurückgesetzt.

**Operative Restgrenze:** Unterbrechung zwischen Drive-Upload und Modul-15-PATCH kann ein PDF ohne Referenz im Airtable-Datensatz hinterlassen; die Bearbeitungssperre verhindert automatische Zweiterstellung, aber eine **manuelle Drive-Suche** ist dann nötig. Bei erfolgreicher Kundenmail und fehlgeschlagener finaler Statusaktualisierung kann die E-Mail schon versandt sein; ohne providerseitige Idempotenz-/Transaktionsgarantie ist automatischer Retry riskant. **Nie blind erneut senden**, zuerst Postausgang und Make-Logs prüfen.

Detaillierte Anleitung/Entscheidungstabelle: [LSZH_ANNAHMEBELEG_WIEDERANLAUF_STAGING.md](./LSZH_ANNAHMEBELEG_WIEDERANLAUF_STAGING.md). Rechtliche/geschäftliche Freigabe, öffentliche Online-Annahme, echte Kundenmails und sämtliche produktiven Aktivierungen **weiterhin offen und gesperrt**.


### Klarstellung 14.10.2026 – D1–D3 geschäftlich bereits definiert
Auf ausdrücklichen Hinweis des Geschäftsführers sind **D1–D3 keine erneut zu entscheidenden Geschäftsfragen**. Die bereits erarbeiteten Geschäftsparameter gelten für die weitere interne Vertragserstellung als **festgelegt**:
- **D1 Care-Kündigung:** 30 Kalendertage auf Monatsende, soweit keine abweichende Mindestlaufzeit vereinbart; zwingende Rechte (insbesondere ggf. Art. 404 OR) vorbehalten.
- **D2 Abnahme:** Prüfung innerhalb von 10 Arbeitstagen, **keine** fiktive Abnahme allein durch Schweigen.
- **D3 Haftung:** Bei leicht fahrlässig verursachten unmittelbaren und vorhersehbaren Vermögensschäden Entgelt der betroffenen Leistung der letzten 12 Monate, **mindestens CHF 2'000**, soweit wirksam und angemessen; Vorsatz, grobe Fahrlässigkeit und zwingende Haftungsgrenzen nicht ausschliessen.
**Status-Trennung:** Geschäftliche Eckwerte **definiert**; juristische Angemessenheit/Wirksamkeit **ungeprüft bzw. offen**; RC1-Dokumente und tatsächlicher Kundeneinsatz **nicht final freigegeben**. Alte Einträge «D1–D3 Geschäftsentscheid offen» sind **historischer Prüfstand** und durch diese Klarstellung überholt. Kein zusätzlicher Freigabe- oder Versandautomatismus, Make-Sperren unverändert. Es wird nicht nochmals nach denselben Eckwerten gefragt.


### Nachtrag 14.10.2026 – Entwicklungsfreigabe ohne vorgezogene juristische Freigabe; optionale AVV

**Entscheid des Geschäftsführers:** Juristische Prüfung der Projektbedingungen und AVV soll **zu einem späteren Zeitpunkt** stattfinden. Alle weiteren technischen Entwicklungs- und synthetischen Integritätstests werden nun **unter der Arbeitsannahme „als ob juristisch freigegeben“** weitergeführt, ohne diese Freigabe als rechtliche Tatsache zu behaupten, echten Kundendatenzugriff oder Produktivabschlüsse zu erlauben. D1–D3 (Care 30 Kalendertage zum Monatsende, Abnahme 10 Arbeitstage ohne Schweigeabnahme, Haftung 12 Monate Entgelt der betroffenen Leistung mindestens CHF 2'000) sind **geschäftlich bereits definiert**; keine erneute Grundsatzrückfrage. RC1-Originale unverändert, interne AVV-provisorische Freigabe ebenfalls unverändert. Spätere Rechtsprüfung bleibt formeller Launch-Meilenstein.

**Airtable Offerten – neue additive Felder:** AVV Drive ID (`fldojDAkMfvjJycme`), AVV-SHA256 (`fldbhBi71Jmr6g9Uk`), AVV-Version (`fld4cMFAPuSfLjz2B`), AVV ausdrücklich akzeptiert (`fld8gm2LLGAeHeBSA`). Bestehendes Auswahlfeld `AVV erforderlich` (Ja, Nein, Prüfen) weiterverwendet. Keine bestehenden Offertenzellen/echten Kundenannahmen verändert.

**Testlauf mit realen Make-/Google-Drive-Modulen, jedoch rein fiktiven Dokumenten:**
- `7964777`: `TEST_ONLY`-AVV-Anlagen A–C als 47'341-Byte-PDF erzeugt, im Geschäftskonto-STAGING separat gespeichert, readOnly gesetzt und SHA-256 sowie Ordner geprüft – **SUCCESS**; danach deaktiviert.
- `7964807`: optionalen AVV-Pfad an 8 Konstellationen getestet. `Ja` mit drei PDFs und simulierter zusätzlicher AVV-Zustimmung/vertretungsberechtigter Person **SUCCESS**; `Nein` mit zwei PDFs **SUCCESS**. `Prüfen`, fehlende Zustimmung, falscher AVV-Hash, fehlende Vertretungsprüfung, fehlende Version und Inkonsistenzen **BLOCKIERT**. Danach fiktiven Annahmenachweis bei `Ja` und `Nein` tatsächlich als PDF archiviert und schreibgeschützt; falscher Hash stoppt vor Belegerstellung; `real_contract=false, email_sent=false`. Wieder deaktiviert.
- Im `Nein`-Beleg wurde eine anfangs irreführende AVV-Prüfsummendarstellung korrigiert und der zweidokumentige Pfad anschliessend erneut erfolgreich geprüft.

**Produktionsnahe Staging-Sicherheit:** `7940261` für Annahmelink hat zusätzlich `AVV erforderlich=Nein` als Filter, `7940220` für Annahmenachweis dieselbe Bedingung in der Suchformel. **AVV Ja und Prüfen sind bis zur echten Drei-Dokumenten-Verkabelung an Website/Token/Mail/Nachweis blockiert**; alle Szenarien weiterhin inaktiv und `0=1`-Mail-/Claim-Sperren aktiv. Es ist **keine** produktive Annahme freigegeben.

Technisches Testprotokoll und Integrationsplan: [LSZH_OPTIONALE_AVV_ANNAHME_TECHNIKTEST_20261014.md](./LSZH_OPTIONALE_AVV_ANNAHME_TECHNIKTEST_20261014.md). Nächster Fokus: vollständig bedingte AVV-Anzeige/Einzelzustimmung im **nicht live geschalteten** Website-Annahmezweig und korrekte bedingte AVV-PDF-Beilagen in Annahmelink und Beleg. Nach vollständiger technischer Abnahme bleiben echte Verträge/E-Mails, Kundenfreigabe und formelle spätere Rechtsprüfung getrennt.


### Nachtrag 14.10.2026 – Website-AVV-Draft ohne Live-Merge

**Entwicklung getrennt vom Livebetrieb:** GitHub **Draft PR #5** `feature/optional-avv-acceptance-staging-20261014` → `feature/secure-offer-acceptance-20261013`. Auf einer **isolierten, nicht auf die Live-Website gemergten Branch** wurden `offerAcceptance.js` und `offerArchiveVerifier.js` erweitert. Bei `AVV erforderlich=Ja`: Dritt-PDF inkl. Drive-ID, SHA-256, PDF-MIME, Drive-Schreibschutz, Geschäftsarchivordner und AVV-Version prüfen; Vorschau zeigt bedingte AVV-Version/Hash; gesicherter AVV-PDF-Download, Annahme benötigt zusätzliche explizite Zustimmung `accept_avv=true` sowie exakt passenden AVV-Hash und Version; AVV-Zustimmung und PDF-Hash werden im Nachweis sowie im Airtable-Feld `Online-Annahme AVV ausdrücklich akzeptiert` protokolliert. `AVV erforderlich=Nein` erlaubt keine unverlangte AVV-Zustimmung/-Dateien; `Prüfen` blockiert. Angebot-/Projektbedingungen-PDFs müssen zusätzlich demselben konfigurierten Geschäftsarchivordner angehören. Neues erforderliches Env-Gate `OFFER_DRIVE_ARCHIVE_FOLDER_ID`. Implementierter Testsatz `test/offerAcceptance.avv.test.js` prüft acht AVV-Konstellationen auf Node-Ebene; Syntax von drei Dateien über JavaScript-Parser geprüft.

**Offene technische Punkte:** Node-Tests noch nicht ausgeführt (`node --test`/CI), tatsächliche gemeinsame Website-UI/Checkbox-Präsentation nicht fertig, reale serverseitige Drive-Dienstkonto-Berechtigung noch offen, end-to-end Make-Attachments bei AVV=Ja noch nicht implementiert. **Draft PR nicht mergen oder deployen**. Die bisherigen isolierten Make-AVV-Tests bestanden; sie sind von dieser Server-Branch getrennt. Make-Produktionsvorbereitung `7940261`, `7940220` bleibt inaktiv und AVV=Ja/Prüfen bleibt fail-closed, alle Mail- und Claim-Gates `0=1` aktiv.

**Geschäftlicher Entscheid:** Entwicklung vorziehen, juristische Prüfung später vor echtem Kundenbetrieb; nicht als wirkliche aktuelle Freigabe kennzeichnen. Kein Kundenversand, keine Annahme, keine externe Einladung.

Link: https://github.com/lszh-automations/lszh-automations-site/pull/5


### Nachtrag 14.10.2026 – optionale AVV im Webformular und geprüfte Anhang-Metadaten

**Website-Draft (NICHT DEPLOYT):** Auf `feature/optional-avv-acceptance-staging-20261014`, [Draft PR #5](https://github.com/lszh-automations/lszh-automations-site/pull/5), die echte HTML-Oberfläche `offerte-annehmen/index.html` ergänzt. Bei `AVV erforderlich=Ja` erscheinen drittes PDF, AVV-Version und eine **eigene, nicht vorangekreuzte erforderliche Checkbox**. Bei `Nein` bleiben diese Elemente versteckt; `Prüfen` wird serverseitig verweigert. Der Client übergibt gesondertes `accept_avv`, AVV-Version und SHA-256 an `/api/offer/accept`; nur wenn die serverseitige Prüfung den richtigen archivierten PDF-Datensatz bestätigt, kann die AVV-Zustimmung im Entwurfszweig in Airtable protokolliert werden. Neue `OFFER_DRIVE_ARCHIVE_FOLDER_ID`-Anforderung bei PDF-Prüfung; kein serverseitiges Dienstkonto angelegt. Branch nicht in main gemergt.

**Automatisierte GitHub-Tests wirklich ausgeführt:** Die GitHub Actions-Suite `Offer acceptance checks` wurde um `test/offerAcceptance.avv.test.js` und `test/offerAcceptance.ui.test.js` erweitert. Veraltete frühere Test-Fixtures (fehlender AVV-Modus und fehlender Drive-Elternordner) korrigiert, ohne Sicherheitsprüfungen abzuschwächen. **Erfolgreicher GitHub Actions Lauf 38631231782: 28 Tests, 28 bestanden, 0 fehlgeschlagen; Node- und Browser-Skriptsyntax erfolgreich.** Dies ist eine Test-Branch-Prüfung, kein echtes Browser-/Dienstkonto-End-to-End.

**Make-STAGING (ausschliesslich synthetisch):** Isoliertes `7964807` nach erfolgreicher 2-/3-PDF-Prüfung um Modul 18 ergänzt, das **nur Metadaten** der vorgesehenen Anhänge als prüfbare Liste zusammenstellt: Offerte + Projektbedingungen bei `Nein` (2), zusätzlich AVV bei `Ja` (3). Manifest erhält separate PDF-Datei-IDs und SHA-256-Werte und wird im als ungültig beschrifteten synthetischen Annahmenachweis referenziert. Beide positiven Pfade in echten Make-Ausführungen erfolgreich durchlaufen, bewusst falscher AVV-Hash scheitert **vor** Belegerstellung. Kein Gmail-Modul in der Teststrecke; Testscenario danach wieder inaktiv.

**Wichtige Grenze:** Die Metadatenliste ist **noch kein real getesteter E-Mail-Anhang**. In den produktionsnahen, weiterhin inaktiven Make-Szenarien `7940261` und `7940220` ist der AVV=Ja/Prüfen-Pfad weiterhin **fail-closed**. Noch offen: bedingte 2/3 PDFs beim Linkversand und 3/4 PDFs bei der Bestätigung tatsächlich ohne echten Versand konfigurieren/verifizieren; Backend-E2E mit kundeneigenem Dienstkonto; Race-/Idempotenzkontrolle einer echten Annahme. Rechtsprüfung und echte Freigaben wie vom Geschäftsführer beschlossen erst vor Produktivstart. Alle Kundenmail-/Claim-0=1-Gates weiter aktiv; keine Live-Änderung.


### Nachtrag 14.10.2026 – tatsächlich konfigurierte Make-Gmail-Anhänge AVV Nein/Ja und Binärdatei-Test

**Änderung (STAGING, KEINE PRODUKTIONSAKTIVIERUNG):** Für den elektronischen Offerten-/Annahmeprozess sind bedingt nach `AVV erforderlich` getrennte, fail-closed Make-Verarbeitungspfade aufgebaut:
- **AVV Nein** – bestehendes Annahmelink-Szenario `7940261` (inaktiv, harter 0=1-Gate bei Token-Modul 2 und Mail-Modul 5): Airtable-Suchformel zusätzlich explizit `{AVV erforderlich}='Nein'`; echte Gmail-Modulzuordnung bereits **2 PDF-Anhänge** (Offerte, Projektbedingungen). Bestehendes Bestätigungs-Szenario `7940220` (inaktiv, Claim 2 und Gmail 8 0=1 gesperrt) selektiert ausschliesslich AVV Nein; echte Gmail-Zuordnung **3 PDF-Anhänge** (Offerte, Projektbedingungen, Annahmenachweis).
- **AVV Ja Offertenlink** – neues explizit getrenntes, **inaktives** Staging-Szenario `7965215`: auf Basis der bestehenden Abläufe mit zusätzlichem Google-Drive-Download Modul 11 und Metadaten-/SHA-Check Modul 12 für kundenspezifische AVV. Select-Formel verlangt AVV Ja, AVV-Datei-ID/-SHA/-Version und noch keine Annahme/AVV-Zustimmung; vor Token-Speicherung Dateiname/MIME, SHA-256 gegen Airtable und heruntergeladene Datei, Drive-Elternordner sowie `readOnly=true` durch Filter geprüft. In echtem Gmail-Modul 5 drei **fest und getrennt gemappte PDF-Attachments** `{{7.data}}` (Offerte), `{{8.data}}` (Projektbedingungen), `{{11.data}}` (AVV samt Anlagen). Token-Erstellung und Gmail behalten eigene harte `0=1`-Filter, E-Mail wird **nicht** versendet.
- **AVV Ja Annahmebestätigung** – neues explizit getrenntes, **inaktives** Staging-Szenario `7965223`: selektiert nur bereits angenommene, ausdrücklich AVV-akzeptierte Aufträge, deren Dritt-PDF-ID/Hash/Version hinterlegt ist. Module 16 und 17 lesen/prüfen AVV-PDF vor Claim; Claim 2 bleibt hart 0=1 gesperrt. Bewährte Reihenfolge Archivieren -> Schutz/Hash prüfen -> Drive-Beleg-ID VOR Mail in Airtable persistieren bleibt erhalten. Echtes Gmail-Modul 8 enthält **4 gemappte PDF-Anhänge** `{{3.data}}` Offerte, `{{4.data}}` Projektbedingungen, `{{16.data}}` AVV, `{{6.data}}` Annahmenachweis; ebenfalls harter `0=1`-Gate. Kundenmail-Text weist auf die AVV hin. Beide AVV-Ja-Varianten von Make strukturell ohne Validatorfehler gespeichert; vorhandene Verbindungen Google Drive/Gmail/Airtable sind `ok`.
- Es existieren damit vier **separate** derzeit inaktive Pfade (AVV Nein/Ja für Link und Bestätigung), nicht ein zentraler Router. Doppelte Verarbeitung wird durch gegenseitig ausschliessende `AVV erforderlich`-Suchbedingungen verhindert; für Livebetrieb zusätzlich organisations-/kundenbezogene Freigabe, Idempotenz und Monitoring abschliessend prüfen.

**Tatsächlich ausgeführter technischer Binärdatei-Test OHNE Mail:** Isoliertes On-Demand-Test-Szenario `7965246` lädt via geschäftlicher Make-Google-Drive-Verbindung vier synthetische `TEST_ONLY`-PDF-Dateien als **Binärdaten**, überprüft Dateibezeichner/IDs, MIME `application/pdf`, SHA-256-Format, Dateigrösse, Ablage im Geschäftsarchiv und vorhandene Daten. Lauf `fcdfa4ee1e1c4738bc4300abe8b05d2e`: AVV Ja -> **SUCCESS**, vier Anhänge: Offerte/Projektbedingungen/AVV/Annahmenachweis. Lauf `d2e8f0d006ab44d1b404cd51c7d96b64`: AVV Nein -> **SUCCESS**, drei Anhänge ohne AVV. Lauf `9ed43f65599446578ccf6c09bc77ba5c`: `Prüfen` -> bewusster **ERROR** `INVALID_AVV_MODE`. Danach Test-Szenario deaktiviert. Alle Ausgaben `send_permitted=false`; keine Mail in diesem Szenario.

**Wichtig für die Abnahme:** Die Gmail-Module sind nun wirklich mit den erwarteten 2/3/3/4 `attachments[]` (Dateiname plus `data` aus Drive-Modulen) konfiguriert, jedoch wegen der Einwilligungs-/Sicherheitsgrenzen **nicht durch tatsächliches Senden ausgeführt**. Der Binärtest prüfte die Dateien separat – er beweist **nicht**, dass Gmail sie bereits einmal erfolgreich als Nachricht transportiert hat. Alle produktiven/produktionsnahen Szenarien und ihre Mail- sowie Token/Claim-Gates bleiben inaktiv/gesperrt. Live-Website unverändert; GitHub [Draft PR #5](https://github.com/lszh-automations/lszh-automations-site/pull/5) bleibt ungemergt; GitHub CI für Branch hatte zuvor **28/28 Tests bestanden**.

**Noch offen:** sichere Integration der getrennten Make-Pfade in ein dokumentiertes Deployment-/Anlagen-Konzept, vollständiger Website→Airtable→Make→Drive-Nachweis mit synthetischem Token und echter Browser-Nutzung, Zugriff des eingeschränkten Google-Dienstkontos, Finalität der AVV-Anlagen/Projektbedingungen und später juristische Prüfung vor echtem Kundenbetrieb, ausdrückliche Einwilligung zu produktivem Versand/Aktivierungen. Keine echten Nachrichten, Verträge oder Einladungen.


### Nachtrag 14.10.2026 – HTTP-Synthetik und echte Make/Airtable/Drive-Testkette, Parallelitätsbefund

**Website-HTTP-Test (nur Mock-Provider):** Im nicht deployten GitHub Draft PR #5 `feature/optional-avv-acceptance-staging-20261014` läuft nun `test/offerAcceptance.http.test.js` mit tatsächlichem lokalem `server.js`-HTTP-Server. Airtable, OAuth und Drive werden ausschliesslich lokal mit ephemeren Test-Credentials simuliert. Es werden echte HTTP-Requests und echte Codepfade für Vorschau, PDF-Bytes, AVV-Zustimmung und Nachweis-PATCH getestet, ohne externe Daten zu bearbeiten. Rate-Limit-Schutz blieb erhalten. **GitHub Actions 38633804997: 42/42 Tests grün**, 0 fehlgeschlagen. Die CI-Konfiguration danach auf explizite `test/*.test.js` umgestellt.

**Make + Airtable + Google Drive (wirkliche, aber ausschliesslich fiktive Datensätze und Dateien):** Testofferte `TEST-HTTP-MAKE-AVV-20261014-NO-CONTRACT`, Airtable `recMv3OYZQwXzIHdF`, **Status Entwurf**, AVV-/Rechtsfreigabe nicht erteilt, keine Kundenadresse. Neues isoliertes Make-Szenario `7965394` holt *nur* diesen Datensatz, prüft strikte `TEST_ONLY`-Voraussetzungen, ruft Kind-Testscenario `7964807` für AVV-Ja-Nachweis aus **drei echten fiktiven PDFs** auf, erhält archivierte/geschützte Beleg-ID+SHA und schreibt nur beim Testdatensatz Belegreferenz sowie technischen Testnachweis. Ergebnis Eltern `c70e542cf2c942068cdabdd2e1c1e251` und `83338135d01a4f14804265ddf8f9f8dd`: jeweils SUCCESS, status **nicht** angenommen, no contract/no mail.

**Wichtiger aufgefundener Parallelitätsfehler:** Zwei nahezu gleichzeitige synthetische Läufe erzeugten ohne vorherige Sequenzialisierung zwei PDF-IDs `1tu_1vumOzKDI6KH1TQREYlya5JqZSf83` und `1jD8BXp5FjkXcChvrPvX974_9_o_UT4O9` (gleicher SHA-256, unterschiedliche Google-Dateien). Drittlauf `47013a17168e4a759cfe25fd0e5585dc` stoppte bei bereits vorhandener Beleg-ID. Danach **Make-Setting `sequential=true`** am isolierten Parent gesetzt; erneuter Lauf `eba45e394d0e40cf8709c92eaf647e2f` stoppte bereits beim Preflight ohne weitere Archivdatei. **Sequenziell reicht allein nicht für produktive Exactly-once-Garantie über mehrere Startkanäle und atomare Airtable-Transaktionen.** Die zwei fiktiven Belege bleiben als QA-Nachweis. Beide Make-Testszenarien am Ende **inaktiv**.

**Grenzen:** Diese beiden erfolgreichen Testhälften sind **noch keine** durchgehende öffentliche Website mit echter Airtable/Make/Drive-Annahme. Geschäftsarchive-Dienstkonto und Render-Workspace müssen noch kontrolliert werden; der Render-Connector verlangt eine explizite Workspace-Bestätigung, die nicht erraten werden darf. Produktive Szenarien, Sendegates und GitHub-Draft bleiben unangetastet/inaktiv. Kein Vertrag, keine Einladung, keine E-Mail, keine juristische Freigabe.

Ausführliches Prüfprotokoll: [LSZH_SYNTHETISCHER_HTTP_MAKE_AIRTABLE_DRIVE_E2E_20261014.md](./LSZH_SYNTHETISCHER_HTTP_MAKE_AIRTABLE_DRIVE_E2E_20261014.md).


### Nachtrag 14.10.2026 – Google-Identität: geschäftliche Eigentümerschaft und private Altbestände

**Verbindliche Zielvorgabe des Geschäftsführers:** Für LSZH Automations sollen Google Cloud, das serverseitige Archiv-Dienstkonto sowie die Google-Drive-/Docs-/Gmail-Verbindungen **ausschliesslich** über die Google-Identität `lars@lszh-automations.ch` bzw. geschäftlich kontrollierte Ressourcen laufen. **Keine neue produktive LSZH-Ablage im privaten `lars.schulthess10@gmail.com`.** Die privaten Altbestände erst nach nachgewiesen vollständiger geschäftlicher Sicherung und aktualisierten Referenzen bereinigen. Keine Dateilöschung, Freigabe oder Verschiebung ohne konkreten Migrationsnachweis.

**Kontrollierte Ownership-Prüfung (tatsächliche verbundene Apps):**
- Google-Drive-App direkt in ChatGPT ist zum Stand der Prüfung **mit privatem Gmail-Kontext verbunden** und zeigt privates STAGING-Vertragsarchiv `1_1jVIlD2MAwkVxpTsCUIZ-14LjQggmA3`, seine Unterordner `Offerten-PDF`, `Projektbedingungen`, `Annahmenachweise` sowie u.a. das **private** Google-Doc `LSZH Vertragsarchiv – Freigaberegister (STAGING)` `1ANPIYiKzLIg_yxKifhy5lZHQe0zIwfo2yD2Ll69fhtw`. Eigentümer durch Drive-Metadaten: `lars.schulthess10@gmail.com`. Die direkt verbundene private Drive-App kann das geschäftliche Ordner-ID `1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in` derzeit **nicht** lesen (HTTP 404 wegen kontengetrennten Zugriffs).
- Die zentrale **Make Google Drive**-Verbindung `11904271`, Google Docs `11905001` und Gmail `11904991` tragen den Geschäftskonto-Kontext `lars@lszh-automations.ch`, Status bei den LSZH-Szenarien `ok`. Über das nachweislich geschäftlich authentifizierte Make-Drive-API-Get wurden **Eigentümer und HTTP 200** für Vertragsarchiv-STAGING `1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in`, Unterordner `Offerten-PDF`, eine bereits kopierte Alt-Offerte und eine `TEST_ONLY`-AVV bestätigt: **jeweils Eigentümer `lars@lszh-automations.ch`**. Read-only-Szenario `7965546` nach der Prüfung deaktiviert.
- Das geschäftliche Staging-Hauptarchiv hat bereits Unterordner `Offerten-PDF` `1COIjnGZDK1XCPXNBNikHw-7eUKfjNXgU`, `Projektbedingungen` `1o9ADwrIAuhEtP7Mv7tDCY9-OkNpCxX3I` und `Annahmenachweise` `1Q8ws0VjPeDSOYhKrx5a6I5_uhzRM2zN7`; zum Prüfzeitpunkt **alle drei leer**, da neue synthetische PDFs bislang im Geschäfts-STAGING-Hauptordner liegen. Keine neuen Unterordner anlegen, bevor alte bereits vorhandene berücksichtigt sind.
- Geschäftlich kontrollierte Ordner `Migration-Altbestand Offerten` und `Migration-Altbestand Rechnungen` enthalten nach Read-only-Inventur **10** und **23** gespeicherte DOCX-Kopien. Dies ist eine **Bestandsaufnahme**, **noch kein lückenloser 1:1-Bytevergleich aller Quellen/Versionen**. Die privaten historischen LSZH-Rechnungen und Altverzeichnisse bleiben erhalten, bis Kopien und Ablage-Verweise geprüft sind.
- Zwei aktive Make-Szenarien gefunden, eines mit iOS-/Google-E-Mail-Integration und ein weiteres nicht zur LSZH-Vertragsablage gehörendes. Diese **nicht verändert**. LSZH-Offerten-/Annahme-Produktionsvorbereitungen bleiben inaktiv und hart gegatet.

**Entscheidung für Google Cloud:** Bei `console.cloud.google.com` **als `lars@lszh-automations.ch` anmelden**, das Google-Cloud-Projekt und ein auf Drive-Lesen beschränktes Dienstkonto in derselben geschäftlich verwalteten Identität/Projektverwaltung anlegen. Dem Dienstkonto **nur Leserechte** an den tatsächlich benötigten geschäftlichen Vertragsarchiv-Ordnern gewähren, keine pauschalen Google-Cloud-Administratorrollen oder private Drive-Freigaben. *Dienstkonto ist eine eigenständige technische Identität, nicht identisch mit dem Benutzer.* Noch keine JSON-Private-Key-Datei in GitHub/Airtable/ChatGPT hochladen. Später für Render eine sichere Authentisierung/Secret-Bereitstellung planen. Bei Google Workspace können Sharing-/Trust-Rules die Freigabe an `gserviceaccount.com` beeinflussen.

**Notwendige Umstellung vor realem Kundenbetrieb:**
1. ChatGPT Google-Drive-App **erst nach abgesicherter Migration** mit der Google-Identität `lars@lszh-automations.ch` (neu) verbinden oder umstellen; Benutzerinteraktion nötig, kein automatisches Connector-Account-Switching.
2. Den noch privat geführten **Freigaberegister-Originalinhalt** versioniert ins geschäftliche Google Drive übertragen, neues Geschäftsdokument als Quelle bestimmen; danach alle automatischen/doc-Referenzen des alten privaten Registers aktualisieren und Byte-/Inhaltsgleichheit verifizieren.
3. Private Rechnungs-/Offerten-Altbestände gegen die 10 + 23 Geschäftskopien auditieren und fehlende Exemplare sicher kopieren; keine Löschung der Quellen bis zum verifizierten Abgleich.
4. Die bestehenden drei geschäftlichen Unterordner nach Bedarf befüllen, Make-/Render-Archivpfade und SHA-/Parent-Prüfungen konsistent umstellen. Ordnerumzug ohne gleichzeitiges Metadaten-Gate-Update würde die Integritätstests blockieren.
5. Business-Google-Drive-Freigabe für Dienstkonto minimal halten. Dienstkonto-/Render-Zugang zuerst mit rein synthetischen Dateien testen, später formelle Betriebs-/Rechtsfreigabe.

**Während Audit ausgeführt:** Make-Szenario `7943019` (Geschäftskonto-Ordnerinventur read-only) temporär aktiviert, Hauptordner und fünf Unterordner inventarisiert, danach deaktiviert. Make-Szenario `7965546` (Business Drive Eigentümer read-only) ebenfalls nur für obige Viererprüfung temporär aktiviert und deaktiviert. **Keine Shares, neuen Fremd-Konten, Dateiumzüge, Dateilöschungen, E-Mails oder Vertragsabschlüsse.** Das frühere private Register wurde bei dieser Prüfung nicht verändert.


### Nachtrag 15.10.2026 – Google-Cloud-Dienstkonto und Archiv-Lesefreigabe bestätigt

**Google Cloud vom Geschäftsführer im Geschäftskonto erstellt/konfiguriert:** Organisation `lszh-automations.ch`, Projektname `LSZH Automations`, Projekt-ID `lszh-automations` (Projektnummer `470613067122`). Google Drive API im Projekt laut Console-Screenshot **aktiviert**. Dienstkonto `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com` mit Name `LSZH Archive Reader` laut Console-Screenshot **aktiviert**. Keine projektweiten IAM-Rollen vergeben; ausdrücklich **keine JSON-Schlüsseldatei** in GitHub, Airtable, ChatGPT oder E-Mail bereitstellen.

**Dienstkontoordnerfreigabe unmittelbar über die echte Make-Google-Drive-Geschäftsverbindung unabhängig verifiziert:** Read-only-Audit-Szenario `7965546`, Make-Ausführung `ebf4c08392874df496acfbb8004cb840`, Drive v3 `GET /files/1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in` mit `permissions(type,role,emailAddress),owners,shared,parents`, HTTP 200. Ordner `LSZH Automations Vertragsarchiv – STAGING – Geschäftskonto`. Eigentümer `lars@lszh-automations.ch`, zweite explizite Freigabe **`lszh-archive-reader@lszh-automations.iam.gserviceaccount.com` als `role=reader`**, nicht writer und nicht owner. Damit ist die **Drive-Berechtigungsfreigabe** bestätigt. Audit-Szenario danach **wieder deaktiviert**. Ordner selbst bleibt nicht öffentlich freigegeben.

**Weiterhin offen – nicht als erledigt melden:** Serverseitige Authentifizierung der Website/Render **als Dienstkonto selbst** und tatsächliche PDF-Integritätsabfrage über diesen Account sind noch nicht ausgeführt. Laufendes Render-Deployment weiterhin unverändert; keine echten Vertragsabschlüsse. Sicheres Secret-/Keyless-Verfahren wählen. Vorzugsweise Workload Identity Federation *nur falls* mit Hosting und zugelassenem Identitätsanbieter unterstützbar; falls technisch nur JSON-Schlüssel praktikabel, diesen ausschliesslich lokal/über Render Secret-Umgebung bereitstellen, nie als Nachricht/Repo/Airtable übermitteln, Rotation und Beschränkung planen. Geschäftliches Freigaberegister befindet sich noch im privaten Drive und muss versioniert migriert und geprüft werden. Das alte Privatkonto vor vollständiger Migration nicht trennen oder Dateiquellen löschen.


### Nachtrag 15.10.2026 – isoliertes Render-Staging für Offertenannahme erfolgreich bereitgestellt

**GitHub-Autorisierung Render:** Der Geschäftsführer hat die Render GitHub App für `lszh-automations/lszh-automations-site` verbunden. Die Live-Render-Website `lszh-automations-site` (Service `srv-db1r13ad0e5s7390tcr0`) bleibt auf `main`, Auto-Deploy **yes**, PR-Previews **off**, durch diese Arbeit **nicht verändert**. Eine vorhandene unabhängige Rechnungs-Testinstanz `lszh-swiss-qr-staging` (Service `srv-db7cn5q5b2lc73fecb1g`) bleibt ebenfalls unverändert.

**Neue separate, kostenlose Render-Webinstanz (keine gemeinsamen Live-Variablen):**
- Render-Workspace `My Workspace` / `tea-db1qm7btqb8s73eajs8g` (Geschäftskonto `lars@lszh-automations.ch`).
- Name `lszh-offer-acceptance-staging`; Render-Service-ID `srv-db88q5jncjis73f2g93g`; [Dashboard](https://dashboard.render.com/web/srv-db88q5jncjis73f2g93g); Testdomain `https://lszh-offer-acceptance-staging.onrender.com` (**nicht öffentlich für Nutzer freigegeben**).
- Gleicher GitHub-Repository-Quellcode, aber Branch `feature/optional-avv-acceptance-staging-20261014`, **nicht main**; Node, Region Frankfurt, `plan=free`, `autoDeploy=no`, PR-Preview `off`.
- Build-Befehl `npm test`, Start `node server.js`; ausschliesslich die neuen, nicht geheimen Umgebungsvariablen `SITE_PRIVATE=true`, `OFFER_ACCEPTANCE_ENABLED=false`, `NODE_ENV=staging`. **Keine** Live-Make-Webhooks, echten Airtable-Tokens, Google-Dienstkonto-Credentials oder produktiven E-Mails in dieser Staging-Instanz. Kein `PREVIEW_TOKEN` gesetzt: Site-Code verweigert ohne Vorschau-Token Requests mit HTTP 503. Dieser HTTP-Status wurde noch nicht von ausserhalb geprüft, Code-Gate und Konfiguration aber gelesen/gesetzt.
- Initiales Deploy `dep-db88q6bncjis73f2gagg`, Commit `0d9cfae30f366fee66f8c4b52fd91ec17fbd9d84`; via Render API `status=live` **nur für Staging-Service**, nicht LSZH-Live-Hauptseite. Render-Buildlogs: **41 Tests / 41 bestanden / 0 Fehler**, `Build successful`, Node-Server gestartet. Hier bedeutet Deploy `live` die erfolgreiche Bereitstellung des **gesperrten Staging-Dienstes**, **keine** Kundenfreigabe.
- Der User hat **keine** weiteren manuellen Arbeiten gebraucht. Neues GitHub-Draft-PR #5 bleibt ungemergt.

**Offen vor echten Website-/Drive-End-to-End-Tests:** Ein sicherer Preview-Zugang für den nur internen Testzugriff; serverseitige Authentifizierung als das inzwischen angelegte und zum **Geschäftsarchiv als Reader freigegebene** Google-Servicekonto `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com`, vorzugsweise kurzlebige bzw. keyless Anmeldedaten, alternativ eng kontrolliertes Secret in Render. Keine JSON-Private-Keys via Chat/GitHub/Airtable, keine ungeprüften Geheimnisse an die Staging-Instanz kopieren. Erst rein synthetische Dateien und Ansprüche testen; Produktionsszenarien/echte Kundendaten/Vertragsfreigaben bleiben gesperrt. Die spätere juristische Prüfung vor produktivem Vertragsabschluss ist ein separater Freigabepunkt.


### Nachtrag 15.10.2026 – Render-Staging Google-Reader vorbereitet und Secret-Datei-Auslieferung gesperrt

**Erfolgreich:** Auf dem weiterhin ungemergten PR #5 im Branch `feature/optional-avv-acceptance-staging-20261014` wurde eine konkrete Secret-File-Auslieferungsgefahr behoben: Render stellt bei Node-Diensten Secrets auch im Service-Stammverzeichnis bereit; der frühere beliebige Static-File-Zugriff wurde durch eine **explizite Liste öffentlicher HTML-/robots-Pfade** ersetzt. Neue HTTP-Negativtests verhindern das Ausliefern von Quellcode, `.env`, `package.json`, Test-/Docs-Dateien und `lszh-archive-reader.json`. Der Reader-Verifier akzeptiert neu im Staging das fest vorgegebene lokale Render-Secret-File `/etc/secrets/lszh-archive-reader.json` mit PIN auf `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com`. Fehlender oder fremder Pfad/falsches Dienstkonto werden abgelehnt. **Kein echtes JSON-Geheimnis erstellt oder hinterlegt.**

**Readiness:** Nur im privaten Staging `srv-db88q5jncjis73f2g93g` wurden harmlose Umgebungsvariablen `OFFER_DRIVE_ARCHIVE_FOLDER_ID`, `OFFER_DRIVE_SA_FILE` (nur Pfad) und `LSZH_STAGING_ARCHIVE_SMOKE=false` hinzugefügt; `SITE_PRIVATE=true`, `OFFER_ACCEPTANCE_ENABLED=false` unverändert. Der erste Render-Build brach ab, weil die ursprünglichen Testfälle `OFFER_DRIVE_SA_FILE` geerbt und deshalb parallele Fake-Credentials erkannt hatten – keine Live-Auswirkung. Korrigiert durch `scripts/run-tests-safely.js`: Unterprozesse für Node-Tests erhalten keinerlei Runtime-Keys/Webhooks und setzen `NODE_ENV=test`. Finaler GitHub CI-Lauf `38706766784`: alle Tests grün; **Render-Deploy `dep-db8912navr4c73als4h0` live auf isoliertem Staging**, `43 Tests / 43 bestanden / 0 Fehler`, Start `node server.js` geprüft. **Keine Änderung am produktiven Render-Service `lszh-automations-site`.**

Ein standardmässig **ausgeschalteter** einmaliger Staging-Startcheck `archiveStagingSmoke.js` kann später unter `LSZH_STAGING_ARCHIVE_SMOKE=true` drei nachweislich fiktive gesperrte Geschäftsarchiv-Dateien mit **echter Dienstkonto-Authentifizierung** lesen und SHA-256/PDF-Inhalt kontrollieren. Ergebnis erscheint im Staging-Log lediglich als PASS oder FAIL (ohne IDs, Hashes, Bytes, Schlüssel). Er wurde noch **nicht** mit dem echten Dienstkonto ausgeführt.

**Authentifizierungsentscheidung technisch:** Render Managed OIDC unterstützt laut offizieller Dokumentation aktuell AWS, Anthropic, OpenAI, aber keine direkte Google-Cloud-Anbindung und verlangt mindestens Pro-Workspace. Google Workload Identity Federation ist prinzipiell schlüssellos, aber für unsere Free-Render-Instanz nicht fertig verfügbar. Praktikable Testlösung wäre eine separat geschützte JSON-Dienstkonto-Datei **ausschliesslich als Render Secret File**, Filename `lszh-archive-reader.json`. Solche Schlüssel sind sicherheitskritisch und langlebig; keine Organisationspolitik dafür abschwächen. **Nutzer muss selbst im Google-Cloud-Geschäftskonto** die JSON-Datei erzeugen und **ausschliesslich in die Secret Files der separaten Staging-Render-Instanz** einfügen; niemals in Chat, GitHub, Drive, Airtable oder Live-Website. Danach kann der Assistant den Startcheck aktivieren und Logs auswerten. Eine spätere Cloud-Run-Lösung ohne langfristigen Schlüssel bleibt sicherere Zieloption. Noch keine Entscheidung durch technisch automatischen Key-Import erzwungen.

Detailliertes Prüf-/Betriebsverfahren: [LSZH_GOOGLE_ARCHIVE_READER_RENDER_STAGING_20261015.md](./LSZH_GOOGLE_ARCHIVE_READER_RENDER_STAGING_20261015.md). Live-Website, produktive Mail-/Annahmeszenarien, AVV- oder Rechtsfreigaben unverändert. **Keine erfolgreiche echte Google-Dienstkonto-Authentifizierung behaupten, bevor Staging-Check PASS erreicht.**
