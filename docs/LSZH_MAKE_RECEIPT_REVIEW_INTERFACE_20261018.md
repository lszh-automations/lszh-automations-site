# LSZH Automations – G3 Make/Firestore-Review-Schnittstelle (Entwurf)

Stand 18.10.2026. Ausschliesslich Offline-/Emulator-Entwicklung. Keine produktive API, kein Go-Live.

## Tatsächlicher Ist-Zustand

Das vorhandene Make-Szenario 7940220 (Annahmebeleg und Bestätigung STAGING) ist inaktiv. Modul 1 sucht Airtable-Offerten, Module 3/4/10/11 prüfen Angebotsdokumente, Modul 2 ist durch 0=1 hart gesperrt. Modul 5 würde bereits ein Google-Dokument anlegen, Modul 6 exportiert es, Modul 7 lädt nach Google Drive hoch. Module 13/14 prüfen/sperren den Beleg, Modul 15 schreibt danach die Drive-ID in Airtable. Der E-Mail-Pfad Modul 8 bleibt durch 0=1 gesperrt.

Die vorgeschaltete Reservierung muss VOR Modul 5 geprüft werden; andernfalls können doppelte Google-Dokumente entstehen, auch wenn ein späterer Drive-Upload blockiert würde. Die Make-Module selbst wurden nicht verändert.

## Synthetische Make-Anfrage (geplanter Vertrag)

- schemaVersion: Ganzzahl 1
- channel: LSZH_MAKE_RECEIPT_REVIEW_STAGING_V1
- syntheticOnly: true
- sourceRecordId: synthetische Airtable-Quell-ID im Format rec + 14 alphanumerische Zeichen
- receiptReviewKey: 64 kleingeschriebene Hexzeichen aus dem intern erwarteten Firestore-Review-Marker
- attemptId: stabile Versuch-ID mit Präfix TEST_ATTEMPT_, bei Wiederholungen identisch

Es sind keine zusätzlichen Felder gestattet. Insbesondere keine rohen Annahme-Links, Tokens, Zugangsdaten, echte Empfänger-E-Mails, PDF-Inhalte oder vom Aufrufer behauptete Weiterverarbeitungsberechtigungen.

**Offene Voraussetzung:** sourceRecordId ist nicht die Firestore-Dokument-ID. Der bestehende Firestore-Store adressiert Offerten per Token-Hash. Ein künftiger intern authentifizierter Dienst muss die eindeutige Zuordnung zwischen Airtable-Quelle und vertrauenswürdigem Firestore-Dokument erst sicher herstellen. Dieser Lookup ist nicht implementiert. Der Source-Record darf nicht blind aus Make als kanonische Quelle übernommen werden.

## Offlineschnittstelle im GitHub-Branch

Die pure Methode prepareSyntheticMakeReceiptReservation(acceptedOffer,payload) prüft die genaue Anfrageform, den Quellrecord und den im *intern bereits vertrauenswürdig* aufgelösten Firestore-Dokument berechneten Review-Marker. Sie gibt nur VALIDATED_OFFLINE_ONLY zurück, keine Berechtigung zur Verarbeitung. Die zweite Methode describeSyntheticMakeReservationResult(acceptedOffer,payload,lockCode) prüft den bekannten Lockcode und gibt STOP_REVIEW_ONLY oder NO_GO zurück.

Alle Resultate setzen stopBeforeModule=5, manualReviewRequired=true sowie canCreateGoogleDoc, canExportPdf, canUpload, canWriteFirestore, canWriteAirtable und canSendEmail ausdrücklich auf false. Dies gilt AUCH für RESERVED_REVIEW_ONLY. Ein Firestore-Review-Lock ist keine PDF-/Mail-Freigabe. Unbekannte Antwortcodes werden abgelehnt.

## Noch offene Architektur- und Freigabefragen

Ein späterer Dienst benötigt authentifizierten, intern autorisierten Zugriff (nicht einen anonym öffentlich erreichbaren Make-Webhook), strenge IAM-/Netz-/Missbrauchskontrollen und eine sichere eindeutige Quellindexierung. Der vorhandene Store-Reservierungseinstieg akzeptiert derzeit nur den lokalen Firestore-Emulator. Nach einer abgelaufenen Review-Frist darf weder automatisch entsperrt noch neu erstellt werden. Für den späteren Belegupload braucht es weiterhin atomare Metadaten bei Erstellung und unabhängige PDF-Byte-/SHA-/Parent-Prüfung. Echtes Airtable-Writeback, Beleg-ID, Provider-Nachricht-ID, Exactly-once-Mails, RC1-/AVV-Rechtsfreigabe und Betriebs-Go bleiben offen.

## Tests

Offline: test/offerReceiptMakeReservationContract.test.js prüft AVV Ja/Nein, Replay, Fremdfelder, manipulierte Firestore-Werte, unbekannte Codes und konsequenten Stopp vor Google Docs.

Emulator: test/offerReceiptProcessingLock.emulator.test.js verwendet Make-förmige synthetische Anfragen sowie echte konkurrierende lokale Firestore-Transaktionen, danach für beide Make-Antworten nur STOP_REVIEW_ONLY.

Es wurde kein HTTP-Endpunkt eingerichtet, kein Make-Szenario aktualisiert oder aktiviert, kein Google-Dokument oder Drive-Beleg erstellt und keine Kundenmail gesendet. G3/G5/G6 bleiben für produktive Folgeaktionen NO-GO.
