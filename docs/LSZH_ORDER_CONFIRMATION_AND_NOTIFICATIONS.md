# Auftragsbestätigung und Annahmebenachrichtigung

Stand: 26.10.2026. **Live aktiviert:** CRM `lszh-crm-v2-00083-xap` und Kundenportal `lszh-customer-acceptance-pilot-00009-rob`, jeweils 100 % regul�rer Verkehr. Umsetzung auf Basis des bereits produktiven Make-Hinweises. Die vollständige Kundenannahme und C3.7.2 waren bereits funktionsfähig.

## Fachlicher Ablauf

1. Kunde nimmt sein geprüftes Dokumentpaket online an. Der Annahmenachweis wird im privaten Archiv gesichert.
2. Nach erfolgreicher Archivierung entsteht atomar ein interner Benachrichtigungsauftrag. Der bestehende authentifizierte Mail-Zeitplan versendet ihn an `lars@lszh-automations.ch`. Die Nachricht bestätigt den Annahmeeingang und fordert interne Prüfung und Auftragsbestätigung an.
3. LSZH prüft die Kundenannahme bewusst intern. Erst dann erscheint die Vorschau der Auftragsbestätigung: Empfänger, Mailtext und PDF.
4. LSZH prüft die Vorschau, setzt die Prüfbestätigung und klickt **Auftragsbestätigung senden**. Der Browser kann weder Empfänger noch Nachrichtentext oder Gmail-ID vorgeben.
5. Das CRM archiviert das Bestätigungs-PDF, liest es unabhängig zurück und versendet es einmalig über Make/Gmail. Die zurückgemeldete Gmail-ID wird automatisch gespeichert. Ein getrenntes, nur lesendes Gmail-Konto prüft Gesendet-Status, Absender, alleinigen Empfänger, Paket-/Ereignisheader und sämtliche PDF-Bytes.
6. Erst nach erfolgreicher Prüfung steht die Vertragsannahme auf `confirmed`. Die Offerte wird weiterhin bewusst über **Angenommen** übernommen; dadurch entstehen Kunde und Projekt nach den vorhandenen CRM-Regeln.

Die neue klare Anzeige lautet **Kunde hat angenommen – Auftragsbestätigung ausstehend**. Kundenannahme, LSZH-Vertragsbestätigung und CRM-Auftragsanlage bleiben nachvollziehbare getrennte Schritte.

## Inhalt und Bestandsschutz

Das Bestätigungs-PDF bestätigt ausschliesslich die bereits angenommene Offerte samt Paketdokumenten. Es nennt Offertennummer, Dokumentversionen und Paketprüfsumme. Preise, Leistungen und Bedingungen werden nicht aus nachträglich veränderbaren Formularfeldern übernommen. Der Hinweis zur eigenen Make-Organisation und Einladung von LSZH erscheint nur, wenn das angenommene Paket die bereits freigegebene Make-Hinweisversion enthält. Keine nachträglichen neuen Bedingungen für Altpakete.

Die PDF-Metadaten werden als separate Korrespondenz unter `confirmationDocument_<Pakethash-ID>` gespeichert. Die bestehende Archiv-/PDF-Schnittstelle verwendet dafür den Dokumenttyp `offer` mit Version `confirmation-v1`; diese Korrespondenz ist ausdrücklich kein zusätzliches angenommenes Paketdokument.

## Schutz vor doppeltem Versand

Ein dauerhafter Versandclaim entsteht vor dem ersten Archiv-/Versandaufruf. Konkurrierende Klicks können nicht zweimal versenden. Die Gmail-ID wird vor der unabhängigen Verifikation gespeichert. Bei einem vorübergehenden Gmail-Lesefehler bietet das CRM **Bestätigungsversand prüfen** an; dieser Schritt versendet nichts erneut. Bei unbekanntem Provider-Ergebnis ohne Nachrichten-ID bleibt manuelle Prüfung erforderlich. Claims werden weder gelöscht noch automatisch zurückgesetzt.

Interne Annahmemeldungen haben einen eigenen eindeutigen Auftrag je Antwort-ID. Ein unklarer Versand wechselt in `notification_manual_review` und wird nicht automatisch wiederholt. Eine erfolgreich archivierte Altannahme wird nicht nachträglich erneut archiviert oder benachrichtigt. Insbesondere keine rückwirkende Nachricht oder automatische Bestätigung für Offerte 1006.

## Integrationen und Endpunkte

- `GET /api/records/offerten/:id/contract/confirmation-preview`: authentifizierte, schreibfreie Vorschau mit PDF und Inhaltsprüfsumme.
- `POST .../confirmation-send`: gleicher Origin, JSON, explizite Dokumentprüfung und exakt passende Prüfsumme erforderlich.
- `POST .../confirmation-check`: prüft den bereits gespeicherten Versandbeleg ohne erneuten Versand.
- Bestehender `POST /api/internal/mail/tick`: weiterhin ausschliesslich für den freigegebenen Google-OIDC-Zeitplan; verarbeitet zusätzlich die interne Annahme-Warteschlange.
- Make **8175919**: vorhandene Zwei-/Drei-PDF-Paketpfade unverändert; zusätzlicher strikt gefilterter Ein-PDF-Pfad für `order_confirmation`, Ereignis `confirmation_pkg_...`, keine CC/BCC. Gmail-Modul 8, Bestätigungsantwort 9; ungültige Anforderungen erhalten HTTP 400 über Modul 10.
- Make **8176906**: vorhandenes festes PDF-Archiv und Dateileserechte; Dateinamensfilter zusätzlich für `Auftragsbestaetigung_<Nummer>.pdf` geöffnet.
- Make **8135270**: bisherige Lead-Mailpfade unverändert; zusätzliche interne Art `internal_acceptance`, fester Empfänger und Antwort-ID-Muster.
- Keine neuen Secrets, Gmail-Berechtigungen, öffentlichen Endpunkte oder Dienste. Bestehende Zugangskonfigurationen bleiben erhalten.

Archivierung und Benachrichtigung erfolgen über die bestehenden Zeitpläne. Es handelt sich deshalb nicht um eine garantierte Sofortbenachrichtigung; erst der Archivlauf, dann der nächste Maillauf stellt die interne Nachricht zu. Bei gesperrten Claims oder Providerfehlern ist interne Prüfung nötig.

## Prüfung und Grenzen

452 CRM-Tests, 32 Portaltests und 33 Tests mit echtem lokalem Firestore-Emulator bestanden. Abgedeckt sind konkurrierende Klicks, einmalige interne Meldung, verlorene Antworten, gespeicherter Gmail-Nachweis vor Verifikation, Wiederaufnahme ohne erneuten Versand, falsche Empfänger/Pakete und fehlende Archiv-/Prüffreigabe. Die bestehenden Authentifizierungs-/Origin-Sperren wurden für die neuen Endpunkte geprüft. Historische Produktionsbasis unverändert: 101 Originaldateien anhand Git-Objekten bestätigt.

Desktop und Mobilansicht wurden mit abgefangenen Netzwerkanfragen und rein synthetischen Daten geprüft. Das neue A4-PDF wurde gerendert und visuell kontrolliert. Kein echter Kundenversand, keine Testannahme, kein Codeversand und keine Änderung bestehender Kundendaten durch die Abnahme. Der erste echte Versand des neuen Bestätigungspfads erfolgt erst durch einen bewussten Benutzerklick; ein realer Ende-zu-Ende-Mailversand wurde deshalb nicht vorweggenommen.

Live-Revisionen und Quellprüfsummen werden nach erfolgreicher Übernahme im zugehörigen Release-Manifest festgehalten.
