# LSZH Automations – aktueller Projektstand

Stand: 19.10.2026 (Europe/Zurich). Beide synthetischen Cloud-Annahmen inklusive unabhängigem Firestore-/Airtable-Readback bestätigt; temporärer Cloud-Zugriff bereinigt, neueste Testrevision bleibt retired und ohne Traffic bestehen.

## Verbindliche Übergabe – hier weiterarbeiten

**Ziel:** Einen vollständigen Offertenprozess für einen KMU fertigstellen: Offerte → private PDFs → getrennte Online-Zustimmungen → Annahmenachweis → Airtable → Make-Beleg und Bestätigung. Beide Varianten AVV Ja/Nein müssen funktionieren.

**Letztes abgeschlossenes Ergebnis:** Am 19.10.2026 wurden **beide bestehenden Make-Annahmebestätigungen vollständig inklusive internem PDF-Mailversand** live getestet. Für AVV Nein: Szenario `7940220`, 15/15 Module ohne Fehler, Execution `f03f6a802cc44ad7a4b5a68f2aa57890`, Testrecord `recv60SR0Z56HdvEH`, archivierter Beleg `1BUbH2z8fE4Cj4--VXgCOb4JQB27a8L3C`, drei PDFs an die freigegebene private Outlook-Testadresse. Für AVV Ja: Szenario `7965223`, 17/17 Module ohne Fehler, Execution `bc6556aecd2b4a1fbd24e420b64280a6`, Testrecord `recGS5AYl6yqFbzvr`, archivierter Beleg `1DcVoZlm3bexNxMzjqPm8SwuHEAdJDRw6`, vier PDFs an dieselbe Adresse. Beide synthetischen Airtable-Records haben Beleg-ID und Versand-Zeitstempel; beide Make-Szenarien danach deaktiviert. Die beiden Testrecords wurden **künstlich als angenommen vorbereitet**: Dies ist ein vollständiger Make-Integrationsnachweis ab Airtable, keine neue Browser-Annahme und kein Vertrag. Frühere separate Browser-/Cloud-Annahmen für AVV Nein/Ja sind ebenfalls belegt und müssen nicht wiederholt werden.

**Nächste Arbeit:** Die **Airtable → Make → Beleg-PDF → Geschäfts-Drive → Gmail → Airtable-Versandstatus**-Kette ist für beide AVV-Varianten mit fiktiven Daten automatisch durchgelaufen. Der echte Kundenpfad fehlt noch: Kundenlink/Authentifizierung und Staging-Hardcodes kontrolliert produktionsfähig konfigurieren, Mail-Empfänger von der fixen internen Testadresse auf verifizierten Kundenempfänger umstellen, endgültige Kundenbedingungen/AVV und Fehler-Wiederanlauf abschliessen. Keine neuen E-Mail-Anhangstests oder doppelte Belegläufe ohne Fehler/Änderung. Die fünf Hauptszenarien sind nach den Läufen inaktiv; produktive Kundenmails wurden nicht versandt. Das Ganze benötigt zunächst keine zusätzliche vollwertige Infrastruktur, sondern eine bewusst vorbereitete Kundenkonfiguration der bestehenden Dienste.

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
| Airtable | Beide früheren Cloud-Annahmen und zwei neue synthetische Make-Integrationsrecords; Beleg-IDs und Mailversand-Zeitstempel gespeichert | Produktiver Kundenstatus und Rückfall bei Fehlern noch offen |
| Make-Beleg & Mail | AVV Nein/Ja als komplette automatische Make-Kette mit 3/4 echten PDFs und internem Gmail-Versand erfolgreich; 15/15 und 17/17 Module, Beleg und Versand-Zeitstempel in Airtable | Echtes Kundenrouting, finale Unterlagen und Betriebskonfiguration noch offen; kein Kundenversand |
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

Beide Bestätigungsszenarien `7940220` und `7965223` am 19.10.2026 live mit zwei neuen TEST_ONLY-Records bis zum Gmail- und Versanddatumsschritt erfolgreich ausgeführt und wieder deaktiviert. Empfänger derzeit fest private Outlook-Testadresse, Filter eng auf jeweilige synthetische Records, sequenzielle Ausführung aktiviert. Keine echten Kundenmails:

| Aufgabe | Szenario-ID | Stand |
| --- | --- | --- |
| Offerten-PDF, Archiv, Versand | `7835460` | Inaktiv; Trigger/Gmail gesperrt, Gmail zusätzlich deaktiviert |
| Annahmelink ohne AVV | `7940261` | Inaktiv; Token-/Mailpfad gesperrt |
| Annahmebeleg ohne AVV | `7940220` | 15/15 Module inkl. Gmail und Versand-Zeitstempel live erfolgreich; danach wieder inaktiv; nur intern |
| Annahmelink mit AVV | `7965215` | Inaktiv; Token-/Mailpfad gesperrt |
| Annahmebeleg mit AVV | `7965223` | 17/17 Module inkl. Gmail und Versand-Zeitstempel live erfolgreich; danach wieder inaktiv; nur intern |

## Nächste Schritte und Grenzen

1. **Cloud-Tests und Cleanup abgeschlossen:** AVV Nein/Ja synthetisch end-to-end bestanden. Tag entfernt, `00007-e2e`/`00008-json` gelöscht, beide temporären Secret-Grants entfernt. Neueste Revision `00009-avv` bleibt retired, ohne Tag und Traffic bestehen; Browser-Demo weiterhin 100 %. Tests nicht wiederholen.
2. **Vollständige automatische Make-Bestätigung mit internem Empfänger bestanden:** Zwei neue künstlich angenommene TEST_ONLY-Airtable-Records haben in den bestehenden Szenarien jeweils Belegarchivierung, PDF-Mailversand (3/4 Anhänge) und Versand-Zeitstempel ohne Modulfehler durchlaufen. Keine erneute Prüfung ohne geänderten Zustand; nächster Schritt ist die Umstellung vom internen Empfänger auf den kontrollierten Kundenpfad. Polling derzeit deaktiviert.
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
