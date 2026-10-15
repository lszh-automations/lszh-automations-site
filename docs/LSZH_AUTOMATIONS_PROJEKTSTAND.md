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


### Nachtrag 15.10.2026 – erste echte schlüssellose Cloud-Run-Archivprüfung PASS

**Erfolgreicher kundendatenfreier Cloud-Run-Lesetest per Geschäftsdienstkonto, vom Geschäftsführer mit Google-Cloud-Logs belegt:**
- Google Cloud Projekt `lszh-automations`, Dienst `lszh-archive-reader-staging`, Region `europe-west6` (Zürich), Node.js 22, Funktionseinstiegspunkt `archiveHealth`. Geschützter IAM-Aufruf und Ingress intern wurden beim Setup ausgewählt; keine Öffentlichkeit freigeben.
- Dienstidentität `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com`; das Konto besitzt ausschliesslich explizite Google-Drive-Lesefreigabe auf Geschäftsarchiv `1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in`. Organisationsrichtlinie `iam.managed.disableServiceAccountKeyCreation` blockiert dauerhaft herunterladbare Dienstkonto-Schlüssel und blieb **aktiv**.
- Verwendeter Code `cloud-run/archive-reader-staging/index.js` prüft via Cloud-Run-Metadata-Endpunkt Dienstkonto-E-Mail, bezieht kurzlebigen Google-OAuth-Token, liest die Metadaten eines fest vorgegebenen synthetischen AVV-Test-PDFs, kontrolliert Geschäftsordner, PDF-MIME, Dateigrösse, Drive Content Restriction `readOnly`, SHA-256-Checksumme und die tatsächlich heruntergeladenen PDF-Bytes. Keine Kunden-, Vertragsabschluss- oder Schreiboperationen.
- Die erste Funktion mit nicht abgewarteter Startprüfung protokollierte keine PASS/FAIL-Meldung. Beim aktualisierten Code mit Top-Level-`await` scheiterte ein Zwischen-Build wegen unvollständiger `index.js` beim manuellen Einfügen (`Unexpected end of input`), **kein** Google-Drive-/IAM-Fehler. Nach vollständigem Kopieren der Originaldatei ist die Cloud-Run-Revision **erfolgreich** bereitgestellt worden.
- **Original Google-Cloud-Logs / Screenshot vom 15.10.2026:** `2026-10-15 11:43:08.476 MESZ – LSZH_ARCHIVE_READER_STAGING: START`, unmittelbar danach `2026-10-15 11:43:09.746 MESZ – LSZH_ARCHIVE_READER_STAGING: PASS`, im Anschluss erfolgreiche Container-Startup-Probe und Cloud-Run-Revision Ready. Dies bestätigt die echte schlüssellose Archiv-Lese- und Byteintegritätsprüfung **für das synthetische PDF**.
- Google-Cloud-Billing laut Nutzerscreenshot Free-Trial mit CHF 250 Testguthaben (damals CHF 0.00 Kosten). Nicht als permanente kostenlose Umgebung behandeln, Guthaben-/Fristablauf beobachten.
- Noch **nicht** vollendet: authentifizierte, minimal berechtigte Render-zu-Cloud-Run-Verbindung bei internem Ingress; dynamische sichere PDF-ID-Zuordnung und Token-/Vertragsfreigabe, Migration alter Privat-Drive-Dateien, produktionsfähige End-to-End-Abnahme und später die juristische Prüfung. **Keine** öffentliche IAM-Invoker-Freigabe, keine produktive Offertenannahme/Versand aktivieren. Render-Staging und Draft PR getrennt von Live behalten.
