# Kundenabnahme und Übergabe im Projekt

Im Projekt den Abschnitt **Abnahme und Übergabe** öffnen. Die Felder werden mit dem bisherigen Projekt-Speichern gespeichert:

- Kundenfreigabe des Projektergebnisses am: nur das tatsächlich bestätigte Datum eintragen.
- Freigabe oder offene Punkte: kurze Notiz, z.B. durch wen freigegeben oder welche Punkte noch offen sind. Notizen können bereits vor einer Freigabe erfasst werden; das Datum bleibt dann leer.
- Anleitung / Ablageort: Link oder Hinweis auf die dem Kunden bereitgestellte Dokumentation. Kein Datei-Upload oder automatisches Drive-Recht.
- Wer erhält und bearbeitet Fehlermeldungen: vereinbarte Person, Adresse oder Zuständigkeit.
- Übergabe erfolgt am: tatsächliches Übergabedatum. Dafür müssen Anleitung/Ablageort und Zuständigkeit ausgefüllt sein.

Abnahme und Übergabe beziehen sich auf das Projektergebnis, nicht auf die bereits vorhandene Online-Vertragsannahme der Offerte. Kein Feld wird automatisch bestätigt oder mit dem heutigen Datum gefüllt. Datumsangaben müssen gültige Kalendertage sein und dürfen nicht in der Zukunft liegen. Leere Datumsfelder sind erlaubt. Bereits abgeschlossene Projekte können mit tatsächlichen historischen Nachweisen ergänzt werden.

Die Aufgaben bleiben separat manuell abhakbar; Nachweise ändern weder Aufgabenstatus noch Projektstatus und beeinflussen keine Monatsabrechnung. Es wird keine Nachricht oder Kundenbestätigung versendet. Der Eintrag ist eine interne manuelle Dokumentation, keine neu eingeholte digitale Unterschrift oder unabhängig verifizierte Kundenbestätigung.

Der Server speichert Bearbeiter und Zeitpunkt der letzten Nachweisänderung. Diese Angaben können vom Browser nicht vorgegeben werden; spätere andere Projektänderungen verschieben sie nicht. Dies dokumentiert die letzte Bearbeitung, keine unveränderbare vollständige Änderungshistorie. Bestehende Projekte bleiben ohne Nachweise, bis der Bediener tatsächlich etwas einträgt. Öffnen und sonstige Änderungen erzeugen bei historischen Projekten kein leeres Nachweisobjekt. Beim Wechseln zwischen Projekten werden alle fünf Felder und die Bearbeiteranzeige neu aus dem jeweiligen Datensatz geladen.

550 CRM-Tests erfolgreich, insbesondere Validierung, zukünftige/ungültige Daten, Übergabevoraussetzungen, gespeicherte Bearbeiterdaten, Erhalt anderer Projekt-/Auftragsdaten und historischer Projekte. Desktop/Mobil: fünf Felder speichern/erneut laden, kein Status-/Aufgabenwechsel, kein Übersprechen zwischen Projekten und keine Netzwerk-Nebenwirkungen. Keine Produktionsprojekte oder Kundenfreigaben für Tests angelegt.

[PR 48](https://github.com/lszh-automations/lszh-automations-site/pull/48), gestapelt auf PR 47.

## Live-Nachweis

Revision `lszh-crm-v2-00151-yam`, 100 % Verkehr. Alle 83 Laufzeitdateien bytegleich verglichen; drei gezielte Änderungen an cloud-records.js, project-tasks.js und public/index.html. Konfiguration/Dienstkonto und produktiver Mailmodus unverändert. Live-HTML exakt, anonyme Aufgaben-API HTTP 401, 0 jüngste Revisionsfehler. Beide GitHub-Prüfungen erfolgreich. Rückkehrrevision `lszh-crm-v2-00149-def`. Keine vorhandenen Projekte verändert, keine Kundenfreigaben eingetragen oder Nachrichten versendet. Make und Scheduler unverändert. [Live-Nachweis](../releases/project-handover-evidence-live-20261027.json).
