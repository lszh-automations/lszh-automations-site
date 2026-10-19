# LSZH Automations – aktueller Projektstand

Stand: 19.10.2026 (Europe/Zurich). Beide synthetischen Cloud-Annahmen inklusive unabhängigem Firestore-/Airtable-Readback bestätigt; temporärer Cloud-Zugriff bereinigt, neueste Testrevision bleibt retired und ohne Traffic bestehen.

## Verbindliche Übergabe – hier weiterarbeiten

**Ziel:** Einen vollständigen Offertenprozess für einen KMU fertigstellen: Offerte → private PDFs → getrennte Online-Zustimmungen → Annahmenachweis → Airtable → Make-Beleg und Bestätigung. Beide Varianten AVV Ja/Nein müssen funktionieren.

**Vertragsfreigabe der Geschäftsführung (19.10.2026):** Die B2B-Projektbedingungen v1.0 sind als **geschäftlich geprüfte/freigegebene Kundenfassung** (Drive-PDF `1d-EEo4AjsZBWvlYPlZLxxXuXJDBz7hWX`) im **Produktionsarchiv** abgelegt. Die AVV-Grundklauseln sind als **geschäftlich freigegebene Rahmenvorlage v1.0** (Drive-PDF `1MhQvRxB_OsiBhLXSkGeVL-jGutO3vM8x`) ohne fiktiven Kunden neu erstellt; die Anlagen A/B/C bleiben **für jeden Kunden zwingend sachlich auszufüllen und vom Kunden zu genehmigen**. Die frühere TEST_ONLY-AVV bleibt unverändert im Staging. Freigabeprotokoll mit Links/Hashes: [LSZH_VERTRAGSFREIGABE_20261019.md](LSZH_VERTRAGSFREIGABE_20261019.md). Keine Behauptung einer unabhängigen anwaltlichen Prüfung oder einer pauschalen Freigabe von Airtable-Angeboten.

**Letztes abgeschlossenes Ergebnis (19.10.2026):** Der Betreiber hat Firebase im **bestehenden** GCP-Projekt `lszh-automations` aktiviert, Hosting-Site `lszh-automations-portal` erstellt, `portal.lszh-automations.ch` per Namecheap-CNAME auf `lszh-automations-portal.web.app` eingerichtet und in Firebase die grüne Meldung **Benutzerdefinierte Domain eingerichtet** erhalten. `firebase deploy --only hosting --config hosting/customer-portal/firebase.json --project lszh-automations` wurde laut Cloud-Shell-Rückmeldung erfolgreich abgeschlossen (Release complete). Die isolierte Hosting-Site ist veröffentlicht, mit konfigurierten Rewrites ausschliesslich für `/offerte-annehmen/**` und `/api/offer/**` zum bestehenden Cloud Run in Zürich. **Noch kein externer HTTP-/SSL-/Rewrite-Nachweis; Cloud Run war zuletzt IAM-privat und durch `LSZH_PORTAL_PRODUCTION_ENABLED=false` gesperrt. Kein Kundengo-live und keine Kundenmail.** Das versehentlich separat angelegte Projekt `lszha-4b0ce` wird nicht für den Kundenbetrieb benutzt; keine unbeabsichtigte Löschung.

**Nächste Arbeit (Ziel: produktiver Kundenbetrieb):** Read-only Curl-Check nach Hosting-Release ergibt auf beiden Domains und `/api/offer/preview` jeweils **HTTP 403, SSL 0**. HTTPS und DNS sind damit vom Betreiber geprüft; 403 ist konsistent mit IAM-privatem Cloud Run, beweist jedoch noch keine funktionierende Anwendung. **Jetzt Cloud-Run-Flag `LSZH_PORTAL_PRODUCTION_ENABLED=false` und 100%-Traffic zur aktuellen Revision vor jeder Invoker-IAM-Freigabe prüfen**. Danach nur dem Kundenservice für einen kontrollierten 503-Negativtest öffentlichen Invoke-Zugriff geben; der Code in `portalHttp.mjs` muss bei `enabled=false` auf allen Routen 503 liefern. `403`/`404` bei privatem Backend bedeutet noch keine fehlgeschlagene Vertragssperre; keine Kundenannahme darf möglich sein. Vor der notwendigen, bewusst eingeschränkten öffentlichen Erreichbarkeit das deaktivierte Flag, Route-/Token-Gates und Secrets prüfen. Danach nur nötige produktive Secrets, Drive-ContentRestrictions, echte Quellflags, gezielten synthetischen End-to-End-Test und ersten freigegebenen Kunden abschliessen. Website auf Render nicht ändern; keine unnötigen Make-Szenarien.

**Produktiv-Kundenportal als Code vorbereitet:** Unter `cloud-run/offer-portal-production/` sind nun ein reiner freigabegebundener Airtable-Datensatzmapper, atomare Firestore-Kundenquellenregistrierung, transaktionssichere Einzelannahme, post-commit Airtable-Writeback mit manueller Klärung unklarer PATCH-Ergebnisse, eigene Cloud-Run-Laufzeitkonfiguration, ein standardmässig deaktivierter Functions-Framework-Kundendienst, Dockerfile und intern gegateter Dry-Run-/Einmal-Link-Issuer implementiert. `cloud-run/offer-portal-staging/portalCore.mjs` besitzt einen expliziten `productionOnly`-Modus, ohne den bisherigen Synthetic-only-Pfad freizuschalten. Die CI prüft Unit-Tests, Browser-Flow, Firestore-Emulator und einen Offline-Docker-Build. **GitHub Actions [Offer acceptance checks #39183314447](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39183314447) abgeschlossen, alle vier Jobs erfolgreich.** Spätere Änderungen am Issuer/Runbook sind noch separat zu beurteilen.

**Tatsächlicher Blocker:** Firebase Hosting wurde im richtigen Projekt `lszh-automations` veröffentlicht und die Domain `portal.lszh-automations.ch` von Firebase als eingerichtet bestätigt; **der externe HTTPS-/Rewrite-Zugriff wurde noch nicht anhand von HTTP-Codes nachgewiesen**. Cloud-Run-Kundenservice `lszh-offer-portal` in Zürich war zuletzt IAM-privat und durch `LSZH_PORTAL_PRODUCTION_ENABLED=false` deaktiviert. Für Browserzugriff über Firebase wird später eine kontrollierte IAM-/Ingress-Freigabe benötigt; vorher negative Tests und Laufzeit-Gates beweisen. Es fehlen produktive Secret-Manager-Werte/effektive Rechte, Cloud-Drive-Lese- und Annahme-Tests, verifizierte finale PDF-ContentRestrictions, kundenspezifische AVV-Anlagen bei AVV Ja, eine echte freigegebene Kundenofferte und bewusste Link-/Make-Aktivierung. Airtable-Live-Readback am 19.10.: 19 Offerten, **0 zugleich rechtlich und für Echtbetrieb freigegebene**. Die Make-Szenarien bleiben inaktiv. **Kein echter Kundenvertrag, keine reale Kundenmail und keine freigegebene Annahme.**

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
| Online-Annahme | Synthetische Cloud-Annahmen für AVV Nein/Ja bestanden; neue Kundenofferten-Mappingfunktion plus productionOnly-Prüfmodus im Featurebranch | Privater, deaktivierter Cloud-Run-Kundendienst `lszh-offer-portal` Revision `00002-4zw` in Zürich bereitgestellt; noch kein Produktiv-Seed oder echter Firestore→Airtable-Kunden-Writeback |
| Drive-Dokumente | Echter Portal-Download aller drei AVV-Ja-PDFs und SHA-256-Prüfung live bestanden; Annahmebelege in Geschäfts-Testordner archiviert | Keine visuelle Layoutkontrolle der PDFs |
| Firestore | Cloud-Annahmen AVV Nein und Ja samt Person, Zustimmungen und Dokumenthashes unabhängig zurückgelesen | Keine offene technische Lücke im synthetischen Annahmeweg |
| Airtable | Beide früheren Cloud-Annahmen und zwei neue synthetische Make-Integrationsrecords; Beleg-IDs und Mailversand-Zeitstempel gespeichert | Produktiver Kundenstatus und Rückfall bei Fehlern noch offen |
| Make-Beleg & Mail | 3/4-PDF-End-to-End-Make-Kette mit Testdaten bestanden; beide bestehenden Szenarien sind jetzt auf bedingt freigegebene Echtbetrieb-Offerten, Lead-/Annahme-E-Mail-Gleichheit und Geschäftsarchiv konfiguriert | Keine Live-Kunden-Ausführung; Aktivierung erst nach echten Portal-/Vertragsunterlagen. Szenarien sind inaktiv |
| Kundenunterlagen | Geschäftlich freigegebene Projektbedingungen v1.0 als saubere PDF im Produktionsarchiv; AVV-Rahmenwortlaut v1.0 ohne fiktiven Testkunden geprüft, eigene Mustervorlage/PDF archiviert | Pro echten AVV-Ja-Kunden Anlagen A/B/C mit tatsächlich eingesetzten Anbietern, Regionen, Datenarten, TOM und Löschfristen vervollständigen und explizit akzeptieren lassen. Noch kein echter Kundenvertrag oder anwaltlicher Prüfungsnachweis. |
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

**Google-Cloud-Kundenbasis erstellt (19.10.2026, Cloud-Shell-Nachweis):** Cloud Run `lszh-offer-portal` Revision `00001-2m6` in `europe-west6`, eigenes Laufzeitdienstkonto `lszh-offer-portal@lszh-automations.iam.gserviceaccount.com`, benannte Firestore-DB `lszh-offers` (Native/Standard, Löschschutz ein), IAM-Rolle `roles/datastore.user` mit Bedingung auf diese DB vergeben. Der Dienst ist IAM-privat (`--no-allow-unauthenticated`) und per Env `LSZH_PORTAL_PRODUCTION_ENABLED=false` abgeschaltet. Bestehende Staging-Dienste blieben unverändert. **Nicht freigeschaltet, keine Kundenroute.**

**Geschäfts-Drive Produktionsarchiv eingerichtet (19.10.):** In `lars@lszh-automations.ch` als Geschwister des STAGING-Archivs neuer, leerer Ordner `LSZH Automations Vertragsarchiv – PRODUKTION` mit ID `10VD4xYIxfQBJ9Q5wpGq3iflK4MNJ1PHN` erstellt. Portal-Konfiguration im Featurebranch und beide deaktivierten Make-Bestätigungsszenarien `7940220`/`7965223` (Belegordner + Parent-Checks) auf dieses echte Kundenarchiv umgestellt. Das neue Cloud-Run-Dienstkonto besitzt laut Drive-Readback noch **keinen** Reader-Zugriff auf den Produktionsordner. **WICHTIG:** Die live bereitgestellte Cloud-Run-Revision stammt noch von vor der Ordner-Konfigurationsänderung (und ist weiterhin deaktiviert); vor Aktivierung neues Image bereitstellen und prüfen. Weiterhin fehlen final freigegebene Vertrags-PDFs, Domainbindung und echte End-to-End-Verknüpfung. Keinen Kundenversand aktivieren.

**Drive-Freigabe bestätigt (19.10.):** Im geschäftlichen Google-Drive-Konto `lars@lszh-automations.ch` besitzt `lszh-offer-portal@lszh-automations.iam.gserviceaccount.com` laut Live-Berechtigungs-Readback explizit die Rolle `reader` für den Ordner `LSZH Automations Vertragsarchiv – PRODUKTION` (`10VD4xYIxfQBJ9Q5wpGq3iflK4MNJ1PHN`). Damit ist die Ordnerfreigabe erledigt; ein echtes Google-Drive-API-Leseverfahren aus der Cloud-Run-Laufzeit ist noch nicht bestätigt. Kein neues Kundenmail-GO, Cloud-Run-Portal bleibt deaktiviert.

## Neuer Stand auf dem Weg zum Produktivbetrieb (19.10.2026)

- **Weiterentwicklung nach Make-Umstellung:** `cloud-run/offer-portal-production/` beinhaltet Kundenmapper, Firestore-Einmalannahme/Source-Index, Airtable-Rückschreiben, konfigurationsgesperrten Cloud-Run-Kundendienst, Docker-Build und einmaligen Operator-Link-Issuer. Build-/Unit-/Browser-/Emulator-CI läuft ohne Kundendaten; Kundendienst **als private deaktivierte Revision 00002-4zw deployed**, nicht produktiv freigegeben.

- **Make angepasst, nicht aktiviert:** Die bestehenden Annahme-/PDF-Mail-Szenarien `7940220` und `7965223` wurden auf Kundenfelder, echte Freigabe-Flags, geschäftlichen Archivordner und dynamische Empfänger umgestellt. Automatisches Mail-/Belegszenario bleibt inaktiv bis zu echten Dokumenten und einem kontrollierten ersten Pilot. Der frühere TEST_ONLY-Integrationsnachweis ist historisch erfolgreich, nicht auf die neue Konfiguration übertragbar.
- **Portalcode vorbereitet, nicht bereitgestellt:** Kundenofferten-Mapping in `cloud-run/offer-portal-production/approvedCustomerOffer.mjs`; `productionOnly` akzeptiert nur ausdrücklich freigegebene Kundendatensätze, die bisherigen Cloud-Synthetic-only-Restriktionen bleiben erhalten. Dies ist bisher eine Code- und Teständerung, noch keine live verbundene Kundenroute.
- **Live CRM-Readback:** 19 Offerten eingesehen, davon 16 mit TEST-Markierung; **0 Datensätze** haben gleichzeitig die beiden Produktivfreigabe-Flags `Online-Annahme rechtlich freigegeben` und `Echtbetrieb – kein Test`. Somit aktuell kein freigegebener Kunde für den echten Versand.

## Bestehende Make-Strecken

Beide Bestätigungsszenarien `7940220` und `7965223` am 19.10.2026 live mit zwei neuen TEST_ONLY-Records bis zum Gmail- und Versanddatumsschritt erfolgreich ausgeführt und wieder deaktiviert. Empfänger derzeit fest private Outlook-Testadresse, Filter eng auf jeweilige synthetische Records, sequenzielle Ausführung aktiviert. Keine echten Kundenmails:

| Aufgabe | Szenario-ID | Stand |
| --- | --- | --- |
| Offerten-PDF, Archiv, Versand | `7835460` | Inaktiv; Trigger/Gmail gesperrt, Gmail zusätzlich deaktiviert |
| Annahmelink ohne AVV | `7940261` | Inaktiv; Token-/Mailpfad gesperrt |
| Annahmebeleg ohne AVV | `7940220` | Bisher 15/15 Testmodule erfolgreich; **neu kundenfähige Konfiguration** mit echten Freigabe-Flags und Kunden-E-Mail, noch nicht live getestet; inaktiv |
| Annahmelink mit AVV | `7965215` | Inaktiv; Token-/Mailpfad gesperrt |
| Annahmebeleg mit AVV | `7965223` | Bisher 17/17 Testmodule erfolgreich; **neu kundenfähige Konfiguration** mit AVV-Freigabe und Kunden-E-Mail, noch nicht live getestet; inaktiv |

## Nächste Schritte und Grenzen

1. **Cloud-Tests und Cleanup abgeschlossen:** AVV Nein/Ja synthetisch end-to-end bestanden. Tag entfernt, `00007-e2e`/`00008-json` gelöscht, beide temporären Secret-Grants entfernt. Neueste Revision `00009-avv` bleibt retired, ohne Tag und Traffic bestehen; Browser-Demo weiterhin 100 %. Tests nicht wiederholen.
2. **Vollständige automatische Make-Bestätigung mit internem Empfänger bestanden:** Zwei neue künstlich angenommene TEST_ONLY-Airtable-Records haben in den bestehenden Szenarien jeweils Belegarchivierung, PDF-Mailversand (3/4 Anhänge) und Versand-Zeitstempel ohne Modulfehler durchlaufen. Keine erneute Prüfung ohne geänderten Zustand; nächster Schritt ist die Umstellung vom internen Empfänger auf den kontrollierten Kundenpfad. Polling derzeit deaktiviert.
3. **Kundenroute fertigstellen:** Airtable→Firestore-Seeding samt eindeutiger Datensatzbindung und Einladungslink, produktiver Callback/Writeback und geeignete Cloud-Run-Identität/Route einrichten. Danach finale PDF-Versionen, konkrete AVV-Anlagen und einen begrenzten Pilot freigeben.

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
