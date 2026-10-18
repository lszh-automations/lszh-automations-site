# LSZH Automations – aktueller Projektstand

Stand: 19.10.2026 (Europe/Zurich). Cloud-Run-Servicekonfiguration am 19.10.2026 vom Betreiber per read-only Cloud-Shell-Ausgabe bestätigt; übrige Nachweise bis 18.10.2026.

## Verbindliche Übergabe – hier weiterarbeiten

**Ziel:** Einen vollständigen Offertenprozess für einen KMU fertigstellen: Offerte → private PDFs → getrennte Online-Zustimmungen → Annahmenachweis → Airtable → Make-Beleg und Bestätigung. Beide Varianten AVV Ja/Nein müssen funktionieren.

**Letztes abgeschlossenes Ergebnis:** Echter Preview-Lauf auf `lszh-offer-browser-staging-00007-e2e`: private HTML-Seite PASS, `/api/offer/preview` HTTP 400 `invalid_request`, keine Annahme. Ursache lokal reproduziert: Functions Framework konsumiert JSON vor dem Handler; Adapter las den leeren Stream erneut. Fix nutzt `req.rawBody` mit unveränderten Typ-/Grössen-/JSON-Prüfungen. Acht lokale HTTP-Tests PASS (vor Fix reproduzierbares 400). [CI 39172547393](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39172547393) alle vier Jobs SUCCESS, einschliesslich neuem Test gegen das **echte Functions Framework** für Preview/PDF/simulierten Accept. Geprüfter Fix-Source `d913bcf98f8a324a19a89581a6416dd91dafaba2`. Release-Runner für gezielten Austausch vorbereitet und sechs lokale Ablaufprüfungen PASS.

**Nächste Arbeit:** Aktualisierten `scripts/offer-browser-synthetic-release.py --apply` ausführen: prüft exakt vorhandene fehlerhafte Revision `00007-e2e`/Image-Digest, baut den CI-geprüften JSON-Fix und setzt Tag `cloud-e2e` auf neue Revision `00008-json` mit 0 % regulärem Traffic. Bestehende Demo bleibt bei 100 %; bestehende Secret-Rechte und Identität werden nur geprüft, nicht neu vergeben. Danach im selben Shell-Block `scripts/offer-browser-synthetic-preview.py` erneut ausführen. Beide Schritte noch nicht live ausgeführt. Bei erneutem Fehler stoppen; keine Annahme oder Seed-Wiederholung.

**Konkreter offener Nachweis:** JSON-Fix muss als neue Testrevision bereitgestellt werden und die echte Vorschau/PDF-Prüfung bestehen. Noch kein Live-Nachweis für Drive-/Firestore-Leseweg über die vollständige Portal-API, keinen Airtable-Schreibzugriff und keine Annahme ableiten. Die bisherige Revision `00007-e2e` bleibt bis zum erfolgreichen Austausch unter dem Tag erreichbar.

**Nicht wiederholen:** Firestore-Seeder, separaten Airtable-Schreibtest, bestandene Drive-Diagnose oder bereits getroffene Geschäftsentscheide. Neue Prüfung nur bei verändertem Zustand oder konkretem Fehler.

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
| Drive-Dokumente | Vier synthetische PDFs im Geschäfts-Testordner; temporärer Cloud-Run-Lesetest 4/4 erfolgreich; direkter Parent im Portalcode korrigiert | Temporäre Leseprobe ist kein vollständiger Portal-Annahmetest |
| Firestore | Echte Transaktionstests früher bestanden; aktueller einmaliger Cloud-Seed mit Readback erfolgreich | Noch kein echter HTTP-Annahmelauf der neuen Portal-Testrevision |
| Airtable | Separater realer synthetischer Schreibtest mit Readback bestanden; automatischer Callback im Portalcode integriert | Cloud Run → Firestore → Airtable noch nicht live durchgängig nachgewiesen; Emulator nutzt simuliertes CRM |
| Make-Beleg | Bestehende Ja/Nein-Szenarien, Beleg-Handoff und korrigierte AVV-Belegvorlage vorhanden | Durchgängige Belegerstellung aus der neuen Cloud-Testannahme und Bestätigungsweg fehlen |
| Kundenunterlagen | Projektbedingungen als PDF/Google Doc und synthetische AVV samt Anlagen im Geschäfts-Drive vorhanden | Endkontroll-/TEST_ONLY-Dateien sind keine final freigegebenen Kundenverträge |
| Secure Transfer | Dummy-Schlüssel funktional getestet | Keine Produktivfreigabe für reale Kundensecrets; kein zusätzlicher MVP-Pflichtschritt bei OAuth |
| G3-Infrastruktur | Umfangreiche Offline-/CI-Nachweise im Repository | Zurückgestellt; keine G3-Release-/Deploymentfreigabe |

Bei Airtable-Ausfall nach gespeichertem Firestore-Accept meldet der implementierte Callback `manual_review_required`. Firestore-Annahme bleibt bestehen; keine blinde Wiederholung. Airtable GET/PATCH ist keine atomare CAS-Operation: einzige Schreibverantwortung und Umgang mit unklaren Ergebnissen im Pilot beachten.

## Aktueller Cloud-Testfall – bereits angelegt

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

Der Roh-Testtoken gehört ausschliesslich in die sichere lokale Betreiberdatei `lszh_synthetic_cloud_test_20261018_token.txt`, nicht in Chat, GitHub oder Airtable. Datei-Verfügbarkeit vor Nutzung prüfen; hier ist kein Token enthalten. Der ältere separate Airtable-Test `rec4lc9AV5TxRQlcd` ist bereits simuliert angenommen und **nicht** der aktuelle Cloud-Testentwurf. Auch das Dokument-/Demo-Paket `OFF-TEST-AVV-20261018-001` ist ein anderer Testfall.

## Bestehende Make-Strecken

Zuletzt dokumentierter Live-Stand vom 18.10.2026, bei tatsächlicher Ausführung gezielt erneut lesen:

| Aufgabe | Szenario-ID | Stand |
| --- | --- | --- |
| Offerten-PDF, Archiv, Versand | `7835460` | Inaktiv; Trigger/Gmail gesperrt, Gmail zusätzlich deaktiviert |
| Annahmelink ohne AVV | `7940261` | Inaktiv; Token-/Mailpfad gesperrt |
| Annahmebeleg ohne AVV | `7940220` | Inaktiv; Claim/Gmail mit `0=1` gesperrt |
| Annahmelink mit AVV | `7965215` | Inaktiv; Token-/Mailpfad gesperrt |
| Annahmebeleg mit AVV | `7965223` | Inaktiv; Claim/Gmail mit `0=1` gesperrt |

## Nächste Schritte und Grenzen

1. **Privaten Cloud-Test fertigstellen:** Konfiguration und erreichbaren Testpfad bestimmen; bestehende einmalige Betreiberfreigabe berücksichtigen. Neue isolierte 0%-Traffic-Testrevision im genehmigten Umfang, exakt vorhandenen Testrecord verwenden, Annahme einmal ausführen und Firestore/Airtable zurücklesen. Bestehenden Traffic erhalten; Testrevision danach kontrolliert ausser Betrieb nehmen.
2. **Belegstrecke vervollständigen:** Bestehende Make-Module mit dem synthetischen Ergebnis verbinden und realen Testbeleg prüfen. Fehlende Freigaben für konkrete externe Aktionen erst am ausführbaren Schritt klären. AVV Ja ebenfalls vollständig nachweisen. Vor Annahme 2/3 Vertrags-PDFs, danach 3/4 Dokumente inklusive Beleg.
3. **Begrenzten Kundenpilot vorbereiten:** Endgültige PDF-Versionen, konkrete AVV-Anlagen, Kundenroute, Verantwortlichkeiten und Betrieb klären; danach ausdrückliches Pilot-GO.

Bereits genehmigt: einmaliger privater Cloud-Run-Staging-Test mit synthetischen Daten; separater synthetischer Airtable-Schreibtest (erledigt). **Nicht genehmigt:** echte Kundenverträge/-mails, externe Kundeneinladungen, allgemeine Make-Aktivierung, Main-Merge oder öffentlicher Go-Live. Bestehende Freigaben nicht nochmals pauschal einholen; den Umfang nicht ausweiten.

Cockpit V2, neue Branchenmodule, zusätzliche KI-Funktionen, separate Portale und kosmetische Website-Erweiterungen folgen nach dem nutzbaren MVP. Sanitär-OS-Monteurportal wird nicht weiterverfolgt.

## Dokumentation pflegen

- Dieses Dokument ist die einzige aktuelle Statusquelle. Nach jedem abgeschlossenen Arbeitsschritt betroffene Zeilen **ersetzen**, nicht weitere widersprüchliche Statusblöcke anhängen.
- Übergabe oben aktualisieren: letztes Ergebnis, nächster Schritt, tatsächlicher Blocker, Nachweis und Freigabeumfang.
- Implementiert, offline getestet, live geprüft und produktiv freigegeben ausdrücklich unterscheiden. Prüfdatum nennen; keine alte Live-Prüfung als heute ausgeführt ausgeben.
- Detailnachweise nur bei Bedarf öffnen. Historische NO-GOs und frühere nächste Schritte gelten nicht als aktuelle Arbeitsanweisung.
- [MVP-Fokus](LSZH_MVP_FOKUS_20261018.md) beschreibt Ziel/Abschlusskriterien; [Pilot-Freigabematrix](LSZH_OFFERTEN_PILOT_FREIGABEMATRIX_20261018.md) beschreibt verbleibende Freigabegrenzen. Status nicht mehrfach ausformulieren.

## Testrevision wieder ausser Betrieb nehmen

Nach dem einmaligen Test: exakt Tag `cloud-e2e` entfernen, Testrevisionen `lszh-offer-browser-staging-00007-e2e` und (nach tatsächlich erfolgtem Fix-Deployment) `lszh-offer-browser-staging-00008-json` jeweils nach 0%-Traffic-Kontrolle löschen und die beiden für diesen Test hinzugefügten Secret-Accessor-Bindungen des Portal-Dienstkontos gezielt entfernen. Alte Demo-Revision, Originalportal, Testnachweise und andere Secrets nicht löschen. Noch kein Cleanup ausgeführt; bei Teilfehlern tatsächlichen Zustand lesen, keine pauschale Wiederholung.

## Historische Nachweise

Die ausführliche Chronik wurde aus dem laufenden Status entfernt, bleibt aber unverändert über die Git-Historie zugänglich:
- [Projektchronik vor Bereinigung](https://github.com/lszh-automations/lszh-automations-site/blob/0c36e5339d12ceac300d3c50d29daf107e79eaea/docs/LSZH_AUTOMATIONS_PROJEKTSTAND.md)
- [Früherer MVP-Fokus](https://github.com/lszh-automations/lszh-automations-site/blob/0c36e5339d12ceac300d3c50d29daf107e79eaea/docs/LSZH_MVP_FOKUS_20261018.md)
- [Frühere G1–G7-Matrix](https://github.com/lszh-automations/lszh-automations-site/blob/0c36e5339d12ceac300d3c50d29daf107e79eaea/docs/LSZH_OFFERTEN_PILOT_FREIGABEMATRIX_20261018.md)

Diese historischen Fassungen enthalten überholte Blocker und sind keine aktuelle Aufgabenliste.
