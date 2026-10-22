# LSZH Automations – Google Drive ausschliesslich geschäftlich

**Verbindliche Entscheidung des Geschäftsführers (18.10.2026):**
Sämtliche heutigen und künftigen LSZH-Automations-Unterlagen, namentlich Staging-/Test-PDFs, Offerten, Rechnungen, Vertragsarchive, Kunden-Dokumente und Belege, werden **ausschliesslich über die geschäftlich verwaltete Google-Drive-Identität `lars@lszh-automations.ch` und geschäftlich verwaltete Ordner** angelegt und verwaltet. Kein weiterer Upload, neuer Ordner, Test oder Zugriff über das private Drive-Konto.

## Tatsächlicher Ist-Zustand – Geschäftskonto verifiziert, Testordner angelegt

- **PASS:** Die zusätzlich angeschlossene Google-Drive-Identität `LSZHA` wurde mit dem offiziellen Profil-Endpunkt verifiziert: **`lars@lszh-automations.ch`**. Die frühere private Verbindung existiert separat, wird für LSZH aber **nicht verwendet**.
- **PASS:** `STAGING.archiveFolderId` in `cloud-run/offer-portal-staging/stagingConfig.mjs` verweist exakt auf den **bereits bestehenden geschäftlichen** Ordner «LSZH Automations Vertragsarchiv – STAGING – Geschäftskonto». Drive-Metadaten belegen die Geschäftsidentität als Eigentümer. Der frühere 404 kam vom privaten statt vom geschäftlichen Google-Drive-Zugang; keine Änderung dieser bestehenden ID erforderlich.
- **PASS:** Der eigenständige, nur für rein synthetische AVV-Ja/Nein-PDFs bestimmte leere Unterordner `LSZH_SYNTHETIC_OFFER_PDFS_20261018_NO_CONTRACT` wurde **unter diesem geschäftlichen Staging-Archiv angelegt**, anschliessend Metadaten/Elternordner/Eigentümer nochmals gelesen sowie Leere mit `list_folder` bestätigt. **Keine Dateien hochgeladen.** Ordner-ID nicht in öffentliches GitHub einchecken.
- Das geschäftliche Haupt-Stagingarchiv und der neue Test-Unterordner haben aktuell explizite bzw. geerbte Reader-Berechtigungen für den bisherigen Archiv-Reader und bisherigen internen Portalservice, **aber nicht** für den neu erstellten temporären Browser-Testdienst. Künftige Änderungen nur eng begrenzt auf den Testordner und mit erneuter Rechteprüfung.
- Ein alter privater Staging-Vertragsarchivordner wurde **nicht gelesen, bewegt, freigegeben, gelöscht oder für neue Testdateien verwendet**.
- Die geschützte statische Cloud-Run-Designvorschau ist davon unabhängig; ihre Drive-/Firestore-Zugriffe und alle Angebots-APIs bleiben deaktiviert. Keine Cloud-Run-/IAM-Änderungen vorgenommen.

**Archivprüfer-Besonderheit:** Der bestehende `archiveBundleVerifier.mjs` fordert den **unmittelbaren Elternordner** der PDFs, nicht bloss einen Vorfahren. PDF-Uploads in den neuen Unterordner dürfen deshalb beim späteren temporären Cloudtest **nicht** mit dem Root-Archivfolder als `archiveFolderId` verifiziert werden. Eine eigenständige, exakt auf den Test-Unterordner gepinnte Konfiguration ist erst nach Prüfung zu erstellen; **nicht** die bestehende ursprüngliche Service-/Reader-Konfiguration ändern.

## Go/No-Go vor dem nächsten Test mit echtem Google Drive

1. **Erledigt:** Geschäftskonto via `get_profile` verifiziert. Für jede weitere LSZH-Drive-Aktion immer ausdrücklich die Geschäftskonto-Verbindung `LSZHA` wählen; niemals den privaten Standardlink.
2. **Erledigt:** Isolierter leerer Testordner unter dem bestehenden Geschäfts-Stagingarchiv erstellt, Eigentümerschaft/Parent/Leere geprüft. Kundenarchive und alte Dokumente bleiben unberührt.
3. **Erledigt:** Testordner-Metadaten, Besitzer, Elternordner und aktuelle Rechte mit der Geschäftsidentität direkt abgefragt. Privaten Account niemals als Fallback benutzen und keine privaten Datei-/Besitzer-IDs ins GitHub einchecken.
4. Wenn der spätere Cloud-Run-Testdienst auf den Ordner zugreifen muss, nur das zugehörige **temporäre Dienstkonto** auf genau diesen fiktiven Testordner mit minimalem Lesezugriff berechtigen; keinen Gesamt-Drive-Zugriff vergeben.
5. Die vier unverbindlichen Test-PDFs erst danach einzeln hochladen; die zurückgegebenen **echten** Drive-Datei-IDs, Elternordner, MIME, tatsächlichen Dateibytes/SHA-256 und aktive Dateisperre prüfen. Vor einem echten Cloud-Test stehen im Manifest die Datei-IDs weiterhin auf `null`, `cloudUploaded=false`, `archiveVerified=false`.
6. Eine spätere **Migration bereits privat gespeicherter LSZH-Dokumente** ist ein separater, erst nach Bestandsaufnahme, Rechte-/Datenschutzprüfung und ausdrücklicher Einzelfreigabe durchzuführender Vorgang. In dieser Etappe weder private Dokumente lesen/verschieben/kopieren noch aus privatem Drive löschen.

**Betriebsregel:** Die Geschäftsidentität und das bestehende Geschäftsstagingarchiv sind jetzt bestätigt; `STAGING.archiveFolderId` muss **nicht** geändert werden. Die gesonderte Test-Unterordner-ID und minimale Zugriffsrechte müssen erst vor echtem Cloudtest geprüft und über einen isolierten Testkonfigurationsweg verwendet werden. Kein Cloud-Firestore-Seed vor weiteren expliziten Schranken. Vertragsannahme, produktiver E-Mail-Versand und Kundendaten bleiben gesperrt.
