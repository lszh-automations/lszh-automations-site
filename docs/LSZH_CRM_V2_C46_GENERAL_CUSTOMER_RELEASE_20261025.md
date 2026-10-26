# C46 – Allgemeine Online-Kundenannahme, 25.10.2026

Status: Live aktiviert. Autorisierung: Nutzerauftrag «schalte es für alle frei»; gesonderte ausdrückliche Freigaben für interne Annahmeprüfung und eine technische Archivtestdatei. Kein Sammelversand, keine automatische Kundenannahme und keine automatische Auftragsbestätigung.

## Aktive Dienste

- CRM `lszh-crm-v2`: Revision `lszh-crm-v2-00075-bef`, 100 % Live-Verkehr.
- Portal `lszh-customer-acceptance-pilot`: Revision `lszh-customer-acceptance-pilot-00005-rab`, 100 % Live-Verkehr. Der historische Dienstname enthält weiterhin «pilot»; der Laufzeitmodus lautet `customer`.
- Projekt `lszh-automations`, Region `europe-west6`, privater Produktionspräfix `lszh_crm_v2_`.
- Bestehende Konfigurations-Secrets jeweils Version 3; keine Geheimnisse im Quellpaket. Bestehende CSRF-/Login-Schlüssel und OAuth-Daten erhalten.
- CRM Vertragsaktionen, einmaliger Paketversand und interne Annahmeprüfung aktiviert.
- Rückschaltung bei Bedarf: CRM `00069-mos` und Portal `00003-ctv` verwenden weiterhin ihre ursprüngliche Pilotkonfiguration. Neue Kundenpakete vor einer Rückschaltung separat berücksichtigen; keine Versandlocks löschen oder alte fehlgeschlagene Mailausführungen wiederholen.

## Bedienung und Grenzen

Bei jeder gespeicherten, gültigen Offerte im Status «Bereit» kann ein berechtigter CRM-Benutzer ein Dokumentpaket erstellen. Kontaktadresse und kommerzielle Angaben stammen ausschliesslich aus den gespeicherten CRM-Daten. Die AVV-Einstufung ist bewusst zu wählen; keine Voreinstellung «nicht erforderlich». Dokumentprüfung und dauerhafte private Aufbewahrung sind pro Offerte ausdrücklich zu bestätigen.

Der Server erzeugt das Offerten-PDF, archiviert es im festen Ordner für Vertragsoriginale, liest die archivierten Bytes zurück und bindet die Freigabe an Snapshot, Empfänger, Dokument-Hashes und Paket-ID. Danach folgt eine getrennte Paketprüfung und ein ausdrücklich ausgelöster einmaliger Versand. Neue Kunden erhalten erst über einen separat erstellten privaten Link und ihren angeforderten E-Mail-Code Zugriff. Kein Versand beim blossen Erstellen oder Aktivieren eines Pakets.

Die Freigabe gilt höchstens 48 Stunden und endet spätestens am Ende der Offertengültigkeit in Europe/Zurich, einschliesslich Sommer-/Winterzeit. Abgelaufene Freigaben und unklare Archivierungsversuche benötigen eine bewusste Backend-Prüfung; keine automatische Wiederholung oder stilles Aufheben von Claims.

Bei AVV-Pflicht ist weiterhin eine kundenspezifisch ausgefüllte, geprüfte AVV mit Anlagen A/B/C erforderlich. Der allgemeine Rahmenvertrag wird nicht freigegeben. Die neue Oberfläche erstellt keine kundenspezifischen AVV-Anlagen und kann deren Prüfung nicht durch Browser-Flags behaupten: ein passender vertrauenswürdiger `customerAvv_<SHA256(offerId)>`-Backend-Datensatz muss zuvor vorliegen. Ohne ihn bleibt das Paket gesperrt.

Nach Kundenannahme folgt die interne Prüfung erst nach vollständig archiviertem Nachweis. Eine schriftliche LSZH-Auftragsbestätigung bleibt ein separater Vorgang. Ihr unabhängiger Gmail-Nachweis setzt weiterhin einen freigegebenen `confirmationDocument_<SHA256(packageId)>`-Backend-Datensatz voraus; es wird keine Bestätigung automatisch erzeugt oder verschickt. Keine automatische Rechnung, Zahlung oder Projektfreigabe durch diese Freischaltung.

## Make

- `8175919`: geprüfte Kunden-Vertragspakete, 2 oder 3 PDFs, ein Empfänger, keine CC/BCC, festes Absenderkonto, Paket-/Ereignisprüfung; aktiv. Dauerhafte Versandclaims und unabhängiger Gmail-SENT-Abgleich bleiben im Backend.
- `8176927`: neuer separater Live-Codeversand für gespeicherte freigegebene Einladungen; aktiv. Achtstelliger Code und gültiger Idempotenzschlüssel. Der alte Staging-Codeversand `8175404` bleibt unverändert auf Lars begrenzt.
- `8176906`: neue PDF-Archivierung im festen Produktionsordner für Vertragsoriginale; aktive Dateien erhalten `contract_v1`-Markierung und ein Leserecht ausschliesslich für den bestehenden CRM-Serviceaccount. Kein pauschales Ordnerleserecht.
- `8176103`/`8176104`: Nachweisreservierung/-schreiben unterstützen `contract_v1`; bestehende `pilot1002`-Nachweise bleiben lesbar und prüfbar.
- `8176339`: private Metadatenbrücke lässt feste Projektbedingungen, markierte PDF-Originale im Originalordner und markierte JSON-Nachweise im Nachweisordner zu. PDF-Inhalte werden weiterhin separat unter Dienstidentität und anhand der Hashes geprüft.

## Validierung

- 414 lokale Tests bestanden, einschliesslich Kunden-/Offertenbindung, fehlender AVV, bewusst erforderlicher Freigaben, verändertem Snapshot, verlorenem Archivierungs-Receipt und Schweizer Datumsgrenzen.
- 28 Tests mit echtem lokalem Firestore-Emulator bestanden; kein Zugriff dieser Tests auf Produktionsdaten.
- Tatsächliche CRM-Konfiguration ohne Datenzugriff erfolgreich initialisiert; Portalgesundheit `ok=true, mode=customer`; neue CRM-Oberfläche HTTP 200; anonyme Vertragsabfragen HTTP 401.
- Empfängerloser negativer Pakettest HTTP 400 `INVALID_CONTRACT_PACKAGE`; Make-Ausführung `48690d34b7ae41438e99904e042607eb` führte ausschliesslich Module 1 und 5 aus, keine Gmail-Aktion.
- Ein ausdrücklich genehmigter technischer Archivtest ohne Kundendaten: `Offerte_0.pdf`, Inhalt `TEST_ONLY – technischer Archivtest`, Datei `1KTm06np-t2trtmjWMY-UQ5nr9eaH5qyu`, 967 Bytes, MIME `application/pdf`, SHA-256 `fdebefe91db119a2b9b648b65e2521a60b19d02f1bf998e492e49de684028890`. Make-Ausführung `f6f75242e78649c78273ed07157a7d63` führte alle fünf Archivierungsmodule einmal fehlerfrei aus. Unabhängiger Rückdownload über das Geschäftskonto ergab dieselbe Prüfsumme und den korrekten Originalordner. Keine CRM-Kunden-/Offertendatensätze angelegt.
- Neuer Live-Codeablauf hatte bis zum Abschluss keinen Maillauf. Kein neuer Kunden- oder Pilotversand im Rahmen dieser Freischaltung.
- Kein neuer rechtsgeschäftlicher Annahmeklick durch den Agenten. Der bereits abgeschlossene technische Pilot 1002 und sein Nachweis bleiben erhalten.
- Die angemeldete neue Paketmaske wurde im Browser noch nicht mit einer weiteren echten Kundenofferte bedient; die CRM-Anmeldeseite ist geöffnet. Der zusätzliche Live-Test deckt Archivierung und Metadaten ab, keinen erneuten Kundenversand oder eine weitere Kundenannahme.

Lokale Prüfartefakte: `output/customer-general-release/` im LSZHA-V2-Arbeitsordner. Die Live-Umschaltung ersetzt keine unabhängige rechtliche Prüfung.
