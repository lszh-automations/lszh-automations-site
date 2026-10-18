# LSZH G3 – Offline Registry-Readback-Grenzen und OCI-Digest-Brücke

**18.10.2026 | Release NO_GO | Nur PR #5 (Draft), ohne Cloud-Ausführung.**

## Was neu ist

Der zukünftige G3-Bereitstellungspfad braucht mindestens drei voneinander unterscheidbare kryptografische Identitäten:

1. **Quellstand / Build-Eingaben:** Git-Commit und SHA-256 über Dockerfile, synthetischen Receiver und Basisimage-Referenz.
2. **Attestiertes OCI-Archiv:** SHA-256 über die TAR-Datei, das GitHub später mit Sigstore signieren könnte. Dieser Wert ist **nicht** der Container-Manifest-Digest.
3. **OCI-Manifest und Registry-Digest:** Aus dem zuvor SHA-verifizierten OCI-Inhalt extrahierter Manifest-Digest; nach einem **separat genehmigten** Push muss Artifact Registry per authentifiziertem Readback genau den freigegebenen manifestbezogenen Inhalt bestätigen.

Der vorbereitete **rein lesende** Signaturverifikator `scripts/g3-signed-artifact-verify-readonly.sh` akzeptiert deshalb fünf Eingaben: OCI-Archiv, erwarteter SHA-256-Archivhash, freigegebener Source-Commit, exakter Signer-Workflow-Commit und erwarteter OCI-Manifest-Digest. Vor dem `gh attestation verify`-Nachweis prüft `scripts/g3-canary-oci-verify.py` die SHA-256-Blobs im Archiv und die exakte Manifestidentität. Signiert wird **nichts**; der benötigte geschützte Release-Workflow existiert noch nicht. Auch bei später vollständig erfolgreicher Signatur: `releaseStatus=NO_GO`, `canDeploy=false`.

## Separater Registry-JSON-Formattest

`scripts/g3-registry-readback-shape-offline.mjs` simuliert die spätere Google-Artifact-Registry-Abfrage. Basis sind die dokumentierten Google-REST-Felder `name`, `uri`, `mediaType` und `imageSizeBytes`. Er verlangt strikt:

- Nur `europe-west6-docker.pkg.dev/lszh-automations/lszh-g3-review-staging/receiver@sha256:<64-stellige-hex>`.
- Exakter zugehöriger Ressourcenpfad `projects/lszh-automations/locations/europe-west6/repositories/lszh-g3-review-staging/dockerImages/receiver@sha256:<Digest>`.
- Ein OCI-Image-Manifest (`application/vnd.oci.image.manifest.v1+json`), keine abweichende Index- oder Tag-Identität.
- Plausible positive `imageSizeBytes`; Manifest-Digest muss zum verifizierten lokalen OCI-Kandidaten und zum **explizit noch unsignierten** CI-Report passen.
- Fehlende oder manipulierte Felder enden `BLOCKED_REGISTRY_RESPONSE_SHAPE`.

**Sicherheitsgrenze:** Die JSON-Daten könnten erfunden sein. Selbst ein exakt passender synthetischer Bericht endet immer mit `UNTRUSTED_REGISTRY_SHAPE_MATCH_NOT_READBACK`, `registryReadbackAuthenticated=false`, `signedProvenanceVerified=false`, `operatorApprovalVerified=false`, `releaseStatus=NO_GO`. Erst eine zukünftig separat genehmigte authentifizierte **Read-only**-Abfrage von Google beweist die tatsächliche Registry-Existenz; die JSON-Formprüfung allein beweist nicht die Herkunft des Antwortdokuments und keine Containerbytes.

Google-Dokumentation (nur technischer Vertrag, nicht projektbezogene Bestätigung):
https://docs.cloud.google.com/artifact-registry/docs/reference/rest/v1/projects.locations.repositories.dockerImages
https://docs.cloud.google.com/sdk/gcloud/reference/artifacts/docker/images/describe
GitHub-Verifikationsdokumentation:
https://cli.github.com/manual/gh_attestation_verify

## Offene operative Freigaben

- **zlib MEDIUM:** CVE-2026-85091 in Alpine zlib 1.3.2-r0, laut Trivy korrigiert durch 1.3.2-r1. Obwohl ein solches Release in den Alpine-3.24-Paketverzeichnissen gelistet ist, wurde der Inhalt **nicht** signatur- und SHA-geprüft oder in den Canary eingebaut. Für einen späteren Fix ist ein exakt digest-/Paketversions-fixierter, nach Möglichkeit durch Alpine signaturverifizierter Paket- oder Basisimagepfad sowie erneuter reproduzierbarer Doppelbuild nötig. Keine Live-`apk upgrade`-Kommandos in der aktuellen Runtime.
- **Signatur:** Noch keine signierte OCI-Datei, keine unabhängig beglaubigte Build-Provenance, keine attestationsberechtigte PR-Pipeline.
- **Registry:** Noch kein geschaffenes/hochgeladenes G3-Image, keine tatsächliche Registry-Antwort und keine Bewilligung für GCP-Änderungen.
- **IAM/Deployment:** Effektive IAM-/Deny-/PAB-Betrachtung, Kosten-/Rollbackfreigabe und das getrennte ausdrückliche Betreiber-GO fehlen.
- **Sperre:** `scripts/g3-staging-bootstrap.mjs --apply` bleibt vor jedem `gcloud`-Aufruf hart blockiert.

Make `7940220` bleibt inactive, `0=1` vor Claim und Mail. Nur geschäftliches Google Drive, keine Kunden-/Vertragsaktionen und **kein Merge ohne Zustimmung**.
