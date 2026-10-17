# LSZH Automations – Projektstand & Betriebsentscheidungen


## 17.10.2026 – Entwicklungsprinzip: unnötige Komplexität vermeiden / Offerten-Demo

**Leitentscheidung des Geschäftsführers:** LSZH Automations wird künftig konsequent nach „so einfach wie möglich, so sicher wie nötig“ entwickelt. Vor jeder neuen technischen Hürde prüfen: (a) konkreter Sicherheits-/Rechts-/Geschäftsnutzen, (b) einfachere Alternative, (c) Aufwand für Bedienung und Betrieb. Bei reinen fiktiven Design-Demos keine überflüssige Tokenpflicht; echte Kunden-, Vertrags- und Secret-Funktionen unverändert streng absichern.

**Umsetzung im ungemergten Offerten-Staging-Branch** `feature/optional-avv-acceptance-staging-20261014` und ausschliesslich auf der zugehörigen isolierten Render-STAGING-Instanz veröffentlicht (Produktion unverändert):
- Öffentlicher Zugriff ist **nur** auf `GET /offerte-annehmen/?demo=1` erlaubt, und nur wenn `SITE_PRIVATE=true`, `NODE_ENV=staging` und `OFFER_ACCEPTANCE_ENABLED=false`. Exakter Pfad, exakt ein `demo=1`-Parameter; harmlose, begrenzte UTM-Tracking-Parameter (z. B. `utm_source=chatgpt.com`) sind erlaubt, weil Browser-/Chat-Links sie automatisch anfügen. Echte `code`-/`preview`-Parameter und sonstige unbekannte Query-Parameter bleiben bei 503 gesperrt. Das fiktive Angebots-HTML verwendet lokale Musterwerte; Formular-Submit und PDF-Downloads sind im Demo-Modus deaktiviert.
- Sämtliche anderen GET-/HEAD-Routen (auch echte Offerten-URLs und Onboarding) sowie sämtliche POST-/API-Routen bleiben ohne Preview-Zugang auf HTTP 503. Durch den öffentlichen Demo-Aufruf wird **kein** Preview-Cookie gesetzt.
- `SITE_PRIVATE`, `OFFER_ACCEPTANCE_ENABLED`, Make, Airtable, Gmail und Produktionswebsite **nicht verändert**. Bestehender separater privater Preview-Mechanismus bleibt vorhanden für andere Staging-Bereiche.
- Lokale synthetische HTTP-Regression in `test/offerStaging.private.test.js` ergänzt: Demo 200, private Seiten und APIs 503, kein Cookie, keine Freigabe bei `NODE_ENV=production` oder aktivierter Vertragsannahme.
- **Bestätigt:** GitHub-Actions-Lauf `39068073401` vollständig `SUCCESS` (inklusive HTTP-Schutztests und Firestore-Emulator). Render-STAGING `srv-db88q5jncjis73f2g93g` nach ausdrücklicher Workspace-Bestätigung manuell auf Commit `6e6b8cfb7deeaa764e90c2442fd0dd5729d471ff` deployed (`dep-db9ttf7avr4c73fdabng`, Status `live`). Build erfolgreich, `node server.js` lauscht auf Port 10000. `autoDeploy=no` bleibt erhalten, Produktion unberührt. **Noch offen:** Externer Browser-GET-Nachweis `?demo=1&utm_source=chatgpt.com`; die Ausführungsumgebung konnte externe Render-HTTP-Aufrufe nicht direkt durchführen.

---


_Stand: 17.10.2026. Interne Arbeitsdokumentation. Keine Passwörter, API-Schlüssel oder Token hier eintragen._

## Geschäftsmodell / Eigentümerschaft

- LSZH Automations erbringt Beratung, Entwicklung, Einrichtung, Tests, Dokumentation und optionale Wartung für Schweizer KMU.
- **Kundenbetrieb:** Der Kunde nutzt eine eigene Make-Organisation und behält deren Kontrolle, Abrechnung, Ressourcen und Szenarien. Unser Zugang erfolgt über eine gezielte Einladung mit angemessener Berechtigung.
- Make-Pläne und -Credits werden vom Kunden direkt mit Make abgerechnet. LSZH stellt separat Dienstleistungen und laufende Betreuung in Rechnung.
- Der Erstkontakt und die Offerte setzen keine Registrierung bei Make voraus. Registrierung/Einladung folgen erst nach Annahme.
- Möglichst OAuth/Anbieterfreigaben verwenden. Keine Kundenpasswörter per Mail oder in Airtable abfragen.

## Prozess (verbindliches Zielbild)

1. Anfrage über LSZH-Website: Problem, Unternehmensdaten und Kontakt.
2. Rückfrage/Analyse, Offerte und allfällige vertragliche Vereinbarungen.
3. Annahme der Offerte und ausgelöstes Projekt-Onboarding.
4. Onboarding sammelt Rechnungsdaten, Anforderungen, Systemnamen, Status der kundeneigenen Make-Organisation und Stand der Einladung.
5. LSZH prüft Angaben, Kundenorganisation und benötigte Rollen. Bei Bedarf unterstützt LSZH Registrierung und Einladung.
6. Technische Verbindungen entstehen **in der Make-Organisation des Kunden**, möglichst durch den Kunden selbst mit OAuth.
7. Entwicklung, Funktionstests, Dokumentation, Kundenfreigabe und Go-Live im Kundenkonto.
8. Betrieb/Betreuung über separaten Servicevertrag. Kundeninhaberschaft und Freigaben bleiben erhalten.

## Bereits umgesetzt

- Öffentliche Website mit Kontakt, Leads, Offerten/Rechnungen und persönlichem Kunden-Onboarding (bestehender Prozess beibehalten).
- Formular `/onboarding/`: zusätzlicher Abschnitt **Make & technische Einrichtung** mit optionalem Organisationsnamen und Angaben zu Konto-/Einladungsstatus. Keine Secrets.
- Airtable `Kunden-Onboarding`: Felder **Make-Konto Status**, **Make-Organisation**, **Make-Einladung Status**, **Make-Einrichtung Hinweise**.
- Make `LSZH Kunden-Onboarding – Eingang`: Feldzuordnung auf diese Airtable-Spalten ergänzt.
- Make `LSZH Projekte – Onboarding anfordern`: Einladungsmail nach Offertenannahme erklärt das kundeneigene Make-Modell.
- Bestätigungsmail nach Onboarding: erklärt Organisation, Einladung und nächste Schritte.
- Kundenanleitung `/make-start/` erstellt und im Formular sowie in den E-Mails verlinkt.
- Drei alte Make-OAuth-Szenarien des früheren LSZH-eigenen Kontomodells als **ARCHIV – ALTES MODELL** gekennzeichnet und unverändert inaktiv belassen.
- Secure Transfer funktional mit Dummy-Schlüssel getestet: verschlüsselte Speicherung, einmaliger Abruf, Löschung der gespeicherten verschlüsselten Daten. Noch **nicht** für reale Kundenzugangsdaten freigegeben.

## Status / Sicherheit

- Onboarding-Anforderung und Eingangsszenario bleiben vorerst inaktiv, bis ein vollständiger Test mit einer vereinbarten Testofferte durchgeführt wurde. Keine unaufgeforderten Mails auslösen.
- Die Schlüssellieferung über Secure Transfer darf noch nicht produktiv eingesetzt werden, bis die Make-Webhooks authentifiziert und der parallele Abruf wiederholt getestet wurden.
- Neue Make-Verbindungen müssen gegen die jeweilige Kundenorganisation und deren Rollen geprüft werden. Alte LSZH-eigene OAuth-Automationen nicht reaktivieren.
- Make-Plan und Berechtigungen nach tatsächlichem Kundenbedarf prüfen. Nicht jedes Abonnement bietet identische Team-/Rollenoptionen.

## Nächste Tests

1. Neues Formular im Browser prüfen (Desktop / Mobile).
2. Mit freigegebenem Testprojekt Onboarding durchspielen; vier Make-Felder in Airtable kontrollieren.
3. Versand und Inhalt der zwei Kundenmails testen, bevor bisher inaktive Szenarien wieder aktiviert werden.
4. Einladung in eine vom Kunden verwaltete Testorganisation prüfen, ohne dessen Zugangsdaten einzusehen.
5. Kunden-Szenario dort erstellen, mit kundeneigener Verbindung autorisieren und Test/Übergabe dokumentieren.
6. Secure Transfer erst nach separater Security-Abnahme für Ausnahmen nutzen.

## Betrieb / Quellen

- [Website – Kunden-Onboarding](https://www.lszh-automations.ch/onboarding/)
- [Website – Make-Kundenanleitung](https://www.lszh-automations.ch/make-start/)
- [Make – Organizations](https://help.make.com/organizations)
- [Make – Teams](https://help.make.com/teams)
- [Make – Preise/Funktionen](https://www.make.com/en/pricing)

Letzte Architekturentscheidung: 13.10.2026 – Kunden besitzen ihre eigenen Make-Organisationen.


### Nachtrag 15.10.2026 – erste echte schlüssellose Cloud-Run-Archivprüfung PASS

**Erfolgreicher kundendatenfreier Cloud-Run-Lesetest per Geschäftsdienstkonto, vom Geschäftsführer mit Google-Cloud-Logs belegt:**
- Google Cloud Projekt `lszh-automations`, Dienst `lszh-archive-reader-staging`, Region `europe-west6` (Zürich), Node.js 22, Funktionseinstiegspunkt `archiveHealth`. Geschützter IAM-Aufruf und Ingress intern wurden beim Setup ausgewählt; keine Öffentlichkeit freigeben.
- Dienstidentität `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com`; das Konto besitzt ausschliesslich explizite Google-Drive-Lesefreigabe auf Geschäftsarchiv `1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in`. Organisationsrichtlinie `iam.managed.disableServiceAccountKeyCreation` blockiert dauerhaft herunterladbare Dienstkonto-Schlüssel und blieb **aktiv**.
- Verwendeter Code `cloud-run/archive-reader-staging/index.js` prüft via Cloud-Run-Metadata-Endpunkt Dienstkonto-E-Mail, bezieht kurzlebigen Google-OAuth-Token, liest die Metadaten eines fest vorgegebenen synthetischen AVV-Test-PDFs, kontrolliert Geschäftsordner, PDF-MIME, Dateigrösse, Drive Content Restriction `readOnly`, SHA-256-Checksumme und die tatsächlich heruntergeladenen PDF-Bytes. Keine Kunden-, Vertragsabschluss- oder Schreiboperationen.
- Die erste Funktion mit nicht abgewarteter Startprüfung protokollierte keine PASS/FAIL-Meldung. Beim aktualisierten Code mit Top-Level-`await` scheiterte ein Zwischen-Build wegen unvollständiger `index.js` beim manuellen Einfügen (`Unexpected end of input`), **kein** Google-Drive-/IAM-Fehler. Nach vollständigem Kopieren der Originaldatei ist die Cloud-Run-Revision **erfolgreich** bereitgestellt worden.
- **Original Google-Cloud-Logs / Screenshot vom 15.10.2026:** `2026-10-15 11:43:08.476 MESZ – LSZH_ARCHIVE_READER_STAGING: START`, unmittelbar danach `2026-10-15 11:43:09.746 MESZ – LSZH_ARCHIVE_READER_STAGING: PASS`, im Anschluss erfolgreiche Container-Startup-Probe und Cloud-Run-Revision Ready. Dies bestätigt die echte schlüssellose Archiv-Lese- und Byteintegritätsprüfung **für das synthetische PDF**.
- Google-Cloud-Billing laut Nutzerscreenshot Free-Trial mit CHF 250 Testguthaben (damals CHF 0.00 Kosten). Nicht als permanente kostenlose Umgebung behandeln, Guthaben-/Fristablauf beobachten.
- Noch **nicht** vollendet: authentifizierte, minimal berechtigte Render-zu-Cloud-Run-Verbindung bei internem Ingress; dynamische sichere PDF-ID-Zuordnung und Token-/Vertragsfreigabe, Migration alter Privat-Drive-Dateien, produktionsfähige End-to-End-Abnahme und später die juristische Prüfung. **Keine** öffentliche IAM-Invoker-Freigabe, keine produktive Offertenannahme/Versand aktivieren. Render-Staging und Draft PR getrennt von Live behalten.


### Nachtrag 15.10.2026 – schlüsselloser Reader für 2/3 PDFs vorbereitet, Architektur Render/Cloud Run geklärt

**Weiterarbeit ausschliesslich im Entwicklungszweig, ohne Cloud Run neu bereitzustellen:**
- Die bestehende private Cloud-Run-Staging-Funktion `lszh-archive-reader-staging` lieferte am 15.10.2026 mit einem synthetischen AVV-PDF **`LSZH_ARCHIVE_READER_STAGING: PASS`**; dieses reale positive Testergebnis gilt unverändert.
- Neu erstellt: `cloud-run/archive-reader-staging/archiveBundleVerifier.mjs`. Ein wiederverwendbarer interner, schlüsselloser Drive-Archivprüfer für **Offerte + Projektbedingungen** und optional **AVV**, bei dem ein erlaubtes, genau strukturiertes Dokumentenbündel mit Drive-Metadaten, Byte-Stream, SHA-256 und dem Geschäftsstaging-Parent abgeglichen wird; max. 12 MiB je PDF und keine Document-Bytes als Resultat. Negative Pfade (manipulierte PDFs, Parent, Restriktion, Meta, fehlende Rechte, zu grosser Body, unzulässige Input-IDs, Doppel-IDs) in `test/cloudRunArchiveBundle.test.js` geprüft. **GitHub Actions Build `38715878086`: 49/49 Tests erfolgreich**, einschliesslich der vorherigen Tests; Syntaxprüfung in CI ergänzend.
- **Noch nicht in Cloud-Run-`index.js` integriert oder auf den laufenden Dienst deployed**, denn der Reader soll bis zur expliziten Architekturentscheidung mit `Ingress=Intern` und IAM-only gesperrt bleiben. Dies ist keine echte Kunden-Drei-PDF-E2E-Probe und kein Live-Portal.
- Geprüfte Google-Dokumentation ergibt: Render ausserhalb der Google VPC kann den aktuell internen, IAM-geschützten Cloud-Run-Dienst **nicht unmittelbar** anrufen. Ohne eigenen zulässigen Netzwerkweg *und* eine IAM-kompatible Identität ist das keine schlüssellose Render-Cloud-Run-Verbindung. Weder IAM öffnen noch Ingress auf `Alle` ändern, noch geheime URL als Authentisierung behandeln.
- Die Varianten einschliesslich Empfehlung für die **spätere separate, streng token-geschützte Google-Cloud-Kundenannahmeoberfläche**, separater VPC/IAM-Render-Verbindung und einem internen Cloud-Job sind in [LSZH_ARCHIV_GATEWAY_ARCHITEKTUR_20261015.md](./LSZH_ARCHIV_GATEWAY_ARCHITEKTUR_20261015.md) erklärt. **Offener Go-Live-Entscheid:** Hosting des Kundenportals, Ende-zu-Ende-Identität, Datenschutz, Kosten und rechtlich belastbare Dokumentenablage. Der derzeitige Airtable Read/PATCH-Annahmeschritt ist nicht garantiert atomar über mehrere Instanzen, daher parallele Einmalannahme vor Produktivfreigabe technisch absichern.
- GitHub Draft-PR #5 weiterhin offen/ungemergt. Kontrolliert: Produktions-Render-`lszh-automations-site` weiter `main`, eigenes `lszh-offer-acceptance-staging` auf Featurebranch mit Auto-Deploy aus. **Keine Änderungen an Cloud-Run-Live-Konfiguration, Main-Branch oder Make-Freigaben** in dieser Weiterarbeit.


### Nachtrag 15.10.2026 – abgesichertes Cloud-Run-Vertragsportal mit atomarem Staging-Claim vorbereitet

**Auftrag `Vamos`:** Separates Kunden-Vertragsportal auf Cloud Run entwickeln, ohne sofortiges Go-Live, produktive E-Mails oder Kundenaktionen. Der bestehende Cloud-Run-Reader `lszh-archive-reader-staging` hatte am 15.10.2026 `LSZH_ARCHIVE_READER_STAGING: PASS` auf synthetischem AVV-PDF; dieser Google-Lesetest bleibt unangetastet.

**Neue Dateien nur im ungemergten Branch `feature/optional-avv-acceptance-staging-20261014`:**
- `cloud-run/offer-portal-staging/portalCore.mjs`: Angebot per SHA-256 des hochentropischen Einladungstokens, strikt geprüfter Angebotsstatus, Freigabe, Ablauf, Version, Empfänger-E-Mail, Dokumentenhashes und ausdrücklicher AVV-Zustimmung. Vor dem Claim muss die referenzierte Zwei-/Drei-PDF-Archivprüfung **erfolgreich** sein. Der Core enthält keinen direkten Schreib- oder Mail-Transport.
- `cloud-run/offer-portal-staging/firestoreOfferStore.mjs`: Firestore-**Transaktion** mit erneuter Lektüre und Angebots-Fingerprint (inklusive freigegebener Version, Datum, PDF-Dokumenten, Status und Revision). Nur der erste konkurrierende Aufruf darf auf `accepted` ändern. Transaktion enthält **keine** externe Drive-, Airtable-, Make- oder E-Mail-Aktion. Staging-Collection `lszh_staging_offers_v1` wird im Quellcode genannt, **existiert noch nicht**. Jeder Annahmedatensatz führt die Felder `downstream.airtable=disabled`, `downstream.proofPdf=disabled` und `downstream.email=disabled` – auch spätere Nacharbeiten sind noch nicht aktiviert.
- `cloud-run/offer-portal-staging/portalHttp.mjs`: HTTP-Adapter für später, **standardmässig deaktiviert** (`enabled!==true` → 503), nur POST-Pfade Preview/Accept, Origin-Prüfung, 12 KiB Body-Limit, JSON-only, no-store/noindex/no-referrer und sichere allgemeine Fehlertexte. Origin-Prüfung ersetzt **keine** Tokenauthentifizierung oder WAF-Ratelimit.
- `test/offerPortalStaging.test.js` und `test/offerPortalHttp.test.js`: Nur synthetische Fake-Transaktionen, parallele Annahmen, Time-of-Check/Time-of-Use-Änderungen, AVV Ja/Nein, doppelte Token, ungültige Eingaben, Origin und Überlänge. Die neueste GitHub-Actions-Prüfung meldet **63/63 Tests bestanden** (Workflow `38720668578`); nachfolgende Commits wurden ebenfalls geprüft oder warten auf Abschluss.

**Wichtig und noch ausdrücklich offen:** Es wurde **keine** Cloud-Firestore-Datenbank erstellt oder verändert, **kein** neuer Cloud-Run-Portal-Service deployt, kein Firestore-Write-IAM vergeben, **kein** reales Transaktions-E2E ausgeführt. Der bisherige Drive-Reader bekommt **keine** Schreibrechte. Produktiver LSZH-Render auf `main`, privater Staging-Render mit AutoDeploy off, Cloud Run Reader intern mit IAM, Make-Angebotsszenarien inaktiv. Getestete Firestore-Logik arbeitet bisher **gegen einen Mock**, nicht den produktiven Google-Dienst. Neues Portal ist kein rechtswirksamer, freigegebener Vertragsabschluss.

**Bevor ein Kundenportal erreichbar wird:** Separaten Cloud-Run-Dienst und dessen eigene minimal berechtigte Google-Service-Identity projektieren; Firestore Native in Zürich nur für fiktive Tests anlegen, Kosten/Datenschutz klären und mit echter Datenbank unter konkurrierenden Anfragen testen. Beweiskette/atomare Datenführerschaft Firestore ↔ Airtable ↔ Make und eine bewusst erst später aktivierbare Versand-/PDF-Outbox implementieren; im Anschluss browserseitige Dokumentansicht, sichere Einzel-PDF-Downloads, Rate Limits, Abuse/XSS/CSRF-Tests und separate Go-Live-Freigabe. Juristische Prüfung Projektbedingungen/AVV bleibt auf später verschoben. **Keine** Render-Cloud-Run-Verbindung durch Öffnen des bestehenden internen Reader-Ingress.

Technisches Detailhandbuch: [cloud-run/offer-portal-staging/README.md](../cloud-run/offer-portal-staging/README.md). Firestore-Transaktionsreferenz: https://firebase.google.com/docs/firestore/manage-data/transactions


### Nachtrag 15.10.2026 – Cloud-Firestore-Staging technisch vorbereitet und Emulator-Paralleltest bestanden

**Nur sicherer Entwicklungszweig, keine Live-Änderungen:** Die fehlende direkte Google-Cloud-Administration wurde geprüft; derzeit gibt es **kein** verbundenes Google-Cloud- oder Cloud-Run-Administrationswerkzeug. Daher **keine** Datenbank oder IAM-Rolle in Google Cloud erstellt, kein Rechnungs-/Abonnementvorgang eingeleitet.

**Neue Architektur eindeutig festgelegt:** `lszh-offers-staging` ist eine **benannte** Firestore Native/Standard-Datenbank in Zürich (`europe-west6`), die explizit statt `(default)` gewählt wird. Für zukünftiges Cloud Run Portal eigene Dienstidentität `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com` mit IAM-Condition nur für die genannte Datenbank; **keine** Firestore-Writer-Rechte für den bereits existierenden Google-Drive-Archive-Reader und keine herunterladbaren JSON-Schlüssel. Separates Container-/Cloud-Run-Paket unter `cloud-run/offer-portal-staging/` und `cloud-run/Dockerfile.offer-portal-staging` mit Funktionen-Framework, Firestore SDK, Google Application Default Credentials und dem intern importierten 2-/3-PDF-Prüfer. **Noch nicht als Container oder Cloud-Run-Dienst bereitgestellt; IAM und echter Google-Zugriff noch nicht getestet.**

**Fail-Closed:** `stagingConfig.mjs` aktiviert Staging nur bei explizit `LSZH_PORTAL_STAGING_ENABLED=true` und passenden Projekt-, Datenbank-, Archivordner-, Testversion-, Cloud-Run-Service-/Revision-, Origin- und Geheimnisvorgaben; ansonsten verweigert es, ohne DB-/Drive-Zugriffe zu starten. `index.mjs` verifiziert die Cloud-Run-Service-Identity gegen das separate Portal-Dienstkonto und nutzt nur die benannte Firestore-Datenbank mit regionalem `firestore.europe-west6.rep.googleapis.com`-Endpunkt. Als Ziel ist weiterhin alles deaktiviert. Während der Entwicklung enthüllten Negativtests eine zu schwache Revision-Prüfung; sie wurde behoben, bevor weitere Cloud-Arbeiten stattfinden. Live-Aktivierung weiterhin ausdrücklich untersagt.

**Echter Emulator statt nur Mock:** `test/firestoreEmulator.integration.test.js` läuft über separaten GitHub-Actions-Job mit offiziellem Firestore-Emulator auf lokalem `127.0.0.1:8088` im sicheren Demo-Projekt `demo-lszh-automations`, DB-ID `lszh-offers-staging`. **12 parallele Annahmeversuche gegen echte Firestore-Transaktionsengine: exakt 1 Erfolg, 11 Ablehnungen**, `revision=2`, keine Nebenwirkungen (`downstream.email/proofPdf/airtable=disabled`). Workflow `38722305390`: beide Jobs grün – im normalen Testjob **67 bestanden, 1 emulatorabhängiger Test übersprungen**; im dedizierten Emulatorjob **1 tatsächlicher Integrationstest bestanden**. Das ist **kein** echter Google-Cloud-DB- oder IAM-Test. Neuere Dokumentationscommits nur auf dem Featurebranch.

**Kosten und Freigabe:** Google dokumentiert, dass Firestore nur eine free-tier-fähige Datenbank pro Projekt hat; für benannte Datenbanken ist nutzungsabhängige Abrechnung möglich bzw. laut Firestore-Preisdokumentation von der kostenlosen Quote ausgeschlossen. Bei der tatsächlichen Erstellung zuerst Kosten und bestehende Datenbanken prüfen (die angezeigten 250 CHF Free-Trial-Guthaben sind ein früherer Screenshot, nicht ein aktuell verifizierter Betrag). Keine neu angelegte abrechnungsfähige Ressource. Erst nach Nutzerfreigabe in Google Cloud eigene Test-DB und eigenes Portal-Dienstkonto erstellen und minimale, **konditionierte** `roles/datastore.user`-Rolle zuweisen; echte synthetische Firestore-Transaktion plus negative IAM-Tests abnehmen. `(default)` nicht als stillen Ersatz verwenden.

**Konkrete Schritt-für-Schritt-Anleitung:** [LSZH_FIRESTORE_STAGING_SETUP_20261015.md](./LSZH_FIRESTORE_STAGING_SETUP_20261015.md). Technische Detaillierung: [offer-portal-staging/README.md](../cloud-run/offer-portal-staging/README.md). Produktive Render-Website, bestehender privater Cloud-Run-Drive-Reader, Make-Szenarien, Airtable-Kundendaten und juristische RC1-Freigabe **unverändert**.


### Nachtrag 15.10.2026 – Firestore-Testdatenbank durch Kontoinhaber angelegt

Der Geschäftsführer hat in der Google Cloud Console im Geschäftsprojekt `lszh-automations` die **benannte Firestore-Datenbank `lszh-offers-staging`** erstellt. Sein Screenshot zeigt die Seite `Datenbank: lszh-offers-staging` und die Meldung `Ihre Datenbank ist bereit. Sie können jetzt Daten hinzufügen.`; zum Zeitpunkt des Screenshots **keine Collections bzw. Datensätze sichtbar**. Zuvor im Einrichtungsdialog bestätigt: Firestore Standard, restriktive Web-/Mobile-Regeln, Region `europe-west6` (Zürich), PITR und automatische tägliche/wöchentliche Sicherungen ausgeschaltet, von Google verwaltete Verschlüsselung. Die tatsächliche Datenbank- und IAM-Einstellung wurde von uns **nicht** per Google Cloud Admin-API geprüft; der Screenshot belegt den UI-Bereitschaftsstatus.

**Nächste manuelle Aktion:** Im Projekt ein eigenes Dienstkonto `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com` ohne Projektrollen/JSON-Schlüssel erstellen; danach die **datenbankspezifisch eingeschränkte** IAM-Zugriffsberechtigung gründlich konfigurieren und erst mit synthetischen Daten reale Cloud-Firestore-Transaktionen prüfen. Es ist noch **kein** Portalservice deployt, keine Datensammlung angelegt, keine produktive Offerte angenommen, keine E-Mail versendet. Google-Drive-Reader-Identität und Live-Systeme unverändert. Die benannte Testdatenbank kann nutzungsabhängige Kosten verursachen.


### Nachtrag 15.10.2026 – Portal-Staging-Dienstkonto angelegt, IAM-Bindung noch ausstehend

Der Geschäftsführer hat das **separate Google-Cloud-Dienstkonto** `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com` im Geschäftsprojekt `lszh-automations` erstellt; sein Screenshot zeigt den Status **Aktiviert** und den Namen `LSZH Offer Portal Staging`. Dies belegt **noch keine** Firestore-IAM-Rolle, keine Schlüssel-Einstellung und keine Laufzeitverbindung. Die benannte Firestore-Stagingdatenbank `lszh-offers-staging` in Zürich wurde zuvor durch UI-Screenshot als bereit nachgewiesen.

**Nächste Schritte, nicht ausgeführt:** Auf der **Projekt-IAM-Seite**, nicht dem Dienstkonto-Reiter `Berechtigungen`, die Rolle `roles/datastore.user` ausschliesslich mit einer **IAM-Bedingung** `resource.name == "projects/lszh-automations/databases/lszh-offers-staging"` für den neuen Service Principal erteilen. Laut Google ist dies der unterstützte Weg, per Database Resource-Name die Datenbank auf Server-/API-Zugriff zu begrenzen; Google-Cloud-Console-Datenbankansicht ist kein verlässlicher Test für bedingten Datenbankzugriff. Vor Save prüfen, dass keine bedingungslose oder geerbte breitere Firestore-Bindung existiert. Später einen erlaubten Test gegen die benannte DB und einen negativen Test gegen andere DB-IDs unter derselben Identität durchführen. Keine Owner/Editor/Admin-Rolle, keinen JSON-Schlüssel, keine Rechteänderung am bestehenden Archiv-Reader. Produktivsysteme unverändert; rechtliche Prüfung weiterhin verschoben.

Quellen: https://firebase.google.com/docs/firestore/manage-databases ; https://docs.cloud.google.com/iam/docs/managing-conditional-role-bindings .


### Nachtrag 15.10.2026 – bedingte Firestore-IAM-Zuweisung vom Nutzer als erstellt gemeldet

Der Geschäftsführer meldete unmittelbar nach dem IAM-Dialog, die **bedingte Rollenbindung erstellt/gespeichert** zu haben. Im vorausgehenden Screenshot war das Servicekonto `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com` als Prinzipal mit Rolle `Cloud Datastore-Nutzer (roles/datastore.user)` ausgewählt; die beabsichtigte IAM-Bedingung ist `resource.name == "projects/lszh-automations/databases/lszh-offers-staging"` (Titel `LSZHOnlyStagingFirestore`). **Die tatsächlich persistierte Bedingung und die vollständige Liste anderweitiger IAM-Zuweisungen wurden noch nicht aus der Google-Cloud-Console oder API verifiziert**. Kein Zugriff auf die produktive oder Default-Datenbank als erlaubt behaupten. Google bestätigt grundsätzlich Unterstützung bedingter Firestore-Datenbankzugriffe, weist aber darauf hin, dass der Console-UI-Zugriff die IAM-Conditions für Datenbanken nicht verlässlich erzwingt; echte Positiv-/Negativ-API-Tests sind nötig. Nach IAM-Änderungen bis ca. fünf Minuten Caching beachten. Keine Schlüssel angelegt, kein Cloud-Run-Portal bereitgestellt, keine Produktivaktionen durchgeführt.

**Nächste Verifikation:** Unter Projekt-IAM prüfen, dass nur die bedingte `roles/datastore.user`-Bindung am separaten Portal-Staging-Dienstkonto erscheint (keine unbedingte/breitere Rolle). Screenshot der aufgeklappten Rolle/Bedingung oder reiner Policy-Auszug ohne Secrets. Danach Geschäft-Drive-Ordner separat mit Viewer-Rechten für dieses Dienstkonto freigeben und einen **synthetischen** Google-Cloud-Firestore-Positivtest sowie negativen Test gegen andere DB-IDs unter dem neuen Principal aufsetzen, erst mit klarer Freigabe der Infrastruktur. Bestehender Archiv-Reader bleibt unverändert.


### Nachtrag 15.10.2026 – Firestore IAM-Bedingung im CEL-Editor visuell bestätigt

Im Screenshot des geschäftlichen Google-Cloud-UI zum separaten Dienstkonto `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com` zeigte der gespeicherte Bedingungseditor den **genauen IAM-CEL-Ausdruck** `resource.name == "projects/lszh-automations/databases/lszh-offers-staging"` und den Titel `LSZHOnlyStagingFirestore`; die zuvor gespeicherte Rolle war `Cloud Datastore-Nutzer` (`roles/datastore.user`). Damit sind Text und Ziel-Datenbank **visuell bestätigt**, aber die aus der Policy abgeleiteten Zugriffe und mögliche andere/geerbte Rollen bleiben ohne positiven und negativen Firestore-API-Test noch ungeprüft. Im Editor wurden keine inhaltlichen Änderungen beauftragt. Bestehender Cloud-Run-Archivprüfer und Kundenszenarien unverändert.

Nächster geplanter manueller Schritt: Den **geschäftlichen Google-Drive-Vertragsarchiv-STAGING-Ordner** `1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in` gezielt **als Leser** (nicht Editor) an das separate Portal-Staging-Dienstkonto freigeben, ohne allgemeine Linkfreigabe. Danach echte Cloud-Firestore- und Drive-Lese-Zugriffstests ausschliesslich mit synthetischen Daten. Keine Kundenmails oder produktive Vertragsannahme aktivieren.


### Nachtrag 15.10.2026 – Portal-Dienstkonto erhält Geschäftsarchiv-Leserfreigabe, Cloud-Run-Preflight vorbereitet

Der Geschäftsführer hat die **Leser-Freigabe des geschäftlichen Vertragsarchiv-STAGING-Ordners** `1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in` an das separate Portal-Dienstkonto `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com` als **erteilt** bestätigt. Aktuelle Art und Vererbung der Drive-Berechtigung wurden durch uns noch **nicht** über das Portal-Dienstkonto/API verifiziert; allgemeiner Zugriff soll weiter `Eingeschränkt` sein. Die benannte Firestore-Stagingdatenbank `lszh-offers-staging` wurde davor als bereit und leer bestätigt; die konditionierte Cloud-Datastore-User-Rolle und der genaue CEL-Ausdruck `resource.name == "projects/lszh-automations/databases/lszh-offers-staging"` sind per Nutzer-Screenshots visuell bestätigt.

**Neuer isolierter Cloud-Run-Preflight im Entwicklungszweig:** `cloud-run/offer-portal-preflight/{index.js,package.json,README.md}`. Er ist für den noch **nicht** angelegten separaten Cloud-Run-Dienst `lszh-offer-portal-staging` (Zürich) ausgelegt und prüft bei Start mit dessen eigener kurzlebiger Google-Dienstidentität (a) exakte Principal-E-Mail, (b) Geschäftsarchiv-Zugriff und SHA-256-Bytes eines **festen synthetischen PDFs** und (c) einen **nur lesenden** HTTP-200-`listDocuments`-Zugriff auf die benannte Firestore-Datenbank, ohne Collections anzulegen. HTTP-Handler liefert absichtlich immer 503 `staging_disabled`. IAM-Authentifizierung, **Ingress Intern**, max. eine Instanz, keine E-Mails, keine PDF-/Firestore-Schreibaktion. Der Preflight ist **noch nicht** auf Google Cloud bereitgestellt oder ausgeführt. GitHub Actions prüft lediglich JavaScript-Syntax. Eine funktionierende Firestore-Leseliste testet noch **keine** Schreibrechte oder die Ablehnung anderer Datenbanken; hierfür separate Positiv- und Negativtests auf synthetischen Daten nötig.

**Nächste manuelle Aktion:** Zweiten *neuen* Cloud-Run-Staging-Dienst `lszh-offer-portal-staging` unter dem exakt gleichen Portal-Dienstkonto, IAM-Authentifizierung/Ingress Intern, Node.js 22 erstellen; nur Preflight-Code per Editor einfügen. Nicht den bestehenden `lszh-archive-reader-staging` ändern oder den umfangreicheren `offer-portal-staging/index.mjs` deployen. Die ausführliche Schrittfolge steht unter [cloud-run/offer-portal-preflight/README.md](../cloud-run/offer-portal-preflight/README.md). Nach `LSZH_PORTAL_PREFLIGHT: PASS` schrittweise reine Test-Schreib-/Transaktionsprüfung isoliert gestalten. Kein Go-Live oder juristische Prüfung erfolgt.


### Nachtrag 15.10.2026 – Google-Cloud-Portal-Preflight erfolgreich

**Durch Screenshot des Geschäftsführers aus Cloud Run bestätigt (15.10.2026, MESZ):** Der neue **separate** Cloud-Run-Dienst `lszh-offer-portal-staging` in `europe-west6` wurde erstellt und ein ausschliesslich **lesender Preflight** als Revision `lszh-offer-portal-staging-00002-xdh` erfolgreich bereitgestellt. Die Logs zeigen `13:35:33.731 LSZH_PORTAL_PREFLIGHT: START`, `13:35:33.857 IDENTITY_PASS`, `13:35:35.100 DRIVE_PASS`, `13:35:35.207 FIRESTORE_READ_PASS` sowie `13:35:35.207 PASS`. Anschliessend war die Cloud-Run-Startup-Probe erfolgreich und die neue Revision `Ready`.

**Technischer Nachweis:** Das tatsächliche Runtime-Dienstkonto entsprach `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com`. Es konnte **ohne herunterladbare Dienstkontoschlüssel** das synthetische Geschäftskonto-Staging-PDF anhand Parent-Ordner, Metadaten, Content Restriction und heruntergeladener SHA256-Bytes prüfen und eine HTTP-200-Leseabfrage auf der **benannten Firestore-Testdatenbank `lszh-offers-staging` in Zürich** durchführen. Das war ein echter API-Test, nicht nur ein Simulator.

**Sicherheits- und Testgrenzen:** Der HTTP-Endpunkt des reinen Preflights liefert weiterhin ausschliesslich `503 staging_disabled`, keine Annahme oder Kundendaten. Nach Setup per Nutzerscreenshot `Ingress=Intern` und `IAM-Authentifizierung erforderlich`, Laufzeitidentität des Portal-Dienstkontos. **Noch nicht** nachgewiesen: Firestore-Schreibzugriff, negativer IAM-Test gegen andere Datenbanken bzw. mögliche andere/geerbte IAM-Bindungen, reale transaktionale Mehrfachannahme in Cloud Firestore, vollständiger PDF-Bündeltest oder Kundenportal-End-to-End. Bestehender privater Cloud-Run-Archiv-Reader unverändert. Keine Kundenmails, externen Einladungen, Vertragsabschlüsse, produktiven Make-Szenarien oder Live-Websitedeploys.

**Nächster sicherer Meilenstein:** Ausschliesslich synthetischen Cloud-Firestore-Transaktionstest mit separater positiver und negativer IAM-Zugriffskontrolle vorbereiten, erst danach kontrolliert aktivieren; Portal selbst weiterhin deaktiviert. Die juristische Prüfung von Vertragsdokumenten bleibt wie beschlossen verschoben.


### Nachtrag 15.10.2026 – realer Firestore-Schreib-/Parallelitätstest zur Bereitstellung vorbereitet

**Vom Geschäftsführer autorisierter nächster technischer Staging-Meilenstein `Vamos`:** Neue temporäre Testimplementierung `cloud-run/offer-portal-transaction-smoke/{index.js,transactionTest.mjs,package.json,README.md}`, **nur auf dem ungemergten Entwicklungszweig, noch NICHT nach Google Cloud bereitgestellt**. Ihr genauer Einsatzplan und die Wiederherstellung des vorherigen read-only Cloud-Run-Preflight sind in [cloud-run/offer-portal-transaction-smoke/README.md](../cloud-run/offer-portal-transaction-smoke/README.md) dokumentiert.

Der bisherige reale Cloud-Run-Preflight am 15.10.2026 zeigte nachweisbar `IDENTITY_PASS`, `DRIVE_PASS`, `FIRESTORE_READ_PASS` und `PASS` für das neu angelegte Portal-Dienstkonto und die Zürcher `lszh-offers-staging`-DB. Noch kein echter Firestore-**Schreib**nachweis oder sicherer negativer IAM-Test.

**Neue temporäre Testrevision, nach manueller Freigabe durch Cloud-Run-Admin:** Wie zuvor weiterhin `lszh-offer-portal-staging`, `europe-west6`, IAM + Intern, Servicekonto `lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com`, Funktionsziel `lszhPortalPreflight`; HTTP bleibt *immer* 503 `staging_disabled`. Der Test überprüft erst die tatsächliche Identity und fragt zum Vergleich **nur lesend** eine synthetische Collection in der alternativen `(default)`-DB ab: explizites **DENIED** wäre positiver Negativbeleg, **NOT_FOUND** bleibt als **INCONCLUSIVE_DB_ABSENT** (kein Sicherheitsbeweis) und unerwartet erfolgreicher Zugriff bricht ab, **bevor** Schreibtests starten. Danach `ref.create()` in **ausschliesslich** `lszh_synthetic_txn_smoke_v1` mit kryptografisch zufälligem Identitätsmarker, 12 parallele SDK-Firestore-Transaktionen: genau ein Statuswechsel `sent → accepted` / Revision `1 → 2`, elf Wiederholungen ohne weitere Mutation. Geschützte Löschung mit Markerprüfung und Readback in `finally`; ohne bestätigte Bereinigung **kein PASS**. Keine Kunden-, Offerten- oder PDF-Daten und keine Make-/Airtable-/E-Mail-Operationen.

**Automatisch bereits nachgewiesen:** Workflow `38729580092` (GitHub Actions): **67/67 reguläre Tests PASS** (1 Emulator-Test dort wie vorgesehen übersprungen), im separaten Firestore-Emulatorjob **2/2 Integrationstests PASS**, darunter der **exakte neue Smoke-Transaktionskern** mit 12 konkurrierenden Transaktionen und geschützter Löschung. Kein Live-Google-Cloud-Schreibtest vor manueller Testrevision. Der Report mit geringfügig verbesserter, sicherer Fehlerkategorisierung wurde danach auf dem Entwicklungszweig angepasst; weitere CI-Prüfung läuft bei Änderungen am Quellcode automatisch.

**Betriebliche Vorsicht:** Sobald die temporäre Cloud-Run-Testrevision manuell eingespielt und protokolliert wurde, unbedingt den vorherigen reinen Lese-`index.js` / `package.json` aus `offer-portal-preflight` wiederherstellen und `transactionTest.mjs` entfernen. Ein Cold Start kann den Test bei jeder neuen Instanz wiederholen. Währenddessen kein öffentliches Ingress, keine unauthentifizierten Invoker, kein JSON-Schlüssel. Mögliche Kosten geringer realer Firestore-Operationen beachten. Eine nicht vorhandene `(default)`-DB ist **kein** negativer IAM-Test und soll nicht extra angelegt werden. Cloud-Run-Staging-Portal weiterhin nicht als echtes Vertragsportal aktiv.


### Nachtrag 15.10.2026 – echter Cloud-Run-Transaktionstest gestartet, Endzustand unbestätigt

Der Geschäftsführer hat die temporäre Firestore-Schreibtestrevision des separaten Cloud-Run-Staging-Dienstes `lszh-offer-portal-staging` eingespielt. Seine Cloud-Run-Log-Screenshots zeigen am **15.10.2026 13:55:28 MESZ**:
- `LSZH_PORTAL_TX_SMOKE: START`
- `LSZH_PORTAL_TX_SMOKE: IDENTITY_PASS`
- `LSZH_PORTAL_TX_SMOKE: IAM_NEGATIVE_INCONCLUSIVE_DB_ABSENT` (die alternative `(default)`-Firestore-Datenbank ist nicht verfügbar; **KEIN** positiver IAM-Isolationsnachweis).

**Wichtige Befundgrenze:** In den Screenshots sind **KEINE** `TRANSACTION_PASS`, `CLEANUP_PASS`, `PASS` oder `FAIL`-Meldungen aus der temporären Revision sichtbar. Der Rollout war kurz danach als bereit gekennzeichnet, aber das beweist weder Schreibrecht noch Abschluss/Bereinigung. Ob das synthetische Dokument in `lszh_synthetic_txn_smoke_v1` erstellt, verändert oder gelöscht wurde, ist bis zur Prüfung dieser Sammlung **unbekannt**. Keine produktive Vertragsannahme, keine externen Mails nachgewiesen. Nicht erneut bereitstellen oder Testcode starten, bevor Datenzustand kontrolliert ist.

**Mögliche Ursache, NICHT bestätigt:** Die temporäre Testrevision startet Firestore-Asynchronarbeit beim Cloud-Run-Start. Der Dienst verwendet **anfragebasierte CPU-Abrechnung** mit min. 0 Instanzen; nach Startup und ohne Anfragen kann CPU stark eingeschränkt sein, sodass Hintergrundarbeiten nicht zuverlässig fortgesetzt werden. Siehe https://docs.cloud.google.com/run/docs/configuring/billing-settings und https://docs.cloud.google.com/run/docs/container-contract. Bei einem gestarteten, dann stockenden Firestore-Test besteht die Möglichkeit eines halbfertigen synthetischen Dokumentes. Deshalb erst Logs (aktuellen Zeitraum, Filter löschen, alle Severity), dann in der **benannten** Firestore-Datenbank die separate `lszh_synthetic_txn_smoke_v1`-Collection ansehen. **Niemals** `lszh_staging_offers_v1` oder Kunden-/Vertragsdaten löschen. Falls kein Abschluss zu sehen ist, nach Sichtung des Testzustands temporären Cloud-Run-Code auf den sicheren, rein lesenden Preflight `cloud-run/offer-portal-preflight` zurücksetzen, ohne weiteren Testlauf. Für echte einmalige Transaktionstests künftig **Cloud Run Job** (kontrollierter einmaliger Aufruf mit CPU bis Prozessende), nicht asynchrone Startup-Arbeit eines anfragebasierten Webdienstes.


### Nachtrag 15.10.2026 – echter Google-Cloud-Firestore-Transaktionstest PASS, Cleanup bestätigt

Der Geschäftsführer hat neue Screenshots der **internen Google-Cloud-Run-Logs** der separaten Staging-Revision `lszh-offer-portal-staging-00003-778` vorgelegt. Am **15.10.2026, 13:55:28–13:55:30 MESZ**, stehen dort:
- `LSZH_PORTAL_TX_SMOKE: START`
- `LSZH_PORTAL_TX_SMOKE: IDENTITY_PASS`
- `LSZH_PORTAL_TX_SMOKE: IAM_NEGATIVE_INCONCLUSIVE_DB_ABSENT` – die Kontroll-Datenbank `(default)` fehlt, **kein positiver Negativ-IAM-Nachweis**.
- `LSZH_PORTAL_TX_SMOKE: TRANSACTION_PASS (12_ATTEMPTS_1_COMMIT_11_DECLINED)`
- `LSZH_PORTAL_TX_SMOKE: CLEANUP_PASS`
- `LSZH_PORTAL_TX_SMOKE: PASS` (13:55:30.269).

**Technisches Resultat: ERFOLGREICH.** Die eigens dafür verwendete Firestore-Test-Collection `lszh_synthetic_txn_smoke_v1` in der benannten Geschäftskonto-Datenbank `lszh-offers-staging` wurde mit synthetischem Datensatz angelegt. Von zwölf gleichzeitigen Firestore-SDK-Transaktionen veränderte exakt eine den Status, elf wurden als bereits abgeschlossen zurückgemeldet. Der Testcode bestätigte die Daten nach dem Commit und die anschliessende geschützte Löschung per erneuter Lesekontrolle, bevor `CLEANUP_PASS` ausgegeben werden konnte. Dies ist ein **echter Cloud-Firestore-Zugriff**, kein Emulator. Der frühere Eintrag «Endzustand unbestätigt» ist durch die nachgereichten Logs **überholt**; eine CPU-Suspendierung lag in diesem Testlauf offenbar nicht vor.

**Noch offen und explizit nicht behaupten:** Die negative Firestore-IAM-Isolation auf anderen existierenden Datenbanken ist nicht abschliessend getestet. Die reale Browser-Offertenannahme mit Zwei-/Drei-PDF-Kontrolle, Firestore-Airtable-Synchronisierung, idempotentem Beweis-PDF und Bestätigungsmail wurde **nicht** ausgeführt und bleibt deaktiviert. Test-Logs enthalten keine produktiven Kunden- oder Vertragsabschlüsse.

**Sofortiger Betriebs-Nachschritt noch NICHT als erledigt bestätigt:** Im **selben** separaten Cloud-Run-Dienst `lszh-offer-portal-staging` aus `cloud-run/offer-portal-preflight/` die ursprünglichen `index.js` und `package.json` wiederherstellen, `transactionTest.mjs` entfernen, Funktionsziel `lszhPortalPreflight` beibehalten und erneut bereitstellen; so kann der einmalige Startup-Schreibtest bei späterem Kaltstart nicht unbeabsichtigt wiederholen. Ingress Intern, IAM geschützt und Servicekonto unverändert. Bestehenden Archiv-Reader nicht anfassen. Produktives Website-/Make-System unverändert.


### Nachtrag 15.10.2026 – Rollback des Cloud-Run-Staging-Tests bei Build gescheitert

Nach nachgewiesenem echtem Cloud-Firestore-Test PASS (12 Transaktionen, 1 Änderung, 11 Ablehnungen, Cleanup bestätigt) versuchte der Geschäftsführer, die **lesende** Cloud-Run-Staging-Vorprüfung `offer-portal-preflight/index.js` und `package.json` wiederherzustellen und `transactionTest.mjs` zu löschen. Screenshot des Cloud-Run-Editors `lszh-offer-portal-staging` zeigt die korrekt wirkenden ersten Zeilen des read-only Codes, den Eintrag **`transactionTest.mjs gelöscht`** und den Einstiegspunkt `lszhPortalPreflight`, aber der neue Quell-Build endete mit **`Quelle wird erstellt (siehe Logs): Fehlgeschlagen`**, nachgelagerte Dienstaktualisierung/Revision/Traffic-Verschiebung abgebrochen.

**WICHTIG: ROLLBACK NOCH NICHT ERFOLGREICH.** Die alte stabile Lese-Revisions-ID war laut früherem Erfolgs-Screenshot `lszh-offer-portal-staging-00002-xdh`, die schreibende Test-Revisions-ID `lszh-offer-portal-staging-00003-778`. Quelle/Bauen fehlschlug bedeutet nicht, dass der alte Code deaktiviert ist. Kein erneuter Schreib-Test, keine erneute Bereitstellung, bis das gelöst ist.

**Empfohlener sicherer Sofortweg:** Cloud Run → `lszh-offer-portal-staging` → **Überarbeitungsverlauf/Revisions** → **Traffic verwalten** → **100 %** auf die **frühere nachweislich lesende** `lszh-offer-portal-staging-00002-xdh`, **0 %** auf die schreibende `...-00003-778`. Erst den aktuellen Revisions-/Traffic-Zustand auf Oberfläche kontrollieren. Offiziell: https://cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration (Cloud Run unterstützt Rollback mittels Traffic-Switch ohne neuen Build). Danach den ersten tatsächlichen Quell-Build-Fehler aus dem verlinkten `Logs`-Abschnitt auswerten (nicht aus dem Screenshot ableiten); ursprüngliche read-only JS- und package.json-Dateien sind im GitHub-Featurebranch gespeichert. Bis eine erfolgreiche nachträgliche Änderung der tatsächlich eingesetzten Revision belegt ist, dauerhaft sichere Bereitstellung nicht als abgeschlossen melden.

### 15.10.2026 – Cloud Run Rollback erfolgreich

Der Screenshot der Cloud Run Revisionsübersicht zeigt die abgeschlossene Traffic-Migration im Dienst `lszh-offer-portal-staging`: `lszh-offer-portal-staging-00002-xdh` (zuvor erfolgreich geprüfter reiner Lese-Preflight) hat 100 % Traffic; `lszh-offer-portal-staging-00003-778` (temporärer Schreibtest) und `00001-j6q` haben jeweils 0 %. Der zuvor fehlgeschlagene Quell-Build wurde dadurch nicht repariert; dessen Ursache ist weiter offen. Die ältere Testrevision bleibt gespeichert. Keine Live-Website- oder produktiven Vertragsänderungen.


### Nachtrag 15.10.2026 – Rollback-Quellcode offline gebaut und HTTP-503-Verhalten bestätigt

Nach dem nachgewiesenen erfolgreichen **Traffic-Rollback auf Revision `lszh-offer-portal-staging-00002-xdh` (100 %)** ist die frühere temporäre Schreibtest-Revision `00003-778` zwar weiterhin vorhanden, hat aber **0 % regulären Traffic**. Ein vorheriger Versuch, die ursprünglichen read-only Quelldateien neu bereitzustellen, scheiterte in Cloud Build; der exakte Fehlerbericht liegt weiterhin nicht vor. **Kein weiterer Cloud-Run-Deploy durchgeführt.**

Neue sicherheitsorientierte CI-Prüfung im Entwicklungszweig in `.github/workflows/offer-acceptance-check.yml` eingerichtet: Sie installiert die **originale** `cloud-run/offer-portal-preflight/package.json` unter Node.js 22, prüft `index.js` auf Syntaxfehler, startet das Functions Framework als lokalen HTTP-Dienst unter ausdrücklich falschem `K_SERVICE=offline-preflight-unit-test` (dadurch **keine Google-Metadata-/Drive-/Firestore-Aufrufe**) und verifiziert, dass eine HTTP-Anfrage zwingend **503** mit `{"error":"staging_disabled"}` ergibt. Der Test wurde nicht gegen Google Cloud ausgeführt und konnte keine Cloud-Build-/IAM-Probleme reproduzieren. GitHub-Actions-Lauf **`38733929006` erfolgreich**: allgemeine Unit-Tests **67 bestanden, 0 fehlgeschlagen, 1 emulatorabhängig übersprungen**, zusätzliche offline Deployment-/HTTP-Sicherheitsprüfung **PASS**, separater Firestore-Emulatorjob **2 bestanden, 0 fehlgeschlagen**. Lauf: https://github.com/lszh-automations/lszh-automations-site/actions/runs/38733929006 .

**Diagnosegrenze:** Der Quellcode im GitHub-Repo ist lokal installierbar, syntaktisch gültig und HTTP-seitig gesperrt. Dies **belegt nicht**, dass die bei Google im UI eingeblendete Quellkopie vollständig identisch war oder dass der Cloud-Build-Dienst Zugriff auf Abhängigkeiten, Artefakt-Registry und Quellarchiv hatte. Für die echte Ursache ist der **Cloud-Build-Fehlerlog** des gescheiterten Rollbacks zwingend zu lesen, über den `Logs`-Link bei `Quelle wird erstellt: Fehlgeschlagen` oder im Build-Verlauf. Möglich sind abweichendes Copy/Paste, `npm`-/Lock-Probleme, fehlende Berechtigungen oder Buildumgebung; bis zum Log **keine Diagnose behaupten**. Auch künftig weder die alte Schreibtestrevision reaktivieren noch Cloud-Run-Produktivflächen öffnen.


### Nachtrag 15.10.2026 – genaue Cloud-Build-Ursache ermittelt: ungültige package.json

Der Geschäftsführer hat den vollständigen fehlgeschlagenen Cloud-Build-Log des Rücksetzversuchs geteilt (Build-ID `4bc8b17a-eaa9-480b-905f-e67a583ef913`, 15.10.2026 12:06:46 UTC). Der Source-Download verlief **SUCCESS**, genau **2 Dateien** wurden ausgepackt. Der **erste echte Build-Fehler** trat im Node.js-Runtime-Buildpack auf, noch bevor JavaScript gestartet wurde: `unmarshalling package.json: invalid character '{' looking for beginning of object key string` (error ID `4f6c1022`). Das ist ein **Syntax-/Formatierungsfehler in der tatsächlich an Google Cloud übermittelten `package.json`**. Ob durch doppeltes Einfügen, fehlende Zeichen oder einen anderen Editorfehler ausgelöst, ist **noch nicht ermittelt**; kein Nachweis für Fehler bei IAM, Firestore oder der originalen `index.js`. Im GitHub-Entwicklungszweig wurde die originale `cloud-run/offer-portal-preflight/package.json` unabhängig bereits offline installiert und die read-only App gestartet und auf HTTP 503 geprüft (GitHub Action `38733929006`, grün).

**Sicherer Fix vorbereitet / noch nicht deployed:** Im Cloud-Run-Quelleditor `lszh-offer-portal-staging` ausschliesslich `package.json` vollständig ersetzen durch den validen Inhalt von `cloud-run/offer-portal-preflight/package.json`; vor dem erneuten Deploy `index.js`, `lszhPortalPreflight`-Funktionseinstiegspunkt und das Fehlen der temporären Datei `transactionTest.mjs` visuell kontrollieren. Dienstkonto, private Ingress-Einstellung, IAM-Authentifizierung unverändert. Bestehender Dienst verbleibt aktuell auf **100 % Traffic für bewährte lesende Revision `...-00002-xdh`**, alte Schreibrevision `...-00003-778` **0 %**. **Noch keine neue Bereitstellung oder Löschung der Revision durchgeführt.** Nach erfolgreichem Build kontrollierte Traffic-Weiterleitung und Logs prüfen; Schreibrevision erst nach dokumentierter Sicherheit und ohne funktionierenden Rollback-Pfad nicht entfernen.

### Nachtrag 15.10.2026 – neuer Read-only-Build erfolgreich, Traffic noch auf Revision 00002

Der Geschäftsführer zeigte die Cloud-Run-Revisionsübersicht des Geschäftsprojekts: nach Korrektur der fehlerhaften `package.json` wurde der neue Build vollständig erfolgreich erstellt (`Quelle wird erstellt`, `Dienst wird aktualisiert`, `Version wird erstellt`, `Traffic wird weitergeleitet` jeweils Abgeschlossen). Neue Revision `lszh-offer-portal-staging-00004-qt7` hat **0 % Traffic**; der bisherige verifizierte Read-only-Preflight `...-00002-xdh` hat **100 % Traffic**. Temporärer synthetischer Schreibtest `...-00003-778` und die Platzhalterrevision `...-00001-j6q` haben **je 0 %**. Dies ist keine aktive Umstellung der neuen Revision und es liegen noch keine aktuellen PASS-Logs von `00004-qt7` vor. Naechster manueller Schritt: Traffic verwalten und auf neue read-only Revision `00004-qt7` 100 %, alle anderen 0 % setzen; nach der Umstellung Logs für `IDENTITY_PASS`, `DRIVE_PASS`, `FIRESTORE_READ_PASS`, `PASS` pruefen. Keine erneuten Schreibtests und keine produktiven Freigaben.


### Nachtrag 15.10.2026 – neue Read-only-Revision 00004-qt7 real erfolgreich getestet

Der Geschäftsführer hat die vollständigen Google-Cloud-Run-Logs des separaten Dienstes `lszh-offer-portal-staging` eingereicht. **Die neueste Revision `lszh-offer-portal-staging-00004-qt7` hat am 15.10.2026 um 12:34:58–12:35:02 UTC (=14:34:58–14:35:02 MESZ) den neuen Build und den tatsächlichen read-only Staging-Preflight erfolgreich abgeschlossen**: `LSZH_PORTAL_PREFLIGHT: START`, `IDENTITY_PASS`, `DRIVE_PASS`, `FIRESTORE_READ_PASS`, `PASS`. Cloud Run meldete die STARTUP-TCP-Probe erfolgreich und Revision `00004-qt7` als `Ready` mit erfolgreicher Service-Aktualisierung.

**Der zuvor dokumentierte `package.json`-Buildfehler ist behoben**, und die nachfolgende neue Lese-Revision wurde in realen Google APIs bestätigt. Der **letzte tatsächliche Screenshot der Traffic-Verteilung** zeigte jedoch `00004-qt7` bei 0 % und `00002-xdh` bei 100 %. Die neuesten Logeinträge `ReplaceService` / `Ready` weisen **keine konkrete Prozentverteilung** aus: eine bereits erfolgte Traffic-Umschaltung auf `00004-qt7` ist daher **noch nicht bestätigt**. Vor Abschluss bitte Revisionsübersicht verifizieren, falls nötig `00004-qt7` auf 100 % und alle übrigen Versionen auf 0 % einstellen. Die temporäre Firestore-Schreibtest-Revision `00003-778` soll 0 % behalten, nicht mehr starten und nach gesicherter Umstellung risikobewusst archiviert/gelöscht werden. Die neue Revision enthält laut vorherigem Editor-Screenshot nur `index.js` und `package.json` und Ziel `lszhPortalPreflight`; produktives Vertragsportal weiterhin deaktiviert.

### Nachtrag 15.10.2026 – 100 % Traffic auf neuer sicherer Lese-Revision bestätigt

Der Geschäftsführer hat im Chat **ausdrücklich bestätigt**, dass die neue Cloud-Run-Revision `lszh-offer-portal-staging-00004-qt7` inzwischen **100 % Traffic** erhält. Die Google-Cloud-Logs der Revision vom 15.10.2026 14:34–14:35 MESZ zeigten bereits `IDENTITY_PASS`, `DRIVE_PASS`, `FIRESTORE_READ_PASS`, `PASS`. Damit ist die Rückkehr auf den geschützten, read-only Preflight nach dem früheren Paket-JSON-Buildfehler abgeschlossen (Traffic-Wert laut Nutzerbestätigung; **nicht** durch unsere eigene Cloud-API-Abfrage verifiziert). Die alte Firestore-Schreibtestrevision `00003-778` zeigte bei der letzten Revisionsübersicht 0 % Traffic, ist aber möglicherweise noch als Revision verfügbar; **noch keine Löschung durchgeführt**. Die produktive Vertragsannahme ist nicht freigegeben. Nächster Schritt: nach erneuter Kontrolle der aktuellen Revisions-/Tag-/Traffic-Zuweisungen die alte Schreibtestrevision aufräumen und den eigentlichen Vertragsportalablauf weiterhin ausschliesslich synthetisch testen.


### Nachtrag 15.10.2026 – vollständiger synthetischer Portal-HTTP- und PDF-Firestore-E2E-Test

**Erledigt im ungemergten GitHub-Entwicklungszweig:** Die eigentliche noch nicht bereitgestellte Portal-Implementierung `cloud-run/offer-portal-staging/{portalHttp.mjs,portalCore.mjs,firestoreOfferStore.mjs}` und der **exakte** Drive-PDF-Verifier `cloud-run/archive-reader-staging/archiveBundleVerifier.mjs` werden jetzt von `test/offerPortalEndToEnd.emulator.test.js` zusammen über echte lokale HTTP-Anfragen und einen offiziellen Firestore-Emulator geprüft. Google-Drive-Metadaten und PDF-Bytes werden **ausschliesslich synthetisch lokal simuliert**; kein Cloud-Google-API-Zugriff durch diesen neuen Test. Die `lszh_staging_offers_v1`-Testeinträge besitzen kryptografisch zufällige synthetische Tokens und werden mit eindeutiger Eigentümerkennzeichnung nach dem Lauf geschützterweise gelöscht.

**Getestete Abläufe für beide Varianten `AVV=Ja` und `AVV=Nein`:**
- HTTP `POST /api/offer/preview`, hashgeprüfte 2/3-PDF-Prüfung über den echten Codepfad, Vertraulichkeit (kein Empfänger oder Google-Drive-Datei-ID in der Vorschau);
- Eigenständige AVV-Zustimmung erforderlich bzw. AVV-Zustimmung bei `Nein` abgewiesen;
- mutierte PDF-Binärdaten bei unveränderten Drive-SHA-Metadaten verhindern die Annahme;
- zwölf gleichzeitig ausgelöste `POST /api/offer/accept`-Anfragen pro AVV-Variante: **genau eine** HTTP-200-Annahme, elf Fehlerantworten für Wiederholungen; **genau ein** Firestore-Statuswechsel `sent→accepted` / Revision `1→2`;
- Nachweisfelder `quote_pdf_sha256`, `terms_pdf_sha256`, AVV-Flag/-Hash sowie weiterhin hart `downstream={airtable:'disabled',proofPdf:'disabled',email:'disabled'}`; kein Roh-Token in Firestore gespeichert.
- Die Tests benutzen die reale Firestore-SDK-Transaktionsimplementierung gegen **den Emulator**, der gemäss Startmeldung **noch keine echten separaten mehreren Datenbanken simuliert**. Eine echte IAM-Datenbankisolation ist damit **nicht** nachgewiesen. Der separate vorherige echte Cloud-Firestore-Smoketest (12-fach und Cleanup-PASS) bleibt als eigenständiger Nachweis bestehen.

**Verifizierter CI-Lauf:** `https://github.com/lszh-automations/lszh-automations-site/actions/runs/38736777386`, abgeschlossen mit **success**: allgemeine Node-Tests **67 bestanden**, separater Firestore-Emulatorjob **4/4 bestanden, 0 fehlgeschlagen** (zwei neue vollständige Portal-E2E-Fälle). Workflow aktualisiert um Skript-Syntaxprüfung, Trigger und Emulatorausführung. Kein Live-Cloud-Run-Deployment, kein GitHub-PR-Merge, keine echten Kundendaten oder Vertragsannahmen, kein Make-/Gmail-/Airtable-Aufruf.

**Nächster Fortschritt Richtung Echttest:** Den Integrationsstand der echten synthetischen Offerten von Airtable/Make in die isolierte Cloud-Firestore-Staging-Collection prüfen, ein abgesichertes synthetisches Seed-/Cleanup-Verfahren für das echte Portal festlegen, und erst nach gesonderter technischer Prüfung die Portal-HTTP-Funktionen kontrolliert testbar machen. Cloud Run bleibt aktuell `00004-qt7` mit **100 % Traffic laut Geschäftsführer** auf dem read-only Preflight, IAM erforderlich, Ingress Intern, Produktivannahme weiterhin gesperrt. Vor jedem Go-Live bleiben eine belastbare Datenführerschaft/Outbox, echte Browser- und Cloud-HTTP-E2E-Tests, negative IAM-Isolationsprüfung, Spam-/Rate-Limits/WAF, revisionssichere Archivierung und die spätere juristische Prüfung offen.


### Nachtrag 15.10.2026 – Airtable-zu-Firestore-Synthetikimport sicher implementiert und getestet

**Echte Airtable-Inspektion, read-only:** Base `appzJiskpAdaR1HEv`, Tabelle `tbljeIUoD7wwKuSmS` (Offerten) samt Feld-IDs und bereits bestehender synthetischer AVV-Testofferte überprüft. `TEST-HTTP-MAKE-AVV-20261014-NO-CONTRACT` ist nur ein Entwurf mit AVV=`Ja` und bisher AVV-Datei-ID/-SHA/-Testversion; es fehlen insbesondere gültiger Token-Hash, separates PDF-ID/SHA-Paar für Offerte und Projektbedingungen, synthetische `example.invalid`-Empfängeradresse, exakter Testversionsstand und Gültigkeitsdatum. **Kein bestehender Datensatz verändert und kein Import dieses unvollständigen Entwurfs ausgeführt.**

**Code im unveröffentlichten Entwicklungszweig:** `cloud-run/offer-portal-staging/airtableSyntheticImport.mjs` implementiert eine reine Airtable-Schema-Abbildung auf das bereits getestete Firestore-Portalformat und eine **ausschliesslich für den lokalen Emulator zugelassene** idempotente `Firestore.create()`-Methode; sie liest unveränderbar `process.env` und prüft explizit Testprojekt, Datenbank und Emulator-Endpunkt. Die tatsächlichen Airtable-Feld-IDs für Token-Hash, AVV Ja/Nein, Version, 2/3 PDF-Datei-IDs und Hashes sind gemappt. Jede echte Kundendomain, produktive/vertragliche Freigabe, ein bereits versandter/akzeptierter Datensatz, fehlende Hashes/Token, widersprüchliche AVV-Felder und fremde Airtable-Base/-Tabelle werden **fail-closed** abgelehnt. `approved=true/status=sent` dürfen nur im ausdrücklich synthetischen **Emulator-Dokument** entstehen; die originale Airtable-Offerte bleibt Entwurf. Kein Roh-Token oder Roh-Kundendatensatz wird kopiert, externe Aktionen `airtable/proofPdf/email` bleiben `disabled`.

**GitHub CI erfolgreich:** https://github.com/lszh-automations/lszh-automations-site/actions/runs/38738225503 mit **72/72 regulären Tests (2 emulatorabhängig übersprungen)** und **10/10 Firestore-Emulator-Tests**, ohne Fehlschläge. Enthält Seed einmal, bei identischer Wiederholung kein Update, abweichende Version Konflikt, präzises Cleanup und alte parallele Annahmeprüfungen. Diese Prüfungen sind **kein echter Cloud-Firestore-Import** und keine juristische Freigabe. Branch nicht gemergt, Cloud Run weiterhin read-only auf `00004-qt7` mit laut Geschäftsführer 100 % Traffic, keine Make- oder E-Mail-Aktivierung.

**Ausführlicher Leitfaden inklusive aller Abnahmekriterien:** [LSZH_AIRTABLE_FIRESTORE_STAGING_HANDOFF_20261015.md](LSZH_AIRTABLE_FIRESTORE_STAGING_HANDOFF_20261015.md).

**Nächster Schritt:** echte synthetische Offerte mit vollständigen 2/3 geprüften TEST_ONLY-Drive-PDFs, eindeutiger `example.invalid`-Empfängeradresse, Testversions-/Token-Hash erstellen; nur danach separate schlüssellose Cloud-STAGING-Seed-/Cleanup-Route planen. Unvollständige reale Altbestände/Vertragsfreigaben niemals nachträglich ergänzen oder reaktivieren. Die produktive Annahme/Bestätigungsmail bleibt gesperrt.
