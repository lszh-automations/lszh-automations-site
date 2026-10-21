# TEST_ONLY V3 – lokaler Runner und Prüfstand

Stand 21.10.2026. Ausschliesslich interner Test, kein Vertrag und keine Rechnung.

## Abgleich und Umsetzung

Surface C:\Users\larss\Projects\lszh-automations-site: sauberer Entwicklungsbranch feature/optional-avv-acceptance-staging-20261014, HEAD dc8d707. Remote vor dieser Änderung bc073c1. Auf beiden fehlten V3-Dateien. Port 8083 beim Erstcheck ohne Listener.

Runner scripts/internal-test-pilot-v3.mjs basiert auf dem vorhandenen V2-Pfad. Fest: Offerte recq58gMPjQPpNHYQ, Nummer TEST_MANUELL_20261020_V3_NO_CONTRACT, Zweck TEST_MANUELL_20261020_V3, Lead recRucAzmgvPhnNcj, Person Lars Schulthess und lars@lszh-automations.ch. Keine frei wählbaren Records oder Empfänger. Vor Registrierung wird Übernommen=true als Übernahmesperre gesetzt und nachgelesen; Kunde/Auftrag und Produktiv-/Versandfreigaben müssen leer/false bleiben. Kein Rücksetzen dieser Sperre.

Einmalige Record-/Hash-Bindung in lszh_internal_pilot_v3_bindings, bestehende Staging-Offer-Collection und atomarer Portal-Kern; keine Annahme ohne Browserzustimmungen. Getrennte feste Archivordner: Offerte 1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in, Bedingungen 10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko. Vor Start und Annahme werden PDF-Bytes, Hashes, Elternordner und Schreibschutz geprüft. Lokaler Listener nur 127.0.0.1:8083, genaue Host-/Origin-Prüfung, maximal 15 Minuten. Klartexttoken nur im Arbeitsspeicher; kein Token in URL, Datei oder Ausgabe. Wiederstart erzeugt keine zweite Einladung.

## Live-Nachweise und Grenze

Airtable: Entwurf, CHF 1500/99, 30 Tage, gültig bis 20.11.2026, AVV Nein, TEST_v1.0_RC1, Archivstatus VERIFIZIERT; keine Einladung oder Annahme. Offerten-PDF 1mnezAPrC9ynqFR_2z5lcMND4peoCylGK, SHA-256 ed7196404a88c86b5fc973cbf0e9193951b97f1c7b5e84fa405ad55f192cf095. Bedingungen 1yPtsWTeEUclniKFWRM81EHEUMnu1E9nO, SHA-256 baec0946db9b892da86e4009ade769863d5087d8961e16940d0dda420d1bf279. Drive-Connector bestätigt PDF-Typ, Grössen 68091/26544 Bytes und getrennte Elternordner; er gibt Hash-/Schreibschutzfelder nicht zurück. Deshalb keine neue unabhängige Hash-/Schreibschutz-Verifikation behauptet; diese bleibt zwingende Laufzeitprüfung.

Make 8092027 Offertenmail und 8091918 Bestätigung bereits aktiv, 15-Minuten-Zeitpläne, feste interne Adresse ohne CC/BCC, feste Hashes, native Reservierungen vor Gmail. Nichts aktiviert oder geändert. Letzte geprüfte Läufe: Offertenmail 6f4d643fefc14a828b32e50f3adec1f6 (11:44:48 UTC), Bestätigung 61d1ea7d30c4494487f787a0d58c1b15 (11:43:33 UTC): je success, eine Operation, keine neue Mail/kein Beleg. Keine Replay-Ausführung.

Start aus Sandbox: windows_private_vault_failed_no_secret_output. Start ausserhalb unter Surface-13-Pro\larss: oauth_request_rejected_token_400. Der Tresor wurde geladen, Token-Erneuerung abgelehnt; genauer Grund unbekannt. Keine Secrets ausgegeben. Kein Cloud-Schreibzugriff, keine Registrierung, Annahme, Mail oder Listener aus diesen Startversuchen.

## Fortsetzung

Im bestehenden Surface-Projekt nach Fast-forward auf diesen Branch: node .\scripts\internal-test-pilot-v3.mjs --start. Vorher muss die bestehende Desktop-OAuth-Geschäftsanmeldung kontrolliert erneuert werden. Client-JSON und Token niemals in Chat oder Git. Der vorhandene --authorize-Modus in cloud-run/offer-portal-staging/internalRecoveryLocal.mjs überschreibt absichtlich keinen vorhandenen Tresor; nicht blind erneut aufrufen oder den Tresor löschen. Bestehenden verschlüsselten Tresor vor einer kontrollierten Erneuerung privat erhalten. Keine neuen Scopes, Make-Verbindungen oder Cloud-IAM-Rechte erforderlich.

Nach READY http://127.0.0.1:8083/offerte-annehmen/ öffnen, beide PDFs prüfen, getrennte Testzustimmungen und feste Person/Adresse angeben. Registrierung kann das bereits aktive interne Offertenmail-Szenario freigeben. Nach echter Browserannahme Firestore/Airtable unabhängig abgleichen, dann bestehenden einmaligen Make-Beleg-/Bestätigungslauf prüfen. Bei unklarem Ergebnis kein Replay und keine neue Einladung. Nach Abschluss TEST_ONLY-Zeitpläne kontrolliert beenden. Kein Kunden-/Auftrags-Onboarding aktivieren.

## Offline-Prüfung

303 Tests: 296 bestanden, 7 übersprungen, 0 Fehler. Sieben V3-Fälle prüfen tatsächlichen Browser-Antwortparser, Preisprojektion, einmalige Annahme bei Konkurrenz, falsche Records/Empfänger/Zwecke, fehlende Zustimmungen/Hashabweichungen, CRM-Sperren und geänderte Angebotswerte. Offline-Nachweise ersetzen keine Live-Browserannahme.
