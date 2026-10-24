# LSZH Automations – Bestandsaufnahme Offerten- und Vertragsversand V1

**Stand:** 25.10.2026. **Art:** Read-only Bestandsprüfung von CRM V2, verbundenem Make-Szenario sowie dokumentiertem Annahme-/Archiv-STAGING. **Keine technische oder juristische Freigabe** für neue externe Vertragsunterlagen. Keine produktive Sendung, Aktivierung, Datenmutation oder Live-Deployment im Rahmen dieser Prüfung.

## 1. Geprüfte aktuelle Quellen

- CRM V2 Branch `feature/crm-v2-read-performance-20261024`: `crm-v2/offer-send.js`, `offer-pdf.js`, `offer-mail.js`, `cloud-records.js`, `server.js` und ergänzende Handoff-/Projektstand-Dokumentation.
- Aktuell über die Make-Verbindung gefunden und gelesen: Szenario **8144117** `LSZH CRM V2 – Offerten & QR-Rechnungen (manuell)`; Zustand **active**, Trigger **webhook**, Gmail-Verbindung **ok**. Modul 2 und Modul 3 inklusive konkreter Anhang-/Receipt-Mappings read-only geprüft.
- Frühere technische Nachweise vom 14./15.10.2026: `LSZH_RC1_KLAUSELPRUEFUNG_UND_SYNTHETISCHER_ANNAHMETEST_20261014.md`, `LSZH_OPTIONALE_AVV_ANNAHME_TECHNIKTEST_20261014.md`, `LSZH_ANNAHMEBELEG_WIEDERANLAUF_STAGING.md`, `LSZH_GOOGLE_ARCHIVE_READER_RENDER_STAGING_20261015.md`.
- **Einschränkung:** Original-PDFs/DOCX von Projektbedingungen RC1 und AVV RC1 konnten in dieser Prüfung nicht direkt erneut eingesehen werden; inhaltliche RC1-Aussagen beruhen auf den dokumentierten Prüfprotokollen. Historisch erwähnte Make-Szenarien 7835460, 7940261, 7940220, 7965215 und 7965223 wurden über das aktuell verbundene Make-Team nicht erneut gefunden; deren aktueller Zustand bleibt **nicht unabhängig bestätigt**. Auch aktueller Deployment-/Traffic-Status des separaten Cloud-Run-Offertenportals bzw. Render-Annahme-STAGING ist hier nicht live verifiziert.

## 2. Bestätigte Funktionen und Lücken

| Gegenstand | Befund | Konsequenz |
|---|---|---|
| CRM-Offerte | Nummerierung, gespeicherter Entwurf, `Bereit`, manueller Versand, Gmail-Nachweis, `Versendet`, Nachfassen und manuelles Annehmen/Ablehnen vorhanden | Weiterverwenden, nicht neu bauen |
| CRM-Emissionsweg | `offer-send.js` erzeugt aus gespeichertem Snapshot eine Offerten-PDF und schickt **ein** `pdfFilename`/`pdfBase64` an Make | Vertragsanlagen derzeit nicht im produktiven CRM-Sendepfad |
| Live-Make-Szenario 8144117 | Webhook → Gmail-Sende-Modul 2 → Webhook-Response 3, Gmail-Attachments-Array derzeit genau **ein** Eintrag `toBinary(1.pdfBase64; "base64")`; Antwort enthält `ok`, `eventId`, `messageId` | Mehrdokumentige Übertragung erst mit rückwärtskompatibler Staging-Prüfung; aktiven Filter nicht ohne Test ändern |
| Versand-Recovery | Firestore-Transaktion reserviert einen Sendversuch; nur bestätigter Message-ID-Receipt führt zu `Versendet`; unklarer Zustand wird `manual_review` und nicht automatisch wiederholt | Deduplizierungs-/Reconciliation-Verhalten beibehalten |
| Inhalt Offerte | PDF und Mail tragen LSZH Invest GmbH als Rechtsträger, keine MWST, getrennte Einmal-/Monatspreise, **unverbindlich, schriftliche Auftragsbestätigung vorbehalten** | Vertragsannahme im Browser darf nicht stillschweigend als rechtswirksamer Auftrag oder LSZH-Auftragsbestätigung behandelt werden |
| Vertragsdokumente RC1 | Projektbedingungen v1.0 RC1 (4 S.) und AVV v0.9 RC1 (6 S. inkl. Anlagen A–C) als Arbeitsentwürfe historisch geprüft; keine externe rechtsgeprüfte Schlussfassung | Bis endgültiger Freigabe ausschliesslich interne/synthetische Vertragstests |
| AVV-Auswahl | Historische AVV-Steuerung `Ja`, `Nein`, `Prüfen` für Airtable-STAGING, Ja = 3 Dokumente + gesonderte Zustimmung, Nein = 2 Dokumente, Prüfen = blockiert | Dieses Regelwerk in CRM V2 neu anbinden, nicht unauditiert Airtable als zweite Vertragswahrheit verwenden |
| Annahmeportal und Archiv | Separate ältere Website-/Make-/Airtable-/Drive-Teststrecken mit Token, SHA-256, Archivbeleg und synthetischen Dokumenten; keine nachgewiesene integrierte CRM-Firestore-Produktivannahme | Heute **keine** automatische Ende-zu-Ende-Verbindung von produktiver CRM-Offerte zu rechtlich freigegebener Online-Annahme behaupten |
| CRM-Zustandsmodell | `win()` setzt `Angenommen`, Kunden-/Projektanlage und Lead `Gewonnen` in einer Transaktion | Im neuen Online-Flow erst nach Beweissicherung, internem Freigabegate und tatsächlicher schriftlicher Auftragsbestätigung aufrufen |

## 3. Verbindliche Architekturentscheidung für die nächste technische Phase

**CRM V2/Firestore bleibt das führende System für neue Offerten und deren Status.** Make/Gmail bleibt Versandtransport; Google Drive (Geschäftskonto) archiviert unveränderliche Dokumentversionen und deren Nachweise. Frühere Airtable-/Make-Online-Annahmepfade dienen als technische Referenz, werden aber nicht parallel produktiv aktiviert. Diese Integrationswahl muss vor dem technischen Go-live nochmals an den tatsächlichen Komponenten geprüft werden.

Zielabfolge (zunächst nur mit synthetischen Daten):

1. Offerte als `Bereit` prüfen; AVV-Klassifizierung `Ja`/`Nein`/`Prüfen` explizit, wobei `Prüfen` sperrt. Projektbedingungen-/AVV-Originale bleiben bis zur abschliessenden Prüfung **nicht freigegeben**.
2. Gültige Dokumentversionen samt Dokumenttyp, Version, SHA-256, Archivdatei-ID und Angebots-Snapshot dauerhaft und idempotent verknüpfen; unveränderliche versendete Pakete bilden. Für Tests ausschliesslich klar markierte `TEST_ONLY`-PDFs.
3. Ein manueller CRM-Klick sendet ein gebündeltes Paket: Offerte + Projektbedingungen; falls AVV erforderlich ist zusätzlich kundenbezogene AVV (Anlagen A–C). Mail und PDF-Inhalt stimmen über dieselbe Versandversion überein; keine eigene Automatik und keine Aktivierung im Live-Make vor Staging-Abnahme.
4. Gmail-Receipt (`eventId`/`messageId`) eindeutig verknüpfen, keine automatische Wiederholung im unklaren Lieferstatus; Versandversion revisionssicher referenzieren. SHA-256 ist Integritätsnachweis, Drive-Content-Restriction allein ist **kein** vollwertiges unveränderbares Beweisarchiv.
5. Online-Portal zeigt genau die versandten Fassungen, eine bewusste Kundenhandlung, Vollmacht-/Berechtigungsprüfung, AVV-Ja-Zustimmung separat; Token einmalig, zeitbegrenzt, serverseitig geprüft. `Prüfen`, fehlende Versionen, Hash-Unstimmigkeit und abgelaufener Link stoppen fail-closed.
6. Nachweis mit Zeitpunkt, angebotener Dokumentliste, Inhaltshashes, Identitäts-/Berechtigungsprüfung und Zustimmungsart verknüpfen. Kunde-Akzeptanz ist zunächst `Kundenannahme eingegangen`/`interne Prüfung`; erst nach ausdrücklicher schriftlicher Auftragsbestätigung von LSZH erfolgt rechtsverbindliche Umsetzung der vereinbarten Vorbehaltslogik und danach das bestehende CRM-`Angenommen`/`Gewonnen`-Verfahren.

## 4. Bereits geschäftlich festgelegte D1–D3 (nicht erneut als offene Wahl vorlegen)

- **D1 Care-Kündigung:** 30 Kalendertage zum Monatsende, soweit vereinbart.
- **D2 Werkabnahme:** 10 Arbeitstage zur Prüfung, **keine** automatische Abnahme durch Schweigen.
- **D3 Haftungslogik:** leichte Fahrlässigkeit, unmittelbare/vorhersehbare Schäden, Vergütung der betroffenen Leistung der letzten 12 Monate, mindestens CHF 2'000; **juristische Angemessenheit und Wirksamkeit offen**.
- Der Geschäftsführer hat die juristische Endprüfung ausdrücklich auf einen Zeitpunkt **vor echtem Kundeneinsatz** verschoben. Entwürfe und technische Testannahmen dürfen nicht als rechtliche Freigabe, echte Unterschrift oder Kundenannahme dargestellt werden.

## 5. Priorisierte Umsetzung in isoliertem Staging

**Phase A – Schnittstellenvertrag/Beweisdatensatz:** Ein von CRM geführtes `offerPackage`-Schema und Statusmodell definieren; Metadaten, Dokumenttypen, AVV-Gating, idempotente IDs, Fehler-/Wiederanlaufkriterien mit Tests. **Keine** Live-Dokumente, Kundenmails oder Datenmigration.

**Phase B – Testversand 2/3 PDFs:** Unveränderte CRM-Mail-/PDF-Optik übernehmen, erweiterte Attachment-Struktur erst mit Staging-/Mock-Gmail testen. Negativtests für falsche Empfänger, vertauschte PDFs, doppelte Nachrichten, fehlende AVV, beschädigte Hashes und verlorene Provider-Antwort.

**Phase C – Annahme/Belege:** Vorhandene gesicherte Portal- und Archivkomponenten adaptieren; Firestore-zentrierte Korrelation statt doppelter Airtable-Statusführung; Token- und Manipulations-/Replaytests; Rechtstrigger und explizite LSZH-Bestätigung getrennt halten.

**Phase D – Freigabe:** Geschäftsfreigaben/Dokumentidentität pro Kunde, juristische Schlussprüfung RC1 und konkrete AVV-Anlagen, Dienstkonto-/Archivrechte, tatsächlicher 0%-End-to-End-Test, manuell bestätigter Produktiv-Cutover mit Rollback. Bis dahin keine externe Vertragsannahme oder Kundenmails aus neuen Pfaden.

## 6. Konkreter nächster Entwicklungsschritt

Zuerst **Phase A**: den CRM-V2-Angebotspaket-Vertrag (schema + reine Validatoren + Tests) im separaten Feature-Branch implementieren. Bestehender produktiver Einzel-PDF-Versand darf dadurch **nicht verändert** werden. Erst wenn 2-/3-Dokument-Pakete und ihre Status-/Nachweissemantik deterministisch getestet sind, wird die Make-Anbindung erweitert.
