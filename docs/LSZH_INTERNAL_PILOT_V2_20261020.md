# Interner Pilot V2 - LSZH Invest GmbH

Betreiberauftrag: LSZH Invest GmbH mit Lars Schulthess und erfundenen Angebotswerten als TEST_ONLY-Pilot. Kein Vertrag, keine Rechnung, keine Kunden-/Auftragsanlage. Anbieter und Empfänger gehören derselben Gesellschaft an. Kein Produktivstart.

## Bereits live vorbereitet

- Neue isolierte Offerte `recZzNiq1LLmCOjNT`, Nummer `TEST_INTERNAL_LSZH_20261020_V2_NO_CONTRACT`. Entwurf, Übernommen-Sperre true, keine Lead-/Kunden-/Auftragsverknüpfung, Rechts-/Echtbetriebs-/Versandfreigaben false.
- Erfundene Werte: CHF 1500 einmalig, CHF 99 monatlich, exkl. MWST; 30 Tage, Betreuung monatlich kündbar. Gültigkeit bis einschliesslich 20.11.2026 (Europe/Zurich). AVV Nein nur für diesen internen Testpfad.
- PDF im bisherigen Testarchiv: `1wv1KNPopuFlfztNTxm8i_dl7h7lmDDPR`, 2995 Bytes, SHA-256 `318d8dda86272ef95528ac29db2a151c4cd4d7b0eeda18cbb4c7b345930d4c07`, readOnly true. Native Make-Archivierung 8079591, erfolgreicher Lauf `f05ece40ae374e658aa6cfdd1efae794`; Werkzeug anschliessend inaktiv. Der Run-Aufruf meldete zunächst einen Connectorfehler; der unabhängige Ausführungs-Readback belegte Erfolg. Nicht erneut ausgeführt.
- Vorhandene TEST_v1.0_RC1-Bedingungen werden nur gelesen: `1yPtsWTeEUclniKFWRM81EHEUMnu1E9nO`, SHA-256 `baec0946db9b892da86e4009ade769863d5087d8961e16940d0dda420d1bf279`. Erneute Hash-/Ordner-/Schreibschutzprüfung beim lokalen Start zwingend.

## Lokaler Start

Im vorhandenen Surface-Projekt nach Fast-forward-Pull:

```powershell
node .\scripts\internal-test-pilot-v2.mjs --start
```

Der Start verwendet ausschliesslich die bereits Windows-verschlüsselte Desktop-Anmeldung des Betreibers. Keine erneute Anmeldung, keine Token-Ausgabe und kein Lesen des alten privaten Einladungsfiles. Der Agent selbst hat diese Anmeldung nicht verwendet; seine lokale gcloud-Ausführung wurde vom Betriebssystem verweigert.

Der Pilot prüft zuerst Identität, den fest benannten CRM-Testrecord und beide archivierten PDFs. Er legt anschliessend einmalig ein synthetisches Angebot und eine dauerhafte Record-/Token-Hash-Bindung in der benannten Staging-Firestore-Datenbank an. Ein Wechsel der lokalen Anmeldung erzeugt keine zweite Einladung für denselben Record. Kein Klartexttoken wird in Dateien oder URLs geschrieben.

Browser: `http://127.0.0.1:8082/offerte-annehmen/`. Nur Loopback, genaue Host-/Origin-Prüfung, keine frei wählbaren Offerten, 15 Minuten Laufzeit. Beide Dokumente prüfen, Lars Schulthess / lars@lszh-automations.ch eingeben und getrennte Testzustimmungen setzen. Ctrl+C beendet den Listener; Angebot und Bindung bleiben als Nachweis erhalten.

Die atomare Annahme verwendet den bestehenden Portal-Kern und Firestore-Transaktionsadapter. Der anschliessende Airtable-Writeback ist auf diesen Record und die bestätigten Felder begrenzt, setzt keine Versand-/Rechts-/Produktivfreigabe. Nach unsicherem Writeback darf der lokale Start erneut nur den bereits gespeicherten Nachweis abgleichen; eine zweite Annahme wird nicht erzeugt.

Erwartete Statusmeldung nach erfolgreichem Browserlauf: `PILOT_V2_ACCEPTANCE_VERIFIED`. Bei bereits gespeicherter, unabhängig abgeglichener Annahme: `PILOT_V2_ALREADY_ACCEPTED_VERIFIED`. Keine geheimen Ausgaben weitergeben.

## Prüfstand und verbleibende Arbeit

Sechs neue Offline-Fälle prüfen exakte Testidentität, Preisprojektion, einmalige Annahme bei Konkurrenz, Einwilligungs-/Hashfehler, CRM-Sperren und geänderte Angebotswerte. Zusammen mit Portal-/lokaler Recovery-Regression 29 Tests bestanden. Gesamter Offline-Lauf: 295 Tests, 288 bestanden, 0 fehlgeschlagen, 7 übersprungen (u.a. gesonderte Emulator-/Python-Prüfungen). Kein neuer Live- oder Emulator-Annahmelauf daraus behauptet.

Die Live-Browserannahme und nachgelagerte Testbestätigung sind inzwischen abgeschlossen; Nachweise unten. Das Startskript sendet selbst keine Mail und erstellt keinen Beleg. Die nachgelagerte Strecke lief getrennt und exakt auf diesen Record begrenzt. Keine bisherigen Recovery-Records erweitert oder alte Mails erneut versandt. Produktive Kundenszenarien bleiben inaktiv; keine Cloud-Run-Bereitstellung.

## Korrektur der Vorschauantwort

Der erste Browserstart zeigte einen generischen Verbindungsfehler, obwohl die lokale Vorschauabfrage HTTP 200 und die vollständigen Angebotsdaten lieferte. Ursache war das fehlende `ok:true` im JSON-Antwortumschlag; die vorhandene Browserfunktion verlangt dieses Kennzeichen. Das Startskript ergänzt es jetzt. Ein zusätzlicher Test verwendet die unveränderte tatsächliche Browser-Request-Funktion zusammen mit dem Vorschauergebnis des Portal-Kerns; alle sieben V2-Tests bestehen. Für den laufenden Prozess ist nach Pull ein Neustart nötig. Keine Offerte zurücksetzen, keine neue Einladung erzeugen und keine Annahme wiederholen.

## Erfolgreicher Abschluss

- Testannahme am 20.10.2026 um 21:47:02 Schweizer Zeit (`2026-10-20T19:47:02.018Z`). Lokale Meldung `PILOT_V2_ACCEPTANCE_VERIFIED`.
- Unabhängige Firestore-Lesung über Make 8079871, Lauf `8621968d598f483c843cee3d84896775`: Record, Person, Geschäftsadresse, Zeitpunkt, getrennte Zustimmungen und beide PDF-Hashes stimmen mit Airtable und der lokalen Meldung überein.
- Einmaliger Testbeleg nach nativer Create-Reservierung in Staging erstellt: `1eRsrktam4-ocYHWmMN657DDK_Dm6T1Es`, 2961 Bytes, SHA-256 `1297742e1a5a460db88df3f8ce9021f1ce1fd4a35c45863216e4ed01a3cf1404`, readOnly true, Testarchiv. Make 8079894, Lauf `aaea573257204a3ab3468ea346a94aba`. Die Beleg-ID wurde in Airtable gespeichert und zurückgelesen.
- Genau ein kontrollierter Test-Versandlauf 8079921, Ausführung `0c7942b03fcb437c804eead08bef26c8`: frische CRM-/Firestore-Prüfungen, drei feste PDFs mit Hash-/Ordner-/Schreibschutzprüfung, dauerhafte Create-Reservierung `lszh_internal_pilot_v2_mail_attempts/recZzNiq1LLmCOjNT`, ein Gmail-Aufruf, keine Modulfehler. Bei unklarem Gmail-Ausgang stoppt Commit und lässt die Reservierung bestehen. Kein automatischer Wiederanlauf; keine Exactly-once-Zusage des Providers.
- Gmail-ID `1a15adfcb1200322`, Versandzeit `2026-10-20T19:52:58.745Z` (21:52:58 Schweizer Zeit). Nur `lars@lszh-automations.ch`, kein CC/BCC, drei PDFs. Der Betreiber bestätigte: **„Angekommen, alle drei PDFs öffnen“**. Versandzeit und Beleg-ID unabhängig aus Airtable zurückgelesen.
- Alle zusätzlichen Testwerkzeuge inaktiv; beide Kundenbestätigungen inaktiv; keine unvollständigen Ausführungen beim Abschlussreadback. Betriebsüberwachung 8078663 weiter aktiv. Keine temporären Cloud-Run-Tags, IAM-Grants oder neue OAuth-Berechtigungen für V2 angelegt. Lokalen Listener mit Ctrl+C stoppen; maximal 15 Minuten Laufzeit. Die Annahme ist verbraucht; Testrecord, Belege und Reservierungen als Nachweis behalten.
- Code `dc8d7079b60b6c2570dc967ef6f73444c38b637a`: GitHub-Actions „Offer acceptance checks“ 39485900653 erfolgreich, separater Build-only-Lauf 39485900947 ebenfalls erfolgreich. Kein Deployment.

Die direkte Make-Fehlerbenachrichtigung wurde separat im Outlook-Postfach vom Betreiber bestätigt. Damit ist ein von der Gmail-Szenarioverbindung getrennter Versandweg belegt; ein vollständiger Make-Ausfall wurde nicht getestet.

Dieser Abschluss belegt den internen V2-Testpfad. Er ersetzt keinen echten Kundenfall mit finaler Offerte, gegebenenfalls projektbezogener AVV und ausdrücklicher Kundenstartfreigabe. Nach gespeicherter Beleg-ID oder Versandzeit den lokalen Vorbereitungslauf nicht nochmals starten: seine Quellenprüfung stoppt dann absichtlich.

Prüfnachweise: `evidence/lszh-interner-pilot-v2-abschluss-20261020.json`. Gespeicherter Testversandaufbau: `evidence/make-interner-pilot-v2-versand-8079921-20261020.json`.
