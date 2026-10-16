# LSZH Automations – Sichere Airtable-Fixture für den E2E-Onboarding-Test

**Stand:** 17.10.2026 · **STATUS: NUR PLANUNG – KEINE AIRTABLE-RECORDS ANGELEGT**

## 1. Ziel und Begrenzung

Einen echten, aber **ausschliesslich synthetischen** `Kunden`- / `Aufträge`- / `Kunden-Onboarding`-Datensatzverbund für die serverseitige Statusprüfung vorbereiten. Der Test soll später lediglich zeigen, ob `verifyOnboardingState()` mit einer beschränkten Airtable-Leseberechtigung den korrekten Eingangsstatus erkennt und unser Cloud-Run-Staging-Outbox-Worker einen gesperrten `DRAFT_NOT_SENT` erzeugen könnte.

**Nicht zu testen bzw. ausdrücklich gesperrt:** echter Vertragsabschluss, produktive Rechnung oder Offerte, echte Make-Einladung, Benutzer-E-Mail, Formularversand, Make- oder Airtable-Automationsaktivierung, produktiver Firestore-Write, Cloud Run Service-Re-Deployment. Der bestehende `lszh-onboarding-outbox-staging` bleibt `enabled=false`; Cloud Run Jobs für Firestore wurden bereits erfolgreich getestet und werden **nicht wiederholt**.

Die vorhandene Basis `LSZH Automations – Website CRM` (Airtable `appzJiskpAdaR1HEv`) enthält **acht aktive von neun** Airtable-Automationen. Verifikationscode in `onboarding/confirmation.js` ist auf genau diese Basis fest eingestellt. Ein Datensatz in einer anderen Airtable-Basis wäre daher **ohne Codeänderung kein echter, verbundener Test derselben Prüfimplementierung**.

## 2. Tatsächliche aktive Automationen und Nebenwirkungen (read-only geprüft)

| Airtable-Automation | Auslöser, tatsächlicher Stand | Risiko für Testfixture |
|---|---|---|
| **LSZH Projekte – Standard-Onboarding** | **Aktiv:** Auftrag mit `Leistung=Automation-Projekt`, Kundenlink vorhanden, Aufgabenliste leer, `Standardaufgaben erstellt=false` | Legt **6 Projektaufgaben** an und aktualisiert Auftrag; Test muss **NICHT** `Automation-Projekt` verwenden |
| **LSZH Projekte – Abschluss & Betreuung** | **Aktiv:** `Projekt vollständig=1`, Abschlussdatum leer, Status nicht storniert | Kann Auftrag abschliessen oder Folgeaufgabe erzeugen; Flag `Projektabschluss durchgeführt` muss **false** bleiben |
| **LSZH Rechnungen – Wiederkehrend fakturieren** | **Aktiv, täglich 08:00 Zürich:** `Auto-Fakturierung fällig=1` und Monats-/Quartals-/Jahresmodell | Kann Rechnung erstellen; Test **ohne** nächsten Fakturierungstermin, Modell `Individuell`, Betrag 0 |
| **LSZH Rechnungen – Einmalig fakturieren** | **Aktiv, täglich 08:05 Zürich:** `Auto-Fakturierung fällig=1` und Modell `Einmalig` | Kann Rechnung erstellen; ebenso verhindern |
| **LSZH Rechnungen – Bezahlt verbuchen** | Aktiv auf bezahlte Rechnung | Ohne Testrechnung nicht betroffen |
| **LSZH Betreuung – Folgecheck anlegen** | Aktiv auf Statuswechsel an Projektaufgabe | Keine Testprojektaufgabe erzeugen oder abschliessen |
| **LSZH CRM – Kontakt protokollieren** | Aktiv auf geänderten Website-Lead-Kontaktschalter | Keinen Website-Lead erstellen |
| **LSZH CRM – Gewonnen zu Kunde** | Aktiv, wenn Website-Lead gewonnen und qualifiziert | Keinen Website-Lead erstellen |
| **LSZH CRM – Statuslogik** | **Ausgeschaltet** | Kein auslösbarer Ablauf |

Die auf dieselben Airtable-Tabellen zugreifenden Make-Onboarding-Szenarien **7777695, 7963278, 7963329, 7963343, 7936546, 7835639, 7936151** wurden lesend in Make gefunden und sind **inaktiv**. Die zwei anderen aktiven Make-Szenarien (`Integration Apple iOS`, `MG - Delete`) verwenden laut Szenarienliste keine Airtable-App. **Diese Zustände unmittelbar vor einem Live-Fixture-Write nochmals prüfen.** Ein inaktives Make-Szenario ist keine automatische Datenisolationsgrenze.

**Ergebnis:** In Airtable gibt es aktuell **keine direkte aktive Automation mit Trigger auf `Kunden-Onboarding` oder `Kunden`**. Trotzdem reichen unpassende Felder in `Aufträge`, um weitere Automationen auszulösen. Eine vollständige Garantie kann diese Aufstellung nicht liefern.

## 3. Minimaler synthetischer Fixture-Entwurf – NOCH NICHT ANLEGEN

**Nicht vorhersagbares temporäres Token:** Für einen späteren echten Test **ein neues, zufällig erzeugtes** `ob_<UUID>` verwenden. Das in Offline-Tests eingesetzte `ob_00000000-0000-4000-8000-000000000000` **nicht im realen CRM erstellen**, da der Onboarding-Code ein Bearer-Link-Token ist. Die zufällige Fixture-Kennung nicht in GitHub, Screenshots oder Logs veröffentlichen.

### Kunde (`tbl8cUUfFVqsjj2Z0`)

- `Firma` = `LSZH SYNTHETISCH – NUR TEST – E2E`
- `Ansprechpartner` = `Testperson (fiktiv)`, `E-Mail` = `synthetisch@example.invalid`
- Rechnungsfelder: `Rechnungsstrasse=Testweg 1`, `Rechnungs-PLZ=0000`, `Rechnungsort=Musterstadt`, `Rechnungsland=Schweiz`, `Rechnungs-E-Mail=synthetisch@example.invalid`
- Kein echter Kontakt, keine echte Domain, kein Website-Lead, kein Zahlungsfluss

### Auftrag (`tblXUogIvWbulxfnN`), nur mit dem neu erstellten fiktiven Kunden verknüpfen

- `Auftrag` = `LSZH SYNTHETISCH – NUR TEST – Onboarding`
- `Kunde` = genau **eine** neu erzeugte synthetische Kunden-ID
- `Leistung=Beratung` (ausdrücklich **nicht** `Automation-Projekt`)
- `Status=Pausiert`, `Abrechnungsmodell=Individuell`
- `Einmalig CHF=0`, `Monatlich CHF=0`, `Nächste Fakturierung` **leer**
- `Standardaufgaben erstellt=true` als zusätzliche technische Sperre der sechs Standardaufgaben; nur für synthetische Fixture. Kein echter Projektaufgaben-Link
- `Projektabschluss durchgeführt=false`; `Projekt vollständig` (berechnet) muss **0** sein
- `Onboarding-Token` = exakt der *neue zufällige Test-Projektcode*
- `Verbindungen erforderlich=true`, `AVV erforderlich=Prüfen`
- `Make-Kontostatus=Noch kein Make-Konto`, `Make-Organisation` **leer**, `Make-Einladungsstatus=Noch nicht eingeladen`, `Make-Zugriff bestätigt=false`
- Keine Rechnungs- oder Offerten-Links, keine anderen Kunden- oder Projektverknüpfungen
- **Nach Anlegen nur lesend prüfen:** `Auto-Fakturierung fällig=0`, `Projekt vollständig=0`, keine Aufgaben/Invoices erzeugt; bei Abweichung sofort abbrechen

### Kunden-Onboarding (`tblWIY4l4VASz8Vse`)

- `Onboarding` = `LSZH SYNTHETISCH – NUR TEST – Eingang`
- `Projektcode` = identischer neuer zufälliger Test-Projektcode
- `Auftrag` = genau eine synthetische Auftrags-ID, `Kunde` = genau eine synthetische Kunden-ID
- `Status=Eingegangen`, `Sensible Daten=Nein`
- Rechnungsfelder exakt wie beim synthetischen Kunden
- `Make-Konto Status=Noch kein Make-Konto`, `Make-Organisation` leer, `Make-Einladung Status=Noch nicht eingeladen`
- Kontaktadressen ausschliesslich `example.invalid`; kein externer Versand
- Keine echten Testdateien, Belege, OAuth-Zugänge, Einladungen oder personenbezogenen Daten
- **Keine Datenschutz-Prüfaufgabe** nötig, da `Sensible Daten=Nein`; dies ist ein fachlicher Eingangsstatus-Test, keine echte AVV-/Make-Freigabe

## 4. Bevor der erste CRM-Testdatensatz geschrieben werden darf

1. Acht aktive Airtable-Automationen und beide aktiven Make-Szenarien nochmals lesen; jede neu hinzugekommene Automation oder geänderte Bedingung blockiert die Fixture-Anlage.
2. Die aktuell vorhandene **exakt passende zufällige Fixture-Token-ID** mit einem begrenzten Airtable-Filter vorab auf Dubletten prüfen; 0 Treffer erforderlich. Keine breiten Kundensuchen.
3. Prüfen, ob Airtable beim Anlegen automatisch Rechnungs-/Projektstatus-Formeln oder eine Default-Leistung setzt, die einen Trigger auslösen können. Keine Make- oder Airtable-Automation pauschal deaktivieren.
4. **Ausdrückliche userseitige Freigabe** für das Erstellen von drei synthetischen CRM-Datensätzen einholen – inklusive Risiko automatischer Nebenwirkungen und Bereinigungsplan. Keine stillschweigende Freigabe durch `vamos`.
5. Separat und nur bei späterem Auftrag: Kunde → Auftrag → Onboarding **einzeln**, je Zwischenstufe read-only auf Nebeneffekte prüfen. Bei Abweichung **keine** weiteren Writes.
6. Nach einem rein lesenden `verifyOnboardingState`-Resultat den Cloud-Run-Dienst **nicht automatisch aktivieren**. Der einmalige interne Reconcile und Firestore-Testentwurf benötigen eigene Auth-/Secret-Freigaben.
7. Bereinigung nur nach erneuter Id-Prüfung (ausschliesslich drei erstellte synthetische IDs, keine produktiven Links, keine Nebenwirkungen). Datensätze nicht automatisch/breit löschen; bei Unsicherheit manuelle Prüfung.

**Technische Warnung:** Der vorhandene `verifyOnboardingState()` nennt `completed` nur, wenn der synthetische **Formulareingang** konsistent gespeichert ist. Das ist **kein** Beweis eines abgeschlossenen Make-Kunden-Onboardings, verifizierter Einladung an LSZH, freigegebener AVV oder einer produktiven Dienstleistungsfreigabe.

## 5. Status dieser Umsetzung

- Realer CRM-Schema-/Automations-/Make-Status: **read-only auditiert**.
- Offline-E2E mit simulierten CRM- und Firestore-Antworten: **82/82 erfolgreich**.
- Effektive Firestore-Identität inkl. synthetischer realer Schreib-/Löschoperation: **bestanden**.
- Echter zusammenhängender CRM→Cloud-Run→Firestore-Lauf: **noch nicht ausgeführt**.
- Neue CRM-Testdatensätze, Airtable-Automationsänderungen, Versand oder produktive Freigabe: **KEINE**.

Dieser Plan ist ausdrücklich nur Vorbereitung auf einen späteren, separat genehmigten realen synthetischen E2E-Test.
