# LSZH Automations – AVV RC1: kundenbezogene Prüfliste (STAGING)
  
**Stand:** 14.10.2026 · **AVV-Quelle:** `LSZH_AVV_v0_9_RC1_Freigabeentwurf.docx` vom 13.10.2026 · **Status:** *intern provisorisch freigegebene Arbeitsgrundlage*, **keine externe/juristische/produktive Freigabe**.

Diese Prüfliste ist eine interne Arbeits- und Nachweisstruktur für das bestehende sechsseitige AVV-RC1-Original mit Anlagen A–C, **nicht** die AVV selbst. Nur synthetische Beispieldaten verwenden, bis Kundenvertrag, technische Freigaben und Berechtigungen abgeschlossen sind. Ein bereits fertiges Muster ersetzt keine kundenbezogene Vereinbarung.

## Zuordnung / Dokumentenkontrolle

| Pflichtfeld | Wert oder Status |
| --- | --- |
| Offertennummer / Projektcode | [eintragen] |
| Kunde / Rechtsträger / UID / zuständige Person | [eintragen] |
| LSZH Rechtsträger | LSZH Invest GmbH – Geschäftsdaten vor Nutzung verifizieren |
| Vertragspartner, Rollen und Berechtigungen | [bestätigen] |
| Projektbedingungen-Version und Hash | [final verifizieren] |
| AVV-Version | v0.9 / RC1 – **nur interne Vorabfreigabe** |
| Kundenbezogene Anlagen A–C vollständig? | **NEIN** (Standardwert) |
| Rechtliche Prüfung / interne Schlussfreigabe | **OFFEN** |
| Unterschrift / nachweisbare beidseitige Annahme | **OFFEN** |

## Anlage A – Daten- und Projektsteckbrief (je Kunde neu)

- [ ] Auftrag, konkrete Bearbeitungszwecke, Dauer und Leistungen beschreiben
- [ ] Verantwortlicher, Auftragsbearbeiter, etwaige eigene Verantwortlichkeiten der LSZH und nötige Berechtigungen zuordnen
- [ ] Betroffenengruppen und Datenarten (z. B. Kontakt- und Termindaten) vollständig erfassen
- [ ] Besonders schützenswerte Daten / Profiling ausdrücklich **JA / NEIN** entscheiden; bei JA zusätzliche Risikoanalyse und Sonderfreigabe
- [ ] Vollständigen Datenfluss festhalten: Quelle, Trigger, Make-Module, verarbeitete Felder, Empfänger, Ablage, Protokolle
- [ ] Eigentümer aller Systeme festhalten: besonders Make-Organisation des Kunden, Airtable, Google, Render und etwaige KI-Dienste
- [ ] Regionen, Drittstaatenzugriffe, Cloud-Anbieter und Schutzmechanismen bezogen auf tatsächliche Datenflüsse dokumentieren
- [ ] Speicherung, Archivierung, Log-Aufbewahrung, Backups, Löschung und Übergabe je System bestimmen
- [ ] Zulässige KI-Nutzung ausdrücklich bestätigen (Datentypen, Modell, Anbieter, Trainings-/Protokolleinstellungen); Standard: **keine Kundendaten an KI ohne Freigabe**
- [ ] Vollständige Anbieterübersicht aus Anlage C referenzieren
- [ ] Kunde bestätigt Datensteckbrief, berechtigte Person und Datum/Nachweis eintragen
- [ ] Nachträgliche Änderungen an Zweck, Region, Datenarten, Anbieter oder KI nur nach dokumentierter erneuter Prüfung

## Anlage B – technische und organisatorische Massnahmen (TOM)

*Kein Kontrollpunkt darf ohne Beleg als bereits umgesetzt gelten.*

| Kontrollbereich | Ausführender/Owner | Nachweis & Prüftermin | Status |
| --- | --- | --- | --- |
| Individuelle Konten, Rollen, MFA, Entzug von Zugriffen | [ ] | [ ] | OFFEN |
| Make-Organisation im Eigentum des Kunden / minimal nötige LSZH-Mitgliedschaft | [ ] | [ ] | OFFEN |
| Keine API-Schlüssel in E-Mails, Formularfeldern oder GitHub | [ ] | [ ] | OFFEN |
| TLS/HTTPS, Verschlüsselung im Speicher und Berechtigungsprüfung | [ ] | [ ] | OFFEN |
| Trennung von Test-, Kunden- und Produktivdaten | [ ] | [ ] | OFFEN |
| Datenminimierung, Logging und Protokollaufbewahrung | [ ] | [ ] | OFFEN |
| Backups, Wiederherstellung, Anbieterzuständigkeit und Test | [ ] | [ ] | OFFEN |
| Fehlerbehandlung, Monitoring, Alerts und Zuständigkeiten | [ ] | [ ] | OFFEN |
| Meldewege und Reaktionsverantwortliche bei Sicherheitsvorfällen | [ ] | [ ] | OFFEN |
| Löschung, Übergabe und Entzug der LSZH-Zugriffsrechte | [ ] | [ ] | OFFEN |
| Subprozessoren, internationale Transfers, AVV/SCC sofern nötig | [ ] | [ ] | OFFEN |

**Hinweis zur Vorfallmeldung:** Die 24-Stunden-Angabe des Musters ist ein interner Zielwert, keine pauschale gesetzliche Frist. Erreichbarkeit und Eskalation pro Kunde konkretisieren.

## Anlage C – genehmigte Unterauftragsbearbeiter und Anbieter

Die aufgeführten Dienste sind **Prüfkandidaten**, nicht automatisch genehmigte Unterauftragsbearbeiter. Kundeneigene Make-Verträge sind nicht stets als LSZH-Unterauftragsbearbeitung einzustufen; tatsächliche Rollen und Datenströme entscheiden.

| Dienst / Funktion | Kunde oder LSZH Vertragspartner? | Tatsächliche Daten/Region/Transfers | Rechtsgrundlagen & Schutzmechanismen | Kundengenehmigung |
| --- | --- | --- | --- | --- |
| Make (Workflow-Orchestrierung) | [ ] | [ ] | [ ] | OFFEN |
| Airtable (CRM/Projektsteuerung) | [ ] | [ ] | [ ] | OFFEN |
| Google Drive / Gmail / Docs | [ ] | [ ] | [ ] | OFFEN |
| Render (Hosting/Website) | [ ] | [ ] | [ ] | OFFEN |
| OpenAI / andere KI-Dienste **nur wenn genutzt und freigegeben** | [ ] | [ ] | [ ] | OFFEN |
| Weitere tatsächliche Empfänger | [ ] | [ ] | [ ] | OFFEN |

- [ ] Kundengenehmigung/Generalklausel samt Widerspruchsverfahren eindeutig dokumentieren
- [ ] Änderungen vor neuen Datenflüssen prüfen, vertragliche Verpflichtungen/Transfers absichern
- [ ] Ansprechpartner, Notfallkontakt, Empfänger für Weisungen und Vorfallmeldungen eintragen

## Technische Archiv- und Annahmekontrollen

- [ ] Endgültige Projektbedingungen rechtlich und geschäftlich separat genehmigt
- [ ] Kundenbezogene AVV mit Anlage A, B, C ausgefüllt und extern freigegeben
- [ ] Zu jeder Version separate, gültige PDF-Datei im **geschäftlichen** Drive-Archiv mit Datei-ID, SHA-256 und Zugriffsrechten
- [ ] Beim Linkversand und bei Annahme beide PDFs erneut lesen, SHA-256 und Drive-Schreibschutz prüfen
- [ ] Vertragsannahme samt zuständiger berechtigter Person und Zeitstempel beweissicher dokumentieren
- [ ] Voraussetzungen für Online-Annahme mit rechtlicher Prüfung geklärt
- [ ] Alle synthetischen Tests protokolliert, Fehlerfälle behoben und interner Freigabeentscheid dokumentiert
- [ ] Produktionsschaltung und Kundenversand **gesondert ausdrücklich freigegeben**

**Wichtige Schutzregel:** Der Entschluss vom 14.10.2026 gibt lediglich das **AVV-Muster als interne Arbeitsvorlage** provisorisch frei. Er **setzt keine** Checkbox `Online-Annahme rechtlich freigegeben` auf JA und **hebt keine** Make-`0=1`-Sperre auf.
