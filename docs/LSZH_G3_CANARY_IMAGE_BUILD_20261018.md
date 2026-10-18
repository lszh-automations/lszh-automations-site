# LSZH G3 – reproduzierbarer Canary-Kandidatenbuild und SHA-256-Audit (Draft)

**Stand 18.10.2026.** **NO_GO**, ausschliesslich Entwicklungsbranch/Draft PR #5.
Kein GCP-Deployment, keine Artifact-Registry-Publikation, keine IAM-/Make-/Drive-Änderung.

## Zweck (verständliche Einordnung)

Das Canary-Image ist ein winziger, isolierter Testempfänger. Bei einer exakt festgelegten
synthetischen Pub/Sub-Nachricht gibt er HTTP 204 zurück. Es werden **keine** Offerten
angenommen und **keine** Firestore-, Airtable-, Google-Drive-, Kunden- oder Mail-APIs benutzt.

Wir prüfen zuerst den **Quellcode**, bauen ihn zweimal in GitHub Actions mit einem
in `base-image.candidate.json` auch **über verschiedene Läufe hinweg** auf SHA-256
festgepinnten Node-Basisimage und vergleichen die OCI-Deskriptoren.
Erst später könnte nach eigenständiger Genehmigung ein bestimmtes, gescanntes
Image in die geschäftliche Artifact Registry hochgeladen und dessen Registry-Digest
ausgelesen werden. Ein lokaler OCI-SHA ist **nicht** automatisch ein deploybarer
Artifact-Registry-Digest.

## Dateien und Ablauf

- `cloud-run/g3-review-staging/base-image.candidate.json`: unveränderlich
  im Draft festgehaltener Kandidaten-Basisdigest aus dem erfolgreichen
  GitHub-Lauf 39146208943. Review ausdrücklich `UNREVIEWED`, `NO_GO`;
  keine eigenständige Sicherheitsfreigabe.
- `cloud-run/g3-review-staging/Dockerfile`: `ARG BASE_IMAGE`, `FROM ${BASE_IMAGE}`.
  Ohne explizit übergebenen festgepinnten Basisimage-Digest ist das Image
  nicht baubar. Nur `index.mjs` wird hineinkopiert, `USER node`,
  keine `RUN`-Befehle und keine zusätzlichen Pakete.
- `scripts/g3-canary-image-plan.mjs`: offline, read-only.
  Verweigert überraschende Dockerfile-Anweisungen, fremde Basis-Registries,
  Floating Tags und unsichere Importänderungen. SHA-256 für Dockerfile,
  Empfängerquelle und deren Inputmanifest; jeder Bericht bleibt `NO_GO`.
- `scripts/g3-canary-oci-verify.py`: liest zwei lokale OCI-Tar-Archive,
  prüft **jeden** SHA-256-Blob gegen den Inhaltswert, alle verwendeten
  Descriptor-Referenzen, `linux/amd64`, den Nichtroot-Benutzer und
  das exakte Startkommando. Vergleicht Manifest- und Config-Digests beider Builds.
  Kein Google-/Registry-Zugriff.
- `.github/workflows/g3-canary-build-only.yml`: eigenes `contents: read`-Workflow,
  ohne GCP-Credentials, `id-token: write`, Docker-Login/Push, Service-Accounts
  oder Deploy. Prüft den im Repository fixierten offiziellen Node-Basisdigest
  durch einen **nur lesenden** Docker-Hub-Zugriff und führt zwei
  `--network none`-Docker-Builds mit `SOURCE_DATE_EPOCH=0`,
  ohne Provenance-/SBOM-Anhang und mit OCI-Timestamp-Normalisierung aus.
  Verifiziert SHA und die Reproduzierbarkeit. Baut separat einen lokalen
  Smoke-Testcontainer mit `--network none`, `--read-only`, `--cap-drop ALL`
  und Testzugriff nur auf dessen Loopback; echte Annahmerouten bleiben 404,
  der Testcanary quittiert ausschliesslich die fixe Fixture.
- `test/g3CanaryImageBuild.test.js`: lokale, Cloud-freie Negativtests für
  Dockerfile, Image-Referenz, ungewöhnliche CLI-Parameter und OCI-Fehler.

**Genauigkeit bei «offline»:** Die Sicherheits- und Negativtests laufen
ohne externe Systeme. Der GitHub-Runner benötigt für Actions/Runner und
das **nur lesende** Abrufen des offiziellen Basisimages Internetzugriff;
Docker-Buildbefehle selbst dürfen keine Netzwerkbefehle (`--network none`)
ausführen. Die Image-Verarbeitung ist also **cloudisoliert, nicht air-gapped**.

**Digest-Unterscheidung:** Quellhash / Inputhash zeigen die geprüften Dateien,
OCI-Manifest-/Konfigurationshash zeigen lokale Kandidatenbytes.
Der offizielle `node`-Basisdigest identifiziert den tatsächlich verwendeten
Base-Inhalt innerhalb eines Laufs. Ein zukünftiger
`europe-west6-docker.pkg.dev/lszh-automations/lszh-g3-review-staging/receiver@sha256:…`
ist erst dann eine nachgewiesene Registry-Referenz, wenn **nach gesonderter
Freigabe** gepusht und dort per unabhängiger `describe`-/Readback-Prüfung
nachgewiesen wurde.

## Bootstrap-Sicherheitsreview / verbliebene Risiken

`scripts/g3-staging-bootstrap.mjs` bleibt standardmässig read-only
und legt ohne ausdrücklich ausgeführtes `--apply` keine Ressourcen an.
`--apply` erfordert festen Scopetext, exakte Region/Projekt/Registry-Referenz,
einen erfolgreichen Read-only-Bestand und eine geschäftliche Operatoridentität;
die ersten sechs Befehle sind bewusst auf zwei SAs, ein Topic, einen privaten
Canary-Receiver, einen dienstspezifischen Invoker und eine Push-Subscription
beschränkt. Keine Produktiv-Mail, kein Firestore-Schreibrecht, keine API-Aktivierung.

**Wichtig:**
1. Der bekannte CLI-Zustimmungstext allein ist kein technisch beweiskräftiger
   Nachweis einer separat unterzeichneten Betreiberentscheidung.
2. `gcloud artifacts docker images describe` bestätigt gegenwärtig nur
   Referenz/Existenz, nicht eigenständig Scan, Herkunft, Source-Commit,
   Security-Baseline oder geschäftliche Freigabe.
3. Eine nicht öffentliche direkte Service-IAM-Policy belegt nicht vollständig,
   welche geerbten/IAM-Deny/PAB-Rechte effektiv wirken.
4. Das Setup ist nur Canary-Transport; Firestore-Idempotenz,
   Retry-/Dead-Letter-Verhalten, Kostenlimite und Datenretention
   sind keine implizit freigegebenen Kundenfähigkeiten.
5. Für tatsächlichen Einsatz braucht es reproduzierbaren erfolgreichen
   Build, bewusst gelockten **über Laufgrenzen hinweg** Basis-Digest,
   unabhängig reviewtes/gescanntes Ergebnis und einen überprüften
   Registry-Manifest-Digest, plus formelles Betreiber-GO.

## Nächste Abnahme (nicht automatisch auslösen)

1. CI-Lauf des neuen Build-only-Workflows vollständig erfolgreich,
   Ergebnis und Manifest-Digest aus dem Run prüfen; bei Fehlschlag stoppen
   und nur Offline-Code korrigieren.
2. Den **konkret beobachteten** offiziellen Basisdigest und Source-Commit
   zur gesonderten Review einfrieren, Base-Vulnerabilities und später
   Container-Layers in einer genehmigten Scan-Umgebung prüfen.
3. Bootstrap-`--apply` vor produktionsähnlicher Bereitstellung zusätzlich
   auf einen unabhängigen Source-/Digest-Freigabenachweis und
   IAM-Readback nach Invoker-Grant härten.
4. Danach dem Betreiber sechs exakt abgegrenzte G3-Änderungen mit
   Rollback, Kostenlimite und effektiven IAM-Gates als **separate**
   Entscheidung präsentieren; bis dahin kein Image-Push, Publish,
   Subscription, Cloud Run oder OAuth.

**Make-Szenario 7940220** bleibt inaktiv, Modul 2 und 8 bleiben mit `0=1`
gesperrt. **Nur Geschäftskonto/geschäftliches Drive**, nicht privat.

## Tatsächlich belegter erster CI-Kandidatenlauf, 18.10.2026

- GitHub Actions **39146208943**, Job `build-candidate`: **SUCCESS** für
  Quellpolicy/Negativtests, zweimaligen OCI-Build, SHA-Prüfung, identische
  OCI-Konfiguration/Manifest und den echten netzisolierten Containertest.
- Beobachteter offizieller Node-Basisdigest:
  `docker.io/library/node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402`
- Identischer Kandidaten-OCI-Manifest-Digest beider Builds:
  `sha256:1ee2b30f6ba250e1f2ccc229edca2b3d0e60c1cbab196f8b3634fe182b2fd5dd`
- Kandidaten-OCI-Konfigurations-Digest:
  `sha256:8808ae284a415d79581dcd46caba2534b92d194e81f9c35e3008bab57e0f9da8`
- **8 OCI-Blobs SHA-256-verifiziert.** Artifact Registry Image: **NOT_CREATED**.
  Lauf beweist weder Schwachstellenfreiheit noch einen künftigen Registry-Digest.
- Danach wurde genau dieser Base-Digest als **noch nicht security-reviewed**
  Kandidat im Branch fixiert. Der nachfolgende Regressionslauf für die
  neue Lock-Datei und die IAM-Readback-Härtung ist separat zu beurteilen.

## Bootstrap-Verschärfung nach Review

- Eine schon vor der erlaubten eigenen Invoker-Bindung vorhandene
  `roles/run.invoker`-Policy am neuen Service führt jetzt zum Halt,
  selbst wenn sie nicht anonym ist.
- Eine explizite Deaktivierung des Cloud-Run-Invoker-IAM-Checks führt zum Halt.
- Nach **einem** dienstspezifischen Invoker-Grant liest das Skript die Policy
  erneut. Nur **genau eine**, unbedingte `roles/run.invoker`-Bindung
  mit ausschliesslich `lszh-g3-push-stg@lszh-automations.iam.gserviceaccount.com`
  erlaubt, die einzelne Subscription anzulegen.
- Weder das Prüfen noch diese Codeänderung haben IAM oder Cloud verändert.
  Geerbte Effective-IAM- und GCP-Deny/PAB-Gates bleiben ausdrücklich offen.
