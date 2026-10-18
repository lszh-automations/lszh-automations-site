# LSZH Automations – aktueller Projektstand

Stand: 19.10.2026 (Europe/Zurich). Einmalige synthetische Cloud-Annahme inklusive unabhängigem Firestore-/Airtable-Readback vom Betreiber per Cloud-Shell-Ausgabe bestätigt.

## Verbindliche Übergabe – hier weiterarbeiten

**Ziel:** Einen vollständigen Offertenprozess für einen KMU fertigstellen: Offerte → private PDFs → getrennte Online-Zustimmungen → Annahmenachweis → Airtable → Make-Beleg und Bestätigung. Beide Varianten AVV Ja/Nein müssen funktionieren.

**Letztes abgeschlossenes Ergebnis:** Cloud Run → Firestore → Airtable → Make-Beleg für die synthetische Offerte `TEST_CLOUD_E2E_20261018_NO_CONTRACT` (AVV Nein) live bestanden. Nach erfolgreicher einmaliger Portal-Annahme und unabhängigem Firestore-/Airtable-Readback lief Make-Szenario `7940220` am 19.10.2026 um 01:08 Zürich erfolgreich: Execution `6f4a6b7254454e9688a7dd2fa98d8437`, 13 Module, keine Modulfehler. Aktivierung startete den Lauf automatisch; zusätzlicher Run-Aufruf wurde wegen laufender Ausführung abgewiesen, kein zweiter Lauf gestartet. Szenario anschliessend wieder deaktiviert. Gmail und Versanddatums-Modul wurden nicht ausgeführt.

**Belegnachweis:** [TEST_ONLY-PDF im Geschäfts-Drive](https://drive.google.com/file/d/1Cdf0_5_80zB867lDP4AooNn1IKiB5Hzv/view), direkt im Geschäfts-Testordner `10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko`. PDF-Text unabhängig gelesen: Testkennzeichnung, Offertennummer, Person, E-Mail, Annahmezeit `2026-10-18T23:03:30.355Z`, Version und beide Quell-PDF-Hashes stimmen. Airtable unabhängig gelesen: Status Angenommen und exakt diese Beleg-ID; kein Versandzeitpunkt, Bearbeitungsflag leer/false. Make-Detailein-/ausgaben waren über das Plugin nicht verfügbar; Nachweis deshalb durch Laufstruktur plus direkte Drive-/Airtable-Abfrage. Keine visuelle PDF-Layoutprüfung durchgeführt.

**Nächste Arbeit:** AVV-Ja-Seed vom Betreiber am 19.10. bestätigt: exakt ein Firestore-Testangebot plus Quellindex atomar erstellt und zurückgelesen, Token nur lokal. Seed **nicht wiederholen**. Bereit stehen `offer-browser-synthetic-avv-release.py --apply`, `offer-browser-synthetic-avv-preview.py` und `offer-browser-synthetic-avv-accept-once.py --accept-once` für einen Shell-Block mit Fehlerabbruch. Release baut Source `e09a5b27ff105e0d3e1c2b6a9e3aa677bf05c4c0`, ersetzt Tag `cloud-e2e` von `00008-json` auf `00009-avv` mit 0 % regulärem Traffic und verwendet bestehende Identität/Secrets. Demo bleibt bei 100 %, Originalportal unverändert. Preview prüft AVV Ja, exakte Version und alle drei PDF-Hashes; Accept sendet höchstens einen POST mit ausdrücklicher AVV-Zustimmung und liest Firestore/Airtable unabhängig zurück. Bei unklarer Antwort kein POST-Retry. Noch kein AVV-Ja-Deployment, Preview oder Accept live ausgeführt. Danach vorhandenen Make-Beleg `7965223` für diesen Record vorbereiten/ausführen.

**Prüfnachweis:** [CI 39175755576](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39175755576) zum gepinnten Source: alle vier Jobs SUCCESS (Validierung, Image, echte Functions-Framework-/Firestore-Emulatortests, Chromium). Neue Operator-Skripte zusätzlich lokal: 12 Python-Tests PASS, einschliesslich AVV-Zustimmung/Hash/Version, kein POST-Retry und kein regulärer Trafficwechsel.

**Konkreter offener Nachweis:** Vollständiger AVV-Ja-Durchlauf, Bestätigungsweg und endgültige Kundenunterlagen. Temporäre Cloud-Testrevisionen/Secret-Rechte noch bereinigen. Ausgangskonfiguration von Make: [Snapshot](evidence/make-receipt-7940220-before-synthetic-20261019.json).

**Nicht wiederholen:** Erfolgreiche Testannahme, Firestore-Seeder, separaten Airtable-Schreibtest, bestandene Drive-Diagnose oder bereits getroffene Geschäftsentscheide. Neue Prüfung nur bei verändertem Zustand oder konkretem Fehler.

Arbeitsbranch: `feature/optional-avv-acceptance-staging-20261014`. [PR #5](https://github.com/lszh-automations/lszh-automations-site/pull/5) ist offen, Draft und ungemergt. Der Stand hier beschreibt Entwicklungsarbeit, keinen veröffentlichten Kundenbetrieb.

## Umfang und feste Entscheidungen

- LSZH Automations: Beratung, Entwicklung, Einrichtung, Tests, Dokumentation und optionale Betreuung für Schweizer KMU.
- Kunden besitzen ihre eigene Make-Organisation und bezahlen Make-Pläne/Credits direkt. LSZH verrechnet Dienstleistungen und Betreuung.
- Erstkontakt und Offerte benötigen kein Make-Konto. Registrierung, Einladung und technische Verbindungen folgen im Kunden-Onboarding nach Annahme.
- Möglichst OAuth und gezielte Rollenfreigaben im Kundenkonto; keine Kundenpasswörter per Mail oder Airtable.
- Für Projektdateien ausschliesslich geschäftliches Google Drive.
- Projektbedingungen sind vom Betreiber geschäftlich bereits akzeptiert. Diese Entscheidung nicht erneut abfragen. Endgültige Dokumentfassung, rechtliche Endprüfung und kundenspezifische AVV-Anlagen bleiben vom Geschäftsentscheid getrennt.
- Bestehende Make-Szenarien nutzen. G3/Pub/Sub/Canary ist keine Voraussetzung für die erste nutzbare Online-Annahme und wird ohne konkreten Pilot-Blocker nicht weiterentwickelt.

## Tatsächlicher Umsetzungsstand

| Bereich | Belegt | Noch offen / Testgrenze |
| --- | --- | --- |
| Website und Onboarding | Website, persönliches Onboarding, Make-Konto-/Einladungsfelder und `/make-start/` vorhanden | Vollständige Kundenübergabe, tatsächliche Einladung/Rollen und Mailweg nicht aus dem Offerten-Test ableiten |
| Online-Annahme | Getrennte Zustimmung zu Offerte, Bedingungen und optional AVV; Browser-, HTTP-, Emulator- und Paralleltests vorhanden | Keine rechtswirksame Kundenannahme aktiviert |
| Drive-Dokumente | Echter Portal-Download von Offerte und Bedingungen samt SHA-256-Prüfung live bestanden (AVV Nein); frühere temporäre Leseprobe 4/4 | Vollständiger AVV-Ja-Durchlauf noch offen |
| Firestore | Echte Cloud-Annahme inklusive Person, Zustimmungen und Dokumenthashes unabhängig zurückgelesen | Vollständiger AVV-Ja-Durchlauf noch offen |
| Airtable | Automatischer Callback der echten Cloud-Annahme erfolgreich; Status, Person, Zeitpunkt und PDF-Referenzen stimmen mit Firestore überein | Nachfolgender Make-Beleg und Bestätigungsweg noch offen |
| Make-Beleg | AVV-Nein-Beleg aus echter synthetischer Cloud-Annahme erzeugt, im Geschäfts-Drive archiviert und in Airtable gespeichert; Inhalt unabhängig geprüft | AVV-Ja-Beleg und Bestätigungsweg noch offen |
| Kundenunterlagen | Projektbedingungen als PDF/Google Doc und synthetische AVV samt Anlagen im Geschäfts-Drive vorhanden | Endkontroll-/TEST_ONLY-Dateien sind keine final freigegebenen Kundenverträge |
| Secure Transfer | Dummy-Schlüssel funktional getestet | Keine Produktivfreigabe für reale Kundensecrets; kein zusätzlicher MVP-Pflichtschritt bei OAuth |
| G3-Infrastruktur | Umfangreiche Offline-/CI-Nachweise im Repository | Zurückgestellt; keine G3-Release-/Deploymentfreigabe |

Bei Airtable-Ausfall nach gespeichertem Firestore-Accept meldet der implementierte Callback `manual_review_required`. Firestore-Annahme bleibt bestehen; keine blinde Wiederholung. Airtable GET/PATCH ist keine atomare CAS-Operation: einzige Schreibverantwortung und Umgang mit unklaren Ergebnissen im Pilot beachten.

## Aktueller Cloud-Testfall – erfolgreich synthetisch angenommen

| Referenz | Wert |
| --- | --- |
| Google-Cloud-Projekt | `lszh-automations` |
| Portalservice | `lszh-offer-portal-staging` |
| Firestore Named Database | `lszh-offers-staging` |
| Airtable Base / Offerten-Tabelle | `appzJiskpAdaR1HEv` / `tbljeIUoD7wwKuSmS` |
| Zu verwendender Testrecord | `recensIiczNGsoPeR` |
| Testofferte | `TEST_CLOUD_E2E_20261018_NO_CONTRACT` |
| AVV / Dokumentversion | Nein / `TEST_v1.0_RC1` |
| Direkter Geschäfts-Testordner | `10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko` |

Der Roh-Testtoken gehört ausschliesslich in die sichere lokale Betreiberdatei `lszh_synthetic_cloud_test_20261018_token.txt`, nicht in Chat, GitHub oder Airtable. Datei-Verfügbarkeit vor Nutzung prüfen; hier ist kein Token enthalten. Der ältere separate Airtable-Test `rec4lc9AV5TxRQlcd` ist bereits simuliert angenommen und **nicht** der aktuelle Cloud-Testrecord. Auch das Dokument-/Demo-Paket `OFF-TEST-AVV-20261018-001` ist ein anderer Testfall.

## Vorbereiteter AVV-Ja-Testfall

- Airtable: `recktLXj5wUxLmHFQ`, Entwurf mit Token-Hash; Firestore-Angebot und Quellindex vom Betreiber erfolgreich angelegt/zurückgelesen.
- Offerte: `1-GQyj0cKC4aAJD_9wrxanckCJisEy0nB`, SHA-256 `2dd5c5377461c969b9a436f36999150dc53cf159f02e4985e2f2536b683b004c`.
- Bedingungen: identische synthetische Bedingungen wie im AVV-Nein-Test.
- AVV: `1p2ZRrPuSuaICH9W4N0afK5xt8xeOeKZI`, SHA-256 `53f9deda2000e219f79e0496b33f1e74df8ac00eac09f221b2436c3fd848d060`.
- Offerte/AVV direkt aus Geschäfts-Drive heruntergeladen, SHA-256 lokal berechnet und Text geprüft. Alle Dateien TEST_ONLY, kein echter Vertrag.
- Tokendatei in der Betreiber-Cloud-Shell: `$HOME/lszh_synthetic_cloud_avv_20261019_token.txt`; Inhalt niemals ausgeben.

## Bestehende Make-Strecken

Szenario `7940220` am 19.10.2026 live erfolgreich ausgeführt und wieder deaktiviert; übrige Angaben zuletzt vom 18.10.2026:

| Aufgabe | Szenario-ID | Stand |
| --- | --- | --- |
| Offerten-PDF, Archiv, Versand | `7835460` | Inaktiv; Trigger/Gmail gesperrt, Gmail zusätzlich deaktiviert |
| Annahmelink ohne AVV | `7940261` | Inaktiv; Token-/Mailpfad gesperrt |
| Annahmebeleg ohne AVV | `7940220` | Synthetischer Beleglauf am 19.10. erfolgreich; wieder inaktiv; Mail und Versanddatums-Modul deaktiviert |
| Annahmelink mit AVV | `7965215` | Inaktiv; Token-/Mailpfad gesperrt |
| Annahmebeleg mit AVV | `7965223` | Inaktiv; Claim/Gmail mit `0=1` gesperrt |

## Nächste Schritte und Grenzen

1. **Privater Cloud-Test bestanden (AVV Nein):** Bereitstellung, Leseweg, einmalige Annahme und unabhängiger Firestore-/Airtable-Readback erfolgreich. Nicht wiederholen. Temporäre Testrevisionen und Secret-Rechte noch kontrolliert bereinigen; bestehenden Traffic erhalten.
2. **Belegstrecke vervollständigen:** AVV-Nein-Testbeleg erfolgreich. AVV Ja ebenfalls vollständig nachweisen und Bestätigungsweg fertigstellen. Vor Annahme 2/3 Vertrags-PDFs, danach 3/4 Dokumente inklusive Beleg.
3. **Begrenzten Kundenpilot vorbereiten:** Endgültige PDF-Versionen, konkrete AVV-Anlagen, Kundenroute, Verantwortlichkeiten und Betrieb klären; danach ausdrückliches Pilot-GO.

Bereits genehmigt und erledigt: einmaliger privater Cloud-Run-Staging-Test mit synthetischen Daten, separater synthetischer Airtable-Schreibtest und einmaliger Make-Belegtest. Am 19.10. stellte der Betreiber klar, dass für die weitere synthetische Entwicklungs- und Testarbeit keine wiederholten Freigabefragen nötig sind; im bestehenden Aufgabenrahmen selbstständig weiterarbeiten. **Nicht genehmigt:** echte Kundenverträge/-mails, externe Kundeneinladungen, allgemeine Make-Aktivierung, Main-Merge oder öffentlicher Go-Live. Bestehende Freigaben nicht nochmals pauschal einholen; den Umfang nicht ausweiten.

Cockpit V2, neue Branchenmodule, zusätzliche KI-Funktionen, separate Portale und kosmetische Website-Erweiterungen folgen nach dem nutzbaren MVP. Sanitär-OS-Monteurportal wird nicht weiterverfolgt.

## Dokumentation pflegen

- Dieses Dokument ist die einzige aktuelle Statusquelle. Nach jedem abgeschlossenen Arbeitsschritt betroffene Zeilen **ersetzen**, nicht weitere widersprüchliche Statusblöcke anhängen.
- Übergabe oben aktualisieren: letztes Ergebnis, nächster Schritt, tatsächlicher Blocker, Nachweis und Freigabeumfang.
- Implementiert, offline getestet, live geprüft und produktiv freigegeben ausdrücklich unterscheiden. Prüfdatum nennen; keine alte Live-Prüfung als heute ausgeführt ausgeben.
- Detailnachweise nur bei Bedarf öffnen. Historische NO-GOs und frühere nächste Schritte gelten nicht als aktuelle Arbeitsanweisung.
- [MVP-Fokus](LSZH_MVP_FOKUS_20261018.md) beschreibt Ziel/Abschlusskriterien; [Pilot-Freigabematrix](LSZH_OFFERTEN_PILOT_FREIGABEMATRIX_20261018.md) beschreibt verbleibende Freigabegrenzen. Status nicht mehrfach ausformulieren.

## Testrevision wieder ausser Betrieb nehmen

Nach dem einmaligen Test: exakt Tag `cloud-e2e` entfernen, Testrevisionen `lszh-offer-browser-staging-00007-e2e` und `lszh-offer-browser-staging-00008-json` sowie (nach Bereitstellung) `lszh-offer-browser-staging-00009-avv` jeweils nach 0%-Traffic-Kontrolle löschen und die beiden für diesen Test hinzugefügten Secret-Accessor-Bindungen des Portal-Dienstkontos gezielt entfernen. Alte Demo-Revision, Originalportal, Testnachweise und andere Secrets nicht löschen. Noch kein Cleanup ausgeführt; bei Teilfehlern tatsächlichen Zustand lesen, keine pauschale Wiederholung.

## Historische Nachweise

Die ausführliche Chronik wurde aus dem laufenden Status entfernt, bleibt aber unverändert über die Git-Historie zugänglich:
- [Projektchronik vor Bereinigung](https://github.com/lszh-automations/lszh-automations-site/blob/0c36e5339d12ceac300d3c50d29daf107e79eaea/docs/LSZH_AUTOMATIONS_PROJEKTSTAND.md)
- [Früherer MVP-Fokus](https://github.com/lszh-automations/lszh-automations-site/blob/0c36e5339d12ceac300d3c50d29daf107e79eaea/docs/LSZH_MVP_FOKUS_20261018.md)
- [Frühere G1–G7-Matrix](https://github.com/lszh-automations/lszh-automations-site/blob/0c36e5339d12ceac300d3c50d29daf107e79eaea/docs/LSZH_OFFERTEN_PILOT_FREIGABEMATRIX_20261018.md)

Diese historischen Fassungen enthalten überholte Blocker und sind keine aktuelle Aufgabenliste.
