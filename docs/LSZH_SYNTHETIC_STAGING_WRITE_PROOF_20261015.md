# LSZH – freigegebener synthetischer Airtable-/Drive-Schreibtest

**15.10.2026.** Benutzerfreigabe im Chat: ausschliesslich einen synthetischen STAGING-Testkunden, eine Testofferte sowie drei eindeutig als nicht-vertraglich bezeichnete Test-PDFs in Airtable/Google Drive anlegen. **Keine** echten Kundenkontakte, Vertragsannahmen, E-Mails, Make-Aktivierungen, Cloud-Run-Deployments, produktive Firestore-Writes oder RC1-/AVV-Genehmigung.

## Tatsächlich geschrieben (nur freigegebene synthetische Testdaten)

Airtable-Base `LSZH Automations – Website CRM`, unveränderte Tabellen:

- Fiktiver Lead `recv49NbSCmc5nEu3` in `Website Leads`, Name `TEST PERSON – KEIN ECHTER KONTAKT`, Firma `Musterbetrieb Test AG – FIKTIV`, nur `fake-lszh-e2e@example.invalid`, Quellenmarker `LSZH_SYNTHETIC_STAGING_20261015_NO_MAIL`. Lead-Status nicht auf `Gewonnen` gesetzt.
- Testofferte `recaH2FUSgUUytImd` in `Offerten`: `DEMO-OFF-20991231-20261015A1`, Status `Entwurf`, mit dem synthetischen Lead verknüpft; Lookup der ausschliesslich fiktiven E-Mail-Adresse wurde nach dem Schreiben lesend bestätigt. Gültigkeitsdatum nur synthetisch `2099-12-31`.
- Vertragsversionsbezeichner `TEST_ONLY_TERMS_20261015_A1`, `AVV erforderlich=Ja`, `TEST_ONLY_AVV_20261015_A1`. Keine Versand-/Rechts-/Annahmefreigabe, kein aktiver Tokenhash oder Annahmenachweis; jegliche Kundenaktion bleibt gesperrt.

Drive: privates Archiv `LSZH Vertragsarchiv – STAGING (nicht produktiv)`; **separat neu angelegter Ordner** `ZZ_SYNTHETISCH_NICHT_VERSENDEN_20261015` (ID `1TbS-BpxQQmtTKQMiYsCR4bIQmftOoYfP`). Genau drei als `TESTDATEN – NICHT VERTRAG` beschriftete PDFs wurden als Rohdateien hochgeladen. Die Originaldateien wurden vorher lokal als A4-PDFs erstellt und gerendert.

| Inhalt | Drive-Datei-ID | SHA-256 der ORIGINAL- und nachträglich erneut aus Drive abgerufenen Bytes | Grösse |
| --- | --- | --- | ---: |
| Testofferte `LSZH_TEST_ONLY_OFFERTENENTWURF_A1.pdf` | `1NZZlVv5KyDT2Dni3a2L4eZxrEmOnZ4Hs` | `25668a6107955d7d91daed947a1718f2aa2e41ad44434ba02b093556577dedf0` | 2'344 B |
| Testbedingungen `LSZH_TEST_ONLY_PROJEKTBEDINGUNGEN_A1.pdf` | `1ZFcoeGTaU-s6PBeAME2JDY4LQzRjAAlN` | `220311f34f1f5273c3d3b681cafdd447019ac71d818999dcb1118aaad8207415` | 2'258 B |
| Test-AVV `LSZH_TEST_ONLY_AVV_A1.pdf` | `1BdpSui0LOv9-LZHfWGpzMcruaAlNKCzG` | `4ac54ac7ba284638eba39b000726cef3c0bbff3db8bd9f881290546f6a208604` | 2'224 B |

**Verifizierung:** Die drei Dateien wurden aus Google Drive über den verbundenen Dateizugriff wieder in die Testumgebung kopiert und byteweise mit den Originalen verglichen: **3/3 SHA-256 exakt identisch**, drei Dateigrössen identisch. Metadaten: `application/pdf`, `shared=false`, genau der separate STAGING-Testordner als Parent. Die Airtable-Offerte wurde nach Erstellung durch exakte Record-ID separat abgefragt; alle drei PDF-IDs sowie alle drei SHA-256-Felder stimmten genau. Der Lead-Link und die fiktive E-Mail-Lookupverknüpfung waren korrekt.

## Sicherheitskontrollen

- Make-Team geprüft: relevante Drive-Archiv- und PDF-Prüfszenarien `7965546` und `7965246` **inaktiv**. Die einzig aktiven Make-Szenarien betreffen iOS und Mail-Löschungen, nicht diese Airtable-Tabellen.
- Die Airtable-Automationen wurden nur gelesen. Aktive Lead-Automation `Gewonnen zu Kunde` verlangt `Gewonnen` mit Abschlusswert; der Test-Lead hat keinen solchen Status oder Abschlusswert. Es existierte keine aktive `recordCreated`-Automation auf der Offerten-Tabelle.
- Keine realen Adressaten, keine versendete Nachricht, keine Veröffentlichung eines Links, kein aktiver Annahme-Endpunkt und kein produktiver Vertragszustand erzeugt.

## Revisionsstatus – ausdrücklich NICHT abgenommen

Google Drive liefert für die drei Test-PDFs jeweils eine aktuelle Revisions-ID mit korrektem PDF-MIME und Byte-Grösse:

- Testofferte: `0B9_so3WW6ZwRaEdnWVF2RDg2dVNwMW8xRWNRQmV5aEdDWHdrPQ`
- Bedingungen: `0B9_so3WW6ZwRR05QcWdjc290VGo5Rlg4ci8yT1YvdW5PQXUwPQ`
- AVV: `0B9_so3WW6ZwRQTcrSVZtTmZaNjJGWFBGMWU2Q2hvZ3N2dkJjPQ`

**Alle haben `keepForever=false`.** Die identischen SHA-256-Werte beweisen die Übereinstimmung der abgerufenen *aktuellen* PDF-Bytes, **nicht** eine dauerhaft unveränderliche WORM- oder vertragsrechtlich gesicherte Archivierung. Der rein synthetische Test-Adapter `syntheticDriveRevisionReadback.js` verlangt bisher `keepForever=true`; die gerade erstellten Testdateien erfüllen diesen Teil **noch nicht**. Keine irreführende Freigabe als vollständiger End-to-End-Vertragsnachweis.

## Folgeschritte und Freigabegrenzen

1. Den tatsächlichen Cloud-Run-/Make-freien Lesepfad für diese synthetische Record-ID und Drive-IDs mit einem separaten **serverseitig authentifizierten** Dienst prüfen; die verbundenen ChatGPT-Connector-Rechte sind nicht automatisch die Rechte des späteren Cloud-Run-Dienstkontos.
2. Revisionen dauerhaft aufbewahren (oder besser ein separates manipulationsgeschütztes Archivkonzept definieren) **erst nach eindeutiger Archiv-/Berechtigungsentscheidung**; kein stilles Umgehen des `keepForever`-Gates.
3. Ein lokaler Vergleich kann ohne weitere externe Writes auf Grundlage der dokumentierten SHA-256/IDs erfolgen. Für einen transaktionalen Test in der **echten** benannten Cloud-Firestore-STAGING-Datenbank ist **eine weitere ausdrückliche Freigabe** erforderlich.
4. RC1-Projektbedingungen und AVV RC1 bleiben separate juristische Freigabepunkte. Die erzeugten PDFs tragen ausschliesslich `TEST_ONLY`-Kennzeichen; weder Vertrag noch wirkliche AVV.

**Keine anderen produktiven Daten, Automationsszenarien oder Cloud-Dienste wurden verändert.**
