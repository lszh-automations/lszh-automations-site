# Fachlicher Ablauf: Prüfung vom 27.10.2026

## Ergebnis und Grenzen

Online-Vertragsannahme funktioniert. Die Korrektur zu C3.7.2 bleibt bestehen; kein erneuter Fehler festgestellt. Rein lesender Datenabgleich vom 27.10.2026: 10 Leads, 1 Kunde, 10 Offerten, 7 Rechnungen und 5 Projekte. Bestehende Daten wurden nicht verändert. Kein Versand, keine Zahlungsbuchung und keine Make-Änderung. Das Dashboard bleibt in seiner bisherigen schlichten Aufgabenansicht.

Der vollständige interne Ablauf wurde zusätzlich mit ausschliesslich lokalen Beispieldaten durchgespielt: Qualifizierung, Kundenannahme, gesperrte vorzeitige Auftragsübernahme, bestätigte Übernahme, Kundennummer, Projekt, einmaliger Rechnungsentwurf, Make-/Zugangsprüfung, Startdatum/Verantwortlichkeit, Projektstart, Versandreservierung und synthetischer Versandbeleg, idempotente Teilzahlung, vollständige Projektcheckliste, Projektabschluss und Restzahlung. Die Online-Annahme, Archivierung, Bestätigung und Make-Hinweise werden zusätzlich durch ihre bestehenden getrennten Testreihen geprüft. Es wurde keine neue echte Kundenannahme und kein echter Gmail-/Make-Versand ausgelöst. Lokale Nachweise ersetzen keinen ausdrücklich gewählten vollständigen Live-Durchlauf.

## 1. Offerte und Auftragsübernahme

Offerten 1002, 1005, 1006 und 1007 haben bestätigte Online-Annahmen, abgeschlossene Archivierung und keinen offenen internen Prüfvermerk. Jede hat genau ein Projekt und einen verknüpften ersten Rechnungsentwurf bzw. die daraus weiterbearbeitete Rechnung. Kunde jeweils KD-1000. Offerte 1004 ist ein historisch angenommener Auftrag mit Projekt und bestehenden verknüpften Rechnungen; ein neuer Rechnungsentwurf wäre hier keine pauschale Reparatur. Offerte 1003 bleibt entsprechend der Benutzerentscheidung ohne Kundenzuordnung. Im gesamten Abgleich keine fehlenden referenzierten Datensätze oder widersprüchlichen Rechnung-/Projekt-Kundenzuordnungen.

Automatische Übernahme und Kundennummern werden transaktional/idempotent vergeben. Einmalige Positionen erzeugen einen Entwurf, monatliche Leistungen keine vorzeitige Rechnung. Eine einseitige Kundenannahme ersetzt nicht die interne Bestätigung. Der Kunde erhält den Hinweis zur eigenen Make-Organisation bereits vor Annahme in neuen versionierten Paketen; historische Pakete werden nicht nachträglich umgeschrieben.

## 2. Projektvorbereitung und Umsetzung

Projekte zu Offerten 1002 und 1005 sind geplant. Hier fehlen noch dokumentierter Make-Bedarf, Zugangsprüfung, Startdatum, Verantwortlichkeit und Umsetzungsschritte. Diese Daten lassen sich nicht sachgerecht aus dem Offertenstatus erfinden.

Projekt zu Offerte 1006 ist historisch „In Arbeit“, ohne dokumentierten Start und ohne konkrete Umsetzungsschritte. Das wird nicht rückwirkend als dokumentierter Projektstart ausgegeben. Da das Dashboard bewusst nur konkrete Aktionen zeigt, erzeugt dieser Status allein keine pauschale Aufgabe. Nächster fachlicher Schritt: den tatsächlichen nächsten Umsetzungsschritt im Projekt erfassen. Keine automatisch erfundene Aufgabe oder nachträgliche Make-/Zugangsbestätigung.

Projekte zu Offerten 1004 und 1007 sind abgeschlossen; fehlende historische Startdaten öffnen diese nicht erneut. Projektabschluss und Rechnungszahlung bleiben unabhängig: ein abgeschlossenes Projekt schliesst keine offene Forderung.

**Belegte Logiklücke und Korrektur:** Die Aufgabenanzeige konnte nach Zugangsprüfung und erfassten Umsetzungsschritten bereits „Projektstart bestätigen“ anzeigen, obwohl gültiges Startdatum oder verantwortliche Person fehlten. Die Anzeige verwendet jetzt dieselbe Startbereitschaft wie der eigentliche Projektstart. Sie fordert zuerst die wirklich fehlende Angabe; eine künftige Startzeit wartet erst, wenn alle übrigen Voraussetzungen erfüllt sind. Oberfläche und fachliche Startbedingungen wurden nicht umgebaut.

## 3. Rechnung, Versand und Zahlung

Rechnungen 1000, 1001, 1002, 1003 und 1005 haben gespeicherte Versandnachweise. Ihre Zahlungsstände bleiben offen bzw. teilbezahlt, soweit keine vollständige Zahlung verbucht ist. Rechnung 1005 ist versendet und offen; das frühere Problem war die noch fehlende PDF-Prüfung, kein fehlender automatischer Versand.

Rechnungen 1004 und 1006 sind Entwürfe. In der Versandbereitschaft fehlt jeweils die gültige Fälligkeit. Das ist eine notwendige manuelle Eingabe und kein Fehler der automatischen Entwurfserstellung. Nicht automatisch auf Offen gesetzt oder versendet.

Bei Teilzahlung wird der tatsächliche Rest in Rappen weitergeführt; identische Zahlungswiederholungen erzeugen keine zweite Buchung. Vollzahlung schliesst die Rechnung. Bereits erledigtes Projekt und noch offene Rechnung sowie bezahlte Rechnung und noch offene Projektarbeit sind voneinander unabhängig. Fällige Erinnerungen erfordern weiterhin Prüfung und bewussten Versand, sieben volle Tage Abstand zwischen den Stufen und keine automatische Wiederholung bei unklarem Versand.

Der Abgleich bestätigt gespeicherte Versandbelege und Buchungen; er bestätigt nicht den Eingang im Empfängerpostfach oder Bankkontobewegungen. Kein neuer Gmail- oder Bankabgleich vorgenommen. Eine Bankanbindung besteht nicht.

## Noch gesondert zu klären: monatliche Leistungen

Die geprüfte CRM-Annahmelogik erstellt ausschliesslich Rechnungsentwürfe für einmalige Positionen. Ein verbindlicher Abrechnungsbeginn und die wiederkehrende Erstellung monatlicher Rechnungsentwürfe sind in diesem geprüften CRM-Ablauf nicht nachgewiesen. Der Projektstart ist ausdrücklich kein automatischer monatlicher Abrechnungsbeginn. Eine möglicherweise ausserhalb dieses CRM laufende Make-Abrechnung wurde bei dieser Prüfung nicht neu abgeglichen. Vor einer Erweiterung zuerst bestehende externe Abrechnung ausschliessen und die fachliche Regel zu Beginn, Turnus und anteiligen Monaten festlegen; keine pauschalen Monatsrechnungen erzeugen.

## Nächste fachliche Schritte

1. Im laufenden Projekt zu Offerte 1006 den tatsächlichen nächsten Umsetzungsschritt erfassen.
2. Für geplante Projekte 1002 und 1005 die tatsächlichen Make-/Zugangsvoraussetzungen prüfen und Startdatum, Verantwortlichkeit sowie Umsetzungsschritte ergänzen.
3. Bei Rechnungsentwürfen 1004 und 1006 die vereinbarte Fälligkeit ergänzen und erst nach inhaltlicher/PDF-Prüfung entscheiden, ob sie versendet werden sollen.
4. Bestehende externe Monatsabrechnung abgleichen; anschliessend Abrechnungsbeginn, Turnus und gegebenenfalls anteilige Monate für monatliche Leistungen festlegen.
5. Einen konkreten Vorgang für einen vollständigen Live-Durchlauf auswählen, falls tatsächlicher Versand und Zahlungsnachweise erneut geprüft werden sollen. Keine bestehenden Szenarien auf Testbetrieb umstellen.

## Validierung

539 CRM-Tests erfolgreich, darunter der neue zusammenhängende Lebenszyklus mit allen relevanten Dashboard-Übergängen sowie Startdatum-/Verantwortlichkeits- und Zukunftsgrenzen. Bestehende Tests prüfen weiterhin Online-Annahme, Voraussetzungen vor Annahme, Auftragsbestätigung, Versandbelege, Transaktionen, Kunden-/Rechnungsnummern und Zahlungs-/Mahnlogik.

## Live-Korrektur

Revision `lszh-crm-v2-00145-kud`, 100 % Verkehr. 82 Laufzeitdateien bytegleich verglichen; ausschliesslich cockpit-summary.js geändert. Oberfläche, Konfiguration und Dienstkonto unverändert. Live-HTML bytegleich, anonyme Aufgaben-API HTTP 401; 0 jüngste Revisionsfehler. Beide GitHub-Prüfungen erfolgreich. Rückkehrrevision `lszh-crm-v2-00143-yeh`. [Live-Nachweis](../releases/project-task-readiness-live-20261027.json) - [PR 45](https://github.com/lszh-automations/lszh-automations-site/pull/45).
