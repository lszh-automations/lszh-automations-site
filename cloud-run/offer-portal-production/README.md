# LSZH Kundenportal – erster produktiver Pilot (Vorbereitung, kein Go-live)

Stand: 19.10.2026. Entwicklungsbranch `feature/optional-avv-acceptance-staging-20261014`.
Ziel: Eine freigegebene KMU-Offerte mit persönlichem Link online annehmen, Nachweis atomar sichern,
Airtable aktualisieren und danach die bestehenden Make-Bestätigungsszenarien benutzen.
**Cloud-Run-Kundendienst existiert:** Projekt `lszh-automations`/Zürich, Firebase-Portal `https://portal.lszh-automations.ch` mit erfolgreichem HTTPS/Cloud-Run-Rewrite. Nach Domain-restricted-sharing-Fehler beim öffentlichen IAM-Binding wurde am einen Portalservice die Invoker-IAM-Prüfung deaktiviert; **Vertragsannahme bleibt durch `LSZH_PORTAL_PRODUCTION_ENABLED=false` gesperrt (HTTP 503)**. Die vier Laufzeitwerte und beide Secret-Manager-Referenzen sind verbunden; Dienst hat nach der Secret-Einbindung eine neuere Revision als `00003-p57` (genaue Kennung nur live prüfen). **Noch kein Kunde freigegeben.**

## Bereits im Branch implementiert

- `approvedCustomerOffer.mjs`: ausschliesslich gültige, ausdrücklich freigegebene Kundenofferten aus Airtable akzeptieren, echte Empfängeradresse, finale Versionsnummer, PDF-IDs und SHA-Prüfsummen prüfen.
- `customerFirestoreStore.mjs`: Quelle→Token-Index und Kundenofferte atomar registrieren; erfolgreiche Annahme höchstens einmal.
- `customerAirtableWriteback.mjs`: nach erfolgreicher Firestore-Transaktion denselben Airtable-Datensatz und die Dokumentversionen erneut prüfen, dann Annahme/Person/Zeitpunkt/Nachweis speichern. Unklarer PATCH = manuelle Überprüfung, kein automatischer zweiter Vertragsabschluss.
- `productionConfig.mjs` / `index.mjs`: bestehende Offerten-Webseite und Cloud-Portalcode auf eigenem Cloud-Run-Service. Standardmässig AUS; konfigurierter Dienst braucht benannte Firestore-DB, eigene Laufzeitidentität, Geschäftsarchiv-Lesezugriff und final freigegebene Unterlagen.
- `issueApprovedCustomerLink.mjs`: interner einmaliger Dry-Run und gesondert freizugebende Ausgabe eines persönlichen Links. Keine Kundennachricht.

## Produktive Lesepfade bestätigt – nächster Meilenstein: erster Pilot

Stand 19.10.2026: Drive-Basis-PDFs, `contentRestrictions.readOnly` und tatsächliche PDF-Bytes mit Portal-Dienstkonto **PASS**. Separater temporärer Cloud-Run-Job `lszh-data-read-20261019102338` hat lesenden SDK-Zugriff auf benannte Firestore-DB `lszh-offers` und GET über den produktiven Airtable-PAT auf die Offertentabelle **PASS** bestätigt; keine Schreibvorgänge, kein Mail, Job entfernt. **Diese Basischecks nicht wiederholen.** Der bisherige Befehl dient nur der Dokumentation:

```bash
git pull --ff-only
bash scripts/customer-portal-data-runtime-readonly-once.sh
```

Der Check wurde bereits erfolgreich ausgeführt. Als nächstes eine echte vollständig geprüfte Offerte samt finaler PDF im Produktionsarchiv erstellen. Aktuelles Live-CRM: 19 Offerten, **0 gleichzeitig rechtlich und für Echtbetrieb freigegebene**. Bei AVV Ja fehlen konkrete genehmigte Anlagen A/B/C. Bevor echte Verträge angenommen werden, einmal kontrolliert Quellfreigabe → Link → Browser → Firestore-Transaktion → Airtable PATCH → Make-Beleg / Mail testen. Bis dahin das Runtime-Flag `false` lassen; kein Kundenversand und kein produktives Einschalten der Make-Szenarien.

## Noch konkret nötig vor echter Kundenofferte

1. **Kundendokumente binden:** Geschäftlich freigegebene **Projektbedingungen v1.0** als PDF `1d-EEo4AjsZBWvlYPlZLxxXuXJDBz7hWX` im Geschäfts-Drive-Produktionsarchiv vorhanden. **AVV-Master v1.0** als PDF `1MhQvRxB_OsiBhLXSkGeVL-jGutO3vM8x` in der gleichen Ablage; sie ist **nicht kundenspezifisch abgeschlossen**, Anlagen A/B/C im echten AVV-Ja-Fall tatsächlich ausfüllen/genehmigen lassen und eine eigene finale AVV-PDF erstellen. Hashes/geschäftliche Prüfentscheidung im [Freigaberegister](../../docs/LSZH_VERTRAGSFREIGABE_20261019.md). Vor Kunde: tatsächliche Drive-Dateihashes und ContentRestrictions prüfen.
2. **Vorhandene Google-Cloud-Basis bestätigen, nicht neu erzeugen:** Firebase-Domain/HTTPS sind aktiv; Cloud-Run-Kundendienst `lszh-offer-portal`, benannte Firestore-DB `lszh-offers`, eigenständiges Dienstkonto und zwei Produktionssecrets sind eingerichtet. Der Drive-API-Test aus der echten Cloud Run-Identität **ist bestanden (beide PDFs 2/2)**. Offen bleibt der aktive Firestore-/Airtable-Lesetest, danach der kontrollierte Annahme-/Writeback-Pilot. Bis zum bewusst freigegebenen Pilot `LSZH_PORTAL_PRODUCTION_ENABLED=false` belassen.
3. **Domain/HTTPS: ERLEDIGT.** `https://portal.lszh-automations.ch` → Firebase Hosting → Cloud Run; öffentliches HTTP 503 bei deaktivierter Kundenannahme nachgewiesen. Bestehende Render-Website bleibt unverändert. Den alten Websitepfad nicht als neue Kundenannahme bewerben.
4. **Laufzeitwerte:** `LSZH_PORTAL_PRODUCTION_ENABLED=true`, `LSZH_PORTAL_DATABASE=lszh-offers`, `LSZH_PORTAL_BUSINESS_ARCHIVE_FOLDER=10VD4xYIxfQBJ9Q5wpGq3iflK4MNJ1PHN`, `LSZH_PORTAL_ORIGIN=https://portal.lszh-automations.ch`, `LSZH_PORTAL_TERMS_VERSION=<finale Version>`; `LSZH_PORTAL_PROOF_SALT` und `LSZH_AIRTABLE_ACCESS_TOKEN` nur aus Secret Manager. Zugangsdaten niemals in Chat, GitHub oder Logs.
5. **Erste Offerte:** Tatsächlichen Kunden im CRM aufnehmen; den passenden Datensatz prüfen; erst wenn Dokumente/Empfänger stimmen, die zwei Freigabe-Flags `Online-Annahme rechtlich freigegeben` und `Echtbetrieb – kein Test` setzen. Für echte Annahme müssen `Versand freigegeben` und `Vertragsunterlagen versendet` korrekt sein.
6. **Link ausgeben, nur an bestätigten Empfänger senden:** Vor Test des Issuers nur Dry-Run. Ausführung benötigt eine gültige Operator-Cloud-Identität, die benannte Firestore-Datenbank, `LSZH_CUSTOMER_OFFER_ISSUE_ENABLED=true` und genau einen geprüften Record; danach persönlicher Link einmalig sichtbar. Für Kundenversand die vorhandenen Make-Annahmelink-Szenarien erst nach Anpassung der Ziel-Origin und tatsächlichem Ende-zu-Ende-Test aktivieren. Es ist **noch kein automatischer Serien-Linkversand** implementiert.
7. **Pilotannahme testen und überwachen:** Kunden-Link → persönliche Vorschau → 2/3 PDFs → getrennte ausdrückliche Zustimmung → Firestore → Airtable → die beiden bestehenden Make-Szenarien `7940220` / `7965223` (nur passende Variante). Vor Aktivierung reale Daten/Unterlagen, Idempotenz, E-Mail-Absender/Empfänger und manuellen Ausfallpfad einmal prüfen. Kein generelles Einschalten aller Szenarien.

## Stand CI

Im Branch laufen automatisierte Node-Tests, Cloud-Run-Image-Build (ohne Deploy), Chromium-Browser-Tests
und Firestore-Emulator-Stresstests über `.github/workflows/offer-acceptance-check.yml`.
Die CI ist kein Nachweis für tatsächliche Google-Cloud-/Airtable-Kundenberechtigungen oder einen öffentlichen Cloud-Run-Dienst.

## Bewusste Abgrenzung

- Bestehende Browser-Demo/Cloud-Staging-Revision und synthetische Daten/Secrets nicht überschreiben.
- Nicht `main` mergen, bevor das Ausrollen auf Render bewusst geprüft wurde.
- Keine echten Kundendaten, Verträge, Einladung oder E-Mail während dieses Code- und CI-Schritts.
- Kein neues G3/PubSub, Cockpit V2 oder unnötige zusätzliche Make-Szenarien als Bedingung für den ersten Kunden.
