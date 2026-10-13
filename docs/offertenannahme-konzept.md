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
- OFFER_CONFIRMATION_WEBHOOK — URL eines getesteten Make-Szenarios, das die Annahme bestätigt und einen archivierten Beleg an Kunde und LSZH sendet
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
