# LSZH Automations – G3 echte Google-Cloud-Bestandsinventur (NUR LESEN)

**Datum:** 18.10.2026  
**Status:** **Echte Live-Leseinventur erfolgreich ausgeführt** durch den Betreiber in der bereits authentifizierten **geschäftlichen Google Cloud Shell** am 18.10.2026. Prüfresultat: `READ_ONLY_INVENTORY_WITH_UNVERIFIED_EFFECTIVE_IAM`, `projectIdentityVerified=true`, `releaseStatus=NO_GO`. Kein Google-Cloud-Verwaltungskonnektor direkt aus diesem Chat; der Betreiber hat das geprüfte Repository-Skript ausgeführt und die redigierte JSON-Ausgabe hier übermittelt. Inventur read-only, keine Cloud-Ressourcen verändert.

## Tatsächlich beobachtetes Inventarergebnis vom 18.10.2026

**Belegquelle:** Die vom Betreiber aus der geschäftlichen Cloud Shell kopierte, redigierte JSON-Ausgabe des Skripts `scripts/g3-readonly-cloud-inventory.mjs`, nach Clone des Featurebranchs. Diese Werte sind **Live-Leseergebnisse**, keine Mock-Testwerte. Es gibt keine Roh-IAM-Policies, Credentials, Kundendaten oder Geheimnisse im Bericht.

| Kontrollpunkt | Beobachtung | Aussagegrenze |
| --- | --- | --- |
| Projekt-/Identitätsprüfung | `lszh-automations`, `europe-west6`, `projectIdentityVerified=true` | Ausführungsprojekt stimmt überein |
| `pubsub.googleapis.com` | **ENABLED** | Kein `services enable` erforderlich |
| `run.googleapis.com` | **ENABLED** | G3-Receiver noch nicht vorhanden |
| `iam.googleapis.com` | **ENABLED** | Effektive Gruppen/Deny/PAB-Rechte nicht automatisch geprüft |
| `firestore.googleapis.com` | **ENABLED** | Kein Beleg für Datenbank- oder Laufzeitberechtigungen |
| `serviceusage.googleapis.com` | **ENABLED** | Nur API-Aktivierungsstatus |
| Pub/Sub-Topics insgesamt | **0** | `plannedTopic=ABSENT_IN_THIS_LIST` |
| Pub/Sub-Subscriptions insgesamt | **0** | `plannedSubscription=ABSENT_IN_THIS_LIST` |
| Service Accounts im Projekt | **8** | G3 Push-SA und Runtime-SA jeweils `ABSENT_IN_THIS_LIST` |
| Cloud Run Services in `europe-west6` | **6** | G3-Receiver `ABSENT_IN_THIS_REGION_LIST` |
| Pub/Sub Service Agent (Projekt-IAM) | **DIRECT_POLICY_BINDING_FOUND** für `roles/pubsub.serviceAgent` | **Nicht** gleichzusetzen mit geprüften `getOpenIdToken`-Effektrechten |
| Service-Agent-Tokenausstellung | `NOT_EVALUATED` | **Keine** pauschale TokenCreator-Berechtigung vergeben |
| Effektive IAM-/Gruppen-/Deny-/PAB-Rechte | `NOT_EVALUATED` | Direkte Ressourcen-IAM-Snapshots fehlen für noch nicht vorhandene G3-Ressourcen |
| OIDC-Push und Ingress | `NOT_TESTED` bzw. `NOT_EVALUATED` | Private Pub/Sub→Cloud-Run-Zustellung nicht verifiziert |
| Business-Make-Pub/Sub-OAuth | `NOT_CONFIGURED_AS_OF_PRIOR_READ` | Keine passende Verbindung beim vorangegangenen verbundenen Make-Read |
| Native `messages[].data`-Kodierung | `NOT_VERIFIED` | REST-Base64 nicht ungeprüft in das native Make-Modul kopieren |

**Bewertung:** Die APIs sind verfügbar und der Service Agent besitzt laut direktem Projekt-IAM einen Eintrag für seine Standardrolle. **Das erlaubt noch keinen synthetischen Publish-/Push-Test und keinen Live-Kundenprozess.** Topic, Subscription, dedizierte G3-Dienstkonten und privater G3-Receiver müssen als *neue* Ressourcen separat geplant und genehmigt werden. Vorher effektiv bereits vorhandene TokenMinting-Berechtigungen prüfen; keine Projekt- oder Organisations-TokenCreator-Rolle aus dem bloßen Rollenfund ableiten.

**Nächste sicher zulässige Arbeiten:** Offline-Bereitstellungs-/Rückbauplan mit genauen Ressourcen, minimalen IAM-Rollen, Kostenlimit und Logging erstellen; Business-Publisher-Principal und Make-Modul-Data-Encoding **nur lesend** abklären. Erst dann **separate ausdrückliche Freigabe** für G3-synthetische Cloud-Ressourcen/OAuth-Connection einholen. Aus der hier durchgeführten Live-Leseinventur folgt kein automatisches GO.

---

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

- Pub/Sub-API ist laut Live-Bestandsaufnahme **ENABLED**; ein nächster Re-Check darf den Zustand erneut bestätigen oder als unbekannt kennzeichnen.
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
