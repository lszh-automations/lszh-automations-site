# Kundennummern und Rechnungsentwurf bei Auftragsannahme

Stand: 26.10.2026. Vom Benutzer gewählter Ablauf: Bei Annahme entsteht ein prüfbarer Entwurf ausschliesslich für einmalige Leistungen. Kein automatischer Rechnungsversand und keine automatische Monatsrechnung.

## Kunden und Zuordnungen

Die bestehenden Firestore-Dokument-IDs bleiben unveränderte technische Fremdschlüssel in Offerten, Projekten und Rechnungen. Zusätzlich erhalten Kunden eine lesbare, vom Server vergebene Kundennummer `KD-1000`, `KD-1001` usw. Der Nummernkreis und eine eindeutige Nummernreservierung werden gemeinsam mit dem Kunden in einer Transaktion geschrieben. Browserformulare können keine eigene Kundennummer vergeben oder eine bestehende überschreiben.

Neue manuell erstellte Kunden und bei Auftragsübernahme neu erstellte Kunden erhalten ihre Nummer sofort. Ein schon vorhandener Kunde wird weiterverwendet; weitere Aufträge erzeugen keinen zweiten Stammdatensatz. Fehlt bei diesem Kunden die Nummer, wird sie bei der Übernahme oder dem kontrollierten Nachtrag ergänzt. Bereits vergebene Nummern bleiben gleich.

Die Kundennummer erscheint im Kundenregister, im Kundeneditor, in Auswahlfeldern sowie bei den Kundenverweisen in Offerten, Projekten und Rechnungen. Die Offertenliste erhält dazu eine Kundenspalte. Die Suche nach Kundennummer findet auch zugehörige Datensätze. Die API ergänzt die aktuell gültige Nummer bei Verweisen unabhängig davon, ob der Kunde auf der ersten Browserseite geladen wurde; pro Seite sind dafür zusätzliche Lesezugriffe auf die verschiedenen verknüpften Kunden nötig. Die Nummer wird nicht als veränderliche Kopie in versendete PDFs oder bereits angenommene Dokumentpakete geschrieben.

## Automatischer Rechnungsentwurf

Die vorhandene Auftragsübernahme führt jetzt in einer gemeinsamen Transaktion Folgendes aus:

1. Bestehenden Kunden zuordnen oder neuen Kunden anlegen und nötigenfalls Kundennummer vergeben.
2. Projekt anlegen oder vorhandenes Projekt derselben Offerte/desselben Kunden zuordnen.
3. Einmalige Positionen aus der gespeicherten Offerte in einen Rechnungsentwurf übernehmen. Mengen, Einzelpreise und Rappenrundung bleiben erhalten. Monatliche Positionen sind ausgeschlossen.
4. Rechnungsnummer aus dem bestehenden Rechnungsnummernkreis vergeben und Rechnung mit `customerId`, `projectId`, `offerId`, `source=offer_acceptance` und `billingScope=one_time` verknüpfen.
5. Offerte auf Angenommen und Lead gegebenenfalls auf Gewonnen setzen. Die Offerte erhält den Verweis `initialInvoiceId`.

Bei rein monatlichen oder kostenlosen Leistungen entsteht keine Nullrechnung. Für monatliche Leistungen bleibt ein separater Abrechnungsbeginn festzulegen. Die neue Rechnung hat Status Entwurf und noch kein Fälligkeitsdatum. Vor Freigabe/Versand müssen Inhalt und Fälligkeit geprüft werden. Es wird weder eine Zahlung erfasst noch eine Mail oder Mahnung ausgelöst.

Die Rechnungs-ID wird deterministisch aus der Offerten-ID abgeleitet. Gleichzeitige oder wiederholte Übernahmen/Nachträge erstellen keine zweite Rechnung und verbrauchen keine weitere Rechnungsnummer. Bereits vorhandene Rechnungen derselben Offerte oder desselben Projekts werden zugeordnet und nicht überschrieben; bei abweichender Kunden-/Projektzuordnung wird der Vorgang gesperrt. Existiert bereits eine manuelle Projektrechnung, muss vor einer zusätzlichen Abrechnung fachlich geprüft werden, welche Leistungen sie deckt. Automatische Auftragsentwürfe dürfen nicht auf einen anderen Kunden oder ein anderes Projekt umgehängt werden.

Nach Annahme bietet die Offerte **Rechnung öffnen** an. Für Altaufträge ohne Entwurf gibt es den bewussten Nachtrag **Rechnungsentwurf für einmalige Leistungen erstellen**.

## Grenzen und Nachtrag für Offerte 1006

Offerte 1006 war bereits korrekt angenommen. Ihr Projekt war angelegt und dem vorhandenen Kunden zugeordnet. Bisher gab es weder eine sichtbare Kundennummer noch eine automatische Rechnungserstellung. Deshalb war das Fehlen eines weiteren Kunden kein Übernahmefehler: der vorhandene Kunde wurde wiederverwendet.

Der freigegebene Nachtrag umfasst genau diesen bestehenden Kunden und die einmaligen Leistungen dieser Offerte: CHF 1'500; monatliche CHF 200 ausgeschlossen. Der schreibfreie Probelauf bestätigte den Betrag vor Ausführung. `scripts/crm-rest-repair.cjs` verwendet dieselben `buildStore`-Geschäftsmethoden wie das CRM, eine echte Firestore-Transaktion und eine nur im Arbeitsspeicher übergebene OAuth-Anmeldung. Standardmässig wird nur gelesen; für Änderungen sind eine explizite Offerten-ID und `--apply` nötig. Keine Kundendubletten, keine Änderung bestehender Dokument-IDs und keine Mails. Der genaue ausgeführte Nachtrag wird im Live-Nachweis festgehalten.

## Endpunkte und Prüfung

- `POST /api/records/kunden/:id/number`: fehlende Nummer einmalig ergänzen.
- `POST /api/records/offerten/:id/initial-invoice`: Rechnungsnachtrag für eine bereits angenommene Offerte mit eindeutigem Kunden und Projekt.
- Beide benötigen die bestehende CRM-Anmeldung, exakten Origin und einen leeren JSON-Body. Empfänger, Betrag und Kundennummer können nicht im Request vorgegeben werden.
- Die vorhandene Statusänderung auf Angenommen ruft den automatischen Entwurf direkt innerhalb der Übernahmetransaktion auf.

463 CRM-Tests bestanden. 36 echte lokale Firestore-Tests bestanden, darunter parallele Kundennummern mit unabhängigen Clients, Rechnungsanlage/Mehrfachaufruf und der exakte REST-Nachtragsweg an synthetischen Altaufträgen. Desktop-/Mobilprüfung mit gesperrtem echtem Netzwerk erfolgreich. Keine Änderungen am Kundenportal, an Make, an Gmail-Berechtigungen oder an versendeten Vertragsunterlagen.


## Ausgef�hrter Live-Nachtrag und Nachweis

Der vorhandene Kunde von Offerte 1006 tr�gt jetzt **KD-1000**. Sein bestehender Datensatz und seine technische ID wurden weiterverwendet. **RE-1003** wurde als Entwurf �ber **CHF 1'500** angelegt und mit derselben Offerte, demselben Projekt und demselben Kunden verkn�pft. Monatliche CHF 200 sind ausgeschlossen. Status Angenommen bleibt erhalten. Der Nachtrag wurde nach Benutzerwahl einmalig durch die getestete Transaktionsroutine ausgef�hrt und anschliessend unabh�ngig lesend gepr�ft. Keine neue Kundendublette, kein Versand, kein Zahlungseingang und keine gesetzte F�lligkeit.

[Live-Manifest](../releases/customer-billing-live-20261026.json), Quellcommit `d443b3895c53798f8c1a266ad26c21d819069fe3`, [PR 18](https://github.com/lszh-automations/lszh-automations-site/pull/18). Alle 79 tats�chlich gebauten Laufzeitdateien entsprechen dem vorbereiteten Stand. Vollst�ndige Umgebungsvariablen/-referenzen und Dienstkonto unver�ndert. Neue Oberfl�che HTTP 200; anonymer Zugriff auf die Entwurfserstellung HTTP 401. Keine Error-Level-Logs bei der Abschlusspr�fung. GitHub-Pr�fungen des Quellcommits erfolgreich.

R�ckfallversion des CRM: `lszh-crm-v2-00085-tep`. Kundennummern, Nummernreservierungen, Rechnungsnummern und angelegte Entw�rfe werden bei einer Code-R�ckschaltung nicht entfernt oder zur�ckgesetzt. Die alte Version erzeugt keine weiteren automatischen Entw�rfe. Bestehende Rechnungen bleiben normale CRM-Entw�rfe. Kundenportal und Make bleiben unver�ndert.
