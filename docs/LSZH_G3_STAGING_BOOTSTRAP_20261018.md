# LSZH Automations – G3 Ein-Skript-Staging-Bootstrap (Draft)

**Stand:** 18.10.2026. **Keine Ausführungsfreigabe und kein Deployment erfolgt.**
**Projekt:** `lszh-automations`, **Region:** `europe-west6`.
**GitHub:** nur Draft PR #5, nicht merge-/produktionsfreigegeben.

## Zweck in einfachen Worten

Der Betreiber soll nach einer **gesonderten ausdrücklichen Freigabe** nicht sechs verschiedene Cloud-Run-/IAM-/Pub/Sub-Befehle händisch verstehen und eintippen müssen. Das Skript `scripts/g3-staging-bootstrap.mjs` kann den Ablauf in einer Aufrufsequenz ausführen. **Standard: `--plan` ohne jede Änderung.**

Die geplante erste Installation ist nur die **isolierte Transport-Teststrecke**, **keine** vollständige Offerten-/Firestore-/Make-Integration:

1. Dediziertes `lszh-g3-push-stg`-Dienstkonto für den Pub/Sub-OIDC-Push.
2. Getrenntes `lszh-g3-reserve-stg`-Runtime-Dienstkonto **ohne** Firestore-Rechte (erst eigene Freigabe).
3. Ein Pub/Sub-Topic `lszh-g3-review-staging`, mit Speicherregion `europe-west6`.
4. Ein separat gebautes und **auf SHA-256-Digest festgepinnte** private Cloud-Run-Container-Image für den ausdrücklich review-/canary-only Receiver `lszh-g3-review-staging`. Cloud Run `ingress=internal`, **IAM-Prüfung aktiv**, keine anonyme Invoker-Bindung, `min-instances=0`, `max-instances=1`.
5. Genau **ein** `roles/run.invoker`-Grant an den Push-SA **auf diesem neuen Cloud-Run-Service**, nicht auf dem Projekt/anderen Diensten.
6. Eine OIDC-authentifizierte Push-Subscription `lszh-g3-review-staging`, nur mit der geprüften default `https://…run.app/g3-review`-Route im selben Projekt; Token-Audience ist die URL **ohne Pfad**.

Es werden **kein** Make-OAuth-Client, **kein** Make-Publisher-Grant, **keine** Firestore-Datenbankrolle, **kein** zusätzlicher TokenCreator-Grant, **keine** Service-Account-Keys, **keine** APIs-Aktivierung und **keine** bestehenden Cloud-/Quarantäne-Dienste geändert. Dieser Transport kann im nächsten gesonderten Test höchstens eine feste synthetische CANARY-Nachricht quittieren. Er ist **kein** Beleg-/Vertrags-/Statusdienst.

## Technisches Sicherheitsmodell des Skripts

- **`--plan` ist Default.** Ruft ausschliesslich die schon prüfbar lesenden Google-SDK-Kommandos aus den G3-Inventur-/Rollen-Checkern sowie `services list --enabled` für Artifact Registry auf. Ergebnis bleibt `releaseStatus=NO_GO`. Ohne Google-Credentials wird fail-closed `BLOCKED` ausgegeben, niemals etwas angelegt.
- **`--apply` ist NICHT freigegeben.** Zukunftspfad erfordert **drei voneinander unabhängige Bedingungen**: a) eine **explizite neue, separat dokumentierte Betreiberfreigabe** für die G3-only-Ressourcen, b) den exakten zukünftigen Operator-Approval-Parameter `--approval=LSZH_G3_SYNTHETIC_PRIVATE_TRANSPORT_ONLY`, c) `--image=` mit **bereits unabhängig geprüftem, unveränderlichem `europe-west6-docker.pkg.dev/lszh-automations/...@sha256:<64 hex>`-Image**. Zusätzlich werden vorher alle geplanten G3-Namen auf Nichtvorhandensein, die aktivierten benötigten APIs, Rolle/Bedingung, **geschäftliche Cloud-Shell-Identität** und das im Artifact Registry tatsächlich vorhandene Image kontrolliert.
- **Image-Herkunft noch NICHT abgeschlossen:** Der Quellcode/Dockerfile liegt unter `cloud-run/g3-review-staging/`. Der Container wurde **noch nicht** gebaut, hochgeladen, gescannt oder als Digest freigegeben. Das Skript baut ihn **bewusst nicht automatisch**: Unbeabsichtigtes Aktivieren von Cloud Build oder Erstellen eines Artifact-Registry-Repositories ist verboten. Vor `--apply` ist dafür ein **separat abgesegneter Build-/Provenance-/Image-Scan-Nachweis** nötig. Falls Artifact Registry noch nicht aktiviert ist, meldet `--plan` dies als Blocker statt `gcloud services enable` auszuführen.
- **Fehlschläge:** Das Skript stoppt ohne automatische Lösch-/IAM-„Reparatur“ und meldet `PARTIAL_APPLY_HALTED`; danach den tatsächlich entstandenen Istzustand **nur lesen** und gegen den Rückbauplan prüfen. Keine automatische Cloud-Ressourcenbereinigung, die fremde oder bereits vorhandene Daten vernichten könnte.
- **Vertraulichkeit:** Die Anwendungslogik loggt keine Nachrichteninhalte oder Personendaten. Provider-Fehlerdetails und Credentials werden nicht im Chat oder im Runner-Kurzbericht ausgegeben; Google Audit Logs existieren trotzdem. `--plan` kann in der Cloud Shell Projektinformationen lesen, gibt jedoch nur kontrollierte Bestands- und Gate-Statusfelder aus.

## Empfänger: klar begrenzter Test

`cloud-run/g3-review-staging/index.mjs` ist ein Node-HTTP-Dienst **ohne zusätzliche Abhängigkeiten und ohne Cloud-SDKs**. `POST /g3-review` akzeptiert **nur** eine streng fixierte synthetische Pub/Sub-Envelope mit `fixtureId=LSZH_G3_CANARY_NO_CONTRACT_20261018`, `syntheticOnly=true`, `schemaVersion=1` und `kind=LSZH_G3_PRIVATE_PUSH_CANARY_V1`. Nur dieser Test erhält **HTTP 204**, ohne eine Datenbank, Google Docs, Airtable oder E-Mail zu berühren. Jede andere Pub/Sub-Envelope endet mit HTTP 503. Alle Kunden-/Offer-/Mail-/PDF-/Vertragsrouten sind nicht implementiert.

**Wichtig:** Bei einem irrtümlichen echten Publish würde die 503-Antwort Pub/Sub zu wiederholter Zustellung bewegen und Gebühren bzw. eine Warteschlange erzeugen. Deshalb **kein** echtes Topic-Publisher-Recht und **keine** Make-Verbindung in dieser Bootstrap-Phase. Retry/Dead-letter-Aufbau und spätere Firestore-Idempotenz benötigen eine gesonderte Betriebsentscheidung.

## Reihenfolge nach Freigabe, noch nicht jetzt ausführen

1. **Abnahmepaket:** Finanzielle Obergrenze, Audit-/Rollback-Verantwortlicher, Image-Scan/sha256, Cloud-Run-Source-Code-Review, Artifact-Registry-API/Repo und geschäftlicher Operator bestätigen.
2. **Nicht mutierender Operatorcheck:** Der Betreiber kann später den bestehenden Featurebranch in temporärer Cloud Shell klonen und `node scripts/g3-staging-bootstrap.mjs --plan` ausführen. Voraussetzung: geschäftliche Cloud Shell und gcloud. Ein `BLOCKED`- oder `UNKNOWN`-Wert ist **kein Anlass**, selbst Rollen zu erhöhen.
3. **Gesonderter Change-Approval** für das tatsächlich mit Digest bereitgestellte Test-Image und die sechs G3-Aktionen. Erst anschliessend darf der Betreiber einmalig `--apply` mit dem genehmigten SHA-Digest und Approval-String ausführen. Keine aus dem Chat ohne Nutzerhandlung ausgelöste Schreibaktion.
4. **Readback:** Private Cloud-Run-URL, effektive `roles/run.invoker`-Zuweisung, keine anonymen IAM-Mitglieder, Subscription-Konfiguration, Service-Agent-Token-Minting und Billing/Logging auslesen. Selbst `STAGING_CANARY_TRANSPORT_CREATED_NOT_PUBLISHED` bedeutet **keinen** Send-/Firestore-/Kunden-GO.
5. **Nächste separate Entscheidung** über Business-Google-OAuth, native Make-`messages[].data`-Kodierung und eine einzige künstliche, signierte Push-Zustellung. Make-Szenario `7940220` bleibt bis dahin inaktiv und durch `0=1` gesperrt.

## Unabhängige Checks

- `test/g3StagingBootstrap.test.js`: nicht genehmigte CLI-Eingaben, fremde Projekte/Images, vorhandene Zielressourcen, überschrittene IAM-/Netzwerk-/Datenrechte, privater Ingress, fehlender SHA-Digest.
- `test/g3CanaryReceiver.test.js`: erlaubte künstliche CANARY, verweigerte echten/fehlerhaften Events, keine Kunden- oder Dokumentenrouten, Request-Limit.
- Laufende CI muss Syntax und komplette Offline-Suite inklusive Emulator, Chromium und build-only Portal prüfen; **keine** GitHub-Action hat GCP-Serviceaccount-Keys oder Schreibrechte.

## Offizielle Google-Referenzen

- https://docs.cloud.google.com/sdk/gcloud/reference/iam/service-accounts/create
- https://docs.cloud.google.com/sdk/gcloud/reference/pubsub/topics/create
- https://docs.cloud.google.com/sdk/gcloud/reference/pubsub/subscriptions/create
- https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy
- https://docs.cloud.google.com/sdk/gcloud/reference/run/services/add-iam-policy-binding
- https://docs.cloud.google.com/sdk/gcloud/reference/artifacts/docker/images/describe
- https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions
- https://docs.cloud.google.com/run/docs/securing/ingress

## Ergänzung 18.10.2026 – Kandidatenimage und zusätzliche IAM-Sperre

Der reproduzierbare synthetische Docker-Kandidatenbuild ist im Draft vorbereitet.
`cloud-run/g3-review-staging/base-image.candidate.json` sperrt den im
ersten GitHub-Job gelesenen Node-Basis-SHA über Läufe hinweg; der erste
und der nachfolgende Job bestätigten identische OCI-Manifeste. Das
nicht veröffentlichte OCI-Image hat **keinen Artifact-Registry-Digest**.
Evidenz, Grenzen und aktueller CI-Stand:
`docs/LSZH_G3_CANARY_IMAGE_BUILD_20261018.md`.

Bootstrap-`--apply` hat vor einer eventuellen Subscription jetzt
eine weitere fail-closed Stufe: Receiver-Readback lehnt auch vorhandene
fremde private Invoker und explizit abgeschaltete IAM-Prüfung ab.
Nach dem einzig vorgesehenen dienstbezogenen
`roles/run.invoker`-Grant prüft ein **zweites** Policy-Readback,
dass exakt und unbedingt ausschliesslich das G3-Push-SA den Invoker
besitzt. Fehler => `PARTIAL_APPLY_HALTED`, keine Subscription.
Das ist **keine** vollständige Effective-IAM-Prüfung. Keine Änderung
in Google Cloud ausgeführt; alle bestehenden NO-GO-Bedingungen gelten.

## Aktueller Image-Stand, 18.10.2026 (ersetzt die frühere Aussage «Image noch nicht gebaut»)

Das synthetische Canary-Image wurde inzwischen **ausschliesslich als lokaler CI-Kandidat** gebaut, zweimal reproduzierbar auf identischen OCI-Manifest-Digest geprüft, im isolierten Container gestartet und mit Trivy/CycloneDX gescannt. Es befindet sich **nicht** in Artifact Registry, wurde **nicht** gepusht, nicht deployed und nicht signiert. Die jüngste bereinigte Kandidatenversion besitzt den lokalen OCI-Manifest-Digest sha256:83e32f0966e511168af5c65e4179fb94f415388aaedf47a960e28f804412097c; dieser Wert darf **nicht** als GCP-Registry-Image-Digest ausgegeben werden.

Der npm-freie Runtimebuild hat im unabhängigen Nachscan 0 HIGH/CRITICAL, 1 MEDIUM (zlib CVE-2026-85091, Fix-Version laut Trivy 1.3.2-r1). Ein nachgelagerter CI-Gate verweigert HIGH/CRITICAL. Provenance bleibt unsigniert und der Bootstrap-`--apply`-Pfad ungeprüft für einen echten Change, deshalb **NO_GO**. Vor jedem GCP-Upload oder G3-Apply weiterhin die separate Betreiberfreigabe einholen. Siehe docs/LSZH_G3_IMAGE_RELEASE_GATES_20261018.md.

## Sicherheits-Override am 18.10.2026: `--apply` ist aktuell **unbedingt blockiert**

Die früher auf dieser Seite beschriebenen `--apply`-Voraussetzungen sind ausdrücklich nur die **zukünftig geplante** Installation. Der Bootstrap besitzt jetzt eine vorgeschaltete harte Releasesperre: `BLOCKED_G3_SIGNED_PROVENANCE_GATE` (vor jedem `gcloud`-Lese- oder Schreibaufruf, auch bei richtigem Approval-Text und passender SHA-Image-Referenz). Diese Sperre darf nicht nur durch den Approval-String umgangen werden. Sie bleibt bestehen, bis eine ausdrücklich separat genehmigte Implementierung den **vertrauenswürdig kryptografisch überprüften** Image-Herkunftsnachweis und einen echten Betreiber-Change belegt. Der rein lesende Standard-`--plan` bleibt unverändert.

Der aktuelle SHA-geprüfte Canary-OCI-Kandidat wird direkt via Trivy aus dem OCI-Layout gescannt und mit einem neuen unsignierten lokalen CI-Claim an Quell- und Scan-Hashes gekoppelt. Dies ist **kein** signierter, unabhängig beglaubigter Beweis und kein Artifact-Registry-Push. Details: `docs/LSZH_G3_PROVENANCE_AND_REGISTRY_GATES_20261018.md`.
