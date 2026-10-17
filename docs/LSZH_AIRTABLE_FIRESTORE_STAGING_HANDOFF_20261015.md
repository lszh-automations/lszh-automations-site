# LSZH – Airtable → Firestore (nur synthetisches STAGING, 15.10.2026)

## Status und Grenzen

**Implementiert und getestet:** `cloud-run/offer-portal-staging/airtableSyntheticImport.mjs` liest die exakten `cellValuesByFieldId`-Antworten der Airtable-Tabelle **Offerten** in Base `appzJiskpAdaR1HEv`, Tabelle `tbljeIUoD7wwKuSmS`, und bildet sie auf das Portal-Dokument der Firestore-Collection `lszh_staging_offers_v1` ab. Nur **synthetische**, noch nicht freigegebene Test-Entwürfe sind zulässig. Keine Roh-Tokens, echten Empfänger, Verträge, E-Mails, Statusänderungen in Airtable oder produktiven Annahmen.

**Eine technische Schreibfunktion existiert derzeit ausdrücklich nur für den lokalen Firestore-Emulator.** `seedOnlyLocalEmulator()` bezieht die tatsächlichen `process.env`-Werte selbst, akzeptiert ausschliesslich `FIRESTORE_EMULATOR_HOST=127.0.0.1:8088` mit `GCLOUD_PROJECT=demo-lszh-automations` und `db.projectId=demo-lszh-automations`, `db.databaseId=lszh-offers-staging`. Auf Cloud Run oder bei beliebigen anderen IDs verweigert sie den Schreibvorgang. **Kein echter Cloud-Firestore-Import und kein Cloud-Run-Deploy erfolgt.**

## Bestandsaufnahme des tatsächlichen Airtable-Schemas

Airtable wurde über den verbundenen Account **read-only** geprüft. Die notwendigen Quelldaten sind:

| Quelle in Airtable | Portal-Feld |
| --- | --- |
| Offertennummer | `offerNumber`, streng `TEST...NO_CONTRACT` |
| Online-Annahme Token-Hash | `tokenHash` (SHA256, nie Klartext) |
| Projektbedingungen Version | nur `TEST_v1.0_RC1` |
| Gültig bis | konservative synthetische UTC-Ablauffrist |
| Lead E-Mail | exakt ein Lookup, **nur `example.invalid`** |
| AVV erforderlich | `bundle.avv_required`: `Ja` / `Nein` |
| Online-Annahme Offerten Drive ID / Offerten-SHA256 | `bundle.quote` |
| Online-Annahme Bedingungen Drive ID / Bedingungen-SHA256 | `bundle.terms` |
| Online-Annahme AVV Drive ID / AVV-SHA256 / AVV-Version | `bundle.avv` und synthetische AVV-Kennung (nur bei `Ja`) |
| Einmalig CHF, Monatlich CHF | Preise im synthetischen `details`-Objekt |
| Status + Interne Notiz | `Entwurf`, Nachweis `TEST ONLY` und `NO CONTRACT` |
| Versand freigegeben; Online-Annahme rechtlich freigegeben; Echtbetrieb – kein Test; Vertragsunterlagen akzeptiert; AVV ausdrücklich akzeptiert | **alle müssen falsch/leer sein**, niemals automatisch aktivieren |

Details der Feld-ID-Zuordnung stehen unveränderbar als Konstanten in `SOURCE` des Importmoduls. Es wird **kein** vollständiger Airtable-Record in Firestore gespeichert, sondern nur die geprüfte Allowlist. Für AVV `Nein` dürfen keine AVV-Dateien oder -Version enthalten sein. Doppelte Drive-IDs, fehlende Hashes, echtes Empfänger-Domain, ein akzeptierter/versandter Status, Produktivfreigaben und andere Bases/Tables werden abgewiesen.

**Wichtiger Sonderfall:** Das Airtable-Datum ist in der Quelle nur ein Datum, kein Zeitpunkt. Der Testimport setzt vorsichtshalber den **Beginn** dieses Datums in UTC als Ablauf (damit keine zusätzliche Schweizer Uhrzeit erfunden wird). Das ist **keine Rechts- oder Produktionsregel**; sie muss für das spätere Portal explizit spezifiziert werden.

## Bestehende synthetische Offerte: nicht importfähig

Die über Airtable geprüfte bereits vorhandene AVV-Testofferte `TEST-HTTP-MAKE-AVV-20261014-NO-CONTRACT` ist weiterhin ein **Entwurf** mit AVV=`Ja`, synthetischem AVV-PDF-ID/Hash und AVV-Testversionskennung. Sie enthält derzeit aber **nicht alle erforderlichen Felder** des neuen Portalmodells: kein vollständiges Offerten-/Projektbedingungen-PDF-ID-/SHA-Paar, kein Online-Annahme-Token-Hash, keine synthetische Empfängeradresse im Lead-Lookup, keine vollständige `TEST_v1.0_RC1`-Bedingungsversion und kein festgelegtes Ablaufdatum. Es wurden absichtlich **keine** dieser Angaben ergänzt oder erfunden. Sie darf nicht stillschweigend als `sent`/`approved` importiert werden.

Für die spätere echte Cloud-STAGING-Durchlaufprüfung brauchen wir erst eine **vollständige, ausschliesslich synthetische neue Testofferte** mit 2/3 gesichert archivierten `TEST_ONLY`-PDFs im richtigen **geschäftlichen Drive-STAGING-Ordner**, sha256 gegen die **PDF-Bytes** geprüft, dedizierter `example.invalid`-Empfängeradresse, real generiertem Token-Hash (das Roh-Token nur testlokal), abgewogenem Ablaufdatum und festem Versionsstand. Kein Rückgriff auf alte reale Daten, fremde Tokens oder provisorische Kundenmails.

## Idempotenz und Konflikte

- Erster lokaler Import: `Firestore.create()` schreibt nur, wenn der Dokument-Schlüssel (SHA256 des persönlichen Tokens) noch nicht existiert.
- Exakt gleicher erneuter Import: `already_identical`, **kein Update**.
- Abweichendes Dokument bzw. bereits angenommene Offerte: `seed_conflict`, **kein Überschreiben**.
- Die ursprünglichen Felder `downstream.airtable`, `downstream.proofPdf` und `downstream.email` sind `disabled`, während die synthetische Portallogik intern `approved=true, status=sent` nur für die **isolierte Testsituation** setzen darf. Diese Flags sind **keine Freigaben in Airtable**, keine produktive oder juristische Zustimmung.

Bei der separaten Portalannahme ist die Firestore-Transaktion weiterhin genau einmalig und kontrolliert vor jedem externen Systemaufruf.

## Automatisierte Prüfung (bestanden)

GitHub Actions: https://github.com/lszh-automations/lszh-automations-site/actions/runs/38738225503

- Regulärer Testjob: **72 bestanden, 0 fehlgeschlagen, 2 emulatorabhängig übersprungen**; zusätzlich Startprüfung des reinen Leseprüfers / HTTP 503 bestanden.
- Firestore-Emulatorjob: **10 bestanden, 0 fehlgeschlagen**; enthält das synthetische `Firestore.create()`, no-op bei Wiederholung, Ablehnung von abweichender erneuter Übergabe und präzise Bereinigung.
- Die bisherige vollständige synthetische Portal-E2E-Prüfung (AVV `Ja`/`Nein`, je zwölf parallele HTTP-Annahmen und exakt ein Commit) bleibt erhalten.
- Die Emulator-Logs weisen darauf hin, dass er keine echte Trennung mehrerer Firestore-Datenbanken oder Cloud-IAM-Konfiguration nachbildet. Die **echte Datenbank-IAM-Isolation** ist also noch nicht geprüft.

## Was ausdrücklich NICHT passiert ist

Kein Live-Aufruf, der die geschäftliche Firestore-Datenbank beschreibt; kein produktives Cloud-Run-Deployment, keine Make-Szenario-Aktivierung, keine Airtable-Schreiboperation, keine Vertragsannahme eines Kunden, keine Einladung, keine E-Mail, kein rechtliches Go-Live. Die zuletzt bestätigte Cloud-Run-Readerrevision `00004-qt7` bleibt mit 100 % Traffic aktiv.

## Nächster sicherer Arbeitsabschnitt

1. Technisches und juristisches Datenführerschaftsmodell `Airtable-Offerte → Firestore-synthetisches Portal → idempotenter Outbox-Worker → Airtable` verbindlich modellieren; Cloud-Firestore darf keine Freigaben aus eigenem Antrieb erhalten.
2. Vollständig synthetische Offerten-/Bedingungen-PDFs und bei AVV=`Ja` die dritte Test-PDF in gesonderter Geschäftsstagingablage erzeugen, wieder einlesen und Hash/Berechtigung beweisen; keine echte Vertragsversion dafür verwenden.
3. Vor dem ersten realen Cloud-Staging-Seed eine **separate** eingeschränkte Cloud-Run-Prozedur mit schlüsselloser Dienstidentität, Test-ID-Allowlist, Ablauf, atomarem Create-Only und rückverfolgbarer Bereinigung entwickeln und reviewen. Niemals den Emulator-Code durch Setzen einer Umgebungsvariable auf Produktion umbiegen.
4. Erst nach ausdrücklicher technischer Freigabe eines isolierten Testdurchlaufs mit reinen Test-PDFs die echte Staging-E2E-Strecke (Airtable-Read → Drive-Read → Firestore-Create → internes Cloud-HTTP → Cleanup) testen. Anschliessend Signatur-/Rechts-/Sicherheitsprüfung vor einem Kundenstart.
