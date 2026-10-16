# LSZH – dauerhafte Benachrichtigungsentwürfe (Staging, KEIN Versand)

Stand: 16.10.2026. **Codeentwurf; kein Deployment, keine aktiven Scheduler, keine E-Mails.**

## Warum diese zusätzliche Komponente?

Eine Browserantwort oder Make-"Accepted" beweist nicht, dass die gesamte technische Onboarding-Eingabeverarbeitung fertig ist. Um einen Kunden *später* zuverlässig benachrichtigen zu können, muss ein Abschlussereignis dauerhaft, wiederholbar und ohne Duplikate vorgemerkt werden. Diese Stufe implementiert **nur dieses Vormerken**, noch nicht den Versand.

- Die unabhängig lesende Funktion `onboarding/confirmation.js` prüft das Onboarding in Airtable inklusive gegenseitiger Auftragsverknüpfung, Kundendaten und nötiger Datenschutz-Prüfaufgabe.
- Ein interner Abgleich ruft nur Onboardings mit Status `Eingegangen` oder `Vollständig` aus Airtable ab; ein 200 vom Make-Webhook genügt ausdrücklich nicht.
- Ausschliesslich bei `state=completed` wird ein Firestore-Dokument erzeugt:
  - ID = SHA-256 aus technischem Onboarding-Record-ID + fester Ereignisversion.
  - `eventType=ONBOARDING_INPUT_PROCESSED_V1`, `state=DRAFT_NOT_SENT`, `testOnly=true`, `deliveryEnabled=false`, `emailSent=false`.
  - **Keine** Empfängeradresse, kein Projektcode, keine Kontakt- oder Rechnungsdaten in Firestore.
- Firestore `createDocument(documentId)` ist atomar: erneute Abgleiche und parallele Worker erhalten 409, anschliessend prüft ein lesender GET die unveränderlichen Eigenschaften. **Keine** zweite Erzeugung, **kein** automatischer Versand.
- Nach Fehlern kann derselbe Vorgang erneut geprüft werden; bei Airtable-/Firestore-Ausfall wird kein positiver Abschluss behauptet. Das ist **keine** Garantie, dass eine zukünftige E-Mail exakt einmal beim Empfänger ankommt.

## Architektur und Sicherheitsgrenzen

```text
Airtable Website CRM (read-only)
  -> interne, zeitgesteuerte Cloud-Run-Abgleichsinstanz (später, STAGING)
       -> serverseitige Abschlussprüfung
       -> Firestore lszh_onboarding_notification_drafts_staging
            -> DRAFT_NOT_SENT / TEST_ONLY / DELIVERY_DISABLED
            X  KEIN Sendeszenario / KEIN Gmail / KEIN SMTP
```

Der Worker wird *nicht* in der öffentlichen Website gestartet. Nur die separate, authentifizierungspflichtige Cloud-Run-Instanz darf `POST /internal/reconcile` verarbeiten. Zusätzlich ist ein 32+ Zeichen Secret im Header `x-lszh-outbox-key` erforderlich. Cloud Run braucht eine dedizierte Dienstidentität mit minimalen Firestore-Rechten. Google Application Default Credentials kommen über die Cloud-Run-Metadatenidentität, **kein** JSON-Private-Key.

Pflicht-Konfiguration nur für gesondertes internes Staging:
- `LSZH_OUTBOX_STAGE_ENABLED=true` (standardmässig aus)
- `FIRESTORE_PROJECT_ID=lszh-automations` (zusätzlich zu intern fest verdrahtetem Projekt)
- `AIRTABLE_ONBOARDING_READ_TOKEN` (ausschliesslich `data.records:read` für die Website-CRM-Base; als Cloud Secret)
- `OUTBOX_CONTROL_SECRET` (zufällig, min. 32 Zeichen; als Cloud Secret)
- Firestore `(default)` muss im geschäftlichen Google-Cloud-Projekt existieren; tatsächlicher IAM-Zugriff noch **nicht geprüft**.

**Deployment-Plan, kein ausgeführter Befehl:** Vom Repository-Hauptordner aus den Worker in einem **separaten** Cloud-Run-Staging-Service deployen, Build-Kontext Repository-Stamm (wegen `../../onboarding/confirmation.js`) und Container-Startbefehl `node workers/onboarding-notifications/server.js`. Cloud Run `--no-allow-unauthenticated`, dediziertes Dienstkonto, geeignete Service-Account-IAM-Freigaben, kurze Requestfristen und Secret-Manager-Referenzen; vorher ohne Aktivierungsflag smoke-testen. **Nicht** das bestehende `lszh-offer-portal-staging` oder die Live-Website überschreiben.

Nach bestätigtem synthetischem Staging-Lauf kann ein privater Cloud-Scheduler-Job mit OIDC und dem zusätzlichen Secret `POST /internal/reconcile` periodisch auslösen. Bis dahin fehlt die **automatische Auslösung**; alleine mit diesem Branch erscheinen keine neuen Firestore-Ereignisse.

## Betriebsgrenzen / Abnahme vor Einsatz

1. Der Scanner liest seitenweise höchstens 200 passende Datensätze; bei mehr bricht er bewusst ohne Outbox-Anlagen ab. Vor einer Skalierung auf grössere Kundenmengen muss inkrementelles, dauerhaftes Paging oder eine separate Änderungs-Queue entwickelt werden.
2. Der Scanner begrenzt Airtable-GETs auf ca. vier Anfragen pro Sekunde und wiederholt 429/temporäre 5xx begrenzt. Ein abgebrochener Gesamt-Lauf ist unverbindlich; **keine** E-Mail wird ausgelöst.
3. Eine `409` auf existierenden, aber nicht plausiblen Ereignisdatensatz löst einen Fehler aus statt Überschreiben.
4. Abschluss meint die **technische Verarbeitung der Onboarding-Angaben**, **nicht** Projektabschluss, Make-Berechtigungsprüfung, Datenschutzfreigabe oder Offertenannahme.
5. Die spätere Versandkomponente benötigt ein **separates** Freigabe-/Zustandsmodell (sendefreigegeben, beansprucht, providerbestätigt, unsicher/manuell prüfen), robuste Provider-ID-Reconciliation und doppelte Sendesperre. Eine unklare Providerantwort darf **nicht** blind erneut senden. Dieser Versand ist **nicht implementiert**.
6. Inaktiv bleiben: Make-Originalscenario `7777695`, dessen Kundenmail `0=1`, sämtliche produktiven Offerten-/Annahmesysteme und rechtlichen Freigabepunkte.
7. HTTP-Gegenprobe des Website-Servers muss unautorisierte Zugriffe auf `/workers/**`, `/server.js`, `/.env`, `/docs/**` und Tests mit 404 ablehnen; die bekannten öffentlichen Routen bleiben erreichbar.

## Tests

Lokal im Repository:
```sh
node --test workers/onboarding-notifications/*.test.mjs
```

GitHub Actions: `.github/workflows/onboarding-notification-outbox.yml`. Es werden **nur synthetische Offline-Tests** ausgeführt; keine echten Airtable- oder Firestore-Schreiboperationen. Freigabeentscheidungen und Cloud-Konfiguration sind separat und ausdrücklich vom Geschäftsführer zu bestätigen.
