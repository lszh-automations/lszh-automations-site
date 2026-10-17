# LSZH – Quarantäne-Handoff Staging, kontrollierte Bereitstellung (17.10.2026)

## 17.10.2026 – Source-SA-Airtable-Secret-Probe wurde tatsächlich angelegt, null Executions

Cloud-Shell-Geschäftsführer-Ausgabe: `staging-outbox-secret-access-job.sh --create-only` legte `lszh-outbox-secret-access-probe-stg` in Projekt `lszh-automations`, Region `europe-west6` erfolgreich an. Das Skript bestätigte den **tatsächlich rückgelesenen Job**: exakt angeheftetes SHA-256-Image, Shell-Only statt Geschäftslogik, Outbox-Identität, Secret-Version 1, ein Task/keine Retries, **ZERO executions**. Dieser Job verändert keine alten Jobs, führt ohne gezieltes `gcloud run jobs execute` nichts aus. Als nächstes erlaubt ist der einzige kontrollierte Secret-Verfügbarkeitstest mit `gcloud run jobs execute lszh-outbox-secret-access-probe-stg --project=lszh-automations --region=europe-west6 --wait`. Bei unterbrochenem CLI-Wait oder Fehlermeldung nicht ein zweites Mal execute auslösen; vorher die eine Execution samt Exit/konstantem Log-Signal auslesen. Ein erfolgreicher Shell-Probe-Test bestätigt nur, dass Cloud Run die Secret-Version unter der Outbox-SA bereitstellen konnte, **nicht** Airtable-REST-/Firestore-/Receiver-E2E.


## 17.10.2026 – Outbox-Secret-Probe-Erstellung von Cloud Run Gen2 abgewiesen (Speichergrenze)

**Echte Geschäfts-Cloud-Shell-Ausgabe:** `staging-outbox-secret-access-job.sh --create-only` bestand erneut alle Identitäts-, Image-, Secret-IAM- und Job-Inventarprüfungen und versuchte den neuen, vom Bestandsbetrieb unabhängigen Job `lszh-outbox-secret-access-probe-stg` anzulegen. Google Cloud Run meldete jedoch **`Job failed to deploy`** und konkret `spec.template.spec.task_spec.containers[0].limits.memory: Invalid value ... Total memory < 512 Mi is not supported with gen2 execution environment with cpu always allocated (unthrottled)`. Das Skript brach fail-closed ab: `STOP: Cloud Run create failure or ambiguity. DO NOT retry; inspect Job metadata.`. **Kein erfolgreicher Job-Deploy nachgewiesen und keine Job-Ausführung erfolgt.** Ein zurückgebliebenes Job-Objekt kann nicht ohne erneuten Live-Readback ausgeschlossen werden.

**Korrektur nur im GitHub-Feature-Branch:** Job-Spezifikation von `--memory=256Mi` auf **`--memory=512Mi`** geändert; zusätzliche Regressionstest-Assertion verhindert die erneute 256Mi-Konfiguration. **Nächster Schritt: NUR lesen!** Cloud Shell `gcloud run jobs list --project=lszh-automations --region=europe-west6 --format="table(metadata.name)"` erneut ausführen und kontrollieren, ob `lszh-outbox-secret-access-probe-stg` trotz Fehler existiert. Bei Existenz keine Wiederholung von `--create-only` und separate Metadatenprüfung. Bei bestätigter Abwesenheit danach `git pull --ff-only` und neuer `--plan`-Durchlauf; erst bei PASS eine gesonderte Entscheidung über `--create-only`. **Keine weiteren IAM-Berechtigungen, keine Secret-Daten, keine Firestore-Operation oder produktive E-Mail.**

## 17.10.2026 – Vier vorhandene Jobs unverändert; neue Source-SA-Secret-Probe im Review-Branch

Die tatsächliche Cloud-Shell-Inventarliste enthält vier bestehende Jobs: `lszh-airtable-read-probe-fix-staging`, `lszh-airtable-read-probe-staging`, `lszh-firestore-read-probe-staging`, `lszh-firestore-write-probe-staging`. Ein Ausführen/Überschreiben wäre unnötig und könnte frühere Tests verändern.

Der neue isolierte `staging-outbox-secret-access-job.sh` prüft default read-only die Firmenidentität, unveränderten Branch, SHA-256-gepinnten bestehenden geprüften Container, die neue Outbox-Staging-SA, vorhandenes Version-1-Airtable-Secret, exakt die zwei bekannten direkten Accessors und die Abwesenheit des neuen Jobnamens. `--create-only` erstellt bei ausdrücklichem gesonderten Cloud-Shell-Ausführungsentscheid den Job `lszh-outbox-secret-access-probe-stg` mit `/bin/sh`-Entrypoint-Override, Shell-Kommando **nur nichtleere Secret-Env-Präsenz**, 1 Task, null Retries, Secret-Version 1, keinen Mail-/Airtable-/Firestore-/Handoff-Aufruf und **führt ihn nicht aus**. Die Cloud-Run-Spezifikation wird nach Erstellung rückgelesen; ein unbekannter Zustand blockiert jede Ausführung. Auch nach Job-Anlage ist ein separat kontrollierter Einmallauf erforderlich. Bestehende Jobs und Empfänger bleiben unverändert.

**Zuerst in Cloud Shell:**
```bash
cd "$HOME/lszh-handoff-staging"
git pull --ff-only
bash workers/onboarding-notifications/staging-outbox-secret-access-job.sh --plan
```

Erst wenn dessen PASS-Ausgabe vorliegt, `--create-only` separat erwägen. Der IAM Troubleshooter bleibt wegen fehlender Org-Deny-Leserechte auf `UNKNOWN_INFO`; kein zusätzlicher Grant oder Adminrollen erforderlich.

## 17.10.2026 – Direktes Airtable-Secret-IAM der Outbox-Quelle aktualisiert

Vom Geschäftsführer in Cloud Shell bestätigter `roles/secretmanager.secretAccessor`-Grant am einzelnen Staging-Airtable-Secret: die Policy enthält nun den ursprünglichen Airtable-Testdienst und das Outbox-Staging-Dienstkonto. Der Secret-Wert wurde nicht gelesen, und es fand kein Source-Job-Lauf statt. Nächste rein lesende Kontrolle: IAM Policy Troubleshooter für das Quell-Dienstkonto, die konkrete Secret-Version 1 und `secretmanager.versions.access`. Bei anderem Ergebnis als `CAN_ACCESS` keine Testausführung.


## 17.10.2026 – Source-Airtable-Secret: Effektives Recht fehlt, gezielte Freigabe erforderlich

Echter IAM Policy Troubleshooter für `secretmanager.versions.access` auf der **Version 1** des bestehenden `lszh-airtable-readonly-staging`-Secrets und Principal `lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com` meldete **`CANNOT_ACCESS`**. Diese Permission steht dem geprüften Outbox-Dienstkonto somit nicht zur Verfügung. Vorbefund: keine direkte Secret-Level-Rolle und auf Projektebene ausschliesslich bedingtes `roles/datastore.user`. Das Airtable-Secret ist `ENABLED`.

**Nächster geplanter IAM-Einzelschritt (nicht autonom in Chat ausgeführt):** `gcloud secrets add-iam-policy-binding lszh-airtable-readonly-staging --project=lszh-automations --member=serviceAccount:lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor`. Dies ist eine **schreibende** IAM-Berechtigungsänderung, beschränkt auf dieses Secret. Danach die direkte IAM-Policy **nur lesend** prüfen und den versiongenauen IAM Troubleshooter erneut ausführen. Erst bei bestätigtem `CAN_ACCESS` die restlichen Quell-Job-/synthetischen Testvoraussetzungen planen. Keine Schlüsselwerte ins Chatprotokoll oder Repository kopieren.

## 17.10.2026 – Tatsächlicher Live-Postflight PASS; Übergang zur Quelle

Cloud Shell meldete nach `--verify-review-only` **PASS** für: live Revision `00002-ttf` mit originalem `staging-131d67982f83`-Image, alle neun Staging-Werte einschliesslich Secret-Env-Referenz, direkte private Source-Invoker-IAM-Policy und zwei HMAC-Secret-Level-Accessors (Version 1 aktiviert). Ergebnis ausdrücklich **READ ONLY**, keine Secret-Payload-Abfrage, kein Firestore- oder Kundendatenzugriff. Die Empfängerseite ist damit konfiguriert; effektive Quelle→Ziel-Interaktion ist noch ungetestet.

**Nächste sinnvolle Entscheidung zur Quellseite:** Ermitteln, ob das dedizierte Outbox-Quellkonto bereits gezielt zum Lesen des bestehenden `lszh-airtable-readonly-staging`-Secrets autorisiert ist. `gcloud secrets get-iam-policy` ist ein Metadatenaufruf und gibt keinen Secret-Wert zurück. Leere Service-spezifische Bindung beweist **nicht**, dass übergeordnete IAM-Berechtigungen fehlen. Keine vorschnellen IAM-Änderungen oder Quelljobs; vor dem echten E2E-Test sind sicher synthetische Draft-Fixture, ausgegrenzter Projektcode, Firestore-Scopes, genau ein Job (Retries 0), echter Identity-Token und HMAC-Vergleich zu prüfen.

## 17.10.2026 – Receiver wurde aktiviert; nur read-only Postflight als nächster Schritt

Cloud-Run-Meldung nach freigegebenem `--enable-review-only`: Revision **`lszh-quarantine-handoff-staging-00002-ttf`** erstellt, **100 % Traffic**, URL unverändert. Das Script meldete `PASS: Private review-only receiver configured. No source dispatcher launched.`. Der HMAC-Schlüssel ist als Secret-Env-Referenz konfiguriert, die drei Staging-Review-Schalter wurden auf `true` aktualisiert. Dies ist noch **kein realer synthetischer End-to-End-Test**.

Nächster Schritt prüft die tatsächliche Revision unabhängig **nur lesend**, ohne Secret-Inhalt oder Kundendaten:

```bash
cd "$HOME/lszh-handoff-staging"
git pull --ff-only
bash workers/onboarding-notifications/staging-quarantine-handoff-provision.sh --verify-review-only
```

Erwartet wird ein PASS für die exakte live Revision, Image, acht operative Werte und den einzelnen HMAC-Secret-Referenzwert, sowie ein zweites PASS für privaten direkten Invoker und genau zwei Secret-Level-Accessor-Dienstkonten. `--enable-review-only` nicht wiederholen. Nach einem sauberen Postflight steht der **streng synthetische Quell-Job/E2E-Test** weiterhin aus; er benötigt zuvor enge Staging-Fixture- und Secret-Prüfungen, keine pauschale Runner-Wiederholung oder produktive Mails.

## 17.10.2026 – STAGING-HMAC-Secret und eng begrenzte Accessors tatsächlich erstellt

Die Cloud Shell des Geschäftsführers bestätigte `--create-secret` als **PASS**: `lszh-stg-quarantine-handoff-hmac` neu in Secret Manager erstellt, Version **1** angelegt, Secret-IAM-Policy zweimal aktualisiert, genau die vorgesehenen Source- und Destination-Servicekonten erhielten Zugriff auf **dieses einzelne Secret**. Der CSPRNG-HMAC-Schlüssel liegt nicht in Chat, GitHub oder Logs. **Nicht** nochmals `--create-secret` ausführen (Skript lehnt bereits existierendes Secret ab).

**Nächster getrennter Schritt:** Im Checkout nach `git pull --ff-only` `bash workers/onboarding-notifications/staging-quarantine-handoff-provision.sh --enable-review-only`. Das Kommando überprüft erneut direkte private Invoker-IAM-Bindung und Secret-Version, setzt nur den neuen Receiver auf `REVIEW_ONLY` mit einer Secret-Env-Referenz. Dieser Schritt **erstellt eine neue Cloud-Run-Revision** und erlaubt dem Empfänger bei später eingehender HMAC-validierter, Cloud-IAM-authentifizierter synthetischer Anforderung einen atomaren Firestore-Replay-Claim; **der synthetische Source-Job wird damit nicht gestartet**. Nach dem Befehl Revision, Secret-Bindung und weiterhin private IAM-Prüfung separat bestätigen; bei Fehler keine pauschale Wiederholung. Kein Kundenmail- oder Vertragsabschluss-Transport vorhanden.

## 17.10.2026 – Read-only-Postflight und direkte Invoker-IAM-Bindung bestätigt

**Vom Geschäftsführer tatsächlich ausgeführt:** `--verify-disabled` hat die reale Image-Version, alle deaktivierten Receiver-Gates, dediziertes Ziel-Dienstkonto und fehlende direkte öffentliche IAM-Invoker-Bindungen mit zwei PASS-Meldungen bestätigt. Anschliessend `--bind-invoker`: Google Cloud Run meldete `Updated IAM policy for service [lszh-quarantine-handoff-staging]`; der nachgelagerte Check meldete `PASS: Only source SA has direct service-level run.invoker grant.`. Das berechtigt ausschliesslich das separate Outbox-Staging-Servicekonto direkt am Receiver, **nicht** die Öffentlichkeit. Keine andere Service-IAM-Bindung wurde durch diesen Aufruf erzeugt. Geerbte/org-seitige Berechtigungen wurden nicht nachgewiesen.

**Als Nächstes nur ein einzelner Secret-Schritt im Cloud-Shell-Checkout:**

```bash
cd "$HOME/lszh-handoff-staging"
git pull --ff-only
bash workers/onboarding-notifications/staging-quarantine-handoff-provision.sh --create-secret
```

Dieser Modus erstellt `lszh-stg-quarantine-handoff-hmac` und eine neue Version mit **32 zufälligen Bytes, kanonisch Base64 kodiert**, vergibt die auf **dieses** Secret beschränkte `roles/secretmanager.secretAccessor`-Rolle für Quell- und Ziel-Servicekonten und liefert keine Payload in die Ausgaben. Der Schritt **aktiviert weder HTTP noch Firestore-Replay-Claims oder E-Mail-Versand**. Falls er mit Fehler endet: keine blinde Wiederholung, zuerst Secret/IAM-Metadaten prüfen. `--deploy-private-disabled` und `--bind-invoker` nicht wiederholen.

## Geltungsbereich / Genehmigung
Freigabe des Geschäftsführers im Projektchat: private Cloud-Run-Verbindung, Identitätsprüfung, persistenter Firestore-Replay-Schutz und ausschliesslich synthetischer End-to-End-Test. **Nicht genehmigt:** produktive Kundenverarbeitung, automatische Verträge, E-Mails, Einladungen, Website-/Main-Deploy, fremde Cloud-Projekte, Datenmigration oder pauschale IAM-Rechte.

## Implementiert im ungemergten Review-Branch
- `quarantine-handoff-receiver.js`: separates HTTP-Ziel, nur `POST /internal/quarantine/handoff`, max. 2048 Bytes, exact Content-Type/Length, **Standard 503**, keine verändernde Quarantäne-Fall-Operation und kein E-Mail-Sender.
- `quarantine-handoff-replay-runtime.js`: **nur** nach HMAC-Verifikation eine einzelne atomare `exists:false`-Firestore-Claim-Anlage in `lszh-quarantine-staging/lszh_quarantine_handoff_replay_staging`, danach eigenes GET + exakter Ack-/Readback-Abgleich. Laufzeit-Dienstkonto ist `lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com`. **Ein unsicheres Resultat bleibt blockiert; keine Wiederholung.** Die neue Collection wird physisch erst beim erstmaligen (separat ausgeführten) Claim erstellt.
- `quarantine-handoff-source.js`: bereits bestehende Read-only Firestore-Outbox und Airtable-Freshness-Checks vor dem Senden. Nur streng erlaubte synthetische IDs/Codes. Quellidentität `lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com`. Abfrage eines echten Google-Signed-OIDC-ID-Tokens vom Compute Metadata Server für die **genaue Cloud-Run-Basis-URL**, max. eine HTTPS-POST-Anfrage; keine Retry-, Scheduler- oder E-Mail-Funktion.
- `quarantine-handoff-source-once.js`: standardmässig gesperrter One-shot-Cloud-Run-Job-Einstiegspunkt. Kein Job erstellt/gestartet.
- Eigene Dockerfiles für Quell-Job und Ziel-Service, Quarantäne-Cloud-Build-Konfiguration und streng getrennter Cloud-Shell-Provisionierungsablauf.
- Synthetische Tests benutzen Mocks für Firestore/Metadata/OIDC/Airtable/HTTPS. **Sie beweisen nicht die reale Cloud-Run-IAM-/Firestore-Verbindung.**

## Google-Cloud-Deployment – Build und erster Receiver-Deploy real ausgeführt

**Vom Geschäftsführer in der geschäftlichen Cloud Shell ausgeführt und durch Output belegt, 17.10.2026:**
1. Eigener sauberer Checkout `$HOME/lszh-handoff-staging` auf `feature/onboarding-notification-outbox-20261016`; erster `--plan` prüfte Firmenkonto, Projekt, beide Service-Accounts, Datenbank und Registry erfolgreich und bestätigte **Receiver vor Deployment nicht vorhanden**.
2. `--build-only`: Google Cloud Build `6ec75cce-2fe2-4e35-a729-f10f45e6273e`, **STATUS SUCCESS**; gepushtes Image `europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-quarantine-handoff:staging-131d67982f83`.
3. `--deploy-private-disabled`: Google Cloud Run meldete **Deploying new service Done**, Revision **`lszh-quarantine-handoff-staging-00001-qs8`**, **100 % Traffic** auf dieser Revision, URL `https://lszh-quarantine-handoff-staging-470613067122.europe-west6.run.app`. Das Skript hat die Parameter `--no-allow-unauthenticated`, dediziertes Ziel-SA und alle drei Verarbeitungsgates `false` übergeben; ein unabhängiger nachgelagerter Cloud-Readback ist **noch erforderlich**.
4. **Bekannter False Negative:** Das alte Skript meldete **`STOP: Receiver not deployed.`**, obwohl Google Cloud Run die erfolgreiche neue Revision bestätigt hatte. Ursache: Die Service-Inventarliste wurde nur **vor** dem Deploy eingelesen und für den Post-Deploy-Check fälschlich erneut verwendet. Das war ein lokaler Verifikationsfehler, **kein Nachweis eines Rollbacks**. `staging-quarantine-handoff-provision.sh` wurde auf frisch gelesene Inventare je Check, strikten Abbruch bei Listenfehlern und vier synthetische Mock-Regressionstests korrigiert. **433/433 synthetische Tests PASS**, beide GitHub-CI-Workflows bestanden auf Test-Commit `642b6092af8a1aad731d021cb30e19055f551b27` (einschliesslich separater, rein lesender Empfänger-Konfigurationsprüfung).

**Unbedingt NICHT wiederholen:** `--build-only` und besonders `--deploy-private-disabled`. Der Dienst existiert bereits und darf nicht ohne gezielte Änderung überschrieben werden.

**Nächster ausschliesslich lesender Schritt nach `git pull --ff-only` in der Cloud Shell:**

```bash
cd "$HOME/lszh-handoff-staging"
git pull --ff-only
bash workers/onboarding-notifications/staging-quarantine-handoff-provision.sh --verify-disabled
```

Erwartet werden `PASS: New receiver exists, expected reviewed image and all disabled gates verified.` sowie ein zweiter PASS zur dedizierten Zielidentität und nichtöffentlichen direkten IAM-Policy. Dieser Modus überprüft **tatsächliche** Cloud-Run-Daten, ohne den Dienst zu verändern oder Secrets auszugeben. Wenn er stoppt, keine Freigabe- oder Secret-Schritte starten. Erst dann folgt eine **separate** `--bind-invoker`-Ausführung für exakt das Source-SA, danach HMAC-Secret, eng begrenzte Secret-Reader-Rechte und `--enable-review-only`. **Kein** Quell-Job erstellt/ausgeführt, **kein** Firestore-Replay-Claim, **keine** E-Mails, keine Quarantäne-Fallmutation.

**Sicherheitsgrenze:** Der Code-Parser meldet immer `authenticated:false`. Die tatsächliche Identitätskontrolle muss vor dem Container-Aufruf von **Google Cloud Run IAM** erzwungen werden. Ein gültiges HMAC allein erlaubt nie einen Firestore-Case-Write oder eine E-Mail. Dienstgebundenes `roles/run.invoker` und die private Cloud-Run-Einstellung sind erforderlich, unabhängig von HTTP-Headers. Auch geerbte IAM- und Organisationsfreigaben sind vor Inbetriebnahme gesondert lesend zu prüfen.

## Realer synthetischer End-to-End-Lauf – verbleibende Vorbedingungen
Vor dem ersten einmaligen Quell-Job die tatsächlich vorhandenen *synthetischen* Outbox-Draft-ID, dazugehörigen Airtable-Projektcode, enge Fixture-Allowlist und Read-only-Secret `lszh-airtable-readonly-staging` **im Geschäftskonto** verifizieren. Der Projektcode ist ein Bearer-Wert: nie in GitHub, Shell-History, Chat, CLI-Argumente oder Logs schreiben. Auch die Quellidentität braucht gezielte `secretmanager.versions.access` nur für die bereits freigegebenen relevanten Staging-Secrets. Ein neuer Quell-Job muss mit `--max-retries=0`, exakt einer Task und ohne Scheduler eingerichtet werden. Für diese Schritte existiert noch **kein automatisch ausgeführter Deploy-/Job-Run**, und es darf kein beliebiger vorhandener Job oder früherer One-shot-Runner erneut gestartet werden.

Nach tatsächlicher Cloud-Ausführung getrennt belegen: a) private Empfänger-URL und `--no-allow-unauthenticated`, b) servicegebundene einzige Source-Invoker-Freigabe, c) Secret-Zugriffe ohne Payload, d) genau ein `202 STAGING_REVIEW_ONLY` und eine Firestore-Claim-Readback-Version, e) zweite identische signierte Nachricht endet blockiert; f) keinerlei Quarantäne-Case-Commit, Mail, Vertrag oder Kundenaktivierung. Vorher bleibt der echte Cloud-End-to-End-Nachweis **offen**.

## Aufbewahrung
Replay-Claims werden derzeit nicht automatisch gelöscht/TTL-behandelt, damit ein altes Nonce nicht wieder frei wird. Retention, Kosten und ein revisionssicherer manueller Bereinigungsweg bleiben eigenständige Freigabepunkte. Keine bestehende Revision-2-Quarantäne-Test-Fixture verändern.
