# Vereinfachte Offertenansicht

Im Vordergrund stehen Kunde, Titel, Gültigkeit und Status sowie Empfänger, Positionen und die getrennten einmaligen und monatlichen Summen. Beschreibung und Website-Lead-Verknüpfung liegen unter **Beschreibung und weitere Angaben**. Diese Felder werden auch zugeklappt gespeichert. PDF-Vorschau, Schliessen und Speichern bleiben am unteren Rand erreichbar.

## Ein nächster Schritt

**Nächster Schritt** ersetzt die beiden gleichzeitig sichtbaren Bereiche für Versand und Online-Annahme. Je nach gespeichertem Stand erscheint nur der passende Ablauf:

- Offerte ergänzen und speichern beziehungsweise versandbereit stellen.
- Empfänger, Offerte und Vertragsunterlagen prüfen und bewusst senden.
- Nach erfolgtem Versand auf die Kundenantwort warten; Nachfassen und Verlauf sind bei Bedarf aufklappbar.
- Nach Eingang der Kundenannahme gegebenenfalls den Archivnachweis abwarten und die Annahme intern prüfen.
- Auftragsbestätigung anhand ihrer PDF-Vorschau prüfen und bewusst versenden.
- Nach bestätigtem Versand den Auftrag übernehmen beziehungsweise die bereits zugeordnete Rechnung weiterbearbeiten.

Die Hinweise zur eigenen Make-Organisation sind in der internen Versandvorschau aufklappbar. Die Angaben in Kundenmails, PDFs und Kundenportal werden dadurch nicht verändert. AVV-Einstufung, Dokumentprüfung und Aufbewahrungsfreigabe bleiben ausdrücklich erforderlich.

## Fehler und Bestandsschutz

Unklare Paket- oder Bestätigungsversände bieten ausschliesslich die bisherigen passenden Prüfaktionen. Bei fehlendem Bearbeitungsstand erscheint **Stand erneut laden**; es wird nicht ersatzweise ein anderer Versandweg eingeblendet. Ist die Online-Annahme nicht aktiviert oder für den gespeicherten Entwurf noch nicht anwendbar, bleibt der bisherige CRM-Ablauf als einziger aktiver Bereich verfügbar. Bei online versendeten Paketen werden manuelle Annahme-/Ablehnungsknöpfe nicht zusätzlich im Nachfassbereich angeboten.

Ungespeicherte Änderungen verbergen Versandaktionen, bis die gespeicherte Fassung erneut geladen wurde. Verzögerte Antworten werden nach Änderungen oder erneutem Öffnen nicht in die aktuelle Ansicht übernommen. Die Formularfelder bleiben bei versendeten oder angenommenen Offerten gesperrt. Eine gespeicherte Offerte lässt sich nach einer Aktion auch ausserhalb der ersten Registerseite gezielt wieder öffnen.

Diese Änderung betrifft die Oberfläche. Endpunkte, Statusregeln, Kundenzuordnung, Vertragsdokumente, Preise, Archivierung und Versandpfade bleiben erhalten. Beim Öffnen werden nur Status und gegebenenfalls Vorschauen gelesen. Es gibt keinen automatischen Versand, keine automatische Auftragsübernahme und keine Datenmigration.

## Prüfung

493 CRM-Tests erfolgreich. Die vorhandenen Tests für Paketversand, bewusste Prüfungen, Annahmefreigabe, Auftragsbestätigung und Schutz gegen doppelte Aktionen bleiben vollständig erhalten; lediglich die Extraktionsgrenze des UI-Testprogramms wurde an die asynchrone Darstellungsfunktion angepasst.

Desktop und Mobil mit blockiertem externem Netzwerk geprüft: eine aktive Ansicht, Versand erst nach ausdrücklichen Prüfungen, Nachfassen ohne parallele manuelle Annahme, sofort sichtbare Online-Annahme, ausstehender Archivnachweis, Auftragsbestätigung, unklare Versände, Lesefehler/Wiederholung, ungespeicherte Änderungen, veraltete Antworten beim erneuten Öffnen, Erhalt zugeklappter Felder, bestehender CRM-Ablauf ohne Online-Annahme sowie vollständig sichtbare Fusszeilenknöpfe. Alle Versandklicks waren simuliert; keine Kundenmail.


## Live-Nachweis

Aktiv seit 27.10.2026: **`lszh-crm-v2-00113-gac`**, 100 % Verkehr. Alle 80 gebauten Laufzeitdateien exakt bestätigt; gegenüber der vorherigen Revision nur `public/index.html` geändert. Konfiguration und Dienstkonto unverändert. Beide GitHub-Prüfungen einschliesslich Firestore-Emulatortests erfolgreich. Live-Oberfläche HTTP 200; der Vertragsstatus ist anonym HTTP 401. Keine Fehlerlogs der neuen Revision im abschliessend kontrollierten Zeitfenster. Keine Kundendatensätze, Zuordnungen, Preise oder Dokumente verändert; keine Mail, Rechnung oder Auftragsübernahme ausgelöst. Offerte 1003 bleibt wie gewünscht unzugeordnet. Website, Portal und Make unverändert.

[PR 32](https://github.com/lszh-automations/lszh-automations-site/pull/32) · [Live-Nachweis](../releases/simple-offers-live-20261027.json). Rückfallrevision: `lszh-crm-v2-00111-yaf`.
