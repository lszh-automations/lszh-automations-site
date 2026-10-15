# LSZH – Firestore → Airtable/Make: sicherer Reconciliation-Entwurf

Stand: **15.10.2026**. Ausschliesslich synthetische Testdaten im GitHub-Entwicklungszweig `feature/firestore-staging-dryrun-20261015`. Kein echter Airtable-PATCH, keine Make-Ausführung, keine E-Mail, kein Cloud-Run-Deployment, kein Google-Cloud-Firestore-Schreibzugriff.

## Verbindliche Architekturgrenzen

**Firestore führt den Annahmestatus** der eigentlichen Offerte transaktional (`ACCEPTED`, `acceptedAt`, `acceptanceEvidence`, `reconciliationStatus=PENDING`). Airtable dient als CRM-Kopie nach einem erfolgreichen Commit. Das Versenden von Bestätigungen/Start des Kunden-Onboardings ist ein **separater Prozess** und wird niemals aus einem blossen `PENDING`-Zustand oder einem Test heraus aktiviert.

Zustandsmaschine des nur lokal / im Emulator testbaren Moduls `firestoreReconciliation.js`:

```
ACCEPTED + PENDING
    │  Firestore runTransaction: Einmalige Lease (2 Minuten)
    ▼
  LEASED  ─── eindeutige Event-ID, genau ein aktiver Worker
    │  Unabhängig von Firestore: Airtable Record lesend prüfen
    │    ├─ exakt gleiche Event-ID und vollständig gleiche Felder → bereits vorhanden
    │    ├─ noch "Versendet", gleiche Offerte/PDF-Hashes/AVV → nur PATCH-Vorschau
    │    └─ Status/Version/Hash/Widerspruch → MANUAL_REVIEW, kein Überschreiben
    │
    ├─ hypothetische bestätigte externe Aktualisierung
    │  + nochmals lesend verifizierter unveränderter Nachweis
    │      ▼
    │     SYNCED   (keine E-Mail-/Make-Aktion)
    │
    └─ Lease abgelaufen, Ausgang unbekannt
           ▼
       NEEDS_REVIEW ── exakter extern wieder eingelesener Marker vorhanden ──→ SYNCED
                      └─ fehlt/abweichend → NEEDS_REVIEW, KEIN automatisches PATCH
```

**Entscheidender Schutz:** Firestore-Transaktionen allein machen ein externes Airtable-PATCH **nicht** atomar. Der Zustand `LEASED` verhindert parallele Worker; eine unterbrochene Verbindung nach möglichem Airtable-Schreibvorgang darf nicht blind wiederholt werden. Dieser Entwurf sperrt den automatischen Wiederholungsversuch und fordert einen unabhängigen **Readback** aus Airtable. Durch den stabilen Eventmarker kann eine bestätigte Kopie nach einem Neustart als `SYNCED` quittiert werden. Bei abweichendem Zustand bleibt die Offerte gesperrt für manuelle Prüfung. Damit wird **keine globale Exactly-once-Zustellung** behauptet.

## Aktuelle Implementierung (test-only)

- `eventId(state,documentPath)`: stabile, pseudonyme SHA-256-Referenz aus Fixture-Pfad, Airtable-Testrecord-ID, Annahmezeit und eingefrorenen PDF-Hashes. Kein Token, kein Klartext-IP-Wert oder voller Kundennamen im Eventmarker.
- `previewAirtableAcceptance`: bildet eine **nicht ausführbare Vorschau** auf die vorhandenen Airtable-Felder (`Status`, `Vertragsunterlagen akzeptiert`, `Online-Annahme Zeitstempel`, `Online-Annahme Person`, `Online-Annahme E-Mail`, `Online-Annahme Vertragsversion`, `Online-Annahme AVV ausdrücklich akzeptiert`, `Online-Annahme Nachweis`). Der JSON-Nachweis enthält `LSZH_STAGING_RECONCILIATION_V1`, `FIRESTORE_EMULATOR_ONLY` und den stabilen Marker; **kein echtes Airtable API-Modul**.
- `compareRemote`: nur bei exakter Offertennummer, Projektbedingungen-Version, Offerten-/Bedingungen-SHA256, AVV-Pflicht/Version/Hash und übereinstimmenden Annahmefeldern gilt ein Datensatz als schon abgeglichen. Eine bereits anders angenommene Offerte wird **niemals überschrieben**.
- `acquireLease`: Firestore-Transaktion auf einer **rein synthetischen** Fixture mit `status=ACCEPTED`, vorherigem Nachweis und `PENDING`, gibt eine einmalige 128-bit Lease-ID mit 2-Minuten-Ablauf aus. Gleichzeitige zweite Worker werden blockiert.
- `completeAfterVerifiedRemote`: markiert nur den eindeutigen, gültigen Lease-Besitzer als `SYNCED`, wenn der **vom Aufrufer unabhängig beschaffte** Airtable-Readback mit dem Marker und allen Annahmefeldern übereinstimmt.
- `resolveUnknownOutcome`: markiert einen Crash-Fall `NEEDS_REVIEW` nur dann als `SYNCED`, wenn der **später wieder eingelesene** Airtable-Record exakt den Eventmarker und Nachweis enthält. Bei fehlendem Marker bleibt `NEEDS_REVIEW`; keine unbeaufsichtigten Wiederholungen.
- Für **alle** Funktionen gelten harte Sperren gegen Cloud Run `K_SERVICE`, echtes `GOOGLE_CLOUD_PROJECT=lszh-automations`, nicht synthetische ID, abweichendes Schema und nicht künstliche Zustände. Die beiden Transaktionsfunktionen bieten **keinerlei externen API-/E-Mail-Aufruf**. Positive Tests mit `legallyApproved=true` erfolgen nur in kurzlebigen simulierten bzw. Emulator-Testdokumenten.

## Read-only Airtable-Schema verifiziert

Am 15.10. wurde die Struktur der verbundenen Airtable-Base `appzJiskpAdaR1HEv` und Tabelle `tbljeIUoD7wwKuSmS` **nur gelesen**. Die oben genannten Zielspalten sind vorhanden. Insbesondere stehen `Offertennummer`, `Projektbedingungen Version`, `AVV erforderlich`, die Archiv-SHA256-Felder und die elektronische Annahme-Evidenz zur Verfügung. **Es wurde kein Feld angelegt und kein Datensatz verändert.**

## Wichtige offene Integrationspunkte

1. Der bestehende Annahmecode setzt `reconciliationStatus=PENDING`. Der künftige echte Firestore-Datensatz braucht zusätzlich eine **zuverlässig serverseitig gebundene Airtable-Record-ID**; diese Feldübernahme ist noch **nicht implementiert**. Tests verwenden nur `recTEST0000000000`, keinen realen Datensatz.
2. Ein produktiver Worker müsste mit kurzlebiger, minimal berechtigter Identität auf Firestore zugreifen sowie die Airtable-Verbindung serverseitig sichern; er darf einen Readback/Marker **niemals blind vom Browser übernehmen**. Konfigurations-/Secrets-Management, Wiederanlauf-Überwachung und IAM sind offen.
3. Firestore und Airtable haben **keine gemeinsame Transaktion**. Vergleich + Airtable-Write muss zusätzlich gegen fremde gleichzeitige Änderungen und Fehler abgesichert werden. Insbesondere sind bei unklaren Netzwerkantworten ein unabhängiger Readback und menschliche Entscheidung nötig.
4. **Separate Zustell-/Bestätigungs-Outbox**: Belegarchiv (Drive), einmalige E-Mail-Bestätigung und Make-Onboarding erst nach nachgewiesener Synchronisation mit eigener Deduplizierung. Airtable-Feld `Online-Annahme Bestätigung gesendet am` bleibt unangetastet; `Online-Annahme Bestätigung in Bearbeitung` ist kein ausreichender global atomarer Schutz.
5. Kundenbezogene PDFs, AVV und Projektbedingungen RC1 benötigen weiterhin materielle/juristische Freigaben. Das aktuelle Cloud-Run-Preflight-Image und Render-Livesystem wurden nicht geändert. Echte Firestore-Staging-Schreibtests erst nach separater ausdrücklicher Autorisierung.

## Testbelege

- Synthetische Unit-Tests: `test/firestoreReconciliation.test.js`.
- Offizieller lokaler Firestore-Emulator auf GitHub Actions: `test/firestoreReconciliation.integration.test.js`, mit zwei unabhängigen Firestore-Clients, konkurrierenden Lease-Anfragen, dokumentierter Crash-Behandlung und späterer verifizierter Quittung.
- GitHub-Workflow: [lszh-firestore-emulator.yml](../.github/workflows/lszh-firestore-emulator.yml). Benutzt ausschliesslich das Firebase-Demoprojekt `demo-lszh-offers` und Loopback `127.0.0.1`, keine produktiven Cloud-Credentials. Letzter gültiger Ergebnislink wird im zentralen Projektstand festgehalten.

**Grenze:** Ein erfolgreicher Emulatorlauf ist kein erfolgreicher realer Airtable-Abgleich. Dieser Bericht ist eine technisch getestete Sicherheitsvorbereitung, keine Freigabe zum Echtbetrieb.
