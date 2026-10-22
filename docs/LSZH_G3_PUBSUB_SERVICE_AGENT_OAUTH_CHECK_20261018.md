# LSZH Automations – G3: Service-Agent-IAM und Make-OAuth, nächste sichere Prüfung

## Dritter echter Live-Read – 18.10.2026: Definition und direkte Rolle BEIDE bestätigt

**Betreiberergebnis:** Der unveränderte, nur lesende Geschäfts-Cloud-Shell-Aufruf auf dem korrigierten Draft-Branch lieferte exakt:

| Kontrollwert | Bestätigtes Ergebnis | Tragweite |
| --- | --- | --- |
| `result` | `READ_ONLY_ROLE_DEFINITION_CHECK` | Nur Leseprüfung |
| `projectIdentityVerified` | `true` | Projekt `lszh-automations` bestätigt |
| `roleDefinitionPermission` | **`PRESENT_IN_PREDEFINED_ROLE`** | Googles tatsächlich ausgelesene vordefinierte Rolle `roles/pubsub.serviceAgent` enthält `iam.serviceAccounts.getOpenIdToken` |
| `roleReadVariant` | **`PREDEFINED_UNSCOPED_FALLBACK`** | Der dokumentierte Aufruf **ohne `--project`** lieferte die prüfbare Rollendefinition |
| `serviceAgentProjectBinding` | **`DIRECT_UNCONDITIONAL_BINDING_FOUND`** | Die Rolle ist direkt und ohne IAM-Condition für den Pub/Sub-Service-Agent im GCP-Projekt gebunden |
| `plannedPushSa` | `ABSENT_IN_THIS_LIST` | Das neue Push-Invoker-Dienstkonto ist noch nicht erstellt |
| `serviceAgentEffectiveOidc`, `groupDenyPab` | Je **`NOT_EVALUATED`** | Effektive Rechte und Deny/PAB-Vererbung nicht abgenommen |
| `publishAndPushTransport` | `NOT_TESTED` | Keine reale Pub/Sub-Zustellung |
| `tokenCreatorAdditionalGrant` | **`NOT_RECOMMENDED_WITHOUT_EFFECTIVE_CHECK`** | Weder zusätzlicher noch projektweiter TokenCreator-Grant gerechtfertigt |
| `releaseStatus` | **`NO_GO`** | Weiter keine Aktivierung |

**Ergebnis:** Der frühere `UNKNOWN_ROLE_DEFINITION`-Befund ist in einem **neuen Live-Read aufgelöst**. Er war durch den alten Leseweg bedingt: Der exakte `--project`-freie vordefinierte Rollen-Read war erfolgreich, während der alte Versuch die erforderliche Definition nicht lieferte. Ob `--project` selbst die einzige Ursache war, wurde nicht durch separate stderr-Diagnose isoliert; **der korrigierte Leseweg ist aber tatsächlich erfolgreich**. Dieser Read liefert keinen Beweis, dass die Berechtigung auf einen noch nicht existierenden Push-SA später effektiv ausgeübt werden kann. **Kein neuer Berechtigungsgrant.**

**Keine weitere Wiederholung dieses Rollen-Reads nötig.** Als nächstes eine eng begrenzte, separat freizugebende G3-Staging-Ressourcenentscheidung auf Basis von `docs/LSZH_G3_PUBSUB_CHANGE_ROLLBACK_PLAN_20261018.md`. Vor Go müssen eigene Push-/Runtime-SAs, ein Topic, Subscription, privater Receiver und der Business-Make-OAuth-Principal einzeln genehmigt werden; zunächst nur synthetische Review-Only-Daten. Keine Veränderung an bestehendem Make-Szenario `7940220`, an `0=1`-Sperren oder produktiver Vertrags-/PDF-/Mail-Verarbeitung.

---

## Live-Rückmeldung aus geschäftlicher Cloud Shell – 18.10.2026

**Betreiber hat den Original-Runner bereits sicher gestartet.** Die redigierte JSON-Ausgabe zeigt:

| Feld | Live-Ergebnis | Interpretation |
| --- | --- | --- |
| `result` | `READ_ONLY_ROLE_DEFINITION_CHECK` | Nur Lesecheck; kein GO |
| `projectIdentityVerified` | `true` | `lszh-automations` bestätigt |
| `serviceAgentProjectBinding` | **`DIRECT_UNCONDITIONAL_BINDING_FOUND`** | Vordefinierte Agent-Rolle ohne Bedingung **direkt am Projekt** |
| `roleDefinitionPermission` | **`UNKNOWN_ROLE_DEFINITION`** | Die verwendete `gcloud iam roles describe`-Abfrage lieferte kein im Skript prüfbares Rollenobjekt. **Das sagt nicht aus, dass die OIDC-Berechtigung fehlt.** |
| `plannedPushSa` | `ABSENT_IN_THIS_LIST` | Vorgesehener G3-Push-SA wurde nicht vorgefunden |
| `serviceAgentEffectiveOidc` | `NOT_EVALUATED` | Kein effektiver Berechtigungsnachweis auf dem noch nicht vorhandenen Push-SA |
| `groupDenyPab` | `NOT_EVALUATED` | Geerbte/organisationsweite Grenzen fehlen |
| `tokenCreatorAdditionalGrant` | `NOT_RECOMMENDED_WITHOUT_EFFECTIVE_CHECK` | **Keinen zusätzlichen TokenCreator-Grant** ohne unabhängigen Nachweis |
| `releaseStatus` | `NO_GO` | Keine IAM-/Pub/Sub-/Make-Aktivierung |

**Diagnose:** Google dokumentiert für *vordefinierte* IAM-Rollen den Aufruf `gcloud iam roles describe roles/pubsub.serviceAgent` **ohne** `--project`. Der bisherige Runner versuchte die Definition mit `--project=lszh-automations`. Ob das den konkreten `UNKNOWN_ROLE_DEFINITION`-Befund verursacht hat, ist **noch nicht nachgewiesen**; es könnte auch an Leserechten, CLI-Version oder Datenformat liegen. Die offizielle Google-Pub/Sub-IAM-Rollenübersicht listet `iam.serviceAccounts.getOpenIdToken` ausdrücklich in `roles/pubsub.serviceAgent`. Ein offizieller Dokumentationsbefund ersetzt nicht den effektiven Projekt-/Deny-/PAB-/Push-SA-Check.

**Sichere Codekorrektur:** Der aktualisierte Runner versucht die frühere Projekt-form zuerst. Nur wenn diese kein gültiges vordefiniertes Rollenobjekt liefert, liest er **genau die eine Rolle** nochmals in Googles offizieller, `--project`-freier Form. Die gemeinsam genutzte gcloud-Whitelist erlaubt dafür ausschliesslich `iam roles describe roles/pubsub.serviceAgent --format=json --quiet`. Neue Ergebnisangabe `roleReadVariant` = `PROJECT_SCOPED`, `PREDEFINED_UNSCOPED_FALLBACK` oder `UNVERIFIED`; `releaseStatus=NO_GO` bleibt unabhängig davon. Kein Token, IAM-Schreibrecht oder persönlicher Principal wird ausgegeben.

**Nächster sicherer Einzeltest:** Den aktualisierten Runner mit geschäftlichem Google Cloud Shell-Konto erneut **nur lesend** ausführen; die redigierte JSON-Antwort teilen. Falls weiterhin `UNKNOWN_ROLE_DEFINITION`, die CLI-Abfrage nicht durch Berechtigungsgrant oder Service-Agent-Neuanlage „reparieren“, sondern den fehlgeschlagenen Read gesondert prüfen. **Kein** neuer Cloud-G3-Ressourcen-/OAuth-GO.

Quellen:
- https://docs.cloud.google.com/sdk/gcloud/reference/iam/roles/describe
- https://docs.cloud.google.com/iam/docs/creating-custom-roles
- https://docs.cloud.google.com/pubsub/docs/access-control

---

**Stand:** 18.10.2026 – **nur Lese- und Planungsphase, kein Cloud-Go**.

## Ergebnis der verbundenen Make-Abfrage

Die verbundene Make-Organisation (ID `7700421`, Team `1728770`, EU1) bietet `google-cloud-pubsub:publishMessage` v1 an. Die Moduldefinition zeigt `connection.type=account:google-custom` und **`existing=[]`**. Eingaben: `mapper.name` als Topic-Pfad, `mapper.messages[].data` und optional `attributes[]`; Rückgabe `messageId`. Ein `messageId` bedeutet **nicht**, dass Firestore bereits den fachlichen Review-Lock reserviert hat.

Die über die Make-App gelieferte Anleitung weist sich ausdrücklich als **KI-generiert und möglicherweise ungenau** aus. Sie beschreibt die Erstellung eines OAuth-Clients mit Client-ID, Client-Secret und einem vorgeschlagenen Redirect-Pfad. **Diese Redirect-URI ist nicht unabhängig verifiziert**, deshalb wird sie hier **nicht** als definitive Konfiguration vorgegeben. Ebenso sind der native Make-OAuth-Scope, der Berechtigungsinhaber und die Data-Encoding-Semantik des Moduls noch unbekannt. OAuth-Client-Secret und Access-/Refresh-Tokens gehören niemals in GitHub, Chat, Terminal-Ausgabe oder Airtable.

Für den späteren Unternehmensbetrieb muss die Verbindung vom **geschäftlichen**, eng berechtigten Publisher-Principal stammen, nicht vom privaten Konto. `roles/pubsub.publisher` darf auf **ein einzelnes genehmigtes Topic** beschränkt sein. Ein allgemeiner `cloud-platform`-OAuth-Scope bedeutet **keine IAM-Begrenzung**: effektive Topic-IAM ist separat zu prüfen.

## Ergebnis der tatsächlich ausgeführten Google-Cloud-Inventur

Geschäftliche Cloud Shell hat am 18.10.2026 ergeben: `lszh-automations`/`europe-west6`, Pub/Sub/Cloud Run/IAM/Firestore/Service Usage APIs enabled, 0 Topics, 0 Subscriptions, 8 Serviceaccounts und 6 Cloud-Run-Dienste. Direkte Projektbindung `roles/pubsub.serviceAgent` für den Pub/Sub-Service-Agent vorhanden. **Die vorgesehenen G3-Push-/Runtime-Serviceaccounts und der Receiver existieren noch nicht.**

Die aktuelle **offizielle Rollenreferenz** enthält `iam.serviceAccounts.getOpenIdToken` in `roles/pubsub.serviceAgent`. Ob der vorhandene direkte Projektbindungs-Eintrag **unkonditional** ist, ob Deny-/PAB-Policies ihn einschränken und ob er später auf dem erst noch zu genehmigenden Push-SA effektiv greift, ist gesondert zu beurteilen. **Keine zusätzliche TokenCreator-Rolle vergeben, solange keine echte Berechtigungsprüfung ihr Fehlen nachweist.**

## Neuer sicherer Rollen-Readback für die geschäftliche Cloud Shell

`scripts/g3-readonly-service-agent-role.mjs` liest ausschliesslich:

1. `gcloud projects describe lszh-automations` – Projektschlüssel und Projektnummer intern vergleichen.
2. `gcloud services list --enabled` – IAM API muss bereits aktiv sein, sonst STOP.
3. `gcloud iam roles describe roles/pubsub.serviceAgent` – Definition und enthaltene Berechtigung **lesen**.
4. `gcloud projects get-iam-policy lszh-automations` – **direkte** Agent-Rollenbindung inklusive Konditionalitätsstatus intern beurteilen.
5. `gcloud iam service-accounts list` – nur überprüfen, ob der konkret geplante G3-Push-SA inzwischen existiert.

Ausgabe: keine persönliche E-Mail-Adresse, Projektnummer, Dienstkonto-Principals, rohe Policys oder Tokens. Ergebnis `READ_ONLY_ROLE_DEFINITION_CHECK` selbst bei vollständigem Lesestatus, **`releaseStatus=NO_GO` bleibt immer aktiv**. Nicht lesbare Daten bleiben `UNKNOWN`, nicht `PASS`. Der Befehl nutzt die bereits zuvor geprüfte `gcloud`-Allowlist, die nur diesen einen zusätzlichen vordefinierten IAM-Rollennamen zulässt und keine Schreib-/Impersonationsbefehle.

**Manueller Leseaufruf, falls gewünscht:** Aus dem bereits temporär geklonten LSZH-Branch kann in geschäftlicher Cloud Shell `node scripts/g3-readonly-service-agent-role.mjs` gestartet werden. Sollte der Ordner nicht mehr existieren, kann der gültige Featurebranch erneut in einen temporären Ordner geklont werden. **Kein neuer IAM-Grant, keine Dienste aktivieren.** Ergebnisse nur als bereits redigiertes JSON weitergeben.

## Warum wir nicht mehr versprechen können

Google Policy Troubleshooter kann IAM-Allow-/Deny- und unter bestimmten Voraussetzungen PAB-Policies untersuchen, **aber** seine API muss dafür bereits aktiviert sein und das auf Zielressourcen anwendbare IAM muss lesbar sein. Der **neue Push-SA existiert noch nicht**; ein effektiver OIDC-Token-Minting-Test gegen dieses zukünftige Dienstkonto ist derzeit nicht möglich. Auch eine vorhandene Agent-Rollendefinition ersetzt keinen Push-Zustelltest.

Make-Pub/Sub bleibt ohne OAuth-Verbindung. Die REST-Publish-API nutzt Base64 im JSON-Wire-Format; **wie das native Make-Modul `mapper.messages[].data` verarbeitet, ist ohne genehmigten Test nicht bewiesen**. Keine Codeänderung oder Dokumentation darf aus `OAuth verfügbar`, `Agent-Rolle enthält Berechtigung` oder `Nachricht erfolgreich veröffentlicht` ein produktives Google-Docs-/PDF-/E-Mail-GO ableiten.

## Nachweis und nächste Freigabepunkte

- Quell- und Negativtest-Code: `scripts/g3-readonly-service-agent-role.mjs`, `test/g3ReadonlyServiceAgentRole.test.js`; echte `gcloud`-Abfragen werden **nicht** durch GitHub Actions ausgeführt.
- Vor einem aktiven Test: ausdrückliche gesonderte Freigabe für die neuen G3-Google-Cloud-Ressourcen und IAM-Bindungen; danach separate Genehmigung des geschäftlichen Make-OAuth-Verbindungsaufbaus und **einer** rein synthetischen Nachricht.
- Bereits freigegebener Architektur- und Rückbauentwurf: `docs/LSZH_G3_PUBSUB_CHANGE_ROLLBACK_PLAN_20261018.md`.
- Make-Szenario `7940220` weiter inactive, Claim und Mail auf `0=1`, keine Verträge, PDF-Belege oder Kundenmails.

Offizielle Referenzen:

- https://docs.cloud.google.com/iam/docs/roles-permissions/pubsub
- https://docs.cloud.google.com/sdk/gcloud/reference/iam/roles/describe
- https://docs.cloud.google.com/policy-intelligence/docs/troubleshoot-access
- https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions
- https://docs.cloud.google.com/pubsub/docs/publish-message-overview
