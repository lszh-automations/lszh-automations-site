# LSZH Automations – Rechnungsmail-Design und Produktiv-Sicherheitsfreigabe

Stand: 14.10.2026. **Dieser Entwicklungszweig ist NICHT für produktiven Rechnungsversand freigegeben.**

## Vorlagen

- `templates/emails/lszh-internal-qr-test.html`: interne Testmail, mit Make-Variablen aus Szenario 7954469. Fest an `lars@lszh-automations.ch`, keine Kunden.
- `templates/emails/lszh-invoice-customer-draft.html`: **Kundenmail als unverbundene Designvorlage**. Darf nicht ohne vorab geprüfte und HTML-escaped Daten in Make versendet werden.

### Mappings der Kundenmail (noch NICHT technisch angeschlossen)

| Token | Gewünschte Quelle | Prüfung |
|---|---|---|
| `%%KUNDENFIRMA%%` | Rechnungsdatensatz, verknüpfte Kundenfirma | Pflicht; Namensgleichheit mit Rechnungs-PDF, HTML-Escaping |
| `%%RECHNUNGSNUMMER%%` | Airtable Rechnungen.Rechnungsnummer | eindeutig, unveränderlich nach Freigabe, PDF identisch |
| `%%BETRAG_CHF%%` | Airtable Rechnungen.Betrag CHF | Zahl > 0, Rappen = zwei Stellen, PDF/QR identisch |
| `%%FAELLIG_AM%%` | Airtable Rechnungen.Fällig am | valides Schweizer Datum, identisch auf PDF |

Kundenempfänger-Adresse nur aus validierter Kunden-/Auftragskonfiguration übernehmen. **Nicht** Test-/Senderadresse mit Kundendaten überschreiben.

## Produktionsversand – noch offene Pflichtgates

1. Nicht das gesperrte Legacy-Szenario 7781492 verwenden (alte PDF mit QR-Platzhalter).
2. Separate Produktiv-Pipeline, ausdrückliche Freigabe des Kundenbelegs und der Rechnungsart, UID / MWST-Status / Firmen-IBAN prüfen.
3. Einmalige Rechnungs- und Sendeschlüssel mit atomarer Data-Store-Reservierung VOR jeglicher E-Mail-Aktion; kein `overwrite`; Revisionen über neue, klar zugeordnete Belege.
4. PDF-Datei erzeugen, privates Business-Archiv und SHA-256 gegen versendeten Anhang verifizieren, referenzierte Kundenadresse und Betrag mit PDF-/QR-Daten abgleichen.
5. Versandversuch *vor* E-Mail-API-Aufruf mit `Versand unklar – manuell prüfen` in einem unveränderlichen Audit-Verlauf protokollieren; bei Gmail-Timeout/unklaren Fehlern **kein automatisches Retry**.
6. Ausschliesslich nach verifizierter Gmail-API Message-ID auf `Provider bestätigt` und gegebenenfalls `PDF gesendet` wechseln.
7. Testenvoyer und produktiver Empfänger/Daten strikt trennen; Produktivschalter `Rechnungsversand freigegeben` bis zur manuellen Abnahme auf false.
8. Test mit Gmail iPhone Dark Mode, Outlook und Desktop, korrekter Antwortadresse und Absenderidentität; Templates sind HTML ohne pixelgenaue Dark-Mode-Farbgarantie.
9. Rechnungs-PDF mit realem Drucklayout bei 100% prüfen, falls postalischer Versand erfolgt.

## Tests

- Internes Branding HTML-V2 erfolgreich einmal an eigenes Geschäftspostfach zugestellt, PDF/Einmalschlüssel/Archiv bestätigt.
- HTML-V3 verbessert mobile Referenzzeile und reduziert Textmenge; **noch keine bestätigte erfolgreiche Gmail-Zustellung dieser Version**.
- 14.10.2026: Versuch eines internen HTML-V3-Tests wurde vor dem Make-Senden durch eine externe Sicherheitsprüfung blockiert. Make-Ausführungsliste, Data Store und Airtable-Testprotokoll geprüft: **kein HTML-V3-Versand ausgelöst**, keine V3-Reservierung. Beide Make-Szenarien wieder `inactive`. Keine Versandwiederholung ohne klare Freigabe.

**Status Kundenmail:** HTML-Struktur und Platzhalter geprüft, noch unverbundene Vorlage. Keine produktive Rechnungs- oder Email-Freigabe.
