# LSZH CRM V2 – Rechnungsabwicklung: Zahlungsstatus, Buchung, Mahnwesen

Stand 24.10.2026 – **Aktiver Produktivstand `lszh-crm-v2-00051-bak` (100 %). Rechnungsversand für alle Kundentypen nach manuellem CRM-Klick aktiviert; echter Versand- und Zahlungs-Live-E2E noch offen.**

## 24.10.2026 – RE-1002 Gmail-Versand durch Make unabhängig bestätigt; Live-Zahlungsbuchung noch offen

- Make `8144117`, Execution `8c54a277ebbb433d800cec93699e6f90` am 24.10.2026 11:45:05 UTC: `success`, alle drei Module erfolgreich, produktive `invoice_send`-Nachricht für **RE-1002** ans intern freigegebene Outlook-Postfach `lars.schulthess@outlook.com`; Gmail `SENT`, Message-ID `1a16dba99c2f2719`, WebhookRespond HTTP 200 mit passendem Event und Gmail-ID. Damit ist der Gmail-Versand/Antwortweg unabhängig bestätigt.
- **CRM-Zahlungsfreigabe ist noch per UI/Firestore zu bestätigen:** das Backend akzeptiert Teilzahlungen nur bei tatsächlich persistiertem `invoiceDispatchState=confirmed`, offenem Restbetrag und Status `Offen`/`Teilbezahlt`. Die verbundene Make-Ausgabe allein beweist diesen CRM-Readback nicht. Nach Neuladen von RE-1002 im produktiven CRM sollte die Buchungsmaske sichtbar sein, sofern die Quittung gespeichert wurde.
- Kein Bankzugriff und keine automatische Zahlung. Der Betreiber darf nur **wirklich erhaltene** Beträge mit Betrag, Datum, Zahlungsart und Referenz verbuchen; der Bestätigungsdialog verlangt explizite Prüfung des Bankauszugs/Belegs. Der isolierte Emulator hat Teil-/Vollzahlung und Korrektur bereits getestet; reales Live-Zahlungs-E2E noch offen.

## AKTUELL 24.10.2026 – Vollständiger manueller Rechnungsversand LIVE

- **`CRM INVOICE MANUAL ALL LIVE PASS`** vom Betreiber bestätigt. Live-Revision `lszh-crm-v2-00051-bak` auf **100 % Traffic**, Rollback `lszh-crm-v2-00049-doh`. Die HTTP-/Authentisierungs-/UI-, Scheduler- und Traffic-Nachprüfungen in Stufe 4/4 bestanden; Mail-Cutoff unverändert `2026-10-23T16:15:28Z`.
- Nutzer wünscht ausdrücklich **keine pauschale Sperre für Eigen-/interne oder `TEST_ONLY`-Rechnungen** bei manuell bestätigtem produktivem E-Mail-Versand. `crm-v2/invoice-send.js` und `crm-v2/public/index.html` entsprechend live; die eigenständige `test_only`-Umgebungsmodus-Allowlist bleibt im Code bestehen, jedoch produktiver Modus ist `production`.
- Für jede konkrete Rechnung erforderlich: gespeicherter Status `Offen`, noch nicht versendet/ungeklärt, gültige vollständige Kunden-E-Mail/-Adresse, bewusster **«Rechnung senden»**-Klick + Bestätigungsdialog, erfolgreicher Make/Gmail-Provider-Receipt. Erst nach `invoiceDispatchState=confirmed` kann eine Teil-/Vollzahlung manuell verbucht werden; Status nicht direkt auf `Teilbezahlt` umstellen.
- Deployment sendete **keine E-Mail** und änderte keine Rechnungs-/Zahlungs-/Kundendaten. Echtes Live-E2E des erstmaligen manuellen Rechnungsversands und Zahlungseingangs steht weiterhin aus. PDF/QR enthält bei produktiven Rechnungen potenziell echte Zahlungsinformationen; interne Proberechnungen nicht unbedacht als Zahlungsaufforderung zustellen.
- Die beiden Release-Skripte `scripts/prepare-crm-invoice-manual-all-zero-traffic.ps1` und `scripts/activate-crm-invoice-manual-all-live.ps1` sind jetzt **historische ausgeführte Release-Skripte**; bei erneutem Ausführen sollten ihre Baseline-Gates absichtlich stoppen.





### TEST_ONLY-Cutover nach erfolgreicher Null-Traffic-QA

- Vorbereitung für **zweiten, noch nicht ausgeführten** Schritt: \`scripts/activate-crm-invoice-mail-testonly-live.ps1\`. Erkennt exakt den einzig getaggten 0%-Kandidaten \`crm-invoice-testonly-qa\`, vergleicht alle existierenden Live-Konfigurationen/Secrets ausser den vier streng begrenzten Testmodusvariablen, kontrolliert Scheduler und anonyme API-Sperren und fordert die explizite Eingabe \`LIVE TEST_ONLY RECHNUNG\`. Danach 100%-Traffic auf den freigegebenen Kandidaten, mit automatischem Rückrollen zu \`lszh-crm-v2-00046-faj\` bei Fehlern.
- Ein Cutover in diesem Modus **versendet selbst keine Mail**. \`invoice-send.js\` prüft vor jedem Versand einen manuellen CRM-Klick, \`sendMode=test_only\`, Empfänger-Allowlist und synthetische Rechnungs-/Kundendaten. Somit keine normale Kundenrechnung. Die tatsächliche TEST_ONLY-Mail benötigt zusätzlich explizite CRM-Bestätigung; Echtdaten/Firestorerechnungen bleiben dabei unberührt, solange keine Testdatensätze angelegt werden.
- **Wichtig:** Skript ist nur vorbereitet. Keine Testmail, kein 0%-Kandidat oder Live-Cutover wurde allein durch Commit angelegt.

## 24.10.2026 – Produktentscheidung: Keine Typ-Sperre für manuellen Rechnungsversand, auch nicht für Eigen-/Testrechnungen

- **Explizite Anweisung des Geschäftsführers:** Die pauschale Blockierung des Buttons `Rechnung senden` bei `LSZH Invest GmbH` als Kunde oder `TEST_ONLY`-Kennzeichnung wird **im produktiven manuellen Versandmodus aufgehoben**. Der Betreiber wählt und bestätigt jede konkrete Rechnungs-E-Mail selbst. Der historische Vermerk, dass RE-1001/RE-1002 allein wegen Eigen-/Teststatus nicht versandt werden dürfen, ist durch diese Entscheidung **überholt**. Trotzdem vor jedem Versand Empfänger, echtes Firmen-IBAN, Rechnungsbetrag und Swiss-QR-Zahlteil prüfen; interne Probe grundsätzlich nicht unbedacht als reale Zahlungsforderung verwenden.
- Implementiert im Feature-Branch: `crm-v2/invoice-send.js` entfernt beide pauschalen serverseitigen `isProduction && isSynthetic`-Blockaden (vor und nach Versandreservierung); `crm-v2/public/index.html` erlaubt den manuellen CRM-Button ohne Test-/Eigenkundenfilter und zeigt den korrekten Standard-Versandhinweis. Die separate `test_only`-Empfänger-Allowlist bleibt für diesen besonderen Betriebsmodus unverändert. Bestehender Versandablauf: Google-Login, ausdrücklicher Bestätigungsdialog, atomare Reservierung, Swiss-QR-PDF, passender Gmail-Receipt (`messageId`), Dubletten- und Unklarheits-Sperre und Zahlungsbuchung erst nach `invoiceDispatchState=confirmed`.
- Tests angepasst: produktiver Versand über interne/Eigen- und `TEST_ONLY`-Kunden wird als erfolgreiche bestätigte Einmalsendung mit PDF getestet, doppelte Sendung weiterhin blockiert. Neue Browser-JavaScript-UI-Regression, die sicherstellt, dass der produktive Button nicht durch Kundentyp gesperrt ist und der Bestätigungsdialog erhalten bleibt.
- **Live-Stand weiterhin `lszh-crm-v2-00049-doh` (100 %)** – die Codeänderung ist **noch NICHT live**, es wurden keine E-Mails versandt, keine Rechnungs-/Zahlungsdaten geändert. Neue Release-Skripte `scripts/prepare-crm-invoice-manual-all-zero-traffic.ps1` (Prüfungen + 0%-Traffic-Kandidat) und `scripts/activate-crm-invoice-manual-all-live.ps1` (Tag-Prüfung, getrennte ausdrückliche Freigabe `LIVE RECHNUNG INTERN`, Postchecks und automatischer Rollback zu `00049-doh`). Umgebungsvariablen, Make/Gmail, Mail-Scheduler und IBAN-Secret bleiben unverändert.
- **Nächster Operateurschritt:** `git pull --ff-only`, danach `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\\scripts\\prepare-crm-invoice-manual-all-zero-traffic.ps1" -DeployCandidate`. Nur bei `CRM INVOICE MANUAL ALL ZERO TRAFFIC PASS` den gesonderten Cutover `scripts/activate-crm-invoice-manual-all-live.ps1` ausführen. Die Skripte versenden keine Rechnung.

## AKTUELL – 24.10.2026: produktiver E-Mail-Rechnungsversand freigegeben

Die PowerShell-Ausgabe des Betreibers bestätigt `CRM INVOICE MAIL PRODUCTION LIVE PASS`, **Cloud Run `lszh-crm-v2-00049-doh` mit 100 % Traffic**, Rollback `00046-faj`, identischen Mail-Cutoff `2026-10-23T16:15:28Z`. Produktions-Smoketests in Release-Stufe 4/4 bestanden. Der Deployment-Lauf hat **keine** Kundenmail gesendet. Das Rechnungsmodul und die manuelle Zahlungserfassung sind produktiv; der manuelle Kunden-Rechnungsversand wurde neu aktiviert.

**Verbindlicher Ablauf:** Rechnung im CRM mit Kunden-E-Mail, Positionen, Betrag, Fälligkeit und Swiss-QR-PDF prüfen → `Rechnung senden` ausdrücklich bestätigen → nur bei echtem passenden Gmail-`messageId` `invoiceDispatchState=confirmed` → Zahlungseingang/Teilzahlung, Restbetrag und Audit manuell buchen. Keine automatische Rechnungsversendung, keine manuelle Postübergabe und keine automatischen Mahnungen. Unklare Mailquittung bleibt `manual_review`, kein automatischer Zweitversand. Freigabe zur echten Kundenmail gilt nur für manuell ausgewählte konkrete Rechnung.

Noch **nicht** bestätigt: erster wirklicher Live-Kundenmail-Durchlauf nach dem Release und echte Zahlungsbuchung. Der bestätigte Release ist kein Beleg für eine erfolgte Rechnungszustellung oder Banktransaktion. Vor erster Kundenrechnung Swiss-QR-PDF, Kundendaten, Bankdaten und E-Mail-Inhalt prüfen.

## 24.10.2026 – Geschäftsführer gibt Rechnungs-E-Mail für echte Kunden frei; TEST_ONLY wird übersprungen

- **Neuester expliziter Betreiberentscheid:** Produktiver Rechnungsversand direkt für alle echten Kunden aktivieren, nicht zuerst nur TEST_ONLY. Unverändert gilt: ausschliesslich **manueller Klick im Google-authentifizierten CRM**, kein automatischer Rechnungs- oder Mahnversand, Zahlungserfassung erst nach **bestätigtem Gmail-Versandereignis**.
- **Make/Gmail live verifiziert** (Make-Szenario `8144117`, `LSZH CRM V2 – Offerten & QR-Rechnungen (manuell)`): Szenario **active**, Webhook-Trigger, gemeinsame drei Filterzweige für `offer_send/production`, `invoice_send/production`, `invoice_send/test_only`; Gmail-Verbindung `11904991` **ok**. Produktionsfilter für Rechnungen prüft `kind=invoice_send`, `sendMode=production`, passendes `invoice_send_`-Event, Betreff `Ihre Rechnung Nr.`, empfängerbezogene E-Mail und PDF-Endung. Gmail-Modul verwendet `{{1.to}}`, `{{1.subject}}`, HTML und `{{toBinary(1.pdfBase64; "base64")}}`; WebhookResponse gibt `ok:true`, `eventId`, `messageId={{2.id}}` zurück. Keine Make-Konfiguration geändert und keine Mail verschickt.
- **Aktuelle verifizierte Live-Revision bleibt `lszh-crm-v2-00046-faj` (100 %)**. Vorher erstellter TEST_ONLY-Kandidat `lszh-crm-v2-00048-sim` weiterhin 0 %, **nicht aktiviert**. Neue produktive 0%-Revision ist **noch nicht erstellt**; Änderung ist zunächst nur auf GitHub vorbereitet.
- Produktive Release-Skripte `scripts/prepare-crm-invoice-mail-production-live.ps1` und `scripts/activate-crm-invoice-mail-production-live.ps1`. Ersteres führt npm/CRM-Tests und gesperrte Baselineprüfung aus, erstellt 0%-Revision mit `CRM_INVOICE_MAIL_ENABLED=true`, `CRM_INVOICE_MAIL_PRODUCTION_APPROVED=true`, `CRM_INVOICE_MAIL_MODE=production` und **entfernt** `CRM_INVOICE_MAIL_TEST_TO` atomar via `--remove-env-vars`+ `--update-env-vars`. Abweichungen in anderen Mail-, Lead-, QR- oder Secret-Verweisen führen zum Abbruch. Der zweite Schritt prüft den getaggten Kandidaten, Login-Schutz, QR und Scheduler, fordert die explizite Eingabe `LIVE RECHNUNG PRODUKTIV` und schaltet nur danach die 100 % Traffic um; bei Postcheck-Fehler automatische Rückkehr zu `00046-faj`.
- **Echte Rechnungsmail wird NICHT durch den Release versandt.** Erst zukünftiger ausdrücklicher Klick im Rechnungseditor auf **«Rechnung senden»** startet Versand an den tatsächlich zugeordneten Kunden; Make/Gmail-Quittung muss `confirmed` sein, erst dann manueller Zahlungseingang möglich. Synthetische und Eigenrechnungen bleiben im Produktionsmodus auf API-Ebene gesperrt.
- **Nächste Operatoraktion:** Auf Windows-Feature-Checkout `git pull --ff-only`, `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\\scripts\\prepare-crm-invoice-mail-production-live.ps1" -DeployCandidate`. Nach `CRM INVOICE MAIL PRODUCTION ZERO TRAFFIC PASS` separate sichere Umschaltung mittels `scripts/activate-crm-invoice-mail-production-live.ps1` (ausdrückliche Freigabefrage). Kein manueller Make-Eingriff nötig; deren Produktionsroute ist bereits aktiv.

## 24.10.2026 – TEST_ONLY-Rechnungsmail-Kandidat in Cloud Run bestätigt

- **Benutzerbestätigtes Ergebnis:** `CRM INVOICE MAIL TEST_ONLY ZERO TRAFFIC PASS` aus `scripts/prepare-crm-invoice-mail-testonly-live.ps1 -DeployCandidate`. Windows/npm: **106/106 Regressionstests PASS**, Baseline `lszh-crm-v2-00046-faj` weiterhin **100 % Live**, neue Cloud-Run-Revision `lszh-crm-v2-00048-sim` ist **0 % Traffic**, Tag `crm-invoice-testonly-qa`, URL `https://crm-invoice-testonly-qa---lszh-crm-v2-ozx7mp2bka-oa.a.run.app`.
- Bestätigt: TEST_ONLY-Empfänger serverseitig allowlist-begrenzt und aus der öffentlichen `/api/config` verborgen; bestehende Cloud-Run-Mail-/Lead-/Offerten-Schutzgates erhalten; keine Mail, Zahlung, Bankaktion, Firestore-/Kundendatenänderung oder Make-Änderung.
- **Nächster Schritt (noch NICHT ausgeführt):** `git pull --ff-only`, dann `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\\scripts\\activate-crm-invoice-mail-testonly-live.ps1"`. Dieses Skript prüft vor dem Cutover die feste Baseline `00046-faj` und den getaggten Kandidaten, fordert `LIVE TEST_ONLY RECHNUNG` und routet nur nach Freigabe auf `00048-sim` mit Postchecks und automatischem Rollback auf `00046-faj` bei Fehlern. **Dieses reine Cutover versendet selbst keine E-Mails**.
- Erst nach bestätigtem TEST_ONLY-Live-Cutover darf der Betreiber eine *synthetische und korrekt verknüpfte* Testrechnung an das allein genehmigte interne Testpostfach über den bewussten CRM-Klick senden. Damit können echte Gmail-Quittung und die anschliessende Zahlungseingangs-Freigabe getestet werden. **Keine echten Kunden-Rechnungsmails, keine automatische Rechnungs-Mail, keine künstliche Setzung von `invoiceDispatchState`.** Reale Testzahlung/Firestore-Testdaten nur mit vorher festgelegter Isolation/Bereinigung.

## 24.10.2026 – Rechnungsmail nur per CRM: TEST_ONLY-Zero-Traffic-Release vorbereitet

- **Verbindliche Produktentscheidung:** Rechnungen nur per bewussten CRM-Mail-Klick; keinerlei manuelle Übergabe und keine automatischen Rechnungs- oder Mahn-E-Mails. Teilzahlung erst nach \`invoiceDispatchState=confirmed\`; manuelle Statusauswahl allein bleibt gesperrt.
- **Bestätigte aktuelle Produktion:** \`lszh-crm-v2-00046-faj\`, 100 % Traffic. Rechnungsversand bleibt dort **AUS**. Das folgende Upgrade wurde **noch nicht auf Cloud Run ausgeführt**.
- Neues fail-closed Script \`scripts/prepare-crm-invoice-mail-testonly-live.ps1\`: validiert Branch/sauberen Checkout, npm ci + Tests, die produktiven Lead-/Offerten-/QR-/Secret-/Scheduler-relevanten Umgebungsvariablen und aktuelles Live-Revisionsziel; erstellt mit \`-DeployCandidate\` einen **0%-Traffic-Revision-Kandidaten** mit demselben Feature-Code, und genau vier neuen Rechnungsmail-Einstellungen: \`CRM_INVOICE_MAIL_ENABLED=true\`, \`CRM_INVOICE_MAIL_PRODUCTION_APPROVED=true\`, \`CRM_INVOICE_MAIL_MODE=test_only\`, \`CRM_INVOICE_MAIL_TEST_TO\` ausschliesslich das bereits freigegebene interne Outlook-Testpostfach. Keine Änderung von vorhandenen Secret-Manager-Verweisen, Firestore-Daten, Make oder Mail-Scheduler. Das \`*_PRODUCTION_APPROVED\`-Flag ist hier nur für die Live-Namespace-Autorisierung des **streng allowlist-beschränkten TEST_ONLY**-Senders erforderlich und **keine** Freigabe echter Kundenmails.
- Privatsphäre-Fix: anonymer Aufruf \`GET /api/config\` gibt das interne \`invoiceMailTestTo\` nicht preis; ein Google-authentifizierter und allowlist-berechtigter CRM-Operator erhält die Adresse nach Login. Betroffene Dateien \`crm-v2/server.js\`, \`crm-v2/public/index.html\`; neuer isolierter API-Test \`crm-v2/test/invoice-config-privacy-http.test.js\`.
- CI erfolgreich: GitHub Actions \`CRM V2 Cloud Staging Tests\` Run \`40088180013\` **PASS**, \`CRM V2 Swiss QR invoice test\` Run \`40088175924\` **PASS** inklusive Windows PowerShell 5.1 Parser und Swiss-QR-Scan. Kein Produktionsdeployment durch GitHub-Codeänderungen.
- **Nächster Operator-Schritt:** Windows-Checkout auf \`feature/crm-v2-invoice-settlement-20261024\`, \`git pull --ff-only\`, dann \`powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\prepare-crm-invoice-mail-testonly-live.ps1" -DeployCandidate\`. Auf \`CRM INVOICE MAIL TEST_ONLY ZERO TRAFFIC PASS\` und Revision warten. Danach gesondertes rollback-gesichertes Cutover ausführen, nicht automatisch. Niemals reale Kunden-Mail vor separater Freigabe.
- **Achtung für späteren E2E:** Fiktive Firestore-Rechnungen in Live-Namespace können echte Dashboards und das fortlaufende Nummernsystem beeinflussen. Daher KEINE synthetischen Rechnungsbuchungen in Live-Firestore ohne separate Testdaten-/Bereinigungsstrategie. Vorherige Make/Gmail-Synthetic-Tests liefen ohne echte CRM-Rechnung und waren bestätigt.

## Verbindliche Produktentscheidung 24.10.2026 – Rechnungen nur per CRM-E-Mail

- **Rechnungen ausschliesslich per E-Mail aus dem CRM versenden.** Kein manueller Übergabe-/Postversand-Workflow und keine Schaltfläche, die einen bloss behaupteten Versand als bestätigt erfasst.
- Der bestehende Zahlungsschutz ist **gewollt**: Manuelle Teil-/Vollzahlungen erst nach tatsächlich vom Mail-Gateway bestätigtem Rechnungsversand (\`invoiceDispatchState=confirmed\`). Die Statuswahl \`Teilbezahlt\` bzw. \`Bezahlt\` darf nicht über das allgemeine Bearbeitungsformular gesetzt werden; Statusänderung nur durch nachvollziehbaren Zahlungseintrag.
- Rechnungsversand nur per **explizitem CRM-Klick**; keine automatischen Rechnungs- oder Mahn-E-Mails. Swiss-QR-PDF kann für interne Vorschau/Prüfung vorhanden sein, ist aber kein Zustellnachweis.
- **Nächste Aufgabe:** produktiven Rechnungs-E-Mail-Sendekanal kontrolliert vorbereiten und mit dem zuvor freigegebenen internen TEST_ONLY-Empfänger prüfen, bevor Kundenversand separat freigegeben wird. Die aktuellen Invoice-Mail-Gates sind weiter AUS. Keine externe Kundenmail ohne separate Freigabe.

## Live-Abnahme 24.10.2026 – Release erfolgreich

**Betreiberbestätigung:** `CRM INVOICE SETTLEMENT LIVE PASS`. Cloud Run `lszh-crm-v2-00046-faj` empfängt 100 % produktiven Traffic; `lszh-crm-v2-00043-wur` ist bestätigte Rollback-Revision. Das Freigabe-/Rollback-Skript `scripts/activate-crm-invoice-settlement-live.ps1` hat nach der Traffic-Umschaltung die CRM-Oberfläche, Authentisierungsschutz, Scheduler-Vertrag und Mail-Einstellungen erneut geprüft. Mail-Cutoff `2026-10-23T16:15:28Z` unverändert. Keine Testzahlung, kein Bankaufruf, keine Kunden-E-Mail, keine Mahnung, kein Live-Firestore-Seed durch das Release. Die Rechnungsmail-Freigabegates bleiben deaktiviert.

**Abgrenzung:** Unit-Tests/isolierte Chromium-Emulator-E2E und die Live-Smokekontrollen sind PASS. Ein authentifizierter Live-End-to-End-Test von tatsächlichem TEST_ONLY-Versandbeleg, Teilzahlung, Vollzahlung, Korrektur und Mahnprotokollierung ist **noch nicht** nachgewiesen. Jede manuelle Zahlungsbuchung verlangt weiterhin einen bestätigten Versandnachweis. `RE-1001` ist weiterhin die interne Testrechnung und darf nicht bezahlt werden.

## Ausgangslage
- Nutzer bestätigt am 24.10.2026: synthetische Rechnungsmail im Outlook-Postfach angekommen, LSZH-Design passt, der Test funktioniert. Betrifft ausschliesslich die zuvor genehmigte `TEST_ONLY`-Rechnung RE-9099999, **nicht** einen realen Kundenversand.
- Vorheriger bestätigter Produktivstand laut CRM-Handoff: Cloud Run `lszh-crm-v2-00043-wur` (100%), separater Invoice-Mail-Kandidat `00045-lec` (0%). Invoice-Mail-Gates bleiben ohne gesondertes Go-live geschlossen; kein Live-Deploy oder Mail-Gateway-Event durch diese Arbeit.
- LSZH Invest GmbH ist nicht MWST-registriert. Keine MWST auf Rechnungen oder Zahlungserinnerungen.

## Neu implementiert (isolierter Branch)
Branch `feature/crm-v2-invoice-settlement-20261024`, aus `feature/crm-v2-cloud-staging-20261023` erstellt.

1. `crm-v2/invoice-accounting.js`: Ganzzahliges Rappen-Rechnen, CH-lokaler Fälligkeitstag, Format-/Kalendervalidierung, Restbetrag und abgeleiteter Anzeigestatus `Überfällig` (der gespeicherte Buchungsstatus bleibt `Offen`/`Teilbezahlt`).
2. `cloud-records.js`: Firestore-Transaktionen für manuelle Teil-/Vollzahlungen mit `paymentHistory`, Betrag, Valutadatum, Methode, Referenz, Benutzer, Zeitstempel. Status `Teilbezahlt`/`Bezahlt`, `paidAmountCHF`, `outstandingCHF`, `paidAt`. Keine direkte PATCH-Setzung auf bezahlt; nur nach `invoiceDispatchState=confirmed`. Idempotenz via UUID gegen Double-Click/HTTP-Replay und Sperren gegen Überzahlung/doppelte aktive Buchungsreferenz.
3. Korrektur mit `reverseInvoicePayment`: nur mit Grund und UUID; alte Zahlung bleibt als `voidedAt/By/Reason` unverlierbar im Datensatz; aktive Zahlungssumme und Status werden neu berechnet, kein stilles Löschen.
4. `recordInvoiceReminder`: ausschliesslich bereits **extern/manuell verschickte** Zahlungserinnerungen auditieren; nur bei bestätigtem Rechnungsversand, Fälligkeit überschritten und Restbetrag > 0; Stufen `Zahlungserinnerung`, `1. Mahnung`, `2. Mahnung` nacheinander und mindestens sieben Tage Abstand. Kein Make-/Gmail-Aufruf. Keine Mahngebühren.
5. `server.js`: Same-Origin-geschützte OAuth-Routen `POST /api/records/rechnungen/:id/payments`, `/payments/reverse`, `/reminders`; kein schedulerbasierter Schreibpfad.
6. `public/index.html`: tatsächliche Zahlung verbuchen, Zahlungen/Korrekturen und Restbetrag sehen, Fälligkeit/Überfällig-Badge, manuelle Reminder-Textvorschau mit Kopieren, erst **nach externem Versand** protokollieren. Dashboard offene Beträge nach verbleibender Forderung und bezahlte Beträge inklusive Teilzahlungen. Kein automatischer Versand.

## Unabhängig beobachtete QA
- GitHub Actions Workflow `CRM V2 Swiss QR invoice test`, Run `40083793125`, Commit `e364db8f3` (Stand vor dieser Dokumentation): **105/105 CRM-Tests PASS, 0 fehlgeschlagen**.
- Separater Windows-PowerShell-5.1-Parserjob: **PASS**, keine Skripte ausgeführt.
- PDF-A4-/QR-Workflow inkl. Scan **PASS**, Swiss QR **31 Felder**.
- Erfasst sind Tests für sichere Buchung nach bestätigtem Versand, Teilzahlung, Überzahlung, Doppelbuchung, Zahlungs-Korrektur/Reopening, Manuell-Mahn-Idempotenz, 7-Tage-Sperre sowie Browser-Inline-JS-Syntax.
- QA ist kein browserbasierter Auth-/Firestore-E2E auf Cloud Run; kein Kundenkonto und keine Bank tatsächlich angeschlossen.

## Sicherheitsgrenzen und offene Freigaben
- Produktionsrevision, Make-Szenarien, produktive Leads/Offerten und Mail-Cutoff wurden **nicht** verändert. Keine echte Rechnungs-Mail und keine Mahnung an Kunden verschickt.
- `RE-1001` bleibt interne Test-/Eigenrechnung. `RE-9099999` bleibt unzahlbare `TEST_ONLY`-Probe mit öffentlicher Demo-IBAN.
- Nicht vorhanden: Bank-/TWINT-API-Reconciliation; automatische Mahnung; Zahlungseingang ohne belegten Versand; externe automatische Mahngebühren. UI-Rechnungs-PDF wird nach Teilzahlung nicht als neues Restbetrag-QR-PDF angeboten, da der bestehende QR-Zahlteil den ursprünglichen Rechnungsbetrag zeigt.
- Nächste kontrollierte Schritte: 105er CI auf finalem Doc-Commit nochmals prüfen; isolierte Browser-Cloud-Run-QA mit synthetischem Kunden, Zahlungen und Korrekturen, danach separater Rollout mit ausdrücklicher Freigabe und dokumentiertem Rollback. Kein Go-live nur wegen bestandenem Unit-Test.


## 24.10.2026 – E2E mit echtem Chromium und lokalem Firestore-Emulator PASS

**GitHub Actions Run:** https://github.com/lszh-automations/lszh-automations-site/actions/runs/40084290731
(Workflow `CRM V2 invoice payment browser Firestore E2E`, Commit `eb79dddaa0a3c96194b804a177dd695f6cf20b06`, Job `browser-firestore` SUCCESS).

**Ablauf/Isolation:** Eine isolierte GitHub-Actions-Laufzeit startet einen echten Node-CRM-HTTP-Server und den lokal laufenden Firebase-Firestore-Emulator (`127.0.0.1:8787` im Demo-Projekt `demo-lszh-invoice-e2e`) mit Namespace `lszh_crm_v2_staging_`. Ein echter Chromium-Browser verwendet das Original-`crm-v2/public/index.html` und die echten API-Routen. Die Google-ID-Token-Verifizierung ist ausschliesslich in diesem Testprozess gestubbt; es gibt keine echten Google-/Make-/Gmail-/Bank-Aufrufe und keine produktiven Cloud-Credentials/Firestore-Schreibvorgänge. Der Rechnungs-Sendebeleg wird innerhalb des Emulators durch die echte Claim/Finish-State-Machine als `TEST_ONLY_EMULATOR_RECEIPT_NO_GMAIL_SEND` simuliert, **nicht versandt**.

**Geprüft:**
- Unautorisierte API 401, fremder Origin bei Schreiboperation 403.
- Testkunde und nummerierte Rechnung über die API erstellt und im Browser über das Rechnungsregister geöffnet.
- Browser zeigt nach CHF 50.00 Teilzahlung CHF 149.95 offen (`Teilbezahlt`), überfälliges Badge; Firestore enthält exakt eine Zahlungsbuchung.
- Manuelle Zahlungserinnerung nur im Emulator per simuliertem bereits erfolgtem externem Versand protokolliert; Nachfass-Sperre von sieben Tagen greift, kein Mail-Aufruf.
- Browser verbucht CHF 149.95 vollständig: `Bezahlt`, offen CHF 0.00, zwei Historieneinträge.
- Browser korrigiert die letzte Buchung mit Grund: wieder `Teilbezahlt`, offen CHF 149.95; Originalbuchung bleibt mit `voidedAt` in Firestore erhalten.
- Überzahlungs-POST 409, direktes PATCH auf `Bezahlt` 409, Wiederholung einer identischen Zahlungs-ID erzeugt keinen dritten Eintrag.
- Kein Browser-`pageerror`; kein Zugriff auf produktiven Collection-Prefix.
- GitHub-Ausgabe ausdrücklich `INVOICE E2E PASS: browser + authenticated HTTP + local Firestore` und `INVOICE E2E NO SEND`.

**Weitere QA:** Cloud-Staging-Workflow `40084353078` ist nach Behebung der fehlenden Dependency-Installation **SUCCESS**. Die vorherigen roten Cloud-Staging-Tests lagen an fehlendem `pdf-lib` in dessen CI-Setup, nicht an der Rechnungslogik. Der bestehende QR-Regressionsworkflow ist separat weiterhin PASS (Run `40084273694`).

**Grenze:** Dies ist ein **echter isolierter Browser/API/Firestore-Emulator-End-to-End-Test**, aber **kein realer Cloud-Run-Staging- oder produktiver Google-Login-/Gmail-Test**. Vor einem Cloud-Run-Rollout ist ein getrennter authentifizierter Smoke-Test mit synthetischen Firestore-Staging-Daten und Rollback-Plan erforderlich. Produktive Cloud-Run-Traffic-Routing, Make-Szenarien, E-Mails und Bankkonten bleiben unberührt.

## 24.10.2026 – Live-CRM-Test vorbereiten: Fail-closed Freigabestufe

**Status:** Release-Skript ist angelegt und CI-geprüft; **kein Produktions-Deploy, keine Traffic-Umschaltung, keine Testzahlung im Live-Firestore**. Nutzer will die Funktionen direkt im Live-CRM statt separat im Staging durchtesten.

- Skript: \`scripts/prepare-crm-invoice-settlement-live-test.ps1\`.
- Normalstart ohne Schalter: rein lesender Preflight mit lokalen Regressionstests, Git-Branch-/Commit-Abgleich, exakter bisheriger Live-Revision \`lszh-crm-v2-00043-wur\`, produktiven Feature-Gates und Secret-Manager-Verweisen.
- \`-DeployCandidate\`: erstellt auf dem **bestehenden** Dienst \`lszh-crm-v2\` nur einen als \`crm-settlement-qa\` getaggten Kandidaten mit **0 % Traffic**; vergleicht Servicekonto, sämtliche Env-/Secret-Referenzen und führt anonyme HTTP-Konfigurations-/401-Schutzprüfungen durch. Die Produktions-URL verbleibt bei \`00043-wur\`. Bei Drift bricht das Skript ab.
- Der Code fügt keine produktiven Mail-Freigaben hinzu und verändert weder Make noch Live-Firestore-Datensätze; separates Aktivierungs-/Rollback-Gate ist weiterhin erforderlich.
- GitHub Actions nach Skripterstellung: \`CRM V2 Swiss QR invoice test\` Run [40085494862](https://github.com/lszh-automations/lszh-automations-site/actions/runs/40085494862) **PASS** inkl. Windows PowerShell 5.1 Parser; \`CRM V2 Cloud Staging Tests\` Run [40085498717](https://github.com/lszh-automations/lszh-automations-site/actions/runs/40085498717) **PASS**.
- **Operativer nächster Schritt:** Auf dem autorisierten Windows-Rechner den aktuellen Branch auschecken und das \`-DeployCandidate\`-Skript laufen lassen. Ausgabe \`CRM INVOICE SETTLEMENT ZERO TRAFFIC PASS\` mit Kandidatenrevision bestätigen. Danach erst kontrollierten Traffic-Cutover inklusive Rollback und ausschliesslich TEST_ONLY-Daten planen.
- Ein echter Live-Zahlungstest bleibt durch die Versandnachweis-Grenze \`invoiceDispatchState=confirmed\` geschützt; das muss durch einen tatsächlich bestätigten Testversand an ein genehmigtes Testpostfach erfüllt werden. **Nicht** auf realen Daten simuliert setzen oder die bereits existierende RE-1001 als bezahlt buchen.

## 24.10.2026 – Cloud Run Zero-Traffic-Rechnungsabwicklung PASS / Live-Cutover noch offen

**Betreiber bestätigte Windows-PowerShell-Resultate:**
- CRM-Regressionstests **105/105 PASS**; gesicherte Live-Konfiguration, Secret-Manager-IBAN und Invoice-Mail-Sperre geprüft.
- **ZERO TRAFFIC PASS:** Cloud Run Service \`lszh-crm-v2\` in \`europe-west6\` hat den neuen Kandidaten \`lszh-crm-v2-00046-faj\` erfolgreich gebaut (Source Commit \`c29063985cc1d8208c7b16340df0c5f5cd829c5f\`) und mit Tag \`crm-settlement-qa\` unter \`https://crm-settlement-qa---lszh-crm-v2-ozx7mp2bka-oa.a.run.app\` erreichbar gemacht.
- **Live unverändert:** \`lszh-crm-v2-00043-wur\` mit **100 %** Traffic. Keine E-Mail, Rechnung oder Buchung beim Build; 0%-Kandidat auf realem Service nutzt gleiche env/Secret-Referenzen.
- In GitHub anschliessend kontrolliertes Release-Skript \`scripts/activate-crm-invoice-settlement-live.ps1\` hinzugefügt. Es prüft die zwei festen Revisionen, gleiche Credentials/Umgebung, Release-Gates, Scheduler-Vertrag, Browser-HTML-Marker und anonyme API 401, fordert explizit \`LIVE SETTLEMENT\` an und routet nur dann den Traffic. Misslingt eine Nachprüfung, wird automatisch zurück auf \`00043-wur\` geroutet. Der Release führt ausschliesslich lesende HTTP-Prüfungen aus und erstellt keine Live-Testdatensätze, sendet keine Mails und bucht keine Zahlungen.
- **Noch kein Cutover bestätigt.** Nachdem CI-Parser für das neue Release-Skript PASS meldet, auf dem autorisierten Windows-Checkout \`git fetch origin; git pull --ff-only\` und \`powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\activate-crm-invoice-settlement-live.ps1"\` ausführen. Die Prompt-Freigabe erfolgt erst nach allen Preflight-Prüfungen.
- Bei erfolgreichem Live-Cutover müssen direkte UI-Funktionstests zunächst auf schreibfreie Prüfung beschränkt bleiben: Buchung nur für tatsächlich zugestellte und \`invoiceDispatchState=confirmed\` stehende Rechnungen. Da Invoice-Mail-Gates im Produktivservice noch AUS sind, braucht eine neue synthetische TEST_ONLY-Rechnung vor dem Zahlungs-E2E eine getrennt genehmigte und quittierte Sendung an das Testpostfach. Produktiver Rechnungsversand bleibt gesperrt; RE-1001 nicht bezahlen.
