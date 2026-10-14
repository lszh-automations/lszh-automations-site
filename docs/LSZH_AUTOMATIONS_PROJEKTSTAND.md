# LSZH Automations – Projektstand & Betriebsentscheidungen

_Stand: 13.10.2026. Interne Arbeitsdokumentation. Keine Passwörter, API-Schlüssel oder Token hier eintragen._

## Geschäftsmodell / Eigentümerschaft

- LSZH Automations erbringt Beratung, Entwicklung, Einrichtung, Tests, Dokumentation und optionale Wartung für Schweizer KMU.
- **Kundenbetrieb:** Der Kunde nutzt eine eigene Make-Organisation und behält deren Kontrolle, Abrechnung, Ressourcen und Szenarien. Unser Zugang erfolgt über eine gezielte Einladung mit angemessener Berechtigung.
- Make-Pläne und -Credits werden vom Kunden direkt mit Make abgerechnet. LSZH stellt separat Dienstleistungen und laufende Betreuung in Rechnung.
- Der Erstkontakt und die Offerte setzen keine Registrierung bei Make voraus. Registrierung/Einladung folgen erst nach Annahme.
- Möglichst OAuth/Anbieterfreigaben verwenden. Keine Kundenpasswörter per Mail oder in Airtable abfragen.

## Prozess (verbindliches Zielbild)

1. Anfrage über LSZH-Website: Problem, Unternehmensdaten und Kontakt.
2. Rückfrage/Analyse, Offerte und allfällige vertragliche Vereinbarungen.
3. Annahme der Offerte und ausgelöstes Projekt-Onboarding.
4. Onboarding sammelt Rechnungsdaten, Anforderungen, Systemnamen, Status der kundeneigenen Make-Organisation und Stand der Einladung.
5. LSZH prüft Angaben, Kundenorganisation und benötigte Rollen. Bei Bedarf unterstützt LSZH Registrierung und Einladung.
6. Technische Verbindungen entstehen **in der Make-Organisation des Kunden**, möglichst durch den Kunden selbst mit OAuth.
7. Entwicklung, Funktionstests, Dokumentation, Kundenfreigabe und Go-Live im Kundenkonto.
8. Betrieb/Betreuung über separaten Servicevertrag. Kundeninhaberschaft und Freigaben bleiben erhalten.

## Bereits umgesetzt

- Öffentliche Website mit Kontakt, Leads, Offerten/Rechnungen und persönlichem Kunden-Onboarding (bestehender Prozess beibehalten).
- Formular `/onboarding/`: zusätzlicher Abschnitt **Make & technische Einrichtung** mit optionalem Organisationsnamen und Angaben zu Konto-/Einladungsstatus. Keine Secrets.
- Airtable `Kunden-Onboarding`: Felder **Make-Konto Status**, **Make-Organisation**, **Make-Einladung Status**, **Make-Einrichtung Hinweise**.
- Make `LSZH Kunden-Onboarding – Eingang`: Feldzuordnung auf diese Airtable-Spalten ergänzt.
- Make `LSZH Projekte – Onboarding anfordern`: Einladungsmail nach Offertenannahme erklärt das kundeneigene Make-Modell.
- Bestätigungsmail nach Onboarding: erklärt Organisation, Einladung und nächste Schritte.
- Kundenanleitung `/make-start/` erstellt und im Formular sowie in den E-Mails verlinkt.
- Drei alte Make-OAuth-Szenarien des früheren LSZH-eigenen Kontomodells als **ARCHIV – ALTES MODELL** gekennzeichnet und unverändert inaktiv belassen.
- Secure Transfer funktional mit Dummy-Schlüssel getestet: verschlüsselte Speicherung, einmaliger Abruf, Löschung der gespeicherten verschlüsselten Daten. Noch **nicht** für reale Kundenzugangsdaten freigegeben.

## Status / Sicherheit

- Onboarding-Anforderung und Eingangsszenario bleiben vorerst inaktiv, bis ein vollständiger Test mit einer vereinbarten Testofferte durchgeführt wurde. Keine unaufgeforderten Mails auslösen.
- Die Schlüssellieferung über Secure Transfer darf noch nicht produktiv eingesetzt werden, bis die Make-Webhooks authentifiziert und der parallele Abruf wiederholt getestet wurden.
- Neue Make-Verbindungen müssen gegen die jeweilige Kundenorganisation und deren Rollen geprüft werden. Alte LSZH-eigene OAuth-Automationen nicht reaktivieren.
- Make-Plan und Berechtigungen nach tatsächlichem Kundenbedarf prüfen. Nicht jedes Abonnement bietet identische Team-/Rollenoptionen.

## Nächste Tests

1. Neues Formular im Browser prüfen (Desktop / Mobile).
2. Mit freigegebenem Testprojekt Onboarding durchspielen; vier Make-Felder in Airtable kontrollieren.
3. Versand und Inhalt der zwei Kundenmails testen, bevor bisher inaktive Szenarien wieder aktiviert werden.
4. Einladung in eine vom Kunden verwaltete Testorganisation prüfen, ohne dessen Zugangsdaten einzusehen.
5. Kunden-Szenario dort erstellen, mit kundeneigener Verbindung autorisieren und Test/Übergabe dokumentieren.
6. Secure Transfer erst nach separater Security-Abnahme für Ausnahmen nutzen.

## Betrieb / Quellen

- [Website – Kunden-Onboarding](https://www.lszh-automations.ch/onboarding/)
- [Website – Make-Kundenanleitung](https://www.lszh-automations.ch/make-start/)
- [Make – Organizations](https://help.make.com/organizations)
- [Make – Teams](https://help.make.com/teams)
- [Make – Preise/Funktionen](https://www.make.com/en/pricing)

Letzte Architekturentscheidung: 13.10.2026 – Kunden besitzen ihre eigenen Make-Organisationen.

## Technische Prüfung vom 14.10.2026 – Onboarding-Fortsetzung (STAGING)

- Make-Szenario **7777695**: Kunden-Onboarding bleibt **inaktiv**. Kundenmail-Modul 9 hat unverändert die harte **0=1**-Sperre. Keine echten Einladungen, Vertragsfreigaben oder Kundensendungen.
- Der separate Datenschutz-Zweig (Router 14) läuft vor der erfolgreichen Webhook-Bestätigung; Prüfung bei `sensitive_data = Ja` oder `Unsicher`. Vor einer neuen DSG-Aufgabe erfolgt jetzt eine Airtable-Suche (Modul 15) nach dem stabilen `<Auftrag-ID>-DSG-01`-Schlüssel. Bereits existierende, z. B. erledigte Aufgaben werden nicht auf `Offen` zurückgesetzt.
- Die frühere GET-Dublettenprüfung (Modul 11) wurde durch wiederaufnehmbare Speicherung ersetzt: Modul 4 erzeugt ein Airtable-`performUpsert` mit `fieldsToMergeOn: ["Projektcode"]`. Modul 3 sendet `PATCH`, Modul 6 verknüpft den Datensatz mittels `3.body.records[1].id`; dieselbe ID wird in Modul 12 als Webhook-Beleg ausgegeben.
- **Test 1:** zweimaliges Airtable-Upsert auf bestehenden synthetischen Token `ob_e2e2026a-7acf-4f16-a6dd-000000000001` lieferte `recCTaZaoReFpBqxi` und änderte die Datensatzanzahl nicht (vier).
- **Test 2:** Isoliertes Make-Testscenario **7962957**, zweifacher sequentieller Aufruf: Erfolg, jeweils HTTP 200 und dieselbe Airtable-ID. Zusätzlich **zwei parallel gestartete Testläufe**: beide erfolgreich, HTTP 200, dieselbe ID; nachher weiterhin genau ein zugehöriger Datensatz. Testszenario wieder deaktiviert.
- **Test 3:** Read-only-Make-Testscenario **7962998**: existierende DSG-Aufgabe ergab `rec818rQl70Mf4UsW`, fehlender Aufgabencode ergab keine ID; beide HTTP 200. Existierende Aufgabe blieb auf `Erledigt`. Testscenario danach deaktiviert.
- **Keine Freigabe:** Diese Tests prüfen isolierte Module und einen vorhandenen synthetischen Datensatz. Sie sind **kein** vollständiger Webhook-End-to-End-Test, kein Paralleltest zweier echter erstmaliger Eingänge und keine tatsächlich unterbrochene Gesamtausführung. Wiederholungen mit **abweichenden** Formulardaten würden noch vorhandene Onboarding-Felder überschreiben; diese Geschäftspolitik ist abzuklären oder technisch abzusichern. Ebenfalls testen: Fehler bei Verknüpfung/Rechnungsdaten, Dauerhaftigkeit der Datensätze, Fehlerantwort und Datenschutzprüfung vor HTTP-200.
- Weitere Freigaben: Kundenorganisation und Einladungsberechtigung für `lars@lszh-automations.ch`; Google-Drive-Reautorisierung und separates eingeschränktes Dienstkonto; RC1-Projektbedingungen/AVV; Offerten-, Rechnungs-, Swiss-QR- und Archivtests.
