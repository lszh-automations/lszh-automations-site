# LSZH – STAGING-Leseidentität: Freigabevorlage und Umsetzungsnachweis

**Datum: 15.10.2026. Stand: Kontoerstellung und bedingte Viewer-Rolle per Google-Cloud-Shell-Ausgabe des Nutzers bestätigt.** Die nachfolgende Planung dokumentiert den ursprünglichen Freigabeumfang; **weitere Schritte bleiben unbewilligt**.

## Umsetzungsnachweis (nach ursprünglicher Planerstellung)

- **Erledigt:** Nutzer bestätigte ausdrücklich beide genau bezeichneten IAM-Änderungen und führte die Befehle in Google Cloud Shell aus: `Created service account [lszh-offer-reader]` und `Updated IAM policy for project [lszh-automations]`.
- **Erledigt:** Nachkontrolle liefert `ROLE: roles/datastore.viewer`, `TITLE: LSZHOfferReaderOnlyStagingFirestore`, `EXPRESSION: resource.name == "projects/lszh-automations/databases/lszh-offers-staging"`. Die im Chat mitgeteilte Projekt-Policy führt das Konto ausschliesslich mit dieser direkten bedingten Rolle auf.
- **Nicht ausgeführt/nicht genehmigt:** Neues Cloud-Run-Deployment, echte SDK-Laufzeitprüfung, zusätzliche IAM-Rechte, Firestore-Writes, Drive- und Airtable-Anbindung, private Schlüsseldateierstellung, E-Mails, Verträge oder Aufbewahrungssperren. Bestehende Preflight-Rolle bleibt gemäss Projekt-Policy erhalten.
- **Noch zu prüfen:** Konto `disabled=false`, Liste nutzerverwalteter Servicekonto-Schlüssel, effektiver Datenbank-GET unter der neuen Identität; lediglich die Rollenbindung ist bisher belegt.



## Verifizierter Bestand

- Projekt: `lszh-automations`; benannte Firestore-STAGING-Datenbank: `lszh-offers-staging`, Region `europe-west6`.
- Bereits produktionsgetrennter Preflight `lszh-offer-portal-staging` nutzt `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com` mit `roles/datastore.user`, gebunden an die Bedingung `resource.name == "projects/lszh-automations/databases/lszh-offers-staging"`. **Die bestehende IAM-Bindung nicht ändern.** Die Rolle enthält grundsätzlich lesende und schreibende Datenzugriffe.
- Vorhandenes Konto `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com` hat bei der direkten projektweiten Rollenabfrage keine Bindung geliefert; mögliche Ordner-/indirekte Rechte bleiben ungeprüft. Nicht für einen Annahmedienst umwidmen.
- Der separat geplante Cloud-Run-Dienst `lszh-offer-acceptance-staging` und der Konto-Vorschlag `lszh-offer-reader@lszh-automations.iam.gserviceaccount.com` wurden in Google Cloud per read-only Describe unter dem Nutzerkonto mit `NOT_FOUND` bestätigt.
- Der ähnlich benannte Render-Webdienst `lszh-offer-acceptance-staging` besteht separat. Nicht mit dem geplanten Google-Cloud-Run-Dienst verwechseln.

## Ursprünglich vorgelegte Auswahl – die Kontoerstellung und Viewer-Zuweisung sind inzwischen erfolgt

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

## Ursprünglicher Ablauf mit Freigabegrenzen (Schritte 1–4 inzwischen per Nutzerausgabe nachgewiesen bzw. zu prüfen)

1. **Ursprüngliche Vorabprüfung (lesend):** Konto war vor der Erstellung nicht vorhanden; inzwischen wurde die Einrichtung bestätigt.
2. **Freigabepunkt A – erledigt:** Das dedizierte Konto wurde nach Freigabe erstellt. Eine exportierte Schlüsseldatei wurde nicht durch den dokumentierten Befehl erstellt.
3. **Freigabepunkt B – erledigt:** Die einzelne bedingte `roles/datastore.viewer`-Projektbindung ist in der vom Nutzer gelieferten IAM-Ausgabe bestätigt. Die bestehende Preflight-Rolle bleibt unverändert.
4. **Nachprüfung (teilweise erledigt):** Konto-E-Mail, direkte Projekt-IAM-Bindung, Condition-Titel und Ausdruck bestätigt. Kontoaktivierung, mögliche zusätzliche ressourcenbezogene/geerbte Rechte und effektive SDK-Datenbank-Leseberechtigung bleiben separat zu prüfen.
5. **Späterer separater Freigabepunkt:** Einen *neuen*, intern abgesicherten Cloud-Run-Lesedienst erst nach eigenem Review deployen. Für den ausführenden Deployer kann die Berechtigung `iam.serviceAccounts.actAs` **auf genau diesem Servicekonto** nötig sein; nicht vorsorglich breit vergeben.
6. **Echte rein lesende Laufzeitprobe:** Firestore-GET auf die **benannte** STAGING-Datenbank und verlässlich fehlende Schreibrechte prüfen, ohne einen Test-Schreibvorgang auszulösen. Google-Drive-/Airtable-Identität und Secret-Zugriff benötigen unabhängige Nachweise.
7. **Spätere Vertragsfunktion:** Transaktionale Firestore-Schreibrechte, E-Mail-Outbox, echtes PDF-/Vertragsarchiv und rechtliche Freigaben RC1/AVV sind ein anderer, **nicht** durch diese Vorlage abgedeckter Projektabschnitt.

## Quellen / Grenzen

- Firestore-Rollen: https://cloud.google.com/iam/docs/roles-permissions/firestore
- Benannte Firestore-Datenbanken und IAM-Bedingungen: https://cloud.google.com/firestore/docs/manage-databases
- Cloud Run Service Identity: https://cloud.google.com/run/docs/configuring/services/service-identity
- Erstellung dedizierter Servicekonten: https://cloud.google.com/iam/docs/service-accounts-create

**Diese Datei dokumentiert die im Chat erfolgreich nachgewiesene Kontoerstellung und Viewer-Bindung. Das Aktualisieren dieser Datei löst keine weiteren externen Änderungen aus. Alle darüber hinausgehenden Infrastruktur-Schritte benötigen eine eigene Freigabe.**
