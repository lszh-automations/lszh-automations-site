# LSZH Automations / CRM V2 – Produktionsstand 26.10.2026

> Historische Produktionsaufnahme vor dem Make-Hinweis. Seit der autorisierten Live-Übernahme laufen CRM `00081-yaf` und Portal `00007-lig`; aktueller Nachweis: [Make-Voraussetzungen vor der Annahme](LSZH_MAKE_REQUIREMENTS_BEFORE_ACCEPTANCE.md) und [Live-Manifest](../releases/make-requirements-live-20261026.json). Der ursprüngliche Baseline-Tag und sein Manifest bleiben unverändert erhalten.

Dieser Stand ersetzt ältere Aussagen zur technischen Betriebsbereitschaft. Die vollständige Online-Vertragsannahme funktioniert. C3.7.2 ist erfolgreich abgeschlossen. Frühere offene Punkte in historischen Protokollen sind keine aktuellen Fehlerberichte.

## Verifizierte Zuordnung

| System | Tatsächlich laufender Stand | Quelle im Repository |
| --- | --- | --- |
| Öffentliche Render-Website | main, Commit 86b2e4d58ea2819ef87d422ae3a683d2b56f1b8b; letzter Deploy 23.10.2026 | Öffentliche Dateien im Repository-Stamm, unverändert aus main übernommen |
| Internes CRM | lszh-crm-v2-00078-fox, 100 % regulärer Verkehr | crm-v2/ |
| Allgemeine Kundenannahme | lszh-customer-acceptance-pilot-00005-rab, 100 % regulärer Verkehr, mode=customer | crm-v2/customer-portal/ |

Projekt: lszh-automations. Cloud-Region: europe-west6. Die beiden Cloud-Quellarchive wurden anhand der **Revisionen**, nicht anhand lokaler Vermutungen, aus Cloud Storage gelesen. [Release-Manifest](../releases/production-20261026.json) enthält Image-Digests, Build-IDs, versionierte Archivorte sowie SHA-256 und Länge aller 101 deployten Dateien. Keine Secretwerte, Kundendatensätze oder Vertragsnachweisdateien wurden in diesen Release übernommen.

Der Portalquellstand liegt bewusst unter dem bereits vom öffentlichen Website-Server gesperrten Pfad /crm-v2/ und wird nicht öffentlich als statischer Quellcode ausgeliefert. Die Portaldatei contract-package-publisher.js unterscheidet sich vom neueren CRM-Stand. Beide exakten Deployvarianten bleiben getrennt erhalten. Gemeinsamkeiten sind bewusst dupliziert: Eine automatische Vereinheitlichung würde den tatsächlichen Portalstand verändern. Die Portal-package.json hat ihren eigenen Startbefehl. Das Manifest prüft beide Quellen unabhängig. crm-v2/ enthält zusätzlich die zugehörigen Entwicklungs-, Test- und Hilfsdateien; nur die im Manifest aufgeführten Dateien gehören zum konkret beobachteten Cloud-Quellpaket.

## Funktionen

- Fünf Register: Website Leads, Kunden, Offerten, Rechnungen, Projekte; zusätzlich Cockpit, Suche, Filter und Pagination.
- Google-Anmeldung mit interner Allowlist und serverseitigem Firestore-Zugriff. Produktionspräfix lszh_crm_v2_.
- Website → POST /api/lead → POST /api/internal/website-leads → Firestore, mit bestätigter Speicherung und Wiederholungsschutz. Kein Make/Airtable in dieser Eingabestrecke.
- Leadqualifizierung, Kontaktprotokoll, Wiedervorlagen und Übergänge Neu/Kontaktiert/Qualifiziert/Gewonnen/Verloren. Qualifizierung erstellt einen Offertenentwurf; bewusster Abschluss kann Kunde/Projekt transaktional verknüpfen.
- Automatische Lead-Eingangsbestätigung, interne Neumeldung und 24-Stunden-Erinnerung über Scheduler und Make/Gmail.
- Nummerierte Offerten, Positionen, einmalige/monatliche Preise, PDF, Gültigkeit, Versand und Nachfassen.
- Swiss-QR-Rechnungen, manueller Rechnungsversand, Zahlungen/Teilzahlungen, Restbeträge, Zahlungsrücknahme und manuelle Mahnhistorie. Kein automatischer Bankabgleich nachgewiesen.
- Projekttermine, Status und Aufgaben.

## Vertragsprozess

Gespeicherte gültige Offerte im Status Bereit → bewusste AVV-Einstufung, Dokumentprüfung und private Aufbewahrungsfreigabe → exaktes PDF-Paket archivieren und zurücklesen → Snapshot/Empfänger/Hashes prüfen → einmaliger Versand → unabhängiger Gmail-SENT-Abgleich → persönliche Annahmeeinladung → Anmeldung per E-Mail-Code → geschützte Dokumentanzeige und ausdrückliche Zustimmungen → dauerhafte Kundenantwort und Archivnachweis.

Die Kundenannahme ist von interner Prüfung, schriftlicher LSZH-Auftragsbestätigung und dem manuellen CRM-Gewonnen-Übergang getrennt. Sie erzeugt keine automatische Rechnung oder Zahlung. Interne Prüfung ist aktiviert; schriftliche Bestätigung benötigt weiterhin einen geprüften Bestätigungsdokument-Datensatz und echten Versandnachweis.

Bei AVV-Pflicht ist eine geprüfte kundenspezifische AVV mit ausgefüllten Anlagen A/B/C erforderlich. Eine allgemeine Rahmenvorlage reicht nicht. Geschäftliche Freigabe und technische Funktion sind kein Nachweis unabhängiger juristischer Prüfung.

## Aktive Make-Verbindungen

Team 1728770, Zone eu1.make.com. Geschäftliche Gmail-Verbindung 11904991 und Drive-Verbindung 11904271 wurden mit Status ok gelesen. Webhook-URLs gehören ausschliesslich in Secret Manager.

| Szenario | Aufgabe |
| --- | --- |
| 8135270 | Lead-Kundenbestätigung, interne Neumeldung, 24h-Erinnerung; Name enthält historisch INAKTIV, tatsächlicher Status aktiv |
| 8144117 | Manueller Offerten-/QR-Rechnungsversand |
| 8175919 | Vertragspaket mit 2/3 PDFs |
| 8176906 | PDF-Originalarchivierung und gezieltes Dienstkonto-Leserecht |
| 8177143 | Persönliche Einladung nach unabhängig bestätigtem Paketversand |
| 8176927 | Kunden-Anmeldecode |
| 8176103 / 8176104 | Produktions-Nachweisdatei reservieren/speichern |
| 8176339 | Archivmetadatenbrücke, trotz historischem Pilotnamen auch für contract_v1 |

Die älteren aktiven Stagingstrecken 8175404, 8175437 und 8175440 bleiben erhalten. Produktive Schutzclaims, Provider-Receipts und Einmalsperren niemals zur Wiederholung eines Versands löschen.

## Hintergrundbetrieb und Speicher

- Scheduler lszh-crm-v2-mail-tick: jede Minute, /api/internal/mail/tick.
- Scheduler lszh-customer-acceptance-pilot-archive: alle 15 Minuten, /internal/archive-tick.
- Gleichnamige Staging-Archivstrecke separat aktiv.
- Geschäftliches Produktionsarchiv in Drive: 10VD4xYIxfQBJ9Q5wpGq3iflK4MNJ1PHN; Eigentümer lars@lszh-automations.ch. Versendete Originale: Unterordner 1DaUcSCHdBxF42aunDgqqCmdzbdMBFxYe.
- Projektbedingungen v1.0 vom 19.10.2026; AVV v1.0 als kundenspezifisch zu ergänzende Rahmenvorlage.
- Firestore-Datenbanken: (default), lszh-offers, lszh-offers-staging, lszh-quarantine-staging. Nicht alle Zusatzdienste/Datenbanken gehören nachgewiesen zum aktuellen V2-Hauptprozess.

## Konfiguration und Wiederherstellung

Das Manifest nennt nur Secret-Namen/-Versionen. CRM-Vertragskonfiguration verwendet Version 4 von lszh-crm-contract-live-pilot-config; Portal Version 3 von lszh-customer-portal-live-pilot-config. Intake- und Mail-Webhooks verwenden teilweise latest: Das ist eine bestehende mutable Referenz, kein vollständig eingefrorener Konfigurationssnapshot. Vor Wiederherstellung aktuelle Versionen und externe Make-Konfiguration getrennt prüfen.

Alte CRM-Testtags wurden am 26.10. entfernt; Revisionen bleiben erhalten. Aktueller Tag customer-simple; Rückfallzugänge customer-release und pilot-1002 erhalten. Rollback von Anwendungscode setzt Firestore-, Mail- und Archivwirkungen nicht zurück. Neue Pakete und bestehende Sperren müssen kompatibel bleiben.

Eine Bereitstellung erfolgt ausdrücklich **nicht** im Rahmen dieses Release-Abgleichs. Für späteren Wiederaufbau aus crm-v2/ bzw. crm-v2/customer-portal/ dieselben bestehenden Dienstkonten, Secretreferenzen, IAM-Regeln und Laufzeitparameter verwenden; keine allgemeine Deploy- oder Mailfreigabe daraus ableiten. Der unveränderte Image-Digest ist die genaueste Wiederverwendungsreferenz. Portal-Abhängigkeiten werden mit dessen package-lock.json installiert.

## Prüfungen am 26.10.2026

- 101 deployte Dateien anhand SHA-256/Länge zugeordnet; JavaScript-Syntaxprüfung erfolgreich.
- 427 CRM-Regressionsprüfungen bestanden.
- 29 echte lokale Firestore-Emulatorprüfungen bestanden, ausschliesslich demo-lszha-c2-20261025 und 127.0.0.1:8788; einschliesslich paralleler Einladungen und dauerhafter Claims.
- 30 zusätzliche Portalprüfungen gegen die exakte deployte Portalquelle bestanden. Die CRM-HTTP-Suite läuft im CRM-Paket, da sie zusätzlich dessen separaten server.js prüft.
- C3.7.2-Profiljob und C3.7.3-PDF-Readback erfolgreich. Der technische Pilot 1002 ist dokumentiert abgeschlossen. Spätere Paket-/Einladungs-/Codeabläufe haben erfolgreiche Make-Ausführungen.
- Kein neuer Kundenversand, keine Annahme durch den Agenten, keine Datenmigration und kein Produktionsdeploy bei diesem Abgleich.

Lokal reproduzieren:

```text
npm ci --prefix crm-v2 --ignore-scripts --no-audit --no-fund
node scripts/verify-production-baseline.cjs
npm test --prefix crm-v2
node scripts/test-production-portal.cjs
```

Die Workflow-Datei production-baseline.yml führt zusätzlich alle echten Emulatorprüfungen mit Node 24 und Java 21 aus. Cloud-Anmeldedaten sind dafür nicht erforderlich.

## Verbleibende Grenzen / nächste Schritte

1. Historische offene PRs gegen diesen zusammengeführten Stand bewerten; nicht blind nacheinander mergen.
2. Folgeprozess interne Prüfung → schriftliche Bestätigung → bewusster Projektstart → Rechnung fachlich durchgehen.
3. Aktuelle Nutzung alter Onboarding-, Secure-Transfer-, KI-Demo-, Quarantäne- und Zusatzportalstrecken prüfen. Vorhandener Code beweist keinen Produktivbetrieb.
4. Backup/Wiederherstellung, Aufbewahrung, Altbestandsmigration und unabhängige Rechtsprüfung sind durch diesen Release nicht vollständig abgenommen.
5. Kein Cloud-Build erneut ausgeführt: Source-Übereinstimmung ist bewiesen; bitidentischer Neubau trotz externen Buildpacks oder Abhängigkeiten wird nicht behauptet.

Historische Freigabe-/Testprotokolle bleiben als Nachweise erhalten. Dieser Stand korrigiert ihre überholten Aussagen, ohne die damaligen Ergebnisse umzuschreiben.
