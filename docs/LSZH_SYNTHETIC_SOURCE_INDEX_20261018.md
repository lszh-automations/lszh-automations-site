# LSZH Automations – G3 Quellindex Airtable → Firestore (synthetischer Emulator)

**Stand 18.10.2026. Nur lokaler Firebase-Firestore-Emulator, kein Echtbetrieb, kein Make-Deployment und keine Live-Datenmigration.**

## Begründung

Die vorhandene Airtable-Offerte verwendet eine Airtable-Record-ID im Format rec..., die interne Firestore-Akte liegt dagegen unter dem SHA-256-Hash eines Einladungs-Tokens. Make darf den privaten Firestore-Tokenhash nicht übergeben oder zurückerhalten. Ein blosser Filter über den Quell-ID-Feldwert bietet ohne atomare Eindeutigkeitsregel keine zuverlässige Zuordnung und erschwert das sichere Reservieren vor dem Google-Docs-Modul 5.

## Neu implementierte lokale Zuordnung

- Quellindex-Collection `lszh_staging_source_index_v1`; Dokument-ID = SHA-256 über festes Namespacekennzeichen, geprüfte Airtable-Base, geprüfte Tabelle und synthetische `sourceRecordId` (mit eindeutigen Separatoren).
- Indexdatensatz enthält `schemaVersion`, `purpose`, `sourceBaseId`, `sourceTableId`, `sourceRecordId`, `tokenHash`. `tokenHash` ist ein **interner privater Indexwert** und wird nicht in die Make-Antwort gespiegelt; ein Hashwert allein ist kein Berechtigungsnachweis.
- `seedOnlyLocalEmulator` aus dem bestehenden `airtableSyntheticImport.mjs` verwendet jetzt `registerSyntheticSourceLocalEmulator`. Diese Funktion prüft das synthetische Angebot und erstellt Index + Offer **in einer einzigen Firestore-Transaktion**; beide `get`-Operationen erfolgen vor beiden `create`-Operationen.
- Gleiche unveränderte Quelle und Offerte: `already_identical`. Derselbe Quellrecord mit anderem Tokenhash, ein verwaister Index, ein altes Offer ohne Index oder eine abweichende Offerte: `seed_conflict` und keine neue zweite Zuordnung.
- Frühere, ohne den Index angelegte Emulator-Offerten werden **nicht stillschweigend migriert oder rückwirkend eindeutig erklärt**. Der Index schützt ausschliesslich Schreibzugriffe, die ihn tatsächlich verwenden. Vor einem späteren Betriebsmodell wären Bestandsabgleich, Migration und definierte Verarbeitungsrollen separat nötig.

## Neue interne Nachschlage- und Reservierungsfunktion

`resolveAndReserveSyntheticMakeLocalEmulator(db,payload,now)` akzeptiert den bekannten Make-synthetischen Vertrag. Nur auf dem lokalen Demo-Projekt kann sie (1) den indexierten Quellrecord anhand der exakt fixierten Base/Tabelle nachschlagen, (2) die verknüpfte Firestore-Offerte **innerhalb derselben Transaktion** lesen, (3) Herkunft, Quell-ID, Tokenhash, synthetischen Annahmenachweis und Request-Key abgleichen und (4) höchstens einen `receiptReviewLock` schreiben. Antworten an Make enthalten keine Tokenhashes/Firestore-Pfade und lauten auch bei gewonnener Reservierung `STOP_REVIEW_ONLY` mit sämtlichen Docs-/Drive-/Airtable-/Mail-Aktionsflags `false`.

Die Methode hat **keinen HTTP-Endpunkt**. Sie hat keine Authentisierungs-/Netzwerkintegration und ist in Cloud Run technisch blockiert. Eine interne Make-API oder eine produktive Schreibfreigabe wurde nicht geschaffen.

## Nachweise und Restgrenzen

Offline-Test `test/offerSyntheticSourceIndex.test.js`: ID-Berechnung, feste Herkunft, harte Ablehnung ausserhalb des Emulators.

Emulator-Test `test/offerSyntheticSourceIndex.emulator.test.js`: AVV Ja/Nein, erneute identische Seed-Anfrage, danach echte synthetische Firestore-Annahme und zwei konkurrierende Make-förmige Reservierungsanfragen, parallele unterschiedliche Tokenhashes derselben Airtable-ID, altes Offer ohne Index, fehlende/manipulierte Zuordnung und genaue Testdatenbereinigung. Bestehende Import-/HTTP-E2E-Tests räumen nach erfolgreicher Seed-Anfrage Offer und Index auf.

Vor echten Kunden sind gesondert zu lösen: eindeutiger produktiver Quellindex inklusive Legacy-Akten und Lösch-/Wiederherstellungssemantik; prinzipalgebundene interne Make-Authentisierung; atomar autorisierter Claim **vor** Google Docs; belastbarer Drive-PDF-/ID-/SHA-Abgleich; providerseitige Mail-Deduplizierung; juristische RC1-/AVV-Freigabe, Datenschutz und Betriebs-/Kostenfreigabe.

**Pilot G3/G5/G6 bleiben für die echte Make-/Firestore-/Drive-Verarbeitung NO-GO.**
