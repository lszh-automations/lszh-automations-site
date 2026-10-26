# Einheitliche Wortmarke, 26.10.2026

LSZH AUTOMATIONS verwendet den kompakten Schriftzug ohne separates App-Symbol. LSZH steht gross, AUTOMATIONS rechts daneben mit 4 px Abstand in HTML beziehungsweise rund 4 pt im PDF. Dunkle Flächen verwenden Weiss/Cyan, helle Flächen Dunkelblau/Blau. Die Mailvorlagen beziehen dieselbe HTML-Wortmarke aus `crm-v2/brand.js`; das Portal enthält die identische Kopie.

## Live-Umfang

- Website: Kopf- und Fussbereich sowie Make-Anleitung, Onboarding, sichere Übermittlung und Administration.
- CRM und Kundenportal: Wortmarke, Offerten- und Rechnungsvorschau.
- Mails: Offerte, Rechnung, Auftragsbestätigung, Kunden-Eingangsbestätigung und interne Benachrichtigung.
- PDFs: neue Offerten, Rechnungen, Auftragsbestätigungen inklusive Make-Anleitung sowie neu bereitgestellte Projektbedingungen und AVV-Vorlage.

## Bestehende Vertragsunterlagen

Archivierte oder bereits veröffentlichte Unterlagen werden nicht ersetzt. Bestehende Offerten der Dokumentversion `r1` werden beim erforderlichen Nachweis weiterhin mit dem bisherigen Wortmarkenabstand erzeugt, damit ihre originalen Bytes und Hashes erhalten bleiben. Neue Offerten verwenden `r1_wordmark_20261026`.

Die bisherigen Projektbedingungen bleiben im Dokumentkatalog als exakt gebundene Vorversion zugelassen. Die neue Fassung ergänzt nur die Wortmarke im freien oberen Rand aller fünf Seiten; der bisherige Text bleibt vollständig unverändert. Entsprechendes gilt für die fünfseitige AVV-Vorlage. Eine leere AVV bleibt gesperrt, bis die bereits bestehenden kundenspezifischen Anhänge und Freigaben vorliegen.

Der Make-Metadatenfilter in Szenario 8176339 wurde ausschliesslich um die beiden neuen Datei-IDs ergänzt. PDF-Typ, Ablageordner und nicht gelöschter Zustand bleiben verpflichtend. Alle fünf bisherigen Freigabearme sind unverändert.

## Prüfung und Betrieb

483 CRM-Tests, 32 Portaltests, beide GitHub-Prüfungen inklusive Firestore-Emulatortests sowie 24 Darstellungsfälle auf Desktop und Mobil erfolgreich. Alle 14 PDF-Seiten der Muster und neuen Vorlagen wurden visuell geprüft; der bisherige Vertragstext wurde zusätzlich seitenweise verglichen. Die bereitgestellten Quellarchive stimmen für alle 80 CRM- und 27 Portal-Dateien exakt mit den geprüften Dateien überein.

Website-Änderung separat über [PR 27](https://github.com/lszh-automations/lszh-automations-site/pull/27) auf main veröffentlicht. CRM und Portal sind mit unveränderter Konfiguration und unverändertem Dienstkonto live; [PR 28](https://github.com/lszh-automations/lszh-automations-site/pull/28) dokumentiert die gestapelte Änderung. Kein Mailversand, keine Änderung vorhandener Kundendaten und keine Datenmigration.

Der [Live-Nachweis](../releases/unified-wordmark-live-20261026.json) enthält Revisionen, Quellarchive, Dokumentversionen und Rückfallversionen.
