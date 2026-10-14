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
- **Test 1:** zweimaliges Airtable-Upsert auf bestehenden synthetischen Token `<synthetischer-testtoken-intern>` lieferte `recCTaZaoReFpBqxi` und änderte die Datensatzanzahl nicht (vier).
- **Test 2:** Isoliertes Make-Testscenario **7962957**, zweifacher sequentieller Aufruf: Erfolg, jeweils HTTP 200 und dieselbe Airtable-ID. Zusätzlich **zwei parallel gestartete Testläufe**: beide erfolgreich, HTTP 200, dieselbe ID; nachher weiterhin genau ein zugehöriger Datensatz. Testszenario wieder deaktiviert.
- **Test 3:** Read-only-Make-Testscenario **7962998**: existierende DSG-Aufgabe ergab `rec818rQl70Mf4UsW`, fehlender Aufgabencode ergab keine ID; beide HTTP 200. Existierende Aufgabe blieb auf `Erledigt`. Testscenario danach deaktiviert.
- **Keine Freigabe:** Diese Tests prüfen isolierte Module und einen vorhandenen synthetischen Datensatz. Sie sind **kein** vollständiger Webhook-End-to-End-Test, kein Paralleltest zweier echter erstmaliger Eingänge und keine tatsächlich unterbrochene Gesamtausführung. Wiederholungen mit **abweichenden** Formulardaten würden noch vorhandene Onboarding-Felder überschreiben; diese Geschäftspolitik ist abzuklären oder technisch abzusichern. Ebenfalls testen: Fehler bei Verknüpfung/Rechnungsdaten, Dauerhaftigkeit der Datensätze, Fehlerantwort und Datenschutzprüfung vor HTTP-200.
- Weitere Freigaben: Kundenorganisation und Einladungsberechtigung für `lars@lszh-automations.ch`; Google-Drive-Reautorisierung und separates eingeschränktes Dienstkonto; RC1-Projektbedingungen/AVV; Offerten-, Rechnungs-, Swiss-QR- und Archivtests.

## Technische Freigabeprüfung 14.10.2026 – Wiederholungs-Guard und kompletter On-Demand-Test

**Produktivstatus:** Make-Szenario `7777695` weiterhin **INAKTIV**, E-Mail-Versand durch Modul 9 mit harter `0=1`-Sperre verhindert. Keine Kundenmails, keine echten Einladungen, keine Vertragsfreigaben, keine Aktivierung.

**Neue Schutzlogik im Onboarding:**

1. Vor dem Airtable-Upsert fragt Modul 16 bestehende Onboardings für den Projektcode ab (maximal 2 Treffer).
2. Code-Modul 17 vergleicht den eingereichten Onboarding-Feldsatz mit dem bereits gespeicherten Datensatz, mit Normalisierung leerer Textfelder. Es unterscheidet `new`, `resume`, `conflict` (geänderte Angaben/mehrere Bestandsdatensätze/manuelle Klärung) und `already_complete`.
3. Router 18 leitet **nur** `new` und `resume` auf den Upsert und die restliche Projektverarbeitung weiter. Bei `conflict` sendet Make einen strukturierten Konflikt im JSON mit `duplicate=true` / `error=already_submitted`, den der bestehende Website-Proxy in HTTP 409 übersetzt. Make selbst liefert auf diesem Zweig zur Kompatibilität mit dem Website-Proxy HTTP 200 mit Geschäftsfehler im JSON; vor Direktzugriff auf den Make-Webhook prüfen. Bei `already_complete` wird der ursprüngliche Datensatz bestätigt, ohne erneut zu schreiben.
4. Datenschutz-Zweig bleibt unabhängig vom E-Mail-Zweig. Existenzprüfung über den stabilen Aufgabencode verhindert erneutes Öffnen einer bereits erledigten Datenschutzprüfung.
5. Bei identischer Wiederholung während unvollständiger Verarbeitung kann die Auftragsverknüpfung per erneutem `PATCH` repariert werden. Weiterhin keine Garantie echter atomarer Transaktion zwischen mehreren Airtable-Datensätzen.

**Isolierte Make-Testkopie `7963278` (nur synthetische Daten, ohne E-Mail-Modul):**
- Suchfilter in Modul 5 auf Auftrag `rec2958xrhm6QmIbM` eingeschränkt; keine echte Vertragsannahme gesetzt.
- Erste Ausführung: `saved` – Onboarding `recGKxPPzHhgUZ8W9` und genau eine neue Datenschutzaufgabe erstellt; alle Schreibmodule und die abschliessende Rückgabe erfolgreich.
- Gleiche Eingaben erneut: `saved` mit identischer Datensatz-ID, keine zweite Datenschutzaufgabe.
- Geänderter Projektname: `conflict` / `changed_input`; Ausführungsprotokoll zeigt **keine** Schreibmodule im Konfliktlauf. Der ursprüngliche Projektname blieb unverändert.
- Simulierte Teilunterbrechung: Auftragsverknüpfung beim fiktiven Onboarding entfernt, identische Eingabe erneut verarbeitet, Verknüpfung korrekt zum ursprünglichen Testauftrag wiederhergestellt.
- Einmalig Status `Vollständig` im Testdatensatz gesetzt: identische Eingabe führte zu `already_complete`; nur lesende Module und Antwortmodul liefen. Anschliessend ursprünglichen Teststatus `Eingegangen` wiederhergestellt.
- Die Testkopie `7963278` ist nach den Testläufen wieder **INAKTIV**. Ebenso sind die früheren isolierten Teststrecken `7962957`, `7962998`, `7963182` und `7963206` inaktiv.

**Noch nicht abgenommen:** Die Testkopie hat einen `StartSubscenario`-Trigger, **keinen Live-Webseiten-Webhook**. Noch nötig: tatsächlicher synthetischer HTTP-Webhook-Test, echte Unterbrechung in Make zwischen Modul 3 und Modul 6, gleichzeitige erstmalige Einsendungen, Fehlerantworten bei nicht autorisiertem Token oder Airtable-Ausfall sowie Stabilität bei späteren Datenaktualisierungen. Der instanzlokale Zwei-Minuten-Cache im Website-Proxy garantiert keine dauerhafte Exklusivität. Die übrigen Freigabeblocker zu Google Drive, RC1/AVV, Kundenorganisation und Rechnungs-/Offertenversand bleiben bestehen.
