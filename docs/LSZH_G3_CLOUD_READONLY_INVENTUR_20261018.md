# LSZH Automations – G3 echte Google-Cloud-Bestandsinventur (NUR LESEN)

**Datum:** 18.10.2026  
**Status:** Skript bereitgestellt, **LIVE-CLOUD-INVENTUR NOCH NICHT AUSGEFÜHRT**. Kein Google-Cloud-Zugriff durch die in dieser Chat-Sitzung verfügbaren verbundenen Apps. Vorhandene Make-/GitHub-/Render-Connectoren sind kein Ersatz für Google-Cloud-IAM-/Pub/Sub-Lesezugriff. Keine Cloud-Ressource wurde verändert.

## Ziel und Grenzen

Bereits festgelegtes Cloud-Projekt **`lszh-automations`**, Region `europe-west6`. Erwarteter künftiger, aber noch **nicht** nachgewiesener G3-Scope: Topic `lszh-g3-review-staging`, Subscription `lszh-g3-review-staging`, Cloud-Run-Receiver `lszh-g3-review-staging`, Push-SA `lszh-g3-push-stg@lszh-automations.iam.gserviceaccount.com`, Runtime-SA `lszh-g3-reserve-stg@lszh-automations.iam.gserviceaccount.com`.

`scripts/g3-readonly-cloud-inventory.mjs` nutzt **ausschliesslich** eine vorgegebene Befehls-Allowlist für `gcloud`:

- `projects describe` (festes Projekt und Projektnummer),
- `services list --enabled` (Pub/Sub, Cloud Run, IAM, Firestore, Service Usage),
- `pubsub topics list`, `pubsub subscriptions list`, **nur wenn Pub/Sub-API in Enabled-Liste**,
- `iam service-accounts list`, `projects get-iam-policy`,
- `run services list` in `europe-west6`, **nur wenn Run-API aktiviert**,
- **nur bei bereits vorhandenen genau benannten Zielressourcen**: `topics get-iam-policy`, `subscriptions get-iam-policy`, `run services get-iam-policy`, `iam service-accounts get-iam-policy`.

`get-iam-policy` liest Ressourcen-IAM; keine direkte IAM-Bindung ist **kein Beweis** für fehlende geerbte oder konditionale Berechtigungen. Der Pub/Sub-Service-Agent wird nur anhand eines *direkt sichtbaren* `roles/pubsub.serviceAgent`-Eintrags in der Projekt-IAM-Snapshot-Zeile geprüft. **Wir leiten daraus keine effektive OIDC-Token-Minting-Freigabe ab.** Leere/fehlende oder nicht lesbare Ergebnisse bleiben `UNKNOWN`; APIs werden nie aktiviert. Das Skript gibt **nur Kennzahlen, begrenzte Zustände und erwartete feste Ressourcennamen aus**, keine Memberlisten, E-Mails, Token, Policy-JSON oder Credentials. `projectNumber` wird nicht ausgegeben.

**Ausschluss:** kein `gcloud beta services identity create`, `services enable`, `add-iam-policy-binding`, `pubsub topics create/publish`, `subscriptions pull/ack`, `iam service-accounts keys`, `auth login` oder `--impersonate-service-account`. Diese Befehle sind nicht Teil des Inventars und werden teilweise durch die Allowlist explizit verweigert. `gcloud` wird in dieser Chat-Umgebung nicht mit dem Geschäftskonto authentisiert bereitgestellt.

## Ausführung durch den Betreiber in bereits angemeldeter geschäftlicher Google Cloud Shell

1. In der geschäftlichen Google Cloud Shell **in das vorhandene lokale GitHub-Repo** `lszh-automations-site` wechseln. Kein Wechsel/Checkout des produktiven Branchs erforderlich.
2. Folgende Schritte kopieren ausschliesslich den überprüfbaren Skriptstand aus dem Draft-Featurebranch in eine lokale temporäre Datei und führen reine Leseoperationen aus:

```bash
git fetch origin feature/optional-avv-acceptance-staging-20261014
git show FETCH_HEAD:scripts/g3-readonly-cloud-inventory.mjs > /tmp/lszh-g3-readonly-cloud-inventory.mjs
node /tmp/lszh-g3-readonly-cloud-inventory.mjs
```

Wenn `STOP_PROJECT_NOT_VERIFIED` oder `STOP_ENABLED_API_INVENTORY_UNAVAILABLE` erscheint, keine Berechtigung „reparieren“ und keine API aktivieren. Die geschäftliche Cloud-Shell-Identität / Leserechte separat überprüfen. Bei `READ_ONLY_INVENTORY_WITH_UNVERIFIED_EFFECTIVE_IAM` die **bereits redigierte JSON-Ausgabe** zur weiteren Evaluation bereitstellen. **Keine** Ausgabe von `gcloud auth print-access-token`, `gcloud projects get-iam-policy` im Rohformat, Service-Account-Key-Dateien oder persönlichen Kundendaten weitergeben.

## Auswertung für den nächsten Schritt

- Pub/Sub-API **ENABLED** oder `NOT_IN_ENABLED_LIST`; noch nicht live geprüft.
- Topic-/Subscription-Liste nur als Zahl und Präsenz des geplanten G3-Namens; `UNKNOWN` nicht als `ABSENT` werten.
- Projekt-IAM-Snapshot und vorhandene Topic-/Push-/Service-Account-Policy als **direkte Ressourcen-Teilansicht**, keine effektive IAM-/Deny-/PAB-/Gruppen-Auswertung.
- `serviceAgentTokenMintingEffective` bleibt `NOT_EVALUATED`. Keinen TokenCreator-Grant ohne gesonderten Rollen-/Troubleshooter-Nachweis.
- Cloud Run Receiver: nur Präsenz in der Region, **nicht** genehmigter Ingress-/Invoker-Betriebsstatus. Private Push-Funktion noch nicht getestet.
- Geschäftliches Make-Pub/Sub-Modul ist laut vorheriger Live-Make-API vorhanden, aber eine geeignete OAuth-Connection fehlt; die native Make-`messages[].data`-Kodierung bleibt unbestätigt.

Ein erfolgreicher Lesebericht ist **kein Deployment- oder Pilot-GO**. Nach dessen Abgleich ist ein expliziter, eng definierter Freigabeentscheid über höchstens einen isolierten synthetischen Cloud-Pub/Sub-Test erforderlich. Make-Szenario `7940220` bleibt inaktiv, Claim/Gmail `0=1`, keine echten Verträge oder E-Mails.

## Code und CI

- Code: `scripts/g3-readonly-cloud-inventory.mjs`.
- Mock-Test: `test/g3ReadonlyCloudInventory.test.js` – verhindert Schreibbefehle, prüft Projektbindung, fehlernde APIs, Lesefehler, Redaktionsgrenzen und `NO_GO`-Bewertung.
- Aktueller GitHub-Teststand in `.github/workflows/offer-acceptance-check.yml` verifiziert. **Die CI führt keine echten GCP-Abfragen aus.**
- Offenes ADR: `docs/LSZH_G3_TRANSPORT_ARCHITEKTUR_ADR_20261018.md`.

Offizielle Referenzen:
- https://docs.cloud.google.com/sdk/gcloud/reference/services/list
- https://docs.cloud.google.com/sdk/gcloud/reference/pubsub/topics/get-iam-policy
- https://docs.cloud.google.com/sdk/gcloud/reference/projects/get-iam-policy
- https://docs.cloud.google.com/sdk/gcloud/reference/run/services/get-iam-policy
- https://docs.cloud.google.com/iam/docs/roles-permissions/pubsub
