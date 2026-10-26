# AuftragsbestÃ¤tigung und Annahmebenachrichtigung

Stand: 26.10.2026. **Live aktiviert:** CRM `lszh-crm-v2-00085-tep` und Kundenportal `lszh-customer-acceptance-pilot-00009-rob`, jeweils 100 % regulärer Verkehr. Umsetzung auf Basis des bereits produktiven Make-Hinweises. Die vollstÃ¤ndige Kundenannahme und C3.7.2 waren bereits funktionsfÃ¤hig.

## Fachlicher Ablauf

1. Kunde nimmt sein geprÃ¼ftes Dokumentpaket online an. Der Annahmenachweis wird im privaten Archiv gesichert.
2. Nach erfolgreicher Archivierung entsteht atomar ein interner Benachrichtigungsauftrag. Der bestehende authentifizierte Mail-Zeitplan versendet ihn an `lars@lszh-automations.ch`. Die Nachricht bestÃ¤tigt den Annahmeeingang und fordert interne PrÃ¼fung und AuftragsbestÃ¤tigung an.
3. LSZH prÃ¼ft die Kundenannahme bewusst intern. Erst dann erscheint die Vorschau der AuftragsbestÃ¤tigung: EmpfÃ¤nger, Mailtext und PDF.
4. LSZH prÃ¼ft die Vorschau, setzt die PrÃ¼fbestÃ¤tigung und klickt **AuftragsbestÃ¤tigung senden**. Der Browser kann weder EmpfÃ¤nger noch Nachrichtentext oder Gmail-ID vorgeben.
5. Das CRM archiviert das BestÃ¤tigungs-PDF, liest es unabhÃ¤ngig zurÃ¼ck und versendet es einmalig Ã¼ber Make/Gmail. Die zurÃ¼ckgemeldete Gmail-ID wird automatisch gespeichert. Ein getrenntes, nur lesendes Gmail-Konto prÃ¼ft Gesendet-Status, Absender, alleinigen EmpfÃ¤nger, Paket-/Ereignisheader und sÃ¤mtliche PDF-Bytes.
6. Erst nach erfolgreicher PrÃ¼fung steht die Vertragsannahme auf `confirmed`. Die Offerte wird weiterhin bewusst Ã¼ber **Angenommen** Ã¼bernommen; dadurch entstehen Kunde und Projekt nach den vorhandenen CRM-Regeln.

Die neue klare Anzeige lautet **Kunde hat angenommen â€“ AuftragsbestÃ¤tigung ausstehend**. Kundenannahme, LSZH-VertragsbestÃ¤tigung und CRM-Auftragsanlage bleiben nachvollziehbare getrennte Schritte.

## Inhalt und Bestandsschutz

Das BestÃ¤tigungs-PDF bestÃ¤tigt ausschliesslich die bereits angenommene Offerte samt Paketdokumenten. Es nennt Offertennummer, Dokumentversionen und PaketprÃ¼fsumme. Preise, Leistungen und Bedingungen werden nicht aus nachtrÃ¤glich verÃ¤nderbaren Formularfeldern Ã¼bernommen. Der Hinweis zur eigenen Make-Organisation und Einladung von LSZH erscheint nur, wenn das angenommene Paket die bereits freigegebene Make-Hinweisversion enthÃ¤lt. Keine nachtrÃ¤glichen neuen Bedingungen fÃ¼r Altpakete.

Die PDF-Metadaten werden als separate Korrespondenz unter `confirmationDocument_<Pakethash-ID>` gespeichert. Die bestehende Archiv-/PDF-Schnittstelle verwendet dafÃ¼r den Dokumenttyp `offer` mit Version `confirmation-v1`; diese Korrespondenz ist ausdrÃ¼cklich kein zusÃ¤tzliches angenommenes Paketdokument.

## Schutz vor doppeltem Versand

Ein dauerhafter Versandclaim entsteht vor dem ersten Archiv-/Versandaufruf. Konkurrierende Klicks kÃ¶nnen nicht zweimal versenden. Die Gmail-ID wird vor der unabhÃ¤ngigen Verifikation gespeichert. Bei einem vorÃ¼bergehenden Gmail-Lesefehler bietet das CRM **BestÃ¤tigungsversand prÃ¼fen** an; dieser Schritt versendet nichts erneut. Bei unbekanntem Provider-Ergebnis ohne Nachrichten-ID bleibt manuelle PrÃ¼fung erforderlich. Claims werden weder gelÃ¶scht noch automatisch zurÃ¼ckgesetzt.

Interne Annahmemeldungen haben einen eigenen eindeutigen Auftrag je Antwort-ID. Ein unklarer Versand wechselt in `notification_manual_review` und wird nicht automatisch wiederholt. Eine erfolgreich archivierte Altannahme wird nicht nachtrÃ¤glich erneut archiviert oder benachrichtigt. Insbesondere keine rÃ¼ckwirkende Nachricht oder automatische BestÃ¤tigung fÃ¼r Offerte 1006.

## Integrationen und Endpunkte

- `GET /api/records/offerten/:id/contract/confirmation-preview`: authentifizierte, schreibfreie Vorschau mit PDF und InhaltsprÃ¼fsumme.
- `POST .../confirmation-send`: gleicher Origin, JSON, explizite DokumentprÃ¼fung und exakt passende PrÃ¼fsumme erforderlich.
- `POST .../confirmation-check`: prÃ¼ft den bereits gespeicherten Versandbeleg ohne erneuten Versand.
- Bestehender `POST /api/internal/mail/tick`: weiterhin ausschliesslich fÃ¼r den freigegebenen Google-OIDC-Zeitplan; verarbeitet zusÃ¤tzlich die interne Annahme-Warteschlange.
- Make **8175919**: vorhandene Zwei-/Drei-PDF-Paketpfade unverÃ¤ndert; zusÃ¤tzlicher strikt gefilterter Ein-PDF-Pfad fÃ¼r `order_confirmation`, Ereignis `confirmation_pkg_...`, keine CC/BCC. Gmail-Modul 8, BestÃ¤tigungsantwort 9; ungÃ¼ltige Anforderungen erhalten HTTP 400 Ã¼ber Modul 10.
- Make **8176906**: vorhandenes festes PDF-Archiv und Dateileserechte; Dateinamensfilter zusÃ¤tzlich fÃ¼r `Auftragsbestaetigung_<Nummer>.pdf` geÃ¶ffnet.
- Make **8135270**: bisherige Lead-Mailpfade unverÃ¤ndert; zusÃ¤tzliche interne Art `internal_acceptance`, fester EmpfÃ¤nger und Antwort-ID-Muster.
- Keine neuen Secrets, Gmail-Berechtigungen, Ã¶ffentlichen Endpunkte oder Dienste. Bestehende Zugangskonfigurationen bleiben erhalten.

Archivierung und Benachrichtigung erfolgen Ã¼ber die bestehenden ZeitplÃ¤ne. Es handelt sich deshalb nicht um eine garantierte Sofortbenachrichtigung; erst der Archivlauf, dann der nÃ¤chste Maillauf stellt die interne Nachricht zu. Bei gesperrten Claims oder Providerfehlern ist interne PrÃ¼fung nÃ¶tig.

## PrÃ¼fung und Grenzen

452 CRM-Tests, 32 Portaltests und 33 Tests mit echtem lokalem Firestore-Emulator bestanden. Abgedeckt sind konkurrierende Klicks, einmalige interne Meldung, verlorene Antworten, gespeicherter Gmail-Nachweis vor Verifikation, Wiederaufnahme ohne erneuten Versand, falsche EmpfÃ¤nger/Pakete und fehlende Archiv-/PrÃ¼ffreigabe. Die bestehenden Authentifizierungs-/Origin-Sperren wurden fÃ¼r die neuen Endpunkte geprÃ¼ft. Historische Produktionsbasis unverÃ¤ndert: 101 Originaldateien anhand Git-Objekten bestÃ¤tigt.

Desktop und Mobilansicht wurden mit abgefangenen Netzwerkanfragen und rein synthetischen Daten geprÃ¼ft. Das neue A4-PDF wurde gerendert und visuell kontrolliert. Kein echter Kundenversand, keine Testannahme, kein Codeversand und keine Ã„nderung bestehender Kundendaten durch die Abnahme. Der erste echte Versand des neuen BestÃ¤tigungspfads erfolgt erst durch einen bewussten Benutzerklick; ein realer Ende-zu-Ende-Mailversand wurde deshalb nicht vorweggenommen.

Live-Revisionen und QuellprÃ¼fsummen werden nach erfolgreicher Ãœbernahme im zugehÃ¶rigen Release-Manifest festgehalten.


## Korrektur des fehlenden Übernahmeschritts

Nach einem erfolgreichen echten Bestätigungsversand für Offerte 1006 war der Vertrag bereits `confirmed`, während die Offerte wie vorgesehen noch `Versendet` war. Der bisherige Annahmebutton wurde bei Online-Annahmen durch einen frühen Rücksprung ausgeblendet; die neue Bestätigungsansicht hatte nur einen Hinweis statt einer ausführbaren Auftragsübernahme.

Die CRM-Version `lszh-crm-v2-00085-tep` (100 % Verkehr) ergänzt deshalb nach nachgewiesenem Bestätigungsversand **Auftrag übernehmen und Projekt anlegen**. Ein bewusster Klick samt Bestätigung ruft die vorhandene geschützte PATCH-Statusänderung auf. Der bestehende Ablauf setzt die Offerte auf Angenommen, ordnet Kunde/Projekt zu und setzt den Lead auf Gewonnen. Bereits angenommene Offerten zeigen keinen weiteren Übernahmebutton. Unbestätigte Annahmen bleiben gesperrt. Kein erneuter Bestätigungsversand und keine automatische Auftragsanlage beim Anzeigen.

455 CRM-Tests bestanden, einschliesslich fehlendem Button, Abbruch, Doppelklick, bereits angenommener Offerte und Backend-Freigabesicherheit. Desktop-/Mobilbrowser mit gesperrtem Netz geprüft. Alle 79 tatsächlichen CRM-Laufzeitdateien entsprechen den vorbereiteten Quellen; unveränderte Konfiguration und Dienstkonto, anonyme API HTTP 401, neue Oberfläche live HTTP 200. Portal und Make wurden bei dieser Korrektur nicht verändert. Offerte 1006 wurde nur lesend geprüft; ihre Übernahme bleibt dem Benutzerklick vorbehalten.

[Korrektur-Manifest](../releases/acceptance-button-fix-live-20261026.json), Quellcommit `6477e6348dec8732d50313677368ccc3f9dc7577`. Rückfallversion CRM `00083-xap`.


## Maildesign an bestehende Kundenmails angepasst

Am 26.10.2026 wurde das Design der Auftragsbestätigungs-Mail an die vorhandenen Offerten-/Kundenmails angeglichen. Live: CRM **lszh-crm-v2-00089-mar**, 100 % Verkehr. Dunkler Kopf mit L-Logo, dreifarbige Akzentleiste, helle Infobox für Offertennummer/Empfänger/PDF-Anhang, abgegrenzter versionsgebundener Make-Hinweis und derselbe Firmenfuss. Tabellenlayout und Inline-CSS ohne externe Bilder oder Skripte. Technische Paket-/Hashangaben bleiben im unveränderten PDF und werden nicht mehr im sichtbaren Mailtext wiederholt. Vertragliche Aussagen, Empfänger, Betreff, Anhang und Versand-/Nachweissperren bleiben erhalten.

465 CRM-Tests bestanden, einschliesslich tatsächlichem HTML-Versandpfad, exakt gleichem PDF, sicherem Escaping und fehlendem nachträglichem Make-Hinweis bei alten Paketen. Vier lokale HTML-Browserprüfungen (Desktop/Mobil, mit/ohne Make-Hinweis) ohne Netzwerkzugriffe und horizontalen Überlauf; visuell kontrolliert. Dies ersetzt keinen separaten Test in jeder Gmail-/Outlook-Clientversion. Keine echte Mail zur Abnahme verschickt und keine Kundendaten geändert. Keine erneute Bestätigung für Offerte 1006.

[Live-Nachweis](../releases/confirmation-mail-design-live-20261026.json), [PR 19](https://github.com/lszh-automations/lszh-automations-site/pull/19), Quellcommit `6c5e80c4d1f062607d181425c9a485ecbfdcebb0`. Alle 79 tatsächlich gebauten Laufzeitdateien geprüft; gegenüber dem Kunden-/Rechnungsrelease ist nur `order-confirmation.js` verändert. Konfiguration und Dienstkonto unverändert. Öffentliche Oberfläche HTTP 200, anonyme Bestätigungsvorschau HTTP 401; bei Abschluss keine Error-Level-Logs. Portal und Make unverändert. Rückfallversion: CRM `00087-los`; vorhandene Versandclaims nie löschen oder erneut auslösen.
