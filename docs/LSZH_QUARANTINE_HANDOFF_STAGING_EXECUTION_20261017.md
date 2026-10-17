# LSZH – Quarantäne-Handoff Staging, kontrollierte Bereitstellung (17.10.2026)

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
