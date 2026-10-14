# LSZH Automations – Rechnungsnummernregister (Vorbereitung, kein Echtbetrieb)

**Stand:** 14.10.2026 · **Status:** Test bestanden, Live-Ausgabe weiterhin gesperrt.

## Aufbau

- Airtable-Quelle: Base `appzJiskpAdaR1HEv`, Tabelle `tbl1jxu0ohCylb8cu` (`Rechnungen`), Feld `Rechnungsnummer`.
- Eigenes Make Data Store `218620`: **LSZH VORBEREITUNG – Nummernregister (NO LIVE-ISSUE)**.
- Schlüsseleindeutigkeit: `LSZH-REGISTER-V1-` + Unicode-NFKC-normalisierte, getrimmte, **grossgeschriebene** Rechnungsnummer. Zugelassen im Test nur `A-Z 0-9 _ -`, max. 50 Zeichen. Derselbe Schlüssel darf nie überschrieben werden (`overwrite=false`).
- **Historienübernahme (inaktiv):** Make `7957187`, on-demand; nur drei explizite Testdatensätze, Airtable GET → Nummer/RecordID prüfen → `datastore:AddRecord` → ReturnData.
- **Neue Nummer im Test reservieren (inaktiv):** Make `7957277`, on-demand; nur synthetische Nummer `TEST-LSZH-2026-000001` sowie drei vorhandene Testnummern für Kollisionsprüfung → GET via `filterByFormula` → kein Treffer, keine Pagination → atomare Data-Store-Reservierung ohne overwrite → ReturnData.
- Keine E-Mail, keine Rechnungsausstellung, kein Update bestehender Rechnungen, keine Buchung und keine produktive Freigabe.

## Historie im Register (4 Test-Schlüssel)

1. `LSZH-REGISTER-V1-AZ-20261008-Q0XP9K` – Airtable `rec1WNoZgjLOY08Wm` (Test-Anzahlung)
2. `LSZH-REGISTER-V1-SR-20261008-Q0XP9K` – Airtable `rec3tykWQLdw7aaCV` (Test-Schlussrechnung)
3. `LSZH-REGISTER-V1-TEST-QR-2026-001` – Airtable `recDMjk6CpxgZaKwG` (Technischer QR-Test)
4. `LSZH-REGISTER-V1-TEST-LSZH-2026-000001` – reservierter synthetischer Testkandidat ohne Rechnung.

Alle 3 zum Prüfzeitpunkt vorhandenen Airtable-Belege stammen aus Tests; dies ist **keine vollständige Suche historischer Firmenrechnungen ausserhalb dieser Airtable-Tabelle**. Vor einem echten Go-Live müssen sämtliche bisherigen Papier-, Excel-, Buchhaltungs- und sonstigen Rechnungssysteme geprüft und die verwendeten Nummern in die Sperrliste übernommen werden.

## Testprotokoll

Historische Migrationen erfolgreich:
- `bd3f24359e4246c388e9dc484a65ddeb` (AZ)
- `ddb8895c9d6a46c98ebf9f86e9f2f9b8` (SR)
- `cae7d2bc504e469bb8f0f6617b6fc441` (QR-Test)

Neue Nummer/Kollision:
- `2d97517cd01745b6b9fd799f20b98589` – vorhandene historische SR-Nummer von Airtable-Vergleich verweigert
- `30dbeccea7ec4c3fb5d0d604cfdea127` – neue Testnummer einmalig reserviert
- `aae678f03e7946bf80ed35d6c7780e24` – gleiche Nummer mit anderer Gross-/Kleinschreibung durch Data Store als Duplicate key gesperrt
- `cd6bd0e2f2a4414bab08c8b1351ae465` – unzulässiger Produktivnummern-Kandidat durch Allowlist abgewiesen

Nach den Tests beide Szenarien **inaktiv**; Data Store enthält vier geprüfte TEST-Keys. Der globale Airtable-Schalter `Rechnungsversand freigegeben` bleibt **false**.

## Vor der echten Nummernausgabe zwingend erforderlich

1. Gesamten historischen Nummernbestand vor Import verifizieren, nicht nur den aktuellen Airtable-Auszug.
2. Nummernschema, separate Belegarten (z. B. AZ/SR), lückenlose Kontrollierung und Rechts-/Buchhaltungsanforderungen festlegen; keine Rechnung stornieren und Nummer wiederverwenden.
3. Neue unbenutzte Nummer zuerst im zentralen Register atomar reservieren, **danach** Beleg erstellen; bei Fehler bleibt der Schlüssel reserviert und benötigt kontrollierte Klärung (kein blindes Retry).
4. Belege/Reservierungen mit unveränderlichen Quellen-IDs, Status, Ersteller, Zeitpunkt und Freigabeprotokoll verknüpfen. Der aktuelle leere, untypisierte Make Data Store speichert primär **nur die Schlüssel**; er ersetzt kein revisionsgeeignetes Audit.
5. Kollisionen bei unterschiedlichen Zeichen-/Unicode-Schreibweisen und gleichzeitigem Zugriff testen. Bei Airtable-Pagination bzw. Datenlücke immer fail-closed.
6. Vor tatsächlicher Rechnungsausstellung authentifizierte Einzelfreigabe, UID/MWST/IBAN, PDF-Archiv-SHA256 und Kundenberechtigung prüfen.
7. **Keine automatische E-Mail und kein Echtbetrieb ohne ausdrückliche Freigabe.** Legacy-Szenario `7781492` inaktiv/gesperrt; Freigabe-Vorprüfung `7956605` weiterhin `can_send=false` und eigene Nummerneindeutigkeitskontrolle aktuell absichtlich nicht als bestanden implementiert.

Diese Dokumentation beschreibt einen erfolgreich getesteten **Prototyp für historische Testnummern und atomare Schlüsselreservierung**, keine freigegebene produktive Rechnungsarchitektur.


## Automatisch generierte Testnummern mit separatem Audit (14.10.2026)

Die Architektur enthält zusätzlich:

- Airtable-Tabelle `tbleGuMXKhEjGP3wP` «Rechnungsnummern – Vergabeprotokoll TEST», Sequenz-Feld `fld3E3KBRWZO6Zm5O` als Airtable `autoNumber`; Status, Vorgang, erzeugte Nummer, Data-Store-Key und Prüfprotokoll. Seed `rec6Wx4flejD71JeH` für bestehende Test-Reservierung `000001`. Das **Autonummer-Feld ist hier ein technischer TEST-Nummern-Vorschlagsgeber**, keine rechtsverbindliche Rechnungsnummer.
- Data Store `218673` «LSZH TEST – Nummernvergabe Anfrage-IDs (Einmal)». Reserviert einmalig die Request-IDs, bevor ein auditierter Vorschlag erzeugt wird. Kein Overwrite.
- Make On-Demand-Szenario `7958235` «LSZH TEST – Automatische Rechnungsnummer + Audit (KEIN Versand)». Beschränkt auf genau zwei synthetische Test-Anfrage-IDs `DEMO-ISSUE-20261014-A`, `DEMO-ISSUE-20261014-B`. Schrittfolge: Input-Validierung → Request-Lock im Store 218673 → Airtable Audit-Datensatz anlegen (autoNumber) → `TEST-LSZH-2026-NNNNNN` ableiten → Airtable bestehende Rechnungsnummern prüfen (kein Offset, HTTP 200, null Treffer) → Audit «Nummer geprüft, Reservierung offen» → atomarer DataStore AddRecord im Nummernregister 218620, `overwrite=false` → Audit «Reserviert (nur TEST)» → ReturnData ohne Rechnung/Mail.
- Erfolgreiche Vergabe A: Make execution `06e29bcb5a6041cc9944614a58a44bc2`, Nummer `TEST-LSZH-2026-000002`, Register `LSZH-REGISTER-V1-TEST-LSZH-2026-000002`, Audit `recxAgO8sgqx7C3tz`.
- Wiederholter A-Antrag: `44b42561b5e04dba8de56bd8628e5e75`, `Duplicate key error` **vor** weiterer Nummerngenerierung.
- Erfolgreiche Vergabe B: `92bc25e36e194c8d9608ad4ea34f2214`, `TEST-LSZH-2026-000003`, Audit `recd6tAQchvvmNzQS`.
- Wiederholter B-Antrag: `52925e369ca0487a8f2034a0bb650751`, `Duplicate key error` vor nächster Nummer.
- Nicht erlaubte produktive Anforderung: `c7e1ce32df8d4b34b05bae5ce9477d9f`, abgelehnt durch strikte Test-Allowlist.

**Verified after tests:** Audit-Tabelle exakt 3 Einträge (Seed 000001, reserviert 000002 und 000003), Nummernregister Store 218620 sechs Testschlüssel (drei aus Airtable übernommene Nummern und drei TEST-LSZH Nummern), Request Store 218673 zwei Schlüssel. Szenario 7958235 nach erneutem Abschaltversuch **inactive**. Keine Kundenrechnungen, keine Rechnungsstatusänderungen, keine E-Mails, keine Zahlung. Globaler Sendegate false.

**Noch kein vollständiges revisionssicheres Produktionsaudit:**
- Bei Duplikat/ungültiger Anfrage vor Airtable-Log-Erstellung wird Ablehnung aktuell im **Make-Ausführungsverlauf** protokolliert, nicht als eigenständige Zeile der Audit-Tabelle. Ebenso kann bei Verbindungsfehlern nach einer Request-Reservierung ein manueller Abgleich notwendig werden.
- Wenn der Nummern-Data-Store erfolgreich reserviert, aber Airtable-PATCH danach scheitert, verbleibt ein unfertiger Audit-Eintrag (fail-closed). Kein automatischer Neuversuch. Solche Zustände müssen in einer zukünftigen manuellen Recovery-Funktion abgeglichen werden.
- Airtable Autonumber erzeugt fortlaufende interne Datensatznummern, aber keine **lückenlos garantierte** Geschäftsnummernfolge; Stornos und fehlgeschlagene Versuche benötigen explizite Nachverfolgung.
- Für Echtbetrieb: alle bisherigen Rechnungsquellen verifizieren, Testdaten/Testnummern-Domain trennen, vollständiges unveränderliches Event-Log samt Fehler-/Abbruchpfaden, atomare Freigabe/Sendegates und Authentifizierung entwickeln. Produktiver Rechnungsversand bleibt deaktiviert.
