# LSZH – Keyless Firestore Connection (nur STAGING, Entwurf 15.10.2026)

**Keine produktive Annahme oder Cloud-Schreibberechtigung. Kein neuer Dienst wurde angelegt oder bereitgestellt.**

## Ausgangslage

- Bestehende Website: GitHub/Render (`server.js`), enthält Kunden-Offertenoberfläche und gesperrte Annahme-API.
- Bestehender Cloud Run Dienst `lszh-offer-portal-staging`: Revision `00004-qt7`, nachgewiesener **Preflight**, 100 % Traffic. Er hat `IDENTITY_PASS`, `DRIVE_PASS`, `FIRESTORE_READ_PASS`; kein nachgewiesener Offerten-Endpunkt. Er darf nicht überschrieben werden.
- Firestore Native: Projekt `lszh-automations`, **benannte** Datenbank `lszh-offers-staging`, Zürich `europe-west6`.
- Geschäftliches PDF-Archiv: Google Drive. Airtable bleibt CRM; Make übernimmt erst nach eindeutigem Abschluss die Folgearbeit.
- `offerAcceptance.js`: nicht atomarer Airtable-PATCH wurde auf dem Entwicklungszweig entfernt; ohne injizierte `commitAtomic` bleibt die Annahme HTTP 503.

## Im Entwicklungszweig vorbereitet

Neues Modul `stagingFirestoreConnection.js`:

1. Erstellt **nur auf expliziten Aufruf** einen SDK-Client für Projekt `lszh-automations`, **nicht** `(default)`, sondern `lszh-offers-staging`. SDK: `@google-cloud/firestore`. Installation und Packaging für einen künftigen separaten Cloud-Run-Dienst stehen noch aus; kein `npm install` auf den Live-Systemen.
2. Cloud-Run-Modus verlangt `K_SERVICE=lszh-offer-acceptance-staging` (zukünftiger, **noch nicht erstellter** Dienst), `GOOGLE_CLOUD_PROJECT=lszh-automations`, `LSZH_FIRESTORE_PROJECT_ID=lszh-automations`, `LSZH_FIRESTORE_DATABASE_ID=lszh-offers-staging`. Die bestehende Preflight-Revision wird damit bewusst **nicht** als neuer Schreiber benutzt.
3. Lehnt `GOOGLE_APPLICATION_CREDENTIALS` und `GOOGLE_CLOUD_KEYFILE_JSON` ab, um dort langfristige exportierte Google-Keys zu vermeiden. Stattdessen braucht der spätere Cloud-Run-Dienst eine eigene, minimal berechtigte Dienstidentität über das Google-Metadata-System; IAM bleibt separat zu konfigurieren.
4. Der Emulator-Modus verlangt zusätzlich die explizite Testmarkierung `LSZH_STAGING_EMULATOR_TEST=yes` und eine **lokale Loopback-Adresse** in `FIRESTORE_EMULATOR_HOST`. Keine externe Emulator-Adresse.
5. **Nur lesende Fassade:** `readFixture(fixtureId)` liest maximal einen Datensatz mit gültiger synthetischer ID aus `stagingOfferFixtures`. Der rohe Firestore-Client wird absichtlich nicht zurückgegeben. Die Fassade bietet **keine Schreib-/Transaktionsmethoden**.
6. Der Konstruktor validiert lediglich die Konfiguration und stellt einen Client bereit; `connected:false` macht klar, dass **kein echter IAM-/Datenbankkontakt nachgewiesen** wurde. Eine lesende Anfrage würde erst beim gezielten `readFixture()` erfolgen, wurde aber noch nicht an der Cloud-Datenbank ausgeführt.

**Wichtige Grenze:** Runtime-Umgebungsvariablen sind nur Schutz vor Fehlkonfiguration, **kein ausreichender Sicherheitsmechanismus gegen Angreifer**. Tatsächliche Autorisierung muss von Cloud Run IAM und Firestore IAM plus einer vertrauenswürdigen Aufruferidentität kommen. Die Fassade ist nicht für direkten Browserzugriff gedacht.

## Offline-Teststand

`test/stagingFirestoreConnection.test.js`: 6 Unit-Tests, mit injizierter Fake-Firestore-Klasse, prüfen geschlossene Default-Konfiguration, falsches Dienstkonto-/Projekt-/Datenbank-Setting, Verbot von Key-Dateien/remote Emulator, gültige DB-Auswahl, Read-only-Oberfläche und ID-Scope. **6/6 lokal unter Node.js 22 erfolgreich**; zusammen mit lokal verfügbaren bestehenden 9 Transaktions- und 3 Schema-Tests **18/18 bestanden**. Die separate GitHub-CI-Konfiguration wurde um den neuen Test erweitert; ein Actions-Lauf ist **noch nicht** bestätigt. Kein Firestore-Emulator und kein Live-Cloud-Lesetest wurden in dieser Phase durchgeführt.

## Integrationsentscheidung vor einem echten Annahmetest

Der bereits existierende Website-Host Render besitzt **keine nachgewiesene** kurzlebige Google-Cloud-Dienstidentität für den Aufruf eines IAM-geschützten Cloud-Run-Dienstes. Cloud Run verlangt für private Service-to-Service-Aufrufe ein Google-signiertes ID-Token mit korrekter `aud`-Angabe und expliziter Invoker-Berechtigung. Zwei sichere Wege:

- **Bevorzugt zur weiteren Prüfung:** Website-Backend/Annahme-API später auf Cloud Run mit eigener Dienstidentität betreiben, die Weboberfläche vorerst unverändert belassen. Erst nach sauberer Routing-/Reverse-Proxy- und Secret-Migrationsplanung; keine automatische Umstellung.
- **Alternativ:** Render nur mit nachgewiesener kurzlebiger Identitätsföderation an den neuen privaten Cloud-Run-Dienst anbinden; Render-Unterstützung, Schlüssel- und Refresh-Verfahren sind **nicht bestätigt**. Keine statischen JSON-Keys als bequeme Abkürzung.

**Nicht zulässig:** Eine direkt aus dem Kundenbrowser erreichbare, unauthentifizierte Firestore-Schreibschnittstelle oder das Verteilen von Dienstkonto-Keys an Render.

## Noch offen

1. Zielhosting und gesicherten Kommunikationskanal verbindlich entscheiden; keine neuen öffentlichen Dienste ohne Zustimmung.
2. Echtes Cloud-Run-Dienstkonto mit minimalen Datenbank-Berechtigungen, gesonderte IAM-Prüfung (keine Übernahme der Preflight-Berechtigungen durch Annahme).
3. Ein *explizit freizugebender* synthetischer Test in Firestore-Emulator inklusive konkurrierender Transaktionen, Crash/Wiederaufnahme und AVV-PDF-Byteprüfung.
4. Danach und **nur nach gesonderter Autorisierung** einen realen synthetischen Firestore-STAGING-Schreibtest in der benannten DB; kein produktiver Versand/Annahme.
5. Rechtliche RC1-/AVV-Freigabe und Beweis-/Archiv-/Airtable-Reconciliation vor produktiver Aktivierung.

Technische Quellen: https://docs.cloud.google.com/run/docs/authenticating/service-to-service sowie https://docs.cloud.google.com/run/docs/securing/service-identity .
