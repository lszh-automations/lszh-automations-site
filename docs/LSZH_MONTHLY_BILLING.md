# Monatliche Abrechnung

## Vereinbarte Regel

Abrechnungsbeginn je Auftrag separat bestätigen. Erster Leistungsmonat ist immer der nächste volle Kalendermonat; keine anteilige Rechnung für den Aktivierungsmonat. Die konkrete Vorschau erscheint vor der Bestätigung. Auch bei einem Datum am Monatsersten beginnt die Regel erst im Folgemonat. Beispiel: bestätigter Beginn 27.10.2026 -> erster Leistungsmonat November 2026. Beginn 01.11.2026 -> Dezember 2026.

## Bedienung

Im gespeicherten Projekt den Abschnitt **Monatliche Abrechnung** öffnen. Voraussetzung: eindeutige Zuordnung zu aktivem Kunden und angenommener Offerte mit kostenpflichtigen Monatspositionen; bei Online-Annahme bestätigte/archivierte Annahme. Datum ab heute wählen. Vereinbarten Beginn, Monatsbetrag und bestehende/externe Rechnungen prüfen und ausdrücklich bestätigen, dass dieselben Monatsleistungen nicht bereits anders verrechnet werden. Dann bewusst aktivieren. Keine rückwirkende Aktivierung und keine Migration bestehender Aufträge.

Für jeden fälligen Leistungsmonat wird ein nummerierter Rechnungsentwurf aus den angenommenen Monatspositionen erstellt. Kein automatischer Versand und keine Zahlungsbuchung. Fälligkeit bleibt bewusst leer und ist vor dem bisherigen PDF-/Versandprüfprozess festzulegen. Leistungsmonat steht im Rechnungsinhalt. Das Rechnungsdatum ist das tatsächliche Erstellungsdatum; nachgeholte Leistungsmonate werden nicht als früher ausgestellte Rechnungen datiert. Entwürfe erscheinen in der bestehenden persönlichen Aufgabenliste und bei den zugehörigen Kunden/Projekten.

**Pausieren** stoppt neue Entwürfe. Bereits bestehende Rechnungen bleiben bestehen; Pause ist keine Stornierung oder Gutschrift. Wiederaufnahme benötigt wieder einen separat bestätigten Beginn ab heute und beginnt im nächsten vollen Kalendermonat; pausierte Monate werden nicht nachverrechnet. Ein Projektabschluss beendet laufende Monatsleistungen nicht automatisch. Bei Vertragsende daher die Monatsabrechnung ausdrücklich pausieren.

## Dublettenschutz und Automatik

Stabile Rechnungsidentität je angenommener Offerte und Kalenderperiode, gemeinsame Rechnungsnummernvergabe und Fortschreibung in derselben Firestore-Transaktion. Wiederholungen und konkurrierende Aufrufe erzeugen keinen zweiten Entwurf. Eine stornierte Monatsrechnung wird nicht still ersetzt. Andere Projekte/Offerten oder gleichnamige Firmen werden nicht zusammengerechnet. Manuelle oder externe Rechnungen ohne diese Periodenidentität können nicht zuverlässig automatisch erkannt werden; deshalb die verpflichtende Prüfung vor jeder Aktivierung.

Ein eigener täglicher Cloud-Scheduler-Aufruf soll ausschliesslich aktivierte Pläne abarbeiten. Bestehende Make-Szenarien und Scheduler bleiben unverändert. Fehlende Perioden werden mit höchstens zwölf Perioden je Projekt und Lauf nachgeholt; weitere folgen in nachfolgenden Läufen. Vertrags-/Zuordnungsänderungen oder inaktive Kunden stoppen die Erstellung für den betroffenen Plan und erzeugen eine konkrete Prüfaufgabe. Der interne Endpunkt verwendet eine eigene konfigurierte Google-OIDC-Zielgruppe und überprüft den Scheduler-Dienstaccount, keine anonyme Ausführung.

## Bestandsabgleich

Am 27.10.2026 wurden alle 20 sichtbaren Make-Szenarien und die drei Cloud-Scheduler-Jobs in europe-west6 rein lesend abgeglichen. Kein bestehender Monatsrechnungsersteller im geprüften Umfang. Der produktive Make-Gateway 8144117 ist ausschliesslich ein vom CRM angestossener Gmail-Versand mit Beleg. Keine Änderungen oder Ausführungen an Make. Nicht verbundene Teams/andere Regionen oder externe Buchhaltung sind davon nicht erfasst; vorhandene Rechnungen müssen vor Aktivierung individuell geprüft werden.

## Prüfung

546 CRM-Tests; zusätzlich Emulatorprüfung konkurrierender echter Firestore-Transaktionen. Desktop und Mobil: Datums-/Betragsvorschau, verpflichtende Bestätigung, Aktivierung und Pause, unveränderter Projektstatus, kein Mailaufruf. Keine bestehenden Kundenaufträge im Rahmen der Bereitstellung aktivieren und keine Testrechnung in Produktionsdaten anlegen.
