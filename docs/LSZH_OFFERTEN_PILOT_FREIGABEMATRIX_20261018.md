# LSZH Automations – Freigabematrix für einen kontrollierten Offerten-Pilot

**Stand: 18.10.2026.** Technische Bestandsaufnahme aus verbundenen GitHub-, Make- und Airtable-Konten sowie aus den vom Betreiber protokollierten Cloud-Shell-Livetests. **Dieses Dokument ist keine juristische Prüfung, keine Vertragsfreigabe und keine Aktivierungsanweisung.** Es wurden dafür keine produktiven Daten geschrieben oder E-Mails/Einladungen verschickt.

## Abnahmegrenzen

- **GETESTET** = konkret belegter Test, mit genauer Reichweite.
- **VORBEREITET** = Code, Schema oder Make-Modul vorhanden, aber die vollständige reale Strecke ist nicht abgenommen.
- **NO-GO** = harte Sperre bleibt bestehen; auch bei technisch verfügbarem Modul kein Produktivbetrieb.
- Zentrale technische Datenführung: Airtable `Offerten` (Geschäftsprozess), getrennte Firestore-Portal-/Transaktionsdaten, überprüfte Geschäfts-Drive-Dokumente und idempotente Folgeaktionen. Zuständigkeiten und endgültige Rechte müssen vor Go-Live verbindlich beschlossen sein.
- Kunden besitzen ihre eigenen Make-Organisationen; der Geschäftsaccount von LSZH Automations ist nicht als allgemeines Kunden-Credential-Lager einzusetzen.
- Bis zur separat dokumentierten Freigabe: kein Merge nach `main`, keine echten Kundenverträge, keine produktiven E-Mails oder Einladungen, kein öffentliches Vertragsportal, keine Freigabe/Übernahme von Testdaten in den Echtbetrieb.

## A. Heute bestätigte Tatsachen

| Bereich | Live-Evidenz | Status / Grenze |
| --- | --- | --- |
| Temporäre Cloud-Run-Identität und Drive-Lesezugriff | `lszh-offer-browser-staging-00006-h5w`; IAM-authentifizierter GET `/_lszh/synthetic-drive-check` mit HTTP 200 und `verifiedFiles:4`; gespeicherte vier synthetische PDFs samt SHA-256/Schreibschutz geprüft | **GETESTET**, ausschliesslich isolierte synthetische Dateien; keine Kundenangebote |
| Temporäre Web-/API-Sperren | Operativer HTTP-Smoketest an derselben Revision: GET-Offerte/Document/Accept gesperrt, POST-Offerte/Document/Accept gesperrt (jeweils 503); statische Testvorschau 200 und CSP `form-action 'none'`, `connect-src 'none'` | **GETESTET**. Beweist ausdrücklich *keine* aktive Annahme |
| Cloud-Run-IAM | Keine direkte Bindung für `allUsers`/`allAuthenticatedUsers` am temporären Dienst; exakte Revision, isoliertes Dienstkonto geprüft | **NO-GO Restpunkt:** effektive/vererbte Organisations-, Folder- und Projektrollen sowie Bedingungen/Verweigerungen nicht abschliessend evaluiert |
| Google Drive Herkunft | `lars@lszh-automations.ch` hat Geschäftsordner, Parent, vier PDFs und temporäre Reader-Berechtigung per GET-only Vorprüfung bestätigt | **GETESTET**, aber spätere echte Archiv-/Ownership-Beweiskette muss ohne synthetischen Sonderfall auskommen; `contentRestrictions.readOnly` ist kein WORM |
| GitHub | Entwurf PR [#5](https://github.com/lszh-automations/lszh-automations-site/pull/5) `feature/optional-avv-acceptance-staging-20261014`, **offen, Draft, nicht gemergt**; GitHub Actions [39116921917](https://github.com/lszh-automations/lszh-automations-site/actions/runs/39116921917) erfolgreich | **GETESTET für Offline-CI**, keine Deployment-/Echtvertragsfreigabe |
| Make – Offerten-PDF erzeugen `7835460` | Live-Szenario-Inventar: inaktiv; PDF-/Archivschritte vorhanden; Gmail-Modul 5 zusätzlich deaktiviert und per `0=1` blockiert | **VORBEREITET**, Versand **NO-GO** |
| Make – persönlicher Annahmelink `7940261` | Inaktiv, nur AVV=Nein vorbereitet, Token- und E-Mail-Pfade hart `0=1` gesperrt | **VORBEREITET**, E-Mail **NO-GO** |
| Make – Annahmebeleg `7940220` | Inaktiv; Claim und Gmail-Mail mit `0=1` gesperrt; Archiv vor Beleg-ID-Persistierung im Szenariodesign dokumentiert | **VORBEREITET**, rechtswirksame Annahme **NO-GO** |
| Make – optionale AVV=Ja `7965215` und `7965223` | Beide inaktiv; 3-PDF-Link-Versand bzw. 4-PDF-Bestätigung als Module vorgesehen, Token/Claim/Gmail zusätzlich `0=1` gesperrt | **VORBEREITET**, kein echter Versand oder Annahmenachweis |
| Make-Verbindungen | Von der Make-API bei genannten Szenarien als `ok` gemeldet (Airtable, Geschäfts-Drive, Google Docs, Gmail) | **Nur Verbindungsstatus**; beweist nicht, welches Konto/Rechte jede Verbindung im Kundenbetrieb besitzt |
| Airtable | Base `LSZH Automations – Website CRM` `appzJiskpAdaR1HEv`, Tabelle `Offerten` `tbljeIUoD7wwKuSmS` vorhanden; Felder für AVV, Drive-IDs, Hashes, Annahmebeleg, Freigabe/Status und Follow-up; dazu Kunden, Aufträge, Rechnungen, Kunden-Onboarding | **SCHEMA bestätigt**; konkrete produktive Records wurden in dieser Prüfung nicht ausgelesen oder verändert |

## B. Offene technische Freigabegates (Reihenfolge)

| Gate | Noch ausstehender Nachweis / Aufgabe | Freigabekriterium | Jetzt |
| --- | --- | --- | --- |
| **G1 – IAM und Architektur** | Effektive Cloud-Run-Invoker-/Dienstkonto-Rechte einschliesslich geerbter Rollen, Conditions und Organisationspolitik prüfen; Browser-Portal-Architektur für Kunden vs. internen Reader verbindlich festlegen | Dokumentierte Least-Privilege-Matrix, kein unkontrollierter Kunden-/Archivzugriff, keine Serviceaccount-Keys, sichere erreichbare Kundenroute | **NO-GO** |
| **G2 – Recht und Beweiskette** | Projektbedingungen v1.0 RC1 und AVV RC1 anhand der *Originalunterlagen* juristisch/geschäftlich prüfen; kundenspezifische AVV-Anlagen, Gültigkeitsversion, Signaturform, Zustimmungsnachweis und Aufbewahrungs-/Löschkonzept abschliessen | Rechtsprüfung dokumentiert, endgültige PDF-Bytes und SHA-256 im Geschäftsarchiv geprüft, explizite Freigabe durch Betreiber; Drive-Sperre nicht als WORM ausgeben | **NO-GO** |
| **G3 – Datenführerschaft und Race-Sicherheit** | Firestore-Store verwendet eine transaktionale, fingerprint-geprüfte Zustandsänderung; Emulator-E2E weist bei **12 parallelen synthetischen Annahmeversuchen exakt 1 Erfolg und 11 Ablehnungen** nach. Offen: übergreifende Airtable-/Firestore-Datenführerschaft, Retry/Outbox-Replays, eindeutig persistierte Beleg-ID und Folgeaktionen im echten Cloud-Staging | Höchstens eine wirksame Statusänderung/Beleg-/Zustellaktion, wiederholbarer Wiederanlauf und keine doppelten Kundenmails; genau definierte 409-/Replay-Antwort statt stillschweigendem Mehrfachabschluss | **EMULATOR RACE GETESTET; vollständiger Cloud-/Make-E2E NO-GO** |
| **G4 – Dokumentstrecke** | Genau 2 (AVV=Nein) oder 3 (AVV=Ja) Vertrags-PDFs anbieten; nach Annahme 3 bzw. 4 Dokumente inklusive Nachweis; Originalbytes und Hashes prüfen | Getestete Kunden-/Server-Dokumentauslieferung für beide Fälle, negative Checks (anderer Kunde, abgelaufen, geänderte PDF, aufgehobene Sperre, falscher Ordner); kein universelles Drive-Sharing | **VORBEREITET, Testfiles nur** |
| **G5 – Make und Benachrichtigung** | Vorhandene inaktive Szenarien/Verbindungen auf kundeneigene Organisationsrollen überprüfen; 2/3 bzw. 3/4 PDF-Anhang-Zuordnung und persistierte Zustell-ID auf synthetischen Empfänger prüfen | Genau eine intern autorisierte Testzustellung nach expliziter Einzelgenehmigung; keine echten Kunden; weder `0=1`-Sperre noch Inaktivstatus vorher lösen | **NO-GO für Live-Versand** |
| **G6 – Durchgehender synthetischer Cloud-Test** | Airtable-Entwurf → enges Firestore-Testangebot → Token/privater Browser → Drive-Dokumente → Annahme-Simulation → Beleg → Status-/Outbox-Wiederanlauf; danach kontrolliertes Cleanup | Protokollierter echter Test nur mit erfundenem `TEST_ONLY_NO_CONTRACT`-Fall, keine echten E-Mails/Verträge; Testdatensatz eindeutig und entfernt/gesperrt | **VORBEREITET, noch nicht live bewiesen** |
| **G7 – Betrieb und Pilot-GO** | Monitoring, Rollback, Kosten, Backups, Datenresidenz/AVV-Dienstleister, Kundenanleitung und Incident-/Support-Prozess abnehmen | Schriftliche Einzelentscheidung zur Pilotaktivierung; genau benannter Kunde, Umfang, Verantwortlicher, Grenzwerte und Rollback | **NO-GO** |

## C. Was wir als Nächstes sicher umsetzen

1. **Kein weiteres Cloud-Run-Drive-Diagnose-Deployment:** Die temporäre Lese- und Sperrstrecke ist bestanden.
2. **IAM-Vererbungsprüfung nur lesend vorbereitet:** `scripts/offer-iam-hierarchy-readonly.py` fragt mit dem geschäftlichen Cloud-Konto ausschliesslich `gcloud projects get-ancestors-iam-policy ... --include-deny` ab und zeigt **nur aggregierte Risikozahlen**, keine Principal-IDs, Gruppen oder rohen Policydaten. `--self-test` läuft in CI. **Der Live-Betreiberlauf ist noch offen**; selbst bei unauffälligem Resultat heisst die Ausgabe absichtlich `INVESTIGATION ONLY`, nie `IAM GO`. Keine IAM-Bindungen setzen.
3. **Prüffälle für G3/G4 auf vorhandener Codebasis vervollständigen:** insbesondere gleichzeitige Annahme, Revision-/Token-Replay, beidseitige AVV-Checkbox, erzwungener Fehler zwischen Belegarchivierung und Rückschreiben, Wiederanlauf ohne doppelte Kundenmail. Vorhandene Simulator-/Emulatortests weiterverwenden.
4. **Original RC1/AVV-Richtlinien beschaffen und Entscheidungen protokollieren**, aber nicht als rechtsgültig markieren; Dokument- oder Signaturerstellung erst nach expliziter Geschäftswahl.
5. Erst danach konkrete Entscheidung des Betreibers über **einen einzigen weiteren synthetischen Schreibtest** oder eine intern adressierte E-Mail – niemals implizit aus dem Startsignal `Vamos` ableiten.

## D. Explizit nicht durch diese Bestandsaufnahme bestätigt

- Keine vollständige Effektiv-IAM-Policy der Google-Cloud-Organisation oder aller Vorfahren.
- Keine aktuelle juristische Freigabe, kein fertiges beweissicheres WORM-Langzeitarchiv.
- Kein echter rechtswirksamer Vertragsschluss, keine Live-Versandbestätigung und kein vollständiger Firestore↔Airtable-Writeback mit wiederholbarem Cloud-Betrieb.
- Kein Nachweis, dass sämtliche Make-Verbindungen ausschliesslich der gewünschten Geschäftsidentität bzw. dem künftigen Kunden gehören; nur der technische Verbindungszustand wurde abgefragt.
- Keine Durchführung von Kunden-Migrationen, Kundeneinladungen, Szenario-Aktivierung oder Rechnungserstellung.

**Arbeitsregel:** Bei einem einzigen NO-GO bleiben Produktivbetrieb, Mail, Verträge und Annahme vollständig deaktiviert. Keine der obigen Prüfungen ändert diese Sperre automatisch.
