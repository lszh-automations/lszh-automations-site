# LSZH – Interner Firestore-Lesepfad für isoliertes Cloud-Run-STAGING

**Stand 15.10.2026. ENTWICKLUNGSZWEIG. Kein Cloud-Run-Deployment, keine Firestore-Cloud-Abfrage, keine produktive Aktivierung.**

## Weshalb dieser Baustein nötig ist

Das bereits vorhandene Cloud-Run-Preflight `lszh-offer-portal-staging` besitzt eine andere Identität. Das inzwischen in Google Cloud Shell angelegte neue Lesekonto `lszh-offer-reader@lszh-automations.iam.gserviceaccount.com` wurde mit **`roles/datastore.viewer` und Condition auf `lszh-offers-staging`** bestätigt; `gcloud iam service-accounts keys list --managed-by=user` zeigt **0** user-managed keys. Ein echtes SDK-`get()` unter dieser Laufzeitidentität war bislang nicht überprüft.

Der neue Code ergänzt den bereits vorhandenen **isolierten** Cloud-Run-Gateway-Entwurf um einen bewusst engen Lesepfad. Der produktive Webserver auf Render, die Cloud-Run-Preflight-Revision und die Website `main` wurden nicht verändert.

## Technische Schnittstelle (nur nach separatem freigegebenem Deployment)

- Diagnosepfad: **`GET /__internal/staging/firestore-read`**.
- **Nur** der zukünftige, separate Dienst `lszh-offer-acceptance-staging` mit `NODE_ENV=production`, zugehöriger `K_SERVICE`-/`K_REVISION`-Identität, Projekt `lszh-automations`, Datenbank `lszh-offers-staging` und ausdrücklicher Umgebungsfreigabe `LSZH_STAGING_READ_PROBE_ENABLED=yes` kann die Route bereitstellen.
- Zusätzliche konservative Prüfung: keine Firebase-Emulator-URL im Cloud-Run-Modus, keine exportierten Credentials-/JSON-Keys, kein `LSZH_FIRESTORE_STAGING_WRITE_ENABLED=true`. Fehlt einer dieser Punkte, HTTP **404** oder Dienststart ohne Probe.
- Lesepfad via `createStagingFirestoreConnection`: **eine fest codierte synthetische Dokument-ID** `stagingOfferFixtures/LSZH-STAGING-20261015-001`. Keine dynamische Objekt-ID in der HTTP-Anfrage, keine API-Parameter erlaubt.
- Gültiger, berechtigter Firestore-GET gibt **nur** `{"ok":true,"mode":"staging_firestore_read_only","reachable":true,"fixture_exists":false,"acceptanceEnabled":false,"writeEnabled":false}` (bzw. `fixture_exists=true` für vorhandenen *synthetischen* Schema-v1-Testdatensatz) zurück. **Kein** Datensatz, Token, Kundendetail, Hash oder Fehlerstapel wird übertragen. Bei Schemafehler/unauthorisiertem Zugriff: generisches **HTTP 503**.
- Die bestehenden echten Annahme-/Preview-/Dokument-HTTP-Routen bleiben **503**, die reine lokale Fake-Claim-Route bleibt im Cloud-Run-Produktionsmodus **404**. Das lokale Emulator-Claim-Harness wird nicht in den Container kopiert.
- SDK ist erst aktivierbar, wenn der neue Dienst mit allen geforderten Umgebungsvariablen gestartet wird. Ohne `LSZH_STAGING_READ_PROBE_ENABLED=yes` wird **kein Firestore-SDK** initialisiert. Firestore-Konstruktor konfiguriert die **benannte** Datenbank, nicht `(default)`, und gibt ausser `readFixture()` keine Mutationsmethode zurück.

## Sicherheitsgrenzen und Deployment-Review

**Ein Flag ist keine Benutzerauthentifizierung.** Vor irgendeinem Cloud-Run-Deployment sind diese separaten Massnahmen zwingend: dediziertes Servicekonto **`lszh-offer-reader@lszh-automations.iam.gserviceaccount.com`**, geeignete restriktive **Ingress-Policy**, **nicht öffentlich/kein Allow unauthenticated**, einschränkende `roles/run.invoker` für konkrete Testidentitäten; bestehende Preflight-Revision und Render-Services nicht überschreiben. Identity/Invoker/Berechtigungen sind **nicht** durch lokalen Gateway-Test bewiesen.

Die Bezeichnung `__internal` macht eine HTTP-Route nicht automatisch intern; ohne diese Cloud-Run-Zugriffssperren darf der Dienst nicht ausgerollt werden.

Der Entwurf des `Dockerfile` enthält eine **noch nicht auf unveränderlichen Versions-/Image-Digest gepinnte** Firestore-SDK-Installation. Vor einer Deployfreigabe: Abhängigkeit und Container-Digest pinnen, Build/Supply-Chain-Scan, Konfigurations-/IAM-Review, vollständigen Remote-Read-Test separat abnehmen. Keine ausführbaren Setup-Skripte für IAM, Cloud Run, Cloud Storage, Drive oder Airtable wurden ausgeführt.

## Tests und ihre Aussagekraft

- `services/offer-acceptance-staging/test/stagingReadProbe.test.js`: isolierte localhost-HTTP-Aufrufe mit Fake-Firestore, sichere Schemaerkennung, keine dynamischen IDs, Fehlersanitisierung, Freigabe nur bei exakter Cloud-Run-Umgebung, konsequent gesperrte Annahmerouten.
- `test/stagingFirestoreRead.emulator.integration.test.js`: `readFixture()` löst im **lokalen Firebase-Demoprojekt-Emulator** einen echten SDK-GET für einen garantiert fehlenden synthetischen Datensatz aus; **keine** Dokumenterstellung oder Cloud-Authentifizierung.
- Bestehende Integrationstests behalten ihre getrennte lokale **synthetische** Claim-Simulation; niemals im Cloud Run deployt.
- **Grenze:** Ein erfolgreicher GET im Emulator testet keine IAM-Condition des realen Google-Cloud-Projekts. Diese muss nach **gesonderter Deployment-Freigabe** durch den echten serverseitigen Cloud-Run-GET nachgewiesen werden.

## Freigaben, die weiterhin fehlen

1. Geschütztes Deployment eines **neuen separaten** Cloud-Run-STAGING-Dienstes.
2. Gegebenenfalls genau auf das Zielkonto beschränktes `iam.serviceAccounts.actAs` für die deployende Identität.
3. Laufzeit-GET aus dem neuen Dienst unter dem tatsächlichen STAGING-Servicekonto.
4. Drive-/Airtable-Runtime-Leserechte, sichere Archivierung, reale Firestore-Writes, E-Mail-Outbox und rechtlich freigegebene RC1-/AVV-Texte – alles jeweils eigenständige Freigabepunkte.

**Keine weitere Änderung einer echten Google-Cloud-Ressource oder eines Kundendatensatzes wurde bei dieser Entwicklung vorgenommen.**
