# CRM-Versand ohne laufenden Betreiberrechner

Stand 21.10.2026. Entwicklungsbranch, ausschließlich interner Pilot. Keine Kundenannahme, Rechnung oder externe Kundenmail.

## Ergebnis

Die lokale Polling-/Versandbrücke wurde durch den vorhandenen Make-Ablauf ersetzt. Make verarbeitet die CRM-Schnellaktion, liest den aktuellen Datensatz direkt aus Airtable, prüft Pflichtfelder und die feste interne Quelle, reserviert die PDF-Erstellung create-only, erstellt die Offerte, archiviert und sperrt sie, liest beide PDFs erneut und prüft Bytes, Hashes und Ordner. Vor Linkausgabe liest Make dieselbe Offerte nochmals und vergleicht ihren Quellfingerabdruck. Ein kryptografisch zufälliger Code bindet einen unveränderlichen Firestore-Snapshot mit den tatsächlichen Archivbytes. Vor Gmail wird zusätzlich genau ein Mailversuch im vorhandenen Make-Datenspeicher reserviert. Nach bestätigter Gmail-ID folgen Airtable-Rückmeldung und eine create-only Firestore-Versandquittung.

Der dauerhafte Linkdienst `lszh-crm-offer-links` läuft unabhängig vom Surface. Keine Desktop-OAuth-Credentials, kein Airtable-PAT und keine Mail-Funktion im Dienst. Er liest nur die benannte Staging-Datenbank über die bestehende Staging-Dienstidentität. Nur die feste neue interne Testquelle ist zugelassen. Falsche Codes, fremde Origin, beschädigte PDF-Bytes und abgelaufene Snapshots werden abgewiesen. Annahme ist immer gesperrt. Die bestehenden Kunden-/Browser-Staging-Dienste wurden nicht verändert.

## Feste Testquelle und Lauf

- Offerte `recHXC36zyG8o3he3`, Nummer `TEST_CRM_CLOUD_20261021_NO_CONTRACT`; neuer Testlead `recgQ8Crrd3sY0oFu`.
- Einmalig CHF 120, monatlich CHF 0, AVV Nein, TEST_v1.0_RC1. Übernommen=true und Leadstatus Verloren verhindern Kunden-/Auftragsanlage und Vertriebs-Nachfassläufe.
- Make-Szenario `7835460`, Name `LSZH Vertrieb – CRM-Offerte TEST_ONLY Cloud`; bestehende Airtable-, Docs-, Drive- und Gmail-Verbindungen. Neue Firestore-Verbindung `12198232` von Lars autorisiert; keine Client-Secrets oder Tokens exportiert.
- Erfolgreicher vollständiger serverseitiger Lauf `4ea19ef478b94df99e1623572ad91c4f` am 21.10.2026 um 19:29:15 Schweizer Zeit, manuell über Make gestartet: 22 Operationen, keine Modulfehler. Die positive Schnellaktion wurde während der Fehlerbehebung vom Agenten gesetzt; diesen Lauf nicht als unveränderten natürlichen Benutzer-/Zeitplantrigger ausgeben. Kein lokaler Watcher oder lokaler Gmail-Sender beteiligt.
- Gmail-ID `1a15f82ec7bb0ef7`, bestätigter Empfänger `lars@lszh-automations.ch`, Versandquittung 19:29:39 Schweizer Zeit. Gültigkeit des Links bis 28.10.2026, 18:29:34 Schweizer Zeit (Zeitumstellung am 25.10.). Kein Rohcode in der Evidenz.
- Unabhängiges erneutes Lesen bestätigt Firestore PROVIDER_CONFIRMED, Gmail SENT und exakten Empfänger, gebundenen Snapshot mit passenden Archivbytes sowie Airtable Versendet / Versandt, geleerte Aktion und zurückgesetzte Freigabe. Details in `evidence/crm-cloud-live-20261021.json`.
- Neue Offerten-PDF visuell geprüft: eine lesbare Seite, kein abgetrennter Abschnitt wie beim früheren langen Testlayout.
- Nach Abschluss und geprüftem automatischem Nachlauf Make-Pilot deaktiviert, um für den bereits versendeten einzigen Testdatensatz keine fortlaufenden Make-Credits zu verbrauchen. Konfiguration bleibt vollständig erhalten. Der Linkdienst bleibt aktiv; das Öffnen des Mail-Links benötigt keinen laufenden Make-Job.

## Fehlerbehebung und Wiederholungsschutz

Der Live-Negativtest mit leerem Ziel stoppte vor PDF/Link/Mail. Die erste Make-Übergabe der neuen Formel war leer; ein zusätzlicher nativer Airtable-GET vor der Codeprüfung liefert alle aktuellen Felder. `body` muss als native Collection an Make Code gehen; IML-toString ist hier kein verlässlicher JSON-Serializer. Nach der Korrektur zeigte der Negativlauf konkret `Fehlt / prüfen: Ziel;`.

Ein bereits wartender Prüflauf schrieb unmittelbar nach dem erfolgreichen Versand kurz Blockiert zurück. Ursache: nach dem erneuten Lesen wurde bereits versendeter Zustand als ungültige Quelle behandelt. Behoben durch explizites `shouldWrite=false` für laufende, versendete oder unklare Vorgänge, fehlende Aktion und vorhandene Archiv-/Linkbindung; Make-Filter vor dem Status-PATCH respektiert dies. Nach unabhängiger Versandquittung wurde allein der fehlerhafte Status auf Versandt korrigiert. Kein erneuter Versand. Automatischer Nachlauf `8b5697adfcd54c939cef6c139ce805c8` um 19:32:25: nur Suche, frischer GET und Prüfung; kein Status-PATCH, keine PDF-Erstellung, keine Mail. Null unvollständige Ausführungen.

Mailfehler schreiben Manuelle Prüfung; die Reservierung bleibt erhalten und der Fehlerpfad endet mit Commit. Keine automatische Wiederholung eines unklaren Gmail-Ausgangs. Stale-Search-Fälle und Quell-/PDF-Veränderungen sind gezielt getestet.

## Bereitstellung und Prüfungen

- Cloud-Build `37ca99c4-2b67-4b56-a3b8-810f68c646dd`, Quellcommit `7665c9b8ba75316e19e1125c375fcf925cc1cc6b`.
- Image `europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-crm-offer-links@sha256:32024dbb2dba0bd4bb8fdc711cfee9b714f92dcdbc88e1d6ebb34e0c06a0ac20`.
- Revision `lszh-crm-offer-links-00001-87d`, min=0/max=1. Linkservice bleibt für die zugesagte Gültigkeit verfügbar.
- Öffentliche Schutzprüfungen bestanden: Seite 200, falscher Code 404, fremde Origin 403, Annahme 503. Lars bestätigt anschließend beide lesbaren PDF-Anhänge und den funktionierenden Mail-Link mit CHF 120 einmalig / CHF 0 monatlich und deaktivierter Annahme. Seine verspätet erneut gesetzte Schnellaktion wurde am bereits versendeten Datensatz gelöscht; Status Versendet / Versandt und bestehende Archivbindung bleiben erhalten. Kein erneuter Versand und kein erneutes Aktivieren des abgeschlossenen Make-Piloten.
- Nach Statuskorrektur: 320 Tests, 314 bestanden, 6 übersprungen, 0 Fehler. Vier neue Fälle decken Pflichtfelder/Empfänger/Freigaben, späte Suchergebnisse, unveränderte Quell-/PDF-Bindung sowie reale HTTP-Auslieferung über unabhängige Anfragen und gesperrte Annahme ab.
- Die Statuskorrektur betrifft Make-Ausführungscode; der schon bereitgestellte Reader verwendet diese Funktion nicht. Reader-Quellcommit und Image bleiben unverändert dokumentiert.

## Nächste Freigabeschritte für Kunden

Fortsetzung vom 21.10.: [Kundenversand-Vorbereitung](LSZH_KUNDENVERSAND_VORBEREITUNG_20261021.md) enthält den Kunden-Dispatch-Vertrag, den ausgeschalteten Make-Plan und die aktuelle externe Speichersperre. Den internen Bestätigungstest nicht erneut ausführen, um diese Speicherblockierung zu behandeln.

Der Cloud-Durchlauf ist intern begrenzt, kein allgemeiner produktiver Kundenversand. Kundenbetrieb verlangt die Überführung der festen internen Quellprüfung auf das bestehende genehmigte Kundendatenmodell und finale Dokumentversionen, den dauerhaften Kundenlink sowie einen kontrollierten echten Pilotdatensatz. Kein zweiter paralleler Vertriebsprozess nötig: Pflichtfelder und bewusste Schnellaktion bleiben die Bedienung.

OAuth-Dauerbetrieb prüfen: Der Veröffentlichungsstatus des vom Nutzer verwendeten Google-OAuth-Clients ist noch nicht unabhängig bestätigt. Make dokumentiert bei externer App im Status Testing eine wöchentliche Neuautorisierung; einen solchen Client nicht als wartungsfrei bezeichnen. Quelle: https://apps.make.com/google-cloud-firestore . Bestehende Clients/Verbindungen nicht löschen oder ersetzen.

Werkzeuge: `scripts/crm-cloud-operator.mjs` erstellt nur Pilotdaten bzw. baut/deployt/prüft den Reader; kein Laufzeit-Polling und kein Mailversand. `scripts/crm-cloud-make-plan.cjs` erzeugt reviewbare Make-Konfiguration aus lokalem nichtgeheimem Deploymentstand. Der bestehende Archivfilter bleibt in der Evidenz gesichert. Ursprünglicher V3-Stand weiterhin in `make-crm-dispatch-7835460-before-20261021.json`; Rückbau nur mit aktuellem lastEdit, danach Kunden-Mailmodule wieder deaktivieren und harte Sperre restaurieren.
