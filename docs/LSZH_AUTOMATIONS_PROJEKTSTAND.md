# LSZH Automations – Projektstand & Betriebsentscheidungen

_Stand: 13.10.2026. Interne Arbeitsdokumentation. Keine Passwörter, API-Schlüssel oder Token hier eintragen._

## Nachtrag 23.10.2026 – CRM V2: gesonderte Cloud-Staging-Infrastruktur

- Der auf dem Surface getestete lokale CRM-V2-Fachprozess (Dashboard, Leads, Offerten, Kunden, Projekte und Rechnungen) wurde in einem eigenen Entwicklungsbranch erfolgreich durchgespielt. Keine automatischen Kundenmails oder echten Rechnungsversände.
- Für die sichere Cloud-Übernahme wurde **feature/crm-v2-cloud-staging-20261023** direkt aus main erstellt. Die vollständige Oberfläche und die fachlichen Validierungen werden über einen neuen authentifizierten Firestore-Dienst eingebunden.
- **Zielservice:** lszh-crm-v2-staging (neu), Sammlungen lszh_crm_v2_staging_*. **Der produktive Website-Lead-Eingang bleibt unverändert** auf lszh-crm-v2 mit seinen bestehenden Sammlungen und Secret-Manager-Zugängen. Staging-Website-Webhook ist hart deaktiviert.
- Google-OAuth-Anmeldung mit Workspace-Mail-Allowlist ist vorgesehen; noch keine OAuth-Client-ID eingerichtet oder geprüft. Der Cloud Run Staging-Deploy wurde noch **nicht** durchgeführt. Echte Firestore-End-to-End-Tests fehlen.
- Sieben pure simulierte Firestore-Funktionstests erfolgreich (Qualifizierung, Gewinnung, Offerten-Sperre, Projekt- und Rechnungsdaten, Remindervorschau). GitHub-Actions-Tests und separater PowerShell-Staging-Deploy eingerichtet.
- **Keine Produktionsfreigabe oder Merge in main.** Vor Cutover: OAuth, echter Staging-Test, Live-Daten/Nummernkreis, Rollback/Backup, Dienstkontorechte, echte interne Erinnerungs-E-Mail und Swiss-QR-Zahlteil klären.
- Technische Übergabe/Bedienung: siehe crm-v2/CLOUD-STAGING.md im Cloud-Staging-Branch. Lokale Preview weiter unverändert.

### Browserabnahme CRM-V2-Staging am 23.10.2026

Der Geschäftsführer bestätigt, dass in der Cloud-Version (`lszh-crm-v2-staging`) der komplette Testablauf **Lead → Qualifiziert/Offerte → Angenommen/Kunde/Projekt → Rechnung/Offen/Bezahlt** funktioniert. Firestore-Datensätze bleiben nach Neuladen erhalten, die Google-Anmeldung wurde ebenfalls erfolgreich getestet. Diese Bestätigung gilt für synthetische Daten im Staging, **nicht** für Produktionsfreigabe, produktiven Website-Eingang oder echte Zahlungsabwicklung.

**Nächste zielorientierte Schritte:** Live-Eingangsintegration ohne Downtime und mit überprüfbarem Rückfallweg vorbereiten; Vorhandene Live-Daten/Nummernkreis sowie Identitäts-/Zugriffsrechte und Backup prüfen. Erst nach Freigabe umschalten. Kundenversand bleibt gesperrt.

### 23.10.2026 – Website-Anbindung und Vorbereitung des Produktivstarts

- Analyse Website-`index.html` und Render-`server.js`: Hauptkontaktformular sendet bereits `POST /api/lead` und serverseitig über `CRM_LEAD_INGEST_URL` und `CRM_INGEST_SECRET` zu Firestore (direkt, ohne Make-/Airtable-Zwischenstufe). Ob die Live-Render-Umgebungsvariablen tatsächlich korrekt gesetzt sind, bleibt zu bestätigen.
- Wichtigste Anpassung im Cloud-Staging-Entwicklungsbranch: Annahme von Website-Leads in `crm-v2/server.js` verwendet nun die konfigurierte Firestore-Sammlung. `lead-ingest.js` erlaubt ausschliesslich `lszh_crm_v2_leads` beziehungsweise `lszh_crm_v2_staging_leads`. Schutz gegen irrtümliches Schreiben synthetischer Staging-Leads in die Live-Lead-Sammlung.
- Neue serverseitige Tests für identische Wiederholung (200), neue Einreichung (201), Konflikt (409), fehlendes Token (401) und deaktivierte Staging-Route (404).
- `scripts/test-crm-website-intake-staging.ps1`: einmaliger künstlicher HTTP-End-to-End-Test auf Cloud Run mit eigenem Secret Manager-Schlüssel und Deaktivierung des Staging-Webhooks im Anschluss; erst nach erneutem Cloud-Staging-Deploy ausführen.
- `scripts/preflight-crm-production.ps1`: reiner Lesecheck bestehender Cloud-Run-Revisionen, Servicekonto und Secret-Referenz. Produktivdateninventar, Backup und Render-Umgebung weiter offen.
- Ausführlicher Cutover-Plan: `crm-v2/WEBSITE-CUTOVER.md`. **Keine Render-Veränderung, kein Merge in main, kein Live-Cloud-Run-Deployment, keine Kundenmails.**

## Website-Eingang: HTTP-Test erfolgreich – 23.10.2026

Der Geschäftsführer hat den echten synthetischen Staging-HTTP-Test mit `scripts/test-crm-website-intake-staging.ps1` ausgeführt und die PowerShell-Ausgabe übermittelt:

- Dediziertes Staging-Testsecret `lszh-crm-v2-staging-website-test` Version 1 erstellt; Berechtigung für Cloud-Run-Dienstkonto gesetzt. Keine geheimen Werte im Chat.
- Nach temporärer Staging-Aktivierung Cloud-Run-Revision `lszh-crm-v2-staging-00004-njk`, 100 % Traffic.
- Synthetisches `POST /api/internal/website-leads`: **201** (erstellt), identischer Wiederholungs-POST **200** ohne Dublette, abweichender Retry **409**, fehlendes Secret **401**.
- Ein bestätigter Staging-Firestore-Datensatz mit ID `web_d05af7b4be214345af56948b2215e265`. Dies ist **kein realer Kunde**.
- Im `finally` Staging-Webhook wieder deaktiviert. Cloud-Run-Revision `lszh-crm-v2-staging-00005-sjv` hat danach 100 % Traffic. PowerShell bestätigte `PASS: Staging Webhook wieder deaktiviert`.
- Der Test wurde **direkt am Cloud-Run-Staging-Webhook**, nicht über das öffentlich erreichbare Render-Webformular ausgeführt. Nach Prüfung der produktiven Konfiguration und expliziter Freigabe bleibt ein separater echter Website-Test nötig.
- **Kein Merge, keine Render-Umstellung, kein Produktiv-Cutover**. Nächster Schritt: `scripts/preflight-crm-production.ps1` (read-only) ausführen, Ausgabe prüfen; Live-Dateninventar, Backup, Nummernkreis und Google-OAuth-Zugriff separat kontrollieren.

### 23.10.2026 – Read-only Live-Preflight erfolgreich, Firestore-Inventar als nächster Schritt

Surface-PowerShell hat bestätigt, dass `lszh-crm-v2` weiter auf `lszh-crm-v2-00002-6lh` mit 100 % Traffic läuft. Das Live-Dienstkonto ist `lszh-crm-v2@lszh-automations.iam.gserviceaccount.com`; der bestehende Website-Eingangs-Secret ist über Secret Manager referenziert. Die alte Version hat noch keine gesetzten Intake-/Collection-Präfix-Flags. Staging weist `CRM_RECORD_PREFIX=lszh_crm_v2_staging_` und `CRM_WEBSITE_INTAKE_ENABLED=false` aus. Keine produktiven Änderungen.

Vorbereitetes `scripts/inventory-crm-firestore-readonly.ps1` ermittelt als nächsten Test ausschliesslich Live-/Staging-Collection-Anzahlen und Sequenz-Zähler über Firestore REST, ohne Geheimnisse/PII auszugeben oder etwas zu verändern. Datenzahlen noch nicht bekannt. Ein Live-Firestore-Backup, Datenschutz-/IAM-/Negativtests und überprüfbarer Rollback bleiben vor Cutover erforderlich.

## 23.10.2026 – Render bestätigt, Firestore-Backup erfolgreich, Kandidat vorbereitbar

Der Geschäftsführer bestätigt, dass der produktive Render-Dienst die korrekte CRM_LEAD_INGEST_URL (https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app/api/internal/website-leads) und CRM_INGEST_SECRET (vorhanden) verwendet. Die Secretwerte wurden nicht geteilt.

Cloud Firestore liegt in europe-west6 (Zürich). Der verwaltete Export ist mit done=True und operationState=SUCCESSFUL abgeschlossen. Backup-Pfad: gs://lszh-firestore-backups-470613067122/backups/20261023-094036; Metadaten und Datendatei output-0 nachgewiesen. **Isolierter Restore noch nicht durchgeführt.**

Read-only Firestore-Inventar: Live lszh_crm_v2_ hat 0 Leads/Kunden/Offerten/Projekte/Rechnungen; Offerten- und Rechnungszähler noch nicht angelegt (Start 1000). Staging lszh_crm_v2_staging_ hat 2 Leads, je 1 Kunde/Offerte/Projekt/Rechnung; nächste Sequenzen 1001. **Ein leerer Live-Firestore-CRM-Bestand beweist nicht, dass Airtable und andere Altsysteme leer sind.**

Neue abgesicherte Kandidatenwerkzeuge (bisher **nicht** auf Live ausgeführt):

- scripts/prepare-crm-live-candidate.ps1: standardmässig READ ONLY; validiert Revision lszh-crm-v2-00002-6lh mit 100 % Traffic, Dienstkonto, Secret-Referenz, sauberen Git-Branch und Node-Tests. Nur expliziter Schalter -Deploy würde eine getaggte Kandidatenrevision mit 0 % Traffic auf dem vorhandenen Dienst bauen. --update-env-vars soll die bestehende Secret Manager Referenz bewahren. Kandidatenpräfix lszh_crm_v2_; Website-Eingang true.
- scripts/check-crm-live-candidate-http.ps1: nur anonyme HTTP-Prüfungen an der getaggten Kandidaten-URL (HTML/Config 200, Daten-/Druck-/Website-API ohne Berechtigung 401), keine Firestore-Datenschreibungen.
- Im unveröffentlichten Branch wurde der Datenschutztext der Website für den echten Kontaktformularweg Render -> Cloud Run -> Firestore aktualisiert. Vor Veröffentlichung rechtlich/redaktionell freigeben.

**Live bleibt unverändert:** Kein Git-Merge, Render-Deployment oder Cutover. Rückfallrevision lszh-crm-v2-00002-6lh. Späterer Recovery-Befehl erst nach Freigabe eines produktiven Cutovers:

    gcloud.cmd run services update-traffic lszh-crm-v2 --project lszh-automations --region europe-west6 --to-revisions=lszh-crm-v2-00002-6lh=100

Den Rückfallbefehl **jetzt nicht ausführen**. Vor dem Wechsel ausserdem Altbestand, Google OAuth Origins, Rollen/Negativtests und die unmittelbar vorherige aktuelle Sicherung kontrollieren.

### 23.10.2026 – CRM-V2-Live-Kandidaten-Preflight bestanden, noch kein Deployment

Nutzer hat den rein lesenden `scripts/prepare-crm-live-candidate.ps1` ohne `-Deploy` ausgeführt. Live-Cloud-Run-Revision `lszh-crm-v2-00002-6lh` mit 100 % Traffic unverändert; Servicekonto und Secret-Manager-Referenz nachgewiesen; 20/20 CRM-Tests bestanden; geprüfter Source-Commit `8598f99`. Keine produktive Änderung. Als bewusster nächster Schritt ist der `-Deploy`-Aufruf für eine getaggte Kandidatenrevision mit 0 % Standardtraffic vorbereitet. **Eine Tag-URL ist dennoch direkt erreichbar und kann auf Live-Firestore zugreifen; keine echten Schreibtests vor gesonderter Freigabe.** Bestandsabgleich Airtable und isolierte Backup-Wiederherstellung bleiben offen.

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

## Technische Prüfung vom 14.10.2026 – Onboarding-Fortsetzung (STAGING)

- Make-Szenario **7777695**: Kunden-Onboarding bleibt **inaktiv**. Kundenmail-Modul 9 hat unverändert die harte **0=1**-Sperre. Keine echten Einladungen, Vertragsfreigaben oder Kundensendungen.
- Der separate Datenschutz-Zweig (Router 14) läuft vor der erfolgreichen Webhook-Bestätigung; Prüfung bei `sensitive_data = Ja` oder `Unsicher`. Vor einer neuen DSG-Aufgabe erfolgt jetzt eine Airtable-Suche (Modul 15) nach dem stabilen `<Auftrag-ID>-DSG-01`-Schlüssel. Bereits existierende, z. B. erledigte Aufgaben werden nicht auf `Offen` zurückgesetzt.
- Die frühere GET-Dublettenprüfung (Modul 11) wurde durch wiederaufnehmbare Speicherung ersetzt: Modul 4 erzeugt ein Airtable-`performUpsert` mit `fieldsToMergeOn: ["Projektcode"]`. Modul 3 sendet `PATCH`, Modul 6 verknüpft den Datensatz mittels `3.body.records[1].id`; dieselbe ID wird in Modul 12 als Webhook-Beleg ausgegeben.
- **Test 1:** zweimaliges Airtable-Upsert auf bestehenden synthetischen Token `<synthetischer-testtoken-intern>` lieferte `recCTaZaoReFpBqxi` und änderte die Datensatzanzahl nicht (vier).
- **Test 2:** Isoliertes Make-Testscenario **7962957**, zweifacher sequentieller Aufruf: Erfolg, jeweils HTTP 200 und dieselbe Airtable-ID. Zusätzlich **zwei parallel gestartete Testläufe**: beide erfolgreich, HTTP 200, dieselbe ID; nachher weiterhin genau ein zugehöriger Datensatz. Testszenario wieder deaktiviert.
- **Test 3:** Read-only-Make-Testscenario **7962998**: existierende DSG-Aufgabe ergab `rec818rQl70Mf4UsW`, fehlender Aufgabencode ergab keine ID; beide HTTP 200. Existierende Aufgabe blieb auf `Erledigt`. Testscenario danach deaktiviert.
- **Keine Freigabe:** Diese Tests prüfen isolierte Module und einen vorhandenen synthetischen Datensatz. Sie sind **kein** vollständiger Webhook-End-to-End-Test, kein Paralleltest zweier echter erstmaliger Eingänge und keine tatsächlich unterbrochene Gesamtausführung. Wiederholungen mit **abweichenden** Formulardaten würden noch vorhandene Onboarding-Felder überschreiben; diese Geschäftspolitik ist abzuklären oder technisch abzusichern. Ebenfalls testen: Fehler bei Verknüpfung/Rechnungsdaten, Dauerhaftigkeit der Datensätze, Fehlerantwort und Datenschutzprüfung vor HTTP-200.
- Weitere Freigaben: Kundenorganisation und Einladungsberechtigung für `lars@lszh-automations.ch`; Google-Drive-Reautorisierung und separates eingeschränktes Dienstkonto; RC1-Projektbedingungen/AVV; Offerten-, Rechnungs-, Swiss-QR- und Archivtests.

## Technische Freigabeprüfung 14.10.2026 – Wiederholungs-Guard und kompletter On-Demand-Test

**Produktivstatus:** Make-Szenario `7777695` weiterhin **INAKTIV**, E-Mail-Versand durch Modul 9 mit harter `0=1`-Sperre verhindert. Keine Kundenmails, keine echten Einladungen, keine Vertragsfreigaben, keine Aktivierung.

**Neue Schutzlogik im Onboarding:**

1. Vor dem Airtable-Upsert fragt Modul 16 bestehende Onboardings für den Projektcode ab (maximal 2 Treffer).
2. Code-Modul 17 vergleicht den eingereichten Onboarding-Feldsatz mit dem bereits gespeicherten Datensatz, mit Normalisierung leerer Textfelder. Es unterscheidet `new`, `resume`, `conflict` (geänderte Angaben/mehrere Bestandsdatensätze/manuelle Klärung) und `already_complete`.
3. Router 18 leitet **nur** `new` und `resume` auf den Upsert und die restliche Projektverarbeitung weiter. Bei `conflict` sendet Make einen strukturierten Konflikt im JSON mit `duplicate=true` / `error=already_submitted`, den der bestehende Website-Proxy in HTTP 409 übersetzt. Make selbst liefert auf diesem Zweig zur Kompatibilität mit dem Website-Proxy HTTP 200 mit Geschäftsfehler im JSON; vor Direktzugriff auf den Make-Webhook prüfen. Bei `already_complete` wird der ursprüngliche Datensatz bestätigt, ohne erneut zu schreiben.
4. Datenschutz-Zweig bleibt unabhängig vom E-Mail-Zweig. Existenzprüfung über den stabilen Aufgabencode verhindert erneutes Öffnen einer bereits erledigten Datenschutzprüfung.
5. Bei identischer Wiederholung während unvollständiger Verarbeitung kann die Auftragsverknüpfung per erneutem `PATCH` repariert werden. Weiterhin keine Garantie echter atomarer Transaktion zwischen mehreren Airtable-Datensätzen.

**Isolierte Make-Testkopie `7963278` (nur synthetische Daten, ohne E-Mail-Modul):**
- Suchfilter in Modul 5 auf Auftrag `rec2958xrhm6QmIbM` eingeschränkt; keine echte Vertragsannahme gesetzt.
- Erste Ausführung: `saved` – Onboarding `recGKxPPzHhgUZ8W9` und genau eine neue Datenschutzaufgabe erstellt; alle Schreibmodule und die abschliessende Rückgabe erfolgreich.
- Gleiche Eingaben erneut: `saved` mit identischer Datensatz-ID, keine zweite Datenschutzaufgabe.
- Geänderter Projektname: `conflict` / `changed_input`; Ausführungsprotokoll zeigt **keine** Schreibmodule im Konfliktlauf. Der ursprüngliche Projektname blieb unverändert.
- Simulierte Teilunterbrechung: Auftragsverknüpfung beim fiktiven Onboarding entfernt, identische Eingabe erneut verarbeitet, Verknüpfung korrekt zum ursprünglichen Testauftrag wiederhergestellt.
- Einmalig Status `Vollständig` im Testdatensatz gesetzt: identische Eingabe führte zu `already_complete`; nur lesende Module und Antwortmodul liefen. Anschliessend ursprünglichen Teststatus `Eingegangen` wiederhergestellt.
- Die Testkopie `7963278` ist nach den Testläufen wieder **INAKTIV**. Ebenso sind die früheren isolierten Teststrecken `7962957`, `7962998`, `7963182` und `7963206` inaktiv.

**Noch nicht abgenommen:** Die Testkopie hat einen `StartSubscenario`-Trigger, **keinen Live-Webseiten-Webhook**. Noch nötig: tatsächlicher synthetischer HTTP-Webhook-Test, echte Unterbrechung in Make zwischen Modul 3 und Modul 6, gleichzeitige erstmalige Einsendungen, Fehlerantworten bei nicht autorisiertem Token oder Airtable-Ausfall sowie Stabilität bei späteren Datenaktualisierungen. Der instanzlokale Zwei-Minuten-Cache im Website-Proxy garantiert keine dauerhafte Exklusivität. Die übrigen Freigabeblocker zu Google Drive, RC1/AVV, Kundenorganisation und Rechnungs-/Offertenversand bleiben bestehen.


### Nachtrag 14.10.2026 – echter HTTP-Webhook im isolierten Test

- Eigenständiges Make-Webhook-Szenario **7963329** als eingeschränkte Kopie des Onboardings angelegt. Es enthält **kein Gmail-/E-Mail-Modul** und darf ausschliesslich den synthetischen Testauftrag `rec2958xrhm6QmIbM` verarbeiten. Getrenntes synthetisches HTTP-Sendeszenario **7963343**.
- **HTTP-E2E Wiederholung:** Ein tatsächlicher HTTP-POST aus Szenario 7963343 an den Test-WebHook 7963329 durchlief Validierung, Auftragsabfrage, JSON-Erzeugung, Existenzprüfung, Wiederholungs-Guard, Airtable-Upsert, Auftrags-/Kundendaten und Datenschutzaufgaben-Existenzprüfung. Die Webhook-Antwort enthielt `ok=true` und dieselbe ursprüngliche Datensatz-ID. Make-Ausführung ohne Fehler.
- **HTTP-E2E Konflikt:** Geänderter Projektname im POST führte zu `duplicate=true`, `error=already_submitted`. Ausführungsprotokoll durchlief nur die Validierung und lesenden Module sowie die Konflikt-Antwort (Modul 19), **kein** Airtable-Schreibmodul. Projektname, Verknüpfung und DSG-Aufgabe blieben unverändert.
- Beide Make-HTTP-Läufe meldeten HTTP **200** vom internen Webhook. Der bereits implementierte Website-Proxy wertet das Geschäftsfehler-JSON aus und soll bei `duplicate=true` selbst HTTP **409** ausgeben. Dieser Website-Proxy-Endpunkt wurde noch **nicht** selbst per HTTP getestet.
- Webhook-Queue nach Tests **0**. Szenarien **7963329** und **7963343** nach den Läufen deaktiviert, wie auch das originale Onboarding **7777695**. Dessen Kundenmail-Modul 9 behält die `0=1`-Sperre.
- Weiter offen bleiben: Durchlauf über das tatsächliche öffentlich zugängliche Website-Onboarding samt 409-Prüfung, echte Fehler-/Unterbrechungsinjektion in Make, initial gleichzeitige Eingänge für denselben noch nicht angelegten Datensatz, Fehlerbehandlung bei Ausfall von Airtable/Google und manuelle organisatorische Freigaben. **Keine Produktionsfreigabe.**


### Nachtrag 14.10.2026 – gleichzeitige Erstanfragen, echter Fehlerabbruch und Website-202-Hinweis

**Paralleltest nur mit synthetischem Auftrag:** Separater Testauftrag `recDXecnwGr3fyU9D`, ohne bestätigte Vertragsunterlagen, auf den der isolierte Test-WebHook `7963329` in seiner Airtable-Suchformel begrenzt wurde. Mit `sequential=true` wurden zwei nahezu zeitgleiche Erstübermittlungen an den isolierten Webhook ausgelöst. Die Make-HTTP-Sender erhielten beide zunächst `200 Accepted` als vorläufige Annahme, **nicht** als bestätigten Speicherbeleg. Die zweite Lieferung blieb zunächst in der Webhook-Warteschlange (Queue=1) und wurde nach erneuter Testaktivierung abgearbeitet (Queue anschliessend=0). Die beiden Webhook-Ausführungen meldeten **warning**, zeigten im Modulprotokoll jedoch keinen Modulfehler. Airtable enthielt anschliessend **genau einen** neuen Onboarding-Datensatz `recvv5IlhSJU8V4Qw` und **genau eine** Datenschutz-Aufgabe `reck61B1qYy3zEmOk` für den Testauftrag. Kein Kundenszenario aktiviert.

**Wichtige offene Semantik:** Bei konkurrierenden Webhook-Aufrufen liefert Make vor der vollständigen Bearbeitung `Accepted`. Der produktive Website-Proxy darf dies ausschliesslich als `202 pending` behandeln (keine verifizierte Speicherung). Seine Implementierung sieht dafür bereits die Unterscheidung vor; der echte öffentlich zugängliche Website-Endpunkt wurde noch nicht per HTTP geprüft. Die Ursache der Make-Ausführungsstatus `warning` ist noch separat zu beurteilen. Der Wartefall im Fehler-/Duplikatschutz darf nicht still als erfolgte Speicherung gelten.

**Echter Testfehler nach Upsert:** Neue ausschliesslich synthetische On-Demand-Testkopie `7963454` enthielt absichtlich ein `code:ExecuteCode`-Modul direkt nach Airtable-Upsert und vor der Auftragsverknüpfung, das `LSZH_SYNTHETIC_INJECTED_FAILURE_AFTER_UPSERT` auslöste. Beim fiktiven Datensatz `recGKxPPzHhgUZ8W9` war vorher die Auftragsverknüpfung entfernt worden. Make-Ausführung `79a93d7dddea450eac0d99baa4d6b63b` endete mit dem erwarteten RuntimeError, Datensatz blieb vorhanden und unverknüpft. Die anschliessende **saubere Wiederaufnahme** über die isolierte Teststrecke `7963278` (`870934398c354301b026a8d1c58dbe90`) war erfolgreich: dieselbe Datensatz-ID, korrekte Verknüpfung `rec2958xrhm6QmIbM`, keine zweite Datenschutz-Aufgabe. Beide Teststrecken anschliessend deaktiviert.

**Website-UI-Korrektur:** In `onboarding/index.html` wurde der Hinweis bei HTTP 202 berichtigt: Es wird ausdrücklich nur der Empfang zur Verarbeitung bestätigt, nicht die endgültige Speicherung und auch **keine später automatisch versandte E-Mail** versprochen, während der E-Mail-Versand gesperrt ist. GitHub-Commit `1acce5b93380d40f638a28594688669c7bdc842f`.

**Freigabegrenzen:** Öffentliche Website `/onboarding/` und `/make-start/` waren aus dem externen Prüfwerkzeug nicht erreichbar bzw. nicht verifizierbar; daraus folgt noch keine gesicherte Aussage zur Ursache. Website-/Render-Verfügbarkeit, echte HTTP-409-Rückgabe des Proxy, Fehler bei Airtable-Verbindungsunterbruch und kundenbezogene Rollen-/Vertragstests sind **OFFEN**. Produktiv-Onboarding `7777695` bleibt inaktiv, harte `0=1`-Kundenmail-Sperre unverändert. Teststrecken `7963278`, `7963329`, `7963343`, `7963454` bleiben deaktiviert. Keine Einladungen, echten E-Mails oder Vertragsfreigaben.


### Nachtrag 14.10.2026 – Google Drive: Zugriffstrennung und geschäftliche Archiv-Staging-Prüfung

**Befund:** Zwei Google-Konten/Drive-Berechtigungskontexte sind betroffen. Das über Google Drive direkt einsehbare ältere Vertragsarchiv mit Testangebot liegt im *privaten* Google-Konto und ist laut Metadaten nicht freigegeben. Die in Make verwendete Google-Drive-Verbindung (Geschäftsadresse `lars@lszh-automations.ch`, Connection 11904271) ist zwar autorisiert, kann diese private Test-PDF nicht laden (HTTP 404). Das ist ein **Zugriffsproblem**, kein Nachweis einer erneut abgelaufenen OAuth-Verbindung. Umgekehrt ist eine in Make erreichbare Geschäftskonto-PDF über den separat verbundenen privaten Drive-Connector nicht zugänglich. Eine globale Google-Drive-Reautorisierung ist für diesen Befund nicht nötig.

**Geschäftskonto-Zielarchiv bereits vorhanden:** Make hat den Ordner **LSZH Automations Vertragsarchiv – STAGING – Geschäftskonto** als eigenes Ziel angeboten. Der ältere private Ordner **LSZH Vertragsarchiv – STAGING (nicht produktiv)** ist hiervon getrennt. Für zukünftige Vertragsarchivierung den geschäftlich kontrollierten Speicherort verwenden und die bisherigen privaten Tests nicht als Produktionsarchiv behandeln. Keine automatischen Freigaben/Sharing der privaten Unterlagen ohne separate Zustimmung.

**Kontrollierte Lesetests:** Isoliertes, rein lesendes Make-Szenario `7963566` mit Geschäftskonto-Verbindung: bestehende synthetische Geschäftskonto-Test-PDF erfolgreich gelesen (630 Bytes, gültiger SHA-256). Die alte private Offerten-Test-PDF liefert mit derselben Make-Verbindung HTTP 404. Das Szenario wurde deaktiviert.

**Archivierung + Datenintegrität erfolgreich:** Neues isoliertes Make-Szenario `7963597` erstellt: vorhandene synthetische Mini-PDF im Geschäftskonto laden -> ausschliesslich in den genannten **Geschäftskonto-STAGING**-Ordner hochladen (Dateiname beginnt mit `TEST_ONLY_`) -> neu archivierte Datei herunterladen -> Größe und SHA-256 mit der Vorlage vergleichen. Ausführung `0fab42aac5ce44b99c02c27d83ea57f2`: **success**, Hashes identisch `c7694e7a617af93059204f790bcf9f306b8d3fa3c5a15e6a4f352a2abf6366c4`, beide Dateien 630 Bytes, Upload im richtigen Business-Staging-Ordner. Szenario direkt danach deaktiviert. Die Test-PDF ist **kein Vertrag**.

**Nicht freigegeben:** Online-Annahme, reale E-Mails, externe Freigaben/Einladungen, echte Kundenunterlagen und produktive Szenarien bleiben inaktiv. Das Bestehen des Upload/Download-Tests beweist weder rechtliche Dokumenteneinbindung noch Content Restrictions/WORM, SHA-Verifikation bei Online-Annahme, Backup-/Aufbewahrungskonzept oder Dienstkonto-Zugriff. Projektbedingungen und AVV RC1 bleiben unfreigegeben. Vor Produktivstart (1) Staging-Unterordner und Ablageziele in Geschäftskonto aufeinander abstimmen, (2) freigegebene finale PDFs unabhängig archivieren, (3) Download-/Hashprüfung bei Angebotsversand und Annahme, (4) restriktives serverseitiges Dienstkonto für lesenden Zugriff vorbereiten, (5) Rechte, Löschung, Backup und Unveränderbarkeit sowie externe Rechtsprüfung klären.


### Nachtrag 14.10.2026 – Make Offerten-/Annahmearchiv auf Geschäftskonto-STAGING vorbereitet

**Voraussetzung:** Das Make-Geschäftskonto `lars@lszh-automations.ch` kann den bestehenden Ordner `LSZH Automations Vertragsarchiv – STAGING – Geschäftskonto` erreichen. Die versuchte automatische Anlage von drei getrennten Unterordnern (Offerten, Projektbedingungen, Annahmenachweise) wurde durch die Sicherheitsprüfung des verbundenen Tools blockiert und **nicht durchgeführt**. Bis eine Unterordnerstruktur eingerichtet und separat geprüft ist, wird nur der nachweislich funktionierende Geschäfts-STAGING-Hauptordner verwendet; Dateinamen tragen `STAGING_`. Alte private Archiv-PDFs wurden nicht geteilt, verschoben, gelöscht oder überschrieben.

**Make `7835460` (Offerte PDF erzeugen und versenden, INAKTIV):** Google-Docs-Entwurf (Modul 3) und Offerten-PDF-Upload (Modul 7) auf denselben Geschäfts-STAGING-Ordner umgestellt. Modul 11 fordert nun zusätzlich `parents` aus Google Drive an; Modul 8 markiert einen Archivbeleg nur bei passender Datei-ID, passendem SHA-256, PDF-MIME-Type, aktiviertem Drive-Content-Restriction-`readOnly` und korrektem Geschäftskonto-Ordner als verifiziert. Die ursprünglich strukturell ungültige JSON-Feldzuordnung in Airtable-Statusmodul 6 korrigiert. Zusätzliche **harte 0=1-Sperre vor Google-Docs-Erzeugung** in Modul 2 sowie bestehende harte 0=1-Sperre vor Kundenmail in Modul 5; auch `disabled` nicht als alleinige Sicherheit betrachten.

**Make `7940261` (persönlichen Offerten-Annahmelink erstellen/mailen, INAKTIV):** Nach den beiden Google-Drive-Leseoperationen für Angebot und Projektbedingungen zwei zusätzliche read-only Drive-Metadatenmodule 9/10 eingefügt. Token-Hash-Schreibmodul 4 verlangt jetzt zusätzlich für **beide** PDFs den richtigen Geschäfts-STAGING-Elternordner, passenden Datei-ID- und SHA-256-Abgleich, Drive-Content-Restriction `readOnly=true` und API-HTTP 200. Eine syntaktisch fehlerhafte JSON-Feldzuordnung in Statusmodul 6 korrigiert. Token-Erstellung (Modul 2) und Kundenmail (Modul 5) jeweils **hart 0=1 gesperrt**. Keinerlei Annahmelink erzeugt oder verschickt.

**Make `7940220` (Online-Annahmebeleg und Bestätigung, INAKTIV):** Zwei Drive-Metadatenmodule 10/11 lesen vor dem Beanspruchen einer Bestätigung beide zuvor archivierten PDFs; vor Verarbeitung prüft Modul 2 die beiden Drive-Elternordner, Datei-IDs, SHA-256 und `readOnly`-Schreibschutz zusätzlich zu den vorhandenen Annahme-/Freigabebedingungen. Google-Docs-Nachweisentwurf (Modul 5) und PDF-Ablage (Modul 7) liegen im Geschäfts-STAGING-Hauptordner. Nach PDF-Upload liest Modul 12 den Nachweis erneut, Modul 13 setzt den Drive-Schreibschutz, Modul 14 verifiziert Archivpfad, SHA-256 und Schreibschutz. Kundenmail-Modul 8 verlangt die technischen Belege, bleibt aber unabhängig davon **hart 0=1 gesperrt**. Zusätzlich ist Claim-/Belegerstellung (Modul 2) **hart 0=1 gesperrt**. Fehlerhaft aufgebaute JSON-Feldzuordnung des Airtable-Abschlussmoduls 9 korrigiert.

**Isolierter Schreibschutz-Test `7963696`:** Ausschliesslich die synthetische 630-Byte-PDF aus dem zuvor überprüften Geschäftsarchiv verwendet (kein echter Vertragsbeleg). Lauf `2a981655f34a4d66b772177c7f619212` meldete **success**: Google Drive Content Restriction erfolgreich per PATCH gesetzt, per GET `readOnly=true` bestätigt, SHA-256 weiterhin identisch `c7694e7a617af93059204f790bcf9f306b8d3fa3c5a15e6a4f352a2abf6366c4`, richtiger Geschäftsarchiv-Elternordner. Die Teststrecke danach **deaktiviert**. Ein Drive-Schreibschutz ist nicht automatisch ein revisionssicheres WORM-Archiv.

**Verifikation:** Die drei Make-Szenarien `7835460`, `7940261` und `7940220` nach den Änderungen erneut ausgelesen: alle **INAKTIV**. Alle drei Kundenmail-Module besitzen harte `0=1`-Filter; vorgelagerte Schreib-/Vertragsprozesse ebenfalls. JSON-Bodies der drei korrigierten Airtable-Statusaktualisierungen sind syntaktisch gültig. Google-Drive-Verbindung ist autorisiert.

**Noch nicht abgenommen:** Vollständige E2E-Ausführung der drei Offerten-/Annahme-Staging-Szenarien (harte Sperren bleiben aktiv), eigene Geschäfts-STAGING-Unterordner, zwei **tatsächlich freigegebene** finale Projektbedingungen-/Offerten-PDFs samt SHA-256 und Archivzugriff, Berechtigungs- und Retention-/Backup-/WORM-Konzept, separates eingeschränktes serverseitiges Dienstkonto, RC1-Projektbedingungen und AVV mit geschäftlicher und juristischer Freigabe, scharfe Anbieter-/UID-/MWST-Daten, Kundeneinwilligung und ausdrückliche Produktionsfreigabe. Keine E-Mails, Einladungen oder Vertragsabschlüsse durchgeführt.


### AVV v0.9 / RC1 – Geschäftsentscheid vom 14.10.2026: INTERN PROVISORISCH FREIGEGEBEN

**Entscheid durch den LSZH-Geschäftsführer:** Das bestehende **LSZH_AVV_v0_9_RC1_Freigabeentwurf.docx**, Original vom **13.10.2026**, wird als **interne, provisorisch akzeptierte Arbeitsgrundlage** für technische Vorbereitung, Dokumentenabgleich und vollständig synthetische Tests behandelt. Original bleibt unverändert (auch wenn darauf noch „nicht freigegeben“ steht). Der Entscheid ist separat im Google-Drive-Freigaberegister **LSZH Vertragsarchiv – Freigaberegister (STAGING)** protokolliert.

**Eindeutige Status-Trennung:**
- AVV-Musterinhalt: **INTERN PROVISORISCH FREIGEGEBEN** / für Staging-Arbeit verwendbar.
- Unterschriften, Kunden- und Projektbezug: **NICHT FREIGEGEBEN**.
- AVV Anlagen A (Daten-/Projektsteckbrief), B (TOM-Nachweise), C (Subprozessoren inkl. Regionen/Genehmigung): **NOCH NICHT kundenbezogen abgeschlossen**.
- Juristische Prüfung inkl. Anwendbarkeit DSG/ggf. DSGVO und Auslandsdaten: **OFFEN**.
- Projektbedingungen v1.0 RC1: **SEPARAT OFFEN**.
- Online-Annahme rechtlich freigegeben in Airtable: **NEIN / unverändert**; sämtliche **harten Make-0=1-Sperren** bleiben bestehen; keine echten E-Mails, keine externe Bereitstellung oder Einladungen, keine Vertragsabschlüsse und keine Produktiv-Szenarien.

**Vor externer Verwendung pro Kunde prüfen:** Identität und Vertretungsbefugnis; Leistungs-/Datenfluss- und Rollenzuordnung (auch kundeneigene Make-Organisation); Kategorien inkl. besondere Daten/Profiling; eingesetzte Anbieter, Regionen, internationale Zugriffe, AVV/SCC; technische und organisatorische Massnahmen mit tatsächlichem Nachweis; Lösch-/Backupfristen; Kundenfreigabe Anlage C; Abstimmung mit finalen Projektbedingungen; richtige AVV-Version als eigenständige schreibgeschützte PDF im **geschäftlichen** Archiv mit SHA-256; unabhängige rechtliche und geschäftliche finale Freigabe.

**Wichtige Dokumentenidentität:** Das Original RC1 enthält Platzhalter, Entwurfsvermerke und keine Signaturen. Der provisorische Geschäftsentscheid wertet es *nicht* zu einer endgültigen rechtsgeprüften, signierten Vereinbarung auf. Es wird durch diese Notiz nicht umbenannt, überschrieben oder als final archiviert.



### Nachtrag 14.10.2026 – RC1-Originale geprüft und echte synthetische PDF-/Annahme-Nachweisstrecke

Die originalen **Projektbedingungen v1.0 RC1 (4 Seiten)** und das **Geschäftsbedingungen-Entscheidungsblatt RC1 (1 Seite)** wurden in der ChatGPT-Library wiedergefunden und mit der vorhandenen **AVV v0.9 RC1 (6 Seiten, Anlagen A–C)** textlich abgeglichen. Originale **nicht verändert**; die frühere Aussage „hier nicht abrufbar“ im Freigabeformular ist damit nur noch historischer Stand. Die AVV bleibt allein **intern provisorisch** als Muster freigegeben; die Projektbedingungen, eine endgültige AVV und kundenbezogene Anlagen sind **nicht extern/rechtlich freigegeben**.

**Bereits geschäftlich definierte Eckwerte (juristisch noch zu prüfen):** D1 Care-Kündigung 30 Tage auf Monatsende; D2 Werkabnahme innert 10 Arbeitstagen ohne automatische Schweigeabnahme; D3 Haftungsdeckel 12 Monate Leistungsentgelt, mindestens CHF 2'000. D3 ist ausdrücklich noch keine rechtsgeprüfte oder extern freigegebene Klausel. Zudem muss eine auftragsbezogene AVV mit Anlagen A–C vor der entsprechenden Kundendatenverarbeitung separat nachweisbar vereinbart werden; aktuelle Online-Angebotsstrecke prüft nur Offerte und Projektbedingungen.

**Isolierte synthetische Make-Tests durchgeführt:**
- `7963939`: zwei verschiedene, als `TEST_ONLY` gekennzeichnete Fake-PDFs erstellt, getrennt ins geschäftliche STAGING archiviert, erneut gelesen, mit SHA-256 sowie Drive Content Restriction kontrolliert. **SUCCESS** (fiktive Offerte 36'691 Bytes; fiktive Projektbedingungen 38'877 Bytes). Danach deaktiviert.
- `7963965`: beide fiktiven PDFs mit richtiger Version/Hash **PASS**. Manipulierter Hash, vertauschte IDs und dieselbe PDF für beide Dokumente wurden korrekt **abgewiesen**; reine Lesetests, kein Statuswechsel. Danach deaktiviert.
- `7963993`: einen **synthetischen, ausdrücklich rechtlich unwirksamen** Annahmenachweis aus den beiden archivierten Fake-PDFs erzeugt, als PDF gespeichert, gesperrt und Hash geprüft: **SUCCESS / actual_contract=false / email_sent=false**. Negativtest mit falschem Hash brach **vor** Dokumenterzeugung ab. Danach deaktiviert.

Ausführliche Klausel- und Testprüfung: [LSZH_RC1_KLAUSELPRUEFUNG_UND_SYNTHETISCHER_ANNAHMETEST_20261014.md](./LSZH_RC1_KLAUSELPRUEFUNG_UND_SYNTHETISCHER_ANNAHMETEST_20261014.md).

**Wichtige Restpunkte:** keine echten Kunden, E-Mails oder Vertragsannahmen getestet; öffentliches Website-/Token-/Annahme-Endpoint und vollständige Airtable-Nachweis-/Versandkette bleiben offen. Im produktiven Staging-Flow `7940220` einen möglichen Fehlerfall nach PDF-Archivierung und vor bestätigtem Mailversand auf Wiederanlauf/Status-Reset prüfen. Rechtliches und geschäftliches D1–D3-Freigabeverfahren sowie allfällige AVV-Anlagen und endgültige PDF-Versionen mit Archiv-ID/Hash bleiben offen. Die Szenarien `7835460`, `7940261`, `7940220` und alle obigen synthetischen Teststrecken sind **inaktiv**, harte `0=1`-Sperren bleiben unberührt. Keine Produktivfreigabe.


### Nachtrag 14.10.2026 – Annahmebeleg vor Versand persistieren und Fehlerwiederanlauf absichern

**Produktionsvorbereitung geändert, aber NICHT aktiviert:** Make `7940220` (Online-Annahmebeleg & Bestätigung). Die bisherige Schwachstelle: `Online-Annahme Beleg Drive ID` wurde erst nach erfolgreicher Kundenmail geschrieben, obwohl das PDF zuvor schon archiviert war. **Neu Modul 15** direkt nach dem abgeschlossenen Google-Drive-Hash/Schreibschutz-Check (Modul 14) und vor E-Mail-Modul 8: `PATCH` auf Airtable zur dauerhaften Speicherung der Beleg-Drive-ID bei weiter gesetzter `Online-Annahme Bestätigung in Bearbeitung=true`. E-Mail-Modul 8 prüft zusätzlich Airtable-PATCH-Erfolg und referenzierte Beleg-ID und bleibt **hart `0=1` gesperrt**. Abschlussmodul 9 schreibt erst **nach** erfolgreicher Mail das Versanddatum und setzt `in Bearbeitung=false`; eine verspätete Beleg-ID-Schreibung wurde entfernt. Polling-Modul 1 schliesst bereits archivierte `Online-Annahme Beleg Drive ID` aus. Szenario verarbeitet sequenziell.

**Synthetisch geprüft:** Fake-Offerte `TEST-RECOVERY-20261014-NO-CONTRACT`, Status Entwurf, `Online-Annahme rechtlich freigegeben = NEIN`. Isolierter Test `7964528` prüfte tatsächlich geschützten Fake-Drive-Nachweis, persistierte dessen ID via Airtable-API und erzeugte danach absichtlich einen Laufzeitfehler als simuliertes Mailproblem. Resultat: Ausführung `b296998f54ff453cbbb33434f9247bb4` mit erwarteter Exception **nach** erfolgreichem PATCH; Airtable-Beleg-ID unverändert vorhanden, `in Bearbeitung=true`, kein Versanddatum, keine Mail. Test deaktiviert.

**Read-only-Triage `7964549`:** drei Make-Testausführungen: (1) gespeicherter Beleg + unklarer Versand ⇒ **MANUAL_REVIEW_BEFORE_ANY_EMAIL**, (2) gesperrter Vorgang + noch keine Beleg-ID ⇒ **MANUAL_REVIEW_BEFORE_PROOF_RETRY**, (3) keine Freigabe ⇒ **BLOCKED_NOT_LEGALLY_APPROVED**. In allen Fällen `may_auto_send=false`. Test deaktiviert. Synthetische Offerte bleibt intern erkennbar und wurde in den gewollten Fehlerzustand zurückgesetzt.

**Operative Restgrenze:** Unterbrechung zwischen Drive-Upload und Modul-15-PATCH kann ein PDF ohne Referenz im Airtable-Datensatz hinterlassen; die Bearbeitungssperre verhindert automatische Zweiterstellung, aber eine **manuelle Drive-Suche** ist dann nötig. Bei erfolgreicher Kundenmail und fehlgeschlagener finaler Statusaktualisierung kann die E-Mail schon versandt sein; ohne providerseitige Idempotenz-/Transaktionsgarantie ist automatischer Retry riskant. **Nie blind erneut senden**, zuerst Postausgang und Make-Logs prüfen.

Detaillierte Anleitung/Entscheidungstabelle: [LSZH_ANNAHMEBELEG_WIEDERANLAUF_STAGING.md](./LSZH_ANNAHMEBELEG_WIEDERANLAUF_STAGING.md). Rechtliche/geschäftliche Freigabe, öffentliche Online-Annahme, echte Kundenmails und sämtliche produktiven Aktivierungen **weiterhin offen und gesperrt**.


### Klarstellung 14.10.2026 – D1–D3 geschäftlich bereits definiert
Auf ausdrücklichen Hinweis des Geschäftsführers sind **D1–D3 keine erneut zu entscheidenden Geschäftsfragen**. Die bereits erarbeiteten Geschäftsparameter gelten für die weitere interne Vertragserstellung als **festgelegt**:
- **D1 Care-Kündigung:** 30 Kalendertage auf Monatsende, soweit keine abweichende Mindestlaufzeit vereinbart; zwingende Rechte (insbesondere ggf. Art. 404 OR) vorbehalten.
- **D2 Abnahme:** Prüfung innerhalb von 10 Arbeitstagen, **keine** fiktive Abnahme allein durch Schweigen.
- **D3 Haftung:** Bei leicht fahrlässig verursachten unmittelbaren und vorhersehbaren Vermögensschäden Entgelt der betroffenen Leistung der letzten 12 Monate, **mindestens CHF 2'000**, soweit wirksam und angemessen; Vorsatz, grobe Fahrlässigkeit und zwingende Haftungsgrenzen nicht ausschliessen.
**Status-Trennung:** Geschäftliche Eckwerte **definiert**; juristische Angemessenheit/Wirksamkeit **ungeprüft bzw. offen**; RC1-Dokumente und tatsächlicher Kundeneinsatz **nicht final freigegeben**. Alte Einträge «D1–D3 Geschäftsentscheid offen» sind **historischer Prüfstand** und durch diese Klarstellung überholt. Kein zusätzlicher Freigabe- oder Versandautomatismus, Make-Sperren unverändert. Es wird nicht nochmals nach denselben Eckwerten gefragt.


### Nachtrag 14.10.2026 – Entwicklungsfreigabe ohne vorgezogene juristische Freigabe; optionale AVV

**Entscheid des Geschäftsführers:** Juristische Prüfung der Projektbedingungen und AVV soll **zu einem späteren Zeitpunkt** stattfinden. Alle weiteren technischen Entwicklungs- und synthetischen Integritätstests werden nun **unter der Arbeitsannahme „als ob juristisch freigegeben“** weitergeführt, ohne diese Freigabe als rechtliche Tatsache zu behaupten, echten Kundendatenzugriff oder Produktivabschlüsse zu erlauben. D1–D3 (Care 30 Kalendertage zum Monatsende, Abnahme 10 Arbeitstage ohne Schweigeabnahme, Haftung 12 Monate Entgelt der betroffenen Leistung mindestens CHF 2'000) sind **geschäftlich bereits definiert**; keine erneute Grundsatzrückfrage. RC1-Originale unverändert, interne AVV-provisorische Freigabe ebenfalls unverändert. Spätere Rechtsprüfung bleibt formeller Launch-Meilenstein.

**Airtable Offerten – neue additive Felder:** AVV Drive ID (`fldojDAkMfvjJycme`), AVV-SHA256 (`fldbhBi71Jmr6g9Uk`), AVV-Version (`fld4cMFAPuSfLjz2B`), AVV ausdrücklich akzeptiert (`fld8gm2LLGAeHeBSA`). Bestehendes Auswahlfeld `AVV erforderlich` (Ja, Nein, Prüfen) weiterverwendet. Keine bestehenden Offertenzellen/echten Kundenannahmen verändert.

**Testlauf mit realen Make-/Google-Drive-Modulen, jedoch rein fiktiven Dokumenten:**
- `7964777`: `TEST_ONLY`-AVV-Anlagen A–C als 47'341-Byte-PDF erzeugt, im Geschäftskonto-STAGING separat gespeichert, readOnly gesetzt und SHA-256 sowie Ordner geprüft – **SUCCESS**; danach deaktiviert.
- `7964807`: optionalen AVV-Pfad an 8 Konstellationen getestet. `Ja` mit drei PDFs und simulierter zusätzlicher AVV-Zustimmung/vertretungsberechtigter Person **SUCCESS**; `Nein` mit zwei PDFs **SUCCESS**. `Prüfen`, fehlende Zustimmung, falscher AVV-Hash, fehlende Vertretungsprüfung, fehlende Version und Inkonsistenzen **BLOCKIERT**. Danach fiktiven Annahmenachweis bei `Ja` und `Nein` tatsächlich als PDF archiviert und schreibgeschützt; falscher Hash stoppt vor Belegerstellung; `real_contract=false, email_sent=false`. Wieder deaktiviert.
- Im `Nein`-Beleg wurde eine anfangs irreführende AVV-Prüfsummendarstellung korrigiert und der zweidokumentige Pfad anschliessend erneut erfolgreich geprüft.

**Produktionsnahe Staging-Sicherheit:** `7940261` für Annahmelink hat zusätzlich `AVV erforderlich=Nein` als Filter, `7940220` für Annahmenachweis dieselbe Bedingung in der Suchformel. **AVV Ja und Prüfen sind bis zur echten Drei-Dokumenten-Verkabelung an Website/Token/Mail/Nachweis blockiert**; alle Szenarien weiterhin inaktiv und `0=1`-Mail-/Claim-Sperren aktiv. Es ist **keine** produktive Annahme freigegeben.

Technisches Testprotokoll und Integrationsplan: [LSZH_OPTIONALE_AVV_ANNAHME_TECHNIKTEST_20261014.md](./LSZH_OPTIONALE_AVV_ANNAHME_TECHNIKTEST_20261014.md). Nächster Fokus: vollständig bedingte AVV-Anzeige/Einzelzustimmung im **nicht live geschalteten** Website-Annahmezweig und korrekte bedingte AVV-PDF-Beilagen in Annahmelink und Beleg. Nach vollständiger technischer Abnahme bleiben echte Verträge/E-Mails, Kundenfreigabe und formelle spätere Rechtsprüfung getrennt.


### Nachtrag 14.10.2026 – Website-AVV-Draft ohne Live-Merge

**Entwicklung getrennt vom Livebetrieb:** GitHub **Draft PR #5** `feature/optional-avv-acceptance-staging-20261014` → `feature/secure-offer-acceptance-20261013`. Auf einer **isolierten, nicht auf die Live-Website gemergten Branch** wurden `offerAcceptance.js` und `offerArchiveVerifier.js` erweitert. Bei `AVV erforderlich=Ja`: Dritt-PDF inkl. Drive-ID, SHA-256, PDF-MIME, Drive-Schreibschutz, Geschäftsarchivordner und AVV-Version prüfen; Vorschau zeigt bedingte AVV-Version/Hash; gesicherter AVV-PDF-Download, Annahme benötigt zusätzliche explizite Zustimmung `accept_avv=true` sowie exakt passenden AVV-Hash und Version; AVV-Zustimmung und PDF-Hash werden im Nachweis sowie im Airtable-Feld `Online-Annahme AVV ausdrücklich akzeptiert` protokolliert. `AVV erforderlich=Nein` erlaubt keine unverlangte AVV-Zustimmung/-Dateien; `Prüfen` blockiert. Angebot-/Projektbedingungen-PDFs müssen zusätzlich demselben konfigurierten Geschäftsarchivordner angehören. Neues erforderliches Env-Gate `OFFER_DRIVE_ARCHIVE_FOLDER_ID`. Implementierter Testsatz `test/offerAcceptance.avv.test.js` prüft acht AVV-Konstellationen auf Node-Ebene; Syntax von drei Dateien über JavaScript-Parser geprüft.

**Offene technische Punkte:** Node-Tests noch nicht ausgeführt (`node --test`/CI), tatsächliche gemeinsame Website-UI/Checkbox-Präsentation nicht fertig, reale serverseitige Drive-Dienstkonto-Berechtigung noch offen, end-to-end Make-Attachments bei AVV=Ja noch nicht implementiert. **Draft PR nicht mergen oder deployen**. Die bisherigen isolierten Make-AVV-Tests bestanden; sie sind von dieser Server-Branch getrennt. Make-Produktionsvorbereitung `7940261`, `7940220` bleibt inaktiv und AVV=Ja/Prüfen bleibt fail-closed, alle Mail- und Claim-Gates `0=1` aktiv.

**Geschäftlicher Entscheid:** Entwicklung vorziehen, juristische Prüfung später vor echtem Kundenbetrieb; nicht als wirkliche aktuelle Freigabe kennzeichnen. Kein Kundenversand, keine Annahme, keine externe Einladung.

Link: https://github.com/lszh-automations/lszh-automations-site/pull/5


### Nachtrag 14.10.2026 – optionale AVV im Webformular und geprüfte Anhang-Metadaten

**Website-Draft (NICHT DEPLOYT):** Auf `feature/optional-avv-acceptance-staging-20261014`, [Draft PR #5](https://github.com/lszh-automations/lszh-automations-site/pull/5), die echte HTML-Oberfläche `offerte-annehmen/index.html` ergänzt. Bei `AVV erforderlich=Ja` erscheinen drittes PDF, AVV-Version und eine **eigene, nicht vorangekreuzte erforderliche Checkbox**. Bei `Nein` bleiben diese Elemente versteckt; `Prüfen` wird serverseitig verweigert. Der Client übergibt gesondertes `accept_avv`, AVV-Version und SHA-256 an `/api/offer/accept`; nur wenn die serverseitige Prüfung den richtigen archivierten PDF-Datensatz bestätigt, kann die AVV-Zustimmung im Entwurfszweig in Airtable protokolliert werden. Neue `OFFER_DRIVE_ARCHIVE_FOLDER_ID`-Anforderung bei PDF-Prüfung; kein serverseitiges Dienstkonto angelegt. Branch nicht in main gemergt.

**Automatisierte GitHub-Tests wirklich ausgeführt:** Die GitHub Actions-Suite `Offer acceptance checks` wurde um `test/offerAcceptance.avv.test.js` und `test/offerAcceptance.ui.test.js` erweitert. Veraltete frühere Test-Fixtures (fehlender AVV-Modus und fehlender Drive-Elternordner) korrigiert, ohne Sicherheitsprüfungen abzuschwächen. **Erfolgreicher GitHub Actions Lauf 38631231782: 28 Tests, 28 bestanden, 0 fehlgeschlagen; Node- und Browser-Skriptsyntax erfolgreich.** Dies ist eine Test-Branch-Prüfung, kein echtes Browser-/Dienstkonto-End-to-End.

**Make-STAGING (ausschliesslich synthetisch):** Isoliertes `7964807` nach erfolgreicher 2-/3-PDF-Prüfung um Modul 18 ergänzt, das **nur Metadaten** der vorgesehenen Anhänge als prüfbare Liste zusammenstellt: Offerte + Projektbedingungen bei `Nein` (2), zusätzlich AVV bei `Ja` (3). Manifest erhält separate PDF-Datei-IDs und SHA-256-Werte und wird im als ungültig beschrifteten synthetischen Annahmenachweis referenziert. Beide positiven Pfade in echten Make-Ausführungen erfolgreich durchlaufen, bewusst falscher AVV-Hash scheitert **vor** Belegerstellung. Kein Gmail-Modul in der Teststrecke; Testscenario danach wieder inaktiv.

**Wichtige Grenze:** Die Metadatenliste ist **noch kein real getesteter E-Mail-Anhang**. In den produktionsnahen, weiterhin inaktiven Make-Szenarien `7940261` und `7940220` ist der AVV=Ja/Prüfen-Pfad weiterhin **fail-closed**. Noch offen: bedingte 2/3 PDFs beim Linkversand und 3/4 PDFs bei der Bestätigung tatsächlich ohne echten Versand konfigurieren/verifizieren; Backend-E2E mit kundeneigenem Dienstkonto; Race-/Idempotenzkontrolle einer echten Annahme. Rechtsprüfung und echte Freigaben wie vom Geschäftsführer beschlossen erst vor Produktivstart. Alle Kundenmail-/Claim-0=1-Gates weiter aktiv; keine Live-Änderung.


### Nachtrag 14.10.2026 – tatsächlich konfigurierte Make-Gmail-Anhänge AVV Nein/Ja und Binärdatei-Test

**Änderung (STAGING, KEINE PRODUKTIONSAKTIVIERUNG):** Für den elektronischen Offerten-/Annahmeprozess sind bedingt nach `AVV erforderlich` getrennte, fail-closed Make-Verarbeitungspfade aufgebaut:
- **AVV Nein** – bestehendes Annahmelink-Szenario `7940261` (inaktiv, harter 0=1-Gate bei Token-Modul 2 und Mail-Modul 5): Airtable-Suchformel zusätzlich explizit `{AVV erforderlich}='Nein'`; echte Gmail-Modulzuordnung bereits **2 PDF-Anhänge** (Offerte, Projektbedingungen). Bestehendes Bestätigungs-Szenario `7940220` (inaktiv, Claim 2 und Gmail 8 0=1 gesperrt) selektiert ausschliesslich AVV Nein; echte Gmail-Zuordnung **3 PDF-Anhänge** (Offerte, Projektbedingungen, Annahmenachweis).
- **AVV Ja Offertenlink** – neues explizit getrenntes, **inaktives** Staging-Szenario `7965215`: auf Basis der bestehenden Abläufe mit zusätzlichem Google-Drive-Download Modul 11 und Metadaten-/SHA-Check Modul 12 für kundenspezifische AVV. Select-Formel verlangt AVV Ja, AVV-Datei-ID/-SHA/-Version und noch keine Annahme/AVV-Zustimmung; vor Token-Speicherung Dateiname/MIME, SHA-256 gegen Airtable und heruntergeladene Datei, Drive-Elternordner sowie `readOnly=true` durch Filter geprüft. In echtem Gmail-Modul 5 drei **fest und getrennt gemappte PDF-Attachments** `{{7.data}}` (Offerte), `{{8.data}}` (Projektbedingungen), `{{11.data}}` (AVV samt Anlagen). Token-Erstellung und Gmail behalten eigene harte `0=1`-Filter, E-Mail wird **nicht** versendet.
- **AVV Ja Annahmebestätigung** – neues explizit getrenntes, **inaktives** Staging-Szenario `7965223`: selektiert nur bereits angenommene, ausdrücklich AVV-akzeptierte Aufträge, deren Dritt-PDF-ID/Hash/Version hinterlegt ist. Module 16 und 17 lesen/prüfen AVV-PDF vor Claim; Claim 2 bleibt hart 0=1 gesperrt. Bewährte Reihenfolge Archivieren -> Schutz/Hash prüfen -> Drive-Beleg-ID VOR Mail in Airtable persistieren bleibt erhalten. Echtes Gmail-Modul 8 enthält **4 gemappte PDF-Anhänge** `{{3.data}}` Offerte, `{{4.data}}` Projektbedingungen, `{{16.data}}` AVV, `{{6.data}}` Annahmenachweis; ebenfalls harter `0=1`-Gate. Kundenmail-Text weist auf die AVV hin. Beide AVV-Ja-Varianten von Make strukturell ohne Validatorfehler gespeichert; vorhandene Verbindungen Google Drive/Gmail/Airtable sind `ok`.
- Es existieren damit vier **separate** derzeit inaktive Pfade (AVV Nein/Ja für Link und Bestätigung), nicht ein zentraler Router. Doppelte Verarbeitung wird durch gegenseitig ausschliessende `AVV erforderlich`-Suchbedingungen verhindert; für Livebetrieb zusätzlich organisations-/kundenbezogene Freigabe, Idempotenz und Monitoring abschliessend prüfen.

**Tatsächlich ausgeführter technischer Binärdatei-Test OHNE Mail:** Isoliertes On-Demand-Test-Szenario `7965246` lädt via geschäftlicher Make-Google-Drive-Verbindung vier synthetische `TEST_ONLY`-PDF-Dateien als **Binärdaten**, überprüft Dateibezeichner/IDs, MIME `application/pdf`, SHA-256-Format, Dateigrösse, Ablage im Geschäftsarchiv und vorhandene Daten. Lauf `fcdfa4ee1e1c4738bc4300abe8b05d2e`: AVV Ja -> **SUCCESS**, vier Anhänge: Offerte/Projektbedingungen/AVV/Annahmenachweis. Lauf `d2e8f0d006ab44d1b404cd51c7d96b64`: AVV Nein -> **SUCCESS**, drei Anhänge ohne AVV. Lauf `9ed43f65599446578ccf6c09bc77ba5c`: `Prüfen` -> bewusster **ERROR** `INVALID_AVV_MODE`. Danach Test-Szenario deaktiviert. Alle Ausgaben `send_permitted=false`; keine Mail in diesem Szenario.

**Wichtig für die Abnahme:** Die Gmail-Module sind nun wirklich mit den erwarteten 2/3/3/4 `attachments[]` (Dateiname plus `data` aus Drive-Modulen) konfiguriert, jedoch wegen der Einwilligungs-/Sicherheitsgrenzen **nicht durch tatsächliches Senden ausgeführt**. Der Binärtest prüfte die Dateien separat – er beweist **nicht**, dass Gmail sie bereits einmal erfolgreich als Nachricht transportiert hat. Alle produktiven/produktionsnahen Szenarien und ihre Mail- sowie Token/Claim-Gates bleiben inaktiv/gesperrt. Live-Website unverändert; GitHub [Draft PR #5](https://github.com/lszh-automations/lszh-automations-site/pull/5) bleibt ungemergt; GitHub CI für Branch hatte zuvor **28/28 Tests bestanden**.

**Noch offen:** sichere Integration der getrennten Make-Pfade in ein dokumentiertes Deployment-/Anlagen-Konzept, vollständiger Website→Airtable→Make→Drive-Nachweis mit synthetischem Token und echter Browser-Nutzung, Zugriff des eingeschränkten Google-Dienstkontos, Finalität der AVV-Anlagen/Projektbedingungen und später juristische Prüfung vor echtem Kundenbetrieb, ausdrückliche Einwilligung zu produktivem Versand/Aktivierungen. Keine echten Nachrichten, Verträge oder Einladungen.


### Nachtrag 14.10.2026 – HTTP-Synthetik und echte Make/Airtable/Drive-Testkette, Parallelitätsbefund

**Website-HTTP-Test (nur Mock-Provider):** Im nicht deployten GitHub Draft PR #5 `feature/optional-avv-acceptance-staging-20261014` läuft nun `test/offerAcceptance.http.test.js` mit tatsächlichem lokalem `server.js`-HTTP-Server. Airtable, OAuth und Drive werden ausschliesslich lokal mit ephemeren Test-Credentials simuliert. Es werden echte HTTP-Requests und echte Codepfade für Vorschau, PDF-Bytes, AVV-Zustimmung und Nachweis-PATCH getestet, ohne externe Daten zu bearbeiten. Rate-Limit-Schutz blieb erhalten. **GitHub Actions 38633804997: 42/42 Tests grün**, 0 fehlgeschlagen. Die CI-Konfiguration danach auf explizite `test/*.test.js` umgestellt.

**Make + Airtable + Google Drive (wirkliche, aber ausschliesslich fiktive Datensätze und Dateien):** Testofferte `TEST-HTTP-MAKE-AVV-20261014-NO-CONTRACT`, Airtable `recMv3OYZQwXzIHdF`, **Status Entwurf**, AVV-/Rechtsfreigabe nicht erteilt, keine Kundenadresse. Neues isoliertes Make-Szenario `7965394` holt *nur* diesen Datensatz, prüft strikte `TEST_ONLY`-Voraussetzungen, ruft Kind-Testscenario `7964807` für AVV-Ja-Nachweis aus **drei echten fiktiven PDFs** auf, erhält archivierte/geschützte Beleg-ID+SHA und schreibt nur beim Testdatensatz Belegreferenz sowie technischen Testnachweis. Ergebnis Eltern `c70e542cf2c942068cdabdd2e1c1e251` und `83338135d01a4f14804265ddf8f9f8dd`: jeweils SUCCESS, status **nicht** angenommen, no contract/no mail.

**Wichtiger aufgefundener Parallelitätsfehler:** Zwei nahezu gleichzeitige synthetische Läufe erzeugten ohne vorherige Sequenzialisierung zwei PDF-IDs `1tu_1vumOzKDI6KH1TQREYlya5JqZSf83` und `1jD8BXp5FjkXcChvrPvX974_9_o_UT4O9` (gleicher SHA-256, unterschiedliche Google-Dateien). Drittlauf `47013a17168e4a759cfe25fd0e5585dc` stoppte bei bereits vorhandener Beleg-ID. Danach **Make-Setting `sequential=true`** am isolierten Parent gesetzt; erneuter Lauf `eba45e394d0e40cf8709c92eaf647e2f` stoppte bereits beim Preflight ohne weitere Archivdatei. **Sequenziell reicht allein nicht für produktive Exactly-once-Garantie über mehrere Startkanäle und atomare Airtable-Transaktionen.** Die zwei fiktiven Belege bleiben als QA-Nachweis. Beide Make-Testszenarien am Ende **inaktiv**.

**Grenzen:** Diese beiden erfolgreichen Testhälften sind **noch keine** durchgehende öffentliche Website mit echter Airtable/Make/Drive-Annahme. Geschäftsarchive-Dienstkonto und Render-Workspace müssen noch kontrolliert werden; der Render-Connector verlangt eine explizite Workspace-Bestätigung, die nicht erraten werden darf. Produktive Szenarien, Sendegates und GitHub-Draft bleiben unangetastet/inaktiv. Kein Vertrag, keine Einladung, keine E-Mail, keine juristische Freigabe.

Ausführliches Prüfprotokoll: [LSZH_SYNTHETISCHER_HTTP_MAKE_AIRTABLE_DRIVE_E2E_20261014.md](./LSZH_SYNTHETISCHER_HTTP_MAKE_AIRTABLE_DRIVE_E2E_20261014.md).


### Nachtrag 14.10.2026 – Google-Identität: geschäftliche Eigentümerschaft und private Altbestände

**Verbindliche Zielvorgabe des Geschäftsführers:** Für LSZH Automations sollen Google Cloud, das serverseitige Archiv-Dienstkonto sowie die Google-Drive-/Docs-/Gmail-Verbindungen **ausschliesslich** über die Google-Identität `lars@lszh-automations.ch` bzw. geschäftlich kontrollierte Ressourcen laufen. **Keine neue produktive LSZH-Ablage im privaten `lars.schulthess10@gmail.com`.** Die privaten Altbestände erst nach nachgewiesen vollständiger geschäftlicher Sicherung und aktualisierten Referenzen bereinigen. Keine Dateilöschung, Freigabe oder Verschiebung ohne konkreten Migrationsnachweis.

**Kontrollierte Ownership-Prüfung (tatsächliche verbundene Apps):**
- Google-Drive-App direkt in ChatGPT ist zum Stand der Prüfung **mit privatem Gmail-Kontext verbunden** und zeigt privates STAGING-Vertragsarchiv `1_1jVIlD2MAwkVxpTsCUIZ-14LjQggmA3`, seine Unterordner `Offerten-PDF`, `Projektbedingungen`, `Annahmenachweise` sowie u.a. das **private** Google-Doc `LSZH Vertragsarchiv – Freigaberegister (STAGING)` `1ANPIYiKzLIg_yxKifhy5lZHQe0zIwfo2yD2Ll69fhtw`. Eigentümer durch Drive-Metadaten: `lars.schulthess10@gmail.com`. Die direkt verbundene private Drive-App kann das geschäftliche Ordner-ID `1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in` derzeit **nicht** lesen (HTTP 404 wegen kontengetrennten Zugriffs).
- Die zentrale **Make Google Drive**-Verbindung `11904271`, Google Docs `11905001` und Gmail `11904991` tragen den Geschäftskonto-Kontext `lars@lszh-automations.ch`, Status bei den LSZH-Szenarien `ok`. Über das nachweislich geschäftlich authentifizierte Make-Drive-API-Get wurden **Eigentümer und HTTP 200** für Vertragsarchiv-STAGING `1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in`, Unterordner `Offerten-PDF`, eine bereits kopierte Alt-Offerte und eine `TEST_ONLY`-AVV bestätigt: **jeweils Eigentümer `lars@lszh-automations.ch`**. Read-only-Szenario `7965546` nach der Prüfung deaktiviert.
- Das geschäftliche Staging-Hauptarchiv hat bereits Unterordner `Offerten-PDF` `1COIjnGZDK1XCPXNBNikHw-7eUKfjNXgU`, `Projektbedingungen` `1o9ADwrIAuhEtP7Mv7tDCY9-OkNpCxX3I` und `Annahmenachweise` `1Q8ws0VjPeDSOYhKrx5a6I5_uhzRM2zN7`; zum Prüfzeitpunkt **alle drei leer**, da neue synthetische PDFs bislang im Geschäfts-STAGING-Hauptordner liegen. Keine neuen Unterordner anlegen, bevor alte bereits vorhandene berücksichtigt sind.
- Geschäftlich kontrollierte Ordner `Migration-Altbestand Offerten` und `Migration-Altbestand Rechnungen` enthalten nach Read-only-Inventur **10** und **23** gespeicherte DOCX-Kopien. Dies ist eine **Bestandsaufnahme**, **noch kein lückenloser 1:1-Bytevergleich aller Quellen/Versionen**. Die privaten historischen LSZH-Rechnungen und Altverzeichnisse bleiben erhalten, bis Kopien und Ablage-Verweise geprüft sind.
- Zwei aktive Make-Szenarien gefunden, eines mit iOS-/Google-E-Mail-Integration und ein weiteres nicht zur LSZH-Vertragsablage gehörendes. Diese **nicht verändert**. LSZH-Offerten-/Annahme-Produktionsvorbereitungen bleiben inaktiv und hart gegatet.

**Entscheidung für Google Cloud:** Bei `console.cloud.google.com` **als `lars@lszh-automations.ch` anmelden**, das Google-Cloud-Projekt und ein auf Drive-Lesen beschränktes Dienstkonto in derselben geschäftlich verwalteten Identität/Projektverwaltung anlegen. Dem Dienstkonto **nur Leserechte** an den tatsächlich benötigten geschäftlichen Vertragsarchiv-Ordnern gewähren, keine pauschalen Google-Cloud-Administratorrollen oder private Drive-Freigaben. *Dienstkonto ist eine eigenständige technische Identität, nicht identisch mit dem Benutzer.* Noch keine JSON-Private-Key-Datei in GitHub/Airtable/ChatGPT hochladen. Später für Render eine sichere Authentisierung/Secret-Bereitstellung planen. Bei Google Workspace können Sharing-/Trust-Rules die Freigabe an `gserviceaccount.com` beeinflussen.

**Notwendige Umstellung vor realem Kundenbetrieb:**
1. ChatGPT Google-Drive-App **erst nach abgesicherter Migration** mit der Google-Identität `lars@lszh-automations.ch` (neu) verbinden oder umstellen; Benutzerinteraktion nötig, kein automatisches Connector-Account-Switching.
2. Den noch privat geführten **Freigaberegister-Originalinhalt** versioniert ins geschäftliche Google Drive übertragen, neues Geschäftsdokument als Quelle bestimmen; danach alle automatischen/doc-Referenzen des alten privaten Registers aktualisieren und Byte-/Inhaltsgleichheit verifizieren.
3. Private Rechnungs-/Offerten-Altbestände gegen die 10 + 23 Geschäftskopien auditieren und fehlende Exemplare sicher kopieren; keine Löschung der Quellen bis zum verifizierten Abgleich.
4. Die bestehenden drei geschäftlichen Unterordner nach Bedarf befüllen, Make-/Render-Archivpfade und SHA-/Parent-Prüfungen konsistent umstellen. Ordnerumzug ohne gleichzeitiges Metadaten-Gate-Update würde die Integritätstests blockieren.
5. Business-Google-Drive-Freigabe für Dienstkonto minimal halten. Dienstkonto-/Render-Zugang zuerst mit rein synthetischen Dateien testen, später formelle Betriebs-/Rechtsfreigabe.

**Während Audit ausgeführt:** Make-Szenario `7943019` (Geschäftskonto-Ordnerinventur read-only) temporär aktiviert, Hauptordner und fünf Unterordner inventarisiert, danach deaktiviert. Make-Szenario `7965546` (Business Drive Eigentümer read-only) ebenfalls nur für obige Viererprüfung temporär aktiviert und deaktiviert. **Keine Shares, neuen Fremd-Konten, Dateiumzüge, Dateilöschungen, E-Mails oder Vertragsabschlüsse.** Das frühere private Register wurde bei dieser Prüfung nicht verändert.


### Nachtrag 15.10.2026 – Google-Cloud-Dienstkonto und Archiv-Lesefreigabe bestätigt

**Google Cloud vom Geschäftsführer im Geschäftskonto erstellt/konfiguriert:** Organisation `lszh-automations.ch`, Projektname `LSZH Automations`, Projekt-ID `lszh-automations` (Projektnummer `470613067122`). Google Drive API im Projekt laut Console-Screenshot **aktiviert**. Dienstkonto `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com` mit Name `LSZH Archive Reader` laut Console-Screenshot **aktiviert**. Keine projektweiten IAM-Rollen vergeben; ausdrücklich **keine JSON-Schlüsseldatei** in GitHub, Airtable, ChatGPT oder E-Mail bereitstellen.

**Dienstkontoordnerfreigabe unmittelbar über die echte Make-Google-Drive-Geschäftsverbindung unabhängig verifiziert:** Read-only-Audit-Szenario `7965546`, Make-Ausführung `ebf4c08392874df496acfbb8004cb840`, Drive v3 `GET /files/1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in` mit `permissions(type,role,emailAddress),owners,shared,parents`, HTTP 200. Ordner `LSZH Automations Vertragsarchiv – STAGING – Geschäftskonto`. Eigentümer `lars@lszh-automations.ch`, zweite explizite Freigabe **`lszh-archive-reader@lszh-automations.iam.gserviceaccount.com` als `role=reader`**, nicht writer und nicht owner. Damit ist die **Drive-Berechtigungsfreigabe** bestätigt. Audit-Szenario danach **wieder deaktiviert**. Ordner selbst bleibt nicht öffentlich freigegeben.

**Weiterhin offen – nicht als erledigt melden:** Serverseitige Authentifizierung der Website/Render **als Dienstkonto selbst** und tatsächliche PDF-Integritätsabfrage über diesen Account sind noch nicht ausgeführt. Laufendes Render-Deployment weiterhin unverändert; keine echten Vertragsabschlüsse. Sicheres Secret-/Keyless-Verfahren wählen. Vorzugsweise Workload Identity Federation *nur falls* mit Hosting und zugelassenem Identitätsanbieter unterstützbar; falls technisch nur JSON-Schlüssel praktikabel, diesen ausschliesslich lokal/über Render Secret-Umgebung bereitstellen, nie als Nachricht/Repo/Airtable übermitteln, Rotation und Beschränkung planen. Geschäftliches Freigaberegister befindet sich noch im privaten Drive und muss versioniert migriert und geprüft werden. Das alte Privatkonto vor vollständiger Migration nicht trennen oder Dateiquellen löschen.


### Nachtrag 15.10.2026 – isoliertes Render-Staging für Offertenannahme erfolgreich bereitgestellt

**GitHub-Autorisierung Render:** Der Geschäftsführer hat die Render GitHub App für `lszh-automations/lszh-automations-site` verbunden. Die Live-Render-Website `lszh-automations-site` (Service `srv-db1r13ad0e5s7390tcr0`) bleibt auf `main`, Auto-Deploy **yes**, PR-Previews **off**, durch diese Arbeit **nicht verändert**. Eine vorhandene unabhängige Rechnungs-Testinstanz `lszh-swiss-qr-staging` (Service `srv-db7cn5q5b2lc73fecb1g`) bleibt ebenfalls unverändert.

**Neue separate, kostenlose Render-Webinstanz (keine gemeinsamen Live-Variablen):**
- Render-Workspace `My Workspace` / `tea-db1qm7btqb8s73eajs8g` (Geschäftskonto `lars@lszh-automations.ch`).
- Name `lszh-offer-acceptance-staging`; Render-Service-ID `srv-db88q5jncjis73f2g93g`; [Dashboard](https://dashboard.render.com/web/srv-db88q5jncjis73f2g93g); Testdomain `https://lszh-offer-acceptance-staging.onrender.com` (**nicht öffentlich für Nutzer freigegeben**).
- Gleicher GitHub-Repository-Quellcode, aber Branch `feature/optional-avv-acceptance-staging-20261014`, **nicht main**; Node, Region Frankfurt, `plan=free`, `autoDeploy=no`, PR-Preview `off`.
- Build-Befehl `npm test`, Start `node server.js`; ausschliesslich die neuen, nicht geheimen Umgebungsvariablen `SITE_PRIVATE=true`, `OFFER_ACCEPTANCE_ENABLED=false`, `NODE_ENV=staging`. **Keine** Live-Make-Webhooks, echten Airtable-Tokens, Google-Dienstkonto-Credentials oder produktiven E-Mails in dieser Staging-Instanz. Kein `PREVIEW_TOKEN` gesetzt: Site-Code verweigert ohne Vorschau-Token Requests mit HTTP 503. Dieser HTTP-Status wurde noch nicht von ausserhalb geprüft, Code-Gate und Konfiguration aber gelesen/gesetzt.
- Initiales Deploy `dep-db88q6bncjis73f2gagg`, Commit `0d9cfae30f366fee66f8c4b52fd91ec17fbd9d84`; via Render API `status=live` **nur für Staging-Service**, nicht LSZH-Live-Hauptseite. Render-Buildlogs: **41 Tests / 41 bestanden / 0 Fehler**, `Build successful`, Node-Server gestartet. Hier bedeutet Deploy `live` die erfolgreiche Bereitstellung des **gesperrten Staging-Dienstes**, **keine** Kundenfreigabe.
- Der User hat **keine** weiteren manuellen Arbeiten gebraucht. Neues GitHub-Draft-PR #5 bleibt ungemergt.

**Offen vor echten Website-/Drive-End-to-End-Tests:** Ein sicherer Preview-Zugang für den nur internen Testzugriff; serverseitige Authentifizierung als das inzwischen angelegte und zum **Geschäftsarchiv als Reader freigegebene** Google-Servicekonto `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com`, vorzugsweise kurzlebige bzw. keyless Anmeldedaten, alternativ eng kontrolliertes Secret in Render. Keine JSON-Private-Keys via Chat/GitHub/Airtable, keine ungeprüften Geheimnisse an die Staging-Instanz kopieren. Erst rein synthetische Dateien und Ansprüche testen; Produktionsszenarien/echte Kundendaten/Vertragsfreigaben bleiben gesperrt. Die spätere juristische Prüfung vor produktivem Vertragsabschluss ist ein separater Freigabepunkt.


### Nachtrag 15.10.2026 – Render-Staging Google-Reader vorbereitet und Secret-Datei-Auslieferung gesperrt

**Erfolgreich:** Auf dem weiterhin ungemergten PR #5 im Branch `feature/optional-avv-acceptance-staging-20261014` wurde eine konkrete Secret-File-Auslieferungsgefahr behoben: Render stellt bei Node-Diensten Secrets auch im Service-Stammverzeichnis bereit; der frühere beliebige Static-File-Zugriff wurde durch eine **explizite Liste öffentlicher HTML-/robots-Pfade** ersetzt. Neue HTTP-Negativtests verhindern das Ausliefern von Quellcode, `.env`, `package.json`, Test-/Docs-Dateien und `lszh-archive-reader.json`. Der Reader-Verifier akzeptiert neu im Staging das fest vorgegebene lokale Render-Secret-File `/etc/secrets/lszh-archive-reader.json` mit PIN auf `lszh-archive-reader@lszh-automations.iam.gserviceaccount.com`. Fehlender oder fremder Pfad/falsches Dienstkonto werden abgelehnt. **Kein echtes JSON-Geheimnis erstellt oder hinterlegt.**

**Readiness:** Nur im privaten Staging `srv-db88q5jncjis73f2g93g` wurden harmlose Umgebungsvariablen `OFFER_DRIVE_ARCHIVE_FOLDER_ID`, `OFFER_DRIVE_SA_FILE` (nur Pfad) und `LSZH_STAGING_ARCHIVE_SMOKE=false` hinzugefügt; `SITE_PRIVATE=true`, `OFFER_ACCEPTANCE_ENABLED=false` unverändert. Der erste Render-Build brach ab, weil die ursprünglichen Testfälle `OFFER_DRIVE_SA_FILE` geerbt und deshalb parallele Fake-Credentials erkannt hatten – keine Live-Auswirkung. Korrigiert durch `scripts/run-tests-safely.js`: Unterprozesse für Node-Tests erhalten keinerlei Runtime-Keys/Webhooks und setzen `NODE_ENV=test`. Finaler GitHub CI-Lauf `38706766784`: alle Tests grün; **Render-Deploy `dep-db8912navr4c73als4h0` live auf isoliertem Staging**, `43 Tests / 43 bestanden / 0 Fehler`, Start `node server.js` geprüft. **Keine Änderung am produktiven Render-Service `lszh-automations-site`.**

Ein standardmässig **ausgeschalteter** einmaliger Staging-Startcheck `archiveStagingSmoke.js` kann später unter `LSZH_STAGING_ARCHIVE_SMOKE=true` drei nachweislich fiktive gesperrte Geschäftsarchiv-Dateien mit **echter Dienstkonto-Authentifizierung** lesen und SHA-256/PDF-Inhalt kontrollieren. Ergebnis erscheint im Staging-Log lediglich als PASS oder FAIL (ohne IDs, Hashes, Bytes, Schlüssel). Er wurde noch **nicht** mit dem echten Dienstkonto ausgeführt.

**Authentifizierungsentscheidung technisch:** Render Managed OIDC unterstützt laut offizieller Dokumentation aktuell AWS, Anthropic, OpenAI, aber keine direkte Google-Cloud-Anbindung und verlangt mindestens Pro-Workspace. Google Workload Identity Federation ist prinzipiell schlüssellos, aber für unsere Free-Render-Instanz nicht fertig verfügbar. Praktikable Testlösung wäre eine separat geschützte JSON-Dienstkonto-Datei **ausschliesslich als Render Secret File**, Filename `lszh-archive-reader.json`. Solche Schlüssel sind sicherheitskritisch und langlebig; keine Organisationspolitik dafür abschwächen. **Nutzer muss selbst im Google-Cloud-Geschäftskonto** die JSON-Datei erzeugen und **ausschliesslich in die Secret Files der separaten Staging-Render-Instanz** einfügen; niemals in Chat, GitHub, Drive, Airtable oder Live-Website. Danach kann der Assistant den Startcheck aktivieren und Logs auswerten. Eine spätere Cloud-Run-Lösung ohne langfristigen Schlüssel bleibt sicherere Zieloption. Noch keine Entscheidung durch technisch automatischen Key-Import erzwungen.

Detailliertes Prüf-/Betriebsverfahren: [LSZH_GOOGLE_ARCHIVE_READER_RENDER_STAGING_20261015.md](./LSZH_GOOGLE_ARCHIVE_READER_RENDER_STAGING_20261015.md). Live-Website, produktive Mail-/Annahmeszenarien, AVV- oder Rechtsfreigaben unverändert. **Keine erfolgreiche echte Google-Dienstkonto-Authentifizierung behaupten, bevor Staging-Check PASS erreicht.**
