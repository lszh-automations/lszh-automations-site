# Rechnungsversand und Zahlungsstatus unterscheiden

Stand: 27.10.2026

Der Zahlungsstatus Offen bedeutet nicht, dass eine Rechnung versendet wurde. Rechnungsliste, Kundendetail und Dashboard zeigen deshalb zusätzlich den dokumentierten Versandstand: Kein Versandnachweis, Versand läuft, Versand unklar, Nicht versendet oder Versendet. Fehlende historische Nachweise werden nicht nachträglich als gesendet oder sicher nicht gesendet ausgelegt. Versandbestätigung und Zeitpunkt bleiben im Rechnungsdialog deutlich sichtbar; Empfänger und Einzelbeleg stehen weiterhin in den Versanddetails.

Die Fälligkeitsampel bleibt am Fälligkeitsdatum; der Zahlungsstatus bleibt separat Offen/Teilbezahlt/Bezahlt/Storniert. Insbesondere bleibt eine versendete unbezahlte Rechnung Offen und erhält zusätzlich Versendet. Unklare Versandantworten erlauben keinen erneuten Versand ohne die vorhandene Postfachprüfung.

## PDF prüfen und bewusst senden

Der Button „1. Swiss-QR-PDF prüfen“ steht direkt neben Rechnung senden und der Prüfcheckbox. Vor dem PDF-Download bleibt die Checkbox gesperrt. Danach müssen PDF und Empfänger kontrolliert und die Checkbox bestätigt werden. Ein deaktivierter Sendebutton nennt den konkreten noch fehlenden Schritt. Änderungen und erneutes Öffnen setzen die Prüfung weiterhin zurück; es gibt keine dauerhafte pauschale Versandfreigabe. Verspätete PDF-Antworten nach Wechsel oder erneutem Öffnen können keine andere Rechnung freigeben.

## RE-1005

Rein lesende Prüfung am 27.10.2026: vollständige Rechnungs-/Kundendaten, serverseitig versandbereit, keine Versandreservierung oder Quittung. PDF mit der tatsächlich konfigurierten IBAN ausschliesslich im Arbeitsspeicher erfolgreich erzeugt, ohne Ablage eines Kundendokuments. Gmail-Suche in Gesendet nach RE-1005 ohne Treffer. Der Benutzer bestätigte anschliessend die Ursache: Das PDF war noch nicht geöffnet, deshalb war die Kontrollcheckbox gesperrt. Keine Datenkorrektur, kein Rechnungsversand und keine Buchung durch diese Arbeit.

## Validierung

512 CRM-Tests erfolgreich. Desktop und Mobilgerät mit synthetischer 1-Rappen-Rechnung: zunächst PDF-/Checkbox-Sperre mit verständlichem Hinweis, PDF-Download, Checkbox, manueller Versand mit ausschliesslich simulierter Quittung. Danach Versendet und gleichzeitig Offen sichtbar. Inhaltsänderungen und erneutes Öffnen setzen die Prüfung zurück. Keine echte Nachricht; Make-Szenarien und Versandregeln unverändert.

## Live-Nachweis

Revision `lszh-crm-v2-00131-gus`, 100 % Verkehr. Alle 81 Laufzeitdateien bytegleich geprüft; nur public/index.html und die rein lesende cockpit-summary.js geändert. Konfiguration und Dienstkonto unverändert. Live-HTML bytegleich; Rechnungsprüfung und Gesamtauswertung anonym HTTP 401. Keine jüngsten Revisionsfehler; beide GitHub-Prüfungen erfolgreich. Rückkehrrevision `lszh-crm-v2-00129-buq`.

[Release-Nachweis](../releases/invoice-delivery-view-live-20261027.json) - [PR 38](https://github.com/lszh-automations/lszh-automations-site/pull/38).
