# Elektronische Offertenannahme (Entwicklungsstand, NICHT produktiv)

Stand: 13.10.2026. Die gesamte Funktion ist bis zur juristischen und technischen Freigabe deaktiviert. **Nicht auf dem Hauptzweig aktivieren** und keine echten Kundenlinks erstellen, bevor die Checkliste unten erfüllt ist.

## Ziel

Kunde erhält einen einmaligen, nicht erratbaren Link. Die Seite zeigt die freigegebene Offerte und die geltende Version der Projektbedingungen als herunterladbare PDF-Dateien. Kunde gibt Name und geschäftliche E-Mail ein, bestätigt Vertretungsberechtigung und stimmt beiden Dokumenten ausdrücklich zu. Erst danach markiert der Server die Offerte als angenommen. Das bestehende inaktive Make-Szenario „LSZH Vertrieb – Offerte angenommen“ kann später die angenommene Offerte in den Auftrag übernehmen.

## Airtable Offerten

Hinzugefügte Felder (alle vorerst leer, bestehende Angebote unverändert):
- Online-Annahme Token-Hash — SHA-256 des Geheimlinks, niemals Klartext
- Online-Annahme Offerten-PDF / Offerten-SHA256 — eingefrorene Angebotsfassung und tatsächlicher Dateihash
- Online-Annahme Bedingungen-PDF / Bedingungen-SHA256 — freigegebene Vertragsversion und tatsächlicher Dateihash
- Online-Annahme Zeitstempel — Zeitpunkt inklusive Zeitzone (UTC gespeichert)
- Online-Annahme Person, E-Mail und Vertragsversion
- Online-Annahme Nachweis — Zeitpunkt, Dokumenthashes, Erklärung, pseudonyme IP, User-Agent

Die bisherigen Felder „Status“, „Angenommen am“, „Vertragsunterlagen akzeptiert“, „Projektbedingungen Version“, „Vertragsunterlagen versendet“, „Gültig bis“ werden wiederverwendet. Die verknüpfte Kunden-/Auftragsanlage bleibt in Make unverändert und ausgeschaltet.

## Feature Flag / Secrets

Render-Variablen (nicht im GitHub-Repository und noch NICHT gesetzt):
- OFFER_ACCEPTANCE_ENABLED=true — NUR nach vollständiger Freigabe
- OFFER_AIRTABLE_PAT — minimal berechtigter Airtable-Token für diese Base und die Offerten-Tabelle (Lesen und Schreiben)
- OFFER_PROOF_SALT — langer, einmalig generierter Salt für pseudonymisierte IP-Prüfinformation
- OFFER_TERMS_APPROVED_VERSION — exakt juristisch freigegebene Version, z.B. v1.0; Entwurf 0.9 ist gesperrt
- Bestätigung erfolgt durch Make-Szenario 7940220 via Airtable-Polling (noch deaktiviert), ohne synchronen Webhook
- SITE_BASE_URL — optional für das interne CLI

**Beachten:** Server führt einen Airtable-PATCH aus und ruft danach den Bestätigungs-WebHook auf. Ein Webhook-Fehler lässt die Annahme bestehen, meldet aber 'confirmation_email_pending'; deshalb sind Alarmierung, Wiederholung und Belegarchivierung noch produktiv zu bauen.

## Persönlichen Link ausstellen

Nach Freigabe, nachdem **die exakt versendete Offerten-PDF und die juristisch freigegebene Bedingungen-PDF unveränderbar archiviert** und deren echte SHA-256-Hashes in Airtable eingetragen wurden:

    node scripts/issue-offer-link.js recXXXXXXXXXXXXXXXX

Das interne CLI gibt den einmalig verwendbaren Link einmal auf der Konsole aus. Link per Offertenmail versenden. Für volle Automatisierung muss der Token-Ausstellungsschritt mit einem authentifizierten technischen Dienst hinter den Make-Versand gehängt werden. **Nicht** die Token in Airtable speichern oder im Frontend generieren.

Die Seite ist via /offerte-annehmen/?code=<persoenliches-token> erreichbar; /offerte-annehmen/?demo=1 zeigt nur ein unverbindliches Layoutmuster. Die beiden API-Routen POST /api/offer/preview und POST /api/offer/accept sind serverseitig hinter dem Flag gesperrt.

## Vor Go-Live zwingend

1. Projektbedingungen v1.0 juristisch prüfen und freigeben; Version und PDF als echte statische, herunterladbare unveränderliche Datei archivieren.
2. Offerten-PDF unmittelbar beim Versand ebenfalls unveränderlich archivieren; URL und tatsächlichen SHA-256-Hash pro Offerte speichern.
3. Prüfen, dass die Offerte alle individuellen Konditionen nennt (insbesondere Mindestdauer/Care, Betreuung, Abnahme und Start); Vertragsunterlagen vor Annahme zugänglich machen.
4. Ausgabe des 32-Byte-Zufallstokens im Make-Angebotsversand mit sicherer, authentifizierter Ausstellung integrieren; token hash in Airtable, nicht Klartext; duplizierte Versandversuche beachten.
5. Annahmebestätigung per Mail und archivierter unveränderlicher Beleg (identische PDF-Version, Datum/Zeitzone, Offertennummer und Zustimmungsprotokoll) vollständig implementieren.
6. Airtable-Berechtigungen begrenzen und gleichzeitige doppelte Annahmen über mehrere Webserver-Instanzen zuverlässig behandeln (Airtable-PATCH bietet hier kein atomisches Compare-and-Swap; ein Prozess-Lock genügt nur auf einer Instanz).
7. Die gesamte Strecke mit fiktiven Aufträgen und deaktiviertem Produktivversand testen: gültig, ungültig, abgelaufen, dupliziert, fehlende PDFs, Versionwechsel, manipulierte Eingaben, Serverausfall, Antwortmailausfall, Mehrfachklick, Mobilgerät.
8. Aktive Airtable-Automationen und das Make-Übernahmeszenario auf Nebeneffekte prüfen, bevor irgendeine Annahme den Status 'Angenommen' setzt. Niemals echte Kundenaufträge beim Test anlegen.
9. Datenschutzhinweise zur Protokollierung prüfen; keinen IP-Klartext oder Token in Analytics, Logs oder CRM speichern.
10. Erst nach juristischer und technischer Freigabe Feature Flag aktivieren, Make-Szenario kontrolliert einschalten und produktiven Prüflauf freigeben.

## Eingebaute Schutzmassnahmen

- Fail-closed, wenn Flag oder zentrale Konfiguration fehlt oder die Vertragsversion noch Entwurf 0.9 ist
- URL-Token mindestens 32 Zeichen; Airtable erhält nur SHA-256 des Tokens
- Prüfung auf Offertenstatus 'Versendet', versendete Unterlagen, Gültigkeit und korrekte Vertragsversion
- Offerten- und Bedingungen-PDF sowie SHA-256-Hashes müssen vorliegen
- E-Mail muss an die ursprüngliche Offertenempfängeradresse passen; dies ist keine starke Identitätsprüfung
- nicht vorausgewählte Checkboxen für Vertretungsberechtigung und Vertragsannahme
- serverseitiger Vergleich der Dokumenthashes beim Absenden
- keine Live-Aktion im Design-/Demomodus
- automatische Entfernung des persönlichen Links aus der Adresszeile und No-Referrer/No-Index
- Aufzeichnung vor der Bestätigungsmail; keine stillschweigende Behauptung einer zugestellten Mail

## Grenzen des Entwurfs

Dieses Verfahren ist eine dokumentierte elektronische Zustimmung, aber **keine qualifizierte elektronische Signatur** und keine sichere Identitätsprüfung. Ob für einzelne Kunden/Verträge weitere Anforderungen gelten, ist juristisch zu prüfen. Die veröffentlichten PDF-Links sind erst dann beweissicher, wenn die Dateien tatsächlich unveränderlich archiviert und ihre gespeicherten Hashes geprüft sind. Die Funktion ist in einem GitHub-Entwicklungszweig, nicht produktiv.

## STAGING-Verbindungen 13.10.2026

Alle drei Make-Szenarien sind deaktiviert; sequentielle und vertrauliche Ausführung ist eingestellt.

### 7835460 – Offerte erzeugen und versenden
PDF aus Google Docs wird nun vor dem Mailversand mit Google Drive Modul 7 als eigenständige PDF im bisherigen Make-Ordner 1QGdyp4hnbDYxi-liJGVftzTvT0kgPF7Q gespeichert. Modul 8 protokolliert die Drive-Datei-ID in Airtable (Online-Annahme Offerten Drive ID). Erst danach läuft die bereits vorhandene Offerten-E-Mail.

### 7940261 – Sicherer persönlicher Annahmelink
Airtable sucht nur versendete Offerten mit v1.0, beiden Archiv-Datei-IDs, beiden PDF-URLs, echten SHA-256-Prüfsummen, gültigem Datum und ohne Annahmetoken. Ein Make-Variablenmodul erzeugt einen zufälligen Token aus zwei UUIDs, CryptoFunctions bildet SHA-256 in Hex und Airtable erhält nur den Hash. Danach lädt Make beide PDFs herunter, mailt diese als Anhänge mit persönlichem Link und markiert den Versandzeitpunkt. Bei E-Mail-Fehler bleibt der Hash gesetzt und erfordert gezielte Entsperrung. Make-Mapping und Hashgleichheit müssen im isolierten Test verifiziert werden.

### 7940220 – Bestätigung und PDF-Annahmenachweis
Airtable-Suche nur nach elektronisch angenommener Offerte mit v1.0, Zeitstempel, vollständigen Archivfeldern, ohne gesendete Bestätigung und ohne Bearbeitungssperre. Claim-Checkbox wird zuerst gesetzt. Make lädt Offerte und Bedingungen, erzeugt und archiviert Annahmenachweis als PDF, versendet drei PDF-Anhänge und speichert anschliessend Versandzeit/Beleg-ID. Fehler zwischen Claim und Versand erfordern manuelle Prüfung statt riskantem automatischem Doppelversand.

### Besonders wichtig vor Freigabe
- Juristisch geprüfte Projektbedingungen v1.0 und rechtsverbindlicher Stand je Offerte. Keine Entwurf-0.9-Dokumente als Vertrag einsetzen.
- Freigegebene Vertragsbedingungen-PDF separat archivieren und tatsächliche Drive-ID, HTTPS-Download-URL und echten SHA-256-Dateihash in Airtable hinterlegen.
- Die Offerten-PDF-SHA-256-Ermittlung ist noch nicht automatisiert. Auch die neu angelegten Drive-Dateien sind nicht technisch unveränderlich.
- URL-Zugriff, genaue Dateibytes/Hashes und Make-Module auf Testdaten prüfen. Drive-Dateien sind ohne geeignete Freigabe möglicherweise nicht für externe Kunden lesbar.
- Verhalten bei Mehrfachannahme, Mailfehler, Crash nach Claim, Datenschutz/Beweisprotokoll und Dokumentmanipulation abschliessend testen.
- Portal/API liegen nur im GitHub-Draft-PR Nr. 1; weder auf die Live-Website deployen noch Make-Module aktivieren, bevor die Bedingungen und technische Abnahme vorliegen.

## Technische Hash-Verifikation und geschützte Auslieferung – 13.10.2026

**Neue Sicherheitsarchitektur (ersetzt ältere Aussagen zu öffentlich verfügbaren PDF-URLs):**

### Make 7835460 – Sperre und unabhängiger Archiv-Hash
1. Google Docs erzeugt das Angebots-PDF. Drive Upload (Modul 7) speichert es als reguläre PDF-Binärdatei.
2. Google Drive Download (Modul 9) liest genau die gespeicherte Datei erneut und liefert ihre von Google berechnete sha256Checksum.
3. Google Drive API (Modul 10) setzt `contentRestrictions.readOnly=true`. Diese Bearbeitungssperre ist **nicht WORM** und kann durch berechtigte Nutzer aufgehoben werden.
4. Google Drive API (Modul 11) liest Metadaten mit id, mimeType, size, sha256Checksum und contentRestrictions nochmals aus.
5. Airtable Update (Modul 8) läuft nur wenn dieselbe Datei-ID, identische SHA-256, MIME PDF und ein aktiver Schreibschutz vorliegen. Es speichert Drive-ID, SHA-256, `Online-Annahme Offerten-Archivstatus=VERIFIZIERT` sowie `Online-Annahme Offerten-Archivprüfung am`.
6. Die Offertenmail bekommt die **aus Drive erneut heruntergeladenen PDF-Bytes** (Modul 9) als Anhang, nicht eine separate, möglicherweise abweichende Exportdatei.

### Make 7940261 – Links nur bei intakten PDF-Archiven
Token-Hash wird **erst nach** Download beider archivierten PDFs geschrieben. Vor dem Speichern werden PDF-Dateityp und aktuelle Drive-SHA-256-Werte gegen Airtable verglichen. Die Suche verlangt Archivstatus VERIFIZIERT. PDF-URLs werden nicht mehr benötigt, da Kunden-Dokumente vom eigenen Server geschützt ausgeliefert werden.

### Make 7940220 – Bestätigungsmail nur bei intakten PDF-Archiven
Vor Setzen von `Online-Annahme Bestätigung in Bearbeitung` werden Offerten-/Bedingungen-PDF geladen und gegen beide gespeicherten SHA-256-Werte abgeglichen. Danach entstehen Annahmenachweis, PDF-Archiv und Bestätigungsmail (drei PDF-Anhänge). Fehlerbehandlung und Nachholung bleiben vor Go-Live offen.

### Website: geschützter PDF-Abruf und Prüfung unmittelbar vor Annahme
`offerArchiveVerifier.js` authentifiziert sich mit einem explizit berechtigten Google-Dienstkonto (kurzlebiges Drive-Read-Only-OAuth-Token, signiert mit Dienstkonto-Schlüssel). Jede Vorschau und jedes Annahmegesuch prüft **beide** PDFs anhand der aktuellen Drive-Metadaten, SHA-256 und `contentRestrictions.readOnly` auf dem Server. `POST /api/offer/document` liefert PDFs nur nach gültigem persönlichen Offertenlink; der Server berechnet zusätzlich SHA-256 der tatsächlich heruntergeladenen PDF-Bytes. Die PDFs müssen dafür nicht mit `anyone with the link` freigegeben werden. Der Kunde speichert sie über die Portal-Seite.

### Go-Live-Konfiguration fehlt absichtlich
- `OFFER_DRIVE_SA_B64`: Base64-kodiertes JSON eines Google Cloud Dienstkontos, ausschliesslich als Render Secret. Das Dienstkonto erhält Lesezugriff auf die betroffenen PDF-Archivdateien/den Archivordner. Keine Zugangsdaten im Code, Airtable oder Kundenmails.
- `OFFER_ACCEPTANCE_ENABLED=true` erst nach Freigabe, mindestens gültiger `OFFER_TERMS_APPROVED_VERSION`, `OFFER_AIRTABLE_PAT` und `OFFER_PROOF_SALT` erforderlich.
- Vertragsbedingungen v1.0 juristisch freigeben, als PDF in Drive speichern, Inhalt mit SHA-256 sichern, Bearbeitungssperre prüfen; pro Offerte `Online-Annahme Bedingungen Drive ID` und `Online-Annahme Bedingungen-SHA256` hinterlegen.
- Noch kein Live-Test mit tatsächlicher Drive-Berechtigung. Wegen fehlenden Dokumentfreigaben und Servicekonto bleiben die API-Routen durch das Flag gesperrt.
- Noch nicht gelöst: echtes WORM-/unveränderliches Langzeitarchiv, Aufbewahrungs- und Löschkonzept, atomare Annahme über mehrere Render-Instanzen, Wiederaufnahme nach Make-Verarbeitungsfehlern und rechtliche Prüfung der projektbezogenen Vertragsbedingungen.

### Tests und Freigabegrenze
GitHub Actions prüft Syntax sowie Acceptance-/Archivprüfungs-Unit-Tests gegen simulierte Drive-Antworten. Das beweist die Codepfade, ersetzt aber keinen realen End-to-End-Probelauf. Draft PR #1 bleibt offen, die drei Make-Szenarien bleiben inaktiv und die Render-Live-Website unverändert.

## Privates Vertragsarchiv und Freigabesperre – 13.10.2026

Google Drive STAGING-Wurzel: `1_1jVIlD2MAwkVxpTsCUIZ-14LjQggmA3`
Offerten-PDF: `1a2GIXQ9hnLP27PQHZCdLBh2wLevvf9jN`
Projektbedingungen-PDF: `1L6lESMSB0CFjZtgZ6vZaAl3zB-iNdI0M`
Annahmenachweise-PDF: `1I0PA-oMOTYUzA-q16frxnLbTUTiw9DlA`
Internes Freigaberegister: Google Doc `1ANPIYiKzLIg_yxKifhy5lZHQe0zIwfo2yD2Ll69fhtw` im STAGING-Ordner. Laut Drive-Metadaten nur Eigentümerberechtigung; diese Angaben ersetzen keine externe Zugriffssimulation.

Make-Offertenarchiv-Szenario 7835460 schreibt nun seine PDFs in den Offerten-PDF-Unterordner, und Make-Bestätigungsszenario 7940220 speichert Annahmenachweise im entsprechenden Unterordner. Verbindungsberechtigung der Make-Verbindung auf diese neuen Ordner ist noch durch einen echten Test zu bestätigen.

Projektbedingungen v1.0 RC1 sind als lokale vierseitige PDF- und Word-Freigabeentwürfe vorbereitet. RC1 darf **nicht** als freigegebene Version v1.0 in Airtable eingetragen oder automatisch versendet werden. Vor Freigabe ist eine neue finale Version mit dokumentierter juristischer und geschäftlicher Zustimmung abzulegen.

Airtable Feld `Online-Annahme rechtlich freigegeben` wurde in Offerten ergänzt (Checkbox, zunächst nicht gesetzt). Sowohl Make-Szenario 7940261 für persönliche Offertenlinks als auch 7940220 für die Bestätigungsmail verlangen `=1`. Der Server lehnt in `offerAcceptance.js` die Annahme ohne `true` ab und das interne `scripts/issue-offer-link.js` verweigert die Link-Ausstellung ohne diesen Status.

VOR FREIGABE OFFEN: juristische Prüfung, finale PDF v1.0 mit echter SHA-256, gültige Archiv-Datei-ID für die Projektbedingungen, Render Read-only Drive Dienstkonto, Datenaufbewahrung/Backup, verifizierte Berechtigungen der Make-Verbindungen, E2E-Test mit fiktiven Kunden und anschliessende dokumentierte Betriebsfreigabe. Die Google-Drive-Sperre ist keine WORM-Garantie.

## Google-Geschäftskonto – verbindliche Speicher- und Versandkonfiguration (13.10.2026)

Diese Angaben **ersetzen die alten STAGING-Ordner-IDs im privaten Google-Konto in früheren Abschnitten dieser Datei**. Die alten IDs bleiben hier ausschliesslich als historische Verweise auf nicht migrierten Altbestand; sie dürfen nicht erneut in Make-Module kopiert werden.

- Google-Konto/Identität: `lars@lszh-automations.ch`.
- Google Drive Verbindung in Make: `11904271`; neues geschäftliches STAGING-Archiv `1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in`.
- Geschäftliches Archiv Offerten-PDF: `1COIjnGZDK1XCPXNBNikHw-7eUKfjNXgU`.
- Geschäftliches Archiv Projektbedingungen: `1o9ADwrIAuhEtP7Mv7tDCY9-OkNpCxX3I`.
- Geschäftliches Archiv Annahmenachweise: `1Q8ws0VjPeDSOYhKrx5a6I5_uhzRM2zN7`.
- Geschäftlicher Testordner: `1gId6LLMy7b1PdbjZ0v_3zbETA-K-Q-AJ`.
- Google Docs Verbindung in Make: `11905001`, für Erzeugung von Offerten, Rechnungen und Annahmenachweisen. Quelldokumente werden derzeit in der geschäftlichen STAGING-Archiv-Wurzel erzeugt, nicht mehr im alten Privatordner.
- Gmail Verbindung in Make: `11904991`; über Gmail API verifiziert: Login ist `lars@lszh-automations.ch`, `info@lszh-automations.ch` ist ein akzeptierter Standard-Sendealias. Damit ist `info@lszh-automations.ch` als From-Adresse zulässig.
- Die relevante Verbindung wurde in **14 LSZH-Szenarien** auf das Geschäftskonto umgestellt (Angebote, Annahme, Rechnungen, Onboarding, Website, Follow-ups sowie Designvorschau). Anschliessende statische Prüfung ergab **keine alten Google/Gmail Verbindungs-IDs** in diesen 14 Szenarien; sie blieben inactive.
- Isolierter echter Google-Docs-Test (Make `7942502`) erfolgreich: Google Doc im Geschäftskonto erzeugt, als PDF exportiert, im geschäftlichen Testordner archiviert, PDF erneut gelesen; Drive PDF `1TAEeHE4Jj99_PgQE13uTRGYXkrEraBd0`, 36'810 Bytes, SHA-256 `2b89fbfb9ea0b0ad49b089176831bc47a1a98a0c1c0147fdf90cea5fe74c1852`.
- Isolierter echter Gmail-API-Test (Make `7942515`) erfolgreich, **keine Mail gesendet**; Profil und akzeptierter Sendealias geprüft.
- **Altbestand aus persönlichem Drive** (`lars.schulthess10@gmail.com`) ist noch vorhanden, nicht automatisch migriert oder gelöscht. Bei Migration erst vollständige Geschäftskonto-Kopie einschliesslich Prüfsummen verifizieren und anschliessend den Altbestand bewusst, kontrolliert bereinigen. Nie persönliche Drive-Freigaben oder Verbindungen für neue Kundenprozesse verwenden.
- Die produktive Online-Annahme, alle Sendeszenarien und die juristische Freigabe bleiben deaktiviert. Tests beweisen die Geschäftskonto-Verbindungen, **nicht** den gesamten rechtssicheren Vertragsabschluss.

## Migration des privaten Google-Drive-Altbestands – Status 13.10.2026

- Im alten Privat-Ordner befinden sich 10 Offerten- und 23 Rechnungs-Google-Docs. Fünf weitere dort liegende Dateien wurden als nicht eindeutig geschäftlich eingestuft; **nicht anfassen oder löschen**.
- Privates STAGING enthält zusätzlich historisches Freigaberegister, technische Test-PDF und Unterordner. Geschäftliche Quelle darf künftig nur noch `lars@lszh-automations.ch` sein.
- Neu im Business-Archiv: Migration-Altbestand Offerten `1zYeyu1YkCAWjfE-QYaUYrp-NAkuTCEUn`, Migration-Altbestand Rechnungen `1H4dD2UgGcNppfNXRwb8CCjmWHg5ETux2`, Migration-Dokumentation `10N1GJExndUMTZD_t9H2be-fiyyQ7iQ9R`.
- Nach Google-Docs-DOCX-Export wurden das **Freigaberegister und vier Dokumente** ins Geschäftskonto übertragen und per erneutem Download **bytegenau mit dem exportierten DOCX** abgeglichen. Zielkonto als Eigentümer `lars@lszh-automations.ch` bestätigt. Zuordnung und SHA-256 befinden sich im Airtable-Projektprotokoll (`reca5xn1Yza11guX0`).
- **29 Offerten/Rechnungen sowie historische technische PDF weiterhin offen.** Eine weitere automatisierte Übertragung wurde durch Sicherheitskontrollen blockiert, kein Umgehungsversuch; verbleibende Migration nur über zugelassenen Weg, ggf. manuell über Google Drive Export/Import, danach erst kontrollierte Bereinigung.
- Native Google Docs und deren Versionshistorie bleiben derzeit im alten Konto unverändert. `.docx`-Kopien spiegeln den exportierten Inhalt, nicht die Google Docs Änderungsverläufe. **Keine Originale dauerhaft löschen, bevor die vollständige Wiederherstellbarkeit einschließlich ggf. benötigter Historie geklärt ist.**
- Alle Test- und produktionsbezogenen Make-Szenarien nach Test wieder deaktiviert. Keine juristische Freigabe und keine Kundennachrichten.

### Nachkontrolle Geschäftsarchiv nach manuellem ZIP-Upload (13.10.2026)

- Nutzer hat die 29 noch fehlenden DOCX-Exporte sowie die drei Begleitdateien in die Geschäftskonto-Migrationsordner hochgeladen.
- Live Drive API über Make Geschäftsverbindung `11904271`: **10 Offerten-DOCX** im Geschäftskonto (eine vorherige + neun neue) und **23 Rechnungs-DOCX** (drei vorherige + 20 neue), `200 OK`; keine weiteren Seiten in der Ordnerabfrage.
- Alle **neun neuen Offerten** stimmen in Dateiname, Bytezahl und Drive-SHA256 mit den 9 Angebotsdatensätzen des exportierten `MANIFEST.json` überein. Eigentümer jeweils `lars@lszh-automations.ch`.
- Die drei Begleitdateien `MANIFEST.json`, `SHA256SUMMEN.txt`, `BITTE_LESEN.md` sind im Geschäftskonto vorhanden; ihre Drive-SHA256 stimmen mit den ZIP-Dateien überein.
- **Noch offen:** Die 20 neu hochgeladenen Rechnungen sind nach Gesamtzahl vorhanden, aber der vollständige Einzelabgleich sämtlicher SHA-256-Werte ist nach Blockierung einer umfangreichen Metadaten-Auswertung nicht abgeschlossen. Daher alte Google-Docs-Originale **noch nicht löschen**.
- Die nur lesenden Make-Testszenarien `7943019` und `7943290` wurden nach den Prüfabfragen deaktiviert; keine produktive Freigabe.
- Airtable Projektprotokoll: `reczfR3liqH18t0vI`.
