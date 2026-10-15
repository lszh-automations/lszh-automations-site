# LSZH – MVP TESTABLAUF & Freigabepunkte (Offerte → Annahme → Rechnung)

**Stand: 15.10.2026. Nur technischer STAGING-Plan für vollständig fiktive Daten. Keine Kundenmail, kein wirksamer Vertrag, keine Cloud-Änderung durch dieses Dokument.**

## Ziel und Meilensteine

- **Bis Fr. 23.10.2026 (Ziel, keine Zusage):** Nach separaten Freigaben ein vollständiger technischer Test mit *einem* eindeutig markierten fiktiven Kunden, vom Lead über Offerte, geschützte Anlagen, simulierte Annahme und Archivprüfung bis zur erstellten **Swiss-QR-Rechnungsvorschau**. **Kein E-Mail-Versand** und **keine** echte Vertragsannahme.
- **Bis Fr. 30.10.2026 (Ziel, keine Zusage):** Fehler-/Retry-/Doppelannahmeprüfungen, nachvollziehbare Belege und Entscheidungsvorlage für einen **späteren** echten Pilot. Echter Pilot erst nach rechtlicher Prüfung und separaten Freigaben.
- **Code und Betrieb strikt getrennt:** Entwicklungszweig `feature/firestore-staging-dryrun-20261015`. Render-Website `main`, bestehender Google-Cloud-Run-Preflight `lszh-offer-portal-staging` und alle produktiven Make-Szenarien bleiben unverändert.

## Read-only-Bestandsaufnahme Make (15.10.2026)

Folgende Szenarien wurden direkt aus Make gelesen; **alle sind derzeit inaktiv**, die genannten Rechnungs- und Onboarding-Tests als *on-demand* deklariert. Der unten dokumentierte Status ist eine Momentaufnahme, keine Berechtigung zur Ausführung.

| Abschnitt | Scenario-ID | Szenario | Nachgewiesener Zustand |
| --- | --- | --- | --- |
| Offerten-PDF | `7835460` | LSZH Vertrieb – Offerte PDF erstellen & versenden | Inaktiv; PDF-Erstellung schon in Filter 2 hart gesperrt, Versandmodul 5 deaktiviert |
| Annahmelink | `7940261` | LSZH Offerten – persönlichen Annahmelink erstellen & mailen (STAGING) | Inaktiv; AVV-Ja-Filter blockiert, Versand über Filter hart gesperrt |
| Annahmebeleg | `7940220` | LSZH Offerten – Online-Annahmebeleg & Bestätigung (STAGING) | Inaktiv; Belegvorstufe und E-Mail-Versand durch harte Filter gesperrt |
| Onboarding | `7963278` | LSZH TEST – isolierter kompletter Kunden-Onboarding-Durchlauf | Inaktiv; on-demand; mit Airtable-Reads/-Writes und Konflikt-/Idempotenzpfaden (nicht ohne gesonderte synthetische Schreibfreigabe starten) |
| Rechnungs-PDF | `7956264` | LSZH TEST – Rechnung Kunden-HTML + Swiss-QR-PDF | Inaktiv; on-demand; 2 Code- und 2 Subscenario-Aufrufe; keine Send-Mail-Module in diesem Szenario |
| Rechnungsfreigabe | `7956605` | LSZH Rechnungen – Freigabe-VORPRÜFUNG (READ ONLY · KEIN VERSAND) | Inaktiv; on-demand; Airtable-Lese- und Code-Module |
| Rechnungsmail-Vorschau | `7955953` | LSZH TEST – Kundenrechnungsmail HTML aus Airtable (NUR VORSCHAU) | Inaktiv; on-demand; kein Send-Mail-Modul |
| Alt-Rechnungsversand | `7781492` | LSZH ALT – Rechnungsversand gesperrt (QR fehlt) | Inaktiv; keinesfalls einschalten |

**Wichtig:** Ein vorhandenes Szenario oder vorheriges Einzelresultat ist kein E2E-Test. Kein pauschales Aktivieren „aller Szenarien“. Szenario `7963278` enthält echte Airtable-Schreibmodule und darf nicht als rein lesend behandelt werden. Die bestehenden Make-Verbindungen der geprüften Szenarien wurden als `ok` angezeigt; daraus folgt keine Freigabe zum Schreiben oder Senden.

## Read-only-Bestandsaufnahme Airtable (15.10.2026)

Base `appzJiskpAdaR1HEv` verfügt über die Tabellen `Website Leads`, `Offerten`, `Kunden`, `Aufträge`, `Rechnungen`, `Kunden-Onboarding`, `Rechnungsversand – Testprotokoll`, zwei TEST-Nummern-Tabellen und weitere Arbeitsmodule.

- Synthetischer Offerten-Datensatz `recaH2FUSgUUytImd`, Offertennummer `DEMO-OFF-20991231-20261015A1`, Status `Entwurf`, Bedingungen `TEST_ONLY_TERMS_20261015_A1`, `AVV erforderlich = Ja`. Kein echter Vertrag.
- Synthetische drei Drive-PDFs wurden zuvor vollständig binär gelesen und per SHA-256 mit Airtable abgeglichen. Private Drive-Revisionen sind **`keepForever=false`**, deshalb **noch nicht** für den rechtsrelevanten Archivbetrieb geeignet.
- Die Airtable-Tabelle `Rechnungsversand – Testprotokoll` enthält zwei ältere Testeinträge mit einem **Provider-bestätigt**-Status, PDF-SHA und SCOR. **Das ist kein Beleg**, dass unser aktueller Offerte-zu-Rechnung-E2E-Durchlauf gelingt oder dass künftiger Versand schon sicher freigegeben wäre. Es wird **kein weiterer Mailversand** veranlasst.

## Testreihenfolge – nur nach genau passender Freigabe

| Schritt | Aktion / Beweis | Schreib-/Versandgrenze | Status |
| --- | --- | --- | --- |
| 0 | CI-Sicherheits-/Emulatortests und `node scripts/mvp-readiness-gate.js --status` mit Statusbelegen prüfen | Read-only/offline | **Fertig:** bestehende Tests grün; Release-Gate NO_GO |
| 1 | Neue separate Cloud-Run-Revision deployen und IAM-Invoker/Ingress nachprüfen | **Explizite eigene Cloud-Run-Freigabe nötig** | **Offen** |
| 2 | Cloud-Run-Servicekonto und echten GET auf benannte Firestore-STAGING-DB nachweisen | **Nur Lesen**, keine Datenbankänderung | **Offen** |
| 3 | Offerten-PDF, Bedingungen und bei `AVV=Ja` die AVV mit gleichen SHA-256/Drive-IDs ausliefern; Bearbeitungs-/Freigabestatus prüfen | Fiktive Dateien, **kein Kundenmail**; gesonderte Staging-Mutation nur nach Freigabe | **Teilweise Einzelbelege vorhanden** |
| 4 | Synthetischen, nicht rechtswirksamen Annahmepfad **in isoliertem Test** ausführen; Doppel-Klick & Ablehnung widersprüchlicher Dokumente | **Keine** echte Annahme-API aktivieren; Cloud-Firestore-Writes nur separat genehmigt | **Nur lokale Emulator-Tests bestanden** |
| 5 | Testannahmebeleg in privatem Testarchiv ablegen, Hash/Referenzen wiederlesen; Make/Airtable-Zustandsabgleich + Fehlerrücklauf prüfen | **Separat genehmigte** synthetische Staging-Mutationen, keine Mails | **Offen** |
| 6 | Aus dem synthetischen Vorgang QR-Rechnung im *on-demand* Testpfad erzeugen; SCOR, IBAN, Adressdaten, CHF-Beträge, Layout/Seiten prüfen | **Nur PDF-/Mail-Vorschau, kein Versand** | **Einzelkomponenten vorhanden, End-to-End offen** |
| 7 | Wiederholung, doppelte Rechnungsnummer, Terminfehler, Rollenfehler, fehlende PDF-Datei, abgelaufener Token, falsche Hashes testen | Sicheres Staging; keine Produktivwirkung | **Teilweise Komponenten-/Emulatorprüfungen, Gesamtdurchlauf offen** |
| 8 | Nachweisprotokoll ablegen und Go/No-Go für Pilot treffen | **Keine automatische Aktivierung**, Mensch genehmigt separat | **Offen** |

## Zwei getrennte Go/No-Go-Entscheidungen

1. **SYNTHETIC E2E GO**: Nur ein fiktiver Kunde, Test-only-Verträge, keine produktiven E-Mails, isoliertes geschütztes STAGING, nachgewiesener echter Named-Firestore-Lesezugriff und unabhängig explizit genehmigte Testausführung. Die vorliegenden 115 lokalen Tests und 9 Emulator-Tests ersetzen den Remote-Nachweis nicht.
2. **ECHTER PILOT GO**: Zusätzlich müssen RC1-Projektbedingungen und AVV fachlich/juristisch geprüft, die rechtsrelevante Archivretention/Versionierung gelöst, Kundenfreigaben/Zahlungsdaten geprüft und produktive Mail-/Annahmelogik eigenständig freigegeben sein. **Kein Pilot allein aufgrund erfolgreicher Tests.**

Das read-only JSON-Snapshot `docs/LSZH_MVP_READINESS_SNAPSHOT_20261015.json` und der offline Gate-Evaluator `scripts/mvp-readiness-gate.js` bewerten diese Stufen **absichtlich konservativ**. `PASS` in der Datei bedeutet nur *dokumentierte Evidenz* und wird durch das Skript nicht live neu geprüft. GitHub Actions [MVP Release Safety Gates](https://github.com/lszh-automations/lszh-automations-site/actions/workflows/lszh-mvp-go-no-go.yml) verifizieren den automatisierten NO_GO-Zustand, nicht eine abgeschlossene Produktivabnahme.

## Nächster konkrete Engpass

**Getrennter privater Cloud-Run-Deploy** mit `lszh-offer-reader@lszh-automations.iam.gserviceaccount.com` und enger `run.invoker`-/Ingress-Policy sowie der echte Firestore-GET-Test. Das bestehende Cloud-Run-Preflight wird **nicht** ersetzt. Für `iam.serviceAccounts.actAs` oder `run.invoker` ist vor jeder Änderung die konkrete Identität und der minimale Scope zu prüfen. Ohne explizite Deployfreigabe bleibt dies eine reine Vorbereitung.

**Zeitplan-Risiko:** Das 23.-Oktober-Ziel ist nur erreichbar, wenn diese Freigaben und die nachfolgenden Integrationstests rechtzeitig möglich sind. Es ist kein zugesagter Liefertermin.
