# LSZH Automations – RC1-Vertragsabgleich & synthetische Annahmeprüfung

**Stichtag:** 14.10.2026 · **Arbeitsstatus:** STAGING / **KEIN** Rechtsgutachten, **KEINE** juristische Freigabe und **KEIN** echter Vertragsabschluss.

## 1. Dokumentenbasis

Originale in ChatGPT-Library wiedergefunden und textlich vollständig geprüft:

- **Projektbedingungen v1.0 RC1, Freigabeentwurf 13.10.2026**, 4 Seiten / 16 Abschnitte; Quellen `LSZH_Projektbedingungen_v1_0_RC1_Freigabeentwurf.pdf` und `.docx`. Originale unverändert, Aufdruck „nicht zur Kundenverwendung“.
- **AVV v0.9 RC1, Freigabeentwurf 13.10.2026**, 6 Seiten / 12 Abschnitte mit Anlagen A (Datensteckbrief), B (TOM), C (Unterauftragsbearbeiter); Original unverändert. Entscheidung des Geschäftsführers vom 14.10.2026: **intern provisorisch als Arbeitsgrundlage akzeptiert**, nicht extern oder juristisch freigegeben.
- **Geschäftsbedingungen-Entscheidungsblatt RC1, 13.10.2026**, 1 Seite, die nachstehenden drei geschäftlichen Fragen noch offen lässt.

Die Originaldokumente werden **nicht** in den echten Freigabeordner als abschliessende Version eingespielt. Zwei Test-PDFs sind ausdrücklich **fiktiv / TEST ONLY / keine rechtliche Wirkung**.

## 2. Inhaltliche Prüfung und Entscheidungen

| Thema | Projektbedingungen RC1 | AVV RC1 / Technik | Stand / Empfehlung |
|---|---|---|---|
| Rechtsträger / Marke | LSZH Invest GmbH, handelnd als LSZH Automations | AVV nennt dieselbe LSZH Invest GmbH | Adress-/UID-/MWST-/Kontaktangaben vor Endfassung offiziell bestätigen; Name LSZH Automations nicht als eigenständige GmbH ausgeben |
| Dokumentenrangfolge | Offerte/Einzelabrede, projektspezifischer Anhang/AVV, allgemeine Bedingungen | AVV geht für Auftragsbearbeitung allgemeinen Bedingungen vor | **Konsistent**. Prüfen, ob besondere Offertenabrede zwingende Datenschutzpflichten überlagern könnte – Formulierung in Endfassung präzisieren |
| Online-Annahme | Nachweisbare ausdrückliche Annahme durch vertretungsberechtigte Person löst Vertrag aus | AVV verlangt eigene nachweisbare Zustimmung, wenn Auftragsbearbeitung relevant | **Lücke:** aktueller Angebotslink prüft nur Offerte + Projektbedingungen. AVV-Version/Anlagen/Herkunft/Kundenzustimmung gesondert einbeziehen oder vor dem ersten entsprechenden Datenzugriff separat unterzeichnen; keine implizite AVV-Genehmigung |
| Make-Kundeneigentum | Kunde besitzt/verwaltet Make-Organisation, Einladung an `lars@lszh-automations.ch` mit wenigsten Rechten | AVV gleicher Ansatz, sensible Credentials nicht in E-Mails | **Konsistent**, tatsächliche Rollen, Datenspeicher und Anbieter nach Anlage C erfassen |
| Care-Kündigung | 30 Kalendertage zum Monatsende bei Care ohne Mindestlaufzeit | AVV-Ende und Rückgabe/Löschung hängen von konkretem Vertrag ab | **Geschäftsentscheid offen**, Rechtsprüfung des gemischten Vertrags/Art. 404 OR erforderlich |
| Werkabnahme | 10 Arbeitstage zur Prüfung, keine fiktive Abnahme allein durch Schweigen | Nicht mit Abschluss der Online-Offerte gleichsetzen | **Geschäftsentscheid offen**, Abnahmeprotokoll und Fristbeginn präzisieren |
| Haftung | Leichte Fahrlässigkeit: Vergütung der letzten 12 Monate je betroffene Leistung, mindestens CHF 2'000 | Haftungsregel darf Datenschutz-/zwingendes Recht nicht umgehen | **NICHT freigegeben**; Versicherungsumfang, Beispielschäden, betroffene Leistung und gesetzliche Unabdingbarkeit juristisch prüfen |
| Drittanbieter / Datenregion | Kunde zahlt Drittanbieter grundsätzlich selbst, Datenregion nach Absprache | Anlagen A/C verlangen konkrete Regionen, Empfänger, Rollen und Genehmigungen | **Offen pro Kunde**, inkl. Make, Airtable, Google, Render und allen tatsächlich eingesetzten KI-Diensten |
| Datenschutz / Vorfälle | AVV vor Datenzugriff; zusätzliche Massnahmen bei erhöhtem Risiko | Vorfallmeldung so rasch als möglich, 24 Stunden interner Zielwert | **Konsistent als Grundsatz**; Einsatz-/Erreichbarkeit und tatsächliche TOM nachweisbar machen |
| Übergabe/Löschung | Zugriffsrechte entfernen, Kundendaten grundsätzlich im Kundenkonto | Anlage A muss Fristen, Backups, Rückgabe/Löschung pro System bestimmen | **Offen**, technische Übergabe- und Löschtests vor Livebetrieb |
| Dokumentenbeweis | Einsehbare und speicherbare Vertragsfassung mit Datum | Beide Dokumente und Zustimmung getrennt belegbar | Archiv-Belege mit SHA-256, unveränderter Fassung, Zeit/Identität/Versionsstand verknüpfen; Drive-Schreibschutz **kein** revisionssicheres WORM |

### Geschäftliche Entscheide für Geschäftsführer

1. **D1:** Care-Kündigung `30 Tage auf Monatsende` – derzeit nicht bestätigt.
2. **D2:** Abnahmefrist `10 Arbeitstage, ohne automatische Schweigeabnahme` – derzeit nicht bestätigt.
3. **D3:** Haftungsbegrenzung `12 Monate Entgelt, mindestens CHF 2'000` – ausdrücklich nicht als final behandeln.

**Wichtig:** Die interne provisorische AVV-Zustimmung gilt **nicht** als Geschäftsentscheid zu D1–D3 oder als Freigabe der Projektbedingungen.

## 3. Synthetische End-to-End-Integritätstests (Make + Google Drive)

Alle Tests ausschliesslich in deaktivierbaren **isolierten On-Demand-Szenarien** unter der geschäftlichen Google-Verbindung, im vorhandenen Geschäfts-STAGING-Ordner. Keine echte Kundenadresse, keine Mail-Module, keine echten Angebotssätze und keine Airtable-Vertragsstatusänderung.

### A. Zwei voneinander verschiedene fiktive PDFs erzeugen und archivieren

**Make `7963939`**, Lauf `3883905500e2401b8a6e5cbb3785c855`, **SUCCESS**:
- Fake-Offerte als Google Doc erstellt, PDF exportiert, in Geschäfts-Staging hochgeladen, erneut gelesen, schreibgeschützt, Metadaten kontrolliert.
- Andere Fake-Projektbedingungen separat ebenso erstellt, archiviert und verifiziert.
- Testdateien ausdrücklich als `TEST_ONLY_*` benannt und als rechtlich unwirksam beschriftet.
- Fiktive Offerte: **36'691 Bytes**; fiktive Projektbedingungen: **38'877 Bytes**. Verschiedene SHA-256-Prüfsummen, beide 64 Hex-Zeichen; beide im richtigen Geschäfts-STAGING-Elternordner, PDF MIME-Type und Content Restriction `readOnly=true`.
- 15 Make-Module ohne Fehler; Testscenario anschliessend **inaktiv**.

### B. Sicherer Vorabcheck beider PDFs (nur lesend)

**Make `7963965`**:
- `8ac8f8749b584daa8b606c35987eb9c1`: korrekte zwei Testdateien ⇒ **PASS / docs_verified=true**.
- `374e2d53d9f94f1ca7f8c04974f99616`: absichtlich falscher Offerten-Hash ⇒ **HASH_MISMATCH**.
- `6024c0ed0d844c5fbec7ddd5e25b6d58`: vertauschte Testdatei-IDs ⇒ **HASH_MISMATCH**.
- `cff9efc1cea64d4b9386e81c2c77e0f3`: identische Datei als Offerte und Bedingungen ⇒ **NON_DISTINCT_FILES**.
- Alle Läufe **SUCCESS**, negative Ergebnisse bewusst als geschäftliche Ablehnung zurückgegeben. Immer `contract_enabled=false` / `customer_email_enabled=false`. Testscenario danach **inaktiv**.

### C. Fiktiver Annahmenachweis (kein tatsächlicher Vertrag)

**Make `7963993`**:
- `3e4aeafcec4a4a63bbd3dcbf4be39350`: beide synthetischen Dokumente gelesen, Metadaten und SHA abgeglichen, **fiktiven** Google-Doc-Annahmenachweis mit ausdrücklichem `KEIN VERTRAG`-Vermerk erstellt, als PDF exportiert, ins Geschäfts-STAGING hochgeladen, schreibgeschützt, SHA-256 und Ordner geprüft ⇒ **SUCCESS / archive_ok=true / actual_contract=false / email_sent=false**.
- `985c994248484517bce0f8c4b90ecfe0`: absichtlich falscher Hash ⇒ **ERROR im Code-Prüfmodul 6** mit `TEST_ONLY_PDF_SHA256_MISMATCH`. Ausführungsprotokoll zeigt keinen Schritt zur Erzeugung oder Speicherung eines Annahmenachweises danach.
- Szenario unmittelbar anschliessend **inaktiv**.

### D. Grenzen dieser Tests

**NICHT** als vollständige juristische/produktive End-to-End-Abnahme zu verstehen. Noch offen:
- Öffentliche Website / Online-Button / Webhook / Token-Erzeugung / Ablauf / Befugnisnachweis sowie SHA-/Status-Verknüpfung zu realen Offerten.
- Abbruch und Wiederaufnahme nach Belegerstellung, aber vor Versand bzw. Abschlussstatus: Produktion `7940220` kann bei E-Mail-Fehler nach der Belegerstellung mit `Bestätigung in Bearbeitung` hängen bleiben. Fehler-/Retry- und Reconciliation-Prozess gesondert testen und absichern.
- AVV als drittes erforderliches Dokument je betroffenem Kundenprojekt, mit ausgefüllten Anlagen A–C und überprüfbarer Zustimmung.
- Echtes Dienstkonto, endgültige Geschäftskonto-Unterordner, Zugriffs-/Retention-/Backup-/WORM-Entscheid, juristische Prüfung.
- Endgültige Projektbedingungen v1.0, gültige PDF mit Archiv-ID/Hash, tatsächlicher rechtlicher Freigabe; keine fiktive Datei als Ersatz.

## 4. Produktionssperre unverändert

Make-Produktionsvorbereitung `7835460` (Offerten-PDF/Versand), `7940261` (Annahmelink) und `7940220` (Annahmebeleg) bleiben **INAKTIV**. Harte `0=1`-Filter auf Produktiv-/Versandmodulen bestehen; Airtable `Online-Annahme rechtlich freigegeben` bleibt NEIN. Keine Kundenmails, Einladungen, echten Vertragsabschlüsse oder operative Aktivierungen.

**Freigabestatus:** Technische Teilstrecke zu Archiv/Hash/Schreibschutz/**fiktivem** Annahmenachweis erfolgreich getestet. RC1-Vertragstexte nur geprüft, **nicht** extern freigegeben.


### Klarstellung 14.10.2026 – D1–D3 geschäftlich bereits definiert
Auf ausdrücklichen Hinweis des Geschäftsführers sind **D1–D3 keine erneut zu entscheidenden Geschäftsfragen**. Die bereits erarbeiteten Geschäftsparameter gelten für die weitere interne Vertragserstellung als **festgelegt**:
- **D1 Care-Kündigung:** 30 Kalendertage auf Monatsende, soweit keine abweichende Mindestlaufzeit vereinbart; zwingende Rechte (insbesondere ggf. Art. 404 OR) vorbehalten.
- **D2 Abnahme:** Prüfung innerhalb von 10 Arbeitstagen, **keine** fiktive Abnahme allein durch Schweigen.
- **D3 Haftung:** Bei leicht fahrlässig verursachten unmittelbaren und vorhersehbaren Vermögensschäden Entgelt der betroffenen Leistung der letzten 12 Monate, **mindestens CHF 2'000**, soweit wirksam und angemessen; Vorsatz, grobe Fahrlässigkeit und zwingende Haftungsgrenzen nicht ausschliessen.
**Status-Trennung:** Geschäftliche Eckwerte **definiert**; juristische Angemessenheit/Wirksamkeit **ungeprüft bzw. offen**; RC1-Dokumente und tatsächlicher Kundeneinsatz **nicht final freigegeben**. Alte Einträge «D1–D3 Geschäftsentscheid offen» sind **historischer Prüfstand** und durch diese Klarstellung überholt. Kein zusätzlicher Freigabe- oder Versandautomatismus, Make-Sperren unverändert. Es wird nicht nochmals nach denselben Eckwerten gefragt.
