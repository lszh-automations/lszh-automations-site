# C4.1 – Kundenanmeldung und dauerhafte CRM-/Archivanbindung

Stand: 25.10.2026. Implementiert und lokal geprüft; nicht öffentlich aktiviert.

## Verhalten

- Kundenmodus mit achtstelligem E-Mail-Code an ausschliesslich die serverseitig hinterlegte Paketadresse. Der Browser kann keine Empfängeradresse wählen. E-Mail-Zugriff ist keine Vertretungsprüfung; deren Backend-Prüfung bleibt obligatorisch.
- Code zehn Minuten gültig, fünf Fehlversuche, mindestens 60 Sekunden zwischen Anforderungen, maximal fünf Anforderungen pro Stunde und Einladung. Erfolgreicher Code einmalig; Zustellfehler aktiviert keinen Code. Codes und Sitzungstokens werden nicht im Klartext gespeichert.
- 15-Minuten-Sitzung, an genau eine Einladung gebunden, im Secure/HttpOnly/SameSite=Strict-Cookie. Einladungslink bleibt zusätzlich erforderlich. Keine Tokens in Query-Strings, Logs oder Browser-Persistenz.
- Dokumenthashes und getrennte Zustimmungen werden vor Annahme nochmals geprüft. TEST_ONLY-Pakete werden im Kundenmodus abgewiesen, simulierte Identitäten ebenfalls. Interne Veröffentlichung verlangt die vorhandenen vertrauenswürdigen Versand-/Freigabenachweise.
- Annahmenachweis, einmalige Verbrauchssperre, CRM-Offertenvermerk und Archivauftrag entstehen in einer Firestore-Transaktion. Seit Veröffentlichung geänderte CRM-Offerten werden abgewiesen.
- CRM zeigt Kundenannahme und ausstehende/abgeschlossene Archivierung; keine automatische Gewinnbuchung, Kundenerstellung, Projekterstellung oder Auftragsbestätigung. Bereits beantwortete Offerten erscheinen nicht mehr in der Nachfassliste.
- Archivauftrag überlebt Prozesswechsel. Vorab reservierte Drive-Datei-ID und anschliessende Hashprüfung verhindern Duplikate auch bei verlorener Upload-Antwort. Nachweis wird als deterministisches JSON gespeichert, mit Verweisen/Hashes auf die privaten Original-PDFs. Kein WORM-/signiertes Langzeitarchiv behauptet.

## Bausteine

- customer-login.js: Codeanforderung, persistente Versuchszähler, Sitzung.
- customer-acceptance-application.js: zusammengesetzte HTTP-Anwendung; kein Import im laufenden CRM-Server, kein automatischer Start.
- contract-acceptance-durable.js: serverseitige Firestore-Transaktionen und Archivauftrag.
- contract-acceptance-drive.js: private, grössenbegrenzte PDF-Lektüre und verifizierter Nachweisupload; checkTarget prüft Ordner-Schreibberechtigung ohne Schreibzugriff.
- Vorhandene Annahmeseite: Codeformular; Kundenmodus und Testmodus getrennt beschriftet.

## Bestätigte Infrastruktur und noch offene Aktivierung

Read-only am 25.10.2026 bestätigt: Projekt lszh-automations, Datenbanken (default), lszh-offers, lszh-offers-staging und lszh-quarantine-staging, jeweils STANDARD / FIRESTORE_NATIVE in europe-west6. Bestehender CRM-Server verwendet new Firestore() und damit (default). Neue Anbindung begrenzt auf dieses Projekt/diese Datenbank; Registerpräfix explizit lszh_crm_v2_staging_ oder lszh_crm_v2_. Tests verwenden ausschliesslich demo-lszha-c2-20261025, 127.0.0.1:8788.

Für tatsächlichen Kundenbetrieb noch erforderlich:

1. Dedizierten autorisierten Codeversand (sendCode) anbinden; vorhandene Read-only-Gmail-Zugangsdaten können keine Codes senden. Die Freigabe des bereits abgeschlossenen Einzel-Testversands wird nicht wiederverwendet. Versandadapter muss bei unklarem Ergebnis keine automatischen Wiederholungen auslösen und darf Codes nicht protokollieren.
2. Private Archividentität und Zielordner bestätigen. Historischer Ordner 1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in hatte nur Reader-Zugriff für lszh-archive-reader. Aktuelle Schreibrechte sind NICHT nachgewiesen. Für Service-Account-Uploads Shared Drive oder korrekt delegierten Benutzer verwenden; My-Drive-Reader-Rechte allein genügen nicht und Service Accounts haben keine eigene Drive-Speicherquote. Keine Schlüssel oder Rechte wurden geändert.
3. Interne authorizeIssue-, verifySentPackage- und verifyRepresentative-Prüfungen aus dem tatsächlichen Freigabeprozess verdrahten; keine immer-true-Callbacks im Betrieb. Veröffentlichung bindet das Paket an den CRM-Zustand; bestehende Angebote/PDFs müssen aus demselben freigegebenen Snapshot stammen.
4. Stabile, getrennte CSRF- und Login-HMAC-Secrets aus Secret Manager, feste HTTPS-Origin, passende serverseitige IAM-Berechtigungen. Browserzugriff auf die Nachweissammlungen bleibt gesperrt. Keine Secrets im Repository.
5. Geschützten Dienst und internen Herausgabe-/Archivworker-Endpunkt bereitstellen. archiveResponse(responseId) ist implementiert; dauerhafte Queue/periodischer Worker und dessen Betrieb sind noch nicht bereitgestellt. Pending-Aufträge bleiben erhalten und können nach Einrichtung abgearbeitet werden. Kein öffentlicher Worker-Endpunkt.
6. Vor öffentlicher Aktivierung: ein ausdrücklich freigegebener Staging-Test mit echtem Codeversand und tatsächlichem Archiv-Readback; anschliessend gesonderte Kundenfreigabe. Datenschutz-/Aufbewahrungsfristen und finalen Erklärungstext fachlich bestätigen.

Kein Deployment, kein neuer Cloud-Joblauf, keine produktiven CRM-/Archivschreibvorgänge und keine E-Mail durch diese Implementierungsrunde.

## Validierung

- 372/372 reguläre Node-Tests bestanden.
- 19/19 tatsächliche lokale Firestore-Emulatorprüfungen bestanden, darunter vollständiger Kunden-HTTP-Ablauf mit abgefangenem (nicht versendetem) Code, Server-/Clientwechsel, genau eine CRM-Annahme, veränderte CRM-Offerte blockiert, Archivwiederaufnahme mit identischer Provider-ID.
- Headless Edge: bestehender Desktop-/Mobil-Test bestanden, drei nicht vorausgewählte Zustimmungen, Einmaligkeit, kein horizontaler Überlauf, keine Browserfehler.
- Drive-Adapter gegen simulierte Providerantworten geprüft; kein Live-Drive-Upload behauptet.
