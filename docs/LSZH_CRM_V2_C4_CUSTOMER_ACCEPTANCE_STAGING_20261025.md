# C4 – Online-Kundenannahme: isolierte lokale Teststrecke

Stand: 25.10.2026. Lokaler Code und synthetische Tests. Keine Bereitstellung fuer echte Kunden, kein Mailversand, keine produktive Firestore-/CRM-Aenderung.

## Sichtbarer Ablauf

1. Ein befristeter Link oeffnet genau ein adressiertes Vertragspaket.
2. Offerte, Projektbedingungen und gegebenenfalls AVV sind einzeln herunterladbar. Alle Downloads und die Annahme pruefen die Originalbytes erneut gegen die Paketmetadaten.
3. Zustimmung zu Offerte/Projektbedingungen und Vertretungserklaerung sind erforderlich. Bei AVV=yes ist eine eigene, nicht vorangekreuzte AVV-Zustimmung erforderlich. Bei AVV=no wird sie ausgeblendet und keine AVV-Zustimmung oder AVV-Pruefsumme protokolliert.
4. Bewusste Abgabe speichert einen eindeutigen Nachweis und verbraucht den Link atomar. Ein blosses Oeffnen, eine PDF-Abfrage oder ein Linkscanner verbraucht ihn nicht.
5. Ergebnis ist customer_response_recorded mit nextAction=internal_review. Es erfolgt kein automatischer CRM-Status Angenommen/Gewonnen und keine Auftragsbestaetigung.

Die Vorschau ist klar als TEST_ONLY gekennzeichnet; Unterlagen und Annahme erzeugen keinen echten Vertrag. Die bestehenden fachlichen Vorgaben zur separaten schriftlichen LSZH-Bestaetigung bleiben unveraendert.

## Komponenten

- crm-v2/contract-acceptance-staging.js: Issue/Preview/Download/Accept, Integritaets-, Identitaets-, Zustimmungs- und Nachweisgrenze.
- crm-v2/contract-acceptance-store-staging.js: gemeinsame Transaktionslogik, ausdruecklicher In-Memory-Demospeicher sowie streng auf den bestehenden Demo-Emulator begrenzter Firestore-Adapter.
- crm-v2/contract-acceptance-http-staging.js: getrennter HTTP-Handler, keine produktiven CRM-Routen.
- crm-v2/acceptance-public/: responsive Oberflaeche, getrennte Styles und Skripte, keine externen Ressourcen.
- crm-v2/scripts/contract-acceptance-demo.cjs: nur mit --local-test-demo startbar, ausschliesslich auf 127.0.0.1; verweigert Cloud-Run-Service-/Job-Laufzeit.
- crm-v2/test/fixtures/acceptance/: Kopien der drei bereits im C3.7.3-Einmalversand nachgewiesenen synthetischen PDF-Originale.

## Vertrauensgrenzen

- Tokens bestehen aus 32 kryptografisch zufaelligen Bytes. Persistiert wird nur SHA-256 des Tokens. Linklaufzeit standardmaessig 48 Stunden, hoechstens 72 Stunden; lokale Vorschau 15 Minuten.
- Browser-Tokens werden nur als Bearer-Header verwendet, nicht als Pfad oder Queryparameter. Ein Linkfragment wird direkt aus der sichtbaren URL entfernt. Keine Speicherung in LocalStorage, keine Tokenprotokolle.
- Issue verlangt einen vertrauenswuerdigen serverseitigen Operatorentscheid und einen zum Paket/Empfaenger passenden unabhaengigen Gmail-SENT-Nachweis inklusive Message-ID und urspruenglichem Pruefzeitpunkt. Die lokale Vorschau referenziert ausschliesslich den bereits dokumentierten C3.7.3-Testnachweis; sie fuehrt keinen erneuten Gmail-Abruf aus.
- resolveIdentity und verifyRepresentative sind zwingende, vom Backend bereitzustellende Adapter. E-Mail-Verifikation, Empfaengerzuordnung, Sitzungsalter und Berechtigung werden nicht aus Browser-Checkboxen oder JSON-Flags uebernommen.
- Ausschliesslich synthetische Pakete mit test_-Offerten-ID, TEST_ONLY-Dateinamen/-Versionen und nachgewiesenem sent-Zustand koennen derzeit eingeladen werden. Keine versehentliche Produktionsfreigabe durch Hinzufuegen einer Route.
- POST verlangt die konfigurierte feste Origin, JSON, hoechstens 4096 Bytes und einen an Link/Identitaet gebundenen CSRF-Nachweis. Fremde Origin, unbekannte Felder, manipulierte Versionsangaben und Identitaetsflags werden abgewiesen.
- CSP, no-store, no-referrer, nosniff und Frame-Sperre sind gesetzt. Dynamische Browsertexte werden ueber textContent dargestellt.

## Persistenz und Nachweis

Neue isolierte Sammlung lszh_crm_v2_acceptance_staging_v1. Schluessel fuer Paket, aktuellen Offertenstand, Einladung, Antwort und dauerhafte Antwortsperre pro Offerte sind getrennt. Paketrevision, Paketpruefsumme, Ablauf und vorhandene Antwort werden innerhalb derselben Transaktion erneut gelesen. Eine neuere Paketrevision macht alte Links ungueltig; eine bereits angenommene Offerte kann auch ueber neue Revisionen oder weitere Links nicht nochmals angenommen werden.

Bei Abschluss werden Antwortnachweis, verbrauchter Link, Paketstatus customer_response_recorded und dauerhafte Antwortsperre gemeinsam geschrieben. Externe Archiv-/Identitaetspruefungen liegen ausserhalb wiederholbarer Datenbank-Callbacks. Ein verlorenes HTTP-Ergebnis nach erfolgreichem Commit fuehrt beim naechsten Versuch zu LINK_ALREADY_USED und erzeugt keinen zweiten Nachweis.

Nachweis: Antwort-ID, Serverzeit, Empfaenger, gepruefte serverseitige Identitaet und Sitzungsquelle, Vertretungsfreigabe/-erklaerung, konkrete Zustimmungstexte und Textversion, Paket-/Dokumentversionen und Hashes, Archivreferenzen sowie urspruenglicher Gmail-Versandnachweis. Keine rohen Tokens, PDF-Bytes oder Zugangsdaten im Nachweis. Keine zusaetzliche IP-/User-Agent-Sammlung.

Der Firestore-Adapter verweigert produktive Datenbanken. Er akzeptiert nur das bereits bestehende Standard/native-mode-Demo-Projekt demo-lszha-c2-20261025 am Emulator 127.0.0.1:8788, ohne Cloud-Fallback. Fuer den spaeteren Betrieb ist eine getrennt gepruefte dauerhafte Adapter-/IAM-Konfiguration erforderlich.

## Ausgefuehrte Pruefungen

- **366/366 regulaere Node-Tests PASS**, davon 20 neue Annahme-/HTTP-Faelle.
- **15/15 echte Demo-Firestore-Emulatorfaelle PASS**, davon drei neue: parallele unabhaengige Clients mit genau einem Gewinner, Revisionswechsel und Ablauf erst zum Transaktionszeitpunkt.
- Desktop- und 390-px-Mobilansicht im getrennten Headless-Testbrowser kontrolliert. Keine Browserfehler oder horizontale Ueberlaeufe. Alle drei Kaestchen anfangs leer; ohne AVV-Zustimmung kein Submit. Erfolgsansicht und abgewiesener erneuter Aufruf geprueft.
- Bestehender Emulator-Runner und CI umfassen beide Integrationssuiten. PowerShell-Runner syntaktisch geprueft. Kein GitHub-CI-Lauf oder produktiver IAM-Nachweis behauptet.

## Lokal ansehen

Aus dem Repository:

```powershell
node .\crm-v2\scripts\contract-acceptance-demo.cjs --local-test-demo
```

Danach http://127.0.0.1:8793 oeffnen. Die Anmeldung und Vertretungsfreigabe sind in dieser Vorschau ausdruecklich simuliert. Annahmen liegen nur im Arbeitsspeicher dieses Demoprozesses und gehen beim Beenden verloren. Die echten atomaren Firestore-Schreibvorgaenge wurden separat mit dem Emulator getestet. In der lokalen Vorschau existiert keine Mail-, Drive- oder Cloud-Schreibverbindung.

## Vor echtem Kundeneinsatz noch erforderlich

1. Echte Empfaengeranmeldung anbinden, etwa E-Mail-Einmalcode oder bereits verifizierte Kundensitzung; Vertretungsberechtigung fachlich serverseitig zuordnen. Die Demo-Anmeldung niemals veroeffentlichen.
2. Interne Einladungserstellung an das fuehrende CRM/Firestore und den echten, dauerhaft gespeicherten Versandnachweis anbinden. Kein browserseitiges sent-Flag akzeptieren.
3. Versioniertes Geschaeftsarchiv, dauerhaftes Annahmeregister, serverseitige Rechte, Betrieb/Retention und Wiederanlauf pruefen. Die lokale Memory-Implementierung ist kein Kundenbetrieb.
4. Annahmebeleg/Archivierung und interne LSZH-Pruefung mit der separaten schriftlichen Auftragsbestaetigung verbinden. Neue Mails oder oeffentliche Bereitstellung bleiben gesondert freizugeben.
5. Freigegebene echte Vertragsdokumente und kundenbezogene AVV-Anlagen verwenden; die bestehende noch offene juristische Endpruefung vor Kundeneinsatz abschliessen.
