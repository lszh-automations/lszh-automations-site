# C4.2 – bereitgestelltes Staging-Kundenportal

Stand 25.10.2026. Öffentliche Anmeldeseite vom Benutzer ausdrücklich bestätigt; keine produktiven Kundenverträge aktiviert.

## Bereitstellung

- Cloud Run: lszh-customer-acceptance-staging, Projekt lszh-automations, Region europe-west6.
- HTTPS-Origin: https://lszh-customer-acceptance-staging-ozx7mp2bka-oa.a.run.app
- Aktive Revision: lszh-customer-acceptance-staging-00003-n69; Build 1c3da315-6660-4f6c-a431-c2b3c2d6de0a SUCCESS.
- Dienstidentität: lszh-customer-acceptance-stg@lszh-automations.iam.gserviceaccount.com, keine privaten Schlüssel erstellt.
- Secret: lszh-customer-portal-staging-config, Version 1 fix eingebunden, nur der neue Dienst erhält Secret-Zugriff. Webhook-Adressen und zufällige HMAC-Schlüssel nicht im Repository.
- Datenbankzugriff per IAM-Bedingung auf projects/lszh-automations/databases/(default) begrenzt. Anwendung fest auf lszh_crm_v2_staging_ begrenzt; Produktionspräfix im Runtime-Einstieg nicht konfigurierbar.
- Cloud-Run-Public-Access über --no-invoker-iam-check nach ausdrücklicher Bestätigung. Ein allUsers-IAM-Binding war durch Domain Restricted Sharing gesperrt; keine Organisationsrichtlinie geändert. Dokumente verlangen zusätzlich Einladung UND echte Sitzung. Operatorrouten prüfen signierte Google-ID-Tokens, feste Audience und feste Betreiberadressen.
- Cloud Run reserviert /healthz: tatsächlicher Anwendungscheck unter /api/health.

## Tatsächlich bestätigter Codeversand

Make-Szenario 8175404, Gmail-Verbindung 11904991 für lars@lszh-automations.ch, bestätigter Send-as info@lszh-automations.ch. Sowohl Backend als auch Make-Filter erlauben im Staging nur lars.schulthess@outlook.com, keine CC/BCC. Make-Daten vertraulich; keine Codes in Anwendungslogs.

Ein realer Code durch den Agenten über POST /api/login/request am 2026-10-25T20:12:05Z angefordert und bestätigt, HTTP 200. Make-Ausführung 2f0f6c3cfb104eadb127e56bcbeeca12, success, drei Module, keine Fehler. Dies bestätigt Gmail-Versand, nicht Outlook-Inbox-Zustellung oder die vom Benutzer abgeschlossene Anmeldung. Kein erneuter Versand automatisch ausgelöst. Anschliessend wurde aus dem geöffneten Portal am 20:16:02Z ein weiterer Code angefordert und am 20:16:15Z erfolgreich über /api/login/verify bestätigt (beide HTTP 200); diese Browseranmeldung wurde nicht vom Agenten ausgelöst. Die authentifizierte Dokumentübersicht wurde im Browser sichtbar bestätigt.

Befristete Testeinladung im Staging-CRM erstellt. Testpaket ist das bereits unabhängig verifizierte C373-Paket, Gmail Message 1a17462a3571a435, Paket-SHA 5f94e7014a84c895527b7e58b39d5c8bb70d10cbca9019082a61321d0bb15a78. TEST_ONLY-PDFs werden für diesen Test aus dem begrenzten Quellpaket gelesen; keine neuen echten Angebots-PDFs behauptet. Einladungs-Token nicht in diesem Dokument speichern.

## Tatsächlich bestätigter Archivzugang

Zielordner: 1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in im Geschäftskonto lars@lszh-automations.ch, weiterhin privat.

Schreiben erfolgt über Make-Geschäftsverbindung 11904271, nicht durch einen privaten Service-Account-Schlüssel. Der neue Portaldienst hat Leserrechte auf den Zielordner und die erzeugten Nachweise. Leserrecht wurde einmalig mit Szenario 8175623 eingerichtet, Ausführung c25aff4d4abb466981129174e6b3db42 success; Szenario danach deaktiviert.

- Reservierung: aktives Szenario 8175437 erzeugt leere application/json-Datei im festen Ordner und gibt nur dem Portaldienst Leserechte.
- Schreiben: aktives Szenario 8175440 prüft den festen Parent, MIME-Typ und Trash-Zustand vor dem Speichern; Daten vertraulich.
- Make-sequential musste deaktiviert werden, weil Make bei serieller Verarbeitung keine direkte Webhook-Antwort unterstützt. Einmaligkeit bleibt in Firestore; bestehende nichtleere widersprüchliche Nachweise werden vom Backend nicht überschrieben.
- Bei verlorener Upload-Antwort liest der Dienst die Datei erneut; passender SHA schliesst den Auftrag ab, statt nochmals hochzuladen.

Realer geschützter Archiv-Smoke am 2026-10-25T20:14:12Z HTTP 200, readback true:

- Datei 13kS2zxbgQvbTuGQTqdRpQf9xjMcMOmoy, 151 Bytes application/json, privater TEST_ONLY_ARCHIVE_READBACK.
- SHA-256 c03f74f5b552dce73562153256342ecf5fb451f6296bf09980d526feb717520a.
- Make-Schreibausführung d4fc26ca7db94446860f4d4cd2e0ffe0 success, vier Module, keine Fehler.
- Der neue Portaldienst las die tatsächlichen Bytes mit eigener Identität zurück; SHA stimmt überein.
- Drei frühere diagnostische Reservierungen sind leere private JSON-Dateien geblieben. Keine Kundeninhalte; keine automatische Löschung oder Wiederholung unbekannter Sendungen.
- Erste Testdatei hatte wegen Make-Titel-/Dateinamensverhalten eine doppelte .json-Endung; Titelmapping für künftige Nachweise korrigiert. Inhalt und Hash des bestätigten Testnachweises unverändert.

## Dauerhafter Worker und Zugriffstests

Cloud Scheduler lszh-customer-acceptance-staging-archive, ENABLED, Europe/Zurich, alle 15 Minuten, POST /internal/archive-tick, OIDC mit lszh-crm-mail-scheduler@lszh-automations.iam.gserviceaccount.com, Audience exakt Origin, keine automatischen Scheduler-Wiederholungen. Direkte Prüfung: completed 0 / failed 0. Echte Scheduler-Aufrufe um 20:15:00Z und 20:15:24Z HTTP 200. Keine Mailfunktion im Worker.

- Annahmeübersicht mit gültiger Einladung ohne Sitzung: 401.
- PDF mit gültiger Einladung ohne Sitzung: 401.
- Archivworker ohne Betreiberidentität: 401.
- /api/health: 200, mode TEST_ONLY, configured true.
- 375/375 lokale Node-Tests bestanden; vorige 19 Emulatorprüfungen weiterhin dokumentiert. In dieser Runde kein erneuter kompletter Emulatorlauf behauptet.

## Betriebsgrenzen

Bereit ist der echte, dauerhafte Staging-Durchlauf mit Lars. Echte Code-Anmeldung am 20:16:15Z bestätigt und Dokumentübersicht sichtbar; noch keine Test-Annahme mit Zustimmungen abgeschickt. Keine echte Offerte neu versendet, keine produktive Offerte gewonnen, keine Auftragsbestätigung verschickt. Andere Kundenadressen und reale Vertragsunterlagen bleiben gesperrt. Der spätere Kundenbetrieb benötigt freigegebene reale Paket-/Archivdaten und eine ausdrückliche Erweiterung der Staging-Empfängerbegrenzung.

Bestehende CRM-, Website- und Angebotsdienste sowie bestehende Versand-Szenarien unverändert; eigene neue Dienstidentität, eigene Secrets und neue Make-Abläufe.

## Vollständiger Staging-Abschluss durch den Benutzer

Am 25.10.2026 um 21:18:48 Europe/Zurich (20:18:48.717Z) wurde die Test-Annahme im Portal abgeschlossen. Benutzer-Screenshot und anschliessende direkte Firestore-Lektüre bestätigen identische Nachweisnummer response_62b9be9f634a0983e5d27435bf63da99. CRM-Zustand customer_response_recorded, reviewRequired true, Offertenstatus weiterhin Versendet.

Bereits autorisierten Archivworker anschliessend gezielt abgearbeitet: completed 1, failed 0. CRM archiveState complete, private Drive-Datei 1kiOwXzXKdd1Hn7S4pHLUgklhoc9QDyiw. Worker bestätigt den tatsächlichen Byte-Hash vor diesem Abschlussstatus. Damit ist die Kette echte Codeanmeldung → ausdrückliche Testzustimmungen → dauerhafter CRM-Nachweis → verifizierte private Archivablage vollständig durchlaufen. Kein neuer Versand, keine produktive Annahme und keine Auftragsbestätigung ausgelöst.
