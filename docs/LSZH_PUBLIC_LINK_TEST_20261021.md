# Öffentlicher Annahmelink – interne Vorbereitung 21.10.2026

V3 bleibt abgeschlossen. Kein Reset, neue Einladung, Annahme oder Mail für recq58gMPjQPpNHYQ. Kundenportal und Kunden-Szenarien bleiben gesperrt.

## Änderung

Neue Links aus beiden vorhandenen Operator-Issuern verwenden #code= statt ?code=. Das Fragment bleibt beim ersten Seitenaufruf im Browser, statt in der HTTP-Request-URL an Hosting/Cloud Run übertragen zu werden. Die tatsächliche Offertenseite liest den Code einmal ein, entfernt ihn aus der Browserhistorie und verwendet weiterhin tokengebundene same-origin POSTs für Vorschau/PDF/Annahme. Alte eindeutige Query-Links bleiben lesbar. Doppelte Codes oder ein Code gleichzeitig in Query und Fragment werden ohne API-Aufruf verworfen. demo=1 übersteuert keinen persönlichen Link.

Der Code bleibt ein vertraulicher Bearer-Zugang. Fragmentübergabe schützt vor der initialen URL-Protokollierung; sie ist keine Benutzeranmeldung und schützt nicht vor Weiterleiten eines Links oder Zugriff durch Browser-Erweiterungen. Keine echten Links in Chat, Git, Analysewerkzeuge oder Screenshots übernehmen. Ein Link allein löst keine Annahme aus.

## Live-Readback ohne Code

https://portal.lszh-automations.ch/offerte-annehmen/ erneut ohne Zugangscode abgerufen: HTTP 503, Cache-Control no-store, Referrer-Policy no-referrer. Das belegt eine gesperrte öffentliche Route, keine aktive Kundenabnahme. Kein Deployment oder Flagwechsel.

## Öffentliche Vorschau live abgeschlossen

Getrennten Dienst lszh-offer-link-preview mit rein fiktiven, gebündelten PDFs und hart gesperrter Annahme erstellt, über HTTPS erfolgreich geprüft und vom Betreiber im Browser bestätigt. Falsche Codes, fremde Origins, AVV-Download und Annahme blockiert. Beide PDF-Bytehashes stimmen. Dienst danach entfernt, Bestandsdienste unverändert und Kundenroute weiter HTTP 503. Kein V3-Reset, keine Mail und keine Datenbank-/CRM-Schreibvorgänge. Release-/Rückbau-Nachweis: [öffentliche TEST_ONLY-Vorschau](LSZH_PUBLIC_PREVIEW_RELEASE_20261021.md).

Die Einschränkung des bisherigen Browser-Staging-Modus wurde nicht verändert. Stattdessen enthält die getrennte Vorschau keine Vertrags-/Daten-/Provideranbindung. Damit ist die öffentliche Vorschau geprüft; ein vollständiger Kunden-Annahme-/Mailweg bleibt separat abnahmepflichtig.

## Prüfstand

Node-Gesamtlauf: 306 Tests, 300 bestanden, 6 übersprungen, 0 Fehler. Dazu 21 gezielte Browserfunktions-/V2-/V3-Regressionen bestanden. Neuer Chromium-Fall prüft Fragmentlink, ersten GET ohne Zugangscode, entfernte Browseradresse und blockierte Annahme gegen die vorhandene synthetische HTTP-Fixture. Alle 8 Chromium-Tests lokal bestanden (Playwright, Chromium 151; 16,8 Sekunden), darunter der neue Fragmenttest. Ausschliesslich lokale synthetische HTTP-Fixtures, keine Live-Vertragsannahme.
