# LSZH Kundenportal – erster produktiver Pilot (Vorbereitung, kein Go-live)

Stand: 19.10.2026. Entwicklungsbranch `feature/optional-avv-acceptance-staging-20261014`.
Ziel: Eine freigegebene KMU-Offerte mit persönlichem Link online annehmen, Nachweis atomar sichern,
Airtable aktualisieren und danach die bestehenden Make-Bestätigungsszenarien benutzen.
**Der Cloud-Run-Dienst ist noch nicht deployed und kein Kunde ist freigegeben.**

## Bereits im Branch implementiert

- `approvedCustomerOffer.mjs`: ausschliesslich gültige, ausdrücklich freigegebene Kundenofferten aus Airtable akzeptieren, echte Empfängeradresse, finale Versionsnummer, PDF-IDs und SHA-Prüfsummen prüfen.
- `customerFirestoreStore.mjs`: Quelle→Token-Index und Kundenofferte atomar registrieren; erfolgreiche Annahme höchstens einmal.
- `customerAirtableWriteback.mjs`: nach erfolgreicher Firestore-Transaktion denselben Airtable-Datensatz und die Dokumentversionen erneut prüfen, dann Annahme/Person/Zeitpunkt/Nachweis speichern. Unklarer PATCH = manuelle Überprüfung, kein automatischer zweiter Vertragsabschluss.
- `productionConfig.mjs` / `index.mjs`: bestehende Offerten-Webseite und Cloud-Portalcode auf eigenem Cloud-Run-Service. Standardmässig AUS; konfigurierter Dienst braucht benannte Firestore-DB, eigene Laufzeitidentität, Geschäftsarchiv-Lesezugriff und final freigegebene Unterlagen.
- `issueApprovedCustomerLink.mjs`: interner einmaliger Dry-Run und gesondert freizugebende Ausgabe eines persönlichen Links. Keine Kundennachricht.

## Noch konkret nötig vor echter Kundenofferte

1. **Echte Enddokumente freigeben:** Projektbedingungen-PDF ohne `ENDKONTROLLE_NICHT_VERSENDEN`; bei AVV Ja finale projektspezifische AVV samt Anlagen, tatsächlich eingesetzte Subunternehmer, Datenarten, Regionen, Aufbewahrungs-/Löschfristen. Mit Geschäfts-Drive-IDs und SHA256 in Airtable referenzieren.
2. **Google Cloud bereitstellen:** Im vorhandenen Projekt `lszh-automations` (kein neues Projekt nötig) den Dienst `lszh-offer-portal` mit eigener dienstgebundener Identität `lszh-offer-portal@lszh-automations.iam.gserviceaccount.com` vorbereiten, Named Firestore `lszh-offers` in `europe-west6`, minimale Lese-/Schreibberechtigungen nur für diese DB/Collections, Drive-Lesezugriff für Geschäftsdokumente, getrennte Secret-Manager-Einträge, Cloud Run HTTPS. Die hier aufgeführten Ressourcen sind **Sollwerte**, nicht als existent bestätigt.
3. **Domain/HTTPS:** `https://portal.lszh-automations.ch` als tatsächliche Domain auf den Kundenservice konfigurieren und vollständige Origin/HTTPS-Funktion prüfen. Keinen Link auf die alte Website senden, solange deren `/offerte-annehmen/`-Backend nicht dieselbe echte Kundenroute nutzt.
4. **Laufzeitwerte:** `LSZH_PORTAL_PRODUCTION_ENABLED=true`, `LSZH_PORTAL_DATABASE=lszh-offers`, `LSZH_PORTAL_BUSINESS_ARCHIVE_FOLDER=1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in`, `LSZH_PORTAL_ORIGIN=https://portal.lszh-automations.ch`, `LSZH_PORTAL_TERMS_VERSION=<finale Version>`; `LSZH_PORTAL_PROOF_SALT` und `LSZH_AIRTABLE_ACCESS_TOKEN` nur aus Secret Manager. Zugangsdaten niemals in Chat, GitHub oder Logs.
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
