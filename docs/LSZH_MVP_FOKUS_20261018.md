# LSZH Automations – MVP-Fokus und nächster Pilot

**18.10.2026 | Verbindliche Arbeitspriorität aus Betreiberfeedback:** Zielorientiert zum benutzbaren Kundenprozess. Keine zusätzlichen Sicherheits-Subsysteme ohne nachweisbaren Nutzen für den nächsten Pilot. Bestehende Datenschutz- und Produktivsperren bleiben erhalten.

## Das Produkt, das wir jetzt fertigstellen

**Ein vollständiger Offertenablauf für einen Schweizer KMU:**
Offerte in Airtable vorbereiten → PDF im **geschäftlichen** Drive archivieren → persönlicher Prüflink und Unterlagen → AVV optional Ja/Nein → Annahme und Beleg → Status in Airtable → Bestätigung an den Kunden **erst nach ausdrücklichem Go-Live-GO**.

**Definition of Done:** Ein einziger fiktiver, durchgängiger Testfall (beide AVV-Varianten) muss von der Offertenanlage bis zum korrekten Beleg-/Status-Resultat nachvollziehbar funktionieren. Danach müssen die echten Vertragstexte inhaltlich freigegeben und ein begrenzter Pilot entschieden werden. Keine neue Integrationsplattform als Selbstzweck.

## Tatsächlicher Iststand, heute erneut mit verbundenem Make geprüft

| Bestehender Baustein | Make-ID | Stand |
| --- | --- | --- |
| Offerten-PDF, Archiv und Versand | 7835460 | Vorhanden, inaktiv; Trigger und Gmail-Pfad gesperrt |
| Persönlicher Annahmelink, AVV Nein | 7940261 | Vorhanden, inaktiv; Trigger und Gmail-Pfad gesperrt |
| Annahmebeleg und Bestätigung, AVV Nein | 7940220 | Vorhanden, inaktiv; Claim-Modul 2 und Gmail-Modul 8 über `0=1` gesperrt |
| Annahmelink mit 3 PDFs, AVV Ja | 7965215 | Vorhanden, inaktiv; Trigger und Gmail-Pfad gesperrt |
| Annahmebeleg mit 4 PDFs, AVV Ja | 7965223 | Vorhanden, inaktiv; Claim- und Gmail-Pfad gesperrt |

**Portal:** Browser-Oberfläche, synthetische AVV-Ja/Nein-Strecken und Offline-/Emulatortests bestehen. Staging ist keine freigegebene rechtswirksame Kundenannahme.

**Geschäftliches Drive:** Suchlauf am 18.10.2026 nach `AVV RC1`, `Projektbedingungen v1.0`, `RC1` und `LSZH Projektbedingungen` ergab TEST_ONLY-/STAGING-Dateien, ein ALT-Freigaberegister und Entwurfsdateien. **Kein eindeutig identifiziertes, final juristisch/geschäftlich freigegebenes RC1-Original-Paar.** Das ist ein konkreter Entscheidungsblocker, nicht Anlass für neue IAM- oder G3-Tests.

## 18.10.2026 – RC1-Originalentwürfe wiedergefunden (keine Neuentwicklung nötig)

Die damals aus den Gesprächen entstandenen drei **Originalentwürfe** befinden sich in der ChatGPT-Dateibibliothek (nicht automatisch im geschäftlichen Google Drive):

- `LSZH_Projektbedingungen_v1_0_RC1_Freigabeentwurf.pdf`: vollständige vierseitige Projektbedingungen Version 1.0 RC1 vom 13.10.2026.
- `LSZH_AVV_v0_9_RC1_Freigabeentwurf.docx`: vollständige sechsseitige AVV v0.9 RC1, einschliesslich Anlagen A (Daten), B (TOM) und C (Unterauftragsbearbeiter).
- `LSZH_Geschaeftsbedingungen_Entscheidungsblatt_RC1.docx`: einseitiges ursprüngliches Entscheidungsblatt. Ebenfalls vorhanden: `LSZH_Freigabemappe_RC1_Entscheidungsvorlage.pdf`.

**Konkrete noch nicht gefällte Geschäftsentscheide:** (1) Care-Kündigung: 30 Kalendertage zum Monatsende, vorbehaltlich gesetzlicher Rechte; (2) Kundenabnahme: zehn Arbeitstage, keine automatische Abnahme durch Schweigen; (3) Haftungsbeschränkung: bei leichter Fahrlässigkeit Entgelt der letzten zwölf Monate für die betroffene Leistung, jedoch mindestens CHF 2'000. **Insbesondere Punkt (3) war im ursprünglichen Entscheidungsblatt ausdrücklich zur Überarbeitung / juristischen Prüfung empfohlen.** Keine dieser Regeln gilt als freigegeben.

**AVV für den ersten Pilot:** Anlagen A–C enthalten noch kundenspezifische Platzhalter. Ob AVV Ja/Nein für die konkrete Leistung notwendig ist, hängt von echten Datenflüssen/Rollen ab und wird nicht automatisch vom UI entschieden. Vor Nutzung sind Unterauftragsbearbeiter, Datenregionen, Verantwortlichkeiten, Löschfristen und Kunde zu konkretisieren.

**Geschäftliches Archiv:** Der tatsächliche Geschäfts-Drive-Ordner `Projektbedingungen` wurde am 18.10.2026 gelesen und war leer. Die aus der Bibliothek wiedergefundenen Entwürfe wurden **nicht** automatisch als freigegebene Kundenverträge hochgeladen oder in Make aktiviert. Sobald die Originalbytes ins Geschäftsarchiv übernommen werden, müssen sie klar als `ENTWURF_NICHT_VERSENDEN` gekennzeichnet bleiben, bis eine konkrete Unternehmerentscheidung und die rechtliche Abnahme erfolgt sind.

**Praktische Folge:** Kein Neuverfassen von Projektbedingungen oder AVV nur wegen des Dateifundorts. Erst offene Entscheidungen in den gefundenen Originalen klären; dann finalen Text und Archiv vorbereiten. Bis dahin vorhandene Make-Offertenszenarien unverändert lassen.

---

## Die nächsten drei Arbeiten – genau in dieser Reihenfolge

**1. RC1/AVV-Originale und offene Geschäftsentscheide (G2).**
Die letzten real vorgesehenen Projektbedingungen und AVV samt Anlagen im Geschäftskonto identifizieren oder dort als Entwurf bereitstellen. Versionen, Leistungs-/Haftungsgrenzen, AVV-Erforderlichkeit und Vertragsschluss prüfen; nach juristischer Prüfung und Unternehmerentscheid die genauen finalen PDFs festlegen. Kein bisheriges TEST_ONLY-Dokument stillschweigend als echt markieren.

**2. Ein einzelner kompletter Offerten-Pilot mit ausschliesslich erfundenen Daten.**
Vorhandene Make-Szenarien, Airtable und bestehende PDF-Archivierung verwenden; **keine neuen Szenarien**. AVV-Nein und AVV-Ja je einmal vollständig prüfen, inklusive Statusführung, korrekter PDF-Anzahl und einem Annahmebeleg. Bis zur gesonderten Autorisierung bleiben alle bisherigen Aktivierungs-, E-Mail- und Vertragsannahmesperren bestehen. Noch offene echte Cloud-/Write-Schritte nur nach der dafür konkret erteilten Einzelfreigabe.

**3. Begrenzter erster Kunde.**
Nur nach positivem End-to-End-Test, Freigabe der Originalverträge und einer ausdrücklichen Betreiberentscheidung: ein Pilotkunde, ein Make-Konto in dessen eigener Organisation, ein klar definiertes Angebot, Preis, Support und Rückabwicklung. Erst dann die dafür tatsächlich notwendigen Verbindungen/Trigger aktivieren.

## Bewusst auf später verschoben

- **G3 Pub/Sub→Cloud Run und neue Dienstkonten/IAM:** Keine weitere Canary-, Signatur-, Registry-, Provenance- oder zlib-Entwicklung, solange kein ganz konkreter Blocker des Pilotablaufs dies erfordert. Die schon entwickelte Strecke bleibt im Draft, `--apply` weiterhin gesperrt. Die Architekturentscheidung, ob der MVP ohne G3 mit vorhandenen Werkzeugen zuverlässig funktioniert, wird bei Schritt 2 anhand des echten Prozessbedarfs getroffen; das wird nicht ungeprüft vorausgesetzt.
- Cockpit V2, zusätzlicher KI-Funktionsumfang, neue Branchenmodule, separate Produktportale und kosmetische Website-Features: erst nach dem nachweislich benutzbaren Offerten-MVP.
- Keine zusätzliche „Vorsichtshalber“-Prüfliste, ausser ein reproduzierbarer Fehler, ein rechtliches Pflichtfeld oder eine konkrete Datenschutzfrage erfordert sie.

**Arbeitsregel für weitere `Vamos`:** Zuerst das nächste Nutzungsziel, dann der kleinste fehlende konkrete Schritt, dann testen. Keine endlosen Sicherheits-PoCs, keine Wiederholung bereits bestandener Checks. Offene **geschäftliche** Entscheidungen ausdrücklich sichtbar machen statt mit Technik zu umgehen.

**Unverändert:** PR #5 Draft, kein Merge; keine echten Kundenmails/Verträge ohne Betreiber-Go; ausschliesslich Geschäfts-Drive; Make-Szenarien inaktiv und vorhandene `0=1`-Gates aktiv.
