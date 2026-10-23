### Praxistest: automatische Lead-Aktualisierung im Live-Browser bestätigt (23.10.2026)

Der Geschäftsführer hat nach dem erfolgreichen Deployment der produktiven Cloud-Run-Revision `lszh-crm-v2-00006-moz` selbst das öffentliche Website-Formular getestet und bestätigt: **Neuer Website-Lead erscheint automatisch im geöffneten Live-CRM, ohne manuelles Neuladen oder erneute Google-Anmeldung.** Die 30-Sekunden-Synchronisierung funktioniert damit auch im echten Browser. Das Website→Render→Cloud Run→Firestore→CRM-UI-Ziel ist praktisch verifiziert. Keine zusätzliche Änderung, kein Deployment, keine produktive Mail oder Vertragsannahme durch diese Dokumentation.

## CRM V2 Lead-Auto-Refresh – PRODUKTIV seit 23.10.2026

Der Geschäftsführer führte `scripts/deploy-crm-lead-refresh-live.ps1` erfolgreich auf dem Surface aus und übermittelte die vollständige Ausgabe.

- **CRM-Testsuite: 23/23 PASS**, kein fehlgeschlagener Test.
- Neue Cloud-Run-Revision **`lszh-crm-v2-00006-moz`**, erst mit `0 %` Traffic erstellt und anschliessend nach bestandenen HTTP-Checks auf **100 % produktiven Traffic** umgeschaltet.
- **Aktuelle produktive Revision:** `lszh-crm-v2-00006-moz` (ersetzt als Traffic-Ziel `lszh-crm-v2-00004-mez`).
- **Unmittelbare Rückfallrevision:** `lszh-crm-v2-00004-mez` (nun 0 % Traffic, weiterhin per Tag `crm-v2-candidate` erreichbar).
- Gegen den neuen Kandidaten und anschliessend die Live-URL bestätigten HTTP-Probes: CRM HTML `200`, OAuth-Konfiguration `200` und Leads-API ohne Anmeldung `401`.
- Bestehende Live-Revisionszuordnung und Secret-Manager-Bindung wurden vor der Bereitstellung geprüft; nach `--no-traffic` waren Secret-, OAuth-, Präfix- und Diensteinstellungen unverändert.
- **Frontend-Funktion:** Website-Leads automatisch alle 30 Sekunden neu laden, beim Tab-Fokus/Zurückwechseln aktualisieren, manueller Knopf `↻ Aktualisieren`; keine Änderung offener Editierdialoge. Der eingeloggte Zustand bleibt während normaler Aktualisierungen bestehen.
- Die alte Seite im Browser muss **einmalig** neu geladen und gegebenenfalls wieder angemeldet werden, um die neue UI-Version zu bekommen. Bei vollständigem Seiten-Reload kann Google abhängig vom Browser weiterhin eine Anmeldung verlangen, weil kein ID-Token persistent gespeichert wird.
- **Nachkontrolle offen:** tatsächliche automatische Anzeige eines frisch eingesandten Leads im offenen Browser innerhalb ca. 30 Sekunden prüfen. Der frühere öffentliche Website→Firestore-End-to-End-Test war bereits erfolgreich und wurde bei diesem reinen UI-Deployment nicht erneut ausgeführt.
- **Rollback falls erforderlich:** `gcloud.cmd run services update-traffic lszh-crm-v2 --project lszh-automations --region europe-west6 --to-revisions=lszh-crm-v2-00004-mez=100` – nur bei tatsächlich erkanntem Problem, nicht vorsorglich ausführen.

## Produktiver CRM-V2-Cutover erfolgreich – 23.10.2026

Der Geschäftsführer hat nach ausdrücklicher Freigabe das Skript `scripts/cutover-crm-v2-live.ps1` auf dem Surface ausgeführt und die vollständige erfolgreiche PowerShell-Ausgabe übermittelt.

- **Live-Cloud-Run-Dienst:** `lszh-crm-v2`; Revision `lszh-crm-v2-00004-mez` erhält **100 % produktiven Traffic**.
- **Alte Rückfallrevision:** `lszh-crm-v2-00002-6lh` bleibt als benannter Rückfallpunkt erhalten. Kein Rollback ausgelöst.
- **Render-Website:** `https://www.lszh-automations.ch` war erreichbar. **Keine neue Render-Bereitstellung und kein Wechsel der Website-URL**.
- **Produktive CRM-Oberfläche:** `https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app` lieferte die erwartete CRM-V2-Oberfläche. Anonyme CRM-API-Anfragen blieben gesperrt.
- **Echter Website-to-CRM-HTTP-Test:** `POST /api/lead` über die öffentliche Render-Website → bestehendes Cloud-Run-Ziel → produktive Firestore-Sammlung mit `confirmed:true` und Datensatz-ID.
- **Testlead in Live:** `web_bc17917b879a4f4ab254456da78b68e5`, gekennzeichnet als `TEST_ONLY LSZH CRM V2`.
- **Dublettentest:** identische Wiederholung derselben `submission_id` lieferte denselben Datensatz; keine zweite Lead-Erstellung.
- **Website-Formularweg benötigt kein Airtable/Make.** Alte Datenmigration wurde vom Geschäftsführer ausdrücklich abgewählt; produktiver Startbestand war absichtlich leer.
- **Backup vor Cutover:** kompletter Export `gs://lszh-firestore-backups-470613067122/backups/20261023-094036` mit `SUCCESSFUL`; isolierter Restore nicht getestet.

**Produktivstatus:** CRM-V2-Cutover erfolgreich. Echte neue Website-Leads sollen ab jetzt in der produktiven CRM-V2-Firestore-Sammlung sichtbar sein. Die Anzeige des Testleads im angemeldeten Dashboard ist der nächste visuelle Abnahmeschritt; die HTTP-Speicherung ist bereits bestätigt. Website-Datenschutztext-Änderung befindet sich noch im unveröffentlichten Entwicklungsbranch und ist nicht automatisch auf Render veröffentlicht. Für weitere produktive Änderungen gesondert freigeben. Keine Kundenmail, Vertrag oder Rechnung durch diesen Cutover versandt.

## Verbindliche Geschäftsführerentscheidung – 23.10.2026: Kein Airtable-Import

- Für **LSZH CRM V2** werden weder Airtable noch die bisherigen Airtable-Datensätze benötigt. **Keine Migration, keine Zuordnung historischer Airtable-IDs, keine Nachführung historischer CRM-Daten**.
- Der Geschäftsführer bestätigt den durch die Firestore-Zählung ermittelten **leeren Live-Bestand** (`lszh_crm_v2_`: jeweils null Leads, Kunden, Offerten, Projekte und Rechnungen) als **korrekten gewünschten Startzustand**.
- Die produktiven Offerten- und Rechnungsnummern beginnen jeweils bei **1000**. Die Staging-Nummern zählen nicht zum Live-Bestand.
- Der produktive Website-Eingang bleibt **Render -> Cloud Run -> Firestore**; kein Make-/Airtable-Zwischenschritt im Hauptkontaktformular. Make für andere, ausdrücklich benötigte Kundenautomationen unabhängig davon weiter nutzbar.
- **Airtable-Inventur/Import ist kein Go-Live-Blocker mehr**. Historische Airtable-Datenbanken, Make-Szenarien, Google-Drive-Archive und Nachweise werden durch diese Entscheidung **nicht automatisch gelöscht oder deaktiviert**; hierfür wäre eine separate gezielte Freigabe erforderlich.
- Bereits bestanden: Staging-Prozess und Website-Ingest, produktiver Cloud-Run-Kandidat `lszh-crm-v2-00004-mez` mit `0 %` Traffic, anonyme API-Negativtests sowie erlaubter Google-OAuth-Login und leeres Live-Dashboard in Edge; Firestore-Gesamtexport nach Zürich mit Status `SUCCESSFUL`.
- Weiter offen: **isolierten Firestore-Restore nachweisen** (Backup vorhanden, Restore ungetestet), Website-Datenschutzerklärung im produktiven Render-Stand anpassen/veröffentlichen, produktiven Traffic-Switch bewusst freigeben und danach `POST /api/lead` durch die echte Render-Website mit synthetischer Anfrage testen. Derzeit läuft weiter `lszh-crm-v2-00002-6lh` mit 100 % Traffic. **Kein Cutover durch diese Dokumentationsentscheidung.**

# LSZH CRM V2 – Website-Anbindung und Produktivvorbereitung

## Website-Eingang: HTTP-Test erfolgreich – 23.10.2026

Der Geschäftsführer hat den echten synthetischen Staging-HTTP-Test mit `scripts/test-crm-website-intake-staging.ps1` ausgeführt und die PowerShell-Ausgabe übermittelt:

- Dediziertes Staging-Testsecret `lszh-crm-v2-staging-website-test` Version 1 erstellt; Berechtigung für Cloud-Run-Dienstkonto gesetzt. Keine geheimen Werte im Chat.
- Nach temporärer Staging-Aktivierung Cloud-Run-Revision `lszh-crm-v2-staging-00004-njk`, 100 % Traffic.
- Synthetisches `POST /api/internal/website-leads`: **201** (erstellt), identischer Wiederholungs-POST **200** ohne Dublette, abweichender Retry **409**, fehlendes Secret **401**.
- Ein bestätigter Staging-Firestore-Datensatz mit ID `web_d05af7b4be214345af56948b2215e265`. Dies ist **kein realer Kunde**.
- Im `finally` Staging-Webhook wieder deaktiviert. Cloud-Run-Revision `lszh-crm-v2-staging-00005-sjv` hat danach 100 % Traffic. PowerShell bestätigte `PASS: Staging Webhook wieder deaktiviert`.
- Der Test wurde **direkt am Cloud-Run-Staging-Webhook**, nicht über das öffentlich erreichbare Render-Webformular ausgeführt. Nach Prüfung der produktiven Konfiguration und expliziter Freigabe bleibt ein separater echter Website-Test nötig.
- **Kein Merge, keine Render-Umstellung, kein Produktiv-Cutover**. Nächster Schritt: `scripts/preflight-crm-production.ps1` (read-only) ausführen, Ausgabe prüfen; Live-Dateninventar, Backup, Nummernkreis und Google-OAuth-Zugriff separat kontrollieren.


Stand: 23.10.2026. **Nur Entwicklungsbranch und Staging; noch keine Änderung am öffentlichen Render-Dienst oder am produktiven CRM Cloud Run.**

## Was die Website bereits tut

- Das Website-Formular (`index.html`) sendet ein JSON an `POST /api/lead` auf derselben Render-Origin.
- `server.js` auf der Website prüft Pflichtfelder/Origin, ergänzt bei Bedarf eine `submission_id` und leitet den JSON-Body mit `CRM_LEAD_INGEST_URL` und internem `CRM_INGEST_SECRET` an `POST /api/internal/website-leads` weiter.
- Der bisherige Cloud-Run-Dienst `lszh-crm-v2` bestätigt nur nach erfolgreichem Firestore `create()` mit `confirmed:true` und einer `web_...`-Datensatz-ID.
- Gleiche `submission_id` + identische Felder → gleicher Datensatz, kein zweiter Lead; abweichende Felder mit derselben ID → HTTP 409.
- Im aktuellen Website-Code verwendet **dieser Hauptkontaktformularweg kein Airtable/Make**. Ob die beiden Render-Umgebungsvariablen produktiv tatsächlich korrekt gesetzt sind, ist über den Code allein nicht beweisbar. Die anderen Website-/Onboarding-Abläufe bleiben getrennt.

## Unterschiedliche Firestore-Sammlungen

| Zweck | Sammlung | Cloud Run |
| --- | --- | --- |
| Eingehende produktive Website-Leads | `lszh_crm_v2_leads` | `lszh-crm-v2` (bestehend) |
| Neue CRM-Oberfläche im Staging | `lszh_crm_v2_staging_leads` | `lszh-crm-v2-staging` |

Vor dem Umstieg **nicht** die Render-Website auf den Staging-Dienst umstellen. Sonst gelangen echte Kundendaten in den Testbestand oder die Website erhält wegen deaktiviertem Staging-Eingang Fehler.

Die Website selbst muss voraussichtlich **nicht** verändert werden: Beim kontrollierten Live-Cutover soll der bestehende Cloud-Run-Dienst `lszh-crm-v2` die komplette CRM-V2-App mit `CRM_RECORD_PREFIX=lszh_crm_v2_`, `CRM_WEBSITE_INTAKE_ENABLED=true`, vorhandenem Secret-Manager-Schlüssel und Google-OAuth-Allowlist ausführen. Die Render-Zieladresse bleibt dann unverändert. Keines dieser Produktionsänderungen wurde vorgenommen.

## Vorbereitung und synthetischer HTTP-Test (Surface, nur Staging)

Im bereits bestehenden zweiten Git-Worktree:

```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-crm-cloud-staging.ps1 -OAuthClientId '470613067122-ib82le89g17hqaq3ljd005jiglep7pk1.apps.googleusercontent.com' -AllowedEmails 'lars@lszh-automations.ch'
```

Damit werden die neuen Änderungen zuerst auf `lszh-crm-v2-staging` ausgerollt.  Danach **nur mit synthetischen Daten** den neuen Prüfer ausführen:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-crm-website-intake-staging.ps1
```

Das zweite Skript erzeugt einen **eigenen**, nicht ausgegebenen Staging-Secret-Manager-Schlüssel, aktiviert den Staging-Webhook vorübergehend und sendet eine künstliche Website-Anfrage an den realen Cloud-Run-HTTP-Endpunkt. Es prüft: `201` erstellt, identische Wiederholung `200` ohne Duplikat, geänderte Wiederholung `409`, fehlender Schlüssel `401`. Der Webhook wird in einem `finally` wieder deaktiviert; im Fehlerfall die finale Deaktivierungsausgabe prüfen. Es werden **keine Render-Einstellungen und keine Live-CRM-Daten verändert**. Der synthetische Testlead bleibt bewusst im Staging-Firestore sichtbar.

## Produktiv-Preflight erfolgreich – 23.10.2026

Der Geschäftsführer hat den Read-only-Befehl `scripts/preflight-crm-production.ps1` im Surface-Worktree ausgeführt:

- **Live-Dienst** `lszh-crm-v2`, zuletzt bereitstehende und zu **100 %** bediente Revision `lszh-crm-v2-00002-6lh`
- **Live-Service-URL** `https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app`
- **Live-Servicekonto** `lszh-crm-v2@lszh-automations.iam.gserviceaccount.com`
- **Website-Intake-Schlüssel**: Secret-Manager-Referenz vorhanden (kein Secret offengelegt)
- **Live-Flag** `CRM_WEBSITE_INTAKE_ENABLED` und `CRM_RECORD_PREFIX` derzeit nicht gesetzt, da die bisherige Serverversion Standardwerte verwendet
- **Staging** `CRM_RECORD_PREFIX=lszh_crm_v2_staging_`, `CRM_WEBSITE_INTAKE_ENABLED=false`
- Das Read-only-Skript hat keine Cloud-Run- oder Firestore-Ressourcen verändert.

**Neu vorbereitet: Firestore-Inventar ohne personenbezogene Inhalte.** Befehl aus dem Staging-Worktree:

```powershell
cd C:\Users\larss\Projects\lszh-crm-cloud-staging
git pull --ff-only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\inventory-crm-firestore-readonly.ps1"
```

Der Befehl ruft mit `gcloud auth print-access-token` ausschliesslich Firestore-REST-**COUNT**-Aggregationen und die `next`-Felder der Live-/Staging-Sequenzzähler ab. Er führt keine Schreiboperation aus und zeigt keine Lead-, Kontakt- oder Zahlungsdaten. Die tatsächlichen Inventarwerte **stehen noch aus**. Vor Live-Cutover zusätzlich ein überprüftes Firestore-Backup, einen vollständigen Nummernkreis-Abgleich und einen Rollback-Nachweis erstellen. Die reine Anzahlerhebung ersetzt keine Datenmigration.

## Produktions-Preflight – nur lesen

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\preflight-crm-production.ps1
```

Dieser Befehl liest Cloud-Run-Konfiguration (Revisionen, Dienstkonto, Staging-Präfix, Existenz/Art des Secret-Manager-Verweises), gibt **keine** geheimen Werte aus und verändert nichts.

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

## 23.10.2026 – Live-Kandidaten-Preflight erfolgreich (noch KEIN Deploy)

Der Geschäftsführer hat auf dem Surface nach `git pull --ff-only` den Befehl `scripts/prepare-crm-live-candidate.ps1` **ohne** `-Deploy` ausgeführt. Nutzerbestätigte PowerShell-Ausgabe:

- Source Commit `8598f99` (Branch `feature/crm-v2-cloud-staging-20261023`, sauberer Worktree).
- Bisherige Live-Revision `lszh-crm-v2-00002-6lh` weiterhin mit **100 % produktivem Traffic**.
- Vorhandenes Live-Servicekonto und Secret-Manager-Referenz für Website-Intake geprüft.
- Zielnamespace für den **späteren Kandidaten**: `lszh_crm_v2_`; Website-Intake Flag `true`.
- **20/20** Node-CRM-Tests bestanden, 0 fehlgeschlagen.
- Skript meldete ausdrücklich `READ ONLY abgeschlossen: kein Deployment, keine Cloud-Run-Aenderung`.

**Nächster Schritt nur nach bewusstem Ausführen:**

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\prepare-crm-live-candidate.ps1" -Deploy

Das ändert zwar die Konfiguration/erstellt eine Revision des bestehenden Cloud-Run-Dienstes, soll mit `--no-traffic` aber **keinen bestehenden Live-Traffic verlagern**. Danach unbedingt Ausgabe `PASS: 100% Live-Traffic weiterhin ...` sowie `KANDIDAT URL` überprüfen und anonymen Candidate-HTTP-Test ausführen. Ein durch Tag erreichbarer Kandidat kann technisch bereits auf **Live-Firestore-Daten** zugreifen; keine echten CRM-Schreibtests, solange keine ausdrückliche Freigabe vorliegt. Keinen produktiven Website-Cutover durchführen.
### 23.10.2026 – Live-Kandidat mit 0 % Traffic erfolgreich bereitgestellt

Vom Geschäftsführer übermittelte PowerShell-Ausgabe:
- `git pull --ff-only` auf Commit `55a7a09`, danach `scripts/prepare-crm-live-candidate.ps1 -Deploy`.
- **20/20** Node-Tests bestanden.
- Neuer CRM-V2-Kandidat im bestehenden Cloud-Run-Dienst `lszh-crm-v2`: Revision `lszh-crm-v2-00004-mez`, **0 % produktiver Traffic**.
- Getaggte Test-URL: `https://crm-v2-candidate---lszh-crm-v2-ozx7mp2bka-oa.a.run.app`.
- Weiterhin **100 % produktiver Traffic** auf Alt-Revision `lszh-crm-v2-00002-6lh`.
- Cloud-Run-Dienstkonto und bisherige `CRM_INGEST_SECRET`-Referenz nach Deployment unverändert.
- Kandidat konfiguriert für `CRM_RECORD_PREFIX=lszh_crm_v2_`, Website-Intake `true`, **also mit potenziellem Zugriff auf Live-Firestore**.
- Kein Render-Deployment, keine produktive Website-Umstellung, kein Kundenversand und keine Live-Datenmigration.

**Als Nächstes:** `scripts/check-crm-live-candidate-http.ps1 -CandidateUrl 'https://crm-v2-candidate---lszh-crm-v2-ozx7mp2bka-oa.a.run.app'` durch den Geschäftsführer ausführen (nur anonymes HTML/Config-GET und verbotene API-Aufrufe; erwartet 200/401). Danach Google-OAuth-Ursprünge und einen isolierten Restore- bzw. Datenbestandsabgleich vor endgültiger Traffic-Umstellung prüfen. Freigabe zum Go-live ist noch **nicht** erteilt.
### 23.10.2026 – Kandidaten-HTTP-Prüfung erfolgreich

Der Geschäftsführer hat die korrigierte Datei `scripts/check-crm-live-candidate-http.ps1` in PowerShell nach `git pull --ff-only` ausgeführt. Die getaggte Kandidaten-URL war `https://crm-v2-candidate---lszh-crm-v2-ozx7mp2bka-oa.a.run.app`.

- **PASS:** Startseite HTTP 200, Google-OAuth-Konfiguration HTTP 200.
- **PASS:** `GET /api/me`, `GET /api/records/leads`, `GET /api/print/offerte/test` ohne ID Token HTTP 401.
- **PASS:** `POST /api/internal/website-leads` ohne Secret HTTP 401.
- **PASS:** Keine Firestore-Schreibvorgänge; kein Secret an den Kandidaten gesendet.
- Das Testskript musste nur wegen der reservierten PowerShell-Systemvariablen `$HOME` auf `$homeResponse` korrigiert werden. Die Korrektur erforderte kein Cloud-Run-Deployment.
- **Kein** Auth-Login und keine Berechtigungsprüfung mit einem gültigen Google-ID-Token am Kandidaten bisher. Der getestete anonyme Zugriff bestätigt **nicht** die korrekt autorisierte produktive Google-Anmeldung.
- **Nächster Schritt:** Im bestehenden Google OAuth Webclient die JavaScript-Ursprünge `https://crm-v2-candidate---lszh-crm-v2-ozx7mp2bka-oa.a.run.app` und `https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app` ergänzen (vorhandenen Staging-Ursprung erhalten), Login mit dem erlaubten Workspace-Konto auf Kandidaten-URL durchführen und die leeren Live-Register ausschließlich lesen; keine Live-Datensätze bearbeiten oder Website-Cutover durchführen.
### 23.10.2026 – Produktionskandidat: Google-Login im Browser erfolgreich

Der Geschäftsführer hat nach Behebung von Google `400 origin_mismatch` die Google-OAuth-JavaScript-Ursprünge konfiguriert und einen Screenshot aus Microsoft Edge vom **erfolgreich angemeldeten** CRM-V2-Produktionskandidaten zur Verfügung gestellt.

- Browser-URL: `https://crm-v2-candidate---lszh-crm-v2-ozx7mp2bka-oa.a.run.app`.
- In der CRM-Oberfläche ist das erlaubte Geschäftskonto `lars@lszh-automations.ch` angemeldet; Dashboard mit Leads, Offerten, Rechnungen, Projekten und Finanzübersicht geladen.
- Alle angezeigten Dashboard-Zahlen sind 0 und stimmen mit dem zuvor ausgelesenen leeren Live-CRM-Firestore-Inventar überein.
- Es fand **keine produktive Traffic-Umschaltung und keine bestätigte Schreiboperation auf Live-Firestore** statt; der Cloud-Run-Kandidat war bei Deploy auf 0 % regulären Traffic gesetzt.
- Die Sichtprüfung des angemeldeten Dashboards ist kein vollständiger Beweis für die Korrektheit sämtlicher rollenbasierter Zugriffe, für das historische Airtable-Inventar oder die Restore-Fähigkeit des Backups.

**Nächste kontrollierte Produktions-Gates:** Airtable-/Make-Altbestand bestimmen und Umgang festlegen, isolierten Restore nachweisen und Datenvollständigkeit kontrollieren; unmittelbar vor Cutover produktive Cloud-Run-Revision/Secret/Traffic erneut validieren. Kein Go-Live ohne ausdrückliche Freigabe.
## Einmalige Voraussetzungen vor Live-Cutover

1. **Render-Konfiguration prüfen:** Richtiger Workspace und Dienst `lszh-automations-site`; Umgebungsvariablen `CRM_LEAD_INGEST_URL` und `CRM_INGEST_SECRET` sind gesetzt. Secrets nie exportieren oder im Chat teilen. Live-Website-Formular-HTTP-Test nur mit ausdrücklicher Freigabe.
2. **Live-Firestore-Inventar:** Zahl der vorhandenen Leads, Bestandskunden, Offerten, Projekte und Rechnungen feststellen; `web_<UUID>`-ID-Muster erhalten; Collections `lszh_crm_v2_...` und `_meta` sowie Offerten-/Rechnungsnummernkreis kontrollieren. Die Staging-Testdaten **nicht** in Live importieren.
3. **Backup:** Live-Firestore vor dem Cutover exportieren, Backup-Metadaten und Wiederherstellbarkeit prüfen. Vorhandene Airtable-Unterlagen nicht löschen.
4. **Zugang:** Neue CRM-Webanwendung benötigt neben dem bisherigen Intake-Secret die Google-Workspace-OAuth-Client-ID, erlaubte interne E-Mails und einen für die spätere Live-URL autorisierten Google-Client-Origin. Externe Nichtberechtigte dürfen keine Daten- oder Druck-API nutzen.
5. **Rollout ohne Website-Wechsel:** Bestehende Cloud-Run-Revision und Environment dokumentieren; neue vollständige Version zuerst mit `--no-traffic` und eindeutigem Tag deployen; dieselbe bestehende Website-Secret-Manager-Bindung erhalten. Live-Stichprobe und Sicherheitsprüfung mit **synthetischen** Daten, danach nur mit ausdrücklicher Freigabe auf 100 % Traffic umstellen. Bei Fehlern über Cloud Run auf die vorige Revision zurückstellen.
6. **Kommunikation:** Keine produktiven Kundenmails, Vertragsabschlüsse, automatische Rechnungsversände oder Swiss-QR-Zahlteile ohne gesonderte Abnahme.
7. **Datenschutz-/Website-Text:** Website-Datenschutzerklärung nennt noch Make/Airtable für Formulardaten. Vor Go-live redaktionell prüfen und den direkten Cloud-Run-/Firestore-Kontaktformularweg korrekt beschreiben; nicht ohne Freigabe veröffentlichen.

## Aktueller technischer Stand

- Server: `crm-v2/server.js` übergibt die explizite Collection aus `CRM_RECORD_PREFIX` an `saveWebsiteLead()`. Zulässige Collections sind nur Live- oder Staging-Leads.
- Tests: `crm-v2/test/lead-ingest.test.js` und `crm-v2/test/cloud-website-intake.test.js`; CI im Branch `feature/crm-v2-cloud-staging-20261023`.
- Das externe Formular und der Render-Server wurden nicht geändert. **Der echte Staging-HTTP-Test wurde am 23.10.2026 erfolgreich ausgeführt (201/200/409/401); der öffentliche Render-Formularweg bleibt noch ungeprüft.**
- Kein Merge in `main`, kein Produktiv-Deployment oder Umschalten des Render-Routings. Aktueller Draft-PR: #11.
