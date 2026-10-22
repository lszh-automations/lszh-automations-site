# LSZH Automations – G3 Pub/Sub/OAuth/IAM-Preflight, ohne Cloud-Änderungen

**Datum:** 18.10.2026  
**Status:** REINER ENTWURF / KEINE REALE IAM- ODER MAKE-FREIGABE. **Echte Geschäfts-Cloud-Shell-Inventur vom 18.10.2026 liegt vor:** 5 APIs enabled, 0 Topics/Subscriptions, 8 SAs/6 Run-Dienste und direkte Pub/Sub-Service-Agent-Rolle bestätigt; neue G3-Ressourcen fehlen.

## 1. Tatsächlich geprüfte Make-Funktion

Verbundenes Make-Team `LZSH AUTOMATIONS` (Organisation `7700421`, Team `1728770`, EU1). `mcp__Make__module_spec` für `google-cloud-pubsub:publishMessage` Version 1, mit vollständigem Schema:

- Verbindungstyp: `account:google-custom`; `existing: []`. **Es gibt aktuell keine passende eingerichtete Verbindung.**
- Eingabe: Modul-`mapper.name` = `projects/{project}/topics/{topic}`, `mapper.messages[]` mit `data` und optionalen `attributes[{key,value}]`.
- Ausgabe: `messageId`; **keine** Bestätigung einer Firestore-Reservierung oder Annahme.
- `mcp__Make__app_docs_get(google-cloud-pubsub)` beschreibt Google OAuth2, ist aber als KI-generiert/potenziell fehlerhaft markiert. OAuth-Konfiguration, benötigte Scopes, Redirect-URI und Eigentümer/Publisher-Principal sind **nicht geprüft**. Das verbundene Make-Account ist bereits verwendbar für den Lesestatus; keine Connection wurde hier neu autorisiert.

Die Google-Pub/Sub-REST-Publish-API erlaubt OAuth-Scopes `https://www.googleapis.com/auth/pubsub` **oder** `https://www.googleapis.com/auth/cloud-platform` und benötigt die Berechtigung `pubsub.topics.publish` (z. B. `roles/pubsub.publisher` auf dem **einzelnen Topic**). Der tatsächlich vom Make-Modul verlangte Scope wurde nicht live bestimmt. Ein OAuth-Scope allein ist keine Topic-IAM-Einschränkung. Referenz: https://docs.cloud.google.com/pubsub/docs/reference/rest/v1/projects.topics/publish

**Encoding-Freigabe offen:** Bei der REST-Publish-API ist `messages[].data` Base64-kodiert. Ob das Make-*native* Modul in seinem Eingabefeld bereits rohe Bytes/Text selbst nach Base64 umwandelt, ist durch die gelesene Modulspezifikation nicht belegt. Der vorher entwickelte `syntheticPubsubReviewTransport.mjs` erzeugt darum explizit **PUBSUB_REST_BASE64_WIRE_ONLY**, mit `makeNativeDataEncodingVerified:false`. Dieses REST-Feld **nicht ungeprüft** in das native Make-Modul kopieren, sonst wäre eine doppelte Kodierung möglich. Bevor Make konfiguriert wird: den Unterschied in einer **getrennt freigegebenen synthetischen Einzelprobe** klären; kein Produktionsaufruf.

## 2. Geplanter kleinster Rollen- und Netzwerkumfang

Diese Namen sind ausschliesslich **Reservierungen im Entwurf**, nicht bestätigte Ressourcen im Cloud-Projekt `lszh-automations`:

| Komponente | Geplante Prüfung / minimaler Umfang | Vorhanden? |
| --- | --- | --- |
| Topic `lszh-g3-review-staging` | `projects/lszh-automations/topics/lszh-g3-review-staging`; nur synthetische korrelierte Nachrichten | **nicht ermittelt / nicht angelegt** |
| Make OAuth Publisher | dedizierte Google-*Geschäfts*-Identität; `roles/pubsub.publisher` nur auf genau diesem Topic, **keine** Firestore/Drive/IAM-Rechte aus dem Szenario | Make-Connection **fehlt** |
| Push-Subscription | `projects/lszh-automations/subscriptions/lszh-g3-review-staging`, Push über HTTPS mit Google-OIDC und expliziter Audience des Cloud-Run-Receivers | **nicht ermittelt / nicht angelegt** |
| Push-Invoker-Dienstkonto | `lszh-g3-push-stg@lszh-automations.iam.gserviceaccount.com`; `roles/run.invoker` nur auf geplantem Dienst `lszh-g3-review-staging` | **nicht ermittelt / nicht angelegt** |
| Cloud Run Receiver | eigenes Review-only-Staging, `europe-west6`, `ingress=internal`, IAM **required**, Standard-`run.app`-URL, **keine** Docs/PDF/Mail-Route | **nicht ermittelt / nicht deployed** |
| Runtime-Dienstkonto | separat `lszh-g3-reserve-stg@lszh-automations.iam.gserviceaccount.com`; Zugriff ausschliesslich auf geprüfte Firestore-DB `lszh-offers-staging`; Kandidat: `datastore.databases.get` für Transaktionen plus `datastore.entities.get/create/update`, keine `delete`, keine Quarantäne-DB oder Senderechte. Effektiver SDK-/Datenbankscope vor Betrieb noch zu prüfen | **Laut Live-Inventur 18.10.2026 nicht vorhanden** |
| Pub/Sub Service Agent | Projekt-Service-Agent muss Google-OIDC-Token für Push-Invoker bilden dürfen; bestehende `roles/pubsub.serviceAgent`/Berechtigungen **zuerst lesen** | **nicht ermittelt** |

Die offiziellen Google-Anweisungen unterscheiden Projekte **vor bzw. nach 08.04.2021** hinsichtlich notwendiger zusätzlicher Service-Agent-`roles/iam.serviceAccountTokenCreator`-Zuweisung. **Kein** TokenCreator-Grant auf Projekt-/Organisationsebene aus diesem Entwurf ableiten. Zuerst effektiv bestehende Service-Agent-Rolle und `iam.serviceAccounts.getOpenIdToken` prüfen. Falls überhaupt ein zusätzlicher Grant nötig wird, nur nach exakter Principal- und SA-Prüfung, bevorzugt auf dem einen Push-SA, separat genehmigen. Referenzen: https://docs.cloud.google.com/run/docs/tutorials/pubsub und https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions

Cloud Run `ingress=internal` erkennt die Pub/Sub-Push-Subscription unter den dokumentierten Voraussetzungen im **gleichen Projekt** und via default `run.app`-URL als interne Quelle. Es ist **kein allgemeiner privater VPC-HTTP-Endpunkt** und nicht durch beliebiges Make-HTTP von extern erreichbar. Referenz: https://docs.cloud.google.com/run/docs/securing/ingress

**IAM-Grenze:** Eine Datenbank-Condition bindet die Firestore-Rechte ggf. an die richtige *Datenbank*, nicht automatisch an einzelne Collections. Jede Schreibmutation benötigt zusätzlich eine vertrauenswürdige Prüfung des Angebotsstatus und der synthetischen Testherkunft im Code. Bestehende `lszh-quarantine-cas-stg`-Rolle/Identität **nicht** wiederverwenden.

## 2a. Präzisierter Firestore-Transaktions- und Push-Berechtigungsstand

**FireStore Server SDK:** Die Google-IAM-Methodentabelle unterscheidet `datastore.databases.get` (Transaktion beginnen/zurücksetzen) von `datastore.databases.getMetadata`. Der bisherige reine Offline-Plan enthielt nur `datastore.entities.get/create/update` und wurde am 18.10.2026 für das *Kandidatenmanifest* um `datastore.databases.get` ergänzt. Diese Rollenliste ist **kein Beweis**, dass das Google Node SDK beim späteren Cloud-Run-Test ohne zusätzliche schmale Metadatenrechte arbeitet; das muss getrennt abgenommen werden. Quelle: https://docs.cloud.google.com/firestore/native/docs/security/iam

**Pub/Sub-OIDC:** Die tatsächlich erfasste direkte Projekt-`roles/pubsub.serviceAgent`-Bindung ist ein wichtiges Indiz: Die Standardrolle umfasst `iam.serviceAccounts.getOpenIdToken`. Es gibt aber noch keinen effektiven IAM-/Deny-/PAB-Nachweis oder einen Push-SA. Vor einer zusätzlichen TokenCreator-Bindung zuerst den tatsächlichen Principal, die alte Projekt-/Service-Agent-Historie und effektive Rechte prüfen. Quelle: https://docs.cloud.google.com/pubsub/docs/access-control

**Vollständiger Freigabe- und Rollbackplan:** `docs/LSZH_G3_PUBSUB_CHANGE_ROLLBACK_PLAN_20261018.md` mit einzeln zu genehmigenden Phasen, Rollen-/Netz-/OAuth-Scope/Make-Kodierungsprüfung, Monitoring, Entzug/Deaktivierung und sicherer Rückbaureihenfolge. **Keine ausführbaren Änderungsbefehle**, keine neue Verbindung oder IAM-Bindung. **GitHub Actions 39141818159 SUCCESS:** 170 Unit-PASS, 19 lokale Firestore-Emulator-PASS und Browser/Container PASS.

---

## 3. Prüfbarkeit und was sie nicht beweist

`cloud-run/offer-portal-staging/syntheticPubsubIamPreflight.mjs` erstellt ein reines **Offline-Fixture** und bewertet ausschliesslich intern konsistente Rollen-/Netz-/Scope-Namen.

Die Funktion `assessSyntheticPubsubIamDesign` erkennt u. a.:
- Topic-/Projekt-/Region-/Subscription-Mismatch,
- Projekt-weites `roles/pubsub.publisher` statt Topic-spezifischer Rolle,
- allgemeines `roles/run.invoker` statt Service-spezifischer Rolle,
- `ingress=all`, deaktivierten IAM-Check oder voreiliges Durchlaufen zu Google Docs,
- unzulässige Firestore-`delete`-Rechte oder Verwechslung mit Quarantäne,
- als bereits autorisiert gemeldete OAuth-/Service-Agent-Zustände und unbewiesene Make-Kodierung.

**Auch die beste Antwort heisst nur `CONSISTENT_OFFLINE_PLAN_ONLY`, nicht PASS für echtes IAM.** Sämtliche Erlaubnis-Flags für OAuth/IAM/Deploy/Pub/Sub/Firestore/Docs/Mail bleiben ausdrücklich `false`. Es gibt keine Google-API-Aufrufe, kein Deployment-Skript und keine IAM-Mutation. Tests: `test/offerSyntheticPubsubIamPreflight.test.js`.

## 4. Voraussetzungen für einen genehmigten synthetischen Einzeltest

1. Geschäftliches Google-Konto als Publisher-Principal bestimmen und OAuth-Verbindung **erst nach gesonderter Freigabe** autorisieren; Scope und effektive IAM-Bindung prüfen, ohne Secrets/Access-Tokens in Logs zu kopieren.
2. Read-only GCP-Inventar: Pub/Sub-/Run-APIs, Projekt-/Service-Agent-Zustand, bereits vorhandene Themen, Subscriptions, Runtime-SAs und IAM-Bindungen einschliesslich geerbter Rollen/Gruppen/Deny/PAB abgleichen. Dieses Inventar wurde **noch nicht live ausgeführt**.
3. Nur mit expliziter Betreiberfreigabe eine eindeutig benannte isolierte Staging-Ressourcenmenge mit dokumentiertem Rückbauplan anlegen und auf synthetische, nicht rechtswirksame Daten beschränken.
4. Den bestehenden Make-Claim **vor Modul 5** sauber in einen nur publizierenden und dann **endenden** Zweig aufteilen; vor der Freigabe bleiben `0=1` und Inaktivstatus unberührt. **Publish-ACK ist keine Beleg-/Vertragsfreigabe.**
5. Google-OIDC-Push und tatsächliche `ingress=internal`-Zustellung erst an einem streng review-only Receiver prüfen. Pub/Sub-Nachrichten sind `at-least-once`; ein idempotenter kanonischer Firestore-Index und Review-Lock müssen Redelivery sicher abfangen. Niemals einen zweiten Beleg aufgrund eines Pub/Sub-Retry erzeugen.
6. Kostengrenze/Monitoring, Retention, Logs ohne Tokens, Rückruf der Publisher-Connection, IAM-Revoke, Topic-/Subscription-/Service-Rückbau und Quarantäne-/Offerten-Datenbankisolation definieren.

**Freigabeentscheidung:** G3/G5/G6 für echte Make-/Google-Cloud-Integration **NO-GO**. Die Original-RC1-/AVV-, Geschäfts-Drive- und Kundenpilotsperren bleiben unabhängig bestehen.
