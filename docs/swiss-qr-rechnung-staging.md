# LSZH Swiss-QR-Rechnung – Entwicklungsstand 14.10.2026

**Nur Entwicklungszweig / Draft, NICHT produktiv.** Kein Merge, kein Render-Deployment und kein Versand an Kunden.

## Ausgangslage
- Firmenkonto LSZH Invest GmbH, reguläre CH-IBAN `CH51 0076 1648 6076 7200 2`; keine QR-IBAN, daher Referenztyp **SCOR** (ISO 11649).
- Schweizer Zahlteil: 210 × 105 mm (Empfangsschein 62 mm, Zahlteil 148 mm), am unteren Rand der zweiten A4-Seite; Swiss QR-Code 46 × 46 mm ohne Quiet Zone, zusätzlich mindestens 4 Module Quiet Zone (empfohlen 5 mm), Schweizer Kreuz 7 × 7 mm; Fehlerkorrektur M.
- Swiss Payments Code `SPC\n0200\n1`, total 31 Pflichtzeilen bis `EPD`, strukturierte Adresstypen `S`.
- Vor Go-Live bankseitige Scan- und Layout-Prüfung sowie manuelle juristische/rechnerische Endkontrolle.

## Neue Dateien (Draft)
- `lib/swiss-qr.js`: Validierung einer regulären CH-IBAN, deterministische ISO-11649-Prüfziffer, Swiss Payments Code mit SCOR und strukturierten Adressen. SCOR-Key aus `SHA256('LSZH-SCOR-v1:' + Rechnungsnummer)` – Rechnung eindeutig über gespeicherte SCOR referenzieren.
- `lib/invoice-pdf.js`: Renderer der A4-Rechnung mit QR-Zahlteil auf Seite 2. QR-Code und Swiss Cross als Vektorgrafik.
- `test/swiss-qr.test.js`: Unittests für IBAN, Prüfziffern, strukturierte Felder und Nichtzahlbar-Test.
- `server.js`: neue private Route `POST /api/internal/invoices/qr-pdf`; **standardmässig deaktiviert**.
- `package.json`: optionale QR/PDF-Dependencies für die neue Funktion.

## Sicherheit des Endpoints
Die Route reagiert ausschliesslich wenn **beide** geheimen Render-Variablen gesetzt sind:
- `SWISS_QR_BILL_ENABLED=true` (noch nicht setzen)
- `SWISS_QR_BILL_API_KEY=<mindestens 32 Zeichen>` (nur Render-Secret, nie in GitHub/Airtable)

Server-to-server-Anfrage mit Header `X-LSZH-Invoice-Key`; PDF-Response mit `X-LSZH-SCOR-Reference`, `Cache-Control: no-store`. Keine Cloud-QR-Drittanbieter. Die Website-Privatsperre `SITE_PRIVATE` greift derzeit vor der Route; dies vor Integration gesondert prüfen.

### Beispiel für den *späteren* internen Make-Aufruf
```http
POST /api/internal/invoices/qr-pdf
Content-Type: application/json
X-LSZH-Invoice-Key: <geheimer Make-Connection-Wert>
```
```json
{
  "invoiceNumber": "RE-2026-001",
  "amountCHF": "1250.00",
  "invoiceDate": "14.10.2026",
  "dueDate": "28.10.2026",
  "description": "Automationsprojekt gemäss Auftrag",
  "debtor": {"name": "Beispielkunde AG", "street": "Teststrasse", "number": "7", "postal": "5610", "city": "Wohlen", "country": "CH"}
}
```
Die obigen Werte sind reine Beispieldaten. **Nicht jetzt über öffentliche Infrastruktur testen.**

## Make-Integration – noch NICHT vorgenommen
Das bestehende inaktive Rechnungs-Szenario **7781492** erzeugt derzeit die Google-Docs-PDF mit einem QR-Platzhalter. Nach erfolgreichem eigenständigem Test wird es umgebaut:
1. Airtable sucht **nur** explizit echte, versandbereite Rechnungen und nur mit aktivem QR-Prüfstatus / Freigabe.
2. Einen autorisierten Make-HTTP-Aufruf an die geschützte interne Rechnungs-PDF-Route ausführen, mit den strukturierten Debitor-Feldern. API-Schlüssel in Make-Verbindung/Keychain verwahren, nicht als Klartext im Scenario-Mapper.
3. PDF-Bytes erst im **geschäftlichen Echtbetrieb-Rechnungsordner** `1aHgvFaY68W_BfRrniY_TvGgKDogBIIK2` archivieren.
4. `X-LSZH-SCOR-Reference` und resultierende Google-Drive-Datei-ID in Airtable Rechnungen speichern (neue Felder `SCOR-Zahlungsreferenz`, `Rechnungs-PDF Archiv-ID`). Referenzen müssen eindeutig sein, Kollisionen verhindern.
5. QR-Metadaten, PDF-Hash, MIME und Zugriffsrechte prüfen; erst danach an den Kunden per Mail versenden und anschliessend den Status in Airtable markieren.
6. Bei Fehler: Kein Versand, kein falscher `PDF gesendet`-Status, klare interne Eskalation. Idempotenz (doppelte Runs) absichern.

## Noch offen / No-Go
- Node-Version/Dependencies in isolierter Render Preview installieren und **echte PDF-Ausgabe** testen. Die Python-Musterrechnung wurde bereits mit OpenCV erfolgreich ausgelesen; sie ist **keine** Validierung der Node-Route.
- SIX-QR-Referenz, Schweizer Kreuz, Abmessungen, Layout, strukturierte Adressen und Betragsgenauigkeit mit Bank-App und Druck-Test bei **100 %** prüfen.
- Bei echtem Zahlungseinzug testen, ob die AKB SCOR in CAMT / CSV zuverlässig ausliefert, bevor automatische Bankzuordnung zugesagt wird.
- Firmenkonto-Berechtigungen, Datenschutz, QR-Rechnungsformat und korrekte Empfängerangaben abschliessend prüfen.
- Rechnungsentwurf enthält bis zur produktiven Umstellung weiter den QR-Platzhalter. `Rechnungsversand freigegeben` bleibt **false**, alle betroffenen Make-Szenarien **inactive**.
- Bestehende Altbestands- und Testrechnungen bleiben unverändert.

## Autoritative Grundlagen
- https://www.six-group.com/de/products-services/banking-services/payment-standardization/standards/qr-bill.html
- https://www.six-group.com/dam/download/banking-services/standardization/qr-bill/ig-qr-bill-v2.3-en.pdf
- https://www.six-group.com/dam/download/banking-services/standardization/qr-bill/style-guide-qr-bill-en.pdf

## Make-Test der SCOR-Referenz (14.10.2026)
- Isoliertes On-Demand-Szenario **7944047** „LSZH TEST – SCOR-Referenz für QR-Rechnungen (kein Versand)“ angelegt.
- Ein Make Code JavaScript-Modul berechnet denselben SHA256-basierten ISO-11649-SCOR-Wert wie `lib/swiss-qr.js`; kein Mailversand, keine Kundenverträge.
- Test-Eingabe `SR-20261008-q0xp9K` ergab `RF17LSZH69FAEF66BED4FA21` und `checksum_valid=true`. Unabhängige Node-Referenzimplementierung und Mod97-Abgleich stimmen exakt überein.
- Nach der Testausführung wurde das Make-Szenario wieder **deaktiviert**.
- Dies belegt die Referenzberechnung in Make, **nicht** den finalen PDF-Renderer oder die bankseitige Einlesung.

## Vollständiger GitHub-Node-PDF-Test – 14.10.2026

- CI-Workflow `.github/workflows/swiss-qr-staging.yml` wurde im Draft-Branch eingerichtet, installiert `pdfkit`, `qrcode` und PDF-Inspektionswerkzeuge, führt alle Node-Tests sowie echten PDF-Erzeugungs- und QR-Rücklesetest aus.
- **Grüner GitHub Actions Testlauf**: https://github.com/lszh-automations/lszh-automations-site/actions/runs/38488528625 (Job erfolgreich).
- `npm test`: **7/7** bestanden, einschliesslich PDF-Renderer und negativen Tests (CHF-Betrag in als nicht zahlbar markiertem Test blockiert).
- Das Node-Programm `scripts/qr-smoke.js` erzeugte `LSZH_QR_Staging_Nicht_Zahlbar.pdf` mit **2 A4-Seiten**, 10'650 Bytes und Test-Referenz `RF13LSZH8AE1F7308D00155A`.
- `pdfinfo`: 2 A4-Seiten (595.28 × 841.89 pt); der QR-Code wurde aus der gerenderten PDF mit OpenCV tatsächlich dekodiert, **31 Swiss-QR-Felder** und CHF 0.00 geprüft, `NICHT ZUR ZAHLUNG VERWENDEN` vorhanden.
- Die gerenderte Seite 1 und Seite 2 wurden zusätzlich visuell kontrolliert: sichtbare Musterrechnung, QR-Zahlteil, Empfangsschein, Schweizer Kreuz und Testhinweis, keine offensichtliche Textabschneidung.
- Zweiter isolierter Make-Test `7944507` führte einen vollständigen synthetischen Swiss-QR-Datensatz mit 31 Feldern, gültiger SCOR- und IBAN-Prüfung, CHF 0.00 und ausdrücklichem Testhinweis aus, Status erfolgreich; Make-Szenario nach Run wieder deaktiviert.
- **Noch nicht ausgeführt**: Staging-Render-Deployment, Bank-App-Scan, produktiver Make-Rechnungsablauf, Echtbetrag und reale Kundendaten. Keine Kundenmail gesendet. Draft nicht mergen.
- Render-Konto hat derzeit nur Workspace `My Workspace` mit Login `lars.schulthess10@gmail.com`. Render-Tool verlangt ausdrücklich die Auswahlbestätigung des Nutzers, bevor wir diesen Workspace für Services verwenden; daher **kein Render-Service erstellt**. Geschäftliches Google-Drive-Konto `lars@lszh-automations.ch` bleibt separat, unverändert.
