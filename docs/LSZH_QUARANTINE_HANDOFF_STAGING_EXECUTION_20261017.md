# LSZH – Quarantäne-Handoff Staging, kontrollierte Bereitstellung (17.10.2026)

## Geltungsbereich / Genehmigung
Freigabe des Geschäftsführers im Projektchat: private Cloud-Run-Verbindung, Identitätsprüfung, persistenter Firestore-Replay-Schutz und ausschliesslich synthetischer End-to-End-Test. **Nicht genehmigt:** produktive Kundenverarbeitung, automatische Verträge, E-Mails, Einladungen, Website-/Main-Deploy, fremde Cloud-Projekte, Datenmigration oder pauschale IAM-Rechte.

## Implementiert im ungemergten Review-Branch
- `quarantine-handoff-receiver.js`: separates HTTP-Ziel, nur `POST /internal/quarantine/handoff`, max. 2048 Bytes, exact Content-Type/Length, **Standard 503**, keine verändernde Quarantäne-Fall-Operation und kein E-Mail-Sender.
- `quarantine-handoff-replay-runtime.js`: **nur** nach HMAC-Verifikation eine einzelne atomare `exists:false`-Firestore-Claim-Anlage in `lszh-quarantine-staging/lszh_quarantine_handoff_replay_staging`, danach eigenes GET + exakter Ack-/Readback-Abgleich. Laufzeit-Dienstkonto ist `lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com`. **Ein unsicheres Resultat bleibt blockiert; keine Wiederholung.** Die neue Collection wird physisch erst beim erstmaligen (separat ausgeführten) Claim erstellt.
- `quarantine-handoff-source.js`: bereits bestehende Read-only Firestore-Outbox und Airtable-Freshness-Checks vor dem Senden. Nur streng erlaubte synthetische IDs/Codes. Quellidentität `lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com`. Abfrage eines echten Google-Signed-OIDC-ID-Tokens vom Compute Metadata Server für die **genaue Cloud-Run-Basis-URL**, max. eine HTTPS-POST-Anfrage; keine Retry-, Scheduler- oder E-Mail-Funktion.
- `quarantine-handoff-source-once.js`: standardmässig gesperrter One-shot-Cloud-Run-Job-Einstiegspunkt. Kein Job erstellt/gestartet.
- Eigene Dockerfiles für Quell-Job und Ziel-Service, Quarantäne-Cloud-Build-Konfiguration und streng getrennter Cloud-Shell-Provisionierungsablauf.
- Synthetische Tests benutzen Mocks für Firestore/Metadata/OIDC/Airtable/HTTPS. **Sie beweisen nicht die reale Cloud-Run-IAM-/Firestore-Verbindung.**

## Google-Cloud-Deployment: noch NICHT ausgeführt
In der aktuellen ChatGPT-Laufzeit ist weder `gcloud` mit der LSZH-Identität noch eine verbundene Google-Cloud-Run-/IAM-Verwaltungsschnittstelle verfügbar. Der Chat konnte daher nur Code/Tests/Runbook im GitHub-Review-Branch erstellen, **keinen** realen Service, Secret, Invoker, Job oder echten Replay-Claim. Das ist ein externer Ausführungsschritt in der bestehenden geschäftlichen Cloud Shell.

Schrittweise Cloud Shell, **jedes Kommando nach seinem Ausgang prüfen**:

```bash
cd ~/lszh-automations-work
git switch feature/onboarding-notification-outbox-20261016
git pull --ff-only
bash workers/onboarding-notifications/staging-quarantine-handoff-provision.sh --plan
```

Nach erfolgreichem Preflight (nur `lars@lszh-automations.ch`, Projekt `lszh-automations`, Branch clean, Region `europe-west6`, bestehende getrennte Dienstkonten und benannte DB):

```bash
bash workers/onboarding-notifications/staging-quarantine-handoff-provision.sh --build-only
bash workers/onboarding-notifications/staging-quarantine-handoff-provision.sh --deploy-private-disabled
bash workers/onboarding-notifications/staging-quarantine-handoff-provision.sh --bind-invoker
bash workers/onboarding-notifications/staging-quarantine-handoff-provision.sh --create-secret
bash workers/onboarding-notifications/staging-quarantine-handoff-provision.sh --enable-review-only
```

Das Skript besitzt pro Aufruf exakt einen Modus, überprüft die Geschäftsidentität und den unveränderten Remote-Branch, verwendet ein **gesondertes erlaubtes Build-Verzeichnis**, verweigert Überschreiben eines bestehenden Ziel-Service, richtet keine öffentliche IAM-Freigabe ein und beschränkt `run.invoker` auf das eine Quell-Servicekonto am Ziel-Service. Das HMAC-Secret wird **nur lokal zufällig generiert** und über stdin an Secret Manager übertragen; keine Schlüsseldatei, kein Secret-Payload in Repo, Chat oder Logs. Cloud Run bezieht Version 1 als Secret-Env-Binding. Falls ein Schritt stoppt, nicht blind wiederholen; Istzustand vor erneutem Handeln lesen.

**Sicherheitsgrenze:** Der Code-Parser meldet immer `authenticated:false`. Die tatsächliche Identitätskontrolle muss vor dem Container-Aufruf von **Google Cloud Run IAM** erzwungen werden. Ein gültiges HMAC allein erlaubt nie einen Firestore-Case-Write oder eine E-Mail. Dienstgebundenes `roles/run.invoker` und die private Cloud-Run-Einstellung sind erforderlich, unabhängig von HTTP-Headers. Die Bereitstellung prüft die direkte Service-IAM-Policy; zusätzlich sollten geerbte IAM- und Organisationsfreigaben read-only inspiziert werden.

## Realer synthetischer End-to-End-Lauf – verbleibende Vorbedingungen
Vor dem ersten einmaligen Quell-Job die tatsächlich vorhandenen *synthetischen* Outbox-Draft-ID, dazugehörigen Airtable-Projektcode, enge Fixture-Allowlist und Read-only-Secret `lszh-airtable-readonly-staging` **im Geschäftskonto** verifizieren. Der Projektcode ist ein Bearer-Wert: nie in GitHub, Shell-History, Chat, CLI-Argumente oder Logs schreiben. Auch die Quellidentität braucht gezielte `secretmanager.versions.access` nur für die bereits freigegebenen relevanten Staging-Secrets. Ein neuer Quell-Job muss mit `--max-retries=0`, exakt einer Task und ohne Scheduler eingerichtet werden. Für diese Schritte existiert noch **kein automatisch ausgeführter Deploy-/Job-Run**, und es darf kein beliebiger vorhandener Job oder früherer One-shot-Runner erneut gestartet werden.

Nach tatsächlicher Cloud-Ausführung getrennt belegen: a) private Empfänger-URL und `--no-allow-unauthenticated`, b) servicegebundene einzige Source-Invoker-Freigabe, c) Secret-Zugriffe ohne Payload, d) genau ein `202 STAGING_REVIEW_ONLY` und eine Firestore-Claim-Readback-Version, e) zweite identische signierte Nachricht endet blockiert; f) keinerlei Quarantäne-Case-Commit, Mail, Vertrag oder Kundenaktivierung. Vorher bleibt der echte Cloud-End-to-End-Nachweis **offen**.

## Aufbewahrung
Replay-Claims werden derzeit nicht automatisch gelöscht/TTL-behandelt, damit ein altes Nonce nicht wieder frei wird. Retention, Kosten und ein revisionssicherer manueller Bereinigungsweg bleiben eigenständige Freigabepunkte. Keine bestehende Revision-2-Quarantäne-Test-Fixture verändern.
