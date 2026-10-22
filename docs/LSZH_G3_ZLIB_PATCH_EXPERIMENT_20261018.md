# LSZH G3 – signaturgeprüfte zlib-Korrektur im isolierten Canary-Experiment

**18.10.2026 | Draft PR #5 | Release NO_GO | Keine Cloud-/Make-/Kundenschreibaktion**

## Warum dieser Schritt

Der bisherige reguläre, nur lokal in CI gebaute G3-Canary enthält
`zlib 1.3.2-r0` mit einem mittleren Trivy-Befund (`CVE-2026-85091`).
Der offizielle `node:22-alpine`-Tag lieferte zum Testzeitpunkt keinen
neuen Docker-Manifest-Digest. Ein unkontrolliertes `apk upgrade`
würde einen dynamischen, nicht festgepinnten Build erzeugen.

## Nachweis der Paketquelle und Signatur

- Quelle: offizielles Alpine-3.24-Repo, `x86_64`,
  `zlib-1.3.2-r1.apk`.
- Beobachteter APK-Datei-SHA-256:
  `63aeea03c15a2f9018f81805cfc8aa926bdf5cd68921f22149c2fbb5d0ee9f47`.
  Der Hash ist in `cloud-run/g3-review-staging/zlib-patch.candidate.json`
  als **unfreigegebener Kandidat** fixiert.
- [CI 39152416789](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39152416789)
  **SUCCESS**: `apk --no-network verify` hat die
  Paketintegrität und kryptografische Signatur **gegen die vertrauenswürdigen
  Alpine-Schlüssel des fixierten Node-Basisimages** bestätigt.
  Die Schlüssel selbst wurden noch nicht gegen eine unabhängige
  externe Vertrauensliste/Fingerprints auditiert.
- Der Docker-Build prüft die Signatur mit denselben fixierten
  Basisimage-Vertrauensschlüsseln nochmals **ohne Build-Netzwerk**.
  Die heruntergeladenen Pakete sind nie im GitHub-Repository abgelegt.

## Strikt abgetrenntes Experiment

Das bestehende `cloud-run/g3-review-staging/Dockerfile` und der
eingefrorene Base-Digest bleiben **unverändert**. Ein neues,
separates `Dockerfile.zlib-experiment` verwendet dieselbe festgepinnte
Node-Basis und das vorher byte- und signaturgeprüfte APK als
BuildKit-Read-only-Bind-Mount. Es installiert nur die konkrete
`zlib-1.3.2-r1`-Datei mit `apk --no-network --no-scripts --no-commit-hooks
add /tmp/zlib-1.3.2-r1.apk`, **ohne `--allow-untrusted`**. Die
installierte Paketversion wird geprüft. Npm und Corepack werden wie
im Canonical-Canary entfernt; der Prozess läuft als `node` ohne Rootrechte.

Ein echter Fehler in den ersten beiden Testläufen betraf lediglich
die falsche `apk info`-Ausgabesyntax und die Reproduzierbarkeit
eines Zeitstempels in `/var/log/apk.log`. Das Audit
`scripts/g3-zlib-oci-diff-diagnose.py` fand bei den zwei
sha-unterschiedlichen Images exakt **eine abweichende Datei**:
`/var/log/apk.log`. Das experimentelle Dockerfile entfernt ausschliesslich
dieses für den Laufzeitcontainer nicht benötigte Installationslog,
während die GitHub-CI-Logs den Vorgang weiterhin protokollieren.
SHA-Vergleich und Negativtests wurden **nicht** abgeschwächt.

## Bestätigte Testresultate

[GitHub-Actions-Lauf 39153125318](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39153125318):
**G3 build-only SUCCESS**, ohne Registry-Upload und ohne Deployment.

- Zwei isolierte experimentelle OCI-Builds mit `--network none`,
  SHA-256-Prüfung sämtlicher OCI-Blobs und identischen
  Manifest-/Konfigurations-Digests: **PASS**.
- Beide Builds: identischer **lokaler** OCI-Manifest-Digest:
  `sha256:ccadf2c9947625556f54e1c0b3480c458b30a5fcfd117da780a2282f1fae5d46`.
  Das ist **kein** Artifact-Registry-Digest.
- Echt gestarteter separater Experimentcontainer: nichtroot,
  Alpine meldet `zlib-1.3.2-r1`, HTTP-Healthcheck und
  zulässige synthetische Pub/Sub-Fixture `204`, unerlaubte
  Payload `503` und Offertenannahmeroute `404`: **PASS**.
- Trivy scannt exakt das zuvor SHA-verifizierte experimentelle
  OCI-Layout, nicht einen beliebigen anderen lokalen Container.
  Ergebnis im betreffenden Datenbank-Snapshot:
  **0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW / 0 UNKNOWN**.
  Insbesondere `CVE-2026-85091` wird nicht mehr gemeldet.
- Die bisherige G3-Canary-Strecke wurde im selben Workflow
  unverändert ebenfalls auf reproduzierbares OCI,
  Canary-Funktion und Scan geprüft.

## Noch offene Unterschrifts- und Deploymentgates

Dieser Befund bedeutet **nicht**, dass die ursprüngliche
G3-Release-Definition nun automatisch auf das Experiment-Image
umgestellt oder produktiv bereit wäre.

1. Trust-root/Fingerprint-Abgleich der im Basisimage vorhandenen
   Alpine-Signierschlüssel mit unabhängig bestätigter Quelle.
2. Unabhängiger Code-/Dependency-Review und alle erneuten CVE-Prüfungen
   beim tatsächlichen Releasezeitpunkt.
3. Echte, **kryptografisch signierte und unabhängig verifizierte**
   Build-Provenance eines separat freizugebenden geschützten Releases.
   Die bisherige PR- und CI-Korrelation bleibt **unsigniert**.
4. Gesonderte Freigabe eines tatsächlichen Artifact-Registry-Uploads,
   authentifizierter Registry-Digest-Readback und separates
   G3-Infrastruktur-Deployment-GO mit IAM-/Kosten-/Rollbackprüfung.
5. G3-Bootstrap-`--apply` bleibt vor jedem `gcloud`-Aufruf
   **hart gesperrt**. Kein neues Make-Szenario, Pub/Sub-Topic,
   Dienstkonto, Firestore-Write oder Kundenereignis.

**Original Make `7940220`: weiterhin inactive, beide `0=1`
Sicherheitssperren aktiv. Geschäftliches Google Drive ausschliesslich,
kein privater Drive-Ordner. PR #5 Draft, kein Merge ohne Genehmigung.**
