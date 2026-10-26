# Projekt-Onboarding nach Auftragsbestätigung

## Bedienung

Im CRM **Projekte → Projekt öffnen → Onboarding und Zugänge** öffnen. Den Make-Bedarf anhand des vereinbarten Auftrags klären. Wenn Make benötigt wird, kontrollieren, dass der Kunde LSZH unter **lars@lszh-automations.ch** in seine eigene Organisation eingeladen hat. Die Einladung erst danach manuell bestätigen. Anschliessend benötigte Zugänge, Rollen und Systemverbindungen gemeinsam prüfen und die Zugangsprüfung bestätigen. Mit **Speichern** übernehmen.

| Stand | Nächste Aufgabe |
|---|---|
| Make-Bedarf klären | Anhand des Auftrags klären, ob eine eigene Make-Organisation erforderlich ist. |
| Make-Einladung ausstehend | Kunden an die Einladung von LSZH in seine Organisation erinnern. |
| Zugänge prüfen | Benötigte Einladungen annehmen, Berechtigungen und Verbindungen kontrollieren. |
| Bereit zur Einrichtung | Projektstart mit dem Kunden abstimmen und Einrichtung planen. |

Ohne Make entfällt die Einladungsbestätigung; die Zugangsprüfung bleibt erforderlich. Die Projektliste zeigt den Stand und die nächste Aufgabe ebenfalls an. Im Notizfeld können fehlende Zugänge oder Prüfergebnisse festgehalten werden; keine Passwörter oder Zugangsschlüssel eintragen.

Änderungen des Make-Bedarfs setzen beide Bestätigungen im Formular zurück. Wird eine Einladung zurückgenommen, wird auch die darauf beruhende Bereitschaft zurückgesetzt. Änderungen werden erst durch Speichern wirksam. Der allgemeine Projektstatus und die vorhandenen Projektaufgaben werden separat gepflegt; Bereitschaft startet keine Umsetzung und versendet keine Nachricht.

## Daten und Grenzen

Das Feld `onboarding` wird als vollständiger, serverseitig geprüfter Datensatz am Projekt gespeichert: `makeRequired` (ungeklärt/ja/nein), `invitationConfirmed`, `accessConfirmed`, `notes` (maximal 2000 Zeichen). Widersprüchliche Bestätigungen werden zurückgewiesen. Eine Bereitschaft setzt geklärten Make-Bedarf und bei benötigtem Make die Einladung voraus. Bearbeitungszeit und Bearbeiter werden über den bestehenden Projekt-Audit gespeichert.

Neue Projekte, auch bei Auftragsübernahme, beginnen neutral mit ungeklärtem Make-Bedarf. Bestehende Projekte werden beim Lesen nicht verändert; ohne gespeicherten Onboarding-Stand zeigt die Oberfläche die Klärung als nächste Aufgabe. Erst bewusstes Speichern im Projekteditor legt den Stand für einen bestehenden Auftrag ab. Aufgaben und unabhängige Projektänderungen erhalten vorhandene Onboarding-Daten. Es gibt keine Datenmigration.

Die Bestätigungen stammen vom CRM-Bediener. Das CRM liest keine Make-Einladungen oder Zugangsrechte aus und kann deren tatsächlichen Zustand nicht verifizieren. Die Anzeige ergänzt keine Vertragsbedingung, verschickt keine Erinnerungsmail und ändert keine Make-Berechtigung. Projektbeginn und monatlicher Abrechnungsbeginn bleiben eigenständige fachliche Entscheidungen.

## Prüfung

472 CRM-Tests erfolgreich, darunter gültige und widersprüchliche Zustände, unveränderte Kunden-/Offerten-/Rechnungsdaten, Legacy-Projekte und Erhalt des Onboardings bei Aufgabenänderungen. Desktop und Mobil: sämtliche Übergänge, Voraussetzungen und Korrekturen, je zwei Speichern-/Wiederöffnen-Zyklen und Anzeige in der Projektliste geprüft; reale Netzwerkzugriffe blockiert. Zusätzlicher echter Firestore-Emulatortest für das bei Auftragsübernahme angelegte Projekt, Persistenz und Zurückweisung vorzeitiger Bereitschaft.

Implementierung: [PR 23](https://github.com/lszh-automations/lszh-automations-site/pull/23). Der abschliessende Live-Nachweis wird im Release-Manifest dokumentiert.

## Live-Nachweis

Aktiv seit 26.10.2026: `lszh-crm-v2-00097-yun`, 100 % Verkehr. [Release-Manifest](../releases/project-onboarding-live-20261026.json). Alle 79 tatsächlich gebauten Dateien exakt bestätigt; gegenüber dem vorigen Release nur `cloud-records.js`, `project-tasks.js` und `public/index.html` geändert. Beide GitHub-Prüfungen einschliesslich echter Firestore-Emulatortests erfolgreich. Konfiguration und Dienstkonto unverändert. Oberfläche HTTP 200, anonymer Projektzugriff HTTP 401, keine Fehler der neuen Revision im kontrollierten Zeitfenster. Keine Produktions-/Kundendatensätze bearbeitet, keine Mail versendet, Portal und Make unverändert. Rückfallrevision: `lszh-crm-v2-00095-hix`.
