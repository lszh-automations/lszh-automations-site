# LSZH – echter lesender STAGING-Recheck: Airtable + drei PDF-Rohdateien

**Datum: 15.10.2026. Status: NUR lesende technische Integritätsprüfung.** Weder Airtable- noch Drive-Inhalte wurden verändert. Keine Cloud-Firestore-Writes, Make-Szenarien, E-Mails, Annahmen, Service-Deployments oder rechtliche Freigaben.

## Prüfobjekt und eindeutige Bindung

- Airtable-Base `appzJiskpAdaR1HEv`, Tabelle `Offerten` `tbljeIUoD7wwKuSmS`, Testrecord **`recaH2FUSgUUytImd`**, Offertennummer **`DEMO-OFF-20991231-20261015A1`**.
- Airtable-Offertenstatus **Entwurf**, Gültigkeit `2099-12-31`, Projektbedingungen `TEST_ONLY_TERMS_20261015_A1`, AVV **erforderlich = Ja**, Version `TEST_ONLY_AVV_20261015_A1`.
- Fiktiver Website-Lead `recv49NbSCmc5nEu3`, ausschliesslich `fake-lszh-e2e@example.invalid`. Lead und Offerte gegenseitig verknüpft. Keine realen Kundendaten.
- Privater Ordner `ZZ_SYNTHETISCH_NICHT_VERSENDEN_20261015`, Drive-ID `1TbS-BpxQQmtTKQMiYsCR4bIQmftOoYfP`, Parent `LSZH Vertragsarchiv – STAGING (nicht produktiv)` (`1_1jVIlD2MAwkVxpTsCUIZ-14LjQggmA3`), nur Besitzer-Berechtigung; kein öffentliches Teilen festgestellt.

## Frischer, unabhängiger Bytevergleich

Jede Datei wurde **erneut direkt** über die verbundene Google-Drive-Leseschnittstelle als vollständiger PDF-Rohinhalt geladen. Die Base64-Rohbytes wurden lokal zusätzlich mit SHA-256 verarbeitet; dieselben Dateien wurden danach im Container mit `sha256sum`, `pdfinfo` und `pdftotext` überprüft. Abgleich jeweils gegen **frisch aus dem Airtable-Testrecord abgerufene** Hashwerte und Datei-IDs.

| Testdatei | Drive-Datei-ID | Bytes | Neu berechneter SHA-256 |
| --- | --- | ---: | --- |
| `LSZH_TEST_ONLY_OFFERTENENTWURF_A1.pdf` | `1NZZlVv5KyDT2Dni3a2L4eZxrEmOnZ4Hs` | 2'344 | `25668a6107955d7d91daed947a1718f2aa2e41ad44434ba02b093556577dedf0` |
| `LSZH_TEST_ONLY_PROJEKTBEDINGUNGEN_A1.pdf` | `1ZFcoeGTaU-s6PBeAME2JDY4LQzRjAAlN` | 2'258 | `220311f34f1f5273c3d3b681cafdd447019ac71d818999dcb1118aaad8207415` |
| `LSZH_TEST_ONLY_AVV_A1.pdf` | `1BdpSui0LOv9-LZHfWGpzMcruaAlNKCzG` | 2'224 | `4ac54ac7ba284638eba39b000726cef3c0bbff3db8bd9f881290546f6a208604` |

**Ergebnis 3/3:** Neu berechneter SHA-256 = aktuelles Airtable-Feld = zuvor dokumentierter Upload-Hash, Byte-Länge = Drive-Metadaten = Drive-Revisionsgrösse, PDF MIME `application/pdf`, Header `%PDF-`, Trailer `%%EOF`, exakt ein privater Parent und `shared=false`. Die Dokumente wurden als **je eine PDF-1.4-Seite** gelesen; Inhalte klar `TESTDATEN – NICHT VERTRAG`, keine echte AVV, keine Zahlungs- oder Vertragswirkung. Die Offerte enthält nur synthetischen CHF 0.00-Beispielbetrag und die Fake-Kontaktadresse.

## Revisionscheck vor und nach dem Byteabruf

Alle aktuellen Revisions-IDs wurden **vor dem Download** gelesen und **nach dem Download erneut** gelesen. Keine Änderung festgestellt.

| PDF | Aktuelle Drive-Revisions-ID | `keepForever` |
| --- | --- | --- |
| Offerte | `0B9_so3WW6ZwRaEdnWVF2RDg2dVNwMW8xRWNRQmV5aEdDWHdrPQ` | **false** |
| Projektbedingungen | `0B9_so3WW6ZwRR05QcWdjc290VGo5Rlg4ci8yT1YvdW5PQXUwPQ` | **false** |
| AVV | `0B9_so3WW6ZwRQTcrSVZtTmZaNjJGWFBGMWU2Q2hvZ3N2dkJjPQ` | **false** |

**Freigabegrenze:** Die angezeigte unveränderte *aktuelle* Revision und übereinstimmende Rohbytes sind **kein WORM-/Langzeit-Aufbewahrungsnachweis**. Der bestehende konservative `syntheticDriveRevisionReadback.js`-Gate würde diese drei Revisionen wegen `keepForever=false` weiter ablehnen; es wurde **nicht** stillschweigend gelockert. Selbst `keepForever=true` wäre noch keine hinreichende rechtliche Archivfreigabe.

## Sicherheits- und Systemstatus

- **Airtable nur GET/Liste**; keine Testdaten neu erstellt oder aktualisiert. Der konkrete Testrecord bleibt `Entwurf`; Versand-, Annahme-, Rechtsfreigabe-, Bestätigungs- und Tokenfelder sind nicht aktiviert bzw. nicht gesetzt.
- **Drive nur Dateien/Metadaten/Revisionen gelesen**; keine Retention, Freigabe oder Ordnerrechte verändert. Die 3 PDFs wurden ausschliesslich zum lokalen Lesen heruntergeladen; **keine Raw-PDFs in GitHub committed**.
- **Firestore:** Keine echten Schreiboperationen auf `lszh-offers-staging`. Der isolierte GitHub-Emulatorcode wurde durch diese Lesetests **nicht** als echter Cloud-Run-Server getestet.
- **Make:** keine Scenario-Runs/Aktivierungen und keine Mailauslösung. RC1-Projektbedingungen und AVV RC1 bleiben rechtlich separat zu genehmigen.

## Noch offene Abnahmekriterien

1. Revisionsaufbewahrung bzw. revisionssichere Archivstrategie formal entscheiden; bis dahin bleibt die Vertragsfreigabe gesperrt.
2. Eindeutig berechtigtes Backend-Dienstkonto samt secret-management/IAM und tatsächlicher serverseitiger Airtable- sowie Drive-GET-Verbindung separat bereitstellen. Die vorhandenen **ChatGPT-Connector-Leserechte** ersetzen das nicht.
3. Einen **vollständigen isolierten End-to-End-Test** gegen den späteren Server mit echter Google-Cloud-STAGING-Datenbank **erst nach ausdrücklicher separater Freigabe** durchführen. Keine E-Mails, keine Kundenlinkversände.
4. RFC/RC1-Dokumente und AVV im rechtlich erforderlichen Verfahren prüfen und freigeben, bevor ein echter Vertrag geschlossen werden kann.

Dieser Bericht **belegt den reinen Datenintegritätsvergleich**, nicht die Betriebs-/Rechtsreife.
