# Signature-Success nach gespeicherter Kundenannahme

Stand: 28.10.2026. **Live aktiviert und erfolgreich nachgeprüft.**

## Ausgangslage und Umfang

Die Online-Vertragsannahme und C3.7.2 funktionieren bereits. Massgeblich sind der Produktionsabgleich vom 26.10., die späteren Live-Manifeste und der Kundenprozess-Audit vom 27.10.; historische offene Punkte im älteren Handoff sind keine aktuellen Defekte. Basis dieser isolierten Änderung ist `4bc05f381af9b4627ed019985c214ff55b94d6f5`, gestapelt auf `fix/project-task-start-readiness` / PR 45. Nicht nach `main` zusammenführen: Die öffentliche Website verwendet dort einen anderen Entwicklungsstand.

Geändert sind ausschliesslich HTML, CSS und Browser-JavaScript der Annahmeseite, in der Portalquelle sowie deren bestehender CRM-/Demokopie. Die Geschäfts-, Status-, Vertrags-, Authentifizierungs-, Archiv-, Firestore-, Zahlungs-, Webhook- und E-Mail-Logik bleiben unverändert. C3.7.2, Mailcutoff, Cloud-Konfiguration und Versandfreigaben werden nicht angefasst. Kein E-Mail-Code angefordert, keine automatische E-Mail und kein echter Annahmeklick ausgeführt.

## Darstellung und Auslösebedingung

- Vor der Serverantwort: dezenter Speicherhinweis, gesperrter Annahmeknopf und `aria-busy`. Bestehender Request und Zustimmungsinhalt unverändert.
- Erfolg ausschliesslich nach erfolgreicher HTTP-/JSON-Antwort mit `state=customer_response_recorded`, nicht leerer Nachweisnummer und gültigem Speicherzeitpunkt. Kein Erfolg durch Klick, Timer, lokalen Speicher oder wieder geöffneten Link.
- Dunkles LSZH-Icon, dezenter blauer Ring, gezeichnetes Häkchen, einzelner Lichtimpuls und weich eingeblendete Bestätigung. Gesamtablauf 2,6 Sekunden, keine Wiederholung, kein Konfetti.
- Titel im Kundenmodus: «Vertrag erfolgreich angenommen!». Testmodus behält seine ausdrückliche Testbezeichnung und den Hinweis auf ausbleibende Geschäftswirkungen.
- Dank, Nachweisnummer, bestätigter Speicherzeitpunkt und nächster Schritt: interne Prüfung, danach Abstimmung der Projektvorbereitung. Schriftliche LSZH-Auftragsbestätigung bleibt ausdrücklich separat. Kein behaupteter Projektstart, keine Prozessstatusanzeige und kein erfundener Vertragslink.
- Nach Erfolg bleibt die Formularübermittlung gesperrt. Fehler, unvollständige Antworten und verlorene Bestätigungen zeigen keine Animation. Bestehende serverseitige Einmalsperren bleiben wirksam.
- Mobil geprüft bis 320 Pixel. Semantische Überschrift mit Fokus nach Erfolg, Statusmeldung beim Speichern, dekorative SVGs ausgeblendet für assistive Technik. `prefers-reduced-motion: reduce` deaktiviert sämtliche neuen Animationen und weiches Scrollen. Kein Anspruch auf einen vollständigen unabhängigen Screenreader-/WCAG-Audit.

## Branding-Herkunft

Das Icon stammt unverändert in seinen Pfaden/Farben aus dem bereits vorhandenen Brandingpaket vom 28.10., `svg/lszh-icon-dark.svg` (Logoauswahl 2B). SHA-256 der Quelldatei: `80d199ae636a9e07361c2625d1bdfe1f9be08cebba552b6bfce8df0a0beebd1b`. Nur SVG-ID und Einbindungsattribute angepasst. Das Brandingpaket beschreibt diese SVGs als Rekonstruktionen der gewählten Vorlagen, nicht als ursprüngliche Designer-Master. Keine neue Logoidee und keine Bildgenerierung.

Das SVG ist direkt im HTML eingebunden. Dadurch sind keine neuen öffentlichen Dateirouten, externen Ressourcen, Abhängigkeiten oder Änderungen an der bestehenden Content-Security-Policy erforderlich. Der bestehende Portalheader bleibt erhalten.

## Prüfungen

- **553/553 CRM-Tests**, darin 14 neue Prüfungen beider Browserdateien: verzögerte Speicherung, Doppelübermittlung, gesperrte Wiederholung nach Erfolg, unveränderter POST-Inhalt, fehlende/ungültige Receipts, Netzwerkfehler und Reload.
- **32/32 vorhandene Portalregressionen** gegen die getrennte Portalquelle.
- **101 historische Produktionsdateien** über `production-2026-10-26` unverändert nachgewiesen; JavaScript-Syntaxprüfung erfolgreich.
- **8/8 Edge-Browserszenarien** mit realem lokalen HTTP-Handler, synthetischen Dokumenten und ausschliesslich im Arbeitsspeicher gespeicherten Testnachweisen: Desktop 1440 px, Mobil 390 px, schmal 320 px, Testmodus, reduzierte Bewegung inklusive Tastaturauslösung, HTTP-Fehler, unbestätigte Antwort und verlorene Bestätigung nach Speicherung. Jeweils genau ein POST, keine JavaScript-Fehler. Erfolgspfade zusätzlich mit Reload und erneut geöffnetem verbrauchtem Link geprüft. Keine zweite Speicherung.
- Desktop- und Mobil-Screenshots visuell geprüft: kein horizontaler Überlauf, lesbarer Nachweis, Logo korrekt und Erfolgskarte ohne die vorherige Prüfeinleitung.
- Die eingeschränkte Ausführungsumgebung blockierte zunächst lokale HTTP-Verbindungen. Der vollständige Lauf mit zugelassenen lokalen Verbindungen bestand. Fehlende Testabhängigkeiten wurden aus dem bestehenden Lockfile installiert; keine Abhängigkeitsänderung.

Lokal reproduzieren:

```text
npm ci --prefix crm-v2 --ignore-scripts --no-audit --no-fund
npm test --prefix crm-v2
node scripts/test-production-portal.cjs
node scripts/verify-production-baseline.cjs --ref production-2026-10-26
node scripts/test-signature-success-browser.cjs
```

Für den letzten Befehl muss Playwright verfügbar sein; standardmässig wird installiertes Microsoft Edge verwendet. `SIGNATURE_BROWSER_CHANNEL=chromium` wählt alternativ einen installierten Playwright-Chromium. Die lokale Vorschau startet mit demselben Skript und `--serve`: ausschliesslich Loopback, synthetische Unterlagen, simulierte Identität, Testmodus und flüchtige Speicherung. Keine Cloud-Zugangsdaten erforderlich.

Lokale Ergebnisse und Screenshots: `output/signature-success-20261028/`. Browserergebnisse und der lesende Live-Abgleich sind zusätzlich im [Prüfmanifest](../releases/signature-success-preview-20261028.json) festgehalten.

## Vorbereitungsstand vor Live-Freigabe (historisch)

Die produktiv ausgelieferten Dateien `/acceptance.js` und `/acceptance.css` wurden am 28.10. mit HTTP 200 geladen und stimmen mit der unveränderten Repositorybasis überein (Zeilenenden normalisiert). `/api/health`: HTTP 200, `ok=true`, `mode=customer`; `/api/acceptance` ohne Token: HTTP 404. Die zunächst angefragte Route `/health` existiert nicht; dies ist kein Funktionsfehler.

Der Cloud-Verwaltungszugang verlangt eine erneute Anmeldung. Deshalb konnte die aktuelle Revisions-/Verkehrszuordnung nicht unabhängig neu gelesen werden. **Kein Cloud-Build, kein Cloud-Run-Deploy, kein Staging-Deploy und keine Traffic-Umschaltung durchgeführt.** Die lokale Vorschau ist kein Cloud-Staging-Nachweis.

Der Benutzer hat am 28.10.2026 die Veröffentlichung dieser Änderungen samt Dokumentation im öffentlichen GitHub-Repository und das Erstellen eines Entwurfs-PR ausdrücklich freigegeben. Diese Freigabe umfasst keine Produktivbereitstellung oder Traffic-Umschaltung.

Ein Portal-Quellpaket wurde mit dem bestehenden `prepare-make-requirements-source.cjs` lokal vorbereitet. Es enthält die bisherigen Laufzeitdateien und diese drei UI-Dateien; keine neue Laufzeitlogik. Vor einem späteren Release zunächst Cloud-Anmeldung und aktuelle Portalrevision/Quellarchiv erneut lesend prüfen, dann exakt drei UI-Dateien über den aktuellen Portalstand legen und die übrigen Laufzeitdateien bytegleich erhalten. Aktuelle Secrets, Dienstkonto, IAM, Ursprungsschutz, Scheduler und Verkehr erhalten. Den bestehenden festen Hostschutz nicht für eine Vorschau lockern. Erst nach dem bestehenden getrennten Release-Verfahren und ausdrücklicher Live-Freigabe umschalten. Kein pauschaler CRM-Neudeploy für diese Portalergänzung.

Rollback betrifft nur die drei Portal-UI-Dateien bzw. die unmittelbar vorher verifizierte kompatible Portalrevision. Niemals Claims, Nachweise, Einladungen oder Versanddaten zurücksetzen. Keine Mails oder alten Ausführungen wiederholen.


## Live-Status am 28.10.2026

Nach ausdrücklichem Benutzerauftrag «schalte es live» wurde die geprüfte Erfolgsansicht zunächst ohne regulären Kundenverkehr bereitgestellt und anschliessend live aktiviert. Alle 27 Quelldateien wurden mit dem getesteten Paket bytegleich abgeglichen; ausschliesslich die drei UI-Dateien unterscheiden sich vom vorherigen Portalstand. Alle 46 Prüfungen gegen das konkrete Releasepaket bestanden.

Die produktiv ausgelieferten HTML-, CSS- und JavaScript-Dateien entsprechen exakt dem geprüften Paket. Portalgesundheit und Zugriffsschutz wurden nach der Umschaltung erfolgreich geprüft. Geschäftslogik, Konfiguration, Zugriffsrechte und Archivplanung bleiben unverändert. Keine neue Kundenannahme und keine E-Mail durch die Releaseprüfungen ausgelöst. Die historischen Hinweise auf fehlende Anmeldung oder ausstehende Liveschaltung sind durch diesen Live-Nachtrag überholt. Der detaillierte technische Release-Nachweis bleibt lokal gespeichert.
