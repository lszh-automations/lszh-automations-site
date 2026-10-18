# LSZH Automations – synthetische PDFs: Archiv- und Cloud-Go/No-Go (18.10.2026)

## TEMP-Cloud-Run-Drive-Reader: angelegt und read-only überprüft

**Betreiber-Abnahme SUCCESS:** Auf dem ausschliesslich geschäftlichen Ordner `LSZH_SYNTHETIC_OFFER_PDFS_20261018_NO_CONTRACT` hat `scripts/offer-temp-drive-folder-reader.py --apply` dem temporären Dienstkonto `lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com` exakt `role=reader` zugewiesen. Der bestehende Originaldienst und die temporäre statische Demo sind laut Cloud-Shell-Ausgabe unverändert. Eine **nachgelagerte read-only-Drive-Metadatenkontrolle über die Geschäftskonto-Verbindung** sieht den neuen `reader`-Eintrag explizit und bestätigt weiterhin das Geschäftskonto als Besitzer und die direkte Elternarchivbeziehung. Keine Benachrichtigungs-E-Mail, keine projektweite IAM-Rolle, keine Freigabe des ursprünglichen Rootarchivs nötig.

**Nächster noch nicht live getesteter Schritt:** Unter dem temporären Cloud-Run-Dienstkonto die Drive-v3-API rein lesend nutzen und die vier Dateien gemäss unabhängig verifizierten vollständigen SHA256-Hashes, direktem Parent und aktiven `contentRestrictions.readOnly` durch den unveränderten `archiveBundleVerifier.mjs` prüfen. Hierzu im Entwicklungsbranch isoliert vorbereitet: `temporaryDriveProbe.mjs`, optionales `GET /_lszh/synthetic-drive-check` im bestehenden Demo-Adapter und `scripts/offer-temp-drive-probe-release.sh`. Dieser temporäre Zusatz-GET bleibt aus, bis eine neue spezifische Revision gezielt deployed ist. Selbst im neuen Modus bleiben alle Offers/Contracts/Emails/Firestore-Ausgänge deaktiviert und die ursprüngliche interne Revision unverändert. Kein Go-Live.

---

## AKTUELL: Geschäftsarchiv-Abnahme abgeschlossen – Drive-Reader-Zugriff für Temp-Dienst offen

**Ergebnis des echten Betreiber-Checks vom 18.10.2026:** Der ausführliche Google-Drive-v3-Sperr- und SHA-256-Prüfer `scripts/offer-business-drive-readonly-verify.py` wurde unter der geschäftlichen Benutzeridentität `lars@lszh-automations.ch` mit exakt vier Testdateien ausgeführt. Er bestätigte **4/4 PASS**: `contentRestrictions.readOnly=true` direkt aus der Drive-API, Geschäftseigentümer, exakter unmittelbarer Elternordner, korrekte Dateigrösse und das SHA-256 der **vollständigen gespeicherten PDF-Bytes**. Ein gültiger vollständiger vierter PASS und abschliessendes `SUCCESS: all four business-Drive PDFs locked and byte-verified.` liegen vor. Die Sperre bleibt reversibel und ist **kein WORM-Nachweis**.

**Nächste noch offene Freigabestufe:** Nur dem **bereits angelegten temporären** Cloud-Run-Dienstkonto `lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com` auf genau dem geschäftlich verwalteten Ordner `LSZH_SYNTHETIC_OFFER_PDFS_20261018_NO_CONTRACT` die Drive-Rolle **Betrachter/reader** erteilen; keine Schreibrechte, kein gesamtes Drive, kein Staging-Hauptarchiv, keine Kundenordner, keine IAM-Projektrolle. Vorher/nachher Geschäftsidentität, unmittelbaren Parent und Ordner- und Datei-Permissions überprüfen. Die aktuelle temporäre Cloud-Demo bleibt dabei mit `LSZH_PORTAL_STAGING_ENABLED=false` ohne PDF-API und ohne Annahme. Ein echter Dienstkonto→Drive-Read-Probe benötigt einen separaten, eng begrenzten Ausführungsweg/Abnahme und darf die Demo-/Annahme-Sperre nicht aufheben.

**Vertraulichkeit:** Echte Datei-IDs und vollständige Post-Upload-Hashes nur im privaten Chat-Prüfbericht und den operatorseitigen Prüfkommandos, nicht im öffentlichen GitHub-Dokument. Keine Cloud-Run-/Firestore-/IAM-Änderungen durch den abgeschlossenen Prüflauf.

---

## Offline-Paket ist fertig

Generator: `scripts/offerSyntheticPdfFixtures.mjs` (Node.js-Standardbibliothek, ohne Google-API, Zugangstokens oder Kundendaten).

```bash
node scripts/offerSyntheticPdfFixtures.mjs --out /tmp/lszh-synthetic-pdfs-20261018
```

Es entstehen vier echte, einfach lesbare und ausdrücklich unverbindliche einseitige PDFs plus `manifest.json` mit exakt berechneten SHA-256-Prüfsummen:

- Zwei unterschiedliche **TEST_*_NO_CONTRACT**-Offerten: AVV Ja und AVV Nein
- Eine vollständig fiktive Version **TEST_v1.0_RC1** der Projektbedingungen
- Eine vollständig fiktive **TEST_ONLY_AVV_v1.0_RC1**

`manifest.json` setzt bewusst `cloudUploaded=false`, `archiveVerified=false`, `driveFileId=null`, `tokenConfigured=false`, `legallyApproved=false`, `acceptanceEnabled=false`, `deliveryEnabled=false`. **Keinesfalls** per Hand in `true` ändern, ohne eine reale, überprüfte Cloud-Operation. Offertenempfänger ist ausschliesslich `synthetic@example.invalid`, nie eine echte Adresse.

Der Generator verweigert Überschreiben vorhandener Testdateien. Vier unabhängige, in CI festgeschriebene **Golden SHA-256**-Werte verhindern Abweichungen zwischen dem an den Betreiber ausgelieferten PDF-ZIP und neu erzeugten GitHub-Fixtures. Vor dem Einchecken von Code wurden die erzeugten PDFs mit einem PDF-Renderer geöffnet, ihr Text gelesen und Dateigrössen/SHA-256 geprüft. PDFs müssen **nicht** als Binärdaten ins öffentliche GitHub-Repository.

## Wichtige Archiv-Grenze

Aktueller Google-Drive-Leseversuch mit der verbundenen Nutzeridentität:

- Die im Code bisher unter `STAGING.archiveFolderId` fixierte Archivordner-ID konnte **mit dieser Verbindung nicht gelesen werden (404)**. Das beweist nicht, dass der Ordner unter einer anderen Identität nicht existiert. Keinerlei Berechtigung oder Datei wurde verändert.
- Ein anders benannter **„LSZH Vertragsarchiv – STAGING (nicht produktiv)”**-Ordner wurde in der verbundenen Drive-Verbindung gefunden. Er gehört zum privaten Drive-Konto, ist laut Metadaten `shared=false`, und es handelt sich **nicht um denselben Ordner wie in der Konfiguration**.
- **NO-GO:** Weder das private Staging-Vertragsarchiv pauschal mit einem Dienstkonto teilen noch die beiden unterschiedlichen IDs als austauschbar behandeln. Keine Blindkorrektur an der bestehenden Cloud-Run-/Reader-Konfiguration.
- Im **öffentlichen** GitHub-Projekt weder private Besitzer-E-Mail-Adressen noch weitere private Drive-IDs veröffentlichen.

## Verbindliche Kontoentscheidung: Nur Geschäftskonto (18.10.2026)

Für sämtliche LSZH-Automations-Dateien ist nur `lars@lszh-automations.ch` und ein dort nachweislich geschäftlich verwalteter Drive-Ordner zugelassen. Die ursprünglich verwendete ChatGPT-Drive-Sitzung gehört zum privaten Google-Konto und bleibt für LSZH tabu. **Die zusätzliche Geschäftsverbindung ist jetzt geprüft und für zukünftige LSZH-Aktionen ausschliesslich zu verwenden.** Ein separater privater Testordner ist keine Übergangslösung mehr. Siehe `docs/LSZH_DRIVE_BUSINESS_ONLY_POLICY_20261018.md`.

## Geschäftlicher Drive-Zugang jetzt nachweislich bestätigt

- Das vom Betreiber neu verbundene Konto wurde über `get_profile` verifiziert: **`lars@lszh-automations.ch`** (verbindlicher LSZH-Arbeitszugang).
- Die bisher im Portal angegebene Staging-Archivordner-ID gehört **tatsächlich zu diesem bestehenden Geschäftskonto**. Die frühere 404-Rückmeldung über den privaten Google-Drive-Zugang war keine fehlende Geschäftskonfiguration.
- Ein **eigener leerer** Test-Unterordner `LSZH_SYNTHETIC_OFFER_PDFS_20261018_NO_CONTRACT` wurde im vorhandenen Geschäftsstagingarchiv erstellt. Sein `parent`, die Eigentümerschaft und die Leere wurden über die Geschäftsverbindung einzeln geprüft; **keine PDF-Dateien hochgeladen**.
- Der Temp-Browser-Dienst hat weiterhin **keine separat freigegebene Drive-Reader-Berechtigung**. Der bisherige Archiv-Reader und interne Portal-Dienst sind am Stagingarchiv bereits Reader; bestehende Rechte **nicht** unnötig ausweiten.
- Kritisch: `archiveBundleVerifier.mjs` verlangt `info.parents.includes(archiveFolderId)` für den **direkten Parent**. Deshalb darf beim späteren Test nicht einfach die ursprüngliche Root-ID mit im **Unterordner** gespeicherten PDFs verwendet werden. Die temporäre, streng geprüfte Unterordner-ID muss separat gepinnt werden; kein globales Update an der bestehenden Staging-Config.
- Für **alle weiteren Drive-Aktionen** ist die explizite Geschäftsverbindung zu verwenden; die private Standardverbindung bleibt tabu.

## Geschäftliche Test-PDFs hochgeladen – neuer Hash- und Schreibsperren-Gate

Am 18.10.2026 vier ausschliesslich synthetische PDF-Fixtures in den ausdrücklich isolierten, geschäftlich besessenen und zuvor leeren Test-Unterordner hochgeladen. Die Geschäfts-Drive-Verbindung `LSZHA` lieferte tatsächliche Datei-IDs; per `get_file_metadata` wurden Eigentümer, direkter Parent, `application/pdf` und fehlender direkter öffentlicher Zugriff für **jede** Datei geprüft. `list_folder` bestätigt exakt vier PDFs. Keine private Drive-Aktion.

**Vorsicht bei Datei-Hashes:** Alle vier Dateien wurden als vollständige Bytes zurückgelesen. Der Inhalt der AVV-Ja-Offerte ist bytegenau gleich der Quelle. Bei den anderen drei ist **nach** den vollständigen Ursprungsbytes ein Content-Credentials-/C2PA-PDF-Anhang vorhanden; vollständige SHA-256 und Grössen weichen deshalb ab. Eine **private Chat-Auditdatei** `LSZH_Business_Drive_Testpdf_Audit_20261018.json` enthält tatsächliche Datei-IDs, beide Hasharten, Byte-Längen sowie einen expliziten Abgleich. Nicht die Original-Fixture-Hashes ungeprüft in ein Live-Bundle übernehmen; keine vertraulichen Drive-IDs ins öffentliche GitHub-Projekt übernehmen.

**Historischer Zwischenstand, inzwischen erledigt:** Die ChatGPT-Drive-Verbindung konnte `contentRestrictions.readOnly=true` nicht direkt nachweisen; dieser Nachweis wurde inzwischen per offizieller Drive-v3-API und operatorseitiger Geschäftsidentität mit 4/4 PASS erbracht. Der vorhandene Archivprüfer verlangt genau diese Sperre sowie Hash und Parent. `cloudUploaded=true` ist nachgewiesen, aber `archiveVerified=false`, `driveReadOnlyVerified=false`, `acceptanceEnabled=false`. Nächste Aktion: Restriktion nur für diese vier Testdateien mit geschäftlichem Konto nachweislich aktivieren, erneut die kompletten Bytes laden/Hash prüfen. Keine Cloud-Run- oder Firestore-Schreibaktionen bis dahin.

## Vor realem Drive-/Firestore-E2E benötigt

1. **Erledigt:** Eigener geschäftlich verwalteter synthetischer Test-Unterordner vorhanden, jetzt mit **genau vier** fiktiven PDFs. Keine Kunden-, RC1-Original- oder Privatdokumente hineingelangen lassen. Spätere Bereinigung ist weiter Pflicht.
2. **Erledigt:** Die eigenständige temporäre Cloud-Run-Dienstidentität ist jetzt **nur auf genau diesem geschäftlichen synthetischen Kindordner** als `reader` eingetragen und über Google-Drive-Metadaten verifiziert. Der tatsächliche API-Leseaufruf aus Cloud Run selbst bleibt ein separater, noch offener Test; die Root-Archivfreigaben und alle Cloud-IAM-/Firestore-Berechtigungen sind unverändert.
3. **Erledigt – Archivprüfung 4/4 PASS:** Vier fiktive PDFs einzeln hochgeladen; tatsächliche Datei-IDs, `mimeType=application/pdf`, Grösse, unmittelbarer Parent und **Post-Upload-SHA-256** geprüft (bei drei Dateien C2PA-Nachtrag). Zusätzlich wurden die **vier aktiven Drive-`contentRestrictions.readOnly=true`-Sperren** und das SHA-256 der vollständigen nach dem Sperren abgerufenen Datei-Bytes durch den Betreiber-Check unabhängig mit PASS bestätigt. Reversibler Lock, kein WORM.
4. **Separate nur-lesende Cloud-DB-Identität:** Falls Datenzugriff in Firestore erforderlich wird, nur den benannten Staging-DB-Namensraum verwenden, keinen allgemeinen Produktions- oder Standard-Datenbankzugriff. Für das Live-Portal bleibt `syntheticOnly=true`, `acceptEnabled=false`, `downstream.*=disabled`. Der aktuelle Importer ist absichtlich **nur im lokalen Emulator schreibfähig**; nicht freischalten oder mit serviceweite Schreibrolle umgehen.
5. **Eindeutiges Bereinigungskonzept** vor Upload/Seed festhalten, einschliesslich geplanter Frist und objektgenauer Prüfung. Test-PDFs dürfen nicht als rechtlich gültige RC1-Dokumente oder Kundenofferten versendet werden.

## Testergebnisse

CI: [GitHub Actions 39077734136](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39077734136), **SUCCESS**, regulär **107/110 PASS** (3 planmässig übersprungen), Chromium **6/6**, Firestore-Emulator **12/12**, Docker-Staging-Paket PASS.

Test `test/offerSyntheticPdfFixtures.test.js` prüft echte deterministische PDF-Bytes, Manifest, fehlende Cloudfreigabe, negative Upload-Zustände, AVV Ja/Nein, den unveränderten vorhandenen Archivprüfer gegen falsche Datei-Bytes, fehlende Schreibsperre und falschen Drive-Parent sowie synthetischen Portal-Preview ohne Claim.

**Operativer Stand:** Keine Google-Drive-Uploads, keine Firestore-Cloud-Schreiboperation, keine Cloud-Run-/IAM-Änderung, keine E-Mails und keine Annahme. Die erfolgreiche statische Demo auf dem temporären Testdienst bleibt unberührt.
