# LSZH Automations – G3: Service-Agent-IAM und Make-OAuth, nächste sichere Prüfung

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
