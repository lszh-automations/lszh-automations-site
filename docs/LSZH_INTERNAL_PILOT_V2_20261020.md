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

Live-Browserannahme, unabhängiger Firestore-/Airtable-Readback, einmaliger neuer Beleg und genau eine Bestätigungsmail stehen noch aus. Das Startskript sendet selbst keine Mail und erstellt keinen Beleg. Diese nachgelagerten Schritte erst nach bestätigter Annahme durchführen; keine bisherigen Recovery-Records erweitern oder alte Mails erneut versenden. Produktive Kundenszenarien bleiben inaktiv. Keine Cloud-Run-Bereitstellung erforderlich.

## Korrektur der Vorschauantwort

Der erste Browserstart zeigte einen generischen Verbindungsfehler, obwohl die lokale Vorschauabfrage HTTP 200 und die vollständigen Angebotsdaten lieferte. Ursache war das fehlende `ok:true` im JSON-Antwortumschlag; die vorhandene Browserfunktion verlangt dieses Kennzeichen. Das Startskript ergänzt es jetzt. Ein zusätzlicher Test verwendet die unveränderte tatsächliche Browser-Request-Funktion zusammen mit dem Vorschauergebnis des Portal-Kerns; alle sieben V2-Tests bestehen. Für den laufenden Prozess ist nach Pull ein Neustart nötig. Keine Offerte zurücksetzen, keine neue Einladung erzeugen und keine Annahme wiederholen.
