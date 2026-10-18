# LSZH G3 – Image-Sicherheitsreview und gesperrter Artifact-Registry-Handoff

**18.10.2026 | Status: NO_GO | Nur Draft PR #5, kein GitHub-Merge/Cloud-Write**

## Zweck

Die Build-only-Strecke stellt **noch kein** ausführbares Cloud-Run-Release her.
Sie liefert dem Betreiber lediglich unabhängig prüfbare **Kandidatenbelege** für
einen späteren, ausdrücklich separat zu genehmigenden Schritt.

- Basisimage: konkreter Digest in
  `cloud-run/g3-review-staging/base-image.candidate.json`, kein Floating Tag.
- Eingaben: `g3-image-inputs.json` (Dockerfile- und Receiver-Quell-SHA-256).
- Reproduzierbarkeit: `g3-image-oci-report.json`, zwei identische OCI-
  Manifest-/Config-Digests, alle OCI-Blobs durch Hash verifiziert.
- Laufzeit: netzisolierter Container mit read-only Rootfs, `USER node`,
  keinen Linux-Capabilities und strengsynthetischem POST-Test.
- **Neu:** Trivy-Scanner (lokales Docker-Image ohne GCP-Credentials) erstellt
  `g3-trivy.json` mit OS-/Library-Vulnerabilities. Zweiter Scan erstellt eine
  CycloneDX-Komponentenliste `g3-sbom.cdx.json`.
- `scripts/g3-canary-security-review.mjs` validiert die syntaktischen
  Scan-/SBOM-/OCI-/Source-Inputbelege, zählt `HIGH` und `CRITICAL`
  (mit/ohne angegebene Fix-Version), schreibt `g3-security-review.json`
  mit SHA-256 der Reports und dem geprüften CI-Commit.
  Bei fehlendem/verändertem Beleg **BLOCKED**. Selbst wenn keine
  High/Critical-CVEs bekannt sind, ist `releaseStatus=NO_GO`,
  `canPublish=false` und `canDeploy=false`.

Der Scanner benötigt Lesezugriff auf öffentliche Vulnerability-Datenbanken;
diese Prüfung ist **nicht vollständig offline**, aber ohne Zugriffe auf Google
Cloud, Firestore, Airtable, Make oder Kunden. Alle neuen CI-Actions
werden mit vollständigen, in CI beobachteten Commit-SHAs gepinnt.
GitHub-Checkout speichert seinen Token nicht persistent. Die Scannerreports
sind zunächst nur CI-Artefakte mit beschränkter Aufbewahrung, keine
verifizierbare, langfristige Build-Signatur.

## Noch offene Kontrollpunkte (kein stilles GO)

| Gate | Erforderlicher Nachweis | Jetzt |
| --- | --- | --- |
| Quellcode | Unabhängiger Review des fixierten Canary-Receivers | Offen |
| Base/SBOM/CVEs | Versions- und Severity-Review mit DB-Zeitpunkt, betroffenen Libraries und Fixes; HIGH/CRITICAL einzeln behandeln | Neuer CI-Scan, Review offen |
| Provenance | Signierte, unabhängig überprüfbare Herkunft inkl. Source-Commit, Builder, konkretem Base-Digest und Image-Manifest | Nur unsignierte, lokale CI-Metadaten |
| Paketidentität | OCI-Manifest plus späterer **tatsächlich aus Artifact Registry ausgelesener** Image-Digest | OCI-Kandidat vorhanden, Registry-Digest fehlt |
| Region & Kosten | Zurich `europe-west6`, Speicher-/Netzregion, Kostenobergrenze/Alarm, Aufbewahrung | Offen |
| Cloud-Berechtigungen | Geschäftliche Operator-Identität, `actAs`, IAM-Deny/PAB und geerbte/effective Rechte plus präzises Rollback | Offen |
| Genehmigung | Konkrete separate Betreiberzustimmung für **Registry und Image-Push**; nochmals eigenständige Zustimmung für G3-`--apply` | **NICHT erteilt** |

## Keine automatische Veröffentlichung

Für diesen Zweig gibt es **keine** CI-`docker push`-Befehle,
`gcloud artifacts repositories create`, `gcloud services enable`,
`gcloud run deploy`, `gcloud iam`-Writes, `pubsub publish`,
GCP-OIDC-Token oder GitHub-Rechte `id-token: write`.
Der Container wird **nicht** als Package/GitHub Release exportiert.

Nach einem künftigen, **separat genehmigten** Registry-Upload müssen ein
exakt definierter Registry-Name
`europe-west6-docker.pkg.dev/lszh-automations/lszh-g3-review-staging/receiver@sha256:<digest>`,
Manifest-Digest-Readback, Provenance-Verifikation und ein
Audit-/Rollback-Nachweis vorliegen. Eine grüne GitHub-Actions-CI allein
ist niemals eine Freigabe. Die bisherige Bootstrap-`--apply`-Prüfung
kontrolliert Form/Existenz des Images, **nicht** signierte Provenance oder
ein menschlich autorisiertes Change-Ticket; diese Lücke ist vor
jedem tatsächlichen `--apply` separat zu schliessen.

**Betrieb unverändert:** Make `7940220` inactive und Claim-/Mail-Pfade
`0=1`, ausschliesslich Geschäfts-Drive `lars@lszh-automations.ch`,
kein realer Kunde, Vertrag, PDF-Mailversand oder Firestore-Schreibzugriff.

## Verifizierter initialer Scan und abgegrenzte Behebung (18.10.2026)

**Erster vollständiger Scan:** [GitHub Actions 39147203165](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39147203165) **SUCCESS als Prüfungsworkflow**, nicht als Security-Approval:
`CRITICAL=0`, `HIGH=11`, `MEDIUM=10`, `LOW=1`, `UNKNOWN=0`;
**217** SBOM-Komponenten. Für 10 hohe Befunde nennt Trivy Fix-Versionen,
für 1 keine. Die 11 Funde stammen aus Node.js-Distributionskomponenten
`brace-expansion` (5 Befunde), `http-cache-semantics` (1),
`ip-address` (1), `pacote` (2), `picomatch` (1) und
`sigstore` (1). Die genaue Einzelfallliste steht im
`g3-security-review.json`-Artifact von
[GitHub Actions 39147340026](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39147340026).

**Remediation im Draft, bisher keine Cloud-Aktion:**
Der Canary verwendet ausschliesslich `node /srv/index.mjs`, **nicht**
das Paketmanagement. Der Dockerfile entfernt deshalb im isolierten
Build präzise die vorinstallierten npm-/Corepack-Bibliotheken und deren
Launcher. Dieser einzige `RUN`-Befehl ist exakt durch die
Source-Policy whitelistet und unter `--network none` ausgeführt.
Ein isolierter Container-Smoke prüft ausdrücklich, dass `node`
weiter läuft und kein npm/Corepack mehr enthalten ist. Zusätzlich
bleiben SHA-256-Doppelbuild, CycloneDX, Trivy und Quelltests zwingend.
Die Wirksamkeit gilt **erst** mit einem dokumentierten erfolgreichen
Folgelauf als bestätigt.

**Sicherheitsgrenze:** Die Softwarekomponentenfunde sind nicht automatisch
ausnutzbare Cloud-Run-Schwachstellen. Umgekehrt beweist ein späterer
Scan mit weniger Treffern keine vollständige Sicherheit, signierte
Provenance oder Deployberechtigung. `NO_GO` gilt unabhängig vom Ergebnis.
