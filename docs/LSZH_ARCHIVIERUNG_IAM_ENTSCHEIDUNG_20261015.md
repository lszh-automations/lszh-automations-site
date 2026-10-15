# LSZH – Archivierungsstrategie und STAGING-Serviceidentität (Entscheidungsvorlage)

**Stand: 15.10.2026 – ENTWURF / KEINE FREIGABE.** Nur read-only Audit und GitHub-Entwicklung. Keine Google-Drive-Retention, kein Cloud Storage Bucket Lock, keine IAM-/Cloud-Run-Änderung, kein echtes Firestore-Schreiben, keine Airtable-Schreiboperation, keine Kundenlinks oder E-Mails.

## Ausgangslage (beobachtete Daten, keine Annahmen)

- Synthetische Airtable-Offerte `recaH2FUSgUUytImd` / `DEMO-OFF-20991231-20261015A1` und fiktiver Lead `recv49NbSCmc5nEu3`; Status `Entwurf`; E-Mail endet auf `example.invalid`. Die Testdokumente sind ausdrücklich **keine** echten RC1-Projektbedingungen/AVV.
- Drei im privaten Testordner `1TbS-BpxQQmtTKQMiYsCR4bIQmftOoYfP` abgelegte PDF-Rohdateien sind nach **erneutem** Google-Drive-Download exakt mit den SHA-256-Feldern in Airtable identisch (3/3). Vor- und Nachlesung ihrer Revisions-IDs stimmt überein; **alle drei Revisionsmetadaten haben `keepForever=false`**.
- Die bisherige Infrastruktur weist einen funktionierenden Cloud-Run-**Preflight**, jedoch noch kein tatsächlich ausgerolltes vollständiges Angebotsportal nach. Keine Credentials für den späteren eigenständigen Annahmedienst verifiziert. Die verbundenen ChatGPT-Airtable-/Drive-Connectoren belegen **nicht** die IAM-Rechte einer künftigen Cloud-Run-Dienstidentität.
- Detail des nachgewiesenen Lesetests: `docs/LSZH_SYNTHETIC_STAGING_READONLY_RECHECK_20261015.md`.

## Architekturempfehlung – zweistufig, noch nicht beschlossen

**Arbeitsbereich:** Google Drive bleibt zunächst für Offertenentwürfe, Vorbereitung und Zusammenarbeit. Für jeden freizugebenden Vertragssatz werden Offerte, Projektbedingungen und (falls nötig) AVV zusammen mit Vertragsversion, SHA-256, Datei-/Revisions-IDs und zugehörigen Zustimmungsdaten versioniert. Ein geändertes Dokument nach Freigabe wird **eine neue Vertragsfassung**, nie eine stillschweigende Änderung der bisherigen Fassung.

**Archivkopie mit stärkerem Schutz:** Für wirklich aufzubewahrende Vertrags-/Rechnungsbelege eine getrennte, nur appendbare Google-Cloud-Storage-Archivablage mit **Retention Policy / Bucket Lock** als zu prüfende Option vorsehen, nachdem Rechts-/Aufbewahrungsfrist, Datenschutz und Kosten geklärt wurden. Bucket Lock ist nach Aktivierung **nicht rückgängig zu machen**; eine verkürzte oder entfernte Retention ist nach Lock unmöglich. **In dieser Projektphase keinesfalls erstellen oder aktivieren.** Alternative Archivprodukte mit gleichwertig geprüftem Aufbewahrungsschutz dürfen separat verglichen werden.

**Drive-`keepForever` als Zwischenoption:** Die Markierung verhindert die *automatische Bereinigung einer Blob-Dateirevision*, ist aber **kein Ersatz für einen gegen privilegierte Löschung geschützten WORM-Datenspeicher**. Google dokumentiert ausserdem eine Obergrenze von 200 aufbewahrten Revisionen je Datei. Die derzeitigen drei Testrevisionen besitzen diese Markierung nicht; kein Override des Fail-closed-Gates zulassen.

**Schweizer Recht:** Art. 958f OR nennt **zehn Jahre ab Ende des Geschäftsjahres** für Geschäftsbücher und Buchungsbelege; diese Pflicht gilt nicht automatisch und unterschiedslos für jeden nie angenommenen Offertenentwurf. Die konkrete Zuordnung von Offerte, akzeptiertem Vertrag, AVV, Rechnungsbeleg und Testdaten zu ihrer Aufbewahrungskategorie muss vor einer dauerhaften Lock-Policy mit juristischer/Datenschutz-Prüfung bestimmt werden. Testdaten nicht blind zehn Jahre festschreiben.

Öffentliche Dokumentation für die Entscheidung:
- Google Drive: https://developers.google.com/workspace/drive/api/guides/manage-revisions
- Google Cloud Storage Bucket Lock: https://cloud.google.com/storage/docs/bucket-lock
- Cloud Run Service Identity: https://cloud.google.com/run/docs/configuring/services/service-identity
- Schweizer KMU-Portal / elektronische Buchhaltungsaufbewahrung: https://www.kmu.admin.ch/de/elektronische-aufbewahrung-der-geschaeftsbuecher

## Abgetrennte Dienstidentitäten – noch NICHT angelegt

Für den späteren **eigenen**, heute noch nicht deployten `lszh-offer-acceptance-staging`-Dienst wird eine **eigens verwaltete Cloud-Run-Serviceidentität** benötigt. Keine exportierten Google-JSON-Keys. Im Prüfmodus:
1. Firestore: nur geprüfter lesender Zugriff auf die vorgesehene **benannte** STAGING-Datenbank `lszh-offers-staging` im Projekt `lszh-automations`. Keine Schreibberechtigung für eine reine Archivprüfung.
2. Google Drive: gezielter Lesezugriff auf den privaten STAGING-Testordner; Eigentümerschaft/Sharing muss separat auf die später verwendete Identität eingestellt und überprüft werden. Weder die ChatGPT-Connector-Identität noch die ältere Preflight-Identität stillschweigend übernehmen.
3. Airtable: separater **read-only**-Token bzw. autorisierte OAuth-Verbindung mit möglichst enger Base-/Tabellenberechtigung. Geheimnis nur in serverseitigem Secret Manager; kein Token im Repository, Airtable-Datensatz, Browser oder Log.
4. Aktive Cloud-Run-Revision `lszh-offer-portal-staging` **nicht** durch die neue Codeversion überschreiben. Ein neuer lesender Dienst braucht ein separat überprüftes Deployment und explizite Nutzerfreigabe.
5. Schreibende Rollen, Annahme-Tokenausstellung, E-Mail, Make, finale RC1-/AVV-Freigaben und Aufbewahrungs-Sperren sind andere Genehmigungen. Nie per read-only-Test automatisch aktivieren.

Der Serviceaccount-Name `lszh-offer-reader@lszh-automations.iam.gserviceaccount.com` ist **nur ein Namensvorschlag**, nicht als existierendes Konto bestätigt.

## Neues rein lokales Prüfgate

`stagingArchiveReadiness.js` plus `test/stagingArchiveReadiness.test.js` ist eine **rein lesende, deterministische Auswertung bereits beschaffter Testbelege**. Prüft u. a. Fake-Offerte in `Entwurf`, PDF-Dreiheit, E-Mail auf `.invalid`, private Ordner-/Datei-Referenzen, gleiche SHA-256-Hashes, Dateigrössen, stabile Drive-Revisions-IDs und `keepForever`, sowie hypothetisch verifizierte minimal berechtigte Serveridentität.

Der für diese drei realen STAGING-Test-PDFs erwartete Status ist **`BLOCKED`** mit vier Gründen: die drei nicht dauerhaft markierten Drive-Revisionen sowie **keine verifizierte spätere Cloud-Run-Dienstidentität**. Der aktuelle **reine PDF-Byteabgleich bleibt 3/3 erfolgreich**. Das Prüfgate trifft **keine** Zugriffs-/Rechtsentscheidung, verfügt über keine Netzwerkclient-API und gibt `permissionToWriteCloudFirestore=false`, `permissionToModifyDriveRetention=false`, `permissionToAcceptContract=false`, `permissionToDeliverEmail=false` selbst dann zurück, wenn alle synthetischen Merkmale hypothetisch erfüllt sind. Ein "READY_FOR_HUMAN_REVIEW" wäre **nie** eine Produktionsfreigabe.

## Offen / nächste autorisierungspflichtige Schritte

- Entscheidung über Archivort, rechtlich erforderliche Aufbewahrung/Datenschutz, Governance und Backup/Export-/Wiederherstellungsplanung.
- Separate Freigabe **für das Einrichten von IAM-/Serviceaccounts, eines Aufbewahrungsarchivs oder Drive-Revision-`keepForever`-Änderungen**. Keine dieser Aktionen erfolgte.
- Echte STAGING-Backend-Read-only-Integration mit nachweisbaren Servicekonto-Berechtigungen, danach isolierter Firestore-Schreibtest nur bei erneuter ausdrücklicher Genehmigung.
- Vor jedem echten Vertragsabschluss: juristische RC1-Projektbedingungen und AVV RC1, eigene Revisions- und Nachweisprüfung, Datenschutz und Betriebsfreigabe.

**Keine Produktionsaktion wurde durch diese Planung ausgelöst.**
