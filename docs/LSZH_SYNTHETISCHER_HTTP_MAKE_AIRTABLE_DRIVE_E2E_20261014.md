# LSZH Automations – technischer E2E-Test HTTP / Airtable / Make / Drive (STAGING)

**Stichtag:** 14.10.2026 · **Keine Rechtsfreigabe, kein Produktionsvertrag, keine Kunden-E-Mail und kein produktives Deployment.** Die juristische Prüfung wurde auf ausdrücklichen Wunsch auf später verschoben. D1–D3 gelten als geschäftlich definiert.

## 1. Website: echter HTTP-Server mit ausschliesslich simulierten externen Diensten

GitHub Branch `feature/optional-avv-acceptance-staging-20261014`, weiterhin **Draft PR #5, nicht gemergt/deployt**.

- Test `test/offerAcceptance.http.test.js` startet `server.js` tatsächlich als **lokalen Node-HTTP-Server**, nutzt die echte API-Routenlogik `/api/offer/preview`, `/api/offer/document` und `/api/offer/accept` sowie die echte `offerArchiveVerifier.js`-Implementierung.
- Nur **lokale, simulierte** Airtable-API und Google-OAuth-/Google-Drive-API; ein ephemerer RSA-Private-Key für die simulierte OAuth-Signatur wird im Testprozess erzeugt, nicht in die Cloud hochgeladen. Keine echte Airtable-Transaktion, keine Google-Produktivverbindung, keine echte E-Mail oder Make-Aktivierung in diesen HTTP-Tests.
- Echte HTTP-Prüfungen: Annahmeseite ausliefern, Vorschau mit AVV Ja/Nein, alle erforderlichen PDF-Dateien als `%PDF-`-Bytes mit Download-/No-Cache-Header abrufen, separat bestätigte AVV in Annahmefelder und synthetischen Auditbeleg schreiben, Wiederholung nur einmal, `Prüfen` blockieren, fremde Origin blockieren.
- Negativtests: fehlende separate AVV-Zustimmung, falscher AVV-Hash, manipulierte Google-Drive-Metadaten, Airtable-PATCH-Fehler, unerwartete AVV bei Nein, wiederholte Annahme. Rate-Limiting des echten Servers wurde im Test festgestellt und die Testfälle daraufhin bewusst über getrennte lokale Testinstanzen verteilt, **ohne** den Rate-Limiter im Produktcode abzuschwächen.
- GitHub Actions Lauf **38633804997**: **42 Tests bestanden, 0 fehlgeschlagen**. Die Testkonfiguration wurde anschliessend präzisiert (`npm test` führt nur `test/*.test.js` aus; Mock-Helfer und HTTP-Test auf Syntax geprüft). Aktueller Branch-CI-Status nach dieser Anpassung separat prüfen.

**Grenze:** Dies ist eine vollständig simulierte Netzwerkkette bis zum Mock-Airtable-Schreibvorgang, **nicht** eine von der öffentlichen Render-Website ausgelöste reale Airtable-Akzeptanz.

## 2. Reale Apps: isolierter synthetischer Airtable → Make → Google Drive → Airtable-Test

- Fiktive Airtable-Offerte `TEST-HTTP-MAKE-AVV-20261014-NO-CONTRACT`, Record `recMv3OYZQwXzIHdF`, **Status Entwurf**, `Online-Annahme rechtlich freigegeben` **false/leer**, `Online-Annahme AVV ausdrücklich akzeptiert` **false/leer**, **keine** Kunden-E-Mail, drei eindeutig fiktive `TEST_ONLY`-PDFs aus dem Geschäfts-STAGING.
- Separates On-Demand-Make-Szenario **7965394** prüft nur diese fest vorgegebene Record-ID. Code-Modul 3 validiert Testname, Entwurf, fehlende Rechts-/AVV-Annahme, fehlende E-Mail, AVV-Testversion/-Hash und insbesondere **noch keine gespeicherte Beleg-Drive-ID**. Sonst harter Abbruch.
- Make-Subscenario **7964807** wird nur mit synthetischer Zustimmung und künstlicher Repräsentantenprüfung aufgerufen. Es prüft die fiktive Offerte, Bedingungen und AVV, erzeugt einen ausdrücklich ungültigen Test-Annahmenachweis als PDF, speichert ihn im Geschäftskonto-Google-Drive-STAGING, setzt `readOnly` und bestätigt Archiv-ID/SHA-256. Rückgabe `real_contract=false, email_sent=false`.
- Nach positiver Rückgabe schreibt Make `Online-Annahme Beleg Drive ID` und das eindeutig als `TEST_ONLY_INTEGRATION...NO_CONTRACT__NO_MAIL` markierte Auditfragment nur beim Testdatensatz und liest den Testdatensatz anschliessend zur Kontrolle erneut. Status **bleibt Entwurf**, keine produktive Annahme.

### Sichtbare Parallelität und Schutzkorrektur

Zwei nahezu parallel angelaufene synthetische Ausführungen **vor** Aktivierung der sequenziellen Einstellung beendeten die Kette erfolgreich:
- Parent `c70e542cf2c942068cdabdd2e1c1e251`, Child `7cfb84c698604d9db6a18c3dbea637d4`: Beleg-ID `1tu_1vumOzKDI6KH1TQREYlya5JqZSf83`.
- Parent `83338135d01a4f14804265ddf8f9f8dd`, Child `8d4b16d015a44058b19e609330da4fc0`: zweite Beleg-ID `1jD8BXp5FjkXcChvrPvX974_9_o_UT4O9`, zuletzt im Testdatensatz gespeichert.
- Beide synthetischen Belege sind bytegleich (SHA-256 `57eb15eb18f012cae4a38c52cc9cd406d72acc646500d4f253f83682b6c51aca`), haben jedoch **unterschiedliche Datei-IDs**. Dies demonstriert, dass die vorherige reine Prüf-vor-Schreib-Reihenfolge allein **keinen atomaren Exactly-once-Schutz** bietet.
- Späterer Parent `47013a17168e4a759cfe25fd0e5585dc` wurde wegen vorhandener Beleg-ID korrekt bereits in **Modul 3** gestoppt.
- Daraufhin Make **7965394** mit `settings.sequential=true` konfiguriert. Ein weiterer auf dem bestehenden Datensatz ausgeführter Test `eba45e394d0e40cf8709c92eaf647e2f` scheiterte erwartungsgemäss sofort im Preflight; **kein weiterer Beleg**. Eltern- und Kind-Testszenario jeweils nach den Läufen **inaktiv**.
- **Offen:** `sequential=true` serialisiert nur ein Make-Szenario; bei mehreren Startkanälen/Instanzen oder Netzwerkausfall zwischen Drive-Upload und Airtable-Schreiben ist das nicht gleichbedeutend mit einer atomaren Sperre. Für den echten Betrieb braucht es streng begrenzte Startpunkte, saubere Reconciliation und gegebenenfalls ein System mit transaktionaler Idempotenz. Die zwei synthetischen Testbelege bleiben als Nachweis bestehen; kein echter Vertrag und kein Kundenversand.

## 3. Produktionsgrenzen / Restarbeiten

1. **Render-Zugriff:** Der verbundene Render-Connector fordert eine explizite Workspace-Auswahl durch den Nutzer, bevor Dienste abgefragt werden dürfen. Keine Workspace-Auswahl erraten oder Render-Produktivkonfiguration ändern.
2. Eingeschränktes Google-Servicekonto zum Lesen des Geschäftsarchivs und dessen Verbindung mit Render ist noch **nicht** real geprüft oder eingerichtet; der HTTP-Test nutzt nur ephemere fiktive Credentials.
3. Der isolierte Test deckt die **zwei Hälften** einzeln ab (Website → simulierte Provider und reales Airtable → Make → Drive → Airtable), noch nicht eine durchgehende öffentliche Website → echte Airtable/Make/Drive-End-to-End-Kette.
4. Die produktionsnahen Make-Szenarien `7940261`, `7940220`, `7965215`, `7965223` bleiben **inaktiv** und haben harte `0=1`-Sperren an Token-/Claim- und Gmail-Modulen. Keine E-Mail versandt oder echte Akzeptanz vorgenommen. Draft-PR #5 **nicht** gemergt.
5. Vor Echtbetrieb: technische Idempotenz/Recovery, echtes Dienstkonto, finale kundenbezogene AVV-Anlagen A–C, Projektbedingungen, spätere juristische Prüfung, Geschäftsfreigabe und ausdrücklich genehmigte produktive Aktivierung.

**Fazit:** Die synthetische Teilkette mit echten externen Make/Airtable/Drive-Modulen ist erfolgreich, aber bewusst **nicht** als abgeschlossener, öffentlicher Produktions-E2E-Test oder als rechtlich geprüfter Vertrag zu bezeichnen.
