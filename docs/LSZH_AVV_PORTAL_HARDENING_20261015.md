# LSZH – AVV-PDF und Annahme-Endpunkt (Entwicklungsprüfung 15.10.2026)

**Keine produktive Freigabe, keine vertragswirksame Annahme, kein Deployment und keine Live-Cloud-Schreibzugriffe.** Änderungen ausschliesslich auf `feature/firestore-staging-dryrun-20261015`.

## Verifizierte Airtable-Quellfelder

Business Base `appzJiskpAdaR1HEv`, Tabelle Offerten `tbljeIUoD7wwKuSmS`, nur Schema lesend geprüft:

- `AVV erforderlich` – singleSelect (Airtable REST: `Ja` / `Nein`).
- `Online-Annahme AVV Drive ID` – singleLineText.
- `Online-Annahme AVV-SHA256` – singleLineText.
- `Online-Annahme AVV-Version` – singleLineText.
- `Online-Annahme AVV ausdrücklich akzeptiert` – checkbox, bisher nicht automatisch geschrieben.
- Vorhandene Offerten-/Bedingungen-Archivfelder, Freigaben, Zeitstempel und Token-Hash bleiben dieselben.

**Keine Airtable-Felder angelegt, keine Datensätze verändert.** Unbekannter/leerer AVV-Modus wird serverseitig abgewiesen.

## Implementiert (nur Entwicklungszweig)

1. `offerArchiveVerifier.js`: `verify(fields)` prüft bei `AVV erforderlich=Ja` **drei** private Archiv-PDFs; ohne AVV nur die bisherigen zwei. Die AVV erfordert eine gültige Drive-ID, SHA-256, PDF-MIME, Datei nicht im Papierkorb, aktiven Bearbeitungsschutz und gültige Grösse. Der geschützte `pdf(fields,'avv')`-Download ist nur bei `Ja` möglich; Byteinhalt wird SHA-256-geprüft. Schreibschutz ist **nicht** WORM.
2. `offerAcceptance.js`: Die Vorprüfung verlangt bei AVV=Ja die AVV-Metadaten, gibt `avv_required`, `avv_version`, `avv_sha256` zurück. Der Dokumentendpunkt kann AVV nur zu einer ausdrücklich AVV-pflichtigen berechtigten Offerte anbieten. Bei einem hypothetischen Annahmeversuch sind separate AVV-Einwilligung und Hash-Match erforderlich; unmittelbar vor einem Commit müssen alle PDF-Bytes via Drive-Archivprüfung geprüft werden.
3. **Harte Sicherheitsänderung:** Vorheriger direkter Airtable-`PATCH` auf Status `Angenommen` entfernt. Ohne injizierte `commitAtomic`-Funktion gibt `/api/offer/accept` **503 `not_available`** zurück, selbst wenn das alte `OFFER_ACCEPTANCE_ENABLED` irgendwann auf `true` gesetzt würde. Es gibt in `server.js` **keine** solche Injektion. Daher bleibt die Vertragsannahme im tatsächlichen Integrationsstand gesperrt.
4. Der zukünftige `commitAtomic`-Adapter müsste zwingend Firestore-Transaktionen ausführen und erst danach idempotente Airtable-/Make-Reconciliation veranlassen. Die positive Unit-Test-Injektion ist **nur ein Teststub**, kein produktiver Adapter.
5. `offerte-annehmen/index.html` zeigt AVV-Download und eine eigene unmarkierte Pflichtcheckbox nur bei `avv_required=true`. Der POST übermittelt `accept_avv` und `avv_sha256`. Ohne AVV bleiben die zusätzlichen Felder ausgeblendet.

## Validierung

- **Bestanden:** JavaScript-Syntaxprüfung für `offerArchiveVerifier.js`, `offerAcceptance.js`, beide Unit-Testdateien, HTML-Inline-Skript und vorhandene Firestore-Komponenten. Quellstand wurde nach GitHub-Schreibzugriff erneut aus GitHub abgerufen.
- **Tests ergänzt:** AVV-Dokument mit korrekt gesperrten und unveränderten Bytes, fehlende/manipulierte AVV, unbekannter AVV-Modus, fehlende Einwilligung, geänderte Dokumenthashes, keine direkte Airtable-Schreibung, fehlende atomare Injektion, kein E-Mail-Versprechen.
- **Noch nicht ausgeführt:** Alle neuen Unit-Tests in einer echten Node.js-Laufzeit / GitHub Actions. CI `.github/workflows/offer-acceptance-check.yml` führt bei passendem Pull Request `npm test` aus. Syntaxprüfungen allein belegen kein korrektes Laufzeitverhalten.
- **Nicht geprüft:** Render-Live-Deploy, auslieferbare Website, echte Google-Drive-Zugriffsrechte des Website-Dienstkontos, Firestore-Transaktionsadapter, übergreifender Parallel-/Fehler-Test und reale E-Mail-Module.

## Vor einem späteren Staging-Integrationstest

1. Sichere Identität zwischen Website-Host und Google Cloud entscheiden; bevorzugt ohne exportierte langlebige Dienstkonto-Schlüssel. Kein öffentlicher Firestore-Schreibendpunkt ohne starke Authentifizierung und Replay-Schutz.
2. `commitAtomic` als echte idempotente, transaktionale Funktion in benannter Firestore-Datenbank implementieren. `firestoreAcceptanceState.js` ist zurzeit nur ein isolierter synthetischer Transaktionskandidat und benötigt noch einen echten Adapter und Datenzuordnung.
3. Vertrags-/AVV-Dokumente in der jeweiligen kundenbezogenen finalen Version rechtlich prüfen und die unveränderten PDF-Bytes sowie Archiveigentum verifizieren. RC1 ist **nicht** juristisch freigegeben.
4. Reconciliation zu Airtable/Make nach atomarem Abschluss mit Wiederanlaufkonzept; AVV-Zustimmung in `Online-Annahme AVV ausdrücklich akzeptiert` nur bei tatsächlich belegter Annahme setzen.
5. Erst separate ausdrückliche Erlaubnis für **synthetische Staging-Schreibtests**, danach technische und juristische Abnahmen; niemals aus einer Designvorschau einen echten Vertrag machen.

**Wichtig:** `OFFER_ACCEPTANCE_ENABLED` allein reicht in diesem Entwicklungszweig bewusst nicht mehr aus, um zu schreiben oder einen Vertrag anzunehmen.
