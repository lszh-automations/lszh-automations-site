# Zahlungserinnerungen mit Vorschau und manuellem Versand

Stand: 27.10.2026

Unter Rechnung > Zahlungserinnerungen und Verlauf > Erinnerung prüfen und senden stehen Empfänger, Betreff, aktueller Restbetrag und Mailvorschau. Erst nach Prüfcheckbox und bewusster Versandbestätigung wird gesendet. Der Anhang ist die ursprüngliche Rechnung; der Text nennt ausdrücklich nur den offenen Restbetrag und berücksichtigt Teilzahlungen. Es entsteht keine neue Rechnung oder Zahlungsbuchung.

Die bestehenden drei Stufen bleiben: Zahlungserinnerung, 1. Mahnung, 2. Mahnung. Nur überfällige, bestätigt versendete Rechnungen mit Restbetrag und gültiger Kundenadresse. Zwischen tatsächlich protokollierten Stufen mindestens sieben volle Tage; keine vierte Stufe. Der bisherige externe Versandnachweis bleibt unter Externen Versand dokumentieren erreichbar.

Die Vorschau ist durch einen serverseitigen Fingerabdruck an Empfänger, Rechnungsdaten, Restbetrag, Inhalt und Mahnstand gebunden. Jede relevante Änderung verlangt eine neue Prüfung. Die Transaktion reserviert einen Versuch genau einmal. Während des kurzen aktiven Versandfensters sind gleichzeitige neue Buchungen/Korrekturen bzw. Stornierungen gesperrt; identische Zahlungswiederholungen bleiben idempotent. Nach unklarem Versand oder spätestens fünf Minuten werden Zahlungen nicht dauerhaft blockiert.

Nur passende eventId plus gültige Gmail-messageId bestätigen den Versand. Mahnstufe, Zeitpunkt, Auslöser, damaliger Restbetrag, Empfänger und Nachrichten-ID werden automatisch gespeichert. Identische Wiederholung derselben bestätigten Anfrage sendet nicht erneut. PDF-Fehler vor Zustellung werden als nicht versendet gespeichert und behalten den Auditverlauf. Fehlende/unklare Antwort blockiert jeden weiteren Versand; Postfach prüfen und bewusst als bestätigt oder sicher nicht versendet auflösen. Auch nach zwischenzeitlicher Zahlung bleibt der ursprüngliche Versandstand im Audit erhalten.

Neue authentifizierte Endpunkte: GET /api/records/rechnungen/:id/reminder-mail, POST .../reminder-mail/send, POST .../reminder-mail/resolve. POST erfordert die eigene Herkunft. Empfänger, HTML, Betrag und Mahnstufe können nicht im Sendebody überschrieben werden. Anfragen sind ohne Anmeldung gesperrt. Es gibt keinen Zeitplan und keinen automatischen Versand.

Vorhandenes Make-Gateway 8144117 unverändert genutzt. Das bestehende invoice_send/production-Schema mit invoice_send_reminder_<UUID>, Betreff enthält Ihre Rechnung Nr., Original-PDF und unveränderter Gmail-Quittung passt zum vorhandenen Filter. Aufbau, Filter und Gmail-Verbindung rein lesend geprüft. Kein Szenario erstellt, bearbeitet, aktiviert, ausgeführt oder auf Test umgestellt. Bestehende produktive Mailflags/IBAN/Webhook werden weiterverwendet; keine neuen Geheimnisse.

Validierung: 502 CRM-Tests, 42 echte lokale Firestore-Integrationstests, durchgehender Geschäftsvorgang mit Desktop und Mobilgerät und simulierten Zustellungen. Abgedeckt: verbleibender Betrag, Escaping, alle Mahnstufen/Grenzen, veraltete Vorschau nach Zahlung/E-Mail-Änderung, parallele Reservierungen, idempotente Wiederholung, unsichere Antwort ohne Retry, fehlgeschlagene PDF-Erzeugung ohne Versand, Zahlung nach unklarem Versand und Postfachauflösung nach vollständiger Zahlung. Echte Browserprüfung: Vorschau, Checkbox/Versandbestätigung, Quittung, automatischer Verlauf, sieben Tage Sperre und anschliessender Rechnungsabschluss. Keine echte Mail oder Kundendatenänderung durch Test oder Übernahme.

## Live-Nachweis

Revision `lszh-crm-v2-00127-nam`, 100 % Verkehr. Alle 81 bereitgestellten Laufzeitdateien bytegleich geprüft; vier gezielte Änderungen gegenüber der Kundenansicht. Konfiguration und Dienstkonto unverändert. Live-HTML bytegleich, neue API ohne Anmeldung HTTP 401, keine jüngsten Fehler der neuen Revision. GitHub Production baseline verification erfolgreich; zusätzlicher CRM-Staging-Check wartet auf einen GitHub-Runner. Die CRM-Tests sind lokal vollständig bestanden. Rückkehrrevision `lszh-crm-v2-00125-tuh`.

[Release-Nachweis](../releases/invoice-reminder-mail-live-20261027.json) - [PR 36](https://github.com/lszh-automations/lszh-automations-site/pull/36).
