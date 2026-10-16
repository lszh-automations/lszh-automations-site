# LSZH Automations – Onboarding→Outbox: End-to-End-Validierung (synthetisch)

**Stand:** 17.10.2026. GitHub-Branch `feature/onboarding-notification-outbox-20261016`, Draft PR #8 (ungemergt; auf PR #7 aufbauend).

## Abgrenzung

Der bestehende Cloud-Run-HTTP-Dienst `lszh-onboarding-outbox-staging` ist bereitgestellt, IAM-geschützt (anonymer GET wurde mit HTTP 403 abgewiesen), jedoch weiterhin mit `LSZH_OUTBOX_STAGE_ENABLED=false` gesperrt. Keine Airtable-Read-Credentials, keine Fixture-Allowlist, kein zusätzlicher Control-Secret und kein Scheduler hinterlegt. Make-Szenarien und E-Mail-Versand unverändert inaktiv. **Nichts in diesem Bericht darf als produktive Freigabe, bestätigte Make-Mitgliedschaft, Vertragsannahme oder geprüfter Kundenabschluss ausgelegt werden.**

## A. Verbundene Airtable-Basis – Live-Metadaten read-only geprüft

Über den verbundenen Airtable-Zugang **ohne Schreiboperationen** geprüft:

- Basis: `LSZH Automations – Website CRM` (`appzJiskpAdaR1HEv`).
- `Kunden-Onboarding` (`tblWIY4l4VASz8Vse`): `Projektcode` (Text), `Auftrag` (einzelne Link-Beziehung erwartet, Airtable-Typ `multipleRecordLinks`), `Status` (singleSelect), `Sensible Daten` (singleSelect), Rechnungsadresse/-E-Mail und `Make-Konto Status`, `Make-Organisation`, `Make-Einladung Status`.
- `Aufträge` (`tblXUogIvWbulxfnN`): `Onboarding-Token`, `Kunden-Onboarding`, `Kunde`, `Verbindungen erforderlich` (Checkbox), `AVV erforderlich` (singleSelect), `Make-Kontostatus`, `Make-Organisation`, `Make-Einladungsstatus`.
- `Kunden` (`tbl8cUUfFVqsjj2Z0`): Rechnungsstrasse, Rechnungs-PLZ, Rechnungsort, Rechnungsland, Rechnungs-E-Mail.
- `Projektaufgaben` (`tblwbAszWFlFJGmgQ`): `Aufgabencode` und `Auftrag` (Link).
- Airtable-Einzelauswahlwerte geprüft: Kunden-Onboarding `Status` enthält `Ausstehend`, `Eingegangen`, `Rückfrage`, `Vollständig`; `Sensible Daten` enthält `Nein`, `Ja`, `Unsicher`; Aufträge `AVV erforderlich` enthält `Nein`, `Ja`, `Prüfen`. Die im bestehenden Code geprüften Make-Statuswerte sind im CRM-Schema vorhanden.
- Lesender, eng gefilterter Test auf **exakt** `Projektcode = ob_00000000-0000-4000-8000-000000000000` im `Kunden-Onboarding` ergab **0 Treffer**. Daraus folgt nur: **Dieser** synthetische Fixture-Code ist aktuell nicht im CRM vorhanden. Weder das komplette CRM noch andere Kunden-Datensätze wurden dafür abgefragt.

Die reine Airtable-Metadaten-/Fixture-Abfrage beweist weder die Funktionsfähigkeit einer REST-PAT innerhalb von Cloud Run noch den berechtigten aktuellen Zugang zur Make-Organisation des Kunden. Die Make-Felder sind Selbstauskünfte und keine unabhängig geprüften Berechtigungsnachweise.

## B. Vollständiger synthetischer Offline-E2E-Test

Neue Testdatei: `workers/onboarding-notifications/onboarding-e2e.synthetic.test.mjs`.

**Die unveränderten Anwendungsfunktionen werden gemeinsam verwendet**, keine eigens nachgebaute Vereinfachung der Geschäftslogik:

`createServer` → `listCandidateCodes` → `reconcile` → `verifyOnboardingState` → `createFirestoreStore().createOnce()`

Der Test verwendet nur `127.0.0.1` als lokale HTTP-Schnittstelle, fiktive `recAAAAAAAAAAAAAA`-/`recBBBBBBBBBBBBBB`-usw. IDs, `noreply@example.invalid` sowie simulierte Airtable-/Firestore-REST-Antworten. Alle externen `fetchImpl`-Anfragen werden vollständig abgefangen, bei unerwarteten Hosts/Methoden bricht der Test ab. Weder Gmail noch Make, reale Airtable-Record-Updates oder Firestore-Cloud-Writes werden aufgerufen.

**Sieben zusätzliche E2E-Fälle:**

1. Vollständig verkettetes synthetisches Onboarding: Prüfung von Projektcode, zugehörigem Auftrag, Kunden-Link, Rechnungsdaten, Statuskopien, DSG-/AVV-Bedingung → ein `DRAFT_NOT_SENT`-Dokument mit `testOnly=true`, `deliveryEnabled=false`, `emailSent=false` über die reale `createOnce`-Routine; HTTP-Antwort zeigt nur aggregierte Zähler.
2. Wiederholung derselben vollständigen Anforderung: identischer Hash-Schlüssel, atomarer Create-Versuch führt zum 409-Duplikatpfad; existierendes Firestore-Dokument wird überprüft und `alreadyExisting=1`; keine zweite Anlage.
3. Angabe `Sensible Daten=Unsicher` ohne passende DSG-Aufgabe: kein Outbox-Eintrag, Zustand `processing`.
4. Rechnungsdaten aus Onboarding/Kunde widersprechen sich: kein Outbox-Eintrag und nicht einmal Cloud-Metadatentoken angefordert.
5. Zwei Treffer für denselben Onboarding-Projektcode: `requiresReview`, keine Firestore-Aktion.
6. Airtable HTTP 401: `unavailable`, niemals optimistisch als abgeschlossen behauptet.
7. Server deaktiviert oder Trigger-Secret falsch: HTTP 503 beziehungsweise 403, **null** externe Requests.

**CI:** GitHub Actions auf Commit `4788c78262a4be641ca96134b0a80b72c7a1cbaf` meldete im Outbox-Workflow `82 Tests / 82 bestanden / 0 Fehler` (plus `8/8` separate IAM-Tests). Nur offline / synthetisch; kein Deployment.

## C. Bereits zuvor live bestätigte Komponenten

- Im eigenen Google Cloud Run **read-only** STAGING-Job effektive Firestore-GET-Berechtigung nachgewiesen: GET DB-Metadaten HTTP 200 und festes fehlendes Dokument HTTP 404.
- In separatem einmalig ausgeführten synthetischen Google Cloud Run **write-probe**-Job echte Outbox-`createOnce`-Routine mit einem festen fiktiven Dokument in der benannten Staging-Datenbank bestätigt; Werte zurückgelesen; Dokument via `updateTime`-Bedingung gelöscht; nachfolgend HTTP 404. Siehe Projektstand, Execution `lszh-firestore-write-probe-staging-cb7mm`.
- Cloud Run HTTP Outbox-Anonymzugriff abgelehnt (HTTP 403); authentifiziertes GET `/health` meldet weiterhin `enabled=false`.

**Es gab noch keinen realen zusammenhängenden Airtable→Cloud-Run→Firestore-End-to-End-Lauf.**

## D. Nächste risikoarme Reihenfolge

1. **Keine weiteren Firestore-Probejobs** und keine erneute Ausführung der bereits erfolgreichen Einmal-Jobs.
2. Vor einem echten verbundenen Test eine **ausschliesslich synthetische, klar isolierte Airtable-Fixture** bestimmen. Ein Datensatz im bestehenden `Website CRM` kann zusätzliche Airtable-/Make-Automationen anstossen; deshalb vor seiner Erstellung Trigger, Mailversand, Rechnungs-/Offertenfolgen sowie Aufräumstrategie explizit prüfen. Keine bestehenden Kundenrecords umwidmen.
3. Erst bei verifizierter Isolation und separater Zustimmung eine testweise **read-only** Airtable-Abfrage mit genau einem erlaubten Projektcode durchführen und deren technische Berechtigungen bewerten. Ein anderes Test-Airtable/Base-Setup müsste zur Codekonfiguration passen; die jetzige Funktion ist auf die Website-CRM-Basis festgelegt.
4. Erst in einem weiteren separaten Schritt über kontrollierte Staging-Secrets, IAM, Laufzeitvariablen und ein manuelles internes Reconcile nachdenken; **keine** Scheduler, produktiven Benachrichtigungen oder Vertragsannahmen aktivieren, bevor dieser Schritt vollständig geprüft ist.
5. Erst nach Abschluss und Dokumentation der Staging-Prüfung über PR-Merge und produktives Release entscheiden. Rechtliche RC1-/AVV-Unterlagen bleiben eigenständige offene Freigaben.

**Sicherheitsentscheidung:** Der korrekte Abschluss eines vom Kunden eingereichten Onboarding-Formulars belegt weder die unabhängige Prüfung einer Make-Mitgliedereinladung an LSZH noch die Vollständigkeit des gesamten Kunden-Onboardings.
