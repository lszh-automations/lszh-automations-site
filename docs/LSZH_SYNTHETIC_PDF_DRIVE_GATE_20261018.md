# LSZH Automations – synthetische PDFs: Archiv- und Cloud-Go/No-Go (18.10.2026)

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

Für sämtliche LSZH-Automations-Dateien ist nur `lars@lszh-automations.ch` und ein dort nachweislich geschäftlich verwalteter Drive-Ordner zugelassen. Die aktuell verbundene ChatGPT-Drive-Sitzung gehört zum privaten Google-Konto und darf **nicht** zum Hochladen, Kopieren, Verschieben, Teilen oder Löschen von LSZH-Dokumenten verwendet werden. Ein separater privater Testordner ist keine Übergangslösung mehr. Siehe `docs/LSZH_DRIVE_BUSINESS_ONLY_POLICY_20261018.md`.

## Vor realem Drive-/Firestore-E2E benötigt

1. **Isolierten Testordner bestimmen:** Ein *eigener leerer*, nur für diese vier synthetischen PDF-Fixtures bestimmter Unterordner, zwingend in der geschäftlich verwalteten Drive-Umgebung unter der nachgewiesenen Geschäftsidentität. Keine normalen Kunden-, RC1-Original- oder Privatdokumente hineinlegen. Standort, Eigentümer, Aufbewahrungsfrist und spätere Entfernung dokumentieren.
2. **Zugriff minimal freigeben:** Dem **separaten** temporären Cloud-Run-Dienstkonto ausschliesslich `reader` auf diesem exakten Testordner geben (und keinesfalls das bisherige private Archiv oder den Original-Reader öffnen). Google-Drive-Zugriff über die Serviceidentität muss separat nachgewiesen werden. Nicht davon ausgehen, dass eine Drive-API-Tokenfreigabe allein die Ordnerberechtigung schafft.
3. **Synthetische PDFs einzeln hochladen:** Vier deterministische Dateien; für jede Datei muss die tatsächlich von Google vergebene ID, `mimeType=application/pdf`, `size`, SHA-256, unveränderter unmittelbarer Parent und aktive `contentRestrictions.readOnly=true` geprüft werden. Das Manifest aus dem Generator enthält vor diesem Vorgang ausdrücklich **keine** gültigen Datei-IDs. Der Archivprüfer darf keine ungeprüfte Behauptung übernehmen.
4. **Separate nur-lesende Cloud-DB-Identität:** Falls Datenzugriff in Firestore erforderlich wird, nur den benannten Staging-DB-Namensraum verwenden, keinen allgemeinen Produktions- oder Standard-Datenbankzugriff. Für das Live-Portal bleibt `syntheticOnly=true`, `acceptEnabled=false`, `downstream.*=disabled`. Der aktuelle Importer ist absichtlich **nur im lokalen Emulator schreibfähig**; nicht freischalten oder mit serviceweite Schreibrolle umgehen.
5. **Eindeutiges Bereinigungskonzept** vor Upload/Seed festhalten, einschliesslich geplanter Frist und objektgenauer Prüfung. Test-PDFs dürfen nicht als rechtlich gültige RC1-Dokumente oder Kundenofferten versendet werden.

## Testergebnisse

CI: [GitHub Actions 39077734136](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39077734136), **SUCCESS**, regulär **107/110 PASS** (3 planmässig übersprungen), Chromium **6/6**, Firestore-Emulator **12/12**, Docker-Staging-Paket PASS.

Test `test/offerSyntheticPdfFixtures.test.js` prüft echte deterministische PDF-Bytes, Manifest, fehlende Cloudfreigabe, negative Upload-Zustände, AVV Ja/Nein, den unveränderten vorhandenen Archivprüfer gegen falsche Datei-Bytes, fehlende Schreibsperre und falschen Drive-Parent sowie synthetischen Portal-Preview ohne Claim.

**Operativer Stand:** Keine Google-Drive-Uploads, keine Firestore-Cloud-Schreiboperation, keine Cloud-Run-/IAM-Änderung, keine E-Mails und keine Annahme. Die erfolgreiche statische Demo auf dem temporären Testdienst bleibt unberührt.
