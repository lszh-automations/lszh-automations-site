# LSZH Automations – G3 Pub/Sub: Berechtigungs-, Freigabe- und Rückbauplan

**Version:** 18.10.2026 – Betreiberentscheidung **AUSSTEHEND**  
**Strikte Wirkung:** Dieses Dokument autorisiert **keine** Cloud-/Make-/IAM-Änderung. GitHub Draft PR #5 bleibt ungemergt; bestehendes Make-Szenario `7940220` bleibt inaktiv, mit `0=1`-Gates für Anspruch (Modul 2) und Mail (Modul 8).

## A. Nachgewiesene Ausgangslage – kein geschätzter Istzustand

Die geschäftliche Cloud Shell hat am **18.10.2026** `READ_ONLY_INVENTORY_WITH_UNVERIFIED_EFFECTIVE_IAM` geliefert:
- Projekt `lszh-automations`, Region `europe-west6`, fünf APIs **ENABLED**: Pub/Sub, Cloud Run, IAM, Firestore, Service Usage.
- **0 Topics, 0 Subscriptions**, **8 vorhandene Dienstkonten**, **6 Cloud-Run-Dienste**; die vorgesehenen G3-Ressourcen wurden in diesen erfolgreichen Listen nicht gefunden.
- Pub/Sub-Service-Agent: direkte Bindung `roles/pubsub.serviceAgent` im Projekt-IAM erkennbar. **`iam.serviceAccounts.getOpenIdToken` effektiv, IAM-Deny/PAB/Gruppe und Ingress noch nicht nachgewiesen.**
- Live-Make-Modul `google-cloud-pubsub:publishMessage` v1 vorhanden, Verbindung `account:google-custom` mit `existing: []`. Der tatsächlich von Make beschaffte OAuth-Scope und die Kodierung von `messages[].data` sind **unbekannt**.

## B. Soll-Berechtigungsmatrix – jedes Recht bleibt zunächst ein Antrag

| Akteur | Vorgesehene Ressource | Kleinste geplante Berechtigung | Nachweis vor tatsächlicher Anlage |
| --- | --- | --- | --- |
| **Make-Publisher über dediziertes Geschäftskonto** | NUR `projects/lszh-automations/topics/lszh-g3-review-staging` | `roles/pubsub.publisher` **am Topic**, nicht am Projekt | Geschäftliche, nicht private Google-Identität; OAuth-Scope und effektive IAM-/Gruppenrechte prüfen; kein Owner als Dauer-Publisher; keine JSON-Key-Dateien |
| **Pub/Sub Push-Invoker-SA** `lszh-g3-push-stg@lszh-automations.iam.gserviceaccount.com` | NUR Cloud Run `lszh-g3-review-staging` in `europe-west6` | `roles/run.invoker` **am einen Dienst** | Effektive Rollen einschliesslich Deny/PAB; niemals `allUsers` oder `allAuthenticatedUsers` |
| **Pub/Sub-Service-Agent** `service-<PROJECT_NUMBER>@gcp-sa-pubsub.iam.gserviceaccount.com` | Google-signierter OIDC-Push als genau definierter Push-SA | `iam.serviceAccounts.getOpenIdToken`, soweit bereits durch `roles/pubsub.serviceAgent` wirksam | **Zuerst vorhandene effektive Berechtigung testen; keine zusätzliche `roles/iam.serviceAccountTokenCreator`-Bindung auf Vorrat.** Für ältere Projekte kann die zusätzliche Rolle nötig sein; niemals breit vergeben |
| **Konfigurierender Operator** | Push-Invoker-SA für Anlage/Änderung der Subscription | Ggf. `iam.serviceAccounts.actAs` **auf genau diesem SA** | Vorab IAM-Troubleshooter/effektive Vererbung prüfen; nur temporäre explizit freigegebene Administratorrechte |
| **Cloud-Run-Runtime-SA** `lszh-g3-reserve-stg@lszh-automations.iam.gserviceaccount.com` | NUR benannte Firestore-DB `lszh-offers-staging` | Kandidat: `datastore.databases.get` **(Firestore-Transaktionsstart/-rollback)**, `datastore.entities.get/create/update`; **kein delete** | Gültige DB-spezifische IAM-Condition und wirksame Berechtigungen prüfen; SDK könnte für Initialisierung zusätzliche Metadaten-Leserechte brauchen – erst emuliert und mittels kontrolliertem Test verifizieren; **kein Zugriff auf Quarantäne-Datenbank** |
| **Review-Receiver** (Cloud Run) | `lszh-g3-review-staging` | `ingress=internal`, `require IAM`, originale `run.app`-URL, eigenes Runtime-SA | Subscription im selben Google-Cloud-Projekt; keine öffentlichen Kunden-/Dokument-/PDF-/Mail-/Annahme-Endpunkte; Auth-Audience und Invoker unabhängig validieren |

**Wichtige IAM-Klarstellung:** Die Google-Pub/Sub-Service-Agent-Rolle umfasst `iam.serviceAccounts.getOpenIdToken` laut Rollendokumentation. Unsere echte Inventur bestätigt einen **direkten Projekt-Rolleneintrag**, aber noch nicht dessen **effektive** Wirkung. Zusätzliche TokenCreator-Rechte sind daher **weder automatisch erforderlich noch automatisch erlaubt**. Bei Projekten vor dem 08.04.2021 gibt es ein dokumentiertes Sonderverfahren; eine eventuelle Erweiterung ist ein eigener Änderungsantrag.

**OAuth und Datenkodierung:** Google Pub/Sub REST akzeptiert `https://www.googleapis.com/auth/pubsub` oder `https://www.googleapis.com/auth/cloud-platform`. Der spezifische native Make-OAuth-Client-Scope ist noch nicht belegt. IAM am einzelnen Topic ist die eigentliche Veröffentlichungsgrenze. `messages[].data` der REST-API ist Base64-Wire-JSON; Make könnte bei nativer Modulkonfiguration selbst kodieren. **Keine Kopie des REST-Base64-Feldes in ein Make-Modul vor kontrolliertem synthetischem Encoding-Nachweis.**

## C. Phasenplan mit ausdrücklich separaten Freigaben

**Phase 0 – vorbereitet, keine Änderung (aktueller Zustand):** Inventur bestätigen, IAM/Deny-/PAB-/Gruppeneffekte und dedizierte Geschäfts-Publisher-Identität lesend prüfen, minimalen Firestore-Transaction-Permissionsatz als Kandidat dokumentieren. Exaktes `run.app`-Ziel/Audience existiert noch nicht. Alle Skripte/Tests rein offline.

**Phase 1 – nur nach expliziter Betreiberfreigabe:** Eigene Staging-Push-SA und Staging-Runtime-SA, **review-only** Cloud-Run-Receiver ohne Kunden-/PDF-/Mail-Funktionen, ein isoliertes Topic und eine OIDC-Push-Subscription aufbauen. Minimal-Grant auf konkreten Dienst und Datenbank, IAM-Readback; keine produktiven Szenarien starten. Dabei kann schon die Ressourcenerstellung Kosten verursachen und muss zeitlich/finanziell begrenzt werden.

**Phase 2 – gesonderte Freigabe:** Business-Google-OAuth-Connection für Make-Pub/Sub herstellen und nur einen synthetischen `TEST_ONLY_NO_CONTRACT`-Datensatz mit AVV Ja/Nein-Dummy-Nachricht bei Bedarf testen. **Vorher** native Make-Datenkodierung mit einer unabhängigen Beobachtung verifizieren. Nicht mit privatem Konto einloggen; keine OAuth-Secrets in Chat oder Logs.

**Phase 3 – gesonderte technische und geschäftliche Freigabe:** Dauerhafte IAM-verifizierte Pub/Sub-Push-Verarbeitung in der **isolierten** Testumgebung, genau definierte 2xx-/Retry-/Dead-letter-Policy, atomarer Firestore-Quellindex/Review-Lock, eigene Überwachung. **Make beendet nach Publish den Lauf**, niemals durchrouten zu Google Docs Modul 5. Erfolg bei Pub/Sub ist **kein** bestätigter Firestore-Claim oder Vertragsabschluss.

**Phase 4 – Pilot, separate juristische/operative Freigabe:** Original-RC1-/AVV-Verträge, Geschäfts-Drive-Beweisarchiv, Zustell-Deduplizierung, Incident-/Recovery-Runbook, genau benannter Kunde und schriftlicher Pilot-GO. Bis dahin keinerlei Kundenmails, Rechnungen oder Annahmeaktivierung.

## D. Rückbau-/Notfallplan vor jeder Phase

Der Rollback wird **vor** dem ersten Schreibschritt als Checkliste durch den Betreiber genehmigt; bis dahin existieren keine neuen G3-Ressourcen, die abgebaut werden müssten.

1. **Sofortiger Stopp:** keine neuen Make-Publishes. Das Ausgangsszenario bleibt inaktiv und durch `0=1` gesperrt. Eine erneute Aktivierung braucht explizites GO.
2. **Zugriff sperren:** Topic-Publisher-Berechtigung gezielt für den G3-Publisher widerrufen bzw. dedizierte OAuth-Connection deaktivieren; **nicht** allgemeine bestehende Geschäfts-Connections zerstören.
3. **Push isolieren:** Subscription pausieren/entkoppeln oder (nach Sicherung eines Review-Audit-Entscheids) entfernen; private Cloud-Run-Invoker-Berechtigung gezielt entfernen. Pub/Sub kann Nachrichten wiederholt zustellen: Belege und Status **nicht** automatisch neu erzeugen.
4. **Bestände sichern und bewerten:** synthetische Source-/Review-/Message-IDs abgleichen, vollständig offene oder quarantänisierte Tests markieren, keine Kundendaten löschen und keine automatischen Firestore-Lock-Resets ausführen. Bei einer bestehenden Subscription beachten, dass sie nach Entfernen Nachrichten nicht mehr zustellt und noch nicht verarbeitete Nachrichten verloren gehen können; vor Entfernen Audit-/Retry-Verpflichtungen bewerten.
5. **Nur eigens angelegte G3-Ressourcen beseitigen:** Cloud-Run-Receiver, Topic, Subscription und G3-spezifische Serviceaccounts samt gezielten IAM-Bindungen; keinerlei bestehende sechs Cloud-Run-Dienste, acht Dienstkonten, Quarantäne-CAS, Archiv-Reader oder Business-Drive löschen.
6. **Verifizieren:** Dienst/Topic/Subscription fehlen wie geplant, keine anomalen Invoker-/Publisher-/TokenCreator-Bindungen, keine Testbelege/Mails erstellt, Cloud-Run-Build/Logs/Kosten kontrolliert und Incident dokumentiert.

**Kostenkontrolle:** vor Phase 1 ein fixes Budget in CHF und temporäre Alarm-/Budgetkonfiguration genehmigen. Pub/Sub, Cloud Run, Artefakt-Builds, Logging und Staging-Speicher können Gebühren erzeugen; **kein** Budget-/Free-Tier-Versprechen für alle Komponenten. Region `europe-west6` beibehalten; für Pub/Sub Topic keine als Region garantierte Speicherung ohne separate Message-Storage-Policy/Regionalkonfiguration behaupten.

## E. Messbare No-Go-Kriterien

- `existing: []` bei Make-Pub/Sub, Publisher-/IAM-Principal unklar oder Scope nicht belegbar.
- Effektive SA-/IAM-/Deny-/PAB-/Organisationsberechtigungen nicht geprüft.
- Kein eigener IAM-pflichtiger Review-Receiver mit geprüfter `internal`-Route und gleichprojektiger OIDC-Push-Subscription.
- Ungeklärte native Make-Datenkodierung, Reply/ACK-/Retry-Verhalten oder keine eigene kanonische Firestore-Idempotenz.
- Fehlende unabhängige Pilot-/Juristen-/Datenschutz-/Geschäftsfreigabe.

**Stand 18.10.2026: Diese No-Go-Kriterien sind noch erfüllt. Ergebnis: NO-GO für jegliche G3-Cloud-Ressourcenerstellung durch das Startsignal `Vamos` allein.**

## Quellen

- Google Pub/Sub IAM: https://docs.cloud.google.com/pubsub/docs/access-control
- Pub/Sub Topic-Publish-Scopes: https://docs.cloud.google.com/pubsub/docs/reference/rest/v1/projects.topics/publish
- Authentifizierter Push: https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions
- Cloud Run Pub/Sub-Tutorial (Service-Agent-Sonderfall): https://docs.cloud.google.com/run/docs/tutorials/pubsub
- Cloud Run internal ingress: https://docs.cloud.google.com/run/docs/securing/ingress
- Firestore Transaktionen/IAM: https://docs.cloud.google.com/firestore/native/docs/security/iam
- Pub/Sub Retry: https://docs.cloud.google.com/pubsub/docs/subscription-retry-policy
