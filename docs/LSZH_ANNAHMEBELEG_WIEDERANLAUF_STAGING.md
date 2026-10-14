# LSZH Automations – Annahmebeleg: sicherer Wiederanlauf (STAGING)

**Stand:** 14.10.2026 · **Keine Kundenfreigabe / keine automatische E-Mail-Freigabe**.

## 1. Grundsatz

Ziel ist **höchstens ein archivierter Annahmebeleg pro bestätigtem Angebot** und **kein unkontrollierter Zweitversand**. Ein echtes verteiltes „genau einmal“ zwischen Make, Google Drive, Gmail und Airtable ist ohne transaktionale/idempotente Mail-API nicht garantiert. Unklare Zustände müssen **manuell abgeglichen** werden, nicht blind automatisch wiederholt.

Annahme setzt eine juristisch und geschäftlich genehmigte endgültige Offerte, Projektbedingungen und bei einschlägigen Datenflüssen kundenbezogene AVV voraus. Interne AVV-RC1-Provisorik vom 14.10.2026 genügt nicht zur Aktivierung. Die Make-Szenarien bleiben **INAKTIV**, E-Mail-Module hart `0=1` gesperrt.

## 2. Verbindlich implementierte Konfiguration (Make `7940220`)

1. Polling-Modul **1** selektiert nur noch Datensätze ohne `Online-Annahme Beleg Drive ID`, ohne `Online-Annahme Bestätigung in Bearbeitung` und mit sämtlichen bisherigen rechtlichen und dokumentbezogenen Voraussetzungen.
2. Drive-Module 3/4/10/11 überprüfen die beiden archivierten Vertragsdokumente; Claim-Modul **2** setzt `Online-Annahme Bestätigung in Bearbeitung = true` erst nach positiver Prüfung (derzeit **hart gesperrt**).
3. Module 5/6/7 erzeugen und archivieren den Annahmebeleg; Module 12/13/14 lesen ihn, schreibschützen und prüfen SHA-256 und Ablageort.
4. **NEU Modul 15:** Nach erfolgreicher Archivprüfung, **VOR** E-Mail-Versand, schreibt Airtable `Online-Annahme Beleg Drive ID = {{7.id}}` und lässt `Online-Annahme Bestätigung in Bearbeitung = true` stehen.
5. Kundenmail-Modul **8** prüft auch, ob Modul 15 mit HTTP 200 erfolgreich die richtige Datensatz-/Beleg-ID bestätigt hat. **Harte `0=1`-Sperre unverändert aktiv.**
6. Modul **9** schreibt **erst nach nachgewiesener erfolgreicher E-Mail** `Online-Annahme Bestätigung gesendet am` und setzt `Online-Annahme Bestätigung in Bearbeitung = false`; die Beleg-ID wird **nicht** erst nach der E-Mail geschrieben.
7. Sequenzielle Verarbeitung aktiviert. Eine Unterbrechung nach dem Claim lässt den Datensatz bewusst gesperrt, bis ein Mensch die Ursache abklärt. Keine stille Wiederholung.

**Wichtige Restlücke:** Unterbrechung nach Google-Drive-Upload aber **vor** Modul 15: Die Beleg-ID ist im Angebotsdatensatz noch leer, die Bearbeitungs-Sperre bleibt aber gesetzt. **Vor** erneuter Belegerstellung im Geschäftsarchiv suchen (präziser Offertenbezug / Dateiname, Zeit, SHA und Schreibschutz prüfen). Solange nicht abgeklärt, nie automatisch entsperren.

## 3. Entscheidungstabelle für manuelle Prüfung

| Airtable-Status | Interpretation | Sichere nächste Handlung |
|---|---|---|
| Beleg-ID vorhanden; Versanddatum leer | Mail möglicherweise *nicht* versandt **oder** versandt, aber Airtable-Finalisierung fehlgeschlagen | **Keine Mail automatisch erneut senden.** Gmail „Gesendet“, Empfänger, Offertennummer, Zeitstempel, Attachments, Make-Ausführungsprotokoll prüfen. Bei Nachweis manuell protokollieren / Status abstimmen |
| Keine Beleg-ID; `in Bearbeitung = true` | Ausführung zwischen Claim und Belegpersistierung abgebrochen | **Keine zweite Belegerstellung.** Drive-Dateien und Ausführungsprotokolle auf bereits vorhandenen Beleg kontrollieren. Erst dann manuellen Entscheid treffen |
| Beleg-ID und Versanddatum vorhanden | Versandabschluss dokumentiert | Kein automatischer weiterer Versand |
| Keine Beleg-ID, `in Bearbeitung = false`, keine rechtliche Freigabe | Rechts-/Businessfreigabe nicht gegeben | Keine Beleg- oder Kundenaktion |
| Beleg-ID vorhanden, `in Bearbeitung = false`, Versanddatum leer | Inkonsistenter/unklarer Versandstatus | Manuell prüfen, nie automatisch versenden |
| Versanddatum vorhanden, aber Beleg-ID fehlt | Inkonsistente Nachweiskette | Sofort manuelle Prüfung, Status nie pauschal zurücksetzen |

Wenn Gmail trotz erfolgreichem API-Aufruf nicht nachweisbar ist oder der Mailanbieter ein Timeout zurückgibt, kann der Versand stattgefunden haben. Dann **nicht** automatisch nochmals senden. Jede manuelle Korrektur mit ausführendem Bearbeiter, Datum, Quelle und Kundenbezug dokumentieren.

## 4. Tatsächliche synthetische Testnachweise (14.10.2026)

- Testofferte `TEST-RECOVERY-20261014-NO-CONTRACT` in Airtable angelegt, Status **Entwurf**, **rechtlich nicht freigegeben**, ohne reale Kundenadresse.
- Testscenario **7964528**: archivierten `TEST_ONLY`-Beleg aus Geschäfts-STAGING kontrolliert; Beleg-ID per echtem Airtable-PATCH auf synthetische Offerte gesetzt; **anschliessend** mit Code absichtlich `LSZH_SYNTHETIC_MAIL_FAILURE_AFTER_RECEIPT_SAVED` ausgelöst. Ausführung `b296998f54ff453cbbb33434f9247bb4` endete mit erwartetem Fehler, erst Modul 6 schlug fehl. Airtable-Beleg-ID blieb erhalten; `in Bearbeitung = true`; kein Versanddatum, keine tatsächliche E-Mail. Testscenario wieder deaktiviert.
- Testscenario **7964549** (Airtable **nur lesen**, keine E-Mail-Module): 
  - Ausführung `808542b30a914a4cac7d231e6ffc0be0`: Beleg-ID vorhanden, Mailstatus unklar → `MANUAL_REVIEW_BEFORE_ANY_EMAIL`, **no auto mail / no new proof**.
  - Ausführung `85991227b67f4ef49f31a73b50d099e5`: simuliert fehlende Beleg-ID bei `in Bearbeitung=true` → `MANUAL_REVIEW_BEFORE_PROOF_RETRY`, keine automatische Wiedererstellung.
  - Ausführung `1e1182b325454d4f9bcc6715c1a61c77`: `in Bearbeitung=false`, keine ID, aber keine rechtliche Freigabe → `BLOCKED_NOT_LEGALLY_APPROVED`.
- Synthetische Testofferte nach Tests in den künstlichen Fehlerfall mit Beleg-ID und `in Bearbeitung=true` zurückversetzt, klar als **TEST** gekennzeichnet.
- Original `7940220` und Tests `7964528`, `7964549` überprüft **INAKTIV**; Modul 8 nach wie vor hart `0=1` gesperrt. Keine echte Vertragsbestätigung oder E-Mail.

## 5. Weitere Freigabepunkte

- **Echte** CRM-/Gmail-Nachweisabgleiche und manuell dokumentierter Freigabe-/Retry-Prozess im Kundenbetrieb.
- Technische Prüfung von gleichzeitigen Ansprüchen nach Entsperrung (Airtable `PATCH` ist nicht atomare Compare-and-Swap-Sperre) und Angebotsidentität; kein Versprechen lückenloser Exactly-once-Semantik.
- AVV-Anlagen A–C, vollständige kundenbezogene Version, Projektbedingungen RC1 und geschäftliche D1–D3-Entscheide, rechtliche Prüfung, Dienstkonto, Archiv-/Retention-/Backups, finale Online-Annahme und ausdrückliche Produktionsfreigabe.
