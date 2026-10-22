# Kundenofferte manuell vorbereiten und gezielt versenden

Entwicklungsbranch, 21.10.2026. Vorbereitung für den vorhandenen B2B-Kundenpfad. Noch kein erfolgreicher produktiver Versandlauf, keine neue Kundenannahme und keine externe Mail.

## Bedienung

1. Anfrage im Website-CRM prüfen und genau einen Lead mit tatsächlichem Auftraggeber, Kontakt, E-Mail und vollständiger Postadresse verknüpfen.
2. Offerte mit Ausgangslage, Ziel, Leistung, Umfang, Ausschlüssen, Systemen, Einmal-/Monatspreis, Zahlungsmodell, Zahlungsziel und Gültigkeit vervollständigen. Finale Projektbedingungenversion ist 1.0.
3. AVV ausdrücklich Ja oder Nein. Bei Ja sind eine tatsächlich ausgefüllte und freigegebene Kunden-AVV im Produktionsarchiv sowie eigene ID, SHA-256 und finale Versionskennung erforderlich; der unbefüllte Rahmenmaster wird abgewiesen. Bei Nein keine AVV-Daten oder AVV-Anhänge.
4. Die konkrete Offerte mit den bestehenden Feldern „Echtbetrieb – kein Test“ und „Online-Annahme rechtlich freigegeben“ freigeben. Diese Felder werden nicht automatisch pauschal gesetzt.
5. Bei BEREIT bewusst die Schnellaktion „Für Versand freigeben“ wählen. Systemfelder für Dokumentbindung, Link, Versandzeitpunkt und Ergebnis werden vom Ablauf gepflegt.

Die globalen Ausführungs-/Mail-Sperren des vorbereiteten Make-Ablaufs sind zusätzlich noch geschlossen. Diese Anleitung ist noch keine Aufforderung, einen Echtkundenversand auszulösen.

## Implementiert

`customerDispatchContract.cjs` enthält dieselben reinen Prüffunktionen für Make und Tests: tatsächliche Quelle und Freigaben, genau ein Kontakt, Preise mit höchstens zwei Dezimalstellen, positive Gesamtsumme, gültige Schweizer Tagesgrenze einschließlich Zeitumstellung, finale Dokumentversionen, explizite AVV-Entscheidung und Quellfingerabdruck. Kontaktfelder und HTML werden gebunden bzw. escaped; Testmarker und nicht zustellbare Musteradressen sind ausgeschlossen.

Die Offerten-PDF wird ausschließlich aus den geprüften CRM-Feldern erzeugt. PDF-ID, tatsächliche Bytes, SHA-256, Produktionsordner und Drive-Schreibschutz werden nach dem Upload und erneut vor Mail geprüft. Für den Nein-Fall werden genau zwei Anhänge erzeugt, für Ja genau drei. Die Mail geht ausschließlich an die erneut geprüfte Lead-E-Mail, ohne CC/BCC. Make nutzt dazu die bestehende geschäftliche Gmail-Verbindung und einen lokal aus verifizierten Bytes zusammengesetzten MIME-Inhalt; es gibt keinen neuen Desktop-Mail-Sender.

Firestore bleibt in der benannten Kundendatenbank `lszh-offers`, mit den bestehenden Kundenportal-Collections. Eine atomare create-only-Operation reserviert Quellindex und Offerte im Zustand prepared. Der Portalvertrag erlaubt in diesem Zustand keine Vorschau oder Annahme. Nach bestätigter Gmail-ID wird zuerst eine create-only Providerquittung gesichert, danach Airtable mit identischer Token-/Dokumentbindung aktualisiert und frisch zurückgelesen. Erst dann werden die vorbereitete Offerte und der Index bei unverändertem Firestore-Updatezeitpunkt atomar auf sent veröffentlicht. Eine zwischenzeitliche Änderung, ein konkurrierender Quellindex oder bereits anderweitig veröffentlichter/angenommener Zustand wird abgewiesen.

Die Versandfreigabe bleibt nach tatsächlichem Kundenversand true: Das bestehende Kundenportal und dessen Annahme-Writeback verlangen diese datensatzbezogene Freigabe. Schnellaktion wird geleert. Versandstatus zeigt zunächst „Mail bestätigt – Link wird veröffentlicht“, erst nach bestätigter Veröffentlichung „Versandt“. Dies verhindert eine falsche Erfolgsmeldung bei ausgebliebener Linkveröffentlichung.

Native Make-Datenspeicher reservieren PDF- und Mailversuch. Fehler nach Gmail, bei Quittungsspeicherung, CRM-Writeback oder Linkveröffentlichung führen zu manueller Prüfung und behalten die Reservierungen. Keine blinde Wiederholung eines möglichen Kundenversands. Der Quellstand wird nach Dokumenterzeugung und unmittelbar vor Gmail erneut geprüft.

## Kundenportal

Vorschau und Annahme sind getrennt konfigurierbar: `LSZH_PORTAL_PREVIEW_ENABLED=true` erlaubt später nur geprüfte bereits veröffentlichte Kundenofferten/PDFs. Eine Annahme erfordert weiterhin ausdrücklich `LSZH_PORTAL_PRODUCTION_ENABLED=true`. Beide bleiben in dieser Vorbereitung false. Der HTTP-Adapter teilt dem Browser den tatsächlichen Annahmeschalter mit; die Seite deaktiviert bei reiner Vorschau alle Eingaben und die Annahme, während PDF-Downloads erhalten bleiben. Eine Annahme-POST wird unabhängig von der Browserdarstellung serverseitig abgewiesen.

Der neue Dispatcher ist gegen `mapApprovedCustomerOffer` und `offerFingerprint` des bestehenden Kundenportals geprüft. Produktions-ID, Datenbank, Dokumentarchiv, Source-Index und veröffentlichte Offerte passen zum vorhandenen Pfad; keine neue Kundenportal-Parallelarchitektur.

Bereitstellung bestätigt: Quellcommit `4348cd2d8a4d9f859489a87031651577095dbc33`, Build `da2ec9db-74fb-4ba5-b2a4-45cc29d24df4`, Revision `lszh-offer-portal-00006-pqj`, Image-SHA `85e8edf96a0f329ce9227dd8634a98dd8ac79cc3033d42b8c0c5908564eea2d4`. Aktuelle Revision ist bereit und erhält die bisherige 100%-Latest-Verkehrsregel; bestehende Laufzeitidentität und Secret-Referenzen wurden erhalten. Beide Schalter explizit false, öffentliche Route weiterhin HTTP 503. Vorherige Revision `00005-f2k` für Rückbau dokumentiert. Evidenz: `evidence/customer-dispatch-portal-disabled-20261021.json`. Kein Build oder Deploy eines neuen Kundenversandsenders im Portal: Der Dispatcher gehört in den noch zu speichernden Make-Plan.

## Make-Speicherung blockiert

Der fertige, ausgeschaltete Plan liegt in `evidence/customer-dispatch-blueprint-prepared-20261021.json`; Generator: `scripts/customer-dispatch-make-plan.cjs`. Er umfasst 40 Module einschließlich Fehlerpfaden. Sowohl die Suche als auch das Gmail-Modul besitzen zusätzlich eine harte geschlossene Sperre. Das bestehende abgeschlossene TEST_ONLY-Szenario bleibt separat inaktiv.

Der Versuch, den neuen Kundenablauf über `scenario_create` zu speichern, wurde von Cloudflare mit HTTP 403 blockiert, Ray-ID `a4e22930daed2f30`. Anschließendes `environment_get` funktioniert; die Suche nach dem neuen Szenarionamen liefert keine Anlage. Es wird kein erfolgreicher Save oder Scenario-ID behauptet. Keine Umgehung über andere Zugangswege oder geänderte Payload-Kodierung. Dies ist eine konkrete Make-Speichersperre; ein fehlendes OAuth-Scope ist damit nicht belegt. Die vollständige nichtgeheime Konfiguration ist für erneute normale Speicherung nach Aufhebung der Sperre gesichert.

Der Kundenplan sucht direkt mit Airtable-REST `filterByFormula`, maximal einen Datensatz, und stoppt bei leerer Ergebnisliste vor dem Record-GET. Das vermeidet die uneindeutige Suchmodul-Übergabe des internen Piloten. Dort ist `formulaField=formula` nun zusätzlich explizit gesetzt; ein erneuter interner Prüflauf `3fa7f207350f4f53b1d1a1ce31bb42ed` las nur Suche, frischen Datensatz und Quellprüfung. Keine Änderung, PDF oder Mail; anschließend wieder deaktiviert. Die nachgeschaltete frische Quellprüfung bleibt zwingend, unabhängig von einem Vorfilter.

## Prüfung und Freigabestand

- 325 Node-Tests: 319 bestanden, sechs übersprungen, null Fehler.
- Drei Chromium-Prüfungen bestanden: Kundenvorschau mit zwei PDFs, Kundenvorschau mit drei PDFs, bestehende interne öffentliche Vorschau. Persönliche Codes bleiben aus URL-Anfragen/History; Annahme-POST bleibt gesperrt.
- Spezifisch geprüft: fehlende oder widerrufene Freigabe, fehlende Adresse, Test-/ungültiger Empfänger, ungültiges Datum/Preis, unvollständige AVV, falscher Ordner, veränderte PDF-Bytes, geänderte Quelle vor Mail, fehlende Gmail-ID, fehlender/abweichender CRM-Nachweis sowie Firestore-Updatevorbedingungen.
- Blueprint ist strukturell lokal geprüft und alle eingebetteten Make-Code-Module sind syntaktisch kompiliert. Keine behauptete Live-Ausführung der neuen Gmail-API- oder Firestore-Publikationsmodule. Der tatsächliche Kunden-End-to-End-Lauf bleibt offen.
- Aktuelles CRM: 24 Offerten, null gleichzeitig für Echtbetrieb und rechtlich freigegebene Kundenofferten. Keine bestehenden Testdatensätze wurden umetikettiert oder freigegeben. Angaben für einen tatsächlichen Pilotauftrag beim Nutzer angefragt.

## Nächster konkreter Schritt

Nach Aufhebung der Make-Speichersperre den gesicherten Kundenplan regulär speichern, Verbindungen und Providerantworten prüfen. Einen tatsächlichen Pilotauftrag als vollständigen Entwurf vorbereiten und konkret prüfen lassen. Erst für genau diesen Datensatz die beiden globalen Ausführungssperren gezielt öffnen und den Kundenlauf kontrollieren. Zunächst Kunden-Vorschau ohne Annahme; die verbindliche Annahme und nachgelagerte Vertrags-/Rechnungsstrecke sind davon getrennte Freigaben.

Der Veröffentlichungsstatus des neuen Google-OAuth-Clients für Make/Firestore ist weiterhin unabhängig zu bestätigen; eine externe App im Google-Status Testing benötigt laut Make eine wöchentliche Neuautorisierung. Nicht als wartungsfreien Dauerbetrieb ausgeben. Die bestehende Geschäftsverbindung wird nicht gelöscht oder ersetzt.
