# LSZH – Firestore-STAGING: synthetische Testofferte (15.10.2026)

**Nur technische Vorarbeit. KEIN echter Vertrag, KEINE produktive E-Mail, KEINE Annahme und KEIN Cloud-Schreibvorgang.**

## Testdatensatz

- Fixture-ID: `LSZH-STAGING-20261015-001`
- Offerte: `DEMO-OFF-20261015-001`
- Empfängerfirma: `Demo Hydraulik AG` (frei erfunden)
- Interne Testadresse: `lars@lszh-automations.ch`
- AVV erforderlich: Ja (Drei-Dokumente-Pfad)
- Beträge nur fiktiv, keine Forderung
- Drei getrennte A4-PDFs mit deutlicher TEST-/KEIN-VERTRAG-Markierung
- Synthetische PDF-Texte sind **nicht** die RC1-Originale; die Projektbedingungen und AVV dienen nur dem technischen Test.

## Ergebnis der lokalen Nachprüfung

- Drei PDFs byteweise anhand des Manifestes überprüft: PDF-Signatur, A4, Seitenzahl, Größe und SHA-256 stimmen.
- 14 reproduzierbare, offline laufende Prüfungen bestanden; insbesondere verfälschte Hashes, falsche E-Mail-Adresse, fehlende AVV, Dubletten-PDF, geöffnete rechtliche Freigabe und Import-Gate zurückgewiesen.
- Frühere Prüfung verlangte eine lokale Token-Klartextdatei, die bewusst nicht Teil des ZIP war. Testlogik korrigiert: Ein temporär erzeugter Token beweist nur den Algorithmus. Der im Manifest vorhandene alte Token-Hash ist **nur ein Formatwert ohne noch testbaren Klartext**; für spätere E2E-Prüfung muss serverseitig ein neuer Token ausgegeben werden.
- Verteiltes Testpaket: `LSZH_Firestore_Staging_Testpaket_V2_20261015.zip` (Gesprächsartefakt, kein Git-Blob). Enthalten: 3 PDFs, `fixture_manifest.json`, `verify_fixture.py`, `test_fixture_validation.py`, `README_STAGING.md` und `FIRESTORE_UEBERGABE_DRY_RUN.md`.
- Lokaler Aufruf: `python3 verify_fixture.py` und `python3 -m unittest -v test_fixture_validation`.

## Noch offen / echte Abbruchbedingungen

1. Business-Drive-STAGING ist aus der aktuellen ChatGPT-Drive-Verbindung nicht erreichbar (404). Keine Drive-Archiv-IDs und keine Remote-Hashes erfunden. PDFs erst in privatem Geschäftskonto hochladen, dort erneut lesen und Hash, MIME und Zugriffe prüfen.
2. Der aktuellen Cloud-Run-Version entsprechende Firestore-Collection und das Feldschema konnten mit dem vorhandenen Tool-Zugriff nicht geprüft werden. Das Testpaket enthält ausschliesslich **einen Vorschlag für ein Fachmapping**, keinen freigegebenen Importer.
3. Firestore-Staging wurde NICHT beschrieben; keine externen E-Mails, Annahmelinks, Statusänderungen, Kundenaufträge oder Vertragsfreigaben.
4. Für einen gesondert autorisierten E2E-Test: neuer Token nur serverseitig; Mehrfachannahmen atomar verhindern; negativen PDF-/AVV-/Mailpfad prüfen; produktive Make-Gates geschlossen halten.
5. RC1-Vertragsdokumente und tatsächliche rechtliche Freigaben bleiben separates Go-Live-Thema. Airtable `Online-Annahme rechtlich freigegeben` bleibt NEIN.

**Vereinfachungsprinzip:** Keine zweite CRM-Quelle und keine neue produktive Logik. Airtable = Vertriebsdaten, Drive = Dokumente, Firestore = technisch atomarer Annahmestatus, Make = Folgeautomationen. Nur notwendige Infrastruktur testen.
