> Aktuelle Bedienung seit 27.10.2026: Die [vereinfachte Projektansicht](LSZH_PROJECT_VIEW.md) zeigt einen nächsten Schritt und die Aufgaben. Startdatum und Verantwortlichkeit liegen unter «Vorbereitung und Zugänge»; Beschreibung, Offerte, Startnachweis und Rechnungen unter «Weitere Details». Die unten beschriebenen Fachregeln gelten weiterhin.

# Projektstart und Umsetzung

Unter **Projekte → Projekt öffnen** Startdatum und verantwortliche Person eintragen. Die bestehenden Umsetzungsschritte bearbeiten oder mit **Umsetzungsschritte ergänzen** eine anpassbare Liste für Abstimmung, Einrichtung, Test und Übergabe hinzufügen. Vorhandene Aufgaben werden erhalten; identische Vorlagentitel werden nicht doppelt ergänzt. Anschliessend **Speichern**.

## Bewusster Start

Der Abschnitt **Projektstart** zeigt fehlende Voraussetzungen. **Projekt starten** wird erst verfügbar, wenn das Projekt gespeichert ist und keine ungespeicherten Änderungen vorliegen. Benötigt werden ein zugeordneter Kunde, geklärter Make-Bedarf, gegebenenfalls die manuell bestätigte Einladung, geprüfte Zugänge, eine verantwortliche Person, ein gültiges Startdatum und mindestens ein Umsetzungsschritt. Ein zukünftiges Datum kann zur Planung gespeichert werden; starten lässt sich das Projekt erst am betreffenden Tag nach Schweizer Zeit oder danach.

Der Startknopf setzt den Status bewusst auf **In Arbeit**. Startdatum, Zeitpunkt der Dokumentation und ausführender CRM-Bediener sind danach sichtbar. Das dokumentierte Startdatum bleibt gesperrt; die Verantwortung kann später mit normalem Speichern übergeben werden. Aufgaben und allgemeiner Projektstatus bleiben weiter bearbeitbar. **Wartet auf Kunde** pausiert den allgemeinen Status; **In Arbeit** setzt ein bereits gestartetes Projekt fort, ohne dessen ursprünglichen Start zu überschreiben.

Der Start verschickt keine Mail, erzeugt keine Rechnung und setzt keinen monatlichen Abrechnungsbeginn. Die gespeicherten Onboarding-Bestätigungen sind manuelle Prüfungen; das CRM kontrolliert keine externen Zugangsrechte automatisch.

## Bestand und Sicherheit

Bestehende Datensätze werden nicht migriert. Ältere Projekte im Status **In Arbeit** bleiben bearbeitbar; ohne dokumentierten Start werden sie ausdrücklich entsprechend bezeichnet. Für einen erstmaligen dokumentierten Start gelten die Voraussetzungen auch bei solchen Projekten. Ein abgeschlossenes Projekt ohne Startnachweis wird nicht nachträglich automatisch gestartet.

`POST /api/records/projekte/:id/start` ist ausschliesslich für authentifizierte CRM-Bediener mit gültigem Ursprung verfügbar. Der leere JSON-Auftrag verwendet nur bereits gespeicherte Angaben. Der Server prüft die Voraussetzungen erneut und speichert `startedAt`, `startedBy` und Status atomar in einer Firestore-Transaktion. Ein wiederholter oder paralleler Startauftrag schreibt keinen zweiten Start und reaktiviert auch kein zwischenzeitlich pausiertes Projekt. `startDate` und `owner` sind die neuen bearbeitbaren Projektfelder; Startnachweise können nicht über gewöhnliche Datensatzänderungen gesetzt werden.

## Prüfung

488 CRM-Tests erfolgreich, darunter fehlende Voraussetzungen, Kalenderdaten und Schweizer Tagesgrenze, unveränderte kommerzielle Datensätze, Manipulationsversuche, wiederholter Start, Pause/Fortsetzung, Bestandsschutz und echte HTTP-Prüfungen von Anmeldung, Methode, Ursprung und Auftrag. Ein zusätzlicher Firestore-Emulatortest prüft parallele Starts über unabhängige Clients sowie den Erhalt von Offerte und Rechnung.

Desktop und Mobil wurden mit synthetischen Daten und vollständig blockierten externen Netzwerkzugriffen geprüft: offene Voraussetzungen, Speichern/Wiederöffnen, zukünftiger Start, ungespeicherte Änderungen, ergänzte Aufgaben ohne Duplikate, Startnachweis, Pause und ältere aktive Projekte.


## Live-Nachweis, 27.10.2026

Aktiv: **`lszh-crm-v2-00107-wif`**, 100 % Verkehr. Alle 80 Laufzeitdateien exakt bestätigt; gegenüber der vorherigen Revision nur `cloud-records.js`, `project-tasks.js`, `public/index.html` und `server.js` geändert. Konfiguration und Dienstkonto unverändert. Beide GitHub-Prüfungen einschliesslich echter Firestore-Emulatortests erfolgreich. Oberfläche HTTP 200; anonyme Projektabfragen und Startaufträge HTTP 401. Keine Fehlerlogs der neuen Revision im abschliessend kontrollierten Zeitfenster. Keine vorhandenen Kundendatensätze bearbeitet; keine Mail, Rechnung oder Abrechnung ausgelöst. Website, Portal und Make unverändert.

[PR 29](https://github.com/lszh-automations/lszh-automations-site/pull/29) · [Live-Manifest und Rückfallversion](../releases/project-start-live-20261027.json). Rückfallrevision: `lszh-crm-v2-00105-poy`.
