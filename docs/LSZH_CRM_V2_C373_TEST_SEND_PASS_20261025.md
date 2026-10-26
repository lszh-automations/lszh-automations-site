# C3.7.3 – Einmaliger Testversand und echter PDF-SENT-Nachweis PASS

Stand: 25.10.2026. Genau eine ausdruecklich freigegebene synthetische Testmail versendet. Keine produktive Kundenannahme oder produktiver CRM-Vertragsversand aktiviert.

## Ausgefuehrte Freigaben

- Neue Version 2 des dedizierten Secrets lszh-crm-c37-gmail-readonly erzeugt. Ausschliesslich lars.schulthess@outlook.com zur erlaubten Empfaengerliste ergaenzt. Bestehende Adressen, Senderliste, OAuth-Zugangsdaten und sonstige Felder erhalten. Keine Secretwerte ausgegeben oder als Datei gespeichert.
- Nur der neue Job lszh-crm-c373-contract-readback nutzt den Mount mit Version 2. Der bestehende C3.7.2-Profiljob verwendet nachweislich weiterhin Version 1.
- Erfolgreicher policy_only-Vorabcheck: lszh-crm-c373-contract-readback-5pgrh. Exakter Lognachweis C3.7.3 READONLY POLICY PASS am 2026-10-25T18:45:27.316418Z.

## Genau ein Versand

- Absender: LSZH Automations <info@lszh-automations.ch>
- Empfaenger: lars.schulthess@outlook.com; keine CC/BCC.
- Betreff: [TEST_ONLY] LSZH PDF-Transporttest 1101.
- Drei synthetische PDFs: Offerte, Projektbedingungen und AVV. Kein Vertragsangebot, keine Zahlungspflicht und kein Annahmelink.
- Make-Szenario 8174297, einziger Versandlauf 90f7e74e283148929033aec32e8e1071 am 2026-10-25T18:46:21.397Z. Gmail-Sendemodul genau eine Invocation, null Modulfehler.
- Gmail-Message-ID: 1a17462a3571a435.
- Event-ID: contract_send_pkg_test_c373_transport_001_r1.
- Paket-SHA-256: 5f94e7014a84c895527b7e58b39d5c8bb70d10cbca9019082a61321d0bb15a78.
- Danach Szenario deaktiviert und fester Filter auf SEND_APPROVAL_CONSUMED umgestellt. Kein weiterer Versand aufgerufen.
- Permanente Sperre offer_test_c373_transport_001 in Make-Store 232708 bleibt erhalten. Store enthaelt nun zwei Datensaetze: einen diagnostischen Validierungsschluessel und die tatsaechliche Versandsperre.

## Gefundener und behobener Leseadapterfehler

Erster SENT-Prueflauf lszh-crm-c373-contract-readback-ssmfc blockierte, weil die realen Gmail-Anhangskennungen 404 Zeichen lang sind, der Code aber maximal 200 erlaubte. Es wurde keine Mail wiederholt.

Im isolierten C3.5-GET-Adapter und MIME-Normalisierer eigene strikte Anhangskennung eingefuehrt: nur A-Z/a-z/0-9/_/-, 4 bis 2048 Zeichen. Nachrichten-IDs bleiben bei 4 bis 200 Zeichen, feste Google-Domain und GET-Endpunkte bleiben erhalten. Die Grenze 2048 ist eine lokale Schutzgrenze, keine behauptete Google-Spezifikation.

Offizielle API-Referenz fuer den separaten lesenden Anhangsabruf: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages.attachments/get

Drei neue Regressionen pruefen lange reale Kennungsformen, unveraendert enge Nachrichten-IDs, Abweisung ueberlanger Kennungen und URL-Injektionen. Vollstaendige lokale Regression: **346/346 PASS, null Fehler**.

Nur den neuen C3.7.3-Lesejob mit der Korrektur aktualisiert. Image sha256:b0520ac11e1920ef4593e7b8f4ba4ab92e7c8f561f1844b26b0ff958bae6acda. Kein produktiver CRM-/Make-/Webdienst geaendert.

## Unabhaengiger echter Provider-Nachweis

Erneute reine Lesepruefung derselben Message-ID mit korrigiertem Code: lszh-crm-c373-contract-readback-vsn8x. Erfolgreich, Exitcode 0, eine Task und null automatische Wiederholungen.

Exakter Cloud-Logeintrag am 2026-10-25T18:51:42.962671Z:

> C3.7.3 SENT PDF PASS: three exact TEST_ONLY PDFs verified; zero sends.

https://console.cloud.google.com/run/jobs/executions/details/europe-west6/lszh-crm-c373-contract-readback-vsn8x?project=lszh-automations

Geprueft: echte SENT-Nachricht, richtige Message-ID, freigegebener Absender/Empfaenger, keine CC/BCC, TEST_ONLY-Betreff, genau ein passender Event- und Paket-Header sowie drei PDF-Dateien in erwarteter Reihenfolge. Tatsaechliche MIME-Typen application/pdf, PDF-Magic, Dateinamen und Laengen stimmen.

| Datei | Bytes | SHA-256 |
|---|---:|---|
| TEST_ONLY_offer.pdf | 2291 | 9e25f1de4ec89f546917942787f0c1613c0c0d99cec97f4a8de44000e1c10571 |
| TEST_ONLY_terms.pdf | 2343 | 117bf5336a7dfb3e436f5f6ac058356e041f31df21142d9362a25b7419bada59 |
| TEST_ONLY_avv.pdf | 2309 | 2d1c7f9932fbeb75c578c2883d980e24d025f684eeb7bbec47283eb75e497aa9 |

Der Make-Transport-Lock bleibt absichtlich nicht erneut sendbar im Zustand delivery_review; der unabhaengige Abschlussnachweis liegt in Cloud Run und diesem Protokoll. Keine automatische Firestore-/CRM-Statusuebernahme behaupten. Der Nachweis bestaetigt den Gmail-SENT-Paketinhalt, nicht die Outlook-Inbox-Zustellung oder eine Kundenannahme.

## Naechster fachlicher Schritt

Die eigentliche Online-Kundenannahme integrieren: genau die versendeten unveraenderlichen Dokumentversionen anzeigen, befristeten einmaligen Annahmelink serverseitig pruefen, AVV-Zustimmung getrennt erfassen und einen revisionsgebundenen Nachweis sichern. Kundenannahme zunaechst zur internen Pruefung; bestehende separate schriftliche LSZH-Auftragsbestaetigung nicht umgehen. Produktive Firestore-Anbindung, Archivierung und rechtliche Dokumentfreigabe bleiben gesonderte Aufgaben.
