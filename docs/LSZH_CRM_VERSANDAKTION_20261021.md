# CRM-Pflichtfelder und Versandaktion – kontrollierter interner Durchlauf

Ziel des Betreibers: Anfrage im CRM prüfen, Offerte vollständig ausfüllen, manuell Versand auslösen. Danach sollen Dokumente, Archiv, persönlicher Link und Mail aus genau diesem Datensatz entstehen. Dies ist die relevante Bedienkette; separate PDF-/Mail-Fixtures ersetzen sie nicht.

## Live-Felder

In Offerten ergänzt: Versandprüfung (Formel), Versandstatus (Text), Versandfehler (Text). Vorherige Formel Offertenversand bereit und Make-PDF-Konfiguration gesichert. Neue Prüfung verlangt Offertennummer, Leistung, Ausgangssituation, Ziel, Leistungsumfang, Ausschlüsse, Systeme, positive/nichtnegative Preise, Zahlungsmodell/-ziel, nicht abgelaufene Gültigkeit, Bedingungenversion, eindeutigen Lead/Kontakt/Firma/E-Mail/vollständige Adresse und AVV-Entscheid; bei Ja zusätzlich finale AVV-ID/Hash/Version. BEREIT ist keine Versandbestätigung. Offertenversand bereit=JA nur bei BEREIT, Entwurf und manueller Versandfreigabe.

Neue Testofferte recu9g2QdW6KvavCp / TEST_CRM_VERSAND_20261021_NO_CONTRACT, separater Testlead recHRNFVth6cyEWls, feste Geschäftsadresse, CHF 120 einmalig, monatlich 0, 30 Tage, gültig bis 20.11.2026, AVV Nein, TEST_v1.0_RC1. Übernommen=true verhindert Kunden-/Auftragsanlage, Produktivflags false/leer. Ziel zunächst absichtlich leer: Formel zeigt Fehlt / prüfen: Ziel.

## Testverdrahtung

Bestehendes Make-Szenario 7835460 nur vorübergehend auf diesen Record, Nummer, interne Adresse, BEREIT, Schnellaktion Für Versand freigeben und Versandstatus PDF angefordert begrenzt. Native PDF-Reservierung vor Google Docs, Export, Upload, erneutem Lesen, Schreibschutz und Hash-/Archivnachweis; ursprüngliche Gmail-Module bleiben zusätzlich deaktiviert und hart gefiltert. Kein neuer Make-Versandpfad für Kunden.

Temporärer Windows-Operator scripts/crm-test-dispatch-watch.mjs beobachtet genau diesen Record. Unvollständige Aktion schreibt Blockiert und konkrete Fehlfelder, ohne PDF/Mail. Vollständige Aktion setzt PDF angefordert, Make erzeugt die tatsächliche Offerte aus CRM-Daten. Danach prüft der Operator Inhaltshashes/Schreibschutz/Elternordner beider archivierten PDFs, friert den Quellfingerabdruck ein, reserviert einen einmaligen Versandversuch in Staging-Firestore und legt einen unveränderlichen Vorschau-Snapshot ab. Ein kurzlebiger öffentlicher read-only Dienst liefert genau diese Bytes nach Codeprüfung, niemals Annahme. Vor Gmail nochmals frischen CRM-Stand/Fingerabdruck prüfen. Genau eine Mail an Lars, danach CRM auf Versendet/Versandt, Zeitstempel und Aktion leeren. Keine Annahme, Buchung oder Rechnung.

Die Testbrücke verwendet bestehende Windows-verschlüsselte Geschäftsanmeldung. Keine Tokenausgabe. Sie ist zeitlich begrenzt und **kein** Kunden-Dauerbetrieb auf dem Surface. Bestehende Kundenroute bleibt deaktiviert. Für spätere Kunden muss diese Orchestrierung in eine geprüfte serverseitige Betreiberstrecke mit passenden Verbindungen überführt werden; nicht die lokale Brücke als Produktivautomatik bezeichnen.

Öffentliche Vorschau: feste neue Testquelle, Firestore nur lesen, isolierte Serviceidentität, gebundene Dokumenthashes und Ablauf, gleiche PDF-Bytes wie Mailanhänge. Kein Zugriff auf beliebige Offerten/Archive, keine öffentliche Claim-Funktion. Bereits abgeschlossene V3-/Eigenvorgang-/Mailtests unverändert.

## Lokale Prüfung vor Live-Lauf

316 Node-Tests: 310 bestanden, 6 übersprungen, 0 Fehler. Neue Fälle prüfen CRM-Feld-/Empfänger-/Freigabesicherheit, Quelländerungen und reale HTTP-Snapshot-PDFs mit Hashgleichheit, falschem Code ohne Snapshot-Lesung und gesperrter Annahme. Live-Ergebnis wird separat dokumentiert. Vorheriges Make-JSON: docs/evidence/make-crm-dispatch-7835460-before-20261021.json.

## Bestätigter Live-Durchlauf am 21.10.2026

Negativtest mit fehlendem Ziel: Bedienaktion erkannt, Versand blockiert, konkrete Fehlermeldung, kein PDF-/Mailversand. Nach Ergänzung BEREIT. Lars speicherte die Schnellaktion; der Operator erkannte sie und setzte PDF angefordert. Automatischer Make-Lauf aa1671249c064d658b00212492585f1a um 19:06:21 Schweizer Zeit: zehn Moduloperationen, keine Fehler, tatsächliche CRM-Offerte erzeugt und archiviert. Keine manuelle scenario_run-Auslösung.

Versand am 21.10.2026 um 19:06:54 Schweizer Zeit an lars@lszh-automations.ch, Gmail-ID 1a15f6e1d37ae10a. Evidenz: crm-dispatch-live-20261021.json. Unabhängiges erneutes Lesen bestätigt Firestore PROVIDER_CONFIRMED, Gmail SENT und exakten Empfänger, Airtable Status Versendet / Versandstatus Versandt, geleerte Schnellaktion und zurückgesetzte Freigabe. PDF aus dem Archiv heruntergeladen; beide Seiten visuell geprüft. Text und Preise lesbar; der Abschnitt „Nicht enthalten“ bricht zwischen Überschrift und Inhalt um. Diesen Vorlagenumbruch vor Kundenfreigabe korrigieren. Lars bestätigt beide lesbaren PDF-Anhänge sowie denselben öffentlichen Link mit CHF 120 einmalig / CHF 0 monatlich und deaktivierter Annahme.

Anschließend temporären Vorschau-Dienst gelöscht (PUBLIC_TEST_PREVIEW_REMOVED). Make 7835460 deaktiviert; Module 1/3/8/12 vollständig mit gesichertem Stand verglichen und identisch wiederhergestellt, V3-Filter zurückgesetzt, Intervall 900 Sekunden, Module 5/6 deaktiviert und harte Mail-Sperre erhalten. Null unvollständige Ausführungen. Szenario bleibt bewusst inaktiv. Neue Pflichtfeldprüfung und Versandstatus-Felder bleiben erhalten; Feldschema separat gesichert.

Nachgewiesen ist die zusammenhängende interne Bedienkette: CRM-Pflichtfelder → manuelle Freigabe → Make-PDF → geprüftes Archiv → persönlicher Testlink → Mail → CRM-Rückmeldung. Für den dauerhaften Kundenbetrieb fehlt noch die serverseitige Orchestrierung anstelle des temporären Windows-Operators samt dauerhaftem Kundenlink. Die Kundenroute wurde nicht aktiviert; keine Annahme, Rechnung, Buchung oder externe Kundenmail aus diesem Durchlauf.

