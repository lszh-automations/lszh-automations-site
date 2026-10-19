# LSZH Kundenportal – erster produktiver Pilot (Vorbereitung, kein Go-live)

Stand: 19.10.2026. Entwicklungsbranch `feature/optional-avv-acceptance-staging-20261014`.
Ziel: Eine freigegebene KMU-Offerte mit persönlichem Link online annehmen, Nachweis atomar sichern,
Airtable aktualisieren und danach die bestehenden Make-Bestätigungsszenarien benutzen.
**Cloud-Run-Kundendienst existiert:** Revision `lszh-offer-portal-00002-4zw` im Projekt `lszh-automations`/Zürich, IAM-privat und durch `LSZH_PORTAL_PRODUCTION_ENABLED=false` deaktiviert. **Noch kein Kunde freigegeben.**

## Bereits im Branch implementiert

- `approvedCustomerOffer.mjs`: ausschliesslich gültige, ausdrücklich freigegebene Kundenofferten aus Airtable akzeptieren, echte Empfängeradresse, finale Versionsnummer, PDF-IDs und SHA-Prüfsummen prüfen.
- `customerFirestoreStore.mjs`: Quelle→Token-Index und Kundenofferte atomar registrieren; erfolgreiche Annahme höchstens einmal.
- `customerAirtableWriteback.mjs`: nach erfolgreicher Firestore-Transaktion denselben Airtable-Datensatz und die Dokumentversionen erneut prüfen, dann Annahme/Person/Zeitpunkt/Nachweis speichern. Unklarer PATCH = manuelle Überprüfung, kein automatischer zweiter Vertragsabschluss.
- `productionConfig.mjs` / `index.mjs`: bestehende Offerten-Webseite und Cloud-Portalcode auf eigenem Cloud-Run-Service. Standardmässig AUS; konfigurierter Dienst braucht benannte Firestore-DB, eigene Laufzeitidentität, Geschäftsarchiv-Lesezugriff und final freigegebene Unterlagen.
- `issueApprovedCustomerLink.mjs`: interner einmaliger Dry-Run und gesondert freizugebende Ausgabe eines persönlichen Links. Keine Kundennachricht.

## Nächste Prüfung im bestehenden Google Cloud Shell (nur lesen)

Ohne zusätzliche GCP-App-Verbindung kann ChatGPT hier die echten Cloud-Run-/Servicekonto-/Firestore-Ressourcen nicht selbst provisionieren oder auslesen. Im vorhandenen Checkout des Entwicklungsbranches kann der Betreiber ausführen:

```bash
git fetch origin feature/optional-avv-acceptance-staging-20261014
git show origin/feature/optional-avv-acceptance-staging-20261014:scripts/customer-pilot-cloud-readiness-readonly.sh | bash
```

Der Check liest nur den bestehenden GCP-Projektkontext und meldet für Cloud Run, Kunden-Dienstkonto und benannte Firestore-Datenbank **PASS** oder **OFFEN**; er führt keine Änderungen durch und gibt keine Secrets aus. `OFFEN` kann auch fehlende Leserechte bedeuten. Danach genau die fehlenden Ressourcen bereitstellen, statt zu raten.

## Noch konkret nötig vor echter Kundenofferte

1. **Kundendokumente binden:** Geschäftlich freigegebene **Projektbedingungen v1.0** als PDF `1d-EEo4AjsZBWvlYPlZLxxXuXJDBz7hWX` im Geschäfts-Drive-Produktionsarchiv vorhanden. **AVV-Master v1.0** als PDF `1MhQvRxB_OsiBhLXSkGeVL-jGutO3vM8x` in der gleichen Ablage; sie ist **nicht kundenspezifisch abgeschlossen**, Anlagen A/B/C im echten AVV-Ja-Fall tatsächlich ausfüllen/genehmigen lassen und eine eigene finale AVV-PDF erstellen. Hashes/geschäftliche Prüfentscheidung im [Freigaberegister](../../docs/LSZH_VERTRAGSFREIGABE_20261019.md). Vor Kunde: tatsächliche Drive-Dateihashes und ContentRestrictions prüfen.
2. **Vorhandene Google-Cloud-Basis prüfen, nicht neu erzeugen:** Der IAM-private Dienst `lszh-offer-portal`, die benannte Firestore-DB `lszh-offers` in Zürich, das Laufzeitdienstkonto und die Geschäfts-Drive-Ordnerfreigabe sind durch Cloud-Shell-Ausgabe und Drive-Readback bestätigt. Offen bleiben tatsächlicher Cloud-Run-Drive-API-Lesetest, notwendige Secret-Manager-Rechte/Secrets, Domain/HTTPS und aktiver Kundentest. Dienst bis dahin per `LSZH_PORTAL_PRODUCTION_ENABLED=false` deaktiviert lassen.
3. **Domain/HTTPS:** `https://portal.lszh-automations.ch` als tatsächliche Domain auf den Kundenservice konfigurieren und vollständige Origin/HTTPS-Funktion prüfen. Keinen Link auf die alte Website senden, solange deren `/offerte-annehmen/`-Backend nicht dieselbe echte Kundenroute nutzt.
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
