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
