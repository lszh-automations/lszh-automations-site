# LSZH – Cloud-Run-/IAM-Preflight: Bestandsaufnahme und nächster sicherer Schritt

**Stand: 15.10.2026 – ausschliesslich lesende Prüfung und GitHub-Entwicklung.**

## 1. Direkt verifizierter Render-Stand

Mit dem verbundenen Render-Konto wurde die tatsächliche Arbeitsumgebung (nur GET) geprüft:

| Dienst | Zweig | Auto-Deployment | Beobachteter Zustand |
| --- | --- | --- | --- |
| `lszh-automations-site` | `main` | **aktiv** | Öffentliches Produktiv-Website-Hosting |
| `lszh-offer-acceptance-staging` | `feature/optional-avv-acceptance-staging-20261014` | **deaktiviert** | Letzter Deploy `dep-db8912navr4c73als4h0`, Status `live`, Commit `000c6089` vom 15.10. |
| `lszh-swiss-qr-staging` | `feature/swiss-qr-bill-staging-20261014` | **deaktiviert** | Separater QR-Staging-Dienst |

**Wichtig:** Die in diesem Projekt umfangreich geprüfte Firestore-Vertragskette liegt auf `feature/firestore-staging-dryrun-20261015`, **nicht** auf dem Render-STAGING-Zweig und ist nicht automatisch ausgerollt. Der bestehende Render-STAGING-Service startet `node server.js`; der zukünftige minimalistische Cloud-Run-Gateway im Entwicklungszweig besitzt einen anderen Entry-Point und permanent deaktivierte Annahme-APIs. Namen ähnlich, aber **nicht dieselben Instanzen oder Laufzeitberechtigungen**. Ohne eigene Freigabe **keine** Branch-Änderung, Render-Deployment oder Verschiebung auf `main`.

## 2. Bekanntes Google-Cloud-Bild aus den vorherigen Prüfungen

- Google-Projekt `lszh-automations`, Region `europe-west6`, bereits benannte Datenbank `lszh-offers-staging` sind aus dem Cloud-Shell-/Preflight-Nachweis dokumentiert.
- Der vorhandene Cloud-Run-Dienst `lszh-offer-portal-staging` wurde zuvor als lesender Preflight bestätigt; sein Quell-ZIP enthielt nur `index.js` und `package.json` mit `lszhPortalPreflight`, **keine funktionsfähigen Annahme-APIs**. Er darf nicht durch den ungetesteten neuen Gateway ersetzt werden.
- Das für eine spätere Trennung vorgeschlagene Google-Cloud-Konto `lszh-offer-reader@lszh-automations.iam.gserviceaccount.com` wurde **nicht als existierend bestätigt**. Die verbundenen ChatGPT-Airtable-/Drive-Zugänge sind **keine** Cloud-Run-Service-Identität.
- Drei synthetische PDF-Rohdateien konnten vorher unabhängig gelesen und mit Airtable geprüft werden, alle SHA-256 identisch; die Google-Drive-Revisionen bleiben jedoch `keepForever=false`. Rechtsfreigabe und dauerhafte Archivierung sind daher **gesperrt**.

## 3. Neu vorbereitet: eine kleine, ausdrücklich lesende Cloud-Shell-Prüfung

Der Entwicklungszweig enthält jetzt `scripts/audit-lszh-cloud-readonly.js`, nutzbar über:

```bash
node scripts/audit-lszh-cloud-readonly.js --read-only
```

Ausführung **nur** in einer Cloud-Shell-Umgebung, in der das Repository vorhanden ist und die ohnehin über `gcloud` lesenden Zugriff verfügt. Die Datei führt vier **fest vorgegebene reine Describe-Aufrufe** aus:

1. `gcloud firestore databases describe` für `lszh-offers-staging`.
2. `gcloud run services describe` für den bestehenden Preflight `lszh-offer-portal-staging`.
3. `gcloud run services describe` für den **geplanten** eigenen Dienst `lszh-offer-acceptance-staging`.
4. `gcloud iam service-accounts describe` für das **vorgeschlagene** Lesekonto.

Es gibt **kein** `create`, `deploy`, `add-iam-policy-binding`, `set-iam-policy`, `update`, `patch`, `delete`, `gcloud auth login`, Tokenabruf oder Secret-Read. Die festen Aufrufe haben `--project=lszh-automations` und `--format=json`; der Bericht gibt daraus ausschliesslich einzelne Statuswerte aus und **keine** komplette IAM-Policy oder Rohantwort. Fehlende Zugriffsrechte, Timeout oder nicht vorhandenes `gcloud` werden **`NOT_VERIFIED`** und nicht als bewiesenes Nichtvorhandensein gewertet.

**Bedeutende Grenze:** Der Bericht kann nur Existenz/ausgewählte Metadaten beurteilen, **keine** korrekten IAM-Berechtigungen, benannten Firestore-Schreibrechte oder echten Drive-/Airtable-Kontozugänge nachweisen. Darum bleiben `authorizedToDeploy=false`, `authorizedToModifyIAM=false`, `authorizedToWrite=false`, `authorizedToLockRetention=false` **auch bei allen grünen Metadatenprüfungen**.

Im CI wird der Code nur mit **völlig simulierten** `gcloud`-Antworten geprüft; keine GitHub-CI-Aktion verbindet sich mit echter Google Cloud. Zugehöriger Test: `test/cloudReadOnlyAudit.test.js`.

## 4. Priorisierte technische Entscheidungen – bewusst klein gehalten

1. **Zuerst lesen:** Cloud-Shell-Audit der vorhandenen benannten Firestore-Datenbank, Preflight-Dienstes und des potentiellen Lesekontos. Keine Kontoerstellung allein auf Basis eines Namens.
2. **Danach gezielte Freigabe:** Falls notwendig ein einzelnes separates benutzerverwaltetes Dienstkonto ohne exportierte Schlüssel für einen neuen, rein lesenden Cloud-Run-STAGING-Dienst. Rechte für Firestore-Datenbank, privates Google-Drive-Testarchiv und Airtable jeweils separat minimal berechtigen und unabhängig überprüfen. Der neue Dienst darf die bestehende Preflight-Revision nicht überschreiben.
3. **Erst nach realem lesendem Server-End-to-End-Test:** Eine eigene, begrenzte Schreib-Testfreigabe für **synthetische Fixtures in der realen** `lszh-offers-staging`-Datenbank. Keine echten Kunden und keine Aktionsmails.
4. **Archiv später:** Eine rechts-/datenschutz-/kostenmässig genehmigte getrennte Archivablage mit strengem Versionierungs- und Wiederherstellungsverfahren; **Bucket Lock nicht aktivieren**, bevor konkrete Aufbewahrungsfristen entschieden sind. Die 3 Testrevisionen unverändert lassen.
5. **Vor echtem Kundenvertrag:** Freigabe von Projektbedingungen v1.0 RC1 und AVV RC1, Empfangs-/Beweisarchivierung und separate E-Mail-Outbox, Prüfung der echten HTTP-APIs/IAM/Monitoring.

## 5. Keine Ausführung oder Freigabe vorgetäuscht

Ein in GitHub gespeicherter Cloud-Shell-Read-only-Audit ist **keine** Cloud-Run-Dienstkontoerstellung und auch noch **kein tatsächlich ausgeführter Cloud-Shell-Audit**. Es wurde **weder** eine Cloud-Datenbank geschrieben, **noch** eine Cloud-Run-Revision deployed, **noch** eine Google-Drive-Datei/Retention verändert. Ein allfälliger IAM-/Deployment-Schritt verlangt weiterhin eine ausdrücklich beschriebene, separate Genehmigung.
