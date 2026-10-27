> Aktuelle Bedienung seit 27.10.2026: [Vereinfachte Offertenansicht](LSZH_OFFER_VIEW.md). Der folgende Abschnitt dokumentiert den historischen Funktionsnachweis und Integrationsstand seiner Einführung.

# Auftragsbestätigung und Annahmebenachrichtigung

Stand: 26.10.2026. **Live aktiviert:** CRM `lszh-crm-v2-00085-tep` und Kundenportal `lszh-customer-acceptance-pilot-00009-rob`, jeweils 100 % regul�rer Verkehr. Umsetzung auf Basis des bereits produktiven Make-Hinweises. Die vollständige Kundenannahme und C3.7.2 waren bereits funktionsfähig.

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


## Korrektur des fehlenden �bernahmeschritts

Nach einem erfolgreichen echten Best�tigungsversand f�r Offerte 1006 war der Vertrag bereits `confirmed`, w�hrend die Offerte wie vorgesehen noch `Versendet` war. Der bisherige Annahmebutton wurde bei Online-Annahmen durch einen fr�hen R�cksprung ausgeblendet; die neue Best�tigungsansicht hatte nur einen Hinweis statt einer ausf�hrbaren Auftrags�bernahme.

Die CRM-Version `lszh-crm-v2-00085-tep` (100 % Verkehr) erg�nzt deshalb nach nachgewiesenem Best�tigungsversand **Auftrag �bernehmen und Projekt anlegen**. Ein bewusster Klick samt Best�tigung ruft die vorhandene gesch�tzte PATCH-Status�nderung auf. Der bestehende Ablauf setzt die Offerte auf Angenommen, ordnet Kunde/Projekt zu und setzt den Lead auf Gewonnen. Bereits angenommene Offerten zeigen keinen weiteren �bernahmebutton. Unbest�tigte Annahmen bleiben gesperrt. Kein erneuter Best�tigungsversand und keine automatische Auftragsanlage beim Anzeigen.

455 CRM-Tests bestanden, einschliesslich fehlendem Button, Abbruch, Doppelklick, bereits angenommener Offerte und Backend-Freigabesicherheit. Desktop-/Mobilbrowser mit gesperrtem Netz gepr�ft. Alle 79 tats�chlichen CRM-Laufzeitdateien entsprechen den vorbereiteten Quellen; unver�nderte Konfiguration und Dienstkonto, anonyme API HTTP 401, neue Oberfl�che live HTTP 200. Portal und Make wurden bei dieser Korrektur nicht ver�ndert. Offerte 1006 wurde nur lesend gepr�ft; ihre �bernahme bleibt dem Benutzerklick vorbehalten.

[Korrektur-Manifest](../releases/acceptance-button-fix-live-20261026.json), Quellcommit `6477e6348dec8732d50313677368ccc3f9dc7577`. R�ckfallversion CRM `00083-xap`.


## Maildesign an bestehende Kundenmails angepasst

Am 26.10.2026 wurde das Design der Auftragsbest�tigungs-Mail an die vorhandenen Offerten-/Kundenmails angeglichen. Live: CRM **lszh-crm-v2-00089-mar**, 100 % Verkehr. Dunkler Kopf mit L-Logo, dreifarbige Akzentleiste, helle Infobox f�r Offertennummer/Empf�nger/PDF-Anhang, abgegrenzter versionsgebundener Make-Hinweis und derselbe Firmenfuss. Tabellenlayout und Inline-CSS ohne externe Bilder oder Skripte. Technische Paket-/Hashangaben bleiben im unver�nderten PDF und werden nicht mehr im sichtbaren Mailtext wiederholt. Vertragliche Aussagen, Empf�nger, Betreff, Anhang und Versand-/Nachweissperren bleiben erhalten.

465 CRM-Tests bestanden, einschliesslich tats�chlichem HTML-Versandpfad, exakt gleichem PDF, sicherem Escaping und fehlendem nachtr�glichem Make-Hinweis bei alten Paketen. Vier lokale HTML-Browserpr�fungen (Desktop/Mobil, mit/ohne Make-Hinweis) ohne Netzwerkzugriffe und horizontalen �berlauf; visuell kontrolliert. Dies ersetzt keinen separaten Test in jeder Gmail-/Outlook-Clientversion. Keine echte Mail zur Abnahme verschickt und keine Kundendaten ge�ndert. Keine erneute Best�tigung f�r Offerte 1006.

[Live-Nachweis](../releases/confirmation-mail-design-live-20261026.json), [PR 19](https://github.com/lszh-automations/lszh-automations-site/pull/19), Quellcommit `6c5e80c4d1f062607d181425c9a485ecbfdcebb0`. Alle 79 tats�chlich gebauten Laufzeitdateien gepr�ft; gegen�ber dem Kunden-/Rechnungsrelease ist nur `order-confirmation.js` ver�ndert. Konfiguration und Dienstkonto unver�ndert. �ffentliche Oberfl�che HTTP 200, anonyme Best�tigungsvorschau HTTP 401; bei Abschluss keine Error-Level-Logs. Portal und Make unver�ndert. R�ckfallversion: CRM `00087-los`; vorhandene Versandclaims nie l�schen oder erneut ausl�sen.


## PDF-Design an die Auftragsbest�tigungs-Mail angepasst

Auf ausdr�cklichen Benutzerwunsch wurde danach auch das PDF angeglichen. Live: CRM **lszh-crm-v2-00091-xor**, 100 % Verkehr. Dunkler Kopf mit L-Logo und dreifarbigem Akzent, Offerten-/Empf�ngerkarte, klare Abs�tze und Dokumentliste, eigener versionsgebundener Make-Abschnitt, Firmenfuss und Seitenzahlen. Vertrags- und Referenztext bleibt vollst�ndig erhalten; keine zus�tzlichen Preise oder Vertragsbedingungen. Neue Best�tigungsdokumente werden als `confirmation-v2` archiviert. Bereits versendete und archivierte v1-Dokumente werden nicht neu erzeugt, ersetzt oder erneut versendet. Die unabh�ngige Pr�fung vorhandener v1-Belege bleibt m�glich. Eine vor dem Release ge�ffnete Vorschau muss wegen der neuen PDF-Pr�fsumme vor Versand neu geladen werden.

467 CRM-Tests erfolgreich, einschliesslich deterministischer A4-PDFs, mehrseitigem Text und vorhandener v1-Versandnachweise ohne erneute Archivierung/Versand. Drei rein synthetische Varianten (mit Make-Hinweis, Altpaket ohne Hinweis, mehrseitiger Langtext) gerendert und alle Seiten visuell gepr�ft. PDF-Textextraktion best�tigt den vollst�ndigen Vertrags-/Referenztext und Seitenzahlen. Keine reale Best�tigung zur Abnahme gesendet, keine Kundendaten ge�ndert und keine bestehende Archivdatei ersetzt.

[Live-Nachweis](../releases/confirmation-pdf-design-live-20261026.json), [PR 20](https://github.com/lszh-automations/lszh-automations-site/pull/20), Quellcommit `08f9c390b22cd01d551376ef54b6ba9d02f61089`. Alle 79 tats�chlichen Laufzeitdateien best�tigt; nur `order-confirmation.js` gegen�ber dem Maildesign-Release ver�ndert. Konfiguration und Dienstkonto unver�ndert. Oberfl�che HTTP 200, anonyme Best�tigungsvorschau HTTP 401, keine Error-Level-Logs bei Abschluss. GitHub-Pr�fungen des Quellcommits erfolgreich; Portal und Make unver�ndert. R�ckfallversion: CRM `00089-mar`. Vorhandene Dokument-/Versandclaims dabei nie l�schen oder regenerieren.


## Technische Angaben ausgeblendet und Make-Anleitung integriert

Live seit 26.10.2026: `lszh-crm-v2-00093-yik`, 100 % Verkehr. Neue Bestätigungs-Mails und PDFs zeigen keine Paketreferenz oder SHA-256 mehr. Interne Prüfsummen, Archivzuordnung und unabhängiger Gmail-Versandnachweis bleiben für die zuverlässige Zuordnung erhalten.

Für Pakete mit bereits vereinbarten Make-Voraussetzungen enthält die Mail die Einrichtungsschritte; dieselbe Anleitung steht auf einer zweiten Seite des einzigen PDF-Anhangs. Legacy-Pakete ohne diese Voraussetzung erhalten keine neuen Make-Pflichten. Die Anleitung ergänzt keine Vertragsbedingungen. Neue Dokumente verwenden `confirmation-v3`; bestehende v1/v2-Dokumente und Versandnachweise bleiben gültig und werden nicht überschrieben.

Der Kunde erstellt bzw. verwendet sein eigenes Make-Konto und seine eigene Organisation und lädt LSZH Automations unter **lars@lszh-automations.ch** ein. Die Adresse stammt aus der zentralen Projektprüfung `LSZH_RC1_KLAUSELPRUEFUNG_UND_SYNTHETISCHER_ANNAHMETEST_20261014.md`. Die Anleitung beschreibt Organisationsmitglied und – soweit der Tarif dies unterstützt – Teammitglied im Projektteam. Weitere Rechte werden nur bei Bedarf vereinbart, der Kunde bleibt Eigentümer. Keine Passwortweitergabe, kein automatischer Tarifwechsel. Vor einer Organisationsneuanlage ist die später unveränderliche Datenregion abzustimmen.

Menüs und Rollen am 26.10.2026 anhand der offiziellen [Organisationshilfe](https://help.make.com/organizations) und [Teamhilfe](https://help.make.com/teams) geprüft; Anzeige und Rechte hängen vom Make-Tarif ab.

Nachweis: 469 CRM-Tests erfolgreich, zusätzlich GitHub-Stagingprüfung und Baselineprüfung erfolgreich. Zwei synthetische PDF-Varianten vollständig extrahiert, beide Seiten der Make-Variante visuell geprüft; vier Desktop-/Mobilvarianten ohne Überlauf. Tatsächlich gebauten Quellstand mit allen 79 Laufzeitdateien verglichen; nur `order-confirmation.js` gegenüber dem vorigen Release geändert. Kandidat und Live-Oberfläche HTTP 200, anonyme Bestätigungsvorschau HTTP 401; keine Fehler der neuen Revision im kontrollierten Zeitfenster. Konfiguration und Dienstkonto unverändert. Keine Kunden-/Rechnungsdaten geändert, keine Mail versendet, Portal und Make-Szenarien unverändert.

Release: [Live-Manifest](../releases/confirmation-guide-live-20261026.json), [PR 21](https://github.com/lszh-automations/lszh-automations-site/pull/21). Rückfallrevision: `lszh-crm-v2-00091-xor`.


## Make-Partnerlink und transparenter Startvorteil

Die Make-Anleitung verwendet für neue Konten den Partnerlink https://www.make.com/en/register?pc=lszhautomations. Mail und PDF nennen 10’000 Credits gratis im ersten Monat gemäss Make-Aktionsbedingungen und legen offen, dass LSZH Automations bei einem späteren kostenpflichtigen Abonnement eine Provision von Make erhält. Bestehende Firmenkonten werden weiterverwendet. Keine Kontoanlage, Einladung oder Tarifänderung durch diesen Release.

Die [Make-Affiliate-Hilfe](https://help.make.com/affiliate-program) bestätigt Provisionen aus kostenpflichtigen Abonnements. Der konkrete Startvorteil wurde am 26.10.2026 vom Betreiber bestätigt; seine Aktivierung für diesen individuellen Partnerlink war öffentlich nicht unabhängig prüfbar. Der Hinweis ist keine Änderung der angenommenen Vertragsbedingungen. Legacy-Pakete ohne vereinbarte Make-Voraussetzung erhalten weiterhin keine neue Anleitung oder Pflicht.

Der Link ist sowohl in HTML als auch im PDF als exakte URL hinterlegt und anklickbar. 469 CRM-Tests erfolgreich; synthetisches Make-PDF bleibt zweitseitig, Seiten vollständig gerendert und visuell geprüft, URI-Ziel aus dem PDF kontrolliert. Vier Desktop-/Mobilvarianten ohne Überlauf und ohne externe Anfragen geprüft. Interne Archiv-/Versandnachweise und bestehende Dokumente bleiben erhalten. Keine Kundenmail und keine Kundendatenänderung.

[PR 22](https://github.com/lszh-automations/lszh-automations-site/pull/22). Der technische Live-Nachweis wird im zugehörigen Release-Manifest festgehalten.

Live: `lszh-crm-v2-00095-hix`, 100 % Verkehr, [Release-Manifest](../releases/confirmation-partner-live-20261026.json). Alle 79 Laufzeitdateien bestätigt; nur `order-confirmation.js` gegenüber dem vorigen Release geändert. GitHub-Staging- und Baselineprüfung erfolgreich. Konfiguration und Dienstkonto unverändert; Live-Oberfläche HTTP 200, anonyme Bestätigungsvorschau HTTP 401, keine Fehler der neuen Revision im kontrollierten Zeitfenster. Rückfallrevision: `lszh-crm-v2-00093-yik`.


## Kundenannahme sofort als Angenommen anzeigen

Auf Wunsch des Betreibers zeigt die Offertenliste nach der gespeicherten Online-Kundenannahme sofort **Angenommen** an, auch solange der Archivnachweis noch vervollständigt wird und vor einer separaten Auftragsbestätigung. Fenstertitel und gesperrtes Statusfeld verwenden dieselbe Anzeige. Ein Zusatz unterscheidet die Kundenannahme von der noch ausstehenden internen Abwicklung.

Der Filter **Angenommen** findet sowohl intern übernommene als auch vom Kunden online angenommene Offerten. **Versendet** zeigt diese Kundenannahmen nicht mehr an. Für den Annahmefilter werden die vorhandenen Offerten lesend durchlaufen; es ist kein neuer zusammengesetzter Index nötig, der Leseaufwand wächst jedoch mit dem Register.

Der gespeicherte interne Status und die bisherigen Prüf-, Versand- und Auftragsübernahmeschritte bleiben unverändert. Die Anzeige erzeugt keine Auftragsbestätigung, kein Projekt, keine Rechnung und keinen Zahlungseingang. Finanzkennzahlen behalten ihre bisherige interne Grundlage. Bereits gespeicherte Kundenannahmen wie Offerte 1007 profitieren ohne Datenmigration von der Anzeige.

Die Auftragsbestätigung zeigt im CRM nur noch Empfänger, Betreff, den Button **Auftragsbestätigung als PDF prüfen**, die Prüfbestätigung und den Versandbutton. Der komplette Bestätigungstext wird nicht mehr inline angezeigt. Mailinhalt und PDF werden dadurch nicht verändert.

Prüfung: 478 CRM-Tests erfolgreich, einschliesslich Statusfilter direkt nach Kundenannahme mit ausstehendem Archiv, ohne Datenänderung oder vorgezogene Auftragsübernahme. Desktop und Mobil: Liste, Titel, gesperrtes Statusfeld und kompakte Bestätigung ohne langen Text und ohne Überlauf geprüft. Keine echten Netzwerkzugriffe oder Schreibaktionen im Browsertest. [PR 25](https://github.com/lszh-automations/lszh-automations-site/pull/25).

Live seit 26.10.2026: `lszh-crm-v2-00101-caf`, 100 % Verkehr. [Release-Manifest](../releases/customer-acceptance-display-live-20261026.json). Alle 79 tatsächlichen Laufzeitdateien bestätigt; nur `cloud-records.js`, `offer-tracking.js` und `public/index.html` gegenüber dem vorigen Release geändert. Beide GitHub-Prüfungen inklusive Firestore-Emulatortests erfolgreich; Konfiguration/Dienstkonto unverändert, Oberfläche HTTP 200 und Offerten anonym HTTP 401. Keine Fehler der neuen Revision im kontrollierten Zeitfenster. Keine Kundendatenänderung, keine Mail, kein Projekt-/Rechnungsnachtrag. Portal und Make unverändert. Rückfall: `lszh-crm-v2-00099-pok`.
