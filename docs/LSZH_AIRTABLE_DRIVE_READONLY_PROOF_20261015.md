# LSZH – tatsächliche Airtable-/Drive-Leseprüfung und revisionsgenauer Offline-Adapter

**Datum:** 15.10.2026
**Freigabestatus:** ausschliesslich lesende externe Prüfungen und isolierte synthetische GitHub-/Firestore-Emulatortests. Keine produktiven Datenänderungen, keine E-Mail, kein Make, kein Cloud-Run-Deployment, kein wirksamer Vertragsabschluss.

## 1. Verbundenes Airtable (tatsächlich gelesen, ohne Schreiboperation)

- Die bestehende Airtable-Base und Tabelle `Offerten` waren über den verbundenen Connector **lesend erreichbar**. Die für den Annahmenachweis vorgesehenen Felder (Status, Offertennummer, Projektbedingungen-Version, SHA-256-Offerte/-Bedingungen/-AVV und Drive-Datei-IDs, AVV-Flag) existieren.
- Eine enge Suche nach `DEMO-` ergab keinen Treffer. Eine anschliessende auf `DEMO-`, `TEST-` und `STAGING-` begrenzte Lesesuche ergab **11 ausdrücklich als Test bezeichnete Offertennummern**.
- Einen Datensatz namens `TEST-RECOVERY-20261014-NO-CONTRACT` konnte der Connector **über die exakte Datensatz-ID erfolgreich lesend zurückgeben**. Status: `Entwurf`. Er hat **keine Projektbedingungen-Version, keine Angebots-/Bedingungs-/AVV-SHA256-Werte und keine Drive-Datei-IDs**. Deshalb kann er *keinen* vollständigen Vertrags- oder Archiv-Testfall darstellen.
- Der GitHub-Prototyp `airtableReadonlyRecord.js` ist noch **nicht** mit einem tatsächlichen Airtable-API-PAT/OAuth-Konto konfiguriert. Der obige Live-Lesetest erfolgte über den **vorhandenen ChatGPT-Airtable-Connector**, nicht über den späteren Backenddienst; die Identität/Berechtigung dieses Connectors belegt **nicht** die Serverberechtigung des künftigen Cloud-Run-Servicekontos.

## 2. Verbundenes Google Drive (Testarchiv und echte PDF-Bytes gelesen)

- Der früher dokumentierte private Geschäfts-Root-Ordner war über den **aktuell verbundenen Drive-Connector** bei direktem Metadatenabruf **nicht erreichbar (HTTP 404)**. Das kann ein fehlender Zugriff oder eine andere Ordneridentität sein, nicht zwingend eine gelöschte Datei. Es wurde keine Zugriffsberechtigung verändert.
- Ein anderes privates Archiv `LSZH Vertragsarchiv – STAGING (nicht produktiv)` konnte mit einer gezielten Metadatensuche gefunden und **lesend** inspiziert werden. Der Ordner war nicht allgemein geteilt; Google lieferte eine Owner-Berechtigung.
- In dessen Test-Unterordner `_TEST_Archivpruefung_20261013` befand sich die als **`TEST_NICHT_VERTRAG_LSZH_Offerte_DESIGN001.pdf`** gekennzeichnete Datei. Die Datei wurde nur gelesen, nicht verändert. Die Rückgabe von Google zeigte PDF-MIME-Typ, `shared=false`, Eigentümerberechtigung und 77'990 Bytes.
- Die aktuelle Google-Drive-Revisions-ID war **vor und nach** dem tatsächlichen Rohdateidownload unverändert; die Revisionsliste umfasste einen Eintrag mit PDF-MIME und Grösse 77'990 Bytes. **Aber: `keepForever=false`**. Damit ist eine langfristig gesicherte, unveränderliche Archivversion **nicht belegt**.
- Die **tatsächlich heruntergeladenen PDF-Rohbytes** wurden lokal untersucht: `%PDF-`-Datei, **77'990 Bytes**, **3 Seiten**, PDF 1.4, nicht verschlüsselt. Der SHA-256-Hash der Bytes beträgt:
  `8a8effa0088f865f3539f7ea3a0755bc973c2b26611efd36fdadab94c14c7ee1`.
- **Einordnung:** Die Metadaten und die vor/nach dem Download unveränderte Revisions-ID plus der lokale Hash sind gute technische Indizien für einen stabilen Test-PDF-Abruf, jedoch **kein atomarer Nachweis**, dass ein revisionsspezifischer Drive-Byteabruf mit verbindlichem, aufbewahrtem Revisionsschutz vorliegt. Es wurde **kein** Paket aus freigegebener Offerte, Bedingungen und AVV live gegen Google Drive validiert.

## 3. Neuer, ausschliesslich synthetischer revisionsgenauer Prüfbaustein

`syntheticDriveRevisionReadback.js` erhält ausschliesslich **injizierte Mock-Funktionen** (`readMetadata`, `listRevisions`, `readRevisionBytes`) und darf nicht unter Cloud Run oder der echten LSZH-Google-Projektidentität arbeiten. Der Baustein verlangt für jedes erforderliche PDF:

- erwartete Datei-ID und private, ungeteilte PDF-Metadaten; genau einen erwarteten Archivordner und `trashed=false`;
- Revisions-ID entspricht exakt der gemeldeten aktuellen Drive-Revision, die konkrete Revision existiert, besitzt passenden PDF-MIME-Typ und ist in der **künstlichen** Testantwort ausdrücklich mit `keepForever=true` versehen;
- **binäre** Revisionsbytes mit gültiger PDF-Kennung/`%%EOF`, passender Dateigrösse und SHA-256 identisch zum eingefrorenen Vertragsdokument; dies ist **kein** Text-Export eines Google Docs;
- zusätzliche Revision-/Privatsphäre-Nachprüfung **nach** dem Download, sodass im Test erkannte zwischenzeitliche Änderungen die Fixierung sperren;
- nur wenn sämtliche Prüfungen mit Fake-Daten bestanden sind, ruft er `prepareSyntheticContractManifest` auf. Kein Kundenversand und keine Vertragsfreigabe.

`test/syntheticDriveRevisionReadback.test.js` deckt gefälschte Revisionen, nicht dauerhaft aufbewahrte Revisionen, falsche Ordner/Sharing, veränderte Rohbytes, Grösse, korrupte PDFs, Netzwerkfehler und zwischenzeitliche Revision-/Freigabeänderungen ab.

Der bestehende Firestore-Emulator-Test `test/syntheticContractFreeze.integration.test.js` friert jetzt ein Manifest **erst nach diesem synthetischen revisions- und bytebewussten Mock-Readback** ein. Die tatsächlichen Google-Drive-Daten aus Abschnitt 2 wurden **nicht** in Firestore importiert.

## 4. Freigabepunkte und nächste notwendige Entscheidungen

1. Für den künftigen Cloud-Dienst braucht es eine **separate** minimal berechtigte Drive-Identität mit Zugriff auf den definitiv festgelegten privaten Archivordner; die ChatGPT-Connector-Rechte beweisen keine Cloud-Run-Zugriffsberechtigung.
2. Echte Offerte, Projektbedingungen RC1 und AVV RC1 müssen pro Kunde eindeutig versioniert, separat materiell/juristisch freigegeben und revisionssicher archiviert werden. Die Eigenschaft `keepForever=true` selbst ist **nicht** gleichbedeutend mit rechtlich manipulationssicherer WORM-Archivierung.
3. Einen dedizierten vollständig synthetischen Airtable-Datensatz mit versionsgebundenen, gefahrlosen Test-PDFs brauchen wir für eine Live-Read-only-End-to-End-Prüfung. **Kein** solcher Datensatz wurde in diesem Schritt angelegt, und die bestehenden Testdatensätze mit echten Zuständen wurden nicht geändert.
4. Externe Änderungen, produktive Airtable-PATCHes, Make-Start, Kundenlink-Ausgabe, öffentliche Annahme-API, Google-Cloud-Firestore-STAGING-Writes und Dienstkonto-/IAM-Änderungen erfordern weiterhin eine separate ausdrückliche Freigabe.

**Grenze:** Getestete Connector-Lesbarkeit + simulierte Revisionsprüfung sind **nicht** dasselbe wie ein live getesteter, revisionssicherer Vertragsabschluss.
