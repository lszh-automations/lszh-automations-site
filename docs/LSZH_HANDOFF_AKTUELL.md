# LSZH Automations – verbindliche Chat-Übergabe

**Zuletzt fachlich geprüft (UTC-Datum): 2026-10-18**
**Dokumenttyp:** Kurzstand; manuell anhand der unten verlinkten Quellen validiert, kein automatisch verifizierter Go-live.
**Geltungsbereich:** LSZH-Automations-MVP, ohne späteres Cockpit V2 oder alte Sanitär-OS-Module.
**Fertigstellungsgrad:** ca. 73 % (qualitative Schätzung, KEINE Produktionsfreigabe).

> STARTREGEL: Neue Chats lesen zuerst diese Datei und vergleichen die angegebenen GitHub-Branches mit den neuesten realen Quellen. Ein älterer Stand aus main oder einer historischen Projektnotiz überschreibt niemals neuere bestätigte Ergebnisse. Ist die Lage widersprüchlich, zunächst nur lesen und klären.

## Stand

- **Live-Website:** Render-Webdienst lszh-automations-site auf Branch main; öffentliche /onboarding/ und /make-start/ wurden mit HTTP 200 geprüft. Ein GET beweist keine funktionierende Datenspeicherung.
- **Airtable:** LSZH Automations – Website CRM ist derzeit zentrale Geschäftsdatenbasis (Kunden, Aufträge, Onboarding, Offerten, Rechnungen usw.). Aktive Airtable-Automationen können schon bei Testdatensätzen Nebenwirkungen auslösen.
- **Make:** Die produktionsnahen LSZH-Onboarding-/Offerten-/Mailprozesse sind nach letzter Prüfung inaktiv; der externe Versand und die Vertragsannahme haben harte Sperren. Zwei aktive andere Make-Szenarien sind NICHT Teil des MVP.
- **Offerten:** Entwicklungsbranch mit Portal, Archivprüfungen und synthetischen Tests vorhanden; PR #5 ist Draft und nicht mit main zusammengeführt. Die temporäre Cloud-Run-STAGING-Prüfung hat authentifiziert vier synthetische PDFs im geschäftlichen Drive inklusive Integrität und gesperrter GET-/POST-Routen erfolgreich geprüft. Das ist keine produktive Freigabe.
- **Onboarding-Benachrichtigungen:** Im separaten Entwicklungsbranch ist ein einziger kompletter *synthetischer* Cloud-Run/Airtable/Firestore/privater-Receiver-Test mit REVIEW_ONLY-Status erfolgreich gelaufen. Keine Mail, kein Vertrag. Der einmalige Job darf NICHT erneut ausgeführt werden.
- **Rechnungen:** Swiss-QR-STAGING und PDF-Vorprüfung existieren; produktive Freigabe und Versand nicht belegt.
- **Recht:** Projektbedingungen und AVV RC1 nur intern/provisorisch vorbereitet; abschliessende inhaltliche und juristische Freigabe sowie echte Kundenannahme fehlen.
- **Secure Transfer:** Alte Make-Gateways deaktiviert, heutiger Kernprozess nutzt sie nicht. Render-PostgreSQL lszh-secure-transfer läuft nur bis 07.11.2026 kostenlos; Verwendung für MVP nicht erkennbar, Datenbankinhalt wegen gesperrten SQL-Zugriffs nicht abschliessend geprüft. Keine Löschung, vor Auslaufen Bestand/Export klären.
- **Cockpit V2:** Nur Folgeprojekt, keine aktive Implementierung und kein Bestandteil der MVP-Prozentzahl.

## Verifizierte Ergebnisse

1. 17.10.: Einmaliger synthetischer Onboarding-Outbox-Handoff meldete PASS_SYNTHETIC_SOURCE_E2E_REVIEW_ONLY; Firestore-Readback und privater Empfänger bestätigten REVIEW_ONLY, keine Kundenbenachrichtigung.
2. 18.10.: Temporäre Cloud-Run/Google-Drive-Leseprüfung: vier synthetische PDFs, SHA-/Dateikontrolle und absichtlich gesperrte HTTP-Routen bestanden. Nur STAGING, keine Kunden.
3. 18.10.: Offerten-Branch dokumentiert eine IAM-Ancestor-/Deny-Inventur und selektive Prüfung der Quarantäne-/Angebotszugriffe. Dies ist kein umfassender Nachweis aller effektiven Rollen und keine Produktionsgenehmigung.
4. Haupt-/STAGING-Portale und Make wurden lesend inventarisiert. Die fachlichen End-to-End-Prozesse Offerte → Annahme → Onboarding → Rechnung sind nicht komplett freigegeben.

## Aktive Arbeitszweige

| Bereich | Aktuelle massgebliche Quelle | Verwendung |
| --- | --- | --- |
| Öffentliche Website | main | Live-Code; Projektdokumentation in main teilweise veraltet |
| Offerten / Annahme / Drive | feature/optional-avv-acceptance-staging-20261014 | Aktuellere Offerten- und Pilot-G1–G7-Befunde, Draft PR #5 |
| Onboarding / Outbox / Firestore | feature/onboarding-notification-outbox-20261016 | Separate Onboarding-Historie und bereits verbrauchte One-Shots |
| Übergabe / Chat-Regeln | feature/chat-handoff-20261018 | Dieser Stand und automatische Struktur-/Aktualitätsprüfung; erst nach Review auf main |

**Nach jedem Chatwechsel:** Zuerst Handoff aus dem Branch lesen, der die neueste *freigegebene* Version enthält; vor Merge dieses Übergabe-PRs ausdrücklich feature/chat-handoff-20261018 verwenden. Neueste Branch-Commits und Deploymentstände neu überprüfen, ohne Tests zu wiederholen.

## Offene Freigabegates

- **G1 Sicherheit:** Cloud-IAM, geerbte Rollen, Drive-Dienstkonto und Produktionsarchitektur abschliessend bewerten. Zuletzt wurden wesentliche Isolationen getestet; das ist noch kein Gesamt-GO.
- **G2 Recht:** RC1 AVV/Projektbedingungen endgültig geschäftlich und rechtlich prüfen/freigeben.
- **G3 Angebotsannahme:** Sichere einmalige Annahme, konsistente Airtable/Firestore/Drive-Verarbeitung sowie Wiederanlauf kontrolliert und *zusammenhängend* synthetisch prüfen.
- **G4 AVV Ja/Nein:** Beide Pfade inklusive Belege ohne Kundenmails vollständig testen.
- **G5 Mail:** E-Mail-Inhalte, Anhänge, Zustellung und Freigaben gesondert abnehmen.
- **G6 Rechnung/QR:** Vollständige Rechnungserstellung, Betrags-/Zahlungsdaten und Ausdruck abnehmen.
- **G7 Produktivbetrieb:** Pilotbetrieb, Rollback, Monitoring, Kundeneinladungen und Go-live explizit genehmigen.

## Nicht wiederholen

- Cloud-Run-Execution **lszh-quarantine-source-e2e-staging-slhkc** (17.10.2026, synthetischer Source→Outbox→Quarantäne-Receiver, PASS). **Nie wieder starten, bauen oder Staging-Fixture erneut anlegen**, ohne neue, getrennt genehmigte Teststrategie.
- Einmalige Airtable-Lesejobs und Firestore-STAGING-Schreibproben sowie der Quarantäne-IAM-V2-Lesetest sind historisch verbraucht. Ein neues Chat-'Vamos' gibt **keine** Genehmigung für Wiederholung, Zurücksetzen von Once-Markern oder zusätzliche IAM-Zuweisung.
- Erfolgreiche reine synthetische Offline-/Drive-Tests nicht ohne begründete Codeänderung oder neues Abnahmekriterium in neuen Varianten nachbauen.
- Bereits erfolgreiche Prüfungen bleiben gültig *für exakt den damals getesteten Stand*; bei geänderter Implementierung neu bewerten, nicht blind als produktiv übertragen.

## Genau ein naechster Schritt

**Fokus: Offerten-Pilot-G3 (sichere Annahme) – ohne Live-Mutation.** Auf feature/optional-avv-acceptance-staging-20261014 den *aktuellsten* Pilot-G1–G7-Stand lesen, bestehende Offerten-/Firestore-/Airtable-/Make-/Drive-Tests gegen die tatsächlich noch offene G3-End-to-End-Kette abgleichen und nur den kleinstmöglichen fehlenden synthetischen Integrationsnachweis planen bzw. offline implementieren. **Nicht** einen neuen Quarantäne-/IAM-Unterbau entwickeln, wenn bestehende Teile bereits funktionieren. Erst nach klarer testbarer Lücke handeln. Kein Merge/Deployment/Live-POST ohne separate Freigabe.

## Sicherheitsgrenzen

- Keine produktiven E-Mails, externen Einladungen, Vertragsannahmen, Aktivierungen oder Echtkundendaten ändern ohne ausdrückliche Zustimmung.
- Keine Cloud-IAM-/Secret-/Datenbank-Rechteänderung oder echte Cloud-Schreibtests ohne separate präzise Genehmigung.
- Keine einmaligen Jobs erneut starten, keine Once-Marker löschen, keine historischen Artefakte vernichten.
- Alles für LSZH im **geschäftlichen** Google-Konto/Drive; keine neuen produktiven Daten im privaten Konto.
- Secrets, Projektcodes, personenbezogene Kundendaten, Token und Private Keys weder in diese Datei noch GitHub/Chat/Logs schreiben.
- Änderungen an main lösen Website-Autodeploy bei Render aus; Handoff zuerst nur in Draft-PR vorbereiten.

## Quellen und Verifikation

- Offerten-Stand: https://github.com/lszh-automations/lszh-automations-site/blob/feature/optional-avv-acceptance-staging-20261014/docs/LSZH_AUTOMATIONS_PROJEKTSTAND.md
- Pilot-Gates: https://github.com/lszh-automations/lszh-automations-site/blob/feature/optional-avv-acceptance-staging-20261014/docs/LSZH_OFFERTEN_PILOT_FREIGABEMATRIX_20261018.md
- Onboarding/Quarantäne-Stand: https://github.com/lszh-automations/lszh-automations-site/blob/feature/onboarding-notification-outbox-20261016/docs/LSZH_AUTOMATIONS_PROJEKTSTAND.md
- Ausgangs-Website: https://github.com/lszh-automations/lszh-automations-site/tree/main
- Prüfmethode: aktuelle Heads und Umgebungszustand nur lesend nachprüfen; Testbelege gelten für die jeweils dokumentierte Revision. Die GitHub-Aktion prüft automatisiert die Vollständigkeit dieser Übergabe und meldet Branch-Aktualisierungen, erstellt aber **keine** Geschäftsentscheidungen oder produktiven Freigaben.

## Übergabe-Disziplin

- Vor Ende jeder grösseren Aufgabe diese Kurzdatei **im eigenen Arbeits-/PR-Branch aktualisieren**, mit Quelle, letztem nachweislichem PASS/STOP, genau einem nächsten Schritt und ausdrücklich erledigten bzw. noch offenen Gates.
- Nur neue bestätigte Tatsachen eintragen, Historie im jeweiligen Projektstand belassen; alte Abschnitte nicht kopieren.
- Im neuen Chat mit einer maximal fünf Sätze langen Statusprüfung beginnen. Zuerst den bestehenden nächsten Schritt fortsetzen, keine neue Infrastruktur aufgrund von Verwechslung.
- Bei inhaltlicher Unstimmigkeit: keine produktiven Aktionen, zuerst Branch-/Teststand verifizieren.
