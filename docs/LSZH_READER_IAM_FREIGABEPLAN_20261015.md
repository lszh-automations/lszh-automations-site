# LSZH – Freigabevorlage für eine separate STAGING-Leseidentität

**Datum: 15.10.2026. Status: Planung, nicht freigegeben.**

## Verifizierter Bestand

- Projekt: `lszh-automations`; benannte Firestore-STAGING-Datenbank: `lszh-offers-staging`, Region `europe-west6`.
- Bereits produktionsgetrennter Preflight `lszh-offer-portal-staging` nutzt `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com` mit `roles/datastore.user`, gebunden an die Bedingung `resource.name == "projects/lszh-automations/databases/lszh-offers-staging"`. **Die bestehende IAM-Bindung nicht ändern.** Die Rolle enthält grundsätzlich lesende und schreibende Datenzugriffe.
- Vorhandenes Konto `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com` hat bei der direkten projektweiten Rollenabfrage keine Bindung geliefert; mögliche Ordner-/indirekte Rechte bleiben ungeprüft. Nicht für einen Annahmedienst umwidmen.
- Der separat geplante Cloud-Run-Dienst `lszh-offer-acceptance-staging` und der Konto-Vorschlag `lszh-offer-reader@lszh-automations.iam.gserviceaccount.com` wurden in Google Cloud per read-only Describe unter dem Nutzerkonto mit `NOT_FOUND` bestätigt.
- Der ähnlich benannte Render-Webdienst `lszh-offer-acceptance-staging` besteht separat. Nicht mit dem geplanten Google-Cloud-Run-Dienst verwechseln.

## Vorgelegte Auswahl – erst nach ausdrücklicher Genehmigung umsetzen

| Eigenschaft | Konkreter Vorschlag |
| --- | --- |
| Kontotyp | Benutzerverwaltetes Google-Cloud-Servicekonto |
| Konto-ID | `lszh-offer-reader` |
| Konto-E-Mail | `lszh-offer-reader@lszh-automations.iam.gserviceaccount.com` |
| Bezeichnung | `LSZH Offer Reader – Staging Only` |
| Firestore-Rolle | **`roles/datastore.viewer`** (read-only, keine `datastore.entities.create/update/delete`) |
| IAM-Scope | Nur benannte Datenbank mittels **IAM Condition** |
| Condition-Titel | `LSZHOfferReaderOnlyStagingFirestore` |
| Condition-Ausdruck | `resource.name == "projects/lszh-automations/databases/lszh-offers-staging"` |
| Schlüsseldateien | **Keine** exportierten Service-Account-JSON-Keys |
| Cloud-Run-Zuordnung | Später an **neuen** `lszh-offer-acceptance-staging` binden; nicht an bestehenden Preflight |
| Automatischer Deploy | **Keiner** |
| E-Mail/Make/Vertragsannahme | **Deaktiviert** |
| Firestore-Schreibrechte | **Keine** |
| Google-Drive-/Airtable-Zugriff | Separat bewilligen und nachweisen; durch Firestore-IAM nicht abgedeckt |

Die projektweite IAM-Bindung müsste bei Freigabe die **Condition für die einzelne Firestore-Datenbank** enthalten. Eine unbedingte Projektrolle `roles/datastore.viewer` wird **nicht** vorgeschlagen. `roles/datastore.user`, `roles/editor`, `roles/owner` und Service-Account-Token-Creator wären für diesen Lese-Test unpassend.

## Sicherer späterer Ablauf mit Freigabegrenzen

1. **Vorabprüfung (lesend):** Kontoexistenz erneut abfragen; Zielprojekt und benannte Datenbank bestätigen. Bereits verifizierter Ausgangspunkt: Konto nicht vorhanden.
2. **Freigabepunkt A:** Nur nach ausdrücklicher Zustimmung das eine dedizierte, noch nicht existente Dienstkonto erstellen – ohne Schlüsseldatei, ohne zusätzliche Rolle.
3. **Freigabepunkt B:** Nur nach ausdrücklicher Zustimmung genau eine bedingte `roles/datastore.viewer`-IAM-Zuweisung für dieses neue Konto vornehmen. Die bestehende bedingte Preflight-Rolle bleibt unangetastet.
4. **Nachprüfung (lesend):** Name des Kontos, direkte IAM-Bindungen, exakter Condition-Titel und Ausdruck sowie Fehlen unbedingter Zusatzrollen prüfen. Die Existenz von Bindings alleine beweist keine effektive Dienstidentität.
5. **Späterer separater Freigabepunkt:** Einen *neuen*, intern abgesicherten Cloud-Run-Lesedienst erst nach eigenem Review deployen. Für den ausführenden Deployer kann die Berechtigung `iam.serviceAccounts.actAs` **auf genau diesem Servicekonto** nötig sein; nicht vorsorglich breit vergeben.
6. **Echte rein lesende Laufzeitprobe:** Firestore-GET auf die **benannte** STAGING-Datenbank und verlässlich fehlende Schreibrechte prüfen, ohne einen Test-Schreibvorgang auszulösen. Google-Drive-/Airtable-Identität und Secret-Zugriff benötigen unabhängige Nachweise.
7. **Spätere Vertragsfunktion:** Transaktionale Firestore-Schreibrechte, E-Mail-Outbox, echtes PDF-/Vertragsarchiv und rechtliche Freigaben RC1/AVV sind ein anderer, **nicht** durch diese Vorlage abgedeckter Projektabschnitt.

## Quellen / Grenzen

- Firestore-Rollen: https://cloud.google.com/iam/docs/roles-permissions/firestore
- Benannte Firestore-Datenbanken und IAM-Bedingungen: https://cloud.google.com/firestore/docs/manage-databases
- Cloud Run Service Identity: https://cloud.google.com/run/docs/configuring/services/service-identity
- Erstellung dedizierter Servicekonten: https://cloud.google.com/iam/docs/service-accounts-create

**Diese Datei ist eine rein informative Freigabevorlage. Sie enthält keine ausführbaren Befehle zur Kontoerstellung, IAM-Änderung oder Deployment und löst keine externen Änderungen aus.**
