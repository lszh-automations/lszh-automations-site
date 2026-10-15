# LSZH – Container-Härtung und Supply-Chain-Prüfung des Cloud-Run-Lesedienstes

**Stand: 15.10.2026. Entwicklungszweig, keine Bereitstellung, keine IAM-/Firestore-/Airtable-/Drive-Änderung.**

## Ausgangsproblem (echter CI-Befund)

Der ursprüngliche STAGING-Container verwendete den vollständigen Laufzeitcontainer `node:22.23.3-bookworm-slim` mit eingebauter npm-CLI und dem Firestore-SDK 7.x. Die erste getrennte npm-Sicherheitsprüfung fand bei SDK 7.11.6 **sechs moderate Advisory-Meldungen** im Abhängigkeitsbaum. Deshalb wurde die direkte SDK-Version auf **`@google-cloud/firestore@9.3.1`** aktualisiert und in einem eigenen `package.json` festgeschrieben.

Mit einem separaten Build/Trivy-Scan zeigte die erste vollständige Image-Prüfung des alten Laufzeitdesigns trotz bereits erfolgreichem npm-Audit **64 OS-Sicherheitsmeldungen (60 HIGH, 4 CRITICAL)** sowie **11 Node-Paketmeldungen (11 HIGH)**, unter anderem aus mitgelieferten npm-/Betriebssystem-Werkzeugen. Dieser Container wurde **nicht** deployt. Bei mehreren Betriebssystemmeldungen waren laut Scanner auch keine verfügbaren Korrekturen angegeben.

## Umgesetzte Abhilfe (nur Feature-Branch)

1. **Zwei getrennte Build-Stufen:** Builder auf einem per OCI-Index-Digest fixierten offiziellen Node-Image; Laufzeit auf einem per OCI-Digest fixierten `gcr.io/distroless/nodejs22-debian13:nonroot`. Im fertigen Image befinden sich **kein npm, keine Shell, kein apt und keine Build-Werkzeuge**. Der Container läuft als numerischer Nicht-Root-User `65532:65532`.
2. **Fixierte OCI-Image-Digests:** Builder `node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392`; Laufzeit `gcr.io/distroless/nodejs22-debian13:nonroot@sha256:ec2313763dd43931543bd03830466e0c409ce73a487e8d46f10db72d3b816c1c`. Beide Digests stammen aus der CI-Abfrage `docker buildx imagetools inspect`, nicht aus geschätzten Versionsnamen.
3. **Isolierter SDK-Lock:** `services/offer-acceptance-staging/package.json` enthält nur `@google-cloud/firestore: 9.3.1` als direkte Abhängigkeit; das zugehörige `package-lock.json` hält **117 aufgelöste npm-Packages** samt Integritätswerten fest. Für den Image-Build verwendet die Dockerfile ausschliesslich `npm ci --omit=dev --ignore-scripts`; kein dynamisches `npm install @google-cloud/firestore@7` mehr.
4. **Ausgeschaltete Funktionalität als Default:** `LSZH_STAGING_READ_PROBE_ENABLED=no`, `LSZH_FIRESTORE_STAGING_WRITE_ENABLED=false`. Kein Deployment, keine initialisierte SDK-Connection bei deaktivierter Read-Probe, alle Annahme-/Versand-HTTP-Routen weiterhin gesperrt.
5. **Automatische CI-Kontrollen:** Lockfile-Integrität, `npm ci` und `npm audit --omit=dev --audit-level=moderate`; vollständiger `docker build --pull --no-cache`; Laufzeitkontrolle des numerischen Nicht-Root-Users; lokaler Container-Smoke-Test mit `--read-only`, `--cap-drop ALL`, `no-new-privileges`; erwartete Antworten `GET /healthz = 200`, `GET /__internal/staging/firestore-read = 404`, `POST /api/offer/accept = 503`; abschliessender Trivy-Scan (HIGH/CRITICAL-OS und Anwendungsbibliotheken), **bricht den CI-Test bei Befunden ab**. Trivy-Action auf den verifizierten Release-Commit `ed142fd0673e97e23eac54620cfb913e5ce36c25` fixiert.

## Live-CI-Nachweise

- [LSZH-Container-Scan – erfolgreicher Lauf #38801279138](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38801279138): alle Schritte **bestanden**; `npm audit` **0 vulnerabilities**; Trivy-Scan von Debian 13.7 und Node-Laufzeitbibliotheken **0 HIGH/CRITICAL** zum Prüfzeitpunkt; Containerbau, UID und alle drei HTTP-Smoke-Checks erfolgreich.
- [LSZH-Emulator-Tests – erfolgreicher Lauf #38801246060](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38801246060): auch nach SDK-9.3.1-Umstellung **115/115 Unit-/HTTP-/Sicherheitstests**, **9/9 echte lokale Emulator-Tests**, 0 Fehler/0 Skips.
- Vorangegangener, absichtlich streng angelegter [Trivy-Blocker-Lauf #38800778709](https://github.com/lszh-automations/lszh-automations-site/actions/runs/38800778709) belegt, dass die Pipeline HIGH/CRITICAL-Befunde im alten Container nicht stillschweigend akzeptiert hat.

**Sicherheitsgrenze:** Trivy- und npm-Ergebnisse sind zeitgebundene Prüfungen auf bekannte Advisories. Sie ersetzen weder Code-Review noch Penetrationstest, Google-Cloud-IAM-Prüfung oder fortlaufende Image-/Abhängigkeitsupdates. Der GitHub-Test läuft ohne echte Cloud-Credentials; keine realen Firestore-Named-DB-IAM-Bedingungen wurden getestet.

## Offen vor jeder Cloud-Run-Bereitstellung

- **Separate ausdrückliche Freigabe des Nutzers** für einen **neuen** Cloud-Run-Dienst `lszh-offer-acceptance-staging`, ohne das existierende Cloud-Run-Preflight `lszh-offer-portal-staging` oder einen Render-Dienst zu verändern.
- Dienstkonto `lszh-offer-reader@lszh-automations.iam.gserviceaccount.com` als einzige Laufzeitidentität; separater kontrollierter `iam.serviceAccounts.actAs`-Check für den Deployer; keine Schlüsseldatei.
- Geschützte Cloud-Run-Invoker- und Ingress-Konfiguration: **kein anonymer öffentlicher Zugriff**, nur explizit benannte Testidentitäten.
- Remote-Nachweis der tatsächlichen **nur lesenden** Firestore-SDK-Verbindung zur benannten Datenbank `lszh-offers-staging`. Offline-Emulatorzugriff ersetzt dies nicht.
- Separate Freigaben nötig für Drive/Airtable, Archiv-Retention, Firestore-Schreibzugriffe, RC1-/AVV-Rechtsprüfung, Versand und echte elektronische Vertragsannahme.

**Ergebnis: Build-/Dependency-/Image-Supply-Chain-Gate aktuell GRÜN; Cloud-Deployment-Gate weiterhin GESPERRT.**
