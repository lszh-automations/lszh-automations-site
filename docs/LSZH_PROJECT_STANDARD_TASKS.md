# Standardaufgaben für neue Projekte

1. Automation einrichten
2. Gesamten Ablauf testen
3. Kundenabnahme einholen
4. Übergeben und Betrieb klären

Alle vier beginnen offen. Die Aufgaben werden automatisch angelegt, wenn eine angenommene Offerte ein neues Projekt erzeugt. Auch die manuelle Neuanlage zeigt sie bereits im Formular. Der Server ergänzt den Standard nur, wenn keine Aufgabenliste übergeben wird; eine ausdrücklich leere oder eigene Liste bleibt unverändert. Jede Aufgabe kann bearbeitet oder entfernt werden.

Bestehende Projekte werden nicht migriert. Das Öffnen/Bearbeiten alter Projekte und eine wiederholte Auftragsübernahme überschreiben keine Aufgaben. „Vorlage ergänzen“ übernimmt auf ausdrücklichen Klick die fehlenden Titel ohne doppelte identische Einträge. Es ersetzt keine anders benannten historischen Aufgaben automatisch.

Ablauf und Umfang werden bereits vor der Offerte geklärt und sind deshalb keine Standardprojektaufgabe mehr. Make-Bedarf, Einladung, Zugänge, Startdatum und Verantwortlichkeit bleiben in der bestehenden Vorbereitung. Rechnungen und Monatsabrechnung bleiben separat. Kein automatischer Projektstart, keine Mail, keine Zahlungsbuchung und keine Änderung an Make-Szenarien oder Zeitplänen.

548 CRM-Tests erfolgreich. Desktop und Mobil geprüft: vier offene Vorgaben, wiederholte Vorlage ohne Dubletten, bestehende eigene/erledigte Aufgaben und alte Projekte ohne Aufgaben unverändert. Keine Produktionsprojekte für Tests angelegt oder bestehende Kundendaten geändert.

[PR 47](https://github.com/lszh-automations/lszh-automations-site/pull/47), gestapelt auf PR 46.

## Live-Nachweis

Revision `lszh-crm-v2-00149-def`, 100 % Verkehr. Alle 83 Laufzeitdateien bytegleich verglichen; drei gezielte Änderungen an cloud-records.js, project-tasks.js und public/index.html. Konfiguration/Dienstkonto und produktiver Mailmodus unverändert. Live-HTML exakt, anonyme Aufgaben-API HTTP 401, 0 jüngste Revisionsfehler. Beide GitHub-Prüfungen erfolgreich. Rückkehrrevision `lszh-crm-v2-00147-roj`. Keine bestehenden Projekte geändert, keine Produktionsprojekte angelegt, keine Make- oder Scheduler-Änderungen. [Live-Nachweis](../releases/project-standard-tasks-live-20261027.json).
