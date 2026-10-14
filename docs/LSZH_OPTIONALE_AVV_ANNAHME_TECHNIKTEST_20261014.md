# LSZH Automations – optionale AVV bei Offertenannahme: technische Tests

**Stand:** 14.10.2026 · Technische Staging-Arbeit **unter der Annahme**, dass die juristische Dokumentenprüfung später erfolgreich abgeschlossen wird. **Keine** aktuelle juristische Freigabe, kein Vertrag, kein echter Kunde, keine Kunden-E-Mail.

## 1. Geschäftsregel für technische Umsetzung

- `AVV erforderlich = Ja`: Offerte **plus** Projektbedingungen **plus kundenbezogene AVV mit Anlagen A–C** sind als konkrete PDF-Versionen im geschäftlichen Archiv nachweisbar. Für jedes der drei Dokumente werden Drive-Datei-ID und SHA-256 geprüft; alle müssen schreibgeschützt sein. Die AVV wird **gesondert und ausdrücklich** durch eine vertretungsberechtigte Person akzeptiert. Kein Vertragsschluss allein aus dem technischen Vorabtest.
- `AVV erforderlich = Nein`: Offerte und Projektbedingungen genügen für die Dokumentenprüfung; es darf kein irreführender AVV-Hash in den Annahmenachweis geschrieben werden.
- `AVV erforderlich = Prüfen` oder leer: **Fail-closed**, bis Geschäftsvorgang/Datenbearbeitung geklärt ist.
- Falsche Hashes, vertauschte/identische PDFs, fehlende AVV-Version oder separate Zustimmung, fehlende bestätigte Vertretungsberechtigung und widersprüchliche Felder werden abgefangen.
- Die bereits geschäftlich festgelegten Regeln bleiben: Care 30 Kalendertage zum Monatsende, Abnahme 10 Arbeitstage ohne Schweigeabnahme, Haftung leichte Fahrlässigkeit letzte 12 Monate betroffene Leistung mindestens CHF 2'000, vorbehaltlich juristischer Prüfung.
- **Rechtliche Prüfung zeitlich zurückgestellt**. Für interne Entwicklung gilt die technische Prämisse „als wäre die Dokumentenversion intern verwendbar“, **ohne** eine Rechtsfreigabe nach aussen oder in produktiven Daten einzutragen. Endfassungen/AVV-Anlagen A–C sind kundenbezogen weiterhin nötig.

## 2. Ergänzte Airtable-Felder (Offerten)

Zur bestehenden Auswahl `AVV erforderlich` (Ja, Nein, Prüfen) wurden additiv und ohne Änderung bestehender Offerten angelegt:

| Feld | Airtable-ID | Zweck |
|---|---|---|
| Online-Annahme AVV Drive ID | `fldojDAkMfvjJycme` | Geschäftsarchiv-Referenz auf die kundenspezifische AVV |
| Online-Annahme AVV-SHA256 | `fldbhBi71Jmr6g9Uk` | Nachweis der unveränderten Datei |
| Online-Annahme AVV-Version | `fld4cMFAPuSfLjz2B` | Tatsächlich einbezogene kundenbezogene Dokumentversion |
| Online-Annahme AVV ausdrücklich akzeptiert | `fld8gm2LLGAeHeBSA` | Separater Zustimmungsnachweis; nur durch echte autorisierte Kundenhandlung setzen |

Es wurde **keine** Zustimmung bei einer bestehenden Offerte gesetzt, und das Feld `Online-Annahme rechtlich freigegeben` bleibt unverändert.

## 3. AVV-Archiv-Test mit Fake-Anlagen A–C

Synthetisches Make-Testscenario `7964777`, Lauf `ce338a7ca3a94614bf178ab8a856a972`:

- Separate fiktive AVV mit deutlich `TEST ONLY / KEIN VERTRAG` und schematischen Anlagen A, B, C erzeugt.
- Geschäftskonto-Google-Drive-STAGING: PDF-Upload, erneutes Lesen, Google-Drive-`readOnly`-Schreibschutz, SHA-256 und Parent-Ordner überprüft.
- Ergebnis **SUCCESS**, 47'341 Bytes, 9 Make-Module ohne Fehler; Testscenario danach deaktiviert.

**Test-PDF ist keine juristisch nutzbare AVV und enthält keine echten Kundenangaben.**

## 4. Optionale Dreifachprüfung und synthetischer Annahmenachweis

Make-Testscenario `7964807` (ausschliesslich On-Demand mit synthetischen Unterlagen, **keine** Gmail-/Airtable-Schreibmodule):

**Zwei technisch zulässige Fälle:**
- `e9eb7b63689f47b5951a2220a9cb026a`: `AVV Ja`, 3 geschützte, unterschiedliche Test-PDFs, simulierte separate Zustimmung und bestätigte Berechtigung ⇒ **SUCCESS**, `documents_checked=3`.
- `1eb7745d97af4982b9cc1b097ccf2887`: `AVV Nein`, nur 2 Test-PDFs ⇒ **SUCCESS**, `documents_checked=2`.

**Sechs negative Prüfungen (alle erwartungsgemäss blockiert):**
- `Prüfen` ⇒ AVV_REQUIRED_UNDETERMINED_STOP
- fehlende separate AVV-Zustimmung ⇒ AVV_SEPARATE_CUSTOMER_CONSENT_MISSING
- fehlerhafter AVV-SHA ⇒ SELECTED_AVV_DOC_HASH_MISMATCH
- nicht bestätigte Vertretungsberechtigung ⇒ AVV_REPRESENTATIVE_NOT_VERIFIED
- fehlende AVV-Version ⇒ AVV_VERSION_MISSING
- `AVV Nein` mit inkonsistenten vorhandenen AVV-Feldern ⇒ UNEXPECTED_AVV_FIELDS_FOR_NO_AVV

**Erweiterter Integritätstest (gleiches Szenario):** Nach positiver Prüfung wird ein deutlich fiktiver Annahmenachweis mit Anzahl Dokumente, zwei stets erforderlichen Prüfsummen und AVV-Status/Version und – nur bei `Ja` – AVV-Hash als PDF erzeugt, im Geschäftsarchiv gespeichert, schreibgeschützt und nachträglich hashgeprüft. Er meldet `real_contract=false` und `email_sent=false`.
- `e10940dd90c54ef4aaa7b7a9c10e8de7`: `AVV Ja`, **SUCCESS**, synthetischer Annahmenachweis im Archiv
- `95d85443cda84d27ba0ef04771b0d66f`: `AVV Nein`, **SUCCESS**, kein dritter PDF-Nachweis erforderlich
- `5d921270344f458183e8cad214c6c2ef`: falscher AVV-Hash ⇒ **ERROR in Modul 9 VOR Belegerstellung**
- `7b6da016a9a642eaa72dd20e69c66c13`: `AVV Nein` nach Korrektur der bedingten AVV-Darstellung nochmals **SUCCESS**

`7964777` und `7964807` sind wieder **INAKTIV**.

## 5. Produktionsnahe Szenarien bleiben fail-closed

- `7940261` (Annahmelink erzeugen/versenden, **INAKTIV**): zusätzliche Bedingung `AVV erforderlich = Nein` im bereits mit `0=1` gesperrten Einstiegsfilter. Deshalb kann bei erforderlicher/unklarer AVV nicht irrtümlich die noch **zweidokumentige** E-Mail-Strecke verwendet werden. Kundenmail weiterhin gesperrt.
- `7940220` (Annahmenachweis, **INAKTIV**): Airtable-Suchformel auf `AVV erforderlich = Nein` eingeschränkt, bis die echte Drei-Dokumenten-Variante durchgängig integriert und geprüft ist. Claim und Mailmodul bleiben `0=1` gesperrt. Archivbeleg wird im Vorbereitungsstand vor jeder Mail persistiert.

**Dies ist ausdrücklich keine Freigabe für Angebote mit AVV Ja**. Die getrennt getestete Drei-Dokumentenprüfung muss in den **produktionsnahen** Annahmelink, die Website und den Annahmenachweis mitsamt korrekter AVV-Anzeige, Zustimmungsprotokoll, bedingtem PDF-Anhang und Versionssicherung übernommen werden.

## 6. Nächste technische Schritte (ohne erneute Grundsatzentscheidung)

1. Auf dem **nicht live geschalteten** Website-Annahmezweig bei `AVV Ja` eigene Vorschau/PDF-Download und separate, nicht vorangekreuzte Zustimmung nachweisbar machen; für `Nein` keine AVV-Zustimmung anzeigen. `Prüfen` blockieren.
2. Die bereits getestete AVV-Datei-/Hash-/Rechteprüfung mit den beiden bestehenden Dokumentenabläufen verbinden; keine zwei- statt dreidokumentige E-Mail an Kunden mit `AVV Ja`.
3. Unwiderruflichen/abgeschlossenen Nachweis aus tatsächlich vereinbarten Versionen und signifikanten Annahmedaten in Airtable/Drive ablegen, Wiederanlauf/keine Doppelbelege prüfen.
4. Juristische Prüfung und kundenbezogene finale AVV-Anlagen **später**, vor produktiver Verwendung und echten Kundendaten. Produktivschalter und rechtliche Freigabefelder bis dahin **aus**.

**Keine produktiven E-Mails, keine externen Einladungen, keine Vertragsabschlüsse und keine Aktivierung**.
