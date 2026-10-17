# LSZH Onboarding-Outbox – STAGING-only, keine E-Mails

## 17.10.2026 – Replay-Plan-Manipulation blockiert (nicht deployt)

`planReplayClaim` friert jetzt auch verschachtelte Firestore-Felder ein. `verifiedReplayClaim` rekonstruiert unabhängig einen kanonischen Schreibplan und verweigert bei jeder Plan-Abweichung schon **vor** der Ack-/Readback-Auswertung die Bestätigung. Zwei neue synthetische Regressionstests decken tiefe Mutationen und absichtlich gefälschte, dazu passende Readbacks ab. Keine Änderung an Cloud Run, IAM, Firestore, Secrets, HTTP-Server oder E-Mail-Versand. Die spätere echte Replay-Claim-Ausführung bleibt separat freigabepflichtig.

## 17.10.2026 – Replay-CAS und Empfangs-HTTP-Vertrag vorbereitet, nichts aktiviert

Zusätzlich zu `quarantine-handoff-protocol.js` und `quarantine-handoff-offline-flow.js` sind nun `quarantine-handoff-replay-cas.js` (**nur einseitiger Firestore-Claim-Commit-Entwurf mit `exists:false`, keine Ausführung**) und `quarantine-handoff-http-contract.js` (**nur strikter JSON-Request-Parser für `POST /internal/quarantine/handoff`, kein HTTP-Server**) vorhanden. Der Replay-Key ist die bereits etablierte 64-stellige HMAC-Ausgabe aus `validateAndClaimOnce`. Der Claim ist nur nach einer unabhängigen, versionsgebundenen Firestore-Readback-Prüfung als erfolgreich zu bewerten. Kein Retry, TTL, automatisch gelöschte Nonces oder Versand; die künftige Replay-Collection existiert bislang nur als Source-Pfad.

Der HTTP-Parser ist standardmässig deaktiviert, verlangt exakte Quarantäne-STAGING-Flags, limitiert 2048 Byte und meldet selbst bei syntaktisch korrekten Umschlägen **`authenticated:false`**, weil **Cloud Run** später separat seine eigene OIDC-/IAM-Aufruferprüfung durchführen müsste. Weder existiert ein deployter Listener noch wurden URL, Secret oder `run.invoker`-Binding angelegt. Gefälschte Authorization-/Principal-Header liefern keine Authentifizierung. **411/411 synthetische Tests PASS**, beide GitHub-Workflows PASS. `server.js` bleibt unverändert und der Outbox-Worker abgeschaltet. Neue echte Datenbankwrites, IAM, Secrets, Deployments und Produktivmails bleiben gesperrt.

## 17.10.2026 – Offline signierter, noch nicht aktivierter Quarantäne-Handoff

Neu: `quarantine-handoff-protocol.js` und `quarantine-handoff-offline-flow.js` liefern den **reinen Quell-/Ziel-Übergabevertrag**, aber keinen Cloud-Run-Endpunkt, keine HTTP-POST-Funktion und keinen produktiven Einstiegspunkt. Der Outbox-Reader authentifiziert sich nur mit seiner bestehenden Quell-Metadata-Identität; `reviewDraft` prüft aktuell den Airtable-Zustand des strikt allowlisteten synthetischen Projekts. Aus dem geprüften, send-gesperrten Entwurf werden nur opake ID, Review-Status und begrenzte Gültigkeits-/Nonce-Metadaten **HMAC-SHA256-signiert** (120 Sekunden gültig), **niemals** Kundenadresse, Projektcode, Original-Record-ID, vollständiger Draft oder OAuth-/OIDC-Token. Der Empfänger überprüft signierte Version/Issuer/Audience/TTL/Status und verlangt **einen dauerhaft atomaren Replay-Claim**; ohne diesen verweigert er ausdrücklich die weitere Verarbeitung. Danach erfolgt per eigener Quarantäne-Metadata-Identität ein reiner Quarantäne-Dokument-GET, gefolgt von der bisherigen **nicht ausführbaren** Quarantäne-CAS-Summary. Kein tatsächlicher CAS-Write oder Mail.

Für **später** vorgesehene transportseitige Authentifizierung wird Googles Cloud-Run-Service-zu-Service-OIDC-Verfahren benötigt: privat bleibender Empfänger (`--no-allow-unauthenticated`), `roles/run.invoker` **nur für den exakten Outbox-Quell-Service-Account auf der exakten Empfänger-Service-Ressource**, ID-Token mit Audience der echten Ziel-Basis-URL. Das ist **zusätzlich** zu HMAC und nicht durch einen frei behaupteten Header ersetzbar. Ziel-Service/URL/Signaturschlüssel/Secret-Management/Replay-Claim-Persistenz sind weiterhin nicht eingerichtet, und jede IAM-/Deployment-/Cloud-Aktion braucht eigene ausdrückliche Freigabe. Die bereits bestehende `server.js`-Route sowie `LSZH_OUTBOX_STAGE_ENABLED=false` bleiben vollständig unverändert. Signierte Nachrichten sind **keine** Berechtigung zum E-Mail-Versand oder zum automatischen Firestore-Commit.

## 17.10.2026 – Scope-getrennte Read-only-Firestore-Identitäten vorbereitet (noch kein Cloud-Deploy)

`firestore-scoped-readers.js` implementiert **neben** der alten, weiter vollständig deaktivierten Outbox nur für spätere gesondert genehmigte STAGING-Laufzeiten zwei nach echter Metadata-Dienstidentität gebundene **GET-only**-Reader: `outbox` nutzt ausschliesslich die bestehende `lszh-offers-staging`-Collection `lszh_onboarding_notification_drafts_staging`; `quarantine` nutzt ausschliesslich die separate `lszh-quarantine-staging`-Collection `lszh_onboarding_quarantine_cases_staging`. Beide verweigern ohne explizite STAGING-Flags, richtiger Projekt-/DB-Konfiguration und passenden Google-Metadata-`/email`-Nachweis alle Datenbankaufrufe. Firestore-Zugriff läuft nur via ein kurzlebiges Metadata-Token dieser einen eigenen Identität, ohne irgendeine Tokenweitergabe und ohne POST/DELETE/PUT/PATCH.

`decodeOutboxDraft` verifiziert exakt die bestehende send-gesperrte achtfeldrige Draft-Struktur und ID, die Quarantäne liest über `decodeSnapshot` die verifizierte Revision, Historie und `deliveryAllowed=false`. **Keiner** der neuen Reader ist von `server.js`, einem Cloud-Run-Entrypoint oder einem Scheduler eingebunden. Die Änderungen wurden nur mit gemockten Metadata-/Firestore-GETs getestet; zwei zusätzliche synthetische Integrationsfälle verbinden den Quell-Reader und Ziel-Reader in einem Offline-Testprozess mit dem vorhandenen `reviewOnboardingForQuarantine`-Plan. **372/372 Offline-Tests bestanden, beide GitHub-Workflows PASS.** Keine realen Airtable-/Firestore-Anfragen, IAM-/Cloud-Run-Änderungen und keine Kundenmails.

**Rest-Grenze:** Zwischen zwei echten Cloud-Run-Service-Identitäten gibt es noch **keinen** authentifizierten, frischen, minimalen und replay-sicheren Übergabekanal. Unbeglaubigte JSON-Bestätigungen dürfen deshalb niemals eine Firestore-Änderung oder einen E-Mail-Versand auslösen. Eine spätere Service-to-Service-Integration benötigt eine eigene konkrete IAM-/Deploy-/Sicherheitstest-Freigabe; die bestehende Outbox darf nicht pauschal auf die Quarantäne-Datenbank zugreifen und umgekehrt. Das vorherige synthetische Quarantäne-Write-Testdokument verbleibt absichtlich mit Revision 2.

## 17.10.2026 – Offline-Bridge zur Quarantäne ergänzt; bestehender Server deaktiviert

Die neue `onboarding-quarantine-integration.js`-Funktion `reviewOnboardingForQuarantine` verbindet **nur im Quellcode und synthetischen Tests** den bereits vorhandenen send-gesperrten `makeDraft`-/`eventId`-Outbox-Entwurf, die enge `listCandidateCodes`-Fixture-Allowlist und den vorhandenen **read-only** `reviewDraft`-Airtable-Statusnachweis mit `prepareQuarantineCAS` für die separate `lszh-quarantine-staging`-Datenbank. Ungültige Drafts, fremde IDs, nicht gelistete Projektcodes oder unverifizierbare Firestore-Snapshots ergeben `BLOCKED_NO_PERSISTENCE`; Airtable-Ausfall ergibt `HOLD_NO_PERSISTENCE`; gleichbleibender Review-Status `NO_CHANGE`.

Die Bridge gibt **ausschliesslich einen nicht ausführbaren Status ohne Cloud-POST, Projektcode, Token oder E-Mail-Adresse** zurück. `server.js` und die Cloud-Run-Konfiguration wurden **nicht angefasst**; der Worker bleibt mit `LSZH_OUTBOX_STAGE_ENABLED=false` deaktiviert, und es wurde keine neue IAM-Berechtigung vergeben. **357 von 357 Offline-Tests bestanden** nach dieser Ergänzung. Bestehende **zwei einzelne synthetische** erfolgreiche Schreib-/Lese-Nachweise sind separat: bereits vorhandener Outbox-Lese/Schreib/Lösch-Test sowie Quarantäne-CAS-Create+Update-Livetest; daraus folgt **keine produktive End-to-End-Integration**.

Vor einem späteren realen Integrationslauf sind unabhängige, bankübliche Authentifizierungs- und Identitätsprüfungen für das Lesen des bestehenden Drafts in `lszh-offers-staging` **und** den Zugriff auf `lszh-quarantine-staging` nötig. Die auf die jeweilige Named Database beschränkten Service-Account-Rechte werden **nicht zusammengelegt**, und es darf keinen stillen Firestore-Schreib-/Retry- oder Mail-Pfad geben. Gesonderte Zustimmung für IAM, Deploy und produktive Daten bleibt erforderlich.

**Stand:** 17.10.2026. Code weiterhin Draft PR #8 (nicht gemergt). Separater Cloud-Run-STAGING-HTTP-Dienst bereitgestellt und weiterhin **deaktiviert**. Isolierte Cloud-Run-Jobs bestätigten echten Firestore-GET-Zugriff sowie das synthetische **createOnce → Readback → versionsgebundene Löschung → abschliessendes 404**. Keine Kundenmails, kein Scheduler und keine Onboarding-End-to-End-Verarbeitung.

## 17.10.2026 – Tatsächlicher Firestore STAGING WRITE/READ/DELETE-Nachweis: PASS

Der Geschäftsführer hat nach erfolgreicher einmaliger Jobausführung `lszh-firestore-write-probe-staging-cb7mm` (Cloud Run, `europe-west6`) die nachfolgenden **konkreten Container-Logs** bestätigt:

```text
2026-10-16 22:20:11 PASS: Fixed synthetic STAGING document was absent before the write.
2026-10-16 22:20:11 PASS: Actual outbox createOnce persisted one test-only, send-disabled draft.
2026-10-16 22:20:11 PASS: Created draft read back with exact testOnly=true and delivery=false fields.
2026-10-16 22:20:11 PASS: Test fixture deleted with a version precondition.
2026-10-16 22:20:11 PASS: Test fixture removal verified (HTTP 404).
2026-10-16 22:20:11 PASS: Outbox Firestore synthetic WRITE/READ/DELETE cycle completed.
2026-10-16 22:20:11 No Airtable calls, emails, customer records or credentials logged.
```

**Abgeschlossen:** Effektive **Lese- und Schreibberechtigung der Cloud-Run-Laufzeitidentität** für einen ausdrücklich fiktiven Datensatz der benannten Firestore-STAGING-Collection, echte `createOnce`-Speicherung mit allen Test-/Versandsperren, verifizierte bedingte Einzeldokumentlöschung und abschliessender 404. Kein unbereinigter Testdatensatz gemäss dem abschliessenden GET. Beide Einmal-Probejobs **nicht erneut starten**.

**Weiterhin gesperrt/ungeprüft:** Der bestehende HTTP-Outbox-Dienst bleibt bei `LSZH_OUTBOX_STAGE_ENABLED=false`, hat weder Airtable-Read-Token noch Fixture-Codes, Control-Secret oder Scheduler. Kein vollständiger Airtable→Onboarding→Outbox-End-to-End-Test durchgeführt. Kein Produktivversand, keine Vertragsannahme, kein RC1-/AVV-Rechtsentscheid; PR #8 ist weiterhin Draft und nicht gemergt. Eine sichere nächste Phase sollte den vollständig synthetischen Airtable-Zustandsnachweis **lesend** vorbereiten, ohne weitere Firestore-Infrastruktur zu erstellen.

## 17.10.2026 – Echte Airtable-REST-Prüfung gefahrlos vorbereitet (NEU; NOCH NICHT AUSGEFÜHRT)

Vorbereitung eines **rein lesenden** Node.js-Laufzeittests der tatsächlichen `onboarding/confirmation.js`-Funktion `verifyOnboardingState()` mit einem Airtable Personal Access Token, **ohne** zuvor einen neuen CRM-Testkunden anzulegen. Die drei vormals genehmigten synthetischen CRM-Records wurden am 17.10. erneut jeweils mit exakten Record-ID-Filtern geprüft: **je 0 Treffer**, Bereinigung weiterhin bestätigt.

`staging-airtable-rest-read.sh` (default `--plan`, keine externen Requests) und `staging-airtable-rest-read.js` (nur bei `--probe`) erzwingen:
- sauberen Review-Git-Branch, echtes LSZH-Google-Cloud-Geschäftskonto und Projekt;
- lokale verdeckte Eingabe eines Airtable-**Read-only**-PAT, beschränkt auf `data.records:read` für `LSZH Automations – Website CRM`, über eine private Pipe an Node; keine Secret-Dateien, keine Kommandozeilen-PATs, keine Logs mit Token oder Suchcode;
- genau **einen** REST-`GET` auf die `Kunden-Onboarding`-Tabelle, gefiltert nach einem frisch generierten, unvorhersagbaren `ob_<UUIDv4>`-Projektcode;
- den realen `verifyOnboardingState()`-Code. Erwartet wird für einen **nicht vorhandenen** Testcode ausschliesslich `{state:'processing'}`, NICHT ein Abschluss;
- bei fehlender Authentifizierung/401/403, Rate-Limit 429, fehlerhaften Daten oder weiterer Abfrage eine sichere Verweigerung; keine Anlage/Änderung realer CRM-Daten, kein Cloud-Run-Reconcile, keine Firestore-Aktion oder Mail.

**Offline-Kontrolle:** Acht zusätzliche Mock-/Fail-closed-Tests in `staging-airtable-rest-read.test.mjs`; GitHub Actions **99/99 JavaScript-Tests** und **8/8 IAM-Tests** grün.

**Erst nur den Plan ausführen:**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-airtable-rest-read.sh
```
Das meldet `PLAN ONLY`. Die eigenständige, spätere Aktion `--probe` verlangt ein zuvor vom Firmeninhaber beschränktes Airtable-PAT und führt eine tatsächliche, eng begrenzte externe Leseabfrage aus, **ohne das Token hier im Chat einzufügen**. Dieser Nachweis belegt dann die aktuelle Airtable-REST-Authentifizierung des Node-Verifizierers **in Cloud Shell**, nicht schon eine Cloud-Run-Airtable-Verbindung. Der getrennte Cloud-Run-HTTP-Outbox-Dienst bleibt weiterhin `enabled=false`.

## Bestätigte Infrastruktur aus Geschäftskonto (diagnostiziert am 16.10.2026)

- Google-Cloud-Projekt: `lszh-automations`; aktives Geschäftskonto bestätigt.
- Firestore Native: **bestehende benannte** Datenbank `lszh-offers-staging`, Region **`europe-west6` (Zürich)**. Es gibt **keine** `(default)`-Datenbank. Keine neue Datenbank nur für diesen synthetischen Versuch erstellen.
- Artifact Registry: **bestehendes** Docker-Repository `cloud-run-source-deploy`, Standort `europe-west6`. Kein neues Repository erforderlich.
- APIs aktiviert: Cloud Run, Cloud Build, Artifact Registry, Firestore, Secret Manager.
- Vorhandene Cloud-Run-Staging-Services: `lszh-archive-reader-staging`, `lszh-offer-acceptance-staging`, `lszh-offer-portal-staging`. **Nicht verändern.**
- Outbox-spezifisches Dienstkonto `lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com`: **am 16.10.2026 von Geschäftsführer in Google Cloud Shell erstellt**; Cloud IAM-Änderung mit `Updated IAM policy` bestätigt. **Tatsächliche REST-Berechtigung und Scope noch nicht nachgewiesen**.
- Outbox-spezifischer Cloud-Run-Dienst `lszh-onboarding-outbox-staging`: **seit 16.10.2026 bereitgestellt**, Revision `00001-pz6`, Image-Tag `staging-4075f23f47b8`, 100 % Traffic zur deaktivierten Revision. **Authentifizierter `/health`-Test noch offen.**

**Sicherheitshinweis:** Die vorhandene Firestore-Datenbank ist für Offerten-Staging benannt. Eine zusätzliche, getrennte Collection für rein synthetische Onboarding-Tests ist funktional möglich und vermeidet eine neue Datenbank. **IAM lässt sich per Bedingung auf diese Datenbank, aber nicht auf unsere einzelne Collection begrenzen.** Daher darf das Servicekonto nur für den isolierten synthetischen Staging-Test genutzt werden; vor Livebetrieb separate Datenbank oder stärker isolierte Architektur prüfen.

## Datenfluss (nur Testentwürfe)

```
privater Cloud-Run-Worker (im Code standardmässig DEAKTIVIERT)
   + explizit genehmigter synthetischer Onboarding-Projektcode
   -> Airtable lesend: Onboarding -> Auftrag -> Kunde -> ggf. DSG-Aufgabe
   -> nur wenn alle Persistenzprüfungen erfolgreich sind:
      Firestore projects/lszh-automations/databases/lszh-offers-staging/
       documents/lszh_onboarding_notification_drafts_staging/<SHA256-key>
      status DRAFT_NOT_SENT, testOnly=true, deliveryEnabled=false, emailSent=false
   X kein Gmail, Make-Mail-Modul, SMTP oder Versand-Consumer
```

Der technische Abschluss der **Onboarding-Eingabe** ist *nicht* der Abschluss des Kundenprojekts. Es wird nur ein Entwurf für eine spätere Benachrichtigung vorgemerkt; es ist keine Empfangs- oder Versandgarantie.

### Sicherheitsgates

- Der Dienst ist ohne `LSZH_OUTBOX_STAGE_ENABLED=true` deaktiviert. **Keine** produktiven Aktivierungen, Scheduler oder E-Mails.
- `FIRESTORE_PROJECT_ID=lszh-automations` **und** `FIRESTORE_DATABASE_ID=lszh-offers-staging` sind erforderlich und intern noch einmal hart verdrahtet.
- `LSZH_STAGING_FIXTURE_CODES` muss **1 bis maximal 3** ausdrücklich genehmigte synthetische Codes enthalten (Kommatrennung, `ob_<UUID>`). Der Dienst scannt **nicht mehr** alle CRM-Onboardings. Ohne Fixture-Allowlist keine Verarbeitung. Diese Codes als Secret behandeln, nicht ins GitHub-Repo oder Logs schreiben.
- `AIRTABLE_ONBOARDING_READ_TOKEN`: Airtable Personal Access Token mit **ausschliesslich Lesezugriff** auf die Website-CRM-Base; als Google-Secret, nicht im Repo.
- `OUTBOX_CONTROL_SECRET`: zufällig gewählter, mindestens 32 Zeichen langer Header-Wert; nur als Secret.
- Nur privates Cloud Run mit `--no-allow-unauthenticated`, eigener Laufzeitidentität, `POST /internal/reconcile` über Cloud-Run-Invoker-Authentisierung **plus** zusätzlichem Header-Secret; keine beliebigen HTTP-Body-Inhalte.
- Firestore-REST-Zugriff über kurzfristiges Metadaten-Token der Cloud-Run-Dienstidentität; **kein JSON-Dienstkontoschlüssel**.
- Atomare `createDocument(documentId)` mit Event-ID SHA-256 aus Record-ID und Ereignisversion; bei 409 nur verifizierte identische `DRAFT_NOT_SENT`-Dokumente als existent behandeln. Fehler bleiben fail-closed; keine erneuten Sendungen.
- Entwürfe enthalten keine Projektcode-Links, Empfängeradressen oder Rechnungsangaben. **Airtable-Lesezugriff kann diese Daten dennoch sehen**, deshalb beschränkte Fixture-Allowlist.
- Erst **vor** echtem Einsatz dedizierte Firestore-Datenbank sowie kontrollierte Versandzustände, Provider-Idempotenz, Retention und Fehler-Reconciliation festlegen.

## Bereits vorbereitete, nicht ausgeführte Dateien

- `Dockerfile`: separater Node-Worker, Docker COPY-Allowlist, kein .env, keine Website, keine Git-Metadaten im Container.
- `cloudbuild.staging.yaml`: baut/pusht ein separat benanntes Image unter **`europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-onboarding-outbox`**; **kein** Deployment. Ausführen erst nach ausdrücklicher Freigabe.
- `staging-preflight.sh`: rein lesender Check der **tatsächlich vorhandenen** benannten Datenbank und Docker-Registry sowie fehlender Staging-Laufzeitidentität.
- `staging-diagnostics.sh`: rein lesende detaillierte Google-Cloud-Inspektion.
- `staging-identity-setup.sh`: ohne Argumente nur Plan/Prüfung; **nur mit** `--apply` explizites Erstellen des eigenen Staging-Dienstkontos und Setzen einer **datenbankbezogenen** IAM Condition. Keine Schlüssel, Datenbank, Deploys oder Kundenmails.
- `airtable-candidates.js`: ausdrücklich genehmigte synthetische Codes, **kein vollständiger Airtable-Scan**.
- `firestore-store.js`: fest verdrahtete benannte Staging-Datenbank und Collection.
- `.github/workflows/onboarding-notification-outbox.yml`: synthetische Offline-/HTTP-Integrations- und Docker-Build-Tests, ohne Push/Deploy.

## Nächste Entscheidungen und Grenzen

1. **Erledigt:** Für die Staging-Prüfung ist das dedizierte Outbox-Dienstkonto nach ausdrücklicher Ausführung durch den Geschäftsführer angelegt worden. Kein Service-Account-Key erzeugt.
2. **Policy eingerichtet; Wirksamkeit offen:** `roles/datastore.user` mit IAM-Bedingung `resource.name=="projects/lszh-automations/databases/lszh-offers-staging"`. Das ist **datenbankweit**, nicht collection-spezifisch. Projekt-Policy und mögliche zusätzliche Rollen mit read-only Skript prüfen. Vor Produktiveinsatz getrennte Datenbank.
3. Gegebenenfalls Cloud-Build-/Artifact-Registry- und Cloud-Run-Invoker-Rechte separat prüfen. Kein Admin-/Editor-Projektrollenpaket pauschal verleihen.
4. Private Cloud-Run-Testinstanz getrennt von bestehendem Angebotssystem erstellen und zuerst mit `LSZH_OUTBOX_STAGE_ENABLED=false` auf `/health` prüfen. Testcodes/Secrets nicht als Klartext im Repository oder Chat veröffentlichen.
5. **Nur** nach verifizierten synthetischen Airtable-Fixtures und ausdrücklicher Testfreigabe `LSZH_OUTBOX_STAGE_ENABLED=true` und einen **manuellen** Testlauf durchführen. Der Dienst legt höchstens einen gesperrten Firestore-Entwurf pro Fixture an. Kein Scheduler, kein Sendetransport.
6. Für spätere Produktivbenachrichtigungen erst getrennten Outbox-Consumer, echte E-Mail-Freigabe, Vertrags-/AVV-Gates, Zustandsautomaten und Provider-ID-Abgleich konzipieren. Make Szenario `7777695` und seine `0=1`-Kundenmail-Sperre unverändert lassen.

### Staging-Identität angelegt; IAM-Prüfung steht an

Am 16.10.2026 ausgeführt: Der Geschäftsführer hat in Google Cloud Shell `staging-identity-setup.sh --apply` ausgeführt. Rückgabe: `Created service account [lszh-onboarding-outbox-staging]` und `Updated IAM policy for project [lszh-automations]`. Kein Schlüssel, kein Firestore-Schreiben, kein Deployment.

**Jetzt ausschliesslich lesende Prüfung:**

```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-identity-verify.sh
```

Dieser Check verifiziert die aktive geschäftliche Identität, die benannte Zürcher Datenbank, den aktivierten Dienstkontonamen, den **exakt formulierten** projektspezifischen IAM-Binding `roles/datastore.user` mit `resource.name`-Bedingung und das Fehlen zusätzlicher Projektrollen sowie nutzerverwalteter Dienstkontoschlüssel. Im Fehlerfall **keine neue Rolle blind vergeben und `--apply` nicht erneut ausführen**; erst den konkreten Fehler prüfen.

**Grenze des Checks:** Projekt-IAM-Policy ist nicht dasselbe wie effektive REST-Berechtigung. Rollen von einer übergeordneten Organisation/einem Folder werden nicht angezeigt; Firestore-Rechte können erst nach einigen Minuten wirksam werden. Das benannte Dienstkonto wird später nur über einen privaten Cloud-Run-Testdienst mit dieser Identität für synthetische Datensätze geprüft. Noch **keine** Berechtigung auf eine bestimmte Collection beschränkt.

#### Nachweis der ursprünglichen Einrichtung


Ausschliesslich im bestehenden geschäftlichen Cloud-Shell-Klon:

```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-identity-setup.sh
```

Der ursprüngliche rein lesende Einrichtungsplan wurde durchgeführt; der nachfolgende `--apply`-Befehl wurde am 16.10.2026 vom Geschäftsführer bereits ausdrücklich ausgeführt. **Nicht wiederholen**, sofern keine gezielte Korrektur nötig ist. Der historische Einrichtungsbefehl war:

```bash
bash workers/onboarding-notifications/staging-identity-setup.sh --apply
```

Die IAM-Rolle wurde mit Bedingung auf die **existierende** `lszh-offers-staging`-Datenbank angelegt. **Diese IAM-Rolle umfasst alle Collections dieser Datenbank**, nicht nur die Benachrichtigungs-Collection. Bei Fehlern (z.B. fehlenden IAM-Berechtigungen) keine breitreichende Rolle als Workaround vergeben. Weiterhin kein Cloud-Run-Deployment und keine E-Mails.

## Vorbereitet: getrenntes privates Cloud-Run-Staging – weiterhin NICHT erstellt

Nachdem der Geschäftsführer das Dienstkonto, die Datenbankregion, den **exakten** Datenbank-IAM-Binding, das Fehlen zusätzlicher Projektrollen und das Fehlen von nutzerverwalteten Schlüsseln erfolgreich **lesend** geprüft hat, ist der nächste Schritt eine **separate, standardmässig deaktivierte** Cloud-Run-Instanz. Die tatsächliche Datenbankberechtigung und vererbte Rollen sind noch offen. Es gibt noch keinen Outbox-Service, kein Deployment, keine aktiven Scheduler und keine Sendefunktion.

Die neue Datei `staging-service.sh` hat **drei getrennte Modi**:

1. **Nur Plan/Preflight**, ohne Änderungen:
   ```bash
   cd ~/lszh-outbox-review
   git pull --ff-only
   bash workers/onboarding-notifications/staging-service.sh
   ```
   Überprüft geschäftliches Konto, Projekt, richtigen Git-Branch/Commit, sauberes Checkout, benannte Datenbank und vorhandene Container-Registry, Dienstkonto und **Abwesenheit** eines gleichnamigen Cloud-Run-Service.
2. **Image-Build und Upload** nur nach eigener Freigabe; kann Google-Cloud-Kosten verursachen:
   ```bash
   bash workers/onboarding-notifications/staging-service.sh --build-only
   ```
   Packt **ausschliesslich acht ausdrücklich geprüfte** Quelldateien in ein temporäres Verzeichnis (keine .git-, .env-, Dokumentations- oder Secret-Dateien). Erzeugt über Cloud Build ein nach Commit versioniertes Container-Image im **bestehenden** Container-Repository. **Kein Deployment.**
3. **Erst nach erfolgreichem Build eine neue, deaktivierte private Cloud-Run-Instanz**:
   ```bash
   bash workers/onboarding-notifications/staging-service.sh --deploy-disabled
   ```
   Führt `gcloud run deploy` ausschliesslich für den **neuen** Service `lszh-onboarding-outbox-staging` aus und bricht ab, falls der Name bereits vergeben ist. Bestehende Offer-/Archiv-Services werden nie verändert. Setzt `LSZH_OUTBOX_STAGE_ENABLED=false`, keine Airtable-PAT, keine Fixture-Codes, kein Control-Secret, kein Scheduler; daher kann `POST /internal/reconcile` keine Daten verarbeiten.
   
   Der Endpoint hat **Ingress `all`, aber Cloud-Run-IAM-Authentisierung ist erforderlich** (`--no-allow-unauthenticated`). Das ist *authentifiziert privat, nicht netzwerkintern*: Netzverkehr erreicht zwar die Cloud-Run-Kante, **unautorisierte** Besucher erhalten keinen API-Zugriff. Für spätere produktive Inter-Service-Aufrufe gegebenenfalls auf `internal` umstellen.
   
   Limitierungen: `min-instances=0`, `max-instances=1`, Concurrency 1, 256 MiB, Timeout 30 Sekunden. Je nach IAM/Billing können Cloud-Build, Container-Speicherung oder Cloud Run Gebühren verursachen. Bei einem Rechtefehler **keine pauschalen Editor-/Owner-Rechte** nachtragen; erst den Fehler prüfen.
4. **Rein lesender, authentifizierter Gesundheitscheck** nach einem solchen Deploy:
   ```bash
   bash workers/onboarding-notifications/staging-health-check.sh
   ```
   Prüft den Cloud-Run-Service, die Laufzeitidentität, die abgeschalteten Umgebungsvariablen und die fehlende öffentliche Invoker-Freigabe. Ruft nur `GET /health` mit einem temporären Identity Token der aktiven Cloud-Shell-Identität ab und verlangt `{"service":"lszh-onboarding-draft-outbox","enabled":false}`. Kein POST und keine Firestore-/Airtable-Abfrage. Falls `403`, nicht den Dienst öffentlich machen; Berechtigung `run.routes.invoke` für den eigenen Benutzer auf dem **einzelnen Service** prüfen.

**Wichtige Grenze:** Das Setup ist Staging und *ohne* Versandkomponenten. Ein grüner Healthcheck beweist, dass der deaktivierte Worker erreichbar ist, **nicht**, dass der Dienstkonto-IAM-Zugriff auf Firestore tatsächlich funktioniert. Ein synthetischer Datenbank-Schreibtest und der Versand bleiben separate, noch nicht freigegebene Schritte.

## Aktueller Folgecheck nach Deployment

Das isolierte Staging-Image wurde über Cloud Build `46e3293e-8b9b-44b1-b7ec-34dd330b3e44` erfolgreich erzeugt und in der bestehenden Artifact Registry gespeichert. `--deploy-disabled` wurde **erfolgreich** ausgeführt, wodurch der neue Cloud-Run-Dienst `lszh-onboarding-outbox-staging` in Zürich angelegt wurde. **Nicht erneut ausführen.** Der nächste Schritt ist ausschliesslich:

```bash
cd ~/lszh-outbox-review
bash workers/onboarding-notifications/staging-health-check.sh
```

Erwartung: Service-IAM ohne `allUsers`/`allAuthenticatedUsers`, Staging-Dienstkonto, `LSZH_OUTBOX_STAGE_ENABLED=false` und `GET /health` mit `enabled:false`. **Cloud Run kann Kosten verursachen**; min Instances 0. Keine Airtable-Credentials, keine Fixtures, keine Scheduler, keine E-Mails aktiviert. Bei `403` wegen fehlender Aufruferrechte **nicht** öffentlich schalten.

## Authentifizierter Cloud-Run-Gesundheitscheck: BESTANDEN

Der Geschäftsführer hat den **bereits bereitgestellten**, weiterhin deaktivierten Cloud-Run-Staging-Dienst lesend getestet. Bestätigte Resultate:
- `PASS: Cloud Run name, identity, ingress and disabled no-secret runtime environment.`
- `PASS: No allUsers/allAuthenticatedUsers entries in service IAM policy.`
- `PASS: Authenticated health returned enabled=false.`
- `PASS: Disabled private STAGING health check; no onboarding/Firestore/write path executed.`

Es wurde ausschliesslich ein authentifiziertes `GET /health` ausgeführt; der Worker führt weiterhin keine Aufträge aus, hat keine Airtable-Zugangsdaten und keine E-Mail-Funktion. Die Kontrolle deckt **nicht** geerbte IAM-Freigaben ab.
**Zusätzliche Sicherheit (neu, noch nicht ausgeführt):** `staging-health-check.sh` prüft bei der nächsten Ausführung auch einen **anonymen** `GET /health`-Aufruf. Nur HTTP 401/403 ist zulässig; HTTP 200 wäre ein Sicherheitsfehler und stoppt den Test. Damit wird die fehlende öffentliche Aufrufberechtigung auch am echten Endpoint geprüft, nicht nur anhand der direkten IAM-Richtlinie. Es bleibt ein ausschliesslich lesender Test.


### Als Nächstes: effektive Firestore-REST-Leseberechtigung separat prüfen

`staging-firestore-read-probe.sh` ist als **ausschliesslich lesender**, manuell zu genehmigender Test vorbereitet, mit Offline-Mocktests in GitHub Actions. Er benötigt **kein Deployment** und ändert keine Cloud-Run-Einstellungen.

Vorprüfung in der bestehenden Cloud Shell:
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-firestore-read-probe.sh
```

Das ruft **noch keine Firestore-REST-URL** auf, erstellt keine Zugangstokens und verändert nichts.

Wenn der Geschäftsführer danach selbst den einmaligen REST-Lesetest autorisiert, ist der separate Aufruf:
```bash
bash workers/onboarding-notifications/staging-firestore-read-probe.sh --probe-read
```

Der Test versucht zunächst, mit einer **kurzlebigen** und **nicht angezeigten** Dienstkonto-Identität zu arbeiten. Das erfordert bereits vorhandene Berechtigung `iam.serviceAccounts.getAccessToken` bzw. die auf das **einzelne Dienstkonto** beschränkte Token-Creator-Rolle und gegebenenfalls die aktivierte IAM-Credentials-API. Diese Rechte **nicht** unbesehen erstellen oder projektweit vergeben. Wenn Impersonation nicht möglich ist, endet das Skript mit `UNVERIFIED`; kein Workaround mit Editor/Owner.

Wenn die Token-Erzeugung erfolgreich ist, sendet es genau **zwei GET-Requests** an die Firestore-REST-API: zuerst nur Metadaten der benannten Datenbank `lszh-offers-staging` (erwartet HTTP 200), danach ein **absichtlich nicht angelegtes** Dokument der dedizierten Test-Collection `lszh_onboarding_notification_drafts_staging` (erwartet HTTP 404). Antwortinhalte und Tokens werden niemals ausgegeben oder gespeichert. **Keine Dokumente lesen, anlegen oder verändern**. 401/403/sonstige Ergebnisse werden nicht als bestanden behauptet.

Ein solcher PASS beweist einen technischen GET-Zugriff unter dieser Identität, aber **keine Firestore-Schreibberechtigung**, keinen echten Outbox-Lauf und keine Abwesenheit geerbter Berechtigungen. Dafür wären gesonderte, ausdrücklich freigegebene synthetische Tests notwendig. Die Firestore-Conditional-IAM-Syntax wurde mit der Google-Dokumentation abgeglichen.

## Impersonations-Test am 16.10.2026: NICHT NACHGEWIESEN

Der Geschäftsführer führte den getrennt freigegebenen Befehl `staging-firestore-read-probe.sh --probe-read` aus. Der Preflight für Konto, Ziel und Staging-Dienstkonto war erfolgreich. Die Ausgabe stoppte danach korrekt:

```
UNVERIFIED: Could not impersonate dedicated STAGING service account.
No IAM role changes were made.
```

**Wichtig:** Die zwei geplanten Firestore-GETs wurden **gar nicht** ausgeführt. Die Meldung betrifft den Versuch der Benutzeridentität, einen kurzlebigen Token für das Dienstkonto zu erzeugen. Sie belegt **keinen** Firestore-403 und keinen Cloud-Run-Fehler. Eine Ursache könnte sein, dass `iamcredentials.googleapis.com` nicht aktiviert ist oder dem Cloud-Shell-Benutzer die separate Berechtigung `iam.serviceAccounts.getAccessToken` fehlt. Die bereits erfolgreiche `--no-allow-unauthenticated`-Cloud-Run-Bereitstellung belegt nicht, dass der Benutzer auch Service-Account-Token erzeugen darf. **Keine** Editor-/Owner- oder projektweiten Token-Creator-Rechte als Workaround einrichten.

Neu hinzugefügt: `staging-impersonation-diagnostics.sh` (nur lesen; **erzeugt keine Tokens**) prüft den Status der IAM-Credentials-API und das Vorhandensein **direkter** Token-Creator-Bindings für den Geschäftsbenutzer auf dem einzelnen Dienstkonto bzw. dem Projekt. Es beurteilt weder Gruppen, geerbte Berechtigungen noch Custom Roles und ändert keinerlei Konfiguration.

```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-impersonation-diagnostics.sh
```

Alternative in Vorbereitung, ohne zusätzliche Token-Creator-Vergabe: eine **eigenständige, nur nach separater Freigabe zu erstellende und einmalig auszuführende** Cloud-Run-Job-Identitätsprobe. `firestore-runtime-probe.js` und `Dockerfile.firestore-probe` sind Entwürfe, **nicht** in der Cloud gebaut, deployt oder ausgeführt. Die Probe verwendet die an den Job angehängte bestehende Outbox-Dienstidentität und fragt ausschliesslich Firestore-Metadaten (GET 200) sowie einen festen nicht existierenden synthetischen Dokumentpfad (GET 404) ab; keine echten Datensatzantworten, Keys, E-Mails oder Schreiboperationen. Diese Cloud-Run-Job-Architektur vermeidet die Impersonationsberechtigung im Geschäftsbenutzerkonto, braucht aber eine eigene ausdrückliche Build-/Job-/Ausführungsentscheidung und kann Kosten auslösen.

Die laufende Cloud-Run-**Service**-Revision bleibt `00001-pz6` mit `enabled=false` und unveränderten Secrets/IAM-Konfigurationen; alle Produktions- und Mailfunktionen bleiben gesperrt.

## Einmaliger Cloud-Run-Job statt Benutzer-Impersonation: Bedienung (noch NICHT ausgeführt)

Die lesende Cloud-Shell-Diagnose bestätigte:
- `iamcredentials.googleapis.com` ist **aktiviert**.
- Für den Geschäftsbenutzer `lars@lszh-automations.ch` existiert **keine direkte Token-Creator-Rolle** am Ziel-Dienstkonto und keine direkte Token-Creator-Projektrolle.
- Rollen aus Gruppen/Custom Roles/Hierarchie wurden dabei nicht ausgeschlossen.
- Der manuelle Impersonations-Test blieb ohne Firestore-REST-Requests stehen. Keine zusätzliche IAM-Rolle vergeben.

Google Cloud Run Jobs können eine eigene Serviceidentität verwenden, deren kurzlebige Access Tokens innerhalb des laufenden Jobs vom Metadatenserver bezogen werden. Der bestehende Outbox-HTTP-Dienst wird dafür **nicht verändert**. Der separate, nur lesende Job basiert auf `firestore-runtime-probe.js` und `Dockerfile.firestore-probe`: genau zwei Firestore-GETs zu starren Zielen, kein Schreiben, kein Kunden-Datensatzinhalt, kein Mailversand. Eine einmalige Jobausführung kostet möglicherweise geringe Cloud-Run-Ressourcen.

**Der neue `staging-firestore-job.sh` erzwingt vier strikt getrennte Schritte**, unabhängig von `staging-service.sh`. Keiner wurde bisher in Google Cloud ausgeführt.

1. **Nur Prüfung, keine Änderungen (jetzt zulässig):**
   ```bash
   cd ~/lszh-outbox-review
   git pull --ff-only
   bash workers/onboarding-notifications/staging-firestore-job.sh
   ```
   Dieses Kommando bestätigt exakten Geschäftskonto-/Projekt-/Git-Zustand, benannte DB, Registry, Dienstkonto und dass noch kein gleichnamiger Probe-Job existiert. `PLAN ONLY` ist zwingend.
2. **Nur Image bauen und hochladen, nach separater bewusster Ausführung:**
   ```bash
   bash workers/onboarding-notifications/staging-firestore-job.sh --build-only
   ```
   Build-Archiv besteht ausschliesslich aus drei geprüften Dateien. Container wird in der bestehenden Artifact Registry unter dem geprüften Git-Commit getaggt. Kein Cloud-Run-Job wird angelegt/gestartet.
3. **Nur neuen Job anlegen, nach separater bewusster Ausführung:**
   ```bash
   bash workers/onboarding-notifications/staging-firestore-job.sh --create-only
   ```
   Legt nur einen neuen Job `lszh-firestore-read-probe-staging` mit dem bereits vorhandenen eingeschränkten Dienstkonto an. `--tasks=1`, `--max-retries=0`, feste Datenbank und Read-only-Flag, **keine automatische Ausführung**, kein Scheduler und keine Trigger. Ein bereits bestehender Job wird nicht überschrieben. Noch kein Firestore-GET.
4. **Einmaliger echter Firestore-Lesetest, nach separater bewusster Ausführung:**
   ```bash
   bash workers/onboarding-notifications/staging-firestore-job.sh --execute-once
   ```
   Das Skript prüft vor dem Ausführen nochmals Name, Container-Image, Service-Account, ausschliesslich die drei erwarteten Variablen, Task-Anzahl und Retry-Konfiguration. Dann genau eine `gcloud run jobs execute --wait`-Anforderung. Der Job selbst ruft ausschliesslich seine Metadatenidentität und die zwei definierten GETs auf. Ergebnis im Job-Log: erst `PASS: Named Zurich STAGING Firestore metadata GET 200.`, dann `PASS: Missing, fixed synthetic document GET 404.`. Bei `403`/Fehlern keine IAM-Rechte erweitern, sondern Ausführung untersuchen.

**Wichtig:** Der Job nutzt `roles/datastore.user` **nur in der bestehenden Staging-Datenbank**, wo diese Rolle alle Collections umfassen kann. Der Probe-Code greift aber ausdrücklich auf keinen bestehenden Offerten-Datensatz zu. Ein PASS bestätigt ausschliesslich die geprüften Leseoperationen, **nicht** die Schreibberechtigung oder sichere Isolation von geerbten Rollen. Es wird keine bestehende Outbox-Revisionskonfiguration verändert; insbesondere bleibt `LSZH_OUTBOX_STAGE_ENABLED=false` aktiv.

## Cloud-Run-Job-Fehler beim ersten Erstellen – korrigiert, keine Ausführung

Beim ausdrücklich gestarteten `--create-only` meldete Google Cloud am 16.10.2026:

```
Job failed to deploy
spec.template.spec.task_spec.containers[0].limits.memory:
Total memory < 512 Mi is not supported with gen2 execution environment
with cpu always allocated (unthrottled).
```

**Ursache:** Im Job-Deploy-Skript war für `1 CPU` versehentlich `--memory=256Mi` angegeben. Cloud Run Jobs verlangen mindestens **512 MiB**. **Korrektur:** `--memory=512Mi` in `staging-firestore-job.sh`, geprüft mit Offline-Tests. Bestehende Cloud-Run-Dienste und das Outbox-System wurden nicht geändert. Ein Job wurde laut der Fehlermeldung nicht erfolgreich deployed und **nicht ausgeführt**. Der genaue Ressourcenbestand wird beim nächsten Skriptlauf erneut lesend geprüft; falls ein Job trotz Fehlermeldung existiert, verweigert das Skript eine Überschreibung.

**Kein erneuter Build nötig:** Der Container selbst wurde vorher bereits erfolgreich unter `staging-49297f5b6cb0` gebaut (Cloud Build `609819f8-4597-4a6f-8779-0a23283df24c`, SUCCESS). Geändert wurde ausschliesslich das Betriebs-/Erstellungsskript, **nicht** `firestore-runtime-probe.js`, das Dockerfile oder die Cloud-Build-Definition. Der Deploy-Ablauf behält darum den **explizit festgelegten ursprünglichen Image-Tag**; ein Git-Diff prüft, dass die drei relevanten Quelldateien dem bereits gebauten Commit entsprechen. Ein versehentliches Überschreiben des Tags über `--build-only` wird abgewiesen.

**Nächster Schritt (erst nach grünem CI):**

```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-firestore-job.sh
```

Bei `PLAN ONLY` kann der Geschäftsführer separat erneut `--create-only` ausführen; das führt noch keine Firestore-Anfrage aus. **`--build-only` nicht erneut ausführen.**

## 16.10.2026 – Cloud-Run-Job angelegt, nicht ausgeführt

Der Geschäftsführer hat `staging-firestore-job.sh --create-only` nach der 512-MiB-Korrektur erfolgreich ausgeführt. Google Cloud meldet `Job [lszh-firestore-read-probe-staging] has successfully been created`, das Skript `PASS: New Cloud Run Job CREATED but NOT EXECUTED. No Firestore traffic.` Das bestehende Image `staging-49297f5b6cb0` wurde wiederverwendet. Das ist der **einzige neu angelegte Job**; bislang keine Firestore-Testoperationen und keine E-Mails.

**Jetzt niemals den Plan-/Build-/Create-Modus blind wiederholen:** `--plan`, `--build-only` und `--create-only` verweigern absichtlich einen bereits vorhandenen Job. Der einzig vorgesehene nächste Schritt ist die bewusst freizugebende, **einmalige Ausführung** mit `--execute-once`. Dieser Modus prüft zunächst die gespeicherte Jobkonfiguration auf exakt das freigegebene Image, das isolierte Servicekonto, die Testumgebung, einen Task und null Retries. Erst bei PASS wird der Job gestartet.

```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-firestore-job.sh --execute-once
```

Erwartet: `gcloud run jobs execute ... --wait`, dann separate Prüfung der tatsächlichen Job-Logs. Bei STOP/FAIL oder Cloud-Firestore-403 **keine** Rollen ausweiten und keine zweite Ausführung starten, sondern Fehlermeldung untersuchen. Dieser einmalige Test kann geringe Cloud-Kosten verursachen.

## 16.10.2026 – Laufzeit-Firestore-Leseprobe: PASS (tatsächliche Job-Logs verifiziert)

Ausführung: `lszh-firestore-read-probe-staging-s76jq`, Cloud Run Job `lszh-firestore-read-probe-staging` in `europe-west6`; Google Cloud meldete `1 / 1 complete`. Danach hat der Geschäftsführer die Ausführungslogs mit folgenden Zeilen geteilt:

```text
2026-10-16 22:01:33 PASS: Named Zurich STAGING Firestore metadata GET 200.
2026-10-16 22:01:33 PASS: Missing, fixed synthetic document GET 404.
2026-10-16 22:01:33 PASS: Cloud Run service identity effective Firestore READ probe successful.
2026-10-16 22:01:33 NO document body, personal data, token, customer info, write or email operation.
```

Ergebnis: Die dedizierte **Cloud-Run-Laufzeit-Serviceidentität besitzt wirksamen technischen Lesezugriff** auf die benannte Zürcher STAGING-Firestore-Datenbank. Kein userseitiges Service-Account-Impersonation-Token, kein JSON-Schlüssel, kein Firestore-Schreibzugriff und keine bestehenden Kundendaten ausgelesen. **Nicht erneut ausführen**: der Zweck dieser einmaligen Leseprobe ist erfüllt.

Verbleibende Sicherheitsgrenze: Der ausgeführte Probe-Job ist **nicht** der deaktivierte Outbox-HTTP-Dienst, nutzt jedoch dessen dediziertes Staging-Dienstkonto. Ein grüner GET-Test beweist **keine** Write-/Create-Berechtigung und **keinen** funktionsfähigen Onboarding-Prozess. Das HTTP-Outbox-Deployment bleibt bei `enabled=false` ohne Airtable-Credentials, Fixture-Codes oder Scheduler.

**Nächster ausnahmslos lesender Check:** `bash workers/onboarding-notifications/staging-health-check.sh` aus dem aktualisierten lokalen Git-Checkout. Er prüft nun zusätzlich explizit, dass anonyme Zugriffe auf den bestehenden Cloud-Run-Outbox-Dienst HTTP 401 oder 403 liefern, und bestätigt danach authentifiziert `enabled=false`. Die vorangegangene erfolgreiche authentifizierte Health-Prüfung lag vor der zusätzlichen anonymen Teststufe. **Ein anschliessender synthetischer Firestore-Schreibtest ist noch nicht freigegeben und nicht ausgeführt.**

## 17.10.2026: Anonymes HTTP 403 – PASS; synthetischer Firestore-Schreibtest vorbereitet (NICHT AUSGEFÜHRT)

Der erneute, vom Geschäftsführer ausgeführte Staging-Healthcheck bestätigte **anonym HTTP 403**, danach authentifiziert `enabled=false`, die dedizierte Staging-Identität und keine öffentlich freigegebenen Service-IAM-Members. Bestehender Outbox-Dienst unverändert und keine Onboarding-Verarbeitung.

**Ziel des nächsten Tests:** Die echte Firestore-`createOnce()`-Implementierung des Outbox-Workers (nicht eine vereinfachte zweite Schreibimplementierung) mit genau einem ausdrücklich **synthetischen** Draft testen.

- `firestore-write-probe.js`: fest kodiertes fiktives Record-ID `recZZZZZZZZZZZZZZ`, daraus SHA-256-Dokument-ID im vorhandenen Staging-Outbox-Pfad; prüft zuerst 404, führt über die reale `createOnce`-Routine höchstens einen POST-Create aus, GET/inhaltliche Rückprüfung von `DRAFT_NOT_SENT`, `testOnly=true`, `deliveryEnabled=false`, `emailSent=false`; DELETE **nur des gerade erstellten identischen Dokuments** mit `currentDocument.updateTime`-Versionsbedingung; erneutes GET erwartet 404. Keine vorhandenen Datensätze gelesen oder überschrieben, kein E-Mail-Code.
- **Bei unerwartet vorhandenem Dokument** sofortiger Abbruch vor POST. **Bei abweichendem Inhalt** nach Erstellung kein DELETE (manuelle Überprüfung). **Bei Abbruch nach POST kann eine Testfixture zurückbleiben; nicht blind erneut ausführen**.
- Der neue getrennte `Dockerfile.firestore-write-probe`-Container enthält nur sechs geprüfte Quelldateien (inkl. Original-Firestore-Store und Original-Outbox-Entwurfsformat). Die aktive Cloud-Run-Service-Revision wird nicht modifiziert.
- `staging-firestore-write-job.sh`: vier bewusst getrennte Modi, jeweils mit Geschäftskonto-/Staging-/Git-/Dienstkonto-Prüfung, Quellcodebindung an geprüften Commit `a20757439a34`, maximal ein Task, null Retries, 512 MiB. Vor einer `--execute-once`-Aktion wird auch überprüft, dass **keine frühere Jobausführung** vorliegt. Geplantes Job-Label `lszh-firestore-write-probe-staging`. Alle Cloud-Ressourcen für diesen **neuen** Test sind weiterhin **nicht** angelegt.

**Nur der erste Schritt ist derzeit sinnvoll (rein lesend):**
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-firestore-write-job.sh
```
Erwartet `PLAN ONLY`. **Kein `--build-only`, `--create-only` oder `--execute-once` ohne separate bewusste Entscheidung.** Ein nachfolgender Build bzw. ein Cloud-Run-Job kann Kosten verursachen. Ein tatsächlicher Schreibtest verändert ein einzelnes fiktives Dokument in der bestehenden benannten Staging-Datenbank und versucht es nach exakter Bestätigung wieder zu löschen. Er belegt erst nach Cloud-Logs PASS/FAIL.

Die Google Firestore REST API unterstützt Create/Get/Delete samt `currentDocument`-Precondition. Entscheidend ist, **niemals** die ganze Collection oder die benannte Datenbank zu löschen. Das Script weist Testidentität, Datenbank und Dokumentpfad fest zu und ermöglicht keine externen Parameter.

## 17.10.2026 – Schreibroutine: Firestore-RFC3339-Normalisierung vor dem Build korrigiert

Nach dem erfolgreich rein lesenden Schreibtest-Preflight entdeckte die Code-Review einen wichtigen Real-API-Randfall: Firestore liefert Timestamp-Werte RFC3339-Z-normalisiert zurück; ein ursprünglich gesendetes `.000Z` kann als `Z` oder `.000000Z` zurückkommen. Ein unveränderter strikter Stringvergleich hätte **nach einem erfolgreichen POST** einen falschen Fehler verursacht und zur Sicherheit die synthetische Fixture stehen gelassen. Dies wurde **vor einem Container-Build** im gesonderten `firestore-write-probe.js` behoben: Akzeptiert werden nur die präzisen UTC-Darstellungen des **identischen festgelegten Zeitpunkts** mit 0, 3, 6 oder 9 ausschliesslich nullwertigen Nachkommastellen. Alle übrigen Felder müssen weiter exakt übereinstimmen; ein abweichender Zeitpunkt oder eine Mikrosekundenänderung führt zum sicheren Abbruch ohne DELETE. Offline-Tests emulieren die realistischen Rückgabeformate.

**Geprüfter neuer Quell-Commit:** `a20757439a34`. `staging-firestore-write-job.sh` ist auf dieses Quell-Image fixiert und verweigert den Build, wenn sich die sechs verpackten Quelldateien gegenüber diesem Commit geändert haben. Das zuvor geprüfte **PLAN ONLY** für `staging-1502a6da6eed` bleibt korrekt, bezog sich aber auf eine ältere Test-Implementierung; **noch kein synthetisches Schreib-Image wurde gebaut, kein entsprechender Job wurde erstellt oder ausgeführt.**

Nach dem Pull zuerst **erneut nur**:
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-firestore-write-job.sh
```
Erst danach gesonderter `--build-only`-Befehl, sofern `PLAN ONLY` bestätigt. Kein `--create-only` oder `--execute-once` in diesem Schritt.

## 17.10.2026 – Einmalige synthetische Firestore-Schreibprobe: Job erfolgreich beendet, Logs noch prüfen

Nach bestätigtem Container-Build und separat bestätigter Erstellung des Jobs `lszh-firestore-write-probe-staging` führte der Geschäftsführer `staging-firestore-write-job.sh --execute-once` ausdrücklich aus. Der vorgeschaltete Job-Sicherheitscheck hat exakte Image-ID `staging-a20757439a34`, dediziertes Laufzeit-Dienstkonto, nur erlaubte synthetische Variablen, einen Task und null Retries mit PASS geprüft. Google Cloud meldete **`1 / 1 complete`** und **`Execution [lszh-firestore-write-probe-staging-cb7mm] has successfully completed.`** Der Job wurde nicht erneut ausgeführt. Kein bestehender Outbox-HTTP-Service oder Scheduler geändert, kein Versand ausgelöst.

**Erfolgslauf bestätigen:** Vor der endgültigen Bewertung bitte die Logs **dieser spezifischen Execution** rein lesend auswerten:
```bash
gcloud beta run jobs executions logs read lszh-firestore-write-probe-staging-cb7mm \
  --project=lszh-automations --region=europe-west6 --limit=50
```
Nur wenn sie die PASS-Zeilen zu vorherigem 404, erfolgreichem `createOnce`, exaktem Readback, versionsbedingtem DELETE und abschliessendem 404 enthalten, sind effektiver Firestore-Schreibzugriff und automatische synthetische Fixture-Bereinigung einzeln dokumentiert. Bei unklaren Logs nichts löschen oder nochmal laufen lassen; Zustand rein lesend überprüfen.

## 17.10.2026 – Keine Live-Fixture im CRM ohne Trigger-Risikoabklärung

Ein synthetischer Airtable-End-to-End-Test wird für **drei** verknüpfte Datensätze in `LSZH Automations – Website CRM` vorbereitet (Kunde → Auftrag → Onboarding). Die Live-Airtable-Konfiguration wurde read-only geprüft: **8 aktive von 9 Automationen**. Insbesondere erstellt das aktive Standard-Onboarding bei `Leistung=Automation-Projekt` automatisch **sechs** Projektaufgaben; zwei tägliche Rechnungs-Automationen erzeugen unter bestimmten fälligen Auftragsbedingungen Rechnungen. Make hat derzeit **zwei andere aktive** und **sieben LSZH-Onboarding-Szenarien, alle inaktiv**. Es wurden keine Szenarien oder Automationen verändert.

Die feste sichere Datensatzhülle wird in `synthetic-crm-fixture-gate.js` offline vor jeder etwaigen zukünftigen CRM-Erstellung validiert, etwa `Leistung=Beratung`, `Status=Pausiert`, `Abrechnungsmodell=Individuell`, keine Fakturierungstermine, alle Geldbeträge 0, `Standardaufgaben erstellt=true`, keine echte E-Mail-Adresse, keine behauptete Make-Einladung oder Freigabe. Das Live-Test-Projektcode-Token darf **nicht** das aus der Offline-Suite bekannte all-zero-Token sein; nur ein neues zufälliges `ob_<UUID4>` und nachgeprüfte Eindeutigkeit im CRM sind zulässig.

Die detaillierte Sicherheits-, Zwischenprüfungs- und Bereinigungsplanung steht in `docs/LSZH_AIRTABLE_E2E_FIXTURE_SAFETY_PLAN_20261017.md`. Das Guard-Modul hat **keinen** Airtable-Client, keine Netzwerkanbindung und **keine** Schreibfunktionen.

**Nicht freigegeben:** CRM-Testdaten anlegen, Automationen ausschalten/ändern, Cloud Run `enabled=true` setzen oder Make-/E-Mail-Szenarien aktivieren. Die Daten müssen bei einem späteren ausdrücklich genehmigten Test schrittweise einzeln mit unabhängigen Zwischenprüfungen angelegt werden. Ein CRM-Fixture-Plan allein ist noch kein durchgängiger Live-E2E-Nachweis.

## Wiederholbare Kontrollen

Im bestehenden Cloud-Shell-Klon (nur lesend):
```bash
cd ~/lszh-outbox-review
git pull --ff-only
bash workers/onboarding-notifications/staging-preflight.sh
```

Synthetische Tests:
```bash
node --test workers/onboarding-notifications/*.test.mjs
```

Diese Dokumentation und der Code bereiten die Staging-Integration vor, führen sie aber **nicht** aus.
