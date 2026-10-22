# LSZH Automations – ADR G3: Make zu internem Reservierungsdienst

**Datum:** 18.10.2026
**Beschlussstatus:** VORLÄUFIGE ARCHITEKTURPRÄFERENZ – **kein IAM-, Make-, Pub/Sub- oder Cloud-Run-Go**
**Scope:** Nur die internen LSZH-Offerten im bestehenden Make-Team; **nicht** automatisch auf Kunden mit eigener Make-Organisation übertragbar.

## Entscheidung

Für den **späteren synthetischen internen Pilot** ist **Make → Google Cloud Pub/Sub (Publish Messages) → authentifizierte Push-Subscription → privater Cloud-Run-Review-Receiver → Firestore** der bevorzugte **Prüfpfad**. Dieser Pfad verlegt die sensible Service-zu-Service-Identität in Google Cloud, statt Make zur Beschaffung eines Cloud-Run-Invoker-ID-Tokens zu zwingen. Er **eliminiert aber nicht** die sichere OAuth-Authentifizierung von Make an Google Pub/Sub.

**Read-only belegt:** Das Modul `google-cloud-pubsub:publishMessage` Version 1 ist über `mcp__Make__module_spec` tatsächlich für Organisation `7700421` und Team `1728770` vorhanden. Benötigt `account:google-custom`-Verbindung; **`existing: []`**, also noch keine passende OAuth-Verbindung. Die Make-App-Dokumentation beschreibt eine Google-OAuth-2.0-Verbindung, ist aber **als KI-generiert und potenziell fehlerhaft gekennzeichnet**. Vor jeder Anlage die echten Scopes, den tatsächlichen Publisher-Principal, Redirect-URI und Autorisierungsfluss im Make-UI unter dem Geschäftskonto verifizieren. Kein Privatkonto oder weitreichender Firmeninhaber-/Owner-Account als dauerhafter Publisher.

Auch die aktuellen Google-Dokumente bestätigen, dass eine Pub/Sub-Push-Subscription mit eigenem Google-signierten OIDC-Token einen IAM-geschützten Cloud-Run-Dienst aufrufen kann; Cloud Run mit `ingress=internal` akzeptiert diese Quelle bei **gleichem Projekt/zulässiger VPC-SC-Konfiguration und regulärer `run.app`-URL**. Alle Projekt-, Netz- und IAM-Bedingungen sind im späteren synthetischen Realtest tatsächlich zu prüfen.

## Gegenüberstellung

| Option | Identität / Netzwerk | Aufwand und Kosten | Entscheidung |
|---|---|---|---|
| **A – Make direkt → Cloud Run via WIF** | Starker IAM-Schutz ohne Schlüssel möglich, benötigt jedoch einen **nachweislich von Make nutzbaren externen OIDC-IdP-Subject-Token**, Google STS und `generateIdToken`; Internet-Ingress muss einzeln freigegeben und IAM-geschützt sein | Laufend wenige Komponenten, initial komplexe Identitätskette, noch nicht verifiziert | **NO-GO / Reserve** |
| **B – Make → externer Gateway → intern Cloud Run** | Extern erreichbarer Gateway erfordert eigene starke Aufruferidentität, Schutz gegen Replay/Missbrauch/DDoS, Weiterleitung und separate Runtime-IAM-Prüfung; nackter API-Key allein reicht nicht | Mehr Angriffsfläche und Betrieb; je nach Load Balancer/Cloud Armor möglicherweise zusätzliche Fixkosten | **Nicht für den kleinen Pilot bevorzugt** |
| **C – Cloud Scheduler → interner Cloud-Run-Poller → Airtable/Make** | Keine von Make ausgehende Cloud-Ingress-Anfrage. Google-interner OIDC-Aufruf; Geschäfts-Airtable-Zugang separat nur minimal berechtigt (Credential in Secret Manager, **keine** Kundendaten-Zentralspeicherung) | Weniger Auth-Komplexität, aber periodische externe API-Abfragen und Latenz. Google Cloud Scheduler: 3 Jobs je Billing-Account frei, danach ca. **USD 0.10/Job/31 Tage** zusätzlich zu Cloud Run/Airtable, abhängig vom Einsatz | **Mögliche Rückfalloption** |
| **D – Make → Pub/Sub → interner Cloud Run** | Make Google OAuth mit **nur Topic-Publish-Berechtigung**, Pub/Sub signiert Push-Aufruf per dediziertem Google-Push-Dienstkonto, Cloud-Run-IAM am privaten Dienst, Runtime-SA nur für eng begrenzte Offerten-Firestore-DB | Ereignisgesteuert, geringe Leerkosten; Pub/Sub bietet für Basic Delivery bis **10 GiB pro Billing-Account/Monat** freien Durchsatz (aktuelle Google-Preisliste), darüber sowie Cloud Run/Logging nach Nutzung. Zusätzlich Topic, Subscription, IAM, OAuth-Renewal, Fehlerrücklauf zu betreiben | **Bevorzugte nächste Prüfrichtung, noch nicht aktiviert** |

Diese Kosten sind **keine projektgenaue CHF-Prognose**; Region Zürich `europe-west6`, Nachrichtengrösse, Subscription-Typ, Speicher-/Transfer- und Loggingkosten sowie Auslastung vor einer Betriebsfreigabe mit der Google-Abrechnung prüfen.

## Vorgeschlagene Rechteverteilung – nicht umgesetzt

- **Make-Publisher:** ein ausdrücklich genehmigter, minimal berechtigter **geschäftlicher** Google-OAuth-Principal mit `roles/pubsub.publisher` **nur auf dem für LSZH-Offerten bestimmten Topic**, nicht als Firmen-Owner und ohne Firestore/Drive/Service-Account-TokenCreator. OAuth-Scope und effektive Berechtigungen im UI/IAM verifizieren; Make speichert das OAuth-Credential, nicht einen Google-Service-Account-JSON-Schlüssel.
- **Pub/Sub-Topic:** nur kleine, synthetische bzw. künftig minimale korrelierte Signale, **keine** PDF-Bytes, echten Vertragsnamen, Empfängeradressen oder Roh-Token. Erst nach Prüfung Nachrichtenschema und pro-Organisation-/pro-Kunde-Trennung festlegen.
- **Push-Subscription:** im **selben GCP-Projekt** wie der private Ziel-Cloud-Run-Dienst; dedizierter Push-Invoker-SA mit `roles/run.invoker` **nur auf diesem Dienst**. Pub/Sub-*Service-Agent* muss für diesen Push-SA OIDC-Tokens generieren dürfen. In Projekten, deren Pub/Sub-Service-Agent bereits die relevante `roles/pubsub.serviceAgent`-Berechtigung besitzt (insbesondere bei neueren Projekten), ist ein zusätzlicher `roles/iam.serviceAccountTokenCreator`-Grant **nicht automatisch erforderlich**. Vor jeder Änderungsabsicht die **bestehenden** effektiven `iam.serviceAccounts.getOpenIdToken`-Rechte prüfen; **kein** pauschaler Grant auf Projekt/Organisationsebene. Falls dennoch nötig, einzeln auf den Push-SA begrenzen und separat freigeben. Subscription-Provisionierung erfordert zudem eine genehmigte `iam.serviceAccounts.actAs`-Berechtigung des Operators. **Diese Rollen sind noch nicht live inventarisiert oder eingerichtet.**
- **Privater Receiver:** eigener, derzeit **nicht** erstellter Review-Handler, nur intern erreichbares Cloud Run mit IAM erforderlich. Gesonderter Runtime-SA mit Minimalrechten auf die genehmigte *Offerten*-Firestore-Datenbank. Keinen Zugriff auf Quarantäne-CAS, Mail-, Drive- oder andere Kundenkonten.
- **Canonical source:** die Pub/Sub-Nachricht ist nur ein Hinweis. Der Receiver prüft den eindeutig indexierten, synthetischen Firestore-Datensatz selbst, wertet Claim/Version/Review-Key aus und schreibt ausschliesslich den bestehenden `receiptReviewLock` atomar. **Kein PDF/Vertrag, kein Versand**.

## Kritische Semantik: asynchron, kein GO an Make

Ein `Publish Messages`-Erfolg bestätigt **nur die Annahme durch Pub/Sub**, **nicht** die Reservierung oder die Offertenannahme. Es ist **verboten**, dass derselbe Make-Durchlauf nach erfolgreichem Publish einfach zu **Google-Docs-Modul 5** weiterläuft. Beim späteren Umbau muss der Publish-Pfad als endgültiger **STOP** enden; ein *separat freigegebener* dauerhafter Rückkanal/Statusabgleich (z. B. bewusst validierter Airtable-Status, niemals eine direkt vertrauenswürdige Freigabe aus Make selbst) ist nötig, bevor Folgeaktionen ermöglicht werden.

Pub/Sub-Push arbeitet mit **at-least-once**-Zustellung. Dieselbe Nachricht oder derselbe fachliche Auftrag kann erneut erscheinen; die Pub/Sub-`messageId` ist **keine** fachliche Idempotenzkennung. Deduplizierung und Lock bleiben im Firestore-Quellindex auf der stabilen `receiptReviewKey`/`attemptId`-Bindung. Nach 15-minütiger Review-Frist nie automatisch entriegeln. Dead-letter-Retry- und 2xx-Acknowledgment-Regeln erst nach einem transaktionalen, nachweislich dauerhaften Review-State definieren; ungültige Nachrichten unter gesonderter Nicht-Replay-/Audit-Policy behandeln. Keine automatisch erstellten PDFs oder E-Mails nach Pub/Sub-Redelivery.

## Offline-Implementierung und Grenzen

- `cloud-run/offer-portal-staging/syntheticPubsubReviewTransport.mjs` erzeugt nur `PLAN_ONLY_DO_NOT_PUBLISH` und kann eine strikt künstliche, Google-Pub/Sub-förmige Push-Nachricht gegen einen bereits kanonisch aufgelösten synthetischen Offer prüfen. Ausgaben **ausschliesslich STOP_REVIEW_ONLY bzw. NO_GO**, Actionflags immer false. Der Parser **authentifiziert nicht** den echten Google-Push-Aufrufer; dies wäre Aufgabe der später geprüften Cloud-Run-IAM-/Push-Konfiguration.
- `test/offerSyntheticPubsubReviewTransport.test.js`: AVV Ja/Nein, keine Roh-Token/E-Mails, Replay mit anderer Pub/Sub-ID, falsche Topic-/Subscription-Zuordnung, Schema-/Base64-/Datenmanipulation und kanonische Offer-Mismatch. Keine Make-, Pub/Sub-, Firestore- oder Cloud-Provider-Aufrufe.
- Bestehendes Make-Szenario `7940220` bleibt **inactive**, beide `0=1`-Gates unverändert. Keine neue Make-Szenarioressource, kein Cloud-Topic, keine Subscription, kein neuer Runtime-SA, kein IAM-Grant, kein Deploy oder Mail.
- **Nicht nachgewiesen:** reale Google-OAuth-Anmeldung der Publisher-Identität in Make; dessen effektive Scopes/Topic-Policy; interner Push mit OIDC über tatsächlich zulässige Region/Projekt/URL; Source-Index in Live-Firestore; separater Rückkanal und betriebliches Monitoring.

## 18.10.2026 – Offline-IAM-Preflight und Encoding-Klarstellung

**Make-Modul präzise kontrolliert:** `google-cloud-pubsub:publishMessage` verlangt eine `account:google-custom`-Connection (aktuell keine bestehende) und `messages[].data` mit optionalen Attributen. Die Make-Spezifikation erklärt **nicht**, ob `data` roh oder base64-vorverarbeitet einzutragen ist. Die Google-Pub/Sub-REST-Publish-API verwendet Base64 im **Wire-JSON**; diese Darstellung ist nicht ohne Prüfung als natives Make-Eingabefeld zu übernehmen. Der reine Offline-Vertrag `syntheticPubsubReviewTransport.mjs` kennzeichnet sein Feld darum ausdrücklich mit `dataFormat=PUBSUB_REST_BASE64_WIRE_ONLY` und `makeNativeDataEncodingVerified=false`. **Kein Echt-Publish vor bestätigter Modulkodierung.**

**Google-OAuth-Scope:** `https://www.googleapis.com/auth/pubsub` oder `https://www.googleapis.com/auth/cloud-platform` ist für `projects.topics.publish` zulässig; der tatsächliche Make-Credential-Scope ist noch nicht geprüft. Ausschlaggebend für echte Least-Privilege-Autorisierung ist die **Topic-spezifische** IAM-Rolle `roles/pubsub.publisher`, keine Annahme über den Scope allein. Referenzen https://docs.cloud.google.com/pubsub/docs/reference/rest/v1/projects.topics/publish und https://docs.cloud.google.com/pubsub/docs/publisher .

**Neue Offline-Prüfung:** `syntheticPubsubIamPreflight.mjs` enthält nur ein künstliches, nicht ausführbares Rollen-/Scope-Manifest für genau ein Geschäftstopic, eine Push-Subscription, ein privates Cloud Run in `europe-west6` sowie getrennte Push-/Runtime-Serviceaccounts. `test/offerSyntheticPubsubIamPreflight.test.js` lehnt unter anderem breite Publisher-/Invoker-Rollen, `ingress=all`, fremde Projekte/Quarantäne-Firestore und als bestätigt vorgetäuschte TokenCreator- oder OAuth-Verbindungen ab. Selbst die beste Antwort bleibt `CONSISTENT_OFFLINE_PLAN_ONLY` – **nie** IAM- oder Deploy-GO. **CI [39130070253](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39130070253) SUCCESS: 164 reguläre PASS/0 FAIL/5 SKIP, 19 Emulator PASS, Browser/Container PASS.**

**Nächste Aufgabe:** Nur lesendes Cloud-IAM-/Pub/Sub-Inventar inklusive vorhandener Service-Agent-Berechtigung, Make-Geschäfts-OAuth und nativer Modul-Datenkodierung bestätigen; erst danach über einen einzigen genehmigten synthetischen Publish-/Push-Test entscheiden. Detaillierter Preflight: `docs/LSZH_G3_PUBSUB_IAM_PREFLIGHT_20261018.md`.

---

## Pilotentscheid und nächste Verifikation

**Vorläufiger Entscheid:** Variante **D** für den LSZH-*eigenen* Offertenprozess weiter verifizieren, Variante **C** als einfachere Alternative ohne Make-Pub/Sub-Verbindung offen halten. Varianten A/B für diesen Pilot nicht priorisieren. **Keine Übertragung auf Kunden mit eigenem Make-Konto**, bis mandantengetrennte IAM-/Topics-/Kosten-/Berechtigungsrichtlinien definiert sind.

**Nächste erlaubte Vorbereitung:** nur lesend Google Cloud API/Topic-Bestand und Make-OAuth-Verbindungsoptionen/Scope-Anforderungen prüfen; ein synthetisches Rollen-/Rollback-Manifest erstellen. **Vor tatsächlichen Ressourcen oder OAuth-Autorisierung ausdrückliche separate Betreiberentscheidung**. Ebenso bedarf die Ersetzung des Make-Modul-2-Gates und jedes Folge-GO eines separaten Pilot-Reviews.

Quellen:
- https://docs.cloud.google.com/run/docs/securing/ingress
- https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions
- https://docs.cloud.google.com/pubsub/docs/exactly-once-delivery
- https://docs.cloud.google.com/pubsub/docs/access-control
- https://cloud.google.com/pubsub/pricing
- https://cloud.google.com/scheduler/pricing
- https://apps.make.com/http
