# LSZH Automations – Projektstand & Betriebsentscheidungen

_Stand: 13.10.2026. Interne Arbeitsdokumentation. Keine Passwörter, API-Schlüssel oder Token hier eintragen._

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
