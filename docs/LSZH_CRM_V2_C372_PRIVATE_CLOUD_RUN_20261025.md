# LSZH CRM V2 – C3.7.2: Private Gmail-Read-only-Staging-Laufzeit

**Stand 25.10.2026. Isolierter Code und Build-Quellordner vorbereitet. Noch KEIN Cloud-Run-Deployment und KEIN Gmail-Backend-Livetest.**

## Ausgangsnachweis

- C3.7.1 Offline-OAuth erfolgreich: Betreiber meldete `LSZH C3.7.1 PASS: Gmail readonly verifiziert, Secret-Version im dedizierten Secret gespeichert; kein Versand.`
- Anschliessende separate Secret-Manager-Metadatenprüfung durch Betreiber: `NAME  STATE` / `1     enabled`. **Damit ist genau eine aktive Secret-Version 1 belegt.** Keine Secretwerte wurden offengelegt.
- Verwendete Cloud-Ressourcen: Projekt `lszh-automations`, Region `europe-west6`, Servicekonto `lszh-crm-c37-ro@lszh-automations.iam.gserviceaccount.com`, Secret `lszh-crm-c37-gmail-readonly`. Die IAM-Zugriffsregel auf dem Secret selbst wurde geprüft; geerbte übergeordnete IAM-Berechtigungen wurden bislang nicht auditiert.

## Isolierter C3.7.2-Code

- `crm-v2/c372-readonly-server.js` ist ein **eigener** Cloud-Run-Prozess. Er importiert **nicht** den produktiven `crm-v2/server.js` und besitzt keinen Gmail-SEND-, Make-, Firestore-Schreib-, CRM- oder Rechnungspfad.
- Die Cloud-Run-Umgebung wird schon beim Start strikt begrenzt: `K_SERVICE=lszh-crm-v2-c37-readonly-staging`; `GOOGLE_CLOUD_PROJECT=lszh-automations`; `LSZH_C37_READONLY_ENABLED=true`; `LSZH_C37_TEST_ONLY=true`; alle Sendeschalter bleiben deaktiviert. Das ist eine zweite Sicherheitslinie nach den Cloud-Run-IAM- und Ingress-Einstellungen.
- `GET /healthz`: ausschliesslich statischer Gesundheitsstatus, kein Secret-Manager-, Google- oder Gmail-Zugriff.
- `POST /internal/gmail-readonly-check`: **nur ein ausdrücklich ausgelöster Aufruf**; keine Nutzlast oder URL-Query erlaubt. Er lädt die Secret-Version über den bestehenden festen Mountpfad `/var/run/secrets/lszh-c37/gmail-readonly.json`, frischt **nur** das Access-Token auf, validiert `aud`, exakt `gmail.readonly`, Ablaufzeit und GET Gmail-Profil `lars@lszh-automations.ch`. Die Antwort enthält nur statische Flags, keine Tokens, E-Mail-Inhalte, PDF-Daten oder Kundenidentifikatoren.
- Fehlende Berechtigung, falsche Identität, fehlendes Secret, unerwartete Anfrage, Fehler oder gleichzeitiger zweiter Aufruf werden blockiert. Diese HTTP-Anwendungsprüfung **ersetzt keine** Google-Cloud-IAM-Prüfung; der Dienst muss mit Cloud Run Invoker-Authentisierung und `--ingress=internal` bereitgestellt werden.
- `crm-v2/test/contract-gmail-c372-private-server.test.js`: synthetische HTTP-Fälle für isoliertes Service-Gate, statische Health, explizite POST-Autorisierung, Payload-/Pfadablehnung, Providerfehler, Nebenläufigkeit und No-Send-Trennung.
- `scripts/prepare-crm-c372-private-source.ps1`: erzeugt einen einzigartigen temporären Build-Kontext **nur aus zehn explizit erlaubten Git-Dateien plus minimaler package.json**. Er enthält nicht den produktiven CRM-Server, Make-Maildispatcher, lokal gespeicherte OAuth-Clients oder Kundendaten. Der Ordner wird **nicht automatisch hochgeladen, gebaut oder deployt**.
- GitHub Actions umfasst jetzt die C3.7.2-Node-Tests, JavaScript-Syntax und den Windows-Test des Source-Allowlist-Pakets.

## Operator – NÄCHSTER KONTROLLPUNKT (ohne Deployment)

Im Repository auf dem C3.7-Feature-Branch:

```powershell
git pull --ff-only
npm.cmd test --prefix .\crm-v2
$sourceDir = & ".\scripts\prepare-crm-c372-private-source.ps1"
Get-ChildItem -LiteralPath $sourceDir -Name
```

Erwartung: die zehn allowlist-Module und die minimale `package.json`, aber **kein** `server.js`, kein `offer-send.js`, keine Geheimdaten. Den erzeugten Ordner nach dem späteren Build mit `Remove-Item -LiteralPath $sourceDir -Recurse -Force` entfernen.

## Noch nicht ausgeführte separate Cloud-Run-Freigabe

Erst nach erfolgreicher Prüfung des erzeugten isolierten Build-Kontexts und ausdrücklicher Betreiberentscheidung:

1. Existenzprüfung des neuen, eigenständigen Dienstnamens `lszh-crm-v2-c37-readonly-staging` in `europe-west6`, keine Manipulation eines vorhandenen Dienstes.
2. Getrennte Cloud-Run-Quellcode-Bereitstellung `--source=$sourceDir` ausschliesslich aus diesem isolierten Ordner, mit `--service-account=lszh-crm-c37-ro@lszh-automations.iam.gserviceaccount.com`, `--no-allow-unauthenticated`, `--ingress=internal`, `--no-traffic`, `--max-instances=1`, `--concurrency=1`, `--min-instances=0`, und nur dem Secret-Mount `--update-secrets=/var/run/secrets/lszh-c37/gmail-readonly.json=lszh-crm-c37-gmail-readonly:1`. Die Schutzschalter werden als separate `--set-env-vars` gesetzt. Dies ist **noch nicht durchgeführt**. Google dokumentiert sowohl `--no-traffic` als auch private Zugangsprüfungen und Secret-Mounts: https://cloud.google.com/sdk/gcloud/reference/run/deploy .
3. Falls ein Null-Traffic-Deployment erfolgreich ist: erst dessen IAM, Ingress, Quellcode-Entry-Point, Servicekonto, Secret-Mount und null Traffic unabhängig prüfen, bevor ein isolierter Operator-Testaufruf mit gültiger Cloud-Run-Invoker-Identität aus einem **erlaubten internen Netzpfad** vorbereitet wird. Ein lokaler curl-Aufruf vom Surface ist bei `ingress=internal` nicht automatisch zugelassen.
4. Erst nach ausdrücklich freigegebenem, unabhängigem Live-Gmail-Profilcheck können wir den bestehenden C3.4/C3.5-Beweispfad für eine **vorher bekannte Test-Gmail-Nachricht mit 2/3 PDFs** getrennt prüfen. Weder Vertragsversand noch Firestore-Live-„SENT“ wird dadurch aktiviert.

**Bis dahin bleibt C3.7.2 in STAGING-CODE-ONLY.** Die produktiven Make-Szenarien 8144117 / 8166714, CRM-Cloud-Run-Dienste, Firestore und jegliche Kundenkommunikation bleiben unangetastet.
