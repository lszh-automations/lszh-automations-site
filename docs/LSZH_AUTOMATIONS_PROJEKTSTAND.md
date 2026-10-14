# LSZH Automations – Projektstand & Betriebsentscheidungen

_Stand: 13.10.2026. Interne Arbeitsdokumentation. Keine Passwörter, API-Schlüssel oder Token hier eintragen._

## Geschäftsmodell / Eigentümerschaft

- LSZH Automations erbringt Beratung, Entwicklung, Einrichtung, Tests, Dokumentation und optionale Wartung für Schweizer KMU.
- **Kundenbetrieb:** Der Kunde nutzt eine eigene Make-Organisation und behält deren Kontrolle, Abrechnung, Ressourcen und Szenarien. Unser Zugang erfolgt über eine gezielte Einladung mit angemessener Berechtigung.
- Make-Pläne und -Credits werden vom Kunden direkt mit Make abgerechnet. LSZH stellt separat Dienstleistungen und laufende Betreuung in Rechnung.
- Der Erstkontakt und die Offerte setzen keine Registrierung bei Make voraus. Registrierung/Einladung folgen erst nach Annahme.
- Möglichst OAuth/Anbieterfreigaben verwenden. Keine Kundenpasswörter per Mail oder in Airtable abfragen.

## Prozess (verbindliches Zielbild)

1. Anfrage über LSZH-Website: Problem, Unternehmensdaten und Kontakt.
2. Rückfrage/Analyse, Offerte und allfällige vertragliche Vereinbarungen.
3. Annahme der Offerte und ausgelöstes Projekt-Onboarding.
4. Onboarding sammelt Rechnungsdaten, Anforderungen, Systemnamen, Status der kundeneigenen Make-Organisation und Stand der Einladung.
5. LSZH prüft Angaben, Kundenorganisation und benötigte Rollen. Bei Bedarf unterstützt LSZH Registrierung und Einladung.
6. Technische Verbindungen entstehen **in der Make-Organisation des Kunden**, möglichst durch den Kunden selbst mit OAuth.
7. Entwicklung, Funktionstests, Dokumentation, Kundenfreigabe und Go-Live im Kundenkonto.
8. Betrieb/Betreuung über separaten Servicevertrag. Kundeninhaberschaft und Freigaben bleiben erhalten.

## Bereits umgesetzt

- Öffentliche Website mit Kontakt, Leads, Offerten/Rechnungen und persönlichem Kunden-Onboarding (bestehender Prozess beibehalten).
- Formular `/onboarding/`: zusätzlicher Abschnitt **Make & technische Einrichtung** mit optionalem Organisationsnamen und Angaben zu Konto-/Einladungsstatus. Keine Secrets.
- Airtable `Kunden-Onboarding`: Felder **Make-Konto Status**, **Make-Organisation**, **Make-Einladung Status**, **Make-Einrichtung Hinweise**.
- Make `LSZH Kunden-Onboarding – Eingang`: Feldzuordnung auf diese Airtable-Spalten ergänzt.
- Make `LSZH Projekte – Onboarding anfordern`: Einladungsmail nach Offertenannahme erklärt das kundeneigene Make-Modell.
- Bestätigungsmail nach Onboarding: erklärt Organisation, Einladung und nächste Schritte.
- Kundenanleitung `/make-start/` erstellt und im Formular sowie in den E-Mails verlinkt.
- Drei alte Make-OAuth-Szenarien des früheren LSZH-eigenen Kontomodells als **ARCHIV – ALTES MODELL** gekennzeichnet und unverändert inaktiv belassen.
- Secure Transfer funktional mit Dummy-Schlüssel getestet: verschlüsselte Speicherung, einmaliger Abruf, Löschung der gespeicherten verschlüsselten Daten. Noch **nicht** für reale Kundenzugangsdaten freigegeben.

## Status / Sicherheit

- Onboarding-Anforderung und Eingangsszenario bleiben vorerst inaktiv, bis ein vollständiger Test mit einer vereinbarten Testofferte durchgeführt wurde. Keine unaufgeforderten Mails auslösen.
- Die Schlüssellieferung über Secure Transfer darf noch nicht produktiv eingesetzt werden, bis die Make-Webhooks authentifiziert und der parallele Abruf wiederholt getestet wurden.
- Neue Make-Verbindungen müssen gegen die jeweilige Kundenorganisation und deren Rollen geprüft werden. Alte LSZH-eigene OAuth-Automationen nicht reaktivieren.
- Make-Plan und Berechtigungen nach tatsächlichem Kundenbedarf prüfen. Nicht jedes Abonnement bietet identische Team-/Rollenoptionen.

## Nächste Tests

1. Neues Formular im Browser prüfen (Desktop / Mobile).
2. Mit freigegebenem Testprojekt Onboarding durchspielen; vier Make-Felder in Airtable kontrollieren.
3. Versand und Inhalt der zwei Kundenmails testen, bevor bisher inaktive Szenarien wieder aktiviert werden.
4. Einladung in eine vom Kunden verwaltete Testorganisation prüfen, ohne dessen Zugangsdaten einzusehen.
5. Kunden-Szenario dort erstellen, mit kundeneigener Verbindung autorisieren und Test/Übergabe dokumentieren.
6. Secure Transfer erst nach separater Security-Abnahme für Ausnahmen nutzen.

## Betrieb / Quellen

- [Website – Kunden-Onboarding](https://www.lszh-automations.ch/onboarding/)
- [Website – Make-Kundenanleitung](https://www.lszh-automations.ch/make-start/)
- [Make – Organizations](https://help.make.com/organizations)
- [Make – Teams](https://help.make.com/teams)
- [Make – Preise/Funktionen](https://www.make.com/en/pricing)

Letzte Architekturentscheidung: 13.10.2026 – Kunden besitzen ihre eigenen Make-Organisationen.

## Technische Prüfung vom 14.10.2026 – Onboarding-Fortsetzung (STAGING)

- Make-Szenario **7777695**: Kunden-Onboarding bleibt **inaktiv**. Kundenmail-Modul 9 hat unverändert die harte **0=1**-Sperre. Keine echten Einladungen, Vertragsfreigaben oder Kundensendungen.
- Der separate Datenschutz-Zweig (Router 14) läuft vor der erfolgreichen Webhook-Bestätigung; Prüfung bei `sensitive_data = Ja` oder `Unsicher`. Vor einer neuen DSG-Aufgabe erfolgt jetzt eine Airtable-Suche (Modul 15) nach dem stabilen `<Auftrag-ID>-DSG-01`-Schlüssel. Bereits existierende, z. B. erledigte Aufgaben werden nicht auf `Offen` zurückgesetzt.
- Die frühere GET-Dublettenprüfung (Modul 11) wurde durch wiederaufnehmbare Speicherung ersetzt: Modul 4 erzeugt ein Airtable-`performUpsert` mit `fieldsToMergeOn: ["Projektcode"]`. Modul 3 sendet `PATCH`, Modul 6 verknüpft den Datensatz mittels `3.body.records[1].id`; dieselbe ID wird in Modul 12 als Webhook-Beleg ausgegeben.
- **Test 1:** zweimaliges Airtable-Upsert auf bestehenden synthetischen Token `<synthetischer-testtoken-intern>` lieferte `recCTaZaoReFpBqxi` und änderte die Datensatzanzahl nicht (vier).
- **Test 2:** Isoliertes Make-Testscenario **7962957**, zweifacher sequentieller Aufruf: Erfolg, jeweils HTTP 200 und dieselbe Airtable-ID. Zusätzlich **zwei parallel gestartete Testläufe**: beide erfolgreich, HTTP 200, dieselbe ID; nachher weiterhin genau ein zugehöriger Datensatz. Testszenario wieder deaktiviert.
- **Test 3:** Read-only-Make-Testscenario **7962998**: existierende DSG-Aufgabe ergab `rec818rQl70Mf4UsW`, fehlender Aufgabencode ergab keine ID; beide HTTP 200. Existierende Aufgabe blieb auf `Erledigt`. Testscenario danach deaktiviert.
- **Keine Freigabe:** Diese Tests prüfen isolierte Module und einen vorhandenen synthetischen Datensatz. Sie sind **kein** vollständiger Webhook-End-to-End-Test, kein Paralleltest zweier echter erstmaliger Eingänge und keine tatsächlich unterbrochene Gesamtausführung. Wiederholungen mit **abweichenden** Formulardaten würden noch vorhandene Onboarding-Felder überschreiben; diese Geschäftspolitik ist abzuklären oder technisch abzusichern. Ebenfalls testen: Fehler bei Verknüpfung/Rechnungsdaten, Dauerhaftigkeit der Datensätze, Fehlerantwort und Datenschutzprüfung vor HTTP-200.
- Weitere Freigaben: Kundenorganisation und Einladungsberechtigung für `lars@lszh-automations.ch`; Google-Drive-Reautorisierung und separates eingeschränktes Dienstkonto; RC1-Projektbedingungen/AVV; Offerten-, Rechnungs-, Swiss-QR- und Archivtests.

## Technische Freigabeprüfung 14.10.2026 – Wiederholungs-Guard und kompletter On-Demand-Test

**Produktivstatus:** Make-Szenario `7777695` weiterhin **INAKTIV**, E-Mail-Versand durch Modul 9 mit harter `0=1`-Sperre verhindert. Keine Kundenmails, keine echten Einladungen, keine Vertragsfreigaben, keine Aktivierung.

**Neue Schutzlogik im Onboarding:**

1. Vor dem Airtable-Upsert fragt Modul 16 bestehende Onboardings für den Projektcode ab (maximal 2 Treffer).
2. Code-Modul 17 vergleicht den eingereichten Onboarding-Feldsatz mit dem bereits gespeicherten Datensatz, mit Normalisierung leerer Textfelder. Es unterscheidet `new`, `resume`, `conflict` (geänderte Angaben/mehrere Bestandsdatensätze/manuelle Klärung) und `already_complete`.
3. Router 18 leitet **nur** `new` und `resume` auf den Upsert und die restliche Projektverarbeitung weiter. Bei `conflict` sendet Make einen strukturierten Konflikt im JSON mit `duplicate=true` / `error=already_submitted`, den der bestehende Website-Proxy in HTTP 409 übersetzt. Make selbst liefert auf diesem Zweig zur Kompatibilität mit dem Website-Proxy HTTP 200 mit Geschäftsfehler im JSON; vor Direktzugriff auf den Make-Webhook prüfen. Bei `already_complete` wird der ursprüngliche Datensatz bestätigt, ohne erneut zu schreiben.
4. Datenschutz-Zweig bleibt unabhängig vom E-Mail-Zweig. Existenzprüfung über den stabilen Aufgabencode verhindert erneutes Öffnen einer bereits erledigten Datenschutzprüfung.
5. Bei identischer Wiederholung während unvollständiger Verarbeitung kann die Auftragsverknüpfung per erneutem `PATCH` repariert werden. Weiterhin keine Garantie echter atomarer Transaktion zwischen mehreren Airtable-Datensätzen.

**Isolierte Make-Testkopie `7963278` (nur synthetische Daten, ohne E-Mail-Modul):**
- Suchfilter in Modul 5 auf Auftrag `rec2958xrhm6QmIbM` eingeschränkt; keine echte Vertragsannahme gesetzt.
- Erste Ausführung: `saved` – Onboarding `recGKxPPzHhgUZ8W9` und genau eine neue Datenschutzaufgabe erstellt; alle Schreibmodule und die abschliessende Rückgabe erfolgreich.
- Gleiche Eingaben erneut: `saved` mit identischer Datensatz-ID, keine zweite Datenschutzaufgabe.
- Geänderter Projektname: `conflict` / `changed_input`; Ausführungsprotokoll zeigt **keine** Schreibmodule im Konfliktlauf. Der ursprüngliche Projektname blieb unverändert.
- Simulierte Teilunterbrechung: Auftragsverknüpfung beim fiktiven Onboarding entfernt, identische Eingabe erneut verarbeitet, Verknüpfung korrekt zum ursprünglichen Testauftrag wiederhergestellt.
- Einmalig Status `Vollständig` im Testdatensatz gesetzt: identische Eingabe führte zu `already_complete`; nur lesende Module und Antwortmodul liefen. Anschliessend ursprünglichen Teststatus `Eingegangen` wiederhergestellt.
- Die Testkopie `7963278` ist nach den Testläufen wieder **INAKTIV**. Ebenso sind die früheren isolierten Teststrecken `7962957`, `7962998`, `7963182` und `7963206` inaktiv.

**Noch nicht abgenommen:** Die Testkopie hat einen `StartSubscenario`-Trigger, **keinen Live-Webseiten-Webhook**. Noch nötig: tatsächlicher synthetischer HTTP-Webhook-Test, echte Unterbrechung in Make zwischen Modul 3 und Modul 6, gleichzeitige erstmalige Einsendungen, Fehlerantworten bei nicht autorisiertem Token oder Airtable-Ausfall sowie Stabilität bei späteren Datenaktualisierungen. Der instanzlokale Zwei-Minuten-Cache im Website-Proxy garantiert keine dauerhafte Exklusivität. Die übrigen Freigabeblocker zu Google Drive, RC1/AVV, Kundenorganisation und Rechnungs-/Offertenversand bleiben bestehen.


### Nachtrag 14.10.2026 – echter HTTP-Webhook im isolierten Test

- Eigenständiges Make-Webhook-Szenario **7963329** als eingeschränkte Kopie des Onboardings angelegt. Es enthält **kein Gmail-/E-Mail-Modul** und darf ausschliesslich den synthetischen Testauftrag `rec2958xrhm6QmIbM` verarbeiten. Getrenntes synthetisches HTTP-Sendeszenario **7963343**.
- **HTTP-E2E Wiederholung:** Ein tatsächlicher HTTP-POST aus Szenario 7963343 an den Test-WebHook 7963329 durchlief Validierung, Auftragsabfrage, JSON-Erzeugung, Existenzprüfung, Wiederholungs-Guard, Airtable-Upsert, Auftrags-/Kundendaten und Datenschutzaufgaben-Existenzprüfung. Die Webhook-Antwort enthielt `ok=true` und dieselbe ursprüngliche Datensatz-ID. Make-Ausführung ohne Fehler.
- **HTTP-E2E Konflikt:** Geänderter Projektname im POST führte zu `duplicate=true`, `error=already_submitted`. Ausführungsprotokoll durchlief nur die Validierung und lesenden Module sowie die Konflikt-Antwort (Modul 19), **kein** Airtable-Schreibmodul. Projektname, Verknüpfung und DSG-Aufgabe blieben unverändert.
- Beide Make-HTTP-Läufe meldeten HTTP **200** vom internen Webhook. Der bereits implementierte Website-Proxy wertet das Geschäftsfehler-JSON aus und soll bei `duplicate=true` selbst HTTP **409** ausgeben. Dieser Website-Proxy-Endpunkt wurde noch **nicht** selbst per HTTP getestet.
- Webhook-Queue nach Tests **0**. Szenarien **7963329** und **7963343** nach den Läufen deaktiviert, wie auch das originale Onboarding **7777695**. Dessen Kundenmail-Modul 9 behält die `0=1`-Sperre.
- Weiter offen bleiben: Durchlauf über das tatsächliche öffentlich zugängliche Website-Onboarding samt 409-Prüfung, echte Fehler-/Unterbrechungsinjektion in Make, initial gleichzeitige Eingänge für denselben noch nicht angelegten Datensatz, Fehlerbehandlung bei Ausfall von Airtable/Google und manuelle organisatorische Freigaben. **Keine Produktionsfreigabe.**


### Nachtrag 14.10.2026 – gleichzeitige Erstanfragen, echter Fehlerabbruch und Website-202-Hinweis

**Paralleltest nur mit synthetischem Auftrag:** Separater Testauftrag `recDXecnwGr3fyU9D`, ohne bestätigte Vertragsunterlagen, auf den der isolierte Test-WebHook `7963329` in seiner Airtable-Suchformel begrenzt wurde. Mit `sequential=true` wurden zwei nahezu zeitgleiche Erstübermittlungen an den isolierten Webhook ausgelöst. Die Make-HTTP-Sender erhielten beide zunächst `200 Accepted` als vorläufige Annahme, **nicht** als bestätigten Speicherbeleg. Die zweite Lieferung blieb zunächst in der Webhook-Warteschlange (Queue=1) und wurde nach erneuter Testaktivierung abgearbeitet (Queue anschliessend=0). Die beiden Webhook-Ausführungen meldeten **warning**, zeigten im Modulprotokoll jedoch keinen Modulfehler. Airtable enthielt anschliessend **genau einen** neuen Onboarding-Datensatz `recvv5IlhSJU8V4Qw` und **genau eine** Datenschutz-Aufgabe `reck61B1qYy3zEmOk` für den Testauftrag. Kein Kundenszenario aktiviert.

**Wichtige offene Semantik:** Bei konkurrierenden Webhook-Aufrufen liefert Make vor der vollständigen Bearbeitung `Accepted`. Der produktive Website-Proxy darf dies ausschliesslich als `202 pending` behandeln (keine verifizierte Speicherung). Seine Implementierung sieht dafür bereits die Unterscheidung vor; der echte öffentlich zugängliche Website-Endpunkt wurde noch nicht per HTTP geprüft. Die Ursache der Make-Ausführungsstatus `warning` ist noch separat zu beurteilen. Der Wartefall im Fehler-/Duplikatschutz darf nicht still als erfolgte Speicherung gelten.

**Echter Testfehler nach Upsert:** Neue ausschliesslich synthetische On-Demand-Testkopie `7963454` enthielt absichtlich ein `code:ExecuteCode`-Modul direkt nach Airtable-Upsert und vor der Auftragsverknüpfung, das `LSZH_SYNTHETIC_INJECTED_FAILURE_AFTER_UPSERT` auslöste. Beim fiktiven Datensatz `recGKxPPzHhgUZ8W9` war vorher die Auftragsverknüpfung entfernt worden. Make-Ausführung `79a93d7dddea450eac0d99baa4d6b63b` endete mit dem erwarteten RuntimeError, Datensatz blieb vorhanden und unverknüpft. Die anschliessende **saubere Wiederaufnahme** über die isolierte Teststrecke `7963278` (`870934398c354301b026a8d1c58dbe90`) war erfolgreich: dieselbe Datensatz-ID, korrekte Verknüpfung `rec2958xrhm6QmIbM`, keine zweite Datenschutz-Aufgabe. Beide Teststrecken anschliessend deaktiviert.

**Website-UI-Korrektur:** In `onboarding/index.html` wurde der Hinweis bei HTTP 202 berichtigt: Es wird ausdrücklich nur der Empfang zur Verarbeitung bestätigt, nicht die endgültige Speicherung und auch **keine später automatisch versandte E-Mail** versprochen, während der E-Mail-Versand gesperrt ist. GitHub-Commit `1acce5b93380d40f638a28594688669c7bdc842f`.

**Freigabegrenzen:** Öffentliche Website `/onboarding/` und `/make-start/` waren aus dem externen Prüfwerkzeug nicht erreichbar bzw. nicht verifizierbar; daraus folgt noch keine gesicherte Aussage zur Ursache. Website-/Render-Verfügbarkeit, echte HTTP-409-Rückgabe des Proxy, Fehler bei Airtable-Verbindungsunterbruch und kundenbezogene Rollen-/Vertragstests sind **OFFEN**. Produktiv-Onboarding `7777695` bleibt inaktiv, harte `0=1`-Kundenmail-Sperre unverändert. Teststrecken `7963278`, `7963329`, `7963343`, `7963454` bleiben deaktiviert. Keine Einladungen, echten E-Mails oder Vertragsfreigaben.


### Nachtrag 14.10.2026 – Google Drive: Zugriffstrennung und geschäftliche Archiv-Staging-Prüfung

**Befund:** Zwei Google-Konten/Drive-Berechtigungskontexte sind betroffen. Das über Google Drive direkt einsehbare ältere Vertragsarchiv mit Testangebot liegt im *privaten* Google-Konto und ist laut Metadaten nicht freigegeben. Die in Make verwendete Google-Drive-Verbindung (Geschäftsadresse `lars@lszh-automations.ch`, Connection 11904271) ist zwar autorisiert, kann diese private Test-PDF nicht laden (HTTP 404). Das ist ein **Zugriffsproblem**, kein Nachweis einer erneut abgelaufenen OAuth-Verbindung. Umgekehrt ist eine in Make erreichbare Geschäftskonto-PDF über den separat verbundenen privaten Drive-Connector nicht zugänglich. Eine globale Google-Drive-Reautorisierung ist für diesen Befund nicht nötig.

**Geschäftskonto-Zielarchiv bereits vorhanden:** Make hat den Ordner **LSZH Automations Vertragsarchiv – STAGING – Geschäftskonto** als eigenes Ziel angeboten. Der ältere private Ordner **LSZH Vertragsarchiv – STAGING (nicht produktiv)** ist hiervon getrennt. Für zukünftige Vertragsarchivierung den geschäftlich kontrollierten Speicherort verwenden und die bisherigen privaten Tests nicht als Produktionsarchiv behandeln. Keine automatischen Freigaben/Sharing der privaten Unterlagen ohne separate Zustimmung.

**Kontrollierte Lesetests:** Isoliertes, rein lesendes Make-Szenario `7963566` mit Geschäftskonto-Verbindung: bestehende synthetische Geschäftskonto-Test-PDF erfolgreich gelesen (630 Bytes, gültiger SHA-256). Die alte private Offerten-Test-PDF liefert mit derselben Make-Verbindung HTTP 404. Das Szenario wurde deaktiviert.

**Archivierung + Datenintegrität erfolgreich:** Neues isoliertes Make-Szenario `7963597` erstellt: vorhandene synthetische Mini-PDF im Geschäftskonto laden -> ausschliesslich in den genannten **Geschäftskonto-STAGING**-Ordner hochladen (Dateiname beginnt mit `TEST_ONLY_`) -> neu archivierte Datei herunterladen -> Größe und SHA-256 mit der Vorlage vergleichen. Ausführung `0fab42aac5ce44b99c02c27d83ea57f2`: **success**, Hashes identisch `c7694e7a617af93059204f790bcf9f306b8d3fa3c5a15e6a4f352a2abf6366c4`, beide Dateien 630 Bytes, Upload im richtigen Business-Staging-Ordner. Szenario direkt danach deaktiviert. Die Test-PDF ist **kein Vertrag**.

**Nicht freigegeben:** Online-Annahme, reale E-Mails, externe Freigaben/Einladungen, echte Kundenunterlagen und produktive Szenarien bleiben inaktiv. Das Bestehen des Upload/Download-Tests beweist weder rechtliche Dokumenteneinbindung noch Content Restrictions/WORM, SHA-Verifikation bei Online-Annahme, Backup-/Aufbewahrungskonzept oder Dienstkonto-Zugriff. Projektbedingungen und AVV RC1 bleiben unfreigegeben. Vor Produktivstart (1) Staging-Unterordner und Ablageziele in Geschäftskonto aufeinander abstimmen, (2) freigegebene finale PDFs unabhängig archivieren, (3) Download-/Hashprüfung bei Angebotsversand und Annahme, (4) restriktives serverseitiges Dienstkonto für lesenden Zugriff vorbereiten, (5) Rechte, Löschung, Backup und Unveränderbarkeit sowie externe Rechtsprüfung klären.


### Nachtrag 14.10.2026 – Make Offerten-/Annahmearchiv auf Geschäftskonto-STAGING vorbereitet

**Voraussetzung:** Das Make-Geschäftskonto `lars@lszh-automations.ch` kann den bestehenden Ordner `LSZH Automations Vertragsarchiv – STAGING – Geschäftskonto` erreichen. Die versuchte automatische Anlage von drei getrennten Unterordnern (Offerten, Projektbedingungen, Annahmenachweise) wurde durch die Sicherheitsprüfung des verbundenen Tools blockiert und **nicht durchgeführt**. Bis eine Unterordnerstruktur eingerichtet und separat geprüft ist, wird nur der nachweislich funktionierende Geschäfts-STAGING-Hauptordner verwendet; Dateinamen tragen `STAGING_`. Alte private Archiv-PDFs wurden nicht geteilt, verschoben, gelöscht oder überschrieben.

**Make `7835460` (Offerte PDF erzeugen und versenden, INAKTIV):** Google-Docs-Entwurf (Modul 3) und Offerten-PDF-Upload (Modul 7) auf denselben Geschäfts-STAGING-Ordner umgestellt. Modul 11 fordert nun zusätzlich `parents` aus Google Drive an; Modul 8 markiert einen Archivbeleg nur bei passender Datei-ID, passendem SHA-256, PDF-MIME-Type, aktiviertem Drive-Content-Restriction-`readOnly` und korrektem Geschäftskonto-Ordner als verifiziert. Die ursprünglich strukturell ungültige JSON-Feldzuordnung in Airtable-Statusmodul 6 korrigiert. Zusätzliche **harte 0=1-Sperre vor Google-Docs-Erzeugung** in Modul 2 sowie bestehende harte 0=1-Sperre vor Kundenmail in Modul 5; auch `disabled` nicht als alleinige Sicherheit betrachten.

**Make `7940261` (persönlichen Offerten-Annahmelink erstellen/mailen, INAKTIV):** Nach den beiden Google-Drive-Leseoperationen für Angebot und Projektbedingungen zwei zusätzliche read-only Drive-Metadatenmodule 9/10 eingefügt. Token-Hash-Schreibmodul 4 verlangt jetzt zusätzlich für **beide** PDFs den richtigen Geschäfts-STAGING-Elternordner, passenden Datei-ID- und SHA-256-Abgleich, Drive-Content-Restriction `readOnly=true` und API-HTTP 200. Eine syntaktisch fehlerhafte JSON-Feldzuordnung in Statusmodul 6 korrigiert. Token-Erstellung (Modul 2) und Kundenmail (Modul 5) jeweils **hart 0=1 gesperrt**. Keinerlei Annahmelink erzeugt oder verschickt.

**Make `7940220` (Online-Annahmebeleg und Bestätigung, INAKTIV):** Zwei Drive-Metadatenmodule 10/11 lesen vor dem Beanspruchen einer Bestätigung beide zuvor archivierten PDFs; vor Verarbeitung prüft Modul 2 die beiden Drive-Elternordner, Datei-IDs, SHA-256 und `readOnly`-Schreibschutz zusätzlich zu den vorhandenen Annahme-/Freigabebedingungen. Google-Docs-Nachweisentwurf (Modul 5) und PDF-Ablage (Modul 7) liegen im Geschäfts-STAGING-Hauptordner. Nach PDF-Upload liest Modul 12 den Nachweis erneut, Modul 13 setzt den Drive-Schreibschutz, Modul 14 verifiziert Archivpfad, SHA-256 und Schreibschutz. Kundenmail-Modul 8 verlangt die technischen Belege, bleibt aber unabhängig davon **hart 0=1 gesperrt**. Zusätzlich ist Claim-/Belegerstellung (Modul 2) **hart 0=1 gesperrt**. Fehlerhaft aufgebaute JSON-Feldzuordnung des Airtable-Abschlussmoduls 9 korrigiert.

**Isolierter Schreibschutz-Test `7963696`:** Ausschliesslich die synthetische 630-Byte-PDF aus dem zuvor überprüften Geschäftsarchiv verwendet (kein echter Vertragsbeleg). Lauf `2a981655f34a4d66b772177c7f619212` meldete **success**: Google Drive Content Restriction erfolgreich per PATCH gesetzt, per GET `readOnly=true` bestätigt, SHA-256 weiterhin identisch `c7694e7a617af93059204f790bcf9f306b8d3fa3c5a15e6a4f352a2abf6366c4`, richtiger Geschäftsarchiv-Elternordner. Die Teststrecke danach **deaktiviert**. Ein Drive-Schreibschutz ist nicht automatisch ein revisionssicheres WORM-Archiv.

**Verifikation:** Die drei Make-Szenarien `7835460`, `7940261` und `7940220` nach den Änderungen erneut ausgelesen: alle **INAKTIV**. Alle drei Kundenmail-Module besitzen harte `0=1`-Filter; vorgelagerte Schreib-/Vertragsprozesse ebenfalls. JSON-Bodies der drei korrigierten Airtable-Statusaktualisierungen sind syntaktisch gültig. Google-Drive-Verbindung ist autorisiert.

**Noch nicht abgenommen:** Vollständige E2E-Ausführung der drei Offerten-/Annahme-Staging-Szenarien (harte Sperren bleiben aktiv), eigene Geschäfts-STAGING-Unterordner, zwei **tatsächlich freigegebene** finale Projektbedingungen-/Offerten-PDFs samt SHA-256 und Archivzugriff, Berechtigungs- und Retention-/Backup-/WORM-Konzept, separates eingeschränktes serverseitiges Dienstkonto, RC1-Projektbedingungen und AVV mit geschäftlicher und juristischer Freigabe, scharfe Anbieter-/UID-/MWST-Daten, Kundeneinwilligung und ausdrückliche Produktionsfreigabe. Keine E-Mails, Einladungen oder Vertragsabschlüsse durchgeführt.


### AVV v0.9 / RC1 – Geschäftsentscheid vom 14.10.2026: INTERN PROVISORISCH FREIGEGEBEN

**Entscheid durch den LSZH-Geschäftsführer:** Das bestehende **LSZH_AVV_v0_9_RC1_Freigabeentwurf.docx**, Original vom **13.10.2026**, wird als **interne, provisorisch akzeptierte Arbeitsgrundlage** für technische Vorbereitung, Dokumentenabgleich und vollständig synthetische Tests behandelt. Original bleibt unverändert (auch wenn darauf noch „nicht freigegeben“ steht). Der Entscheid ist separat im Google-Drive-Freigaberegister **LSZH Vertragsarchiv – Freigaberegister (STAGING)** protokolliert.

**Eindeutige Status-Trennung:**
- AVV-Musterinhalt: **INTERN PROVISORISCH FREIGEGEBEN** / für Staging-Arbeit verwendbar.
- Unterschriften, Kunden- und Projektbezug: **NICHT FREIGEGEBEN**.
- AVV Anlagen A (Daten-/Projektsteckbrief), B (TOM-Nachweise), C (Subprozessoren inkl. Regionen/Genehmigung): **NOCH NICHT kundenbezogen abgeschlossen**.
- Juristische Prüfung inkl. Anwendbarkeit DSG/ggf. DSGVO und Auslandsdaten: **OFFEN**.
- Projektbedingungen v1.0 RC1: **SEPARAT OFFEN**.
- Online-Annahme rechtlich freigegeben in Airtable: **NEIN / unverändert**; sämtliche **harten Make-0=1-Sperren** bleiben bestehen; keine echten E-Mails, keine externe Bereitstellung oder Einladungen, keine Vertragsabschlüsse und keine Produktiv-Szenarien.

**Vor externer Verwendung pro Kunde prüfen:** Identität und Vertretungsbefugnis; Leistungs-/Datenfluss- und Rollenzuordnung (auch kundeneigene Make-Organisation); Kategorien inkl. besondere Daten/Profiling; eingesetzte Anbieter, Regionen, internationale Zugriffe, AVV/SCC; technische und organisatorische Massnahmen mit tatsächlichem Nachweis; Lösch-/Backupfristen; Kundenfreigabe Anlage C; Abstimmung mit finalen Projektbedingungen; richtige AVV-Version als eigenständige schreibgeschützte PDF im **geschäftlichen** Archiv mit SHA-256; unabhängige rechtliche und geschäftliche finale Freigabe.

**Wichtige Dokumentenidentität:** Das Original RC1 enthält Platzhalter, Entwurfsvermerke und keine Signaturen. Der provisorische Geschäftsentscheid wertet es *nicht* zu einer endgültigen rechtsgeprüften, signierten Vereinbarung auf. Es wird durch diese Notiz nicht umbenannt, überschrieben oder als final archiviert.

