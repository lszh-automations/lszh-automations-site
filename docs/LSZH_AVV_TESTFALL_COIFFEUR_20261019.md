# Synthetischer AVV-Arbeitsfall – Coiffeur-Terminautomation

Stand: 19.10.2026. Strukturierte Arbeitsnotiz zum bereits vorhandenen Coiffeur-TEST_ONLY-Beispiel im geschäftlichen Drive. Keine zweite Testannahme. Keine Rechtsberatung, keine echte Offerte oder AVV, keine Kundendaten, keine Freigabe für Produktivbetrieb.

## Erfundenes Szenario

**Testkunde:** Mustercoiffeur TEST GmbH – vollständig fiktiv, nicht im Handelsregister eingetragen.  
**Kontakt:** Lea Beispiel, kunde@example.invalid – fiktiv.  
**Projekt:** Termine für einen Coiffeurbetrieb erfassen, Kalenderkonflikte vermeiden, Termine im Kalender eintragen und einen Bestätigungs-/Erinnerungsablauf vorbereiten.  
**Umfang:** kleiner Pilotfall mit einer Testfiliale, zwei fiktiven Mitarbeitenden und ausschliesslich erfundenen Terminen.

## Test-Datenfluss

1. Ein synthetischer Termin wird in einer ausdrücklich als Test gekennzeichneten Airtable-Zeile erfasst.
2. Ein Make-Szenario in einer angenommenen kundenkontrollierten Testorganisation prüft Dubletten und Kalenderkonflikte.
3. Der Termin wird in einen Demo-Google-Kalender geschrieben und der Airtable-Teststatus aktualisiert.
4. Bestätigungs- und Erinnerungs-E-Mail-Schritte bleiben im Test deaktiviert; es wird keine Nachricht versendet.

**Angenommene Felder:** fiktiver Name, `example.invalid`-E-Mail, Dienstleistung, Datum/Uhrzeit, fiktive Mitarbeitendenkennung und Terminstatus. Keine echten Telefonnummern, Zahlungsdaten, Gesundheitsangaben oder besonders schützenswerten Personendaten. Keine KI, SMS oder Marketingkommunikation.

## Ausdrücklich erfundene Testannahmen

- Das vorhandene TEST_ONLY-Beispiel nennt eine geplante Testdatenbereinigung spätestens nach 90 Tagen. Diese Frist und Provider-Backups sind nicht verifiziert; es ist keine Kunden- oder Provider-Löschzusage.
- Airtable, Make und Google-Kalender laufen in getrennten Testkonten. Kontoinhaber, Vertragspartner, Datenregionen, Backupfristen und tatsächliche Löschfristen sind im Test nicht verifiziert.
- Der Kunde bestimmt im Test die Geschäftsregeln; LSZH richtet das Szenario ein. Die rechtliche Rollenverteilung muss für einen realen Auftrag separat anhand des konkreten Datenflusses beurteilt werden.
- Ein synthetischer Kontaktweg für Datenschutz- oder Sicherheitsvorfälle ist im Test nicht eingerichtet.

## Vor einem echten Coiffeur-Pilot zu erheben

- tatsächlicher Formular-, Airtable-, Make-, Kalender- und E-Mail-Anbieter sowie Kontoinhaber;
- die konkreten Datenfelder und ob Mitarbeitenden- oder Kundendaten enthalten sind;
- Anbieter-Datenregionen, Auftragsbearbeitungsverträge und genehmigte Unterauftragsbearbeiter;
- tatsächliche Aufbewahrungs-, Backup- und Löschfristen je System;
- wirksame Rollen/Berechtigungen in der kundeneigenen Make-Organisation;
- Ansprechpartner und erreichbarer Meldeweg für Vorfälle;
- finale Kundenunterlagen und projektbezogene AVV-Anlagen.

## Abgrenzung

Dieser Testfall konkretisiert nur ein plausibles Beispiel. Er ändert weder bestehende Vertragsunterlagen noch Cloud-/Make-Konfigurationen und erstellt keine realen Accounts, Einladungen, E-Mails, Termine oder Verträge. Produktivangaben dürfen erst nach Prüfung des konkreten Kunden-Setups in eine AVV übernommen werden.
