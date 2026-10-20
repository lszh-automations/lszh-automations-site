# AVV Ja – Abschluss des internen Versandtests

20.10.2026, Europe/Zurich. TEST_ONLY, kein Vertrag, keine Kunden-/Produktionsfreigabe.

## Bestätigt

- Bestehender synthetischer Testdatensatz `recktLXj5wUxLmHFQ`, `TEST_CLOUD_AVV_JA_20261019_NO_CONTRACT`, AVV Ja, bereits angenommen am 19.10.2026 Schweizer Zeit. Keine zweite Annahme und kein neuer Token.
- Airtable enthält weiterhin ausdrückliche AVV-Zustimmung, `TEST_ONLY_AVV_v1.0_RC1` und AVV-SHA-256 `53f9deda2000e219f79e0496b33f1e74df8ac00eac09f221b2436c3fd848d060`.
- Ursprünglicher archivierter Testbeleg `1TI3aj3vgn8CuGpbGkgZa2ogqvdohtK_t` unabhängig über Drive inhaltlich gelesen: richtige Offertennummer, synthetische Person, drei PDF-Hashes und separate AVV-Zustimmung.
- Make-Lauf `9dd610046c074a52aa274022b0812b5f`, Szenario `7965223`, SUCCESS, 17 Module, keine Modulfehler.
- Vier-PDF-Testmail fest an `lars.schulthess@outlook.com`, keine CC/BCC. Versandzeitstempel `2026-10-20T15:25:28Z` (17:25:28 Schweizer Zeit).
- Nutzer bestätigt Eingang und Öffnen aller vier PDFs: Testofferte, Projektbedingungen, AVV, ursprünglicher Testannahmebeleg.
- Fiktive Annahmeadresse `fake-lszh-e2e@example.invalid` unverändert; heutige Mail ist ausdrücklich eine interne Transport-Testkopie.
- 17 gezielte lokale Tests zu AVV-Zustimmung, manipulierten Hashes, Dokumentzugriffen, abgelaufenen/angenommenen Links und internen Pilotsperren bestanden.

## Abweichung und Bereinigung

Die über den Make-Connector gespeicherten Modul-Deaktivierungsmarkierungen verhinderten die Ausführung der Belegerstellung nicht. Daher entstanden entgegen dem Plan ein zusätzliches Google Doc und eine zusätzliche PDF im Echtbetriebs-Archivordner; der Lauf ersetzte vorübergehend die Belegreferenz im Testrecord. Die versendete Mail enthielt dank fester Zuordnung trotzdem den ursprünglichen Testbeleg.

Korrigiert und unabhängig zurückgelesen:

- Airtable-Belegreferenz wieder `1TI3aj3vgn8CuGpbGkgZa2ogqvdohtK_t`.
- Zusätzliches Doc `1tdUE_IZjszKSBtLTOm7UnfUPC2aPHyKOJvGoTy9zgeM` und PDF `1LjtjGUgkZ2FPULbsGn9pZ79hAMU5YiTQ` in den Testordner `10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko` verschoben; beide als `TEST_ONLY_ZUSAETZLICHER_TESTBELEG_20261020_KEIN_VERTRAG` gekennzeichnet. Keine bestehenden Belege gelöscht.
- Szenario wieder inaktiv. Sämtliche Modulkonfigurationen, ursprüngliche Filter, aktivierte Modulmarkierungen und 15-Minuten-Zeitplan stimmen mit der Sicherung überein; 0 unvollständige Ausführungen.
- Keine rechtliche, Echtbetriebs- oder allgemeine Versandfreigabe gesetzt. Keine Cloud-Builds, Deployments oder IAM-Änderungen in diesem Test.

Für künftige Wiederanlauftests nicht auf Connector-Deaktivierungsmarkierungen als Ausführungssperre vertrauen. Vor erneutem Versand ist eine nachweislich wirksame, getrennte Wiederanlaufstrecke erforderlich. Nicht erneut senden.

## Grenzen

Heute wurde der bestehende AVV-Ja-Annahmezustand und Beleg weiterverwendet. Es gab keinen neuen AVV-Ja-Browser-/Firestore-Annahmelauf. Eine neue vollständige Produktiv- oder AVV-Ja-Kundenfreigabe ist damit nicht erteilt. Kundenbezogene AVV-Anlagen A/B/C bleiben separat erforderlich.

## Windows-Testkorrektur vorbereitet

Der Teststarter findet vorhandenes Git Bash unter Windows ohne globale PATH-Änderung. Shell-Strukturprüfungen tolerieren CRLF-Zeilenenden. Geprüft in einer isolierten Kopie mit den unveränderten ursprünglichen Shell-Dateien: 252 PASS, 0 FAIL, 5 SKIP. Die Korrektur liegt als Patch bereit; der Projektordner wurde in dieser Sitzung nicht beschrieben.

Verwendete Make-Skills: `make-scenario-building`, `make-scenario-operations`; unabhängige Readbacks über Airtable und Google Drive.
