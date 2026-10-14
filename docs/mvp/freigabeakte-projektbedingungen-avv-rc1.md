# LSZH Automations – Freigabeakte zu Projektbedingungen v1.0 RC1 und AVV v0.9 RC1
**Stand: 14.10.2026 · VORBEREITUNG / NICHT UNTERSCHRIFTSREIF · KEINE RECHTLICHE FREIGABE**

**Verkäufer und Vertragspartei:** LSZH Invest GmbH, Rummelmatt 8, 5610 Wohlen AG, UID CHE-369.474.125. «LSZH Automations» ist vorerst die Bezeichnung des Geschäftsbereichs; nicht ungeprüft als eigenständige Vertragspartei verwenden. MWST-Status und Angaben beim finalen Versand nochmals verifizieren.

## 1. Umfang und verlässliche Quellenlage

Verifiziert wurde das bestehende Google-Drive-Dokument «LSZH Vertragsarchiv – Freigaberegister (STAGING)» (ID 1ANPIYiKzLIg_yxKifhy5lZHQe0zIwfo2yD2Ll69fhtw), die GitHub-Projektanleitung docs/offertenannahme-konzept.md und der MVP-Stand.

**Grenze der Prüfung:** Die vollständigen Originaldateien
- LSZH_Projektbedingungen_v1_0_RC1_Freigabeentwurf.docx/.pdf (4 Seiten)
- LSZH_AVV_v0_9_RC1_Freigabeentwurf.docx/.pdf (6 Seiten einschliesslich Anlagen A/B/C)
- LSZH_Geschaeftsbedingungen_Entscheidungsblatt_RC1.docx/.pdf (1 Seite)
wurden früher als Gesprächsdateien erstellt, sind jedoch **in der aktuell verfügbaren Dateisitzung sowie im erreichbaren Geschäfts-Drive/GitHub nicht mit vollständigem Text verfügbar**. Deshalb ist dieses Dokument **keine Zeile-für-Zeile-Prüfung der RC1-Vertragsklauseln**. Es dokumentiert registrierte Eckpunkte, **potenzielle** Widersprüche und freigabepflichtige Anforderungen. Die tatsächliche Endredaktion muss anhand der drei Originale erfolgen; bis dahin dürfen keine Vorschläge stillschweigend als bestehende Klauseln ausgegeben werden.

**Zuordnung:** [Register] = nachweislich im vorhandenen Freigaberegister festgehalten; [Prüfpunkt] = aus geschäftlichen/technischen Anforderungen abgeleiteter Vorschlag oder juristischer Prüfschritt, nicht als RC1-Wortlaut belegt.

## 2. Entscheidungsvorlage Projektbedingungen v1.0

| Priorität | Thema | Dokumentierter Stand / Widerspruchsrisiko | Entscheidung vor Freigabe | Status |
| --- | --- | --- | --- | --- |
| P0 | Vertragspartner & Leistung | [Register] LSZH Automations unter LSZH Invest GmbH. [Prüfpunkt] Offerte, Website, AGB, Rechnungen identisch benennen; Make-/Drittkonten der Kunden gesondert regeln. | LSZH Invest GmbH als Vertragspartei bestätigen; genauen Leistungs-/Supportumfang pro Offerte definieren | OFFEN |
| P0 | Vertragsdokumente und Vorrang | [Register] Offerte + Projektbedingungen v1.0 und je Kunde AVV. [Prüfpunkt] Vorrang bei Widerspruch, Version, Anhänge, individuelle Bedingungen, Zeitpunkt der gültigen Fassung festlegen. | Versionierung & Rangfolge (z. B. Offerte / AVV für Datenbearbeitung / Projektbedingungen) juristisch abstimmen | OFFEN |
| P0 | Care-Kündigung | [Register] 30 Tage zum Monatsende als RC1-Geschäftsvorschlag. [Prüfpunkt] Abgrenzung wiederkehrende Betreuung vs. Auftrags-/Mandatscharakter, Art. 404 OR. | 30 Tage zum Monatsende akzeptieren/ändern/verwerfen, Anwalt prüft Anwendbarkeit von Art. 404 OR | OFFEN |
| P0 | Abnahme | [Register] 10 **Arbeitstage**, keine Schweigeabnahme als RC1-Vorschlag. [Prüfpunkt] klare Prüfkriterien, Fehlerklassen, Nachbesserung und Friststart; keine Behauptung einer Abnahme durch blosse Nichtantwort. | Ja/ändern, Test-/Produktivübergabe und Akzeptanzkriterien präzisieren | OFFEN |
| P0 | Haftung | [Register] vorgeschlagene Haftungsuntergrenze CHF 2'000. [Prüfpunkt] Haftungshöchstbetrag, Berechnungsbasis und Ausnahmen sauber definieren; vorsätzliche/grobfahrlässige Pflichtverletzungen nicht unzulässig ausschliessen (Art. 100 OR). | Deckel/Untergrenze/Ausnahmen mit Anwalt festlegen | OFFEN |
| P0 | Datenschutz/AVV | [Register] AVV v0.9 RC1 **nicht freigegeben**; enthält Anlagen A/B/C. | Rollen je Verarbeitung, Kategorien, Unterauftragsbearbeiter, Drittlandübermittlungen und TOM konkret ausfüllen | OFFEN |
| P1 | Preise/Zahlung | [Prüfpunkt] Einmalsetup, Care, Drittanbietergebühren, MWST, Zahlungsfristen, Akonto, Change Requests, Folgen bei Nichtzahlung eindeutig. | Standardregeln festlegen; Probetest-CHF-2'500/499 sowie 50/50 nicht ungeprüft als allgemeine Tarifvorgabe übernehmen | OFFEN |
| P1 | Sicherheit und Konten | [Prüfpunkt] Kunde betreibt eigene Make-Organisation/Verbindungen, LSZH erhält delegierten Zugriff; Verantwortlichkeiten, Zugriffsende, Incident-Kontakt. | Verantwortungsmatrix je Dienstleistung beschliessen | OFFEN |
| P1 | Änderungen & Abhängigkeiten | [Prüfpunkt] Datenqualität, Verfügbarkeit Dritter, API-Änderungen, Freigaben für Produktivmodule, manuelle Kontrolle, Supportumfang. | Leistungsgrenzen und Abnahme-Dokumente je Projekt konkretisieren | OFFEN |
| P1 | Datenexport / Vertragsende | [Prüfpunkt] Mitwirkung, Übergabe von Blueprints/Logik, Kundenzugängen, Dateien; Fristen Löschung und Backups, Aufbewahrungspflichten. | Übergabe-/Offboarding-Verfahren festlegen | OFFEN |
| P1 | Vertragsbeweis | [Register] Annahmelink/Offerte/Projektbedingungen private PDFs mit Drive SHA-256. [Prüfpunkt] Vertretungsberechtigung, Formvorschriften, Signaturniveau, Beweiskette und eventuelle Spezialverträge rechtlich abklären. | Elektronische Annahmeform für die konkret angebotenen Vertragsarten freigeben | OFFEN |

## 3. AVV v0.9 RC1 – Prüfmatrix vor einer Endfassung

**Laut Register vorhanden:** Rollen, Weisungen, Datenschutzmassnahmen, Unterauftragsbearbeiter, Auslandbekanntgaben, Vorfälle, Nachweise, Löschung und Anlagen **A Datensteckbrief**, **B TOM**, **C Unterauftragsbearbeiter**. Diese Struktur ist eine Zusammenfassung, nicht der überprüfte RC1-Volltext.

**Pro Kunde vollständig auszufüllen/zu verifizieren:**
- **Anlage A Datensteckbrief:** Verantwortlicher/Auftragsbearbeiter in jeder Verarbeitung, Zweck und Dauer, Systeme und Datenfluss, Datenkategorien und betroffene Personengruppen; Daten im LSZH-eigenen CRM/Buchhaltung getrennt betrachten.
- **Anlage B TOM:** MFA, minimaler Zugriff, Verschlüsselung (Transport/Speicherung), Schlüssel-/Secretmanagement, Protokolle, Mitarbeitendenberechtigungen, Backup/Wiederherstellung, Incident-Verfahren, Berechtigungsentzug, Kontroll-/Löschfristen. Nur tatsächlich implementierte Massnahmen behaupten.
- **Anlage C Unterauftragsbearbeiter:** Tatsächlich genutzte Anbieter (je Leistung z. B. Make, Google Workspace, Airtable, Render, OpenAI), Rolle und Sitz, Bearbeitungs-/Speicherorte, eventuelle weitere Unterauftragnehmer, Genehmigungsverfahren bei Änderungen. **Nicht** blind alle genannten Anbieter als im konkreten Kundenprozess eingesetzt deklarieren.
- **Weisungen und Zwecke:** Daten nur für vereinbarte Zwecke und nach nachweisbaren Weisungen; Verfahren bei unzulässigen Weisungen.
- **Vorfälle:** intern schnellstmögliche Erkennung und Meldung an den Kunden mit Kontakt/Kanal/Informationsumfang; Art. 24 Abs. 3 DSG verlangt Mitteilung des Auftragsbearbeiters an den Verantwortlichen so rasch als möglich. Keine erfundene verbindliche Frist aus der Gesetzesnorm übernehmen.
- **Ausland und Weiterübermittlung:** effektive Länder und Drittlandzugriffe/Unterauftragsbearbeiter, vorhandene Schutzgarantien und Informationspflichten je Kunde prüfen (Art. 16 ff. DSG).
- **Kontrollrechte, Datenanfragen und Ende:** Hilfestellung bei Auskunft/Löschung, Prüf-/Nachweisverfahren, sichere Rückgabe/Löschung inklusive Backups und gesetzlicher Aufbewahrung.
- **Rechtsräume:** Neben schweizerischem DSG prüfen, ob in der Kundenkonstellation auch EU-DSGVO und besondere Berufs-/Geheimhaltungspflichten greifen.
- **Vertragliche Konsistenz:** AVV gilt nur für relevante Auftragsbearbeitungs-Tätigkeiten; unterschiedliche Kündigung/Löschung/Auskunft und Haftungsregeln zwischen AVV, Offerte und Projektbedingungen auflösen.

Rechtsrahmen und Kontrollgrundlagen:
- Schweizer DSG, Art. 8, 9, 16 ff. und 24: https://www.fedlex.admin.ch/eli/oc/2022/491/de
- EDÖB Outsourcing (Auftragsbearbeitung): https://www.edoeb.admin.ch/de/outsourcing-auftragsdatenbearbeitung
- EDÖB Auslandbekanntgaben: https://www.edoeb.admin.ch/de/bekanntgabe-von-personendaten-ins-ausland
- Schweizer OR Art. 100 und 404: https://www.fedlex.admin.ch/eli/cc/27/317_321_377/de

## 4. Entscheidungen, die die Geschäftsführung vor Endredaktion treffen muss

**D1** Care-Modell: 30 Tage zum Monatsende – [ ] beibehalten  [ ] ändern: __________

**D2** Abnahme: 10 Arbeitstage ohne automatische Schweigeabnahme – [ ] beibehalten  [ ] ändern: __________

**D3** Haftung: CHF 2'000 als Untergrenze im Haftungskonzept – [ ] beibehalten  [ ] ändern: __________
(Die konkrete rechtswirksame Formulierung sowie notwendige Ausnahmen muss ein Schweizer Rechtskundiger prüfen.)

**D4** Offerte/Projektbedingungen/AVV – verbindliche Dokumentrangfolge: __________________

**D5** Standard-Akonto / Zahlungsfrist / Drittanbietergebühren / Betreuungsumfang: __________________

**D6** Auftragsbezogene Kundendaten: Unterauftragsbearbeiter, internationale Übermittlung, individuelle TOM/Support-Verantwortung: __________________

**D7** Vertragsende: Offboarding, Datenexport, Aufbewahrung und Löschfristen: __________________

**D8** Autorisierte Prüfung: [ ] juristische Prüfung durch qualifizierte Fachperson  [ ] Abschlussdokumente freigegeben – jeweils mit Datum, Version und genauem PDF-SHA256; bei nicht abgeschlossener Prüfung bleibt **NEIN**.

## 5. Freigabe-/Versionsregister: Keine automatische Aktivierung

| Gegenstand | Vorhandener Stand | Vorbedingung für Freigabe |
| --- | --- | --- |
| Projektbedingungen | v1.0 RC1 Freigabeentwurf, Originaltext nicht aus aktueller Sitzung lesbar | Original beiziehen, juristische und geschäftliche Endredaktion, endgültige PDF mit Version und SHA256 |
| AVV | v0.9 RC1 Entwurf, Originaltext nicht lesbar | Original beiziehen, juristisch prüfen, Anlagen A/B/C pro Kundenprozess vervollständigen |
| Offerte je Kunde | Synthetische Testofferte archiviert | Konkrete Vertrags-/Preis-/Leistungsdaten, individuelles Angebot und finale PDF, dokumentierte Freigabe |
| Geschäftliches PDF-Archiv | Make-OAuth hat eine private Testofferte mit SHA256 + readOnly bestätigt | Endgültige beide PDFs im Geschäftsdrive, gleiche Hashes, kein öffentlicher Link |
| Render-Servicekonto | Mocktests vorhanden; **echte Dienstkonto-Berechtigung nicht geprüft** | Dienstkonto als read-only auf erforderliche Geschäfts-PDFs, Render Secret, isolierter PDF-Read-Probelauf |
| Online-Annahme | Draft PR #4; Feature-Flag und Make-Szenarien aus | Nach allen vorgenannten Freigaben, E2E-, Abbruch-, Duplikat-/Beweissicherungstest, ausdrücklicher Freigabeentscheid |

**Nicht unterschreiben oder an Kunden versenden.** Eine Endfreigabe erfordert Originaltexte, anwaltliche/geschäftliche Entscheidung und überprüfte zugehörige PDFs. Diese Freigabeakte erteilt selbst keine Genehmigung.
