# LSZH Automations MVP – Technisches Onboarding-Audit (14.10.2026)
**Status: STAGING/Review; keine produktive Aktivierung, Kundeneinladung, E-Mail oder Vertrag.**

## Prüfgrundlage / Nachweise

Direkt geprüft: Make-Szenarien 7777695 (Webhook), 7835639 (Linkmail), 7936151 (Make-Einrichtungsanleitung), 7936546 (interner Zugriff-Reminder), 7779983 (Angebot zu Kunde/Auftrag); Airtable Base appzJiskpAdaR1HEv (Kunden-Onboarding, Aufträge, Kunden, Verbindungen und Leads); im Draft-PR #4 liegende Website-Dateien \`onboarding/index.html\`, \`server.js\` und neue Node-/Playwright-Mocks.

Im Airtable sind **vier synthetische Onboarding-Einträge** mit Auftragsverknüpfung vorhanden, zu drei stornierten Testaufträgen und einem abgeschlossenen Testauftrag. Die vier Projektcodes sind im geprüften Bestand verschieden. Das beweist vorhandene **Testdaten und Verknüpfungen**, aber nicht vollständige operative Onboarding-Abwicklung.

Die verbundene Make-API liefert nur die LSZH-eigene Organisation (ID 7700421, Team 1728770). Sie zeigt **keine Kundenorganisation**, keine echte Einladung an \`lars@lszh-automations.ch\` und keine berechtigte Mitgliedschaft in einem Kunden-Team. Daher dürfen Felder wie «Einladung versendet» ausschliesslich als **Kundenangabe**, nicht als verifizierte Einladung oder Zugang interpretiert werden. **«Make-Zugriff bestätigt» ist in allen vier geprüften Aufträgen nicht gesetzt.** Make-Abonnement, Region, Rechnungsbeziehung und Organisation müssen beim jeweiligen Kunden verbleiben.

## Tatsächlich umgesetzt

1. **Website (nur GitHub-Draft):** \`onboardingValidation.js\` prüft kanonischen \`ob_UUID\`-Token, erlaubte Make-Kontostände und Einladungsstatus, E-Mail-Syntax, Längen, Pflichtdaten. Der Server verwirft nicht definierte Felder und bestätigt nur gültige Airtable-Record-ID nach erfolgreichem Make-Webhookspeicherbeleg. Ohne Beleg liefert er 202/Pending. Auf unklare Provider-/Make-Fehler folgt eine kurzzeitige Wiederholungssperre; nicht als verteilte atomare Idempotenz missverstehen. Das Formular behält Daten bei Pending und zeigt **keine falsche Speicherbestätigung**.
2. **Persönlicher Link (nur GitHub-Draft):** Token nach dem Laden aus der Adresszeile entfernt; Onboarding-Seite wird mit \`Referrer-Policy: no-referrer\`, \`Cache-Control: no-store\`, \`X-Robots-Tag: noindex\` und restriktiver CSP ausgeliefert.
3. **Make-Werkzeugkette (inaktiv, bestehende Szenarios):** In \`7777695\` ein Code-Modul **13** direkt hinter dem Webhook hinzugefügt, das auch direkte Webhook-Requests unabhängig von der Website prüft, besondere Zeichen für HTML kodiert sowie die Airtable-Kunden-/Auftrags-PATCH-Bodys durch \`JSON.stringify\` absichert. Module **7 und 10** verwenden nur validierte sichere JSON-Bodys; die dynamische HTML-Begrüssung des Mailmoduls **9** verwendet nur entwertete Felder. **Kundenrechnungsadresse** aus Modul 10 wurde vor die HTTP-Speicherbestätigung (Modul 12) verschoben; sie hängt nicht mehr von erfolgreichem Gmail-Versand ab.
4. **Kein produktiver Versand:** Die Gmail-Module \`7777695:9\`, \`7835639:4\`, \`7936151:3\`, \`7936546:2\` tragen zusätzliche zwingend unmögliche Filter \`0=1\`, obwohl alle vier Szenarios ohnehin **inactive** sind. Die Kunden müssen reale Einladungen selbst nach authentifiziertem Make-Login versenden; kein automatischer Invite-Aufruf implementiert. **Sendefilter nur nach bewusster Go-Live-Freigabe** und separatem Empfängertest entfernen.
5. Make-Szenario \`7777695\` auf sequenzielle Ausführung konfiguriert (Patch angewendet; ohne aktivierte Webhook-Ausführung noch nicht empirisch bestätigt).
6. Die Datenschutz-Aufgabenfilterung in \`7777695:8\` schliesst nun **«Ja» und «Unsicher»** ein.

## Testabdeckung (keine Live-Aktionen)

- \`test/onboarding-validation.test.js\`: Lokaler Node-Webserver und **nur lokaler** Mock-Webhooks. Überprüfung confirmed 200, pending 202, duplicate 409, ungültige Formulardaten 400, Upstream-Fehler 502, Wiederholungsversuch nach unklarem Fehler 409. Kein Aufruf einer Make-Produktivadresse.
- \`test/onboarding-make-safety.test.js\`: Make-JS-Sicherheitslogik lokal mit synthetischen Daten ausgeführt: Token- und Auswahlvalidierung, HTML-Sonderzeichen, sichere JSON-Bodies mit Quotes und Zeilenumbrüchen, fehlende Werte abgewiesen.
- \`test/browser/onboarding-form.spec.js\`: Echtes Chromium in Desktop-/Mobilansicht gegen lokal gestarteten Website-Server und Mock-Make-Endpunkt. Vollständiges synthetisches Formular, Pending/Confirmed, Hinweise zur Einladung an \`lars@lszh-automations.ch\`, No-Referrer/No-Cache/No-Index und Tokenentfernung. **Zwei verschiedene synthetische Token**, damit der zweite Test nicht als berechtigte Dublette abgewiesen wird.
- Zusätzlich frühere Website-Lead-, PDF-Archiv- und Online-Annahme-Tests.

**Testgrenze:** Ohne Make-Szenario-Aktivierung ist eine reale Make-Webhook→Airtable→Kundenkonto→Make-Kundeneinladung End-to-End-Simulation nicht ausführbar. Es wurden keine neuen CRM-Testsätze und **keine** echten Einladungen erstellt; vorhandene vier rein synthetische Fälle wurden nur lesend geprüft.

## Noch offene, echte MVP-Blocker

| P | Risiko/Gate | Weiteres Vorgehen |
|---|---|---|
| P0 | **Kein bestätigter Zugang zu einer Kundenorganisation** | Erst wenn Kunde selbst eingeladen hat: Einladung in Make unter genau dieser Kundenorganisation und dem richtigen Team, Rolle (Org/Team Member statt Owner) und Status von LSZH überprüfen; nicht allein anhand Airtable-Status |
| P0 | **Keine echte elektronische Vertragsfreigabe** | RC1-Projektbedingungen und AVV rechtlich freigeben; vor realem Auftrag erst tatsächliche Zustimmung und Datenschutz-Vereinbarungen nachweisen |
| P0 | **Schreibzugriff/Idempotenz nicht unter Last getestet** | Inaktiv belassen bis kontrollierter isolierter Make-E2E-Test ohne Gmail/Status-Nebenwirkungen möglich; atomare Dublettensperre / Wiederaufnahme nach Crash prüfen, da Vorab-Suche + Create nicht atomar ist |
| P0 | **Datenschutz-Aufgabe wird nach gesperrtem Mailmodul erreicht** | Modul \`7777695:8\` befindet sich weiterhin nach Mail \`9\`; «Ja» oder «Unsicher» muss später unabhängig vom Mailer einen Review erzeugen. Router/reihenfolgeschonendes Refactoring mit zusätzlichem Test vor Go-Live nötig |
| P1 | **Getrennte Make-Organisation und Kundenverbindungen** | Nur offizielle, delegierte OAuth-Freigaben in Kundenorganisation; keine Make-Keys, Logins oder MFA-Codes über Formular/Airtable, keine Kunden-Org unter dem LSZH-eigenen Make-Konto annehmen |
| P1 | **Keine echte Browser-/Render-Publikation** | GitHub PR #4 ist Draft, \`main\` nicht geändert. Echte mobile Safari/Render-Staging-Abnahme separat erforderlich |
| P1 | **Alte Testdaten widersprüchlich** | Ein abgeschlossener Testauftrag ist mit historisch abweichender Firmenbeschreibung verknüpft; nicht als Kundenbeleg oder Beweis einer echten Make-Einladung verwenden |

## Nächste Freigabeprüfung

Vor Entsperren von Make und E-Mail prüfen: synthetischer Reihenfolge-/Dubletten-/Fehlertest auf inaktivem Kundenstaging ohne Versand, sensible Daten ohne Mailer prüfen, echte Kundenorganisation und Einladung authentifiziert einsehen, eigene technische Zugriffsberechtigung minimal halten, Sicherheits-/Datenschutz- und Vertrags-Approval abschliessen. Erst danach eine **ausdrückliche** Produktivfreigabe. Keine menschliche Freigabe durch ein einzelnes Airtable-Feld simulieren.
