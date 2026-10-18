# LSZH Automations – MVP-Fokus und nächster Pilot

## 18.10.2026 – Geschäfts-Drive: Projektbedingungen als PDF und Google Doc vorhanden

**Die bisherige PDF-Upload-Sperre ist behoben, kein Workaround oder neues Szenario notwendig.** Die bereits im geschäftlichen Drive abgelegte Kundenfassung in Endkontrolle ist nun im Ordner `Projektbedingungen` in zwei Formaten vorhanden und durch erneutes Drive-Ordnerlisting bestätigt:

- [PDF: Projektbedingungen v1.0 RC1 – Endkontrolle, NICHT VERSENDEN](https://drive.google.com/file/d/1jCCNkO_ZQSx70juwCmAK5bEHl3CToXiw/view), ID `1jCCNkO_ZQSx70juwCmAK5bEHl3CToXiw`.
- [Google Doc: Bearbeitbare Projektbedingungen – Endkontrolle](https://docs.google.com/document/d/1gXc0H0d9KnV0mYFI35W7GmA03L38IUuNtvjwkfXntTI/edit), ID `1gXc0H0d9KnV0mYFI35W7GmA03L38IUuNtvjwkfXntTI`.

Beide Dateien gehören zum Geschäftskonto `lars@lszh-automations.ch`, nicht zum privaten Account. **Noch nicht im Online-Kundenprozess eingebunden; keine Make-/Airtable-/Live-Änderung.** Die bestehende PDF-Kundenfassung ist redaktionell gegenüber dem ursprünglichen RC1-Freigabeentwurf bereinigt, daher muss ihre genaue endgültige Textfassung vor Kundenversand nochmals kontrolliert werden. Die geschäftliche Akzeptanz der Vertragsregeln bleibt gültig und wird nicht erneut abgefragt.

**Nächster konkreter Prozessschritt:** Die sechsseitige Original-AVV v0.9 RC1 liegt als DOCX in der ChatGPT-Dateibibliothek vor. Ihre Anlagen A–C enthalten echte projektbezogene Pflichtfelder. **Keine pauschale AVV ohne Kunden-/Projektangaben veröffentlichen.** Einmalige Pilot-AVV mit genau einem synthetischen Auftrag als vollständige PDF-Fixture vorbereiten, später bei echtem Kunden dessen konkreten Auftrag, Systeme, Daten/Empfänger, Regionen, TOM und Subprozessor-Genehmigungen eintragen. Danach bereits vorhandenen Online-Annahmeprozess für `AVV=Ja/Nein` mit echten endgültigen PDF-Datei-IDs verbinden, ohne zusätzliche Make-Szenarien oder G3-Ausbau.

---

## 18.10.2026 – Kundenfassung der Projektbedingungen im Geschäfts-Drive vorbereitet

Der Betreiber hat die Geschäftsbedingungen intern bereits angenommen. Im verbundenen **geschäftlichen** Google Drive wurde ein neues Google Doc im vorhandenen Ordner `Projektbedingungen` erstellt: [LSZH Projektbedingungen v1.0 RC1 – Endkontrolle, NICHT VERSENDEN](https://docs.google.com/document/d/1gXc0H0d9KnV0mYFI35W7GmA03L38IUuNtvjwkfXntTI). Quelle war die vollständige 4-seitige Originalfassung der ChatGPT-Dateibibliothek; 16/16 Abschnitte im Google-Docs-Readback und exportiertem 5-seitigem A4-PDF geprüft. Alte RC1-Entwurfs-Kopf-/Fusszeilen, der alte Freigabehinweis und die ausdrücklichen Formulierungen «Regelvorschlag», «noch zu prüfender Vertragsvorschlag» wurden entfernt, **ohne Care-/Abnahme-/Haftungsparameter materiell zu ändern**. Dies ist eine **neue redaktionell bearbeitete Version** und darf trotz interner geschäftlicher Zustimmung nicht automatisch als rechtlich final und versandbereit ausgegeben werden.

PDF wurde aus dem geschäftlichen Google Doc erzeugt und lokal auf Seitenzahl, vollständige Abschnitte und offensichtliche Entwurfsmarker geprüft. **Ein eigenständiger PDF-Upload in denselben Drive-Ordner war wegen eines Dateiübergabe-Schemafehlers des Google-Drive-Connectors nicht möglich.** Deshalb ist bisher nur das native Google Doc nachweislich im Geschäftsordner, nicht die PDF. Keine Dokument-ID/SHA in Airtable oder Make umgestellt, keine E-Mails, keine Kundenaktion. Nächster praktische Schritt: PDF-Export im Geschäftskonto als eigenständige Datei im Ordner ablegen oder über ein unterstütztes connector-natives Verfahren hochladen, letzten Textabgleich/AVV-Anlagen für konkrete Offerte klären und erst dann den vorhandenen Online-Kundenprozess anbinden. Das bestehende synthetische Browser-/Backend-Modell unterstützt Offerte, Bedingungen und optionale AVV bereits.

---

## Verbindliches MVP-Ziel – Kundin oder Kunde akzeptiert alles online

**Korrektur durch Betreiber am 18.10.2026:** Die Geschäftsbedingungen sind **geschäftlich bereits akzeptiert**. Die drei ursprünglichen Verhandlungspunkte (Care, Abnahme, Haftungsregel) werden **nicht erneut zur unternehmerischen Abstimmung vorgelegt**. AVV RC1 bleibt die früher intern provisorisch akzeptierte Arbeitsversion; ihre Anlagen müssen pro Kunde ausgefüllt werden. Dies ist **keine behauptete anwaltliche Prüfung** und keine automatische Freigabe für reale Online-Vertragsabschlüsse.

**Zielbild:** LSZH versendet einen persönlichen Offertenlink. Der Kunde liest oder lädt **Offerte + Projektbedingungen + (falls für diesen Auftrag erforderlich) AVV einschliesslich Anlagen** herunter. Im selben Browser bestätigt er **jede Unterlage ausdrücklich und separat** sowie seine Vertretungsbefugnis. Der Server protokolliert Identität, Zeitpunkt, zugehörige Dokumentversionen und SHA-256-Hashes; danach werden Status, Annahmebeleg und Bestätigungs-E-Mail über die **bereits vorhandenen** Airtable/Make-Abläufe verarbeitet. AVV=Nein: zwei PDFs. AVV=Ja: drei PDFs; Annahmebeleg später zusätzlich.

**Heute konkret umgesetzt – vorhandene Architektur, keine neuen Szenarien:** `offerte-annehmen/index.html` hat separate verpflichtende Zustimmungen für Offerte, Projektbedingungen und gegebenenfalls AVV. Sowohl `offerAcceptance.js` (Website-Backend) als auch `cloud-run/offer-portal-staging/portalCore.mjs` verlangen diese Eingaben auch serverseitig und vermerken `quote_confirmed`, `terms_confirmed` und bei AVV `avv_confirmed`/AVV-Hash im Annahmenachweis. Browser-, HTTP-, Offline- und Emulator-Tests wurden an das Schema angepasst. Die Annahme bleibt bis zur separaten konkreten Live-Freigabe deaktiviert; kein E-Mail-Versand, kein Kundenvertrag, kein Cloud-Deployment.

**Nur noch echte Go-Live-Abhängigkeiten:** (a) geschäftlich akzeptierte Fassungen als exakt benannte Kunden-PDFs ins **geschäftliche** Drive übernehmen; (b) formale rechtliche Prüfung und AVV-Anlagen je Kundenfall sowie verbindliche Dokumentversion klären, ohne die akzeptierten Geschäftsregeln erneut zu verhandeln; (c) einen kontrollierten End-to-End-Pilot und danach separate Autorisierung für echte Annahme und Versand. **G3/Pub/Sub/Canary ist nicht Voraussetzung für die erste benutzbare Online-Annahme.**

---

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

**Historische ursprüngliche Geschäftsregeln (inzwischen intern vom Betreiber akzeptiert):** Care-Kündigung 30 Tage zum Monatsende; Abnahme zehn Arbeitstage ohne automatische Schweigeabnahme; entworfene Haftungsbegrenzung auf betroffene zwölfmonatige Vergütung mit mindestens CHF 2'000. Die frühere juristische Prüfempfehlung zur Haftung ist keine erneute geschäftliche Grundsatzentscheidung. Die vertragliche Rechtsprüfung vor Echtnutzung bleibt getrennt.

**AVV für den ersten Pilot:** Anlagen A–C enthalten noch kundenspezifische Platzhalter. Ob AVV Ja/Nein für die konkrete Leistung notwendig ist, hängt von echten Datenflüssen/Rollen ab und wird nicht automatisch vom UI entschieden. Vor Nutzung sind Unterauftragsbearbeiter, Datenregionen, Verantwortlichkeiten, Löschfristen und Kunde zu konkretisieren.

**Geschäftliches Archiv:** Der tatsächliche Geschäfts-Drive-Ordner `Projektbedingungen` wurde am 18.10.2026 gelesen und war leer. Die aus der Bibliothek wiedergefundenen Entwürfe wurden **nicht** automatisch als freigegebene Kundenverträge hochgeladen oder in Make aktiviert. Sobald die Originalbytes ins Geschäftsarchiv übernommen werden, müssen sie klar als `ENTWURF_NICHT_VERSENDEN` gekennzeichnet bleiben, bis eine konkrete Unternehmerentscheidung und die rechtliche Abnahme erfolgt sind.

**Praktische Folge:** Kein Neuverfassen von Projektbedingungen oder AVV nur wegen des Dateifundorts. Erst offene Entscheidungen in den gefundenen Originalen klären; dann finalen Text und Archiv vorbereiten. Bis dahin vorhandene Make-Offertenszenarien unverändert lassen.

---

## Die nächsten drei Arbeiten – genau in dieser Reihenfolge

**1. RC1/AVV-Originale und offene Geschäftsentscheide (G2).**
Die bereits intern akzeptierten Geschäftsbedingungen als Kunden-PDF vorbereiten und im Geschäftskonto archivieren; AVV-Anlagen pro Auftrag ergänzen. Die erforderliche juristische Endprüfung und tatsächlichen Dokumentversionen vor Echtnutzung dokumentieren. **Keine Wiederholung der längst getroffenen Geschäftsentscheidungen.** Kein bisheriges TEST_ONLY-Dokument stillschweigend als echt markieren.

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
