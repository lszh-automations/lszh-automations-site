# LSZH – genehmigte private Cloud-Run-STAGING-Bereitstellung: Runbook

**15.10.2026. Nutzerfreigabe:** Ausschliesslich *neuer* Service `lszh-offer-acceptance-staging` in Projekt `lszh-automations`, Region `europe-west6`, mit bestehendem `lszh-offer-reader@lszh-automations.iam.gserviceaccount.com`. Nur fest codierter synthetischer **Firestore-GET**, interne Ingress-Policy, Cloud-Run-Authentifizierung erforderlich; weder Vertrag noch Mail, Make, Airtable, Firestore-Write, IAM-Neuzuweisung oder Änderung bestehender Services.

**WICHTIG:** Das ChatGPT-GitHub-Tool kann Code/CI pflegen, hat aber keinen Zugriff auf die Google-Cloud-Control-Plane. Die nachfolgenden Google-Cloud-Befehle müssen vom autorisierten Benutzer in **Cloud Shell** ausgeführt werden; diese Datei führt sie niemals selbst aus.

## A. Read-only Preflight – immer ZUERST

```bash
set -euo pipefail
PROJECT=lszh-automations
REGION=europe-west6
SERVICE=lszh-offer-acceptance-staging
READER=lszh-offer-reader@lszh-automations.iam.gserviceaccount.com

echo '=== active account/project ==='
gcloud auth list --filter=status:ACTIVE --format='value(account)'
gcloud config get-value project
echo '=== target reader ==='
gcloud iam service-accounts describe "$READER" --project="$PROJECT" --format='yaml(email,disabled)'
echo '=== existing source artifact registry repository ==='
gcloud artifacts repositories describe cloud-run-source-deploy --location="$REGION" --project="$PROJECT" --format='value(name)'
echo '=== enabled service APIs ==='
for api in run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com; do
  echo "$api: $(gcloud services describe "$api" --project="$PROJECT" --format='value(state)')"
done
echo '=== dedicated reader IAM condition ==='
gcloud projects get-iam-policy "$PROJECT" --flatten='bindings[].members' \
  --filter='bindings.members:lszh-offer-reader@' \
  --format='table(bindings.role,bindings.condition.title,bindings.condition.expression)'
echo '=== target Cloud Run service (NOT_FOUND expected) ==='
ERR_FILE="$(mktemp)"
if gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(metadata.name)' >"$ERR_FILE" 2>&1; then
  echo 'STOP: Ziel-Service existiert bereits, kein neues Deployment beginnen.'
  cat "$ERR_FILE"
  rm -f "$ERR_FILE"
  exit 1
elif grep -Eq 'NOT_FOUND|Cannot find service' "$ERR_FILE"; then
  echo 'EXPECTED: Ziel-Service ist noch nicht vorhanden'
else
  echo 'STOP: unklarer Service-Status / möglicherweise fehlende Leseberechtigung'
  cat "$ERR_FILE"
  rm -f "$ERR_FILE"
  exit 1
fi
rm -f "$ERR_FILE"
```

**STOP**, bevor du ein Deployment startest, wenn das Repository `cloud-run-source-deploy` fehlt, eine benötigte API nicht `ENABLED` ist, das **neue** Ziel bereits existiert, die Leserolle nicht ausschliesslich auf die benannte Datenbank begrenzt ist, oder sich die angezeigte Identität unterscheidet. **Keine automatischen Antworten auf Prompts zur Repository-/Rollen-/API-Erstellung.** Neue IAM-Bindings und die Erstellung anderer Ressourcen sind **nicht** Teil der Freigabe. Falls die Repository-Prüfung `NOT_FOUND` meldet, nur den Befund zurückmelden: `--source` würde andernfalls möglicherweise automatisch ein neues Artifact-Registry-Repository anlegen.

## B. Deployment-Plan – erst nach erfolgreichem Preflight und geprüftem Commit

1. Öffentlichen GitHub-Feature-Zweig nur lesend in ein neues temporäres Arbeitsverzeichnis klonen und **exakt den getesteten Commit** auschecken. Nicht `main`, nicht Render.
2. In ein eigenes temporäres Quellverzeichnis **nur** folgende Dateien kopieren und ihre Pfade beibehalten: `stagingOfferSchema.js`, `stagingFirestoreConnection.js`, `offerte-annehmen/index.html`, `services/offer-acceptance-staging/{app.js,index.js,offerLinks.js,stagingReadProbe.js,startupReadProof.js,package.json,package-lock.json}`. Dazu `services/offer-acceptance-staging/Dockerfile` als **`Dockerfile` im temporären Quellwurzelverzeichnis** kopieren. Der Dockerfile verwendet daher weiterhin `COPY services/...` als Build-Kontext. **Kein** `.git`, Secret, echter Kundendatensatz oder Credential-File mit hochladen.
3. `gcloud run deploy lszh-offer-acceptance-staging --source "$SOURCE_DIR" --project=lszh-automations --region=europe-west6 --service-account=lszh-offer-reader@lszh-automations.iam.gserviceaccount.com --ingress=internal --no-allow-unauthenticated --min-instances=0 --max-instances=1 --concurrency=1 --memory=1Gi --cpu=1 --set-env-vars=GOOGLE_CLOUD_PROJECT=lszh-automations,LSZH_FIRESTORE_PROJECT_ID=lszh-automations,LSZH_FIRESTORE_DATABASE_ID=lszh-offers-staging,LSZH_STAGING_READ_PROBE_ENABLED=yes,LSZH_FIRESTORE_STAGING_WRITE_ENABLED=false` – **nur nach Kontrolle** des genauen Build-Commit und vorhandenen Artifact-Registry-Repositories. Source-Deployment baut via Cloud Build und speichert ein Image in einem vorhandenen Repository.
4. Beim ersten fehlenden `iam.serviceAccounts.actAs`, Build-Service-Account-, Repository- oder sonstigen Rollenproblem: **STOP** und vollständige Fehlermeldung zurückmelden; keine weiteren Rechte vergeben, keine APIs/Repositories nachträglich aktivieren oder zusätzliche Dienstkonten erstellen.

## C. Nachprüfung (rein lesend)

- `gcloud run services describe lszh-offer-acceptance-staging --project=lszh-automations --region=europe-west6 --format='yaml(metadata.annotations,spec.template.spec.serviceAccountName,status.conditions)'` muss `internal`-Ingress, das **Reader**-Konto und eine Ready-Revision zeigen.
- `gcloud run services get-iam-policy lszh-offer-acceptance-staging --project=lszh-automations --region=europe-west6 --format=yaml` darf weder `allUsers` noch `allAuthenticatedUsers` als Invoker zeigen. Ein leeres Policy-Ergebnis ist für die zunächst nicht extern aufrufbare Testinstanz zulässig.
- Startup-GET verlangt `LSZH_STAGING_READ_PROBE_ENABLED=yes` und korrekte Cloud-Run-Umgebung; geloggt wird ausschliesslich `LSZH_FIRESTORE_READ_PREFLIGHT: PASS_MISSING`, `PASS_SYNTHETIC_PRESENT` oder `FAILED_OR_TIMED_OUT`. Ein `PASS_MISSING` bestätigt erfolgreichen *lesenden* GET und die Tatsache, dass der fest vorgegebene synthetische Fixture-Datensatz nicht existiert. Bei `FAILED_OR_TIMED_OUT` **nicht** als erfolgreich bewerten.
- Logs nur lesend, z. B. `gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="lszh-offer-acceptance-staging" AND textPayload:"LSZH_FIRESTORE_READ_PREFLIGHT"' --project=lszh-automations --limit=10 --freshness=1h --format='value(textPayload)'`. Kein Log-Auszug mit Tokendaten oder vollständigen Umgebungsvariablen nötig.
- Ein Service mit `--ingress=internal` kann von Cloud Shell **nicht direkt via öffentlich routbaren `run.app`-Endpoint oder `gcloud run services proxy`** getestet werden, wenn Cloud Shell ausserhalb der zugelassenen Netzwerkquellen liegt. Daher der servereigene einmalige Startup-Read-Test.
- Keine Cloud-Run-Invoker-Berechtigungen vergeben; ein echter externer Test-Endpunkt ist hier **nicht** erforderlich.

## D. Bedeutung und nächste Grenze

Ein erfolgreicher, nur lesender Google-Cloud-GET beweist **nur** die Backend-Verbindung unter der tatsächlich konfigurierten Service-Identität. Er beweist **keine** Verarbeitung realer Kundenofferten, keine Archivretention, keine Airtable-/Make-Synchronisation und keine rechtswirksame Vertragsannahme. Eine neue Staging-Schreib-/E2E-Testfreigabe sowie RC1-/AVV-Rechtsprüfung sind davon unabhängig.

Google-Referenz: https://cloud.google.com/run/docs/deploying-source-code (Source Deploy erzeugt automatisch ein Artifact-Registry-Repository, wenn keines vorhanden ist). https://cloud.google.com/run/docs/securing/ingress (internal-Ingress ist nicht aus der Cloud Shell direkt aufrufbar). https://cloud.google.com/sdk/gcloud/reference/run/deploy (Flags und Authentifizierung).
