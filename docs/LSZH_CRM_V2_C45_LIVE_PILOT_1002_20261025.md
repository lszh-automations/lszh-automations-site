# C4.5 – Live-Pilot 1002: Bereitstellung und Prüfstand, 25.10.2026

## Freigaben und Grenzen

Der Benutzer wählte nach Ausschluss der bereits angenommenen Offerte 1004 ausdrücklich Offerte 1002. Bestätigt: technischer Pilot mit bestehender Position abc / CHF 0.01, keine Verarbeitung fremder Personendaten, Offerte plus Projektbedingungen ohne AVV. Der Empfänger aus dem verknüpften Lead ist lars.schulthess@outlook.com.

Zusätzlich ausdrücklich bestätigt: öffentliche Anmeldung des neuen Pilotportals mit befristetem Einladungslink und E-Mail-Code; 48 Stunden Pilotfreigabe mit Projektbedingungen v1.0 vom 19.10.2026, schriftlichem LSZH-Auftragsbestätigungsvorbehalt und dauerhafter privater Nachweisaufbewahrung ohne automatische Löschung; Umschaltung des regulären CRM auf die neue Version. Keine unabhängige rechtliche Prüfung behauptet. Die drei konkreten Bestätigungen wurden nach separaten automatischen Freigabeablehnungen eingeholt; kein Umgehen der Ablehnungen.

## Dokumentpaket

Offerte-ID: lead-web_2a37343857f343a49a17e3d677c2f3b3, Nummer 1002, Status bei Vorbereitung Bereit, gültig bis 30.10.2026.

Offerten-PDF aus unveränderten gespeicherten Daten mit bestehendem makePdf erzeugt, vollständig visuell kontrolliert, als private Datei 16pL3HgbJ66F4tpTW3IsIzokaci-Rypoh im Original-Unterordner des Produktionsarchivs abgelegt. SHA-256 ef5fa6128d23481122902cea075ce4e30f202f849a9188abf96ef045e9e02d38, 3735 Bytes; unabhängiger Drive-Readback stimmt überein.

Zweites Dokument: unveränderte geschäftlich freigegebene Projektbedingungen aus contract-document-catalog.json, 95511 Bytes. Keine AVV-Rahmenvorlage versendet.

Paket-ID: pkg_lead-web_2a37343857f343a49a17e3d677c2f3b3_r1.
Paket-SHA-256: 7e6f23f3e8498892373f47ad94554184c429f33307fed3f1a7893bc366245c03.
Snapshot-SHA-256: 48f03142e22d5b8865f0c9a33c28bfd4ee56248c3434662b3fe3639761fb475c.

Backend-Entwurf draftPackage_3525aa0653a4f0757afd1356d2aa5693e2cefdce5de1de854d0465a2d9f10456 erstellt und zurückgelesen. Atomare Verify-Preconditions auf unveränderte Offerte und verknüpften Lead; keine Statusänderung. Die bestätigte Paketfreigabe wurde separat mit existiert-nicht-Precondition gespeichert, Ablauf 27.10.2026 21:12:34 UTC (22:12:34 Europe/Zurich).

## Implementierung

- Geschützte CRM-Aktionen für Status, Vorbereitung, ausdrücklichen einmaligen Versand, unabhängigen Abgleich, private Linkausgabe, interne Prüfung und Bestätigung. Letztere derzeit ausgeschaltet. Browser liefert weder Paket noch Freigabe-/Identitätsflags.
- CRM-Pilotgrenze prüft feste Offerten-ID, Outlook-Empfänger und Paket-SHA. Andere Offerten vor Datenzugriff blockiert; falsch zugeordnete gespeicherte Pakete gesperrt.
- Separater Live-Pilot-Portalentry customer-portal-live-runtime.cjs mit Produktionspräfix lszh_crm_v2_, festem Paket, Outlook-OTP, laufender Freigabeprüfung vor Login/Dokumentzugriff, keinem öffentlichen Issue-Endpunkt und authentifiziertem Archivworker.
- Allgemeiner unabhängiger Gmail-SENT-Prüfer für 2/3 PDFs sowie getrennte schriftliche Bestätigungsnachweise. Prüft Header, Empfänger, fehlende CC/BCC, Paket/Event, tatsächliche PDF-Bytes/Hashes. Unsicherheit bleibt gesperrt, kein automatischer erneuter Versand.
- Neuer Make-Pakettransport macht genau einen HTTP-Aufruf; keine Accepted-Antwort als Versandbestätigung.

## Tatsächliche Bereitstellung

Pilotportal: https://lszh-customer-acceptance-pilot-470613067122.europe-west6.run.app
Dienstkonto: lszh-crm-v2@lszh-automations.iam.gserviceaccount.com. Neue getrennte Secret-Namen lszh-customer-portal-live-pilot-config und lszh-crm-contract-live-pilot-config; keine Inhalte in Repository, Dokumentation oder Logs. Zugriff nur für dieses bestehende Dienstkonto. Version 2 ergänzt die Metadatenbrücke unter Beibehaltung aller Schlüssel und Grenzen.

CRM-Version 00067-dun nach ausdrücklicher Freigabe am regulären Zugang aktiviert; bisherige Revision 00065-xuk für Rückschaltung verfügbar. Nachfolgende Korrekturrevision zunächst ohne Traffic gebaut; finalen Revision-/Trafficstand im Pilot-Abschluss nachtragen.

Make-Szenarien, alle Geschäftskonto-Verbindungen:
- 8175919: Vertragspaket – Pilot 1002 – nur Lars. Nach leerer Queue aktiviert; feste Empfänger-/Paket-/Eventbedingungen. Zwei-PDF-Zweig für Pilot, Drei-PDF-Zweig für diesen Pilot gesperrt.
- 8176103: Nachweis reservieren; festes Produktionsarchiv, appProperties.lszhAcceptanceScope=pilot1002, neue Datei nur für CRM-Dienst lesbar.
- 8176104: Nachweis speichern; prüft festen Produktionsordner, JSON-MIME, nicht Papierkorb und Pilotmarkierung vor Schreiben.
- 8176339: Archivmetadaten prüfen; liefert nur die zwei festgelegten PDF-Dateien in ihren vorgesehenen Ordnern oder markierte Pilotnachweise im Produktionsarchiv.

Neue Archiv- und Metadatenhooks vor Hinzufügen von Drive-Modulen ausschliesslich mit synthetischem Schema gelernt. Keine fremden Kunden-/Archivdaten über diese Brücke freigeschaltet. Alle neuen Abläufe vertraulich, nicht sequenziell, kein Speichern unvollständiger Ausführungen.

Scheduler lszh-customer-acceptance-pilot-archive alle 15 Minuten, Europe/Zurich, OIDC mit vorhandenem Scheduler-Dienstkonto und festem Portal-Audience. Worker filtert anstehende Produktionsnachweise auf die feste Pilot-Offerten-ID.

## Live gefundenes Problem und Korrektur

Vorbereitung wurde vor Versand blockiert: einzeln für das CRM-Dienstkonto freigegebene PDFs lassen sich lesen, aber dessen Drive-Metadaten enthielten keine parents. Direkter Read-only-Cloud-Test bestätigte Freigabe true und beide Dateizugriffe HTTP 200, jedoch fehlende Elternordner. Es wurden keine umfassenden Archiv-Leserechte oder TokenCreator-Rechte eingeräumt.

Korrektur: Owner-autorisierte, rein lesende Make-Metadatenbrücke mit festen Datei-/Ordner-/Pilotmarkierungsbedingungen. Bestehender Dokumentleser prüft weiterhin den richtigen Ordner und tatsächliche Datei-Bytes/Hashes; PDF-Inhalte kommen weiterhin über das angehängte Dienstkonto. Fehlende/ungültige Brückenantwort bleibt gesperrt. Kein Abschwächen der Ordnerprüfung.

Einmaliger technischer Archivtest ohne Kundenannahme: private JSON-Datei 1l8UhhBKzSgZqTc_m6Axg2dLDKaBeoV4g, 192 Bytes, SHA-256 c2a9546edbec18d6f025b497781a2b2172223beed31e1593c6fc9d213ed72eae. Owner-Readback und Hash stimmen überein, Elternordner ist das Produktionsarchiv. Kein Kundenantwortdatensatz erzeugt.

Read-only-Diagnosejob lszh-crm-pilot-1002-readcheck. Erster Launcher-Aufruf ohne -- führte den Diagnosecode nicht nachweislich aus; exit(0) nicht als Nachweis gewertet. Korrigierter direkter Launcher-Aufruf mit -- lieferte in Execution rv7qj die tatsächlichen Metadaten-/Freigabenachweise. Keine Job-Zeitplanung, kein Mailcode, keine Firestore-Writes im Diagnoseskript.

## Tests und noch ausstehende Schritte

401/401 lokale reguläre Tests bestanden. 28/28 tatsächliche Demo-Firestore-Emulatorfälle bestanden, einschliesslich Sperre vor OTP-Versand bei nicht passender Pilotfreigabe. Emulator gestoppt. Keine GitHub-CI-Ausführung behauptet.

Noch kein vollständiger Live-Ende-zu-Ende-PASS: Nach Korrekturbereitstellung Paketvorbereitung im angemeldeten CRM erneut prüfen, ausdrücklich einmaligen Pilotversand und unabhängigen Gmail-Nachweis prüfen, privaten Einladungslink bereitstellen. E-Mail-Code und Kunden-Zustimmung durch Benutzer; danach Produktions-CRM und privaten Archivnachweis unabhängig prüfen. Keine automatische Angenommen-/Gewonnen-/Projekt-/Rechnungsbuchung.

## Fortsetzung nach Bereitstellung

Aktive Korrekturrevisionen: CRM lszh-crm-v2-00069-mos (100 Prozent am regulären Zugang), Portal lszh-customer-acceptance-pilot-00002-2d5. Tatsächlicher Read-only-Cloud-Test 2nkgd bestätigt beide Original-PDFs mit vollständiger Ordner-/Byteprüfung sowie den privaten JSON-Nachweis-Hash über das reale CRM-Dienstkonto. Keine Archivordner-Leserechte auf andere Dokumente vergeben.

Paketvorbereitung im angemeldeten Live-CRM erfolgreich am 25.10.2026 21:26:01 UTC. Ein ausdrücklicher Versandversuch am 21:26:33 UTC wurde von Make bereits vor Initialisierung blockiert: Execution e199567868d8401a99d1593ef5aae3b3, BlueprintValidationError, null Operationen. Backend bleibt korrekt delivery_review, dauerhafte Versandsperre bleibt bestehen. Keine automatische Rücksetzung oder Wiederholung.

Zwei Probleme getrennt korrigiert: Eine Modulverschiebung hatte Mail und Antwort vertauscht; diese Reihenfolge wurde wiederhergestellt. Weiterhin acht Laufzeit-Validierungsfehler, erst im bestehenden Make-Historienprotokoll konkret sichtbar: BasicIfElse verlangt die rechten Bedingungswerte auch bei number:equal als Strings, nicht JSON-Zahlen. Mit arm_set korrigiert (keine erneute Modulverschiebung). Ein manueller Run-once-UI-Aufruf wurde von automatischer Prüfung gesperrt; nicht ausgeführt. Stattdessen vorhandenes Protokoll gelesen und später ein nachweislich nicht sendender empfängerloser Negativtest verwendet.

Negativtest bb3aa08e57f64f1285290a42ff9088ba am 21:33:47 UTC erfolgreich: HTTP 400, genau Module 1 (Webhook) und 5 (Ablehnungsantwort), keine Gmail-Invocation. Beide Mailzweige bleiben auf feste Outlook-Adresse, Paket und Event begrenzt; Drei-PDF-Zweig für diesen Pilot logisch gesperrt.

Unabhängiger Gmail-readonly-Zugriff bestätigt richtiges Geschäftspostfach, ausschliesslich gmail.readonly und null SENT-Kandidaten zu 1002 seit dem ursprünglichen Versuch. Konkrete Freigabe für genau einen protokollierten manuellen Fortsetzungsversand wurde beim Benutzer angefragt. Vorbereitetes einmaliges Recovery-Skript erhält die bestehende Publisher-Sperre, überprüft aktuelle CRM-/Freigabe-/Dokumentdaten und SENT erneut und legt vor einem einzigen HTTP-Aufruf eine zusätzliche unveränderliche manualRecovery-Sperre an. Keine automatische Wiederholung; bei unklarem Ergebnis nur SENT-Abgleich.

Letzter Prüfstand: Make-Ablauf nach String-Korrektur aktiv, Queue leer, reiner Negativtest erfolgreich. Vollständiger --validate-only-Durchlauf des vorbereiteten manuellen Recovery-Skripts PASS: Offerte 1002, zwei passende Dokumente, null unabhängige SENT-Kandidaten, kein Audit-Write und keine sendende Anfrage. Zusätzliche konkrete Freigabe für genau einen protokollierten Fortsetzungsversand ist angefragt und noch ausstehend. Bis dahin unveränderter Zustand delivery_review; keinesfalls Publisher-Lock löschen, keine vorhandene Mail als bestätigt markieren und keinen alten Ein-PDF-Versand verwenden. Browser-Tabs für CRM, Pilotportal und Make als Handoff erhalten. Vollständiger Live-E2E-Test noch nicht abgeschlossen.

## Einmaliger Versand und verifizierter CRM-Abgleich

Benutzer hat die angefragte konkrete einmalige Fortsetzung ausdrücklich bestätigt. manual-recovery.py daraufhin genau einmal mit --explicitly-authorised-one-recovery ausgeführt. Zusätzliche unveränderliche manualRecovery-Sperre vor dem einzigen HTTP-Aufruf angelegt; bestehende Publisher-Sperre erhalten. Receipt messageId 1a17506117516101. Keine Wiederholung.

Make-Execution 84fb15d435a144799284a04542cb6dcc am 25.10.2026 21:44:52 UTC erfolgreich: Webhook einmal, Gmail-Sendemodul 3 genau einmal, Antwortmodul 6 einmal, null Modulfehler. Pakettransport anschliessend wieder deaktiviert.

Unabhängiger Gmail-SENT-Readback erfolgreich: info@lszh-automations.ch an lars.schulthess@outlook.com, keine CC/BCC, richtige Event-/Paketheader, tatsächliche Anhänge mit SHA-256 ef5fa6128d23481122902cea075ce4e30f202f849a9188abf96ef045e9e02d38 (Offerte) und b5421778dd88bdac6697cb4f258319fba6577a9b26cba75509ef4e55df4fc2aa (Bedingungen). SENT-Zeit 21:44:53 UTC. Provider-Receipt allein nicht als Nachweis verwendet.

Browsersteuerung hing beim nativen Nachrichten-ID-Prompt. Keine Umgehung der Webauthentifizierung eingebaut. Geschützter administrativer Abgleich über die vorhandene Publisher-reconcile-Logik: echte Google-Signatur/Audience/Operatoradresse geprüft, nur gmail.readonly, tatsächliche PDF-Hashes erneut geprüft, echte Firestore-REST-Transaktionen. Sendefunktion in diesem Abgleich technisch abgeschaltet. SDK-gRPC-Versuch vorab mit Fehler 2 beendet; kein Erfolg behauptet. REST-Abgleich und anschliessender unabhängiger Produktions-Readback bestätigen Status Versendet, offerDispatchState confirmed und Nachricht 1a17506117516101.

Privater Annahmelink über die normale angemeldete CRM-Oberfläche erstellt und im Pilotportal geöffnet. Token nicht im Protokoll gespeichert. Ein neuer Anmeldecode angefordert; Benutzer gab den Code selbst ein. Anmeldung und GET /api/acceptance am 21:55:29 UTC HTTP 200.

## Im Kundenschritt gefundener Darstellungsfehler

Benutzer meldete den Pilotschritt als abgeschlossen; unabhängiger CRM-Readback zeigte jedoch noch keine onlineAcceptance. Portal zeigte Fehler, kein POST /api/acceptance war erfolgt. Ursache: Server entfernt den Testhinweis im Kundenmodus; Frontend griff anschliessend ohne Nullprüfung auf .notice.hidden zu. Kundenseite brach nach erfolgreichem Paketabruf vor Anzeige des Formulars ab.

Mit Nullprüfung korrigiert, ohne Dokumente, Cookies, Paket-/Empfängergrenzen oder Annahmelogik zu ändern. Neue Client-Regressionsprüfungen führen den tatsächlichen Browsercode nach erfolgreichem Abruf im Kundenmodus ohne Testhinweis sowie im Testmodus aus; prüfen zwei Dokumente, sichtbares Formular, fehlende AVV und erforderliche getrennte Zustimmungen. 403/403 reguläre Tests PASS; Darstellungskorrektur wird separat am Pilotportal bereitgestellt. Noch keine tatsächlich gespeicherte Kundenannahme und kein vollständiger E2E-PASS behauptet.

## Abschliessender technischer Live-Pilot: PASS

Die Darstellungskorrektur ist aktiv in lszh-customer-acceptance-pilot-00003-ctv. Tatsächlich ausgeliefertes Javascript und Gesundheit geprüft. Bestehender Link mit bestehender geprüfter Sitzung neu geöffnet; keine zusätzliche Paketmail, kein weiterer Code erforderlich. Zwei PDFs und zwei getrennte, zunächst ungesetzte Zustimmungen im Browser sichtbar. Benutzer setzte die Zustimmungen und schloss die Annahme selbst ab.

Produktions-Readback bestätigt response_e7f268cff595caac355aa3aea1d83935, angenommen am 25.10.2026 21:59:49.833 UTC (22:59:49 Europe/Zurich), state customer_response_recorded, reviewRequired true. Offertenstatus bleibt wie vorgesehen Versendet. Paket-ID und Paket-SHA entsprechen exakt dem nachgewiesenen Versand.

Authentifizierten bereits eingerichteten Pilot-Archivworker einmal gezielt angefordert. Produktions-CRM und Archivjob anschliessend archiveState/state complete, archivedAt 22:00:07.892 UTC (23:00:07 Europe/Zurich). Privater Drive-Nachweis 1VPNJprsOKQQf7CpV87E7TKyTOiO3ttSM, 2103 Bytes im bestätigten Produktionsarchiv. Unabhängiger Owner-Download ergibt SHA-256 b4cd834751bb00bdef00ffadfc9bb1349287da9e3391f18d9a1cb95c2589ab61, identisch zum atomar gespeicherten evidenceSha256.

Archivinhalt unabhängig geprüft: CUSTOMER_ACCEPTANCE, richtiger Empfänger, verified_session, explicitTermsConsent true, explicitAvvConsent false, representativeVerified true, exakte versendete Offerten-/Bedingungs-Hashes, writtenLszhConfirmationRequired true. Browser-Erfolgsmeldung zeigt dieselbe Nachweisnummer und 25.10.2026 22:59.

403/403 reguläre lokale Tests PASS, 28 tatsächliche Demo-Emulatorfälle PASS. Der technische Ende-zu-Ende-Pilot für diese konkrete Offerte ist abgeschlossen. Dies ist keine pauschale Freigabe für weitere Kunden und keine fachliche LSZH-Auftragsbestätigung. Interne Review-/Bestätigungsfunktion bleibt bewusst nicht freigeschaltet. Kein Angenommen-/Gewonnen-, Projekt-, Rechnungs- oder Zahlungsvorgang ausgelöst. Mailtransport 8175919 nach dem einzigen tatsächlichen Versand inaktiv; Login, Archiv und Scheduler bleiben für den begrenzten Pilot eingerichtet.

Vor einer breiteren Kundenfreigabe zusätzlich berücksichtigen: native Nachrichten-ID-Prompts waren in der Browsersteuerung unzuverlässig (administrativer, Google-authentifizierter Abgleich als dokumentierte Ausnahme, keine Webauth-Abschwächung); UI-Aktionen für interne Prüfung müssen den tatsächlich aktivierten Funktionsumfang abbilden. Die Pilotfreigabe läuft am 27.10.2026 22:12:34 Europe/Zurich ab; sie ist die wirksame obere Grenze, auch wenn die spätere Einladung eine längere nominelle Linklaufzeit anzeigt. Künftige Einladungslaufzeiten auf die Freigabe begrenzen. Kundenweite Aktivierung ausdrücklich nicht behauptet.
