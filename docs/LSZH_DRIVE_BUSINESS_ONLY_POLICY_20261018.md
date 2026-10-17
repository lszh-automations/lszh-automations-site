# LSZH Automations – Google Drive ausschliesslich geschäftlich

**Verbindliche Entscheidung des Geschäftsführers (18.10.2026):**
Sämtliche heutigen und künftigen LSZH-Automations-Unterlagen, namentlich Staging-/Test-PDFs, Offerten, Rechnungen, Vertragsarchive, Kunden-Dokumente und Belege, werden **ausschliesslich über die geschäftlich verwaltete Google-Drive-Identität `lars@lszh-automations.ch` und geschäftlich verwaltete Ordner** angelegt und verwaltet. Kein weiterer Upload, neuer Ordner, Test oder Zugriff über das private Drive-Konto.

## Tatsächlicher Ist-Zustand

- Die aktuell im ChatGPT-Projekt verbundene Google-Drive-Integration wurde **read-only** geprüft und authentifiziert sich gegen **ein privates Google-Konto**, nicht `lars@lszh-automations.ch`. Die bestehende Integration darf **nicht** für LSZH-Schreiboperationen benutzt werden.
- Ein zuvor auffindbarer privater Ordner mit Bezeichnung «LSZH Vertragsarchiv – STAGING (nicht produktiv)» ist **nicht freigegeben**, gehört nicht in die künftige Geschäftsarchitektur und wird **nicht** zur Quelle für neue Testdateien.
- Die in `cloud-run/offer-portal-staging/stagingConfig.mjs` vorhandene `STAGING.archiveFolderId` wurde **noch nicht** als geschäftlich verwalteter Testordner bestätigt. **Nicht aktivieren, nicht blind ändern** und nicht mit dem gefundenen privaten Ordner gleichsetzen.
- Die geschützte statische Cloud-Run-Designvorschau ist davon unabhängig; ihr Geschäftsdaten-/Drive-Zugriff und alle Angebots-APIs bleiben deaktiviert. Keine Änderungen an Cloud Run oder IAM aufgrund dieser Entscheidung.

## Go/No-Go vor dem nächsten Test mit echtem Google Drive

1. ChatGPT-Google-Drive-Verbindung auf `lars@lszh-automations.ch` **durch den Nutzer** umstellen oder separat mit dieser Identität verbinden und `get_profile` erneut abfragen. Bis dahin **NO-GO für alle Drive-Schreibzugriffe**; das bestehende private Konto nicht zu irgendeinem Ersatz-Testziel erklären.
2. Unter der nachgewiesenen Geschäftsidentität einen **eigenen leeren geschäftlichen Testordner** für die vier ausschliesslich synthetischen PDFs festlegen. Keine privaten Inhalte übernehmen; Betriebs-/Eigentümerstruktur, Audit, Löschung und spätere echte Kundenarchive von den Testdateien trennen.
3. Folder-Metadaten (`id`, `mimeType`, `owners`, `parents`, `driveId`, `permissions`) lesen und **nachprüfbar** der geschäftlichen Identität oder einer geschäftlich verwalteten Shared-Drive-Umgebung zuordnen. Ein Ordnername allein ist kein Eigentumsnachweis. Keine privaten Besitzer-/Datei-IDs im öffentlichen GitHub dokumentieren.
4. Wenn der spätere Cloud-Run-Testdienst auf den Ordner zugreifen muss, nur das zugehörige **temporäre Dienstkonto** auf genau diesen fiktiven Testordner mit minimalem Lesezugriff berechtigen; keinen Gesamt-Drive-Zugriff vergeben.
5. Die vier unverbindlichen Test-PDFs erst danach einzeln hochladen; die zurückgegebenen **echten** Drive-Datei-IDs, Elternordner, MIME, tatsächlichen Dateibytes/SHA-256 und aktive Dateisperre prüfen. Vor einem echten Cloud-Test stehen im Manifest die Datei-IDs weiterhin auf `null`, `cloudUploaded=false`, `archiveVerified=false`.
6. Eine spätere **Migration bereits privat gespeicherter LSZH-Dokumente** ist ein separater, erst nach Bestandsaufnahme, Rechte-/Datenschutzprüfung und ausdrücklicher Einzelfreigabe durchzuführender Vorgang. In dieser Etappe weder private Dokumente lesen/verschieben/kopieren noch aus privatem Drive löschen.

**Betriebsregel:** Keine Annahme eines alten/privaten Archivs als ausreichenden Nachweis. Keine Änderung an `STAGING.archiveFolderId` und kein Cloud-Firestore-Seed, bevor die Geschäftsidentität und das neue geschäftliche Archiv zuverlässig geprüft und protokolliert sind. Vertragsannahme, produktiver E-Mail-Versand und Kundendaten bleiben gesperrt.
