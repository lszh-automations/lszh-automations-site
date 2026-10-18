# LSZH G3 – Herkunftsnachweis, Signatur und Registry-Freigabegates (Draft)

**Stand: 18.10.2026. ReleaseStatus: NO_GO.** Nur GitHub Draft PR #5. Keine Cloud-/Make-/Airtable-/Drive-Schreibaktion, kein Registry-Upload, kein Deployment, keine Änderung produktiver Daten.

## Warum dieser zusätzliche Schritt gebraucht wird

SHA-256 beantwortet: *Sind diese beiden Bytes identisch?* Er beweist **nicht**, wer das Image erstellt hat. Die frühere CI erzeugte zwei identische lokale OCI-Kandidaten und scannte einen separat geladenen Testcontainer. Ein Vergleich der Docker-Konfigurations-ID des separaten Builds mit dem normalisierten OCI-Export schlug erwartungsgemäss fehl. Die Pipeline wurde deshalb korrigiert: **Trivy scannt jetzt die aus dem vorher SHA-geprüften OCI-Archiv extrahierte Layout-Struktur selbst.** Das separate Docker-Image wird weiterhin nur funktional getestet; dessen eigene Konfigurations-ID wird nicht mehr als Identitätsbeleg für den OCI-Export bezeichnet.

In `scripts/g3-canary-provenance-correlation.mjs` wird danach offline und fail-closed korreliert:
1. `git rev-parse HEAD` der tatsächlichen CI-Arbeitskopie = `GITHUB_SHA`, Ereignis `pull_request`, PR #5, erlaubte Branch-Namen und festes Repository. **Achtung:** `GITHUB_SHA` ist bei Pull Requests gewöhnlich ein Test-Merge-Commit, **nicht** der ursprüngliche Head-Commit; das Report-Feld kennzeichnet diesen Unterschied ausdrücklich.
2. Aktuelle Hashes der Containerquellen = `g3-image-inputs.json`; dessen kanonisch für diesen Code erzeugter `inputsSha256` wird erneut berechnet.
3. Eingefrorener `node:22-alpine@sha256`-Digest = `base-image.candidate.json`, Plattform `linux/amd64`; Registry-Upload weiterhin nicht vorhanden.
4. Das unabhängige OCI-Verifikationsprotokoll und der aktuelle Security-Report referenzieren **dasselbe** OCI-Manifest und denselben Base-Digest.
5. Die ursprünglichen Trivy-/CycloneDX-Dateibytes haben exakt die im Security-Report dokumentierten SHA-256-Werte.
6. Es sind keine HIGH-/CRITICAL-/LOW-/UNKNOWN-Funde enthalten; der einzige vorläufig erwartete MEDIUM-Eintrag ist `CVE-2026-85091` / Alpine `zlib 1.3.2-r0` (laut Trivy Fix `1.3.2-r1`). Neue MEDIUM-Befunde oder manipulierte Logs blockieren diesen **Kandidatenvergleich**. Dies ist ausdrücklich **keine Risiko-Ausnahmegenehmigung**.

Bericht: `g3-provenance-correlation.json` mit `status=UNSIGNED_CI_CORRELATION_VERIFIED`, `signedProvenance=false`, `canPublish=false`, `canDeploy=false`, `releaseStatus=NO_GO` und SHA-256 des zusammenhängenden Evidenzanspruchs. Die Reports und GitHub-Logs werden nur als kurzlebige (7 Tage) CI-Artefakte gespeichert; weder diese Berichte noch das zusammengeführte Artefakt sind signiert. Ein Angreifer mit Kontrolle über denselben CI-Runner könnte Behauptungen und deren lokale Hashes gleichzeitig manipulieren. **Das Paket ist eine technische Zwischenprüfung und kein unabhängig beglaubigter Herkunftsnachweis.**

## Absichtlich hart gesperrter Bootstrap

Der ursprüngliche Operator-Bootstrap `scripts/g3-staging-bootstrap.mjs` konnte einen exakten, aus dem Quellcode bekannten `--approval`-String und eine syntaktisch passende Registry-SHA akzeptieren; dies ist **kein** verlässlicher Nachweis einer ausdrücklichen Betreiberentscheidung und keine Provenance-Prüfung. Er hat daher jetzt eine **unbedingte frühe Sperre**: **jeder `--apply`-Aufruf** endet als `BLOCKED_G3_SIGNED_PROVENANCE_GATE` und `NO_GO` **vor dem ersten gcloud-Aufruf**, selbst mit formal korrektem Approval-Parameter und SHA-Digest. Der sichere `--plan`-Lesemodus bleibt erhalten. Die spätere Aufhebung dieser Sperre ist eine **eigene, separat reviewte Codeänderung nach konkreter Betreiberfreigabe**, nicht bloss das Eintippen des bekannten Approval-Strings. Ein Offline-Negativtest prüft diese Grenze.

## Spätere, konkret getrennte Freigaben – aktuell NICHT beantragt oder erteilt

**Phase A – unabhängige Image-/Provenance-Abnahme (noch kein Cloud-Write):**
- Die eine verbleibende zlib-CVE über ein neues, vollständig SHA-gepinntes, unabhängig geprüftes Base-Image oder einen separat festgenagelten Paket-Fix kontrolliert beheben; danach vollständige doppelte OCI-Builds, Containerfunktion, Trivy und CycloneDX nochmals auf derselben Quelle ausführen.
- Einen freizugebenden, **nicht aus einem untrusted PR-Merge** übernommenen Source-Commit festlegen; das Build-Tool, Image-Digest, Basisdigest, Scan-DB-Zeitpunkt und Builder-Identität mit einer vertrauenswürdigen, unabhängig überprüfbaren, kryptografisch **signierten** Provenance verbinden (z.B. in-toto/SLSA/zulässiger GitHub Artifact Attestation).
- Signatur/Certificate/Identitätsbindung durch einen **getrennten Verifier** prüfen: genaues Repository, freigegebener Source-Commit, vertrauenswürdiger Workflow- und Builder-Identifikator, exakter Image-Subject-Digest, Scope und Ablauf. Ein JSON-Eintrag `signature=VALID` ist kein Ersatz für wirkliche kryptografische Verifikation.

**Phase B – gesondertes Registry-Upload-GO und technische Kontrolle:**
- Zuerst Freigabe für das konkrete geschäftliche Artifact-Registry-Repository in Zürich, Rechnung/Budget, Rollen, Region, Eigentümer, Retention und Rückbau. **Kein automatisches Erstellen/Aktivieren** von APIs, Repository oder OIDC.
- Erst nach separatem GO einmaliges Image-Push aus der genehmigten Bildquelle; anschliessend GCP-seitig authentifiziert **nur lesen**, z.B. `gcloud artifacts docker images describe <vollständig-festgepinntes-Image> --project=lszh-automations --format=json`. Einen echten, unveränderlichen Registry-Manifest-Digest mit dem signierten Subject und den erwarteten Bytes vergleichen. Provider-Manifest-Reformatierungen/abweichende Digests nicht stillschweigend akzeptieren; bei Abweichungen **STOP**, unabhängige Byte-/Manifest-Verifikation.
- Das authentifizierte Provider-Ergebnis samt Signaturverifikation und unabhängiger Betreiberabnahme revisionssicher im **geschäftlichen** Archiv dokumentieren. Kein privater Google-Drive-Ordner.

**Phase C – nochmals separates G3-Transport-Deployment-GO:**
- Erst die Bootstrap-Sperre nach neuer formeller Sicherheitsentscheidung und erneuten Negativtests gezielt für exakt dieses Image schliessen.
- Vor jedem `--apply` effektive IAM/Deny/PAB-/actAs-/Service-Agent-Berechtigungen, privaten Ingress, nur dienstspezifischen Invoker, Pub/Sub-Retries, Kostenalarm und manuellen Rollback prüfen.
- Keine Make-Publisher-OAuth-Freigabe, keine realen Verträge, Kundenmails, Rechnungen, Annahmen oder Firestore-Schreibrechte aus einem blossen Canary-Transport-GO ableiten.

## Nachweis-Links

- G3 build-only CI, korrigierter OCI-Direktscan und Korrelation: [GitHub Actions 39149286136](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39149286136), **SUCCESS**, 14/14 isolierte Source-/Negativtests.
- Vorheriger Scan: 0 CRITICAL, 0 HIGH, 1 MEDIUM aus dem Node-Alpine-zlib-Paket; bei späterem Schwachstellendatenbank-Update muss das neu geprüft werden.
- Projekthauptdokument: `docs/LSZH_AUTOMATIONS_PROJEKTSTAND.md`.
- G3-Release-Gates: `docs/LSZH_G3_IMAGE_RELEASE_GATES_20261018.md`.

**Nie unbemerkt mergen oder deployen.** Make `7940220` und die beiden `0=1`-Sperren bleiben unverändert, ebenso das ausschliesslich geschäftliche Drive-Konzept.
