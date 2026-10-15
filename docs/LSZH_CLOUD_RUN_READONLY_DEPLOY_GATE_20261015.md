# LSZH – Sicherheits-Freigabegate für den geplanten Cloud-Run-Lesedienst

**Stand 15.10.2026. ENTWURF. Kein Deployment freigegeben oder ausgeführt.**

## Nachgewiesene Voraussetzungen

| Gegenstand | Evidenz | Bewertung |
| --- | --- | --- |
| Firestore | `lszh-offers-staging`, Projekt `lszh-automations`, Region `europe-west6` | Vorhanden |
| Neuer Laufzeit-Serviceaccount | `lszh-offer-reader@lszh-automations.iam.gserviceaccount.com` | Vorhanden |
| Rolle | `roles/datastore.viewer` mit `LSZHOfferReaderOnlyStagingFirestore` | Direktes IAM-Binding nachgewiesen |
| Geltungsbereich | `resource.name == "projects/lszh-automations/databases/lszh-offers-staging"` | Bedingung nachgewiesen |
| Konto-Deaktivierung | `DISABLED` leer beim `describe` | Kein `true`, aber kein explizites Boolean-`false`-Readback |
| Nutzerverwaltete Schlüssel | `gcloud iam service-accounts keys list --managed-by=user` → `Listed 0 items` | Keine nutzerverwalteten Schlüssel vorhanden |
| Bestehender Cloud-Run-Preflight | `lszh-offer-portal-staging` mit separater Identität | Vorhanden, **nicht überschreiben** |
| Neuer Cloud-Run-Dienst | `lszh-offer-acceptance-staging` | Noch nicht vorhanden |
| Cloud-Run-HTTP-Gateway | `services/offer-acceptance-staging/app.js` im **Feature-Branch** | Ausschliesslich lokal und Emulator geprüft, nicht deployed |
| Firestore SDK-Reader | `stagingFirestoreConnection.js`, `stagingReadProbe.js`, Gateway opt-in-Route | Im Feature-Branch verdrahtet; **reale Cloud-Run-Laufzeitverbindung noch nicht verifiziert** |
| Drive-Revisionsretention | Drei synthetische PDF-Revisionen mit `keepForever=false` | **BLOCKED** für Archivfreigabe |

## Absicherungen vor einem späteren Deployment

1. **Separate explizite Freigabe** für das Erstellen des neuen Cloud-Run-Dienstes mit der bestätigten Leser-Identität. Keine Freigabe zum Überschreiben des bestehenden Preflight-Dienstes, von Render-Services oder der Website.
2. **Feature-Branch-Gateway ist nun mit festem read-only HTTP-Firestore-Pfad verdrahtet.** OCI-Image-Digests und Firestore-9.3.1-Lockfile fixiert, Trivy-/npm-Sicherheitsprüfung (aktuell 0 HIGH/CRITICAL bzw. 0 npm-Advisories) und Container-Smoke-Test bestanden. **Das beweist noch keine echte Cloud-Run-Laufzeitverbindung und ist keine Deployfreigabe.** Für eine spätere Bereitstellung unveränderlichen Build-Commit, Cloud-Run-IAM, Ingress und Sicherheitsreview separat freigeben.
3. **Standardmässig keinen anonymen öffentlichen Aufruf** erlauben: `--no-allow-unauthenticated`, strenge Ingress-Einstellung passend zum Prüfzweck und IAM-`run.invoker` nur für ausdrücklich benannte Testidentitäten nach Review. Keine Servicekonto-Keydatei.
4. Cloud-Run-Service-Identität muss **genau** `lszh-offer-reader@lszh-automations.iam.gserviceaccount.com` sein. Die Berechtigung `iam.serviceAccounts.actAs` des Deployers falls erforderlich nur für **dieses Konto** separat bewilligen; keine projektweite pauschale IAM-Freigabe.
5. Explizite feste Serverkonfiguration für Projekt `lszh-automations`, benannte Datenbank `lszh-offers-staging` und den lesenden Testmodus. `LSZH_FIRESTORE_STAGING_WRITE_ENABLED` muss effektiv deaktiviert bleiben. Keine Airtable- oder Drive-Secrets im Build oder in Logs.
6. **Getrennte Stufen:** (a) geschütztes HTTP `/healthz` und blockierte Annahme-Routen nachweisen; (b) danach nur lesende echte Firestore-SDK-Verbindung mit genau diesem Servicekonto testen; (c) Mailversand, Vertragsannahme und Firestore-Schreiboperationen bleiben gesperrt.
7. Nach Deployment (nur mit Genehmigung): Cloud-Run-Revisionsmetadaten, Serviceaccount, Ingress-/Invoker-Policy, IAM-Condition und read-only SDK-Antwort verifizieren. Vorherige grüne Emulator-Tests sind **kein** Cloud-End-to-End-Ergebnis.

## Eigenständige, weiterhin offene Freigabepunkte

- Bereitstellung eines separaten neuen Cloud-Run-STAGING-Dienstes.
- Etwaige `iam.serviceAccounts.actAs`-Zuweisung für eine konkrete Deployer-Identität.
- Zugriff von Cloud Run auf Google Drive und Airtable, inklusive Secret Manager und OAuth/Token-Scope.
- Dauerhafte Archivierung und Retention-Policy (keinen irreversiblem Bucket Lock ohne separaten Entscheid).
- Schreibender Test mit synthetischen Firestore-Datensätzen.
- Freigabe der RC1-Projektbedingungen und AVV, Kundenversand und elektronische Vertragsannahme.

**Keine neue externe Cloud-Ressource wurde durch diese Dokumentation erstellt.**
