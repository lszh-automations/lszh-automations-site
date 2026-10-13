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
