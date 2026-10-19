# LSZH Automations – Produktionsbereitschaft

Stand: 19.10.2026 (Europe/Zurich). Diese Liste bereitet einen begrenzten Produktivstart vor. Sie ist kein Go-live und erteilt keine Versand-, Vertrags- oder Kundenfreigabe.

## Aktueller Stand

AVV Nein/Ja wurden bereits synthetisch end-to-end über Cloud Run, Firestore, Airtable und Make-Belegablage geprüft. **Neu am 19.10.2026:** Die beiden bestehenden Make-Bestätigungsszenarien haben aus je einem *künstlich angenommenen* TEST_ONLY-Airtable-Record automatisch den Annahmebeleg als PDF erzeugt, im geschäftlichen Drive archiviert, die Beleg-ID in Airtable geschrieben, 3/4 PDFs intern über Gmail verschickt und anschliessend den Versand-Zeitstempel in Airtable eingetragen. Beide Szenarien danach wieder deaktiviert, ohne offene Modulfehler. Es wurden keine Kundenmails versandt; eine neue Browser-Annahme war nicht Bestandteil dieser zwei Mail-Integrationsläufe.

Die geprüfte Cloud-Run-Anwendung ist ausdrücklich auf Staging und synthetische Offerten festgelegt: Staging-Projekt/Dienst, Test-Datenbank und Test-Collection, synthetische Airtable-Quelle und Testversionen. Kundenroute und produktiver Identitätsnachweis sind nicht als produktiv freigegeben. Daher ist die bestehende Anwendung kein Produktionskandidat, den man nur durch Einschalten eines Flags umstellt.

## Erforderliche Arbeit in dieser Reihenfolge

| Reihenfolge | Ergebnis | Konkrete Arbeit |
| --- | --- | --- |
| 1. Produktarchitektur | Bestehende Systeme gezielt für Kunden konfiguriert | Cloud Run, Firestore, Airtable, Make und Geschäfts-Drive weiterverwenden, statt ohne Bedarf eine zweite komplette Infrastruktur zu bauen. Vor echten Daten Produktiv-Konfiguration, Zugriffstrennung von Testdaten, Secret-Zugriffe, Verantwortliche und minimale Wiederherstellung festlegen. Kein blindes Umstellen des aktuell synthetischen Stagingdienstes. |
| 2. Produktionsimplementierung | Cloud-Kundenbasis bereitgestellt, Annahme weiterhin AUS | Cloud Run `lszh-offer-portal` Revision `00002-4zw` in `europe-west6` mit eigenem Servicekonto und benannter Firestore-DB `lszh-offers` erstellt. Privat und durch `LSZH_PORTAL_PRODUCTION_ENABLED=false` gesperrt. Noch echte Domain, Secrets, kundenspezifische Daten, API-Funktionstest und Erstabnahme offen. |
| 3. Fehlerkonsistenz | Kontrollierter Wiederanlauf | Annahme einmalig/idempotent speichern. Firestore und Airtable sind keine gemeinsame atomare Transaktion: Statusmodell für manual_review_required, Duplikatvermeidung, abgestimmte Wiederaufnahme und Alarmierung implementieren und testen. |
| 4. Kundendokumente | **Geschäftlich geprüfte Projektbedingungen fertig**, AVV-Rahmen geprüft, Kundenanlagen offen | Version 1.0 Projektbedingungen als separates finales PDF `1d-EEo4AjsZBWvlYPlZLxxXuXJDBz7hWX` im geschäftlichen Produktionsarchiv. AVV-Master v1.0 ohne Testkunde als PDF `1MhQvRxB_OsiBhLXSkGeVL-jGutO3vM8x` vorhanden, **nicht ohne kundenindividuelle genehmigte Anlagen A/B/C versenden**. Beide PDF-Hashes im [Freigaberegister](LSZH_VERTRAGSFREIGABE_20261019.md), Drive-ContentRestrictions/-Hash-API-Endabnahme noch offen. |
| 5. Make und E-Mail | Pilotkonfiguration vorbereitet, noch inaktiv | **Bisher live bestanden:** Zwei rein interne 3/4-PDF-Automatiktests. **Neu konfiguriert:** Beide bestehenden Make-Szenarien wählen später freigegebene echte Airtable-Offerten, versenden an die bestätigte und mit Lead-E-Mail übereinstimmende Kundenadresse und legen Belege im Geschäftsarchiv ab. Neue Konfiguration noch nicht live mit Kundendaten getestet; Szenarien deaktiviert, Fehler-Wiederanlauf und Pilot-GO noch offen. |
| 6. Abnahme | Nachweisbarer Freigabestand | Tests für AVV Nein/Ja, abgelaufene/ungültige Links, doppelte Annahme, Airtable-Ausfall, Make-Ausfall, Drive-/PDF-Fehler, E-Mail-Fehler, Wiederanlauf und Audit-Readback in einer getrennten Produktionsvorbereitung bestehen lassen. Geheimnisse, personenbezogene Testdaten und Mailzustellung gesondert kontrollieren. |
| 7. Begrenzter Start | Ein benannter Pilotfall mit Rückfallplan | Verantwortliche, Supportweg, Beobachtungszeit, Erfolgskriterien und Rückfall auf manuelle Abwicklung festlegen. Erst nach bestandenem Abnahmesatz Dienste/Trigger für den konkreten Pilotfall aktivieren. |

## Konkret veränderte Systeme (19.10.2026)

- Make `7940220` und `7965223`: kundenbezogene Freigabe-/Empfänger-/Archivkonfiguration gesichert, beide **inaktiv**. Kein Produktivversand aktiviert.
- GitHub-Featurebranch `feature/optional-avv-acceptance-staging-20261014`: neuer Ordner `cloud-run/offer-portal-production/` mit Kunden-Airtable-Mapper, Firestore-Source-Index/Einmalannahme, post-commit Airtable-Writeback, Functions-Framework-Kundendienst/Config, Dockerfile, Einmal-Link-Issuer mit Dry-Run und [Pilot-Runbook](../cloud-run/offer-portal-production/README.md). `portalCore.mjs` zusätzlich mit `productionOnly`-Gate. Code/CI plus **deaktivierter, IAM-privater Cloud-Run-Kundendienst** Revision `00002-4zw`, keine Kundenannahme aktiviert. Die bisherigen Staging-Restriktionen bleiben wirksam. Github-Actions-Run `39183314447`: vier Jobs erfolgreich, inklusive Offline-Customer-Image-Build.
- Airtable-Readback: 19 Offerten, 0 zugleich rechtlich und für Echtbetrieb freigegebene Datensätze. Kein vorhandener Datensatz darf als erste echte Kunden-Offerte ausgegeben werden.

## Bereits belegte Punkte

- Beide synthetischen Varianten AVV Nein/Ja wurden erfolgreich angenommen und in Firestore sowie Airtable zurückgelesen.
- Für beide Varianten wurden TEST_ONLY-Belege in Google Drive erzeugt und mit Airtable verknüpft.
- Separater einmaliger Make-Mailtransporttest an die private Outlook-Adresse des Betreibers erfolgreich (Szenario `8038287`, danach inaktiv; Gmail-Message-ID `1a1517624c90bef0`). Das belegt den Gmail-Transport samt Absenderalias. Die produktiven Offerten-/Annahmevorlagen, PDF-Anhänge und Kundenempfänger sind damit nicht getestet.
- **Interner PDF-Mailtransport erfolgreich:** On-demand-Szenario `7965246` lud unverbindliche PDFs aus dem geschäftlichen Drive und versandte via Gmail einmal drei Anhänge (AVV Nein, Ausführung `c463db431a3d45f086496da9d80a9e12`, SENT-ID `1a151831230512c5`) sowie einmal vier Anhänge (AVV Ja, Ausführung `dd3d356c56674c1ba3065ae62259a8a1`, SENT-ID `1a15182409e89326`), jeweils an die intern freigegebene Outlook-Testadresse. Beide Läufe ohne Modulfehler; Szenario anschliessend wieder deaktiviert. Keine separate Outlook-Zustellbestätigung, keine echte Kundenmail; automatischer Offerten-/Bestätigungspfad bleibt deaktiviert.
- Temporärer Cloud-E2E-Tag und zwei Testrevisionen wurden bereinigt; temporäre Secret-Zugriffe entfernt; Browser-Demo blieb zu 100 % auf der bisherigen Revision.
- **Automatischer Beleg-/Mail-/Statuslauf (19.10.2026) bestanden:** AVV Nein – Szenario `7940220`, Ausführung `f03f6a802cc44ad7a4b5a68f2aa57890`, 15/15 Module, Testrecord `recv60SR0Z56HdvEH`, Beleg `1BUbH2z8fE4Cj4--VXgCOb4JQB27a8L3C`. AVV Ja – Szenario `7965223`, Ausführung `bc6556aecd2b4a1fbd24e420b64280a6`, 17/17 Module, Testrecord `recGS5AYl6yqFbzvr`, Beleg `1DcVoZlm3bexNxMzjqPm8SwuHEAdJDRw6`. Beide Testrecords haben Beleg-ID und E-Mail-Versandzeitstempel; feste private Outlook-Testadresse als Empfänger; beide Szenarien nach dem Lauf wieder inaktiv. Keine Kundendaten, keine Browser-Neuannahme.

## Startkriterium

Produktionsstart erst mit finalen Kundenunterlagen, aktiv verbundener und eindeutig geschützter Kundenroute (Airtable→Firestore→Airtable), verifizierter Kundenzuordnung, Fehler-/Wiederanlaufplan und einem begrenzten Piloten. Die bestehende Infrastruktur darf dafür genutzt werden, sofern Test- und Kundendaten sowie Zugriffsrechte sauber getrennt sind. Die automatischen Make-Live-Tests belegen den internen synthetischen Prozess, noch keinen echten Kundenabschluss.
