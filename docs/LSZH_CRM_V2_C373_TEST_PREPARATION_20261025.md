# C3.7.3 – Konkrete Vorbereitung einer PDF-Testmail

Stand: 25.10.2026. Aktualisiert den Stand aus LSZH_CRM_V2_C373_TEST_DISPATCH_20261025.md. Kein Versand, kein neuer Cloud-Run-Job und keine produktive CRM-/Firestore-Aenderung.

## Festes Testpaket

From: LSZH Automations <info@lszh-automations.ch>. To: lars.schulthess@outlook.com. Keine CC/BCC. Betreff: [TEST_ONLY] LSZH PDF-Transporttest 1101.

Genau eine geplante Mail mit TEST_ONLY_offer.pdf, TEST_ONLY_terms.pdf und TEST_ONLY_avv.pdf. Nur synthetische Dokumente, kein Vertragsangebot, keine Zahlungspflicht und kein Annahmelink. Die drei einseitigen PDFs wurden gerendert und visuell kontrolliert. Paket- und Dokumentpruefsummen sind in crm-v2/c373-sent-readback-expected.json festgelegt.

Event-ID: contract_send_pkg_test_c373_transport_001_r1.

## Vorbereitete Make-Strecke

- Neues Szenario 8174297: https://eu1.make.com/1728770/scenarios/8174297
- Name: LSZH C3.7.3 – EIN TESTPAKET 1101 – GESPERRT / KEIN VERSAND.
- Inaktiv, nur on-demand, keine frei waehlbaren Eingaben fuer Empfaenger oder PDFs.
- Zusaetzlicher fester Filter PENDING_OPERATOR_SEND_APPROVAL == APPROVED ist falsch und stoppt vor der Reservierung.
- Der From-Alias wurde aus der Geschaeftsverbindung 11904991 aufgeloest. Verbindung ok. Gespeicherte Daten fuer Adressen, drei PDF-Bytes, Header und Receipt-Rueckgabe stimmen mit der lokalen Vorbereitung ueberein.
- Neuer permanenter Make-Store 232708, Schema 659758. Fester Schluessel offer_test_c373_transport_001 mit overwrite=false; Zustand delivery_review vor Gmail und keine automatische Freigabe.
- autoCommit=true, dlq=false, sequential=true, maxErrors=1, dataloss=false. Gmail-Fehler fuehren zu Commit/STOP; kein Retry-Zweig. Keine Ende-zu-Ende-Exactly-once-Garantie fuer Providermechanismen beanspruchen.
- Ein Receipt meldet sentEvidenceVerified=false; unabhaengiger PDF-Nachweis bleibt erforderlich.

Dies ist ein zusaetzlicher Transport-Lock fuer genau den internen Test, keine zweite produktive CRM-Statusfuehrung. Die vorbereitete lokale Firestore-Orchestrierung ist noch nicht mit dieser Operator-Teststrecke verbunden. Bestehende Szenarien 8144117, 8166714 und 8162162 unveraendert.

## Dauerhafte Sperre real geprueft – ohne Gmail

Diagnoseszenario 8174328 hat kein Gmail-Modul. Erster Lauf 1f42f7d1b31640a2a65300afd0febdac: success, mailSent=false. Zweiter Lauf 639886feb077405f8e3a98cafcb21abe: erwarteter Duplicate-key-Fehler. Danach wieder deaktiviert.

Store enthaelt genau den Validierungsschluessel VALIDATION_ONLY_C373_LOCK_NO_MAIL_20261025. Die eigentliche Versandsperre ist nicht reserviert.

## Unabhaengiger Read-only-Pruefer vorbereitet

c373-sent-readback-job.js ist fuer einen neuen, noch nicht bereitgestellten Job lszh-crm-c373-contract-readback vorbereitet. Vorhandenen Read-only-SA und Secret-Mount von C3.7.2 verwenden, keine IAM-/Secret-Aenderung. Exaktes gmail.readonly, OAuth-Audience, Postfachidentitaet sowie vorhandene explizite Sender-/Empfaengerfreigaben in der Secret-Huelle pruefen. Fehlende Adressfreigabe stoppt vor OAuth; keine stillschweigende Secret-Erweiterung.

Modus policy_only prueft vor dem Versand nur Rechte, Adressen und Identitaet. Keine Message-ID, keine Nachricht lesen, keinen SENT-Beweis behaupten. Modus sent_pdf liest genau die spaeter zurueckgegebene Gmail-Message-ID und verifiziert SENT, From/To, keine CC/BCC, TEST_ONLY-Betreff, Event-/Paket-Header und alle drei PDF-Originalbytes samt Namen, Laengen und SHA-256. Ausgabe ausschliesslich statisches PASS/BLOCKED; keine privaten Providerfehler, Nachrichtentexte, Tokens oder PDF-Bytes.

scripts/prepare-crm-c373-readback-source.ps1 paketiert zwoelf erlaubte Quelldateien, ohne Cloud-Aufruf. Node 22.x; Startskript node c373-sent-readback-job.js. Beim spaeteren Source-Deployment keine Command-/Args-Ueberschreibung setzen: Buildpack-Launcher verwenden.

## Verifikation und verbleibende Freigabe

Sieben neue Offline-Readback-Tests; neun vorhandene Tests fuer die lokale Versandsteuerung. Zusaetzlicher lokaler Integrationscheck mit den konkreten finalen PDFs und echtem C3.5-Verifier: Inline- und externe Anhaenge bestehen, manipulierte AVV wird abgewiesen. Gmail-GET-Antworten dabei simuliert; keine echte Mail. Kein neuer Firestore-Emulatorlauf beansprucht.

Die urspruengliche Vorgabe verbietet Deployments und Mails ohne explizite Freigabe. Naechste Freigabe muss konkret umfassen:

1. Nur den neuen Read-only-Job bereitstellen, ohne bestehende Dienste, IAM oder Secretwerte zu veraendern; eine Task, null Retries, vorhandener SA, Secret-Version 1 und Versandflags false.
2. Genau einen policy_only-Vorabcheck ausfuehren. Bei BLOCKED stoppen, keine Mail und keine eigenmaechtige Secret-Aenderung.
3. Nur bei PASS die feste Make-Sperre fuer dieses eine Paket gezielt freigeben, fuer genau einen on-demand-Lauf aktivieren, eine Mail senden und danach wieder deaktivieren. Unklares Ergebnis niemals durch erneuten Versand behandeln.
4. Die tatsaechliche Gmail-Message-ID genau einmal mit sent_pdf pruefen. Ein PASS belegt den gesendeten Paketinhalt, weder Outlook-Inbox-Zustellung noch Kundenannahme.

Online-Kundenannahme und produktive Firestore-/CRM-Anbindung bleiben anschliessende Arbeitsschritte.
