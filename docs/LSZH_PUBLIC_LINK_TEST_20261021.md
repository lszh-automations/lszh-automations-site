# Öffentlicher Annahmelink – interne Vorbereitung 21.10.2026

V3 bleibt abgeschlossen. Kein Reset, neue Einladung, Annahme oder Mail für recq58gMPjQPpNHYQ. Kundenportal und Kunden-Szenarien bleiben gesperrt.

## Änderung

Neue Links aus beiden vorhandenen Operator-Issuern verwenden #code= statt ?code=. Das Fragment bleibt beim ersten Seitenaufruf im Browser, statt in der HTTP-Request-URL an Hosting/Cloud Run übertragen zu werden. Die tatsächliche Offertenseite liest den Code einmal ein, entfernt ihn aus der Browserhistorie und verwendet weiterhin tokengebundene same-origin POSTs für Vorschau/PDF/Annahme. Alte eindeutige Query-Links bleiben lesbar. Doppelte Codes oder ein Code gleichzeitig in Query und Fragment werden ohne API-Aufruf verworfen. demo=1 übersteuert keinen persönlichen Link.

Der Code bleibt ein vertraulicher Bearer-Zugang. Fragmentübergabe schützt vor der initialen URL-Protokollierung; sie ist keine Benutzeranmeldung und schützt nicht vor Weiterleiten eines Links oder Zugriff durch Browser-Erweiterungen. Keine echten Links in Chat, Git, Analysewerkzeuge oder Screenshots übernehmen. Ein Link allein löst keine Annahme aus.

## Live-Readback ohne Code

https://portal.lszh-automations.ch/offerte-annehmen/ erneut ohne Zugangscode abgerufen: HTTP 503, Cache-Control no-store, Referrer-Policy no-referrer. Das belegt eine gesperrte öffentliche Route, keine aktive Kundenabnahme. Kein Deployment oder Flagwechsel.

## Konkreter nächster Live-Test

Eine gesonderte, zeitlich begrenzte TEST_ONLY-Vorschau mit neuer rein fiktiver Fixture, example.invalid-Empfänger, eigenem zufälligem Zugangscode und deaktiviertem Annahme-/Writeback-/Mailpfad vorbereiten. Nicht V3 oder alte angenommene Angebote wiederverwenden. Bestehende Kundenroute nicht freischalten. Keine Produktions-Datenbank oder Kundenunterlagen anbinden.

Vor Bereitstellung die genaue Test-Origin, bestehende Staging-Dienstidentität, feste Testquelle und PDF-Archivpins im Releasepaket festlegen; ausgehend von der vorhandenen Browser-Staging-Architektur. Aktuelle Browser-Pilot-Konfiguration verlangt aktivierte synthetische Annahme und ist deshalb noch nicht als reine öffentliche Vorschau geeignet. Diese Sperre nicht durch Aktivieren der Kundenannahme umgehen. Änderungen und exakten Deploymentplan erst prüfen; keine allgemeine öffentliche Kundenfreigabe daraus ableiten.

Abnahme: sauberer erster GET ohne Bearer in der URL, Vorschau und feste PDFs nur mit gültigem Code, kein API-Zugang mit fehlendem/falschem/mehrdeutigem Code, fremde Origin blockiert, Annahme HTTP 503, keine Firestore-/Airtable-Schreibvorgänge oder Mails. Danach Testzugang sperren und Traffic/Revision/Flags zurücklesen. Keine neue Vertragsannahme erforderlich.

## Prüfstand

Node-Gesamtlauf: 306 Tests, 300 bestanden, 6 übersprungen, 0 Fehler. Dazu 21 gezielte Browserfunktions-/V2-/V3-Regressionen bestanden. Neuer Chromium-Fall prüft Fragmentlink, ersten GET ohne Zugangscode, entfernte Browseradresse und blockierte Annahme gegen die vorhandene synthetische HTTP-Fixture. Alle 8 Chromium-Tests lokal bestanden (Playwright, Chromium 151; 16,8 Sekunden), darunter der neue Fragmenttest. Ausschliesslich lokale synthetische HTTP-Fixtures, keine Live-Vertragsannahme.
