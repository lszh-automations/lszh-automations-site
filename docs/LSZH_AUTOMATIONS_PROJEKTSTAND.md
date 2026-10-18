# LSZH Automations – Projektstand & Betriebsentscheidungen

## 18.10.2026 – Feste Drive-Diagnosephasen: CI vollständig PASS, nur --check als nächster Schritt

**Bestand:** Der bisherige Cloud-Run-HTTP-503-Befund hat in Cloud Logging **nur** `ERROR / 503` mit leerem `TEXT_PAYLOAD` (00:11:18Z) geliefert. Ein eigenständiger Geschäftsbenutzer-Drive-Test hat anschliessend für **alle vier** Test-PDFs `PROVIDER_SHA256_MATCH` bestätigt; die Berechtigung/Fehlerphase **unter der temporären Cloud-Run-Identität** bleibt offen.

**Vorbereiteter Diagnose-Fix im Feature-Branch, nicht deployed:**
- `temporaryDriveProbe.mjs` ermittelt einen streng enumerierten Fehlschritt `FOLDER_API` / `FOLDER_VALIDATE` / `LIST_API` / `LIST_VALIDATE` / `PDF_YES_API` / `PDF_YES_INTEGRITY` / `PDF_NO_API` / `PDF_NO_INTEGRITY`. `index.mjs` protokolliert ausschliesslich bei zusätzlich eingeschaltetem `LSZH_OFFER_TEMP_DRIVE_DIAGNOSTICS_ENABLED=true` den festen Fehlercode `LSZH_TEMP_DRIVE_DIAG:...` (einschliesslich möglichem `TOKEN`). Keine rohen Google-Ausnahmen, Account-Tokens, Drive-Datei-IDs, PDF-Bytes oder Datei-Hashes in Log-/API-Antworten; nach aussen weiterhin HTTP 503 `not_available`.
- `scripts/offer-temp-drive-phase-release.sh` fixiert die tatsächlich bestehende **temporäre** Revision `00003-j2p`, das bekannte Image, die alte interne Preflight-Revision, isolierte Dienstidentität, geschäftlichen PDF-Test-Unterordner sowie dessen exakt vier Dateien und bereits vorhandene Reader-Berechtigung. Die read-only PDF-Ordnerprüfung ist **nicht mehr** an die frühere `00002`-Revision gekoppelt: Die neue Release-Vorprüfung lädt nur die **reinen Google-Drive-GET-Validierungsfunktionen** des ursprünglichen Grant-Skripts und überprüft die aktuelle Revision eigenständig. **Keinerlei neue Drive- oder IAM-Freigabe, Firestore-Änderung oder Produktionsdeployment.**
- Neue Tests mit expliziten Fehlerwerten für Ordner/Dateiliste/PDF-Prüfungen und gefälschten Geheimnissen, plus Deployment-/IAM-Sicherheitsgates. **GitHub Actions [39083531527](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39083531527) vollständig SUCCESS:** Funktionstests, Chromium, Firestore-Emulator und Docker-Build bestanden.

**Nächster Betreiberauftrag:** Den Release-Vorabtest mit `--check` gegen den geschäftlichen synthetischen Ordner auf Cloud Shell ausführen. **NICHT sofort `--apply` oder den bisherigen Probe-Smoke erneut starten**. Nach erfolgreichem Vorabtest kann eine ausdrücklich gewählte isolierte temporäre Phasendiagnose-Revision deployed werden; erst dann liefert ein neuer einmaliger Live-Probe einen sicher verwertbaren festen Logcode. Der bisherige Dienst `lszh-offer-browser-staging-00003-j2p` und der ursprüngliche Produktions-/Preflight-Dienst bleiben derzeit unverändert.

---


## 18.10.2026 – Cloud-Logging-503 ohne Fehlertext; Phasendiagnose vorbereitet (noch NICHT deployed)

**Echte Cloud-Shell-Logausgabe:** Für temporären Cloud-Run-Dienst `lszh-offer-browser-staging`, Revision `lszh-offer-browser-staging-00003-j2p`, zeigte der Nutzer **2026-10-18T00:11:18.366020Z**, `SEVERITY=ERROR`, `HTTP STATUS=503`, `TEXT_PAYLOAD` **leer**. Der letzte Test bestätigte zuvor die statische Vorschau (HTTP 200) und die alte Originaldienst-Preflight-Sicherheit. Das Log enthält **keinen beweiskräftigen Grund** für den Dienstkonto-Drive-Ausfall. NICHT als Beweis für unzureichende Cloud-IAM-/Drive-Berechtigungen deuten.

**Nur im Entwicklungsbranch umgesetzt, nicht auf GCP deployed:**
- `temporaryDriveProbe.mjs`: Opt-in-Callback `onDiagnostic` meldet beim **ersten** Fehlschlag genau eine der festen Kategorien `FOLDER_API`, `FOLDER_VALIDATE`, `LIST_API`, `LIST_VALIDATE`, `PDF_YES_API`, `PDF_YES_INTEGRITY`, `PDF_NO_API`, `PDF_NO_INTEGRITY`; kein Provider-Fehlertext und keine Dateinamen, -IDs, Hashes oder Zugriffstokens. Die PDF-Prüfung mit `sha256Checksum`, aktiver `contentRestrictions.readOnly`-Sperre, direktem Parent und vollständig berechnetem SHA bleibt **unverändert**; fail-closed.
- `index.mjs`: Neues *ausdrücklich zusätzlich erforderliches* Flag `LSZH_OFFER_TEMP_DRIVE_DIAGNOSTICS_ENABLED=true` aktiviert nur für den bestehenden temporären Drive-Probe-Test die Logging-Zeile `LSZH_TEMP_DRIVE_DIAG:<konstante Phase>`; bei Token-Fehler allein `LSZH_TEMP_DRIVE_DIAG:TOKEN`. Der HTTP-503-Body bleibt immer derselbe `{"error":"not_available"}`; keine Rohdaten/Stacks in Logs. Wird das Diagnoseflag ohne den isolierten Drive-Test gesetzt, lehnt die Konfiguration Start/Anfrage geschlossen ab.
- Negative Offline-Tests in `test/temporaryDriveProbe.test.js` prüfen unberechtigte Opt-ins, falsche Owner/Parents, zusätzliche Dateien, veränderte Hashes/Bytes und geworfene Provider-Fehler inklusive gefälschtem Secret – es wird **nur der erste feste Phasencode** berichtet.
- `scripts/offer-temp-drive-phase-release.sh --check|--apply FOLDER_ID` ist separat und gegen die **tatsächlich live bestehende** Revision `00003-j2p`, das dazugehörige Image, das **gleiche** Dienstkonto, dieselbe namentliche IAM-Invoker-Bindung und den synthetischen Geschäftstestordner gepinnt. `--check` ist ausschliesslich read-only. `--apply` baut/deployed erst nach Guard-Checks eine neue Revision ausschliesslich des temporären Testdienstes. Das echte `lszh-offer-portal-staging` und dessen Traffic/Ingress/IAM bleiben unverändert, Firestore/Make/Airtable/E-Mails und Vertragsabschluss bleiben weiterhin OFF.
- Die CI-Schutzprüfung verbietet IAM-Ausweitungen, ungeschützte Run-Deployments und Veröffentlichung von Zugriffs-/Dateidaten.

**Nächster Betreiber-Schritt:** Zuerst den schreibfreien `--check`-Befehl ausführen, danach einen ausdrücklich kontrollierten `--apply`-Test an der temporären Revision. Erst nach neuem Build/Deployment und genau **einem** IAM-geschützten GET `/_lszh/synthetic-drive-check` darf ein eingegrenzter Logphasen-Code aus Cloud Logging gelesen werden. Die Produktionsreife ist dadurch nicht erklärt; der reale E2E-Drive-Probe-Status bleibt **NO-GO**, bis vier synthetische PDFs direkt aus Cloud Run erfolgreich bestätigt sind.

---


## 18.10.2026 – Drive-Metadaten 4/4 MATCH; Cloud Run HTTP 503 bleibt offen

**Betreiber-Livenachweis:** Nach Korrektur des fehlenden X-Goog-User-Project-Headers hat der geschäftliche, rein lesende Drive-v3-Metadatenprüfer für alle vier synthetischen PDFs ausdrücklich PROVIDER_SHA256_MATCH sowie einen abschliessenden PASS gemeldet. Die von Google Drive gelieferten SHA-256-Metadaten stimmen mit den unabhängig ermittelten Hashes der vollständigen gespeicherten PDFs überein.

**Abgrenzung:** Die erfolgreichen Checks liefen mit der Geschäftskonto-Benutzeridentität, nicht mit dem temporären Cloud-Run-Dienstkonto. Dessen IAM-geschützter Read-only-Endpunkt hatte zuletzt HTTP 503 geliefert. Die interne Fehlerphase wird im bestehenden Handler absichtlich nicht an den Client geliefert und nicht geloggt. Weiterhin ungeklärt: dienstkontoseitige Drive-OAuth-Scopes, direkter Zugriffsstatus, Owner-/Folder-Listing-Sichtbarkeit und konkreter Drive-API-Fehler. Nicht erneut deployen, keine IAM-/Drive-Rechte erweitern und nicht die Hash- oder Inhaltssperrenprüfung lockern.

**Nächster Schritt:** Vorhandene Cloud-Run-Logs der exakten temporären Revision 00003-j2p ausschliesslich lesen. Falls keine ausreichenden Fehlersignale existieren, nur gezielte Fehlereingrenzung mit festen Phasencodes für einen später ausdrücklich freigegebenen isolierten temporären Test entwerfen. Keine Benutzertokens oder privaten Datei-IDs in öffentlichen Logs oder GitHub aufnehmen.

---


## 18.10.2026 – Drive-Metadaten-Diagnose mit HTTP 403; fehlender Quota-Project-Header korrigiert

**Echte Cloud-Shell-Ausgabe:** Der erste reine Geschäftsbenutzer-Drive-Metadatenaufruf aus `scripts/offer-business-drive-provider-sha-diagnose.py` lieferte `NO-GO: Google Drive metadata HTTP 403` und brach **vor einer inhaltlichen SHA-256-Aussage** ab. Diese Antwort beweist weder einen fehlenden Hash noch veränderte PDFs noch den Grund für das separate Cloud-Run-HTTP-503.

**Konkreter Quellcode-Unterschied gefunden:** Der zuvor erfolgreiche Geschäftsbenutzer-Drive-v3-Prüfer `scripts/offer-business-drive-readonly-verify.py` hatte in jedem Google-API-Aufruf `X-Goog-User-Project: lszh-automations` gesetzt. Der neue `offer-business-drive-provider-sha-diagnose.py` hatte diesen Quota-Project-Header bei `files.get` **ausgelassen**. Dies ist eine plausible Erklärung für den 403, aber noch **nicht** als wahre Serverfehlerursache erwiesen. Ausschliesslich im read-only-Diagnose-Skript wurde dieser Header ergänzt; der Selbsttest prüft seine Beibehaltung. Keine erneute Benutzeranmeldung, keine zusätzlichen IAM-/Drive-Rechte, kein Cloud-Run-Deployment.

**Nächster Test:** Vorhandenen Diagnoselauf mit unveränderten vier echten Test-PDF-Datei-IDs, Dateigrössen und *post-upload*-SHA-256 erneut durchführen und auf `PROVIDER_SHA256_MATCH` oder `...MISSING/DIFFERS` prüfen. Falls weiter 403: vor weiteren Aktionen den **anonymisierten Google-API-Fehlergrund** untersuchen und erst dann die Autorisierung abklären. Die frühere Archiv-Sperren-/Byte-Integritätsprüfung (4/4 PASS) und die zeitgleich unveränderte ursprüngliche interne Cloud-Run-Revision bleiben bestehen. Temporärer Cloud-Run→Drive-Livesmoketest bleibt bis jetzt **NO-GO**.

---


## 18.10.2026 – Cloud Run→Google Drive Live-Lesetest NO-GO (HTTP 503); keinerlei weitere IAM-/Deploy-Änderung

**Echte Cloud-Shell-Betreiber-Ausgabe** nach Test `scripts/offer-temp-drive-probe-smoke.sh` gegen temporären Dienst Revision `lszh-offer-browser-staging-00003-j2p`:
- `PASS: preflight revision, ingress and service identity unchanged`; Original `lszh-offer-portal-staging` nach dem begleitenden Read-only-Guard unverändert.
- `PASS: exact temporary revision, business IAM invoker, read-only Drive test and disabled full portal`.
- `PASS: authenticated Cloud Run design preview still HTTP 200 and strictly static`.
- **`NO-GO: authenticated Cloud Run -> Drive returned HTTP 503 (expected 200)`**. Der neue temporäre Endpunkt konnte die 4-Datei-Drive-Verifikation **nicht erfolgreich** abschliessen; er gibt aus Sicherheitsgründen absichtlich keine interne Ursache im HTTP-Body oder in normalen Application-Logs aus.
- Der betriebliche Scriptlauf hat bei 503 wie vorgesehen **abgebrochen**, ohne weitere IAM-Freigabe, ohne Cloud-Run-Update, ohne Firestore-Schreibzugriff, ohne Mailversand und ohne Annahme. Die nachgelagerte gesonderte Prüfung aller gesperrten Vertrags-/PDF-API-Routen wurde nicht ausgeführt und darf daher für diese Revision **noch nicht** als erneut bestanden markiert werden.

**Ursache offen, 503 allein beweist keinen Berechtigungsfehler.** Enger Verdacht aus Quellcode: `cloud-run/archive-reader-staging/archiveBundleVerifier.mjs` verlangt **sowohl** tatsächlich berechneten Byte-SHA256 **als auch** das vom Google-Drive-v3-Metadatenfeld `sha256Checksum` gelieferte SHA256. Der vorige Geschäftsbenutzer-Prüfer `scripts/offer-business-drive-readonly-verify.py` hat zwar die vollständigen gespeicherten Bytes, direkten Parent, Content-Lock und Owner verifiziert, aber explizit **nicht** das Drive-eigene `sha256Checksum` abgefragt. Auch GCP-Servicekonto-Token-Scope, Drive-API-Fehler, Folder-Listing oder Owners-Visibility kommen als Ursache in Frage. Keine IAM- oder Prüfungsabschwächung aufgrund einer Hypothese.

**Neue, rein lesende Diagnose im Feature-Branch:** `scripts/offer-business-drive-provider-sha-diagnose.py --folder <synthetische-Test-Unterordner-ID> --file ID,SIZE,SHA256` für exakt 4 PDF-Dateien. Es nutzt ausschliesslich die bereits funktionierende geschäftliche **Nutzeridentität**, fragt Googles Drive-v3-`files.get`-Metadaten inklusive `sha256Checksum` und `contentRestrictions.readOnly` ab, vergleicht mit den zuvor unabhängig verifizierten gespeicherten SHA256 und gibt **nur** die Statusklassen MATCH/MISSING/DIFFERS bzw. Sperr-/Ordnerfehler aus (keine Tokens, Hash-Werte oder Datei-IDs). Offline-Selbsttests in GitHub CI. **Kein Dienstkonto-Token, keine Cloud-Mutation.** Erst nach diesem Ergebnis nächsten Diagnoseschritt entscheiden; falls 4/4 MATCH, SA-OAuth-/Service-Laufzeit-Fehler isoliert analysieren, ohne IAM auszuweiten. Original- und Temp-Cloud-Run-Dienste bleiben vorerst auf bestehenden Revisionen.

---


## 18.10.2026 – Temporäre Cloud-Run→Drive-Read-only-Prüfrevision real deployed, Live-Smoke ausstehend

**Vom Betreiber bestätigtes echtes Deployment:**
- Cloud Build `6f120cbf-3823-42c3-8169-8d8c970ca8de`: **SUCCESS**, nur synthetisches Temp-Browser-Image `europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-offer-browser-staging:c19d8bb0f514`, Digest `sha256:3747022c092b074f27997838436a34ce1eeb52a7838fa11c36313bd2e73b3755`.
- **Einzige** aktualisierte Cloud-Run-Instanz: `lszh-offer-browser-staging`, neue Revision **`lszh-offer-browser-staging-00003-j2p`**, 100 % Traffic ausschliesslich auf diesem TEMP-Testservice, Dienstkonto `lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com`. Einmaliger rein lesender Probe-Endpunkt `GET /_lszh/synthetic-drive-check` zusätzlich zur weiterhin statischen Designvorschau; keine kundenspezifischen Offer-/PDF-/Accept-Endpoints.
- Deploy-Sicherheitsgates erfolgreich: Original-Preflight-Revision, Ingress und Dienstidentität **vor und nach** unverändert; kein direkter öffentlicher IAM-Binding nachgewiesen (geerbte IAM-Rollen nicht abschliessend geprüft); die individuelle Geschäfts-Drive-Reader-Berechtigung war bereits vorhanden, keine zweite Erteilung. Keine Firestore-, Vertrags-, E-Mail- oder Kundendatenänderungen.

**Technischer Stand:** Ein erfolgreicher Cloud Build/Deploy ist **noch kein Nachweis**, dass der temporäre Cloud-Run-Dienst unter seiner eigenen Identität tatsächlich die vier `readOnly=true`-PDFs aus dem Geschäftskonto lesen und mit SHA256 verifizieren kann. Diese Live-Prüfung ist der einzige nächste Schritt.

**Neu, ausschliesslich READ-ONLY:** `scripts/offer-temp-drive-probe-smoke.sh` für den Betreiber in Google Cloud Shell: prüft vor und nach dem Test das alte interne Cloud-Run-Sicherheitsbaseline, die ganz bestimmte neue temporäre Revision `00003-j2p`, Image, Dienstkonto, Flags `LSZH_PORTAL_STAGING_ENABLED=false`, `LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED=true`, `LSZH_OFFER_TEMP_DRIVE_PROBE_ENABLED=true`, Testordner, namentlich authentifizierten IAM-Invoker und keine direkten anonymen Bindings. Über `gcloud run services proxy` (keine Tokens in der Konsole) erwartet es statische Demo `GET /offerte-annehmen/?demo=1` -> 200 mit strikter CSP; Google Drive aus dem Cloud-Run-Dienstkonto `GET /_lszh/synthetic-drive-check` -> 200 mit ausschliesslich `{"status":"PASS_SYNTHETIC_ARCHIVE_READ_ONLY","verifiedFiles":4}`; alle Token-/Offer-/PDF-/Accept-GETs und alle relevanten POSTs müssen weiterhin 503 ergeben. Bei fehlendem Drive-Zugriff bricht das Skript mit NO-GO ab, ohne Rollen auszuweiten oder wiederholt zu deployen. Aktualisierte CI überprüft die schreibfreie Shell-Datei und Negativkontrollen.
- Insbesondere `scripts/offer-browser-static-demo-smoke.sh` ist **nicht** für die neue Revision geeignet, weil es auf die ältere `00002-fkq` gepinnt ist. Nur das neue Script verwenden.

**Ausstehend nach Live-Smoke:** Falls Live PASS: Dienstkonto→Geschäfts-Drive-Integration als **rein synthetischer, read-only** Meilenstein abgeschlossen; weitere Staging-Firestore-Datensatzprüfung, Annahme-Freigabe und Kundenbetrieb gesondert, keine automatische Aktivierung. Falls NO-GO: Nur Diagnose, keine IAM- oder Staging-Freigaben ohne engere Prüfung. Main nicht gemergt, Originalservice unverändert.

---


## 18.10.2026 – Temporäre Drive-Reader-Freigabe LIVE bestätigt; Cloud-Run-Leseprobe vorbereitet

**Live-Ergebnis vom Betreiber:**
- `scripts/offer-temp-drive-folder-reader.py --apply` hat **SUCCESS** für genau **eine** neue `reader`-Freigabe auf dem isolierten Geschäfts-Unterordner `LSZH_SYNTHETIC_OFFER_PDFS_20261018_NO_CONTRACT` an `lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com` zurückgemeldet. Keine Benachrichtigungsmail.
- Die Drive-Verbindung `LSZHA` wurde danach erneut **nur lesend** gefragt: Ordner-Owner weiterhin Geschäftskonto `lars@lszh-automations.ch`, unmittelbar unter bestehendem Geschäftsstagingarchiv; die neue einzelne `reader`-Permission des temporären Dienstkontos ist **sichtbar vorhanden**. Bisherige `reader`-Permissions am Archivreader/Originalportal unverändert.
- Das Skript meldete nach Freigabe erneut `PASS: preflight revision, ingress and service identity unchanged` und `PASS: original internal preflight and temporary static demo unchanged`. Kein neues Cloud-Run-Deployment, keine Firestore-/Mail- oder Vertragsaktion.

**Entwicklungsfortschritt – noch NICHT LIVE deployt:**
- Neues `cloud-run/offer-portal-staging/temporaryDriveProbe.mjs`: exakte, rein synthetische Test-Unterordner-ID und die vier **unabhängig nach Upload bestätigten vollen** SHA-256-Hashes ausschliesslich über temporäre Run-Konfiguration. Cloud-Run-Dienstkonto holt Google-Drive-`readonly`-Zugriffstoken ohne Schlüsseldatei; Ordner-Metadaten (Name, Geschäftsowner, direkter Parent), genau vier PDF-Dateinamen, MIME und Position werden überprüft. Unser unveränderter `verifyArchiveBundle` prüft für AVV Ja/Nein dieselben vier Dateien, Drive-`sha256Checksum`, `contentRestrictions.readOnly=true`, unmittelbare Elternordner sowie tatsächlich heruntergeladene vollständige PDF-Bytes. Keine Nutzung echter Kundendaten.
- Ergänztes `temporaryBrowserDemo.mjs`: Optionaler IAM-geschützter **GET `/_lszh/synthetic-drive-check`**, dessen einzige erfolgreiche Antwort `PASS_SYNTHETIC_ARCHIVE_READ_ONLY / verifiedFiles=4` enthält. Keine Dateinamen, IDs, PDFs, Empfänger, Access-Tokens oder Hashes in HTTP-Antworten. Alle übrigen Offer-/PDF-/Accept-APIs bleiben HTTP 503, die vorhandene unverbindliche Demo bleibt gleich. Optionaler Check ist standardmässig AUS und nur bei `LSZH_PORTAL_STAGING_ENABLED=false` plus `LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED=true` und exakter temporärer Runtime-Identität einschaltbar.
- `scripts/offer-temp-drive-probe-release.sh --check|--apply FOLDER_ID` kontrolliert vor Deploy die bisherige geschützte Originalrevision und temporäre Demo-Revision `00002-fkq`, namentliche IAM-Invoker-Rolle und das exakte Geschäfts-Unterverzeichnis mit **vier** fiktiven PDFs; keine IAM-Freigaben nötig. Erst `--apply` baut ein neues Container-Image und aktualisiert ausschliesslich den **bereits bestehenden** temporären Browser-Dienst. Keine Firestore-Rollen, keine Vertragsaktion, keine E-Mail.
- Neue Offline-Regressionsfälle in `test/temporaryDriveProbe.test.js` und `test/offerBrowserCloudScript.test.js`: falscher Geschäftsowner oder Parent, zusätzliche PDFs, veränderte Bytes, entsperrte Dateien, ungültige Drive-SHA-Checks, nicht autorisierte POSTs und API-Pfade bleiben gesperrt; falsche Service-/Demo-Konfiguration schaltet nie den Probezugriff ein.

**Weiterhin offen:** Zunächst vollständige CI-Abnahme, danach Operator-Entscheidung/Ausführung des neuen temporären Deployments. Der eigentliche Google-Cloud-Run→Google-Drive-Test ist **noch nicht** live durchgeführt. Firestore/Staging-Eintrag, Annahme, Belege und E-Mails bleiben gesondert ausstehend. Die privaten echten Drive-Datei-IDs wurden **nicht** im öffentlichen GitHub-Projekt abgelegt.

---



## 18.10.2026 – Temporäres Dienstkonto: minimaler Geschäfts-Drive-Reader vorbereitet, noch NICHT erteilt

**Neu im Entwicklungsbranch:** `scripts/offer-temp-drive-folder-reader.py --folder <Testunterordner-ID> --check|--apply`.
- Vor jeder Aktion prüft das Skript ausschliesslich lesend den ursprünglichen internen Cloud-Run-Preflight und die **exakte** geschützte temporäre Demo-Revision `lszh-offer-browser-staging-00002-fkq`, aktives Demo-only-Flag, deaktiviertes vollständiges Portal sowie die erwartete temporäre Dienstidentität. Es verlangt einen namentlich angemeldeten **geschäftlichen** Benutzer `lars@lszh-automations.ch`; kein Privatkonto, kein Service-Account-Key.
- Über die offizielle Drive-v3-API kontrolliert es den **exakten leeren-früheren, nun vierteiligen** Test-Unterordnernamen, dessen direktes geschäftliches Elternarchiv, den geschäftlichen Alleineigentümer, keine öffentlichen/Domain-Permissions und **genau die vier vorgesehenen, fiktiven PDF-Dateinamen**. Eine fremde, veränderte oder überfüllte Ablage führt NO-GO.
- `--check` ist vollständig read-only. `--apply` darf **nur wenn alle Vorbedingungen stimmen** exakt eine `Drive permissions.create`-Operation durchführen: `role=reader`, `type=user`, Ziel `lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com`, **nur auf dem synthetischen Unterordner**, `sendNotificationEmail=false`. Das Stammarchiv, Kundenordner, der ursprüngliche Archivreader, projektweite IAM-Rollen, Firestore, Mail und Cloud-Run-Deploy bleiben unverändert. Danach wird die neue Permission durch Drive-v3 gelesen und der alte interne Cloud-Run-Sicherheitszustand erneut geprüft.
- Zusätzliche Offline-Tests im bestehenden GitHub-CI prüfen gefälschte Zielordner, falschen Parent/Eigentümer, öffentliche Freigaben, zu weitreichende Rollen, andere Datei-Sets, fehlgeleitete PDF-Parents und ausgeschaltete Benachrichtigungen. Keine echte Berechtigung wurde über CI vergeben.

**Noch offen:** Der Betreiber muss den gezielten `--apply`-Befehl im eigenen Cloud Shell aktiv ausführen und die Rückgabe bestätigen. Erst dann darf der tatsächliche Cloud-Run-Service-Account-Drive-Lesetest vorbereitet werden. Die erfolgreiche statische Demo selbst hat **weiterhin keinen Drive-Zugriff und alle PDF-/Vertrags-APIs bleiben deaktiviert**; auch eine Reader-Berechtigung allein aktiviert keine Funktion.

---



## 18.10.2026 – Synthetisches Geschäfts-Drive-Archiv: vier Sperr-/Hash-Prüfungen unabhängig PASS

**Echter Cloud-Shell-Prüfbericht des Betreibers:** `scripts/offer-business-drive-readonly-verify.py` wurde unter der Geschäftsidentität `lars@lszh-automations.ch` ausgeführt und meldet **genau vier PASS** (AVV-Ja-Offerte, AVV-Nein-Offerte, Projektbedingungen, AVV) sowie abschliessend `SUCCESS: all four business-Drive PDFs locked and byte-verified.`

**Jede Datei live über Google Drive v3 bestätigt:** `contentRestrictions.readOnly=true`, Eigentümer `lars@lszh-automations.ch`, unmittelbarer Parent = ausschliesslich geschäftlicher isolierter synthetischer PDF-Test-Unterordner, erwartete Grösse und bytegenauer SHA-256 der **vollständigen bei Drive liegenden PDF-Datei** (einschliesslich C2PA-Anhang bei drei Dateien); keine direkte öffentliche Dateiberechtigung im Prüfer. **Archiv-Sicherheitsprüfung der vier synthetischen PDFs PASS**. Die Drive-Inhaltssperre ist reversibel und kein dauerhaftes WORM.

**Nächster Meilenstein:** Nur den separaten geschäftlichen Test-Unterordner (nicht den Root-Archivordner) dem *temporären* Cloud-Run-Dienstkonto `lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com` mit Google-Drive-`reader` freigeben und die tatsächlich erhaltene Berechtigung nachprüfen. Dies gewährt **keine** Cloud-IAM-/Firestore-Rollen und schaltet **keine** API ein. Die statische Browser-Demo `lszh-offer-browser-staging-00002-fkq` bleibt in ihrem geschützten Demo-only-Modus, alle PDF-/Annahme-POSTs weiterhin HTTP 503. Der interne Originaldienst `lszh-offer-portal-staging`, dessen IAM/Ingress/Traffic, produktive Daten und E-Mail/Vertragsabläufe bleiben unverändert.

**Abgrenzung:** Die vier Unterlagen sind archivseitig freigegeben, jedoch ist ein **Cloud-Run-Dienstkonto→Drive-End-to-End-Test noch nicht durchgeführt**. Vor diesem Test ist die Reader-Rolle und ein eigener isolierter Lesetest nachzuweisen, ohne die rechtliche Annahme oder produktive Datenverarbeitung zu öffnen. Detail-Gate: `docs/LSZH_SYNTHETIC_PDF_DRIVE_GATE_20261018.md`.

---


## 18.10.2026 – Alle 4 Geschäfts-Drive-Test-PDFs vom Betreiber gesperrt; vollständige Bytes nachgeprüft

**Betreiber-Rückmeldung:** «alle sind geperrt, vamos»; betrifft ausschliesslich die 4 synthetischen PDFs im geschäftlichen Testordner `LSZH_SYNTHETIC_OFFER_PDFS_20261018_NO_CONTRACT`.

**Erneute LIVE-Verifikation über die geschäftliche Drive-Verbindung (`lars@lszh-automations.ch`):**
- Alle 4 bekannten, ausschliesslich synthetischen Dateien erneut per Drive `files.get`-Connector kontrolliert: exakte Datei-IDs, unveränderte Namen, `application/pdf`, Eigentümer `lars@lszh-automations.ch`, unmittelbarer Elternordner exakt der nur für Tests eingerichtete Geschäfts-Unterordner; keine direkten öffentlichen `anyone`- oder Domain-Freigaben.
- Alle 4 Binärdateien erneut vollständig aus dem **geschäftlichen** Drive heruntergeladen, lokal mit SHA-256 überprüft und **gegen den vorigen privaten Auditbericht bestanden (4/4 PASS)**. Stored hashes sind stabil: AVV Ja: `2dd5c537...` (1'802 B), AVV Nein: `1c337295...` (26'676 B), Projektbedingungen: `baec0946...` (26'544 B), AVV: `53f9deda...` (26'555 B). Drei PDFs enthalten weiterhin den bekannten C2PA-Nachtrag. **Keine** Original-Fixture-Hashes als aktuelle Cloud-Hashes verwenden.
- **Einzige noch offene Archiv-Abnahme:** Unser Google-Drive-Connector zeigt das `contentRestrictions.readOnly`-Feld auch bei gezielter Anfrage nicht an. Die **Nutzerbestätigung** der Sperren ist notiert, aber wir geben vor einer echten Cloud-Archiv-PASS-Aussage keinen erfundenen unabhängigen Nachweis vor.

**Neu:** `scripts/offer-business-drive-readonly-verify.py` führt mit Google-Cloud-Shell-Benutzer-OAuth (nur beim Betreiber, ohne Token-Ausgabe) für **genau vier vom Betreiber übergebene Datei-IDs** die offizielle Google-Drive-API-`files.get`-Prüfung inklusive `contentRestrictions.readOnly=true`, exaktem Parent, Business-Owner, MIME, Grösse, keiner öffentlichen direkten Permission und echtem `alt=media`-Download mit SHA-256 durch. Fail-closed, **keine** Google-Drive-/IAM-/Cloud-Run-/Firestore-Schreibaktion. Eingabedatei-IDs/Hashes bleiben ausschliesslich im privaten Chat-Audit/Cloud-Shell-Aufruf, nicht im öffentlichen GitHub. Mit `--self-test` reproduzierbare Offline-Negativtests in bestehender GitHub-CI. Falls Cloud-Shell-`gcloud` nicht über Drive-OAuth verfügt, ist dafür eine **Benutzerzustimmung** mittels `gcloud auth login lars@lszh-automations.ch --enable-gdrive-access` erforderlich (offizielle Google-Dokumentation); keine Service-Account-Keys.

**Privater Auditbericht v2:** `LSZH_Business_Drive_Testpdf_Audit_20261018_v2.json`, 4 erneut PASS, `contentLockReportedByOperator=true`, aber bis zum API-Nachweis `readOnlyContentRestrictionsVerified=false` und `archiveVerified=false`. Weiterhin **kein temporärer Cloud-Run-Drive-Zugriff, kein Firestore-Cloud-Seed, keine Annahme/Email, kein Deployment oder Produktionsänderung**.

---


## 18.10.2026 – Vier synthetische PDFs in geschäftliches Google Drive geladen; Archivfreigabe NO-GO bis Schreibsperre

**Ausgeführt und live verifiziert:** Vier lokal hash-geprüfte, ausschliesslich synthetische PDFs (Offerte AVV Ja, Offerte AVV Nein, fiktive Projektbedingungen, fiktive AVV) wurden in den zuvor **leer geprüften, separaten** Geschäfts-Unterordner `LSZH_SYNTHETIC_OFFER_PDFS_20261018_NO_CONTRACT` innerhalb des Geschäftsstagingarchivs hochgeladen. Ausschliesslich die ausdrücklich ausgewählte **LSZHA-Geschäftsverbindung** wurde verwendet; keine privaten Ordner oder Dateien. Alle vier zurückgegebenen Google-Drive-Datei-IDs wurden einzeln über `get_file_metadata` kontrolliert: Eigentümer `lars@lszh-automations.ch`, MIME `application/pdf`, exakt derselbe unmittelbare Elternordner, keine `anyone`-/Domain-Freigabe. Abschliessende `list_folder`-Prüfung bestätigt **genau diese vier Dateien**. Kein Upload in einen produktiven Unterordner.

**Wichtiger Integritätsbefund:** Nach dem Upload wurden die vier PDFs mit der **geschäftlichen** Drive-Verbindung als vollständige Binärdateien zurückgelesen und ihre **tatsächlich gespeicherten Bytes** in der Arbeitsumgebung erneut mittels SHA-256 berechnet. Nur die Offerte AVV Ja ist exakt mit den Ausgangsbytes identisch (**1'802 Bytes**). Bei den drei übrigen wurden die ursprünglichen PDF-Bytes **unverändert am Anfang** wiedergefunden, gefolgt von einem zusätzlichen ca. **24'863-Byte-Anhang für PDF-Content-Credentials (C2PA)**; die vollständigen, weiterhin jeweils einseitig gültigen PDFs sind deshalb 26'676 / 26'544 / 26'555 Bytes gross und haben **andere** SHA-256-Hashes als das lokale Source-Manifest. Das muss beim zukünftigen Archive-Verification-Bundle zwingend berücksichtigt werden. Die ursprünglichen Hashes **nicht** als Hashes der gespeicherten Drive-Dateien ausgeben; die Quelle der Zusatzbytes nicht ohne Nachweis dem Google-Drive-Dienst selbst zuschreiben. Die Original-Testfixturen in GitHub bleiben unverändert.

**Private Auditspur:** Ein detaillierter dateispezifischer Bericht inkl. der tatsächlichen Cloud-Datei-IDs, Ursprungs- und gespeicherten SHA-256-Werten wurde ausschliesslich als privates Chat-Artefakt `LSZH_Business_Drive_Testpdf_Audit_20261018.json` erstellt; **keine Google-Datei-IDs oder private Account-Metadaten in GitHub-Commit aufgenommen**. Alle vier Dateien sind hochgeladen, aber **`archiveVerified=false` / `contentRestrictionsReadOnlyVerified=false`**: Die gegenwärtig verfügbaren Drive-Connector-Aktionen können `contentRestrictions.readOnly` nicht setzen/verlässlich ausgeben. Der bestehende `archiveBundleVerifier.mjs` verlangt diese Sperre und bytegenaue tatsächliche SHA-256, daher darf die Live-Archiv-Verifikation **noch nicht** als PASS gelten.

**Offen vor Cloud-E2E:** 1) Für genau die vier Testdateien die Drive-Content-Read-only-Restriktion nachweislich setzen, 2) die gesperrten Bytes nach der Änderung erneut vollständig aus Geschäftskonto lesen und ihre finalen SHA-256 gegen die Testmanifest-Referenzen verifizieren, 3) gezielten minimalen Testordner-Lesezugriff für das separate temporäre Cloud-Run-Dienstkonto prüfen und ggf. genehmigen, 4) isolierten, strikt synthetischen Firestore-Testdatensatz und Browser-Preview nur mit `acceptEnabled=false` vorbereiten. **Keine** Cloud-Run- oder Firestore-Änderung, keine E-Mail, kein rechtsverbindlicher Vertrag durchgeführt. Der aktuelle temporäre Design-Demo-Dienst und ursprüngliche interne Preflight bleiben unverändert.

---


## 18.10.2026 – Geschäftliches Google Drive VERBUNDEN und Test-Unterordner erstellt

**Geschäftsführerentscheidung** bleibt: LSZH-Dokumente ausschliesslich im geschäftlichen Google Drive, keine neuen privaten Uploads/Archive.

**Live verifiziert (Geschäftsverbindung `LSZHA`):**
- `get_profile` bestätigt **`lars@lszh-automations.ch`**. Die zuvor verwendete private Standardverbindung ist weiterhin separat vorhanden, wird für LSZH weder lesend noch schreibend benutzt.
- Bereits vorhandener **geschäftlicher** Staging-Hauptordner `LSZH Automations Vertragsarchiv – STAGING – Geschäftskonto` ist mit `STAGING.archiveFolderId` im bestehenden Code **exakt identisch**. Owner laut Drive-API = geschäftliches Konto; vorbestehende Reader-Rollen an Archivreader und internem Portal-Dienst wurden kontrolliert. **Kein Austausch der bisherigen Konfigurations-ID erforderlich.** Der 404 aus dem privaten Konto war nur eine Identitäts-/Sichtbarkeitsabweichung.
- Bereits vorhandene geschäftliche Unterordner **Offerten-PDF**, **Projektbedingungen**, **_TEST_Archivpruefung**, **Annahmenachweise** und der separate noch inaktive **Echtbetrieb** wurden identifiziert. Bestehende Dateien und Freigaben nicht verändert.
- Neuer **leerer isolierter Geschäfts-Unterordner** `LSZH_SYNTHETIC_OFFER_PDFS_20261018_NO_CONTRACT` unter dem bestehenden Geschäftsstagingarchiv erstellt. Mit dem geschäftlichen Konto danach Owner, direktes Elternverzeichnis, MIME-Typ, Reader-Rollen und tatsächliche Leere nachgeprüft. **Noch keine PDF-Uploads, keine neuen Cloud-Rollen, keine Firestore-Schreibaktionen**.
- **Technische Schranke:** Unser unveränderter Archivprüfer akzeptiert nur den unmittelbaren Elternordner in `parents[]`. Für synthetische PDFs im neuen Unterordner ist später ein **isolierter, exakt daran gebundener temporärer Archivordner-Wert** erforderlich. Die bestehende Hauptarchiv-ID für den geschützten Originaldienst/Reader wird **nicht** überschrieben. Das neue temporäre Dienstkonto hat derzeit keine eigene Reader-Freigabe.
- Vollständige Policy-Aktualisierung: `docs/LSZH_DRIVE_BUSINESS_ONLY_POLICY_20261018.md`, Test-Go/No-Go: `docs/LSZH_SYNTHETIC_PDF_DRIVE_GATE_20261018.md`. Keine privaten Identitäts-/Ordnerdetails als Ersatz-Business-Daten übernehmen.

**Nächste Etappe:** Die vier bereits lokal getesteten PDF-Fixtures der geschäftlichen Test-Unterordnerstruktur zuordnen; nach tatsächlichem Upload reale Drive-IDs, Bytes+SHA-256, unmittelbare Parent-ID und `contentRestrictions.readOnly` bestätigen. Erst danach einen begrenzten temporären Read-only-Drive-/Firestore-Test vorbereiten; kein echtes Kunden-Onboarding/Vertragsabschluss, keine E-Mails, keine automatische Folgeaktion.

---


## 18.10.2026 – VERBINDLICH: Google Drive für LSZH nur noch geschäftlich

**Geschäftsführerentscheidung:** «alles im geschäftlichen google drive und nichts mehr im privaten». Für LSZH-Automations-Unterlagen sind ausschliesslich das Konto `lars@lszh-automations.ch` und nachweislich geschäftlich verwaltete Google-Drive-Ordner zulässig. Dies betrifft **alle** Tests, Archiv-PDFs, Offerten, Rechnungen, Belege und später Kundendokumente. Neue private Ordner/Uploads oder eine Freigabe des privaten Staging-Archivs an Dienstkonten sind untersagt.

**Live-Verbindungsprüfung (read-only):** Die aktuell verbundene ChatGPT-Google-Drive-Integration ist **noch am privaten Google-Konto angemeldet**, nicht an der geschäftlichen Identität. Ein bisheriger «LSZH Vertragsarchiv – STAGING»-Privatordner ist kein gültiges Geschäftsziel. Das hinterlegte `STAGING.archiveFolderId` ist weiterhin nicht als geschäftlich verwaltet bestätigt. Keine Cloud-/Drive-/IAM-Änderungen ausgeführt.

**Nächster zwingender Schritt:** Der Nutzer verbindet ChatGPT Google Drive mit **`lars@lszh-automations.ch`** oder stellt die bestehende Verbindung darauf um. Danach zuerst über `get_profile` die Geschäftsidentität und die Eigentums-/Berechtigungsinformationen des vorgesehenen neuen geschäftlichen Testordners verifizieren; erst dann 4 synthetische PDFs hochladen bzw. minimalen Cloud-Run-Zugriff für diesen Ordner freigeben. Bis dahin **NO-GO für Google-Drive-Uploads und für einen echten Drive/Firestore-E2E-Test**. Keine privaten Dokumente kopieren, verschieben oder löschen; eine allfällige Bestandsmigration wird separat geprüft und genehmigt.

**Projektregel im Detail:** `docs/LSZH_DRIVE_BUSINESS_ONLY_POLICY_20261018.md`. Die geschützte Cloud-Run-Designvorschau, die funktionierenden Offline-Tests und die bisherige interne Read-only-Revision bleiben unverändert.

---


## 18.10.2026 – Vollständig fiktives PDF-Testpaket AVV Ja/Nein mit echten SHA-256-Abnahmen PASS

**Umgesetzt (noch ausschliesslich offline):**
- Vier valide, unabhängige, einseitige, ausdrücklich **nicht bindende PDFs** (zwei fiktive Offerten AVV Ja/Nein, eine synthetische Projektbedingungen-PDF `TEST_v1.0_RC1`, eine synthetische AVV `TEST_ONLY_AVV_v1.0_RC1`) plus `manifest.json`. ZIP für Betreiber **`LSZH_Synthetic_PDF_Testpaket_20261018.zip`** als Chat-Artefakt erstellt. Kein Upload in einen Google-Drive-Ordner.
- Versionierter, rein lokaler Node.js-Generator `scripts/offerSyntheticPdfFixtures.mjs`: vier deterministische PDF-Bytes mit Golden SHA-256, Write-Once-Dateien, `synthetic@example.invalid`, explizit `TEST...NO_CONTRACT`. Manifest flags `cloudUploaded/legallyApproved/acceptanceEnabled/deliveryEnabled/archiveVerified/tokenConfigured=false`, `driveFileId=null`. Nutzer-ZIP wurde gerendert, mittels PDF-Tools ausgelesen und SHA-geprüft; golden SHA-Tests bestätigen bytegenaue Übereinstimmung mit GitHub-Code.
- Regression `test/offerSyntheticPdfFixtures.test.js`: Originalarchivprüfer aus `archiveBundleVerifier.mjs` prüft **echte lokale PDF-Bytes** gegen simulierte Drive-Metadaten einschliesslich Dateigrösse, Ordner-Parent, SHA-256, MIME und `contentRestrictions.readOnly=true`. AVV `Ja` enthält genau drei Dokumente, AVV `Nein` genau zwei und verweigert den dritten Download. Manipulierte Bytes, falscher Ordner und entsperrtes PDF werden zurückgewiesen. Der synthetische Portal-Preview lässt keine Claim-/Mail-Aktion zu.
- **CI-Abnahme:** GitHub Actions [39077734136](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39077734136) vollständig **SUCCESS**: **107/110 Funktionstests PASS, 3 planmässige SKIP**, **6/6 Chromium**, **12/12 Firestore-Emulator**, Docker-Offlinebuild PASS.

**Wichtiger neuer Live-Google-Drive-Befund (read-only):** Der in `STAGING.archiveFolderId` hinterlegte Ordner war für die aktuell verbundene Drive-Identität **nicht zugänglich (404)**. Ein über Drive-Suche auffindbarer Ordner **«LSZH Vertragsarchiv – STAGING (nicht produktiv)»** ist im *privaten* Google-Konto und laut Metadaten `shared=false`. Er ist **nicht** mit der im Code hinterlegten Archiv-ID identisch. Ein 404 ist **kein** Beleg dafür, dass der bisher konfigurierte Ordner unter einer anderen Identität nicht existiert. Das bestehende private Archiv wird **nicht** freigegeben und die konfigurierte ID wird **nicht** blind geändert. Keine Besitzer-E-Mail-/private ID in das öffentliche Projektprotokoll aufnehmen.

**Go/No-Go-Plan:** `docs/LSZH_SYNTHETIC_PDF_DRIVE_GATE_20261018.md`. Vor realer Cloud-/Drive-PDF-E2E: einen gesonderten, leeren, nur synthetischen Testordner bestimmen, seine korrekte Eigentümerschaft und minimale Rechte für die temporäre Google-Cloud-Dienstidentität sichern, dann die vier PDFs einzeln hochladen und tatsächliche IDs/Parent/Hashes/ReadOnly-Status **nach** Upload verifizieren. Lokaler Airtable-Importer bleibt emulator-only. Cloud Run Hauptservice `lszh-offer-portal-staging`, IAM, Traffic, Render, Make, Kunden, Vertragsannahme, E-Mails und echte RC1-Dokumente **unverändert**.

---


## 18.10.2026 – Sichtprüfung im Cloud-Shell-Browser: statische Offertenvorschau PASS

**Direkter Nachweis des Betreibers:** Screenshot aus Google Cloud Shell Web Preview auf dem IAM-authentifizierten lokalen Cloud-Run-Proxy. Aufgerufen wurde der Pfad `/offerte-annehmen/?demo=1`; im Browser wurde die vorhandene LSZH-HTML-Offertenoberfläche mit Logo, Test-Offerte `MUSTER-2026-001`, `Muster KMU AG`, Leistung `Automatisierter Anfrageprozess`, `CHF 1'490` Einmalumsetzung, `CHF 149 / Monat`, Zahlungsmodell, Gültigkeit `30.11.2026` und Abschnitt für die PDF-Dokumente sichtbar korrekt gerendert. Sichtbarer Banner: `Dies ist eine Designvorschau. Es gibt keine echten Vertragsdokumente.` Der Screenshot ist ein **visueller Browser-Render-Nachweis**, aber kein separater Beleg für echte PDF-Downloads oder Vertragsannahmen.

**Zusammen mit dem davor bestätigten echten Live-Smoketest:** `GET /offerte-annehmen/?demo=1` -> HTTP 200; andere GET-/Token-Routen und sämtliche Offerten-/PDF-/Annahme-POSTs -> HTTP 503; bestehender interner Preflight und IAM-Zustand unverändert. Keine echten Angebots-PDFs, keine Firestore-/Drive-Berechtigungen, keine Vertragswirkung, keine Kundendaten, kein Mailversand.

**Status:** Geschützte, *rein statische und unverbindliche* Cloud-Run-Designvorschau inklusive visueller Sichtprüfung **abgenommen**. Der nächste technische Meilenstein ist ein vollständig synthetischer Angebots-/PDF-End-to-End-Test mit **vorheriger Archiv-/SHA-256-Prüfung**, AVV Ja/Nein, separater eng begrenzter Staging-Identität und nachweislich fiktivem Testdatensatz. Bestehenden Emulator-only-Importer nicht für Cloud-Writes öffnen, den internen Dienst nicht deployen, `/api/offer/accept` weiterhin sperren.

---


## 18.10.2026 – Echtes Cloud-Run-Static-Demo-Smoke BESTANDEN (IAM-geschützt, ohne Daten)

**Betreiber-Rückmeldung aus Cloud Shell, vollständig SUCCESS:**
- `PASS: preflight revision, ingress and service identity unchanged` zu Beginn und Ende. Original `lszh-offer-portal-staging` mit interner Read-only-Revision `00004-qt7` und ohne direkte öffentliche Invoker-Bindings bleibt unverändert.
- `PASS: correct temporary static-demo revision, IAM and hard-disabled full portal`. Eigener temporärer Dienst `lszh-offer-browser-staging`, Revision **`00002-fkq`**, eigenes Dienstkonto, IAM-Invoker nur für benannten Testnutzer.
- `PASS: real authenticated Cloud Run design demo serves synthetic HTML with strict CSP`. Tatsächlicher Netzwerktest über `gcloud run services proxy`: **HTTP 200** für `GET /offerte-annehmen/?demo=1`, unverändertes Test-HTML, keine Backend-Verbindungen oder Formularaktionen aus der Demo, Cache- und Referrer-Sperre.
- `PASS: personal links and every API/PDF/contract route return HTTP 503`. Sowohl GET-Nebenrouten als auch POST auf `/api/offer/preview`, `/api/offer/document`, `/api/offer/accept` bleiben gesperrt.
- `SUCCESS: deployed temporary static-demo live smoke passed; no cloud mutation.` Der Netzwerktest selbst änderte keine Cloud-Ressource und keine Daten.

**Bedeutung:** Der vollständige Meilenstein **«Authentifizierte Google-Cloud-Designvorschau, ausschliesslich synthetisch und ohne Vertragswirkung»** ist bewiesen. Dies ist ausdrücklich **noch kein** erfolgreicher realer Firestore-/Google-Drive-PDF-End-to-End-Test. Es wurden keine Firestore-/Drive-Rollen erteilt und keine echten Dokumente übertragen. Direkte Service-IAM-Bindings wurden kontrolliert; projekt-/organisationsweit geerbte Rollen sind dadurch nicht abschliessend ausgeschlossen.

**Nächste Entwicklungsetappe (vor Cloud-Schreibzugriff):** Eine separate, nachweislich fiktive PDF-Fixture für AVV Ja/Nein vorbereiten (PDF-Bytes und SHA-256, keine RC1-Originalverträge und keine Kundendaten), Herkunft/Datenschutz/Löschung klar festlegen, existierenden Emulator-only-Importer nicht umgehen. Erst danach über einen minimalen, betrieblich genehmigten und exakt begrenzten Firestore-Testdatensatz und privaten Test-Drive-Ordner entscheiden. `syntheticOnly:true`, `acceptEnabled:false` und `downstream.*=disabled` bleiben harte Grenzen. Temporären Dienst nach abgeschlossenen Tests kontrolliert auf deaktiviert zurückrollen und mit `scripts/offer-browser-cloud-cleanup.sh` bereinigen.

---


## 18.10.2026 – Temporäre Cloud-Run-Design-Demo wirklich deployt; Live-Browser-Smoke steht an

**Vom Betreiber bestätigtes Google-Cloud-Deployment:** `gcloud builds submit` **SUCCESS** (Build-ID `6f02af2c-9465-4657-9d35-d4c317276253`); neues isoliertes Container-Image `europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-offer-browser-staging:d69d76a2f3c4`, Digest `sha256:d49ccc6c9fc8b5ca781e4893f3fbacb6e24f1c8e561639261bf07fea5f439a32`. Ausschliesslich der temporäre Dienst `lszh-offer-browser-staging` wurde auf **Revision `lszh-offer-browser-staging-00002-fkq`** aktualisiert und erhielt **100 % seines eigenen Traffic**. URL `https://lszh-offer-browser-staging-ozx7mp2bka-oa.a.run.app`. IAM-Invoker bleibt authentifizierungspflichtig. Die originale Revision `lszh-offer-portal-staging-00004-qt7` auf dem internen Dienst wurde vor und nach diesem Deploy durch das read-only-Skript als unverändert bestätigt.

**Beabsichtigter Modus:** `LSZH_PORTAL_STAGING_ENABLED=false`, `LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED=true`; unverändertes eigenes temporäres Dienstkonto ohne explizite Firestore- oder Drive-Berechtigungen. `GET /offerte-annehmen/?demo=1` soll ausschließlich statisches, fiktives Bestands-HTML ausliefern; `GET` ohne Demo-/mit Tokenparametern sowie **alle** Offerten-API-POSTs sollen 503 zurückgeben. Die Content-Security-Policy verbietet Netz-Fetch und Formularaktion. Diese Erwartungen sind bisher offline mit **6/6 Chromium** und Unit-/HTTP-Tests verifiziert, **aber der echte GET auf der neuen Cloud-Revision ist noch nicht abgefragt**. Kein echter PDF-Download, kein Kundendatum, kein Vertrag oder Versand.

**Nächste Verifikation:** Neu `scripts/offer-browser-static-demo-smoke.sh`, ein vollständig **read-only** Script, das vor/nach dem Test den Originaldienst schützt, nur den exakt identifizierten Temp-Dienst Revision `00002-fkq` mit Labels, Dienstkonto, Flags und IAM prüft, über `gcloud run services proxy` die authentifizierte **Live-Demo GET HTTP 200**, korrekten synthetischen HTML-Body, no-store und restriktive CSP prüft, alle anderen GETs/API-POSTs als 503 erwartet und den lokalen Proxy danach aufräumt. Es führt keine Deployments, IAM-Änderungen oder Cloud-Datenschreibungen aus. Shell-/Sicherheitstests über `test/offerBrowserCloudScript.test.js` und GitHub Actions. **Offline-Abnahme bestanden:** [GitHub Actions 39076436722](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39076436722): 106 reguläre Tests insgesamt, **103 PASS, 3 SKIP, 0 FAIL**; **6/6 Chromium**, **12/12 Firestore-Emulator**, Docker-Offlinebuild und Read-only-Script-Checks PASS. Die tatsächlichen Live-Demo-HTTP-Ergebnisse sind erst nach der Ausführung des Cloud-Shell-Befehls bekannt; nicht als PASS vorwegnehmen.

**Offen:** Firestore-/Drive-Synthetikseed und autorisierte fiktive archivierte PDFs, später (nicht diese Demo) vollständige Offertenvorschau. Weitere Cloud-Deployment-Aktionen bleiben vom Umfang der vorherigen zeitlich begrenzten Testfreigabe begrenzt. Kein Merge nach `main`, kein produktiver Vertragsabschluss, keine E-Mails.

---


## 18.10.2026 – Cloud-Run-HTTP-Smoketest echt PASS; statische Browser-Demo als nächste Testrevision vorbereitet

**Live-Ergebnis aus Cloud Shell (Betreiber, read-only):**
- `PASS: preflight revision, ingress and service identity unchanged` vor/nach Test; keine direkten öffentlichen Invoker-Bindings auf altem Dienst.
- `PASS: temporary Cloud Run service is labelled, disabled and IAM protected`.
- `PASS: authenticated temporary Cloud Run GET returns HTTP 503 as designed`.
- `PASS: acceptance POST is HTTP 503 (no legal acceptance possible)`.
- `SUCCESS: real Cloud Run network smoke passed without any deployment or data writes`.
- Temporäre Testressource bleibt bis zu einer **gesondert ausgeführten** Revision `lszh-offer-browser-staging-00001-7kx`, 100 % Traffic, `LSZH_PORTAL_STAGING_ENABLED=false`. Das Original `lszh-offer-portal-staging-00004-qt7` bleibt intern geschützt und unverändert.

**Vorbereitung für die nächste, statische Browser-Demo (nur Entwicklungsbranch, bislang KEIN zweites Cloud-Deployment):**
- Neues `temporaryBrowserDemo.mjs`: lässt im **eigenständigen** temporären Dienst ausschliesslich `GET /offerte-annehmen/?demo=1` zu (originales HTML, Beispielpreise, keine PDF-Dokumente). Alle anderen HTTP-Methoden und Pfade einschliesslich `/api/offer/preview`, `/api/offer/document` und `/api/offer/accept` geben **immer 503** zurück. Die Demo hat `Content-Security-Policy: connect-src 'none'; form-action 'none'`, kein ungeprüftes offenes Angebot.
- Eigenständiges Flag `LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED=true` ist nur bei `LSZH_PORTAL_STAGING_ENABLED=false`, exaktem `K_SERVICE=lszh-offer-browser-staging`, erwarteter Revision, festem Google-Cloud-Projekt, ohne Emulator- oder Schlüsselvariablen möglich. `index.mjs` prüft vor HTML-Auslieferung zusätzlich das Google-Cloud-Metadata-Dienstkonto `lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com`. Die normale Firestore-/Drive-/Annahmekern-Initialisierung wird in diesem Modus vollständig umgangen.
- `test/temporaryBrowserDemo.test.js`: strenge Unit-/HTTP-Negativtests für fremde Runtime-Identitäten, unerlaubte Zugriffswege, ungeprüfte Angebote und alle POST-APIs. Neuer echter Chromium-Test bestätigt: unveränderte Demo darstellbar, Downloadversprechen bleibt gesperrt, `submit` deaktiviert und Annahme-POST serverseitig HTTP 503. Die CSP blockiert sogar Browser-Fetch; dieser wird deshalb getrennt vom API-Test geprüft.
- `scripts/offer-browser-static-demo-release.sh --check|--apply`: verifiziert vor etwaiger Cloud-Schreibaktion die ursprüngliche interne Baseline und **genau** die bestehende deaktivierte, label- und IAM-geschützte temporäre Revision `00001-7kx`. Erst `--apply` baut ein neues Container-Image aus einer engen Quellliste und aktualisiert **ausschliesslich** `lszh-offer-browser-staging` mit `LSZH_PORTAL_STAGING_ENABLED=false`, `LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED=true`, Google-Cloud-Projekt und unverändertem Servicekonto sowie strikt angemeldetem IAM-Invoker. Kein Firestore- oder Drive-Zugriff, keine zusätzlichen IAM-Rollen.
- `scripts/offer-browser-cloud-cleanup.sh` stoppt zukünftig bei aktiver statischer Demo. Zuerst kontrolliert auf alte deaktivierte Revision zurückschalten. Bei einer Fehlfunktion ausschliesslich den temporären Traffic zu `lszh-offer-browser-staging-00001-7kx` zurücksetzen, nie Originaldienst oder dessen Traffic verändern.

**Offline-Testabnahme:** GitHub Actions [39075936456](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39075936456) **SUCCESS**: normal 105 total / **102 PASS, 3 SKIP, 0 FAIL**; Chromium **6/6 PASS**, Firestore-Emulator **12/12 PASS**, Docker-Build/disabled HTTP PASS. Die Cloud wurde durch diese Codeänderungen nicht verändert.

**Weiter offene Gate:** Betreiber muss das neue Demo-Release erst aus Cloud Shell ausführen. Danach authentifizierten Browserzugriff prüfen. Anschliessend, nicht jetzt: fiktive PDFs und Firestore-Seed vorbereiten und Minimalrechte dafür separat entscheiden. Echte Kundendaten, Vertragsannahme, Beleg, Statusänderungen, Make und Mails bleiben vollständig unangetastet.

---


## 18.10.2026 – Temporärer Cloud-Run-Browserdienst erfolgreich deployt, weiterhin deaktiviert

**Operatorbericht aus Google Cloud Shell (verifiziert durch gcloud-Ausgaben des Betreibers):**
- **SUCCESS:** Separate IAM-Berechtigung `roles/iam.serviceAccountUser` wurde auf **nur** `lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com` für `lars@lszh-automations.ch` erteilt. Kein projektweiter Grant.
- **SUCCESS:** Der temporäre Dienst **`lszh-offer-browser-staging`** wurde in `lszh-automations/europe-west6` erfolgreich angelegt. Revision `lszh-offer-browser-staging-00001-7kx`, **100 % Traffic nur für diesen neuen separaten Dienst**. Sein ursprünglich genehmigtes Image `7f8602e762ce` wurde wiederverwendet, kein zweiter Build.
- Dienst-URL (vom Betreiber bestätigt): `https://lszh-offer-browser-staging-ozx7mp2bka-oa.a.run.app`; Google zeigt ebenfalls `https://lszh-offer-browser-staging-470613067122.europe-west6.run.app`.
- Label `lszh-purpose=offer-browser-smoke`, `lszh-temporary=true`; dediziertes Dienstkonto, `ingress=all` **nur für den neuen Testdienst**, `--no-allow-unauthenticated` mit aktivem Invoker-IAM-Check; namentlicher Benutzer als direkter Invoker, **keine** direkten öffentlichen Invoker-Bindings. Geerbte Rollen vom Projekt/Organisation nicht in voller Tiefe ausgeschlossen.
- `LSZH_PORTAL_STAGING_ENABLED=false` bleibt explizit gesetzt. Die Anwendung ist laut Skript **deaktiviert** (HTTP 503 erwartet), noch **kein** Browser-Test mit fiktiven Daten; keine Firestore-/Drive-Rollen vergeben, keine Kundendaten, Vertragsabschlüsse oder E-Mails.
- Abschliessender Betreiber-Test des Originals: `PASS: preflight revision, ingress and service identity unchanged`, ursprüngliche Revision weiterhin 100 %, `ingress=internal` und unverändertes eigenes Dienstkonto.

**Nächster Test ohne Cloud-Mutation:** `scripts/offer-browser-cloud-smoke.sh` im Featurebranch nutzt den bereits erstellten temporären Dienst über einen IAM-authentifizierten lokalen `gcloud run services proxy` und erwartet `503` sowohl für `GET /offerte-annehmen/?demo=1` als auch für `POST /api/offer/accept`. Vor und nach dem Probeaufruf liest es den Original-Preflight-Zustand, prüft die temporäre IAM-Policy, Label, Dienstkonto und deaktivierte Anwendung, entfernt den Proxy wieder und druckt keine Zugangstokens. CI enthält Shell-Syntax-/Security-Regressionstests; kein neues Docker-/Cloud-Deployment. Der eigentliche Staging-Browser-Test wird erst nach einem weiteren kontrollierten, synthetischen read-only Demo-Release und entsprechender Betriebsfreigabe möglich.

**Offen:** Es gibt für den neuen temporären Dienst **weiterhin kein Firestore/Drive-Recht, keinen Cloud-Test-Seed, keine echten synthetischen PDF-Archivdaten und keine aktive Portal-Demo**. Diese Dinge dürfen nicht implizit aus dem erfolgreichen Deploy abgeleitet werden. Die Rückbauanweisungen `scripts/offer-browser-cloud-cleanup.sh` bleiben für den exakt markierten, **deaktivierten** Testdienst vorgesehen. Nach Aktivierung ist Cleanup absichtlich gesperrt, bis eine kontrollierte Deaktivierung erfolgt. Kein Go-Live.

---


## 18.10.2026 – Genehmigter Cloud-Test: erster Build PASS, Deployment wegen `actAs` blockiert; sichere Wiederaufnahme

**Ist-Ergebnis des vom Betreiber freigegebenen Cloud-Shell-Bootstraps:**
- Read-only Baseline und IAM des bestehenden Dienstes `lszh-offer-portal-staging`: `PASS` (100 % auf der ursprünglichen internen Preflight-Revision, keine direkten öffentlichen Invoker-Bindings). Unverändert.
- Google Cloud Build `a5c9bc7b-2043-43c5-a457-2d70639055b5`, Region `europe-west6`: **SUCCESS**. Bereits hochgeladenes, isoliertes Image `europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-offer-browser-staging:7f8602e762ce`, SHA256 `ba69188de7d71b9410ccc519b0249388d66401a01c20d09bb687932265f71678`. Kein Rebuild notwendig.
- Dediziertes, bisher ohne DB/Drive-Rollen angelegtes Dienstkonto: `lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com`.
- **Cloud-Run-Deployment fehlgeschlagen**, Google-Meldung: `Permission iam.serviceaccounts.actAs denied` für aktiven Benutzer `lars@lszh-automations.ch` auf dem separaten Dienstkonto. **Nicht** als erfolgreicher Browserdienst ausgeben. Ein möglicherweise teilweise erstellter Dienst muss vor neuem Versuch geprüft werden. Es wurden keine produktiven Kunden, Verträge oder Mails versendet.

**Kleinste berechtigte Korrektur:** Google-Cloud-Dokumentation fordert für das Deployment `roles/iam.serviceAccountUser` auf dem **konkreten neuen temporären Dienstkonto** (nicht auf dem gesamten Projekt). Dafür `gcloud iam service-accounts add-iam-policy-binding` mit `--member=user:lars@lszh-automations.ch` und `--role=roles/iam.serviceAccountUser`; Google-Cloud-IAM-Benutzer muss diese Bindung selbst vergeben dürfen oder von zuständiger IAM-Administration erhalten. Keine breiteren Projektrollen vergeben.

**Neu im Entwicklungsbranch:** `scripts/offer-browser-cloud-resume.sh --check|--apply` verwendet das **existierende Image-Tag nach exakter Digest-Prüfung**, kontrolliert unverändert den bisherigen internen Preflight, prüft das vorhandene Test-Dienstkonto und verlangt **keinen bereits vorhandenen temporären Cloud-Run-Dienst** (verhindert ungewolltes Überschreiben teilweise angelegter Ressourcen). `--apply` vergibt nur `roles/iam.serviceAccountUser` an genau den autorisierten Benutzer auf genau dem temporären Konto, deployed nur `lszh-offer-browser-staging` mit `LSZH_PORTAL_STAGING_ENABLED=false`, `--no-allow-unauthenticated` und IAM-Invoker-Sperre, anschliessend allein dem namentlichen Testbenutzer Invoker auf dieser temporären Ressource. Verifiziert die Ressource, nichtöffentliche Dienst-IAM-Policy und unveränderten Originaldienst. Keine neue Build-/SA-Erstellung, keine Firestore-/Drive-Berechtigungen, keine Annahme.

**Tests:** `test/offerBrowserCloudScript.test.js` prüft CLI-Syntax, das exakt gepinnte Digest, engen SA-Bindungsumfang und unverändert gesperrte Einstellungen. GitHub Actions [39074674528](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39074674528) **SUCCESS** für den getesteten Wiederaufnahmecode und Workflow. **Cloud-Run-Deployment ist noch ausstehend.**

**Nächste Aktion:** Betreiber holt neue Checkout-Version des Featurebranches in Cloud Shell und startet nur `bash scripts/offer-browser-cloud-resume.sh --apply`; bei IAM-Rollenfehler zunächst entsprechenden Accountberechtigungsfehler zurückmelden. `offer-browser-cloud-bootstrap.sh --apply` **nicht** erneut ausführen, da Image und Dienstkonto bereits angelegt sind. Kein Go-Live.

---


## 17./18.10.2026 – Betreiberfreigabe für TEMPORÄREN Cloud-Browser-Stagingdienst, Bootstrap vorbereitet

**Freigabe des Betreibers im Projektchat:** „du hast die freigabe“ als Zustimmung zur vorher vorgeschlagenen, separaten temporären Google-Cloud-Testressource. Diese Freigabe umfasst **nicht** das Öffnen/Überschreiben des bestehenden internen Diensts, produktive Vertragsannahmen oder reale Kundendaten.

**Ausführungsmöglichkeit geprüft:** In diesem Chat sind zwar GitHub, Render, Airtable usw. verbunden, aber keine Google-Cloud-Run-Verwaltungs- oder Cloud-Shell-Exec-Aktion. **Deshalb noch kein Cloud-Dienst, IAM-Dienstkonto, Image oder sonstige Cloud-Ressource angelegt.** Stattdessen sind ausführbare, geprüfte Cloud-Shell-Skripte im ungemergten Entwicklungsbranch vorbereitet.

- `scripts/offer-browser-cloud-bootstrap.sh --check|--apply`: Prüft zuerst read-only die alte Preflight-Revision, Ingress, Service-IAM und feste Runtime-Schutzgrenzen. Weigert sich, vorhandene temporäre Namen, nicht saubere Branches oder eine potenziell öffentliche Projekt-IAM-Invoker-Bindung zu überschreiben. Erst bei `--apply` lädt es **nur** gezielt ausgewählte Portaldateien zur Cloud-Build-Imageerstellung hoch (nicht das komplette Git-/Arbeitsverzeichnis), legt das **neue dedizierte** Konto `lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com` **ohne Firestore-/Drive-Rollen** und den **neuen** Dienst `lszh-offer-browser-staging` an. App-Umgebung `LSZH_PORTAL_STAGING_ENABLED=false`; max. 1 Instanz, min. 0, IAM-Invoker-Prüfung EIN, `--no-allow-unauthenticated`, Netz-Ingress nur am **neuen** Dienst `all`, direkte Invoker-Berechtigung ausschliesslich für den aktiven benannten Google-Cloud-Nutzer. Neue Dienstressource ist zunächst nur deaktiviert erreichbar: HTTP 503. Unveränderten Originaldienst danach erneut read-only prüfen.
- `scripts/offer-browser-cloud-cleanup.sh --check|--apply`: Löscht nach separater Betreiberaktion nur den exakt mit `lszh-purpose=offer-browser-smoke` und `lszh-temporary=true` gekennzeichneten **deaktivierten** Dienst, dessen exklusives Konto sowie das exakt referenzierte temporäre Image. Verweigert Cleanup bei veränderter Identität, fehlender Testmarkierung oder aktivierter Anwendung. Alter Preflight-Dienst ist kein Löschziel. Cleanup nach aktiviertem Test bedarf einer gesonderten kontrollierten Stilllegung, damit keine falsche Sicherheitsannahme entsteht.
- `test/offerBrowserCloudScript.test.js` enthält drei statische Regressionstests: Skript-Syntax, eigener Dienst/Identität, IAM-Check, Verbot von anonymem Invoker, keine DB-/Drive-Rollen, Rückbau nur bei genauen Labels und deaktiviertem Zustand.
- `.github/workflows/offer-acceptance-check.yml` führt `bash -n` und diese Tests ohne Google-Credentials aus.

**Abnahme:** [GitHub Actions 39074026397](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39074026397) vollständig **SUCCESS**: normale Tests **98 total / 95 PASS / 3 SKIP / 0 FAIL**; Firestore-Emulator **12/12 PASS**, Chromium **5/5 PASS**, Docker-Image-Build und Read-only-Gate PASS.

**Nächster operativer Schritt:** Betreiber startet im eigenen **Google Cloud Shell** aus einem frischen Checkout dieses Staging-Branches `bash scripts/offer-browser-cloud-bootstrap.sh --apply` und sendet den nicht-sensiblen Ergebnisstatus. Mögliches Cloud-Build-/Run-Billing ist genehmigt, aber tatsächliche IAM-/Abrechnungsfreigaben hängen an Google Cloud. Vor gesondertem späteren Test mit Daten fehlen weiterhin eine eigene Identitäts-/Origin-Anpassung für den temporären Servicenamen, minimalistische DB-/synthetische Drive-Freigaben, sicherer Cloud-Testseed und autorisierte fiktive PDFs. **Kein Go-Live.** Ursprüngliche Revision `lszh-offer-portal-staging-00004-qt7`, 100 % Traffic, `ingress=internal` bleibt unangetastet.

---


## 17.10.2026 – Sicherer Cloud-Browser-Test: Kandidat vorbereitet, kein Deployment

**Ausgangslage:** Vom Betreiber verifizierter Cloud-Run-Ist-Zustand: `lszh-offer-portal-staging-00004-qt7` / 100 % Traffic, `ingress=internal`, bisheriges IAM-Service-`bindings=null`, korrektes Read-only-Preflight und Dienstkonto. Der neue Portalcode ist noch nicht auf Google Cloud ausgerollt.

**Nächste Etappe umgesetzt (nur Featurebranch, kein Cloud-Zugriff):**
1. `portalCore.mjs`: Die Browser-Preview gibt `details` jetzt nur als explizite Projektion bekannter Darstellungsfelder aus. Beliebige zusätzliche Firestore-Notizen, interne Metadaten oder sensible Detail-Properties werden nicht an den Browser durchgereicht. Neuer Regressionstest beweist diese Begrenzung.
2. `test-browser/offerPortal.browser.spec.cjs`: Zwei zusätzliche echte Chromium-End-to-End-Fälle **CLOUD PREVIEW ONLY** mit AVV `Ja` und `Nein`, korrekt fiktiver `source.kind`/`example.invalid`-Quelle und allen drei deaktivierten Folgeaktionen. Browser testet die vorhandenen Formular-/2-3-PDF-HTTP-Routen; `POST /api/offer/accept` bleibt 503, Firestore-Testzustand bleibt `sent`, keine Abschlussbelege, keine Mails. Diese Tests verwenden weiterhin nur lokalen Code, simuliertes Drive und einen In-Memory-Store.
3. `scripts/offer-cloud-readiness-readonly.py`: Strikt **read-only** Cloud-Run-Baselinekontrolle für alte Revision, IAM-Bindings, internem Ingress, Funktionsziel und Dienstkonto; prüft ausschliesslich mit `gcloud run services describe` und `get-iam-policy`. Kein IAM- oder Deploy-Befehl, keine Ausgabe von Credentials. **6** Offline-Negativtests in CI.
4. `docs/LSZH_OFFER_CLOUD_BROWSER_STAGING_GATE_20261017.md`: Konkreter Go/No-Go- und Cleanup-Plan für den einmaligen isolierten Browser-Test, mit expliziten Kosten-/IAM-/Datenschutz-/Löschfreigaben. Wichtige Erkenntnis aus offizieller Google-Dokumentation: `gcloud run services proxy` authentifiziert zwar IAM, kann aber von ausserhalb **nicht** einen `ingress=internal`-Dienst erreichen. Für externen Browserzugriff ist daher ein bewusst freigegebener **temporärer eigener**, IAM-geschützter Testdienst sinnvoller, als den bestehenden Read-only-Dienst zu öffnen. Der temporäre Dienst wurde **nicht** erstellt. Dessen eigenständige Service-Identity/Origin und echte ausschliesslich fiktive PDF-/Firestore-Testdaten sind vor Deploy noch vorzubereiten.

**Abnahme:** [GitHub Actions 39073297013](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39073297013) **SUCCESS**: regulär **95 gesamt / 92 PASS / 3 SKIP / 0 FAIL**; **5/5** echte Chromium-Tests, **12/12** Firestore-Emulator-Tests, **6/6** Cloud-Sicherheits-Selbsttests und Docker-Image-Build / gesperrter Start PASS. Alle Testdaten synthetisch; keine produktiven Kunden oder externen Cloud-Daten verändert.

**Offen / harte Grenze:** Realen Browser→Cloud-Run-Test noch nicht durchgeführt. Er benötigt die explizite Freigabe einer befristeten separaten Testressource, einer minimierten IAM-Identität, separat archivierter fiktiver PDFs und einer streng beschränkten, bereinigbaren Cloud-Testdatensatz-Anlage (bisheriger Importer ist absichtlich Emulator-only). Existing `main`, Render, Cloud-Run-Traffic, Ingress, Service-Policy, Airtable, Make, Mail und rechtsverbindliche Annahme **unverändert**. Keine Cloud-Erstellung, kein Deployment und kein Go-Live.

---


## 17.10.2026 – IAM-Abfrage Cloud-Run-Staging: direkte Bindings leer

- Betreiber hat read-only ausgeführt: `gcloud run services get-iam-policy lszh-offer-portal-staging --project=lszh-automations --region=europe-west6 --format="yaml(bindings)"`; Ergebnis: **`null`**.
- Bedeutung: Im ausgegebenen servicebezogenen IAM-Policy-`bindings`-Feld wurden **keine direkten Rollenbindungen** angezeigt, insbesondere kein explizites `allUsers: roles/run.invoker` an diesem Dienst. Das Ergebnis ist **keine** Aussage über projekt- oder organisationsweit geerbte Berechtigungen oder alternative interne Aufrufwege.
- Bereits separat bestätigt: `ingress=internal`, Status `100 %` auf Read-only-Preflight-Revision `lszh-offer-portal-staging-00004-qt7`, Dienstkonto `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com`.
- **Entscheidung:** Bestehenden Dienst, IAM, Ingress und Traffic unverändert lassen. Der vollständige Cloud-Test braucht einen zuvor bewusst definierten, isolierten Testzugang; keine unautorisierte Deployment-, Freigabe-, Mail- oder Vertragsannahme-Aktion.

---


## 17.10.2026 – Cloud Run Ingress (betreiberseitig read-only geprüft)

**Neue Ist-Bestätigung** aus `gcloud run services describe lszh-offer-portal-staging --project=lszh-automations --region=europe-west6 --format="yaml(metadata.annotations)"`:

- `run.googleapis.com/ingress: internal`, `run.googleapis.com/ingress-status: internal`: der bestehende Dienst ist für direkte externe Browseraufrufe **nicht** freigegeben. Dies ist unabhängig davon, ob die HTTPS-URL existiert und sagt noch nichts über die IAM-Invoker-Rollen aus.
- `run.googleapis.com/build-function-target: lszhPortalPreflight`: bestehender ausgerollter Read-only-Preflight, nicht der neue vollständige Portal-HTTP-Code.
- `run.googleapis.com/maxScale: '1'` und Google-22-/Node.js-22-Laufzeit.
- Annotation `run.googleapis.com/urls` enthält die beiden Cloud-Run-Adressen `https://lszh-offer-portal-staging-470613067122.europe-west6.run.app` und `https://lszh-offer-portal-staging-ozx7mp2bka-oa.a.run.app`. Beide sind als Hostnames in der Staging-Config berücksichtigt; externe Erreichbarkeit folgt daraus **nicht**.
- Bereits separat bestätigt: Revision `lszh-offer-portal-staging-00004-qt7` hat **100 % Traffic**, eigenes Dienstkonto `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com`.
- **Noch offen:** zweite read-only Prüfung `gcloud run services get-iam-policy lszh-offer-portal-staging --project=lszh-automations --region=europe-west6 --format="yaml(bindings)"` zur Invoker-Policy; keine Änderung von Ingress oder IAM, kein Cloud-Deploy, keine echten Test-/Kundendaten. Für echten Browser-Stagingtest vorab sicheren, vom Betreiber genehmigten Zugangsweg wählen, ohne das interne Archiv zu öffnen.

---


## 17.10.2026 – Google-Cloud-Status vom Betreiber verifiziert (read-only)

**Nachweis:** `gcloud run services describe lszh-offer-portal-staging --project=lszh-automations --region=europe-west6 --format="yaml(status.url,status.traffic,spec.template.spec.serviceAccountName)"`

- Laufzeit-Dienstkonto: `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com` (entspricht erwarteter Identität).
- `status.traffic`: **100 % auf `lszh-offer-portal-staging-00004-qt7`**. Neuer Portalcode wurde **nicht** in den Live-Traffic geschaltet.
- Tatsächliche Dienst-URL: `https://lszh-offer-portal-staging-ozx7mp2bka-oa.a.run.app`.
- **Konfigurationsabweichung im Entwicklungs-Branch behoben:** `cloud-run/offer-portal-staging/stagingConfig.mjs` erlaubt jetzt auch exakt die vom Betreiber bestätigte HTTPS-Origin `https://lszh-offer-portal-staging-ozx7mp2bka-oa.a.run.app`. Bestehende zulässige Origins bleiben vorerst unverändert. Negativtests für fremde Origins bleiben bestehen. GitHub Actions [39071601576](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39071601576) vollständig **SUCCESS** (Funktionstests, Browser, Emulator, deaktiviertes Docker-Image). **Kein Deployment** erfolgt.
- Die vorgelegte Ausgabe belegt **nicht** Ingress- oder IAM-Invoker-Berechtigungen; diese bleiben separat per lesendem `gcloud run services describe` und `gcloud run services get-iam-policy` zu prüfen. Keine Ausgabe mit Credentials, Tokens oder vollständigen Umgebungsvariablen teilen.
- Unverändert: keine Go-Live-Freigabe, kein Revisionsdeploy, kein Annahme-POST, keine E-Mail, keine Airtable-/Make-Änderung.

---


## 17.10.2026 – Cloud-Run-Stagingvorbereitung: synthetischer Datengate + Annahmesperre PASS

**Entwicklungsgrundsatz:** Bestehende Cloud-Run-, HTML-, Firestore- und Archivmodule weiterverwenden; keinen zweiten Proxy, Dienst oder neuen Datenbestand bauen. Nutzerauftrag `Vamos` mit **ausschliesslich lokalen, synthetischen Tests**; keine operative Cloud-Freigabe oder Aktivierung.

**Wichtigster Fund:** Das Portal lieferte `test_only:true` im Beleg zurück, erzwang aber zuvor beim Lesen des Datensatzes keine ausschliesslich synthetische Herkunft. Für einen späteren realen Cloud-Test war dies eine unzureichende Schutzgrenze.

**Nun im nicht gemergten Entwicklungsbranch umgesetzt:**
- `portalCore.mjs` akzeptiert `syntheticOnly:true` und prüft vor jeder Vorschau, jedem PDF-Download und jeder Annahme verbindlich: `source.kind=LSZH_SYNTHETIC_ONLY`, feste Airtable-Testquell-IDs, synthetische Record-ID, `TEST_..._NO_CONTRACT`-Offertennummer, `example.invalid`-Empfänger, `TEST_v1.0_RC1` und sämtliche Folgeaktionen `downstream.airtable/proofPdf/email=disabled`. Fehlende oder reale Daten führen fail-closed zu 404, **ohne Archivprüfung oder Firestore-Annahme**.
- Der Angebots-Fingerprint umfasst zusätzlich `source` und `downstream`. Änderungen dieser Herkunfts-/Sperrfelder zwischen dem ersten Lesen und der Firestore-Transaktion blockieren den Commit.
- `index.mjs` legt **für den Cloud-Run-Entrypoint fest**: `syntheticOnly:true` und `acceptEnabled:false`. Selbst bei später eingeschalteter Staging-Vorschau kann der reale Cloud-Run-Code **keine POST-Annahme** ausführen; POST `/api/offer/accept` liefert `503 not_available`. Nur ein künftiger **separat geprüfter Codeänderungs-/Freigabevorgang** könnte dies ändern.
- Die existierende `offerte-annehmen/index.html` zeigt bei `offer.test_only=true` den klaren Hinweis **„Nur synthetische Testdaten. Hier kann kein Vertrag geschlossen werden“**, benennt den dritten Abschnitt in Testvorschau um, blendet den verbindlichen Rechtshinweis aus und verhindert sämtliche Formular-Submits. Render-Design-Demo und bisherige normale UI-Fälle bleiben unverändert.
- Neue Negativ- und Regressionstests decken echte/falsch markierte Empfänger, Nummern, Record-Quelle, aktive Folgeaktionen, nachträgliche Mutation während Drive-I/O, gesperrten Annahme-Endpunkt und Browser-Submit ab. Die CI kontrolliert ausserdem explizit die `syntheticOnly:true` / `acceptEnabled:false`-Verdrahtung im eigentlichen Cloud-Entrypoint.

**Abnahme:** [GitHub Actions 39071250068](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39071250068) vollständig **SUCCESS**: normal **94 total / 91 PASS / 3 SKIP / 0 FAIL**; Firestore-Emulator **12/12 PASS**; echter Chromium **3/3 PASS**; Docker-Image gebaut, vorhandenes HTML korrekt enthalten und HTTP 503 bei deaktiviertem Cloud-Run-Entrypoint bestätigt. Staging-Branch `feature/optional-avv-acceptance-staging-20261014`, ungemergte Draft-PR #5. Render/Google-Cloud/produktive Services wurden **nicht** verändert.

**Operativer nächster Schritt, vor Deploy ausschliesslich read-only:** Im Cloud-Projekt `lszh-automations`, Region `europe-west6` die aktuell live geschaltete Revision (zuletzt `00004-qt7`, 100 % Traffic), den Ingress-/Invoker-Schutz, die eigentliche Laufzeitidentität, Staging-Datenbank und den Zugriff auf den geschäftlichen Archivordner erneut verifizieren. Keine Secrets exportieren. Es gibt weiterhin **keinen** genehmigten Cloud-Deployment-Schritt; der bestehende private read-only Preflight darf nicht überschrieben werden. Für einen echten Cloud-Browser-Test braucht es danach eine gesondert autorisierte, isolierte Testrevision sowie ausdrücklich synthetische Archiv-PDFs und einen nur dafür bestimmten Testdatensatz. Echte Vertragsannahme, automatischer Mailversand, Annahmebeleg, Airtable-Statussynchronisierung und juristische RC1/AVV-Freigabe bleiben separat offen.

---


## 17.10.2026 – Single-Origin-Offertenportal: ein vollständiges, deaktiviertes Docker-Paket PASS

**Leitentscheid:** Das bestehende Kundenformular und alle zugehörigen API-/PDF-Routen künftig **unter genau einer dedizierten Portal-Origin** betreiben; keinen neuen Render-Proxy, keine direkte Browser-Verbindung auf intern gesperrte Google-Reader-Dienste. Dieselbe bestehende Datei `offerte-annehmen/index.html` bleibt die einzige Oberfläche.

**Nur auf GitHub-Entwicklungsbranch (ohne Cloud-/Render-Deployment):**
- `portalHttp.mjs` liefert nun auch `GET /offerte-annehmen/` als statische HTML-Seite, **nur** wenn `enabled=true` und eine gültige, lokal gebündelte HTML-Datei geladen wurde; ansonsten weiterhin fail-closed HTTP 503. Für API-/PDF-Aktionen gelten unverändert die privaten POST- und Origin-Sperren. HTML erhält `no-store`, `no-referrer`, `noindex`, `nosniff`, Frame-Sperre und restriktive CSP.
- `index.mjs` liest `./offerte-annehmen.html` **erst bei aktivierter Staging-Konfiguration**, nicht während eines gesperrten Preflight-Starts.
- `cloud-run/Dockerfile.offer-portal-staging` nutzt jetzt **Repository-Root** als Build-Kontext und kopiert gezielt die vorhandene `offerte-annehmen/index.html` zusammen mit den Cloud-Run-Portalmodulen und der PDF-Prüfung. Keine neue HTML-Kopie im Repository, keine zusätzlichen Services.
- Der reale Chromium-Browser-Test ruft die HTML-Seite über den **tatsächlichen** neuen Portal-HTTP-Handler ab; Preview, 2/3 PDF-Downloads und fiktive Annahmen laufen über denselben lokalen Ursprung. Separater HTTP-Test belegt, dass die Seite bei deaktiviertem Portal HTTP 503 liefert.
- Neuer Workflow-Job `portal-image-offline` baut das **exakte Docker-Image** in GitHub Actions, bestätigt das vorhandene HTML im Image und startet den Container **nur auf localhost, mit deaktivierter Staging-Konfiguration**. Es folgen HTTP 503 und `not_available`, ohne Google-Aufrufe oder Cloud-Deployment.

**Vier CI-Jobs erfolgreich:** [GitHub Actions 39070538514](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39070538514) `SUCCESS`: regulär **89 total / 86 PASS / 3 SKIP / 0 FAIL**; Firestore-Emulator **12/12 PASS**; echter Chromium **3/3 PASS**; **Docker-Image Build + disabled HTTP 503 PASS**.

**Unveränderte Sperren:** Aktives Cloud-Run-Staging-Portal verbleibt auf dem read-only Preflight (letzte Nutzerbestätigung: Revision `lszh-offer-portal-staging-00004-qt7`, 100 % Traffic); Render-STAGING-Demo unverändert, ebenso Website auf `main`, Firestore-Kundendaten, Airtable, Make und sämtliche E-Mail-Sperren. **Kein neuer Cloud-Run-Dienst, keine Revision und kein Kosten verursachender Cloud-Aufruf erstellt.**

**Nächste Freigabeschwelle:** Vor einem tatsächlichen Browser-zu-Cloud-Run-HTTP-Aufruf müssen wir den sicheren Staging-Zugangsweg, IAM/Ingress und Testdaten-Zuordnung festlegen. Kein stilles Überschreiben der sicheren read-only Revision, kein öffentliches Archivdienstkonto, keine echte rechtsverbindliche Annahme. Danach ausschliesslich fiktive 2/3-PDF-Cloud-Tests; später separate, idempotente Beleg-/Airtable-/Bestätigungs-Outbox und juristische Freigabe.

---


## 17.10.2026 – Offerten-Portal: private PDF-Downloads vollständig offline integriert und geprüft

**Ausgangslage:** Die fiktive End-to-End-Airtable→Firestore→HTTP-Annahme und reale Chromium-Oberfläche waren lokal getestet, aber der neue Cloud-Run-Portalkern hatte noch keinen echten dokumentgebundenen PDF-Endpunkt. Der frühere Render-STAGING-Endpunkt `/api/offer/document` aus dem Airtable-Altweg durfte nicht einfach als produktiver Ersatz gelten.

**Umgesetzt ausschliesslich im ungemergten Entwicklungszweig `feature/optional-avv-acceptance-staging-20261014`:**
- `cloud-run/archive-reader-staging/archiveBundleVerifier.mjs`: gemeinsame sichere PDF-Byteprüfung, jetzt zusätzlich Export `readVerifiedArchivePdf(bundle,which,...)`. Validiert den im geprüften Angebots-Bündel referenzierten Drive-Eintrag: Dateityp, Elternordner, Content Restriction, Grösse max. 12 MiB, Google-Metadaten-SHA-256 und SHA-256 der **tatsächlich heruntergeladenen Bytes**. Keine vom Browser vorgegebene Google-Drive-Datei-ID.
- `cloud-run/offer-portal-staging/portalCore.mjs`: `document(code,which)` kontrolliert Einladungstoken, Freigabe, Angebotsstatus, Ablauf und AVV-Notwendigkeit **erneut bei jedem Abruf**; erst danach gewährt es geprüfte PDF-Bytes. Eine Annahme ist nicht notwendig bzw. wird durch den Download nicht ausgelöst.
- `cloud-run/offer-portal-staging/portalHttp.mjs`: neuer `POST /api/offer/document` auf dem vorhandenen Adapter; nur gleicher HTTPS-Origin, JSON-Body unter 12 KiB, privater gültiger Code, nie per GET / offenem Drive-Link. Gibt ausschliesslich nach vollständiger Prüfung PDF-Bytes mit `no-store`, `no-referrer`, `nosniff`, `noindex` zurück. AVV-PDF bei `AVV erforderlich=Nein` verboten; invalide/abgelaufene Links 404, geänderte Datei 409, nicht verfügbare Drive-Verbindung 503. Bekannte Archiv-Integritätsfehler werden sicher in 409 übersetzt, sonst keine internen Diagnosen an Kunden.
- `cloud-run/offer-portal-staging/index.mjs`: das Portal-Prototyp-Entrypoint teilt die bestehende schlüssellose Google-Cloud-Dienstidentität / kurzlebige Drive-OAuth-Tokens für Vorprüfung **und** einzelne PDF-Downloads; keine herunterladbaren JSON-Schlüssel.
- `test/offerPortalDocuments.test.js`: sechs synthetische Tests mit positiven 2/3-PDF-Downloads und negativen Fällen (falscher Parent, Sperre, Hash, manipulierte Bytes, falscher Token/Origin, AVV Nein, abgelaufene/bereits akzeptierte Offerte, Drive 403 und deaktiviertes Portal). Keine Google-API-Aufrufe.
- `test-browser/offerPortal.browser.spec.cjs`: tatsächliches Browser-HTML in Chromium nutzt jetzt **den echten PDF-HTTP-Adapter und die echte Prüf-Bibliothek** gegen ausschliesslich synthetisch simulierte Drive-Antworten; Offerte, Projektbedingungen und optionale AVV als Download geprüft, ohne Verträge, Mails oder reale Cloud-Zugriffe. Kein zusätzlicher Server in der Kundenarchitektur benötigt.

**Erfolgreiche CI-Abnahme:** [GitHub Actions 39070152355](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39070152355): **SUCCESS**. Normaler Job 88 Tests, davon **85 PASS, 3 SKIP, 0 FAIL**; Firestore-Emulator **12/12 PASS**, realer Chromium-Browser **3/3 PASS**; read-only-Rollback-Offlinecheck PASS. Ein zwischenzeitlicher HTTP-Fehlstatus bei manipulierten PDFs (503 statt 409) wurde vor dieser grünen Abnahme behoben.

**Was bewusst NICHT passiert ist:** Kein Deployment auf Cloud Run oder Render, keine echte Drive-Datei vom Kunden, kein echter externer Browsertest, keine Airtable-Mutation, kein tatsächlicher Vertragsabschluss, kein PDF-Annahmebeleg, keine Mail, kein Make-Szenario, kein PR-Merge. Die aktuelle Live-Render-Designvorschau bleibt unverändert. Das echte Cloud-Run-Staging `lszh-offer-portal-staging` verbleibt bei seinem früher bestätigten, privaten **read-only-Preflight**, nicht beim hier entwickelten Portalkern; Staging-Zugang für echten Browser noch offen.

**Einfachste geplante Zielarchitektur:** Browseroberfläche **und** Portal-API/PDF-Endpunkte künftig auf **derselben dedizierten Portal-HTTPS-Origin** bereitstellen. Kein Browser→private-Cloud-Run-CORS-Trick und kein öffentlicher Zugriff auf das Archiv-Leser-Dienstkonto. Vor einem echten Deploy: statische HTML-Auslieferung, kontrollierte Staging-Isolation/Rate-Limits, Laufzeit-Identität und minimal berechtigte Rechte prüfen; keine alte sichere Revision überschreiben oder automatisch Traffic umlenken. Erst danach isolierte fiktive Google-Cloud-Browserprüfung mit getrennten Freigaben. Vertrag/AVV juristisch freigeben und Outbox idempotent anknüpfen, bevor eine reale Kundenzusage möglich wird.

---


## 17.10.2026 – Offerten-Staging: echter Chromium-UI-Test + unverbindliche Bestätigungen PASS

**Auftrag `Vamos`:** Den bereits getesteten synthetischen Airtable→PDF→Firestore-Annahmekern nun an die existierende Browseroberfläche koppeln und beide AVV-Fälle ohne produktive Aktivierung testen. Änderungen ausschliesslich auf dem **ungemergten** Staging-Branch `feature/optional-avv-acceptance-staging-20261014`; automatische Render-Deployments bleiben AUS. **Keine** Google-Cloud-/Render-/Make-/Airtable-Schreibaktion, keine echte Kunden-Offerte, kein Vertragsabschluss, keine Mail.

**Korrigierte Datenvertragslücke:** `cloud-run/offer-portal-staging/portalCore.mjs` meldet bei synthetischen Annahmen nun ausdrücklich `test_only:true`, `offer_number`, `confirmation_email_pending:false`; es behauptet keinen Mailversand. `offerte-annehmen/index.html` zeigt für `test_only:true` stattdessen den Hinweis **„Synthetischer Test abgeschlossen – kein Vertrag“** und verbirgt die E-Mail-Zusage. Das normale Nicht-Test-Layout bleibt bestehen und der öffentliche `?demo=1`-Modus lässt weiterhin keinerlei Annahme zu. Assertions in Domain-, Emulator- und UI-Tests angepasst.

**Neue echte Browserprüfung:** `test-browser/offerPortal.browser.spec.cjs`, im bestehenden GitHub-Workflow als separater, ephemerer Chromium-Job. Das **unveränderte echte HTML** wird über einen nur auf `127.0.0.1` gebundenen Testserver geladen. Die persönliche fiktive Offerte ruft den **realen Cloud-Run-Portal-Core und seinen HTTP-Adapter als Code im Testprozess** auf, nicht den Google-Cloud-Run-Dienst. Ein rein synthetischer In-Memory-Store simuliert den Anspruch; die Browser-PDF-Downloadprüfung verwendet ausdrücklich fiktive PDF-Bytes und beweist **keine echte Drive-Archivierung**. Überprüft: Demo-Hinweis und gesperrter Knopf auch nach Refresh, keine Demo-POSTs; AVV Ja/Nein und korrekte Felder, echte Browserformular-Eingaben, Token aus Browser-Verlauf entfernt, synthetische einmalige Annahme, richtiger Belegtext, **keine** Versandankündigung. Kein Secret oder Kunde gelangt in GitHub/Cloud.

**CI:** GitHub Actions [39069543971](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39069543971) vollständig **SUCCESS**. Browser Chromium **3/3 PASS**; normale Unit-Tests **82 insgesamt: 79 PASS, 0 FAIL, 3 SKIP**; benannter Firestore-Emulator **12/12 PASS**, einschliesslich Airtable→PDF-Hash→HTTP→einmaliger Annahme mit/ohne AVV; isolierter Preflight-Rollback-Test PASS.

**Nicht als produktionsreif ausgeben:** Cloud-Run-Service `lszh-offer-portal-staging` läuft gemäss früherer Bestätigung weiter auf privatem, read-only Preflight, **kein neues Deployment, kein echter Cloud-Browser-End-to-End-Test**. Die reale Render-Demoseite ist unverändert. Im aktuellen Cloud-Run-Prototyp fehlt zudem noch das vollständig geprüfte **PDF-Download-Backend**; bisher sind Archiv-Verifikation und Downloadverhalten getrennt getestet. Die idempotente Firestore→Airtable-/Beleg-PDF-/Mail-Outbox ist weiterhin deaktiviert, rechtliche RC1-/AVV-Freigabe fehlt. Nächster sinnvoller Meilenstein: isolierten Cloud-Run-Staging-Zugangsweg und echte Browser-zu-Cloud-API-Anbindung entscheiden, **ohne das interne Archiv-Lese-Ingress öffentlich zu öffnen**; zunächst nur mit synthetischen Daten, ohne Versand oder Vertragswirkung. Erst nach gesonderter operativer Freigabe deployen.

---


## 17.10.2026 – Offerten-MVP: erster kompletter, isolierter Import→Annahme-Test PASS

**Auftrag `Vamos`:** Statt neuer Systeme die bestehende Airtable→Portal→Firestore-Kette mit *synthetischen* Offerten prüfen und Browser-Datenvertrag vereinheitlichen. Alles ausschliesslich auf dem **ungemergten** GitHub-Branch `feature/optional-avv-acceptance-staging-20261014`, Draft-PR #5. **KEIN neuer Render-Deploy**, **KEIN Cloud-Run-Deploy** und **keine** Kunden-, Airtable-, Make-, Mail- oder Vertragsaktionen.

**Konkret korrigiert:**
- `airtableSyntheticImport.mjs`: Neben Preis und AVV jetzt auch die tatsächlichen Airtable-Feld-IDs für **Leistung** (`fldnx2HPMJlyOaPyN`) und **Zahlungsmodell** (`fld5YaoIeYLE1MZFW`) aus der live read-only geprüften Offerten-Tabellenstruktur übernehmen; nur für fiktive, ungeprüfte TEST-ONLY-Entwürfe mit `example.invalid`-Empfänger.
- `portalCore.mjs`: Die Vorschau liefert zusätzlich die von `offerte-annehmen/index.html` verwendeten Felder `company`, `service`, `once`, `monthly`, `payment_model`, `valid_until`, `avv_version` (Bestehendes `details`/`expires_at` beibehalten). Somit werden Daten nicht mehr zwischen Backend und Formular falsch strukturiert.
- **AVV-Nein-Fix:** Browser sendet für nicht benötigte AVV-Felder `avv_sha256:null` und `avv_version:null`; die Portal-Validierung akzeptiert diese Nullwerte jetzt ohne die Zustimmung fälschlich abzulehnen. Tatsächlich angegebene unerwartete AVV-Daten bleiben verboten. Bei AVV-Ja werden vorhandene Versionsangaben gegen den Staging-Datensatz geprüft.

**Neuer durchgängiger Emulator-Test:** `test/offerPortalAirtableE2E.emulator.test.js` mappt zwei echte Airtable-API-förmige **fiktive** Datensätze, seedet sie **nur** im lokalen, benannten Firestore-Emulator, lässt den echten PDF-Integritätsprüfer gegen *simulierte* Google-Drive-PDF-Bytes laufen, ruft echte lokale HTTP-Preview-/Accept-Endpunkte auf, kontrolliert Preise/Versionen/AVV-Felder und sendet je 8 parallele fiktive Annahmeanfragen. Erwartung und Nachweis: jeweils **1 akzeptiert, 7 verweigert**, `status=accepted`, `revision=2`, Nachweis gespeichert, Roh-Token nicht gespeichert, alle externen Folgeaktionen `downstream.airtable/proofPdf/email=disabled`. Synthetische Datensätze werden im Emulator exakt referenziert wieder gelöscht; es gibt **keinen** echten Google-, Airtable- oder Mail-Aufruf.

**CI-Ergebnis:** GitHub Actions [Run 39069039960](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39069039960) **SUCCESS**; reguläre Tests **82 insgesamt, 79 bestanden, 0 Fehler, 3 planmässig übersprungen**; separater Firestore-Emulator **12/12 bestanden, 0 Fehler**, inklusive der zwei neuen kompletten Import→PDF-Prüfung→HTTP→einmalige Annahme-Fälle. Offline-Cloud-Run-Rollback-Check ebenfalls PASS.

**Grenze / nächste Schritte:** Dies beweist die **lokal synthetische** funktionale Kette und den Datenvertrag, **nicht** den echten Browserlauf mit Kunden-Datensätzen. Die Live-Render-Demo bleibt unverändert auf dem vorherigen, geprüften Stand; das vollständige Cloud-Run-Portal ist weiterhin nicht produktiv ausgerollt, `OFFER_ACCEPTANCE_ENABLED=false`; kein PDF-Annahmebeleg, keine Airtable-Statussynchronisierung oder Bestätigungsmail wurde live ausgeführt. Nächste Integration: bereits vorhandenen Cloud-Run-Portal-Entwurf sicher an die isolierte Testumgebung koppeln und die browserseitige Vorschau mit ausschliesslich fiktiven Daten testen, **ohne** produktive Vertragsannahme zu aktivieren. Separat danach: idempotente Annahmebeleg-/Status-/Bestätigungs-Outbox und rechtliche RC1/AVV-Freigabe. **Keine Wiederholung** des bereits erfolgreichen separaten synthetischen Outbox→Quarantäne-Source-E2E-Jobs.

---



## 17.10.2026 – Entwicklungsprinzip: unnötige Komplexität vermeiden / Offerten-Demo

**Leitentscheidung des Geschäftsführers:** LSZH Automations wird künftig konsequent nach „so einfach wie möglich, so sicher wie nötig“ entwickelt. Vor jeder neuen technischen Hürde prüfen: (a) konkreter Sicherheits-/Rechts-/Geschäftsnutzen, (b) einfachere Alternative, (c) Aufwand für Bedienung und Betrieb. Bei reinen fiktiven Design-Demos keine überflüssige Tokenpflicht; echte Kunden-, Vertrags- und Secret-Funktionen unverändert streng absichern.

**Umsetzung im ungemergten Offerten-Staging-Branch** `feature/optional-avv-acceptance-staging-20261014` und ausschliesslich auf der zugehörigen isolierten Render-STAGING-Instanz veröffentlicht (Produktion unverändert):
- Öffentlicher Zugriff ist **nur** auf `GET /offerte-annehmen/?demo=1` erlaubt, und nur wenn `SITE_PRIVATE=true`, `NODE_ENV=staging` und `OFFER_ACCEPTANCE_ENABLED=false`. Exakter Pfad, exakt ein `demo=1`-Parameter; harmlose, begrenzte UTM-Tracking-Parameter (z. B. `utm_source=chatgpt.com`) sind erlaubt, weil Browser-/Chat-Links sie automatisch anfügen. Echte `code`-/`preview`-Parameter und sonstige unbekannte Query-Parameter bleiben bei 503 gesperrt. Das fiktive Angebots-HTML verwendet lokale Musterwerte; Formular-Submit und PDF-Downloads sind im Demo-Modus deaktiviert.
- Sämtliche anderen GET-/HEAD-Routen (auch echte Offerten-URLs und Onboarding) sowie sämtliche POST-/API-Routen bleiben ohne Preview-Zugang auf HTTP 503. Durch den öffentlichen Demo-Aufruf wird **kein** Preview-Cookie gesetzt.
- `SITE_PRIVATE`, `OFFER_ACCEPTANCE_ENABLED`, Make, Airtable, Gmail und Produktionswebsite **nicht verändert**. Bestehender separater privater Preview-Mechanismus bleibt vorhanden für andere Staging-Bereiche.
- Lokale synthetische HTTP-Regression in `test/offerStaging.private.test.js` ergänzt: Demo 200, private Seiten und APIs 503, kein Cookie, keine Freigabe bei `NODE_ENV=production` oder aktivierter Vertragsannahme.
- **Bestätigt:** GitHub-Actions-Lauf `39068073401` vollständig `SUCCESS` (inklusive HTTP-Schutztests und Firestore-Emulator). Render-STAGING `srv-db88q5jncjis73f2g93g` nach ausdrücklicher Workspace-Bestätigung manuell auf Commit `6e6b8cfb7deeaa764e90c2442fd0dd5729d471ff` deployed (`dep-db9ttf7avr4c73fdabng`, Status `live`). Build erfolgreich, `node server.js` lauscht auf Port 10000. `autoDeploy=no` bleibt erhalten, Produktion unberührt. **Browser-Nachweis durch Geschäftsführer am 17.10.2026:** `https://lszh-offer-acceptance-staging.onrender.com/offerte-annehmen/?demo=1` rendert sichtbar die Demoansicht mit Musterformular (Screenshot im Projektchat), ohne Preview-Token und ohne 503. Damit ist die praktische Erreichbarkeit der reinen Demo bestätigt. **Nicht geprüft:** Ein realer Annahme-/POST-Durchlauf (absichtlich deaktiviert) und der externe HTTP-Aufruf mit angehängtem UTM-Parameter (im Code und in CI getestet). **UX-Beobachtung:** Im Demoformular bleiben personenbezogene Eingabefelder, Zustimmungs-Checkboxen und ein deaktivierter Knopf 'Offerte verbindlich annehmen' sichtbar. Nächste optionale Vereinfachung: Demomodus klar als nicht rechtsverbindliche Leseansicht gestalten, ohne echte Annahmelogik zu verändern.

---


_Stand: 17.10.2026. Interne Arbeitsdokumentation. Keine Passwörter, API-Schlüssel oder Token hier eintragen._

## Geschäftsmodell / Eigentümerschaft

- LSZH Automations erbringt Beratung, Entwicklung, Einrichtung, Tests, Dokumentation und optionale Wartung für Schweizer KMU.
- **Kundenbetrieb:** Der Kunde nutzt eine eigene Make-Organisation und behält deren Kontrolle, Abrechnung, Ressourcen und Szenarien. Unser Zugang erfolgt über eine gezielte Einladung mit angemessener Berechtigung.
- Make-Pläne und -Credits werden vom Kunden direkt mit Make abgerechnet. LSZH stellt separat Dienstleistungen und laufende Betreuung in Rechnung.
- Der Erstkontakt und die Offerte setzen keine Registrierung bei Make voraus. Registrierung/Einladung folgen erst nach Annahme.
- Möglichst OAuth/Anbieterfreigaben verwenden. Keine Kundenpasswörter per Mail oder in Airtable abfragen.

## Prozess (verbindliches Zielbild)

1. Anfrage über LSZH-Website: Problem, Unternehmensdaten und Kontakt.
2. Rückfrage/Analyse, Offerte und allfällige vertragliche Vereinbarungen.
3. Annahme der Offerte und ausgelöstes Projekt-Onboarding.
4. Onboarding sammelt Rechnungsdaten, Anforderungen, Systemnamen, Status der kundeneigenen Make-Organisation und Stand der Einladung.
5. LSZH prüft Angaben, Kundenorganisation und benötigte Rollen. Bei Bedarf unterstützt LSZH Registrierung und Einladung.
6. Technische Verbindungen entstehen **in der Make-Organisation des Kunden**, möglichst durch den Kunden selbst mit OAuth.
7. Entwicklung, Funktionstests, Dokumentation, Kundenfreigabe und Go-Live im Kundenkonto.
8. Betrieb/Betreuung über separaten Servicevertrag. Kundeninhaberschaft und Freigaben bleiben erhalten.

## Bereits umgesetzt

- Öffentliche Website mit Kontakt, Leads, Offerten/Rechnungen und persönlichem Kunden-Onboarding (bestehender Prozess beibehalten).
- Formular `/onboarding/`: zusätzlicher Abschnitt **Make & technische Einrichtung** mit optionalem Organisationsnamen und Angaben zu Konto-/Einladungsstatus. Keine Secrets.
- Airtable `Kunden-Onboarding`: Felder **Make-Konto Status**, **Make-Organisation**, **Make-Einladung Status**, **Make-Einrichtung Hinweise**.
- Make `LSZH Kunden-Onboarding – Eingang`: Feldzuordnung auf diese Airtable-Spalten ergänzt.
- Make `LSZH Projekte – Onboarding anfordern`: Einladungsmail nach Offertenannahme erklärt das kundeneigene Make-Modell.
- Bestätigungsmail nach Onboarding: erklärt Organisation, Einladung und nächste Schritte.
- Kundenanleitung `/make-start/` erstellt und im Formular sowie in den E-Mails verlinkt.
- Drei alte Make-OAuth-Szenarien des früheren LSZH-eigenen Kontomodells als **ARCHIV – ALTES MODELL** gekennzeichnet und unverändert inaktiv belassen.
- Secure Transfer funktional mit Dummy-Schlüssel getestet: verschlüsselte Speicherung, einmaliger Abruf, Löschung der gespeicherten verschlüsselten Daten. Noch **nicht** für reale Kundenzugangsdaten freigegeben.

## Status / Sicherheit

- Onboarding-Anforderung und Eingangsszenario bleiben vorerst inaktiv, bis ein vollständiger Test mit einer vereinbarten Testofferte durchgeführt wurde. Keine unaufgeforderten Mails auslösen.
- Die Schlüssellieferung über Secure Transfer darf noch nicht produktiv eingesetzt werden, bis die Make-Webhooks authentifiziert und der parallele Abruf wiederholt getestet wurden.
- Neue Make-Verbindungen müssen gegen die jeweilige Kundenorganisation und deren Rollen geprüft werden. Alte LSZH-eigene OAuth-Automationen nicht reaktivieren.
- Make-Plan und Berechtigungen nach tatsächlichem Kundenbedarf prüfen. Nicht jedes Abonnement bietet identische Team-/Rollenoptionen.

## Nächste Tests

1. Neues Formular im Browser prüfen (Desktop / Mobile).
2. Mit freigegebenem Testprojekt Onboarding durchspielen; vier Make-Felder in Airtable kontrollieren.
3. Versand und Inhalt der zwei Kundenmails testen, bevor bisher inaktive Szenarien wieder aktiviert werden.
4. Einladung in eine vom Kunden verwaltete Testorganisation prüfen, ohne dessen Zugangsdaten einzusehen.
5. Kunden-Szenario dort erstellen, mit kundeneigener Verbindung autorisieren und Test/Übergabe dokumentieren.
6. Secure Transfer erst nach separater Security-Abnahme für Ausnahmen nutzen.

## Betrieb / Quellen

- [Website – Kunden-Onboarding](https://www.lszh-automations.ch/onboarding/)
- [Website – Make-Kundenanleitung](https://www.lszh-automations.ch/make-start/)
- [Make – Organizations](https://help.make.com/organizations)
- [Make – Teams](https://help.make.com/teams)
- [Make – Preise/Funktionen](https://www.make.com/en/pricing)

Letzte Architekturentscheidung: 13.10.2026 – Kunden besitzen ihre eigenen Make-Organisationen.


### Nachtrag 15.10.2026 – erste echte schlüssellose Cloud-Run-Archivprüfung PASS

**Erfolgreicher kundendatenfreier Cloud-Run-Lesetest per Geschäftsdienstkonto, vom Geschäftsführer mit Google-Cloud-Logs belegt:**
- Google Cloud Projekt `lszh-automations`, Dienst `lszh-archive-reader-staging`, Region `europe-west6` (Zürich), Node.js 22, Funktionseinstiegspunkt `archiveHealth`. Geschützter IAM-Aufruf und Ingress intern wurden beim Setup ausgewählt; keine Öffentlichkeit freigeben.
- Dienstidentität `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com`; das Konto besitzt ausschliesslich explizite Google-Drive-Lesefreigabe auf Geschäftsarchiv `1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in`. Organisationsrichtlinie `iam.managed.disableServiceAccountKeyCreation` blockiert dauerhaft herunterladbare Dienstkonto-Schlüssel und blieb **aktiv**.
- Verwendeter Code `cloud-run/archive-reader-staging/index.js` prüft via Cloud-Run-Metadata-Endpunkt Dienstkonto-E-Mail, bezieht kurzlebigen Google-OAuth-Token, liest die Metadaten eines fest vorgegebenen synthetischen AVV-Test-PDFs, kontrolliert Geschäftsordner, PDF-MIME, Dateigrösse, Drive Content Restriction `readOnly`, SHA-256-Checksumme und die tatsächlich heruntergeladenen PDF-Bytes. Keine Kunden-, Vertragsabschluss- oder Schreiboperationen.
- Die erste Funktion mit nicht abgewarteter Startprüfung protokollierte keine PASS/FAIL-Meldung. Beim aktualisierten Code mit Top-Level-`await` scheiterte ein Zwischen-Build wegen unvollständiger `index.js` beim manuellen Einfügen (`Unexpected end of input`), **kein** Google-Drive-/IAM-Fehler. Nach vollständigem Kopieren der Originaldatei ist die Cloud-Run-Revision **erfolgreich** bereitgestellt worden.
- **Original Google-Cloud-Logs / Screenshot vom 15.10.2026:** `2026-10-15 11:43:08.476 MESZ – LSZH_ARCHIVE_READER_STAGING: START`, unmittelbar danach `2026-10-15 11:43:09.746 MESZ – LSZH_ARCHIVE_READER_STAGING: PASS`, im Anschluss erfolgreiche Container-Startup-Probe und Cloud-Run-Revision Ready. Dies bestätigt die echte schlüssellose Archiv-Lese- und Byteintegritätsprüfung **für das synthetische PDF**.
- Google-Cloud-Billing laut Nutzerscreenshot Free-Trial mit CHF 250 Testguthaben (damals CHF 0.00 Kosten). Nicht als permanente kostenlose Umgebung behandeln, Guthaben-/Fristablauf beobachten.
- Noch **nicht** vollendet: authentifizierte, minimal berechtigte Render-zu-Cloud-Run-Verbindung bei internem Ingress; dynamische sichere PDF-ID-Zuordnung und Token-/Vertragsfreigabe, Migration alter Privat-Drive-Dateien, produktionsfähige End-to-End-Abnahme und später die juristische Prüfung. **Keine** öffentliche IAM-Invoker-Freigabe, keine produktive Offertenannahme/Versand aktivieren. Render-Staging und Draft PR getrennt von Live behalten.


### Nachtrag 15.10.2026 – schlüsselloser Reader für 2/3 PDFs vorbereitet, Architektur Render/Cloud Run geklärt

**Weiterarbeit ausschliesslich im Entwicklungszweig, ohne Cloud Run neu bereitzustellen:**
- Die bestehende private Cloud-Run-Staging-Funktion `lszh-archive-reader-staging` lieferte am 15.10.2026 mit einem synthetischen AVV-PDF **`LSZH_ARCHIVE_READER_STAGING: PASS`**; dieses reale positive Testergebnis gilt unverändert.
- Neu erstellt: `cloud-run/archive-reader-staging/archiveBundleVerifier.mjs`. Ein wiederverwendbarer interner, schlüsselloser Drive-Archivprüfer für **Offerte + Projektbedingungen** und optional **AVV**, bei dem ein erlaubtes, genau strukturiertes Dokumentenbündel mit Drive-Metadaten, Byte-Stream, SHA-256 und dem Geschäftsstaging-Parent abgeglichen wird; max. 12 MiB je PDF und keine Document-Bytes als Resultat. Negative Pfade (manipulierte PDFs, Parent, Restriktion, Meta, fehlende Rechte, zu grosser Body, unzulässige Input-IDs, Doppel-IDs) in `test/cloudRunArchiveBundle.test.js` geprüft. **GitHub Actions Build `38715878086`: 49/49 Tests erfolgreich**, einschliesslich der vorherigen Tests; Syntaxprüfung in CI ergänzend.
- **Noch nicht in Cloud-Run-`index.js` integriert oder auf den laufenden Dienst deployed**, denn der Reader soll bis zur expliziten Architekturentscheidung mit `Ingress=Intern` und IAM-only gesperrt bleiben. Dies ist keine echte Kunden-Drei-PDF-E2E-Probe und kein Live-Portal.
- Geprüfte Google-Dokumentation ergibt: Render ausserhalb der Google VPC kann den aktuell internen, IAM-geschützten Cloud-Run-Dienst **nicht unmittelbar** anrufen. Ohne eigenen zulässigen Netzwerkweg *und* eine IAM-kompatible Identität ist das keine schlüssellose Render-Cloud-Run-Verbindung. Weder IAM öffnen noch Ingress auf `Alle` ändern, noch geheime URL als Authentisierung behandeln.
- Die Varianten einschliesslich Empfehlung für die **spätere separate, streng token-geschützte Google-Cloud-Kundenannahmeoberfläche**, separater VPC/IAM-Render-Verbindung und einem internen Cloud-Job sind in [LSZH_ARCHIV_GATEWAY_ARCHITEKTUR_20261015.md](./LSZH_ARCHIV_GATEWAY_ARCHITEKTUR_20261015.md) erklärt. **Offener Go-Live-Entscheid:** Hosting des Kundenportals, Ende-zu-Ende-Identität, Datenschutz, Kosten und rechtlich belastbare Dokumentenablage. Der derzeitige Airtable Read/PATCH-Annahmeschritt ist nicht garantiert atomar über mehrere Instanzen, daher parallele Einmalannahme vor Produktivfreigabe technisch absichern.
- GitHub Draft-PR #5 weiterhin offen/ungemergt. Kontrolliert: Produktions-Render-`lszh-automations-site` weiter `main`, eigenes `lszh-offer-acceptance-staging` auf Featurebranch mit Auto-Deploy aus. **Keine Änderungen an Cloud-Run-Live-Konfiguration, Main-Branch oder Make-Freigaben** in dieser Weiterarbeit.


### Nachtrag 15.10.2026 – abgesichertes Cloud-Run-Vertragsportal mit atomarem Staging-Claim vorbereitet

**Auftrag `Vamos`:** Separates Kunden-Vertragsportal auf Cloud Run entwickeln, ohne sofortiges Go-Live, produktive E-Mails oder Kundenaktionen. Der bestehende Cloud-Run-Reader `lszh-archive-reader-staging` hatte am 15.10.2026 `LSZH_ARCHIVE_READER_STAGING: PASS` auf synthetischem AVV-PDF; dieser Google-Lesetest bleibt unangetastet.

**Neue Dateien nur im ungemergten Branch `feature/optional-avv-acceptance-staging-20261014`:**
- `cloud-run/offer-portal-staging/portalCore.mjs`: Angebot per SHA-256 des hochentropischen Einladungstokens, strikt geprüfter Angebotsstatus, Freigabe, Ablauf, Version, Empfänger-E-Mail, Dokumentenhashes und ausdrücklicher AVV-Zustimmung. Vor dem Claim muss die referenzierte Zwei-/Drei-PDF-Archivprüfung **erfolgreich** sein. Der Core enthält keinen direkten Schreib- oder Mail-Transport.
- `cloud-run/offer-portal-staging/firestoreOfferStore.mjs`: Firestore-**Transaktion** mit erneuter Lektüre und Angebots-Fingerprint (inklusive freigegebener Version, Datum, PDF-Dokumenten, Status und Revision). Nur der erste konkurrierende Aufruf darf auf `accepted` ändern. Transaktion enthält **keine** externe Drive-, Airtable-, Make- oder E-Mail-Aktion. Staging-Collection `lszh_staging_offers_v1` wird im Quellcode genannt, **existiert noch nicht**. Jeder Annahmedatensatz führt die Felder `downstream.airtable=disabled`, `downstream.proofPdf=disabled` und `downstream.email=disabled` – auch spätere Nacharbeiten sind noch nicht aktiviert.
- `cloud-run/offer-portal-staging/portalHttp.mjs`: HTTP-Adapter für später, **standardmässig deaktiviert** (`enabled!==true` → 503), nur POST-Pfade Preview/Accept, Origin-Prüfung, 12 KiB Body-Limit, JSON-only, no-store/noindex/no-referrer und sichere allgemeine Fehlertexte. Origin-Prüfung ersetzt **keine** Tokenauthentifizierung oder WAF-Ratelimit.
- `test/offerPortalStaging.test.js` und `test/offerPortalHttp.test.js`: Nur synthetische Fake-Transaktionen, parallele Annahmen, Time-of-Check/Time-of-Use-Änderungen, AVV Ja/Nein, doppelte Token, ungültige Eingaben, Origin und Überlänge. Die neueste GitHub-Actions-Prüfung meldet **63/63 Tests bestanden** (Workflow `38720668578`); nachfolgende Commits wurden ebenfalls geprüft oder warten auf Abschluss.

**Wichtig und noch ausdrücklich offen:** Es wurde **keine** Cloud-Firestore-Datenbank erstellt oder verändert, **kein** neuer Cloud-Run-Portal-Service deployt, kein Firestore-Write-IAM vergeben, **kein** reales Transaktions-E2E ausgeführt. Der bisherige Drive-Reader bekommt **keine** Schreibrechte. Produktiver LSZH-Render auf `main`, privater Staging-Render mit AutoDeploy off, Cloud Run Reader intern mit IAM, Make-Angebotsszenarien inaktiv. Getestete Firestore-Logik arbeitet bisher **gegen einen Mock**, nicht den produktiven Google-Dienst. Neues Portal ist kein rechtswirksamer, freigegebener Vertragsabschluss.

**Bevor ein Kundenportal erreichbar wird:** Separaten Cloud-Run-Dienst und dessen eigene minimal berechtigte Google-Service-Identity projektieren; Firestore Native in Zürich nur für fiktive Tests anlegen, Kosten/Datenschutz klären und mit echter Datenbank unter konkurrierenden Anfragen testen. Beweiskette/atomare Datenführerschaft Firestore ↔ Airtable ↔ Make und eine bewusst erst später aktivierbare Versand-/PDF-Outbox implementieren; im Anschluss browserseitige Dokumentansicht, sichere Einzel-PDF-Downloads, Rate Limits, Abuse/XSS/CSRF-Tests und separate Go-Live-Freigabe. Juristische Prüfung Projektbedingungen/AVV bleibt auf später verschoben. **Keine** Render-Cloud-Run-Verbindung durch Öffnen des bestehenden internen Reader-Ingress.

Technisches Detailhandbuch: [cloud-run/offer-portal-staging/README.md](../cloud-run/offer-portal-staging/README.md). Firestore-Transaktionsreferenz: https://firebase.google.com/docs/firestore/manage-data/transactions


### Nachtrag 15.10.2026 – Cloud-Firestore-Staging technisch vorbereitet und Emulator-Paralleltest bestanden

**Nur sicherer Entwicklungszweig, keine Live-Änderungen:** Die fehlende direkte Google-Cloud-Administration wurde geprüft; derzeit gibt es **kein** verbundenes Google-Cloud- oder Cloud-Run-Administrationswerkzeug. Daher **keine** Datenbank oder IAM-Rolle in Google Cloud erstellt, kein Rechnungs-/Abonnementvorgang eingeleitet.

**Neue Architektur eindeutig festgelegt:** `lszh-offers-staging` ist eine **benannte** Firestore Native/Standard-Datenbank in Zürich (`europe-west6`), die explizit statt `(default)` gewählt wird. Für zukünftiges Cloud Run Portal eigene Dienstidentität `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com` mit IAM-Condition nur für die genannte Datenbank; **keine** Firestore-Writer-Rechte für den bereits existierenden Google-Drive-Archive-Reader und keine herunterladbaren JSON-Schlüssel. Separates Container-/Cloud-Run-Paket unter `cloud-run/offer-portal-staging/` und `cloud-run/Dockerfile.offer-portal-staging` mit Funktionen-Framework, Firestore SDK, Google Application Default Credentials und dem intern importierten 2-/3-PDF-Prüfer. **Noch nicht als Container oder Cloud-Run-Dienst bereitgestellt; IAM und echter Google-Zugriff noch nicht getestet.**

**Fail-Closed:** `stagingConfig.mjs` aktiviert Staging nur bei explizit `LSZH_PORTAL_STAGING_ENABLED=true` und passenden Projekt-, Datenbank-, Archivordner-, Testversion-, Cloud-Run-Service-/Revision-, Origin- und Geheimnisvorgaben; ansonsten verweigert es, ohne DB-/Drive-Zugriffe zu starten. `index.mjs` verifiziert die Cloud-Run-Service-Identity gegen das separate Portal-Dienstkonto und nutzt nur die benannte Firestore-Datenbank mit regionalem `firestore.europe-west6.rep.googleapis.com`-Endpunkt. Als Ziel ist weiterhin alles deaktiviert. Während der Entwicklung enthüllten Negativtests eine zu schwache Revision-Prüfung; sie wurde behoben, bevor weitere Cloud-Arbeiten stattfinden. Live-Aktivierung weiterhin ausdrücklich untersagt.

**Echter Emulator statt nur Mock:** `test/firestoreEmulator.integration.test.js` läuft über separaten GitHub-Actions-Job mit offiziellem Firestore-Emulator auf lokalem `127.0.0.1:8088` im sicheren Demo-Projekt `demo-lszh-automations`, DB-ID `lszh-offers-staging`. **12 parallele Annahmeversuche gegen echte Firestore-Transaktionsengine: exakt 1 Erfolg, 11 Ablehnungen**, `revision=2`, keine Nebenwirkungen (`downstream.email/proofPdf/airtable=disabled`). Workflow `38722305390`: beide Jobs grün – im normalen Testjob **67 bestanden, 1 emulatorabhängiger Test übersprungen**; im dedizierten Emulatorjob **1 tatsächlicher Integrationstest bestanden**. Das ist **kein** echter Google-Cloud-DB- oder IAM-Test. Neuere Dokumentationscommits nur auf dem Featurebranch.

**Kosten und Freigabe:** Google dokumentiert, dass Firestore nur eine free-tier-fähige Datenbank pro Projekt hat; für benannte Datenbanken ist nutzungsabhängige Abrechnung möglich bzw. laut Firestore-Preisdokumentation von der kostenlosen Quote ausgeschlossen. Bei der tatsächlichen Erstellung zuerst Kosten und bestehende Datenbanken prüfen (die angezeigten 250 CHF Free-Trial-Guthaben sind ein früherer Screenshot, nicht ein aktuell verifizierter Betrag). Keine neu angelegte abrechnungsfähige Ressource. Erst nach Nutzerfreigabe in Google Cloud eigene Test-DB und eigenes Portal-Dienstkonto erstellen und minimale, **konditionierte** `roles/datastore.user`-Rolle zuweisen; echte synthetische Firestore-Transaktion plus negative IAM-Tests abnehmen. `(default)` nicht als stillen Ersatz verwenden.

**Konkrete Schritt-für-Schritt-Anleitung:** [LSZH_FIRESTORE_STAGING_SETUP_20261015.md](./LSZH_FIRESTORE_STAGING_SETUP_20261015.md). Technische Detaillierung: [offer-portal-staging/README.md](../cloud-run/offer-portal-staging/README.md). Produktive Render-Website, bestehender privater Cloud-Run-Drive-Reader, Make-Szenarien, Airtable-Kundendaten und juristische RC1-Freigabe **unverändert**.


### Nachtrag 15.10.2026 – Firestore-Testdatenbank durch Kontoinhaber angelegt

Der Geschäftsführer hat in der Google Cloud Console im Geschäftsprojekt `lszh-automations` die **benannte Firestore-Datenbank `lszh-offers-staging`** erstellt. Sein Screenshot zeigt die Seite `Datenbank: lszh-offers-staging` und die Meldung `Ihre Datenbank ist bereit. Sie können jetzt Daten hinzufügen.`; zum Zeitpunkt des Screenshots **keine Collections bzw. Datensätze sichtbar**. Zuvor im Einrichtungsdialog bestätigt: Firestore Standard, restriktive Web-/Mobile-Regeln, Region `europe-west6` (Zürich), PITR und automatische tägliche/wöchentliche Sicherungen ausgeschaltet, von Google verwaltete Verschlüsselung. Die tatsächliche Datenbank- und IAM-Einstellung wurde von uns **nicht** per Google Cloud Admin-API geprüft; der Screenshot belegt den UI-Bereitschaftsstatus.

**Nächste manuelle Aktion:** Im Projekt ein eigenes Dienstkonto `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com` ohne Projektrollen/JSON-Schlüssel erstellen; danach die **datenbankspezifisch eingeschränkte** IAM-Zugriffsberechtigung gründlich konfigurieren und erst mit synthetischen Daten reale Cloud-Firestore-Transaktionen prüfen. Es ist noch **kein** Portalservice deployt, keine Datensammlung angelegt, keine produktive Offerte angenommen, keine E-Mail versendet. Google-Drive-Reader-Identität und Live-Systeme unverändert. Die benannte Testdatenbank kann nutzungsabhängige Kosten verursachen.


### Nachtrag 15.10.2026 – Portal-Staging-Dienstkonto angelegt, IAM-Bindung noch ausstehend

Der Geschäftsführer hat das **separate Google-Cloud-Dienstkonto** `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com` im Geschäftsprojekt `lszh-automations` erstellt; sein Screenshot zeigt den Status **Aktiviert** und den Namen `LSZH Offer Portal Staging`. Dies belegt **noch keine** Firestore-IAM-Rolle, keine Schlüssel-Einstellung und keine Laufzeitverbindung. Die benannte Firestore-Stagingdatenbank `lszh-offers-staging` in Zürich wurde zuvor durch UI-Screenshot als bereit nachgewiesen.

**Nächste Schritte, nicht ausgeführt:** Auf der **Projekt-IAM-Seite**, nicht dem Dienstkonto-Reiter `Berechtigungen`, die Rolle `roles/datastore.user` ausschliesslich mit einer **IAM-Bedingung** `resource.name == "projects/lszh-automations/databases/lszh-offers-staging"` für den neuen Service Principal erteilen. Laut Google ist dies der unterstützte Weg, per Database Resource-Name die Datenbank auf Server-/API-Zugriff zu begrenzen; Google-Cloud-Console-Datenbankansicht ist kein verlässlicher Test für bedingten Datenbankzugriff. Vor Save prüfen, dass keine bedingungslose oder geerbte breitere Firestore-Bindung existiert. Später einen erlaubten Test gegen die benannte DB und einen negativen Test gegen andere DB-IDs unter derselben Identität durchführen. Keine Owner/Editor/Admin-Rolle, keinen JSON-Schlüssel, keine Rechteänderung am bestehenden Archiv-Reader. Produktivsysteme unverändert; rechtliche Prüfung weiterhin verschoben.

Quellen: https://firebase.google.com/docs/firestore/manage-databases ; https://docs.cloud.google.com/iam/docs/managing-conditional-role-bindings .


### Nachtrag 15.10.2026 – bedingte Firestore-IAM-Zuweisung vom Nutzer als erstellt gemeldet

Der Geschäftsführer meldete unmittelbar nach dem IAM-Dialog, die **bedingte Rollenbindung erstellt/gespeichert** zu haben. Im vorausgehenden Screenshot war das Servicekonto `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com` als Prinzipal mit Rolle `Cloud Datastore-Nutzer (roles/datastore.user)` ausgewählt; die beabsichtigte IAM-Bedingung ist `resource.name == "projects/lszh-automations/databases/lszh-offers-staging"` (Titel `LSZHOnlyStagingFirestore`). **Die tatsächlich persistierte Bedingung und die vollständige Liste anderweitiger IAM-Zuweisungen wurden noch nicht aus der Google-Cloud-Console oder API verifiziert**. Kein Zugriff auf die produktive oder Default-Datenbank als erlaubt behaupten. Google bestätigt grundsätzlich Unterstützung bedingter Firestore-Datenbankzugriffe, weist aber darauf hin, dass der Console-UI-Zugriff die IAM-Conditions für Datenbanken nicht verlässlich erzwingt; echte Positiv-/Negativ-API-Tests sind nötig. Nach IAM-Änderungen bis ca. fünf Minuten Caching beachten. Keine Schlüssel angelegt, kein Cloud-Run-Portal bereitgestellt, keine Produktivaktionen durchgeführt.

**Nächste Verifikation:** Unter Projekt-IAM prüfen, dass nur die bedingte `roles/datastore.user`-Bindung am separaten Portal-Staging-Dienstkonto erscheint (keine unbedingte/breitere Rolle). Screenshot der aufgeklappten Rolle/Bedingung oder reiner Policy-Auszug ohne Secrets. Danach Geschäft-Drive-Ordner separat mit Viewer-Rechten für dieses Dienstkonto freigeben und einen **synthetischen** Google-Cloud-Firestore-Positivtest sowie negativen Test gegen andere DB-IDs unter dem neuen Principal aufsetzen, erst mit klarer Freigabe der Infrastruktur. Bestehender Archiv-Reader bleibt unverändert.


### Nachtrag 15.10.2026 – Firestore IAM-Bedingung im CEL-Editor visuell bestätigt

Im Screenshot des geschäftlichen Google-Cloud-UI zum separaten Dienstkonto `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com` zeigte der gespeicherte Bedingungseditor den **genauen IAM-CEL-Ausdruck** `resource.name == "projects/lszh-automations/databases/lszh-offers-staging"` und den Titel `LSZHOnlyStagingFirestore`; die zuvor gespeicherte Rolle war `Cloud Datastore-Nutzer` (`roles/datastore.user`). Damit sind Text und Ziel-Datenbank **visuell bestätigt**, aber die aus der Policy abgeleiteten Zugriffe und mögliche andere/geerbte Rollen bleiben ohne positiven und negativen Firestore-API-Test noch ungeprüft. Im Editor wurden keine inhaltlichen Änderungen beauftragt. Bestehender Cloud-Run-Archivprüfer und Kundenszenarien unverändert.

Nächster geplanter manueller Schritt: Den **geschäftlichen Google-Drive-Vertragsarchiv-STAGING-Ordner** `1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in` gezielt **als Leser** (nicht Editor) an das separate Portal-Staging-Dienstkonto freigeben, ohne allgemeine Linkfreigabe. Danach echte Cloud-Firestore- und Drive-Lese-Zugriffstests ausschliesslich mit synthetischen Daten. Keine Kundenmails oder produktive Vertragsannahme aktivieren.


### Nachtrag 15.10.2026 – Portal-Dienstkonto erhält Geschäftsarchiv-Leserfreigabe, Cloud-Run-Preflight vorbereitet

Der Geschäftsführer hat die **Leser-Freigabe des geschäftlichen Vertragsarchiv-STAGING-Ordners** `1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in` an das separate Portal-Dienstkonto `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com` als **erteilt** bestätigt. Aktuelle Art und Vererbung der Drive-Berechtigung wurden durch uns noch **nicht** über das Portal-Dienstkonto/API verifiziert; allgemeiner Zugriff soll weiter `Eingeschränkt` sein. Die benannte Firestore-Stagingdatenbank `lszh-offers-staging` wurde davor als bereit und leer bestätigt; die konditionierte Cloud-Datastore-User-Rolle und der genaue CEL-Ausdruck `resource.name == "projects/lszh-automations/databases/lszh-offers-staging"` sind per Nutzer-Screenshots visuell bestätigt.

**Neuer isolierter Cloud-Run-Preflight im Entwicklungszweig:** `cloud-run/offer-portal-preflight/{index.js,package.json,README.md}`. Er ist für den noch **nicht** angelegten separaten Cloud-Run-Dienst `lszh-offer-portal-staging` (Zürich) ausgelegt und prüft bei Start mit dessen eigener kurzlebiger Google-Dienstidentität (a) exakte Principal-E-Mail, (b) Geschäftsarchiv-Zugriff und SHA-256-Bytes eines **festen synthetischen PDFs** und (c) einen **nur lesenden** HTTP-200-`listDocuments`-Zugriff auf die benannte Firestore-Datenbank, ohne Collections anzulegen. HTTP-Handler liefert absichtlich immer 503 `staging_disabled`. IAM-Authentifizierung, **Ingress Intern**, max. eine Instanz, keine E-Mails, keine PDF-/Firestore-Schreibaktion. Der Preflight ist **noch nicht** auf Google Cloud bereitgestellt oder ausgeführt. GitHub Actions prüft lediglich JavaScript-Syntax. Eine funktionierende Firestore-Leseliste testet noch **keine** Schreibrechte oder die Ablehnung anderer Datenbanken; hierfür separate Positiv- und Negativtests auf synthetischen Daten nötig.

**Nächste manuelle Aktion:** Zweiten *neuen* Cloud-Run-Staging-Dienst `lszh-offer-portal-staging` unter dem exakt gleichen Portal-Dienstkonto, IAM-Authentifizierung/Ingress Intern, Node.js 22 erstellen; nur Preflight-Code per Editor einfügen. Nicht den bestehenden `lszh-archive-reader-staging` ändern oder den umfangreicheren `offer-portal-staging/index.mjs` deployen. Die ausführliche Schrittfolge steht unter [cloud-run/offer-portal-preflight/README.md](../cloud-run/offer-portal-preflight/README.md). Nach `LSZH_PORTAL_PREFLIGHT: PASS` schrittweise reine Test-Schreib-/Transaktionsprüfung isoliert gestalten. Kein Go-Live oder juristische Prüfung erfolgt.


### Nachtrag 15.10.2026 – Google-Cloud-Portal-Preflight erfolgreich

**Durch Screenshot des Geschäftsführers aus Cloud Run bestätigt (15.10.2026, MESZ):** Der neue **separate** Cloud-Run-Dienst `lszh-offer-portal-staging` in `europe-west6` wurde erstellt und ein ausschliesslich **lesender Preflight** als Revision `lszh-offer-portal-staging-00002-xdh` erfolgreich bereitgestellt. Die Logs zeigen `13:35:33.731 LSZH_PORTAL_PREFLIGHT: START`, `13:35:33.857 IDENTITY_PASS`, `13:35:35.100 DRIVE_PASS`, `13:35:35.207 FIRESTORE_READ_PASS` sowie `13:35:35.207 PASS`. Anschliessend war die Cloud-Run-Startup-Probe erfolgreich und die neue Revision `Ready`.

**Technischer Nachweis:** Das tatsächliche Runtime-Dienstkonto entsprach `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com`. Es konnte **ohne herunterladbare Dienstkontoschlüssel** das synthetische Geschäftskonto-Staging-PDF anhand Parent-Ordner, Metadaten, Content Restriction und heruntergeladener SHA256-Bytes prüfen und eine HTTP-200-Leseabfrage auf der **benannten Firestore-Testdatenbank `lszh-offers-staging` in Zürich** durchführen. Das war ein echter API-Test, nicht nur ein Simulator.

**Sicherheits- und Testgrenzen:** Der HTTP-Endpunkt des reinen Preflights liefert weiterhin ausschliesslich `503 staging_disabled`, keine Annahme oder Kundendaten. Nach Setup per Nutzerscreenshot `Ingress=Intern` und `IAM-Authentifizierung erforderlich`, Laufzeitidentität des Portal-Dienstkontos. **Noch nicht** nachgewiesen: Firestore-Schreibzugriff, negativer IAM-Test gegen andere Datenbanken bzw. mögliche andere/geerbte IAM-Bindungen, reale transaktionale Mehrfachannahme in Cloud Firestore, vollständiger PDF-Bündeltest oder Kundenportal-End-to-End. Bestehender privater Cloud-Run-Archiv-Reader unverändert. Keine Kundenmails, externen Einladungen, Vertragsabschlüsse, produktiven Make-Szenarien oder Live-Websitedeploys.

**Nächster sicherer Meilenstein:** Ausschliesslich synthetischen Cloud-Firestore-Transaktionstest mit separater positiver und negativer IAM-Zugriffskontrolle vorbereiten, erst danach kontrolliert aktivieren; Portal selbst weiterhin deaktiviert. Die juristische Prüfung von Vertragsdokumenten bleibt wie beschlossen verschoben.


### Nachtrag 15.10.2026 – realer Firestore-Schreib-/Parallelitätstest zur Bereitstellung vorbereitet

**Vom Geschäftsführer autorisierter nächster technischer Staging-Meilenstein `Vamos`:** Neue temporäre Testimplementierung `cloud-run/offer-portal-transaction-smoke/{index.js,transactionTest.mjs,package.json,README.md}`, **nur auf dem ungemergten Entwicklungszweig, noch NICHT nach Google Cloud bereitgestellt**. Ihr genauer Einsatzplan und die Wiederherstellung des vorherigen read-only Cloud-Run-Preflight sind in [cloud-run/offer-portal-transaction-smoke/README.md](../cloud-run/offer-portal-transaction-smoke/README.md) dokumentiert.

Der bisherige reale Cloud-Run-Preflight am 15.10.2026 zeigte nachweisbar `IDENTITY_PASS`, `DRIVE_PASS`, `FIRESTORE_READ_PASS` und `PASS` für das neu angelegte Portal-Dienstkonto und die Zürcher `lszh-offers-staging`-DB. Noch kein echter Firestore-**Schreib**nachweis oder sicherer negativer IAM-Test.

**Neue temporäre Testrevision, nach manueller Freigabe durch Cloud-Run-Admin:** Wie zuvor weiterhin `lszh-offer-portal-staging`, `europe-west6`, IAM + Intern, Servicekonto `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com`, Funktionsziel `lszhPortalPreflight`; HTTP bleibt *immer* 503 `staging_disabled`. Der Test überprüft erst die tatsächliche Identity und fragt zum Vergleich **nur lesend** eine synthetische Collection in der alternativen `(default)`-DB ab: explizites **DENIED** wäre positiver Negativbeleg, **NOT_FOUND** bleibt als **INCONCLUSIVE_DB_ABSENT** (kein Sicherheitsbeweis) und unerwartet erfolgreicher Zugriff bricht ab, **bevor** Schreibtests starten. Danach `ref.create()` in **ausschliesslich** `lszh_synthetic_txn_smoke_v1` mit kryptografisch zufälligem Identitätsmarker, 12 parallele SDK-Firestore-Transaktionen: genau ein Statuswechsel `sent → accepted` / Revision `1 → 2`, elf Wiederholungen ohne weitere Mutation. Geschützte Löschung mit Markerprüfung und Readback in `finally`; ohne bestätigte Bereinigung **kein PASS**. Keine Kunden-, Offerten- oder PDF-Daten und keine Make-/Airtable-/E-Mail-Operationen.

**Automatisch bereits nachgewiesen:** Workflow `38729580092` (GitHub Actions): **67/67 reguläre Tests PASS** (1 Emulator-Test dort wie vorgesehen übersprungen), im separaten Firestore-Emulatorjob **2/2 Integrationstests PASS**, darunter der **exakte neue Smoke-Transaktionskern** mit 12 konkurrierenden Transaktionen und geschützter Löschung. Kein Live-Google-Cloud-Schreibtest vor manueller Testrevision. Der Report mit geringfügig verbesserter, sicherer Fehlerkategorisierung wurde danach auf dem Entwicklungszweig angepasst; weitere CI-Prüfung läuft bei Änderungen am Quellcode automatisch.

**Betriebliche Vorsicht:** Sobald die temporäre Cloud-Run-Testrevision manuell eingespielt und protokolliert wurde, unbedingt den vorherigen reinen Lese-`index.js` / `package.json` aus `offer-portal-preflight` wiederherstellen und `transactionTest.mjs` entfernen. Ein Cold Start kann den Test bei jeder neuen Instanz wiederholen. Währenddessen kein öffentliches Ingress, keine unauthentifizierten Invoker, kein JSON-Schlüssel. Mögliche Kosten geringer realer Firestore-Operationen beachten. Eine nicht vorhandene `(default)`-DB ist **kein** negativer IAM-Test und soll nicht extra angelegt werden. Cloud-Run-Staging-Portal weiterhin nicht als echtes Vertragsportal aktiv.


### Nachtrag 15.10.2026 – echter Cloud-Run-Transaktionstest gestartet, Endzustand unbestätigt

Der Geschäftsführer hat die temporäre Firestore-Schreibtestrevision des separaten Cloud-Run-Staging-Dienstes `lszh-offer-portal-staging` eingespielt. Seine Cloud-Run-Log-Screenshots zeigen am **15.10.2026 13:55:28 MESZ**:
- `LSZH_PORTAL_TX_SMOKE: START`
- `LSZH_PORTAL_TX_SMOKE: IDENTITY_PASS`
- `LSZH_PORTAL_TX_SMOKE: IAM_NEGATIVE_INCONCLUSIVE_DB_ABSENT` (die alternative `(default)`-Firestore-Datenbank ist nicht verfügbar; **KEIN** positiver IAM-Isolationsnachweis).

**Wichtige Befundgrenze:** In den Screenshots sind **KEINE** `TRANSACTION_PASS`, `CLEANUP_PASS`, `PASS` oder `FAIL`-Meldungen aus der temporären Revision sichtbar. Der Rollout war kurz danach als bereit gekennzeichnet, aber das beweist weder Schreibrecht noch Abschluss/Bereinigung. Ob das synthetische Dokument in `lszh_synthetic_txn_smoke_v1` erstellt, verändert oder gelöscht wurde, ist bis zur Prüfung dieser Sammlung **unbekannt**. Keine produktive Vertragsannahme, keine externen Mails nachgewiesen. Nicht erneut bereitstellen oder Testcode starten, bevor Datenzustand kontrolliert ist.

**Mögliche Ursache, NICHT bestätigt:** Die temporäre Testrevision startet Firestore-Asynchronarbeit beim Cloud-Run-Start. Der Dienst verwendet **anfragebasierte CPU-Abrechnung** mit min. 0 Instanzen; nach Startup und ohne Anfragen kann CPU stark eingeschränkt sein, sodass Hintergrundarbeiten nicht zuverlässig fortgesetzt werden. Siehe https://docs.cloud.google.com/run/docs/configuring/billing-settings und https://docs.cloud.google.com/run/docs/container-contract. Bei einem gestarteten, dann stockenden Firestore-Test besteht die Möglichkeit eines halbfertigen synthetischen Dokumentes. Deshalb erst Logs (aktuellen Zeitraum, Filter löschen, alle Severity), dann in der **benannten** Firestore-Datenbank die separate `lszh_synthetic_txn_smoke_v1`-Collection ansehen. **Niemals** `lszh_staging_offers_v1` oder Kunden-/Vertragsdaten löschen. Falls kein Abschluss zu sehen ist, nach Sichtung des Testzustands temporären Cloud-Run-Code auf den sicheren, rein lesenden Preflight `cloud-run/offer-portal-preflight` zurücksetzen, ohne weiteren Testlauf. Für echte einmalige Transaktionstests künftig **Cloud Run Job** (kontrollierter einmaliger Aufruf mit CPU bis Prozessende), nicht asynchrone Startup-Arbeit eines anfragebasierten Webdienstes.


### Nachtrag 15.10.2026 – echter Google-Cloud-Firestore-Transaktionstest PASS, Cleanup bestätigt

Der Geschäftsführer hat neue Screenshots der **internen Google-Cloud-Run-Logs** der separaten Staging-Revision `lszh-offer-portal-staging-00003-778` vorgelegt. Am **15.10.2026, 13:55:28–13:55:30 MESZ**, stehen dort:
- `LSZH_PORTAL_TX_SMOKE: START`
- `LSZH_PORTAL_TX_SMOKE: IDENTITY_PASS`
- `LSZH_PORTAL_TX_SMOKE: IAM_NEGATIVE_INCONCLUSIVE_DB_ABSENT` – die Kontroll-Datenbank `(default)` fehlt, **kein positiver Negativ-IAM-Nachweis**.
- `LSZH_PORTAL_TX_SMOKE: TRANSACTION_PASS (12_ATTEMPTS_1_COMMIT_11_DECLINED)`
- `LSZH_PORTAL_TX_SMOKE: CLEANUP_PASS`
- `LSZH_PORTAL_TX_SMOKE: PASS` (13:55:30.269).

**Technisches Resultat: ERFOLGREICH.** Die eigens dafür verwendete Firestore-Test-Collection `lszh_synthetic_txn_smoke_v1` in der benannten Geschäftskonto-Datenbank `lszh-offers-staging` wurde mit synthetischem Datensatz angelegt. Von zwölf gleichzeitigen Firestore-SDK-Transaktionen veränderte exakt eine den Status, elf wurden als bereits abgeschlossen zurückgemeldet. Der Testcode bestätigte die Daten nach dem Commit und die anschliessende geschützte Löschung per erneuter Lesekontrolle, bevor `CLEANUP_PASS` ausgegeben werden konnte. Dies ist ein **echter Cloud-Firestore-Zugriff**, kein Emulator. Der frühere Eintrag «Endzustand unbestätigt» ist durch die nachgereichten Logs **überholt**; eine CPU-Suspendierung lag in diesem Testlauf offenbar nicht vor.

**Noch offen und explizit nicht behaupten:** Die negative Firestore-IAM-Isolation auf anderen existierenden Datenbanken ist nicht abschliessend getestet. Die reale Browser-Offertenannahme mit Zwei-/Drei-PDF-Kontrolle, Firestore-Airtable-Synchronisierung, idempotentem Beweis-PDF und Bestätigungsmail wurde **nicht** ausgeführt und bleibt deaktiviert. Test-Logs enthalten keine produktiven Kunden- oder Vertragsabschlüsse.

**Sofortiger Betriebs-Nachschritt noch NICHT als erledigt bestätigt:** Im **selben** separaten Cloud-Run-Dienst `lszh-offer-portal-staging` aus `cloud-run/offer-portal-preflight/` die ursprünglichen `index.js` und `package.json` wiederherstellen, `transactionTest.mjs` entfernen, Funktionsziel `lszhPortalPreflight` beibehalten und erneut bereitstellen; so kann der einmalige Startup-Schreibtest bei späterem Kaltstart nicht unbeabsichtigt wiederholen. Ingress Intern, IAM geschützt und Servicekonto unverändert. Bestehenden Archiv-Reader nicht anfassen. Produktives Website-/Make-System unverändert.


### Nachtrag 15.10.2026 – Rollback des Cloud-Run-Staging-Tests bei Build gescheitert

Nach nachgewiesenem echtem Cloud-Firestore-Test PASS (12 Transaktionen, 1 Änderung, 11 Ablehnungen, Cleanup bestätigt) versuchte der Geschäftsführer, die **lesende** Cloud-Run-Staging-Vorprüfung `offer-portal-preflight/index.js` und `package.json` wiederherzustellen und `transactionTest.mjs` zu löschen. Screenshot des Cloud-Run-Editors `lszh-offer-portal-staging` zeigt die korrekt wirkenden ersten Zeilen des read-only Codes, den Eintrag **`transactionTest.mjs gelöscht`** und den Einstiegspunkt `lszhPortalPreflight`, aber der neue Quell-Build endete mit **`Quelle wird erstellt (siehe Logs): Fehlgeschlagen`**, nachgelagerte Dienstaktualisierung/Revision/Traffic-Verschiebung abgebrochen.

**WICHTIG: ROLLBACK NOCH NICHT ERFOLGREICH.** Die alte stabile Lese-Revisions-ID war laut früherem Erfolgs-Screenshot `lszh-offer-portal-staging-00002-xdh`, die schreibende Test-Revisions-ID `lszh-offer-portal-staging-00003-778`. Quelle/Bauen fehlschlug bedeutet nicht, dass der alte Code deaktiviert ist. Kein erneuter Schreib-Test, keine erneute Bereitstellung, bis das gelöst ist.

**Empfohlener sicherer Sofortweg:** Cloud Run → `lszh-offer-portal-staging` → **Überarbeitungsverlauf/Revisions** → **Traffic verwalten** → **100 %** auf die **frühere nachweislich lesende** `lszh-offer-portal-staging-00002-xdh`, **0 %** auf die schreibende `...-00003-778`. Erst den aktuellen Revisions-/Traffic-Zustand auf Oberfläche kontrollieren. Offiziell: https://cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration (Cloud Run unterstützt Rollback mittels Traffic-Switch ohne neuen Build). Danach den ersten tatsächlichen Quell-Build-Fehler aus dem verlinkten `Logs`-Abschnitt auswerten (nicht aus dem Screenshot ableiten); ursprüngliche read-only JS- und package.json-Dateien sind im GitHub-Featurebranch gespeichert. Bis eine erfolgreiche nachträgliche Änderung der tatsächlich eingesetzten Revision belegt ist, dauerhaft sichere Bereitstellung nicht als abgeschlossen melden.

### 15.10.2026 – Cloud Run Rollback erfolgreich

Der Screenshot der Cloud Run Revisionsübersicht zeigt die abgeschlossene Traffic-Migration im Dienst `lszh-offer-portal-staging`: `lszh-offer-portal-staging-00002-xdh` (zuvor erfolgreich geprüfter reiner Lese-Preflight) hat 100 % Traffic; `lszh-offer-portal-staging-00003-778` (temporärer Schreibtest) und `00001-j6q` haben jeweils 0 %. Der zuvor fehlgeschlagene Quell-Build wurde dadurch nicht repariert; dessen Ursache ist weiter offen. Die ältere Testrevision bleibt gespeichert. Keine Live-Website- oder produktiven Vertragsänderungen.


### Nachtrag 15.10.2026 – Rollback-Quellcode offline gebaut und HTTP-503-Verhalten bestätigt

Nach dem nachgewiesenen erfolgreichen **Traffic-Rollback auf Revision `lszh-offer-portal-staging-00002-xdh` (100 %)** ist die frühere temporäre Schreibtest-Revision `00003-778` zwar weiterhin vorhanden, hat aber **0 % regulären Traffic**. Ein vorheriger Versuch, die ursprünglichen read-only Quelldateien neu bereitzustellen, scheiterte in Cloud Build; der exakte Fehlerbericht liegt weiterhin nicht vor. **Kein weiterer Cloud-Run-Deploy durchgeführt.**

Neue sicherheitsorientierte CI-Prüfung im Entwicklungszweig in `.github/workflows/offer-acceptance-check.yml` eingerichtet: Sie installiert die **originale** `cloud-run/offer-portal-preflight/package.json` unter Node.js 22, prüft `index.js` auf Syntaxfehler, startet das Functions Framework als lokalen HTTP-Dienst unter ausdrücklich falschem `K_SERVICE=offline-preflight-unit-test` (dadurch **keine Google-Metadata-/Drive-/Firestore-Aufrufe**) und verifiziert, dass eine HTTP-Anfrage zwingend **503** mit `{"error":"staging_disabled"}` ergibt. Der Test wurde nicht gegen Google Cloud ausgeführt und konnte keine Cloud-Build-/IAM-Probleme reproduzieren. GitHub-Actions-Lauf **`38733929006` erfolgreich**: allgemeine Unit-Tests **67 bestanden, 0 fehlgeschlagen, 1 emulatorabhängig übersprungen**, zusätzliche offline Deployment-/HTTP-Sicherheitsprüfung **PASS**, separater Firestore-Emulatorjob **2 bestanden, 0 fehlgeschlagen**. Lauf: https://github.com/lszh-automations/lszh-automations-site/actions/runs/38733929006 .

**Diagnosegrenze:** Der Quellcode im GitHub-Repo ist lokal installierbar, syntaktisch gültig und HTTP-seitig gesperrt. Dies **belegt nicht**, dass die bei Google im UI eingeblendete Quellkopie vollständig identisch war oder dass der Cloud-Build-Dienst Zugriff auf Abhängigkeiten, Artefakt-Registry und Quellarchiv hatte. Für die echte Ursache ist der **Cloud-Build-Fehlerlog** des gescheiterten Rollbacks zwingend zu lesen, über den `Logs`-Link bei `Quelle wird erstellt: Fehlgeschlagen` oder im Build-Verlauf. Möglich sind abweichendes Copy/Paste, `npm`-/Lock-Probleme, fehlende Berechtigungen oder Buildumgebung; bis zum Log **keine Diagnose behaupten**. Auch künftig weder die alte Schreibtestrevision reaktivieren noch Cloud-Run-Produktivflächen öffnen.


### Nachtrag 15.10.2026 – genaue Cloud-Build-Ursache ermittelt: ungültige package.json

Der Geschäftsführer hat den vollständigen fehlgeschlagenen Cloud-Build-Log des Rücksetzversuchs geteilt (Build-ID `4bc8b17a-eaa9-480b-905f-e67a583ef913`, 15.10.2026 12:06:46 UTC). Der Source-Download verlief **SUCCESS**, genau **2 Dateien** wurden ausgepackt. Der **erste echte Build-Fehler** trat im Node.js-Runtime-Buildpack auf, noch bevor JavaScript gestartet wurde: `unmarshalling package.json: invalid character '{' looking for beginning of object key string` (error ID `4f6c1022`). Das ist ein **Syntax-/Formatierungsfehler in der tatsächlich an Google Cloud übermittelten `package.json`**. Ob durch doppeltes Einfügen, fehlende Zeichen oder einen anderen Editorfehler ausgelöst, ist **noch nicht ermittelt**; kein Nachweis für Fehler bei IAM, Firestore oder der originalen `index.js`. Im GitHub-Entwicklungszweig wurde die originale `cloud-run/offer-portal-preflight/package.json` unabhängig bereits offline installiert und die read-only App gestartet und auf HTTP 503 geprüft (GitHub Action `38733929006`, grün).

**Sicherer Fix vorbereitet / noch nicht deployed:** Im Cloud-Run-Quelleditor `lszh-offer-portal-staging` ausschliesslich `package.json` vollständig ersetzen durch den validen Inhalt von `cloud-run/offer-portal-preflight/package.json`; vor dem erneuten Deploy `index.js`, `lszhPortalPreflight`-Funktionseinstiegspunkt und das Fehlen der temporären Datei `transactionTest.mjs` visuell kontrollieren. Dienstkonto, private Ingress-Einstellung, IAM-Authentifizierung unverändert. Bestehender Dienst verbleibt aktuell auf **100 % Traffic für bewährte lesende Revision `...-00002-xdh`**, alte Schreibrevision `...-00003-778` **0 %**. **Noch keine neue Bereitstellung oder Löschung der Revision durchgeführt.** Nach erfolgreichem Build kontrollierte Traffic-Weiterleitung und Logs prüfen; Schreibrevision erst nach dokumentierter Sicherheit und ohne funktionierenden Rollback-Pfad nicht entfernen.

### Nachtrag 15.10.2026 – neuer Read-only-Build erfolgreich, Traffic noch auf Revision 00002

Der Geschäftsführer zeigte die Cloud-Run-Revisionsübersicht des Geschäftsprojekts: nach Korrektur der fehlerhaften `package.json` wurde der neue Build vollständig erfolgreich erstellt (`Quelle wird erstellt`, `Dienst wird aktualisiert`, `Version wird erstellt`, `Traffic wird weitergeleitet` jeweils Abgeschlossen). Neue Revision `lszh-offer-portal-staging-00004-qt7` hat **0 % Traffic**; der bisherige verifizierte Read-only-Preflight `...-00002-xdh` hat **100 % Traffic**. Temporärer synthetischer Schreibtest `...-00003-778` und die Platzhalterrevision `...-00001-j6q` haben **je 0 %**. Dies ist keine aktive Umstellung der neuen Revision und es liegen noch keine aktuellen PASS-Logs von `00004-qt7` vor. Naechster manueller Schritt: Traffic verwalten und auf neue read-only Revision `00004-qt7` 100 %, alle anderen 0 % setzen; nach der Umstellung Logs für `IDENTITY_PASS`, `DRIVE_PASS`, `FIRESTORE_READ_PASS`, `PASS` pruefen. Keine erneuten Schreibtests und keine produktiven Freigaben.


### Nachtrag 15.10.2026 – neue Read-only-Revision 00004-qt7 real erfolgreich getestet

Der Geschäftsführer hat die vollständigen Google-Cloud-Run-Logs des separaten Dienstes `lszh-offer-portal-staging` eingereicht. **Die neueste Revision `lszh-offer-portal-staging-00004-qt7` hat am 15.10.2026 um 12:34:58–12:35:02 UTC (=14:34:58–14:35:02 MESZ) den neuen Build und den tatsächlichen read-only Staging-Preflight erfolgreich abgeschlossen**: `LSZH_PORTAL_PREFLIGHT: START`, `IDENTITY_PASS`, `DRIVE_PASS`, `FIRESTORE_READ_PASS`, `PASS`. Cloud Run meldete die STARTUP-TCP-Probe erfolgreich und Revision `00004-qt7` als `Ready` mit erfolgreicher Service-Aktualisierung.

**Der zuvor dokumentierte `package.json`-Buildfehler ist behoben**, und die nachfolgende neue Lese-Revision wurde in realen Google APIs bestätigt. Der **letzte tatsächliche Screenshot der Traffic-Verteilung** zeigte jedoch `00004-qt7` bei 0 % und `00002-xdh` bei 100 %. Die neuesten Logeinträge `ReplaceService` / `Ready` weisen **keine konkrete Prozentverteilung** aus: eine bereits erfolgte Traffic-Umschaltung auf `00004-qt7` ist daher **noch nicht bestätigt**. Vor Abschluss bitte Revisionsübersicht verifizieren, falls nötig `00004-qt7` auf 100 % und alle übrigen Versionen auf 0 % einstellen. Die temporäre Firestore-Schreibtest-Revision `00003-778` soll 0 % behalten, nicht mehr starten und nach gesicherter Umstellung risikobewusst archiviert/gelöscht werden. Die neue Revision enthält laut vorherigem Editor-Screenshot nur `index.js` und `package.json` und Ziel `lszhPortalPreflight`; produktives Vertragsportal weiterhin deaktiviert.

### Nachtrag 15.10.2026 – 100 % Traffic auf neuer sicherer Lese-Revision bestätigt

Der Geschäftsführer hat im Chat **ausdrücklich bestätigt**, dass die neue Cloud-Run-Revision `lszh-offer-portal-staging-00004-qt7` inzwischen **100 % Traffic** erhält. Die Google-Cloud-Logs der Revision vom 15.10.2026 14:34–14:35 MESZ zeigten bereits `IDENTITY_PASS`, `DRIVE_PASS`, `FIRESTORE_READ_PASS`, `PASS`. Damit ist die Rückkehr auf den geschützten, read-only Preflight nach dem früheren Paket-JSON-Buildfehler abgeschlossen (Traffic-Wert laut Nutzerbestätigung; **nicht** durch unsere eigene Cloud-API-Abfrage verifiziert). Die alte Firestore-Schreibtestrevision `00003-778` zeigte bei der letzten Revisionsübersicht 0 % Traffic, ist aber möglicherweise noch als Revision verfügbar; **noch keine Löschung durchgeführt**. Die produktive Vertragsannahme ist nicht freigegeben. Nächster Schritt: nach erneuter Kontrolle der aktuellen Revisions-/Tag-/Traffic-Zuweisungen die alte Schreibtestrevision aufräumen und den eigentlichen Vertragsportalablauf weiterhin ausschliesslich synthetisch testen.


### Nachtrag 15.10.2026 – vollständiger synthetischer Portal-HTTP- und PDF-Firestore-E2E-Test

**Erledigt im ungemergten GitHub-Entwicklungszweig:** Die eigentliche noch nicht bereitgestellte Portal-Implementierung `cloud-run/offer-portal-staging/{portalHttp.mjs,portalCore.mjs,firestoreOfferStore.mjs}` und der **exakte** Drive-PDF-Verifier `cloud-run/archive-reader-staging/archiveBundleVerifier.mjs` werden jetzt von `test/offerPortalEndToEnd.emulator.test.js` zusammen über echte lokale HTTP-Anfragen und einen offiziellen Firestore-Emulator geprüft. Google-Drive-Metadaten und PDF-Bytes werden **ausschliesslich synthetisch lokal simuliert**; kein Cloud-Google-API-Zugriff durch diesen neuen Test. Die `lszh_staging_offers_v1`-Testeinträge besitzen kryptografisch zufällige synthetische Tokens und werden mit eindeutiger Eigentümerkennzeichnung nach dem Lauf geschützterweise gelöscht.

**Getestete Abläufe für beide Varianten `AVV=Ja` und `AVV=Nein`:**
- HTTP `POST /api/offer/preview`, hashgeprüfte 2/3-PDF-Prüfung über den echten Codepfad, Vertraulichkeit (kein Empfänger oder Google-Drive-Datei-ID in der Vorschau);
- Eigenständige AVV-Zustimmung erforderlich bzw. AVV-Zustimmung bei `Nein` abgewiesen;
- mutierte PDF-Binärdaten bei unveränderten Drive-SHA-Metadaten verhindern die Annahme;
- zwölf gleichzeitig ausgelöste `POST /api/offer/accept`-Anfragen pro AVV-Variante: **genau eine** HTTP-200-Annahme, elf Fehlerantworten für Wiederholungen; **genau ein** Firestore-Statuswechsel `sent→accepted` / Revision `1→2`;
- Nachweisfelder `quote_pdf_sha256`, `terms_pdf_sha256`, AVV-Flag/-Hash sowie weiterhin hart `downstream={airtable:'disabled',proofPdf:'disabled',email:'disabled'}`; kein Roh-Token in Firestore gespeichert.
- Die Tests benutzen die reale Firestore-SDK-Transaktionsimplementierung gegen **den Emulator**, der gemäss Startmeldung **noch keine echten separaten mehreren Datenbanken simuliert**. Eine echte IAM-Datenbankisolation ist damit **nicht** nachgewiesen. Der separate vorherige echte Cloud-Firestore-Smoketest (12-fach und Cleanup-PASS) bleibt als eigenständiger Nachweis bestehen.

**Verifizierter CI-Lauf:** `https://github.com/lszh-automations/lszh-automations-site/actions/runs/38736777386`, abgeschlossen mit **success**: allgemeine Node-Tests **67 bestanden**, separater Firestore-Emulatorjob **4/4 bestanden, 0 fehlgeschlagen** (zwei neue vollständige Portal-E2E-Fälle). Workflow aktualisiert um Skript-Syntaxprüfung, Trigger und Emulatorausführung. Kein Live-Cloud-Run-Deployment, kein GitHub-PR-Merge, keine echten Kundendaten oder Vertragsannahmen, kein Make-/Gmail-/Airtable-Aufruf.

**Nächster Fortschritt Richtung Echttest:** Den Integrationsstand der echten synthetischen Offerten von Airtable/Make in die isolierte Cloud-Firestore-Staging-Collection prüfen, ein abgesichertes synthetisches Seed-/Cleanup-Verfahren für das echte Portal festlegen, und erst nach gesonderter technischer Prüfung die Portal-HTTP-Funktionen kontrolliert testbar machen. Cloud Run bleibt aktuell `00004-qt7` mit **100 % Traffic laut Geschäftsführer** auf dem read-only Preflight, IAM erforderlich, Ingress Intern, Produktivannahme weiterhin gesperrt. Vor jedem Go-Live bleiben eine belastbare Datenführerschaft/Outbox, echte Browser- und Cloud-HTTP-E2E-Tests, negative IAM-Isolationsprüfung, Spam-/Rate-Limits/WAF, revisionssichere Archivierung und die spätere juristische Prüfung offen.


### Nachtrag 15.10.2026 – Airtable-zu-Firestore-Synthetikimport sicher implementiert und getestet

**Echte Airtable-Inspektion, read-only:** Base `appzJiskpAdaR1HEv`, Tabelle `tbljeIUoD7wwKuSmS` (Offerten) samt Feld-IDs und bereits bestehender synthetischer AVV-Testofferte überprüft. `TEST-HTTP-MAKE-AVV-20261014-NO-CONTRACT` ist nur ein Entwurf mit AVV=`Ja` und bisher AVV-Datei-ID/-SHA/-Testversion; es fehlen insbesondere gültiger Token-Hash, separates PDF-ID/SHA-Paar für Offerte und Projektbedingungen, synthetische `example.invalid`-Empfängeradresse, exakter Testversionsstand und Gültigkeitsdatum. **Kein bestehender Datensatz verändert und kein Import dieses unvollständigen Entwurfs ausgeführt.**

**Code im unveröffentlichten Entwicklungszweig:** `cloud-run/offer-portal-staging/airtableSyntheticImport.mjs` implementiert eine reine Airtable-Schema-Abbildung auf das bereits getestete Firestore-Portalformat und eine **ausschliesslich für den lokalen Emulator zugelassene** idempotente `Firestore.create()`-Methode; sie liest unveränderbar `process.env` und prüft explizit Testprojekt, Datenbank und Emulator-Endpunkt. Die tatsächlichen Airtable-Feld-IDs für Token-Hash, AVV Ja/Nein, Version, 2/3 PDF-Datei-IDs und Hashes sind gemappt. Jede echte Kundendomain, produktive/vertragliche Freigabe, ein bereits versandter/akzeptierter Datensatz, fehlende Hashes/Token, widersprüchliche AVV-Felder und fremde Airtable-Base/-Tabelle werden **fail-closed** abgelehnt. `approved=true/status=sent` dürfen nur im ausdrücklich synthetischen **Emulator-Dokument** entstehen; die originale Airtable-Offerte bleibt Entwurf. Kein Roh-Token oder Roh-Kundendatensatz wird kopiert, externe Aktionen `airtable/proofPdf/email` bleiben `disabled`.

**GitHub CI erfolgreich:** https://github.com/lszh-automations/lszh-automations-site/actions/runs/38738225503 mit **72/72 regulären Tests (2 emulatorabhängig übersprungen)** und **10/10 Firestore-Emulator-Tests**, ohne Fehlschläge. Enthält Seed einmal, bei identischer Wiederholung kein Update, abweichende Version Konflikt, präzises Cleanup und alte parallele Annahmeprüfungen. Diese Prüfungen sind **kein echter Cloud-Firestore-Import** und keine juristische Freigabe. Branch nicht gemergt, Cloud Run weiterhin read-only auf `00004-qt7` mit laut Geschäftsführer 100 % Traffic, keine Make- oder E-Mail-Aktivierung.

**Ausführlicher Leitfaden inklusive aller Abnahmekriterien:** [LSZH_AIRTABLE_FIRESTORE_STAGING_HANDOFF_20261015.md](LSZH_AIRTABLE_FIRESTORE_STAGING_HANDOFF_20261015.md).

**Nächster Schritt:** echte synthetische Offerte mit vollständigen 2/3 geprüften TEST_ONLY-Drive-PDFs, eindeutiger `example.invalid`-Empfängeradresse, Testversions-/Token-Hash erstellen; nur danach separate schlüssellose Cloud-STAGING-Seed-/Cleanup-Route planen. Unvollständige reale Altbestände/Vertragsfreigaben niemals nachträglich ergänzen oder reaktivieren. Die produktive Annahme/Bestätigungsmail bleibt gesperrt.
