# LSZH Automations – aktueller Projektstand

Stand: 19.10.2026 (Europe/Zurich). Beide synthetischen Cloud-Annahmen inklusive unabhängigem Firestore-/Airtable-Readback bestätigt; temporärer Cloud-Zugriff bereinigt, neueste Testrevision bleibt retired und ohne Traffic bestehen.

## Verbindliche Übergabe – hier weiterarbeiten

**Ziel:** Einen vollständigen Offertenprozess für einen KMU fertigstellen: Offerte → private PDFs → getrennte Online-Zustimmungen → Annahmenachweis → Airtable → Make-Beleg und Bestätigung. Beide Varianten AVV Ja/Nein müssen funktionieren.

**Letztes abgeschlossenes Ergebnis:** Beide Varianten des vollständigen synthetischen Annahmewegs live bestanden. AVV Nein: Cloud Run → Firestore → Airtable → Make-Beleg (Execution `6f4a6b7254454e9688a7dd2fa98d8437`, 13 Module). AVV Ja: drei PDFs per Portal geprüft, ausdrückliche AVV-Zustimmung über Cloud Run gespeichert und in Firestore/Airtable zurückgelesen; Make-Beleg erstellt (Executions `a3fafc87f61743f6936ce7a07ef5626a` und `41ac7867306a471fbac9c10992b6ac90`, je 15 Module, keine Modulfehler). Das aktive Polling startete beim kurzzeitigen Aktivieren zwei Läufe parallel. Airtable verweist auf `1TI3aj3vgn8CuGpbGkgZa2ogqvdohtK_t`; beide Beleg-PDFs und Google Docs waren identisch. Redundantes TEST_ONLY-PDF `1Ey83ZB7YcVUtEcbPATYDMN63KmQSxtaM` und zugehöriges Doc `1c283fm15cFFY0Zttpams6CcXXXFYnJifP7XhnB47dHo` gelöscht. Behaltener [AVV-TEST-Beleg](https://drive.google.com/file/d/1TI3aj3vgn8CuGpbGkgZa2ogqvdohtK_t/view) liegt im Geschäfts-Testordner. Inhalt und beide Hashes der Offerte/Bedingungen sowie Hash und Version `TEST_ONLY_AVV_v1.0_RC1` unabhängig geprüft. Beide Make-Szenarien danach inaktiv; Gmail und Versanddatums-Module aus. Keine E-Mail, kein echter Vertrag.

**Nächste Arbeit:** Produktionsbereitschaft vorbereiten. Der synthetische AVV-Nein/Ja-Ablauf ist end-to-end bestanden, aber die vorhandene Cloud-Anwendung ist auf Staging, synthetische Daten und Testversionen festgelegt; sie ist kein Produktivdienst. Die fünf relevanten Make-Szenarien waren beim Read-only-Check am 19.10.2026 inaktiv und ohne offene Fehlversuche. Es wurden keine Kundenmails versandt. Die konkrete Reihenfolge für getrennte Produktionsinfrastruktur, sichere Kundenroute, Wiederanlauf, finale Unterlagen, kontrollierten Mailpfad und begrenzten Pilot steht in der [Produktionsbereitschafts-Checkliste](LSZH_PRODUKTIONSBEREITSCHAFT_20261019.md).

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
| Online-Annahme | Beide synthetischen Cloud-Annahmen (AVV Nein/Ja) live mit getrennten Zustimmungen, Firestore-/Airtable-Readback bestanden | Echter Kundenbetrieb und Kundenunterlagen bleiben offen |
| Drive-Dokumente | Echter Portal-Download aller drei AVV-Ja-PDFs und SHA-256-Prüfung live bestanden; Annahmebelege in Geschäfts-Testordner archiviert | Keine visuelle Layoutkontrolle der PDFs |
| Firestore | Cloud-Annahmen AVV Nein und Ja samt Person, Zustimmungen und Dokumenthashes unabhängig zurückgelesen | Keine offene technische Lücke im synthetischen Annahmeweg |
| Airtable | Beide Cloud-Annahmen inklusive AVV-Zustimmung synchronisiert; Beleg-IDs der beiden Make-Belege gespeichert | Bestätigungs-Mailweg noch offen |
| Make-Beleg | AVV-Nein- und AVV-Ja-Beleg live erzeugt, im Geschäfts-Drive archiviert und in Airtable referenziert; AVV-Ja-Inhalt unabhängig geprüft | Bestätigungs-Mailweg noch offen; kein Mailversand ausgeführt |
| Kundenunterlagen | Im Geschäfts-Drive geprüft: Projektbedingungen v1.0 RC1 als Kundenfassung sowie AVV- und Anlagenmaterial | Projektbedingungen-Datei trägt weiterhin „ENDKONTROLLE_NICHT_VERSENDEN“; geprüfte AVV-Fassung ist ausdrücklich TEST_ONLY. Keine versandfertige finale AVV belegt. Vor Pilot: Endkontrolle der Bedingungen sowie echte projektbezogene AVV-Anlagen mit verifizierten Anbietern, Regionen, Datenarten und Löschfristen. |
| Secure Transfer | Dummy-Schlüssel funktional getestet | Keine Produktivfreigabe für reale Kundensecrets; kein zusätzlicher MVP-Pflichtschritt bei OAuth |
| G3-Infrastruktur | Umfangreiche Offline-/CI-Nachweise im Repository | Zurückgestellt; keine G3-Release-/Deploymentfreigabe |

Bei Airtable-Ausfall nach gespeichertem Firestore-Accept meldet der implementierte Callback `manual_review_required`. Firestore-Annahme bleibt bestehen; keine blinde Wiederholung. Airtable GET/PATCH ist keine atomare CAS-Operation: einzige Schreibverantwortung und Umgang mit unklaren Ergebnissen im Pilot beachten.

## Cloud-Testfälle – beide Varianten erfolgreich synthetisch angenommen

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

## AVV-Ja-Testfall – abgeschlossen

- Airtable: `recktLXj5wUxLmHFQ`, angenommen mit AVV ausdrücklich akzeptiert; Airtable-Beleg-ID `1TI3aj3vgn8CuGpbGkgZa2ogqvdohtK_t`.
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
| Annahmebeleg mit AVV | `7965223` | Synthetischer Beleg am 19.10. erfolgreich; wieder inaktiv; Gmail und Versanddatums-Modul deaktiviert |

## Nächste Schritte und Grenzen

1. **Cloud-Tests und Cleanup abgeschlossen:** AVV Nein/Ja synthetisch end-to-end bestanden. Tag entfernt, `00007-e2e`/`00008-json` gelöscht, beide temporären Secret-Grants entfernt. Neueste Revision `00009-avv` bleibt retired, ohne Tag und Traffic bestehen; Browser-Demo weiterhin 100 %. Tests nicht wiederholen.
2. **Belegstrecke bestanden:** AVV-Nein und AVV-Ja haben beide TEST_ONLY-Belege erzeugt. Bestätigungs-Mailweg noch ohne Versand technisch prüfen.
3. **Begrenzten Kundenpilot vorbereiten:** Endgültige PDF-Versionen, konkrete AVV-Anlagen, Kundenroute, Verantwortlichkeiten und Betrieb klären; danach ausdrückliches Pilot-GO.

Bereits genehmigt und erledigt: einmaliger privater Cloud-Run-Staging-Test mit synthetischen Daten, separater synthetischer Airtable-Schreibtest und einmaliger Make-Belegtest. Am 19.10. stellte der Betreiber klar, dass für die weitere synthetische Entwicklungs- und Testarbeit keine wiederholten Freigabefragen nötig sind; im bestehenden Aufgabenrahmen selbstständig weiterarbeiten. **Nicht genehmigt:** echte Kundenverträge/-mails, externe Kundeneinladungen, allgemeine Make-Aktivierung, Main-Merge oder öffentlicher Go-Live. Bestehende Freigaben nicht nochmals pauschal einholen; den Umfang nicht ausweiten.

Cockpit V2, neue Branchenmodule, zusätzliche KI-Funktionen, separate Portale und kosmetische Website-Erweiterungen folgen nach dem nutzbaren MVP. Sanitär-OS-Monteurportal wird nicht weiterverfolgt.

## Dokumentation pflegen

- Dieses Dokument ist die einzige aktuelle Statusquelle. Nach jedem abgeschlossenen Arbeitsschritt betroffene Zeilen **ersetzen**, nicht weitere widersprüchliche Statusblöcke anhängen.
- Übergabe oben aktualisieren: letztes Ergebnis, nächster Schritt, tatsächlicher Blocker, Nachweis und Freigabeumfang.
- Implementiert, offline getestet, live geprüft und produktiv freigegeben ausdrücklich unterscheiden. Prüfdatum nennen; keine alte Live-Prüfung als heute ausgeführt ausgeben.
- Detailnachweise nur bei Bedarf öffnen. Historische NO-GOs und frühere nächste Schritte gelten nicht als aktuelle Arbeitsanweisung.
- [MVP-Fokus](LSZH_MVP_FOKUS_20261018.md) beschreibt Ziel/Abschlusskriterien; [Pilot-Freigabematrix](LSZH_OFFERTEN_PILOT_FREIGABEMATRIX_20261018.md) beschreibt verbleibende Freigabegrenzen. Status nicht mehrfach ausformulieren.

## Cloud-Testressourcen – Cleanup abgeschlossen

Am 19.10.2026 wurde der Tag `cloud-e2e` entfernt, Revisionen `lszh-offer-browser-staging-00007-e2e` und `lszh-offer-browser-staging-00008-json` gelöscht sowie die beiden temporären Secret-Accessor-Bindungen des Portal-Dienstkontos entfernt. Cloud-Shell-Readback bestätigte 100 % Browser-Demo-Traffic auf `lszh-offer-browser-staging-00006-h5w` und leere IAM-Bindings für beide Test-Secrets. `lszh-offer-browser-staging-00009-avv` bleibt als neueste Revision retired, ungetaggt und ohne Traffic bestehen; Cloud Run erlaubt das Löschen der neuesten Revision nicht. Testsecrets, synthetische Daten und Belege blieben erhalten.

## Historische Nachweise

Die ausführliche Chronik wurde aus dem laufenden Status entfernt, bleibt aber unverändert über die Git-Historie zugänglich:
- [Projektchronik vor Bereinigung](https://github.com/lszh-automations/lszh-automations-site/blob/0c36e5339d12ceac300d3c50d29daf107e79eaea/docs/LSZH_AUTOMATIONS_PROJEKTSTAND.md)
- [Früherer MVP-Fokus](https://github.com/lszh-automations/lszh-automations-site/blob/0c36e5339d12ceac300d3c50d29daf107e79eaea/docs/LSZH_MVP_FOKUS_20261018.md)
- [Frühere G1–G7-Matrix](https://github.com/lszh-automations/lszh-automations-site/blob/0c36e5339d12ceac300d3c50d29daf107e79eaea/docs/LSZH_OFFERTEN_PILOT_FREIGABEMATRIX_20261018.md)

Diese historischen Fassungen enthalten überholte Blocker und sind keine aktuelle Aufgabenliste.
