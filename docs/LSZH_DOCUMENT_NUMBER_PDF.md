# PDF direkt über die Dokumentnummer öffnen

Stand: 27.10.2026

Die Rechnungsübersicht zeigt 1005 statt RE-1005. Nur die Anzeige wird gekürzt; gespeicherte Rechnungsnummer, PDF, E-Mail, Zahlungsreferenz und Zuordnungen bleiben unverändert. Offertennummern behalten ihre bisherige Darstellung.

Ein Klick auf eine verfügbare Rechnungs- oder Offertennummer öffnet das PDF in einem separaten Tab mit der vorhandenen CRM-Anmeldung. Keine öffentlichen Dokumentlinks oder Tokens in der URL. Ein fehlendes bzw. nicht erreichbares PDF meldet einen Fehler, statt ein leeres Dokument zu zeigen.

Archivierte Vertrags-Offerten werden bytegleich aus dem bestehenden Archiv gelesen und gegen Dokumentmetadaten/Hash sowie Offertenzuordnung geprüft. Bei Archivfehlern wird kein Ersatzdokument erzeugt. Noch nicht archivierte Offerten mit Positionen können als aktuelle PDF-Vorschau gelesen werden; dabei wird kein Vertragspaket vorbereitet, archiviert oder versendet.

Bei offenen, teilbezahlten und bezahlten Rechnungen wird das PDF anhand des gespeicherten Rechnungsinhalts gelesen. Die reine Ansicht erlaubt auch die Originalrechnung einer bezahlten/teilbezahlten Rechnung: der PDF-Erzeuger erhält nur im Arbeitsspeicher den für den ursprünglichen QR-Zahlteil benötigten Status Offen. Der gespeicherte Zahlungsstatus, Betrag und Buchungsverlauf bleiben unverändert. Diese Ansicht ist keine neue Rechnung und kein Nachweis einer Zahlung. Entwürfe und stornierte Rechnungen bekommen keinen neuen Nummernlink. Bisherige PDF-Prüfung im Versanddialog bleibt unverändert.

Validierung: 514 CRM-Tests, einschliesslich exakter Archivbytes, Manipulations-/Zuordnungsabwehr, authentifizierter PDF-GETs, anonym HTTP 401, fehlender Dokumente und unverändertem Bezahlt-Status beim Lesen. Desktop und Mobilgerät: reine Nummern, Klick auf konkrete Dokument-ID, echtes PDF-MIME/Format, Entwurfsnummer ohne Link und ausschliesslich lesende Anfragen mit synthetischen Daten. Keine Kundendatenänderung oder Nachricht.
