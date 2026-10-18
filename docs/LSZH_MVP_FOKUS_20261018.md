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
