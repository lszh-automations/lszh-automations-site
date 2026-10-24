# LSZH CRM V2 – Rechnungsabwicklung: Zahlungsstatus, Buchung, Mahnwesen

Stand 24.10.2026 – **QA im GitHub-Branch, KEIN produktiver Deploy**.

## Ausgangslage
- Nutzer bestätigt am 24.10.2026: synthetische Rechnungsmail im Outlook-Postfach angekommen, LSZH-Design passt, der Test funktioniert. Betrifft ausschliesslich die zuvor genehmigte `TEST_ONLY`-Rechnung RE-9099999, **nicht** einen realen Kundenversand.
- Vorheriger bestätigter Produktivstand laut CRM-Handoff: Cloud Run `lszh-crm-v2-00043-wur` (100%), separater Invoice-Mail-Kandidat `00045-lec` (0%). Invoice-Mail-Gates bleiben ohne gesondertes Go-live geschlossen; kein Live-Deploy oder Mail-Gateway-Event durch diese Arbeit.
- LSZH Invest GmbH ist nicht MWST-registriert. Keine MWST auf Rechnungen oder Zahlungserinnerungen.

## Neu implementiert (isolierter Branch)
Branch `feature/crm-v2-invoice-settlement-20261024`, aus `feature/crm-v2-cloud-staging-20261023` erstellt.

1. `crm-v2/invoice-accounting.js`: Ganzzahliges Rappen-Rechnen, CH-lokaler Fälligkeitstag, Format-/Kalendervalidierung, Restbetrag und abgeleiteter Anzeigestatus `Überfällig` (der gespeicherte Buchungsstatus bleibt `Offen`/`Teilbezahlt`).
2. `cloud-records.js`: Firestore-Transaktionen für manuelle Teil-/Vollzahlungen mit `paymentHistory`, Betrag, Valutadatum, Methode, Referenz, Benutzer, Zeitstempel. Status `Teilbezahlt`/`Bezahlt`, `paidAmountCHF`, `outstandingCHF`, `paidAt`. Keine direkte PATCH-Setzung auf bezahlt; nur nach `invoiceDispatchState=confirmed`. Idempotenz via UUID gegen Double-Click/HTTP-Replay und Sperren gegen Überzahlung/doppelte aktive Buchungsreferenz.
3. Korrektur mit `reverseInvoicePayment`: nur mit Grund und UUID; alte Zahlung bleibt als `voidedAt/By/Reason` unverlierbar im Datensatz; aktive Zahlungssumme und Status werden neu berechnet, kein stilles Löschen.
4. `recordInvoiceReminder`: ausschliesslich bereits **extern/manuell verschickte** Zahlungserinnerungen auditieren; nur bei bestätigtem Rechnungsversand, Fälligkeit überschritten und Restbetrag > 0; Stufen `Zahlungserinnerung`, `1. Mahnung`, `2. Mahnung` nacheinander und mindestens sieben Tage Abstand. Kein Make-/Gmail-Aufruf. Keine Mahngebühren.
5. `server.js`: Same-Origin-geschützte OAuth-Routen `POST /api/records/rechnungen/:id/payments`, `/payments/reverse`, `/reminders`; kein schedulerbasierter Schreibpfad.
6. `public/index.html`: tatsächliche Zahlung verbuchen, Zahlungen/Korrekturen und Restbetrag sehen, Fälligkeit/Überfällig-Badge, manuelle Reminder-Textvorschau mit Kopieren, erst **nach externem Versand** protokollieren. Dashboard offene Beträge nach verbleibender Forderung und bezahlte Beträge inklusive Teilzahlungen. Kein automatischer Versand.

## Unabhängig beobachtete QA
- GitHub Actions Workflow `CRM V2 Swiss QR invoice test`, Run `40083793125`, Commit `e364db8f3` (Stand vor dieser Dokumentation): **105/105 CRM-Tests PASS, 0 fehlgeschlagen**.
- Separater Windows-PowerShell-5.1-Parserjob: **PASS**, keine Skripte ausgeführt.
- PDF-A4-/QR-Workflow inkl. Scan **PASS**, Swiss QR **31 Felder**.
- Erfasst sind Tests für sichere Buchung nach bestätigtem Versand, Teilzahlung, Überzahlung, Doppelbuchung, Zahlungs-Korrektur/Reopening, Manuell-Mahn-Idempotenz, 7-Tage-Sperre sowie Browser-Inline-JS-Syntax.
- QA ist kein browserbasierter Auth-/Firestore-E2E auf Cloud Run; kein Kundenkonto und keine Bank tatsächlich angeschlossen.

## Sicherheitsgrenzen und offene Freigaben
- Produktionsrevision, Make-Szenarien, produktive Leads/Offerten und Mail-Cutoff wurden **nicht** verändert. Keine echte Rechnungs-Mail und keine Mahnung an Kunden verschickt.
- `RE-1001` bleibt interne Test-/Eigenrechnung. `RE-9099999` bleibt unzahlbare `TEST_ONLY`-Probe mit öffentlicher Demo-IBAN.
- Nicht vorhanden: Bank-/TWINT-API-Reconciliation; automatische Mahnung; Zahlungseingang ohne belegten Versand; externe automatische Mahngebühren. UI-Rechnungs-PDF wird nach Teilzahlung nicht als neues Restbetrag-QR-PDF angeboten, da der bestehende QR-Zahlteil den ursprünglichen Rechnungsbetrag zeigt.
- Nächste kontrollierte Schritte: 105er CI auf finalem Doc-Commit nochmals prüfen; isolierte Browser-Cloud-Run-QA mit synthetischem Kunden, Zahlungen und Korrekturen, danach separater Rollout mit ausdrücklicher Freigabe und dokumentiertem Rollback. Kein Go-live nur wegen bestandenem Unit-Test.
